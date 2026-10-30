import fs from 'fs';
import path from 'path';
import { Router, type RequestHandler } from 'express';
import multer from 'multer';
import { currentFamily, isHosted, keepFamily } from './context';
import { dataDir } from './mainDb';
import { familyDir, isLiveFamily } from './families';

// Avatars and proof photos. Self-hosted they sit in data/avatars and data/proofs, served at /api/avatars
// and /api/proofs. In hosted mode each family keeps its own in its folder, served at
// /api/files/<familyId>/<kind>/<name>. Names are random either way, so links load without a login.
export type FileKind = 'avatars' | 'proofs';

function familyOf(familyId?: string): string {
  const id = familyId ?? currentFamily()?.familyId;
  if (!id) throw new Error('No family for this file (hosted mode)');
  return id;
}

/** The folder uploads of this kind go to (made if missing). Pass the request's familyId from multer. */
export function uploadDir(kind: FileKind, familyId?: string): string {
  const dir = isHosted() ? path.join(familyDir(familyOf(familyId)), kind) : path.join(dataDir(), kind);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** The link saved for an uploaded file. */
export function fileUrl(kind: FileKind, name: string, familyId?: string): string {
  return isHosted() ? `/api/files/${familyOf(familyId)}/${kind}/${name}` : `/api/${kind}/${name}`;
}

/**
 * Takes one uploaded file (multer) inside the request's family. One over limitMb answers 413 with the
 * limit, so the app can say how big a file may be.
 */
export function oneFile(field: string, limitMb: () => number, options: Omit<multer.Options, 'limits'>): RequestHandler {
  return keepFamily((req, res, next) => {
    const limit = limitMb();
    multer({ ...options, limits: { fileSize: limit * 1024 * 1024 } }).single(field)(req, res, (err?: unknown) => {
      if ((err as { code?: string } | undefined)?.code !== 'LIMIT_FILE_SIZE') return next(err);
      res.status(413).json({ error: `That file is too big (the limit is ${limit} MB)`, code: 'too-large', limit });
    });
  });
}

/** Bytes of avatars and proof photos in the family's folder (hosted mode). */
export function filesBytes(familyId: string): number {
  let total = 0;
  for (const kind of ['avatars', 'proofs']) {
    const dir = path.join(familyDir(familyId), kind);
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) total += fs.statSync(path.join(dir, name), { throwIfNoEntry: false })?.size ?? 0;
  }
  return total;
}

const FILE_NAME = /^[A-Za-z0-9_-]+\.[A-Za-z0-9]+$/;

/** Delete an uploaded file by its saved link, so photos of deleted completions don't use up the family's space. */
export function removeFile(kind: FileKind, url: string | null | undefined): void {
  const name = url?.slice(url.lastIndexOf('/') + 1) ?? '';
  // Only ever a plain name in this family's own folder
  if (FILE_NAME.test(name)) fs.rmSync(path.join(uploadDir(kind), name), { force: true });
}

/** Hosted mode: /api/files/<familyId>/<avatars|proofs>/<name>. */
export const filesRouter = Router();

filesRouter.get('/:familyId/:kind/:name', (req, res) => {
  const { familyId, kind, name } = req.params;
  if ((kind !== 'avatars' && kind !== 'proofs') || !FILE_NAME.test(name) || !isLiveFamily(familyId)) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.setHeader('Cache-Control', 'private, max-age=86400');
  res.setHeader('X-Robots-Tag', 'noindex');
  res.sendFile(name, { root: path.join(familyDir(familyId), kind) }, (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: 'Not found' });
  });
});

import fs from 'fs';
import path from 'path';
import { Router } from 'express';
import { currentFamily, isHosted } from './context';
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

const FILE_NAME = /^[A-Za-z0-9_-]+\.[A-Za-z0-9]+$/;

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

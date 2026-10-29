import { AsyncLocalStorage, AsyncResource } from 'async_hooks';
import type Database from 'better-sqlite3';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

// Hosted mode (HOSTED=1): one server runs many families, each with its own database in its own folder
// (data/families/<familyId>/). Without it the app is the self-hosted one: one family, data/tidyquest.db.
let hosted = process.env.HOSTED === '1';

export function isHosted(): boolean {
  return hosted;
}

/** Tests turn hosted mode on for one file (each test file gets fresh modules). */
export function setHosted(on: boolean): void {
  hosted = on;
}

export interface FamilyContext {
  familyId: string;
  db: InstanceType<typeof Database>;
}

// The family a request belongs to, kept across awaits for the whole request. The `db` proxy in
// database.ts reads it, so route code needs no change.
const storage = new AsyncLocalStorage<FamilyContext>();

/** Runs fn with this family's database as `db`. */
export function runInFamily<T>(family: FamilyContext, fn: () => T): T {
  return storage.run(family, fn);
}

let testFamily: FamilyContext | null = null;
let requestsInFlight = 0;

/** The family of the running request (or job), if any. */
export function currentFamily(): FamilyContext | undefined {
  const family = storage.getStore();
  if (family) return family;
  // A test's own code runs as its family, but a request that lost its family still fails
  if (testFamily && requestsInFlight === 0) return testFamily;
  return undefined;
}

/**
 * Something a background job remembers between runs, like the last minute it checked: one value per
 * family in hosted mode, one value self-hosted.
 */
export function perFamily<T>(initial: T) {
  const values = new Map<string, T>();
  const key = () => currentFamily()?.familyId ?? '';
  return {
    get: (): T => (values.has(key()) ? values.get(key())! : initial),
    set: (value: T) => { values.set(key(), value); },
  };
}

/** The whole suite runs in hosted mode (HOSTED=1 npm test) with the tests' own code as one family. */
export function setTestFamily(family: FamilyContext | null): void {
  testFamily = family;
}

/** Counts open requests, so a test family never stands in for one that lost its family (see above). */
export function countRequests(_req: Request, res: Response, next: NextFunction): void {
  requestsInFlight++;
  let done = false;
  const finish = () => {
    if (!done) { done = true; requestsInFlight--; }
  };
  res.once('finish', finish);
  res.once('close', finish);
  next();
}

/**
 * Middleware that reads the request body itself (multer) calls next from stream events, outside the
 * request's family. This calls its next inside the family again.
 */
export function keepFamily(middleware: RequestHandler): RequestHandler {
  return (req, res, next) => middleware(req, res, AsyncResource.bind(next));
}

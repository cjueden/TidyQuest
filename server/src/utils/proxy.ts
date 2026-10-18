import { Request, Response, NextFunction } from 'express';

/**
 * Express's 'trust proxy' from the TRUST_PROXY env var. Off by default: req.ip is the connection's own address
 * and X-Forwarded-For is ignored, since anyone can send it. Behind a reverse proxy, list the proxy's addresses
 * (e.g. "loopback, 172.16.0.0/12" for a proxy in Docker) or give a hop count, so req.ip is the visitor's address.
 * "true" would trust whatever the visitor sends, so it means one hop.
 */
export function trustProxySetting(value = process.env.TRUST_PROXY): boolean | number | string {
  const v = (value ?? '').trim();
  if (!v || v === 'false' || v === '0') return false;
  if (v === 'true') return 1;
  if (/^\d+$/.test(v)) return Number(v);
  return v;
}

let hinted = false;
/** Says once in the log when requests arrive through a proxy that TRUST_PROXY doesn't name */
export function proxyHint(req: Request, _res: Response, next: NextFunction) {
  if (!hinted && req.headers['x-forwarded-for'] && req.app.get('trust proxy') === false) {
    hinted = true;
    console.warn(`[proxy] Requests come through a proxy (from ${req.socket?.remoteAddress}). Set TRUST_PROXY so the login limit sees each visitor's address; see README.`);
  }
  next();
}

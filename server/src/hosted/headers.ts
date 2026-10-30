import helmet from 'helmet';
import type { RequestHandler } from 'express';

// Hosted mode's security headers and CORS (HOSTED.md §8). Self-hosted servers keep neither: families put
// them behind their own proxies, and some show the app inside Home Assistant, which a frame rule would break.

const publicUrl = () => process.env.PUBLIC_URL?.replace(/\/+$/, '') || '';
const onHttps = () => publicUrl().startsWith('https://');

// Sign-up's CAPTCHA (Cloudflare Turnstile) loads a script and shows a frame from here
const TURNSTILE = 'https://challenges.cloudflare.com';

export function securityHeaders(): RequestHandler {
  return helmet({
    contentSecurityPolicy: {
      directives: {
        'script-src': ["'self'", TURNSTILE],
        'frame-src': [TURNSTILE],
        // blob: is a proof photo's preview before it's sent
        'img-src': ["'self'", 'data:', 'blob:'],
        // Hosted staging runs on plain http: sending it to https would break it
        'upgrade-insecure-requests': onHttps() ? [] : null,
      },
    },
    strictTransportSecurity: onHttps(),
    // Links in emails carry one-time tokens: the next site never sees them
    referrerPolicy: { policy: 'no-referrer' },
  });
}

/** Which other sites may call the API from a browser: CORS_ORIGIN, or else only the app's own address. */
export function hostedCorsOrigin(): string | false {
  if (process.env.CORS_ORIGIN) return process.env.CORS_ORIGIN;
  try {
    return publicUrl() ? new URL(publicUrl()).origin : false;
  } catch {
    return false;
  }
}

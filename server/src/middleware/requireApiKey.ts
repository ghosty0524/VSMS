import { timingSafeEqual } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

// Accept the integration key either as X-Api-Key (used by VSMS↔VTMS sync) or as
// the password of HTTP Basic auth. The Basic path exists because Power Platform
// custom connectors over an on-premises data gateway don't support API-key auth,
// only Basic/Windows — so the gateway connector sends the key as the password.
function extractKey(req: Request): string | undefined {
  const header = req.headers['x-api-key'];
  if (typeof header === 'string') return header;
  const auth = req.headers['authorization'];
  if (typeof auth === 'string' && auth.startsWith('Basic ')) {
    const decoded = Buffer.from(auth.slice(6), 'base64').toString('utf8');
    const sep = decoded.indexOf(':');
    return sep >= 0 ? decoded.slice(sep + 1) : decoded; // password portion
  }
  return undefined;
}

export function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  const key = extractKey(req);
  const expected = process.env.INTEGRATION_API_KEY;
  if (!expected || typeof key !== 'string' || !safeEqual(key, expected)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

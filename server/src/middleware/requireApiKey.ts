import { timingSafeEqual } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  const key = req.headers['x-api-key'];
  const expected = process.env.INTEGRATION_API_KEY;
  if (!expected || typeof key !== 'string' || !safeEqual(key, expected)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

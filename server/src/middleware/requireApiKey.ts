import type { Request, Response, NextFunction } from 'express';

export function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  const key = req.headers['x-api-key'];
  const expected = process.env.INTEGRATION_API_KEY;
  if (!expected || key !== expected) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

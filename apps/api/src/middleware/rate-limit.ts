import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/errors.js';

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export function rateLimit(options: { windowMs: number; max: number; name: string }) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (buckets.size > 10_000) {
      const now = Date.now();
      for (const [key, bucket] of buckets) {
        if (bucket.resetAt < now) buckets.delete(key);
      }
    }
    const key = `${options.name}:${req.ip ?? 'unknown'}`;
    const now = Date.now();
    const current = buckets.get(key);
    if (!current || current.resetAt < now) {
      buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      next();
      return;
    }
    if (current.count >= options.max) {
      next(new AppError('RATE_LIMITED', 'Too many requests. Try again later.', 429));
      return;
    }
    current.count += 1;
    next();
  };
}

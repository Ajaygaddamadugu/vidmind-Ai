import { Request, Response, NextFunction } from 'express';

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Minimal fixed-window, per-IP rate limiter (single-instance deployments).
 */
export function rateLimit(options: {
  windowMs: number;
  max: number;
  name: string;
  message?: string;
  skip?: (req: Request) => boolean;
}) {
  const buckets = new Map<string, Bucket>();

  setInterval(() => {
    const now = Date.now();
    for (const [key, b] of buckets) if (b.resetAt <= now) buckets.delete(key);
  }, Math.max(options.windowMs, 60_000)).unref();

  return (req: Request, res: Response, next: NextFunction) => {
    if (options.skip?.(req)) return next();
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + options.windowMs };
      buckets.set(key, bucket);
    }
    bucket.count++;

    res.setHeader('RateLimit-Limit', options.max);
    res.setHeader('RateLimit-Remaining', Math.max(0, options.max - bucket.count));

    if (bucket.count > options.max) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader('Retry-After', retryAfter);
      return res.status(429).json({
        success: false,
        code: 'RATE_LIMITED',
        error: options.message || `Too many requests. Please wait ${retryAfter} seconds and try again.`,
      });
    }
    next();
  };
}

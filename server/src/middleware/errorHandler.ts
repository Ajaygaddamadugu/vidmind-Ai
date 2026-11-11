import { Request, Response, NextFunction } from 'express';
import { HttpError } from '../utils/httpError';
import { isProduction } from '../config/env';

/**
 * Express error handling middleware. Only HttpError messages reach users;
 * anything else is logged and replaced with a generic message.
 */
export function errorHandler(err: any, req: Request, res: Response, _next: NextFunction) {
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, error: 'Invalid JSON in request body.' });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ success: false, error: 'Request is too large.' });
  }

  const known = err instanceof HttpError;
  if (!known || err.statusCode >= 500) {
    console.error(`[error] ${req.method} ${req.originalUrl}:`, err);
  }
  if (res.headersSent) return;

  res.status(known ? err.statusCode : 500).json({
    success: false,
    code: known ? err.code : 'INTERNAL',
    error: known ? err.message : 'Something went wrong on our side. Please try again.',
    stack: !isProduction && !known ? err?.stack : undefined,
  });
}

/** Wraps an async route so rejected promises reach the error handler. */
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res, next).catch(next);

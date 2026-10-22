import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { logger } from '../config/logger.js';
import { AppError, isAppError } from '../utils/errors.js';

export function notFound(req: Request, _res: Response, next: NextFunction): void {
  next(new AppError('NOT_FOUND', `No route for ${req.method} ${req.path}`, 404));
}

export function errorHandler(error: unknown, req: Request, res: Response, _next: NextFunction): void {
  const requestId = req.requestId || 'unknown';

  if (error instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
        requestId,
      },
    });
    return;
  }

  if (isAppError(error)) {
    if (error.status >= 500) logger.error({ err: error, requestId }, error.message);
    res.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
        requestId,
      },
    });
    return;
  }

  if (typeof error === 'object' && error !== null && 'code' in error && (error as { code: number }).code === 11000) {
    res.status(409).json({
      error: { code: 'CONFLICT', message: 'A record with that unique value already exists', requestId },
    });
    return;
  }

  if (error instanceof Error && error.name === 'CastError') {
    res.status(400).json({
      error: { code: 'INVALID_ID', message: 'Invalid identifier', requestId },
    });
    return;
  }

  if (error instanceof SyntaxError && 'body' in error) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Request body must be valid JSON', requestId },
    });
    return;
  }

  logger.error({ err: error, requestId }, 'Unhandled request error');
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Something went wrong', requestId },
  });
}

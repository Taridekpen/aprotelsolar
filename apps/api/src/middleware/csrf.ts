import type { NextFunction, Request, Response } from 'express';
import { CSRF_HEADER } from '../config/constants.js';
import { SessionModel } from '../models/session.model.js';
import { AppError } from '../utils/errors.js';
import { safeEqual } from '../utils/tokens.js';
import { asyncHandler } from './async-handler.js';

export function requireCsrf() {
  return asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
    if (!req.admin) throw new AppError('UNAUTHORIZED', 'Authentication is required', 401);
    const header = req.get(CSRF_HEADER);
    if (!header) throw new AppError('CSRF_FAILED', 'Missing CSRF token', 403);
    const session = await SessionModel.findById(req.admin.sessionId);
    if (!session || !safeEqual(session.csrfToken, header)) {
      throw new AppError('CSRF_FAILED', 'Invalid CSRF token', 403);
    }
    next();
  });
}

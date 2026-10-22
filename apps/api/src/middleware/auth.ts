import { hasPermission, resolvePermissions, type Permission, type Role } from '@aprotel/shared';
import type { NextFunction, Request, Response } from 'express';
import { SESSION_COOKIE } from '../config/constants.js';
import type { Env } from '../config/env.js';
import { AdministratorModel } from '../models/administrator.model.js';
import { SessionModel } from '../models/session.model.js';
import { AppError } from '../utils/errors.js';
import { sha256 } from '../utils/tokens.js';
import { asyncHandler } from './async-handler.js';

export function authenticate(env: Env) {
  return asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
    const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
    if (!token) throw new AppError('UNAUTHORIZED', 'Authentication is required', 401);

    const session = await SessionModel.findOne({ tokenHash: sha256(token), revokedAt: null });
    if (!session || session.expiresAt.getTime() <= Date.now() || session.idleExpiresAt.getTime() <= Date.now()) {
      throw new AppError('UNAUTHORIZED', 'Authentication is required', 401);
    }

    const administrator = await AdministratorModel.findById(session.administratorId);
    if (!administrator || administrator.status !== 'active') {
      throw new AppError('UNAUTHORIZED', 'Authentication is required', 401);
    }

    const overrides = administrator.permissionsRestricted ? administrator.permissionOverrides : null;
    req.admin = {
      id: String(administrator._id),
      email: administrator.email,
      fullName: administrator.fullName,
      role: administrator.role as Role,
      permissions: resolvePermissions(administrator.role as Role, overrides),
      sessionId: String(session._id),
    };

    const idleMs = env.SESSION_IDLE_MINUTES * 60 * 1000;
    if (session.idleExpiresAt.getTime() < Date.now() + idleMs - 60_000) {
      await SessionModel.updateOne({ _id: session._id }, { $set: { idleExpiresAt: new Date(Date.now() + idleMs) } });
    }
    next();
  });
}

export function requirePermission(...required: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.admin) {
      next(new AppError('UNAUTHORIZED', 'Authentication is required', 401));
      return;
    }
    const allowed = required.every((permission) => hasPermission(req.admin!.permissions, permission));
    if (!allowed) {
      next(new AppError('FORBIDDEN', 'You do not have permission to perform this action', 403));
      return;
    }
    next();
  };
}

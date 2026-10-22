import type { Permission, Role } from '@aprotel/shared';
import type { Request, Response } from 'express';

export interface Actor {
  id: string;
  role: Role;
  permissions: Permission[];
  ipAddress?: string;
  userAgent?: string;
}

export function sendData(res: Response, data: unknown, status = 200): void {
  res.status(status).json({ data });
}

export function sendList(res: Response, data: unknown, meta: unknown): void {
  res.status(200).json({ data, meta });
}

export function actorFrom(req: Request): Actor {
  const admin = req.admin;
  if (!admin) throw new Error('Authenticated administrator is missing');
  return {
    id: admin.id,
    role: admin.role,
    permissions: admin.permissions,
    ipAddress: req.ip,
    userAgent: req.get('user-agent') ?? '',
  };
}

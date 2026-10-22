import { AuditLogModel } from '../models/security.model.js';

export async function recordAudit(entry: {
  actorId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await AuditLogModel.create({
    actorId: entry.actorId || null,
    action: entry.action,
    resourceType: entry.resourceType,
    resourceId: entry.resourceId ?? '',
    ipAddress: entry.ipAddress ?? '',
    userAgent: entry.userAgent ?? '',
    metadata: entry.metadata ?? {},
  });
}

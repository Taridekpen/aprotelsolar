import type { Permission, Role } from '@aprotel/shared';

export interface AuthenticatedAdmin {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  permissions: Permission[];
  sessionId: string;
}

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      rawBody?: Buffer;
      admin?: AuthenticatedAdmin;
      validatedQuery?: unknown;
    }
  }
}

export {};

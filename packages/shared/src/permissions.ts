export const ROLES = [
  'super_administrator',
  'administrator',
  'editor',
  'inventory_manager',
  'engineer',
] as const;

export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  'administrators:read',
  'administrators:manage',
  'settings:read',
  'settings:update',
  'settings:update_sensitive',
  'products:read',
  'products:write',
  'products:publish',
  'products:read_cost',
  'products:verify_specs',
  'categories:read',
  'categories:write',
  'services:read',
  'services:write',
  'services:publish',
  'packages:read',
  'packages:write',
  'packages:publish',
  'branches:read',
  'branches:write',
  'inventory:read',
  'inventory:receive',
  'inventory:adjust',
  'inventory:transfer',
  'media:read',
  'media:upload',
  'media:delete',
  'content:read',
  'content:write',
  'enquiries:read',
  'enquiries:update',
  'quotations:read',
  'quotations:update',
  'quotations:approve',
  'orders:read',
  'orders:update',
  'orders:cancel',
  'reports:read',
  'audit:read',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ALL = [...PERMISSIONS];

const ADMINISTRATOR: Permission[] = ALL.filter(
  (permission) => permission !== 'administrators:manage' && permission !== 'settings:update_sensitive',
);

const EDITOR: Permission[] = [
  'products:read',
  'products:write',
  'products:publish',
  'categories:read',
  'categories:write',
  'services:read',
  'services:write',
  'services:publish',
  'packages:read',
  'packages:write',
  'packages:publish',
  'branches:read',
  'media:read',
  'media:upload',
  'media:delete',
  'content:read',
  'content:write',
  'enquiries:read',
];

const INVENTORY_MANAGER: Permission[] = [
  'products:read',
  'products:read_cost',
  'categories:read',
  'branches:read',
  'branches:write',
  'inventory:read',
  'inventory:receive',
  'inventory:adjust',
  'inventory:transfer',
  'media:read',
  'orders:read',
  'orders:update',
  'reports:read',
];

const ENGINEER: Permission[] = [
  'products:read',
  'products:verify_specs',
  'categories:read',
  'services:read',
  'packages:read',
  'packages:write',
  'branches:read',
  'enquiries:read',
  'enquiries:update',
  'quotations:read',
  'quotations:update',
  'quotations:approve',
  'orders:read',
  'content:read',
];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  super_administrator: ALL,
  administrator: ADMINISTRATOR,
  editor: EDITOR,
  inventory_manager: INVENTORY_MANAGER,
  engineer: ENGINEER,
};

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

export function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value);
}

/**
 * A null override uses the role's full permission set.
 * A provided list can only narrow that set; it cannot grant permissions the role does not have.
 */
export function resolvePermissions(role: Role, overrides?: readonly string[] | null): Permission[] {
  const allowed = ROLE_PERMISSIONS[role];
  if (overrides == null) return [...allowed];
  return allowed.filter((permission) => overrides.includes(permission));
}

export function hasPermission(permissions: readonly Permission[], required: Permission): boolean {
  return permissions.includes(required);
}

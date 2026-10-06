import type { AdminRole } from '@prisma/client';

export const PERMISSIONS = {
  'dashboard:read': 'View admin dashboard',
  'analytics:read': 'View platform analytics',
  'pcs:read': 'View property consultants',
  'pcs:write': 'Create / edit property consultants',
  'pcs:status': 'Suspend / activate / deactivate PCs',
  'records:read': 'View clients, properties, requirements, deals, follow-ups',
  'records:write': 'Edit / delete platform records',
  'notifications:read': 'View notification center',
  'audit:read': 'View activity and audit logs',
  'bin:read': 'View platform bin',
  'bin:restore': 'Restore records from bin',
  'bin:purge': 'Permanently delete records',
  'master:read': 'View locations and amenities',
  'master:write': 'Manage locations and amenities',
  'settings:read': 'View system settings',
  'settings:write': 'Change system settings',
  'admins:manage': 'Manage administrator accounts',
  export: 'Export data as CSV',
} as const;
export type Permission = keyof typeof PERMISSIONS;

const READ: Permission[] = ['dashboard:read', 'analytics:read', 'pcs:read', 'records:read', 'notifications:read', 'audit:read', 'bin:read', 'master:read', 'settings:read'];

export const ROLE_PERMISSIONS: Record<AdminRole, Permission[]> = {
  SUPER_ADMIN: Object.keys(PERMISSIONS) as Permission[],
  ADMIN: [...READ, 'pcs:write', 'pcs:status', 'records:write', 'bin:restore', 'master:write', 'export'],
  SUPPORT_ADMIN: [...READ, 'pcs:status'],
  READ_ONLY_ADMIN: READ,
};

export const hasPermission = (role: AdminRole, p: Permission) => ROLE_PERMISSIONS[role]?.includes(p) ?? false;

import type { User, UserRole } from '@prisma/client';

export const can = {
  manageTenant:    (u: User) => u.role === 'SUPERADMIN' || u.role === 'ADMIN',
  manageUsers:     (u: User) => u.role === 'SUPERADMIN' || u.role === 'ADMIN',
  manageAgreements:(u: User) => ['SUPERADMIN','ADMIN','MANAGER'].includes(u.role),
  viewAllSales:    (u: User) => ['SUPERADMIN','ADMIN','MANAGER'].includes(u.role),
  editSales:       (u: User) => ['SUPERADMIN','ADMIN','MANAGER','AGENT'].includes(u.role),
  reconcile:       (u: User) => ['SUPERADMIN','ADMIN','MANAGER'].includes(u.role),
  importData:      (u: User) => ['SUPERADMIN','ADMIN'].includes(u.role),
};

/** Where-clause helper that scopes queries to user's visibility */
export function scopeWhere(u: User) {
  if (u.role === 'SUPERADMIN') return {}; // platform-wide
  const base: Record<string, unknown> = { tenantId: u.tenantId ?? '__none__' };
  if (u.role === 'AGENT' || u.role === 'VIEWER') {
    base.ownerUserId = u.id;
  }
  return base;
}

export const roleLabel: Record<UserRole, string> = {
  SUPERADMIN: 'מנהל פלטפורמה',
  ADMIN:      'מנהל סוכנות',
  MANAGER:    'מנהל צוות',
  AGENT:      'סוכן',
  VIEWER:     'צפייה',
};

import type { UserRole } from './erpNavigation';

export const configurableRoles: { id: Exclude<UserRole, 'admin'>; name: string }[] = [
  { id: 'seller', name: 'Ventas' }, { id: 'logistica', name: 'Logística' },
  { id: 'fletero', name: 'Transportistas' }, { id: 'administracion', name: 'Administración' },
  { id: 'compras', name: 'Compras' }, { id: 'instalador', name: 'Instaladores' },
];
export type RoleScreenOverrides = Partial<Record<UserRole, Record<string, boolean>>>;

export function validateScreenOverrides(value: unknown, editableIds: Set<string>): value is RoleScreenOverrides {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.entries(value).every(([role, entries]) =>
    configurableRoles.some(item => item.id === role) && !!entries && typeof entries === 'object'
    && !Array.isArray(entries) && Object.entries(entries).every(([id, allowed]) => editableIds.has(id) && typeof allowed === 'boolean'));
}

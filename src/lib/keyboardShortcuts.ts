import type { ErpModule } from './erpNavigation';

export interface ShortcutAction { id: string; name: string; href?: string; group: string }
export type ShortcutBindings = Record<string, string>;
export const defaultShortcuts: ShortcutBindings = {
  'new-movement': 'Alt+M', 'minorista-2': 'F2', 'minorista-4': 'Alt+B',
  submit: 'Ctrl+Enter', 'tesoreria-1': 'Alt+C', 'direccion-margen-diario': 'Alt+R',
  'direccion-3': 'Alt+Shift+R', 'direccion-2': 'Alt+Shift+M',
};
export function shortcutActions(modules: ErpModule[]): ShortcutAction[] {
  const actions: ShortcutAction[] = modules.flatMap(m => m.links.map(l => ({ id: l.id, name: l.name, href: l.href, group: m.title })));
  if (actions.some(a => a.id === 'tesoreria-4')) actions.unshift({ id: 'new-movement', name: 'Cargar Movimiento', href: '/admin/finanzas?shortcut=new-movement', group: 'Tesorería y Finanzas' });
  if (actions.length) actions.unshift({ id: 'submit', name: 'Aceptar / Cargar Registro', group: 'Pantalla actual' });
  return actions;
}
export function normalizeShortcut(value: string): string | null {
  const parts = value.trim().split('+').map(p => p.trim().toUpperCase());
  const key = parts.pop() || '';
  const mods = parts;
  // Reserve common browser function keys, including their modified variants.
  if (/^F\d+$/.test(key) && !['F2', 'F8'].includes(key)) return null;
  if (new Set(mods).size !== mods.length || mods.some(m => !['CTRL', 'ALT', 'SHIFT', 'META'].includes(m))) return null;
  if (!/^(F([1-9]|1[0-2])|[A-Z0-9]|ENTER)$/.test(key)) return null;
  if (!/^F\d+$/.test(key) && !mods.includes('CTRL') && !mods.includes('ALT') && !mods.includes('META')) return null;
  // Avoid AltGr (Ctrl+Alt), operating system combinations and browser commands.
  if (mods.includes('META') || (mods.includes('CTRL') && mods.includes('ALT'))) return null;
  if (mods.includes('ALT') && (/^F\d+$/.test(key) || ['TAB', 'ENTER', 'D', 'F', 'E', 'SPACE'].includes(key))) return null;
  if (mods.includes('CTRL') && key !== 'ENTER') return null;
  return [...['CTRL','ALT','SHIFT'].filter(m => mods.includes(m)).map(m => ({CTRL:'Ctrl',ALT:'Alt',SHIFT:'Shift'})[m]), key === 'ENTER' ? 'Enter' : key].join('+');
}
export function keyboardShortcut(event: Pick<KeyboardEvent, 'key'|'ctrlKey'|'altKey'|'shiftKey'|'metaKey'>): string | null {
  return normalizeShortcut([event.ctrlKey && 'Ctrl', event.altKey && 'Alt', event.shiftKey && 'Shift', event.metaKey && 'Meta', event.key].filter(Boolean).join('+'));
}
export function resolveShortcuts(actions: ShortcutAction[], stored: unknown): ShortcutBindings {
  const overrides = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored as Record<string, unknown> : {};
  const result: ShortcutBindings = {}, used = new Set<string>();
  for (const action of actions) {
    const raw = Object.prototype.hasOwnProperty.call(overrides, action.id) ? overrides[action.id] : defaultShortcuts[action.id];
    const key = typeof raw === 'string' ? normalizeShortcut(raw) : null;
    if (key && !used.has(key)) { result[action.id] = key; used.add(key); }
    else result[action.id] = '';
  }
  return result;
}

export function submitShortcutTarget(doc: Document): HTMLElement | null {
  const visible = (el: HTMLElement) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden' && !el.closest('[inert], [aria-hidden="true"]');
  const overlays = Array.from(doc.querySelectorAll<HTMLElement>('dialog[open], [role="dialog"], [aria-modal="true"], .fixed.inset-0')).filter(visible);
  const layer = (el: HTMLElement) => el.matches('dialog[open]') ? Number.MAX_SAFE_INTEGER : Number(getComputedStyle(el).zIndex) || 0;
  overlays.sort((a,b) => layer(a) - layer(b));
  const scope = overlays.at(-1) || doc.querySelector('main') || doc;
  const focused = doc.activeElement?.closest<HTMLElement>('[data-shortcut-submit]');
  const targets = Array.from(scope.querySelectorAll<HTMLElement>('[data-shortcut-submit]')).filter(visible);
  if (scope instanceof HTMLElement && scope.matches('[data-shortcut-submit]') && visible(scope)) targets.unshift(scope);
  if (focused && targets.includes(focused)) return focused;
  return targets.length === 1 ? targets[0] : null;
}
export function activateSubmitShortcut(target: HTMLElement): boolean {
  if (target instanceof HTMLFormElement) {
    const button = Array.from(target.querySelectorAll<HTMLButtonElement | HTMLInputElement>('button:not([type="button"]):not([type="reset"]), input[type="submit"]')).find(el => el.getClientRects().length > 0);
    if (!button || button.matches(':disabled') || button.getAttribute('aria-disabled') === 'true') return false;
    target.requestSubmit(button);
    return true;
  }
  if (target.matches(':disabled') || target.getAttribute('aria-disabled') === 'true') return false;
  target.click();
  return true;
}

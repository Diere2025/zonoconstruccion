"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Keyboard, Search, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useErpNavigation } from './ErpNavigationContext';
import { activateSubmitShortcut, keyboardShortcut, normalizeShortcut, resolveShortcuts, shortcutActions, submitShortcutTarget, type ShortcutBindings } from '@/lib/keyboardShortcuts';

export function KeyboardShortcuts({ userId }: { userId: string | null }) {
  const { modules, ready } = useErpNavigation();
  const router = useRouter();
  const actions = useMemo(() => shortcutActions(modules), [modules]);
  const [stored, setStored] = useState<unknown>({});
  const [loadedUser, setLoadedUser] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [draft, setDraft] = useState<ShortcutBindings>({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const lastRun = useRef(0);
  const bindings = useMemo(() => resolveShortcuts(actions, stored), [actions, stored]);
  useEffect(() => {
    let active = true;
    setLoadedUser(null); setOpen(false); setStored({});
    if (!ready || !userId) return;
    supabase.auth.getUser().then(({ data, error }) => {
      if (active && !error && data.user?.id === userId) {
        setStored(data.user.user_metadata?.keyboard_shortcuts || {}); setLoadedUser(userId);
      }
    });
    return () => { active = false; };
  }, [userId, ready]);
  useEffect(() => {
    if (!ready || !userId || loadedUser !== userId) return;
    const handler = (event: KeyboardEvent) => {
      if (open || event.defaultPrevented || event.repeat || event.isComposing || event.getModifierState('AltGraph')) return;
      const key = keyboardShortcut(event);
      const action = actions.find(a => bindings[a.id] && bindings[a.id] === key);
      if (!action) return;
      event.preventDefault();
      if (Date.now() - lastRun.current < 800) return;
      if (action.id === 'submit') {
        const target = submitShortcutTarget(document);
        if (target) { lastRun.current = Date.now(); activateSubmitShortcut(target); }
      } else if (action.href) {
        // Keep an open dialog and its unsaved data in place.
        const dialogs = document.querySelectorAll<HTMLElement>('dialog[open], [role="dialog"], [aria-modal="true"], .fixed.inset-0');
        if (Array.from(dialogs).some(el => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden')) return;
        lastRun.current = Date.now();
        router.push(action.id === 'new-movement' ? `${action.href}&request=${Date.now()}` : action.href);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [actions, bindings, ready, userId, loadedUser, open, router]);
  const normalizeFilter = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const query = normalizeFilter(filter);
  const filteredActions = actions.filter(action => normalizeFilter(`${action.name} ${action.group} ${draft[action.id] || 'Sin atajo'}`).includes(query));

  async function save() {
    const clean: ShortcutBindings = {}, used = new Set<string>();
    for (const action of actions) {
      const raw = draft[action.id] || '';
      const key = raw ? normalizeShortcut(raw) : '';
      if (raw && !key) { setMessage(`Combinación no admitida: ${action.name}.`); return; }
      if (key && used.has(key)) { setMessage(`El atajo ${key} está repetido.`); return; }
      if (key) used.add(key);
      clean[action.id] = key || '';
    }
    setBusy(true); setMessage('');
    try {
      const { data: current, error: authError } = await supabase.auth.getUser();
      if (authError || current.user?.id !== userId) throw new Error('La sesión cambió. Volvé a abrir la configuración.');
      const { data, error } = await supabase.auth.updateUser({ data: { keyboard_shortcuts: clean } });
      if (error) throw error;
      setStored(data.user?.user_metadata?.keyboard_shortcuts || clean);
      setMessage('Atajos guardados en tu cuenta.');
      setOpen(false);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudieron guardar los atajos.'); }
    finally { setBusy(false); }
  }
  if (!ready || !userId || loadedUser !== userId) return null;
  return <>
    <button type="button" onClick={() => { setDraft(bindings); setFilter(''); setMessage(''); setOpen(true); }} className="fixed bottom-3 right-3 z-30 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm" aria-label="Configurar mis atajos de teclado"><Keyboard size={16}/> Atajos</button>
    {!open && message === 'Atajos guardados en tu cuenta.' && <p role="status" className="fixed bottom-14 right-3 z-30 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">{message}</p>}
    {open && <div role="dialog" aria-modal="true" aria-labelledby="shortcut-title" className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4" onKeyDown={e => { if (e.key === 'Escape' && !busy) setOpen(false); }}>
      <section className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b p-4"><h2 id="shortcut-title" className="font-bold">Mis atajos de teclado</h2><button type="button" disabled={busy} aria-label="Cerrar" onClick={() => setOpen(false)}><X size={20}/></button></div>
        <div className="overflow-y-auto p-4">
          <p className="mb-2 text-sm text-slate-600">Solo aparecen tus accesos habilitados. Presioná una combinación o pegala en el campo. Dejá el campo vacío para desactivar un atajo.</p>
          <p className="mb-2 text-xs text-slate-500">Sugerencias: Alt+M (movimiento), Alt+P (pedido), Alt+B (presupuesto), Ctrl+Enter (aceptar). También se admite Shift con estas combinaciones, F2 y F8.</p>
          <p className="mb-4 text-xs text-amber-700">F1, F3, F4, F5, F6, F7, F9, F10, F11 y F12 están reservadas para el navegador y no se admiten. Los atajos anteriores con esas teclas quedan desactivados. Ctrl+Alt se reserva para escribir con AltGr. Aceptar actúa sobre la carga activa y respeta sus confirmaciones.</p>
          <div className="sticky top-0 z-10 mb-4 bg-white pb-2">
            <div className="relative">
              <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-3 text-slate-400" />
              <input autoFocus type="search" aria-label="Filtrar atajos" placeholder="Filtrar por nombre, área o tecla…" value={filter} onChange={e => setFilter(e.target.value)} className="w-full rounded-lg border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20" />
            </div>
            {query && <p className="mt-2 text-xs text-slate-500" aria-live="polite">{filteredActions.length} de {actions.length} accesos</p>}
          </div>
          {filteredActions.length === 0 && <p className="py-6 text-center text-sm text-slate-500">No se encontraron atajos para este filtro.</p>}
          <div className="space-y-3">{filteredActions.map(action => <label key={action.id} className="flex items-center justify-between gap-3 border-b border-slate-100 pb-2"><span className="text-sm"><span className="block font-medium">{action.name}</span><span className="text-xs text-slate-500">{action.group}</span></span><input disabled={busy} aria-label={`Atajo para ${action.name}`} className="w-36 shrink-0 rounded-lg border px-2 py-2 text-sm" placeholder="Sin atajo" value={draft[action.id] || ''} onChange={e => setDraft(prev => ({ ...prev, [action.id]: e.target.value }))} onKeyDown={e => { if (['Tab','Escape','Backspace','Delete'].includes(e.key)) return; e.preventDefault(); const key = keyboardShortcut(e.nativeEvent); if (key) { setDraft(prev => ({ ...prev, [action.id]: key })); setMessage(''); } else if (!['Control','Alt','Shift','Meta'].includes(e.key)) setMessage('Combinación no admitida. Probá Alt+letra, Ctrl+Enter, F2 o F8.'); }}/></label>)}</div>
        </div>
        <div className="border-t p-4">{message && <p role="status" className="mb-3 text-sm">{message}</p>}<div className="flex justify-between gap-3"><button type="button" disabled={busy} className="text-sm underline" onClick={() => { setDraft(resolveShortcuts(actions, {})); setMessage(''); }}>Restaurar predeterminados</button><button type="button" disabled={busy} onClick={() => void save()} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Guardando…' : 'Guardar atajos'}</button></div></div>
      </section>
    </div>}
  </>;
}

"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, CheckCircle2, Loader2, LockKeyhole, RotateCcw, Save, Search, ShieldCheck, Users } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { createAuthenticatedRequester } from '@/lib/authenticatedRequest';
import { defaultErpModules, erpModules, isConfigurableScreen, type UserRole } from '@/lib/erpNavigation';
import { configurableRoles, type RoleScreenOverrides } from '@/lib/roleScreenAccess';

const request = createAuthenticatedRequester(supabase);
type Configuration = { overrides: RoleScreenOverrides; revision: number; available: boolean; updated_at?: string };

export default function RoleScreenAccessPage() {
  const [saved, setSaved] = useState<Configuration | null>(null);
  const [draft, setDraft] = useState<RoleScreenOverrides>({});
  const [role, setRole] = useState<Exclude<UserRole, 'admin'>>('seller');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const dirty = !!saved && JSON.stringify(draft) !== JSON.stringify(saved.overrides);
  const editable = !!saved?.available && !saving && !loading;
  const load = useCallback(async () => {
    setLoading(true); setError(''); setMessage('');
    try {
      const data: Configuration = await request('/api/role-screen-access?manage=1');
      setSaved(data); setDraft(data.overrides);
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudieron cargar los accesos.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty]);
  const defaults = useMemo(() => new Set(defaultErpModules({ roles: [role], restrictedSeller: false, canUseWholesale: true })
    .flatMap(module => module.links.map(link => link.id))), [role]);
  const allowed = (id: string) => draft[role]?.[id] ?? defaults.has(id);
  const modules = erpModules.map(module => ({ ...module, links: module.links.filter(link =>
    `${module.title} ${link.name}`.toLocaleLowerCase('es').includes(query.trim().toLocaleLowerCase('es'))) })).filter(module => module.links.length);
  const count = erpModules.flatMap(module => module.links).filter(link => isConfigurableScreen(link) && allowed(link.id)).length;
  function toggle(id: string, value: boolean) {
    setDraft(current => {
      const entries = { ...current[role] };
      if (value === defaults.has(id)) delete entries[id]; else entries[id] = value;
      const next = { ...current };
      if (Object.keys(entries).length) next[role] = entries; else delete next[role];
      return next;
    });
    setMessage('');
  }
  async function save() {
    if (!saved || !editable || !dirty) return;
    setSaving(true); setError(''); setMessage('');
    try {
      const data: Configuration = await request('/api/role-screen-access', {
        method: 'PUT', body: JSON.stringify({ overrides: draft, revision: saved.revision }),
      });
      setSaved(data); setDraft(data.overrides); setMessage('Accesos guardados. Se aplicarán al navegar, al volver al ERP o dentro de un minuto en las sesiones abiertas.');
      window.dispatchEvent(new Event('erp-screen-access-updated'));
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudieron guardar los accesos.'); }
    finally { setSaving(false); }
  }
  return <div className="mx-auto w-full min-w-0 max-w-6xl space-y-5">
    <section className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3"><div className="shrink-0 rounded-2xl bg-blue-50 p-3 text-blue-700"><ShieldCheck className="h-6 w-6" /></div>
          <div className="min-w-0"><h1 className="text-xl font-bold text-slate-900">Accesos por rol</h1><p className="mt-1 text-sm text-slate-500">Elegí qué pantallas puede abrir cada rol del ERP.</p></div></div>
        <Link href="/admin/vendedores" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"><Users className="h-4 w-4" />Gestión de Usuarios</Link>
      </div>
      <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm leading-relaxed text-slate-600">Estos accesos controlan el menú y la apertura de pantallas. Los permisos actuales para consultar datos, crear, editar o eliminar se conservan: habilitar una pantalla no amplía esas operaciones. Si una persona tiene varios roles, recibe la unión de sus accesos. Las restricciones comerciales individuales siguen vigentes.</p>
    </section>
    {error && <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><AlertCircle className="h-5 w-5 shrink-0" />{error}<button disabled={saving || loading} onClick={() => void load()} className="font-bold underline">Recargar configuración (descarta cambios)</button></div>}
    {message && <div role="status" className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"><CheckCircle2 className="h-5 w-5 shrink-0" />{message}</div>}
    {loading ? <div role="status" className="flex items-center gap-2 p-8 text-slate-500"><Loader2 className="h-5 w-5 animate-spin" />Cargando configuración…</div> : saved && <>
      {!saved.available && <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">La configuración aún no está disponible. Falta aplicar la migración de accesos en la base de datos; se mantienen los accesos actuales.</div>}
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-5">
          <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500" htmlFor="access-role">Rol a configurar</label>
          <div className="flex flex-wrap gap-3">
            <select id="access-role" value={role} disabled={saving} onChange={e => setRole(e.target.value as typeof role)} className="min-w-48 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold">
              {configurableRoles.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            <label className="flex min-w-52 flex-1 items-center gap-2 rounded-xl border border-slate-300 px-3"><Search className="h-4 w-4 text-slate-400" /><input aria-label="Buscar pantalla o módulo" placeholder="Buscar pantalla o módulo…" value={query} onChange={e => setQuery(e.target.value)} className="w-full bg-transparent py-2.5 text-sm outline-none" /></label>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm"><span className="font-semibold text-slate-600">{count} pantallas habilitadas · {configurableRoles.find(item => item.id === role)?.name}</span>
            <button disabled={!editable || !draft[role]} onClick={() => { setDraft(current => { const next = { ...current }; delete next[role]; return next; }); setMessage(''); }} className="inline-flex items-center gap-2 font-semibold text-blue-700 disabled:opacity-40"><RotateCcw className="h-4 w-4" />Restaurar este rol</button></div>
        </div>
        <div className="divide-y divide-slate-200">{modules.map(module => <section key={module.id} className="p-5">
          <h2 className="text-sm font-bold text-slate-900">{module.title}</h2><p className="mt-1 text-xs text-slate-500">{module.description}</p>
          <div className="mt-3 grid gap-2 md:grid-cols-2">{module.links.map(link => {
            const configurable = isConfigurableScreen(link);
            const checked = configurable && allowed(link.id);
            return <label key={link.id} className={`flex items-center justify-between gap-3 rounded-xl border p-3 text-sm ${checked ? 'border-blue-200 bg-blue-50/60' : 'border-slate-200 bg-slate-50/60'} ${configurable && editable ? 'cursor-pointer' : 'opacity-60'}`}>
              <span><span className="block font-medium text-slate-800">{link.name}</span><span className="mt-0.5 block text-xs text-slate-500">{configurable ? (checked ? 'Habilitada' : 'Sin acceso') : link.ownerEmail || link.userOnly ? 'Acceso personal reservado' : 'Reservado a administradores'}</span></span>
              {configurable ? <input type="checkbox" aria-label={`Acceso a ${link.name}`} checked={checked} disabled={!editable} onChange={e => toggle(link.id, e.target.checked)} className="h-5 w-5 shrink-0 accent-blue-600" /> : <LockKeyhole className="h-4 w-4 shrink-0" />}
            </label>;
          })}</div>
        </section>)}</div>
        {!modules.length && <p className="p-8 text-center text-sm text-slate-500">No hay pantallas que coincidan con la búsqueda.</p>}
      </section>
      <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-lg">
        <div className="text-sm text-slate-600"><span className="font-semibold">{dirty ? 'Hay cambios sin guardar' : 'Sin cambios pendientes'}</span><p className="mt-1 text-xs text-slate-500">Administrador conserva sus accesos. Cada guardado queda registrado.</p></div>
        <div className="flex gap-2"><button disabled={!dirty || !editable} onClick={() => { setDraft(saved.overrides); setError(''); setMessage(''); }} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold disabled:opacity-40">Descartar</button>
          <button disabled={!dirty || !editable} onClick={() => void save()} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-40">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Guardar cambios</button></div>
      </div>
    </>}
  </div>;
}

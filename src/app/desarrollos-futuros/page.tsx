'use client';

import { useEffect, useState } from 'react';
import { BookOpen, FilePlus2, Pencil, Save, X } from 'lucide-react';
import { AdminLayout } from '@/components/ui/AdminLayout';
import { MarkdownDocument } from '@/components/futureDevelopments/MarkdownDocument';
import { createAuthenticatedRequester } from '@/lib/authenticatedRequest';
import { FUTURE_DEVELOPMENTS_OWNER_ID, futureDevelopmentStatuses, type FutureDevelopmentDocument, type FutureDevelopmentStatus, type FutureDevelopmentSummary } from '@/lib/futureDevelopments';
import { supabase } from '@/lib/supabase';

const request = createAuthenticatedRequester(supabase);
type Draft = { title: string; status: FutureDevelopmentStatus; content_md: string };
const emptyDraft: Draft = { title: '', status: 'idea', content_md: '' };

export default function FutureDevelopmentsPage() {
  const [access, setAccess] = useState<'loading' | 'owner' | 'denied'>('loading');
  const [items, setItems] = useState<FutureDevelopmentSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [document, setDocument] = useState<FutureDevelopmentDocument | null>(null);
  const [loadingDocument, setLoadingDocument] = useState(false);
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    let revision = 0;
    let authTimer: ReturnType<typeof setTimeout> | undefined;
    const check = async () => {
      const current = ++revision;
      const { data: { session } } = await supabase.auth.getSession();
      if (!alive || current !== revision) return;
      if (session?.user.id !== FUTURE_DEVELOPMENTS_OWNER_ID) {
        setAccess('denied'); setItems([]); setSelectedId(null); setDocument(null); setEditing(false); setCreating(false);
        return;
      }
      setAccess('owner');
      try {
        const result = await request('/api/future-developments');
        if (!alive || current !== revision) return;
        const list = result.items as FutureDevelopmentSummary[];
        setItems(list);
        setSelectedId(id => id && list.some(item => item.id === id) ? id : list[0]?.id || null);
        setError('');
      } catch (cause) {
        if (alive && current === revision) setError(cause instanceof Error ? cause.message : 'No se pudieron cargar los documentos.');
      }
    };
    void check();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user.id !== FUTURE_DEVELOPMENTS_OWNER_ID) {
        setAccess('loading'); setItems([]); setSelectedId(null); setDocument(null); setEditing(false); setCreating(false);
      }
      clearTimeout(authTimer);
      authTimer = setTimeout(() => { void check(); }, 0);
    });
    return () => { alive = false; revision++; clearTimeout(authTimer); subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (access !== 'owner' || !selectedId || creating) return;
    let alive = true;
    setLoadingDocument(true);
    setDocument(null);
    void request(`/api/future-developments/${selectedId}`).then((value: FutureDevelopmentDocument) => {
      if (alive) { setDocument(value); setDraft({ title: value.title, status: value.status, content_md: value.content_md }); setError(''); }
    }).catch(cause => { if (alive) setError(cause instanceof Error ? cause.message : 'No se pudo abrir el documento.'); })
      .finally(() => { if (alive) setLoadingDocument(false); });
    return () => { alive = false; };
  }, [access, selectedId, creating]);

  const openDocument = (id: string) => {
    if (editing && (draft.title !== document?.title || draft.content_md !== document?.content_md || draft.status !== document?.status) &&
        !window.confirm('¿Descartar los cambios sin guardar?')) return;
    setCreating(false); setEditing(false); setSelectedId(id); setError('');
  };

  const startNew = () => {
    if (editing && (draft.title !== document?.title || draft.content_md !== document?.content_md || draft.status !== document?.status) &&
        !window.confirm('¿Descartar los cambios sin guardar?')) return;
    setSelectedId(null); setDocument(null); setCreating(true); setEditing(true); setDraft(emptyDraft); setError('');
  };

  const cancelEdit = () => {
    if (creating) { setCreating(false); setEditing(false); setSelectedId(items[0]?.id || null); }
    else if (document) { setDraft({ title: document.title, status: document.status, content_md: document.content_md }); setEditing(false); }
    setError('');
  };

  const save = async () => {
    if (saving || !draft.title.trim() || access !== 'owner') return;
    setSaving(true); setError('');
    try {
      const id = creating ? crypto.randomUUID() : document?.id;
      if (!id) throw new Error('Volvé a abrir el documento.');
      const saved = await request(creating ? '/api/future-developments' : `/api/future-developments/${id}`, {
        method: creating ? 'POST' : 'PUT',
        body: JSON.stringify({ id, ...draft, ...(!creating && document ? { version: document.version } : {}) }),
      }) as FutureDevelopmentDocument;
      const summary: FutureDevelopmentSummary = {
        id: saved.id, slug: saved.slug, title: saved.title, status: saved.status,
        version: saved.version, created_at: saved.created_at, updated_at: saved.updated_at,
      };
      setItems(previous => [summary, ...previous.filter(item => item.id !== saved.id)]);
      setDocument(saved); setSelectedId(saved.id); setCreating(false); setEditing(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo guardar el documento.'); }
    finally { setSaving(false); }
  };

  const download = () => {
    if (!document) return;
    const url = URL.createObjectURL(new Blob([document.content_md], { type: 'text/markdown;charset=utf-8' }));
    const link = window.document.createElement('a'); link.href = url; link.download = `${document.slug}.md`; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return <AdminLayout><main className="mx-auto w-full max-w-7xl p-4 text-slate-900 sm:p-6">
    {access === 'loading' ? <p className="py-12 text-center text-sm text-slate-500">Verificando acceso…</p> :
      access === 'denied' ? <div className="mx-auto mt-16 max-w-md rounded-xl border bg-white p-8 text-center"><h1 className="font-semibold">Desarrollos futuros</h1><p className="mt-2 text-sm text-slate-600">No tenés acceso a este módulo.</p></div> : <>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div><h1 className="text-xl font-semibold">Desarrollos futuros</h1><p className="mt-1 text-sm text-slate-500">Planes e ideas para más adelante</p></div>
          <button onClick={startNew} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"><FilePlus2 className="size-4"/>Nuevo documento</button>
        </div>
        {error && <p role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
        <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside aria-label="Documentos" className="self-start rounded-xl border border-slate-200 bg-white p-3 lg:sticky lg:top-4">
            <h2 className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Documentos</h2>
            {items.length === 0 ? <p className="px-2 py-3 text-sm text-slate-500">Todavía no hay documentos.</p> : <div className="space-y-1">{items.map(item => <button key={item.id} onClick={() => openDocument(item.id)} className={`w-full rounded-lg px-3 py-2 text-left text-sm ${selectedId === item.id && !creating ? 'bg-indigo-50 text-indigo-800' : 'hover:bg-slate-50'}`}><span className="block font-medium">{item.title}</span><span className="mt-1 block text-xs text-slate-500">{futureDevelopmentStatuses[item.status]}</span></button>)}</div>}
          </aside>
          <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
            {editing ? <div className="space-y-4">
              <div className="flex items-center justify-between gap-3"><h2 className="font-semibold">{creating ? 'Nuevo documento' : 'Editar documento'}</h2><button onClick={cancelEdit} aria-label="Cerrar editor" className="rounded p-2 hover:bg-slate-100"><X className="size-4"/></button></div>
              <label className="block text-sm font-medium">Título<input autoFocus value={draft.title} maxLength={180} onChange={event => setDraft(value => ({ ...value, title: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-indigo-500"/></label>
              <label className="block text-sm font-medium">Estado<select value={draft.status} onChange={event => setDraft(value => ({ ...value, status: event.target.value as FutureDevelopmentStatus }))} className="mt-1 block rounded-lg border border-slate-300 px-3 py-2">{Object.entries(futureDevelopmentStatuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
              <label className="block text-sm font-medium">Documento <span className="font-normal text-slate-500">(Markdown)</span><textarea value={draft.content_md} onChange={event => setDraft(value => ({ ...value, content_md: event.target.value }))} rows={22} maxLength={200000} spellCheck className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm leading-6 outline-indigo-500"/></label>
              <div className="flex justify-end gap-2"><button onClick={cancelEdit} className="rounded-lg border px-3 py-2 text-sm">Cancelar</button><button onClick={() => void save()} disabled={saving || draft.title.trim().length < 3} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"><Save className="size-4"/>{saving ? 'Guardando…' : 'Guardar'}</button></div>
            </div> : loadingDocument ? <p className="py-12 text-center text-sm text-slate-500">Cargando documento…</p> : document ? <>
              <div className="mb-6 flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4"><div><div className="flex items-center gap-2 text-xs text-indigo-700"><BookOpen className="size-4"/>{futureDevelopmentStatuses[document.status]}</div><h2 className="mt-2 text-lg font-semibold">{document.title}</h2><p className="mt-1 text-xs text-slate-500">Actualizado {new Date(document.updated_at).toLocaleDateString('es-AR')}</p></div><div className="flex gap-2"><button onClick={download} className="rounded-lg border px-3 py-2 text-sm hover:bg-slate-50">Descargar .md</button><button onClick={() => setEditing(true)} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-slate-50"><Pencil className="size-4"/>Editar</button></div></div>
              <MarkdownDocument content={document.content_md}/>
            </> : <div className="py-16 text-center text-sm text-slate-500">Seleccioná o creá un documento.</div>}
          </section>
        </div>
      </>}
  </main></AdminLayout>;
}

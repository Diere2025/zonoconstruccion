"use client";

import { useEffect, useMemo, useState } from 'react';
import { Copy, FilePlus2, Loader2, Save, Search, Trash2, WandSparkles } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { createAuthenticatedRequester } from '@/lib/authenticatedRequest';
import SearchableSelect from '@/components/ui/SearchableSelect';
import SearchableMultiSelect from '@/components/ui/SearchableMultiSelect';
import {
  ACCOUNT_OPTIONS, CAMPAIGN_OPTIONS, COMPARISON_OPTIONS, DEFAULT_PARAMETERS,
  FOCUS_OPTIONS, PROMPT_TEMPLATES, SOURCE_OPTIONS, buildMarketingPrompt,
  type PromptParameters,
} from '@/lib/marketingPromptBuilder';

type SavedPrompt = {
  id: string; name: string; template_key: string; parameters: PromptParameters;
  prompt_text: string; created_at: string; updated_at: string;
};

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100';
const labelClass = 'mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500';
const request = createAuthenticatedRequester(supabase);

function TextField({ label, value, onChange, placeholder, rows = 0 }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; rows?: number }) {
  return <label className="block"><span className={labelClass}>{label}</span>
    {rows > 0 ? <textarea rows={rows} className={inputClass} value={value} placeholder={placeholder} onChange={event => onChange(event.target.value)} />
      : <input className={inputClass} value={value} placeholder={placeholder} onChange={event => onChange(event.target.value)} />}
  </label>;
}

export default function MarketingPromptsPage() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [saved, setSaved] = useState<SavedPrompt[]>([]);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [templateKey, setTemplateKey] = useState('general');
  const [name, setName] = useState('Análisis general de campañas');
  const [params, setParams] = useState<PromptParameters>({ ...DEFAULT_PARAMETERS });
  const [preview, setPreview] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [savedQuery, setSavedQuery] = useState('');
  const patch = <K extends keyof PromptParameters>(key: K, value: PromptParameters[K]) => { setParams(current => ({ ...current, [key]: value })); setNotice(''); };
  const generated = useMemo(() => buildMarketingPrompt(params), [params]);
  const shownPrompts = useMemo(() => saved.filter(row => row.name.toLowerCase().includes(savedQuery.toLowerCase())), [saved, savedQuery]);

  useEffect(() => {
    let mounted = true;
    request('/api/admin/marketing-prompts').then(result => {
      if (!mounted) return;
      setSaved(result.prompts || []);
      setAllowed(true);
    }).catch(cause => {
      if (!mounted) return;
      setAllowed(false);
      setError(cause instanceof Error ? cause.message : 'No se pudo abrir el módulo privado.');
    });
    return () => { mounted = false; };
  }, []);

  const chooseTemplate = (key: string) => {
    const template = PROMPT_TEMPLATES.find(item => item.key === key);
    if (!template) return;
    setParams({ ...DEFAULT_PARAMETERS, ...template.parameters });
    setTemplateKey(key); setSavedId(null); setName(`Análisis ${template.name}`); setPreview(''); setNotice(''); setError('');
  };
  const openSaved = (id: string) => {
    const row = saved.find(item => item.id === id);
    if (!row) return;
    setParams({ ...DEFAULT_PARAMETERS, ...row.parameters }); setTemplateKey(row.template_key);
    setName(row.name); setSavedId(row.id); setPreview(row.prompt_text); setNotice('Prompt guardado cargado para editar.'); setError('');
  };
  const save = async (asNew: boolean) => {
    if (!name.trim()) { setError('Poné un nombre para guardar este prompt.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await request('/api/admin/marketing-prompts', { method: 'POST', body: JSON.stringify({ id: asNew ? undefined : savedId, name: name.trim(), templateKey, parameters: params }) });
      setSaved(current => [result.prompt, ...current.filter(item => item.id !== result.prompt.id)]);
      setSavedId(result.prompt.id); setPreview(result.prompt.prompt_text);
      setNotice(asNew || !savedId ? 'Prompt guardado con nombre en la base de datos.' : 'Cambios guardados en la base de datos.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo guardar.'); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    if (!savedId || !window.confirm(`¿Eliminar “${name}” de tus prompts guardados?`)) return;
    setBusy(true); setError('');
    try {
      await request(`/api/admin/marketing-prompts?id=${encodeURIComponent(savedId)}`, { method: 'DELETE' });
      setSaved(current => current.filter(item => item.id !== savedId)); setSavedId(null);
      setNotice('Prompt eliminado de la base de datos. La configuración actual sigue abierta.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo eliminar.'); }
    finally { setBusy(false); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(generated); setPreview(generated); setNotice('Prompt copiado con los parámetros actuales. Ya podés pegarlo en otro modelo.'); }
    catch { setError('No se pudo copiar automáticamente. Seleccioná el texto de la vista previa.'); }
  };

  if (allowed === null) return <div className="flex items-center gap-2 p-8 text-sm text-slate-600"><Loader2 className="h-5 w-5 animate-spin" /> Verificando acceso privado…</div>;
  if (!allowed) return <div role="alert" className="m-6 rounded-xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">{error || 'Acceso denegado.'}</div>;

  return <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 pb-24 text-slate-900 sm:px-6">
    <header className="rounded-2xl bg-gradient-to-br from-slate-950 via-blue-950 to-blue-800 p-6 text-white shadow-sm">
      <span className="text-xs font-bold uppercase tracking-[0.2em] text-blue-200">Dirección general · privado</span>
      <h1 className="mt-2 text-2xl font-bold sm:text-3xl">Prompts de rentabilidad de campañas</h1>
      <p className="mt-2 max-w-3xl text-sm text-blue-100">Elegí una plantilla, completá los parámetros y copiá el análisis listo para otro modelo. Podés guardar distintas versiones con nombre.</p>
    </header>

    {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}

    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <main className="space-y-5">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">1. Elegí un punto de partida</h2>
          <SearchableSelect label="Plantilla predefinida" value={templateKey} options={PROMPT_TEMPLATES.map(item => ({ value: item.key, label: item.name }))} onChange={chooseTemplate} clearOnSearch={false} />
          <p className="mt-2 text-xs text-slate-500">{PROMPT_TEMPLATES.find(item => item.key === templateKey)?.description || 'Configuración personalizada.'} Podés modificar todos los campos sin alterar la plantilla original.</p>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">2. Definí el análisis</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div><SearchableMultiSelect label="Campañas / productos" value={params.campaigns} options={CAMPAIGN_OPTIONS} onChange={value => patch('campaigns', value)} /><p className="mt-1 text-xs text-slate-500">Podés combinar varias; “Todas” reemplaza la selección individual.</p></div>
            <div><SearchableMultiSelect label="Cuentas Meta" value={params.accounts} options={ACCOUNT_OPTIONS} onChange={value => patch('accounts', value)} /><p className="mt-1 text-xs text-slate-500">Delimita las cuentas publicitarias a consultar.</p></div>
            <div><SearchableMultiSelect label="Fuentes de datos" value={params.sources} options={SOURCE_OPTIONS} onChange={value => patch('sources', value)} /><p className="mt-1 text-xs text-slate-500">Indica qué sistemas debe cruzar el otro modelo.</p></div>
            <div><SearchableMultiSelect label="Qué investigar" value={params.focus} options={FOCUS_OPTIONS} onChange={value => patch('focus', value)} /><p className="mt-1 text-xs text-slate-500">Marca las decisiones en las que querés profundizar.</p></div>
            <div className="md:col-span-2"><SearchableMultiSelect label="Comparaciones" value={params.comparisons} options={COMPARISON_OPTIONS} onChange={value => patch('comparisons', value)} /><p className="mt-1 text-xs text-slate-500">Ayuda a comparar períodos justos y medir cambios que ya hiciste.</p></div>
            <div className="md:col-span-2"><TextField label="Otras campañas (nombre o ID)" value={params.campaignsExtra} onChange={value => patch('campaignsExtra', value)} placeholder="Para campañas nuevas que todavía no figuran en la lista" /></div>
            <div className="md:col-span-2"><TextField label="Objetivo de negocio" value={params.objective} onChange={value => patch('objective', value)} rows={2} /></div>
            <label><span className={labelClass}>Días completos principales</span><input type="number" min="3" max="365" value={params.periodDays} onChange={event => { const days = Math.max(3, Math.min(365, Number(event.target.value) || 3)); setParams(current => ({ ...current, periodDays: days, recentDays: Math.min(current.recentDays, days) })); }} className={inputClass} /><span className="mt-1 block text-xs text-slate-500">Base para calcular costos, ventas y margen.</span></label>
            <label><span className={labelClass}>Días recientes</span><input type="number" min="1" max={params.periodDays} value={params.recentDays} onChange={event => patch('recentDays', Math.max(1, Math.min(params.periodDays, Number(event.target.value) || 1)))} className={inputClass} /><span className="mt-1 block text-xs text-slate-500">Señal de cambios nuevos, separada de la base principal.</span></label>
            <label><span className={labelClass}>Desde (opcional)</span><input type="date" value={params.fromDate} onChange={event => patch('fromDate', event.target.value)} className={inputClass} /><span className="mt-1 block text-xs text-slate-500">Usá ambas fechas para un análisis histórico.</span></label>
            <label><span className={labelClass}>Hasta (opcional)</span><input type="date" min={params.fromDate || undefined} value={params.toDate} onChange={event => patch('toDate', event.target.value)} className={inputClass} /><span className="mt-1 block text-xs text-slate-500">Sin fechas se usan los días completos indicados arriba.</span></label>
            <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-3 text-sm"><input type="checkbox" checked={params.includeToday} onChange={event => patch('includeToday', event.target.checked)} /> Incluir hoy como parcial</label>
            <TextField label="Aumento máximo diario de pauta (USD)" value={params.maxAdditionalUsd} onChange={value => patch('maxAdditionalUsd', value)} placeholder="Opcional; US$ adicionales por día" />
            <div className="md:col-span-2"><TextField label="Meta de margen o ganancia" value={params.marginGoal} onChange={value => patch('marginGoal', value)} placeholder="Ej.: $5 M de contribución semanal" /></div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">3. Costos, contexto y límites</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <TextField label="Tipo de cambio publicitario" value={params.usdArsRule} onChange={value => patch('usdArsRule', value)} rows={2} />
            <TextField label="Criterio de costos e IVA" value={params.costRule} onChange={value => patch('costRule', value)} rows={2} />
            <TextField label="Flete y gastos variables" value={params.freightRule} onChange={value => patch('freightRule', value)} rows={2} />
            <TextField label="Aporte a deuda" value={params.debtRule} onChange={value => patch('debtRule', value)} rows={2} />
            <TextField label="Cambios recientes (con fechas)" value={params.recentChanges} onChange={value => patch('recentChanges', value)} rows={3} placeholder="Ej.: 30/9 subí Cooper de US$..." />
            <TextField label="Capacidad y restricciones" value={params.operationalLimits} onChange={value => patch('operationalLimits', value)} rows={3} />
            <TextField label="Informe anterior / enlace" value={params.previousReport} onChange={value => patch('previousReport', value)} rows={2} />
            <TextField label="Instrucciones adicionales" value={params.extraInstructions} onChange={value => patch('extraInstructions', value)} rows={3} />
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold">4. Generá y copiá</h2>
          <div className="mb-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => { setPreview(generated); setNotice('Prompt generado con los parámetros actuales.'); }} className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800"><WandSparkles className="h-4 w-4" /> Generar prompt</button>
            <button type="button" onClick={() => void copy()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold hover:bg-slate-50"><Copy className="h-4 w-4" /> Copiar prompt</button>
          </div>
          {preview && preview !== generated && <p className="mb-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">Modificaste campos desde la última generación. Tocá “Generar prompt” para actualizar la vista previa; al guardar se usará la versión nueva.</p>}
          <textarea aria-label="Vista previa del prompt" readOnly value={preview || generated} rows={19} className={`${inputClass} font-mono text-xs leading-5`} />
          <p className="mt-2 text-xs text-slate-500">Este módulo genera instrucciones; el análisis se ejecuta en el modelo donde pegues el texto.</p>
        </section>
      </main>

      <aside className="space-y-5 xl:sticky xl:top-6 xl:self-start">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold">Guardar en la base de datos</h2>
          <TextField label="Nombre del prompt" value={name} onChange={setName} placeholder="Ej.: Cooper · semana 40" />
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => void save(!savedId)} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-50"><Save className="h-4 w-4" /> {savedId ? 'Guardar cambios' : 'Guardar'}</button>
            <button type="button" disabled={busy} onClick={() => void save(true)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold disabled:opacity-50"><FilePlus2 className="h-4 w-4" /> Guardar copia</button>
            {savedId && <button type="button" disabled={busy} onClick={() => void remove()} className="inline-flex items-center gap-2 rounded-xl border border-rose-200 px-3 py-2.5 text-sm font-semibold text-rose-700 disabled:opacity-50"><Trash2 className="h-4 w-4" /> Eliminar</button>}
          </div>
          {busy && <p className="mt-2 flex items-center gap-2 text-xs text-slate-500"><Loader2 className="h-3 w-3 animate-spin" /> Guardando…</p>}
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold">Mis prompts guardados</h2>
          <div className="relative mb-3"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input value={savedQuery} onChange={event => setSavedQuery(event.target.value)} placeholder="Buscar por nombre…" aria-label="Buscar prompts guardados" className={`${inputClass} pl-9`} /></div>
          <div className="max-h-96 space-y-2 overflow-y-auto">
            {shownPrompts.map(row => <button key={row.id} type="button" onClick={() => openSaved(row.id)} className={`block w-full rounded-xl border p-3 text-left ${savedId === row.id ? 'border-blue-300 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'}`}>
              <span className="block truncate text-sm font-semibold">{row.name}</span>
              <span className="mt-1 block text-xs text-slate-500">{new Date(row.updated_at).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}</span>
            </button>)}
            {!shownPrompts.length && <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500">{saved.length ? 'Sin coincidencias.' : 'Todavía no guardaste prompts.'}</p>}
          </div>
        </section>
      </aside>
    </div>
  </div>;
}

'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CalendarDays, Loader2, Plus, RefreshCw } from 'lucide-react';
import VisitForm, { buttonStyle, inputStyle, primaryStyle } from './VisitForm';
import VisitDateInput from './VisitDateInput';
import VisitDetail from './VisitDetail';
import VisitsCalendar, { type Slot } from './VisitsCalendar';
import VisitsIntegrations from './VisitsIntegrations';
import { visitsRequest } from '@/lib/visits/client';
import { dateTimeLabel, eventLabels, localDate, lossReasons, money, outcomes, reasonLabel, visitCode, type Appointment, type VisitCase, type VisitsMe } from '@/lib/visits/model';
interface List { visits: VisitCase[]; total: number; summary: { appointments: number; opportunities: number; won: number; pending: number; lost: number; conversion: number; reasons: Record<string, number> } }
const views = { all: 'Todas', visited: 'Visitas realizadas', pending: 'En seguimiento', won: 'Ventas concretadas', lost: 'Ventas no concretadas', overdue: 'Seguimientos vencidos', unassigned: 'Sin instalador', uncontacted: 'Sin contactar', needs_quote: 'Falta presupuesto' };
export default function VisitsWorkspace({ me }: { me: VisitsMe }) {
  const [defaultFee,setDefaultFee]=useState(me.default_visit_fee ?? 50000);
  const router = useRouter(), params = useSearchParams();
  const selected = params.get('case');
  const mode = params.get('mode') || (me.commercial ? 'list' : 'agenda');
  const [list, setList] = useState<List | null>(null), [error, setError] = useState(''), [loadedKey, setLoadedKey] = useState(''), [creating, setCreating] = useState(false);
  const [search, setSearch] = useState(params.get('search') || '');
  const [notifications, setNotifications] = useState<{ id: string; case_id: string; number: number; customer_name: string; kind: string }[]>([]);
  const [agenda, setAgenda] = useState<{ appointments: Appointment[]; visits: VisitCase[]; unplanned?: VisitCase[]; slots?: Slot[] }>({ appointments: [], visits: [] });
  const operation = useRef<{ signature: string; key: string } | null>(null);
  const person = (id: string | null) => me.people.find(p => p.id === id)?.name || (id ? 'Usuario anterior' : 'Sin asignar');
  const navigate = useCallback((updates: Record<string, string>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(updates)) { if (value) next.set(key, value); else next.delete(key); }
    router.replace(`/visitas${next.size ? `?${next}` : ''}`, { scroll: false });
  }, [router, params]);
  useEffect(() => {
    if (selected) return;
    const timer = setTimeout(() => { if (search !== (params.get('search') || '')) navigate({ search, page: '' }); }, 350);
    return () => clearTimeout(timer);
  }, [search, selected, params, navigate]);
  const query = params.toString();
  const refreshNotifications = useCallback(() => { void visitsRequest('/api/visits/notifications').then(setNotifications).catch(() => {}); }, []);
  useEffect(() => { refreshNotifications(); }, [refreshNotifications]);
  const [revision, setRevision] = useState(0);
  const month = params.get('month') || localDate(new Date().toISOString()).slice(0,7);
  const requestKey = `${mode}:${query}:${revision}`;
  const loading = loadedKey !== requestKey;
  useEffect(() => {
    if (selected) return;
    let current = true;
    const filter = new URLSearchParams(query); filter.delete('case'); filter.delete('mode');
    if (mode === 'agenda') { const [year, num] = month.split('-').map(Number); filter.set('from', `${month}-01`); filter.set('to', `${month}-${new Date(Date.UTC(year,num,0)).getUTCDate()}`); }
    const endpoint = mode === 'agenda' ? 'agenda' : 'list';
    void visitsRequest(`/api/visits/${endpoint}?${filter}`).then(value => { if (!current) return; setError(''); if (mode === 'agenda') setAgenda(value); else setList(value); }).catch(e => { if (current) setError(e.message); }).finally(() => { if (current) setLoadedKey(requestKey); });
    return () => { current = false; };
  }, [query, mode, selected, requestKey, month]);
  const refresh = () => { setRevision(n => n + 1); refreshNotifications(); };
  async function create(data: Record<string, unknown>) {
    const payload = { command: 'create', id: null, version: null, data };
    const signature = JSON.stringify(payload);
    if (operation.current?.signature !== signature) operation.current = { signature, key: crypto.randomUUID() };
    const result = await visitsRequest('/api/visits/command', { method: 'POST', body: JSON.stringify({ ...payload, key: operation.current.key }) });
    operation.current = null; setCreating(false); navigate({ case: result.id }); refreshNotifications();
  }
  const selectFilter = (label: string, name: string, options: Record<string, string>) => <label className="min-w-36 flex-1 space-y-1 text-xs text-slate-600">{label}<select className={inputStyle} value={params.get(name) || ''} onChange={e => navigate({ [name]: e.target.value, page: '' })}>{Object.entries(options).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>;
  if (selected) return <VisitDetail key={`${me.id}:${selected}`} id={selected} me={me} back={() => { navigate({ case: '' }); refresh(); }} changed={refreshNotifications} />;
  const s = !loading ? list?.summary : undefined;
  const page = Number(params.get('page') || 0);
  const displayedAppointments = agenda.appointments.filter(a => !params.get('installer_id') || agenda.visits.find(v => v.id === a.case_id)?.installer_id === params.get('installer_id'));
  return <div className="space-y-4 pb-8">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold">Seguimiento de visitas</h1><p className="mt-1 text-sm text-slate-500">{me.commercial ? 'Visitas, presupuestos y resultado comercial.' : 'Tus visitas asignadas y contactos pendientes.'}</p></div><div className="flex gap-2"><button className={buttonStyle} onClick={refresh} disabled={loading}><RefreshCw size={16} />Actualizar</button>{me.commercial && <button className={primaryStyle} onClick={() => setCreating(true)}><Plus size={16} />Nueva visita</button>}</div></header>
    {!!notifications.length && <details className="rounded-lg border border-indigo-200 bg-indigo-50 p-3"><summary className="cursor-pointer text-sm font-semibold text-indigo-900">{notifications.length} novedades en tus casos</summary><div className="mt-2 flex flex-wrap gap-2">{notifications.map(n => <button key={n.id} className={buttonStyle} onClick={() => navigate({ case: n.case_id })}>{visitCode(n.number)} · {n.customer_name} · {eventLabels[n.kind] || 'Actualización'}</button>)}</div></details>}
    <nav className="flex gap-2" aria-label="Vista del módulo"><button className={mode === 'list' ? primaryStyle : buttonStyle} onClick={() => navigate({ mode: 'list', page: '' })}>Bandeja de seguimiento</button><button className={mode === 'agenda' ? primaryStyle : buttonStyle} onClick={() => navigate({ mode: 'agenda' })}><CalendarDays size={16} />{me.commercial ? 'Agenda compartida' : 'Mi agenda'}</button></nav>
    {mode === 'list' && <>
      {s && <section aria-label="Resumen del período filtrado" className="grid grid-cols-2 gap-3 md:grid-cols-5">{[['Visitas realizadas', s.appointments], ['Ventas concretadas', s.won], ['En seguimiento', s.pending], ['No concretadas', s.lost], ['Conversión', `${s.conversion}%`]].map(([label, value]) => <div key={label} className="rounded-lg border bg-white p-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-xl font-bold">{value}</p></div>)}<p className="col-span-2 text-xs text-slate-500 md:col-span-5">Conversión sobre {s.opportunities} oportunidades con visita realizada, incluyendo las pendientes. Las revisitas no duplican una venta.</p></section>}
      <div className="flex flex-wrap gap-2" aria-label="Filtros rápidos">{Object.entries(views).map(([id, label]) => <button key={id} className={`min-h-10 rounded-full border px-3 py-1 text-xs font-semibold ${(params.get('view') || 'all') === id ? 'border-indigo-600 bg-indigo-50 text-indigo-800' : 'border-slate-200 bg-white text-slate-600'}`} onClick={() => navigate({ view: id === 'all' ? '' : id, page: '' })}>{label}</button>)}</div>
    </>}
    <section className="flex flex-wrap items-end gap-3 rounded-lg border bg-white p-3" aria-label="Filtrar visitas">
      {mode === 'list' && <label className="min-w-52 flex-[2] space-y-1 text-xs text-slate-600">Buscar cliente, teléfono, localidad o código<input className={inputStyle} type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar…" /></label>}
      {me.commercial && selectFilter('Vendedor/a', 'seller_id', { '': 'Todas', ...Object.fromEntries(me.people.filter(p => p.roles.some(r => ['seller', 'admin'].includes(r))).map(p => [p.id, p.name])) })}
      {selectFilter('Instalador', 'installer_id', { '': me.commercial ? 'Todos' : 'Mis casos', ...Object.fromEntries(me.people.filter(p => p.roles.includes('instalador')).map(p => [p.id, p.name])) })}
      {mode === 'list' && selectFilter('Kit', 'kit_id', { '': 'Todos los kits', ...Object.fromEntries(me.kits.map(k => [k.id, k.name])) })}
      {mode === 'list' && ['from', 'to'].map(key => <VisitDateInput key={key} label={key==='from'?'Desde · visita realizada':'Hasta · visita realizada'} value={params.get(key)||''} onChange={value=>navigate({[key]:value,page:''})}/>)}
      {mode === 'agenda' && <label className="text-sm">Mes<input className={inputStyle} type="month" value={month} onChange={e => navigate({ month: e.target.value })} /></label>}
      <button className={buttonStyle} onClick={() => { setSearch(''); router.replace(`/visitas?mode=${mode}`); }}>Limpiar</button>
    </section>
    {!loading && error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {loading && <p role="status" className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" />Cargando visitas…</p>}
    {!loading && !error && mode === 'list' && list && <>
      <div className="overflow-x-auto rounded-lg border bg-white"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr>{['Cliente / obra', 'Kit', 'Responsables', 'Última visita', 'Presupuesto', 'Resultado / motivo', 'Próxima acción'].map(title => <th key={title} className="whitespace-nowrap px-3 py-3">{title}</th>)}</tr></thead><tbody>{list.visits.map(v => <tr key={v.id} className="border-t align-top hover:bg-slate-50"><td className="min-w-44 px-3 py-3"><button className="text-left font-semibold text-indigo-700 hover:underline" onClick={() => navigate({ case: v.id })}>{v.customer_name}</button><p className="text-xs text-slate-500">{visitCode(v.number)} · {v.locality}</p></td><td className="min-w-40 max-w-56 px-3 py-3"><p>{v.final_kit?.name || v.interest_kit.name}</p><p className="text-xs text-slate-500">{v.final_kit ? 'Seleccionado' : 'De interés · final pendiente'}</p></td><td className="min-w-36 px-3 py-3"><p>{person(v.seller_id)}</p><p className="text-xs text-slate-500">{person(v.installer_id)}</p></td><td className="min-w-28 px-3 py-3">{v.last_visit_at ? dateTimeLabel(v.last_visit_at) : 'Sin realizar'}{v.visit_count > 1 && <p className="text-xs text-slate-500">{v.visit_count} visitas</p>}</td><td className="whitespace-nowrap px-3 py-3">{money(v.quote_amount)}</td><td className="min-w-44 px-3 py-3"><strong className={`text-xs ${v.outcome === 'won' ? 'text-emerald-700' : v.outcome === 'lost' ? 'text-rose-700' : 'text-amber-800'}`}>{outcomes[v.outcome]}</strong>{v.outcome_reason && <p className="mt-1 text-xs text-slate-600">{reasonLabel(v.outcome, v.outcome_reason)}</p>}{v.outcome_note && <p className="mt-1 max-w-56 text-xs text-slate-500 line-clamp-2" title={v.outcome_note}>{v.outcome_note}</p>}</td><td className="min-w-40 px-3 py-3">{v.outcome === 'pending' ? <><p className="text-xs">{v.next_action}</p><p className={`mt-1 text-xs ${v.next_at && new Date(v.next_at) < new Date() ? 'font-semibold text-amber-800' : 'text-slate-500'}`}>{person(v.next_owner_id)} · {dateTimeLabel(v.next_at)}</p></> : '—'}</td></tr>)}</tbody></table>{!list.visits.length && <p className="p-8 text-center text-sm text-slate-500">No hay visitas para estos filtros.</p>}</div>
      <div className="flex items-center justify-between gap-2 text-sm text-slate-500"><span>{list.total} casos · página {page + 1}</span><div className="flex gap-2"><button className={buttonStyle} disabled={!page || loading} onClick={() => navigate({ page: String(page - 1) })}>Anterior</button><button className={buttonStyle} disabled={(page + 1) * 50 >= list.total || loading} onClick={() => navigate({ page: String(page + 1) })}>Siguiente</button></div></div>
      {s && Object.keys(s.reasons).length > 0 && <section className="rounded-lg border bg-white p-4"><h2 className="text-sm font-bold">Motivos de ventas no concretadas</h2><div className="mt-3 flex flex-wrap gap-3">{Object.entries(s.reasons).map(([reason, count]) => <span key={reason} className="rounded bg-rose-50 px-3 py-2 text-sm text-rose-800">{lossReasons[reason as keyof typeof lossReasons]}: <strong>{count}</strong></span>)}</div></section>}
    </>}
    {!loading && !error && mode === 'agenda' && <VisitsCalendar key={month} month={month} appointments={displayedAppointments} visits={agenda.visits} unplanned={agenda.unplanned} slots={(agenda.slots || []).filter(s => !params.get('installer_id') || s.installer_id === params.get('installer_id'))} me={me} open={id => navigate({ case: id })} refresh={refresh} />}
    {me.administrator && <VisitsIntegrations onFeeSaved={setDefaultFee} />}
    {creating && <VisitForm action="create" me={{...me,default_visit_fee:defaultFee}} save={create} close={() => setCreating(false)} />}
  </div>;
}

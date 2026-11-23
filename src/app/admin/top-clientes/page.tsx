'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, ChevronRight, Loader2, Phone, Users, X } from 'lucide-react';
import ReportDateRangePicker, { displayReportDate } from '@/components/ui/ReportDateRangePicker';
import { supabase } from '@/lib/supabase';
import { treasuryToday } from '@/lib/treasuryTransactionTime';

type Status = 'pendiente' | 'contactado' | 'sin_respuesta' | 'cerrado';
type Person = { id: string; name: string | null };
type RankingRow = {
  client_id: string; name: string | null; rank: number; orders: number; units: number; sales: number;
  seller: string | null; seller_id: string | null; locality: string | null; days: number;
  last_purchase: string; inactive_days: number; followup: Status | null; followup_seller_id: string | null;
};
type SellerRow = { seller_id: string; seller: string; clients: number; repeat_clients: number; orders: number; sales: number };
type Product = { product: string; category: string; units: number; sales: number; orders: number };
type Profile = Person & {
  phone_primary: string | null; phone_secondary: string | null; email: string | null;
  status: Status | null; note: string | null; followup_seller_id: string | null;
  updated_at: string | null; products: Product[];
};
type Report = { ranking: RankingRow[]; total: number; sellers: SellerRow[]; seller_options: Person[]; categories: string[]; profile: Profile | null };

const statusLabels: Record<Status, string> = {
  pendiente: 'Pendiente', contactado: 'Contactado', sin_respuesta: 'Sin respuesta', cerrado: 'Cerrado',
};
const amount = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
const count = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
const dateTime = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
const input = 'min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900';
const panel = 'rounded-2xl border border-slate-200 bg-white p-4 sm:p-5';
const headingCell = 'px-3 py-2.5 text-left font-semibold';
const dataCell = 'px-3 py-3';

export default function TopClientesPage() {
  const today = treasuryToday();
  const [period, setPeriod] = useState(() => ({ from: `${today.slice(0, 4)}-01-01`, to: today }));
  const [history, setHistory] = useState(false);
  const [channel, setChannel] = useState('retail');
  const [seller, setSeller] = useState('');
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState('amount');
  const [view, setView] = useState<'ranking' | 'recontact' | 'sellers'>('ranking');
  const [days, setDays] = useState(90);
  const [followup, setFollowup] = useState('');
  const [responsible, setResponsible] = useState('');
  const [report, setReport] = useState<Report | null>(null);
  const [selected, setSelected] = useState('');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [error, setError] = useState('');
  const [profileError, setProfileError] = useState('');
  const [saved, setSaved] = useState('');
  const [saving, setSaving] = useState(false);
  const [reload, setReload] = useState(0);
  const [search, setSearch] = useState('');
  const profilePanel = useRef<HTMLElement>(null);

  const minDays = view === 'recontact' ? days : 0;
  const followupFilter = view === 'recontact' ? followup : '';
  const responsibleFilter = view === 'recontact' ? responsible : '';
  const showSellers = view === 'sellers';
  const query = useMemo(() => ({
    p_from: period.from, p_to: period.to, p_history: history, p_channel: channel, p_seller: seller || null,
    p_category: category || null, p_min_days: minDays, p_sort: sort, p_followup: followupFilter || null,
    p_responsible: responsibleFilter || null, p_sellers: showSellers,
  }), [period.from, period.to, history, channel, seller, category, minDays, sort, followupFilter, responsibleFilter, showSellers]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setSelected('');
    void (async () => {
      const { data, error: failed } = await supabase.rpc('top_customer_report', query).abortSignal(controller.signal);
      if (controller.signal.aborted) return;
      setReport(failed ? null : data as Report);
      setError(failed?.message || '');
      setLoading(false);
    })();
    return () => controller.abort();
  }, [query, reload]);

  useEffect(() => {
    setProfile(null);
    setProfileError('');
    setSaved('');
    if (!selected) {
      setLoadingProfile(false);
      return;
    }
    if (window.matchMedia('(max-width: 1279px)').matches) profilePanel.current?.scrollIntoView({ block: 'start' });
    const controller = new AbortController();
    setLoadingProfile(true);
    void (async () => {
      const { data, error: failed } = await supabase.rpc('top_customer_report', { ...query, p_client: selected }).abortSignal(controller.signal);
      if (controller.signal.aborted) return;
      setProfileError(failed?.message || '');
      setProfile(failed ? null : (data as Report).profile);
      setLoadingProfile(false);
    })();
    return () => controller.abort();
  }, [selected, query]);

  const selectedRow = report?.ranking.find(row => row.client_id === selected);
  const sellerOptions = report?.seller_options ?? [];
  const ranking = report?.ranking.filter(row =>
    (row.name || '').toLocaleLowerCase('es-AR').includes(search.trim().toLocaleLowerCase('es-AR')),
  ) ?? [];

  async function saveFollowup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile || saving) return;
    const form = new FormData(event.currentTarget);
    const responsible = String(form.get('seller') || '') || null;
    const status = String(form.get('status')) as Status;
    setSaving(true);
    setProfileError('');
    setSaved('');
    try {
      const result = await supabase.rpc('save_customer_recontact', {
        p_client: profile.id, p_seller: responsible, p_status: status, p_note: String(form.get('note') || ''),
      });
      if (result.error) throw result.error;
      const stored = result.data as { updated_at: string; note: string };
      setProfile(current => current?.id === profile.id ? { ...current, status, note: stored.note,
        followup_seller_id: responsible, updated_at: stored.updated_at } : current);
      setReport(current => current ? { ...current, ranking: current.ranking.map(row => row.client_id === profile.id
        ? { ...row, followup: status, followup_seller_id: responsible } : row) } : current);
      setSaved('Seguimiento guardado.');
    } catch (e) {
      setProfileError((e as { message?: string })?.message || 'No se pudo guardar el seguimiento.');
    } finally {
      setSaving(false);
    }
  }

  return <div className="mx-auto max-w-[1500px] space-y-5 pb-12 text-slate-900">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Top clientes</h1>
        <p className="mt-1 text-sm text-slate-600">Compras entregadas, productos y seguimiento comercial por vendedor.</p>
      </div>
      <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1" aria-label="Vista del informe">
        {([['ranking', 'Ranking'], ['recontact', 'Para recontactar'], ['sellers', 'Vendedores']] as const).map(([key, label]) =>
          <button type="button" key={key} aria-pressed={view === key} onClick={() => { setView(key); setSelected(''); }}
            className={`rounded-lg px-3 py-2 text-sm font-semibold ${view === key ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-white'}`}>
            {label}
          </button>)}
      </div>
    </header>

    <section className={panel} aria-label="Filtros">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1 text-sm font-medium">
          <ReportDateRangePicker from={period.from} to={period.to} includeCurrentYear
            onChange={(from, to) => setPeriod({ from, to })} />
        </div>
        <label className="space-y-1 text-sm font-medium"><span>Canal</span>
          <select className={input} value={channel} onChange={e => setChannel(e.target.value)}>
            <option value="retail">Minorista</option><option value="wholesale">Mayorista</option><option value="all">Todos los canales</option>
          </select>
        </label>
        <label className="space-y-1 text-sm font-medium"><span>Vendedor de la venta</span>
          <select className={input} value={seller} onChange={e => setSeller(e.target.value)}>
            <option value="">Todos los vendedores</option>
            {sellerOptions.map(item => <option key={item.id} value={item.id}>{item.name || 'Sin nombre'}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-sm font-medium"><span>Categoría de producto</span>
          <select className={input} value={category} onChange={e => setCategory(e.target.value)}>
            <option value="">Todas las categorías</option>
            {report?.categories.map(item => <option key={item}>{item}</option>)}
          </select>
        </label>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={history} onChange={e => setHistory(e.target.checked)} /> Incluir pedidos históricos
        </label>
        {history && <button type="button" onClick={() => { setPeriod({ from: '2020-01-09', to: '2025-12-31' }); setSort('orders'); }}
          className="text-sm font-semibold text-blue-700 underline">Ver del 09/01/2020 al 31/12/2025</button>}
        {view !== 'sellers' && <label className="flex items-center gap-2 text-sm">Ordenar por
          <select className={`${input} w-auto`} value={sort} onChange={e => setSort(e.target.value)}>
            <option value="amount">Monto comprado</option><option value="orders">Pedidos</option><option value="units">Unidades</option>
          </select>
        </label>}
        {view === 'recontact' && <>
          <label className="flex items-center gap-2 text-sm">Sin comprar
            <select className={`${input} w-auto`} value={days} onChange={e => setDays(Number(e.target.value))}>
              {[30, 60, 90, 180, 365].map(value => <option key={value} value={value}>{value} días o más</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">Seguimiento
            <select className={`${input} w-auto`} value={followup} onChange={e => setFollowup(e.target.value)}>
              <option value="">Todos los estados</option><option value="sin_gestion">Sin gestión</option>
              {Object.entries(statusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">Responsable
            <select className={`${input} w-auto`} value={responsible} onChange={e => setResponsible(e.target.value)}>
              <option value="">Todos los responsables</option>
              {sellerOptions.map(item => <option key={item.id} value={item.id}>{item.name || 'Sin nombre'}</option>)}
            </select>
          </label>
        </>}
      </div>
      <p className="mt-3 text-xs text-slate-500">
        {category ? 'El monto por categoría suma las unidades por su precio de venta en las líneas de esa categoría.'
          : 'El ranking total usa el importe registrado de cada pedido entregado.'}
        {view === 'recontact' && ' La inactividad se mide hasta hoy, en todas las categorías y con cualquier vendedor.'}
        {history && ' Los montos históricos están en pesos nominales. Los productos sin categoría reconocida se agrupan en «Sin categoría».'}
      </p>
    </section>

    {loading ? <p role="status" className={`${panel} flex items-center gap-2 text-sm`}><Loader2 className="h-4 w-4 animate-spin"/> Cargando compras…</p>
      : error ? <div role="alert" className={`${panel} text-sm text-red-700`}>
        <p>{error}</p><button className="mt-2 font-semibold underline" onClick={() => setReload(value => value + 1)}>Reintentar</button>
      </div>
      : view === 'sellers' ? <section className={panel}>
        <h2 className="mb-3 flex items-center gap-2 text-base font-bold"><Users className="h-5 w-5"/> Resultados por vendedor</h2>
        <p className="mb-3 text-sm text-slate-600">Cada pedido se atribuye al vendedor de la venta. Un cliente puede comprar a más de un vendedor.</p>
        {report?.sellers.length ? <div className="overflow-x-auto">
          <table className="w-full whitespace-nowrap text-sm">
            <thead className="bg-slate-50 text-slate-600"><tr>{['Vendedor', 'Clientes', 'Con dos o más pedidos', 'Pedidos', 'Monto comprado'].map(label => <th scope="col" key={label} className={headingCell}>{label}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">{report.sellers.map(row => <tr key={row.seller_id}>
              <td className={dataCell}><button className="font-semibold text-blue-700 hover:underline" onClick={() => { setSeller(row.seller_id); setView('ranking'); }}>{row.seller}</button></td>
              <td className={dataCell}>{count.format(row.clients)}</td><td className={dataCell}>{count.format(row.repeat_clients)}</td>
              <td className={dataCell}>{count.format(row.orders)}</td><td className={dataCell}>{amount.format(row.sales)}</td>
            </tr>)}</tbody>
          </table>
        </div> : <p className="text-sm text-slate-500">No hay ventas por vendedor para estos filtros.</p>}
      </section>
      : <div className={`grid items-start gap-4 ${selected ? 'xl:grid-cols-[minmax(0,2fr)_minmax(315px,1fr)]' : ''}`}>
        <section className={`${panel} order-2 xl:order-1`}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-base font-bold"><BarChart3 className="h-5 w-5"/>
                {view === 'recontact' ? 'Clientes para recontactar' : category ? `Top clientes · ${category}` : 'Ranking total'}</h2>
              <p className="mt-1 text-xs text-slate-500">{count.format(report?.total || 0)} clientes para estos filtros{(report?.total || 0) > 100 ? ' · Se muestran los primeros 100' : ''}</p>
            </div>
            <input className={`${input} max-w-56`} type="search" aria-label="Buscar en el ranking" placeholder="Buscar en el ranking"
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          {ranking.length ? <div className="overflow-x-auto">
            <table className="w-full whitespace-nowrap text-sm">
              <thead className="bg-slate-50 text-slate-600"><tr>{['#', 'Cliente', 'Monto', 'Pedidos', 'Unidades', 'Última compra', 'Seguimiento'].map(label => <th scope="col" key={label} className={headingCell}>{label}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100">{ranking.map(row => <tr key={row.client_id} className={selected === row.client_id ? 'bg-blue-50' : ''}>
                <td className={`${dataCell} tabular-nums text-slate-500`}>{row.rank}</td>
                <td className={dataCell}><button aria-expanded={selected === row.client_id} className="flex items-center gap-1 font-semibold text-blue-700 hover:underline"
                  onClick={() => setSelected(current => current === row.client_id ? '' : row.client_id)}>{row.name || 'Sin nombre'} <ChevronRight className="h-4 w-4"/></button>
                  <div className="text-xs text-slate-500">{row.seller || 'Sin vendedor'}{row.locality ? ` · ${row.locality}` : ''}</div></td>
                <td className={`${dataCell} font-semibold tabular-nums`}>{amount.format(row.sales)}</td>
                <td className={dataCell}>{count.format(row.orders)}</td><td className={dataCell}>{count.format(row.units)}</td>
                <td className={dataCell}>{displayReportDate(row.last_purchase)}<div className="text-xs text-slate-500">{row.inactive_days} días</div></td>
                <td className={dataCell}>{row.followup ? statusLabels[row.followup] : 'Sin gestión'}
                  {row.followup_seller_id && <div className="text-xs text-slate-500">{sellerOptions.find(person => person.id === row.followup_seller_id)?.name}</div>}</td>
              </tr>)}</tbody>
            </table>
          </div> : <p className="py-5 text-sm text-slate-500">{search ? 'No hay coincidencias en el ranking mostrado.' : 'No hay clientes para estos filtros.'}</p>}
        </section>
        {selected && <aside ref={profilePanel} aria-label="Perfil del cliente" className={`${panel} order-1 scroll-mt-20 xl:sticky xl:top-20 xl:order-2`}>
          <button type="button" aria-label="Cerrar perfil" onClick={() => setSelected('')} className="float-right rounded p-1 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5"/></button>
          {loadingProfile && <p role="status" className="text-sm">Cargando perfil…</p>}
          {profileError && <p role="alert" className="mb-3 text-sm text-red-700">{profileError}</p>}
          {profile && <>
            <h2 className="text-lg font-bold">{profile.name || 'Cliente sin nombre'}</h2>
            {selectedRow && <p className="mt-1 text-sm text-slate-600">{count.format(selectedRow.days)} fechas de compra en el período · {amount.format(selectedRow.sales)}</p>}
            <div className="my-4 space-y-1 break-words text-sm text-slate-700">
              <div className="flex items-center gap-2"><Phone className="h-4 w-4"/>{profile.phone_primary || profile.phone_secondary || 'Sin teléfono registrado'}</div>
              {profile.phone_primary && profile.phone_secondary && <p>Alternativo {profile.phone_secondary}</p>}
              {profile.email && <p>{profile.email}</p>}
            </div>
            <h3 className="mb-2 font-bold">Productos comprados en el período</h3>
            <div className="max-h-72 overflow-auto">
              {profile.products.length ? <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 text-slate-600"><tr>{['Producto', 'Unid.', 'Monto'].map(label => <th scope="col" className="px-2 py-2 text-left" key={label}>{label}</th>)}</tr></thead>
                <tbody className="divide-y divide-slate-100">{profile.products.map((product, index) =>
                  <tr key={`${product.product}-${index}`}><td className="px-2 py-2">{product.product}<div className="text-xs text-slate-500">{product.category}</div></td>
                    <td className="px-2 py-2">{count.format(product.units)}</td><td className="whitespace-nowrap px-2 py-2">{amount.format(product.sales)}</td></tr>)}</tbody>
              </table> : <p className="text-sm text-slate-500">Este cliente no tiene líneas de producto para los filtros seleccionados.</p>}
            </div>
            <form key={profile.id} className="mt-5 space-y-3 border-t border-slate-200 pt-4" onSubmit={saveFollowup}>
              <h3 className="font-bold">Seguimiento comercial</h3>
              <label className="block space-y-1 text-sm font-medium"><span>Vendedor responsable</span>
                <select name="seller" className={input} defaultValue={profile.followup_seller_id || selectedRow?.seller_id || ''}>
                  <option value="">Sin asignar</option>{sellerOptions.map(item => <option key={item.id} value={item.id}>{item.name || 'Sin nombre'}</option>)}
                </select>
              </label>
              <label className="block space-y-1 text-sm font-medium"><span>Estado</span>
                <select name="status" className={input} defaultValue={profile.status || 'pendiente'}>
                  {Object.entries(statusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </select>
              </label>
              <label className="block space-y-1 text-sm font-medium"><span>Motivo o próximo paso</span>
                <textarea name="note" className={`${input} min-h-20 py-2`} defaultValue={profile.note || ''} maxLength={2000} />
              </label>
              <button className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60" disabled={saving}>Guardar seguimiento</button>
              {profile.updated_at && <p className="text-xs text-slate-500">Última actualización {dateTime.format(new Date(profile.updated_at))}</p>}
              {saved && <p role="status" className="text-sm text-green-700">{saved}</p>}
            </form>
          </>}
        </aside>}
      </div>}
  </div>;
}

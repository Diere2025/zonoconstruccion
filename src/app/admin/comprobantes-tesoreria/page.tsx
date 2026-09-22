'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AdminLayout } from '@/components/ui/AdminLayout';
import { supabase } from '@/lib/supabase';

type Option = { id: string; label: string };
type Category = 'collection' | 'third_party_collection' | 'ads' | 'owner_withdrawal' | 'owner_bill' | 'supplier' | 'order' | 'other';
type Voucher = {
  id: string; voucher_date: string; category: Category; movement_direction: 'income' | 'outflow';
  amount: number | null; currency: string; financial_account_id: string | null; supplier_id: string | null;
  client_id: string | null; order_ids: string[]; destination_account: string | null; counterparty: string | null;
  notes: string | null; status: string; files: Array<{ name: string; url?: string | null }>;
};
type Form = { date: string; category: Category; amount: string; currency: string; accountId: string; supplierId: string; clientId: string; orderIds: string[]; destinationAccount: string; counterparty: string; notes: string };

const labels: Record<Category, string> = {
  collection: 'Cobranza', third_party_collection: 'Cobranza por Cuenta y Orden', ads: 'Pago de publicidad',
  owner_withdrawal: 'Extracción', owner_bill: 'Pago de servicios · extracción', supplier: 'Pago a proveedor',
  order: 'Pago de pedido', other: 'Otro pago'
};
const categories: Category[] = ['collection', 'third_party_collection', 'ads', 'owner_withdrawal', 'owner_bill', 'supplier'];
const today = () => new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date());
const blank = (): Form => ({ date: today(), category: 'collection', amount: '', currency: 'ARS', accountId: '', supplierId: '', clientId: '', orderIds: [], destinationAccount: '', counterparty: '', notes: '' });
const displayDate = (iso: string) => /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '';
function toIsoDate(value: string) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!match) return null;
  const [, d, m, y] = match;
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  return date.getFullYear() === Number(y) && date.getMonth() === Number(m) - 1 && date.getDate() === Number(d) ? `${y}-${m}-${d}` : null;
}
const money = (amount: number | null, currency: string) => amount === null ? 'Sin importe' : `${currency === 'USD' ? 'US$' : '$'} ${Number(amount).toLocaleString('es-AR')}`;

function SearchPicker({ label, value, options, onChange, lookup, requestApi, multiple = false, values = [], onValuesChange, placeholder = 'Buscar…' }: {
  label: string; value?: string; options: Option[]; onChange?: (id: string) => void; lookup?: 'orders' | 'clients' | 'suppliers';
  requestApi: (path: string, init?: RequestInit) => Promise<any>; multiple?: boolean; values?: string[];
  onValuesChange?: (ids: string[]) => void; placeholder?: string;
}) {
  const [query, setQuery] = useState('');
  const [remote, setRemote] = useState<Option[]>([]);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const all = useMemo(() => [...options, ...remote.filter(item => !options.some(base => base.id === item.id))], [options, remote]);
  useEffect(() => {
    if (!lookup || query.trim().length < 2) return;
    let cancelled = false;
    const timer = setTimeout(() => requestApi(`?lookup=${lookup}&q=${encodeURIComponent(query)}`).then(data => {
      if (!cancelled) setRemote(current => {
        const found = (data.options || []).map((row: any) => ({ id: row.id, label: lookup === 'orders' ? `${row.legacy_code || 'Pedido'} · ${row.customer_name || ''}` : lookup === 'clients' ? `${row.business_name || 'Cliente'}${row.phone_primary ? ` · ${row.phone_primary}` : ''}` : row.name }));
        return [...current, ...found.filter((item: Option) => !current.some(existing => existing.id === item.id))];
      });
    }).catch(() => { if (!cancelled) setRemote([]); }), 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [lookup, query, requestApi]);
  useEffect(() => {
    const close = (event: MouseEvent) => { if (!box.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  const filtered = all.filter(item => (!query || item.label.toLocaleLowerCase().includes(query.toLocaleLowerCase())) && (!multiple || !values.includes(item.id))).slice(0, 30);
  const selected = all.find(item => item.id === value);
  return <div ref={box} className="relative min-w-0">
    <label className="mb-1 block text-xs font-semibold text-slate-600">{label}</label>
    {multiple && values.length > 0 && <div className="mb-2 flex flex-wrap gap-1">{values.map(id => <button key={id} type="button" onClick={() => onValuesChange?.(values.filter(x => x !== id))} className="rounded-full border border-blue-200 bg-blue-50 px-2 py-1 text-xs text-blue-800" title="Quitar vínculo">{all.find(item => item.id === id)?.label || 'Pedido vinculado'} ×</button>)}</div>}
    {!multiple && value && <button type="button" onClick={() => { onChange?.(''); setQuery(''); }} className="mb-1 flex max-w-full items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-2 py-1 text-left text-xs text-blue-800"><span className="truncate">{selected?.label || 'Selección vinculada'}</span><span>×</span></button>}
    <input value={query} onChange={event => { setQuery(event.target.value); setOpen(true); }} onFocus={() => setOpen(true)} placeholder={placeholder} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" />
    {open && <div className="absolute z-30 mt-1 max-h-52 w-full overflow-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg">{filtered.length ? filtered.map(item => <button key={item.id} type="button" onClick={() => { if (multiple) onValuesChange?.([...values, item.id]); else onChange?.(item.id); setQuery(''); setOpen(false); }} className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-blue-50">{item.label}</button>) : <p className="px-3 py-2 text-xs text-slate-500">Sin coincidencias</p>}</div>}
  </div>;
}

export default function TreasuryVouchersPage() {
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [accounts, setAccounts] = useState<Option[]>([]);
  const [suppliers, setSuppliers] = useState<Option[]>([]);
  const [orders, setOrders] = useState<Option[]>([]);
  const [clients, setClients] = useState<Option[]>([]);
  const [form, setForm] = useState<Form>(blank);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [existingFiles, setExistingFiles] = useState<Array<{ name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [directionFilter, setDirectionFilter] = useState('all');
  const [preview, setPreview] = useState<Voucher | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const requestApi = useCallback(async (path = '', init?: RequestInit) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Iniciá sesión para ver los comprobantes.');
    const res = await fetch(`/api/admin/treasury-vouchers${path}`, { ...init, headers: { Authorization: `Bearer ${session.access_token}`, ...init?.headers } });
    const json = await res.json();
    if (!res.ok || !json.success) throw new Error(json.error || 'No se pudo completar la operación.');
    return json;
  }, []);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const data = await requestApi();
      setVouchers(data.vouchers || []);
      setAccounts((data.accounts || []).map((r: any) => ({ id: r.id, label: `${r.name} · ${r.currency}` })));
      setSuppliers((data.suppliers || []).map((r: any) => ({ id: r.id, label: r.name })));
      setOrders((data.orders || []).map((r: any) => ({ id: r.id, label: `${r.legacy_code || 'Pedido'} · ${r.customer_name || ''}` })));
      setClients((data.clients || []).map((r: any) => ({ id: r.id, label: `${r.business_name || 'Cliente'}${r.phone_primary ? ` · ${r.phone_primary}` : ''}` })));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudieron cargar los comprobantes.'); }
    finally { setLoading(false); }
  }, [requestApi]);
  useEffect(() => { void load(); }, [load]);
  const update = (patch: Partial<Form>) => setForm(current => ({ ...current, ...patch }));
  const openNew = () => { setForm(blank()); setEditingId(null); setFiles([]); setExistingFiles([]); setError(''); setShowForm(true); };
  const edit = (voucher: Voucher) => {
    setForm({ date: displayDate(voucher.voucher_date), category: voucher.category, amount: voucher.amount === null ? '' : String(voucher.amount), currency: voucher.currency,
      accountId: voucher.financial_account_id || '', supplierId: voucher.supplier_id || '', clientId: voucher.client_id || '', orderIds: voucher.order_ids || [],
      destinationAccount: voucher.destination_account || '', counterparty: voucher.counterparty || '', notes: voucher.notes || '' });
    setEditingId(voucher.id); setFiles([]); setExistingFiles(voucher.files || []); setError(''); setShowForm(true); window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const addFiles = (incoming: FileList | File[]) => {
    const added = Array.from(incoming).filter(file => ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.type) && file.size <= 10 * 1024 * 1024);
    setFiles(current => [...current, ...added].slice(0, Math.max(0, 5 - existingFiles.length)));
  };
  useEffect(() => {
    const paste = (event: ClipboardEvent) => {
      if (!showForm || !event.clipboardData?.files.length) return;
      addFiles(event.clipboardData.files);
      event.preventDefault();
    };
    document.addEventListener('paste', paste);
    return () => document.removeEventListener('paste', paste);
  }, [showForm, existingFiles.length]);
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setError('');
    const voucherDate = toIsoDate(form.date);
    if (!voucherDate) { setError('La fecha debe tener formato dd/mm/aaaa y ser válida.'); return; }
    if (!editingId && !files.length) { setError('Adjuntá al menos un comprobante.'); return; }
    const isCollection = form.category === 'collection' || form.category === 'third_party_collection';
    const isThirdParty = form.category === 'third_party_collection';
    const isSupplier = form.category === 'supplier' || isThirdParty;
    const usesAccount = !isThirdParty;
    const usesDestination = ['third_party_collection', 'ads', 'owner_withdrawal', 'supplier'].includes(form.category);
    const body = new FormData();
    if (editingId) body.set('voucherId', editingId);
    Object.entries({ voucherDate, category: form.category, amount: form.amount, currency: form.currency,
      accountId: usesAccount ? form.accountId : '', supplierId: isSupplier ? form.supplierId : '', clientId: isCollection ? form.clientId : '',
      orderIds: JSON.stringify(isCollection ? form.orderIds : []), destinationAccount: usesDestination ? form.destinationAccount : '',
      counterparty: ['owner_bill', 'other'].includes(form.category) ? form.counterparty : '', notes: form.notes }).forEach(([key, value]) => body.set(key, value));
    files.forEach(file => body.append('files', file));
    setSaving(true);
    try { await requestApi('', { method: 'POST', body }); setShowForm(false); setEditingId(null); setFiles([]); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo guardar.'); }
    finally { setSaving(false); }
  };
  const inspect = async (voucher: Voucher) => {
    try { const data = await requestApi(`?id=${voucher.id}`); setPreview(data.voucher); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo abrir el comprobante.'); }
  };
  const changeStatus = async (id: string, status: string) => {
    try { await requestApi('', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status }) }); await load(); setPreview(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo actualizar.'); }
  };
  const shown = vouchers.filter(v => (directionFilter === 'all' || v.movement_direction === directionFilter) && (!search || `${labels[v.category]} ${v.counterparty || ''} ${v.destination_account || ''} ${v.order_ids?.length || ''}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())));
  const collection = form.category === 'collection';
  const thirdParty = form.category === 'third_party_collection';
  const outflow = !collection && !thirdParty;
  const input = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400';
  return <AdminLayout><main className="mx-auto max-w-7xl space-y-5 p-4 md:p-6 text-slate-800">
    <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div><h1 className="text-xl font-bold">Comprobantes de tesorería</h1><p className="text-sm text-slate-500">Cobranzas, pagos y extracciones vinculados a cuentas, clientes, pedidos y proveedores.</p></div>
      <div className="flex gap-2"><Link href="/admin/finanzas" className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold">Ver finanzas</Link><button onClick={openNew} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white">+ Subir comprobante</button></div>
    </header>
    {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
    {showForm && <form onSubmit={save} className="space-y-4 rounded-2xl border border-blue-200 bg-white p-5 shadow-sm">
      <div className="flex justify-between"><h2 className="font-bold">{editingId ? 'Editar comprobante' : 'Nuevo comprobante'}</h2><button type="button" onClick={() => setShowForm(false)} className="text-slate-500">✕</button></div>
      <div className="grid gap-3 md:grid-cols-4">
        <label className="text-xs font-semibold text-slate-600">Tipo de movimiento<select value={form.category} onChange={event => update({ category: event.target.value as Category, accountId: '', supplierId: '', clientId: '', orderIds: [], destinationAccount: '', counterparty: '' })} className={`mt-1 ${input}`}>{[...categories, ...(categories.includes(form.category) ? [] : [form.category])].map(type => <option key={type} value={type}>{labels[type]}</option>)}</select></label>
        <label className="text-xs font-semibold text-slate-600">Fecha · dd/mm/aaaa<input value={form.date} onChange={event => update({ date: event.target.value })} inputMode="numeric" placeholder="dd/mm/aaaa" maxLength={10} className={`mt-1 ${input}`} required /></label>
        <label className="text-xs font-semibold text-slate-600">Importe<input value={form.amount} onChange={event => update({ amount: event.target.value })} type="number" min="0" step="0.01" placeholder="Monto del comprobante" className={`mt-1 ${input}`} /></label>
        <label className="text-xs font-semibold text-slate-600">Moneda<select value={form.currency} onChange={event => update({ currency: event.target.value })} className={`mt-1 ${input}`}><option value="ARS">Pesos</option><option value="USD">Dólares</option></select></label>
      </div>
      <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">{collection ? 'Cobranza · ingreso en cuenta propia' : thirdParty ? 'Cobranza por Cuenta y Orden · ingreso directo a un tercero' : 'Pago / extracción · salida de una cuenta propia'}</div>
      <div className="grid gap-3 md:grid-cols-2">
        {(collection || outflow) && <SearchPicker label={collection ? 'Cuenta donde ingresó' : 'Cuenta de origen'} value={form.accountId} onChange={accountId => update({ accountId })} options={accounts} requestApi={requestApi} placeholder="Buscar cuenta…" />}
        {(collection || thirdParty) && <SearchPicker label="Cliente" value={form.clientId} onChange={clientId => update({ clientId })} options={clients} lookup="clients" requestApi={requestApi} placeholder="Buscar cliente…" />}
        {(collection || thirdParty) && <div className="md:col-span-2"><SearchPicker label="Pedidos a vincular · podés elegir varios" multiple values={form.orderIds} onValuesChange={orderIds => update({ orderIds })} options={orders} lookup="orders" requestApi={requestApi} placeholder="Buscar por código o cliente…" /></div>}
        {(thirdParty || form.category === 'supplier') && <SearchPicker label={thirdParty ? 'Proveedor que recibió · una elección' : 'Proveedor · una elección'} value={form.supplierId} onChange={supplierId => update({ supplierId })} options={suppliers} lookup="suppliers" requestApi={requestApi} placeholder="Buscar proveedor…" />}
        {(thirdParty || form.category === 'ads' || form.category === 'owner_withdrawal' || form.category === 'supplier') && <label className="text-xs font-semibold text-slate-600">{thirdParty ? 'Cuenta de tercero / destinatario' : form.category === 'owner_withdrawal' ? 'Cuenta personal de destino' : form.category === 'ads' ? 'Cuenta P2P de destino' : 'Cuenta del proveedor · opcional'}<input value={form.destinationAccount} onChange={event => update({ destinationAccount: event.target.value })} placeholder="Titular, alias o CBU si se conoce" className={`mt-1 ${input}`} /></label>}
        {(form.category === 'owner_bill' || form.category === 'other') && <label className="text-xs font-semibold text-slate-600">Servicio o concepto<input value={form.counterparty} onChange={event => update({ counterparty: event.target.value })} placeholder="Ej.: servicio personal" className={`mt-1 ${input}`} /></label>}
      </div>
      <label className="block text-xs font-semibold text-slate-600">Aclaraciones · opcional<textarea value={form.notes} onChange={event => update({ notes: event.target.value })} rows={2} placeholder="Detalle necesario para administración" className={`mt-1 ${input}`} /></label>
      <input ref={fileInput} type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" onChange={event => { if (event.target.files) addFiles(event.target.files); event.target.value = ''; }} className="hidden" />
      <button type="button" onClick={() => fileInput.current?.click()} className="w-full rounded-xl border border-dashed border-blue-300 bg-blue-50 px-4 py-5 text-sm font-semibold text-blue-700">Elegir fotos o PDF · también podés pegar una captura con Ctrl+V</button>
      {(existingFiles.length > 0 || files.length > 0) && <div className="flex flex-wrap gap-2 text-xs">{existingFiles.map((file, index) => <span key={index} className="rounded-full border px-2 py-1">{file.name}</span>)}{files.map((file, index) => <button type="button" key={index} onClick={() => setFiles(current => current.filter((_, i) => i !== index))} className="rounded-full border px-2 py-1">{file.name} ×</button>)}</div>}
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-slate-500">Hasta 5 archivos de 10 MB. Subir un comprobante no crea un movimiento ni duplica un pago en caja.</p><button disabled={saving} className="rounded-xl bg-emerald-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Guardando…' : 'Guardar comprobante'}</button></div>
    </form>}
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="font-bold">Comprobantes cargados</h2><div className="flex gap-2"><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" /><select value={directionFilter} onChange={event => setDirectionFilter(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm"><option value="all">Todos</option><option value="income">Cobranzas</option><option value="outflow">Pagos y extracciones</option></select></div></div>
      {loading ? <p className="text-sm text-slate-500">Cargando comprobantes…</p> : !shown.length ? <p className="rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">No hay comprobantes para mostrar.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="border-b text-xs uppercase text-slate-500"><tr><th className="py-2">Fecha</th><th>Tipo</th><th>Vínculos</th><th>Cuenta / destino</th><th>Importe</th><th>Estado</th><th></th></tr></thead><tbody>{shown.map(v => <tr key={v.id} className="border-b last:border-0"><td className="py-3">{displayDate(v.voucher_date)}</td><td><span className={v.movement_direction === 'income' ? 'text-emerald-700' : 'text-amber-700'}>{labels[v.category]}</span></td><td className="text-xs text-slate-600">{v.client_id ? clients.find(x => x.id === v.client_id)?.label || 'Cliente vinculado' : ''}{v.order_ids?.length ? ` · ${v.order_ids.length} pedido${v.order_ids.length === 1 ? '' : 's'}` : ''}{v.supplier_id ? ` · ${suppliers.find(x => x.id === v.supplier_id)?.label || 'Proveedor'}` : ''}</td><td className="text-xs">{accounts.find(x => x.id === v.financial_account_id)?.label || v.destination_account || '—'}</td><td className="font-semibold">{money(v.amount, v.currency)}</td><td className="text-xs">{v.status === 'reviewed' ? 'Revisado' : v.status === 'needs_info' ? 'Pedir datos' : 'Pendiente'}</td><td className="whitespace-nowrap text-right"><button onClick={() => inspect(v)} className="mr-2 font-semibold text-blue-600">Ver</button><button onClick={() => edit(v)} className="font-semibold text-blue-600">Editar</button></td></tr>)}</tbody></table></div>}
    </section>
    {preview && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" onClick={() => setPreview(null)}><div className="max-h-[90vh] w-full max-w-xl overflow-auto rounded-2xl bg-white p-5 shadow-xl" onClick={event => event.stopPropagation()}><div className="mb-4 flex justify-between"><h2 className="font-bold">{labels[preview.category]} · {displayDate(preview.voucher_date)}</h2><button onClick={() => setPreview(null)}>✕</button></div><p className="mb-3 text-sm">{money(preview.amount, preview.currency)} · {preview.movement_direction === 'income' ? 'Cobranza' : 'Pago / extracción'}</p>{preview.notes && <p className="mb-3 text-sm text-slate-600">{preview.notes}</p>}<div className="space-y-2">{preview.files.map((file, index) => <a key={index} href={file.url || '#'} target="_blank" rel="noreferrer" className="block rounded-xl border p-3 text-sm text-blue-700">Abrir {file.name} ↗</a>)}</div><div className="mt-5 flex flex-wrap gap-2"><button onClick={() => { edit(preview); setPreview(null); }} className="rounded-xl border px-3 py-2 text-sm">Editar</button><button onClick={() => changeStatus(preview.id, 'reviewed')} className="rounded-xl bg-emerald-600 px-3 py-2 text-sm text-white">Marcar revisado</button><button onClick={() => changeStatus(preview.id, 'needs_info')} className="rounded-xl border px-3 py-2 text-sm">Pedir datos</button></div></div></div>}
  </main></AdminLayout>;
}

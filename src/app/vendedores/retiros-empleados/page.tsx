'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import ErpDateInput from '@/components/ui/ErpDateInput';
import { createAuthenticatedRequester } from '@/lib/authenticatedRequest';
import { displayDateField, displayErpInstant } from '@/lib/dates/dateFields';
import { displayPayrollPeriod, employeeDiscountCents, employeeDiscountRate, employeeReviewLabels, payrollPeriodEnd, shiftPayrollDate, withdrawalStates, type WithdrawalCadence } from '@/lib/employeeWithdrawals';
import { supabase } from '@/lib/supabase';

const request = createAuthenticatedRequester(supabase);
const endpoint = '/api/vendedores/employee-withdrawals';
const field = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm';
const button = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-50';
const primary = 'rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50';
const card = 'space-y-4 rounded-xl border border-slate-200 bg-white p-4';
const money = (amount: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(amount);
const cents = (amount: number) => Math.round(amount * 100);

function requestErrorMessage(error: unknown) {
  const message = error && typeof error === 'object' && 'message' in error ? error.message : null;
  return typeof message === 'string' && message.trim() && !/<\s*(?:!doctype|html|body)/i.test(message)
    ? message : 'No se pudo completar la operación.';
}

interface Employee { id: string; name: string }
interface Account extends Employee { employee_id: string | null; can_review: boolean }
interface Line { product_id: string; name: string; sku?: string; quantity: number; price: number }
interface Product { id: string; name: string; sku: string | null; price: number }
interface Installment {
  cadence: WithdrawalCadence; period_start: string; period_end: string; expected_on: string; amount: number;
  number: number; applied_at?: string; applied_on?: string; payroll_reference?: string;
}
interface Withdrawal {
  id: string; code: string; employee_id: string; employee: string; state: string; status: string; version: number; created_by: string;
  amount: number; created_at: string; notes: string; review_note: string; category: string; sheet_pending: boolean;
  mode: 'pickup' | 'home'; address: string; locality: string; delivery_date: string; phone: string | null;
  discount_rate: number | null; discount_amount: number; operational_note: string | null;
  agreement: string | null; credited_amount: number | null; installments: Installment[] | null; delivery_closed: boolean;
  items: (Line & { id: string })[];
  delivery_events: { item_id: string; delta: number; at: string }[];
  audit: { action: string; by: string; actor_name: string; at: string; data: { note?: string } }[] | null;
}
interface Inbox {
  capabilities: { create: boolean; logistics: boolean; review: boolean; admin: boolean; employee_id: string | null; user_id: string };
  employees: Employee[]; accounts: Account[]; orders: Withdrawal[];
}
type Save = (action: string, id: string, version: number | null, data?: object) => Promise<boolean>;
const deliveredUnits = (order: Withdrawal, id: string) => order.delivery_events
  .reduce((total, entry) => total + (entry.item_id === id ? entry.delta : 0), 0);
const deliveredAmount = (order: Withdrawal) => {
  const gross = order.items.reduce((sum, item) => sum + deliveredUnits(order, item.id) * cents(item.price), 0);
  return (gross - employeeDiscountCents(gross, order.discount_rate ?? 0)) / 100;
};

function OrderEditor({ order, employees, ownEmployee, save, busy, close }: {
  order?: Withdrawal; employees: Employee[]; ownEmployee: string | null; save: Save; busy: boolean; close: () => void;
}) {
  const [employee, setEmployee] = useState(order?.employee_id || ownEmployee || '');
  const [lines, setLines] = useState<Line[]>(order?.items || []);
  const [note, setNote] = useState(order?.operational_note ?? order?.notes.replace(/^Retiro de empleado(?: · )?/, '') ?? '');
  const [mode, setMode] = useState(order?.mode ?? 'pickup');
  const [address, setAddress] = useState(order?.mode === 'home' ? order.address : '');
  const [locality, setLocality] = useState(order?.mode === 'home' ? order.locality : '');
  const [phone, setPhone] = useState(order?.phone ?? '');
  const [deliveryDate, setDeliveryDate] = useState(order?.mode === 'home' ? order.delivery_date : '');
  const [discountRate, setDiscountRate] = useState(String(order?.discount_rate ?? employeeDiscountRate));
  const [query, setQuery] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [searchError, setSearchError] = useState('');
  const [id] = useState(() => order?.id || crypto.randomUUID());

  useEffect(() => {
    const term = query.trim().replace(/[%_(),."\\]/g, ' ').trim();
    if (term.length < 2) return;
    let current = true;
    const timer = setTimeout(async () => {
      const { data, error } = await supabase.from('products').select('id,name,sku,price')
        .eq('is_active', true).eq('is_service', false).not('is_outlet_unit', 'is', true)
        .not('is_generic', 'is', true).not('sku', 'is', null).neq('sku', '').not('name', 'ilike', 'descuento%')
        .or(`name.ilike.%${term}%,sku.ilike.%${term}%`).order('sku').limit(20);
      if (current) {
        setProducts(data ?? []);
        setSearchError(error ? 'No se pudo buscar en el catálogo.' : '');
      }
    }, 250);
    return () => { current = false; clearTimeout(timer); };
  }, [query]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (await save(order ? 'edit' : 'create', id, order?.version ?? null, {
      employee_id: employee, items: lines, note, mode, address, locality, phone, delivery_date: deliveryDate,
      discount_rate: Number(discountRate),
    })) close();
  }

  const subtotal = lines.reduce((total, line) => total + line.quantity * cents(line.price), 0);
  const discount = employeeDiscountCents(subtotal, Number(discountRate));

  return <form className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" onSubmit={submit}>
    <header className="border-b border-slate-200 bg-slate-50 px-5 py-4 sm:px-6">
      <h2 className="text-lg font-bold">{order ? 'Corregir retiro' : 'Nuevo pedido de empleado'}</h2>
      <p className="text-sm text-slate-600">El pedido queda pendiente de validación antes de habilitar la entrega.</p>
    </header>
    <div className="space-y-5 p-5 sm:p-6">
    <div className="grid gap-4 sm:grid-cols-2">
    <label className="block text-sm font-semibold">Empleado
      <select required className={field} value={employee} onChange={event => setEmployee(event.target.value)}>
        <option value="">Elegí un empleado</option>
        {employees.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
      </select>
    </label>
    <label className="block text-sm font-semibold">Modalidad de entrega
      <select className={field} value={mode} onChange={event => setMode(event.target.value === 'home' ? 'home' : 'pickup')}>
        <option value="pickup">Retiro en depósito</option>
        <option value="home">Envío a domicilio</option>
      </select>
    </label>
    </div>
    {mode === 'home' && <fieldset className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
      <legend className="px-2 text-sm font-semibold">Datos del envío</legend>
      <label className="text-sm font-semibold">Domicilio<input required maxLength={250} className={field} value={address} onChange={event => setAddress(event.target.value)} /></label>
      <label className="text-sm font-semibold">Localidad<input required maxLength={150} className={field} value={locality} onChange={event => setLocality(event.target.value)} /></label>
      <label className="text-sm font-semibold">Teléfono de contacto<input required type="tel" maxLength={50} className={field} value={phone} onChange={event => setPhone(event.target.value)} /></label>
      <label className="text-sm font-semibold">Fecha de entrega<ErpDateInput required className={field} value={deliveryDate} onChange={event => setDeliveryDate(event.target.value)} /></label>
    </fieldset>}
    {!employees.length && <p>Pedile a Administración que vincule tu cuenta con tu ficha de personal.</p>}
    <div className="space-y-3 border-t border-slate-200 pt-4">
    <label className="block max-w-md text-sm font-semibold">Buscar producto por nombre o SKU
      <input className={field} placeholder="Ej. escalera o SKU" value={query} onChange={event => { setProducts([]); setQuery(event.target.value); }} />
    </label>
    {searchError && <p role="alert">{searchError}</p>}
    {products.length > 0 && <ul className="max-h-48 overflow-auto rounded border">
      {products.map(product => <li key={product.id}>
        <button type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-blue-50" onClick={() => {
          setLines(current => [...current, { product_id: product.id, name: product.name, sku: product.sku ?? undefined, quantity: 1, price: product.price }]);
          setQuery(''); setProducts([]);
        }}>{product.sku}</button>
      </li>)}
    </ul>}
    {lines.map((line, index) => <div key={index} className="grid items-end gap-3 rounded-xl border border-slate-200 p-3 sm:grid-cols-[2fr_1fr_1fr_auto]">
      <div className="pb-1 text-sm"><p className="font-semibold">{line.name}</p>{line.sku && line.sku !== line.name && <p className="text-slate-500">{line.sku}</p>}</div>
      <label>Cantidad<input required type="number" min="1" max="10000" step="1" className={field} value={line.quantity}
        onChange={event => setLines(lines.map((item, i) => i === index ? { ...item, quantity: Number(event.target.value) } : item))} /></label>
      <label>Precio unitario<input required type="number" min="0" step="0.01" className={field} value={line.price}
        onChange={event => setLines(lines.map((item, i) => i === index ? { ...item, price: Number(event.target.value) } : item))} /></label>
      <button type="button" className={button} onClick={() => setLines(lines.filter((_, i) => i !== index))}>Quitar</button>
    </div>)}
    </div>
    <label className="block text-sm font-semibold">Observaciones operativas<textarea maxLength={500} className={field} value={note} onChange={event => setNote(event.target.value)} /></label>
    </div>
    <footer className="flex flex-wrap items-end justify-between gap-4 border-t border-slate-200 bg-slate-50 p-5 sm:px-6">
    <dl className="w-full max-w-xs space-y-1 text-sm tabular-nums">
      <div className="flex justify-between gap-4"><dt>Subtotal</dt><dd>{money(subtotal / 100)}</dd></div>
      <div className="flex items-center justify-between gap-4 text-emerald-800">
        <dt><label className="flex flex-wrap items-center gap-2">Descuento empleado
          <input aria-label="Descuento empleado en porcentaje" className="w-20 rounded-lg border border-slate-300 bg-white px-2 py-1 text-right"
            type="number" min="0" max="100" step="0.01" required value={discountRate}
            onChange={event => setDiscountRate(event.target.value)} /> %
        </label></dt><dd>−{money(discount / 100)}</dd>
      </div>
      <div className="flex justify-between gap-4 border-t border-slate-200 pt-2 text-base font-bold"><dt>Total del pedido</dt><dd>{money((subtotal - discount) / 100)}</dd></div>
    </dl>
    <div className="flex flex-wrap gap-2">
      <button className={primary} disabled={busy || !employee || !lines.length}>Enviar a RR. HH.</button>
      <button type="button" className={button} onClick={close}>Cerrar</button>
    </div>
    </footer>
  </form>;
}

function Schedule({ order, save, busy, close }: { order: Withdrawal; save: Save; busy: boolean; close: () => void }) {
  const applied = (order.installments ?? []).filter(row => row.applied_at).reduce((sum, row) => sum + cents(row.amount), 0);
  const remaining = cents(order.delivery_closed ? deliveredAmount(order) : order.amount) - applied + cents(order.credited_amount ?? 0);
  const [rows, setRows] = useState<Installment[]>(() => (order.installments ?? []).filter(row => !row.applied_at));
  const [cadence, setCadence] = useState<WithdrawalCadence>('monthly');
  const [firstPeriod, setFirstPeriod] = useState('');
  const [firstDue, setFirstDue] = useState('');
  const [count, setCount] = useState(1);
  const [note, setNote] = useState('');
  const [periodChecked, setPeriodChecked] = useState(false);
  const [error, setError] = useState('');
  const sum = rows.reduce((total, row) => total + cents(row.amount), 0);

  function generate() {
    const start = cadence === 'monthly' ? firstPeriod + '-01' : firstPeriod;
    if (!payrollPeriodEnd(start, cadence) || !firstDue || !Number.isInteger(count) || count < 1 || count > 60 || remaining < count) {
      setError('Revisá el primer período, la primera fecha de descuento y la cantidad de cuotas.');
      return;
    }
    setError('');
    setPeriodChecked(false);
    const base = Math.floor(remaining / count);
    setRows(Array.from({ length: count }, (_, index) => {
      const period_start = shiftPayrollDate(start, index, cadence);
      return { number: index + 1, cadence, period_start, period_end: payrollPeriodEnd(period_start, cadence),
        expected_on: shiftPayrollDate(firstDue, index, cadence), amount: (base + Number(index < remaining % count)) / 100 };
    }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const action = order.state === 'approved' ? 'reschedule' : 'approve';
    if (await save(action, order.id, order.version, { note, installments: rows, period_checked: periodChecked })) close();
  }

  return <form className={card} onSubmit={submit}>
    <h3 className="font-bold">{order.state === 'approved' ? 'Reprogramar cuotas pendientes' : 'Autorizar y acordar descuento'}</h3>
    <p className="text-sm">Elegí el período del sueldo, incluso si corresponde a un mes o semana anterior que todavía no se pagó. La fecha prevista indica cuándo se aplicará el descuento.</p>
    <p className="text-sm">Importe por programar {money(remaining / 100)} · Cuotas {money(sum / 100)}</p>
    {remaining > 0 && <div className="grid items-end gap-2 md:grid-cols-5">
      <label>Frecuencia<select className={field} value={cadence} onChange={event => {
        setCadence(event.target.value as WithdrawalCadence); setFirstPeriod('');
      }}><option value="monthly">Mensual</option><option value="weekly">Semanal</option></select></label>
      <label>{cadence === 'monthly' ? 'Primer mes salarial' : 'Inicio de primera semana'}
        <ErpDateInput className={field} type={cadence === 'monthly' ? 'month' : 'date'} value={firstPeriod}
          onChange={event => setFirstPeriod(event.target.value)} /></label>
      <label>Primera fecha de descuento<ErpDateInput className={field} value={firstDue} onChange={event => setFirstDue(event.target.value)} /></label>
      <label>Cantidad de cuotas<input type="number" min="1" max="60" className={field} value={count} onChange={event => setCount(Number(event.target.value))} /></label>
      <button type="button" className={button} onClick={generate}>Generar cuotas</button>
    </div>}
    {error && <p role="alert">{error}</p>}
    {rows.map((row, index) => {
      function update(changes: Partial<Installment>) { setRows(current => current.map((item, i) => i === index ? { ...item, ...changes } : item)); }
      return <fieldset key={index} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-3">
        <legend className="px-2 font-semibold">Cuota pendiente {index + 1}</legend>
        <label>{row.cadence === 'monthly' ? 'Mes salarial' : 'Inicio de semana'}
          <ErpDateInput required className={field} type={row.cadence === 'monthly' ? 'month' : 'date'}
            value={row.cadence === 'monthly' ? row.period_start.slice(0, 7) : row.period_start}
            onChange={event => {
              const start = event.target.value && (row.cadence === 'monthly' ? event.target.value + '-01' : event.target.value);
              setPeriodChecked(false);
              update({ period_start: start, period_end: payrollPeriodEnd(start, row.cadence) });
            }} />
          {row.cadence === 'weekly' && row.period_end && <small>Hasta el {displayDateField(row.period_end)}</small>}
        </label>
        <label>Fecha prevista<ErpDateInput required className={field} value={row.expected_on}
          onChange={event => update({ expected_on: event.target.value })} /></label>
        <label>Importe<input required type="number" min="0.01" step="0.01" className={field} value={row.amount}
          onChange={event => update({ amount: Number(event.target.value) })} /></label>
      </fieldset>;
    })}
    {remaining === 0 && rows.length > 0 && <button type="button" className={button} onClick={() => setRows([])}>Quitar cuotas pendientes</button>}
    <label className="block">{order.state === 'approved' ? 'Motivo de reprogramación' : 'Acuerdo con el empleado'}
      <textarea required maxLength={500} className={field} value={note} onChange={event => setNote(event.target.value)} />
    </label>
    {rows.length > 0 && <label className="block text-sm">
      <input type="checkbox" required checked={periodChecked} onChange={event => setPeriodChecked(event.target.checked)} />
      {' '}Confirmé que cada período admite el descuento o tiene un ajuste de liquidación registrado.
    </label>}
    <div className="flex gap-2">
      <button className={primary} disabled={busy || sum !== remaining || remaining < 0}>Guardar cronograma</button>
      <button type="button" className={button} onClick={close}>Cerrar</button>
    </div>
  </form>;
}

const actionLabels: Record<string, string> = {
  return: 'Devolver a quien cargó', reject: 'Rechazar', deliver: 'Registrar entrega', refund: 'Registrar devolución',
  apply: 'Confirmar descuento aplicado', credit: 'Registrar reintegro', cancel: 'Cancelar retiro', close_delivery: 'Cerrar entrega',
  create: 'Cargado', edit: 'Editado', approve: 'Autorizado', reschedule: 'Reprogramado',
};
type QuickAction = { action: string; item?: string; max?: number; installment?: number; amount?: number };

function ActionForm({ selection, order, save, busy, close }: {
  selection: QuickAction; order: Withdrawal; save: Save; busy: boolean; close: () => void;
}) {
  const [note, setNote] = useState('');
  const [quantity, setQuantity] = useState(selection.max || 1);
  const [amount, setAmount] = useState(selection.amount ?? 0);
  const [appliedOn, setAppliedOn] = useState('');
  return <form className="space-y-2 rounded-lg border bg-slate-50 p-3" onSubmit={async event => {
    event.preventDefault();
    if (await save(selection.action, order.id, order.version, {
      note, quantity, amount, item_id: selection.item, number: selection.installment, applied_on: appliedOn,
    })) close();
  }}>
    <h3 className="font-bold">{actionLabels[selection.action]}</h3>
    {selection.max ? <label className="block max-w-xs">Cantidad<input required className={field} type="number" min="1" step="1"
      max={selection.max} value={quantity} onChange={event => setQuantity(Number(event.target.value))} /></label> :
      <>
        {selection.amount !== undefined && <label className="block max-w-xs">Importe<input required type="number" min="0.01" step="0.01"
          max={selection.amount} className={field} value={amount} onChange={event => setAmount(Number(event.target.value))} /></label>}
        {selection.action === 'apply' && <label className="block max-w-xs">Fecha efectiva del descuento
          <ErpDateInput required className={field} value={appliedOn} onChange={event => setAppliedOn(event.target.value)} />
        </label>}
        <label className="block">{['apply', 'credit'].includes(selection.action) ? 'Referencia de liquidación o pago' : 'Motivo operativo'}
          <input required className={field} maxLength={500} value={note} onChange={event => setNote(event.target.value)} />
        </label>
      </>}
    <div className="flex gap-2"><button className={primary} disabled={busy}>Confirmar</button>
      <button type="button" className={button} onClick={close}>Cerrar</button></div>
  </form>;
}

function OrderCard({ order, inbox, save, busy, period, onEdit }: {
  order: Withdrawal; inbox: Inbox; save: Save; busy: boolean; period: string; onEdit: () => void;
}) {
  const [quick, setQuick] = useState<QuickAction | null>(null);
  const [schedule, setSchedule] = useState(false);
  const { capabilities, employees } = inbox;
  const review = capabilities.review;
  const canEdit = capabilities.create && (capabilities.logistics || capabilities.user_id === order.created_by)
    && ['pending', 'returned', 'approved'].includes(order.state) && !order.delivery_events.length;
  const approved = order.state === 'approved';
  const delivered = deliveredAmount(order);
  const credited = order.credited_amount ?? 0;
  const applied = (order.installments ?? []).filter(row => row.applied_at).reduce((sum, row) => sum + cents(row.amount), 0) / 100 - credited;
  const credit = (cents(applied) - cents(delivered)) / 100;
  const rows = (order.installments ?? []).filter(row => !period || row.period_end.slice(0, 7) === period);
  const hasDelivery = order.items.some(item => deliveredUnits(order, item.id) > 0);
  const lastDelivery = order.delivery_events.findLast(entry => entry.delta > 0);
  function action(next: QuickAction) { setSchedule(false); setQuick(next); }

  return <article className={card}>
    <header className="flex flex-wrap justify-between gap-2">
      <div><h2 className="text-lg font-bold">{order.employee} · {money(order.amount)}</h2>
        <p className="break-all text-xs text-slate-500">{order.code} · {displayErpInstant(order.created_at)} · {order.category}</p></div>
      <span className={`self-start rounded-full px-3 py-1 text-sm font-semibold ${order.state === 'approved' ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'}`}>
        {employeeReviewLabels[order.state] ?? withdrawalStates[order.state]}
      </span>
    </header>
    <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
      <p className="font-semibold">{order.mode === 'home' ? 'Envío a domicilio' : 'Retiro en depósito'}</p>
      {order.mode === 'home' && <p>{order.address}, {order.locality} · {displayDateField(order.delivery_date)}{order.phone && ` · ${order.phone}`}</p>}
      {Number(order.discount_rate) > 0 && <p>Descuento empleado ({order.discount_rate}%) · {money(order.discount_amount)}</p>}
    </div>
    <p className="text-sm">{order.notes}{order.review_note && ` · ${order.review_note}`}</p>
    <ul className="divide-y rounded-lg border">
      {order.items.map(item => {
        const units = deliveredUnits(order, item.id);
        return <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 p-2 text-sm">
          <span>{item.name} · {units}/{item.quantity} entregado · {money(item.price)} por unidad</span>
          {approved && capabilities.logistics && <div className="flex flex-wrap gap-2">
            {!order.delivery_closed && units < item.quantity && <button className={button}
              onClick={() => action({ action: 'deliver', item: item.id, max: item.quantity - units })}>Entregar</button>}
            {units > 0 && <button className={button} onClick={() => action({ action: 'refund', item: item.id, max: units })}>Devolución</button>}
          </div>}
        </li>;
      })}
    </ul>
    {lastDelivery && <p className="text-sm">Última entrega {displayErpInstant(lastDelivery.at)}</p>}
    {order.delivery_closed && <p className="text-sm font-semibold">Entrega cerrada</p>}
    {review && order.agreement && <p className="text-sm">{order.agreement}</p>}
    {review && (order.installments?.length ?? 0) > 0 && <>
      <p className="text-sm">Entregado {money(delivered)} · Descuento neto aplicado {money(applied)} · Disponible para descontar {money(Math.max(0, delivered - applied))}</p>
      {credit > 0 && <button className={button} onClick={() => action({ action: 'credit', amount: credit })}>Registrar reintegro de hasta {money(credit)}</button>}
      <div className="overflow-x-auto"><table className="w-full text-left text-sm">
        <thead><tr className="border-b"><th className="p-2">Cuota</th><th>Período salarial</th><th>Fecha prevista</th><th>Importe</th><th>Descuento</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.number} className="border-b">
          <td className="p-2">{row.number}</td><td>{displayPayrollPeriod(row.period_start, row.period_end, row.cadence)}</td>
          <td>{displayDateField(row.expected_on)}</td><td>{money(row.amount)}</td>
          <td className="py-2">{row.applied_at ? `Aplicado el ${displayDateField(row.applied_on ?? '')} · ${row.payroll_reference}` :
            approved ? cents(applied) + cents(row.amount) <= cents(delivered) ?
              <button className={button} onClick={() => action({ action: 'apply', installment: row.number })}>Registrar aplicado</button>
              : 'Pendiente de importe entregado' : 'Sin efecto'}</td>
        </tr>)}</tbody>
      </table></div>
    </>}
    <div className="flex flex-wrap gap-2">
      {canEdit && employees.length > 0 && <button className={button} onClick={onEdit}>Corregir pedido</button>}
      {review && order.state === 'pending' && <>
        <button className={primary} onClick={() => { setQuick(null); setSchedule(true); }}>Autorizar</button>
        <button className={button} onClick={() => action({ action: 'return' })}>Devolver para corregir</button>
        <button className={button} onClick={() => action({ action: 'reject' })}>Rechazar</button>
      </>}
      {review && approved && <button className={button} onClick={() => { setQuick(null); setSchedule(true); }}>Reprogramar cuotas</button>}
      {capabilities.logistics && approved && !order.delivery_closed && order.status !== 'Entregado' && hasDelivery &&
        <button className={button} onClick={() => action({ action: 'close_delivery' })}>Cerrar entrega parcial</button>}
      {(review || capabilities.logistics) && ['pending', 'returned', 'approved'].includes(order.state) && !hasDelivery && applied === 0 &&
        <button className={button} onClick={() => action({ action: 'cancel' })}>Cancelar retiro</button>}
      {order.sheet_pending && <button className={button} disabled={busy} onClick={() => void save('sync', order.id, null)}>Sincronizar planillas</button>}
    </div>
    {schedule && <Schedule order={order} save={save} busy={busy} close={() => setSchedule(false)} />}
    {quick && <ActionForm key={JSON.stringify(quick)} selection={quick} order={order} save={save} busy={busy} close={() => setQuick(null)} />}
    {review && order.audit && <details className="text-sm">
      <summary className="cursor-pointer font-semibold">Historial</summary>
      <ul className="mt-2 space-y-1">{[...order.audit].reverse().map((entry, index) => <li key={index}>
        {displayErpInstant(entry.at)} · {actionLabels[entry.action] || entry.action} · {entry.actor_name || entry.by}
        {entry.data.note && ` · ${entry.data.note}`}
      </li>)}</ul>
    </details>}
  </article>;
}

function AccessForm({ accounts, employees, save, busy }: { accounts: Account[]; employees: Employee[]; save: Save; busy: boolean }) {
  const [id, setId] = useState('');
  const [employee, setEmployee] = useState('');
  const [review, setReview] = useState(false);
  return <details className={card}><summary className="cursor-pointer font-semibold">Configurar vínculos y permisos de RR. HH.</summary>
    <form className="grid items-end gap-3 md:grid-cols-3" onSubmit={event => {
      event.preventDefault(); void save('access', id, null, { employee_id: employee, can_review: review });
    }}>
      <label>Cuenta ERP<select required className={field} value={id} onChange={event => {
        const account = accounts.find(value => value.id === event.target.value);
        setId(event.target.value); setEmployee(account?.employee_id ?? ''); setReview(account?.can_review ?? false);
      }}><option value="">Elegí una cuenta</option>{accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
      <label>Ficha de personal<select className={field} value={employee} onChange={event => setEmployee(event.target.value)}>
        <option value="">Sin vínculo</option>{employees.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
      </select></label>
      <div className="flex flex-wrap items-center gap-2">
        <label><input type="checkbox" checked={review} onChange={event => setReview(event.target.checked)} /> Puede validar y registrar descuentos</label>
        <button className={button} disabled={busy || !id}>Guardar acceso</button>
      </div>
    </form>
  </details>;
}

export default function EmployeeWithdrawalsPage() {
  const [inbox, setInbox] = useState<Inbox | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [period, setPeriod] = useState('');
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(0);
  const [editor, setEditor] = useState<Withdrawal | 'new' | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('employee_withdrawal_read', {
      p_period: period ? period + '-01' : null, p_state: filter || null, p_page: page,
    });
    if (error) throw error;
    setInbox(data);
  }, [period, filter, page]);

  useEffect(() => {
    void load().catch(value => setError(requestErrorMessage(value)));
  }, [load]);

  const save: Save = async (action, id, version, data) => {
    setBusy(true); setError(''); setNotice('');
    let saved = false;
    try {
      const post = (payload: object) => request(endpoint, { method: 'POST', body: JSON.stringify(payload) });
      const result = await post({ action, id, version, data });
      saved = true;
      let synced = true;
      if (action === 'sync') synced = result.synced;
      else if (action !== 'access') {
        try { synced = (await post({ action: 'sync', id: result.id })).synced; }
        catch { synced = false; }
      }
      setNotice(synced ? 'Operación guardada.' : 'Guardado en el ERP. La sincronización de planillas sigue pendiente.');
      await load();
      return true;
    } catch (value) {
      setError(requestErrorMessage(value));
      return saved;
    } finally { setBusy(false); }
  };

  const orders = inbox?.orders ?? [];
  return <main className="mx-auto max-w-6xl space-y-4 p-4 text-slate-900">
    <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm sm:px-6">
      <div><p className="text-xs font-semibold uppercase tracking-wide text-blue-800">Pedidos internos</p>
        <h1 className="text-2xl font-bold">Retiros de empleados</h1>
        <p className="text-sm text-slate-600">Validación de RR. HH., retiro en depósito y envío a domicilio.</p></div>
      {inbox?.capabilities.create && <button className={primary} onClick={() => setEditor('new')}>Cargar retiro</button>}
    </header>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-900">{error}</p>}
    {notice && <p role="status" className="rounded-lg bg-blue-50 p-3">{notice}</p>}
    {!inbox && !error && <p>Cargando retiros…</p>}
    {inbox && <>
      {inbox.capabilities.admin && <AccessForm accounts={inbox.accounts} employees={inbox.employees} save={save} busy={busy} />}
      {editor && <OrderEditor key={editor === 'new' ? 'new' : editor.id} order={editor === 'new' ? undefined : editor}
        employees={inbox.employees} ownEmployee={inbox.capabilities.employee_id} save={save} busy={busy} close={() => setEditor(null)} />}
      <div className="flex flex-wrap items-end gap-3">
        <label>Estado<select className={field} value={filter} onChange={event => { setFilter(event.target.value); setPage(0); }}>
          <option value="">Todos</option>{Object.entries(withdrawalStates).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        {inbox.capabilities.review && <label>Reporte por mes salarial<ErpDateInput className={field} type="month" value={period}
          onChange={event => { setPeriod(event.target.value); setPage(0); }} />
          <small className="block text-slate-600">Las semanas se agrupan por su fecha de cierre.</small>
        </label>}
        {period && <button className={button} onClick={() => { setPeriod(''); setPage(0); }}>Quitar filtro de período</button>}
      </div>
      {!orders.length && <p className={card}>No hay retiros para esta selección.</p>}
      {orders.map(order => <OrderCard key={order.id} order={order} inbox={inbox} save={save} busy={busy} period={period}
        onEdit={() => { setEditor(order); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />)}
      {(page > 0 || orders.length === 50) && <div className="flex gap-2">
        <button className={button} disabled={page === 0} onClick={() => setPage(page - 1)}>Anterior</button>
        <button className={button} disabled={orders.length < 50} onClick={() => setPage(page + 1)}>Siguiente</button>
      </div>}
    </>}
  </main>;
}

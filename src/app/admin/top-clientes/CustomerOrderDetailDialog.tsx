'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { displayReportDate } from '@/components/ui/ReportDateRangePicker';
import { calculateCascadingDiscounts } from '@/lib/orderDiscounts';
import { supabase } from '@/lib/supabase';
import { cleanDeliveryNotes } from '@/lib/utils';
import type { OrderDiscountItem } from '@/types';
import CustomerWhaticketLink from './CustomerWhaticketLink';

type Props = {
  clientId: string;
  order: { id: string; code: string | null; day: string; seller: string | null };
  onClose: () => void;
};

const money = new Intl.NumberFormat('es-AR', {
  style: 'currency', currency: 'ARS', minimumFractionDigits: 0, maximumFractionDigits: 2,
});
const number = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });
const currency = (value: number | null | undefined) => value == null ? '—' : money.format(value);
const date = (value: string | null) => value ? displayReportDate(value) : '—';
const panel = 'rounded-xl border border-slate-200 bg-slate-50 p-4';

function relationName(relation: { name: string } | { name: string }[] | null) {
  return (Array.isArray(relation) ? relation[0] : relation)?.name;
}

type Totals = {
  items_subtotal?: number;
  subtotal?: number;
  freight?: number;
  payment_surcharges?: number;
  surcharge?: number;
  tax?: number;
  deposit_amount?: number;
  pending_balance?: number;
  order_discount_type?: string;
  order_discount_value?: number;
  order_discount_amount?: number;
  order_discounts?: OrderDiscountItem[];
  importacion_historica?: { medio_pago_planilla?: string; estado_pago_planilla?: string; origen_venta?: string };
};

async function loadOrder(clientId: string, orderId: string, signal: AbortSignal) {
  const { data, error } = await supabase.from('orders').select(`
    customer_name, channel, commercial_brand, status, payment_status, advertising_source_detail, locality, address,
    freight_type, initial_delivery_date, max_delivery_date, delivery_notes, delivery_detail,
    whaticket_link, total_amount, order_discount_type, order_discount_value, order_discount_amount,
    totals, payment:payment_methods!orders_payment_method_id_fkey(name),
    medium:order_mediums!orders_order_medium_id_fkey(name),
    source:advertising_sources!orders_advertising_source_id_fkey(name),
    order_items(id, product_name, quantity, unit_price, subtotal, discount_percentage)
  `).eq('id', orderId).eq('client_id', clientId).abortSignal(signal).maybeSingle();
  if (error || !data) throw new Error('No se pudo cargar este pedido.');

  return { ...data, totals: data.totals as Totals | null };
}

type Detail = Awaited<ReturnType<typeof loadOrder>>;

function OrderDetail({ detail, order }: { detail: Detail; order: Props['order'] }) {
  const totals = detail.totals;
  const history = totals?.importacion_historica;
  const items = detail.order_items ?? [];
  const orderDiscount = Number(detail.order_discount_amount) || Number(totals?.order_discount_amount) || 0;
  const discountType = detail.order_discount_type || totals?.order_discount_type;
  const discountValue = detail.order_discount_value || totals?.order_discount_value;
  const discountRate = discountType === 'percentage' && discountValue ? ` (${number.format(discountValue)}%)` : '';
  const discounts = Array.isArray(totals?.order_discounts) ? totals.order_discounts : [];
  const breakdown = totals?.items_subtotal != null
    ? calculateCascadingDiscounts(totals.items_subtotal, discounts)
    : [];
  const delivery = [detail.initial_delivery_date, detail.max_delivery_date]
    .filter((value, index, dates) => value && dates.indexOf(value) === index).map(date).join(' al ');
  const notes = [cleanDeliveryNotes(detail.delivery_notes), cleanDeliveryNotes(detail.delivery_detail)]
    .filter(Boolean).join('\n');
  const fields = [
    ['Cliente', detail.customer_name], ['Fecha del pedido', date(order.day)], ['Vendedor', order.seller],
    ['Canal', detail.channel], ['Marca comercial', detail.commercial_brand], ['Estado del pedido', detail.status],
    ['Medio de toma', relationName(detail.medium)], ['Origen de la venta', relationName(detail.source) || history?.origen_venta],
    ['Detalle del origen', detail.advertising_source_detail],
    ['Forma de pago', history?.medio_pago_planilla || relationName(detail.payment)],
    ['Estado de pago', history?.estado_pago_planilla || detail.payment_status],
    ['Dirección de entrega', detail.address], ['Localidad', detail.locality],
    ['Tipo de flete', detail.freight_type], ['Entrega prevista', delivery],
  ];
  const charges = [
    { label: 'Subtotal de productos', value: totals?.items_subtotal ?? (orderDiscount > 0 ? null : totals?.subtotal) },
    ...(orderDiscount > 0 ? [
      { label: `Descuento del pedido${discountRate}`, value: -orderDiscount },
      { label: 'Subtotal con descuento', value: totals?.subtotal },
    ] : []),
    { label: 'Flete', value: totals?.freight },
    { label: 'Recargo por pago', value: totals?.payment_surcharges ?? totals?.surcharge },
    { label: 'Impuestos', value: totals?.tax },
  ].filter(row => row.value != null);

  return <>
    <section className={panel}>
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h3 className="font-semibold">Cómo se tomó el pedido</h3>
        {history && <span className="text-xs text-slate-600">Importado de planilla</span>}
        <CustomerWhaticketLink href={detail.whaticket_link} />
      </div>
      <dl className="grid gap-x-5 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
        {fields.filter(([, value]) => value).map(([label, value]) => <div key={label} className="min-w-0">
          <dt className="text-xs text-slate-600">{label}</dt>
          <dd className="break-words font-medium">{value}</dd>
        </div>)}
      </dl>
      {notes && <p className="mt-4 whitespace-pre-line border-t border-slate-200 pt-3 text-sm"><strong>Observaciones de entrega</strong><br />{notes}</p>}
    </section>

    <section>
      <h3 className="mb-2 font-semibold">Productos</h3>
      {items.length ? <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600"><tr>
            {['Producto', 'Cant.', 'Precio unitario registrado', 'Descuento de línea', 'Subtotal registrado'].map((label, index) =>
              <th scope="col" className={`px-3 py-2 ${index === 0 ? 'text-left' : 'text-right'}`} key={label}>{label}</th>)}
          </tr></thead>
          <tbody className="divide-y divide-slate-100">{items.map(item => <tr key={item.id}>
            <td className="px-3 py-2">{item.product_name || 'Producto sin identificar'}</td>
            <td className="px-3 py-2 text-right tabular-nums">{item.quantity == null ? '—' : number.format(item.quantity)}</td>
            <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{currency(item.unit_price)}</td>
            <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{Number(item.discount_percentage) > 0 ? `${number.format(item.discount_percentage)}%` : '—'}</td>
            <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{currency(item.subtotal)}</td>
          </tr>)}</tbody>
        </table>
      </div> : <p className="text-sm text-slate-600">No hay productos registrados para este pedido.</p>}
    </section>

    <section className={panel}>
      <h3 className="mb-2 font-semibold">Importes originales</h3>
      {orderDiscount === 0 && !discounts.length && !items.some(item => Number(item.discount_percentage) > 0) &&
        <p className="mb-3 text-sm text-slate-600">{history ? 'La planilla no informa descuentos.' : 'Sin descuentos registrados.'}</p>}
      {discounts.length > 0 && <ul className="mb-3 space-y-1 text-sm text-slate-700">
        {discounts.map((discount, index) => <li key={discount.id || index}>
          {discount.description || 'Descuento aplicado'} · {discount.type === 'percentage' ? `${number.format(discount.value)}%` : currency(discount.value)}
          {breakdown[index]?.amount > 0 && discount.type === 'percentage' ? ` (${currency(breakdown[index].amount)})` : ''}
        </li>)}
      </ul>}
      <dl className="space-y-1 text-sm">
        {charges.map(({ label, value }) => <div className="flex justify-between gap-3" key={label}>
          <dt>{label}</dt><dd className="whitespace-nowrap tabular-nums">{currency(value)}</dd>
        </div>)}
        <div className="flex justify-between gap-3 border-t border-slate-200 pt-2 text-base font-bold">
          <dt>Total del pedido</dt><dd className="whitespace-nowrap tabular-nums">{currency(detail.total_amount)}</dd>
        </div>
        {totals?.deposit_amount != null && totals.deposit_amount > 0 && <div className="flex justify-between gap-3">
          <dt>Seña registrada</dt><dd className="tabular-nums">{currency(totals.deposit_amount)}</dd>
        </div>}
        {totals?.pending_balance != null && <div className="flex justify-between gap-3">
          <dt>Saldo registrado</dt><dd className="tabular-nums">{currency(totals.pending_balance)}</dd>
        </div>}
      </dl>
    </section>
  </>;
}

export default function CustomerOrderDetailDialog({ clientId, order, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => {
    const controller = new AbortController();
    setError(false);
    loadOrder(clientId, order.id, controller.signal).then(data => {
      if (!controller.signal.aborted) setDetail(data);
    }).catch(() => {
      if (!controller.signal.aborted) setError(true);
    });
    return () => controller.abort();
  }, [clientId, order.id, attempt]);

  return <dialog ref={dialog} onClose={event => { event.stopPropagation(); onClose(); }} aria-labelledby="customer-order-title"
    className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-1.5rem)] max-w-4xl overflow-auto rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl backdrop:bg-slate-950/55">
    <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
      <div>
        <h2 id="customer-order-title" className="text-lg font-bold">{order.code ? `Pedido ${order.code}` : 'Pedido sin código'}</h2>
        <p className="text-sm text-slate-600">Valores registrados en pesos, sin ajuste por IPC.</p>
      </div>
      <button type="button" aria-label="Cerrar detalle del pedido" onClick={() => dialog.current?.close()}
        className="rounded-lg border border-slate-200 p-2 hover:bg-slate-100"><X className="size-4" /></button>
    </header>
    <div className="space-y-4 p-4 sm:p-6">
      {detail && <OrderDetail detail={detail} order={order} />}
      {!detail && !error && <p role="status" className="flex items-center gap-2 text-sm text-slate-600">
        <Loader2 className="size-4 animate-spin" /> Cargando pedido…
      </p>}
      {error && <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800">
        <p>No se pudo cargar este pedido.</p>
        <button type="button" className="mt-2 font-semibold underline" onClick={() => setAttempt(value => value + 1)}>Reintentar</button>
      </div>}
    </div>
  </dialog>;
}

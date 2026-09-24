"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { CheckSquare, Loader2, Printer, RefreshCw, Search, Square } from 'lucide-react';
import QRCode from 'qrcode';
import { LogisticsPrintOrder } from '@/lib/logisticsPrintOrders';
import { optimizeTwoUpOrder } from '@/lib/logisticsReceiptPagination';
import { waitForPrintImages } from '@/lib/printAssets';

export type PerPage = 1 | 2;

export interface ReceiptSheet {
  layout: 'single' | 'double';
  orders: LogisticsPrintOrder[];
}

function money(value: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0
  }).format(Number(value) || 0);
}

function displayDate(value: string): string {
  if (!value) return 'Sin fecha';
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  return value;
}

export function buildReceiptSheets(orders: LogisticsPrintOrder[], perPage: PerPage): ReceiptSheet[] {
  if (perPage === 1) return orders.map(order => ({ layout: 'single', orders: [order] }));

  const orderedForPrinting = optimizeTwoUpOrder(orders, order => order.items.length > 10);
  const result: ReceiptSheet[] = [];
  let pending: LogisticsPrintOrder | null = null;
  for (const order of orderedForPrinting) {
    // Un comprobante unificado extenso conserva toda la hoja para no cortar productos.
    if (order.items.length > 10) {
      if (pending) result.push({ layout: 'double', orders: [pending] });
      pending = null;
      result.push({ layout: 'single', orders: [order] });
      continue;
    }
    if (pending) {
      result.push({ layout: 'double', orders: [pending, order] });
      pending = null;
    } else {
      pending = order;
    }
  }
  if (pending) result.push({ layout: 'double', orders: [pending] });
  return result;
}

function WhatsAppQr({ phone }: { phone: string }) {
  const qr = QRCode.create(`https://wa.me/${phone}`, { errorCorrectionLevel: 'M' });
  const quietZone = 4;
  const viewSize = qr.modules.size + quietZone * 2;
  let path = '';
  for (let row = 0; row < qr.modules.size; row++) {
    for (let column = 0; column < qr.modules.size; column++) {
      if (qr.modules.get(row, column)) path += `M${column} ${row}h1v1h-1z`;
    }
  }

  return (
    <svg className="receipt-whatsapp-qr-code" viewBox={`0 0 ${viewSize} ${viewSize}`} aria-label="QR de WhatsApp">
      <rect width={viewSize} height={viewSize} fill="#fff" />
      <path d={path} transform={`translate(${quietZone} ${quietZone})`} fill="#000" />
    </svg>
  );
}

function Receipt({ order, compact }: { order: LogisticsPrintOrder; compact: boolean }) {
  const isAquafort = order.commercialBrand === 'aquafort';
  const companyPhone = isAquafort ? '+54 9 11 6474-3375' : '+54 9 11 5769-4181';
  const whatsappPhone = isAquafort ? '5491164743375' : '5491157694181';
  const discount = order.items.filter(item => item.unitPrice < 0 || /descuento|bonificaci/i.test(item.name));
  const regularItems = order.items.filter(item => !discount.includes(item));
  const items = [...regularItems, ...discount];
  const phone = [order.phonePrimary, order.phoneSecondary].filter(Boolean).join(' / ');
  const isVatTransfer = /transferencia[\s\S]*iva\s*21|iva\s*21[\s\S]*transferencia/i.test(order.paymentMethod);

  return (
    <article className={`logistics-receipt ${compact ? 'is-compact' : 'is-full'}`}>
      <Image
        className={`receipt-watermark ${isAquafort ? 'receipt-watermark-aquafort' : 'receipt-watermark-zono'}`}
        src={isAquafort ? '/aquafort-watermark.png' : '/zono-watermark.png'}
        alt=""
        width={isAquafort ? 2163 : 512}
        height={isAquafort ? 727 : 512}
        unoptimized
        loading="eager"
        aria-hidden="true"
      />
      <header className="receipt-header">
        <div className="receipt-brand-block">
          <div className="receipt-company">{isAquafort ? 'AQUAFORT' : 'ZONO CONSTRUCCIÓN'}</div>
          <div className="receipt-company-detail">
            {isAquafort ? 'Soluciones para el agua' : 'Construcción y hogar'} · Quilmes 4541, Paso del Rey
          </div>
          <div className="receipt-company-contact">WhatsApp: {companyPhone}</div>
        </div>
        <div className="receipt-whatsapp-qr">
          <WhatsAppQr phone={whatsappPhone} />
          <span>WhatsApp</span>
        </div>
        <div className="receipt-number">
          <strong>COMPROBANTE DE PEDIDO</strong>
          <span>N.º {order.legacyCode}</span>
          <small>Entrega: {displayDate(order.deliveryDate)}</small>
        </div>
      </header>

      <section className="receipt-meta">
        <div><b>Cliente:</b> {order.customerName || 'Consumidor final'}</div>
        <div><b>Vendedor:</b> {order.sellerName || 'Sin especificar'}</div>
        <div><b>Domicilio:</b> {[order.address, order.locality].filter(Boolean).join(' · ') || 'A coordinar'}</div>
        <div><b>Contacto:</b> {phone || 'Sin especificar'}</div>
      </section>

      <table className="receipt-items">
        <thead>
          <tr>
            <th className="qty">Cant.</th>
            <th>Detalle</th>
            <th className="amount">P. unitario</th>
            <th className="amount">Importe</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => {
            const isDiscount = item.unitPrice < 0 || /descuento|bonificaci/i.test(item.name);
            return (
              <tr key={`${item.name}-${index}`} className={isDiscount ? 'discount-row' : ''}>
                <td className="qty">{item.quantity}</td>
                <td>{item.name}</td>
                <td className="amount">{money(item.unitPrice)}</td>
                <td className="amount">{money(item.quantity * item.unitPrice)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <section className="receipt-bottom">
        <div className="receipt-payment">
          <div><b>Forma de pago:</b> {order.paymentMethod || 'No especificada'}</div>
          {isVatTransfer && order.surcharge > 0 && (
            <div className="receipt-vat-notice">
              <b>IVA (21%):</b> {money(order.surcharge)}
            </div>
          )}
          <div><b>Estado:</b> {order.paymentStatus || 'No abonado'}</div>
        </div>
        <div className="receipt-totals">
          <div><span>Productos</span><b>{money(order.productsSubtotal)}</b></div>
          {order.surcharge !== 0 && (
            <div className={isVatTransfer ? 'vat-surcharge-row' : ''}>
              <span>{isVatTransfer ? 'IVA (21%)' : 'Recargo'}</span>
              <b>+ {money(order.surcharge)}</b>
            </div>
          )}
          {order.freightCost !== 0 && <div><span>Servicio de transporte</span><b>{money(order.freightCost)}</b></div>}
          <div className="grand-total"><span>Total</span><b>{money(order.orderTotal)}</b></div>
          {order.paidAmount > 0 && <div><span>Abonado</span><b>-{money(order.paidAmount)}</b></div>}
          <div className="balance"><span>Saldo</span><b>{money(order.pendingBalance)}</b></div>
        </div>
      </section>

      <footer className="receipt-signatures">
        <span>Control de productos</span>
        <span>Firma y aclaración del cliente</span>
      </footer>
    </article>
  );
}

export function PrintableReceipts({ sheets }: { sheets: ReceiptSheet[] }) {
  if (typeof document === 'undefined') return null;
  const content = (
    <div id="print-logistics-receipts-root">
      {sheets.map((sheet, index) => (
        <section key={`${sheet.orders.map(order => order.id).join('-')}-${index}`}
          className={`logistics-receipt-sheet ${sheet.layout === 'double' ? 'two-up' : 'one-up'}`}
        >
          {sheet.orders.map(order => (
            <Receipt key={order.id} order={order} compact={sheet.layout === 'double'} />
          ))}
        </section>
      ))}
    </div>
  );
  return createPortal(content, document.body);
}

export default function LogisticsReceiptsPanel() {
  const [orders, setOrders] = useState<LogisticsPrintOrder[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [printOrders, setPrintOrders] = useState<LogisticsPrintOrder[]>([]);
  const [perPage, setPerPage] = useState<PerPage>(2);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadOrders = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await fetch('/api/logistica/comprobantes-planilla', { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'No se pudo leer la planilla.');
      const nextOrders = (payload.orders || []) as LogisticsPrintOrder[];
      setOrders(nextOrders);
      setSelected(new Set(nextOrders.map(order => order.id)));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudo leer la planilla.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, []);

  useEffect(() => {
    const clearPrintQueue = () => setPrintOrders([]);
    window.addEventListener('afterprint', clearPrintQueue);
    return () => window.removeEventListener('afterprint', clearPrintQueue);
  }, []);

  useEffect(() => {
    if (printOrders.length === 0) return;
    let cancelled = false;
    void waitForPrintImages('print-logistics-receipts-root').then(() => {
      if (!cancelled) window.print();
    });
    return () => { cancelled = true; };
  }, [printOrders]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return orders;
    return orders.filter(order => [order.legacyCode, order.customerName, order.locality, order.address]
      .some(value => value.toLowerCase().includes(term)));
  }, [orders, search]);

  const sheets = useMemo(() => buildReceiptSheets(printOrders, perPage), [printOrders, perPage]);
  const selectedOrders = orders.filter(order => selected.has(order.id));

  const toggle = (id: string) => {
    setSelected(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleVisible = () => {
    const allVisibleSelected = filtered.every(order => selected.has(order.id));
    setSelected(current => {
      const next = new Set(current);
      filtered.forEach(order => allVisibleSelected ? next.delete(order.id) : next.add(order.id));
      return next;
    });
  };

  const handlePrint = () => {
    if (selectedOrders.length === 0) return;
    setPrintOrders(selectedOrders);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div>
          <h2 className="text-sm font-black text-slate-900">Comprobantes desde la planilla de logística</h2>
          <p className="mt-1 text-[11px] font-semibold text-slate-500">
            Los productos se leen de la planilla. La marca Zono o AquaFort se toma del pedido del ERP. Las filas hermanas se imprimen como un solo comprobante.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="block">
            <span className="mb-1 block text-[9px] font-black uppercase tracking-wider text-slate-400">Comprobantes por hoja</span>
            <select
              value={perPage}
              onChange={event => setPerPage(Number(event.target.value) as PerPage)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 outline-none"
            >
              <option value={1}>1 por hoja</option>
              <option value={2}>2 por hoja</option>
            </select>
          </label>
          <button type="button" onClick={loadOrders} disabled={loading} className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 hover:bg-slate-100 disabled:opacity-50">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Actualizar
          </button>
          <button type="button" onClick={handlePrint} disabled={selectedOrders.length === 0 || loading} className="flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-black text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-40">
            <Printer className="h-3.5 w-3.5" /> Imprimir {selectedOrders.length || ''}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar código, cliente, localidad o dirección..." className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-xs font-bold outline-none focus:border-slate-500" />
        </div>
        <button type="button" onClick={toggleVisible} disabled={filtered.length === 0} className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-[10px] font-black uppercase text-slate-600 hover:bg-slate-50">
          {filtered.length > 0 && filtered.every(order => selected.has(order.id)) ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
          Seleccionar visibles
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-xs font-bold text-slate-500"><Loader2 className="h-5 w-5 animate-spin" /> Leyendo planilla...</div>
      ) : error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs font-bold text-rose-700">{error}</div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center text-xs font-bold text-slate-400">No hay pedidos para imprimir.</div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200">
          <table className="w-full border-collapse text-left text-xs">
            <thead className="bg-slate-50 text-[9px] font-black uppercase tracking-wider text-slate-400">
              <tr><th className="w-10 px-3 py-2"></th><th className="px-3 py-2">Pedido</th><th className="px-3 py-2">Cliente</th><th className="px-3 py-2">Entrega</th><th className="px-3 py-2">Marca</th><th className="px-3 py-2 text-center">Productos</th><th className="px-3 py-2 text-right">Saldo</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(order => (
                <tr key={order.id} onClick={() => toggle(order.id)} className="cursor-pointer hover:bg-slate-50">
                  <td className="px-3 py-2"><input type="checkbox" checked={selected.has(order.id)} onChange={() => toggle(order.id)} onClick={event => event.stopPropagation()} className="h-4 w-4 accent-slate-900" /></td>
                  <td className="px-3 py-2 font-mono text-[10px] font-black text-slate-800">{order.legacyCode}{order.sourceRows.length > 1 && <span className="ml-2 rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 font-sans text-[8px] text-amber-800">UNIFICADO</span>}</td>
                  <td className="px-3 py-2 font-extrabold text-slate-800">{order.customerName}</td>
                  <td className="px-3 py-2 text-[10px] font-bold text-slate-600">{displayDate(order.deliveryDate)} · {order.locality}</td>
                  <td className="px-3 py-2"><span className="rounded border border-slate-300 px-1.5 py-0.5 text-[8px] font-black uppercase text-slate-700">{order.commercialBrand}</span></td>
                  <td className="px-3 py-2 text-center font-black text-slate-700">{order.items.length}</td>
                  <td className="px-3 py-2 text-right font-mono font-black text-slate-900">{money(order.pendingBalance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <PrintableReceipts sheets={sheets} />
    </div>
  );
}

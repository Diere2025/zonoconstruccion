"use client";

import React from 'react';
import { createPortal } from 'react-dom';
import { LogisticsPrintOrder } from '@/lib/logisticsPrintOrders';
import { buildOrderNotePages, orderNoteBaseAmount, orderNoteCardAmounts, selectedOrderNoteCardIndex } from '@/lib/logisticsOrderNotes';

export interface OrderNoteSettings {
  driver: string;
  companion: string;
  vehicle: string;
  departure: string;
  changeAmount: string;
  posnetRates: number[];
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(value);
}

function displayDate(value: string): string {
  if (!value) return '—';
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? `${iso[3]}/${iso[2]}/${iso[1]}` : value;
}

export function PrintableOrderNotes({ orders, settings }: { orders: LogisticsPrintOrder[]; settings: OrderNoteSettings }) {
  if (typeof document === 'undefined') return null;
  const pages = buildOrderNotePages(orders);

  return createPortal(
    <div id="print-order-notes-root">
      {pages.map((page, pageIndex) => (
        <section className="order-note-sheet" key={`${page.deliveryDate}-${page.pageNumber}-${pageIndex}`}>
          <header className="order-note-header">
            <div>
              <div className="order-note-eyebrow">ZONO CONSTRUCCIÓN <span>·</span> OPERACIONES Y DISTRIBUCIÓN</div>
              <h1>Planilla de entregas y cobros</h1>
            </div>
            <div className="order-note-header-right">
              <span>CONTROL DE ENTREGAS</span>
              <strong>{displayDate(page.deliveryDate)}</strong>
              {page.pageCount > 1 && <small>Hoja {page.pageNumber} de {page.pageCount}</small>}
            </div>
          </header>
          <div className="order-note-meta">
            <div className="order-note-meta-group">
              <div><b>Chofer</b><span>{settings.driver || '—'}</span></div>
              <div><b>Acompañante</b><span>{settings.companion || '—'}</span></div>
              <div><b>Lleva cambio</b><span>{settings.changeAmount.trim() ? `$ ${formatNumber(Number(settings.changeAmount))}` : '—'}</span></div>
            </div>
            <div className="order-note-meta-group">
              <div><b>Fecha</b><span>{displayDate(page.deliveryDate)}</span></div>
              <div><b>Vehículo</b><span>{settings.vehicle || '—'}</span></div>
              <div><b>Salida</b><span>{settings.departure || '—'}</span></div>
            </div>
          </div>
          <table className="order-note-table">
            <colgroup>
              <col style={{ width: '3%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '14%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '7.5%' }} />
              <col style={{ width: '7.5%' }} />
              <col style={{ width: '7.5%' }} />
              <col style={{ width: '7.5%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '6%' }} />
            </colgroup>
            <thead>
              <tr className="order-note-posnet-heading">
                <th colSpan={6}></th>
                <th colSpan={4}>PAYWAY</th>
                <th className="order-note-cuota-heading">CUOTA SIMPLE</th>
                <th></th>
              </tr>
              <tr>
                <th>N°</th>
                <th>Código</th>
                <th>Cliente</th>
                <th>Localidad</th>
                <th>Medio de pago</th>
                <th>Monto /<br />transferencia</th>
                {['1 cuota', '3 cuotas', '6 cuotas', '12 cuotas'].map(label => (
                  <th className="order-note-installment" key={label}>{label}</th>
                ))}
                <th className="order-note-installment order-note-cuota-column">6 cuotas</th>
                <th className="order-note-delivery-heading">Entregado</th>
              </tr>
            </thead>
            <tbody>
              {page.orders.map((order, index) => {
                const cardAmounts = orderNoteCardAmounts(order, settings.posnetRates);
                const selectedCardIndex = selectedOrderNoteCardIndex(order.paymentMethod);
                return (
                  <tr key={order.id}>
                    <td className="order-note-number">{page.firstRowNumber + index}</td>
                    <td className="order-note-code">{order.codes.join(' / ') || order.legacyCode}</td>
                    <td>{order.customerName}</td>
                    <td>{order.locality}</td>
                    <td>{order.paymentMethod}</td>
                    <td className="order-note-amount"><span style={{ display: 'block', width: '100%', textAlign: 'center' }}>{formatNumber(orderNoteBaseAmount(order, settings.posnetRates))}</span></td>
                    {cardAmounts.map((amount, rateIndex) => (
                      <td className={`order-note-amount ${rateIndex === 4 ? 'order-note-cuota-amount' : 'order-note-posnet'} ${selectedCardIndex === rateIndex ? 'order-note-selected-option' : ''}`} key={rateIndex}>
                        {amount === null ? '' : <span style={{ display: 'flex', width: '100%', justifyContent: 'center', alignItems: 'center', gap: '1mm' }}>{selectedCardIndex === rateIndex && <strong className="order-note-selected-mark">✓</strong>}{formatNumber(amount)}</span>}
                      </td>
                    ))}
                    <td className="order-note-delivery"></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <footer className="order-note-footer">
            <span>Verificar medio de pago e importe antes de confirmar cada entrega.</span>
            <span>{page.orders.length} {page.orders.length === 1 ? 'pedido' : 'pedidos'} en esta hoja</span>
          </footer>
        </section>
      ))}
    </div>,
    document.body
  );
}

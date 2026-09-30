"use client";

import React from 'react';
import { createPortal } from 'react-dom';
import { LogisticsPrintOrder } from '@/lib/logisticsPrintOrders';
import { CUOTA_SIMPLE_PLANS, POINT_ONE_PAYMENT_PLAN } from '@/lib/cuotaSimple';
import { agreedOrderNoteInstallments, buildOrderNotePages, hasLegacyOrderNotePlan, isOrderNotePaid, orderNoteBaseAmount, orderNoteCardAmounts, orderNotePointAmount, orderNoteRoutes, selectedOrderNoteCardIndex, selectedOrderNotePoint } from '@/lib/logisticsOrderNotes';

export interface OrderNoteSettings {
  driver: string;
  companion: string;
  vehicle: string;
  departure: string;
  changeAmount: string;
  posnetRates: number[];
  pointRate?: number;
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
  const pages = buildOrderNotePages(orders, settings);
  const pointRate = settings.pointRate ?? POINT_ONE_PAYMENT_PLAN.surcharge_percentage;

  const content = (
    <div id="print-order-notes-root">
      {pages.map((page, pageIndex) => (
        <section className="order-note-sheet" key={`${page.key}-${page.pageNumber}-${pageIndex}`}>
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
            <div><b>Chofer</b><span>{page.trip.driver || '—'}</span></div>
            <div><b>Acompañante</b><span>{page.trip.companion || '—'}</span></div>
            <div><b>Vehículo</b><span>{page.trip.vehicle || '—'}</span></div>
            <div><b>Fecha</b><span>{displayDate(page.deliveryDate)}</span></div>
            <div><b>Salida</b><span>{page.trip.departure || '—'}</span></div>
            <div><b>Lleva cambio</b><span>{settings.changeAmount.trim() ? `$ ${formatNumber(Number(settings.changeAmount))}` : '—'}</span></div>
          </div>
          {(page.trip.zone || page.trip.route) && <div className="order-note-route">Recorrido: {orderNoteRoutes(page.orders)}</div>}
          <table className="order-note-table">
            <colgroup>
              {['2.5%', '6.5%', '13%', '7%', '10%', '7%', '7%', ...CUOTA_SIMPLE_PLANS.map(() => '7%'), '5%'].map((width, index) => <col key={index} style={{ width }} />)}
            </colgroup>
            <thead>
              <tr className="order-note-posnet-heading">
                <th colSpan={7}></th>
                <th colSpan={CUOTA_SIMPLE_PLANS.length} className="order-note-cuota-heading">CUOTA SIMPLE</th>
                <th></th>
              </tr>
              <tr>
                <th>N°</th>
                <th>Código</th>
                <th>Cliente</th>
                <th>Localidad</th>
                <th>Medio de pago</th>
                <th>Pago Contado</th>
                <th className="order-note-installment"><span className="order-note-installment-count">Point 1 Pago</span><span className="order-note-installment-rate">{pointRate.toLocaleString('es-AR')}%</span></th>
                {CUOTA_SIMPLE_PLANS.map((plan, index) => (
                  <th className="order-note-installment" key={plan.installments}>
                    <span className="order-note-installment-count">{plan.installments} cuotas</span>
                    <span className="order-note-installment-rate">{settings.posnetRates[index].toLocaleString('es-AR')}%</span>
                  </th>
                ))}
                <th className="order-note-delivery-heading">Entregado</th>
              </tr>
            </thead>
            <tbody>
              {page.orders.map((order, index) => {
                const cardAmounts = orderNoteCardAmounts(order, settings.posnetRates, pointRate);
                const selectedCardIndex = selectedOrderNoteCardIndex(order.paymentMethod);
                const legacyPlan = hasLegacyOrderNotePlan(order.paymentMethod) && order.pendingBalance > 0;
                const pointSelected = selectedOrderNotePoint(order.paymentMethod);
                return (
                  <tr key={order.id}>
                    <td className="order-note-number">{page.firstRowNumber + index}</td>
                    <td className="order-note-code">{order.codes.join(' / ') || order.legacyCode}</td>
                    <td>{order.customerName}</td>
                    <td>{order.locality}</td>
                    <td title={order.paymentMethod}>
                      {legacyPlan && pointSelected ? 'Point 1 Pago *' : legacyPlan && selectedCardIndex !== null
                        ? `Cuota Simple · ${agreedOrderNoteInstallments(order.paymentMethod)}c *`
                        : order.paymentMethod}
                      {legacyPlan && selectedCardIndex === null && !pointSelected && (
                        <span className="order-note-agreed-amount">Pactado: {formatNumber(order.pendingBalance)}</span>
                      )}
                    </td>
                    {order.pendingBalance <= 0 ? (
                      <td colSpan={2 + CUOTA_SIMPLE_PLANS.length} className="order-note-payment-status">
                        {isOrderNotePaid(order) ? 'Pedido pago' : 'Saldo $0 · verificar'}
                      </td>
                    ) : (
                    <>
                    <td className="order-note-amount"><span style={{ display: 'block', width: '100%', textAlign: 'center' }}>{formatNumber(orderNoteBaseAmount(order, settings.posnetRates, pointRate))}</span></td>
                    <td className={`order-note-amount order-note-posnet ${pointSelected ? 'order-note-selected-option' : ''}`} title={legacyPlan && pointSelected ? `Importe pactado con ${order.paymentMethod}` : undefined}>
                      <span style={{ display: 'flex', justifyContent: 'center', gap: '1mm' }}>{pointSelected && <strong className="order-note-selected-mark">✓</strong>}{formatNumber(orderNotePointAmount(order, settings.posnetRates, pointRate))}</span>
                    </td>
                    {cardAmounts.map((amount, rateIndex) => (
                      <td
                        className={`order-note-amount order-note-posnet ${selectedCardIndex === rateIndex ? 'order-note-selected-option' : ''}`}
                        title={legacyPlan && selectedCardIndex === rateIndex ? `Importe pactado con ${order.paymentMethod}` : undefined}
                        key={rateIndex}
                      >
                        {amount === null ? '' : <span style={{ display: 'flex', width: '100%', justifyContent: 'center', alignItems: 'center', gap: '1mm' }}>{selectedCardIndex === rateIndex && <strong className="order-note-selected-mark">✓</strong>}{formatNumber(amount)}</span>}
                      </td>
                    ))}
                    </>
                    )}
                    <td className="order-note-delivery"></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <footer className="order-note-footer">
            <span>✓ Plan elegido. * Plan anterior: se respeta el importe pactado. Las otras cuotas usan recargos actuales.</span>
            <span>{page.orders.length} {page.orders.length === 1 ? 'pedido' : 'pedidos'} en esta hoja</span>
          </footer>
        </section>
      ))}
    </div>
  );
  return createPortal(content, document.body);
}

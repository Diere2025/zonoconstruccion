"use client";

import React from 'react';
import { createPortal } from 'react-dom';
import type { LogisticsPrintOrder } from '@/lib/logisticsPrintOrders';
import { buildOrderNotePages } from '@/lib/logisticsOrderNotes';
import type { OrderNoteSettings } from '@/components/logistica/LogisticsOrderNotesPanel';

function displayDate(value: string): string {
  if (!value) return '—';
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? `${iso[3]}/${iso[2]}/${iso[1]}` : value;
}

export function PrintableConformity({ orders, settings }: { orders: LogisticsPrintOrder[]; settings: OrderNoteSettings }) {
  if (typeof document === 'undefined') return null;
  const pages = buildOrderNotePages(orders);

  return createPortal(
    <div id="print-conformity-root">
      {pages.map((page, pageIndex) => (
        <section className="conformity-sheet" key={`${page.deliveryDate}-${page.pageNumber}-${pageIndex}`}>
          <div className="conformity-heading">
            <div>
              <span className="conformity-brand">ZONO CONSTRUCCIÓN · OPERACIONES Y DISTRIBUCIÓN</span>
              <h1>Recibo de conformidad</h1>
            </div>
            <div className="conformity-date">
              <span>Fecha de entrega</span>
              <strong>{displayDate(page.deliveryDate)}</strong>
              {page.pageCount > 1 && <small>Hoja {page.pageNumber} de {page.pageCount}</small>}
            </div>
          </div>
          <div className="conformity-trip">
            <div><b>Chofer</b><span>{settings.driver || '—'}</span></div>
            <div><b>Acompañante</b><span>{settings.companion || '—'}</span></div>
            <div><b>Vehículo</b><span>{settings.vehicle || '—'}</span></div>
            <div><b>Salida</b><span>{settings.departure || '—'}</span></div>
          </div>
          <table className="conformity-table">
            <colgroup>
              <col style={{ width: '4%' }} />
              <col style={{ width: '13%' }} />
              <col style={{ width: '25%' }} />
              <col style={{ width: '29%' }} />
              <col style={{ width: '29%' }} />
            </colgroup>
            <thead>
              <tr><th>N°</th><th>Código</th><th>Cliente</th><th>Firma</th><th>Aclaración</th></tr>
            </thead>
            <tbody>
              {page.orders.map((order, index) => (
                <tr key={order.id}>
                  <td className="conformity-number">{page.firstRowNumber + index}</td>
                  <td className="conformity-code">{order.codes.join(' / ') || order.legacyCode}</td>
                  <td>{order.customerName}</td>
                  <td></td>
                  <td></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="conformity-footer">
            <span>Firma y aclaración de quien recibe cada pedido.</span>
            <span>{page.orders.length} {page.orders.length === 1 ? 'pedido' : 'pedidos'} en esta hoja</span>
          </div>
        </section>
      ))}
    </div>,
    document.body
  );
}

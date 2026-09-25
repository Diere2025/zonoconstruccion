"use client";

import React from 'react';
import { createPortal } from 'react-dom';
import { LogisticsPrintOrder } from '@/lib/logisticsPrintOrders';
import { warehouseGroups, warehouseTotalGroup, WarehouseLine, WarehouseLoad } from '@/lib/logisticsWarehouse';
import { OrderNoteSettings } from '@/components/logistica/LogisticsOrderNotesPanel';

type WarehouseMode = 'separar' | 'separar-total' | 'cargar';

// Keep the print rules with the mounted document: the long-running local dev
// server can serve an older global CSS chunk while updating the component JS.
const warehousePrintStyles = `
#print-warehouse-root { display: none !important; }
@media print {
  body:has(#print-warehouse-root:not(:empty)) > :not(#print-warehouse-root) { display: none !important; }
  #print-warehouse-root { display: block !important; position: absolute !important; inset: 0 auto auto 0 !important; width: 100% !important; background: white !important; z-index: 1000003 !important; }
  #print-warehouse-root * { box-sizing: border-box !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  .warehouse-sheet { width: 210mm !important; height: 297mm !important; padding: 10mm !important; overflow: hidden !important; background: white !important; color: #17212e !important; font: 10pt Arial, Helvetica, sans-serif !important; page-break-after: always !important; break-after: page !important; display: flex !important; flex-direction: column !important; }
  .warehouse-sheet:last-child { page-break-after: auto !important; break-after: auto !important; }
  .warehouse-header { display: block !important; border-bottom: 1.5pt solid #17212e !important; padding-bottom: 3mm !important; margin-bottom: 4mm !important; }
  .warehouse-heading { display: flex !important; justify-content: space-between !important; align-items: end !important; }
  .warehouse-heading small { display: block !important; font-size: 7pt !important; letter-spacing: .08em !important; }
  .warehouse-heading h1 { font-size: 16pt !important; line-height: 1.2 !important; margin: 1mm 0 !important; font-weight: 800 !important; }
  .warehouse-heading > strong { font-size: 16pt !important; line-height: 1.2 !important; white-space: nowrap !important; margin-left: 4mm !important; }
  .warehouse-trip { display: flex !important; flex-wrap: wrap !important; gap: 1.5mm 6mm !important; font-size: 8pt !important; margin-top: 2mm !important; }
  .warehouse-table { width: 100% !important; border-collapse: collapse !important; table-layout: fixed !important; font-size: 9pt !important; }
  .warehouse-table th, .warehouse-table td { border: 1px solid #a7b0bc !important; padding: 1.4mm 2mm !important; text-align: left !important; vertical-align: top !important; line-height: 1.25 !important; }
  .warehouse-table th { background: #f1f4f7 !important; font-weight: 700 !important; }
  .warehouse-table th.warehouse-quantity, .warehouse-table td.warehouse-quantity { width: 17mm !important; text-align: center !important; vertical-align: middle !important; font-weight: 700 !important; }
  .warehouse-separate-table th { background: white !important; }
  .warehouse-separate-table tbody td { padding: .7mm 2mm !important; line-height: 1.18 !important; }
  .warehouse-separate-table .warehouse-category-heading td { background: white !important; border-top: 1pt solid #64748b !important; font-size: 7.8pt !important; font-weight: 800 !important; padding: .55mm 2mm !important; }
  .warehouse-separate-table .warehouse-product-line { display: flex !important; align-items: center !important; gap: 1.8mm !important; min-height: 3.7mm !important; }
  .warehouse-separate-table .warehouse-product-check { display: inline-block !important; width: 3.7mm !important; height: 3.7mm !important; border: 1pt solid #334155 !important; border-radius: 50% !important; flex: none !important; background: white !important; }
  .warehouse-loads { display: block !important; }
  .warehouse-load-table th { font-size: 7.5pt !important; padding: .8mm 1.2mm !important; }
  .warehouse-load-table .warehouse-order-row { break-inside: avoid !important; }
  .warehouse-load-table .warehouse-order-row td { padding: .65mm 1.2mm !important; line-height: 1.18 !important; }
  .warehouse-load-table .warehouse-order-cell { text-align: center !important; vertical-align: middle !important; font-size: 8.5pt !important; }
  .warehouse-load-table .warehouse-code-cell { text-align: center !important; vertical-align: middle !important; font-size: 8.5pt !important; font-weight: 700 !important; }
  .warehouse-load-table .warehouse-product-cell { font-size: 9pt !important; }
  .warehouse-load-table .warehouse-product-cell.warehouse-bulky { background: #e3e7e9 !important; }
  .warehouse-load-table .warehouse-product-line { display: flex !important; align-items: center !important; gap: 1.8mm !important; min-height: 4.8mm !important; }
  .warehouse-load-table .warehouse-product-check { display: inline-block !important; width: 4.1mm !important; height: 4.1mm !important; border: 1pt solid #334155 !important; border-radius: 50% !important; flex: none !important; background: white !important; }
  .warehouse-load-table .warehouse-product-quantity { display: inline-block !important; min-width: 3mm !important; font-weight: 700 !important; }
  .warehouse-load-table .warehouse-route-heading td { padding: 1mm 1.2mm !important; background: #eef2f6 !important; font-size: 8pt !important; font-weight: 700 !important; }
  .warehouse-load-table .warehouse-route-heading:not(:first-child) td { border-top: 1.5pt solid #64748b !important; padding-top: 1.5mm !important; }
  .warehouse-signoff { display: flex !important; gap: 12mm !important; margin-top: auto !important; padding: 6mm 0 3mm !important; }
  .warehouse-signoff h2 { margin: 0 0 5mm !important; font-size: 9pt !important; font-weight: 700 !important; }
  .warehouse-signoff-field { width: 50% !important; }
  .warehouse-signoff-field span { display: block !important; height: 6mm !important; border-bottom: 1px solid #475569 !important; }
  .warehouse-signoff-field small { display: block !important; margin-top: 1mm !important; font-size: 7pt !important; }
}`;

function separatePages(lines: WarehouseLine[]): WarehouseLine[][] {
  const pages: WarehouseLine[][] = [];
  let page: WarehouseLine[] = [];
  let units = 0;
  for (const line of lines) {
    const needsHeading = !page.length || page[page.length - 1].category !== line.category;
    const cost = 1 + (needsHeading ? 1 : 0);
    if (page.length && units + cost > 42) { pages.push(page); page = []; units = 0; }
    units += 1 + (!page.length || page[page.length - 1].category !== line.category ? 1 : 0);
    page.push(line);
  }
  if (page.length || !pages.length) pages.push(page);
  return pages;
}

function displayDate(value: string): string {
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return iso ? `${iso[3]}/${iso[2]}/${iso[1]}` : value || 'Sin fecha';
}

function loadPages(loads: WarehouseLoad[]): WarehouseLoad[][] {
  const pages: WarehouseLoad[][] = [];
  let page: WarehouseLoad[] = [];
  let height = 0;
  let lastRoute = '';
  for (const load of loads) {
    const lineCost = load.lines.reduce((units, line) => units + Math.max(1, Math.ceil(line.name.length / 75)), 0);
    let cost = .7 + lineCost + (!page.length || load.route !== lastRoute ? 1.5 : 0);
    if (page.length && height + cost > 51) { pages.push(page); page = []; height = 0; cost = .7 + lineCost + 1.5; }
    page.push(load);
    height += cost;
    lastRoute = load.route;
  }
  if (page.length || !pages.length) pages.push(page);
  return pages;
}

function TripHeader({ mode, date, driver, companion, vehicle, departure, page, pages }: {
  mode: WarehouseMode; date: string; driver: string; companion: string; vehicle: string; departure: string; page: number; pages: number;
}) {
  return <header className="warehouse-header">
    <div className="warehouse-heading"><div><small>DEPÓSITO · CONTROL DE MERCADERÍA</small><h1>{mode === 'separar-total' ? 'Separar mercadería · Total' : `${mode === 'separar' ? 'Separar mercadería' : 'Carga vehicular'}${driver ? ` (${driver})` : ''}`}</h1></div>{mode !== 'separar-total' && <strong>{date || 'Sin fecha'}</strong>}</div>
    <div className="warehouse-trip">{mode !== 'separar-total' && <><span>Acompañante: <b>{companion || '—'}</b></span><span>Vehículo: <b>{vehicle || '—'}</b></span><span>Salida: <b>{departure || '—'}</b></span></>}<span>Hoja: <b>{page} / {pages}</b></span></div>
  </header>;
}

function ProductRows({ lines }: { lines: WarehouseLine[] }) {
  return <>{lines.map((line, index) => <React.Fragment key={`${line.name}-${index}`}>
    {(index === 0 || lines[index - 1].category !== line.category) && <tr className="warehouse-category-heading"><td colSpan={2}>{line.category}</td></tr>}
    <tr><td className="warehouse-quantity">{line.quantity}</td><td><span className="warehouse-product-line"><span className="warehouse-product-check" aria-hidden="true" /><span>{line.name}</span></span></td></tr>
  </React.Fragment>)}</>;
}

export function PrintableWarehouse({ orders, mode, settings, categories }: { orders: LogisticsPrintOrder[]; mode: WarehouseMode; settings: OrderNoteSettings; categories?: string[] }) {
  if (typeof document === 'undefined') return null;
  const groups = mode === 'separar-total' ? [warehouseTotalGroup(orders, categories)] : warehouseGroups(orders, settings, categories);
  const sheets = groups.flatMap(group => {
    const pages = mode === 'cargar' ? loadPages(group.load) : separatePages(group.separate);
    return pages.map((rows, index) => ({ group, rows, page: index + 1, pages: pages.length }));
  });
  return createPortal(<div id="print-warehouse-root"><style>{warehousePrintStyles}</style>{sheets.map(({ group, rows, page, pages }, index) => <section className="warehouse-sheet" key={`${group.key}-${mode}-${page}-${index}`}>
    <TripHeader mode={mode} date={displayDate(group.deliveryDate)} driver={group.trip.driver} companion={group.trip.companion} vehicle={group.trip.vehicle} departure={group.trip.departure} page={page} pages={pages} />
    {mode !== 'cargar' ? <table className="warehouse-table warehouse-separate-table"><thead><tr><th className="warehouse-quantity">Cant.</th><th>Producto</th></tr></thead><tbody><ProductRows lines={rows as WarehouseLine[]} /></tbody></table>
      : <table className="warehouse-table warehouse-load-table"><colgroup><col style={{ width: '18mm' }} /><col style={{ width: '31mm' }} /><col /></colgroup><thead><tr><th>Orden</th><th>Código</th><th>Productos</th></tr></thead><tbody>{(rows as WarehouseLoad[]).map((load, loadIndex, pageLoads) => <React.Fragment key={`${load.code}-${loadIndex}`}>
        {(loadIndex === 0 || load.route !== pageLoads[loadIndex - 1].route) && <tr className="warehouse-route-heading"><td colSpan={3}>{new Set(group.load.map(order => order.route.toLocaleLowerCase('es'))).size === 1 ? 'Recorrido Único' : `Recorrido ${load.route || 'sin dato'}`}</td></tr>}
        <tr className="warehouse-order-row"><td className="warehouse-order-cell">{load.deliveryOrder || '—'}</td><td className="warehouse-code-cell">{load.code}</td><td className={`warehouse-product-cell ${load.lines.some(line => line.bulky) ? 'warehouse-bulky' : ''}`}>{load.lines.map((line, lineIndex) => <div className="warehouse-product-line" key={`${line.name}-${lineIndex}`}><span className="warehouse-product-check" aria-hidden="true" /><span className="warehouse-product-quantity">{line.quantity}</span><span>{line.name}</span></div>)}</td></tr>
      </React.Fragment>)}</tbody></table>}
    {mode === 'cargar' && page === pages && <div className="warehouse-signoff"><div className="warehouse-signoff-field"><h2>Responsable de Carga</h2><span></span><small>Nombre y apellido</small></div><div className="warehouse-signoff-field"><h2>&nbsp;</h2><span></span><small>Firma</small></div></div>}
  </section>)}</div>, document.body);
}

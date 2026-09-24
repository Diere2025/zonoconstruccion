"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckSquare, Loader2, Printer, RefreshCw, Search, Square } from 'lucide-react';
import {
  formatLegalRemittanceNumber,
  LogisticsRemittance
} from '@/lib/logisticsRemittances';

function dateParts(value: string): [string, string, string] {
  if (!value) return ['', '', ''];
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return [iso[3], iso[2], iso[1]];
  const local = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (local) return [local[1].padStart(2, '0'), local[2].padStart(2, '0'), local[3]];
  return [value, '', ''];
}

function buildSheets(remittances: LogisticsRemittance[]): LogisticsRemittance[][] {
  const sheets: LogisticsRemittance[][] = [];
  for (let index = 0; index < remittances.length; index += 2) {
    sheets.push(remittances.slice(index, index + 2));
  }
  return sheets;
}

function LegalRemittance({ remittance }: { remittance: LogisticsRemittance }) {
  const domicile = [remittance.address, remittance.locality].filter(Boolean).join(' - ');
  const customer = remittance.orderCode
    ? `${remittance.customerName} (${remittance.orderCode})`
    : remittance.customerName;
  const [day, month, year] = dateParts(remittance.deliveryDate);

  return (
    <article className="legal-remittance">
      <img className="legal-remittance-template" src="/remito-zono-cai.png" alt="" />
      <div className="legal-remittance-number">{formatLegalRemittanceNumber(remittance.remittanceNumber)}</div>
      <div className="legal-remittance-date">
        <svg className="legal-remittance-date-cleaner" viewBox="0 0 100 20" preserveAspectRatio="none" aria-hidden="true">
          <rect width="100" height="20" fill="white" />
        </svg>
        <div className="legal-remittance-date-fields">
          <span>{day}</span><b>/</b><span>{month}</span><b>/</b><span className="year">{year}</span>
        </div>
      </div>
      <div className="legal-remittance-customer">{customer}</div>
      <div className="legal-remittance-address">{domicile}</div>
      <div className="legal-remittance-items">
        {remittance.items.slice(0, 10).map((item, index) => (
          <div className="legal-remittance-item" key={`${item.name}-${index}`}>
            <span>{item.quantity}</span>
            <span>{item.name}</span>
          </div>
        ))}
      </div>
    </article>
  );
}

export function PrintableRemittances({ remittances }: { remittances: LogisticsRemittance[] }) {
  if (typeof document === 'undefined') return null;
  const sheets = buildSheets(remittances);
  const content = (
    <div id="print-legal-remittances-root">
      {sheets.map((sheet, index) => (
        <section className="legal-remittance-sheet" key={`${sheet.map(item => item.id).join('-')}-${index}`}>
          {sheet.map(remittance => <LegalRemittance key={remittance.id} remittance={remittance} />)}
        </section>
      ))}
    </div>
  );
  return createPortal(content, document.body);
}

export default function LogisticsRemittancesPanel() {
  const [remittances, setRemittances] = useState<LogisticsRemittance[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [printQueue, setPrintQueue] = useState<LogisticsRemittance[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadRemittances = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await fetch('/api/logistica/remitos-planilla', { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'No se pudo leer la planilla.');
      const next = (payload.remittances || []) as LogisticsRemittance[];
      setRemittances(next);
      setSelected(new Set(next.map(item => item.id)));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudo leer la planilla.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadRemittances(); }, []);
  useEffect(() => {
    const clearQueue = () => setPrintQueue([]);
    window.addEventListener('afterprint', clearQueue);
    return () => window.removeEventListener('afterprint', clearQueue);
  }, []);

  useEffect(() => {
    if (printQueue.length === 0) return;
    // Chrome no siempre aplica las páginas CSS con nombre al elegir la
    // orientación inicial. Esta regla, agregada al final del <head> sólo
    // durante la impresión, fuerza la hoja física A4 horizontal.
    const pageStyle = document.createElement('style');
    pageStyle.dataset.legalRemittancePrint = 'true';
    pageStyle.textContent = '@media print { @page { size: A4 landscape; margin: 0; } }';
    document.head.appendChild(pageStyle);
    return () => pageStyle.remove();
  }, [printQueue.length]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return remittances;
    return remittances.filter(item => [item.sheetLabel, item.orderCode, item.customerName, item.address, item.locality]
      .some(value => value.toLowerCase().includes(term)));
  }, [remittances, search]);

  const selectedRemittances = remittances.filter(item => selected.has(item.id));
  const toggle = (id: string) => setSelected(current => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleVisible = () => {
    const allSelected = filtered.length > 0 && filtered.every(item => selected.has(item.id));
    setSelected(current => {
      const next = new Set(current);
      filtered.forEach(item => allSelected ? next.delete(item.id) : next.add(item.id));
      return next;
    });
  };
  const handlePrint = () => {
    if (selectedRemittances.length === 0) return;
    setPrintQueue(selectedRemittances);
    window.setTimeout(() => window.print(), 150);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h2 className="text-sm font-black text-slate-900">Remitos CAI desde la planilla de logística</h2>
          <p className="mt-1 text-[11px] font-semibold text-slate-500">
            Los pedidos vinculados se unifican y sus productos se distribuyen en remitos de hasta 10 renglones. Se imprimen dos remitos por hoja A4 apaisada.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={loadRemittances} disabled={loading} className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 hover:bg-slate-100 disabled:opacity-50">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Actualizar
          </button>
          <button type="button" onClick={handlePrint} disabled={selectedRemittances.length === 0 || loading} className="flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-black text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-40">
            <Printer className="h-3.5 w-3.5" /> Imprimir {selectedRemittances.length || ''}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar remito, pedido, cliente o domicilio..." className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-xs font-bold outline-none focus:border-slate-500" />
        </div>
        <button type="button" onClick={toggleVisible} disabled={filtered.length === 0} className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-[10px] font-black uppercase text-slate-600 hover:bg-slate-50 disabled:opacity-40">
          {filtered.length > 0 && filtered.every(item => selected.has(item.id)) ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
          Seleccionar visibles
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-xs font-bold text-slate-500"><Loader2 className="h-5 w-5 animate-spin" /> Leyendo planilla...</div>
      ) : error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs font-bold text-rose-700">{error}</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 py-16 text-center text-xs font-bold text-slate-400">
          No hay filas de remitos cargadas actualmente en la pestaña Imprimir.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200">
          <table className="w-full border-collapse text-left text-xs">
            <thead className="bg-slate-50 text-[9px] font-black uppercase tracking-wider text-slate-400">
              <tr><th className="w-10 px-3 py-2"></th><th className="px-3 py-2">Remito</th><th className="px-3 py-2">Cliente</th><th className="px-3 py-2">Domicilio</th><th className="px-3 py-2 text-center">Productos</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(item => (
                <tr key={item.id} onClick={() => toggle(item.id)} className="cursor-pointer hover:bg-slate-50">
                  <td className="px-3 py-2"><input type="checkbox" checked={selected.has(item.id)} onChange={() => toggle(item.id)} onClick={event => event.stopPropagation()} className="h-4 w-4 accent-slate-900" /></td>
                  <td className="px-3 py-2 font-mono text-[10px] font-black text-slate-800">{formatLegalRemittanceNumber(item.remittanceNumber)}</td>
                  <td className="px-3 py-2 font-extrabold text-slate-800">
                    {item.customerName}
                    {item.orderCode && <span className="ml-1 text-[9px] text-slate-500">({item.orderCode})</span>}
                    {item.partCount > 1 && <span className="ml-2 rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[8px] text-amber-800">PARTE {item.partNumber}/{item.partCount}</span>}
                  </td>
                  <td className="px-3 py-2 text-[10px] font-bold text-slate-600">{[item.address, item.locality].filter(Boolean).join(' · ')}</td>
                  <td className="px-3 py-2 text-center font-black text-slate-700">{item.items.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <PrintableRemittances remittances={printQueue} />
    </div>
  );
}

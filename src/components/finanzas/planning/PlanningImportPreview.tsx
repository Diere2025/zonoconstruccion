'use client';

import React, { useState } from 'react';
import { AlertCircle, FileSpreadsheet, Loader2, X } from 'lucide-react';
import type { Fund } from '@/lib/paymentPlanning/model';

type ImportRow = { source_key: string; fund_id: string; record_type: 'item' | 'reservation'; kind: string; title: string; amount: string; date: string; notes: string };
type PreviewRow = { key: string; date: string; fund: string; title: string; effect: number | null; proposed: string; record: ImportRow | null; reason?: string };
type Preview = { sourceHash: string; sourceName: string; rows: PreviewRow[]; totalExamined: number };

const dateNumber = (value: string) => value ? `${value.slice(8,10)}/${value.slice(5,7)}/${value.slice(0,4)}` : '';

export default function PlanningImportPreview({ funds, from, to, onClose, onApply }: {
  funds: Fund[]; from: string; to: string; onClose: () => void;
  onApply: (data: { source_hash: string; source_name: string; rows: ImportRow[] }) => Promise<void>;
}) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');
  const fundByKind = (kind: Fund['kind']) => funds.find(fund => fund.kind === kind && fund.currency === 'ARS');

  const inspect = async (file: File) => {
    setLoading(true); setError(''); setSelected(new Set()); setPreview(null);
    try {
      const XLSX = await import('xlsx');
      const bytes = await file.arrayBuffer();
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      const sourceHash = Array.from(new Uint8Array(digest)).map(n => n.toString(16).padStart(2,'0')).join('');
      const book = XLSX.read(bytes, { type: 'array', cellDates: false, cellFormula: true });
      const sheet = book.Sheets['Actual'];
      if (!sheet) throw new Error('El archivo necesita una hoja llamada Actual.');
      const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null });
      const parsed: PreviewRow[] = [];
      let totalExamined = 0;
      const blocks = [
        { kind: 'cash' as const, date: 1, title: 3, effect: 5, notes: 7 },
        { kind: 'personal' as const, date: 9, title: 11, effect: 13, notes: 15 },
        { kind: 'company' as const, date: 17, title: 19, effect: 21, notes: 23 }
      ];
      const dateValue = (value: unknown): string => {
        if (value instanceof Date) return value.toISOString().slice(0,10);
        if (typeof value === 'number') {
          const date = XLSX.SSF.parse_date_code(value);
          if (date) return `${date.y}-${String(date.m).padStart(2,'0')}-${String(date.d).padStart(2,'0')}`;
        }
        return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0,10) : '';
      };
      for (let index=2; index<raw.length; index++) for (const block of blocks) {
        const row = raw[index] || [];
        const date = dateValue(row[block.date]);
        const title = String(row[block.title] ?? '').trim();
        if (!date || !title) continue;
        totalExamined++;
        if (date < from || date > to) continue;
        const source_key = `Actual:${block.kind}:${index+1}`;
        const fund = fundByKind(block.kind);
        const effectRaw = row[block.effect];
        const effect = typeof effectRaw === 'number' && Number.isFinite(effectRaw) ? effectRaw : null;
        const normalized = title.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
        let record: ImportRow | null = null;
        let proposed = 'Revisar';
        let reason = '';
        if (!fund) reason = 'Falta el fondo ARS correspondiente.';
        else if (effect === null) reason = 'Sin importe calculado; revisar la fórmula o la fila.';
        else if (/saldo inicial/.test(normalized)) { proposed = 'Saldo de control'; reason = 'Cargar la apertura observada por separado.'; }
        else if (/ingresos estimados|rendiciones y ventas depo/.test(normalized)) { proposed = 'Escenario'; reason = 'Crear la regla de ingreso por escenario para evitar duplicación.'; }
        else {
          const amount = Math.abs(effect).toFixed(2);
          const notes = String(row[block.notes] ?? '').slice(0,2000);
          const common = { source_key, fund_id: fund.id, title, amount, date, notes };
          if (/reserva de sueldos?/.test(normalized) && effect < 0) {
            proposed='Reserva'; record={...common,record_type:'reservation',kind:'reserve'};
          } else if (/reingreso sueldos?/.test(normalized) && effect > 0) {
            proposed='Liberación'; record={...common,record_type:'reservation',kind:'release'};
          } else {
            proposed=effect>=0?'Ingreso':'Pago';
            record={...common,record_type:'item',kind:effect>=0?'income':'expense'};
            if (/ajuste|reintegro|transferencia/.test(normalized)) reason='Clasificación propuesta; verificar antes de incluir.';
          }
        }
        parsed.push({ key:source_key,date,fund:fund?.name||block.kind,title,effect,proposed,record,reason });
      }
      setPreview({ sourceHash,sourceName:file.name,rows:parsed,totalExamined });
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo leer el archivo.'); }
    finally { setLoading(false); }
  };

  const apply = async () => {
    if (!preview) return;
    const rows = preview.rows.filter(row=>selected.has(row.key)).map(row=>row.record).filter((row): row is ImportRow=>!!row);
    if (!rows.length) { setError('Seleccioná al menos una fila revisada.'); return; }
    setLoading(true); setError('');
    try {
      for (let offset=0; offset<rows.length; offset+=250) {
        const chunk=rows.slice(offset,offset+250);
        setProgress(`Importando ${Math.min(offset+250,rows.length)} de ${rows.length}…`);
        await onApply({ source_hash:preview.sourceHash,source_name:preview.sourceName,rows:chunk });
      }
      onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'La importación se interrumpió. Podés reintentar sin duplicar las filas ya guardadas.'); }
    finally { setLoading(false); setProgress(''); }
  };
  const eligible=preview?.rows.filter(row=>!!row.record) || [];
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3"><section className="flex max-h-[95vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"><div className="flex items-start justify-between border-b border-slate-200 p-5"><div><h2 className="flex items-center gap-2 text-xl font-semibold"><FileSpreadsheet size={21}/> Importar planilla</h2><p className="mt-1 text-sm text-slate-500">Vista previa de Actual del {dateNumber(from)} al {dateNumber(to)}. Seleccioná solo filas pendientes y verificadas.</p></div><button aria-label="Cerrar" onClick={onClose}><X size={20}/></button></div><div className="space-y-3 border-b border-slate-100 p-4"><label className="block text-sm font-medium">Archivo XLSX<input type="file" accept=".xlsx,.xls" onChange={event=>{const file=event.target.files?.[0]; if(file) void inspect(file);}} className="mt-1 block w-full rounded-lg border border-slate-200 p-2 text-sm"/></label>{preview&&<p className="text-sm text-slate-600">{preview.rows.length} filas del período · {eligible.length} candidatas · {selected.size} seleccionadas. Se examinaron {preview.totalExamined} filas con detalle en Actual. Los saldos de apertura y los ingresos de escenario se cargan aparte.</p>}{error&&<p role="alert" className="flex items-start gap-2 rounded-lg bg-red-50 p-2 text-sm text-red-700"><AlertCircle size={16}/>{error}</p>}</div><div className="min-h-32 flex-1 overflow-auto"><table className="w-full min-w-[760px] text-sm"><thead className="sticky top-0 bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-3 py-2 text-left"><input type="checkbox" aria-label="Seleccionar candidatas" checked={eligible.length>0&&selected.size===eligible.length} onChange={event=>setSelected(event.target.checked?new Set(eligible.map(row=>row.key)):new Set())}/></th><th className="px-3 py-2 text-left">Fecha</th><th className="px-3 py-2 text-left">Fondo</th><th className="px-3 py-2 text-left">Detalle</th><th className="px-3 py-2 text-right">Efecto</th><th className="px-3 py-2 text-left">Propuesta</th></tr></thead><tbody className="divide-y divide-slate-100">{preview?.rows.map(row=><tr key={row.key}><td className="px-3 py-2"><input type="checkbox" disabled={!row.record} checked={selected.has(row.key)} onChange={event=>setSelected(previous=>{const next=new Set(previous); if(event.target.checked)next.add(row.key); else next.delete(row.key); return next;})}/></td><td className="whitespace-nowrap px-3 py-2">{dateNumber(row.date)}</td><td className="px-3 py-2">{row.fund}</td><td className="max-w-72 px-3 py-2"><span className="block truncate font-medium" title={row.title}>{row.title}</span>{row.reason&&<span className="text-xs text-amber-700">{row.reason}</span>}</td><td className="px-3 py-2 text-right tabular-nums">{row.effect===null?'—':new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS'}).format(row.effect)}</td><td className="px-3 py-2">{row.proposed}</td></tr>)}{!preview?.rows.length&&<tr><td colSpan={6} className="p-10 text-center text-slate-500">{loading?'Leyendo archivo…':'Seleccioná un archivo para revisar las filas.'}</td></tr>}</tbody></table></div><div className="flex items-center justify-between gap-3 border-t border-slate-200 p-4"><p className="text-xs text-slate-500">Importar registra previsiones en el ERP. No marca pagos como realizados.</p><div className="flex gap-2"><button onClick={onClose} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">Cerrar</button><button disabled={loading||selected.size===0} onClick={()=>void apply()} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{loading?<span className="flex items-center gap-1"><Loader2 size={15} className="animate-spin"/>{progress||'Leyendo…'}</span>:`Importar ${selected.size}`}</button></div></div></section></div>;
}

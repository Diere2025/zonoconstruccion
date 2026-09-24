"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckSquare,
  ClipboardPaste,
  FileCheck2,
  Loader2,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Square,
  Trash2
} from 'lucide-react';
import { LogisticsPrintOrder } from '@/lib/logisticsPrintOrders';
import { LogisticsRemittance } from '@/lib/logisticsRemittances';
import { waitForPrintImages } from '@/lib/printAssets';
import { supabase } from '@/lib/supabase';
import {
  LOGISTICS_MAX_COLUMNS,
  noteTripFromPastedRows,
  normalizeLogisticsPastedRows,
  parseQuotedTsv
} from '@/lib/logisticsPaste';
import { DEFAULT_ORDER_NOTE_RATES } from '@/lib/logisticsOrderNotes';
import {
  buildReceiptSheets,
  PerPage,
  PrintableReceipts
} from '@/components/logistica/LogisticsReceiptsPanel';
import { PrintableRemittances } from '@/components/logistica/LogisticsRemittancesPanel';
import { OrderNoteSettings, PrintableOrderNotes } from '@/components/logistica/LogisticsOrderNotesPanel';
import { PrintableConformity } from '@/components/logistica/LogisticsConformityPanel';

type DataSource = 'comprobantes' | 'remitos' | 'pegado';
type OutputType = 'comprobantes' | 'remitos' | 'nota-pedido' | 'conformidad';
type PrintStage = OutputType | null;
const PRINT_OUTPUTS: OutputType[] = ['comprobantes', 'remitos', 'nota-pedido', 'conformidad'];

interface PrintingPayload {
  orders: LogisticsPrintOrder[];
  remittances: LogisticsRemittance[];
}

interface GridColumn {
  index: number;
  label: string;
  width: string;
}

interface MultipleDocumentWarning {
  code: string;
  count: number;
  documentLabel: 'comprobantes' | 'remitos';
}

const BASE_COLUMNS: GridColumn[] = [
  { index: 1, label: 'Código', width: '120px' },
  { index: 2, label: 'Entrega', width: '105px' },
  { index: 5, label: 'Cliente', width: '190px' },
  { index: 10, label: 'Detalle / vinculación', width: '190px' },
  { index: 17, label: 'Localidad', width: '140px' },
  { index: 18, label: 'Dirección', width: '220px' },
  { index: 21, label: 'Forma de pago', width: '150px' },
  { index: 23, label: 'Estado', width: '110px' },
  { index: 24, label: 'Abonado', width: '95px' },
  { index: 25, label: 'IVA / recargo', width: '105px' },
  { index: 26, label: 'Transporte', width: '120px' },
  { index: 27, label: 'Costo transporte', width: '115px' },
  { index: 28, label: 'Productos', width: '105px' },
  { index: 29, label: 'Saldo', width: '95px' }
];

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
  return iso ? `${iso[3]}/${iso[2]}/${iso[1]}` : value;
}

function emptyGridRow(): string[] {
  return Array(LOGISTICS_MAX_COLUMNS).fill('');
}

function emptyNoteSettings(): OrderNoteSettings {
  return {
    driver: '',
    companion: '',
    vehicle: '',
    departure: '',
    changeAmount: '',
    posnetRates: [...DEFAULT_ORDER_NOTE_RATES]
  };
}

function ensureTrailingEmptyRow(rows: string[][]): string[][] {
  const lastRow = rows[rows.length - 1];
  const lastRowHasContent = lastRow?.some(cell => String(cell || '').trim());
  return !lastRow || lastRowHasContent ? [...rows, emptyGridRow()] : rows;
}

function visibleProductSlots(rows: string[][]): number {
  let lastSlot = 0;
  for (let slot = 0; slot < 12; slot++) {
    const start = 30 + slot * 4;
    if (rows.some(row => row.slice(start, start + 4).some(cell => String(cell || '').trim()))) {
      lastSlot = slot + 1;
    }
  }
  return Math.max(1, lastSlot);
}

function gridColumns(rows: string[][]): GridColumn[] {
  const columns = [...BASE_COLUMNS];
  for (let slot = 0; slot < visibleProductSlots(rows); slot++) {
    const start = 30 + slot * 4;
    columns.push(
      { index: start, label: `Producto ${slot + 1}`, width: '210px' },
      { index: start + 1, label: 'Cant.', width: '70px' },
      { index: start + 2, label: 'P. unitario', width: '95px' },
      { index: start + 3, label: 'Importe', width: '95px' }
    );
  }
  return columns;
}

export default function LogisticsPrintingPanel() {
  const initialSource: DataSource = 'pegado';
  const [source, setSource] = useState<DataSource>(initialSource);
  const [perPage, setPerPage] = useState<PerPage>(2);
  const [rawOrders, setRawOrders] = useState<LogisticsPrintOrder[]>([]);
  const [remittances, setRemittances] = useState<LogisticsRemittance[]>([]);
  const [ignoreEncCodes, setIgnoreEncCodes] = useState(true);
  const [ignoredEncCodes, setIgnoredEncCodes] = useState<string[]>([]);
  const [showIgnoredEncWarning, setShowIgnoredEncWarning] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pastedRows, setPastedRows] = useState<string[][]>([emptyGridRow()]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [printStage, setPrintStage] = useState<PrintStage>(null);
  const [printOrders, setPrintOrders] = useState<LogisticsPrintOrder[]>([]);
  const [printRemittances, setPrintRemittances] = useState<LogisticsRemittance[]>([]);
  const [noteSettings, setNoteSettings] = useState<OrderNoteSettings>(emptyNoteSettings);
  const [paywayDraft, setPaywayDraft] = useState<string[]>(DEFAULT_ORDER_NOTE_RATES.map(String));
  const [paywaySavedRates, setPaywaySavedRates] = useState<number[]>([...DEFAULT_ORDER_NOTE_RATES]);
  const [paywayCanEdit, setPaywayCanEdit] = useState(false);
  const [paywayStatus, setPaywayStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [paywaySaving, setPaywaySaving] = useState(false);
  const [paywayMessage, setPaywayMessage] = useState('');
  const [multipleDocumentWarnings, setMultipleDocumentWarnings] = useState<MultipleDocumentWarning[]>([]);
  const [showPrintWarning, setShowPrintWarning] = useState(false);
  const [multiSelected, setMultiSelected] = useState<Record<OutputType, boolean>>({
    comprobantes: true,
    remitos: true,
    'nota-pedido': true,
    conformidad: true
  });
  const remainingStages = useRef<Exclude<PrintStage, null>[]>([]);
  const pendingPrintTypes = useRef<OutputType[]>([]);

  const loadPaywayRates = async () => {
    setPaywayStatus('loading');
    setPaywayMessage('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Iniciá sesión para consultar los recargos de cuotas.');
      const response = await fetch('/api/logistica/nota-pedido-config', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: 'no-store'
      });
      const payload = await response.json() as { rates?: number[]; canEdit?: boolean; error?: string };
      if (!response.ok || !payload.rates) throw new Error(payload.error || 'No se pudieron cargar los recargos de cuotas.');
      setPaywaySavedRates(payload.rates);
      setPaywayDraft(payload.rates.map(String));
      setPaywayCanEdit(payload.canEdit === true);
      setNoteSettings(current => ({ ...current, posnetRates: payload.rates! }));
      setPaywayStatus('ready');
    } catch (loadError) {
      setPaywayStatus('error');
      setPaywayMessage(loadError instanceof Error ? loadError.message : 'No se pudieron cargar los recargos de cuotas.');
    }
  };

  useEffect(() => {
    if (paywayStatus === 'idle') void loadPaywayRates();
  }, [paywayStatus]);

  const savePaywayRates = async () => {
    if (!paywayCanEdit || paywaySaving) return;
    const rates = paywayDraft.map(value => Number(value));
    if (paywayDraft.some(value => !value.trim()) || rates.some(value => !Number.isFinite(value) || value < 0 || value > 300)) {
      setPaywayMessage('Ingresá cinco recargos válidos entre 0% y 300%.');
      return;
    }
    setPaywaySaving(true);
    setPaywayMessage('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('La sesión venció. Volvé a iniciar sesión.');
      const response = await fetch('/api/logistica/nota-pedido-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ rates })
      });
      const payload = await response.json() as { rates?: number[]; error?: string };
      if (!response.ok || !payload.rates) throw new Error(payload.error || 'No se pudieron guardar los recargos de cuotas.');
      setPaywaySavedRates(payload.rates);
      setPaywayDraft(payload.rates.map(String));
      setNoteSettings(current => ({ ...current, posnetRates: payload.rates! }));
      setPaywayMessage('Recargos de cuotas guardados.');
    } catch (saveError) {
      setPaywayMessage(saveError instanceof Error ? saveError.message : 'No se pudieron guardar los recargos de cuotas.');
    } finally {
      setPaywaySaving(false);
    }
  };

  const orders = useMemo(() => ignoreEncCodes
    ? rawOrders.filter(order => !order.codes.some(code => /^ENC/i.test(code)))
    : rawOrders,
  [ignoreEncCodes, rawOrders]);

  const applyPayload = (payload: PrintingPayload) => {
    const nextOrders = payload.orders || [];
    const nextIgnoredCodes = Array.from(new Set(nextOrders
      .flatMap(order => order.codes)
      .filter(code => /^ENC/i.test(code))));
    setRawOrders(nextOrders);
    setRemittances(payload.remittances || []);
    setSelected(new Set(nextOrders
      .filter(order => !ignoreEncCodes || !order.codes.some(code => /^ENC/i.test(code)))
      .map(order => order.id)));
    if (ignoreEncCodes && nextIgnoredCodes.length > 0) {
      setIgnoredEncCodes(nextIgnoredCodes);
      setShowIgnoredEncWarning(true);
    }
  };

  const loadSource = async (nextSource: Exclude<DataSource, 'pegado'> = source as Exclude<DataSource, 'pegado'>) => {
    try {
      setLoading(true);
      setError('');
      const response = await fetch(`/api/logistica/impresion?source=${nextSource}`, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'No se pudo leer la planilla.');
      applyPayload(payload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudo leer la planilla.');
    } finally {
      setLoading(false);
    }
  };

  const processPastedRows = async (rows = pastedRows) => {
    const nonEmptyRows = rows.filter(row => row.some(cell => String(cell || '').trim()));
    if (nonEmptyRows.length === 0) {
      setRawOrders([]);
      setRemittances([]);
      setSelected(new Set());
      return;
    }
    try {
      setLoading(true);
      setError('');
      const response = await fetch('/api/logistica/impresion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: nonEmptyRows.map(row => row.slice(0, LOGISTICS_MAX_COLUMNS)) })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'No se pudo procesar el contenido pegado.');
      applyPayload(payload);
    } catch (pasteError) {
      setError(pasteError instanceof Error ? pasteError.message : 'No se pudo procesar el contenido pegado.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const afterPrint = () => {
      const nextStage = remainingStages.current.shift() || null;
      if (nextStage) {
        setPrintStage(nextStage);
      } else {
        setPrintStage(null);
        setPrintOrders([]);
        setPrintRemittances([]);
      }
    };
    window.addEventListener('afterprint', afterPrint);
    return () => window.removeEventListener('afterprint', afterPrint);
  }, []);

  useEffect(() => {
    if (!printStage) return;
    let pageStyle: HTMLStyleElement | null = null;
    let cancelled = false;
    let timer: number | null = null;
    if (printStage === 'remitos' || printStage === 'nota-pedido' || printStage === 'conformidad') {
      pageStyle = document.createElement('style');
      pageStyle.dataset.unifiedLogisticsPrint = 'true';
      pageStyle.textContent = `@media print { @page { size: A4 ${printStage === 'conformidad' ? 'portrait' : 'landscape'}; margin: 0; } }`;
      document.head.appendChild(pageStyle);
    }
    const rootId = printStage === 'remitos'
      ? 'print-legal-remittances-root'
      : printStage === 'nota-pedido'
        ? 'print-order-notes-root'
        : printStage === 'conformidad'
          ? 'print-conformity-root'
          : 'print-logistics-receipts-root';
    void waitForPrintImages(rootId).then(() => {
      if (!cancelled) timer = window.setTimeout(() => window.print(), 50);
    });
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
      pageStyle?.remove();
    };
  }, [printStage]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return orders;
    return orders.filter(order => [order.legacyCode, order.customerName, order.locality, order.address]
      .some(value => value.toLowerCase().includes(term)));
  }, [orders, search]);

  const selectedOrders = useMemo(() => orders.filter(order => selected.has(order.id)), [orders, selected]);
  const multiPrintTypes = PRINT_OUTPUTS.filter(type => multiSelected[type]);
  const paywayDirty = paywayCanEdit && paywayDraft.some((value, index) => !value.trim() || Number(value) !== paywaySavedRates[index]);
  const selectedRemittances = useMemo(() => {
    const codes = new Set(selectedOrders.flatMap(order => order.codes));
    return remittances.filter(remittance => remittance.orderCodes.some(code => codes.has(code)));
  }, [remittances, selectedOrders]);
  const columns = useMemo(() => gridColumns(pastedRows), [pastedRows]);
  const receiptSheets = useMemo(() => buildReceiptSheets(printOrders, perPage), [printOrders, perPage]);

  const selectSource = (nextSource: DataSource) => {
    setSource(nextSource);
    setError('');
    if (nextSource === 'pegado') {
      setRawOrders([]);
      setRemittances([]);
      setSelected(new Set());
    } else {
      loadSource(nextSource);
    }
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    const html = event.clipboardData.getData('text/html');
    let clipboardRows: string[][] = [];
    if (html) {
      const documentFragment = new DOMParser().parseFromString(html, 'text/html');
      clipboardRows = Array.from(documentFragment.querySelectorAll('table tr')).map(tableRow =>
        Array.from(tableRow.querySelectorAll('th, td')).map(cell => cell.textContent || '')
      );
    }
    if (clipboardRows.length === 0) clipboardRows = parseQuotedTsv(event.clipboardData.getData('text/plain'));
    const rows = normalizeLogisticsPastedRows(clipboardRows);
    if (rows.length === 0) return;
    event.preventDefault();
    const existingRows = pastedRows.filter(row => row.some(cell => String(cell || '').trim()));
    if (existingRows.length === 0) {
      const trip = noteTripFromPastedRows(clipboardRows);
      if (trip) setNoteSettings(current => ({
        ...current,
        driver: trip.driver || current.driver,
        vehicle: trip.vehicle || current.vehicle,
        companion: trip.companion || current.companion
      }));
    }
    const combinedRows = existingRows.length > 0 ? [...existingRows, ...rows] : rows;
    setSource('pegado');
    setPastedRows(ensureTrailingEmptyRow(combinedRows));
    processPastedRows(combinedRows);
  };

  const addEmptyRow = () => {
    setSource('pegado');
    setPastedRows(current => {
      const hasOnlyInitialEmptyRow = current.length === 1 && current[0].every(cell => !String(cell || '').trim());
      return hasOnlyInitialEmptyRow ? current : [...current, emptyGridRow()];
    });
  };

  const clearGrid = () => {
    setSource('pegado');
    setPastedRows([emptyGridRow()]);
    setRawOrders([]);
    setRemittances([]);
    setSelected(new Set());
    setSearch('');
    setError('');
    setNoteSettings(current => ({ ...emptyNoteSettings(), posnetRates: current.posnetRates }));
  };

  const updateCell = (rowIndex: number, columnIndex: number, value: string) => {
    setPastedRows(current => ensureTrailingEmptyRow(current.map((row, index) => {
      if (index !== rowIndex) return row;
      const next = [...row];
      next[columnIndex] = value;
      return next;
    })));
  };

  const toggle = (id: string) => setSelected(current => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const toggleVisible = () => {
    const allSelected = filtered.length > 0 && filtered.every(order => selected.has(order.id));
    setSelected(current => {
      const next = new Set(current);
      filtered.forEach(order => allSelected ? next.delete(order.id) : next.add(order.id));
      return next;
    });
  };

  const toggleIgnoreEncCodes = (ignore: boolean) => {
    setIgnoreEncCodes(ignore);
    const encOrders = rawOrders.filter(order => order.codes.some(code => /^ENC/i.test(code)));
    setSelected(current => {
      const next = new Set(current);
      encOrders.forEach(order => ignore ? next.delete(order.id) : next.add(order.id));
      return next;
    });
    if (ignore && encOrders.length > 0) {
      setIgnoredEncCodes(Array.from(new Set(encOrders.flatMap(order => order.codes).filter(code => /^ENC/i.test(code)))));
      setShowIgnoredEncWarning(true);
    }
  };

  const startPrint = (types: OutputType[]) => {
    if (selectedOrders.length === 0 || types.length === 0) return;
    setPrintOrders(selectedOrders);
    setPrintRemittances(selectedRemittances);
    remainingStages.current = types.slice(1);
    setPrintStage(types[0]);
  };

  const handlePrint = (types: OutputType[]) => {
    if (selectedOrders.length === 0 || types.length === 0 || printStage !== null) return;
    if (types.includes('remitos') && selectedRemittances.length === 0) return;
    if (types.includes('nota-pedido') && (paywayStatus !== 'ready' || paywaySaving || paywayDirty)) return;
    const warnings: MultipleDocumentWarning[] = [];

    for (const type of types) {
      if (type !== 'comprobantes' && type !== 'remitos') continue;
      const counts = new Map<string, number>();
      if (type === 'remitos') {
        for (const remittance of selectedRemittances) {
          const code = remittance.orderCode || remittance.sheetLabel;
          counts.set(code, (counts.get(code) || 0) + 1);
        }
      } else {
        for (const order of selectedOrders) {
          const code = order.legacyCode || order.codes.join(' / ');
          counts.set(code, (counts.get(code) || 0) + 1);
        }
      }
      warnings.push(...Array.from(counts.entries())
        .filter(([, count]) => count > 1)
        .map(([code, count]) => ({ code, count, documentLabel: type })));
    }

    if (warnings.length > 0) {
      pendingPrintTypes.current = types;
      setMultipleDocumentWarnings(warnings);
      setShowPrintWarning(true);
      return;
    }
    startPrint(types);
  };

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-[10px] font-black uppercase tracking-wide text-slate-500">Imprimir selección</span>
          {([
            ['comprobantes', 'Comprobantes'],
            ['remitos', 'Remitos'],
            ['nota-pedido', 'Planilla de entregas y cobros'],
            ['conformidad', 'Conformidad']
          ] as const).map(([type, label]) => (
            <div key={type} className="flex items-center rounded-xl border border-slate-300 bg-white p-1">
              <label className="flex h-7 w-7 items-center justify-center" title={`Incluir ${label} en Imprimir varios`}>
                <input
                  type="checkbox"
                  aria-label={`Incluir ${label} en Imprimir varios`}
                  checked={multiSelected[type]}
                  onChange={event => setMultiSelected(current => ({ ...current, [type]: event.target.checked }))}
                  className="h-4 w-4 accent-slate-900"
                />
              </label>
              <button type="button" onClick={() => handlePrint([type])} disabled={selectedOrders.length === 0 || loading || printStage !== null || (type === 'remitos' && selectedRemittances.length === 0) || (type === 'nota-pedido' && (paywayStatus !== 'ready' || paywaySaving || paywayDirty))} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-black text-slate-800 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40">
                <Printer className="h-3.5 w-3.5" /> {label}
              </button>
            </div>
          ))}
          <button type="button" onClick={() => handlePrint(multiPrintTypes)} disabled={selectedOrders.length === 0 || multiPrintTypes.length === 0 || loading || printStage !== null || (multiSelected.remitos && selectedRemittances.length === 0) || (multiSelected['nota-pedido'] && (paywayStatus !== 'ready' || paywaySaving || paywayDirty))} className="flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-black text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40">
            <Printer className="h-3.5 w-3.5" /> Imprimir varios
          </button>
          {selectedOrders.length > 0 && <span className="ml-auto text-[10px] font-bold text-slate-500">{selectedOrders.length} {selectedOrders.length === 1 ? 'pedido seleccionado' : 'pedidos seleccionados'}</span>}
        </div>
        <p className="mt-2 text-[10px] font-semibold text-slate-500">Las casillas definen qué documentos incluye “Imprimir varios”. Se abrirá una vista de impresión por cada tipo seleccionado; los botones también funcionan por separado.</p>
        <div className="mt-4 flex flex-col gap-3 border-t border-slate-200 pt-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h2 className="text-sm font-black text-slate-900">Origen y formato de impresión</h2>
            <p className="mt-1 text-[11px] font-semibold text-slate-500">Elegí de dónde leer los pedidos y ajustá el formato antes de imprimir.</p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label>
              <span className="mb-1 block text-[9px] font-black uppercase tracking-wider text-slate-400">Origen</span>
              <select value={source} onChange={event => selectSource(event.target.value as DataSource)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 outline-none">
                <option value="comprobantes">Planilla de comprobantes</option>
                <option value="remitos">Planilla de remitos</option>
                <option value="pegado">Pegado manual</option>
              </select>
            </label>
            <label>
              <span className="mb-1 block text-[9px] font-black uppercase tracking-wider text-slate-400">Comprobantes por hoja</span>
              <select value={perPage} onChange={event => setPerPage(Number(event.target.value) as PerPage)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 outline-none">
                <option value={1}>1 por hoja</option>
                <option value={2}>2 por hoja</option>
              </select>
            </label>
            <label className="flex h-[34px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-[10px] font-black uppercase text-slate-700">
              <input type="checkbox" checked={ignoreEncCodes} onChange={event => toggleIgnoreEncCodes(event.target.checked)} className="h-4 w-4 accent-slate-900" />
              Ignorar códigos ENC
            </label>
            {source !== 'pegado' && (
              <button type="button" onClick={() => loadSource(source)} disabled={loading} className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 hover:bg-slate-100 disabled:opacity-50">
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Actualizar
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <h3 className="text-xs font-black text-slate-800">Datos del viaje</h3>
          <p className="mt-1 text-[10px] font-semibold text-slate-500">Chofer, acompañante, vehículo y salida figuran en la planilla de entregas y cobros y en Conformidad. Si la planilla pegada incluye esos datos, se completan automáticamente.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {([
              ['driver', 'Chofer'],
              ['companion', 'Acompañante'],
              ['vehicle', 'Vehículo'],
              ['departure', 'Salida'],
              ['changeAmount', 'Lleva cambio ($)']
            ] as const).map(([field, label]) => (
              <label key={field} className="block">
                <span className="mb-1 block text-[9px] font-black uppercase tracking-wider text-slate-500">{label}</span>
                <input
                  type={field === 'changeAmount' ? 'number' : 'text'}
                  min={field === 'changeAmount' ? 0 : undefined}
                  value={noteSettings[field]}
                  onChange={event => setNoteSettings(current => ({ ...current, [field]: event.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-blue-500"
                />
              </label>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-3">
            <div className="min-w-40 pb-1">
              <span className="block text-[10px] font-black text-slate-700">Recargos de cuotas</span>
              <span className="text-[10px] text-slate-500">{paywayCanEdit ? 'Configuración compartida · solo administradores' : 'Configurados por administración'}</span>
            </div>
            {['PAYWAY 1 cuota', 'PAYWAY 3 cuotas', 'PAYWAY 6 cuotas', 'PAYWAY 12 cuotas', 'Cuota Simple 6 cuotas'].map((label, index) => (
              <label key={label}>
                <span className="mb-1 block text-[9px] font-black uppercase tracking-wider text-slate-500">{label}</span>
                <div className={`flex items-center rounded-xl border px-2 ${paywayCanEdit ? 'border-slate-200' : 'border-slate-100 bg-slate-50'}`}>
                  <input
                    type="number"
                    min="0"
                    max="300"
                    step="0.01"
                    value={paywayDraft[index]}
                    disabled={!paywayCanEdit || paywayStatus !== 'ready' || paywaySaving}
                    onChange={event => setPaywayDraft(current => current.map((value, rateIndex) => rateIndex === index ? event.target.value : value))}
                    className="w-14 bg-transparent py-2 text-right text-xs font-bold text-slate-700 outline-none disabled:opacity-75"
                  />
                  <span className="text-xs font-bold text-slate-500">%</span>
                </div>
              </label>
            ))}
            {paywayCanEdit && (
              <button type="button" onClick={savePaywayRates} disabled={paywaySaving || paywayStatus !== 'ready' || !paywayDirty} className="rounded-xl bg-blue-600 px-3 py-2 text-[10px] font-black text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40">
                {paywaySaving ? 'Guardando...' : 'Guardar recargos'}
              </button>
            )}
            {paywayStatus === 'error' && <button type="button" onClick={loadPaywayRates} className="rounded-xl border border-rose-200 px-3 py-2 text-[10px] font-black text-rose-700">Reintentar</button>}
          </div>
          {paywayDirty && <p className="mt-2 text-[10px] font-semibold text-amber-700">Guardá los nuevos recargos de cuotas antes de imprimir.</p>}
          {paywayMessage && <p className={`mt-2 text-[10px] font-bold ${paywayMessage.includes('guardados') ? 'text-emerald-700' : 'text-rose-700'}`}>{paywayMessage}</p>}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-xs font-black text-slate-800"><ClipboardPaste className="h-4 w-4" /> Pegar pedidos</h3>
            <p className="mt-0.5 text-[10px] font-semibold text-slate-500">Copiá filas de Google Sheets y pegá aquí. Cada nuevo pegado se agrega al final; la grilla se detiene en el último producto, hasta un máximo de 12.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={addEmptyRow} className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-[10px] font-black uppercase text-slate-700 hover:bg-slate-100">
              <Plus className="h-3.5 w-3.5" /> Agregar fila
            </button>
            <button type="button" onClick={clearGrid} className="flex items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3 py-2 text-[10px] font-black uppercase text-rose-700 hover:bg-rose-50">
              <Trash2 className="h-3.5 w-3.5" /> Limpiar grilla
            </button>
            <button type="button" onClick={() => { setSource('pegado'); processPastedRows(); }} disabled={loading} className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-[10px] font-black uppercase text-slate-700 hover:bg-slate-100 disabled:opacity-50">
              <FileCheck2 className="h-3.5 w-3.5" /> Aplicar grilla
            </button>
          </div>
        </div>
        <div onPaste={handlePaste} className="max-h-[360px] overflow-auto outline-none" tabIndex={0}>
          <table className="border-collapse text-[10px]">
            <thead className="sticky top-0 z-10 bg-slate-100 text-slate-600">
              <tr>
                <th className="sticky left-0 z-20 w-10 min-w-10 border border-slate-200 bg-slate-100 px-2 py-2 text-center">#</th>
                {columns.map(column => <th key={column.index} style={{ minWidth: column.width }} className="border border-slate-200 px-2 py-2 text-left font-black">{column.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {pastedRows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  <td className="sticky left-0 z-[5] border border-slate-200 bg-slate-50 px-2 text-center font-mono font-bold text-slate-400">{rowIndex + 1}</td>
                  {columns.map(column => (
                    <td key={column.index} className="border border-slate-200 p-0">
                      <input value={row[column.index] || ''} onChange={event => updateCell(rowIndex, column.index, event.target.value)} className="h-8 w-full bg-white px-2 outline-none focus:bg-blue-50 focus:ring-1 focus:ring-inset focus:ring-blue-500" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar código, cliente, localidad o dirección..." className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-xs font-bold outline-none focus:border-slate-500" />
        </div>
        <button type="button" onClick={toggleVisible} disabled={filtered.length === 0} className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-[10px] font-black uppercase text-slate-600 hover:bg-slate-50 disabled:opacity-40">
          {filtered.length > 0 && filtered.every(order => selected.has(order.id)) ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />} Seleccionar visibles
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-xs font-bold text-slate-500"><Loader2 className="h-5 w-5 animate-spin" /> Procesando pedidos...</div>
      ) : error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs font-bold text-rose-700">{error}</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 py-14 text-center text-xs font-bold text-slate-400">No hay pedidos procesados en este origen.</div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
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

      {printStage === 'comprobantes' && <PrintableReceipts sheets={receiptSheets} />}
      {printStage === 'remitos' && <PrintableRemittances remittances={printRemittances} />}
      {printStage === 'nota-pedido' && <PrintableOrderNotes orders={printOrders} settings={noteSettings} />}
      {printStage === 'conformidad' && <PrintableConformity orders={printOrders} settings={noteSettings} />}

      {showPrintWarning && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" aria-labelledby="multiple-documents-title" className="w-full max-w-md rounded-3xl border border-amber-200 bg-white p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h3 id="multiple-documents-title" className="text-base font-black text-slate-900">Atención: pedidos con más de una impresión</h3>
                <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-600">Los siguientes códigos generarán más de un documento. Revisalos al separar y entregar las hojas:</p>
              </div>
            </div>
            <div className="mt-4 space-y-2 rounded-2xl border border-amber-200 bg-amber-50 p-3">
              {multipleDocumentWarnings.map(warning => (
                <div key={`${warning.documentLabel}-${warning.code}`} className="flex items-center justify-between gap-3 text-xs">
                  <span className="font-mono font-black text-slate-900">{warning.code}</span>
                  <span className="rounded-lg bg-white px-2 py-1 font-black text-amber-800 shadow-sm">{warning.count} {warning.documentLabel}</span>
                </div>
              ))}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setShowPrintWarning(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-black text-slate-600 hover:bg-slate-50">Cancelar</button>
              <button type="button" onClick={() => { setShowPrintWarning(false); startPrint(pendingPrintTypes.current); }} className="flex items-center gap-1.5 rounded-xl bg-amber-600 px-4 py-2 text-xs font-black text-white hover:bg-amber-700">
                <Printer className="h-3.5 w-3.5" /> Continuar e imprimir
              </button>
            </div>
          </div>
        </div>
      )}

      {showIgnoredEncWarning && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" aria-labelledby="ignored-enc-title" className="w-full max-w-md rounded-3xl border border-amber-200 bg-white p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h3 id="ignored-enc-title" className="text-base font-black text-slate-900">Códigos ENC ignorados</h3>
                <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-600">
                  Hay {ignoredEncCodes.length} {ignoredEncCodes.length === 1 ? 'código ENC que no se incluirá' : 'códigos ENC que no se incluirán'} en la impresión.
                </p>
              </div>
            </div>
            <div className="mt-4 flex max-h-40 flex-wrap gap-2 overflow-auto rounded-2xl border border-amber-200 bg-amber-50 p-3">
              {ignoredEncCodes.map(code => <span key={code} className="rounded-lg bg-white px-2 py-1 font-mono text-xs font-black text-amber-900 shadow-sm">{code}</span>)}
            </div>
            <div className="mt-5 flex justify-end">
              <button type="button" onClick={() => setShowIgnoredEncWarning(false)} className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-black text-white hover:bg-black">Entendido</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

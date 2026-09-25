"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckSquare,
  ClipboardPaste,
  FileCheck2,
  Loader2,
  Plus,
  Printer,
  Search,
  Square,
  Trash2
} from 'lucide-react';
import { LogisticsPrintOrder } from '@/lib/logisticsPrintOrders';
import { LogisticsRemittance } from '@/lib/logisticsRemittances';
import { waitForPrintImages } from '@/lib/printAssets';
import { supabase } from '@/lib/supabase';
import {
  LOGISTICS_TRIP_MAX_COLUMNS,
  normalizeLogisticsPastedRows,
  parseQuotedTsv
} from '@/lib/logisticsPaste';
import { buildOrderNoteGroups, DEFAULT_ORDER_NOTE_RATES, ORDER_NOTE_ROWS_PER_PAGE, orderNoteRoutes, OrderNoteGroup } from '@/lib/logisticsOrderNotes';
import {
  buildReceiptSheets,
  PerPage,
  PrintableReceipts
} from '@/components/logistica/LogisticsReceiptsPanel';
import { PrintableRemittances } from '@/components/logistica/LogisticsRemittancesPanel';
import { OrderNoteSettings, PrintableOrderNotes } from '@/components/logistica/LogisticsOrderNotesPanel';
import { PrintableWarehouse } from '@/components/logistica/LogisticsWarehousePanel';
import { isWarehouseProduct } from '@/lib/logisticsWarehouse';
import { DEFAULT_PRINT_CATEGORIES } from '@/lib/warehouseCategoryConfig';

type OutputType = 'comprobantes' | 'remitos' | 'nota-pedido' | 'separar' | 'separar-total' | 'cargar';

interface PrintingPayload {
  orders: LogisticsPrintOrder[];
  remittances: LogisticsRemittance[];
  printCategories?: string[];
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
  { index: 13, label: 'Zona', width: '140px' },
  { index: 14, label: 'Recorrido', width: '100px' },
  { index: 15, label: 'Orden de entrega', width: '105px' },
  { index: 78, label: 'Ruteador', width: '140px' },
  { index: 80, label: 'Chofer', width: '180px' },
  { index: 81, label: 'Vehículo', width: '100px' },
  { index: 82, label: 'Acompañante', width: '180px' },
  { index: 83, label: 'Salida', width: '80px' },
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
  return Array(LOGISTICS_TRIP_MAX_COLUMNS).fill('');
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
  const [perPage, setPerPage] = useState<PerPage>(2);
  const [rawOrders, setRawOrders] = useState<LogisticsPrintOrder[]>([]);
  const [remittances, setRemittances] = useState<LogisticsRemittance[]>([]);
  const [ignoreEncCodes, setIgnoreEncCodes] = useState(true);
  const [ignoredEncCodes, setIgnoredEncCodes] = useState<string[]>([]);
  const [showIgnoredEncWarning, setShowIgnoredEncWarning] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pastedRows, setPastedRows] = useState<string[][]>([emptyGridRow()]);
  const pastedRowsRef = useRef(pastedRows);
  const [gridDirty, setGridDirty] = useState(false);
  const [gridEditing, setGridEditing] = useState(false);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [printType, setPrintType] = useState<OutputType | null>(null);
  const printing = printType !== null;
  const [printOrders, setPrintOrders] = useState<LogisticsPrintOrder[]>([]);
  const [printRemittances, setPrintRemittances] = useState<LogisticsRemittance[]>([]);
  const [warehousePrint, setWarehousePrint] = useState<{ orders: LogisticsPrintOrder[]; mode: 'separar' | 'separar-total' | 'cargar'; settings: OrderNoteSettings; categories: string[] } | null>(null);
  const [printCategories, setPrintCategories] = useState<string[]>(DEFAULT_PRINT_CATEGORIES);
  const [noteSettings, setNoteSettings] = useState<OrderNoteSettings>(emptyNoteSettings);
  const [paywayStatus, setPaywayStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [paywayError, setPaywayError] = useState('');
  const paywayRetryTimer = useRef<number | null>(null);
  const [multipleDocumentWarnings, setMultipleDocumentWarnings] = useState<MultipleDocumentWarning[]>([]);
  const [showPrintWarning, setShowPrintWarning] = useState(false);
  const pendingPrintType = useRef<OutputType | null>(null);
  const processingVersion = useRef(0);
  const [tripWarning, setTripWarning] = useState<{ groups: OrderNoteGroup[]; printing: boolean } | null>(null);

  const loadPaywayRates = useCallback(async (attempt = 0) => {
    if (paywayRetryTimer.current !== null) window.clearTimeout(paywayRetryTimer.current);
    paywayRetryTimer.current = null;
    setPaywayStatus('loading');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Iniciá sesión para consultar los recargos de cuotas.');
      const fetchRates = (token: string) => fetch('/api/logistica/nota-pedido-config', {
        headers: { Authorization: `Bearer ${token}` }, cache: 'no-store'
      });
      let response = await fetchRates(session.access_token);
      if (response.status === 401) {
        const { data: refreshed } = await supabase.auth.refreshSession();
        if (refreshed.session?.access_token) response = await fetchRates(refreshed.session.access_token);
      }
      const payload = await response.json() as { rates?: number[]; canEdit?: boolean; error?: string };
      if (!response.ok || !Array.isArray(payload.rates) || payload.rates.length !== 5) throw new Error(payload.error || 'No se pudieron cargar los recargos de cuotas.');
      setNoteSettings(current => ({ ...current, posnetRates: payload.rates! }));
      setPaywayError('');
      setPaywayStatus('ready');
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'No se pudieron consultar las cuotas.';
      if (attempt < 2) {
        paywayRetryTimer.current = window.setTimeout(() => void loadPaywayRates(attempt + 1), 1000 * (attempt + 1));
      } else {
        setPaywayError(message);
        setPaywayStatus('error');
      }
    }
  }, []);

  useEffect(() => {
    if (paywayStatus === 'idle') void loadPaywayRates();
  }, [paywayStatus, loadPaywayRates]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION')) {
        setPaywayStatus(current => current === 'error' ? 'idle' : current);
      }
    });
    return () => {
      subscription.unsubscribe();
      if (paywayRetryTimer.current !== null) window.clearTimeout(paywayRetryTimer.current);
    };
  }, []);

  useEffect(() => { pastedRowsRef.current = pastedRows; }, [pastedRows]);

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
    setPrintCategories(payload.printCategories || DEFAULT_PRINT_CATEGORIES);
    setRemittances(payload.remittances || []);
    setSelected(new Set(nextOrders
      .filter(order => !ignoreEncCodes || !order.codes.some(code => /^ENC/i.test(code)))
      .map(order => order.id)));
    const groups = buildOrderNoteGroups(nextOrders.filter(order => !ignoreEncCodes || !order.codes.some(code => /^ENC/i.test(code))), noteSettings);
    setTripWarning(groups.length > 1 ? { groups, printing: false } : null);
    if (ignoreEncCodes && nextIgnoredCodes.length > 0) {
      setIgnoredEncCodes(nextIgnoredCodes);
      setShowIgnoredEncWarning(true);
    }
  };

  const processPastedRows = async (rows = pastedRows) => {
    const version = ++processingVersion.current;
    const nonEmptyRows = rows.filter(row => row.some(cell => String(cell || '').trim()));
    if (nonEmptyRows.length === 0) {
      setRawOrders([]);
      setRemittances([]);
      setSelected(new Set());
      setLoading(false);
      setGridDirty(false);
      setTripWarning(null);
      return;
    }
    try {
      setLoading(true);
      setError('');
      const response = await fetch('/api/logistica/impresion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: nonEmptyRows.map(row => row.slice(0, LOGISTICS_TRIP_MAX_COLUMNS)) }),
        signal: AbortSignal.timeout(45000)
      });
      const payload = await response.json();
      if (version !== processingVersion.current) return;
      if (!response.ok) throw new Error(payload.error || 'No se pudo procesar el contenido pegado.');
      applyPayload(payload);
      setGridDirty(false);
    } catch (pasteError) {
      if (version === processingVersion.current) setError(pasteError instanceof Error && (pasteError.name === 'TimeoutError' || pasteError.name === 'AbortError')
        ? 'El procesamiento superó los 45 segundos. Podés reintentarlo sin volver a pegar los pedidos.'
        : pasteError instanceof Error ? pasteError.message : 'No se pudo procesar el contenido pegado.');
    } finally {
      if (version === processingVersion.current) setLoading(false);
    }
  };

  useEffect(() => {
    const afterPrint = () => {
      setPrintType(null);
      setPrintOrders([]);
      setPrintRemittances([]);
      setWarehousePrint(null);
    };
    window.addEventListener('afterprint', afterPrint);
    return () => window.removeEventListener('afterprint', afterPrint);
  }, []);

  useEffect(() => {
    if (!printType) return;
    let pageStyle: HTMLStyleElement | null = null;
    let cancelled = false;
    let timer: number | null = null;
    if (printType !== 'comprobantes') {
      pageStyle = document.createElement('style');
      pageStyle.dataset.unifiedLogisticsPrint = 'true';
      pageStyle.textContent = `@media print { @page { size: A4 ${printType === 'separar' || printType === 'separar-total' || printType === 'cargar' ? 'portrait' : 'landscape'}; margin: 0; } }`;
      document.head.appendChild(pageStyle);
    }
    const rootId = printType === 'comprobantes'
      ? 'print-logistics-receipts-root'
      : printType === 'remitos' ? 'print-legal-remittances-root' : printType === 'nota-pedido' ? 'print-order-notes-root' : 'print-warehouse-root';
    void waitForPrintImages(rootId).then(() => {
      if (!cancelled) timer = window.setTimeout(() => window.print(), 50);
    });
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
      pageStyle?.remove();
    };
  }, [printType]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return orders;
    return orders.filter(order => [order.legacyCode, order.customerName, order.locality, order.address]
      .some(value => value.toLowerCase().includes(term)));
  }, [orders, search]);

  const selectedOrders = useMemo(() => orders.filter(order => selected.has(order.id)), [orders, selected]);
  const hasWarehouseProducts = selectedOrders.some(order => order.items.some(isWarehouseProduct));
  const hasTotalWarehouseProducts = orders.some(order => order.items.some(isWarehouseProduct));
  const selectedTripGroups = useMemo(() => buildOrderNoteGroups(selectedOrders, noteSettings), [selectedOrders, noteSettings]);
  const selectedRemittances = useMemo(() => {
    const codes = new Set(selectedOrders.flatMap(order => order.codes));
    return remittances.filter(remittance => remittance.orderCodes.some(code => codes.has(code)));
  }, [remittances, selectedOrders]);
  const columns = useMemo(() => gridColumns(pastedRows), [pastedRows]);
  const receiptSheets = useMemo(() => buildReceiptSheets(printOrders, perPage), [printOrders, perPage]);

  const handlePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    event.preventDefault();
    const html = event.clipboardData.getData('text/html');
    let clipboardRows: string[][] = [];
    if (html) {
      const documentFragment = new DOMParser().parseFromString(html, 'text/html');
      clipboardRows = Array.from(documentFragment.querySelectorAll('table tr')).map(tableRow =>
        Array.from(tableRow.querySelectorAll('th, td')).map(cell => cell.textContent || '')
      );
    }
    if (clipboardRows.length === 0) clipboardRows = parseQuotedTsv(event.clipboardData.getData('text/plain'));
    let rows = normalizeLogisticsPastedRows(clipboardRows, true);
    if (rows.length === 0 && html) rows = normalizeLogisticsPastedRows(parseQuotedTsv(event.clipboardData.getData('text/plain')), true);
    if (rows.length === 0) {
      setError('No se reconocieron pedidos en el contenido pegado. Copiá las filas completas desde la planilla.');
      return;
    }
    const existingRows = pastedRowsRef.current.filter(row => row.some(cell => String(cell || '').trim()));
    const combinedRows = existingRows.length > 0 ? [...existingRows, ...rows] : rows;
    const nextRows = ensureTrailingEmptyRow(combinedRows);
    pastedRowsRef.current = nextRows;
    setGridDirty(true);
    setError('');
    setPastedRows(nextRows);
    processPastedRows(combinedRows);
  };

  const addEmptyRow = () => {
    setPastedRows(current => {
      const hasOnlyInitialEmptyRow = current.length === 1 && current[0].every(cell => !String(cell || '').trim());
      return hasOnlyInitialEmptyRow ? current : [...current, emptyGridRow()];
    });
  };

  const clearGrid = () => {
    processingVersion.current++;
    setLoading(false);
    const emptyRows = [emptyGridRow()];
    pastedRowsRef.current = emptyRows;
    setPastedRows(emptyRows);
    setGridEditing(false);
    setGridDirty(false);
    setRawOrders([]);
    setRemittances([]);
    setSelected(new Set());
    setSearch('');
    setError('');
    setNoteSettings(current => ({ ...emptyNoteSettings(), posnetRates: current.posnetRates }));
    setTripWarning(null);
    setShowIgnoredEncWarning(false);
    setIgnoredEncCodes([]);
  };

  const updateCell = (rowIndex: number, columnIndex: number, value: string) => {
    processingVersion.current++;
    setLoading(false);
    setGridDirty(true);
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

  const startPrint = (type: OutputType) => {
    const targetOrders = type === 'separar-total' ? orders : selectedOrders;
    if (targetOrders.length === 0) return;
    setWarehousePrint(type === 'separar' || type === 'separar-total' || type === 'cargar'
      ? { orders: targetOrders, mode: type, settings: noteSettings, categories: printCategories }
      : null);
    setPrintOrders(targetOrders);
    setPrintRemittances(selectedRemittances);
    setPrintType(type);
  };

  const handlePrint = (type: OutputType, tripsConfirmed = false) => {
    if ((type === 'separar-total' ? orders.length : selectedOrders.length) === 0 || printing || loading || gridDirty) return;
    if (type === 'remitos' && selectedRemittances.length === 0) return;
    if ((type === 'separar' || type === 'cargar') && !hasWarehouseProducts) return;
    if (type === 'separar-total' && !hasTotalWarehouseProducts) return;
    if (type === 'nota-pedido' && paywayStatus !== 'ready') return;
    if (['nota-pedido', 'separar', 'cargar'].includes(type) && selectedTripGroups.length > 1 && !tripsConfirmed) {
      pendingPrintType.current = type;
      setTripWarning({ groups: selectedTripGroups, printing: true });
      return;
    }
    const warnings: MultipleDocumentWarning[] = [];
    if (type === 'comprobantes' || type === 'remitos') {
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
      pendingPrintType.current = type;
      setMultipleDocumentWarnings(warnings);
      setShowPrintWarning(true);
      return;
    }
    startPrint(type);
  };

  const isPrintDisabled = (type: OutputType) =>
    (type === 'separar-total' ? orders.length === 0 : selectedOrders.length === 0)
    || loading || printing || gridDirty
    || (type === 'remitos' && selectedRemittances.length === 0)
    || ((type === 'separar' || type === 'cargar') && !hasWarehouseProducts)
    || (type === 'separar-total' && !hasTotalWarehouseProducts)
    || (type === 'nota-pedido' && paywayStatus !== 'ready');

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[10px] font-black uppercase tracking-wide text-slate-500">Imprimir selección</span>
          {selectedOrders.length > 0 && <span className="text-[10px] font-bold text-slate-500">{selectedOrders.length} {selectedOrders.length === 1 ? 'pedido seleccionado' : 'pedidos seleccionados'}</span>}
        </div>
        <div className="mt-3 overflow-x-auto pb-1">
        <div className="grid gap-2.5" style={{ minWidth: 1050, gridTemplateColumns: 'repeat(5, minmax(205px, 1fr))' }}>
          {([
            ['comprobantes', 'Comprobantes', 'border-blue-200 bg-blue-50 text-blue-900 hover:border-blue-300 hover:bg-blue-100/70'],
            ['remitos', 'Remitos', 'border-violet-200 bg-violet-50 text-violet-900 hover:border-violet-300 hover:bg-violet-100/70'],
            ['nota-pedido', 'Planilla de entregas y cobros', 'border-amber-200 bg-amber-50 text-amber-950 hover:border-amber-300 hover:bg-amber-100/70']
          ] as const).map(([type, label, colors]) => (
            <button key={type} type="button" onClick={() => handlePrint(type)} disabled={isPrintDisabled(type)} style={{ height: 164 }} className={`flex flex-col items-center justify-center gap-3 rounded-2xl border p-4 text-center transition-colors disabled:cursor-not-allowed disabled:grayscale disabled:opacity-45 ${colors}`}>
              <Printer className="h-5 w-5" /><span className="text-sm font-black leading-snug sm:text-base">{label}</span>
            </button>
          ))}
          <div className="grid gap-2" style={{ height: 164, gridTemplateRows: 'repeat(2, minmax(0, 1fr))' }}>
            <button type="button" onClick={() => handlePrint('separar')} disabled={isPrintDisabled('separar')} className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-center text-sm font-black leading-tight text-emerald-900 transition-colors hover:border-emerald-300 hover:bg-emerald-100/70 disabled:cursor-not-allowed disabled:grayscale disabled:opacity-45"><Printer className="h-4 w-4 shrink-0" />Separar mercadería</button>
            <button type="button" title="Incluye todos los pedidos cargados, aunque no estén seleccionados; respeta Ignorar códigos ENC." onClick={() => handlePrint('separar-total')} disabled={isPrintDisabled('separar-total')} className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-center text-sm font-black leading-tight text-emerald-900 transition-colors hover:border-emerald-300 hover:bg-emerald-100/70 disabled:cursor-not-allowed disabled:grayscale disabled:opacity-45"><Printer className="h-4 w-4 shrink-0" />Separar mercadería total</button>
          </div>
          <button type="button" onClick={() => handlePrint('cargar')} disabled={isPrintDisabled('cargar')} style={{ height: 164 }} className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-cyan-200 bg-cyan-50 p-4 text-center text-cyan-950 transition-colors hover:border-cyan-300 hover:bg-cyan-100/70 disabled:cursor-not-allowed disabled:grayscale disabled:opacity-45"><Printer className="h-5 w-5" /><span className="text-sm font-black leading-snug sm:text-base">Carga vehicular</span></button>
        </div>
        </div>
        {loading && <p className="mt-2 text-xs font-bold text-blue-700">Procesando los pedidos pegados…</p>}
        {gridDirty && !loading && <p className="mt-2 text-xs font-bold text-amber-700">{error ? 'No se pudo aplicar el pegado.' : 'Hay cambios en la grilla: pulsá Aplicar grilla antes de imprimir.'} {error && <button type="button" onClick={() => void processPastedRows(pastedRowsRef.current)} className="underline">Reintentar procesamiento</button>}</p>}
        {paywayStatus === 'error' && <p className="mt-2 text-xs font-bold text-amber-700">No se pudo preparar la planilla de cobros: {paywayError} <button type="button" onClick={() => void loadPaywayRates()} className="underline">Reintentar</button></p>}
        <div className="mt-4 flex flex-col gap-3 border-t border-slate-200 pt-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h2 className="text-sm font-black text-slate-900">Formato de impresión</h2>
            <p className="mt-1 text-[11px] font-semibold text-slate-500">Los documentos se generan exclusivamente con los pedidos de la grilla.</p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
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
          </div>
        </div>
      </section>

      <div className="flex flex-col gap-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-4" style={{ order: 2 }}>
          <h3 className="text-xs font-black text-slate-800">Datos del viaje</h3>
          <p className="mt-1 text-[10px] font-semibold text-slate-500">Cada hoja usa la fecha y los datos del transporte de sus pedidos. Para corregirlos, abrí Editar grilla y pulsá Aplicar grilla. Los siguientes campos completan únicamente los datos que falten.</p>
          {selectedTripGroups.length > 0 && <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
            <div className="flex items-center justify-between gap-3"><strong>{selectedTripGroups.length} {selectedTripGroups.length === 1 ? 'viaje en la selección' : 'viajes en la selección'}</strong><button type="button" onClick={() => setTripWarning({ groups: selectedTripGroups, printing: false })} className="font-bold text-blue-700">Ver fechas y recorridos</button></div>
            {selectedTripGroups.length === 1 && <p className="mt-1 text-slate-600">{displayDate(selectedTripGroups[0].deliveryDate)} · {selectedTripGroups[0].trip.driver || 'Sin chofer'} · {orderNoteRoutes(selectedTripGroups[0].orders)}</p>}
          </div>}
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
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4" style={{ order: 1 }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-xs font-black text-slate-800"><ClipboardPaste className="h-4 w-4" /> Pegar pedidos</h3>
            <p className="mt-1 text-[10px] font-semibold text-slate-500">Copiá filas completas de la planilla. Cada pegado se procesa y agrega a los pedidos existentes.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setGridEditing(current => !current)} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-[10px] font-black uppercase text-slate-700 hover:bg-slate-100">
              {gridEditing ? 'Ocultar grilla' : 'Editar grilla'}
            </button>
            <button type="button" onClick={clearGrid} className="flex items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3 py-2 text-[10px] font-black uppercase text-rose-700 hover:bg-rose-50">
              <Trash2 className="h-3.5 w-3.5" /> Limpiar pedidos
            </button>
          </div>
        </div>
        <textarea value="" onChange={() => {}} onPaste={handlePaste} aria-label="Pegar pedidos aquí" placeholder="Pegar aquí" className="mt-3 h-24 w-full resize-none rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-4 text-center text-sm font-bold text-slate-700 outline-none placeholder:text-slate-500 focus:border-blue-500 focus:bg-white" />
        <p className="mt-1 text-[10px] text-slate-500">El contenido pegado no queda visible en este cuadro; podés pegar más filas cuando quieras.</p>
        {gridEditing && <div className="mt-3 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={addEmptyRow} className="flex items-center gap-1.5 rounded-xl border border-slate-300 px-3 py-2 text-[10px] font-black uppercase text-slate-700 hover:bg-slate-100"><Plus className="h-3.5 w-3.5" /> Agregar fila</button>
          <button type="button" onClick={() => processPastedRows()} disabled={loading || !gridDirty} className="flex items-center gap-1.5 rounded-xl border border-slate-300 px-3 py-2 text-[10px] font-black uppercase text-slate-700 hover:bg-slate-100 disabled:opacity-50"><FileCheck2 className="h-3.5 w-3.5" /> Aplicar grilla</button>
        </div>}
        {gridEditing && <div className="mt-3 max-h-[360px] overflow-auto rounded-xl border border-slate-200">
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
        </div>}
      </section>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar código, cliente, localidad o dirección..." className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-xs font-bold outline-none focus:border-slate-500" />
        </div>
        <button type="button" onClick={toggleVisible} disabled={filtered.length === 0} className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-[10px] font-black uppercase text-slate-600 hover:bg-slate-50 disabled:opacity-40">
          {filtered.length > 0 && filtered.every(order => selected.has(order.id)) ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />} Seleccionar visibles
        </button>
      </div>

      {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs font-bold text-rose-700">{error}</div>}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-xs font-bold text-slate-500"><Loader2 className="h-5 w-5 animate-spin" /> Procesando pedidos...</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 py-14 text-center text-xs font-bold text-slate-400">No hay pedidos procesados en la grilla.</div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <table className="w-full border-collapse text-left text-xs">
            <thead className="bg-slate-50 text-[9px] font-black uppercase tracking-wider text-slate-400">
              <tr><th className="w-10 px-3 py-2"></th><th className="px-3 py-2">Pedido</th><th className="px-3 py-2">Cliente</th><th className="px-3 py-2">Entrega</th><th className="px-3 py-2">Marca</th><th className="px-3 py-2 text-center">Productos</th><th className="px-3 py-2 text-right">Saldo</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(order => (
                <tr key={order.id} onClick={() => toggle(order.id)} className="cursor-pointer hover:bg-slate-50">
                  <td className="px-3 py-1"><input type="checkbox" checked={selected.has(order.id)} onChange={() => toggle(order.id)} onClick={event => event.stopPropagation()} className="h-3.5 w-3.5 accent-slate-900" /></td>
                  <td className="px-3 py-1 font-mono text-[10px] font-black text-slate-800">{order.legacyCode}{order.sourceRows.length > 1 && <span className="ml-2 rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 font-sans text-[8px] text-amber-800">UNIFICADO</span>}</td>
                  <td className="px-3 py-1 font-extrabold text-slate-800">{order.customerName}</td>
                  <td className="px-3 py-1 text-[10px] font-bold text-slate-600">{displayDate(order.deliveryDate)} · {order.locality}</td>
                  <td className="px-3 py-1"><span className="rounded border border-slate-300 px-1.5 py-0.5 text-[8px] font-black uppercase text-slate-700">{order.commercialBrand}</span></td>
                  <td className="px-3 py-1 text-center font-black text-slate-700">{order.items.length}</td>
                  <td className="px-3 py-1 text-right font-mono font-black text-slate-900">{money(order.pendingBalance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {printType === 'comprobantes' && <PrintableReceipts sheets={receiptSheets} />}
      {printType === 'remitos' && <PrintableRemittances remittances={printRemittances} />}
      {printType === 'nota-pedido' && <PrintableOrderNotes orders={printOrders} settings={noteSettings} />}
      {warehousePrint && <PrintableWarehouse orders={warehousePrint.orders} mode={warehousePrint.mode} settings={warehousePrint.settings} categories={warehousePrint.categories} />}

      {tripWarning && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" aria-labelledby="trip-warning-title" className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-3xl border border-amber-200 bg-white p-6 shadow-2xl">
            <h3 id="trip-warning-title" className="flex items-center gap-2 text-base font-black text-slate-900"><AlertTriangle className="h-5 w-5 text-amber-600" /> {tripWarning.groups.length > 1 ? 'Se detectaron distintos viajes' : 'Resumen del viaje'}</h3>
            <p className="mt-2 text-xs leading-relaxed text-slate-600">{tripWarning.groups.length > 1 ? 'Hay diferencias de fecha, chofer o datos del transporte. Se generarán hojas separadas para cada viaje. Si es intencional, podés continuar; si no, corregí los datos en la grilla y volvé a aplicarla.' : 'Estos son los datos del viaje para la impresión.'}</p>
            <div className="mt-4 space-y-3 overflow-y-auto">
              {tripWarning.groups.map(group => <div key={group.key} className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs">
                <div className="flex justify-between gap-3 font-black text-slate-900"><span>{displayDate(group.deliveryDate)} · {group.trip.driver || 'Sin chofer'}</span><span>{pendingPrintType.current === 'separar' || pendingPrintType.current === 'cargar' ? `${group.orders.length} pedido(s)` : `${Math.ceil(group.orders.length / ORDER_NOTE_ROWS_PER_PAGE)} hoja(s)`}</span></div>
                <p className="mt-1">Chofer: {group.trip.driver || 'Sin dato'} · Vehículo: {group.trip.vehicle || 'Sin dato'}</p>
                <p className="mt-1">Acompañante: {group.trip.companion || 'Sin dato'} · Salida: {group.trip.departure || 'Sin dato'}</p>
              </div>)}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setTripWarning(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-black text-slate-600">{tripWarning.printing ? 'Volver y corregir' : 'Entendido'}</button>
              {tripWarning.printing && <button type="button" onClick={() => { setTripWarning(null); if (pendingPrintType.current) handlePrint(pendingPrintType.current, true); }} className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-black text-white">Continuar e imprimir</button>}
            </div>
          </div>
        </div>
      )}

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
              <button type="button" onClick={() => { setShowPrintWarning(false); if (pendingPrintType.current) startPrint(pendingPrintType.current); }} className="flex items-center gap-1.5 rounded-xl bg-amber-600 px-4 py-2 text-xs font-black text-white hover:bg-amber-700">
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

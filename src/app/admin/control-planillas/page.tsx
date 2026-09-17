"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
import { 
  ClipboardCheck, 
  RefreshCw, 
  AlertTriangle, 
  AlertCircle, 
  CheckCircle2, 
  Search, 
  ExternalLink, 
  Copy, 
  Check, 
  Filter, 
  FileSpreadsheet, 
  Clock, 
  Layers, 
  Users, 
  ChevronRight,
  ShieldAlert,
  ArrowUpDown,
  Sparkles
} from "lucide-react";

interface SellerDiscrepancy {
  sellerName: string;
  sellerSpreadsheetId: string;
  sellerSheetName: string;
  rowNumber: number;
  orderCode: string;
  sellerStatus: string;
  deliveryDate: string;
  orderDate: string;
  customerName: string;
  phone: string;
  inCentral: boolean;
  centralStatus?: string;
  centralRow?: number;
  inEntregas: boolean;
  entregasSheet?: string;
  entregasRow?: number;
  discrepancyType: 'missing_in_both' | 'in_central_missing_entregas' | 'missing_in_central';
  severity: 'critical' | 'high' | 'medium';
}

interface CentralDiscrepancy {
  rowNumber: number;
  orderCode: string;
  centralStatus: string;
  deliveryDate: string;
  orderDate: string;
  customerName: string;
  phone: string;
  sellerName: string;
  inEntregas: boolean;
}

interface SheetControlData {
  success: boolean;
  timestamp: string;
  fromCache?: boolean;
  cachedAt?: string;
  metrics: {
    totalDiscrepancies: number;
    missingInBothCount: number;
    inCentralMissingEntregasCount: number;
    missingInCentralCount: number;
    centralOnlyMissingEntregasCount: number;
    totalPendingSellerOrders: number;
    totalSynchronizedSellerOrders: number;
    totalEntregasCodesIndexed: number;
    totalCentralCodesIndexed: number;
  };
  sellerDiscrepancies: SellerDiscrepancy[];
  centralDiscrepancies: CentralDiscrepancy[];
  sheetsStats: Record<string, { rowCount: number; error: string | null }>;
  config: {
    centralSpreadsheetId: string;
    centralSheetName: string;
    entregasSpreadsheetId: string;
    entregasSheets: string[];
    sellers: Array<{ name: string; id: string; sheet: string }>;
  };
}

function parseSheetDateToTimestamp(dateStr?: string | null): number {
  if (!dateStr) return 0;
  const clean = dateStr.trim();
  if (!clean) return 0;

  const parts = clean.split(/[\/\-]/);
  if (parts.length === 3) {
    let day = parseInt(parts[0], 10);
    let month = parseInt(parts[1], 10);
    let year = parseInt(parts[2], 10);

    if (parts[0].length === 4) {
      year = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10);
      day = parseInt(parts[2], 10);
    } else if (year < 100) {
      year += 2000;
    }

    if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
      return new Date(year, month - 1, day).getTime() || 0;
    }
  }

  const parsed = Date.parse(clean);
  return isNaN(parsed) ? 0 : parsed;
}

function compareRecency(
  dateA?: string,
  dateB?: string,
  rowA: number = 0,
  rowB: number = 0,
  codeA: string = '',
  codeB: string = '',
  order: 'desc' | 'asc' = 'desc'
): number {
  const mult = order === 'desc' ? 1 : -1;
  const timeA = parseSheetDateToTimestamp(dateA);
  const timeB = parseSheetDateToTimestamp(dateB);

  // Highest/newest timestamp first
  if (timeA !== timeB && timeA > 0 && timeB > 0) {
    return (timeB - timeA) * mult;
  }
  if (timeA > 0 && timeB === 0) return -1 * mult;
  if (timeB > 0 && timeA === 0) return 1 * mult;

  // Numerical part of code if same format (e.g. JS25316 vs JS24002)
  const numA = parseInt(codeA.replace(/\D/g, ''), 10) || 0;
  const numB = parseInt(codeB.replace(/\D/g, ''), 10) || 0;
  if (numA !== numB && numA > 0 && numB > 0) {
    return (numB - numA) * mult;
  }

  // Fallback to row number
  return (rowB - rowA) * mult;
}

export default function ControlPlanillasPage() {
  const [data, setData] = useState<SheetControlData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters & State
  const [activeTab, setActiveTab] = useState<'all' | 'sellers' | 'central' | 'sheets'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSeller, setSelectedSeller] = useState('all');
  const [selectedType, setSelectedType] = useState('all');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const fetchData = useCallback(async (forceRefresh = false) => {
    try {
      if (forceRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      const url = `/api/admin/control-planillas/check${forceRefresh ? '?refresh=true' : ''}`;
      const res = await fetch(url);
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.error || `Error ${res.status}: Falló el chequeo de planillas`);
      }

      setData(json);
    } catch (err: any) {
      console.error('Error fetching sheet control data:', err);
      setError(err?.message || 'Error desconocido al cargar las planillas');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(text);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  // Filtered Seller Discrepancies (Sorted by recency)
  const filteredSellerDiscrepancies = useMemo(() => {
    if (!data?.sellerDiscrepancies) return [];
    const list = data.sellerDiscrepancies.filter((item) => {
      const matchSearch = 
        item.orderCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.phone.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.sellerName.toLowerCase().includes(searchTerm.toLowerCase());

      const matchSeller = selectedSeller === 'all' || item.sellerName === selectedSeller;

      const matchType = 
        selectedType === 'all' || 
        item.discrepancyType === selectedType ||
        (selectedType === 'critical' && item.severity === 'critical') ||
        (selectedType === 'high' && item.severity === 'high');

      return matchSearch && matchSeller && matchType;
    });

    return list.sort((a, b) => 
      compareRecency(
        a.orderDate || a.deliveryDate,
        b.orderDate || b.deliveryDate,
        a.rowNumber,
        b.rowNumber,
        a.orderCode,
        b.orderCode,
        sortOrder
      )
    );
  }, [data, searchTerm, selectedSeller, selectedType, sortOrder]);

  // Filtered Central Discrepancies (Sorted by recency)
  const filteredCentralDiscrepancies = useMemo(() => {
    if (!data?.centralDiscrepancies) return [];
    const list = data.centralDiscrepancies.filter((item) => {
      const matchSearch = 
        item.orderCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.phone.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.sellerName.toLowerCase().includes(searchTerm.toLowerCase());

      const matchSeller = selectedSeller === 'all' || item.sellerName.toLowerCase().includes(selectedSeller.toLowerCase());

      return matchSearch && matchSeller;
    });

    return list.sort((a, b) => 
      compareRecency(
        a.orderDate || a.deliveryDate,
        b.orderDate || b.deliveryDate,
        a.rowNumber,
        b.rowNumber,
        a.orderCode,
        b.orderCode,
        sortOrder
      )
    );
  }, [data, searchTerm, selectedSeller, sortOrder]);

  const sellerNames = useMemo(() => {
    if (!data?.config?.sellers) return [];
    return data.config.sellers.map(s => s.name);
  }, [data]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 rounded-xl border border-blue-200 dark:border-blue-900">
            <ClipboardCheck className="w-8 h-8" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                Control de Planillas
              </h1>
              <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300">
                Logística y Distribución
              </span>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Auditoría en tiempo real de pedidos pendientes entre Planillas de Vendedores, Central y Entregas Actual.
            </p>
          </div>
        </div>

        {/* Top Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => fetchData(true)}
            disabled={loading || refreshing}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Verificando...' : 'Ejecutar Chequeo'}
          </button>

          {data?.config && (
            <div className="flex items-center gap-1.5">
              <a
                href={`https://docs.google.com/spreadsheets/d/${data.config.centralSpreadsheetId}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                Central
                <ExternalLink className="w-3 h-3 text-slate-400" />
              </a>
              <a
                href={`https://docs.google.com/spreadsheets/d/${data.config.entregasSpreadsheetId}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-rose-600" />
                Entregas Actual
                <ExternalLink className="w-3 h-3 text-slate-400" />
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Last Updated Bar */}
      {data && (
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 px-1">
          <div className="flex items-center gap-2">
            <Clock className="w-3.5 h-3.5" />
            <span>Última revisión: {new Date(data.timestamp).toLocaleString('es-AR')}</span>
            {data.fromCache && (
              <span className="text-amber-600 dark:text-amber-400 font-medium">
                (Datos en caché rápida de 60s)
              </span>
            )}
          </div>
          <div>
            <span>Entregas Actual indexadas: <strong>{data.metrics.totalEntregasCodesIndexed}</strong> pedidos | Central indexada: <strong>{data.metrics.totalCentralCodesIndexed}</strong> pedidos</span>
          </div>
        </div>
      )}

      {/* Error Alert */}
      {error && (
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-red-600" />
          <div className="flex-1">
            <h3 className="font-semibold text-sm">Error en la auditoría</h3>
            <p className="text-xs mt-1">{error}</p>
          </div>
          <button
            onClick={() => fetchData(true)}
            className="text-xs font-semibold px-3 py-1 bg-red-100 dark:bg-red-900/60 rounded-lg hover:bg-red-200"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && !data && (
        <div className="p-12 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
          <RefreshCw className="w-10 h-10 animate-spin text-blue-600 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
            Analizando y cruzando planillas en Google Sheets...
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 max-w-md mx-auto">
            Consultando planillas de vendedores (Diego, Jazmín, Ludmila, Facundo), hoja Central pedidos y las 11 hojas de Entregas Actual.
          </p>
        </div>
      )}

      {/* Metrics Cards */}
      {data && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Crítico (Faltan en ambos) */}
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
            <div className={`absolute top-0 left-0 w-1.5 h-full ${data.metrics.missingInBothCount > 0 ? 'bg-red-500' : 'bg-emerald-500'}`} />
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Falta en Central y Entregas
              </span>
              <span className={`p-2 rounded-xl ${data.metrics.missingInBothCount > 0 ? 'bg-red-50 dark:bg-red-950/50 text-red-600' : 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600'}`}>
                {data.metrics.missingInBothCount > 0 ? <ShieldAlert className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
              </span>
            </div>
            <div className="mt-3">
              <span className="text-3xl font-extrabold text-slate-900 dark:text-white">
                {data.metrics.missingInBothCount}
              </span>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Pendientes en vendedor nunca pasados a logística
              </p>
            </div>
          </div>

          {/* Card 2: En Central pero falta en Entregas */}
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
            <div className={`absolute top-0 left-0 w-1.5 h-full ${data.metrics.inCentralMissingEntregasCount > 0 ? 'bg-amber-500' : 'bg-emerald-500'}`} />
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                En Central, Falta en Entregas
              </span>
              <span className={`p-2 rounded-xl ${data.metrics.inCentralMissingEntregasCount > 0 ? 'bg-amber-500/10 text-amber-600' : 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600'}`}>
                <AlertTriangle className="w-5 h-5" />
              </span>
            </div>
            <div className="mt-3">
              <span className="text-3xl font-extrabold text-slate-900 dark:text-white">
                {data.metrics.inCentralMissingEntregasCount}
              </span>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Registrados en Central pendientes de ruteo en Entregas
              </p>
            </div>
          </div>

          {/* Card 3: Central activos sin Entregas */}
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
            <div className={`absolute top-0 left-0 w-1.5 h-full ${data.metrics.centralOnlyMissingEntregasCount > 0 ? 'bg-purple-500' : 'bg-emerald-500'}`} />
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Central sin Entregas Actual
              </span>
              <span className={`p-2 rounded-xl ${data.metrics.centralOnlyMissingEntregasCount > 0 ? 'bg-purple-50 dark:bg-purple-950/50 text-purple-600' : 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600'}`}>
                <FileSpreadsheet className="w-5 h-5" />
              </span>
            </div>
            <div className="mt-3">
              <span className="text-3xl font-extrabold text-slate-900 dark:text-white">
                {data.metrics.centralOnlyMissingEntregasCount}
              </span>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Pedidos activos en Central pedidos ausentes en Entregas
              </p>
            </div>
          </div>

          {/* Card 4: Sincronizados y auditados */}
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1.5 h-full bg-blue-500" />
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Total Sincronizados
              </span>
              <span className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600">
                <CheckCircle2 className="w-5 h-5" />
              </span>
            </div>
            <div className="mt-3">
              <span className="text-3xl font-extrabold text-slate-900 dark:text-white">
                {data.metrics.totalSynchronizedSellerOrders}
              </span>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                De {data.metrics.totalPendingSellerOrders} activos de vendedores verificados
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Tabs and Controls */}
      {data && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          {/* Tab Navigation */}
          <div className="flex border-b border-slate-200 dark:border-slate-800 overflow-x-auto">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-5 py-3.5 text-sm font-semibold border-b-2 whitespace-nowrap transition flex items-center gap-2 ${
                activeTab === 'all'
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-950/20'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              <Layers className="w-4 h-4" />
              Todos los Casos
              <span className="ml-1 px-2 py-0.5 text-xs rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                {data.metrics.totalDiscrepancies}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('sellers')}
              className={`px-5 py-3.5 text-sm font-semibold border-b-2 whitespace-nowrap transition flex items-center gap-2 ${
                activeTab === 'sellers'
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-950/20'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              <Users className="w-4 h-4" />
              Vendedores ➔ Faltantes
              <span className="ml-1 px-2 py-0.5 text-xs rounded-full bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 font-bold">
                {data.sellerDiscrepancies.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('central')}
              className={`px-5 py-3.5 text-sm font-semibold border-b-2 whitespace-nowrap transition flex items-center gap-2 ${
                activeTab === 'central'
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-950/20'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4" />
              Central ➔ Faltantes en Entregas
              <span className="ml-1 px-2 py-0.5 text-xs rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 font-bold">
                {data.centralDiscrepancies.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('sheets')}
              className={`px-5 py-3.5 text-sm font-semibold border-b-2 whitespace-nowrap transition flex items-center gap-2 ${
                activeTab === 'sheets'
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-950/20'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              <ClipboardCheck className="w-4 h-4" />
              Hojas Auditadas
              <span className="ml-1 px-2 py-0.5 text-xs rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                {Object.keys(data.sheetsStats).length}
              </span>
            </button>
          </div>

          {/* Filters Bar */}
          {activeTab !== 'sheets' && (
            <div className="p-4 bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 flex flex-col md:flex-row gap-3 items-center justify-between">
              <div className="relative w-full md:w-80">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Buscar por código, cliente o teléfono..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex items-center gap-2 w-full md:w-auto flex-wrap">
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <Filter className="w-3.5 h-3.5" />
                  <span>Filtrar:</span>
                </div>

                {/* Seller filter */}
                <select
                  value={selectedSeller}
                  onChange={(e) => setSelectedSeller(e.target.value)}
                  className="px-3 py-2 text-xs font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-300 outline-none"
                >
                  <option value="all">Todos los Vendedores</option>
                  {sellerNames.map(name => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>

                {/* Discrepancy type filter (for sellers view) */}
                {activeTab !== 'central' && (
                  <select
                    value={selectedType}
                    onChange={(e) => setSelectedType(e.target.value)}
                    className="px-3 py-2 text-xs font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-300 outline-none"
                  >
                    <option value="all">Todos los Tipos de Faltante</option>
                    <option value="missing_in_both">🔴 Falta en Ambos (Central y Entregas)</option>
                    <option value="in_central_missing_entregas">🟡 En Central, Falta en Entregas</option>
                    <option value="missing_in_central">🔵 En Entregas, Falta en Central</option>
                  </select>
                )}

                {/* Sort Order */}
                <div className="flex items-center gap-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1">
                  <ArrowUpDown className="w-3.5 h-3.5 text-blue-500" />
                  <select
                    value={sortOrder}
                    onChange={(e) => setSortOrder(e.target.value as 'desc' | 'asc')}
                    className="text-xs font-medium bg-transparent text-slate-700 dark:text-slate-300 outline-none cursor-pointer py-1"
                  >
                    <option value="desc">Más actuales a menos actuales</option>
                    <option value="asc">Menos actuales a más actuales</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Tab 1 or 2: Seller Discrepancies Table */}
          {(activeTab === 'all' || activeTab === 'sellers') && (
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {activeTab === 'all' && (
                <div className="p-4 bg-slate-100/60 dark:bg-slate-800/40 font-semibold text-xs text-slate-600 dark:text-slate-300 uppercase tracking-wider flex items-center justify-between">
                  <span>Discrepancias en Planillas de Vendedores ({filteredSellerDiscrepancies.length})</span>
                  <span className="text-[11px] font-normal text-slate-500">Revisadas hojas de pendientes de cada vendedor</span>
                </div>
              )}

              {filteredSellerDiscrepancies.length === 0 ? (
                <div className="p-8 text-center text-slate-500 dark:text-slate-400 text-sm">
                  {searchTerm || selectedSeller !== 'all' || selectedType !== 'all' ? (
                    'No se encontraron discrepancias con los filtros seleccionados.'
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        ¡Todo en orden con las planillas de vendedores!
                      </span>
                      <span>No hay pedidos pendientes de vendedores ausentes en Central y Entregas Actual.</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider">
                      <tr>
                        <th className="py-3 px-4">Código</th>
                        <th className="py-3 px-4">Vendedor</th>
                        <th className="py-3 px-4">Cliente / Contacto</th>
                        <th className="py-3 px-4">Fechas</th>
                        <th className="py-3 px-4">Estado Vendedor</th>
                        <th className="py-3 px-4">En Central</th>
                        <th className="py-3 px-4">En Entregas Actual</th>
                        <th className="py-3 px-4">Diagnóstico</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {filteredSellerDiscrepancies.map((item, index) => (
                        <tr key={`${item.orderCode}-${index}`} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition">
                          {/* Code */}
                          <td className="py-3.5 px-4 font-mono font-bold text-slate-900 dark:text-white">
                            <div className="flex items-center gap-1.5">
                              <span>{item.orderCode}</span>
                              <button
                                onClick={() => copyToClipboard(item.orderCode)}
                                title="Copiar código"
                                className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-400 hover:text-slate-600 transition"
                              >
                                {copiedCode === item.orderCode ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                            <span className="text-[11px] font-normal text-slate-400 block mt-0.5">
                              Fila {item.rowNumber} ({item.sellerSheetName})
                            </span>
                          </td>

                          {/* Seller */}
                          <td className="py-3.5 px-4 text-slate-700 dark:text-slate-300">
                            <div className="font-medium">{item.sellerName}</div>
                            <a
                              href={`https://docs.google.com/spreadsheets/d/${item.sellerSpreadsheetId}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[11px] text-blue-600 hover:underline inline-flex items-center gap-0.5"
                            >
                              Abrir planilla <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          </td>

                          {/* Client */}
                          <td className="py-3.5 px-4">
                            <div className="font-medium text-slate-900 dark:text-white">
                              {item.customerName}
                            </div>
                            {item.phone && (
                              <span className="text-xs text-slate-400 block">
                                {item.phone}
                              </span>
                            )}
                          </td>

                          {/* Dates */}
                          <td className="py-3.5 px-4 text-xs text-slate-600 dark:text-slate-400">
                            {item.deliveryDate && <div>Entrega: <strong>{item.deliveryDate}</strong></div>}
                            {item.orderDate && <div>Pedido: {item.orderDate}</div>}
                          </td>

                          {/* Status Seller */}
                          <td className="py-3.5 px-4">
                            <span className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700">
                              {item.sellerStatus}
                            </span>
                          </td>

                          {/* In Central */}
                          <td className="py-3.5 px-4">
                            {item.inCentral ? (
                              <div>
                                <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800">
                                  <Check className="w-3 h-3" /> Presente
                                </span>
                                <span className="text-[11px] text-slate-400 block mt-0.5">
                                  Estado: {item.centralStatus || 'N/A'} (Fila {item.centralRow})
                                </span>
                              </div>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/40 px-2 py-0.5 rounded-md border border-red-200 dark:border-red-800">
                                ❌ No está
                              </span>
                            )}
                          </td>

                          {/* In Entregas */}
                          <td className="py-3.5 px-4">
                            {item.inEntregas ? (
                              <div>
                                <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800">
                                  <Check className="w-3 h-3" /> {item.entregasSheet}
                                </span>
                                <span className="text-[11px] text-slate-400 block mt-0.5">
                                  Fila {item.entregasRow}
                                </span>
                              </div>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/40 px-2 py-0.5 rounded-md border border-red-200 dark:border-red-800">
                                ❌ No está
                              </span>
                            )}
                          </td>

                          {/* Diagnostic */}
                          <td className="py-3.5 px-4">
                            {item.discrepancyType === 'missing_in_both' && (
                              <span className="px-2.5 py-1 text-xs font-bold rounded-lg bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-200 border border-red-300 dark:border-red-800 flex items-center gap-1 w-max">
                                <ShieldAlert className="w-3.5 h-3.5 text-red-600" /> Falta en Ambos
                              </span>
                            )}
                            {item.discrepancyType === 'in_central_missing_entregas' && (
                              <span className="px-2.5 py-1 text-xs font-bold rounded-lg bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-800 flex items-center gap-1 w-max">
                                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" /> Falta en Entregas
                              </span>
                            )}
                            {item.discrepancyType === 'missing_in_central' && (
                              <span className="px-2.5 py-1 text-xs font-bold rounded-lg bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200 border border-blue-300 dark:border-blue-800 flex items-center gap-1 w-max">
                                <AlertCircle className="w-3.5 h-3.5 text-blue-600" /> Falta en Central
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Tab 1 or 3: Central Discrepancies Table */}
          {(activeTab === 'all' || activeTab === 'central') && (
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {activeTab === 'all' && (
                <div className="p-4 bg-slate-100/60 dark:bg-slate-800/40 font-semibold text-xs text-slate-600 dark:text-slate-300 uppercase tracking-wider flex items-center justify-between">
                  <span>Pedidos Activos en Central Ausentes en Entregas Actual ({filteredCentralDiscrepancies.length})</span>
                  <span className="text-[11px] font-normal text-slate-500">Revisadas las 11 hojas operativas de Entregas Actual</span>
                </div>
              )}

              {filteredCentralDiscrepancies.length === 0 ? (
                <div className="p-8 text-center text-slate-500 dark:text-slate-400 text-sm">
                  {searchTerm || selectedSeller !== 'all' ? (
                    'No se encontraron pedidos de Central con los filtros actuales.'
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        ¡Central y Entregas Actual sincronizadas!
                      </span>
                      <span>Todos los pedidos activos de Central figuran en las hojas de Entregas Actual.</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider">
                      <tr>
                        <th className="py-3 px-4">Código (Central)</th>
                        <th className="py-3 px-4">Vendedor / Canal</th>
                        <th className="py-3 px-4">Cliente / Contacto</th>
                        <th className="py-3 px-4">Fechas</th>
                        <th className="py-3 px-4">Estado Central</th>
                        <th className="py-3 px-4">Entregas Actual</th>
                        <th className="py-3 px-4">Acción Sugerida</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {filteredCentralDiscrepancies.map((item, index) => (
                        <tr key={`central-${item.orderCode}-${index}`} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition">
                          {/* Code */}
                          <td className="py-3.5 px-4 font-mono font-bold text-slate-900 dark:text-white">
                            <div className="flex items-center gap-1.5">
                              <span>{item.orderCode}</span>
                              <button
                                onClick={() => copyToClipboard(item.orderCode)}
                                title="Copiar código"
                                className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-400 hover:text-slate-600 transition"
                              >
                                {copiedCode === item.orderCode ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                            <span className="text-[11px] font-normal text-slate-400 block mt-0.5">
                              Fila Central {item.rowNumber}
                            </span>
                          </td>

                          {/* Seller */}
                          <td className="py-3.5 px-4 text-slate-700 dark:text-slate-300 font-medium">
                            {item.sellerName || '(Sin vendedor)'}
                          </td>

                          {/* Client */}
                          <td className="py-3.5 px-4">
                            <div className="font-medium text-slate-900 dark:text-white">
                              {item.customerName || 'Cliente sin nombre'}
                            </div>
                            {item.phone && (
                              <span className="text-xs text-slate-400 block">
                                {item.phone}
                              </span>
                            )}
                          </td>

                          {/* Dates */}
                          <td className="py-3.5 px-4 text-xs text-slate-600 dark:text-slate-400">
                            {item.deliveryDate && <div>Entrega: <strong>{item.deliveryDate}</strong></div>}
                            {item.orderDate && <div>Pedido: {item.orderDate}</div>}
                          </td>

                          {/* Status Central */}
                          <td className="py-3.5 px-4">
                            <span className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-800">
                              {item.centralStatus}
                            </span>
                          </td>

                          {/* In Entregas */}
                          <td className="py-3.5 px-4">
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/40 px-2.5 py-1 rounded-lg border border-red-200 dark:border-red-800">
                              ❌ Ausente en las 11 hojas
                            </span>
                          </td>

                          {/* Suggested Action */}
                          <td className="py-3.5 px-4">
                            <span className="text-xs text-slate-500 dark:text-slate-400 block">
                              Pasar a la hoja <strong>Vendedores</strong> de Entregas Actual para ruteo.
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Tab 4: Sheets Audited Overview */}
          {activeTab === 'sheets' && (
            <div className="p-6">
              <div className="mb-4">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Detalle de Hojas y Planillas Auditadas
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Se verifican en paralelo las hojas de cada vendedor, la hoja principal Central pedidos y las 11 hojas operativas de Entregas Actual.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Object.entries(data.sheetsStats).map(([sheetKey, stats]) => (
                  <div key={sheetKey} className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <FileSpreadsheet className="w-4 h-4 text-blue-600" />
                        <span className="font-semibold text-sm text-slate-900 dark:text-white">
                          {sheetKey}
                        </span>
                      </div>
                      {stats.error ? (
                        <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-red-100 text-red-800">
                          Error
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-100 text-emerald-800">
                          OK
                        </span>
                      )}
                    </div>
                    <div className="mt-3 flex items-baseline justify-between text-xs text-slate-500">
                      <span>Filas leídas:</span>
                      <strong className="text-slate-800 dark:text-slate-200 text-sm">{stats.rowCount}</strong>
                    </div>
                    {stats.error && (
                      <p className="text-[11px] text-red-600 mt-2">{stats.error}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Future operations placeholder card */}
      <div className="bg-gradient-to-br from-slate-50 to-blue-50/30 dark:from-slate-900 dark:to-blue-950/20 p-6 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-100 dark:bg-blue-900/50 text-blue-600 rounded-xl">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-semibold text-sm text-slate-900 dark:text-white">
              Próximas funciones de operaciones en planillas
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Aquí se integrarán las funciones para sincronización automática, traspaso masivo a Entregas Actual y actualización de estados entre planillas.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  TrendingUp,
  DollarSign,
  PieChart as PieChartIcon,
  Calendar,
  RefreshCw,
  Building2,
  Truck,
  Users,
  Megaphone,
  CreditCard,
  Target,
  Sparkles,
  Search,
  ChevronDown,
  ChevronRight,
  Maximize2,
  Minimize2,
  HelpCircle,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  ArrowRightLeft,
  ShieldCheck,
  Scale,
  Percent
} from 'lucide-react';

interface ExpenseCategory {
  name: string;
  amount: number;
  color: string;
  percentage: number;
}

interface DayData {
  day: string;
  revenue: number;
  expenses: number;
  cmv: number;
  flete: number;
  publicidad: number;
  sueldos: number;
  netProfit: number;
  cumulativeProfit: number;
  pctFlete: number;
  pctPublicidad: number;
  pctCmv: number;
  hasData: boolean;
}

export interface CardSurchargeDailyItem {
  day: string;
  mpCost: number;
  clientSurcharge: number;
  netAbsorbed: number;
  difference: number;
  coveragePct: number;
  status: 'cubierto' | 'absorbido' | 'sin_costo';
}

export interface CardSurchargeAnalysis {
  totalMp: number;
  totalSurcharge: number;
  netAbsorbed: number;
  coveragePercentage: number;
  absorbedPercentage: number;
  criteria: string;
  source: string;
  dailyTimeline: CardSurchargeDailyItem[];
  byDeliveryDate?: {
    totalSurcharge: number;
    netAbsorbed: number;
    coveragePercentage: number;
    absorbedPercentage?: number;
    dailyTimeline: CardSurchargeDailyItem[];
  };
  byOrderDate?: {
    totalSurcharge: number;
    netAbsorbed: number;
    coveragePercentage: number;
    absorbedPercentage?: number;
    dailyTimeline: CardSurchargeDailyItem[];
  };
}

interface MatrixItem {
  concept: string;
  pctTot: string;
  ingresos: number;
  egresos: number;
  pctUnit: string;
  total: number;
  dailyValues: number[];
  dailyValuesByDeliveryDate?: number[];
  dailyValuesByOrderDate?: number[];
  totalByDeliveryDate?: number;
  totalByOrderDate?: number;
  pctTotByDeliveryDate?: string;
  pctTotByOrderDate?: string;
  tag?: string;
  isSurcharge?: boolean;
  isBaseSales?: boolean;
  isNetAbsorbed?: boolean;
  isRecupero?: boolean;
}

interface MatrixGroup {
  id: string;
  title: string;
  badge: string;
  color: string;
  subtotal: {
    total: number;
    dailyValues: number[];
  };
  rows: MatrixItem[];
}

interface EERRResponse {
  success: boolean;
  lastUpdated: string;
  source: string;
  kpis: {
    totalFacturacion: number;
    totalEgresos: number;
    margenBruto: number;
    pctMargenBruto: number;
    totalCmv: number;
    pctCmv: number;
    totalPublicidad: number;
    pctPublicidad: number;
    totalFlete: number;
    pctFlete: number;
    totalSueldos: number;
    totalMp: number;
    totalSurcharge?: number;
    netAbsorbedMp?: number;
    pctMpCovered?: number;
    pctMpAbsorbed?: number;
    utilidadNetaActual: number;
    pctUtilidadActual: number;
    utilidadNetaProyectada: number;
    diasRegistrados: number;
    totalDiasMes: number;
  };
  expensesByCategory: ExpenseCategory[];
  dailyTimeline: DayData[];
  cardSurchargeAnalysis?: CardSurchargeAnalysis;
  matrix: {
    days: string[];
    groups: MatrixGroup[];
  };
}

export default function EstadoResultadosView() {
  const [data, setData] = useState<EERRResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSegment, setActiveSegment] = useState<number | null>(null);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [surchargeCriteria, setSurchargeCriteria] = useState<'order_date' | 'delivery_date'>('delivery_date');
  const [showAbsorptionAudit, setShowAbsorptionAudit] = useState(true);

  // Expand / collapse state for matrix groups (default: all collapsed)
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const toggleGroup = (groupId: string) => {
    setCollapsedGroups(prev => {
      const current = prev[groupId] ?? true;
      return {
        ...prev,
        [groupId]: !current
      };
    });
  };

  const collapseAll = () => {
    if (!data?.matrix?.groups) return;
    const all: Record<string, boolean> = {};
    data.matrix.groups.forEach(g => {
      all[g.id] = true;
    });
    setCollapsedGroups(all);
  };

  const expandAll = () => {
    if (!data?.matrix?.groups) return;
    const all: Record<string, boolean> = {};
    data.matrix.groups.forEach(g => {
      all[g.id] = false;
    });
    setCollapsedGroups(all);
  };

  const fetchData = async (force = false) => {
    try {
      if (force) setRefreshing(true);
      else setLoading(true);

      const url = `/api/admin/finanzas/eerr${force ? '?refresh=true' : ''}`;
      const res = await fetch(url);
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Error al obtener datos');
      }

      setData(json);
      setError(null);
    } catch (err: any) {
      console.error('Error fetching EERR:', err);
      setError(err.message || 'Error de conexión con la planilla');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      maximumFractionDigits: 0
    }).format(val || 0);
  };

  // Filter groups and rows by search query
  const filteredGroups = useMemo(() => {
    if (!data?.matrix?.groups) return [];
    if (!searchQuery.trim()) return data.matrix.groups;

    const q = searchQuery.toLowerCase();
    return data.matrix.groups
      .map(group => {
        const matchingRows = group.rows.filter(r =>
          r.concept.toLowerCase().includes(q)
        );
        if (matchingRows.length > 0 || group.title.toLowerCase().includes(q)) {
          return {
            ...group,
            rows: matchingRows.length > 0 ? matchingRows : group.rows
          };
        }
        return null;
      })
      .filter(Boolean) as MatrixGroup[];
  }, [data, searchQuery]);

  const activeDaysWithData = useMemo(() => {
    return data?.dailyTimeline.filter(d => d.hasData) || [];
  }, [data]);

  const dailyFacturaciones = useMemo(() => {
    const ingresosGroup = data?.matrix?.groups?.find(g => g.id === 'ingresos');
    return ingresosGroup?.subtotal?.dailyValues || [];
  }, [data]);

  const activeSurchargeAnalysis = useMemo(() => {
    if (!data?.cardSurchargeAnalysis) return null;
    const totalMp = data.cardSurchargeAnalysis.totalMp;
    if (surchargeCriteria === 'delivery_date') {
      const del = data.cardSurchargeAnalysis.byDeliveryDate || data.cardSurchargeAnalysis;
      const totalSurcharge = del.totalSurcharge;
      const netAbsorbed = del.netAbsorbed;
      const coveragePercentage = del.coveragePercentage;
      const absorbedPercentage = totalMp > 0 ? Number(((netAbsorbed / totalMp) * 100).toFixed(1)) : 0;
      return {
        totalMp,
        totalSurcharge,
        netAbsorbed,
        coveragePercentage,
        absorbedPercentage,
        dailyTimeline: del.dailyTimeline,
        source: data.cardSurchargeAnalysis.source
      };
    } else {
      const ord = data.cardSurchargeAnalysis.byOrderDate || data.cardSurchargeAnalysis;
      const totalSurcharge = ord.totalSurcharge;
      const netAbsorbed = ord.netAbsorbed;
      const coveragePercentage = ord.coveragePercentage;
      const absorbedPercentage = totalMp > 0 ? Number(((netAbsorbed / totalMp) * 100).toFixed(1)) : 0;
      return {
        totalMp,
        totalSurcharge,
        netAbsorbed,
        coveragePercentage,
        absorbedPercentage,
        dailyTimeline: ord.dailyTimeline,
        source: data.cardSurchargeAnalysis.source
      };
    }
  }, [data, surchargeCriteria]);

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-24 space-y-4 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-sm">
        <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-slate-600 dark:text-slate-400 font-medium animate-pulse text-sm">
          Consultando planilla con Cuenta de Servicio de Google...
        </p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="p-8 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 rounded-3xl text-center space-y-4">
        <p className="text-rose-700 dark:text-rose-400 font-semibold text-lg">{error}</p>
        <button
          onClick={() => fetchData(true)}
          className="px-5 py-2.5 bg-rose-600 text-white font-medium rounded-xl hover:bg-rose-700 transition"
        >
          Reintentar sincronización
        </button>
      </div>
    );
  }

  if (!data) return null;

  const { kpis, expensesByCategory, matrix } = data;

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 rounded-3xl text-white shadow-xl">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-bold tracking-tight">Estado de Resultados (EERR)</h2>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Conexión Privada Service Account
            </span>
          </div>
          <p className="text-slate-300 text-sm">
            Estructura de costos agrupada por rubros contables, seguimiento diario y estimación a fin de mes.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 text-white font-medium text-sm transition backdrop-blur-sm border border-white/10 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Sincronizando...' : 'Actualizar Datos'}
          </button>
        </div>
      </div>

      {/* Hero KPIs Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Facturación */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm relative overflow-hidden group hover:border-indigo-400 transition">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Facturación Total</span>
            <div className="p-2 bg-indigo-50 dark:bg-indigo-950/40 rounded-xl text-indigo-600 dark:text-indigo-400">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white">
            {formatCurrency(kpis.totalFacturacion)}
          </div>
          <div className="mt-2 text-xs text-slate-500 flex items-center justify-between">
            <span>{kpis.diasRegistrados} días registrados</span>
            <span className="text-emerald-600 font-semibold">100% Ingresos</span>
          </div>
        </div>

        {/* KPI 2: CMV & Margen Bruto */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm relative overflow-hidden group hover:border-blue-400 transition">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Costo Mercadería (CMV)</span>
            <div className="p-2 bg-blue-50 dark:bg-blue-950/40 rounded-xl text-blue-600 dark:text-blue-400">
              <Building2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white">
            {formatCurrency(kpis.totalCmv)}
          </div>
          <div className="mt-2 text-xs text-slate-500 flex items-center justify-between">
            <span>{kpis.pctCmv}% s/ Ventas</span>
            <span className="text-blue-600 font-semibold">Margen: {kpis.pctMargenBruto}%</span>
          </div>
        </div>

        {/* KPI 3: Utilidad Actual */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm relative overflow-hidden group hover:border-emerald-400 transition">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Utilidad Neta Actual</span>
            <div className="p-2 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl text-emerald-600 dark:text-emerald-400">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
            {formatCurrency(kpis.utilidadNetaActual)}
          </div>
          <div className="mt-2 text-xs text-slate-500 flex items-center justify-between">
            <span>Margen Neto: {kpis.pctUtilidadActual}%</span>
            <span className="text-emerald-600 font-semibold">Post Impuestos</span>
          </div>
        </div>

        {/* KPI 4: Proyección a Fin de Mes */}
        <div className="bg-gradient-to-br from-indigo-600 via-purple-600 to-indigo-700 p-5 rounded-2xl text-white shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between text-indigo-100 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              Proyección Fin de Mes
            </span>
            <div className="p-1.5 bg-white/20 rounded-lg text-white">
              <Target className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-white drop-shadow-sm">
            {formatCurrency(kpis.utilidadNetaProyectada)}
          </div>
          <div className="mt-2 text-xs text-indigo-100/90 flex items-center justify-between">
            <span>Estimado cierre mes</span>
            <span className="bg-white/20 px-2 py-0.5 rounded-full font-semibold">Tendencia +</span>
          </div>
        </div>
      </div>

      {/* Control Ratios Pill Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 dark:bg-slate-900/60 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 text-xs">
        <div className="flex items-center gap-2.5 px-3 py-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200/60 dark:border-slate-800 shadow-2xs">
          <div className="p-1.5 bg-amber-50 dark:bg-amber-950/40 text-amber-600 rounded-lg">
            <Truck className="w-3.5 h-3.5" />
          </div>
          <div>
            <div className="text-slate-400 font-medium">% Flete</div>
            <div className="font-bold text-slate-800 dark:text-slate-200">{kpis.pctFlete}% ({formatCurrency(kpis.totalFlete)})</div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 px-3 py-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200/60 dark:border-slate-800 shadow-2xs">
          <div className="p-1.5 bg-rose-50 dark:bg-rose-950/40 text-rose-600 rounded-lg">
            <Megaphone className="w-3.5 h-3.5" />
          </div>
          <div>
            <div className="text-slate-400 font-medium">% Publicidad + Fee</div>
            <div className="font-bold text-slate-800 dark:text-slate-200">{kpis.pctPublicidad}% ({formatCurrency(kpis.totalPublicidad)})</div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 px-3 py-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200/60 dark:border-slate-800 shadow-2xs">
          <div className="p-1.5 bg-purple-50 dark:bg-purple-950/40 text-purple-600 rounded-lg">
            <Users className="w-3.5 h-3.5" />
          </div>
          <div>
            <div className="text-slate-400 font-medium">Sueldos (Precarga)</div>
            <div className="font-bold text-slate-800 dark:text-slate-200">{formatCurrency(kpis.totalSueldos)}</div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 px-3 py-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200/60 dark:border-slate-800 shadow-2xs">
          <div className="p-1.5 bg-cyan-50 dark:bg-cyan-950/40 text-cyan-600 rounded-lg">
            <CreditCard className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-slate-400 font-medium">
              <span>Costos MercadoPago</span>
              {kpis.netAbsorbedMp !== undefined && (
                <span className="text-[10px] px-1.5 py-0.2 rounded font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400">
                  {kpis.pctMpAbsorbed}% abs.
                </span>
              )}
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-bold text-slate-800 dark:text-slate-200">
                {formatCurrency(kpis.totalMp)}
              </span>
              {kpis.totalSurcharge !== undefined && (
                <span className="text-[10px] text-slate-400 hidden sm:inline">
                  (Neto: <strong className="text-amber-600 dark:text-amber-400 font-semibold">{formatCurrency(kpis.netAbsorbedMp || 0)}</strong>)
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Executive Surcharge & Absorption Control Card */}
      {activeSurchargeAnalysis && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden p-6 space-y-6">
          {/* Header & Controls */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800/80 pb-5">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400">
                  <Scale className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Control de Absorción: MercadoPago vs Recargo por Tarjeta
                </h3>
                <span className="hidden md:inline-flex text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                  Auditoría Financiera
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Monitoreo de comisiones retenidas por cobranzas vs. lo abonado por clientes como recargo para conocer el costo exacto absorbido.
              </p>
            </div>

            {/* Right Toggle Controls */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200/80 dark:border-slate-700/80 text-xs">
                <button
                  onClick={() => setSurchargeCriteria('delivery_date')}
                  className={`px-3 py-1.5 rounded-lg font-medium transition ${
                    surchargeCriteria === 'delivery_date'
                      ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs font-semibold'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                  title="Alineado con la Planilla de Entregados y el momento de cobro en destino"
                >
                  Por Fecha de Entrega <span className="text-[10px] font-bold opacity-80">(Recomendado)</span>
                </button>
                <button
                  onClick={() => setSurchargeCriteria('order_date')}
                  className={`px-3 py-1.5 rounded-lg font-medium transition ${
                    surchargeCriteria === 'order_date'
                      ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs font-semibold'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                  title="Agrupado según la fecha en que la vendedora cargó el pedido"
                >
                  Por Fecha de Pedido
                </button>
              </div>

              <button
                onClick={() => setShowAbsorptionAudit(!showAbsorptionAudit)}
                className="px-3 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 transition flex items-center gap-1.5"
              >
                {showAbsorptionAudit ? 'Ocultar Detalle Diario' : 'Ver Detalle Diario'}
              </button>
            </div>
          </div>

          {/* 4 Summary Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Costo MP Bruto */}
            <div className="p-4 rounded-2xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30">
              <div className="text-xs font-semibold text-rose-600 dark:text-rose-400 mb-1 flex items-center justify-between">
                <span>Comisión MP (Bruto)</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-900/50 text-rose-700 dark:text-rose-300 font-bold">
                  Retención
                </span>
              </div>
              <div className="text-2xl font-black text-rose-600 dark:text-rose-400">
                {formatCurrency(activeSurchargeAnalysis?.totalMp || 0)}
              </div>
              <div className="mt-1 text-[11px] text-slate-500">
                100% de comisiones según planilla
              </div>
            </div>

            {/* Card 2: Recargo Tarjeta Abonado por Clientes */}
            <div className="p-4 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/30">
              <div className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 mb-1 flex items-center justify-between">
                <span>Recargos de Clientes</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 font-bold">
                  {activeSurchargeAnalysis?.coveragePercentage}% cubierto
                </span>
              </div>
              <div className="text-2xl font-black text-indigo-600 dark:text-indigo-400">
                {formatCurrency(activeSurchargeAnalysis?.totalSurcharge || 0)}
              </div>
              <div className="mt-1 text-[11px] text-slate-500">
                Recupero trasladado al cliente
              </div>
            </div>

            {/* Card 3: Costo MP Neto Absorbido */}
            <div className="p-4 rounded-2xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30">
              <div className="text-xs font-semibold text-amber-600 dark:text-amber-400 mb-1 flex items-center justify-between">
                <span>Costo Neto Absorbido</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300 font-bold">
                  {activeSurchargeAnalysis?.absorbedPercentage}% absorbido
                </span>
              </div>
              <div className="text-2xl font-black text-amber-600 dark:text-amber-400">
                {formatCurrency(activeSurchargeAnalysis?.netAbsorbed || 0)}
              </div>
              <div className="mt-1 text-[11px] text-slate-500">
                Gasto no recuperado (a cargo de Zono)
              </div>
            </div>

            {/* Card 4: Ratio de Eficacia */}
            <div className="p-4 rounded-2xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30">
              <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mb-1 flex items-center justify-between">
                <span>Eficacia de Traslado</span>
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
              </div>
              <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                {activeSurchargeAnalysis?.coveragePercentage}%
              </div>
              <div className="mt-1.5">
                <div className="w-full bg-slate-200 dark:bg-slate-800 h-2 rounded-full overflow-hidden flex">
                  <div
                    className="bg-emerald-500 h-full transition-all duration-500"
                    style={{ width: `${Math.min(100, activeSurchargeAnalysis?.coveragePercentage || 0)}%` }}
                    title={`Recuperado: ${activeSurchargeAnalysis?.coveragePercentage}%`}
                  />
                  <div
                    className="bg-amber-500 h-full transition-all duration-500"
                    style={{ width: `${Math.min(100, activeSurchargeAnalysis?.absorbedPercentage || 0)}%` }}
                    title={`Absorbido: ${activeSurchargeAnalysis?.absorbedPercentage}%`}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Collapsible Daily Reconciliation Table */}
          {showAbsorptionAudit && activeSurchargeAnalysis?.dailyTimeline && (
            <div className="mt-5 pt-4 border-t border-slate-200/80 dark:border-slate-800">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <FileSpreadsheet className="w-3.5 h-3.5 text-indigo-500" />
                  Auditoría Diaria: MercadoPago vs Recargos de Tarjeta
                </span>
                <span className="text-[11px] text-slate-400">
                  Criterio: {surchargeCriteria === 'delivery_date' ? 'Fecha de Entrega Programada (Recomendado)' : 'Fecha de Carga del Pedido'}
                </span>
              </div>
              <div className="overflow-x-auto max-h-80 overflow-y-auto">
                <table className="w-full text-left text-xs whitespace-nowrap">
                  <thead className="bg-white dark:bg-slate-900 text-slate-500 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-10">
                    <tr>
                      <th className="py-2 px-3 font-semibold">Día</th>
                      <th className="py-2 px-3 text-right font-semibold">Costo MP</th>
                      <th className="py-2 px-3 text-right font-semibold">Recargo Cliente</th>
                      <th className="py-2 px-3 text-right font-semibold">Saldo (+Superávit / -Absorbido)</th>
                      <th className="py-2 px-3 text-right font-semibold">% Cobertura</th>
                      <th className="py-2 px-3 text-center font-semibold">Diagnóstico</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                    {activeSurchargeAnalysis.dailyTimeline.map((item, idx) => {
                      if (item.mpCost === 0 && item.clientSurcharge === 0) return null;
                      return (
                        <tr key={idx} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition">
                          <td className="py-2 px-3 font-bold text-slate-700 dark:text-slate-200">{item.day}</td>
                          <td className="py-2 px-3 text-right text-rose-600 font-semibold">{formatCurrency(item.mpCost)}</td>
                          <td className="py-2 px-3 text-right text-indigo-600 dark:text-indigo-400 font-semibold">{formatCurrency(item.clientSurcharge)}</td>
                          <td className={`py-2 px-3 text-right font-bold ${
                            item.difference >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
                          }`}>
                            {item.difference > 0 ? `+${formatCurrency(item.difference)}` : formatCurrency(item.difference)}
                          </td>
                          <td className="py-2 px-3 text-right text-slate-600 dark:text-slate-300 font-medium">
                            {item.coveragePct}%
                          </td>
                          <td className="py-2 px-3 text-center">
                            {item.status === 'cubierto' ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/60">
                                <CheckCircle2 className="w-3 h-3" />
                                Cubierto al 100%
                              </span>
                            ) : item.status === 'absorbido' ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200/60 dark:border-amber-800/60">
                                <AlertTriangle className="w-3 h-3" />
                                Absorbe Zono ({formatCurrency(item.netAbsorbed)})
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-400">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Main Table Matrix */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden">
        {/* Table Toolbar */}
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 sm:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Filtrar concepto o rubro..."
                className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 transition"
              />
            </div>

            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200/80 dark:border-slate-700 text-xs">
              <button
                onClick={expandAll}
                className="px-2.5 py-1.5 text-slate-600 dark:text-slate-300 hover:text-indigo-600 rounded-lg font-medium transition flex items-center gap-1"
                title="Expandir todos los rubros"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Expandir</span>
              </button>
              <button
                onClick={collapseAll}
                className="px-2.5 py-1.5 text-slate-600 dark:text-slate-300 hover:text-indigo-600 rounded-lg font-medium transition flex items-center gap-1"
                title="Contraer todos los rubros"
              >
                <Minimize2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Contraer</span>
              </button>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 text-xs text-slate-400">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>Matriz Consolidada ({activeDaysWithData.length} días con actividad)</span>
          </div>
        </div>

        {/* Scrollable Matrix Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs whitespace-nowrap">
            <thead className="bg-slate-50/90 dark:bg-slate-800/80 text-slate-500 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-3 px-2.5 sm:px-4 sticky left-0 bg-slate-100 dark:bg-slate-800 z-20 w-[170px] sm:w-[240px] min-w-[170px] sm:min-w-[240px] max-w-[170px] sm:max-w-none border-r border-slate-200 dark:border-slate-700 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                  Rubro / Concepto
                </th>
                <th className="py-3 px-2.5 sm:px-4 text-right min-w-[105px] sm:min-w-[130px]">Total Mes</th>
                <th className="py-3 px-2 sm:px-3 text-right min-w-[70px] sm:min-w-[85px]">% Inc.</th>
                {matrix.days.map((day, dIdx) => (
                  <th key={dIdx} className="py-3 px-2 sm:px-3 text-right min-w-[75px] sm:min-w-[90px] font-semibold text-slate-500">
                    {day}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {filteredGroups.map(group => {
                const isCollapsed = searchQuery.trim() ? false : (collapsedGroups[group.id] ?? true);
                const isIngresos = group.id === 'ingresos';
                const isResultados = group.id === 'resultados';

                return (
                  <React.Fragment key={group.id}>
                    {/* Section Header Row (Clickable to toggle) */}
                    <tr
                      onClick={() => toggleGroup(group.id)}
                      className={`cursor-pointer transition select-none ${
                        isIngresos
                          ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-950 dark:text-indigo-200 font-bold hover:bg-indigo-100/70'
                          : isResultados
                          ? 'bg-emerald-50 dark:bg-emerald-950/70 text-emerald-950 dark:text-emerald-200 font-bold hover:bg-emerald-100/70'
                          : 'bg-slate-100 dark:bg-slate-800/80 text-slate-900 dark:text-slate-100 font-bold hover:bg-slate-200/80'
                      }`}
                    >
                      <td className={`py-2.5 px-2.5 sm:px-4 sticky left-0 z-10 w-[170px] sm:w-[240px] min-w-[170px] sm:min-w-[240px] max-w-[170px] sm:max-w-none border-r border-slate-200 dark:border-slate-700 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.12)] ${
                        isIngresos
                          ? 'bg-[#eef2ff] dark:bg-[#1e1b4b]'
                          : isResultados
                          ? 'bg-[#ecfdf5] dark:bg-[#064e3b]'
                          : 'bg-[#f1f5f9] dark:bg-[#1e293b]'
                      }`}>
                        <div className="flex items-center gap-1.5 min-w-0">
                          <button className="p-0.5 rounded hover:bg-black/10 transition shrink-0">
                            {isCollapsed ? (
                              <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                            )}
                          </button>
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: group.color }}
                          />
                          <span className="uppercase tracking-wider text-[11px] font-extrabold truncate" title={group.title}>
                            {group.title}
                          </span>
                          <span className="hidden sm:inline-flex text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white dark:bg-slate-900 border border-black/5 shrink-0">
                            {group.rows.length} {group.rows.length === 1 ? 'concepto' : 'conceptos'}
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 px-2.5 sm:px-4 text-right font-black min-w-[105px] sm:min-w-[130px]">
                        {formatCurrency(group.subtotal.total)}
                      </td>
                      <td className="py-2.5 px-2 sm:px-3 text-right text-[11px] text-slate-500 min-w-[70px] sm:min-w-[85px]">
                        {kpis.totalFacturacion > 0
                          ? `${((group.subtotal.total / kpis.totalFacturacion) * 100).toFixed(1)}%`
                          : '-'}
                      </td>
                      {group.subtotal.dailyValues.map((dVal, dIdx) => {
                        const dayRev = dailyFacturaciones[dIdx] || 0;
                        const showPct = !isIngresos && dayRev > 0 && dVal > 0;
                        const pctOfDay = showPct ? ((dVal / dayRev) * 100).toFixed(1) : null;

                        return (
                          <td
                            key={dIdx}
                            className={`py-2 px-3 text-right font-semibold ${
                              dVal > 0
                                ? isIngresos
                                  ? 'text-indigo-600 dark:text-indigo-400'
                                  : isResultados
                                  ? 'text-emerald-600 dark:text-emerald-400 font-bold'
                                  : 'text-slate-800 dark:text-slate-200'
                                : 'text-slate-300 dark:text-slate-600'
                            }`}
                          >
                            {dVal > 0 ? (
                              <div className="flex flex-col items-end leading-tight">
                                <span>{formatCurrency(dVal)}</span>
                                {pctOfDay && (
                                  <span
                                    className={`text-[9.5px] font-semibold tracking-tight ${
                                      isResultados
                                        ? 'text-emerald-600/80 dark:text-emerald-400/80'
                                        : 'text-slate-400 dark:text-slate-500'
                                    }`}
                                  >
                                    {pctOfDay}%
                                  </span>
                                )}
                              </div>
                            ) : (
                              '-'
                            )}
                          </td>
                        );
                      })}
                    </tr>

                    {/* Detailed Rows (Shown when not collapsed) */}
                    {!isCollapsed &&
                      group.rows.map((row, rIdx) => {
                        const isMainUtilidad = row.concept.includes('dsp de Impuestos');
                        const isAcumulado = row.concept.includes('Acumulada');
                        const isContribucion = row.concept.includes('Contribución Marginal');
                        const isSurcharge = row.isSurcharge || row.tag === 'surcharge' || row.concept.includes('Recargo por Tarjeta');
                        const isBaseSales = row.isBaseSales || row.tag === 'base' || row.concept.includes('Base sin recargos');
                        const isMpNeto = row.isNetAbsorbed || row.tag === 'net_absorbed' || row.concept.includes('MercadoPago Neto');
                        const isRecupero = row.isRecupero || row.tag === 'recupero' || row.concept.includes('Recargos Cobrados');

                        return (
                          <tr
                            key={rIdx}
                            className={`transition hover:bg-slate-50/90 dark:hover:bg-slate-800/40 ${
                              isMainUtilidad
                                ? 'bg-emerald-50/30 dark:bg-emerald-950/20 font-bold'
                                : isAcumulado
                                ? 'bg-purple-50/20 dark:bg-purple-950/10 text-purple-950 dark:text-purple-200'
                                : isContribucion
                                ? 'bg-blue-50/20 dark:bg-blue-950/10'
                                : isSurcharge
                                ? 'bg-indigo-50/30 dark:bg-indigo-950/20'
                                : isMpNeto
                                ? 'bg-amber-50/35 dark:bg-amber-950/20 font-semibold'
                                : isRecupero
                                ? 'bg-emerald-50/15 dark:bg-emerald-950/10'
                                : ''
                            }`}
                          >
                            <td className="py-2.5 px-2.5 sm:px-4 pl-6 sm:pl-9 sticky left-0 bg-white dark:bg-slate-900 z-10 w-[170px] sm:w-[240px] min-w-[170px] sm:min-w-[240px] max-w-[170px] sm:max-w-none text-slate-700 dark:text-slate-300 border-r border-slate-200 dark:border-slate-800 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.08)] font-medium">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                  isSurcharge
                                    ? 'bg-indigo-500'
                                    : isMpNeto
                                    ? 'bg-amber-500'
                                    : isRecupero
                                    ? 'bg-emerald-500'
                                    : 'bg-slate-300 dark:bg-slate-600'
                                }`} />
                                <span className="truncate" title={row.concept}>{row.concept}</span>
                                {isSurcharge && (
                                  <span className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                                    Abonado
                                  </span>
                                )}
                                {isMpNeto && (
                                  <span className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                                    Absorbido
                                  </span>
                                )}
                                {isRecupero && (
                                  <span className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                                    Recupero
                                  </span>
                                )}
                              </div>
                            </td>
                            <td
                              className={`py-2.5 px-2.5 sm:px-4 text-right ${
                                isMainUtilidad
                                  ? 'text-emerald-600 font-black text-sm'
                                  : isAcumulado
                                  ? 'text-purple-600 font-bold'
                                  : isSurcharge
                                  ? 'text-indigo-600 dark:text-indigo-400 font-bold'
                                  : isMpNeto
                                  ? 'text-amber-700 dark:text-amber-400 font-bold'
                                  : isRecupero
                                  ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                                  : 'text-slate-800 dark:text-slate-200 font-semibold'
                              }`}
                            >
                              {formatCurrency(row.total)}
                            </td>
                            <td className="py-2.5 px-2 sm:px-3 text-right text-slate-400 text-[11px]">
                              {row.pctTot || '-'}
                            </td>
                            {row.dailyValues.map((val, vIdx) => {
                              const dayRev = dailyFacturaciones[vIdx] || 0;
                              const showPct = (isSurcharge || isBaseSales || isMpNeto || !isIngresos) && dayRev > 0 && val > 0;
                              const pctOfDay = showPct ? ((val / dayRev) * 100).toFixed(1) : null;

                              return (
                                <td
                                  key={vIdx}
                                  className={`py-2 px-3 text-right ${
                                    val > 0
                                      ? isMainUtilidad
                                        ? 'text-emerald-600 font-bold'
                                        : isAcumulado
                                        ? 'text-purple-600 font-semibold'
                                        : isSurcharge
                                        ? 'text-indigo-600 dark:text-indigo-400 font-semibold'
                                        : isMpNeto
                                        ? 'text-amber-700 dark:text-amber-400 font-semibold'
                                        : isRecupero
                                        ? 'text-emerald-600 dark:text-emerald-400'
                                        : 'text-slate-700 dark:text-slate-300'
                                      : 'text-slate-300 dark:text-slate-600'
                                  }`}
                                >
                                  {val > 0 ? (
                                    <div className="flex flex-col items-end leading-tight">
                                      <span>{formatCurrency(val)}</span>
                                      {pctOfDay && (
                                        <span
                                          className={`text-[9px] font-medium tracking-tight ${
                                            isMainUtilidad
                                              ? 'text-emerald-600/70'
                                              : isSurcharge
                                              ? 'text-indigo-600/70 dark:text-indigo-400/70'
                                              : isMpNeto
                                              ? 'text-amber-700/80 dark:text-amber-400/80'
                                              : isRecupero
                                              ? 'text-emerald-600/70 dark:text-emerald-400/70'
                                              : 'text-slate-400/80 dark:text-slate-500'
                                          }`}
                                        >
                                          {pctOfDay}%
                                        </span>
                                      )}
                                    </div>
                                  ) : (
                                    '-'
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Main Analysis Section: Timeline & Donut Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Daily Timeline Evolution (7 cols) */}
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Calendar className="w-4 h-4 text-indigo-600" />
                Evolución Diaria del Mes
              </h3>
              <p className="text-xs text-slate-500">Facturación diaria vs. Utilidad acumulada</p>
            </div>
            <div className="text-xs text-slate-500">
              {activeDaysWithData.length} días activos
            </div>
          </div>

          {/* Daily Cards Chart */}
          <div className="space-y-3 pt-2">
            {activeDaysWithData.map((d, idx) => {
              const maxRev = Math.max(...activeDaysWithData.map(x => x.revenue));
              const revWidth = maxRev > 0 ? (d.revenue / maxRev) * 100 : 0;
              const isPositive = d.netProfit >= 0;

              return (
                <div
                  key={idx}
                  onClick={() => setSelectedDay(selectedDay === idx ? null : idx)}
                  className={`p-3.5 rounded-xl border transition cursor-pointer ${
                    selectedDay === idx
                      ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/30 shadow-sm'
                      : 'border-slate-100 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 rounded-lg bg-slate-900 text-white font-bold text-xs">
                        Día {d.day}
                      </span>
                      <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                        Fact: {formatCurrency(d.revenue)}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <span className={`text-xs font-bold ${isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {isPositive ? '+' : ''}{formatCurrency(d.netProfit)}
                        </span>
                        <span className="text-[10px] text-slate-400 block">
                          Acum: {formatCurrency(d.cumulativeProfit)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Visual Bar Indicator */}
                  <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden flex">
                    <div
                      className="bg-indigo-600 h-full rounded-full transition-all duration-500"
                      style={{ width: `${revWidth}%` }}
                    />
                  </div>

                  {/* Quick daily efficiency ratios */}
                  <div className="mt-2.5 pt-2 border-t border-slate-200/60 dark:border-slate-800/60 flex items-center justify-between text-[11px] text-slate-500">
                    <span>CMV: <strong className="text-slate-700 dark:text-slate-300">{d.pctCmv}%</strong></span>
                    <span>Flete: <strong className="text-slate-700 dark:text-slate-300">{d.pctFlete}%</strong></span>
                    <span>Publi: <strong className="text-slate-700 dark:text-slate-300">{d.pctPublicidad}%</strong></span>
                    <span>Egresos: <strong className="text-slate-700 dark:text-slate-300">{formatCurrency(d.expenses)}</strong></span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Expenses Distribution Breakdown (5 cols) */}
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <PieChartIcon className="w-4 h-4 text-purple-600" />
                  Estructura de Egresos
                </h3>
                <p className="text-xs text-slate-500">Distribución porcentual por concepto</p>
              </div>
              <span className="text-xs font-bold px-2.5 py-1 bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 rounded-lg">
                Total: {formatCurrency(kpis.totalEgresos)}
              </span>
            </div>

            {/* Breakdown List */}
            <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
              {expensesByCategory.map((cat, idx) => (
                <div
                  key={idx}
                  onMouseEnter={() => setActiveSegment(idx)}
                  onMouseLeave={() => setActiveSegment(null)}
                  className={`p-2.5 rounded-xl border transition flex items-center justify-between ${
                    activeSegment === idx
                      ? 'border-indigo-600 bg-indigo-50/40 dark:bg-indigo-950/30'
                      : 'border-slate-100 dark:border-slate-800 hover:border-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: cat.color }}
                    />
                    <span className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate">
                      {cat.name}
                    </span>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="text-xs font-bold text-slate-900 dark:text-white block">
                      {formatCurrency(cat.amount)}
                    </span>
                    <span className="text-[10px] text-slate-400 font-semibold">
                      {cat.percentage}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 flex items-center justify-between">
            <span>Costo Mercadería representa el mayor egreso</span>
            <span className="font-bold text-blue-600">
              {expensesByCategory[0]?.percentage}%
            </span>
          </div>
        </div>
      </div>

    </div>
  );
}

'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  TrendingUp,
  DollarSign,
  PieChart as PieChartIcon,
  Calendar,
  RefreshCw,
  ArrowUpRight,
  ShieldCheck,
  Building2,
  Truck,
  Users,
  Megaphone,
  CreditCard,
  Target,
  Sparkles,
  Search,
  CheckCircle2
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

interface MatrixRow {
  concept: string;
  pctTot: string;
  ingresos: number;
  egresos: number;
  pctUnit: string;
  total: number;
  type: string;
  dailyValues: number[];
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
    utilidadNetaActual: number;
    pctUtilidadActual: number;
    utilidadNetaProyectada: number;
    diasRegistrados: number;
    totalDiasMes: number;
  };
  expensesByCategory: ExpenseCategory[];
  dailyTimeline: DayData[];
  matrix: {
    days: string[];
    rows: MatrixRow[];
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

  // Filter matrix rows by search
  const filteredRows = useMemo(() => {
    if (!data?.matrix?.rows) return [];
    if (!searchQuery.trim()) return data.matrix.rows;
    return data.matrix.rows.filter(r =>
      r.concept.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [data, searchQuery]);

  // Donut SVG Calculations
  const donutData = useMemo(() => {
    if (!data?.expensesByCategory) return [];
    const total = data.expensesByCategory.reduce((acc, c) => acc + c.amount, 0);
    let cumulativeAngle = 0;

    return data.expensesByCategory.map((c, idx) => {
      const angle = total > 0 ? (c.amount / total) * 360 : 0;
      const startAngle = cumulativeAngle;
      cumulativeAngle += angle;
      return {
        ...c,
        index: idx,
        startAngle,
        angle
      };
    });
  }, [data]);

  const activeDaysWithData = useMemo(() => {
    return data?.dailyTimeline.filter(d => d.hasData) || [];
  }, [data]);

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-24 space-y-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-slate-600 dark:text-slate-400 font-medium animate-pulse">
          Consultando planilla con Cuenta de Servicio de Google...
        </p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="p-8 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 rounded-2xl text-center space-y-4">
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

  const { kpis, expensesByCategory, dailyTimeline, matrix } = data;

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 rounded-3xl text-white shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold tracking-tight">Estado de Resultados (EERR)</h2>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Sincronizado con Google Sheets Privado
            </span>
          </div>
          <p className="text-slate-300 text-sm">
            Control de ingresos, estructura de costos diarios y proyección financiera a fin de mes.
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
          <div>
            <div className="text-slate-400 font-medium">Costos MercadoPago</div>
            <div className="font-bold text-slate-800 dark:text-slate-200">{formatCurrency(kpis.totalMp)}</div>
          </div>
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
              {activeDaysWithData.length} de {dailyTimeline.length} días activos
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

        {/* Expenses Distribution Donut (5 cols) */}
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

            {/* Donut Visual Breakdown List */}
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

      {/* P&L Matrix Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Matriz Estado de Resultados Día a Día
            </h3>
            <p className="text-xs text-slate-500">
              Detalle consolidado con los 31 días del mes de la hoja oficial
            </p>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar concepto..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs whitespace-nowrap">
            <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-3 px-4 sticky left-0 bg-slate-50 dark:bg-slate-800 z-10 min-w-[220px]">
                  Concepto
                </th>
                <th className="py-3 px-4 text-right min-w-[130px]">Total Mes</th>
                <th className="py-3 px-3 text-right min-w-[80px]">% Incidencia</th>
                {matrix.days.map((day, dIdx) => (
                  <th key={dIdx} className="py-3 px-3 text-right min-w-[90px] font-semibold text-slate-500">
                    {day}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {filteredRows.map((row, rIdx) => {
                const isFacturacion = row.concept.toLowerCase().includes('facturación');
                const isUtilidad = row.concept.toLowerCase().includes('utilidad neta');
                const isCMV = row.concept.toLowerCase().includes('mercadería');

                return (
                  <tr
                    key={rIdx}
                    className={`transition hover:bg-slate-50/80 dark:hover:bg-slate-800/40 ${
                      isFacturacion
                        ? 'bg-indigo-50/40 dark:bg-indigo-950/20 font-bold'
                        : isUtilidad
                        ? 'bg-emerald-50/40 dark:bg-emerald-950/20 font-bold'
                        : isCMV
                        ? 'bg-blue-50/30 dark:bg-blue-950/10'
                        : ''
                    }`}
                  >
                    <td className="py-3 px-4 sticky left-0 bg-white dark:bg-slate-900 z-10 font-medium text-slate-800 dark:text-slate-200 border-r border-slate-100 dark:border-slate-800">
                      {row.concept}
                    </td>
                    <td className={`py-3 px-4 text-right font-semibold ${
                      isFacturacion
                        ? 'text-indigo-600 dark:text-indigo-400'
                        : isUtilidad
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-slate-900 dark:text-white'
                    }`}>
                      {formatCurrency(row.total)}
                    </td>
                    <td className="py-3 px-3 text-right text-slate-500">
                      {row.pctTot || '-'}
                    </td>
                    {row.dailyValues.map((val, vIdx) => (
                      <td
                        key={vIdx}
                        className={`py-3 px-3 text-right ${
                          val > 0
                            ? isFacturacion
                              ? 'text-indigo-600 font-semibold'
                              : isUtilidad
                              ? 'text-emerald-600 font-bold'
                              : 'text-slate-700 dark:text-slate-300'
                            : 'text-slate-300 dark:text-slate-600'
                        }`}
                      >
                        {val > 0 ? formatCurrency(val) : '-'}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

"use client";

import React, { useState, useMemo } from "react";
import { formatPrice } from "@/lib/utils";
import { 
  CalendarDays, 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  ShoppingCart, 
  Receipt, 
  ArrowUpRight, 
  ArrowDownRight,
  Minus,
  Layers,
  ChevronRight
} from "lucide-react";

export interface WeeklyMetricData {
  weekKey: string;           // e.g. "Semana 34"
  label: string;             // e.g. "18/08 al 24/08"
  shortLabel: string;        // e.g. "18/08"
  startDate: string;
  endDate: string;
  totalBilling: number;
  ordersCount: number;
  deliveredCount: number;
  cancelledCount: number;
  pendingCount: number;
  averageTicket: number;
  cancellationRate: number;
  // Variations vs previous week
  deltaBillingPct: number | null;
  deltaOrdersPct: number | null;
  deltaTicketPct: number | null;
}

interface WeeklyComparisonChartProps {
  orders: Array<{
    id: string;
    total_amount: number;
    order_date?: string;
    created_at?: string;
    status: string;
  }>;
}

export default function WeeklyComparisonChart({ orders }: WeeklyComparisonChartProps) {
  const [metricTab, setMetricTab] = useState<"billing" | "orders" | "ticket">("billing");
  const [selectedWeekIdx, setSelectedWeekIdx] = useState<number | null>(null);

  // Group orders into weekly buckets
  const weeklyData: WeeklyMetricData[] = useMemo(() => {
    if (!orders || orders.length === 0) return [];

    // Helper: get ISO week string or date range
    const getWeekNumberAndYear = (d: Date) => {
      const target = new Date(d.valueOf());
      const dayNr = (d.getDay() + 6) % 7;
      target.setDate(target.getDate() - dayNr + 3);
      const firstThursday = target.valueOf();
      target.setMonth(0, 1);
      if (target.getDay() !== 4) {
        target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
      }
      const weekNumber = 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
      return { week: weekNumber, year: d.getFullYear() };
    };

    // Find date range of orders
    const validOrders = orders.filter(o => o.order_date || o.created_at);
    if (validOrders.length === 0) return [];

    // Map week keys
    const weekMap: Record<string, {
      weekNum: number;
      year: number;
      minDate: Date;
      maxDate: Date;
      orders: typeof orders;
    }> = {};

    validOrders.forEach(o => {
      const rawDateStr = (o.order_date || o.created_at || "").slice(0, 10);
      const [y, m, d] = rawDateStr.split("-").map(n => parseInt(n, 10));
      if (!y || !m || !d) return;

      const dateObj = new Date(y, m - 1, d);
      const { week, year } = getWeekNumberAndYear(dateObj);
      const key = `${year}-W${String(week).padStart(2, '0')}`;

      if (!weekMap[key]) {
        // Calculate Monday and Sunday of this week
        const day = dateObj.getDay();
        const diffToMonday = dateObj.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(dateObj.getFullYear(), dateObj.getMonth(), diffToMonday);
        const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);

        weekMap[key] = {
          weekNum: week,
          year,
          minDate: monday,
          maxDate: sunday,
          orders: []
        };
      }

      weekMap[key].orders.push(o);
    });

    // Sort weeks chronologically
    const sortedKeys = Object.keys(weekMap).sort();

    const result: WeeklyMetricData[] = [];

    sortedKeys.forEach((key, idx) => {
      const bucket = weekMap[key];
      const weekOrders = bucket.orders;

      const activeOrders = weekOrders.filter(o => o.status !== "Cancelado");
      const totalBilling = activeOrders.reduce((acc, o) => acc + (Number(o.total_amount) || 0), 0);
      const ordersCount = weekOrders.length;
      const deliveredCount = weekOrders.filter(o => o.status === "Entregado").length;
      const cancelledCount = weekOrders.filter(o => o.status === "Cancelado").length;
      const pendingCount = weekOrders.filter(o => o.status === "Pendiente" || o.status === "Confirmado" || o.status === "Entregando").length;

      const averageTicket = activeOrders.length > 0 ? totalBilling / activeOrders.length : 0;
      const cancellationRate = ordersCount > 0 ? (cancelledCount / ordersCount) * 100 : 0;

      const formatD = (dt: Date) => `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}`;
      const label = `${formatD(bucket.minDate)} al ${formatD(bucket.maxDate)}`;
      const shortLabel = formatD(bucket.minDate);

      let deltaBillingPct: number | null = null;
      let deltaOrdersPct: number | null = null;
      let deltaTicketPct: number | null = null;

      if (idx > 0) {
        const prev = result[idx - 1];
        if (prev.totalBilling > 0) {
          deltaBillingPct = ((totalBilling - prev.totalBilling) / prev.totalBilling) * 100;
        }
        if (prev.ordersCount > 0) {
          deltaOrdersPct = ((ordersCount - prev.ordersCount) / prev.ordersCount) * 100;
        }
        if (prev.averageTicket > 0) {
          deltaTicketPct = ((averageTicket - prev.averageTicket) / prev.averageTicket) * 100;
        }
      }

      result.push({
        weekKey: `Semana ${bucket.weekNum}`,
        label,
        shortLabel,
        startDate: bucket.minDate.toISOString().slice(0, 10),
        endDate: bucket.maxDate.toISOString().slice(0, 10),
        totalBilling,
        ordersCount,
        deliveredCount,
        cancelledCount,
        pendingCount,
        averageTicket,
        cancellationRate,
        deltaBillingPct,
        deltaOrdersPct,
        deltaTicketPct
      });
    });

    return result;
  }, [orders]);

  // Max value for chart scaling
  const maxChartVal = useMemo(() => {
    if (weeklyData.length === 0) return 1;
    if (metricTab === "billing") {
      return Math.max(1, ...weeklyData.map(w => w.totalBilling));
    }
    if (metricTab === "orders") {
      return Math.max(1, ...weeklyData.map(w => w.ordersCount));
    }
    return Math.max(1, ...weeklyData.map(w => w.averageTicket));
  }, [weeklyData, metricTab]);

  // Active highlighted week
  const activeWeek = selectedWeekIdx !== null && weeklyData[selectedWeekIdx] 
    ? weeklyData[selectedWeekIdx] 
    : (weeklyData.length > 0 ? weeklyData[weeklyData.length - 1] : null);

  if (weeklyData.length === 0) return null;

  return (
    <div className="card-enterprise p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-2xs">
            <CalendarDays className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              Evolución y Comparativa Semanal
              <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                {weeklyData.length} Semanas
              </span>
            </h2>
            <p className="text-xs text-slate-500 font-normal">
              Análisis de rendimiento y variación semana a semana (Week-over-Week)
            </p>
          </div>
        </div>

        {/* Metric Selector Tabs */}
        <div className="bg-slate-100/90 p-1 rounded-2xl border border-slate-200/60 flex items-center gap-1 self-stretch sm:self-auto overflow-x-auto scrollbar-none">
          <button
            type="button"
            onClick={() => setMetricTab("billing")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              metricTab === "billing"
                ? "bg-white text-indigo-700 shadow-xs border border-slate-200/80"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <DollarSign className="w-3.5 h-3.5" />
            Facturación
          </button>

          <button
            type="button"
            onClick={() => setMetricTab("orders")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              metricTab === "orders"
                ? "bg-white text-indigo-700 shadow-xs border border-slate-200/80"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            Pedidos
          </button>

          <button
            type="button"
            onClick={() => setMetricTab("ticket")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              metricTab === "ticket"
                ? "bg-white text-indigo-700 shadow-xs border border-slate-200/80"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <Receipt className="w-3.5 h-3.5" />
            Ticket Prom.
          </button>
        </div>
      </div>

      {/* Main Content: Weekly Visual Chart & Summary Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        
        {/* Left / Top: Weekly Visual Bars Chart */}
        <div className="lg:col-span-7 bg-slate-50/60 p-4 sm:p-5 rounded-2xl border border-slate-100 flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">
              {metricTab === "billing" ? "Facturación por Semana" : metricTab === "orders" ? "Volumen de Pedidos por Semana" : "Ticket Promedio por Semana"}
            </span>
            <span className="text-[10px] text-slate-400 font-semibold">
              Toca una semana para ver detalles
            </span>
          </div>

          {/* Bar Chart Container */}
          <div className="relative pt-2 pb-1 overflow-x-auto custom-scrollbar">
            <div className="h-44 flex items-end gap-2 sm:gap-3 min-w-[340px] sm:min-w-full">
              {weeklyData.map((week, idx) => {
                const isSelected = activeWeek?.weekKey === week.weekKey;
                const val = metricTab === "billing" ? week.totalBilling : metricTab === "orders" ? week.ordersCount : week.averageTicket;
                const heightPct = maxChartVal > 0 ? (val / maxChartVal) * 100 : 0;

                const delta = metricTab === "billing" ? week.deltaBillingPct : metricTab === "orders" ? week.deltaOrdersPct : week.deltaTicketPct;

                return (
                  <div
                    key={week.weekKey}
                    onClick={() => setSelectedWeekIdx(idx)}
                    className="flex-1 flex flex-col items-center h-full justify-end group cursor-pointer relative select-none"
                  >
                    {/* Variation Badge above bar */}
                    {delta !== null ? (
                      <span className={`text-[9px] font-black mb-1.5 flex items-center tabular-nums px-1 py-0.5 rounded-md ${
                        delta > 0
                          ? "text-emerald-700 bg-emerald-50 border border-emerald-200"
                          : delta < 0
                          ? "text-rose-700 bg-rose-50 border border-rose-200"
                          : "text-slate-500 bg-slate-100"
                      }`}>
                        {delta > 0 ? "+" : ""}{delta.toFixed(0)}%
                      </span>
                    ) : (
                      <span className="text-[9px] text-slate-400 font-semibold mb-1.5 px-1 py-0.5">
                        Base
                      </span>
                    )}

                    {/* Bar Pillar */}
                    <div className={`w-full max-w-[42px] rounded-t-xl h-full flex items-end overflow-hidden p-0.5 transition-all ${
                      isSelected
                        ? "bg-indigo-100/90 ring-2 ring-indigo-500/20"
                        : "bg-slate-200/50 hover:bg-slate-200"
                    }`}>
                      <div
                        style={{ height: `${Math.max(6, heightPct)}%` }}
                        className={`w-full rounded-t-lg transition-all duration-300 ${
                          isSelected
                            ? "bg-gradient-to-t from-indigo-700 to-indigo-500 shadow-sm"
                            : "bg-gradient-to-t from-slate-400 to-slate-300 group-hover:from-indigo-500 group-hover:to-indigo-400"
                        }`}
                      />
                    </div>

                    {/* Week Label */}
                    <span className={`text-[10px] mt-2 transition-colors font-bold tabular-nums whitespace-nowrap ${
                      isSelected ? "text-indigo-700 font-black" : "text-slate-500 group-hover:text-slate-800"
                    }`}>
                      {week.weekKey}
                    </span>
                    <span className="text-[9px] text-slate-400 font-medium tabular-nums">
                      {week.shortLabel}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right / Bottom: Selected Week Detailed Spotlight Card */}
        {activeWeek && (
          <div className="lg:col-span-5 bg-gradient-to-br from-white to-indigo-50/40 p-5 rounded-2xl border border-indigo-100 shadow-sm flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-indigo-100/80 pb-3">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-indigo-600 block">
                    Semana Seleccionada
                  </span>
                  <h3 className="text-base font-black text-slate-900">
                    {activeWeek.weekKey} ({activeWeek.label})
                  </h3>
                </div>

                {/* WoW Billing Indicator */}
                {activeWeek.deltaBillingPct !== null && (
                  <div className={`px-2.5 py-1 rounded-xl text-xs font-black flex items-center gap-1 border ${
                    activeWeek.deltaBillingPct >= 0
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : "bg-rose-50 text-rose-700 border-rose-200"
                  }`}>
                    {activeWeek.deltaBillingPct >= 0 ? (
                      <TrendingUp className="w-3.5 h-3.5" />
                    ) : (
                      <TrendingDown className="w-3.5 h-3.5" />
                    )}
                    <span>{activeWeek.deltaBillingPct >= 0 ? "+" : ""}{activeWeek.deltaBillingPct.toFixed(1)}% WoW</span>
                  </div>
                )}
              </div>

              {/* 3 Core Stats Cards */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="p-3 bg-white rounded-xl border border-slate-200/80 shadow-2xs space-y-0.5">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Facturación</span>
                  <span className="text-sm font-black text-slate-900 font-mono block">
                    {formatPrice(activeWeek.totalBilling)}
                  </span>
                  {activeWeek.deltaBillingPct !== null && (
                    <span className={`text-[10px] font-bold block ${activeWeek.deltaBillingPct >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                      {activeWeek.deltaBillingPct >= 0 ? "▲ +" : "▼ "}{activeWeek.deltaBillingPct.toFixed(1)}% vs prev.
                    </span>
                  )}
                </div>

                <div className="p-3 bg-white rounded-xl border border-slate-200/80 shadow-2xs space-y-0.5">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Pedidos Totales</span>
                  <span className="text-sm font-black text-slate-900 font-mono block">
                    {activeWeek.ordersCount} pedidos
                  </span>
                  {activeWeek.deltaOrdersPct !== null && (
                    <span className={`text-[10px] font-bold block ${activeWeek.deltaOrdersPct >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                      {activeWeek.deltaOrdersPct >= 0 ? "▲ +" : "▼ "}{activeWeek.deltaOrdersPct.toFixed(1)}% vs prev.
                    </span>
                  )}
                </div>

                <div className="p-3 bg-white rounded-xl border border-slate-200/80 shadow-2xs space-y-0.5">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Ticket Promedio</span>
                  <span className="text-sm font-black text-indigo-600 font-mono block">
                    {formatPrice(activeWeek.averageTicket)}
                  </span>
                  {activeWeek.deltaTicketPct !== null && (
                    <span className={`text-[10px] font-bold block ${activeWeek.deltaTicketPct >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                      {activeWeek.deltaTicketPct >= 0 ? "▲ +" : "▼ "}{activeWeek.deltaTicketPct.toFixed(1)}% vs prev.
                    </span>
                  )}
                </div>

                <div className="p-3 bg-white rounded-xl border border-slate-200/80 shadow-2xs space-y-0.5">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Tasa Cancelación</span>
                  <span className={`text-sm font-black font-mono block ${activeWeek.cancellationRate > 8 ? "text-rose-600" : "text-emerald-600"}`}>
                    {activeWeek.cancellationRate.toFixed(1)}%
                  </span>
                  <span className="text-[10px] text-slate-500 font-medium block">
                    {activeWeek.cancelledCount} anulados
                  </span>
                </div>
              </div>

              {/* Orders Fulfillment Split Bar */}
              <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-2xs space-y-1.5">
                <div className="flex justify-between text-[11px] font-bold text-slate-600">
                  <span>Desglose de Órdenes:</span>
                  <span className="text-slate-900 font-mono">{activeWeek.ordersCount}</span>
                </div>
                <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden flex">
                  <div
                    style={{ width: `${activeWeek.ordersCount > 0 ? (activeWeek.deliveredCount / activeWeek.ordersCount) * 100 : 0}%` }}
                    className="bg-emerald-500 h-full transition-all duration-300"
                    title={`Entregados: ${activeWeek.deliveredCount}`}
                  />
                  <div
                    style={{ width: `${activeWeek.ordersCount > 0 ? (activeWeek.pendingCount / activeWeek.ordersCount) * 100 : 0}%` }}
                    className="bg-blue-500 h-full transition-all duration-300"
                    title={`Pendientes: ${activeWeek.pendingCount}`}
                  />
                  <div
                    style={{ width: `${activeWeek.ordersCount > 0 ? (activeWeek.cancelledCount / activeWeek.ordersCount) * 100 : 0}%` }}
                    className="bg-rose-500 h-full transition-all duration-300"
                    title={`Cancelados: ${activeWeek.cancelledCount}`}
                  />
                </div>
                <div className="flex justify-between text-[9px] font-bold text-slate-400 pt-0.5">
                  <span className="text-emerald-700">✓ {activeWeek.deliveredCount} Entregados</span>
                  <span className="text-blue-700">⌛ {activeWeek.pendingCount} Pendientes</span>
                  <span className="text-rose-700">✕ {activeWeek.cancelledCount} Cancelados</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Weekly Comparative Table */}
      <div className="overflow-x-auto border border-slate-100 rounded-2xl">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50/80 border-b border-slate-100 text-[10px] font-black uppercase tracking-wider text-slate-400">
              <th className="py-2.5 px-4">Semana</th>
              <th className="py-2.5 px-3">Rango de Fechas</th>
              <th className="py-2.5 px-3 text-right">Facturación</th>
              <th className="py-2.5 px-3 text-center">Variación WoW</th>
              <th className="py-2.5 px-3 text-center">Pedidos (#)</th>
              <th className="py-2.5 px-3 text-right">Ticket Promedio</th>
              <th className="py-2.5 px-3 text-center">Entregados</th>
              <th className="py-2.5 px-3 text-center">Tasa Anulación</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
            {weeklyData.map((week, idx) => (
              <tr 
                key={week.weekKey} 
                onClick={() => setSelectedWeekIdx(idx)}
                className={`hover:bg-indigo-50/40 transition-colors cursor-pointer ${
                  activeWeek?.weekKey === week.weekKey ? "bg-indigo-50/60 font-bold" : ""
                }`}
              >
                <td className="py-3 px-4 text-slate-900 font-bold flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                  {week.weekKey}
                </td>
                <td className="py-3 px-3 text-slate-500 font-mono text-[11px]">
                  {week.label}
                </td>
                <td className="py-3 px-3 text-right font-mono font-bold text-slate-900">
                  {formatPrice(week.totalBilling)}
                </td>
                <td className="py-3 px-3 text-center">
                  {week.deltaBillingPct !== null ? (
                    <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-[10px] font-black font-mono ${
                      week.deltaBillingPct >= 0
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-rose-50 text-rose-700"
                    }`}>
                      {week.deltaBillingPct >= 0 ? "▲ +" : "▼ "}{week.deltaBillingPct.toFixed(1)}%
                    </span>
                  ) : (
                    <span className="text-slate-400 text-[10px]">-</span>
                  )}
                </td>
                <td className="py-3 px-3 text-center font-mono text-slate-800">
                  {week.ordersCount}
                </td>
                <td className="py-3 px-3 text-right font-mono text-indigo-700 font-bold">
                  {formatPrice(week.averageTicket)}
                </td>
                <td className="py-3 px-3 text-center">
                  <span className="inline-block px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-md text-[10px] font-bold">
                    {week.deliveredCount} ({week.ordersCount > 0 ? ((week.deliveredCount / week.ordersCount) * 100).toFixed(0) : 0}%)
                  </span>
                </td>
                <td className="py-3 px-3 text-center font-mono">
                  <span className={`text-xs font-bold ${week.cancellationRate > 8 ? "text-rose-600 font-black" : "text-slate-600"}`}>
                    {week.cancellationRate.toFixed(1)}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

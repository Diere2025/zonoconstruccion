"use client";

import React, { useState } from "react";
import { formatPrice } from "@/lib/utils";
import { XCircle, Calendar, ShieldAlert } from "lucide-react";

export interface DailyCancelledData {
  date: string;          // YYYY-MM-DD
  displayDate: string;   // DD/MM
  cancelledCount: number;
  totalOrdersCount: number;
  cancelledBilling: number;
  totalBilling: number;
}

interface CancelledOrdersChartProps {
  totalOrdersCount: number;
  cancelledCount: number;
  deliveredCount: number;
  pendingCount: number;
  totalBillingCount: number;
  cancelledBilling: number;
  deliveredBilling: number;
  pendingBilling: number;
  dailyData: DailyCancelledData[];
}

export default function CancelledOrdersChart({
  totalOrdersCount,
  cancelledCount,
  deliveredCount,
  pendingCount,
  totalBillingCount,
  cancelledBilling,
  deliveredBilling,
  pendingBilling,
  dailyData,
}: CancelledOrdersChartProps) {
  const [metricView, setMetricView] = useState<"count" | "billing">("count");
  const [hoveredDayIdx, setHoveredDayIdx] = useState<number | null>(null);

  // Percentages calculation
  const cancelledPctOrders = totalOrdersCount > 0 ? (cancelledCount / totalOrdersCount) * 100 : 0;
  const deliveredPctOrders = totalOrdersCount > 0 ? (deliveredCount / totalOrdersCount) * 100 : 0;
  const pendingPctOrders = totalOrdersCount > 0 ? (pendingCount / totalOrdersCount) * 100 : 0;
  const cancelledPctBilling = totalBillingCount > 0 ? (cancelledBilling / totalBillingCount) * 100 : 0;

  // Find max for daily chart Y-axis scaling
  const maxDailyVal = Math.max(
    1,
    ...dailyData.map((d) => (metricView === "count" ? d.cancelledCount : d.cancelledBilling))
  );

  const activeHoveredDay = hoveredDayIdx !== null && dailyData[hoveredDayIdx] ? dailyData[hoveredDayIdx] : null;

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-6">
      {/* Title & Top Summary */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600">
            <XCircle className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900 tracking-tight">
              Análisis de Pedidos Anulados
            </h2>
            <p className="text-xs text-slate-500 font-normal">
              Métricas de cancelación porcentual e impacto financiero en el período
            </p>
          </div>
        </div>

        {/* Status Pill */}
        <div className="flex items-center gap-2">
          <span className="bg-rose-50 border border-rose-200/80 text-rose-700 px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
            {cancelledPctOrders.toFixed(1)}% de Anulaciones
          </span>
        </div>
      </div>

      {/* Grid: Left Percentages & Right Daily Trend */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        
        {/* Left Column: Percentage & KPI Cards */}
        <div className="lg:col-span-4 flex flex-col justify-between space-y-4 bg-slate-50/70 p-4 rounded-2xl border border-slate-100">
          <div>
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
              Resumen Porcentual
            </h3>

            {/* Metrics Stack */}
            <div className="space-y-2.5">
              <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Tasa de Anulación</p>
                  <h4 className="text-lg font-bold text-rose-600 tabular-nums">{cancelledPctOrders.toFixed(1)}%</h4>
                  <p className="text-xs font-medium text-slate-500">
                    {cancelledCount} de {totalOrdersCount} pedidos
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Monto Perdido</p>
                  <h4 className="text-sm font-bold text-slate-900 tabular-nums">{formatPrice(cancelledBilling)}</h4>
                  <p className="text-xs font-medium text-slate-500 tabular-nums">{cancelledPctBilling.toFixed(1)}% facturación</p>
                </div>
              </div>

              <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs space-y-2">
                <div className="flex justify-between text-xs font-medium text-slate-600">
                  <span>Desglose de Pedidos:</span>
                  <span className="font-semibold text-slate-900 tabular-nums">{totalOrdersCount} pedidos</span>
                </div>
                
                {/* Horizontal Split Bar */}
                <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden flex">
                  <div
                    style={{ width: `${deliveredPctOrders}%` }}
                    className="bg-emerald-500 h-full transition-all duration-300"
                    title={`Entregados: ${deliveredPctOrders.toFixed(1)}%`}
                  />
                  <div
                    style={{ width: `${pendingPctOrders}%` }}
                    className="bg-blue-500 h-full transition-all duration-300"
                    title={`Pendientes: ${pendingPctOrders.toFixed(1)}%`}
                  />
                  <div
                    style={{ width: `${cancelledPctOrders}%` }}
                    className="bg-rose-500 h-full transition-all duration-300"
                    title={`Cancelados: ${cancelledPctOrders.toFixed(1)}%`}
                  />
                </div>

                <div className="grid grid-cols-3 gap-1 pt-1 text-center text-[10px] font-medium text-slate-500">
                  <div className="flex items-center justify-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                    <span>{deliveredPctOrders.toFixed(0)}% Entr.</span>
                  </div>
                  <div className="flex items-center justify-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                    <span>{pendingPctOrders.toFixed(0)}% Pend.</span>
                  </div>
                  <div className="flex items-center justify-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
                    <span>{cancelledPctOrders.toFixed(0)}% Anul.</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="text-[11px] text-slate-400 font-normal leading-relaxed pt-2 border-t border-slate-200/60">
            Un umbral de anulación saludable se mantiene habitualmente por debajo del <strong>8%</strong> del volumen total.
          </div>
        </div>

        {/* Right Column: Daily Bar Chart */}
        <div className="lg:col-span-8 bg-slate-50/50 p-4 rounded-2xl border border-slate-100 flex flex-col justify-between space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <div>
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Comportamiento Diario de Cancelaciones
              </h3>
              <p className="text-xs text-slate-400 font-normal">
                Picos de cancelación a lo largo del período seleccionado
              </p>
            </div>

            {/* Toggle metric */}
            <div className="bg-slate-100/80 p-0.5 rounded-xl border border-slate-200/60 flex items-center gap-1">
              <button
                type="button"
                onClick={() => setMetricView("count")}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  metricView === "count"
                    ? "bg-white text-rose-700 shadow-2xs border border-slate-200/80"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                Cantidad (#)
              </button>
              <button
                type="button"
                onClick={() => setMetricView("billing")}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  metricView === "billing"
                    ? "bg-white text-rose-700 shadow-2xs border border-slate-200/80"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                Monto ($)
              </button>
            </div>
          </div>

          {/* Daily Bar Chart Visualization */}
          <div className="relative pt-4 pb-2 w-full overflow-hidden">
            <div className="overflow-x-auto pb-2 -mx-1 px-1 custom-scrollbar touch-pan-x">
              <div className="h-44 flex items-end gap-1 sm:gap-1.5 min-w-[520px] sm:min-w-full">
                {dailyData.map((day, idx) => {
                  const val = metricView === "count" ? day.cancelledCount : day.cancelledBilling;
                  const heightPct = maxDailyVal > 0 ? (val / maxDailyVal) * 100 : 0;
                  const isHovered = hoveredDayIdx === idx;
                  const hasCancelled = val > 0;

                  return (
                    <div
                      key={day.date}
                      className="flex-1 flex flex-col items-center h-full justify-end group cursor-pointer relative select-none"
                      onMouseEnter={() => setHoveredDayIdx(idx)}
                      onMouseLeave={() => setHoveredDayIdx(null)}
                      onClick={() => setHoveredDayIdx(hoveredDayIdx === idx ? null : idx)}
                    >
                      {/* Bar Container */}
                      <div className="w-full max-w-[18px] bg-slate-200/50 rounded-t-md h-full flex items-end overflow-hidden">
                        <div
                          style={{ height: `${Math.max(hasCancelled ? 6 : 0, heightPct)}%` }}
                          className={`w-full rounded-t-md transition-all duration-150 ${
                            hasCancelled
                              ? isHovered
                                ? "bg-rose-600"
                                : "bg-rose-500/80 group-hover:bg-rose-500"
                              : "bg-transparent"
                          }`}
                        />
                      </div>

                      {/* Date Label */}
                      <span className={`text-[9px] mt-1 transition-colors tabular-nums ${
                        isHovered ? "font-bold text-slate-900" : "font-medium text-slate-400"
                      }`}>
                        {idx % Math.ceil(dailyData.length / 14) === 0 ? day.displayDate : ""}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Mobile Scroll Helper Hint */}
            <div className="flex sm:hidden justify-end">
              <span className="text-[9px] font-semibold text-slate-400">
                ↔ Deslizá para explorar todos los días
              </span>
            </div>

            {/* Hover Tooltip Card */}
            {activeHoveredDay && (
              <div className="bg-slate-900 text-white px-3 py-2 rounded-xl text-xs shadow-xl border border-slate-800 mt-2 flex items-center justify-between gap-4 animate-in fade-in zoom-in-95">
                <div className="flex items-center gap-1.5 font-medium text-slate-300">
                  <Calendar className="w-3.5 h-3.5 text-rose-400" />
                  <span>{activeHoveredDay.date}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-rose-300 font-semibold tabular-nums">
                    {activeHoveredDay.cancelledCount} anulados ({formatPrice(activeHoveredDay.cancelledBilling)})
                  </span>
                  <span className="text-slate-400 tabular-nums">
                    de {activeHoveredDay.totalOrdersCount} pedidos
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

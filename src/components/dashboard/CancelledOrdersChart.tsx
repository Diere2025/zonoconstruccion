"use client";

import React, { useState } from "react";
import { formatPrice } from "@/lib/utils";
import { XCircle, TrendingDown, Calendar, AlertTriangle, ShieldAlert } from "lucide-react";

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
    <div className="bg-white p-6 rounded-3xl border border-slate-200/60 shadow-sm space-y-6">
      {/* Title & Top Summary */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
            <XCircle className="w-4.5 h-4.5 text-red-500" />
            Análisis de Pedidos Anulados
          </h2>
          <p className="text-[11px] font-semibold text-slate-400 mt-0.5">
            Métricas de cancelación porcentual y tendencia diaria en el período
          </p>
        </div>

        {/* Status Pills */}
        <div className="flex items-center gap-2">
          <span className="bg-red-50 border border-red-200 text-red-700 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            {cancelledPctOrders.toFixed(1)}% Anulados
          </span>
        </div>
      </div>

      {/* Grid: Left Percentages & Right Daily Trend */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        
        {/* Left Column: Percentage & KPI Cards */}
        <div className="lg:col-span-4 flex flex-col justify-between space-y-4 bg-slate-50/60 p-4 rounded-2xl border border-slate-100">
          <div>
            <h3 className="text-xs font-black text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 text-red-500" />
              Resumen Porcentual
            </h3>

            {/* Metrics Stack */}
            <div className="space-y-3">
              <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-xs flex items-center justify-between">
                <div>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Tasa de Anulación</p>
                  <h4 className="text-lg font-black text-red-600">{cancelledPctOrders.toFixed(1)}%</h4>
                  <p className="text-[9px] font-extrabold text-slate-500">
                    {cancelledCount} de {totalOrdersCount} pedidos
                  </p>
                </div>
                <div className="w-9 h-9 rounded-lg bg-red-50 flex items-center justify-center text-red-500 font-black text-xs shrink-0">
                  <TrendingDown className="w-4.5 h-4.5" />
                </div>
              </div>

              <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-xs flex items-center justify-between">
                <div>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Monto Pérdida Anulada</p>
                  <h4 className="text-lg font-black text-slate-900">{formatPrice(cancelledBilling)}</h4>
                  <p className="text-[9px] font-extrabold text-slate-400">
                    {cancelledPctBilling.toFixed(1)}% del total facturable
                  </p>
                </div>
                <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600 shrink-0">
                  <AlertTriangle className="w-4.5 h-4.5 text-amber-500" />
                </div>
              </div>
            </div>
          </div>

          {/* Mini Percentage Bar Breakdown */}
          <div className="space-y-2 pt-2 border-t border-slate-200/60">
            <div className="flex justify-between items-center text-[10px] font-black uppercase text-slate-500">
              <span>Distribución por Estado</span>
              <span>100%</span>
            </div>
            
            {/* Multi-segment Progress Bar */}
            <div className="h-3.5 w-full bg-slate-200 rounded-lg overflow-hidden flex shadow-inner">
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
                className="bg-red-500 h-full transition-all duration-300"
                title={`Anulados: ${cancelledPctOrders.toFixed(1)}%`}
              />
            </div>

            {/* Legend */}
            <div className="grid grid-cols-3 gap-1 pt-1 text-[9px] font-bold text-slate-500">
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                <span className="truncate">{deliveredPctOrders.toFixed(0)}% Ent.</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                <span className="truncate">{pendingPctOrders.toFixed(0)}% Pend.</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                <span className="truncate">{cancelledPctOrders.toFixed(0)}% Anul.</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Daily Anulados Bar Chart */}
        <div className="lg:col-span-8 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-brand-600" />
              Evolución de Anulados por Día
            </h3>

            {/* Metric Selector for Daily Chart */}
            <div className="bg-slate-100 p-1 rounded-xl flex items-center gap-1">
              <button
                type="button"
                onClick={() => setMetricView("count")}
                className={`px-2.5 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                  metricView === "count" ? "bg-white text-brand-700 shadow-xs" : "text-slate-500"
                }`}
              >
                Cantidad (u)
              </button>
              <button
                type="button"
                onClick={() => setMetricView("billing")}
                className={`px-2.5 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                  metricView === "billing" ? "bg-white text-brand-700 shadow-xs" : "text-slate-500"
                }`}
              >
                Monto ($)
              </button>
            </div>
          </div>

          {dailyData.length === 0 ? (
            <div className="py-12 text-center text-slate-400 font-bold text-xs">
              No hay datos registrados para los días del período.
            </div>
          ) : (
            <div className="space-y-2">
              {/* Daily Bar Chart Visualization */}
              <div className="h-44 w-full flex items-end justify-between gap-1.5 pt-6 pb-2 px-1 relative border-b border-slate-200">
                
                {/* Background Grid Lines */}
                <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-20">
                  <div className="border-b border-slate-300 w-full" />
                  <div className="border-b border-slate-300 w-full" />
                  <div className="border-b border-slate-300 w-full" />
                </div>

                {dailyData.map((d, i) => {
                  const val = metricView === "count" ? d.cancelledCount : d.cancelledBilling;
                  const heightPct = maxDailyVal > 0 ? (val / maxDailyVal) * 100 : 0;
                  const isHovered = hoveredDayIdx === i;
                  const isZero = val === 0;

                  return (
                    <div
                      key={d.date}
                      className="flex-1 h-full flex flex-col items-center justify-end relative group cursor-pointer"
                      onMouseEnter={() => setHoveredDayIdx(i)}
                      onMouseLeave={() => setHoveredDayIdx(null)}
                    >
                      {/* Bar Container */}
                      <div className="w-full flex justify-center items-end h-full">
                        <div
                          style={{ height: `${Math.max(heightPct, isZero ? 4 : 8)}%` }}
                          className={`w-full max-w-[28px] rounded-t-md transition-all duration-200 ${
                            isZero
                              ? "bg-slate-100 hover:bg-slate-200"
                              : isHovered
                              ? "bg-red-600 shadow-md scale-105"
                              : "bg-red-500/90 hover:bg-red-600"
                          }`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* X Axis Labels */}
              <div className="flex justify-between items-center px-1">
                {dailyData.map((d, i) => (
                  <div 
                    key={`label-${d.date}`}
                    className={`flex-1 text-center text-[9px] font-extrabold truncate transition-colors ${
                      hoveredDayIdx === i ? "text-red-600 font-black" : "text-slate-400"
                    }`}
                  >
                    {d.displayDate}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Active Hovered Day Details Card */}
          <div className="bg-slate-50 border border-slate-100 p-3 rounded-xl min-h-[50px] flex items-center justify-between">
            {activeHoveredDay ? (
              <>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
                  <span className="font-bold text-xs text-slate-800">
                    Fecha: <span className="text-slate-900 font-black">{activeHoveredDay.displayDate}</span>
                  </span>
                </div>
                <div className="flex items-center gap-4 text-xs font-semibold text-slate-600">
                  <span>
                    Anulados: <strong className="text-red-600 font-black">{activeHoveredDay.cancelledCount}</strong> ({activeHoveredDay.totalOrdersCount > 0 ? ((activeHoveredDay.cancelledCount / activeHoveredDay.totalOrdersCount) * 100).toFixed(1) : 0}% del día)
                  </span>
                  <span className="hidden sm:inline">•</span>
                  <span className="hidden sm:inline">
                    Pérdida: <strong className="text-slate-900 font-black">{formatPrice(activeHoveredDay.cancelledBilling)}</strong>
                  </span>
                </div>
              </>
            ) : (
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mx-auto">
                Pasa el cursor sobre cualquier día para ver el desglose detallado de anulaciones
              </span>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

"use client";

import React, { useState } from "react";
import { formatPrice } from "@/lib/utils";
import { TrendingUp, ShoppingBag, BarChart2, Calendar, CheckCircle2 } from "lucide-react";

export interface DailyTrendPoint {
  date: string; // YYYY-MM-DD
  displayDate: string; // DD/MM
  sales: number;
  ordersCount: number;
  deliveredCount: number;
  deliveredSales: number;
}

interface SalesTrendChartProps {
  data: DailyTrendPoint[];
}

export default function SalesTrendChart({ data }: SalesTrendChartProps) {
  const [metric, setMetric] = useState<"amounts" | "orders">("amounts");
  const [excludeSundays, setExcludeSundays] = useState<boolean>(true);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (!data || data.length === 0) {
    return null;
  }

  // Filter out Sundays if excludeSundays is active
  const filteredData = data.filter((d) => {
    if (!excludeSundays) return true;
    try {
      const dt = new Date(d.date + "T00:00:00");
      return dt.getDay() !== 0; // Exclude Sunday
    } catch {
      return true;
    }
  });

  const chartPointsData = filteredData.length > 0 ? filteredData : data;

  // Calculate maximum values for scaling based on chartPointsData
  const maxOrders = Math.max(...chartPointsData.map((d) => d.ordersCount), 1);
  const maxAmount = Math.max(...chartPointsData.map((d) => Math.max(d.sales, d.deliveredSales)), 1);

  const getActiveValue = (point: DailyTrendPoint) => {
    if (metric === "orders") return point.ordersCount;
    return point.sales;
  };

  const getMaxValue = () => {
    if (metric === "orders") return maxOrders;
    return maxAmount;
  };

  const maxValue = getMaxValue();
  const totalMetricSum = chartPointsData.reduce((acc, point) => acc + getActiveValue(point), 0);
  const activeDaysCount = chartPointsData.length;
  const avgMetric = totalMetricSum / Math.max(1, activeDaysCount);
  const totalDelivered = chartPointsData.reduce((acc, point) => acc + point.deliveredSales, 0);
  const sundayCount = data.filter(d => new Date(d.date + "T00:00:00").getDay() === 0).length;

  // SVG Dimensions & Padding
  const width = 800;
  const height = 220;
  const paddingX = 45;
  const paddingTop = 25;
  const paddingBottom = 35;

  const chartWidth = width - paddingX * 2;
  const chartHeight = height - paddingTop - paddingBottom;

  // Compute points coordinates
  const points = chartPointsData.map((d, idx) => {
    const x =
      chartPointsData.length > 1
        ? paddingX + (idx / (chartPointsData.length - 1)) * chartWidth
        : width / 2;
    const val = getActiveValue(d);
    const y = paddingTop + chartHeight - (val / maxValue) * chartHeight;
    return { x, y, val, dataPoint: d };
  });
  const deliveredPoints = chartPointsData.map((d, idx) => ({
    x: points[idx].x,
    y: paddingTop + chartHeight - (d.deliveredSales / maxValue) * chartHeight,
  }));

  // Build SVG Path string
  const pathD =
    points.length === 1
      ? `M ${points[0].x} ${points[0].y}`
      : points.reduce((acc, p, idx) => {
          if (idx === 0) return `M ${p.x} ${p.y}`;
          const prev = points[idx - 1];
          const cX = (prev.x + p.x) / 2;
          return `${acc} C ${cX} ${prev.y}, ${cX} ${p.y}, ${p.x} ${p.y}`;
        }, "");
  const deliveredPathD = deliveredPoints.length === 1
    ? `M ${deliveredPoints[0].x} ${deliveredPoints[0].y}`
    : deliveredPoints.reduce((acc, p, idx) => {
        if (idx === 0) return `M ${p.x} ${p.y}`;
        const prev = deliveredPoints[idx - 1];
        const cX = (prev.x + p.x) / 2;
        return `${acc} C ${cX} ${prev.y}, ${cX} ${p.y}, ${p.x} ${p.y}`;
      }, "");

  const areaD =
    points.length > 0
      ? `${pathD} L ${points[points.length - 1].x} ${height - paddingBottom} L ${points[0].x} ${height - paddingBottom} Z`
      : "";

  const gridTicks = [0, 0.33, 0.66, 1];

  return (
    <div className="bg-white p-6 rounded-3xl border border-slate-200/60 shadow-sm space-y-4">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center text-brand-600">
              <BarChart2 className="w-4.5 h-4.5" />
            </div>
            <div>
              <h2 className="text-sm font-black text-slate-800 uppercase tracking-wider">
                Evolución Diaria del Período
              </h2>
              <p className="text-[11px] font-semibold text-slate-400">
                Ventas por fecha de pedido y entregas por fecha real {excludeSundays ? "(Lun–Sáb)" : "(calendario completo)"}
              </p>
            </div>
          </div>
        </div>

        {/* Metric Selector Pills */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center bg-slate-100/80 p-1 rounded-2xl border border-slate-200/50">
            <button
              type="button"
              onClick={() => { setMetric("amounts"); setHoveredIdx(null); }}
              className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 ${
                metric === "amounts"
                  ? "bg-white text-brand-700 shadow-sm border border-slate-200/80"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5 text-brand-600" />
              Ventas vs. entregas ($)
            </button>

            <button
              type="button"
              onClick={() => { setMetric("orders"); setHoveredIdx(null); }}
              className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 ${
                metric === "orders"
                  ? "bg-white text-blue-700 shadow-sm border border-slate-200/80"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <ShoppingBag className="w-3.5 h-3.5 text-blue-600" />
              Pedidos (#)
            </button>

          </div>
        </div>
      </div>

      {/* Summary Highlights */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50/70 p-3 rounded-2xl border border-slate-100">
        <div>
          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">
            {metric === "orders" ? "Pedidos del período" : "Ventas del período"}
          </span>
          <span className="text-sm font-black text-slate-900">
            {metric === "orders" ? `${totalMetricSum} pedidos` : formatPrice(totalMetricSum)}
          </span>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">
              {metric === "orders" ? "Promedio diario" : "Entregado en el período"}
            </span>
            <button
              type="button"
              onClick={() => setExcludeSundays(!excludeSundays)}
              className={`text-[8px] font-bold px-2 py-0.5 rounded transition-all cursor-pointer ${
                excludeSundays ? "bg-brand-600 text-white font-extrabold shadow-xs" : "bg-slate-200 text-slate-700"
              }`}
              title={excludeSundays ? "Ocultar domingos en el gráfico y promedio" : "Mostrar todos los días calendario"}
            >
              {excludeSundays ? "Solo Días Hábiles (Lun-Sáb)" : "Mostrar Domingos"}
            </button>
          </div>
          <span className="text-sm font-black text-brand-700">
            {metric === "orders" ? `${avgMetric.toFixed(1)} / día` : formatPrice(totalDelivered)}
          </span>
          <span className="text-[8px] text-slate-400 block font-semibold">
            {excludeSundays ? `${activeDaysCount} días hábiles (domingos omitidos)` : `${activeDaysCount} días calendario`}
          </span>
        </div>

        <div>
          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">
            Pico Máximo Diario
          </span>
          <span className="text-sm font-black text-slate-900">
            {metric === "orders" ? `${maxValue} pedidos` : formatPrice(maxValue)}
          </span>
        </div>

        <div>
          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">
            Puntos en Gráfica
          </span>
          <span className="text-sm font-black text-slate-900">
            {chartPointsData.length} jornadas {excludeSundays && sundayCount > 0 && <span className="text-[9px] text-slate-400 font-normal">({sundayCount} domingos ocultos)</span>}
          </span>
        </div>
      </div>

      {metric === "amounts" && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold text-slate-600" aria-label="Series del gráfico">
          <div className="flex items-center gap-5">
            <span className="flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5 text-blue-600" /> Ventas</span>
            <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Entregados</span>
          </div>
          <span className="text-[9px] font-medium text-slate-400">Solo entregas confirmadas con fecha real</span>
        </div>
      )}

      {/* Interactive SVG Chart */}
      <div className="relative w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto overflow-visible select-none"
        >
          <defs>
            <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2563eb" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#2563eb" stopOpacity="0.0" />
            </linearGradient>
            <linearGradient id="ordersGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Y Axis Grid lines */}
          {gridTicks.map((ratio, i) => {
            const y = paddingTop + chartHeight * (1 - ratio);
            const valTick = ratio * maxValue;
            const formattedTick =
              metric === "orders"
                ? Math.round(valTick).toString()
                : `$${(valTick / 1000).toFixed(0)}k`;

            return (
              <g key={i}>
                <line
                  x1={paddingX}
                  y1={y}
                  x2={width - paddingX}
                  y2={y}
                  stroke="#e2e8f0"
                  strokeDasharray={i === 0 ? "none" : "3 3"}
                  strokeWidth="1"
                />
                <text
                  x={paddingX - 8}
                  y={y + 3}
                  textAnchor="end"
                  fill="#94a3b8"
                  fontSize="9"
                  fontWeight="700"
                >
                  {formattedTick}
                </text>
              </g>
            );
          })}

          {/* Area Fill */}
          <path
            d={areaD}
            fill={
              metric === "amounts"
                ? "url(#salesGrad)"
                : "url(#ordersGrad)"
            }
          />

          {/* Stroke Polyline Curve */}
          <path
            d={pathD}
            fill="none"
            stroke={
              metric === "amounts"
                ? "#2563eb"
                : "#3b82f6"
            }
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {metric === "amounts" && (
            <path d={deliveredPathD} fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          )}

          {/* Interactive Data Points */}
          {points.map((p, idx) => {
            const isHovered = hoveredIdx === idx;
            const isSunday = new Date(p.dataPoint.date + "T00:00:00").getDay() === 0;

            const color =
              metric === "amounts"
                ? "#2563eb"
                : "#3b82f6";

            const showXLabel =
              chartPointsData.length <= 14 ||
              idx === 0 ||
              idx === chartPointsData.length - 1 ||
              idx % Math.ceil(chartPointsData.length / 10) === 0;

            return (
              <g key={idx}>
                {/* Vertical guide line on hover */}
                {isHovered && (
                  <line
                    x1={p.x}
                    y1={paddingTop}
                    x2={p.x}
                    y2={height - paddingBottom}
                    stroke={color}
                    strokeDasharray="2 2"
                    strokeWidth="1.5"
                  />
                )}

                {/* X Axis Date Label */}
                {showXLabel && (
                  <text
                    x={p.x}
                    y={height - 12}
                    textAnchor="middle"
                    fill={isSunday ? "#cbd5e1" : isHovered ? "#0f172a" : "#64748b"}
                    fontSize="9"
                    fontWeight={isHovered ? "900" : "700"}
                  >
                    {p.dataPoint.displayDate} {isSunday && "(Dom)"}
                  </text>
                )}

                {/* Outer ring on hover */}
                {isHovered && (
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r="8"
                    fill={color}
                    fillOpacity="0.2"
                  />
                )}

                {/* Main Point Circle */}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={isHovered ? "5" : points.length > 30 ? "2.5" : "3.5"}
                  fill={isSunday ? "#f8fafc" : "#ffffff"}
                  stroke={isSunday ? "#cbd5e1" : color}
                  strokeWidth={isHovered ? "3" : "2"}
                  className="cursor-pointer transition-all duration-150"
                  onMouseEnter={() => setHoveredIdx(idx)}
                  onMouseLeave={() => setHoveredIdx(null)}
                />

                {metric === "amounts" && (
                  <circle cx={p.x} cy={deliveredPoints[idx].y} r={isHovered ? 5 : points.length > 30 ? 2.5 : 3.5}
                    fill="white" stroke="#10b981" strokeWidth={isHovered ? 3 : 2} />
                )}

                {/* Invisible hover trigger hit-box */}
                <rect
                  x={p.x - Math.max(10, chartWidth / chartPointsData.length / 2)}
                  y={paddingTop}
                  width={Math.max(20, chartWidth / chartPointsData.length)}
                  height={chartHeight}
                  fill="transparent"
                  className="cursor-pointer"
                  onMouseEnter={() => setHoveredIdx(idx)}
                  onMouseLeave={() => setHoveredIdx(null)}
                />
              </g>
            );
          })}
        </svg>

        {/* Floating Tooltip Card */}
        {hoveredIdx !== null && points[hoveredIdx] && (
          <div
            className="absolute z-20 pointer-events-none bg-slate-900 text-white p-3 rounded-2xl shadow-xl border border-slate-800 text-xs w-52 transition-all duration-75 animate-in fade-in zoom-in-95"
            style={{
              left: `${Math.min(
                Math.max(10, (points[hoveredIdx].x / width) * 100 - 20),
                65
              )}%`,
              top: `${Math.max(5, (points[hoveredIdx].y / height) * 100 - 35)}%`,
            }}
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 mb-1.5">
              <span className="font-black text-[10px] text-slate-400 uppercase tracking-widest flex items-center gap-1">
                <Calendar className="w-3 h-3 text-brand-400" />
                {points[hoveredIdx].dataPoint.date}
              </span>
              <span className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded ${
                new Date(points[hoveredIdx].dataPoint.date + "T00:00:00").getDay() === 0
                  ? "bg-slate-800 text-slate-400"
                  : "bg-brand-900/60 text-brand-400"
              }`}>
                {new Date(points[hoveredIdx].dataPoint.date + "T00:00:00").getDay() === 0 ? "Domingo (No Lab.)" : `Jornada`}
              </span>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <span className="text-slate-400 text-[10px]">Ventas:</span>
                <span className="font-black text-brand-300">
                  {formatPrice(points[hoveredIdx].dataPoint.sales)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400 text-[10px]">Pedidos Totales:</span>
                <span className="font-bold text-blue-300">
                  {points[hoveredIdx].dataPoint.ordersCount} pedidos
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400 text-[10px]">Entregados ($):</span>
                <span className="font-bold text-emerald-300">
                  {formatPrice(points[hoveredIdx].dataPoint.deliveredSales)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400 text-[10px]">Entregas:</span>
                <span className="font-bold text-emerald-300">{points[hoveredIdx].dataPoint.deliveredCount}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

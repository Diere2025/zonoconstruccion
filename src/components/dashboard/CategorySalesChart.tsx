"use client";

import React, { useState } from "react";
import { formatPrice } from "@/lib/utils";
import { PieChart, Award, Layers } from "lucide-react";

export interface CategoryData {
  category: string;
  totalBilling: number;
  totalQty: number;
  pctBilling: number;
  pctQty: number;
  topProduct?: string;
}

interface CategorySalesChartProps {
  categories: CategoryData[];
  totalBillingAll: number;
  totalQtyAll: number;
}

const CATEGORY_COLORS = [
  "#2563eb", // Blue
  "#10b981", // Emerald
  "#f59e0b", // Amber
  "#8b5cf6", // Purple
  "#ec4899", // Pink
  "#06b6d4", // Cyan
  "#f97316", // Orange
  "#14b8a6", // Teal
  "#6366f1", // Indigo
  "#64748b", // Slate
];

// Helper to compute SVG Donut slice path
function getDonutSlicePath(
  cx: number,
  cy: number,
  rInner: number,
  rOuter: number,
  startAngle: number,
  endAngle: number
): string {
  let angleDiff = endAngle - startAngle;
  if (angleDiff <= 0) return "";
  if (angleDiff >= 2 * Math.PI - 0.0001) {
    angleDiff = 2 * Math.PI - 0.0001;
  }
  const actualEndAngle = startAngle + angleDiff;

  const x1Outer = cx + rOuter * Math.cos(startAngle);
  const y1Outer = cy + rOuter * Math.sin(startAngle);
  const x2Outer = cx + rOuter * Math.cos(actualEndAngle);
  const y2Outer = cy + rOuter * Math.sin(actualEndAngle);

  const x2Inner = cx + rInner * Math.cos(actualEndAngle);
  const y2Inner = cy + rInner * Math.sin(actualEndAngle);
  const x1Inner = cx + rInner * Math.cos(startAngle);
  const y1Inner = cy + rInner * Math.sin(startAngle);

  const largeArcFlag = angleDiff > Math.PI ? 1 : 0;

  return `M ${x1Outer} ${y1Outer} A ${rOuter} ${rOuter} 0 ${largeArcFlag} 1 ${x2Outer} ${y2Outer} L ${x2Inner} ${y2Inner} A ${rInner} ${rInner} 0 ${largeArcFlag} 0 ${x1Inner} ${y1Inner} Z`;
}

export default function CategorySalesChart({
  categories,
  totalBillingAll,
  totalQtyAll,
}: CategorySalesChartProps) {
  const [metric, setMetric] = useState<"billing" | "qty">("billing");
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  // Filter out categories with 0 value
  const activeCategories = categories.filter((c) =>
    metric === "billing" ? c.totalBilling > 0 : c.totalQty > 0
  );

  // Sort categories descending by active metric
  const sortedCategories = [...activeCategories].sort((a, b) =>
    metric === "billing"
      ? b.totalBilling - a.totalBilling
      : b.totalQty - a.totalQty
  );

  // Calculate sum of active categories for exact percentage distribution
  const totalValue = sortedCategories.reduce(
    (acc, c) => acc + (metric === "billing" ? c.totalBilling : c.totalQty),
    0
  );

  // Compute angles for Donut slices
  let currentAngle = -Math.PI / 2; // Start at 12 o'clock (top)

  const slices = sortedCategories.map((cat, idx) => {
    const val = metric === "billing" ? cat.totalBilling : cat.totalQty;
    const pct = totalValue > 0 ? val / totalValue : 0;
    const sliceAngle = pct * 2 * Math.PI;

    const startAngle = currentAngle;
    const endAngle = currentAngle + sliceAngle;
    currentAngle = endAngle;

    const color = CATEGORY_COLORS[idx % CATEGORY_COLORS.length];

    return {
      ...cat,
      value: val,
      pctDisplay: (pct * 100).toFixed(1),
      color,
      startAngle,
      endAngle,
      idx,
    };
  });

  const activeHovered =
    hoveredIdx !== null && slices[hoveredIdx] ? slices[hoveredIdx] : null;

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-6">
      {/* Header & Toggle */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center text-brand-600">
              <PieChart className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 tracking-tight">
                Ventas por Categoría de Producto
              </h2>
              <p className="text-xs text-slate-500 font-normal">
                Distribución porcentual e ingresos por familia de productos
              </p>
            </div>
          </div>
        </div>

        {/* Metric Switch */}
        <div className="bg-slate-100/80 p-1 rounded-xl border border-slate-200/60 flex items-center gap-1 self-stretch sm:self-auto">
          <button
            type="button"
            onClick={() => setMetric("billing")}
            className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              metric === "billing"
                ? "bg-white text-brand-700 shadow-2xs border border-slate-200/80"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            Facturación ($)
          </button>
          <button
            type="button"
            onClick={() => setMetric("qty")}
            className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              metric === "qty"
                ? "bg-white text-brand-700 shadow-2xs border border-slate-200/80"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            Unidades (u)
          </button>
        </div>
      </div>

      {sortedCategories.length === 0 ? (
        <div className="py-12 text-center text-slate-400 font-medium text-xs">
          No hay ventas registradas por categoría en este período.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Donut Chart SVG */}
          <div className="lg:col-span-5 flex flex-col items-center justify-center relative">
            <div className="w-60 h-60 relative flex items-center justify-center">
              <svg viewBox="0 0 200 200" className="w-full h-full">
                {/* Background Donut Track */}
                <circle
                  cx={100}
                  cy={100}
                  r={73}
                  fill="transparent"
                  stroke="#f1f5f9"
                  strokeWidth={26}
                />

                {/* Slices */}
                {slices.map((slice) => {
                  const isHovered = hoveredIdx === slice.idx;
                  const path = getDonutSlicePath(
                    100,
                    100,
                    60,
                    isHovered ? 89 : 86,
                    slice.startAngle,
                    slice.endAngle
                  );

                  return (
                    <path
                      key={slice.category}
                      d={path}
                      fill={slice.color}
                      className="transition-all duration-200 cursor-pointer"
                      style={{
                        opacity:
                          hoveredIdx === null || hoveredIdx === slice.idx
                            ? 1
                            : 0.4,
                      }}
                      onMouseEnter={() => setHoveredIdx(slice.idx)}
                      onMouseLeave={() => setHoveredIdx(null)}
                    />
                  );
                })}
              </svg>

              {/* Center Tooltip Info */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none p-4 text-center">
                {activeHovered ? (
                  <>
                    <span className="text-[11px] font-semibold text-slate-500 line-clamp-1 max-w-[130px]">
                      {activeHovered.category}
                    </span>
                    <span className="text-lg font-bold text-slate-900 leading-tight tabular-nums">
                      {metric === "billing"
                        ? formatPrice(activeHovered.totalBilling)
                        : `${activeHovered.totalQty} u`}
                    </span>
                    <span
                      className="text-xs font-bold mt-0.5 px-2 py-0.5 rounded-full"
                      style={{
                        backgroundColor: `${activeHovered.color}15`,
                        color: activeHovered.color,
                      }}
                    >
                      {activeHovered.pctDisplay}%
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-[11px] font-medium text-slate-400">
                      Total del Período
                    </span>
                    <span className="text-lg font-bold text-slate-900 leading-tight tabular-nums">
                      {metric === "billing"
                        ? formatPrice(totalValue)
                        : `${totalValue} u`}
                    </span>
                    <span className="text-[11px] font-medium text-slate-400 mt-0.5">
                      {sortedCategories.length} categorías
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Table Breakdown */}
          <div className="lg:col-span-7 overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-100 text-[11px] font-semibold uppercase text-slate-400">
                  <th className="py-2.5">Categoría</th>
                  <th className="py-2.5 text-right">
                    {metric === "billing" ? "Facturación" : "Unidades"}
                  </th>
                  <th className="py-2.5 text-right">% Distr.</th>
                  <th className="py-2.5 pl-4">Producto Destacado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                {slices.map((slice) => {
                  const isHovered = hoveredIdx === slice.idx;

                  return (
                    <tr
                      key={slice.category}
                      className={`transition-colors cursor-pointer ${
                        isHovered ? "bg-slate-50 font-medium" : "hover:bg-slate-50/60"
                      }`}
                      onMouseEnter={() => setHoveredIdx(slice.idx)}
                      onMouseLeave={() => setHoveredIdx(null)}
                    >
                      <td className="py-2.5">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: slice.color }}
                          />
                          <span className="font-semibold text-slate-900">
                            {slice.category}
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 text-right font-semibold text-slate-900 tabular-nums">
                        {metric === "billing"
                          ? formatPrice(slice.totalBilling)
                          : `${slice.totalQty} u`}
                      </td>
                      <td className="py-2.5 text-right font-medium text-slate-600 tabular-nums">
                        {slice.pctDisplay}%
                      </td>
                      <td className="py-2.5 pl-4">
                        {slice.topProduct ? (
                          <div className="flex items-center gap-1.5 text-slate-600">
                            <Award className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                            <span className="truncate max-w-[170px]" title={slice.topProduct}>
                              {slice.topProduct}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[11px]">-</span>
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
  );
}

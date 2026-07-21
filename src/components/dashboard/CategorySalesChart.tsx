"use client";

import React, { useState } from "react";
import { formatPrice } from "@/lib/utils";
import { PieChart, Award } from "lucide-react";

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
    <div className="bg-white p-6 rounded-3xl border border-slate-200/60 shadow-sm space-y-6">
      {/* Header & Toggle */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h2 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
            <PieChart className="w-4.5 h-4.5 text-brand-600" />
            Ventas por Categoría de Producto
          </h2>
          <p className="text-[11px] font-semibold text-slate-400 mt-0.5">
            Distribución porcentual e ingresos por familia de productos
          </p>
        </div>

        {/* Metric Switch */}
        <div className="bg-slate-100 p-1 rounded-xl flex items-center gap-1 self-stretch sm:self-auto">
          <button
            type="button"
            onClick={() => setMetric("billing")}
            className={`flex-1 sm:flex-none px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
              metric === "billing"
                ? "bg-white text-brand-700 shadow-sm"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            Facturación ($)
          </button>
          <button
            type="button"
            onClick={() => setMetric("qty")}
            className={`flex-1 sm:flex-none px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
              metric === "qty"
                ? "bg-white text-brand-700 shadow-sm"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            Unidades (u)
          </button>
        </div>
      </div>

      {sortedCategories.length === 0 ? (
        <div className="py-12 text-center text-slate-400 font-bold text-xs">
          No hay ventas registradas por categoría en este período.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          {/* Donut Chart SVG */}
          <div className="lg:col-span-5 flex flex-col items-center justify-center relative">
            <div className="w-56 h-56 relative flex items-center justify-center">
              <svg viewBox="0 0 200 200" className="w-full h-full">
                {/* Background Donut Track */}
                <circle
                  cx={100}
                  cy={100}
                  r={73}
                  fill="transparent"
                  stroke="#f1f5f9"
                  strokeWidth={28}
                />

                {/* Slices */}
                {slices.map((slice, i) => {
                  const isHovered = hoveredIdx === i;
                  const rInner = 58;
                  const rOuter = isHovered ? 92 : 87;

                  const pathD = getDonutSlicePath(
                    100,
                    100,
                    rInner,
                    rOuter,
                    slice.startAngle,
                    slice.endAngle
                  );

                  return (
                    <path
                      key={slice.category}
                      d={pathD}
                      fill={slice.color}
                      className="transition-all duration-200 cursor-pointer hover:opacity-90 stroke-white stroke-2"
                      onMouseEnter={() => setHoveredIdx(i)}
                      onMouseLeave={() => setHoveredIdx(null)}
                    />
                  );
                })}
              </svg>

              {/* Central Text Overlay */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center px-4">
                {activeHovered ? (
                  <>
                    <span
                      className="text-[9px] font-black uppercase tracking-wider truncate max-w-[130px]"
                      style={{ color: activeHovered.color }}
                    >
                      {activeHovered.category}
                    </span>
                    <span className="text-sm font-black text-slate-900 leading-tight">
                      {metric === "billing"
                        ? formatPrice(activeHovered.totalBilling)
                        : `${activeHovered.totalQty} u`}
                    </span>
                    <span className="text-[10px] font-extrabold text-slate-400">
                      {activeHovered.pctDisplay}% del total
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">
                      Total {metric === "billing" ? "Ventas" : "Unidades"}
                    </span>
                    <span className="text-sm font-black text-slate-900 leading-tight">
                      {metric === "billing"
                        ? formatPrice(totalValue)
                        : `${totalValue} u`}
                    </span>
                    <span className="text-[9px] font-bold text-slate-400">
                      {sortedCategories.length} Categorías
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Category List & Legends */}
          <div className="lg:col-span-7 space-y-3">
            <div className="max-h-[280px] overflow-y-auto pr-1 space-y-2.5">
              {slices.map((cat, i) => {
                const isHovered = hoveredIdx === i;
                return (
                  <div
                    key={cat.category}
                    onMouseEnter={() => setHoveredIdx(i)}
                    onMouseLeave={() => setHoveredIdx(null)}
                    className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                      isHovered
                        ? "bg-slate-50 border-slate-300 shadow-sm"
                        : "bg-white border-slate-100 hover:bg-slate-50/60"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className="w-3.5 h-3.5 rounded-md shrink-0 shadow-xs"
                        style={{ backgroundColor: cat.color }}
                      />
                      <div className="min-w-0">
                        <h4 className="font-bold text-xs text-slate-900 truncate">
                          {cat.category}
                        </h4>
                        {cat.topProduct && (
                          <p className="text-[9px] font-semibold text-slate-400 truncate flex items-center gap-1">
                            <Award className="w-2.5 h-2.5 text-amber-500 shrink-0" />
                            Top: {cat.topProduct}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="font-black text-xs text-slate-900">
                        {metric === "billing"
                          ? formatPrice(cat.totalBilling)
                          : `${cat.totalQty} u`}
                      </div>
                      <div className="text-[10px] font-extrabold text-slate-400 flex items-center justify-end gap-1">
                        <span>{cat.pctDisplay}%</span>
                        <span className="text-[9px] text-slate-300">•</span>
                        <span>
                          {metric === "billing"
                            ? `${cat.totalQty} u`
                            : formatPrice(cat.totalBilling)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

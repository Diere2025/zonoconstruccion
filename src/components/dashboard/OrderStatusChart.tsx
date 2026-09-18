"use client";

import React, { useState } from "react";
import { PieChart } from "lucide-react";

export interface OrderStatusData {
  label: "Pendientes" | "Entregados" | "Entregando" | "Anulados";
  count: number;
  color: string;
}

interface OrderStatusChartProps {
  statuses: OrderStatusData[];
}

function donutPath(startAngle: number, endAngle: number) {
  const center = 100;
  const outerRadius = 82;
  const innerRadius = 57;
  const angle = Math.min(endAngle - startAngle, Math.PI * 2 - 0.0001);
  if (angle <= 0) return "";

  const point = (radius: number, radians: number) => [
    center + radius * Math.cos(radians),
    center + radius * Math.sin(radians)
  ];
  const [x1, y1] = point(outerRadius, startAngle);
  const [x2, y2] = point(outerRadius, startAngle + angle);
  const [x3, y3] = point(innerRadius, startAngle + angle);
  const [x4, y4] = point(innerRadius, startAngle);
  const largeArc = angle > Math.PI ? 1 : 0;

  return `M ${x1} ${y1} A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${x2} ${y2} L ${x3} ${y3} A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${x4} ${y4} Z`;
}

export default function OrderStatusChart({ statuses }: OrderStatusChartProps) {
  const [hoveredLabel, setHoveredLabel] = useState<string | null>(null);
  const total = statuses.reduce((sum, status) => sum + status.count, 0);
  const visibleStatuses = statuses.filter(status => status.count > 0);
  const slices = visibleStatuses.reduce<Array<OrderStatusData & { startAngle: number; endAngle: number }>>(
    (accumulator, status) => {
      const startAngle = accumulator.at(-1)?.endAngle ?? -Math.PI / 2;
      const endAngle = startAngle + (total > 0 ? (status.count / total) * Math.PI * 2 : 0);
      return [...accumulator, { ...status, startAngle, endAngle }];
    },
    []
  );
  const active = slices.find(slice => slice.label === hoveredLabel) || null;

  return (
    <section className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-6">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-xl bg-violet-50 border border-violet-100 flex items-center justify-center text-violet-600">
          <PieChart className="w-4 h-4" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-slate-900 tracking-tight">Estado de pedidos</h2>
          <p className="text-xs text-slate-500 font-normal">Distribución del período seleccionado</p>
        </div>
      </div>

      {total === 0 ? (
        <p className="py-10 text-center text-xs font-medium text-slate-400">No hay pedidos para el período seleccionado.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
          <div className="flex justify-center">
            <div className="relative w-56 h-56">
              <svg viewBox="0 0 200 200" className="w-full h-full" role="img" aria-label="Distribución de pedidos por estado">
                <circle cx={100} cy={100} r={70} fill="transparent" stroke="#f1f5f9" strokeWidth={25} />
                {slices.map(slice => (
                  <path
                    key={slice.label}
                    d={donutPath(slice.startAngle, slice.endAngle)}
                    fill={slice.color}
                    className="cursor-pointer transition-opacity duration-150"
                    opacity={hoveredLabel && hoveredLabel !== slice.label ? 0.35 : 1}
                    onMouseEnter={() => setHoveredLabel(slice.label)}
                    onMouseLeave={() => setHoveredLabel(null)}
                  />
                ))}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center px-4">
                <span className="text-[11px] font-medium text-slate-400">{active ? active.label : "Total"}</span>
                <span className="text-2xl font-bold text-slate-900 tabular-nums">{active ? active.count : total}</span>
                {active && <span className="text-xs font-semibold text-slate-500">{((active.count / total) * 100).toFixed(1)}%</span>}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {statuses.map(status => {
              const percentage = total > 0 ? (status.count / total) * 100 : 0;
              return (
                <button
                  key={status.label}
                  type="button"
                  onMouseEnter={() => setHoveredLabel(status.label)}
                  onMouseLeave={() => setHoveredLabel(null)}
                  onClick={() => setHoveredLabel(hoveredLabel === status.label ? null : status.label)}
                  className={`text-left rounded-xl border p-3 transition-colors cursor-pointer ${
                    hoveredLabel === status.label ? "border-slate-300 bg-slate-50" : "border-slate-100 bg-white hover:bg-slate-50"
                  }`}
                >
                  <span className="flex items-center gap-2 text-[11px] font-semibold text-slate-500">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: status.color }} />
                    {status.label}
                  </span>
                  <span className="block mt-1 text-lg font-bold text-slate-900 tabular-nums">{status.count}</span>
                  <span className="text-[11px] font-medium text-slate-400">{percentage.toFixed(1)}%</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

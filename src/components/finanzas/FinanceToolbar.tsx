"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRightLeft, ChevronDown, Download, PlusCircle, RefreshCw, Search, SlidersHorizontal, Users } from "lucide-react";
import { financialAccountLabel } from "@/lib/financialAccountLabels";

export type QuickMovement = "general" | "eventuales" | "proveedor" | "gasto" | "adelanto";
export type OptionalFinanceColumn = "subcategory" | "efe" | "notes";

interface Props {
  search: string;
  onSearch: (value: string) => void;
  period: string;
  onPeriod: (value: string) => void;
  startDate: string;
  endDate: string;
  onStartDate: (value: string) => void;
  onEndDate: (value: string) => void;
  account: string;
  onAccount: (value: string) => void;
  accounts: { id: string; name: string }[];
  type: string;
  onType: (value: "all" | "ingreso" | "egreso") => void;
  category: string;
  onCategory: (value: string) => void;
  categories: string[];
  unit: string;
  onUnit: (value: string) => void;
  units: { id: string; name: string; code: string }[];
  onClear: () => void;
  onRefresh: () => void;
  onNew: (kind: QuickMovement) => void;
  onTransfer: () => void;
  onConcepts: () => void;
  onExport: () => void;
  onSync: () => void;
  syncing: boolean;
  disabled: boolean;
  showSummary: boolean;
  onSummary: () => void;
  columns: Record<OptionalFinanceColumn, boolean>;
  onColumn: (column: OptionalFinanceColumn) => void;
}

const control = "h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500/30";
const action = `${control} inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed`;
const menu = "absolute right-0 top-full z-30 mt-1 min-w-52 rounded-xl border border-slate-200 bg-white p-2 shadow-lg";
const menuItem = "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50";

const extraMovements = [
  { kind: "proveedor", label: "Pago a proveedor" },
  { kind: "gasto", label: "Gasto operativo" },
  { kind: "adelanto", label: "Adelanto de sueldo" }
] as const;

export function visibleMovementCount(available: number, widths: number[]) {
  for (let count = 3; count >= 0; count--) {
    const visible = widths.slice(0, 3 + count);
    if (count < 3) visible.push(widths[6]);
    if (visible.reduce((sum, width) => sum + width, 0) + (visible.length - 1) * 8 <= available) return count;
  }
  return 0;
}

export default function FinanceToolbar(p: Props) {
  const [openMenu, setOpenMenu] = useState<"movements" | "actions" | "columns" | null>(null);
  const [moreFilters, setMoreFilters] = useState(false);
  const [visibleExtras, setVisibleExtras] = useState(3);
  const actionRowRef = useRef<HTMLDivElement>(null);
  const toolsRef = useRef<HTMLDivElement>(null);
  const measurementsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const row = actionRowRef.current;
    const tools = toolsRef.current;
    const measurements = measurementsRef.current;
    if (!row || !tools || !measurements) return;
    const update = () => {
      const widths = Array.from(measurements.children, child => child.getBoundingClientRect().width);
      const count = visibleMovementCount(row.getBoundingClientRect().width - tools.getBoundingClientRect().width - 8, widths);
      setVisibleExtras(count);
      if (count === extraMovements.length) setOpenMenu(current => current === "movements" ? null : current);
    };
    const observer = new ResizeObserver(update);
    observer.observe(row); observer.observe(tools); observer.observe(measurements);
    update();
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!openMenu) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setOpenMenu(null); };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [openMenu]);
  const additionalFilters = Number(p.category !== "all") + Number(p.unit !== "all");
  const toggleMenu = (name: typeof openMenu) => setOpenMenu(current => current === name ? null : name);
  const run = (fn: () => void) => { setOpenMenu(null); fn(); };

  return (
    <div className="relative rounded-xl border border-slate-200/70 bg-white p-3 shadow-sm">
      {openMenu && <button type="button" aria-label="Cerrar menú" className="fixed inset-0 z-20 cursor-default" onClick={() => setOpenMenu(null)} />}
      <div ref={measurementsRef} aria-hidden="true" className="invisible pointer-events-none fixed -left-[10000px] top-0 flex w-max gap-2">
        <span className={action}><PlusCircle className="h-3.5 w-3.5" />Nuevo movimiento</span>
        <span className={action}><ArrowRightLeft className="h-3.5 w-3.5" />Transferencia</span>
        <span className={action}><Users className="h-3.5 w-3.5" />Carga de eventuales</span>
        {extraMovements.map(item => <span key={item.kind} className={action}>{item.label}</span>)}
        <span className={action}>Más movimientos <ChevronDown className="h-3 w-3" /></span>
      </div>
      <div ref={actionRowRef} className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={p.disabled} onClick={() => p.onNew("general")} className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-brand-600 bg-brand-600 px-2.5 text-xs font-semibold text-white hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:cursor-not-allowed disabled:opacity-50"><PlusCircle className="h-3.5 w-3.5" /> Nuevo movimiento</button>
        <button type="button" disabled={p.disabled} onClick={p.onTransfer} className={action}><ArrowRightLeft className="h-3.5 w-3.5" /> Transferencia</button>
        <button type="button" disabled={p.disabled} onClick={() => p.onNew("eventuales")} className={action}><Users className="h-3.5 w-3.5" /> Carga de eventuales</button>
        {extraMovements.slice(0, visibleExtras).map(item => <button key={item.kind} type="button" disabled={p.disabled} onClick={() => p.onNew(item.kind)} className={action}>{item.label}</button>)}
        {visibleExtras < extraMovements.length && <div className="relative">
          <button type="button" disabled={p.disabled} aria-expanded={openMenu === "movements"} onClick={() => toggleMenu("movements")} className={action}>Más movimientos <ChevronDown className="h-3 w-3" /></button>
          {openMenu === "movements" && <div className={`${menu} left-0 right-auto sm:left-auto sm:right-0`}>
            {extraMovements.slice(visibleExtras).map(item => <button key={item.kind} type="button" disabled={p.disabled} className={menuItem} onClick={() => run(() => p.onNew(item.kind))}>{item.label}</button>)}
          </div>}
        </div>}
        <div ref={toolsRef} className="ml-auto flex flex-wrap items-center gap-2">
          <button type="button" aria-expanded={p.showSummary} onClick={p.onSummary} className={action}>{p.showSummary ? "Ocultar resumen" : "Ver resumen"}</button>
          <div className="relative">
            <button type="button" aria-expanded={openMenu === "columns"} onClick={() => toggleMenu("columns")} className={action}>Columnas <ChevronDown className="h-3 w-3" /></button>
            {openMenu === "columns" && <div className={menu}>
              {([["subcategory", "Subcategoría"], ["efe", "EFE"], ["notes", "Observaciones"]] as const).map(([key, label]) => <label key={key} className={`${menuItem} cursor-pointer`}><input type="checkbox" checked={p.columns[key]} onChange={() => p.onColumn(key)} className="accent-brand-600" />{label}</label>)}
            </div>}
          </div>
          <div className="relative">
            <button type="button" aria-expanded={openMenu === "actions"} onClick={() => toggleMenu("actions")} className={action}>Más acciones <ChevronDown className="h-3 w-3" /></button>
            {openMenu === "actions" && <div className={menu}>
              <button type="button" className={menuItem} onClick={() => run(p.onConcepts)}><Search className="h-3.5 w-3.5" />Administrar conceptos</button>
              <button type="button" className={menuItem} onClick={() => run(p.onExport)}><Download className="h-3.5 w-3.5" />Exportar CSV</button>
              <button type="button" disabled={p.syncing} className={menuItem} onClick={() => run(p.onSync)}><RefreshCw className={`h-3.5 w-3.5 ${p.syncing ? "animate-spin" : ""}`} />{p.syncing ? "Importando…" : "Importar bancos · sólo faltantes"}</button>
            </div>}
          </div>
        </div>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2.5">
        <div className="relative min-w-44 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <input aria-label="Buscar movimiento" placeholder="Buscar concepto, subcategoría, notas…" value={p.search} onChange={e => p.onSearch(e.target.value)} className={`${control} w-full pl-8`} />
        </div>
        <select aria-label="Período" value={p.period} onChange={e => p.onPeriod(e.target.value)} className={control}>
          <option value="hoy">Hoy</option><option value="7dias">7 días</option><option value="30dias">30 días</option><option value="mes">Este mes</option><option value="año">Este año</option><option value="personalizado">Personalizado</option>
        </select>
        {p.period === "personalizado" && <>
          <label className="flex items-center gap-1 text-xs text-slate-500">Desde<input type="date" aria-label="Desde" value={p.startDate} onChange={e => p.onStartDate(e.target.value)} className={control} /></label>
          <label className="flex items-center gap-1 text-xs text-slate-500">Hasta<input type="date" aria-label="Hasta" value={p.endDate} onChange={e => p.onEndDate(e.target.value)} className={control} /></label>
        </>}
        <select aria-label="Cuenta financiera" value={p.account} onChange={e => p.onAccount(e.target.value)} className={`${control} max-w-60`}><option value="all">Todas las cuentas</option>{p.accounts.map(a => <option key={a.id} value={a.id}>{financialAccountLabel(a.name)}</option>)}</select>
        <select aria-label="Tipo de movimiento" value={p.type} onChange={e => p.onType(e.target.value as "all" | "ingreso" | "egreso")} className={control}><option value="all">Todos los tipos</option><option value="ingreso">Ingresos</option><option value="egreso">Egresos</option></select>
        <button type="button" aria-expanded={moreFilters} onClick={() => setMoreFilters(value => !value)} className={action}><SlidersHorizontal className="h-3.5 w-3.5" />Más filtros{additionalFilters > 0 && <span className="rounded bg-brand-50 px-1 text-brand-700">{additionalFilters}</span>}</button>
        {(p.search || p.account !== "all" || p.type !== "all" || additionalFilters > 0 || p.period !== "30dias") && <button type="button" onClick={p.onClear} className="text-xs font-semibold text-brand-600 hover:underline">Limpiar filtros</button>}
        <button type="button" onClick={p.onRefresh} aria-label="Actualizar movimientos" title="Actualizar movimientos" className={action}><RefreshCw className="h-3.5 w-3.5" /></button>
      </div>
      {moreFilters && <div className="mt-2.5 flex flex-wrap gap-3 border-t border-slate-100 pt-2.5">
        <label className="flex max-w-full min-w-0 items-center gap-2 text-xs font-semibold text-slate-500">Categoría<select value={p.category} onChange={e => p.onCategory(e.target.value)} className={`${control} max-w-64 min-w-0`}><option value="all">Todas las categorías</option>{p.categories.map(c => <option key={c} value={c}>{c}</option>)}</select></label>
        <label className="flex max-w-full min-w-0 items-center gap-2 text-xs font-semibold text-slate-500">Área / centro de costo<select value={p.unit} onChange={e => p.onUnit(e.target.value)} className={`${control} max-w-64 min-w-0`}><option value="all">Todas las áreas</option>{p.units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
      </div>}
    </div>
  );
}

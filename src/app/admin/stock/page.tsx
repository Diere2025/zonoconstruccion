"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { 
  RefreshCw, 
  AlertTriangle, 
  CheckCircle2, 
  Search, 
  Activity, 
  Info,
  Layers,
  ArrowRightLeft,
  Factory
} from "lucide-react";
import { sortStockProducts, stockSupplierLabel, type StockSortKey } from "@/lib/stockControlSorting";
import type { StockPurchaseContext } from "@/lib/stockPurchaseContext";
import { Button } from "@/components/ui/Button";

interface ProductComparison {
  productId: string;
  name: string;
  sku: string;
  sheetPhysical: number;
  dbPhysical: number;
  sheetReserved: number;
  dbReserved: number;
  dbCalculatedReserved: number;
  sheetAvailable: number;
  dbAvailable: number;
}

interface UnmatchedProduct {
  name: string;
  sheetPhysical: number;
  sheetReserved: number;
}

interface OnlyInDbProduct {
  id: string;
  name: string;
  sku: string;
  dbPhysical: number;
  dbReserved: number;
  dbCalculatedReserved: number;
  dbAvailable: number;
}

export default function StockControlPage() {
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<"catalog" | "discrepancies" | "all" | "onlyInDb" | "unmatched">("catalog");
  
  const [sortKey, setSortKey] = useState<StockSortKey>("supplier");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [supplierId, setSupplierId] = useState("");
  const [stockFilter, setStockFilter] = useState("all");
  const [purchaseContext, setPurchaseContext] = useState<Record<string, StockPurchaseContext> | null>(null);
  const [purchaseWarning, setPurchaseWarning] = useState<string | null>(null);
  const [comparisonList, setComparisonList] = useState<ProductComparison[]>([]);
  const [unmatchedSheetProducts, setUnmatchedSheetProducts] = useState<UnmatchedProduct[]>([]);
  const [onlyInDb, setOnlyInDb] = useState<OnlyInDbProduct[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async (preserveSuccess = false) => {
    setLoading(true);
    setError(null);
    if (!preserveSuccess) setSuccessMessage(null);
    try {
      const res = await fetch("/api/admin/sync-stock");
      if (!res.ok) {
        throw new Error("No se pudo cargar la comparación de stock.");
      }
      const data = await res.json();
      setComparisonList(data.comparisonList || []);
      setUnmatchedSheetProducts(data.unmatchedSheetProducts || []);
      setOnlyInDb(data.onlyInDb || []);
      setPurchaseContext(data.purchaseContext ?? null);
      setPurchaseWarning(data.purchaseWarning || null);
    } catch (err: unknown) {
      setError((err instanceof Error ? err.message : "") || "Error al cargar la comparación.");
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    if (!confirm("¿Está seguro de que desea sincronizar el stock del sistema con la planilla maestra? Esto actualizará los stock físicos con la planilla y corregirá las reservas considerando todos los pedidos activos (incluyendo mayoristas).")) {
      return;
    }

    setSyncing(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const res = await fetch("/api/admin/sync-stock", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Error en la sincronización del stock.");
      }
      setSuccessMessage(`Sincronización finalizada con éxito. Se actualizaron los niveles de ${data.updatedCount} productos.`);
      await fetchData(true);
    } catch (err: unknown) {
      setError((err instanceof Error ? err.message : "") || "Error al sincronizar.");
    } finally {
      setSyncing(false);
    }
  };

  // Metrics
  const physicalMismatches = comparisonList.filter(c => c.sheetPhysical !== c.dbPhysical).length;
  const reservedMismatches = comparisonList.filter(c => c.sheetReserved !== c.dbCalculatedReserved).length;
  const totalDiscrepancies = comparisonList.filter(
    c => c.sheetPhysical !== c.dbPhysical || c.sheetReserved !== c.dbCalculatedReserved
  ).length;

  const catalog = [...comparisonList.map(p => ({ ...p, id: p.productId })), ...onlyInDb];
  const supplierOptions = [...new Map(Object.values(purchaseContext || {}).flatMap(c => c.suppliers).map(s => [s.id, s])).values()].sort((a, b) => a.name.localeCompare(b.name, "es"));
  const available = (p: { dbPhysical: number; dbCalculatedReserved: number }) => p.dbPhysical - p.dbCalculatedReserved;
  const matchesFilters = (p: { id?: string; productId?: string; name: string; sku: string; dbPhysical: number; dbCalculatedReserved: number }) => {
    const context = purchaseContext?.[p.id || p.productId || ""];
    const term = searchTerm.trim().toLocaleLowerCase("es");
    if (![p.name, p.sku || ""].some(value => value.toLocaleLowerCase("es").includes(term))) return false;
    if (supplierId === "none" ? !context || context.suppliers.length > 0 : supplierId && !context?.suppliers.some(s => s.id === supplierId)) return false;
    if (stockFilter === "incoming") return !!context && context.pendingIncoming > 0;
    if (stockFilter === "shortage") return available(p) < 0;
    if (stockFilter === "uncovered") return !!context && available(p) + context.pendingIncoming < 0;
    return true;
  };
  const filteredComparisonList = sortStockProducts(comparisonList.filter(p => matchesFilters(p) && (filterType !== "discrepancies" || p.sheetPhysical !== p.dbPhysical || p.sheetReserved !== p.dbCalculatedReserved)), purchaseContext, sortKey, sortDirection, p => p.dbAvailable);
  const filteredOnlyInDb = sortStockProducts((filterType === "catalog" ? catalog : onlyInDb).filter(matchesFilters), purchaseContext, sortKey, sortDirection);
  const filteredUnmatched = unmatchedSheetProducts.filter(p => !supplierId && stockFilter === "all" && p.name.toLowerCase().includes(searchTerm.trim().toLowerCase()));
  const filteredCatalog = catalog.filter(matchesFilters);
  const renderSupplyCells = (id: string, currentAvailable: number) => {
    const context = purchaseContext?.[id];
    const projected = context ? currentAvailable + context.pendingIncoming : null;
    return <>
      <td className="py-3.5 px-5 text-center text-slate-600">
        {context ? context.pendingIncoming > 0 ? <details>
          <summary className="cursor-pointer font-semibold text-blue-700">{context.pendingIncoming} por recibir · {context.pendingOrders.length} OC</summary>
          <ul className="mt-2 space-y-1 text-left text-[11px]">{context.pendingOrders.map(order => <li key={order.id}><Link className="text-blue-700 underline" href="/admin/compras">{order.code}</Link> · {order.supplierName}: {order.quantity}</li>)}</ul>
        </details> : "Sin pendientes" : "No disponible"}
      </td>
      <td className={"py-3.5 px-5 text-center font-semibold tabular-nums " + (projected !== null && projected < 0 ? "text-rose-600" : "text-slate-700")}>{projected ?? "—"}</td>
    </>;
  };
  const renderSuppliers = (id: string) => <td className="py-3.5 px-5 text-slate-600">{stockSupplierLabel(purchaseContext?.[id]) || (purchaseContext ? "Sin proveedor vinculado" : "Proveedor no disponible")}</td>;
  const sortHeader = (key: StockSortKey, label: string, centered = true) => <th aria-sort={sortKey === key ? (sortDirection === "asc" ? "ascending" : "descending") : "none"} className={"py-3 px-5 " + (centered ? "text-center" : "text-left")}>
    <button type="button" className="cursor-pointer hover:text-brand-700" onClick={() => { if (sortKey === key) setSortDirection(sortDirection === "asc" ? "desc" : "asc"); else { setSortKey(key); setSortDirection("asc"); } }}>{label}<span aria-hidden="true">{sortKey === key ? sortDirection === "asc" ? " ↑" : " ↓" : " ↕"}</span></button>
  </th>;

  return (
    <div className="space-y-6 pb-12">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            Control y Sincronización de Stock
          </h1>
          <p className="text-xs text-slate-500 font-normal mt-0.5">
            Auditoría en tiempo real entre la Planilla Maestra y los pedidos activos (minoristas y mayoristas).
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Link
            href="/admin/stock-fabrica"
            className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-2xs"
          >
            <Factory className="w-3.5 h-3.5 text-blue-600" />
            Stock de Fábrica
          </Link>

          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchData()}
            isLoading={loading}
            disabled={syncing}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Actualizar
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={handleSync}
            isLoading={syncing}
            disabled={loading}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Sincronizar Todo
          </Button>
        </div>
      </div>

      {/* Success / Error Notifications */}
      {error && (
        <div className="bg-rose-50 border border-rose-200/80 p-4 rounded-xl flex items-start gap-3 text-rose-800 text-xs font-medium animate-fadeIn">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold block text-rose-900">Ocurrió un error:</span>
            <p className="text-rose-700">{error}</p>
          </div>
        </div>
      )}

      {successMessage && (
        <div className="bg-emerald-50 border border-emerald-200/80 p-4 rounded-xl flex items-start gap-3 text-emerald-800 text-xs font-medium animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold block text-emerald-900">Operación exitosa:</span>
            <p className="text-emerald-700">{successMessage}</p>
          </div>
        </div>
      )}

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card-enterprise p-4 flex items-center gap-3.5">
          <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-600 shrink-0">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <span className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Productos Totales</span>
            <span className="text-xl font-bold text-slate-900 tabular-nums">{comparisonList.length + onlyInDb.length}</span>
          </div>
        </div>

        <div className="card-enterprise p-4 flex items-center gap-3.5">
          <div className="w-10 h-10 bg-blue-50 border border-blue-100 rounded-xl flex items-center justify-center text-blue-600 shrink-0">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <span className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Emparejados</span>
            <span className="text-xl font-bold text-blue-700 tabular-nums">{comparisonList.length}</span>
          </div>
        </div>

        <div className="card-enterprise p-4 flex items-center gap-3.5">
          <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${
            physicalMismatches > 0 ? "bg-amber-50 border-amber-200 text-amber-600" : "bg-emerald-50 border-emerald-200 text-emerald-600"
          }`}>
            <ArrowRightLeft className="w-5 h-5" />
          </div>
          <div>
            <span className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Desfase Físico</span>
            <span className={`text-xl font-bold tabular-nums ${physicalMismatches > 0 ? "text-amber-700" : "text-emerald-700"}`}>
              {physicalMismatches}
            </span>
          </div>
        </div>

        <div className="card-enterprise p-4 flex items-center gap-3.5">
          <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${
            reservedMismatches > 0 ? "bg-rose-50 border-rose-200 text-rose-600" : "bg-emerald-50 border-emerald-200 text-emerald-600"
          }`}>
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <span className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Desfase Reservas</span>
            <span className={`text-xl font-bold tabular-nums ${reservedMismatches > 0 ? "text-rose-700" : "text-emerald-700"}`}>
              {reservedMismatches}
            </span>
          </div>
        </div>
      </div>

      {/* Information Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card-enterprise p-4.5 bg-blue-50/40 border-blue-100 flex gap-3 text-xs">
          <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
          <div className="space-y-1 text-slate-600">
            <span className="font-semibold text-slate-900 block">¿Cómo funciona la sincronización y cálculo de stock?</span>
            <ul className="list-disc pl-4 space-y-0.5 text-[11px]">
              <li><b>Stock Físico:</b> Se sincroniza directamente desde la planilla de Google Sheets.</li>
              <li><b>Stock Reservado:</b> Se calcula sumando el stock comprometido en todos los pedidos activos (<i>Pendiente, Confirmado</i>), considerando minoristas y mayoristas dentro de la ventana operativa de 30 días, más pedidos de vendedores pendientes de importar.</li>
              <li><b>Stock Disponible:</b> Es el resultado exacto de <code>Físico - Reservado</code>.</li>
            </ul>
          </div>
        </div>

        <div className="card-enterprise p-4.5 bg-amber-50/30 border-amber-100 flex gap-3 text-xs">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1 text-slate-600">
            <span className="font-semibold text-slate-900 block">Identificación de desfases</span>
            <p className="text-[11px] leading-relaxed">
              Las filas resaltadas indican cuando el valor asentado en la planilla difiere de los pedidos reales en sistema. Al presionar <b>Sincronizar Todo</b>, se actualizará el stock reservado de la base de datos con el cálculo consolidado.
            </p>
          </div>
        </div>
      </div>

      {purchaseWarning && <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800">{purchaseWarning}</div>}
      <div className="card-enterprise p-4 space-y-3">
        <div className="flex flex-wrap gap-3 items-end">
          <label className="text-xs text-slate-600">Proveedor
            <select aria-label="Proveedor" className="input-standard mt-1 min-w-48" value={supplierId} disabled={!purchaseContext} onChange={e => setSupplierId(e.target.value)}>
              <option value="">Todos los proveedores</option><option value="none">Sin proveedor vinculado</option>
              {supplierOptions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className="text-xs text-slate-600">Situación de stock
            <select aria-label="Situación de stock" className="input-standard mt-1 min-w-48" value={stockFilter} onChange={e => setStockFilter(e.target.value)}>
              <option value="all">Todas las situaciones</option><option value="incoming" disabled={!purchaseContext}>Con pendiente de recibir</option>
              <option value="shortage">Disponible calculado negativo</option><option value="uncovered" disabled={!purchaseContext}>Faltante aun recibiendo las OCs</option>
            </select>
          </label>
          <button type="button" className="text-xs text-blue-700 underline py-2" onClick={() => { setSupplierId(""); setStockFilter("all"); setSearchTerm(""); }}>Limpiar filtros</button>
        </div>
        <p className="text-xs text-slate-600">{filteredCatalog.length} productos del catálogo coinciden · {purchaseContext ? filteredCatalog.filter(p => (purchaseContext[p.id]?.pendingIncoming || 0) > 0).length + " con ingreso pendiente" : "Ingresos pendientes no disponibles"} · {filteredCatalog.filter(p => available(p) < 0).length} con faltante actual</p>
        <p className="text-[11px] text-slate-500">Disponible calculado = físico en DB − reservas calculadas. Proyectado = disponible calculado + saldo de OCs pendientes o parciales; no es stock recibido. El proveedor incluye vínculos del catálogo y OCs abiertas; las cantidades muestran todos los ingresos del producto.</p>
      </div>
      {/* Filters and Actions Bar */}
      <div className="card-enterprise p-4 flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="flex flex-wrap items-center gap-1.5 w-full md:w-auto">
          <button type="button" onClick={() => setFilterType("catalog")} className={"px-3 py-1.5 text-xs font-semibold rounded-xl " + (filterType === "catalog" ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600")}>Catálogo completo ({catalog.length})</button>
          <button
            type="button"
            onClick={() => setFilterType("discrepancies")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition-all cursor-pointer ${
              filterType === "discrepancies"
                ? "bg-brand-600 text-white shadow-xs"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            Discrepancias ({totalDiscrepancies})
          </button>
          <button
            type="button"
            onClick={() => setFilterType("all")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition-all cursor-pointer ${
              filterType === "all"
                ? "bg-brand-600 text-white shadow-xs"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            Emparejados ({comparisonList.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterType("onlyInDb")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition-all cursor-pointer ${
              filterType === "onlyInDb"
                ? "bg-brand-600 text-white shadow-xs"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            Solo en DB ({onlyInDb.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterType("unmatched")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition-all cursor-pointer ${
              filterType === "unmatched"
                ? "bg-brand-600 text-white shadow-xs"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            Solo en Planilla ({unmatchedSheetProducts.length})
          </button>
        </div>

        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por producto o SKU..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input-standard pl-8.5 py-1.5 text-xs"
          />
        </div>
      </div>

      {/* Data Table */}
      {loading ? (
        <div className="card-enterprise p-16 flex flex-col items-center justify-center gap-3">
          <RefreshCw className="w-8 h-8 text-brand-600 animate-spin" />
          <span className="text-xs font-medium text-slate-500">
            Analizando planilla y stock de pedidos activos...
          </span>
        </div>
      ) : filterType === "onlyInDb" || filterType === "catalog" ? (
        <div className="card-enterprise overflow-hidden">
          {filteredOnlyInDb.length === 0 ? (
            <div className="p-12 text-center text-xs font-medium text-slate-400">
              No se encontraron productos con los filtros seleccionados.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50/80 text-[11px] font-semibold text-slate-400 uppercase border-b border-slate-100">
                    {sortHeader("name", "SKU", false)}
                    {sortHeader("supplier", "Proveedor", false)}
                    {sortHeader("physical", "Físico en sistema")}
                    {sortHeader("reserved", "Reservado calculado")}
                    {sortHeader("available", "Disponible calculado")}
                    {sortHeader("incoming", "Pendiente de recibir")}
                    {sortHeader("projected", "Proyectado")}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                  {filteredOnlyInDb.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3.5 px-5">
                        <span className="block text-slate-900 font-semibold">{p.sku || p.name}</span>
                      </td>
                      {renderSuppliers(p.id)}
                      <td className="py-3.5 px-5 text-center font-semibold text-slate-900 tabular-nums">{p.dbPhysical}</td>
                      <td className="py-3.5 px-5 text-center text-slate-500 font-medium tabular-nums">
                        {p.dbCalculatedReserved}
                      </td>
                      <td className={`py-3.5 px-5 text-center font-semibold tabular-nums ${available(p) < 0 ? "text-rose-600" : "text-slate-700"}`}>
                        {available(p)}
                      </td>
                      {renderSupplyCells(p.id, available(p))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : filterType === "unmatched" ? (
        <div className="card-enterprise overflow-hidden">
          {filteredUnmatched.length === 0 ? (
            <div className="p-12 text-center text-xs font-medium text-slate-400">
              No se encontraron productos. Los productos sin emparejar no tienen proveedor ni OCs identificables; limpiá los filtros para verlos.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50/80 text-[11px] font-semibold text-slate-400 uppercase border-b border-slate-100">
                    <th className="py-3 px-5">Producto en Planilla</th>
                    <th className="py-3 px-5 text-center">Planilla Físico</th>
                    <th className="py-3 px-5 text-center">Planilla Reservado</th>
                    <th className="py-3 px-5 text-center">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                  {filteredUnmatched.map((p, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3.5 px-5 font-semibold text-slate-900">{p.name}</td>
                      <td className="py-3.5 px-5 text-center font-semibold text-slate-900 tabular-nums">{p.sheetPhysical}</td>
                      <td className="py-3.5 px-5 text-center text-slate-500 font-medium tabular-nums">{p.sheetReserved}</td>
                      <td className="py-3.5 px-5 text-center">
                        <span className="bg-amber-50 border border-amber-200 text-amber-700 text-[11px] font-semibold px-2 py-0.5 rounded-md">
                          No emparejado
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="card-enterprise overflow-hidden">
          {filteredComparisonList.length === 0 ? (
            <div className="p-12 text-center text-xs font-medium text-slate-400">
              {filterType === "discrepancies" 
                ? "No hay discrepancias que coincidan con los filtros seleccionados."
                : "No se encontraron productos emparejados."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50/80 text-[11px] font-semibold text-slate-400 uppercase border-b border-slate-100">
                    {sortHeader("name", "SKU", false)}
                    {sortHeader("supplier", "Proveedor", false)}
                    {sortHeader("physical", "Stock físico (Planilla vs DB)")}
                    {sortHeader("reserved", "Reservado (Planilla vs pedidos)")}
                    {sortHeader("available", "Disponible (Planilla vs DB)")}
                    {sortHeader("incoming", "Pendiente de recibir")}
                    {sortHeader("projected", "Proyectado")}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                  {filteredComparisonList.map((c) => {
                    const physicalDiff = c.sheetPhysical !== c.dbPhysical;
                    const reservedDiff = c.sheetReserved !== c.dbCalculatedReserved;
                    
                    return (
                      <tr key={c.productId} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3.5 px-5">
                          <span className="block text-slate-900 font-semibold">{c.sku || c.name}</span>
                        </td>
                        {renderSuppliers(c.productId)}
                        
                        {/* Stock Físico */}
                        <td className="py-3.5 px-5 text-center">
                          <div className="flex items-center justify-center gap-2 tabular-nums">
                            <span className="font-semibold text-slate-900">{c.sheetPhysical}</span>
                            <span className="text-slate-300 font-normal">|</span>
                            <span className={`font-medium ${physicalDiff ? "text-amber-600 font-semibold" : "text-slate-400"}`}>
                              {c.dbPhysical}
                            </span>
                            {physicalDiff && (
                              <span className={`text-[10px] px-1.5 py-0.2 rounded font-semibold ${c.sheetPhysical > c.dbPhysical ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                                {c.sheetPhysical > c.dbPhysical ? `+${c.sheetPhysical - c.dbPhysical}` : `${c.sheetPhysical - c.dbPhysical}`}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Stock Reservado */}
                        <td className={`py-3.5 px-5 text-center ${reservedDiff ? "bg-amber-50/40" : ""}`}>
                          <div className="flex flex-col items-center justify-center tabular-nums">
                            <div className="flex items-center justify-center gap-2">
                              <span className="font-medium text-slate-400" title="Valor en planilla">
                                Pl: {c.sheetReserved}
                              </span>
                              <span className="text-slate-300 font-normal">|</span>
                              <span className={`font-semibold ${reservedDiff ? "text-amber-800" : "text-slate-900"}`} title="Cálculo real de pedidos activos">
                                Real: {c.dbCalculatedReserved}
                              </span>
                            </div>
                            {reservedDiff && (
                              <span className="text-[10px] font-semibold text-amber-700 mt-0.5 flex items-center gap-0.5">
                                <AlertTriangle className="w-3 h-3 shrink-0" />
                                Desfasado por {Math.abs(c.sheetReserved - c.dbCalculatedReserved)}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Stock Disponible */}
                        <td className="py-3.5 px-5 text-center">
                          <div className="flex items-center justify-center gap-2 tabular-nums">
                            <span className="font-semibold text-slate-900">{c.sheetAvailable}</span>
                            <span className="text-slate-300 font-normal">|</span>
                            <span className={`font-medium ${c.dbAvailable < 0 ? "text-rose-600 font-semibold" : "text-slate-400"}`}>
                              {c.dbAvailable}
                            </span>
                          </div>
                        </td>
                        {renderSupplyCells(c.productId, available(c))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { 
  Package, 
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
  const [filterType, setFilterType] = useState<"discrepancies" | "all" | "onlyInDb" | "unmatched">("discrepancies");
  
  const [comparisonList, setComparisonList] = useState<ProductComparison[]>([]);
  const [unmatchedSheetProducts, setUnmatchedSheetProducts] = useState<UnmatchedProduct[]>([]);
  const [onlyInDb, setOnlyInDb] = useState<OnlyInDbProduct[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const res = await fetch("/api/admin/sync-stock");
      if (!res.ok) {
        throw new Error("No se pudo cargar la comparación de stock.");
      }
      const data = await res.json();
      setComparisonList(data.comparisonList || []);
      setUnmatchedSheetProducts(data.unmatchedSheetProducts || []);
      setOnlyInDb(data.onlyInDb || []);
    } catch (err: any) {
      setError(err.message || "Error al cargar la comparación.");
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
      await fetchData();
    } catch (err: any) {
      setError(err.message || "Error al sincronizar.");
      setSyncing(false);
    }
  };

  // Metrics
  const physicalMismatches = comparisonList.filter(c => c.sheetPhysical !== c.dbPhysical).length;
  const reservedMismatches = comparisonList.filter(c => c.sheetReserved !== c.dbCalculatedReserved).length;
  const totalDiscrepancies = comparisonList.filter(
    c => c.sheetPhysical !== c.dbPhysical || c.sheetReserved !== c.dbCalculatedReserved
  ).length;

  // Filter comparison list
  const filteredComparisonList = comparisonList.filter(c => {
    const matchesSearch = 
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      c.sku.toLowerCase().includes(searchTerm.toLowerCase());
    
    if (!matchesSearch) return false;

    if (filterType === "discrepancies") {
      return c.sheetPhysical !== c.dbPhysical || c.sheetReserved !== c.dbCalculatedReserved;
    }
    return true;
  });

  const filteredOnlyInDb = onlyInDb.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.sku.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredUnmatched = unmatchedSheetProducts.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
            onClick={fetchData}
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
              <li><b>Stock Reservado:</b> Se calcula sumando el stock comprometido en todos los pedidos activos (<i>Pendiente, Confirmado</i>), considerando tanto minoristas como mayoristas sin límite temporal.</li>
              <li><b>Stock Disponible:</b> Es el resultado exacto de <code>Físico - Reservado</code>.</li>
            </ul>
          </div>
        </div>

        <div className="card-enterprise p-4.5 bg-amber-50/30 border-amber-100 flex gap-3 text-xs">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1 text-slate-600">
            <span className="font-semibold text-slate-900 block">Identificación de desfases</span>
            <p className="text-[11px] leading-relaxed">
              Las filas resaltadas indican cuando el valor asentado en la planilla difiere de los pedidos reales en sistema. Al presionar <b>"Sincronizar Todo"</b>, se actualizará el stock reservado de la base de datos con el cálculo consolidado.
            </p>
          </div>
        </div>
      </div>

      {/* Filters and Actions Bar */}
      <div className="card-enterprise p-4 flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="flex flex-wrap items-center gap-1.5 w-full md:w-auto">
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
            Todos ({comparisonList.length})
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
      ) : filterType === "onlyInDb" ? (
        <div className="card-enterprise overflow-hidden">
          {filteredOnlyInDb.length === 0 ? (
            <div className="p-12 text-center text-xs font-medium text-slate-400">
              No hay productos en la base de datos que falten en la planilla.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50/80 text-[11px] font-semibold text-slate-400 uppercase border-b border-slate-100">
                    <th className="py-3 px-5">Producto / SKU</th>
                    <th className="py-3 px-5 text-center">DB Físico</th>
                    <th className="py-3 px-5 text-center">DB Reservado</th>
                    <th className="py-3 px-5 text-center">DB Disponible</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                  {filteredOnlyInDb.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3.5 px-5">
                        <span className="block text-slate-900 font-semibold">{p.name}</span>
                        <span className="block text-[11px] text-slate-400 font-mono">{p.sku || "Sin SKU"}</span>
                      </td>
                      <td className="py-3.5 px-5 text-center font-semibold text-slate-900 tabular-nums">{p.dbPhysical}</td>
                      <td className="py-3.5 px-5 text-center text-slate-500 font-medium tabular-nums">
                        {p.dbCalculatedReserved}
                      </td>
                      <td className={`py-3.5 px-5 text-center font-semibold tabular-nums ${p.dbAvailable < 0 ? "text-rose-600" : "text-slate-700"}`}>
                        {p.dbAvailable}
                      </td>
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
              No hay productos en la planilla que falten en la base de datos.
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
                ? "¡Excelente! Todo el stock emparejado está sincronizado y consistente."
                : "No se encontraron productos emparejados."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50/80 text-[11px] font-semibold text-slate-400 uppercase border-b border-slate-100">
                    <th className="py-3 px-5">Producto / SKU</th>
                    <th className="py-3 px-5 text-center">Stock Físico (Planilla vs DB)</th>
                    <th className="py-3 px-5 text-center">Reservado (Planilla vs DB Pedidos)</th>
                    <th className="py-3 px-5 text-center">Disponible (Planilla vs DB)</th>
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
                          {c.name && c.name !== c.sku && (
                            <span className="block text-[11px] text-slate-400">{c.name}</span>
                          )}
                        </td>
                        
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

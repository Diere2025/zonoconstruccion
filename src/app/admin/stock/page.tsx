"use client";

import React, { useState, useEffect } from "react";
import { 
  Package, 
  RefreshCw, 
  AlertTriangle, 
  CheckCircle2, 
  Search, 
  Activity, 
  SlidersHorizontal,
  Info,
  Layers,
  ArrowRightLeft
} from "lucide-react";

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

  // Load data on mount
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
    if (!confirm("¿Está seguro de que desea sincronizar el stock del sistema con la planilla maestra? Esto sobrescribirá los stock físicos con la planilla y corregirá las reservas basadas en los pedidos activos del sistema.")) {
      return;
    }

    setSyncing(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const res = await fetch("/api/admin/sync-stock", { method: "POST" });
      if (!res.ok) {
        throw new Error("Error en la sincronización del stock.");
      }
      const data = await res.json();
      setSuccessMessage(`Sincronización masiva finalizada con éxito. Se actualizaron los niveles de ${data.updatedCount} productos.`);
      await fetchData(); // Reload to show synchronized levels
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
    <div className="space-y-6">
        
        {/* Banner/Header */}
        <div className="relative bg-gradient-to-r from-brand-600 to-indigo-600 p-8 rounded-3xl text-white shadow-xl shadow-brand-600/10 overflow-hidden">
          <div className="absolute right-0 bottom-0 opacity-10 translate-y-1/4 translate-x-1/4 pointer-events-none">
            <Package className="w-96 h-96" />
          </div>
          <div className="relative z-10 space-y-2 max-w-3xl">
            <span className="bg-brand-500/30 backdrop-blur-md border border-brand-400/20 text-brand-100 text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full inline-block">
              Inventario & Logística
            </span>
            <h1 className="text-3xl font-black tracking-tight leading-none">
              Control de Stock y Reservas
            </h1>
            <p className="text-white/80 font-medium text-sm">
              Sincroniza el stock físico de tus productos con la planilla maestra y corrige desviaciones en el stock reservado de tus pedidos activos en tiempo real.
            </p>
          </div>
        </div>

        {/* Success / Error Messages */}
        {error && (
          <div className="bg-rose-50 border border-rose-100 p-5 rounded-2xl flex items-start gap-3.5 text-rose-800 text-sm font-semibold shadow-sm animate-fadeIn">
            <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="block font-black text-rose-900">Ocurrió un error:</span>
              <p className="text-rose-700">{error}</p>
            </div>
          </div>
        )}

        {successMessage && (
          <div className="bg-emerald-50 border border-emerald-100 p-5 rounded-2xl flex items-start gap-3.5 text-emerald-800 text-sm font-semibold shadow-sm animate-fadeIn">
            <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="block font-black text-emerald-900">Operación exitosa:</span>
              <p className="text-emerald-700">{successMessage}</p>
            </div>
          </div>
        )}

        {/* Dashboard Metric Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center text-slate-500 shrink-0">
              <Layers className="w-6 h-6" />
            </div>
            <div>
              <span className="block text-xs font-bold text-slate-400 uppercase tracking-wider">Productos Activos</span>
              <span className="text-2xl font-black text-slate-800">{comparisonList.length + onlyInDb.length}</span>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center text-blue-500 shrink-0">
              <Activity className="w-6 h-6" />
            </div>
            <div>
              <span className="block text-xs font-bold text-slate-400 uppercase tracking-wider">Emparejados Planilla</span>
              <span className="text-2xl font-black text-blue-800">{comparisonList.length}</span>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${physicalMismatches > 0 ? "bg-amber-50 text-amber-500" : "bg-emerald-50 text-emerald-500"}`}>
              <ArrowRightLeft className="w-6 h-6" />
            </div>
            <div>
              <span className="block text-xs font-bold text-slate-400 uppercase tracking-wider">Desfases Físicos</span>
              <span className={`text-2xl font-black ${physicalMismatches > 0 ? "text-amber-600" : "text-emerald-600"}`}>{physicalMismatches}</span>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${reservedMismatches > 0 ? "bg-rose-50 text-rose-500" : "bg-emerald-50 text-emerald-500"}`}>
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <span className="block text-xs font-bold text-slate-400 uppercase tracking-wider">Desfases Reservas</span>
              <span className={`text-2xl font-black ${reservedMismatches > 0 ? "text-rose-600" : "text-emerald-600"}`}>{reservedMismatches}</span>
            </div>
          </div>
        </div>

        {/* Info & Warning Cards Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* How it works Card */}
          <div className="bg-blue-50/50 border border-blue-100 p-5 rounded-2xl flex gap-3 text-blue-800 text-xs font-medium">
            <Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="block font-black text-blue-900 uppercase tracking-wider">¿Cómo funciona la sincronización y cálculo de stock?</span>
              <ul className="list-disc pl-4 space-y-1 text-blue-700">
                <li>El <b>Stock Actual (Físico)</b> se actualiza tomando el valor ingresado en la planilla.</li>
                <li>El <b>Stock Reservado</b> se calcula automáticamente sumando el stock comprometido en los pedidos en estados activos (<i>Pendiente, Confirmado</i>), excluyendo <i>Entregando</i> ya que su mercadería ya fue restada del stock físico de la planilla.</li>
                <li>El <b>Stock Disponible</b> se actualiza como la diferencia: <code>Disponible = Físico - Reservado</code>.</li>
                <li>En la comparativa inferior se resaltan en amarillo los productos donde el stock reservado de la planilla difiere del calculado en base a los pedidos reales del sistema. Esto te ayuda a auditar inconsistencias.</li>
              </ul>
            </div>
          </div>

          {/* Potential Discrepancy Reasons Card */}
          <div className="bg-amber-50/50 border border-amber-100 p-5 rounded-2xl flex gap-3 text-amber-800 text-xs font-medium">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="block font-black text-amber-900 uppercase tracking-wider">¿Por qué pueden existir diferencias de stock?</span>
              <p className="text-amber-700 font-semibold mb-1">Si detectas discrepancias entre la planilla y el sistema, puede deberse a:</p>
              <ul className="list-decimal pl-4 space-y-1 text-amber-700">
                <li><b>Pedidos de Central no importados:</b> Los pedidos nuevos cargados en Central aún no se han sincronizado a la base de datos del sistema.</li>
                <li><b>Pedidos de Logística desactualizados:</b> Falta actualizar o cargar las planillas más recientes de logística.</li>
                <li><b>Pedidos de vendedores pendientes:</b> Hay pedidos de vendedores que afectan el stock reservado pero aún no fueron transferidos a Central.</li>
                <li><b>Pedidos en proceso de entrega:</b> Pedidos en estado <i>"Entregando"</i> donde la mercadería ya salió física pero no se ha asentado aún en la planilla de stock.</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Filters and Actions Bar */}
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            <button
              onClick={() => setFilterType("discrepancies")}
              className={`px-4 py-2 text-xs font-black rounded-xl border transition-all cursor-pointer ${
                filterType === "discrepancies"
                  ? "bg-brand-600 text-white border-brand-600 shadow-lg shadow-brand-600/10"
                  : "bg-slate-50 text-slate-600 border-slate-100 hover:bg-slate-100"
              }`}
            >
              Discrepancias ({totalDiscrepancies})
            </button>
            <button
              onClick={() => setFilterType("all")}
              className={`px-4 py-2 text-xs font-black rounded-xl border transition-all cursor-pointer ${
                filterType === "all"
                  ? "bg-brand-600 text-white border-brand-600 shadow-lg shadow-brand-600/10"
                  : "bg-slate-50 text-slate-600 border-slate-100 hover:bg-slate-100"
              }`}
            >
              Todos los emparejados ({comparisonList.length})
            </button>
            <button
              onClick={() => setFilterType("onlyInDb")}
              className={`px-4 py-2 text-xs font-black rounded-xl border transition-all cursor-pointer ${
                filterType === "onlyInDb"
                  ? "bg-brand-600 text-white border-brand-600 shadow-lg shadow-brand-600/10"
                  : "bg-slate-50 text-slate-600 border-slate-100 hover:bg-slate-100"
              }`}
            >
              Solo en DB ({onlyInDb.length})
            </button>
            <button
              onClick={() => setFilterType("unmatched")}
              className={`px-4 py-2 text-xs font-black rounded-xl border transition-all cursor-pointer ${
                filterType === "unmatched"
                  ? "bg-brand-600 text-white border-brand-600 shadow-lg shadow-brand-600/10"
                  : "bg-slate-50 text-slate-600 border-slate-100 hover:bg-slate-100"
              }`}
            >
              Solo en Planilla ({unmatchedSheetProducts.length})
            </button>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto">
            {/* Search Input */}
            <div className="relative w-full md:w-64">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por nombre o SKU..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 text-xs font-semibold bg-slate-50 border border-slate-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
              />
            </div>

            {/* Refresh Button */}
            <button
              onClick={fetchData}
              disabled={loading || syncing}
              className="p-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-100 text-slate-600 rounded-xl transition-colors cursor-pointer"
              title="Actualizar datos"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>

            {/* Sync Button */}
            <button
              onClick={handleSync}
              disabled={loading || syncing}
              className="px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-black text-xs rounded-xl shadow-lg shadow-brand-600/10 flex items-center gap-2 cursor-pointer shrink-0 disabled:opacity-50"
            >
              {syncing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Sincronizando...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  Sincronizar Stock
                </>
              )}
            </button>
          </div>
        </div>

        {/* Data View */}
        {loading ? (
          <div className="bg-white p-20 rounded-3xl border border-slate-100 shadow-sm flex flex-col items-center justify-center gap-4">
            <RefreshCw className="w-10 h-10 text-brand-600 animate-spin" />
            <span className="text-xs font-black text-slate-500 uppercase tracking-widest">
              Analizando planilla y stock de base de datos...
            </span>
          </div>
        ) : filterType === "onlyInDb" ? (
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
            {filteredOnlyInDb.length === 0 ? (
              <div className="p-12 text-center text-xs font-bold text-slate-400">
                No hay productos en la base de datos que no estén en la planilla.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-wider border-b border-slate-100">
                      <th className="py-4 px-6">Producto / SKU</th>
                      <th className="py-4 px-6 text-center">DB Físico</th>
                      <th className="py-4 px-6 text-center">DB Reservado</th>
                      <th className="py-4 px-6 text-center">DB Disponible</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 text-xs font-bold text-slate-700">
                    {filteredOnlyInDb.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-4 px-6">
                          <span className="block text-slate-800 font-extrabold">{p.name}</span>
                          <span className="block text-[10px] text-slate-400 uppercase font-bold">{p.sku || "Sin SKU"}</span>
                        </td>
                        <td className="py-4 px-6 text-center font-extrabold">{p.dbPhysical}</td>
                        <td className="py-4 px-6 text-center text-slate-500 font-extrabold">
                          {p.dbCalculatedReserved}
                        </td>
                        <td className={`py-4 px-6 text-center font-extrabold ${p.dbAvailable < 0 ? "text-rose-600" : "text-slate-700"}`}>
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
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
            {filteredUnmatched.length === 0 ? (
              <div className="p-12 text-center text-xs font-bold text-slate-400">
                No hay productos en la planilla que falten en la base de datos.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-wider border-b border-slate-100">
                      <th className="py-4 px-6">Nombre de Producto en Planilla</th>
                      <th className="py-4 px-6 text-center">Planilla Físico</th>
                      <th className="py-4 px-6 text-center">Planilla Reservado</th>
                      <th className="py-4 px-6 text-center">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 text-xs font-bold text-slate-700">
                    {filteredUnmatched.map((p, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-4 px-6 font-extrabold text-slate-800">{p.name}</td>
                        <td className="py-4 px-6 text-center font-extrabold">{p.sheetPhysical}</td>
                        <td className="py-4 px-6 text-center text-slate-500 font-extrabold">{p.sheetReserved}</td>
                        <td className="py-4 px-6 text-center">
                          <span className="bg-amber-50 border border-amber-100 text-amber-600 text-[10px] font-black uppercase px-2.5 py-1 rounded-lg">
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
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
            {filteredComparisonList.length === 0 ? (
              <div className="p-12 text-center text-xs font-bold text-slate-400">
                {filterType === "discrepancies" 
                  ? "¡Felicidades! Todo el stock emparejado está sincronizado y consistente."
                  : "No se encontraron productos emparejados."}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-wider border-b border-slate-100">
                      <th className="py-4 px-6">Producto / SKU</th>
                      <th className="py-4 px-6 text-center">Stock Físico (Planilla vs DB)</th>
                      <th className="py-4 px-6 text-center">Reservado (Planilla vs DB Pedidos)</th>
                      <th className="py-4 px-6 text-center">Disponible (Planilla vs DB)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 text-xs font-bold text-slate-700">
                    {filteredComparisonList.map((c) => {
                      const physicalDiff = c.sheetPhysical !== c.dbPhysical;
                      const reservedDiff = c.sheetReserved !== c.dbCalculatedReserved;
                      
                      return (
                        <tr key={c.productId} className="hover:bg-slate-50/50 transition-colors">
                          <td className="py-4 px-6">
                            <span className="block text-slate-800 font-extrabold">{c.name}</span>
                            <span className="block text-[10px] text-slate-400 uppercase font-bold">{c.sku || "Sin SKU"}</span>
                          </td>
                          
                          {/* Stock Físico */}
                          <td className="py-4 px-6 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <span className="font-extrabold text-slate-800">{c.sheetPhysical}</span>
                              <span className="text-slate-300 font-normal">|</span>
                              <span className={`font-semibold ${physicalDiff ? "text-amber-600 font-black" : "text-slate-400"}`}>
                                {c.dbPhysical}
                              </span>
                              {physicalDiff && (
                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-black ${c.sheetPhysical > c.dbPhysical ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"}`}>
                                  {c.sheetPhysical > c.dbPhysical ? `+${c.sheetPhysical - c.dbPhysical}` : `${c.sheetPhysical - c.dbPhysical}`}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Stock Reservado */}
                          <td className={`py-4 px-6 text-center ${reservedDiff ? "bg-amber-50/30" : ""}`}>
                            <div className="flex flex-col items-center justify-center">
                              <div className="flex items-center justify-center gap-2">
                                <span className="font-semibold text-slate-400" title="Valor en planilla">
                                  Pl: {c.sheetReserved}
                                </span>
                                <span className="text-slate-300 font-normal">|</span>
                                <span className={`font-extrabold ${reservedDiff ? "text-amber-700 font-black" : "text-slate-800"}`} title="Cálculo real de pedidos activos">
                                  Real: {c.dbCalculatedReserved}
                                </span>
                              </div>
                              {reservedDiff && (
                                <span className="text-[9px] font-bold text-amber-600 mt-0.5 flex items-center gap-0.5">
                                  <AlertTriangle className="w-3 h-3 shrink-0" />
                                  Desfasado por {Math.abs(c.sheetReserved - c.dbCalculatedReserved)}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Stock Disponible */}
                          <td className="py-4 px-6 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <span className="font-extrabold text-slate-800">{c.sheetAvailable}</span>
                              <span className="text-slate-300 font-normal">|</span>
                              <span className={`font-semibold ${c.dbAvailable < 0 ? "text-rose-600" : "text-slate-400"}`}>
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

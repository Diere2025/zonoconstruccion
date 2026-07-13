"use client";

import React, { useState, useEffect } from "react";
import { 
  Truck, 
  Clock, 
  AlertTriangle, 
  Coins, 
  RefreshCw, 
  Search, 
  Calendar, 
  ChevronDown, 
  ChevronUp, 
  Loader2, 
  CheckCircle2, 
  AlertCircle,
  FileText,
  Activity
} from "lucide-react";

export default function LogisticsAuditPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'stats' | 'postponed' | 'discrepancies'>('stats');
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  const [syncing, setSyncing] = useState(false);
  const [syncSuccess, setSyncSuccess] = useState<string | null>(null);

  const handleSyncLogistics = async () => {
    if (!window.confirm("¿Estás seguro de que deseas sincronizar y actualizar la base de datos con la planilla de logística? Esto sobrescribirá los productos, precios y métodos de pago de los pedidos entregados para que coincidan exactamente con lo entregado físicamente en calle.")) {
      return;
    }
    setSyncing(true);
    setSyncSuccess(null);
    try {
      const res = await fetch("/api/admin/audit-deliveries", { method: 'POST' });
      if (!res.ok) {
        throw new Error("Ocurrió un error al ejecutar la sincronización.");
      }
      const json = await res.json();
      setSyncSuccess(json.message);
      await fetchAuditData();
    } catch (err: any) {
      alert("Error al sincronizar: " + err.message);
    } finally {
      setSyncing(false);
    }
  };

  const fetchAuditData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/audit-deliveries");
      if (!res.ok) {
        throw new Error("No se pudieron cargar los datos de auditoría.");
      }
      const json = await res.json();
      setData(json);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Error al conectar con la API de auditoría.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAuditData();
  }, []);

  const toggleExpand = (code: string) => {
    setExpandedOrders(prev => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
        <Loader2 className="w-10 h-10 text-brand-600 animate-spin" />
        <span className="text-sm font-bold text-slate-500 uppercase tracking-wider animate-pulse">Procesando planilla de logística y base de datos...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="bg-rose-50 border border-rose-100 p-5 rounded-2xl flex flex-col items-center gap-3 text-center">
          <AlertCircle className="w-10 h-10 text-rose-500" />
          <h2 className="text-base font-black text-rose-950 uppercase tracking-wider">Error de Carga</h2>
          <p className="text-xs font-semibold text-rose-800 leading-relaxed max-w-md">
            {error || "Ocurrió un error inesperado al procesar la planilla."}
          </p>
          <button 
            onClick={fetchAuditData}
            className="mt-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-sm transition-all"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Reintentar Carga
          </button>
        </div>
      </div>
    );
  }

  const { stats, postponed, discrepancies } = data;

  // Search logic
  const filteredPostponed = postponed.filter((p: any) => 
    p.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.client.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredDiscrepancies = discrepancies.filter((d: any) => 
    d.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
    d.client.toLowerCase().includes(searchQuery.toLowerCase()) ||
    d.errors.some((err: string) => err.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const totalAlerts = stats.itemMismatches + stats.paymentMismatches + stats.totalMismatches + stats.statusMismatches;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-black text-slate-900 uppercase tracking-wide flex items-center gap-2">
            <Truck className="w-6 h-6 text-brand-600" /> Auditoría de Entregas y Postergaciones
          </h1>
          <p className="text-xs text-slate-500 font-semibold mt-0.5">
            Panel de control cruzado en tiempo real: Planilla de Logística vs Base de Datos ERP
          </p>
        </div>
        <button 
          onClick={fetchAuditData}
          className="self-start md:self-auto px-3.5 py-1.5 bg-slate-950 hover:bg-slate-900 text-white font-black rounded-lg text-[10px] uppercase tracking-wider shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Sincronizar Datos
        </button>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-100 flex gap-4 overflow-x-auto scrollbar-none">
        <button
          onClick={() => { setActiveTab('stats'); setSearchQuery(""); }}
          className={`pb-2.5 text-xs font-black uppercase tracking-wider border-b-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'stats' 
              ? 'border-brand-600 text-brand-700' 
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          Métricas y Demoras
        </button>
        <button
          onClick={() => { setActiveTab('postponed'); setSearchQuery(""); }}
          className={`pb-2.5 text-xs font-black uppercase tracking-wider border-b-2 transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
            activeTab === 'postponed' 
              ? 'border-brand-600 text-brand-700' 
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          Pedidos con Trabas ({postponed.length})
        </button>
        <button
          onClick={() => { setActiveTab('discrepancies'); setSearchQuery(""); }}
          className={`pb-2.5 text-xs font-black uppercase tracking-wider border-b-2 transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
            activeTab === 'discrepancies' 
              ? 'border-brand-600 text-brand-700' 
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          Auditoría de Cambios ({discrepancies.length})
        </button>
      </div>

      {/* Tab 1: stats */}
      {activeTab === 'stats' && (
        <div className="space-y-6">
          {/* Metrics Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
              <div className="p-3 bg-brand-50 rounded-xl text-brand-600">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider">Entregas Analizadas</span>
                <span className="text-xl font-black text-slate-900">{stats.checkedCount}</span>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
              <div className="p-3 bg-amber-50 rounded-xl text-amber-600">
                <Clock className="w-6 h-6" />
              </div>
              <div>
                <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider">Demora Promedio</span>
                <span className="text-xl font-black text-slate-900">{stats.avgDelay} días</span>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
              <div className="p-3 bg-emerald-50 rounded-xl text-emerald-600">
                <Calendar className="w-6 h-6" />
              </div>
              <div>
                <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider">Entrega en Fecha</span>
                <span className="text-xl font-black text-slate-900">{stats.pctOnTime}%</span>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
              <div className={`p-3 rounded-xl ${totalAlerts > 0 ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-600"}`}>
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider">Alertas de Cambio</span>
                <span className="text-xl font-black text-slate-900">{totalAlerts}</span>
              </div>
            </div>
          </div>

          {/* Breakdown Alert Categories */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-4">
              <h2 className="text-xs font-black uppercase text-slate-900 tracking-wider flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-brand-600" /> Clasificación de Alertas en DB
              </h2>
              <div className="space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-semibold text-slate-500">Monto del Pedido cambiado en la entrega</span>
                  <span className="px-2 py-0.5 bg-rose-50 text-rose-600 font-black rounded-md">{stats.totalMismatches}</span>
                </div>
                <div className="flex justify-between items-center text-xs border-t border-slate-50 pt-3">
                  <span className="font-semibold text-slate-500">Método de Pago cambiado por Logística</span>
                  <span className="px-2 py-0.5 bg-rose-50 text-rose-600 font-black rounded-md">{stats.paymentMismatches}</span>
                </div>
                <div className="flex justify-between items-center text-xs border-t border-slate-50 pt-3">
                  <span className="font-semibold text-slate-500">Diferencia de Productos (Color, SKU o Cantidad)</span>
                  <span className="px-2 py-0.5 bg-rose-50 text-rose-600 font-black rounded-md">{stats.itemMismatches}</span>
                </div>
                <div className="flex justify-between items-center text-xs border-t border-slate-50 pt-3">
                  <span className="font-semibold text-slate-500">Estado de entrega no sincronizado en DB</span>
                  <span className="px-2 py-0.5 bg-rose-50 text-rose-600 font-black rounded-md">{stats.statusMismatches}</span>
                </div>
              </div>
            </div>

            <div className="bg-blue-50/50 border border-blue-100 p-6 rounded-2xl text-blue-900 space-y-2">
              <h3 className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-blue-600" /> ¿Cómo auditar y resolver cambios?
              </h3>
              <p className="text-xs font-semibold text-blue-700 leading-relaxed">
                Durante el ruteo y entrega real en la calle, es muy común que ocurran cambios (ej. el cliente prefiere pagar con Mercado Pago en vez de efectivo, decide cambiar el color gris del tanque por uno beige, o reprograma la fecha porque no cuenta con fondos).
              </p>
              <p className="text-xs font-semibold text-blue-700 leading-relaxed">
                Navega a la pestaña de **Auditoría de Cambios** para ver los pedidos entregados donde los productos o cobros registrados difieren del pedido original en el ERP. Esto te ayuda a corregir de inmediato los productos y formas de pago para que la facturación y el stock queden perfectamente alineados.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: postponed */}
      {activeTab === 'postponed' && (
        <div className="space-y-4">
          {/* Search */}
          <div className="bg-white p-3 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-2">
            <Search className="w-4 h-4 text-slate-400 shrink-0" />
            <input 
              type="text" 
              placeholder="Buscar por código de pedido o cliente..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="text-xs font-semibold w-full outline-none text-slate-700"
            />
          </div>

          {/* List */}
          <div className="space-y-3">
            {filteredPostponed.length === 0 ? (
              <div className="bg-white p-6 text-center text-xs font-semibold text-slate-400 rounded-2xl border border-slate-100 shadow-sm">
                No se encontraron pedidos postergados con esos criterios.
              </div>
            ) : (
              filteredPostponed.map((o: any) => {
                const isExpanded = expandedOrders.has(o.code);
                return (
                  <div key={o.code} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden transition-all">
                    {/* Header */}
                    <div 
                      onClick={() => toggleExpand(o.code)}
                      className="p-4 flex items-center justify-between cursor-pointer hover:bg-slate-50/50 transition-colors select-none"
                    >
                      <div className="flex items-center gap-3">
                        <span className="px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-black rounded-lg uppercase tracking-wider">
                          Postergado {o.count} Veces
                        </span>
                        <div>
                          <span className="block text-xs font-black text-slate-900 flex items-center flex-wrap gap-2">
                            {o.code} — {o.client}
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                              o.dbStatus === 'Cancelado'
                                ? 'bg-rose-50 text-rose-700 border border-rose-100'
                                : o.dbStatus === 'Entregado'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                                : o.dbStatus === 'Entregando'
                                ? 'bg-amber-50 text-amber-700 border border-amber-100'
                                : 'bg-slate-50 text-slate-600 border border-slate-200'
                            }`}>
                              ERP: {o.dbStatus}
                            </span>
                          </span>
                        </div>
                      </div>
                      <div>
                        {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                      </div>
                    </div>

                    {/* Timeline Expansion */}
                    {isExpanded && (
                      <div className="px-4 pb-4 pt-2 border-t border-slate-50 bg-slate-50/20">
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs">
                            <thead>
                              <tr className="text-[10px] text-slate-400 font-bold uppercase tracking-wider border-b border-slate-100">
                                <th className="pb-2">Intento</th>
                                <th className="pb-2">Fecha</th>
                                <th className="pb-2">Estado</th>
                                <th className="pb-2">Observación en calle / Motivo</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {o.attempts.map((att: any, idx: number) => (
                                <tr key={idx} className="hover:bg-slate-50/30">
                                  <td className="py-2.5 font-bold text-slate-500">#{idx + 1}</td>
                                  <td className="py-2.5 font-bold text-slate-700">{att.dateStr}</td>
                                  <td className="py-2.5">
                                    <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ${
                                      att.status.toLowerCase().includes("entregado") 
                                        ? "text-emerald-700 bg-emerald-50 border border-emerald-100" 
                                        : "text-rose-700 bg-rose-50 border border-rose-100"
                                    }`}>
                                      {att.status}
                                    </span>
                                  </td>
                                  <td className="py-2.5 font-semibold text-slate-600 max-w-md break-words">
                                    {att.motive || <span className="text-slate-300 italic">Sin observación</span>}
                                  </td>
                                </tr>
                              ))}
                              {o.dbStatus === 'Cancelado' && (
                                <tr className="bg-rose-50/20 text-rose-950 font-bold">
                                  <td className="py-2.5 text-rose-500">Final</td>
                                  <td className="py-2.5">-</td>
                                  <td className="py-2.5">
                                    <span className="px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider text-rose-700 bg-rose-50 border border-rose-100 animate-pulse">
                                      Cancelado
                                    </span>
                                  </td>
                                  <td className="py-2.5 text-rose-700 font-black max-w-md break-words">
                                    Pedido cancelado finalmente en el ERP / Central.
                                  </td>
                                </tr>
                              )}
                              {o.dbStatus === 'Entregado' && !o.attempts.some((a: any) => a.status.toLowerCase().includes("entregado")) && (
                                <tr className="bg-emerald-50/20 text-emerald-950 font-bold">
                                  <td className="py-2.5 text-emerald-500">Final</td>
                                  <td className="py-2.5">-</td>
                                  <td className="py-2.5">
                                    <span className="px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-100">
                                      Entregado
                                    </span>
                                  </td>
                                  <td className="py-2.5 text-emerald-700 font-black max-w-md break-words">
                                    Pedido registrado como entregado finalmente en el ERP.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Tab 3: discrepancies */}
      {activeTab === 'discrepancies' && (
        <div className="space-y-4">
          {/* Action Banner for Sync */}
          {discrepancies.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs font-black text-amber-900 uppercase tracking-wider">Sincronización de Entregas Pendiente</h4>
                  <p className="text-[11px] text-amber-700 font-semibold leading-relaxed">
                    Se encontraron **{discrepancies.length}** pedidos con discrepancias o pendientes de marcar como entregados en la base de datos.
                  </p>
                </div>
              </div>
              <button
                onClick={handleSyncLogistics}
                disabled={syncing}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-300 text-white font-black rounded-xl text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-sm shrink-0 justify-center cursor-pointer"
              >
                {syncing ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Procesando...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-3.5 h-3.5" /> Sincronizar con Logística
                  </>
                )}
              </button>
            </div>
          )}

          {syncSuccess && (
            <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-2xl flex gap-3 text-emerald-800">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <span className="text-xs font-semibold leading-relaxed">{syncSuccess}</span>
            </div>
          )}

          {/* Search */}
          <div className="bg-white p-3 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-2">
            <Search className="w-4 h-4 text-slate-400 shrink-0" />
            <input 
              type="text" 
              placeholder="Buscar por código de pedido, cliente o tipo de discrepancia..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="text-xs font-semibold w-full outline-none text-slate-700"
            />
          </div>

          {/* List */}
          <div className="space-y-3">
            {filteredDiscrepancies.length === 0 ? (
              <div className="bg-white p-6 text-center text-xs font-semibold text-slate-400 rounded-2xl border border-slate-100 shadow-sm">
                No se encontraron pedidos con alertas de discrepancia.
              </div>
            ) : (
              filteredDiscrepancies.map((d: any) => {
                const isExpanded = expandedOrders.has(d.code);
                
                // Deduce labels/badges based on errors
                const hasStatus = d.errors.some((e: string) => e.includes("Estado"));
                const hasMonto = d.errors.some((e: string) => e.includes("monto"));
                const hasPago = d.errors.some((e: string) => e.includes("pago"));
                const hasItem = d.errors.some((e: string) => e.includes("Producto") || e.includes("cantidad") || e.includes("precio"));

                return (
                  <div key={d.code} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden transition-all">
                    {/* Header */}
                    <div 
                      onClick={() => toggleExpand(d.code)}
                      className="p-4 flex items-center justify-between cursor-pointer hover:bg-slate-50/50 transition-colors select-none"
                    >
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="text-xs font-black text-slate-900">{d.code} — {d.client}</span>
                        <div className="flex flex-wrap gap-1">
                          {hasStatus && <span className="px-1.5 py-0.5 bg-indigo-50 border border-indigo-100 text-indigo-700 text-[8px] font-black rounded uppercase">Estado DB</span>}
                          {hasMonto && <span className="px-1.5 py-0.5 bg-rose-50 border border-rose-100 text-rose-700 text-[8px] font-black rounded uppercase">Monto</span>}
                          {hasPago && <span className="px-1.5 py-0.5 bg-amber-50 border border-amber-100 text-amber-700 text-[8px] font-black rounded uppercase">Medio Pago</span>}
                          {hasItem && <span className="px-1.5 py-0.5 bg-orange-50 border border-orange-100 text-orange-700 text-[8px] font-black rounded uppercase">Productos</span>}
                        </div>
                      </div>
                      <div>
                        {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                      </div>
                    </div>

                    {/* Discrepancies Details */}
                    {isExpanded && (
                      <div className="px-5 pb-5 pt-3 border-t border-slate-50 bg-slate-50/20 space-y-2">
                        <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider">Alertas encontradas:</span>
                        <ul className="list-disc pl-4 space-y-2 text-xs text-slate-700 font-semibold leading-relaxed">
                          {d.errors.map((err: string, idx: number) => (
                            <li key={idx} className="break-words">{err}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

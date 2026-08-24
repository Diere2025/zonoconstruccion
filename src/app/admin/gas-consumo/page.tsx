"use client";

import React, { useState, useEffect, useMemo } from "react";
import { 
  Flame, 
  Droplet, 
  DollarSign, 
  TrendingUp, 
  Calendar, 
  Clock, 
  RefreshCw, 
  Download, 
  ExternalLink, 
  Search, 
  X, 
  Loader2, 
  Sparkles, 
  Layers, 
  AlertTriangle, 
  CheckCircle2, 
  Sliders, 
  SlidersHorizontal, 
  PieChart, 
  BarChart3, 
  Calculator, 
  HelpCircle, 
  ArrowRight,
  Factory,
  Info
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { GasEvent, GasModelScore, MonthlyGasMetric, GasIntervalMeasurement } from "@/app/api/admin/gas-consumo-data/route";

export default function GasConsumoPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastSync, setLastSync] = useState<string>("");

  // Data states
  const [tankStatus, setTankStatus] = useState<any>(null);
  const [recent2Weeks, setRecent2Weeks] = useState<any>(null);
  const [summary2026, setSummary2026] = useState<any>(null);
  const [modelScores, setModelScores] = useState<GasModelScore[]>([]);
  const [intervals, setIntervals] = useState<GasIntervalMeasurement[]>([]);
  const [monthlyMetrics, setMonthlyMetrics] = useState<MonthlyGasMetric[]>([]);
  const [gasEvents, setGasEvents] = useState<GasEvent[]>([]);

  // Navigation tab
  const [activeTab, setActiveTab] = useState<"modelos" | "mes_a_mes" | "historial">("modelos");

  // Interactive Gas Price Simulator
  const [simulatedPrice, setSimulatedPrice] = useState<number>(1051.10);
  const [searchModel, setSearchModel] = useState<string>("");

  // Fetch data
  const fetchData = async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    try {
      const res = await fetch("/api/admin/gas-consumo-data");
      const json = await res.json();
      if (json.success) {
        setTankStatus(json.tankStatus);
        setRecent2Weeks(json.recent2Weeks);
        setSummary2026(json.summary2026);
        setModelScores(json.modelScores);
        setIntervals(json.intervals);
        setMonthlyMetrics(json.monthlyMetrics);
        setGasEvents(json.gasEvents);
        if (json.tankStatus?.latestPricePerLiter) {
          setSimulatedPrice(parseFloat(json.tankStatus.latestPricePerLiter.toFixed(2)));
        }
        setLastSync(new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      }
    } catch (err) {
      console.error("Error al cargar datos de consumo de gas:", err);
    } finally {
      setLoading(false);
      if (isManualRefresh) setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Filtered model scores
  const filteredModels = useMemo(() => {
    const q = searchModel.toLowerCase().trim();
    return modelScores.filter(m => 
      m.producto.toLowerCase().includes(q) || 
      m.tipo.toLowerCase().includes(q) || 
      m.litrosTanque.toLowerCase().includes(q)
    );
  }, [modelScores, searchModel]);

  // Export to CSV
  const handleExportCSV = () => {
    if (gasEvents.length === 0) return;
    const headers = [
      "Fecha",
      "Hora",
      "Tipo Evento",
      "% Nivel Antes",
      "Carga Litros",
      "% Nivel Despues",
      "Precio por Litro ($)",
      "Costo Total ($)",
      "N° Remito / Factura",
      "Observaciones"
    ];

    const rows = gasEvents.map(e => [
      `"${e.fechaFormatted}"`,
      `"${e.hora}"`,
      `"${e.tipo}"`,
      e.porcentajeAntes > 0 ? `${e.porcentajeAntes}%` : "",
      e.cargaLitros > 0 ? e.cargaLitros : "",
      e.porcentajeDespues > 0 ? `${e.porcentajeDespues}%` : "",
      e.precioLitro,
      e.costoTotal,
      `"${e.remitoFactura.replace(/"/g, '""')}"`,
      `"${e.observaciones.replace(/"/g, '""')}"`
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Cargas_Gas_GLP_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header Bar */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl border border-amber-100/80 shadow-xs">
            <Flame className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-slate-900 tracking-tight">
                Control de Consumo y Costos de Gas GLP
              </h1>
              <span className="text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 shadow-2xs">
                Zeppelin 4.000 L
              </span>
            </div>
            <p className="text-xs text-slate-400 font-semibold mt-0.5">
              Cálculo de eficiencia de quemadores, costo de gas por tanque rotomoldeado y balance de recargas.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {lastSync && (
            <span className="text-[10px] font-bold text-slate-400 hidden sm:inline-block">
              Última sincronización: {lastSync}
            </span>
          )}

          <Button
            onClick={() => fetchData(true)}
            disabled={loading || refreshing}
            className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-black transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            {refreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Sincronizar Planilla
          </Button>

          <Button
            onClick={handleExportCSV}
            className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" /> Exportar CSV
          </Button>

          <a
            href="https://docs.google.com/spreadsheets/d/1k112jRkUR6SqMtjHg0rWzFF3iyHNa-VBiVSs3GoEnko/"
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 bg-slate-50 hover:bg-slate-100 text-slate-500 hover:text-slate-800 rounded-xl border border-slate-200 transition-colors shadow-2xs"
            title="Abrir Planilla de Cargas de Gas en Google Sheets"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </div>

      {/* Top KPI Cards Grid */}
      {tankStatus && summary2026 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
          {/* Nivel Actual del Tanque */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Nivel de Tanque Zeppelin</span>
              <div className={`p-1.5 rounded-lg ${
                tankStatus.currentPercentage > 30 ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
              }`}>
                <Droplet className="w-4 h-4" />
              </div>
            </div>

            <div className="mt-3">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black text-slate-900 tracking-tight font-mono">
                  {tankStatus.currentPercentage}%
                </span>
                <span className="text-xs font-black text-slate-500 font-mono">
                  ({tankStatus.currentLiters.toLocaleString('es-AR')} L)
                </span>
              </div>

              {/* Progress Bar of Tank */}
              <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden mt-2">
                <div 
                  className={`h-full transition-all duration-500 rounded-full ${
                    tankStatus.currentPercentage > 30 ? 'bg-emerald-500' : 'bg-amber-500'
                  }`}
                  style={{ width: `${tankStatus.currentPercentage}%` }}
                />
              </div>

              <p className="text-[10px] text-slate-400 font-bold mt-1.5">
                Medición: {tankStatus.lastReadingDate} {tankStatus.lastReadingTime}
              </p>
            </div>
          </div>

          {/* Consumo Medio por Tanque (Últimas 2 Semanas) */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Consumo Últimas 2 Semanas</span>
              <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
                <Flame className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-black text-blue-700 tracking-tight font-mono">
                {recent2Weeks ? recent2Weeks.avgGasLitersPerTank : summary2026.avgGasLitersPerTank} <span className="text-xs font-semibold text-slate-400">L / tanque</span>
              </div>
              <p className="text-[10px] text-blue-600 font-bold mt-0.5">
                {recent2Weeks?.tanksRotomolded || 0} tanques medidos ({recent2Weeks?.daysMeasured || 14} días)
              </p>
            </div>
          </div>

          {/* Costo Medio por Tanque (Últimas 2 Semanas) */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Costo Gas Últimas 2 Semanas</span>
              <div className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-black text-emerald-700 tracking-tight font-mono">
                ${(recent2Weeks ? recent2Weeks.avgCostPerTank : summary2026.avgCostPerTank).toLocaleString('es-AR')} <span className="text-xs font-semibold text-slate-400">/ tanque</span>
              </div>
              <p className="text-[10px] text-emerald-600 font-bold mt-0.5">
                Gas GLP a ${tankStatus.latestPricePerLiter.toFixed(2)}/L
              </p>
            </div>
          </div>

          {/* Autonomía Estimada */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Autonomía Estimada</span>
              <div className="p-1.5 bg-purple-50 text-purple-600 rounded-lg">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-black text-purple-700 tracking-tight font-mono">
                ~{tankStatus.estimatedDaysRemaining} <span className="text-xs font-semibold text-slate-400">días</span>
              </div>
              <p className="text-[10px] text-purple-600 font-bold mt-0.5">
                Consumo diario: ~{tankStatus.estimatedDailyConsumptionLiters} L/día
              </p>
            </div>
          </div>

          {/* Inversión Acumulada 2026 */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Inversión Gas 2026</span>
              <div className="p-1.5 bg-amber-50 text-amber-600 rounded-lg">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-black text-slate-900 tracking-tight font-mono">
                ${(summary2026.totalGasCost / 1000000).toFixed(2)}M
              </div>
              <p className="text-[10px] text-amber-600 font-bold mt-0.5">
                {summary2026.totalGasLitersRefilled.toLocaleString('es-AR')} L recargados (Histórico: {summary2026.avgGasLitersPerTank} L/u)
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Navigation Tabs & Search */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-100 pb-3">
          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200/60 overflow-x-auto max-w-full">
            <button
              onClick={() => setActiveTab("modelos")}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === "modelos" ? "bg-white text-amber-800 shadow-xs" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <Calculator className="w-3.5 h-3.5 text-amber-600" /> 
              Costo de Gas por Modelo de Tanque ({modelScores.length})
            </button>

            <button
              onClick={() => setActiveTab("mes_a_mes")}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === "mes_a_mes" ? "bg-white text-blue-700 shadow-xs" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5 text-blue-600" /> 
              Consumo Mes a Mes & Mediciones ({monthlyMetrics.length}m)
            </button>

            <button
              onClick={() => setActiveTab("historial")}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === "historial" ? "bg-white text-purple-700 shadow-xs" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <Flame className="w-3.5 h-3.5 text-purple-600" /> 
              Historial de Cargas y Lecturas ({gasEvents.length})
            </button>
          </div>

          {activeTab === "modelos" && (
            <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
              <span className="text-[11px] font-black text-slate-600">Simular Precio GLP ($/L):</span>
              <input
                type="number"
                step="5"
                value={simulatedPrice}
                onChange={e => setSimulatedPrice(parseFloat(e.target.value) || 0)}
                className="w-24 px-2 py-0.5 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-900 outline-none"
              />
            </div>
          )}
        </div>

        {activeTab === "modelos" && (
          <div className="relative max-w-md">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar modelo de tanque (ej. 500L, 600L, Tricapa, Cono)..."
              value={searchModel}
              onChange={e => setSearchModel(e.target.value)}
              className="w-full pl-8 pr-7 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-amber-500/10 focus:border-amber-500"
            />
            {searchModel && (
              <button onClick={() => setSearchModel("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Main Tab Content */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-16 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 text-amber-600 animate-spin" />
          <span className="text-xs font-bold text-slate-500">Calculando consumo y costos de gas GLP...</span>
        </div>
      ) : activeTab === "modelos" ? (
        /* TAB 1: MODEL SCORES & UNIT COST MATRIX */
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="p-3.5 bg-slate-50/70 border-b border-slate-200/80 flex items-center justify-between">
              <div className="text-xs font-black text-slate-800 flex items-center gap-2">
                <Calculator className="w-4 h-4 text-amber-600" />
                Matriz de Consumo y Costo de Gas por Modelo de Tanque
              </div>
              <div className="text-[10px] font-extrabold text-slate-400 uppercase">
                Ponderación por tiempo de horneado y masa plástica
              </div>
            </div>

            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[9px] font-black uppercase text-slate-400 tracking-wider">
                    <th className="px-3.5 py-2.5 min-w-[200px]">Producto / Modelo</th>
                    <th className="px-3.5 py-2.5 w-28 text-center">Tipo Matriz</th>
                    <th className="px-3.5 py-2.5 w-24 text-center">Puntaje Relativo</th>
                    <th className="px-3.5 py-2.5 w-32 text-center">Consumo Gas Estimado</th>
                    <th className="px-3.5 py-2.5 w-36 text-center bg-amber-50/40 text-amber-900 border-x border-amber-100">
                      Costo Unitario Gas ($)
                    </th>
                    <th className="px-3.5 py-2.5 w-32 text-center">% sobre Tanque Base</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {filteredModels.map((item) => {
                    const unitCostSimulated = Math.round(item.litrosGasEstimado * simulatedPrice);
                    const pctOfBase = ((item.puntaje / 1.0) * 100).toFixed(0);

                    return (
                      <tr key={item.producto} className="hover:bg-amber-50/20 transition-colors">
                        <td className="px-3.5 py-2.5 font-bold text-slate-900">
                          {item.producto}
                        </td>
                        <td className="px-3.5 py-2.5 text-center font-semibold text-slate-500">
                          {item.tipo}
                        </td>
                        <td className="px-3.5 py-2.5 text-center font-mono font-black text-slate-800">
                          <span className="px-2 py-0.5 rounded-md bg-slate-100">
                            {item.puntaje.toFixed(2)} pts
                          </span>
                        </td>
                        <td className="px-3.5 py-2.5 text-center font-mono font-black text-blue-700">
                          {item.litrosGasEstimado} <span className="text-[10px] text-slate-400">L GLP</span>
                        </td>
                        <td className="px-3.5 py-2.5 text-center font-mono font-black text-sm bg-amber-50/20 border-x border-amber-100/60 text-amber-900">
                          ${unitCostSimulated.toLocaleString('es-AR')}
                        </td>
                        <td className="px-3.5 py-2.5 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-black ${
                            item.puntaje === 1.0 ? 'bg-blue-100 text-blue-800' : item.puntaje > 1.0 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                          }`}>
                            {pctOfBase}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : activeTab === "mes_a_mes" ? (
        /* TAB 2: MONTHLY CORRELATION & INTERVALS */
        <div className="space-y-6">
          {/* Monthly Comparison Table */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="p-3.5 bg-slate-50/70 border-b border-slate-200/80 flex items-center justify-between">
              <div className="text-xs font-black text-slate-800 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-blue-600" />
                Evolución de Consumo y Producción Mes a Mes (2026)
              </div>
              <div className="text-[10px] font-extrabold text-slate-400 uppercase">
                Cruce de Tanques Rotomoldeados vs Litros de Gas Recargados
              </div>
            </div>

            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[9px] font-black uppercase text-slate-400 tracking-wider">
                    <th className="px-3.5 py-2.5 min-w-[140px]">Mes / Año</th>
                    <th className="px-3.5 py-2.5 w-28 text-center">Tanques Producidos</th>
                    <th className="px-3.5 py-2.5 w-28 text-center">Gas Recargado (L)</th>
                    <th className="px-3.5 py-2.5 w-32 text-center">Inversión Gas ($)</th>
                    <th className="px-3.5 py-2.5 w-28 text-center">Precio $/Litro</th>
                    <th className="px-3.5 py-2.5 w-28 text-center bg-blue-50/30 text-blue-800">
                      Litros Gas / Tanque
                    </th>
                    <th className="px-3.5 py-2.5 w-32 text-center bg-emerald-50/30 text-emerald-900">
                      Costo Gas / Tanque
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {monthlyMetrics.map((m) => (
                    <tr key={m.monthKey} className="hover:bg-slate-50 transition-colors">
                      <td className="px-3.5 py-2.5 font-bold text-slate-900">
                        {m.monthName}
                      </td>
                      <td className="px-3.5 py-2.5 text-center font-mono font-black text-slate-800">
                        {m.tanquesFabricados > 0 ? `${m.tanquesFabricados} u.` : '-'}
                      </td>
                      <td className="px-3.5 py-2.5 text-center font-mono font-bold text-blue-700">
                        {m.gasRecargadoLitros > 0 ? `${m.gasRecargadoLitros.toLocaleString('es-AR')} L` : '-'}
                      </td>
                      <td className="px-3.5 py-2.5 text-center font-mono text-slate-700">
                        {m.inversionGas > 0 ? `$${m.inversionGas.toLocaleString('es-AR')}` : '-'}
                      </td>
                      <td className="px-3.5 py-2.5 text-center font-mono text-slate-500">
                        ${m.precioPromedioGas.toFixed(2)}
                      </td>
                      <td className="px-3.5 py-2.5 text-center font-mono font-black text-blue-800 bg-blue-50/10">
                        {m.litrosGasPorTanque > 0 ? `${m.litrosGasPorTanque} L/u` : '-'}
                      </td>
                      <td className="px-3.5 py-2.5 text-center font-mono font-black text-emerald-800 bg-emerald-50/10">
                        {m.costoGasPorTanque > 0 ? `$${m.costoGasPorTanque.toLocaleString('es-AR')}` : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Measured Intervals Table */}
          {intervals.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
              <div className="p-3.5 bg-slate-50/70 border-b border-slate-200/80 flex items-center justify-between">
                <div className="text-xs font-black text-slate-800 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-purple-600" />
                  Intervalos de Consumo Medidos entre Lecturas del Manómetro
                </div>
                <div className="text-[10px] font-extrabold text-slate-400 uppercase">
                  Cálculo continuo entre lecturas (% reloj inicial vs % reloj final)
                </div>
              </div>

              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[9px] font-black uppercase text-slate-400 tracking-wider">
                      <th className="px-3.5 py-2.5 min-w-[180px]">Intervalo Fechas</th>
                      <th className="px-3.5 py-2.5 w-20 text-center">Días</th>
                      <th className="px-3.5 py-2.5 w-28 text-center">% Inicio → % Fin</th>
                      <th className="px-3.5 py-2.5 w-28 text-center">Gas Consumido</th>
                      <th className="px-3.5 py-2.5 w-28 text-center">Tanques Fabricados</th>
                      <th className="px-3.5 py-2.5 w-28 text-center bg-purple-50/30 text-purple-800">
                        Consumo Real
                      </th>
                      <th className="px-3.5 py-2.5 w-28 text-center bg-emerald-50/30 text-emerald-900">
                        Costo Real / Tanque
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {intervals.map((inv) => (
                      <tr key={inv.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-3.5 py-2.5 font-bold text-slate-900">
                          {inv.fechaInicio} → {inv.fechaFin}
                        </td>
                        <td className="px-3.5 py-2.5 text-center font-semibold text-slate-500">
                          {inv.diasIntervalo} d.
                        </td>
                        <td className="px-3.5 py-2.5 text-center font-mono font-bold text-slate-800">
                          {inv.pctInicio}% → {inv.pctFin}%
                        </td>
                        <td className="px-3.5 py-2.5 text-center font-mono font-black text-amber-700">
                          {inv.gasConsumidoLitros} L
                        </td>
                        <td className="px-3.5 py-2.5 text-center font-mono font-black text-slate-800">
                          {inv.tanquesFabricados} u.
                        </td>
                        <td className="px-3.5 py-2.5 text-center font-mono font-black text-purple-800 bg-purple-50/10">
                          {inv.litrosGasPorTanque > 0 ? `${inv.litrosGasPorTanque} L/u` : '-'}
                        </td>
                        <td className="px-3.5 py-2.5 text-center font-mono font-black text-emerald-800 bg-emerald-50/10">
                          {inv.costoGasPorTanque > 0 ? `$${inv.costoGasPorTanque.toLocaleString('es-AR')}` : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* TAB 3: FULL EVENT HISTORY TABLE */
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="p-3.5 bg-slate-50/70 border-b border-slate-200/80 flex items-center justify-between">
            <div className="text-xs font-black text-slate-800 flex items-center gap-2">
              <Flame className="w-4 h-4 text-purple-600" />
              Historial Completo de Recargas y Lecturas ({gasEvents.length} eventos)
            </div>
            <div className="text-[10px] font-extrabold text-slate-400 uppercase">
              Registros cronológicos desde la planilla
            </div>
          </div>

          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[9px] font-black uppercase text-slate-400 tracking-wider">
                  <th className="px-3.5 py-2.5 w-24">Fecha</th>
                  <th className="px-3.5 py-2.5 w-20">Hora</th>
                  <th className="px-3.5 py-2.5 w-24 text-center">Tipo</th>
                  <th className="px-3.5 py-2.5 w-28 text-center">% Nivel Medidor</th>
                  <th className="px-3.5 py-2.5 w-28 text-center">Carga Recibida</th>
                  <th className="px-3.5 py-2.5 w-28 text-center">Precio / Litro</th>
                  <th className="px-3.5 py-2.5 w-32 text-center">Costo Total ($)</th>
                  <th className="px-3.5 py-2.5 w-32">Remito / Factura</th>
                  <th className="px-3.5 py-2.5 min-w-[180px]">Observaciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {gasEvents.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-3.5 py-2.5 font-bold text-slate-900">
                      {e.fechaFormatted}
                    </td>
                    <td className="px-3.5 py-2.5 text-slate-500 font-mono">
                      {e.hora || '-'}
                    </td>
                    <td className="px-3.5 py-2.5 text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black ${
                        e.tipo === 'Recarga' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
                      }`}>
                        {e.tipo}
                      </span>
                    </td>
                    <td className="px-3.5 py-2.5 text-center font-mono font-black text-slate-800">
                      {e.porcentajeAntes > 0 ? `${e.porcentajeAntes}%` : '-'}
                    </td>
                    <td className="px-3.5 py-2.5 text-center font-mono font-black text-blue-700">
                      {e.cargaLitros > 0 ? `${e.cargaLitros.toLocaleString('es-AR')} L` : '-'}
                    </td>
                    <td className="px-3.5 py-2.5 text-center font-mono text-slate-500">
                      {e.precioLitro > 0 ? `$${e.precioLitro.toFixed(2)}` : '-'}
                    </td>
                    <td className="px-3.5 py-2.5 text-center font-mono font-bold text-emerald-800">
                      {e.costoTotal > 0 ? `$${e.costoTotal.toLocaleString('es-AR')}` : '-'}
                    </td>
                    <td className="px-3.5 py-2.5 text-slate-600 font-mono">
                      {e.remitoFactura || '-'}
                    </td>
                    <td className="px-3.5 py-2.5 text-slate-500 italic">
                      {e.observaciones || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

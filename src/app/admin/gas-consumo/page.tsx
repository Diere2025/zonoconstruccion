"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { 
  Flame, 
  RefreshCw, 
  TrendingUp, 
  DollarSign, 
  AlertCircle, 
  Layers, 
  History, 
  CheckCircle2, 
  Zap, 
  Calendar, 
  Gauge, 
  ArrowRight, 
  Percent, 
  Users, 
  Wrench, 
  ShieldAlert, 
  Sparkles,
  Info,
  Sliders,
  Award,
  Factory,
  ArrowLeft
} from "lucide-react";
import { 
  GasEvent, 
  CombinedModelCost, 
  MonthlyCostBreakdown, 
  OperatorSummary, 
  ElectricityRecord, 
  GasIntervalMeasurement 
} from "@/app/api/admin/gas-consumo-data/route";

export default function CostosFabricacionPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<{
    currentMonthForecast: any;
    tankStatus: any;
    recent2Weeks: any;
    costBenchmarks: {
      baseLaborCostPerTank: number;
      baseElectricityCostPerTank: number;
      baseGasCostPerTank: number;
      baseTotalManufacturingCost: number;
      pureRotomoldingSalariesWithoutSAC: number;
      pureRotomoldingTanksWithoutSAC: number;
    };
    summary2026: any;
    operatorsData: OperatorSummary[];
    electricityRecords: ElectricityRecord[];
    modelScores: CombinedModelCost[];
    intervals: GasIntervalMeasurement[];
    monthlyBreakdown: MonthlyCostBreakdown[];
    gasEvents: GasEvent[];
  } | null>(null);

  const [activeTab, setActiveTab] = useState<"matriz" | "operarios" | "electricidad" | "gas" | "eventos">("matriz");
  const [selectedMonthFilter, setSelectedMonthFilter] = useState<string>("all");
  const [includeAguinaldo, setIncludeAguinaldo] = useState<boolean>(false);

  // Cost simulator overrides
  const [customGasPrice, setCustomGasPrice] = useState<number | null>(null);
  const [customLaborCost, setCustomLaborCost] = useState<number | null>(null);
  const [customElectricCost, setCustomElectricCost] = useState<number | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/admin/gas-consumo-data");
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Error al cargar datos");
      setData(json);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Error al conectar con la base de datos");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const gasPrice = customGasPrice ?? (data?.tankStatus?.latestPricePerLiter || 1051.10);
  const laborCost = customLaborCost ?? (data?.costBenchmarks?.baseLaborCostPerTank || 5500);
  const electricCost = customElectricCost ?? (data?.costBenchmarks?.baseElectricityCostPerTank || 815);
  const baseGasLiters = data?.summary2026?.avgGasLitersPerTank || 7.57;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8 space-y-6">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Back Link & Breadcrumb */}
        <div className="flex items-center gap-3">
          <Link
            href="/admin/produccion"
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Volver a Producción
          </Link>
          <span className="text-slate-600 text-xs">/</span>
          <span className="text-xs text-indigo-400 font-medium">Costos Operativos de Fabricación</span>
        </div>

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-indigo-900/50 p-6 rounded-2xl shadow-xl text-white">
          <div>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-xs px-2.5 py-0.5 rounded-full font-semibold flex items-center gap-1">
                <Factory className="w-3 h-3 text-indigo-400" /> Costos Industriales Consolidados
              </span>
              <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs px-2.5 py-0.5 rounded-full font-semibold flex items-center gap-1">
                <Zap className="w-3 h-3 text-emerald-400" /> Gas GLP + Sueldos MDO + Edenor
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
              Control de Costos de Fabricación y Servicios
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              Costeo real y estimativo por modelo cruzando consumo de Gas Propano, Sueldos de Operarios y Facturación Eléctrica a mes vencido.
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={fetchData}
              disabled={loading}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition shadow-lg shadow-indigo-600/30 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              Actualizar Datos
            </button>
          </div>
        </div>

        {/* Global Key Cost Metrics Cards */}
        {data && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            
            {/* Total Cost per Base Tank */}
            <div className="bg-slate-900 border border-indigo-500/30 rounded-2xl p-5 shadow-lg relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/10 rounded-full blur-2xl group-hover:bg-indigo-500/20 transition-all"></div>
              <div className="flex justify-between items-start">
                <span className="text-xs font-semibold uppercase tracking-wider text-indigo-300">Costo Total Fabricación</span>
                <span className="p-2 bg-indigo-500/20 text-indigo-400 rounded-xl"><DollarSign className="w-4 h-4" /></span>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-3xl font-black text-white">
                  ${Math.round(baseGasLiters * gasPrice + laborCost + electricCost).toLocaleString("es-AR")}
                </span>
                <span className="text-xs text-slate-400 font-medium">/ 500L TRIC</span>
              </div>
              <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                <span>Gas ${(baseGasLiters * gasPrice).toFixed(0)}</span>
                <span>•</span>
                <span>MDO ${laborCost.toLocaleString("es-AR")}</span>
                <span>•</span>
                <span>Luz ${electricCost.toLocaleString("es-AR")}</span>
              </div>
            </div>

            {/* Gas GLP Unit Cost */}
            <div className="bg-slate-900 border border-orange-500/30 rounded-2xl p-5 shadow-lg relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-24 h-24 bg-orange-500/10 rounded-full blur-2xl group-hover:bg-orange-500/20 transition-all"></div>
              <div className="flex justify-between items-start">
                <span className="text-xs font-semibold uppercase tracking-wider text-orange-300">Gas Propano GLP</span>
                <span className="p-2 bg-orange-500/20 text-orange-400 rounded-xl"><Flame className="w-4 h-4" /></span>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-3xl font-black text-white">
                  ${Math.round(baseGasLiters * gasPrice).toLocaleString("es-AR")}
                </span>
                <span className="text-xs text-orange-400 font-semibold">{baseGasLiters.toFixed(2)} L/u</span>
              </div>
              <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                <span>Precio: ${gasPrice.toFixed(2)}/L</span>
                <span>Zeppelin: {data.tankStatus.currentPercentage}%</span>
              </div>
            </div>

            {/* Labor Direct Cost */}
            <div className="bg-slate-900 border border-cyan-500/30 rounded-2xl p-5 shadow-lg relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-500/10 rounded-full blur-2xl group-hover:bg-cyan-500/20 transition-all"></div>
              <div className="flex justify-between items-start">
                <span className="text-xs font-semibold uppercase tracking-wider text-cyan-300">Mano de Obra Directa</span>
                <span className="p-2 bg-cyan-500/20 text-cyan-400 rounded-xl"><Users className="w-4 h-4" /></span>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-3xl font-black text-white">
                  ${laborCost.toLocaleString("es-AR")}
                </span>
                <span className="text-xs text-slate-400 font-medium">/ tanque base</span>
              </div>
              <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                <span>Rodrigo & Leonardo</span>
                <span className="text-cyan-400">Base Normal</span>
              </div>
            </div>

            {/* Electricity Cost */}
            <div className="bg-slate-900 border border-yellow-500/30 rounded-2xl p-5 shadow-lg relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-24 h-24 bg-yellow-500/10 rounded-full blur-2xl group-hover:bg-yellow-500/20 transition-all"></div>
              <div className="flex justify-between items-start">
                <span className="text-xs font-semibold uppercase tracking-wider text-yellow-300">Electricidad (Edenor)</span>
                <span className="p-2 bg-yellow-500/20 text-yellow-400 rounded-xl"><Zap className="w-4 h-4" /></span>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-3xl font-black text-white">
                  ${electricCost.toLocaleString("es-AR")}
                </span>
                <span className="text-xs text-slate-400 font-medium">/ tanque base</span>
              </div>
              <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                <span>A mes vencido</span>
                <span className="text-yellow-400 font-medium">Quilmes 4550</span>
              </div>
            </div>

          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-2">
          <button
            onClick={() => setActiveTab("matriz")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm transition ${
              activeTab === "matriz"
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30"
                : "bg-slate-900/60 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800"
            }`}
          >
            <Layers className="w-4 h-4" />
            Matriz de Costo por Modelo (22)
          </button>

          <button
            onClick={() => setActiveTab("operarios")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm transition ${
              activeTab === "operarios"
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30"
                : "bg-slate-900/60 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800"
            }`}
          >
            <Users className="w-4 h-4" />
            Rendimiento y Sueldos Operarios
          </button>

          <button
            onClick={() => setActiveTab("electricidad")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm transition ${
              activeTab === "electricidad"
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30"
                : "bg-slate-900/60 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800"
            }`}
          >
            <Zap className="w-4 h-4 text-yellow-400" />
            Electricidad Edenor (Mes Vencido)
          </button>

          <button
            onClick={() => setActiveTab("gas")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm transition ${
              activeTab === "gas"
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30"
                : "bg-slate-900/60 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800"
            }`}
          >
            <Flame className="w-4 h-4 text-orange-400" />
            Consumo Gas Mes a Mes & Zeppelin
          </button>

          <button
            onClick={() => setActiveTab("eventos")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm transition ${
              activeTab === "eventos"
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30"
                : "bg-slate-900/60 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800"
            }`}
          >
            <History className="w-4 h-4" />
            Registro de Cargas & Remitos
          </button>
        </div>

        {/* Tab 1: Matriz de Costo Total por Modelo */}
        {activeTab === "matriz" && data && (
          <div className="space-y-6">
            
            {/* Interactive Cost Simulator Drawer */}
            <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-2xl backdrop-blur-md">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Sliders className="w-5 h-5 text-indigo-400" />
                  <h3 className="text-base font-bold text-white">Simulador de Parámetros de Costo Unitario</h3>
                </div>
                <button 
                  onClick={() => { setCustomGasPrice(null); setCustomLaborCost(null); setCustomElectricCost(null); }}
                  className="text-xs text-indigo-400 hover:text-indigo-300 font-medium underline"
                >
                  Restablecer valores estándar
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-slate-950/60 border border-slate-800 p-3.5 rounded-xl">
                  <label className="text-xs font-semibold text-slate-400 block mb-1">Precio Gas Propano ($/Litro)</label>
                  <div className="flex items-center gap-2">
                    <input 
                      type="number"
                      value={customGasPrice ?? gasPrice}
                      onChange={(e) => setCustomGasPrice(parseFloat(e.target.value) || 0)}
                      className="bg-slate-900 border border-slate-700 text-white text-sm px-3 py-1.5 rounded-lg w-full font-bold focus:border-indigo-500 focus:outline-none"
                    />
                    <span className="text-xs text-slate-400">$/L</span>
                  </div>
                </div>

                <div className="bg-slate-950/60 border border-slate-800 p-3.5 rounded-xl">
                  <label className="text-xs font-semibold text-slate-400 block mb-1">Costo Mano de Obra Base ($/Tanque 500L)</label>
                  <div className="flex items-center gap-2">
                    <input 
                      type="number"
                      value={customLaborCost ?? laborCost}
                      onChange={(e) => setCustomLaborCost(parseFloat(e.target.value) || 0)}
                      className="bg-slate-900 border border-slate-700 text-white text-sm px-3 py-1.5 rounded-lg w-full font-bold focus:border-indigo-500 focus:outline-none"
                    />
                    <span className="text-xs text-slate-400">$/u</span>
                  </div>
                </div>

                <div className="bg-slate-950/60 border border-slate-800 p-3.5 rounded-xl">
                  <label className="text-xs font-semibold text-slate-400 block mb-1">Costo Electricidad Base ($/Tanque 500L)</label>
                  <div className="flex items-center gap-2">
                    <input 
                      type="number"
                      value={customElectricCost ?? electricCost}
                      onChange={(e) => setCustomElectricCost(parseFloat(e.target.value) || 0)}
                      className="bg-slate-900 border border-slate-700 text-white text-sm px-3 py-1.5 rounded-lg w-full font-bold focus:border-indigo-500 focus:outline-none"
                    />
                    <span className="text-xs text-slate-400">$/u</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Model Cost Table */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
              <div className="p-5 border-b border-slate-800 flex justify-between items-center flex-wrap gap-2">
                <div>
                  <h3 className="font-bold text-lg text-white">Desglose de Costos de Fabricación por Modelo de Tanque</h3>
                  <p className="text-xs text-slate-400">Calculado sobre factores relativos de cocción, mano de obra y consumo eléctrico</p>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-orange-500"></span><span className="text-slate-300">Gas Propano</span></div>
                  <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-cyan-500"></span><span className="text-slate-300">Mano de Obra</span></div>
                  <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-yellow-500"></span><span className="text-slate-300">Electricidad</span></div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-950/70 text-slate-400 text-xs uppercase font-semibold border-b border-slate-800">
                    <tr>
                      <th className="py-3.5 px-4">Producto / Modelo</th>
                      <th className="py-3.5 px-3">Tipo / Litros</th>
                      <th className="py-3.5 px-3 text-center">Puntaje</th>
                      <th className="py-3.5 px-4 text-right">Gas (L)</th>
                      <th className="py-3.5 px-4 text-right">Costo Gas ($)</th>
                      <th className="py-3.5 px-4 text-right">MDO ($)</th>
                      <th className="py-3.5 px-4 text-right">Luz ($)</th>
                      <th className="py-3.5 px-4 text-right font-black text-indigo-300">Costo Total ($)</th>
                      <th className="py-3.5 px-4 text-center">Composición</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {data.modelScores.map((m, idx) => {
                      const lGas = parseFloat((m.puntaje * baseGasLiters).toFixed(2));
                      const cGas = Math.round(lGas * gasPrice);
                      const cMdo = Math.round(m.puntaje * laborCost);
                      const cLuz = Math.round(m.puntaje * electricCost);
                      const cTot = cGas + cMdo + cLuz;
                      const pctGas = cTot > 0 ? (cGas / cTot) * 100 : 50;
                      const pctMdo = cTot > 0 ? (cMdo / cTot) * 100 : 40;
                      const pctLuz = cTot > 0 ? (cLuz / cTot) * 100 : 10;

                      return (
                        <tr key={idx} className="hover:bg-slate-800/40 transition">
                          <td className="py-3 px-4 font-semibold text-white flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${m.producto.includes("TRIC") ? "bg-indigo-400" : m.producto.includes("BIC") ? "bg-cyan-400" : "bg-purple-400"}`}></span>
                            {m.producto}
                          </td>
                          <td className="py-3 px-3 text-slate-400 text-xs">{m.tipo} ({m.litrosTanque})</td>
                          <td className="py-3 px-3 text-center">
                            <span className="bg-slate-800 border border-slate-700 text-slate-300 text-xs px-2 py-0.5 rounded font-mono font-bold">
                              {m.puntaje.toFixed(2)}x
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-orange-400 font-bold">{lGas} L</td>
                          <td className="py-3 px-4 text-right font-mono text-slate-200">${cGas.toLocaleString("es-AR")}</td>
                          <td className="py-3 px-4 text-right font-mono text-cyan-300">${cMdo.toLocaleString("es-AR")}</td>
                          <td className="py-3 px-4 text-right font-mono text-yellow-300">${cLuz.toLocaleString("es-AR")}</td>
                          <td className="py-3 px-4 text-right font-mono font-black text-emerald-400 text-base">
                            ${cTot.toLocaleString("es-AR")}
                          </td>
                          <td className="py-3 px-4">
                            <div className="w-28 h-2.5 bg-slate-800 rounded-full flex overflow-hidden mx-auto shadow-inner">
                              <div style={{ width: `${pctGas}%` }} className="bg-orange-500" title={`Gas: ${pctGas.toFixed(0)}%`}></div>
                              <div style={{ width: `${pctMdo}%` }} className="bg-cyan-500" title={`MDO: ${pctMdo.toFixed(0)}%`}></div>
                              <div style={{ width: `${pctLuz}%` }} className="bg-yellow-500" title={`Luz: ${pctLuz.toFixed(0)}%`}></div>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

        {/* Tab 2: Rendimiento y Sueldos Operarios */}
        {activeTab === "operarios" && data && (
          <div className="space-y-6">
            
            {/* Directives Banner */}
            <div className="bg-slate-900 border border-indigo-500/30 p-4 rounded-2xl flex items-start gap-3">
              <Info className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
              <div className="text-xs text-slate-300 space-y-1">
                <p>
                  <strong className="text-white">Criterios Operativos de Fábrica:</strong>
                </p>
                <p>• <strong>Julio Verón:</strong> Realiza mantenimiento preventivo y correctivo de maquinaria y soporte técnico de planta, por lo que su costo no debe considerarse 100% de producción pura.</p>
                <p>• <strong>Samuel Contreras:</strong> Operario eventual sin sueldo mensual fijo, contratado según picos de demanda.</p>
                <p>• <strong>Junio 2026:</strong> Incluye el pago del Sueldo Anual Complementario (SAC / Aguinaldo), lo que incrementa los costos de mano de obra de dicho mes.</p>
              </div>
            </div>

            {/* Toggle Aguinaldo */}
            <div className="flex justify-between items-center flex-wrap gap-3">
              <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 p-1.5 rounded-xl">
                <button
                  onClick={() => setIncludeAguinaldo(false)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    !includeAguinaldo ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"
                  }`}
                >
                  Sueldos Ordinarios (Sin Aguinaldo)
                </button>
                <button
                  onClick={() => setIncludeAguinaldo(true)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    includeAguinaldo ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"
                  }`}
                >
                  Total Liquidado (Con Aguinaldo Junio)
                </button>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">Filtrar por Mes:</span>
                <select
                  value={selectedMonthFilter}
                  onChange={(e) => setSelectedMonthFilter(e.target.value)}
                  className="bg-slate-900 border border-slate-800 text-white text-xs px-3 py-1.5 rounded-xl focus:outline-none focus:border-indigo-500"
                >
                  <option value="all">Acumulado Anual (Ene - Jul 2026)</option>
                  <option value="2026-07">Julio 2026</option>
                  <option value="2026-06">Junio 2026 (Aguinaldo)</option>
                  <option value="2026-05">Mayo 2026</option>
                  <option value="2026-04">Abril 2026</option>
                  <option value="2026-03">Marzo 2026</option>
                  <option value="2026-02">Febrero 2026</option>
                  <option value="2026-01">Enero 2026</option>
                </select>
              </div>
            </div>

            {/* Operator Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {data.operatorsData.map((op, idx) => {
                const totalSal = includeAguinaldo ? op.totalSalary : op.totalSalaryWithoutAguinaldo;
                const costPerTank = includeAguinaldo ? op.avgCostPerTank : op.avgCostPerTankWithoutAguinaldo;

                let monthData = null;
                if (selectedMonthFilter !== "all") {
                  monthData = op.months[selectedMonthFilter];
                }

                return (
                  <div key={idx} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between space-y-4">
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h4 className="font-bold text-lg text-white">{op.name}</h4>
                          <span className="text-xs text-indigo-400 font-medium">{op.role}</span>
                        </div>
                        {op.isMaintenanceSupport && (
                          <span className="bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[10px] px-2 py-0.5 rounded-full font-semibold flex items-center gap-1">
                            <Wrench className="w-3 h-3" /> Mantenimiento
                          </span>
                        )}
                        {op.isEventual && (
                          <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] px-2 py-0.5 rounded-full font-semibold">
                            Eventual
                          </span>
                        )}
                      </div>

                      {op.notes && (
                        <p className="text-[11px] text-slate-400 mt-2 bg-slate-950/60 p-2 rounded-lg border border-slate-800/80">
                          {op.notes}
                        </p>
                      )}
                    </div>

                    {selectedMonthFilter === "all" ? (
                      <div className="space-y-3 pt-3 border-t border-slate-800">
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/60">
                            <span className="text-slate-400 block text-[10px]">Tanques Horneados</span>
                            <span className="font-bold text-white text-base">{op.totalTanksFabricated} u</span>
                          </div>
                          <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/60">
                            <span className="text-slate-400 block text-[10px]">Tanques Ensamblados</span>
                            <span className="font-bold text-cyan-400 text-base">{op.totalTanksAssembled} u</span>
                          </div>
                        </div>

                        <div className="bg-indigo-950/40 border border-indigo-900/50 p-3 rounded-xl flex items-center justify-between">
                          <div>
                            <span className="text-[10px] text-indigo-300 font-semibold block uppercase">Costo MDO / Tanque</span>
                            <span className="text-xl font-black text-white">
                              {costPerTank > 0 ? `$${costPerTank.toLocaleString("es-AR")}` : "-"}
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="text-[10px] text-slate-400 block">Sueldo Acumulado</span>
                            <span className="text-xs font-bold text-slate-200">${totalSal.toLocaleString("es-AR")}</span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3 pt-3 border-t border-slate-800">
                        {monthData ? (
                          <>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/60">
                                <span className="text-slate-400 block text-[10px]">Fabricados ({monthData.monthName})</span>
                                <span className="font-bold text-white text-base">{monthData.tanksFabricated} u</span>
                              </div>
                              <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/60">
                                <span className="text-slate-400 block text-[10px]">Ensamblados</span>
                                <span className="font-bold text-cyan-400 text-base">{monthData.tanksAssembled} u</span>
                              </div>
                            </div>

                            <div className="bg-indigo-950/40 border border-indigo-900/50 p-3 rounded-xl flex items-center justify-between">
                              <div>
                                <span className="text-[10px] text-indigo-300 font-semibold block uppercase">Costo MDO ({monthData.monthName})</span>
                                <span className="text-xl font-black text-white">
                                  {monthData.costPerTank > 0 ? `$${monthData.costPerTank.toLocaleString("es-AR")}` : "-"}
                                </span>
                              </div>
                              <div className="text-right">
                                <span className="text-[10px] text-slate-400 block">Sueldo del Mes</span>
                                <span className="text-xs font-bold text-slate-200">${monthData.salary.toLocaleString("es-AR")}</span>
                              </div>
                            </div>
                          </>
                        ) : (
                          <p className="text-xs text-slate-500 italic">Sin datos para este mes</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

          </div>
        )}

        {/* Tab 3: Electricidad Edenor */}
        {activeTab === "electricidad" && data && (
          <div className="space-y-6">
            
            <div className="bg-slate-900 border border-yellow-500/30 p-5 rounded-2xl flex items-start gap-4">
              <Zap className="w-8 h-8 text-yellow-400 shrink-0 mt-1" />
              <div>
                <h3 className="font-bold text-lg text-white">Servicio Eléctrico Edenor (Quilmes 4550) - Imputación a Mes Vencido</h3>
                <p className="text-xs text-slate-300 mt-1">
                  Las facturas de Edenor se pagan al mes siguiente del consumo real. Para costear con precisión la producción, cada pago se imputa a los tanques fabricados en el mes correspondiente.
                </p>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
              <div className="p-5 border-b border-slate-800">
                <h3 className="font-bold text-base text-white">Historial de Facturación y Costo Unitario de Luz</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-950/70 text-slate-400 text-xs uppercase font-semibold border-b border-slate-800">
                    <tr>
                      <th className="py-3.5 px-4">Fecha de Pago</th>
                      <th className="py-3.5 px-4">Concepto</th>
                      <th className="py-3.5 px-4 font-bold text-yellow-300">Mes Consumo Imputado</th>
                      <th className="py-3.5 px-4 text-right">Monto Facturado ($)</th>
                      <th className="py-3.5 px-4 text-right">Tanques Fabricados</th>
                      <th className="py-3.5 px-4 text-right font-black text-emerald-400">Costo Luz / Tanque</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {data.electricityRecords.map((r, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/40 transition">
                        <td className="py-3 px-4 font-mono text-slate-300">{r.paymentDateFormatted}</td>
                        <td className="py-3 px-4 text-slate-400">{r.concept}</td>
                        <td className="py-3 px-4 font-bold text-yellow-400">{r.consumedMonthName}</td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-white">
                          ${r.amount.toLocaleString("es-AR")}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-slate-300">
                          {r.tanksProducedInMonth} u
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-black text-emerald-400 text-base">
                          ${r.costPerTank.toLocaleString("es-AR")} / u
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

        {/* Tab 4: Consumo Gas Mes a Mes & Zeppelin */}
        {activeTab === "gas" && data && (
          <div className="space-y-6">
            
            {/* Current Month Zeppelin Card */}
            {data.currentMonthForecast && (
              <div className="bg-gradient-to-br from-slate-900 via-indigo-950/80 to-slate-900 border border-indigo-500/40 p-6 rounded-2xl shadow-2xl relative overflow-hidden">
                <div className="flex justify-between items-start flex-wrap gap-4">
                  <div>
                    <span className="bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-xs px-2.5 py-0.5 rounded-full font-semibold">
                      Agosto 2026 (En Curso)
                    </span>
                    <h3 className="text-xl font-black text-white mt-1">
                      Balance y Proyección de Gas Propano
                    </h3>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-slate-400 block">Stock en Zeppelin (4000L)</span>
                    <span className="text-2xl font-black text-emerald-400">{data.tankStatus.currentPercentage}% ({data.tankStatus.currentLiters} L)</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-5">
                  <div className="bg-slate-950/60 border border-slate-800 p-4 rounded-xl">
                    <span className="text-xs text-slate-400 block">Tanques Fabricados MTD</span>
                    <span className="text-2xl font-black text-white">{data.currentMonthForecast.tanksProducedMtd} u</span>
                    <span className="text-[11px] text-orange-400 block mt-1">Consumo: {data.currentMonthForecast.gasConsumedMtdLiters} L</span>
                  </div>

                  <div className="bg-slate-950/60 border border-slate-800 p-4 rounded-xl">
                    <span className="text-xs text-slate-400 block">Proyección 7 Días Restantes</span>
                    <span className="text-2xl font-black text-amber-400">~{data.currentMonthForecast.projectedRemainingGasConsumptionLiters} L</span>
                    <span className="text-[11px] text-slate-400 block mt-1">~${data.currentMonthForecast.projectedRemainingGasCost.toLocaleString("es-AR")}</span>
                  </div>

                  <div className="bg-slate-950/60 border border-slate-800 p-4 rounded-xl">
                    <span className="text-xs text-slate-400 block">Stock Estimado al 31/08</span>
                    <span className="text-2xl font-black text-emerald-400">{data.currentMonthForecast.projectedEndingTankPercentage}% ({data.currentMonthForecast.projectedEndingTankStockLiters} L)</span>
                    <span className="text-[11px] text-emerald-400 block mt-1">✅ Stock Suficiente</span>
                  </div>
                </div>
              </div>
            )}

            {/* Monthly Breakdown Table */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
              <div className="p-5 border-b border-slate-800">
                <h3 className="font-bold text-base text-white">Evolución Mensual Consolidada (Gas + MDO + Luz)</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-950/70 text-slate-400 text-xs uppercase font-semibold border-b border-slate-800">
                    <tr>
                      <th className="py-3.5 px-4">Mes</th>
                      <th className="py-3.5 px-3 text-right">Tanques</th>
                      <th className="py-3.5 px-4 text-right">Gas ($)</th>
                      <th className="py-3.5 px-4 text-right">MDO ($)</th>
                      <th className="py-3.5 px-4 text-right">Luz ($)</th>
                      <th className="py-3.5 px-4 text-right">Total Operativo ($)</th>
                      <th className="py-3.5 px-4 text-right font-black text-emerald-400">Costo Total / Tanque</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {data.monthlyBreakdown.map((m, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/40 transition">
                        <td className="py-3 px-4 font-bold text-white">{m.monthName}</td>
                        <td className="py-3 px-3 text-right font-mono text-slate-300">{m.tanquesFabricados} u</td>
                        <td className="py-3 px-4 text-right font-mono text-orange-400">${m.gasInversion.toLocaleString("es-AR")}</td>
                        <td className="py-3 px-4 text-right font-mono text-cyan-400">${m.mdoTotal.toLocaleString("es-AR")}</td>
                        <td className="py-3 px-4 text-right font-mono text-yellow-400">${m.luzTotal.toLocaleString("es-AR")}</td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-white">${m.costoTotalOperativo.toLocaleString("es-AR")}</td>
                        <td className="py-3 px-4 text-right font-mono font-black text-emerald-400 text-base">
                          ${m.costoUnitarioTotal.toLocaleString("es-AR")} / u
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

        {/* Tab 5: Registro de Cargas & Remitos */}
        {activeTab === "eventos" && data && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="p-5 border-b border-slate-800 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-base text-white">Registro de Cargas de Gas y Mediciones de Reloj</h3>
                <p className="text-xs text-slate-400">Lecturas de nivel (%) y remitos de YPF Gas</p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-950/70 text-slate-400 text-xs uppercase font-semibold border-b border-slate-800">
                  <tr>
                    <th className="py-3.5 px-4">Fecha / Hora</th>
                    <th className="py-3.5 px-3">Tipo</th>
                    <th className="py-3.5 px-3 text-right">% Antes</th>
                    <th className="py-3.5 px-4 text-right">Carga (L)</th>
                    <th className="py-3.5 px-3 text-right">% Después</th>
                    <th className="py-3.5 px-4 text-right">Precio/L</th>
                    <th className="py-3.5 px-4 text-right">Costo Total</th>
                    <th className="py-3.5 px-4">Remito / Obs</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {data.gasEvents.map((e, idx) => (
                    <tr key={idx} className="hover:bg-slate-800/40 transition">
                      <td className="py-3 px-4 font-mono text-slate-300">{e.fechaFormatted} {e.hora}</td>
                      <td className="py-3 px-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                          e.tipo === "Recarga" ? "bg-orange-500/20 text-orange-400 border border-orange-500/30" : "bg-slate-800 text-slate-300"
                        }`}>
                          {e.tipo}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-slate-400">{e.porcentajeAntes > 0 ? `${e.porcentajeAntes}%` : "-"}</td>
                      <td className="py-3 px-4 text-right font-mono text-orange-400 font-bold">{e.cargaLitros > 0 ? `${e.cargaLitros} L` : "-"}</td>
                      <td className="py-3 px-3 text-right font-mono text-slate-400">{e.porcentajeDespues > 0 ? `${e.porcentajeDespues}%` : "-"}</td>
                      <td className="py-3 px-4 text-right font-mono text-slate-300">{e.precioLitro > 0 ? `$${e.precioLitro.toFixed(2)}` : "-"}</td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-white">{e.costoTotal > 0 ? `$${e.costoTotal.toLocaleString("es-AR")}` : "-"}</td>
                      <td className="py-3 px-4 text-xs text-slate-400">{e.remitoFactura || e.observaciones || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

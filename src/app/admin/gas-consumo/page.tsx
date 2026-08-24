"use client";

import React, { useState, useEffect, useMemo } from "react";
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
  ArrowLeft,
  Search,
  ChevronDown,
  AlertTriangle,
  Package,
  Boxes
} from "lucide-react";
import { 
  GasEvent, 
  CombinedModelCost, 
  FabricatedProductCost,
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
      pureRotomoldingFabricatedWithoutSAC: number;
    };
    summary2026: any;
    operatorsData: OperatorSummary[];
    electricityRecords: ElectricityRecord[];
    modelScores: CombinedModelCost[];
    fabricatedProducts: FabricatedProductCost[];
    intervals: GasIntervalMeasurement[];
    monthlyBreakdown: MonthlyCostBreakdown[];
    gasEvents: GasEvent[];
  } | null>(null);

  const [activeTab, setActiveTab] = useState<"matriz" | "cruce" | "operarios" | "electricidad" | "gas" | "eventos">("cruce");
  const [selectedMonthFilter, setSelectedMonthFilter] = useState<string>("all");
  const [includeAguinaldo, setIncludeAguinaldo] = useState<boolean>(false);
  const [searchModel, setSearchModel] = useState<string>("");
  const [searchFabricated, setSearchFabricated] = useState<string>("");
  const [selectedFamily, setSelectedFamily] = useState<string>("all");

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
  const laborCost = customLaborCost ?? (data?.costBenchmarks?.baseLaborCostPerTank || 4800);
  const electricCost = customElectricCost ?? (data?.costBenchmarks?.baseElectricityCostPerTank || 815);
  const baseGasLiters = data?.summary2026?.avgGasLitersPerTank || 7.57;

  const filteredModels = useMemo(() => {
    if (!data?.modelScores) return [];
    if (!searchModel.trim()) return data.modelScores;
    const q = searchModel.toLowerCase();
    return data.modelScores.filter(m => 
      m.producto.toLowerCase().includes(q) || 
      m.tipo.toLowerCase().includes(q) || 
      m.litrosTanque.toLowerCase().includes(q)
    );
  }, [data?.modelScores, searchModel]);

  const filteredFabricatedProducts = useMemo(() => {
    if (!data?.fabricatedProducts) return [];
    let list = data.fabricatedProducts;

    if (selectedFamily !== "all") {
      list = list.filter(p => p.family === selectedFamily);
    }

    if (searchFabricated.trim()) {
      const q = searchFabricated.toLowerCase();
      list = list.filter(p => 
        p.name.toLowerCase().includes(q) || 
        p.sku.toLowerCase().includes(q) ||
        p.family.toLowerCase().includes(q)
      );
    }

    return list;
  }, [data?.fabricatedProducts, selectedFamily, searchFabricated]);

  const familiesList = useMemo(() => {
    if (!data?.fabricatedProducts) return [];
    const set = new Set<string>();
    data.fabricatedProducts.forEach(p => set.add(p.family));
    return Array.from(set);
  }, [data?.fabricatedProducts]);

  // KPIs for Fabricated Products
  const kpisFabricated = useMemo(() => {
    if (!filteredFabricatedProducts || filteredFabricatedProducts.length === 0) {
      return { count: 0, avgMarginPct: 0, avgMarginVal: 0, avgInsumos: 0, avgPlant: 0, avgPrice: 0 };
    }
    const withPrice = filteredFabricatedProducts.filter(p => p.price > 0);
    const count = filteredFabricatedProducts.length;
    const sumMarginPct = withPrice.reduce((acc, p) => acc + p.marginPct, 0);
    const sumMarginVal = withPrice.reduce((acc, p) => acc + p.marginValue, 0);
    const sumInsumos = filteredFabricatedProducts.reduce((acc, p) => acc + p.costInsumos, 0);
    const sumPlant = filteredFabricatedProducts.reduce((acc, p) => acc + p.plantOpCost, 0);
    const sumPrice = withPrice.reduce((acc, p) => acc + p.price, 0);

    return {
      count,
      avgMarginPct: withPrice.length > 0 ? parseFloat((sumMarginPct / withPrice.length).toFixed(1)) : 0,
      avgMarginVal: withPrice.length > 0 ? Math.round(sumMarginVal / withPrice.length) : 0,
      avgInsumos: Math.round(sumInsumos / count),
      avgPlant: Math.round(sumPlant / count),
      avgPrice: withPrice.length > 0 ? Math.round(sumPrice / withPrice.length) : 0
    };
  }, [filteredFabricatedProducts]);

  return (
    <div className="min-h-screen bg-slate-50/70 text-slate-900 p-4 sm:p-6 lg:p-8 space-y-6 font-sans antialiased">
      
      {/* Navigation Breadcrumb */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 text-xs">
          <Link
            href="/admin/produccion"
            className="inline-flex items-center gap-1.5 text-slate-500 hover:text-slate-900 font-semibold transition bg-white border border-slate-200/80 px-3 py-1.5 rounded-xl shadow-xs"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Volver a Producción
          </Link>
          <span className="text-slate-400 font-bold">/</span>
          <span className="text-indigo-600 font-bold">Costos de Fabricación y Servicios</span>
        </div>

        <button
          onClick={fetchData}
          disabled={loading}
          className="inline-flex items-center gap-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/80 px-3.5 py-1.5 rounded-xl text-xs font-bold transition shadow-xs disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-indigo-600 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Actualizando..." : "Actualizar Datos"}
        </button>
      </div>

      {/* Main Header Banner */}
      <div className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-xs relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="bg-indigo-50 text-indigo-700 border border-indigo-200/80 text-[11px] px-2.5 py-0.5 rounded-full font-black flex items-center gap-1">
                <Factory className="w-3 h-3 text-indigo-600" /> Costos Industriales Consolidados
              </span>
              <span className="bg-emerald-50 text-emerald-700 border border-emerald-200/80 text-[11px] px-2.5 py-0.5 rounded-full font-black flex items-center gap-1">
                <Boxes className="w-3 h-3 text-emerald-600" /> Cruce Insumos BD + Gas GLP + MDO + Edenor
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900">
              Control de Costos de Fabricación y Servicios
            </h1>
            <p className="text-slate-500 text-sm mt-1 font-medium">
              Cruce de insumos y materia prima de la base de datos con costos operativos de planta para obtener el costo integral y margen real de los productos fabricados.
            </p>
          </div>
        </div>
      </div>

      {/* 4 Summary Cards */}
      {data && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* Card 1: Total Cost per Base Tank */}
          <div className="bg-white rounded-2xl border border-indigo-200/90 p-5 shadow-xs relative overflow-hidden group hover:border-indigo-400 transition-all">
            <div className="flex justify-between items-start">
              <span className="text-[11px] font-black uppercase tracking-wider text-indigo-600">Costo Planta (500L TRIC)</span>
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-black text-slate-900 tracking-tight">
                ${Math.round(baseGasLiters * gasPrice + laborCost + electricCost).toLocaleString("es-AR")}
              </span>
              <span className="text-xs text-slate-400 font-bold">/ unidad</span>
            </div>
            <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 font-medium">
              <span>Gas ${(baseGasLiters * gasPrice).toFixed(0)}</span>
              <span>•</span>
              <span>MDO ${laborCost.toLocaleString("es-AR")}</span>
              <span>•</span>
              <span>Luz ${electricCost.toLocaleString("es-AR")}</span>
            </div>
          </div>

          {/* Card 2: Gas GLP */}
          <div className="bg-white rounded-2xl border border-orange-200/90 p-5 shadow-xs relative overflow-hidden group hover:border-orange-400 transition-all">
            <div className="flex justify-between items-start">
              <span className="text-[11px] font-black uppercase tracking-wider text-orange-600">Gas Propano GLP</span>
              <div className="p-2 bg-orange-50 text-orange-600 rounded-xl border border-orange-100">
                <Flame className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-black text-slate-900 tracking-tight">
                ${Math.round(baseGasLiters * gasPrice).toLocaleString("es-AR")}
              </span>
              <span className="text-xs text-orange-600 font-bold bg-orange-50 px-2 py-0.5 rounded-full">{baseGasLiters.toFixed(2)} L/u</span>
            </div>
            <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 font-medium">
              <span>Precio: ${gasPrice.toFixed(2)}/L</span>
              <span className="text-slate-700 font-bold">Zeppelin: {data.tankStatus.currentPercentage}%</span>
            </div>
          </div>

          {/* Card 3: Labor Cost */}
          <div className="bg-white rounded-2xl border border-cyan-200/90 p-5 shadow-xs relative overflow-hidden group hover:border-cyan-400 transition-all">
            <div className="flex justify-between items-start">
              <span className="text-[11px] font-black uppercase tracking-wider text-cyan-700">Mano de Obra (Rotomoldeo)</span>
              <div className="p-2 bg-cyan-50 text-cyan-600 rounded-xl border border-cyan-100">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-black text-slate-900 tracking-tight">
                ${laborCost.toLocaleString("es-AR")}
              </span>
              <span className="text-xs text-slate-400 font-bold">/ tanque base</span>
            </div>
            <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 font-medium">
              <span>Rodrigo, Leo, Samuel</span>
              <span className="text-cyan-700 font-bold">Rotomoldeo Puro</span>
            </div>
          </div>

          {/* Card 4: Electricity */}
          <div className="bg-white rounded-2xl border border-amber-200/90 p-5 shadow-xs relative overflow-hidden group hover:border-amber-400 transition-all">
            <div className="flex justify-between items-start">
              <span className="text-[11px] font-black uppercase tracking-wider text-amber-700">Electricidad (Edenor)</span>
              <div className="p-2 bg-amber-50 text-amber-600 rounded-xl border border-amber-100">
                <Zap className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-black text-slate-900 tracking-tight">
                ${electricCost.toLocaleString("es-AR")}
              </span>
              <span className="text-xs text-slate-400 font-bold">/ tanque base</span>
            </div>
            <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 font-medium">
              <span>A mes vencido</span>
              <span className="text-amber-700 font-bold">Quilmes 4550</span>
            </div>
          </div>

        </div>
      )}

      {/* Navigation Tabs Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-2 shadow-xs flex flex-wrap gap-1.5">
        
        {/* NEW TAB: Cruce Integral & Rentabilidad */}
        <button
          onClick={() => setActiveTab("cruce")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition ${
            activeTab === "cruce"
              ? "bg-indigo-600 text-white shadow-xs"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
          }`}
        >
          <Boxes className="w-4 h-4 text-emerald-400" />
          Cruce Integral & Rentabilidad (Fabricados)
        </button>

        <button
          onClick={() => setActiveTab("matriz")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition ${
            activeTab === "matriz"
              ? "bg-indigo-600 text-white shadow-xs"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
          }`}
        >
          <Layers className="w-4 h-4" />
          Matriz de Transformación por Modelo (22)
        </button>

        <button
          onClick={() => setActiveTab("operarios")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition ${
            activeTab === "operarios"
              ? "bg-indigo-600 text-white shadow-xs"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
          }`}
        >
          <Users className="w-4 h-4" />
          Rendimiento y Sueldos Operarios
        </button>

        <button
          onClick={() => setActiveTab("electricidad")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition ${
            activeTab === "electricidad"
              ? "bg-indigo-600 text-white shadow-xs"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
          }`}
        >
          <Zap className="w-4 h-4 text-amber-500" />
          Electricidad Edenor (Mes Vencido)
        </button>

        <button
          onClick={() => setActiveTab("gas")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition ${
            activeTab === "gas"
              ? "bg-indigo-600 text-white shadow-xs"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
          }`}
        >
          <Flame className="w-4 h-4 text-orange-500" />
          Consumo Gas Mes a Mes & Zeppelin
        </button>

        <button
          onClick={() => setActiveTab("eventos")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition ${
            activeTab === "eventos"
              ? "bg-indigo-600 text-white shadow-xs"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
          }`}
        >
          <History className="w-4 h-4" />
          Registro de Cargas & Remitos
        </button>
      </div>

      {/* TAB 0: CRUCE INTEGRAL & RENTABILIDAD REAL (PRODUCTOS FABRICADOS) */}
      {activeTab === "cruce" && data && (
        <div className="space-y-6">
          
          {/* Banner */}
          <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-6 rounded-3xl shadow-xl border border-slate-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full">
                  Exclusivo Productos Fabricados Propia Planta
                </span>
                <span className="bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full">
                  Insumos BD + Servicios de Planta
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-white">
                Cruce Integral de Costos y Margen Real de Fabricación
              </h2>
              <p className="text-xs sm:text-sm text-slate-300 font-medium mt-1">
                Fórmula: <strong className="text-emerald-300">Costo Total Integral</strong> = Insumos (BD) + Gas Propano GLP + Mano de Obra (Rotomoldeo) + Electricidad (Edenor).
              </p>
            </div>

            <div className="bg-white/10 border border-white/15 p-4 rounded-2xl shrink-0 text-center sm:text-right">
              <span className="text-[10px] uppercase font-black tracking-wider text-slate-400 block">Margen Bruto Promedio</span>
              <span className="text-3xl font-black text-emerald-400 font-mono">{kpisFabricated.avgMarginPct}%</span>
              <span className="text-[10px] text-slate-300 font-medium block mt-0.5">~${kpisFabricated.avgMarginVal.toLocaleString("es-AR")} / unidad</span>
            </div>
          </div>

          {/* 4 Mini KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">Modelos Fabricados</span>
              <span className="text-2xl font-black text-slate-900 font-mono mt-1 block">{kpisFabricated.count} u</span>
              <span className="text-[10px] text-indigo-600 font-semibold">Productos filtrados</span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">Costo Medio Insumos (BD)</span>
              <span className="text-2xl font-black text-slate-900 font-mono mt-1 block">${kpisFabricated.avgInsumos.toLocaleString("es-AR")}</span>
              <span className="text-[10px] text-slate-400 font-semibold">Materia prima y compras</span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">Costo Medio Planta</span>
              <span className="text-2xl font-black text-slate-900 font-mono mt-1 block">${kpisFabricated.avgPlant.toLocaleString("es-AR")}</span>
              <span className="text-[10px] text-orange-600 font-semibold">Gas + MDO + Luz</span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">Precio Medio Venta</span>
              <span className="text-2xl font-black text-emerald-600 font-mono mt-1 block">${kpisFabricated.avgPrice.toLocaleString("es-AR")}</span>
              <span className="text-[10px] text-emerald-700 font-semibold">Catálogo comercial</span>
            </div>
          </div>

          {/* Filter Bar & Family Pills */}
          <div className="bg-white border border-slate-200/80 p-4 rounded-2xl shadow-xs space-y-3">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-slate-500">Familia:</span>
                <button
                  onClick={() => setSelectedFamily("all")}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                    selectedFamily === "all"
                      ? "bg-indigo-600 text-white shadow-xs"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  Todos ({data.fabricatedProducts.length})
                </button>
                {familiesList.map((fam, idx) => (
                  <button
                    key={idx}
                    onClick={() => setSelectedFamily(fam)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                      selectedFamily === fam
                        ? "bg-indigo-600 text-white shadow-xs"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {fam}
                  </button>
                ))}
              </div>

              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={searchFabricated}
                  onChange={(e) => setSearchFabricated(e.target.value)}
                  placeholder="Buscar modelo o SKU..."
                  className="bg-white border border-slate-200 pl-8 pr-3 py-1.5 rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 w-full shadow-xs"
                />
              </div>
            </div>
          </div>

          {/* Table of Fabricated Products Cross */}
          <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-xs">
            <div className="p-4 bg-slate-50/70 border-b border-slate-200/80 flex justify-between items-center flex-wrap gap-2">
              <div>
                <h3 className="font-black text-sm text-slate-900">Estructura Integral de Costos y Rentabilidad por Producto Fabricado</h3>
                <p className="text-xs text-slate-500 font-medium">Cruzando insumos directos con costos relativos de gas, sueldos de operarios y electricidad</p>
              </div>
              <span className="text-xs font-bold text-slate-500 bg-white border border-slate-200 px-3 py-1 rounded-xl shadow-xs">
                {filteredFabricatedProducts.length} productos listados
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-600 text-[11px] uppercase font-black tracking-wider border-b border-slate-200/80">
                  <tr>
                    <th className="py-3.5 px-4">Producto Fabricado</th>
                    <th className="py-3.5 px-3">Familia</th>
                    <th className="py-3.5 px-3 text-center">Score</th>
                    <th className="py-3.5 px-4 text-right font-black text-slate-800">Insumos BD ($)</th>
                    <th className="py-3.5 px-4 text-right text-orange-600">Gas ($)</th>
                    <th className="py-3.5 px-4 text-right text-cyan-700">MDO ($)</th>
                    <th className="py-3.5 px-4 text-right text-amber-700">Luz ($)</th>
                    <th className="py-3.5 px-4 text-right font-bold text-slate-900">Costo Planta ($)</th>
                    <th className="py-3.5 px-4 text-right font-black text-indigo-700">Costo Total ($)</th>
                    <th className="py-3.5 px-4 text-right font-black text-slate-900">Precio Venta ($)</th>
                    <th className="py-3.5 px-4 text-right font-black text-emerald-600">Margen ($)</th>
                    <th className="py-3.5 px-4 text-center font-black text-emerald-700">Margen (%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredFabricatedProducts.map((p, idx) => {
                    const hasMargin = p.price > 0;
                    const isHighMargin = p.marginPct >= 30;
                    const isMidMargin = p.marginPct >= 15 && p.marginPct < 30;
                    const isLowMargin = p.marginPct < 15;

                    return (
                      <tr key={idx} className="hover:bg-slate-50/80 transition">
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900">{p.name}</div>
                          {p.sku && p.sku !== 'SIN-SKU' && (
                            <span className="text-[10px] text-slate-400 font-mono font-semibold block">{p.sku}</span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-xs text-slate-500 font-semibold whitespace-nowrap">
                          {p.family}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className="bg-slate-100 border border-slate-200 text-slate-700 text-[11px] px-2 py-0.5 rounded font-mono font-bold">
                            {p.score.toFixed(2)}x
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-slate-800">
                          {p.costInsumos > 0 ? `$${p.costInsumos.toLocaleString("es-AR")}` : "-"}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-orange-600 font-medium">
                          ${p.gasCost.toLocaleString("es-AR")}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-cyan-700 font-medium">
                          ${p.mdoCost.toLocaleString("es-AR")}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-amber-700 font-medium">
                          ${p.luzCost.toLocaleString("es-AR")}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 bg-slate-50/50">
                          ${p.plantOpCost.toLocaleString("es-AR")}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-black text-indigo-700 text-base">
                          ${p.totalIntegralCost.toLocaleString("es-AR")}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                          {hasMargin ? `$${p.price.toLocaleString("es-AR")}` : "-"}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-black text-emerald-600">
                          {hasMargin ? `$${p.marginValue.toLocaleString("es-AR")}` : "-"}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {hasMargin ? (
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-black font-mono ${
                              isHighMargin 
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200" 
                                : isMidMargin 
                                ? "bg-amber-50 text-amber-700 border border-amber-200" 
                                : "bg-rose-50 text-rose-700 border border-rose-200"
                            }`}>
                              {p.marginPct}%
                            </span>
                          ) : (
                            <span className="text-slate-300 font-mono">-</span>
                          )}
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

      {/* TAB 1: Matriz de Costo por Modelo */}
      {activeTab === "matriz" && data && (
        <div className="space-y-6">
          
          {/* Simulator Bar */}
          <div className="bg-white border border-slate-200/80 p-5 rounded-2xl shadow-xs">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-indigo-600" />
                <h3 className="text-sm font-black text-slate-900">Simulador de Parámetros de Costo Unitario</h3>
                <span className="text-[10px] text-slate-500 font-semibold bg-slate-100 px-2 py-0.5 rounded-full">Ajusta los valores para recalcular en vivo</span>
              </div>
              <button 
                onClick={() => { setCustomGasPrice(null); setCustomLaborCost(null); setCustomElectricCost(null); }}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-bold underline"
              >
                Restablecer valores estándar
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/70">
                <label className="text-xs font-bold text-slate-700 block mb-1.5">Precio Gas Propano ($/Litro)</label>
                <div className="flex items-center gap-2">
                  <input 
                    type="number"
                    value={customGasPrice ?? gasPrice}
                    onChange={(e) => setCustomGasPrice(parseFloat(e.target.value) || 0)}
                    className="bg-white border border-slate-300 text-slate-900 text-sm px-3 py-1.5 rounded-lg w-full font-bold focus:border-indigo-500 focus:outline-none shadow-xs"
                  />
                  <span className="text-xs text-slate-500 font-bold">$/L</span>
                </div>
              </div>

              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/70">
                <label className="text-xs font-bold text-slate-700 block mb-1.5">Costo Mano de Obra Base ($/Tanque 500L)</label>
                <div className="flex items-center gap-2">
                  <input 
                    type="number"
                    value={customLaborCost ?? laborCost}
                    onChange={(e) => setCustomLaborCost(parseFloat(e.target.value) || 0)}
                    className="bg-white border border-slate-300 text-slate-900 text-sm px-3 py-1.5 rounded-lg w-full font-bold focus:border-indigo-500 focus:outline-none shadow-xs"
                  />
                  <span className="text-xs text-slate-500 font-bold">$/u</span>
                </div>
              </div>

              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/70">
                <label className="text-xs font-bold text-slate-700 block mb-1.5">Costo Electricidad Base ($/Tanque 500L)</label>
                <div className="flex items-center gap-2">
                  <input 
                    type="number"
                    value={customElectricCost ?? electricCost}
                    onChange={(e) => setCustomElectricCost(parseFloat(e.target.value) || 0)}
                    className="bg-white border border-slate-300 text-slate-900 text-sm px-3 py-1.5 rounded-lg w-full font-bold focus:border-indigo-500 focus:outline-none shadow-xs"
                  />
                  <span className="text-xs text-slate-500 font-bold">$/u</span>
                </div>
              </div>
            </div>
          </div>

          {/* Model Cost Table */}
          <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-xs">
            <div className="p-4 bg-slate-50/70 border-b border-slate-200/80 flex justify-between items-center flex-wrap gap-3">
              <div>
                <h3 className="font-black text-sm text-slate-900">Desglose de Costos de Transformación en Planta por Modelo de Tanque</h3>
                <p className="text-xs text-slate-500 font-medium">Calculado sobre factores relativos de cocción, mano de obra y consumo eléctrico</p>
              </div>

              <div className="flex items-center gap-4 text-xs font-bold">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={searchModel}
                    onChange={(e) => setSearchModel(e.target.value)}
                    placeholder="Buscar modelo..."
                    className="bg-white border border-slate-200 pl-8 pr-3 py-1.5 rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 shadow-xs"
                  />
                </div>
                <div className="hidden sm:flex items-center gap-3">
                  <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-orange-500"></span><span className="text-slate-600">Gas Propano</span></div>
                  <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-cyan-500"></span><span className="text-slate-600">Mano de Obra</span></div>
                  <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span><span className="text-slate-600">Electricidad</span></div>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-600 text-[11px] uppercase font-black tracking-wider border-b border-slate-200/80">
                  <tr>
                    <th className="py-3.5 px-4">Producto / Modelo</th>
                    <th className="py-3.5 px-3">Tipo / Litros</th>
                    <th className="py-3.5 px-3 text-center">Puntaje</th>
                    <th className="py-3.5 px-4 text-right">Gas (L)</th>
                    <th className="py-3.5 px-4 text-right">Costo Gas ($)</th>
                    <th className="py-3.5 px-4 text-right">MDO ($)</th>
                    <th className="py-3.5 px-4 text-right">Luz ($)</th>
                    <th className="py-3.5 px-4 text-right font-black text-indigo-700">Costo Planta ($)</th>
                    <th className="py-3.5 px-4 text-center">Composición</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredModels.map((m, idx) => {
                    const lGas = parseFloat((m.puntaje * baseGasLiters).toFixed(2));
                    const cGas = Math.round(lGas * gasPrice);
                    const cMdo = Math.round(m.puntaje * laborCost);
                    const cLuz = Math.round(m.puntaje * electricCost);
                    const cTot = cGas + cMdo + cLuz;
                    const pctGas = cTot > 0 ? (cGas / cTot) * 100 : 50;
                    const pctMdo = cTot > 0 ? (cMdo / cTot) * 100 : 40;
                    const pctLuz = cTot > 0 ? (cLuz / cTot) * 100 : 10;

                    return (
                      <tr key={idx} className="hover:bg-slate-50/80 transition">
                        <td className="py-3 px-4 font-bold text-slate-900 flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${m.producto.includes("TRIC") ? "bg-indigo-500" : m.producto.includes("BIC") ? "bg-cyan-500" : "bg-purple-500"}`}></span>
                          {m.producto}
                        </td>
                        <td className="py-3 px-3 text-slate-500 text-xs font-semibold">{m.tipo} ({m.litrosTanque})</td>
                        <td className="py-3 px-3 text-center">
                          <span className="bg-slate-100 border border-slate-200 text-slate-700 text-xs px-2 py-0.5 rounded font-mono font-bold">
                            {m.puntaje.toFixed(2)}x
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-orange-600 font-black">{lGas} L</td>
                        <td className="py-3 px-4 text-right font-mono text-slate-700 font-medium">${cGas.toLocaleString("es-AR")}</td>
                        <td className="py-3 px-4 text-right font-mono text-cyan-700 font-medium">${cMdo.toLocaleString("es-AR")}</td>
                        <td className="py-3 px-4 text-right font-mono text-amber-700 font-medium">${cLuz.toLocaleString("es-AR")}</td>
                        <td className="py-3 px-4 text-right font-mono font-black text-emerald-600 text-base">
                          ${cTot.toLocaleString("es-AR")}
                        </td>
                        <td className="py-3 px-4">
                          <div className="w-28 h-2 bg-slate-100 rounded-full flex overflow-hidden mx-auto shadow-inner">
                            <div style={{ width: `${pctGas}%` }} className="bg-orange-500" title={`Gas: ${pctGas.toFixed(0)}%`}></div>
                            <div style={{ width: `${pctMdo}%` }} className="bg-cyan-500" title={`MDO: ${pctMdo.toFixed(0)}%`}></div>
                            <div style={{ width: `${pctLuz}%` }} className="bg-amber-500" title={`Luz: ${pctLuz.toFixed(0)}%`}></div>
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

      {/* TAB 2: Rendimiento y Sueldos Operarios (Método 1 Mantenimiento + Gestión Depósito) */}
      {activeTab === "operarios" && data && (
        <div className="space-y-6">
          
          {/* Informative Directives Banner */}
          <div className="bg-indigo-50/70 border border-indigo-200/80 p-4 rounded-2xl flex items-start gap-3">
            <Info className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
            <div className="text-xs text-indigo-950 space-y-1">
              <p className="font-bold">Estructura y Roles Operativos de Planta:</p>
              <p>• <strong>Rotomoldeo Directo (Rodrigo, Leonardo, Samuel):</strong> El costo unitario se divide estrictamente sobre unidades <strong>Fabricadas en Horno</strong>.</p>
              <p>• <strong>Julio Verón (Método 1):</strong> Se descuenta el valor de los tanques que hornea a tarifa estándar de rotomoldeo ($4.800/u) y el resto del sueldo se computa como <strong>Mantenimiento Puro de Planta</strong> prorrateado entre toda la producción global de la fábrica.</p>
              <p>• <strong>Matías Olivera:</strong> Responsable principal de <strong>Gestión de Depósito, Logística de Stock y Armado/Ensamblado</strong> de Biodigestores y Cámaras Sépticas.</p>
            </div>
          </div>

          {/* Toggle and Month Filter Bar */}
          <div className="bg-white border border-slate-200/80 p-3 rounded-2xl shadow-xs flex justify-between items-center flex-wrap gap-3">
            <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
              <button
                onClick={() => setIncludeAguinaldo(false)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  !includeAguinaldo ? "bg-white text-indigo-600 shadow-xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Sueldos Ordinarios (Sin Aguinaldo)
              </button>
              <button
                onClick={() => setIncludeAguinaldo(true)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  includeAguinaldo ? "bg-white text-indigo-600 shadow-xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Total Liquidado (Con Aguinaldo Junio)
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-500">Filtrar por Mes:</span>
              <select
                value={selectedMonthFilter}
                onChange={(e) => setSelectedMonthFilter(e.target.value)}
                className="bg-white border border-slate-200 text-slate-800 text-xs font-bold px-3 py-1.5 rounded-xl focus:outline-none focus:border-indigo-500 shadow-xs"
              >
                <option value="all">Acumulado Anual (2026)</option>
                <option value="2026-08">Agosto 2026 (En Curso)</option>
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
              const costPerFabricated = includeAguinaldo ? op.avgCostPerFabricatedTank : op.avgCostPerFabricatedTankWithoutAguinaldo;

              let monthData = null;
              if (selectedMonthFilter !== "all") {
                monthData = op.months[selectedMonthFilter];
              }

              return (
                <div key={idx} className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs flex flex-col justify-between space-y-4 hover:border-slate-300 transition-all">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="font-black text-base text-slate-900">{op.name}</h4>
                        <span className="text-xs text-indigo-600 font-bold">{op.role}</span>
                      </div>
                      {op.isMaintenanceSupport && (
                        <span className="bg-purple-50 text-purple-700 border border-purple-200 text-[10px] px-2.5 py-0.5 rounded-full font-black flex items-center gap-1">
                          <Wrench className="w-3 h-3" /> Mantenimiento
                        </span>
                      )}
                      {op.isWarehouse && (
                        <span className="bg-blue-50 text-blue-700 border border-blue-200 text-[10px] px-2.5 py-0.5 rounded-full font-black flex items-center gap-1">
                          <Package className="w-3 h-3" /> Depósito & Ensamble
                        </span>
                      )}
                      {op.isEventual && (
                        <span className="bg-amber-50 text-amber-700 border border-amber-200 text-[10px] px-2.5 py-0.5 rounded-full font-black">
                          Eventual
                        </span>
                      )}
                    </div>

                    {op.notes && (
                      <p className="text-[11px] text-slate-600 mt-2.5 bg-slate-50 p-2.5 rounded-xl border border-slate-200/60 font-medium">
                        {op.notes}
                      </p>
                    )}
                  </div>

                  {/* SPECIAL CARD: Julio Verón */}
                  {op.isMaintenanceSupport ? (
                    <div className="space-y-3 pt-3 border-t border-slate-100">
                      {selectedMonthFilter === "all" ? (
                        <>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/60">
                              <span className="text-slate-500 block text-[10px] font-bold">Horneados (Ocasional)</span>
                              <span className="font-black text-slate-900 text-base">{op.totalTanksFabricated} u</span>
                              <span className="text-[10px] text-slate-400 block mt-0.5">Aporte: ${op.totalProductiveCredit?.toLocaleString("es-AR")}</span>
                            </div>
                            <div className="bg-purple-50/50 p-2.5 rounded-xl border border-purple-200/60">
                              <span className="text-purple-700 block text-[10px] font-bold">Gasto Mantenimiento Puro</span>
                              <span className="font-black text-purple-950 text-base">${op.totalPureMaintenanceCost?.toLocaleString("es-AR")}</span>
                              <span className="text-[10px] text-purple-600 block mt-0.5">Sueldo - Aporte</span>
                            </div>
                          </div>

                          <div className="bg-purple-50 border border-purple-200 p-3 rounded-xl flex items-center justify-between">
                            <div>
                              <span className="text-[10px] text-purple-700 font-black block uppercase tracking-wider">Costo Mantenimiento / Tanque Global</span>
                              <span className="text-xl font-black text-purple-950">
                                ${op.avgMaintenanceCostPerPlantTank?.toLocaleString("es-AR")}
                              </span>
                              <span className="text-[10px] text-purple-600 font-medium block">Prorrateado en toda la fábrica</span>
                            </div>
                            <div className="text-right">
                              <span className="text-[10px] text-slate-500 font-bold block">Sueldo Total</span>
                              <span className="text-xs font-black text-slate-800">${totalSal.toLocaleString("es-AR")}</span>
                            </div>
                          </div>
                        </>
                      ) : (
                        <>
                          {monthData ? (
                            <>
                              <div className="grid grid-cols-2 gap-2 text-xs">
                                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/60">
                                  <span className="text-slate-500 block text-[10px] font-bold">Horneados ({monthData.monthName})</span>
                                  <span className="font-black text-slate-900 text-base">{monthData.tanksFabricated} u</span>
                                  <span className="text-[10px] text-slate-400 block mt-0.5">Aporte: ${monthData.productiveCredit?.toLocaleString("es-AR")}</span>
                                </div>
                                <div className="bg-purple-50/50 p-2.5 rounded-xl border border-purple-200/60">
                                  <span className="text-purple-700 block text-[10px] font-bold">Mantenimiento Puro ({monthData.monthName})</span>
                                  <span className="font-black text-purple-950 text-base">${monthData.pureMaintenanceCost?.toLocaleString("es-AR")}</span>
                                  <span className="text-[10px] text-purple-600 block mt-0.5">Fábrica: {monthData.plantTotalTanks} u</span>
                                </div>
                              </div>

                              <div className="bg-purple-50 border border-purple-200 p-3 rounded-xl flex items-center justify-between">
                                <div>
                                  <span className="text-[10px] text-purple-700 font-black block uppercase tracking-wider">Costo Mantenimiento ({monthData.monthName})</span>
                                  <span className="text-xl font-black text-purple-950">
                                    {monthData.maintenanceCostPerPlantTank ? `$${monthData.maintenanceCostPerPlantTank.toLocaleString("es-AR")}` : "-"}
                                  </span>
                                  <span className="text-[10px] text-purple-600 font-medium block">/ tanque global de fábrica</span>
                                </div>
                                <div className="text-right">
                                  <span className="text-[10px] text-slate-500 font-bold block">Sueldo del Mes</span>
                                  <span className="text-xs font-black text-slate-800">${monthData.salary.toLocaleString("es-AR")}</span>
                                </div>
                              </div>
                            </>
                          ) : (
                            <p className="text-xs text-slate-400 italic">Sin datos para este mes</p>
                          )}
                        </>
                      )}
                    </div>
                  ) : op.isWarehouse ? (
                    /* SPECIAL CARD: Matías Olivera */
                    <div className="space-y-3 pt-3 border-t border-slate-100">
                      {selectedMonthFilter === "all" ? (
                        <>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="bg-blue-50/60 p-2.5 rounded-xl border border-blue-200/60">
                              <span className="text-blue-700 block text-[10px] font-bold">Ensamblados Realizados</span>
                              <span className="font-black text-blue-950 text-base">{op.totalTanksAssembled} u</span>
                              <span className="text-[10px] text-blue-600 block mt-0.5">Bio / Cámaras</span>
                            </div>
                            <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/60">
                              <span className="text-slate-500 block text-[10px] font-bold">Horneados (Ocasional)</span>
                              <span className="font-black text-slate-900 text-base">{op.totalTanksFabricated} u</span>
                              <span className="text-[10px] text-slate-400 block mt-0.5">Rotomoldeo</span>
                            </div>
                          </div>

                          <div className="bg-blue-50 border border-blue-200 p-3 rounded-xl flex items-center justify-between">
                            <div>
                              <span className="text-[10px] text-blue-700 font-black block uppercase tracking-wider">Costo MDO / Ensamblado</span>
                              <span className="text-xl font-black text-blue-950">
                                {op.avgCostPerAssembledTank > 0 ? `$${op.avgCostPerAssembledTank.toLocaleString("es-AR")}` : "-"}
                              </span>
                              <span className="text-[10px] text-blue-600 font-medium block">Gestión Depósito + Armado</span>
                            </div>
                            <div className="text-right">
                              <span className="text-[10px] text-slate-500 font-bold block">Sueldo Total</span>
                              <span className="text-xs font-black text-slate-800">${totalSal.toLocaleString("es-AR")}</span>
                            </div>
                          </div>
                        </>
                      ) : (
                        <>
                          {monthData ? (
                            <>
                              <div className="grid grid-cols-2 gap-2 text-xs">
                                <div className="bg-blue-50/60 p-2.5 rounded-xl border border-blue-200/60">
                                  <span className="text-blue-700 block text-[10px] font-bold">Ensamblados ({monthData.monthName})</span>
                                  <span className="font-black text-blue-950 text-base">{monthData.tanksAssembled} u</span>
                                  <span className="text-[10px] text-blue-600 block mt-0.5">Armado</span>
                                </div>
                                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/60">
                                  <span className="text-slate-500 block text-[10px] font-bold">Horneados ({monthData.monthName})</span>
                                  <span className="font-black text-slate-900 text-base">{monthData.tanksFabricated} u</span>
                                  <span className="text-[10px] text-slate-400 block mt-0.5">Ocasional</span>
                                </div>
                              </div>

                              <div className="bg-blue-50 border border-blue-200 p-3 rounded-xl flex items-center justify-between">
                                <div>
                                  <span className="text-[10px] text-blue-700 font-black block uppercase tracking-wider">Costo MDO / Ensamblado ({monthData.monthName})</span>
                                  <span className="text-xl font-black text-blue-950">
                                    {monthData.costPerAssembledTank > 0 ? `$${monthData.costPerAssembledTank.toLocaleString("es-AR")}` : "-"}
                                  </span>
                                </div>
                                <div className="text-right">
                                  <span className="text-[10px] text-slate-500 font-bold block">Sueldo del Mes</span>
                                  <span className="text-xs font-black text-slate-800">${monthData.salary.toLocaleString("es-AR")}</span>
                                </div>
                              </div>
                            </>
                          ) : (
                            <p className="text-xs text-slate-400 italic">Sin datos para este mes</p>
                          )}
                        </>
                      )}
                    </div>
                  ) : (
                    /* STANDARD CARD: Operarios de Rotomoldeo */
                    <div className="space-y-3 pt-3 border-t border-slate-100">
                      {selectedMonthFilter === "all" ? (
                        <>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/60">
                              <span className="text-slate-500 block text-[10px] font-bold">Fabricados (Horno)</span>
                              <span className="font-black text-slate-900 text-base">{op.totalTanksFabricated} u</span>
                            </div>
                            <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/60">
                              <span className="text-slate-500 block text-[10px] font-bold">Ensamblados</span>
                              <span className="font-semibold text-slate-600 text-base">{op.totalTanksAssembled} u</span>
                            </div>
                          </div>

                          <div className="bg-indigo-50/70 border border-indigo-100 p-3 rounded-xl flex items-center justify-between">
                            <div>
                              <span className="text-[10px] text-indigo-700 font-black block uppercase tracking-wider">Costo MDO / Fabricado</span>
                              <span className="text-xl font-black text-indigo-950">
                                {costPerFabricated > 0 ? `$${costPerFabricated.toLocaleString("es-AR")}` : "-"}
                              </span>
                            </div>
                            <div className="text-right">
                              <span className="text-[10px] text-slate-500 font-bold block">Sueldo Acumulado</span>
                              <span className="text-xs font-black text-slate-800">${totalSal.toLocaleString("es-AR")}</span>
                            </div>
                          </div>
                        </>
                      ) : (
                        <>
                          {monthData ? (
                            <>
                              <div className="grid grid-cols-2 gap-2 text-xs">
                                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/60">
                                  <span className="text-slate-500 block text-[10px] font-bold">Fabricados ({monthData.monthName})</span>
                                  <span className="font-black text-slate-900 text-base">{monthData.tanksFabricated} u</span>
                                </div>
                                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/60">
                                  <span className="text-slate-500 block text-[10px] font-bold">Ensamblados</span>
                                  <span className="font-semibold text-slate-600 text-base">{monthData.tanksAssembled} u</span>
                                </div>
                              </div>

                              <div className="bg-indigo-50/70 border border-indigo-100 p-3 rounded-xl flex items-center justify-between">
                                <div>
                                  <span className="text-[10px] text-indigo-700 font-black block uppercase tracking-wider">Costo MDO ({monthData.monthName})</span>
                                  <span className="text-xl font-black text-indigo-950">
                                    {monthData.costPerFabricatedTank > 0 ? `$${monthData.costPerFabricatedTank.toLocaleString("es-AR")}` : "-"}
                                  </span>
                                </div>
                                <div className="text-right">
                                  <span className="text-[10px] text-slate-500 font-bold block">Sueldo del Mes</span>
                                  <span className="text-xs font-black text-slate-800">${monthData.salary.toLocaleString("es-AR")}</span>
                                </div>
                              </div>
                            </>
                          ) : (
                            <p className="text-xs text-slate-400 italic">Sin datos registrados para este mes</p>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

        </div>
      )}

      {/* TAB 3: Electricidad Edenor */}
      {activeTab === "electricidad" && data && (
        <div className="space-y-6">
          
          <div className="bg-white border border-amber-200/90 p-5 rounded-2xl shadow-xs flex items-start gap-4">
            <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl border border-amber-200 shrink-0 mt-0.5">
              <Zap className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-black text-base text-slate-900">Servicio Eléctrico Edenor (Quilmes 4550) - Imputación a Mes Vencido</h3>
              <p className="text-xs text-slate-600 mt-1 font-medium">
                Las facturas de Edenor se abonan al mes siguiente del consumo real. Para costear con exactitud la producción de planta, cada pago se imputa a los tanques fabricados en el mes correspondiente.
              </p>
            </div>
          </div>

          <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-xs">
            <div className="p-4 bg-slate-50/70 border-b border-slate-200/80">
              <h3 className="font-black text-sm text-slate-900">Historial de Facturación y Costo Unitario de Luz</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-600 text-[11px] uppercase font-black tracking-wider border-b border-slate-200/80">
                  <tr>
                    <th className="py-3.5 px-4">Fecha de Pago</th>
                    <th className="py-3.5 px-4">Concepto</th>
                    <th className="py-3.5 px-4 font-bold text-amber-700">Mes Consumo Imputado</th>
                    <th className="py-3.5 px-4 text-right">Monto Facturado ($)</th>
                    <th className="py-3.5 px-4 text-right">Tanques Fabricados</th>
                    <th className="py-3.5 px-4 text-right font-black text-emerald-700">Costo Luz / Tanque</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.electricityRecords.map((r, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/80 transition">
                      <td className="py-3 px-4 font-mono text-slate-700 font-bold">{r.paymentDateFormatted}</td>
                      <td className="py-3 px-4 text-slate-500">{r.concept}</td>
                      <td className="py-3 px-4 font-black text-amber-700">{r.consumedMonthName}</td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                        ${r.amount.toLocaleString("es-AR")}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-700 font-bold">
                        {r.tanksProducedInMonth} u
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-black text-emerald-600 text-base">
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

      {/* TAB 4: Consumo Gas Mes a Mes & Zeppelin */}
      {activeTab === "gas" && data && (
        <div className="space-y-6">
          
          {/* Current Month Zeppelin Card */}
          {data.currentMonthForecast && (
            <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white rounded-3xl p-5 sm:p-6 shadow-xl border border-slate-800 space-y-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-amber-500/20 text-amber-400 rounded-2xl border border-amber-500/30">
                    <Calendar className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-black text-white">Balance y Proyección de {data.currentMonthForecast.monthName}</h3>
                      <span className="text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        Día {data.currentMonthForecast.currentDayOfMonth} de 31
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 font-semibold mt-0.5">
                      Consumo real acumulado MTD + proyección de días restantes hasta fin de mes.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {data.currentMonthForecast.isStockSufficientForMonth ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-black">
                      <CheckCircle2 className="w-4 h-4" /> Stock Suficiente para terminar el mes
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-black">
                      <AlertTriangle className="w-4 h-4" /> Recarga requerida antes de fin de mes
                    </span>
                  )}
                </div>
              </div>

              {/* Metric Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                <div className="bg-white/5 border border-white/10 p-3.5 rounded-2xl">
                  <span className="text-[10px] font-black uppercase text-amber-400 tracking-wider block">Consumido en el Mes (MTD)</span>
                  <div className="text-xl font-black text-white font-mono mt-1">
                    {data.currentMonthForecast.gasConsumedMtdLiters.toLocaleString('es-AR')} <span className="text-xs text-slate-400 font-normal">L GLP</span>
                  </div>
                  <p className="text-[10px] text-slate-400 font-semibold mt-0.5">
                    ${data.currentMonthForecast.gasConsumedMtdCost.toLocaleString('es-AR')} ({data.currentMonthForecast.tanksProducedMtd} tanques)
                  </p>
                </div>

                <div className="bg-white/5 border border-white/10 p-3.5 rounded-2xl">
                  <span className="text-[10px] font-black uppercase text-emerald-400 tracking-wider block">Stock Actual Disponible</span>
                  <div className="text-xl font-black text-emerald-400 font-mono mt-1">
                    {data.currentMonthForecast.currentTankStockLiters.toLocaleString('es-AR')} <span className="text-xs text-slate-400 font-normal">L ({data.currentMonthForecast.currentTankPercentage}%)</span>
                  </div>
                  <p className="text-[10px] text-slate-400 font-semibold mt-0.5">
                    Valor: ${data.currentMonthForecast.currentTankStockCost.toLocaleString('es-AR')}
                  </p>
                </div>

                <div className="bg-white/5 border border-white/10 p-3.5 rounded-2xl">
                  <span className="text-[10px] font-black uppercase text-cyan-400 tracking-wider block">Por Consumir ({data.currentMonthForecast.daysRemainingInMonth} días)</span>
                  <div className="text-xl font-black text-cyan-300 font-mono mt-1">
                    ~{data.currentMonthForecast.projectedRemainingGasConsumptionLiters.toLocaleString('es-AR')} <span className="text-xs text-slate-400 font-normal">L GLP</span>
                  </div>
                  <p className="text-[10px] text-slate-400 font-semibold mt-0.5">
                    ~${data.currentMonthForecast.projectedRemainingGasCost.toLocaleString('es-AR')} (~{data.currentMonthForecast.projectedDailyConsumptionLiters} L/día)
                  </p>
                </div>

                <div className="bg-white/5 border border-white/10 p-3.5 rounded-2xl">
                  <span className="text-[10px] font-black uppercase text-purple-400 tracking-wider block">Total Proyectado Mes</span>
                  <div className="text-xl font-black text-purple-300 font-mono mt-1">
                    ~{data.currentMonthForecast.projectedTotalMonthGasLiters.toLocaleString('es-AR')} <span className="text-xs text-slate-400 font-normal">L</span>
                  </div>
                  <p className="text-[10px] text-slate-400 font-semibold mt-0.5">
                    Stock final al 31/08: ~{data.currentMonthForecast.projectedEndingTankStockLiters} L ({data.currentMonthForecast.projectedEndingTankPercentage}%)
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Monthly Breakdown Table */}
          <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-xs">
            <div className="p-4 bg-slate-50/70 border-b border-slate-200/80">
              <h3 className="font-black text-sm text-slate-900">Evolución Mensual Consolidada (Gas + MDO + Luz)</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-600 text-[11px] uppercase font-black tracking-wider border-b border-slate-200/80">
                  <tr>
                    <th className="py-3.5 px-4">Mes</th>
                    <th className="py-3.5 px-3 text-right">Tanques</th>
                    <th className="py-3.5 px-4 text-right font-black text-orange-700">Gas Consumido (L)</th>
                    <th className="py-3.5 px-3 text-right font-bold text-orange-600">Rendimiento (L/u)</th>
                    <th className="py-3.5 px-4 text-right">Inversión Gas ($)</th>
                    <th className="py-3.5 px-4 text-right">MDO ($)</th>
                    <th className="py-3.5 px-4 text-right">Luz ($)</th>
                    <th className="py-3.5 px-4 text-right">Total Operativo ($)</th>
                    <th className="py-3.5 px-4 text-right font-black text-emerald-700">Costo Total / Tanque</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.monthlyBreakdown.map((m, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/80 transition">
                      <td className="py-3 px-4 font-black text-slate-900">{m.monthName}</td>
                      <td className="py-3 px-3 text-right font-mono text-slate-700 font-bold">{m.tanquesFabricados} u</td>
                      <td className="py-3 px-4 text-right font-mono font-black text-orange-600">
                        {m.gasLitros > 0 ? `${m.gasLitros.toLocaleString("es-AR")} L` : "-"}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-orange-500">
                        {m.gasLitrosPorTanque > 0 ? `${m.gasLitrosPorTanque} L/u` : "-"}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-700 font-medium">
                        {m.gasInversion > 0 ? `$${m.gasInversion.toLocaleString("es-AR")}` : "-"}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-cyan-700 font-medium">
                        {m.mdoTotal > 0 ? `$${m.mdoTotal.toLocaleString("es-AR")}` : "-"}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-amber-700 font-medium">
                        {m.luzTotal > 0 ? `$${m.luzTotal.toLocaleString("es-AR")}` : "-"}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-black text-slate-900">
                        ${m.costoTotalOperativo.toLocaleString("es-AR")}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-black text-emerald-600 text-base">
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

      {/* TAB 5: Registro de Cargas & Remitos */}
      {activeTab === "eventos" && data && (
        <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-xs">
          <div className="p-4 bg-slate-50/70 border-b border-slate-200/80 flex justify-between items-center">
            <div>
              <h3 className="font-black text-sm text-slate-900">Registro de Cargas de Gas y Mediciones de Reloj</h3>
              <p className="text-xs text-slate-500 font-medium">Lecturas de nivel (%) y remitos de YPF Gas</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-600 text-[11px] uppercase font-black tracking-wider border-b border-slate-200/80">
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
              <tbody className="divide-y divide-slate-100">
                {data.gasEvents.map((e, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/80 transition">
                    <td className="py-3 px-4 font-mono text-slate-700 font-bold">{e.fechaFormatted} {e.hora}</td>
                    <td className="py-3 px-3">
                      <span className={`text-xs px-2.5 py-0.5 rounded-full font-black ${
                        e.tipo === "Recarga" ? "bg-orange-50 text-orange-700 border border-orange-200" : "bg-slate-100 text-slate-700"
                      }`}>
                        {e.tipo}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-slate-500">{e.porcentajeAntes > 0 ? `${e.porcentajeAntes}%` : "-"}</td>
                    <td className="py-3 px-4 text-right font-mono text-orange-600 font-black">{e.cargaLitros > 0 ? `${e.cargaLitros} L` : "-"}</td>
                    <td className="py-3 px-3 text-right font-mono text-slate-500">{e.porcentajeDespues > 0 ? `${e.porcentajeDespues}%` : "-"}</td>
                    <td className="py-3 px-4 text-right font-mono text-slate-700 font-bold">{e.precioLitro > 0 ? `$${e.precioLitro.toFixed(2)}` : "-"}</td>
                    <td className="py-3 px-4 text-right font-mono font-black text-slate-900">{e.costoTotal > 0 ? `$${e.costoTotal.toLocaleString("es-AR")}` : "-"}</td>
                    <td className="py-3 px-4 text-xs text-slate-500 font-medium">{e.remitoFactura || e.observaciones || "-"}</td>
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

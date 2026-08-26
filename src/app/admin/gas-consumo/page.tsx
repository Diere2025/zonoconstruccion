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
  Boxes,
  Briefcase,
  Receipt,
  PiggyBank
} from "lucide-react";
import { 
  GasEvent, 
  CombinedModelCost, 
  FabricatedProductCost,
  MonthlyCostBreakdown, 
  OperatorSummary, 
  ElectricityRecord, 
  OperationalExpenseRecord,
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
      baseOpexCostPerTank: number;
      baseGasCostPerTank: number;
      baseTotalManufacturingCost: number;
      pureRotomoldingSalariesWithoutSAC: number;
      pureRotomoldingFabricatedWithoutSAC: number;
      totalOpex2026: number;
      totalCapex2026: number;
    };
    summary2026: any;
    operatorsData: OperatorSummary[];
    electricityRecords: ElectricityRecord[];
    operationalExpenses: OperationalExpenseRecord[];
    modelScores: CombinedModelCost[];
    fabricatedProducts: FabricatedProductCost[];
    intervals: GasIntervalMeasurement[];
    monthlyBreakdown: MonthlyCostBreakdown[];
    gasEvents: GasEvent[];
  } | null>(null);

  const [activeTab, setActiveTab] = useState<"cruce" | "matriz" | "gastos_opex" | "operarios" | "electricidad" | "gas" | "eventos">("cruce");
  const [selectedMonthFilter, setSelectedMonthFilter] = useState<string>("all");
  const [includeAguinaldo, setIncludeAguinaldo] = useState<boolean>(false);
  const [searchModel, setSearchModel] = useState<string>("");
  const [searchFabricated, setSearchFabricated] = useState<string>("");
  const [selectedFamily, setSelectedFamily] = useState<string>("all");

  // OPEX Tab Filters
  const [searchOpex, setSearchOpex] = useState<string>("");
  const [selectedOpexSubCat, setSelectedOpexSubCat] = useState<string>("all");
  const [selectedOpexAccount, setSelectedOpexAccount] = useState<string>("all");
  const [selectedOpexMonth, setSelectedOpexMonth] = useState<string>("all");

  // Cost simulator overrides
  const [customGasPrice, setCustomGasPrice] = useState<number | null>(null);
  const [customLaborCost, setCustomLaborCost] = useState<number | null>(null);
  const [customElectricCost, setCustomElectricCost] = useState<number | null>(null);
  const [customOpexCost, setCustomOpexCost] = useState<number | null>(null);

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

  const formatCurrency = (val?: number) => {
    if (val === undefined || val === null) return "$0";
    return `$${Math.round(val).toLocaleString("es-AR")}`;
  };

  const formatCurrencyExact = (val?: number) => {
    if (val === undefined || val === null) return "$0,00";
    return `$${val.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Dynamic values using simulator or defaults
  const effectiveGasPrice = customGasPrice ?? data?.tankStatus?.latestPricePerLiter ?? 1051.10;
  const effectiveBaseLabor = customLaborCost ?? data?.costBenchmarks?.baseLaborCostPerTank ?? 4800;
  const effectiveBaseElectricity = customElectricCost ?? data?.costBenchmarks?.baseElectricityCostPerTank ?? 815;
  const effectiveBaseOpex = customOpexCost ?? data?.costBenchmarks?.baseOpexCostPerTank ?? 2494;
  const effectiveBaseGas = Math.round((data?.summary2026?.avgGasLitersPerTank || 7.57) * effectiveGasPrice);
  const effectiveTotalBaseTransform = effectiveBaseGas + effectiveBaseLabor + effectiveBaseElectricity + effectiveBaseOpex;

  // Filtered fabricated products
  const filteredFabricatedProducts = useMemo(() => {
    if (!data?.fabricatedProducts) return [];
    return data.fabricatedProducts.filter(p => {
      const matchSearch = p.name.toLowerCase().includes(searchFabricated.toLowerCase()) || 
                          p.sku.toLowerCase().includes(searchFabricated.toLowerCase()) ||
                          p.family.toLowerCase().includes(searchFabricated.toLowerCase());
      const matchFamily = selectedFamily === "all" || p.family === selectedFamily;
      return matchSearch && matchFamily;
    }).map(p => {
      const gasCost = Math.round(p.gasLiters * effectiveGasPrice);
      const mdoCost = Math.round(p.score * effectiveBaseLabor);
      const luzCost = Math.round(p.score * effectiveBaseElectricity);
      const opexCost = Math.round(p.score * effectiveBaseOpex);
      const plantOpCost = gasCost + mdoCost + luzCost + opexCost;
      const totalIntegralCost = Math.round(p.costInsumos + plantOpCost);
      const marginValue = p.price > 0 ? p.price - totalIntegralCost : 0;
      const marginPct = p.price > 0 ? parseFloat(((marginValue / p.price) * 100).toFixed(1)) : 0;

      return {
        ...p,
        gasCost,
        mdoCost,
        luzCost,
        opexCost,
        plantOpCost,
        totalIntegralCost,
        marginValue,
        marginPct
      };
    });
  }, [data?.fabricatedProducts, searchFabricated, selectedFamily, effectiveGasPrice, effectiveBaseLabor, effectiveBaseElectricity, effectiveBaseOpex]);

  const uniqueFamilies = useMemo(() => {
    if (!data?.fabricatedProducts) return [];
    const setF = new Set<string>();
    data.fabricatedProducts.forEach(p => {
      if (p.family) setF.add(p.family);
    });
    return Array.from(setF);
  }, [data?.fabricatedProducts]);

  // Filtered operational expenses (OPEX)
  const filteredOpexExpenses = useMemo(() => {
    if (!data?.operationalExpenses) return [];
    return data.operationalExpenses.filter(e => {
      const matchSearch = e.concept.toLowerCase().includes(searchOpex.toLowerCase()) ||
                          e.description.toLowerCase().includes(searchOpex.toLowerCase()) ||
                          e.account.toLowerCase().includes(searchOpex.toLowerCase()) ||
                          e.subCategory.toLowerCase().includes(searchOpex.toLowerCase());
      
      let matchSubCat = true;
      if (selectedOpexSubCat === "maquinaria") matchSubCat = e.isMaquinaria;
      else if (selectedOpexSubCat === "instalaciones") matchSubCat = e.isInstalaciones;
      else if (selectedOpexSubCat === "insumos") matchSubCat = e.isInsumoDiario;
      else if (selectedOpexSubCat === "capex") matchSubCat = e.isCapex;

      const matchAccount = selectedOpexAccount === "all" || e.account.toLowerCase().includes(selectedOpexAccount.toLowerCase());
      const matchMonth = selectedOpexMonth === "all" || e.monthKey === selectedOpexMonth;

      return matchSearch && matchSubCat && matchAccount && matchMonth;
    });
  }, [data?.operationalExpenses, searchOpex, selectedOpexSubCat, selectedOpexAccount, selectedOpexMonth]);

  const opexFilteredTotal = useMemo(() => {
    return filteredOpexExpenses.reduce((acc, e) => acc + e.amount, 0);
  }, [filteredOpexExpenses]);

  // Global OPEX breakdown
  const opexStats = useMemo(() => {
    if (!data?.operationalExpenses) return { totalOpex: 0, maq: 0, inst: 0, insumos: 0, capex: 0 };
    let totalOpex = 0;
    let maq = 0;
    let inst = 0;
    let insumos = 0;
    let capex = 0;

    data.operationalExpenses.forEach(e => {
      if (e.isCapex) {
        capex += e.amount;
      } else {
        totalOpex += e.amount;
        if (e.isMaquinaria) maq += e.amount;
        else if (e.isInstalaciones) inst += e.amount;
        else if (e.isInsumoDiario) insumos += e.amount;
      }
    });

    return { totalOpex, maq, inst, insumos, capex };
  }, [data?.operationalExpenses]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 p-6 flex flex-col items-center justify-center space-y-4">
        <div className="relative">
          <div className="w-16 h-16 rounded-full border-4 border-amber-200 border-t-amber-600 animate-spin"></div>
          <Factory className="w-6 h-6 text-amber-600 absolute inset-0 m-auto animate-pulse" />
        </div>
        <p className="text-sm font-semibold text-slate-600">Calculando matriz de costos integral, gas y planta...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-50 p-6 flex items-center justify-center">
        <div className="bg-white rounded-2xl p-8 max-w-md w-full border border-red-100 shadow-sm text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-slate-800 mb-2">Error de Conexión</h2>
          <p className="text-sm text-slate-600 mb-6">{error || "No se pudieron obtener los datos de costos."}</p>
          <button onClick={fetchData} className="w-full py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-sm font-semibold transition">
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-16">
      {/* Top Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/admin" className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-linear-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white shadow-xs">
                <Factory className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-slate-900 leading-tight">Costos Integrales de Fabricación</h1>
                <p className="text-xs text-slate-500 font-medium">Insumos (Col E) • Gas GLP • Mano de Obra • Edenor • Gastos Operativos & Mantenimiento</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={fetchData}
              disabled={loading}
              className="inline-flex items-center gap-2 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition shadow-2xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              Actualizar
            </button>
            <Link
              href="https://docs.google.com/spreadsheets/d/1k112jRkUR6SqMtjHg0rWzFF3iyHNa-VBiVSs3GoEnko/edit"
              target="_blank"
              className="inline-flex items-center gap-2 px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-semibold transition shadow-2xs"
            >
              <Receipt className="w-3.5 h-3.5" />
              Planilla Oficial
            </Link>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex overflow-x-auto border-t border-slate-100 gap-1 py-1 scrollbar-none">
          <button
            onClick={() => setActiveTab("cruce")}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition flex items-center gap-1.5 ${
              activeTab === "cruce"
                ? "bg-amber-50 text-amber-800 border border-amber-200/80 shadow-2xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/70"
            }`}
          >
            <Award className="w-3.5 h-3.5" />
            Cruce Integral & Rentabilidad (Fabricados)
            <span className="ml-1 bg-amber-200 text-amber-900 text-[10px] px-1.5 py-0.2 rounded-full font-bold">21</span>
          </button>

          <button
            onClick={() => setActiveTab("matriz")}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition flex items-center gap-1.5 ${
              activeTab === "matriz"
                ? "bg-amber-50 text-amber-800 border border-amber-200/80 shadow-2xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/70"
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            Evolución Mensual Consolidada
          </button>

          <button
            onClick={() => setActiveTab("gastos_opex")}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition flex items-center gap-1.5 ${
              activeTab === "gastos_opex"
                ? "bg-amber-50 text-amber-800 border border-amber-200/80 shadow-2xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/70"
            }`}
          >
            <Wrench className="w-3.5 h-3.5" />
            Gastos Operativos & Mantenimiento
            <span className="ml-1 bg-purple-100 text-purple-800 text-[10px] px-1.5 py-0.2 rounded-full font-bold">$2.494/u</span>
          </button>

          <button
            onClick={() => setActiveTab("operarios")}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition flex items-center gap-1.5 ${
              activeTab === "operarios"
                ? "bg-amber-50 text-amber-800 border border-amber-200/80 shadow-2xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/70"
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            Mano de Obra & Sueldos
          </button>

          <button
            onClick={() => setActiveTab("electricidad")}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition flex items-center gap-1.5 ${
              activeTab === "electricidad"
                ? "bg-amber-50 text-amber-800 border border-amber-200/80 shadow-2xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/70"
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            Electricidad Edenor
          </button>

          <button
            onClick={() => setActiveTab("gas")}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition flex items-center gap-1.5 ${
              activeTab === "gas"
                ? "bg-amber-50 text-amber-800 border border-amber-200/80 shadow-2xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/70"
            }`}
          >
            <Flame className="w-3.5 h-3.5" />
            Zeppelin & Gas GLP
          </button>

          <button
            onClick={() => setActiveTab("eventos")}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition flex items-center gap-1.5 ${
              activeTab === "eventos"
                ? "bg-amber-50 text-amber-800 border border-amber-200/80 shadow-2xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/70"
            }`}
          >
            <History className="w-3.5 h-3.5" />
            Historial de Cargas
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">

        {/* TAB: CRUCE INTEGRAL & RENTABILIDAD (21 PRODUCTOS FABRICADOS) */}
        {activeTab === "cruce" && (
          <div className="space-y-6">
            {/* Top KPIs Summary */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Gas Propano Base</span>
                <div className="text-xl font-black text-amber-600 mt-1">{formatCurrency(effectiveBaseGas)}</div>
                <p className="text-[11px] text-slate-500 mt-0.5 font-medium">7,57 L @ {formatCurrencyExact(effectiveGasPrice)}/L</p>
              </div>

              <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Mano de Obra Base</span>
                <div className="text-xl font-black text-blue-600 mt-1">{formatCurrency(effectiveBaseLabor)}</div>
                <p className="text-[11px] text-slate-500 mt-0.5 font-medium">Rotomoldeo directo por unidad</p>
              </div>

              <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Edenor Luz Base</span>
                <div className="text-xl font-black text-amber-500 mt-1">{formatCurrency(effectiveBaseElectricity)}</div>
                <p className="text-[11px] text-slate-500 mt-0.5 font-medium">Consumo turbinas y motores</p>
              </div>

              <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Gastos OPEX & Mant.</span>
                <div className="text-xl font-black text-purple-600 mt-1">{formatCurrency(effectiveBaseOpex)}</div>
                <p className="text-[11px] text-slate-500 mt-0.5 font-medium">Repuestos, inst. e insumos diarios</p>
              </div>

              <div className="bg-linear-to-br from-slate-900 to-slate-800 rounded-2xl p-4 text-white shadow-xs">
                <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">Transformación Planta</span>
                <div className="text-xl font-black text-emerald-400 mt-1">{formatCurrency(effectiveTotalBaseTransform)}</div>
                <p className="text-[11px] text-slate-300 mt-0.5 font-medium">Gas + MDO + Luz + OPEX (Score 1.0)</p>
              </div>
            </div>

            {/* Filters Bar */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3 flex-1">
                <div className="relative flex-1 min-w-[240px]">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type="text"
                    value={searchFabricated}
                    onChange={(e) => setSearchFabricated(e.target.value)}
                    placeholder="Buscar producto fabricado (ej: TRIC 500, Tacho, BIC 600)..."
                    className="w-full pl-9 pr-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-amber-500 focus:outline-hidden transition"
                  />
                </div>

                <div className="flex items-center gap-1 overflow-x-auto scrollbar-none py-1">
                  <button
                    onClick={() => setSelectedFamily("all")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap ${
                      selectedFamily === "all"
                        ? "bg-slate-900 text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    Todos ({data.fabricatedProducts.length})
                  </button>
                  {uniqueFamilies.map(fam => (
                    <button
                      key={fam}
                      onClick={() => setSelectedFamily(fam)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap ${
                        selectedFamily === fam
                          ? "bg-amber-600 text-white shadow-2xs"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      {fam}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Main Fabricated Products Table */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
              <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Matriz de Costos Integrales y Margen Real de Fabricación</h3>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    Materia prima real (Columna E) + Gas GLP + Mano de obra + Edenor + Gastos Operativos de Planta
                  </p>
                </div>
                <div className="text-xs font-semibold text-slate-500">
                  Mostrando <strong className="text-slate-800">{filteredFabricatedProducts.length}</strong> de {data.fabricatedProducts.length} modelos
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50/80 text-slate-600 font-bold border-b border-slate-200">
                      <th className="py-3 px-4">Producto Fabricado</th>
                      <th className="py-3 px-3">Familia</th>
                      <th className="py-3 px-2 text-center">Score</th>
                      <th className="py-3 px-3 text-right">Insumos (Col E)</th>
                      <th className="py-3 px-3 text-right text-amber-700">Gas GLP</th>
                      <th className="py-3 px-3 text-right text-blue-700">Mano Obra</th>
                      <th className="py-3 px-3 text-right text-amber-600">Edenor</th>
                      <th className="py-3 px-3 text-right text-purple-700">Gastos OPEX</th>
                      <th className="py-3 px-3 text-right font-black text-slate-900 bg-slate-100/50">Costo Planta</th>
                      <th className="py-3 px-4 text-right font-black text-slate-900 bg-amber-50/50">Costo Integral</th>
                      <th className="py-3 px-3 text-right font-bold text-slate-700">Precio Venta</th>
                      <th className="py-3 px-4 text-right font-black text-emerald-700">Margen Bruto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredFabricatedProducts.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50/80 transition">
                        <td className="py-3 px-4 font-bold text-slate-900">
                          {p.name}
                        </td>
                        <td className="py-3 px-3 text-slate-600 font-medium">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700">
                            {p.family}
                          </span>
                        </td>
                        <td className="py-3 px-2 text-center font-bold text-slate-500">
                          {p.score.toFixed(2)}
                        </td>
                        <td className="py-3 px-3 text-right font-bold text-slate-800">
                          {formatCurrency(p.costInsumos)}
                        </td>
                        <td className="py-3 px-3 text-right font-semibold text-amber-700">
                          {formatCurrency(p.gasCost)}
                        </td>
                        <td className="py-3 px-3 text-right font-semibold text-blue-700">
                          {formatCurrency(p.mdoCost)}
                        </td>
                        <td className="py-3 px-3 text-right font-semibold text-amber-600">
                          {formatCurrency(p.luzCost)}
                        </td>
                        <td className="py-3 px-3 text-right font-semibold text-purple-700">
                          {formatCurrency(p.opexCost)}
                        </td>
                        <td className="py-3 px-3 text-right font-black text-slate-900 bg-slate-50/60">
                          {formatCurrency(p.plantOpCost)}
                        </td>
                        <td className="py-3 px-4 text-right font-black text-slate-900 bg-amber-50/60">
                          {formatCurrency(p.totalIntegralCost)}
                        </td>
                        <td className="py-3 px-3 text-right font-bold text-slate-700">
                          {formatCurrency(p.price)}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="font-black text-emerald-700">{formatCurrency(p.marginValue)}</div>
                          <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded-sm ${
                            p.marginPct >= 50 ? "bg-emerald-100 text-emerald-800" :
                            p.marginPct >= 40 ? "bg-blue-100 text-blue-800" : "bg-amber-100 text-amber-800"
                          }`}>
                            {p.marginPct.toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB: GASTOS OPERATIVOS & MANTENIMIENTO (NUEVA PESTAÑA) */}
        {activeTab === "gastos_opex" && (
          <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="bg-white rounded-2xl p-4 border border-purple-200/80 shadow-xs bg-linear-to-br from-purple-50/40 to-white">
                <span className="text-[11px] font-bold text-purple-700 uppercase tracking-wider">Total OPEX Planta 2026</span>
                <div className="text-xl font-black text-purple-900 mt-1">{formatCurrency(opexStats.totalOpex)}</div>
                <p className="text-[11px] text-purple-700 font-bold mt-0.5">
                  Promedio: {formatCurrency(data.costBenchmarks.baseOpexCostPerTank)} / tanque
                </p>
              </div>

              <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Mantenimiento Maquinaria</span>
                <div className="text-xl font-black text-slate-900 mt-1">{formatCurrency(opexStats.maq)}</div>
                <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                  {((opexStats.maq / opexStats.totalOpex) * 100).toFixed(1)}% • $1.438 / tanque
                </p>
              </div>

              <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Mantenimiento Instalaciones</span>
                <div className="text-xl font-black text-slate-900 mt-1">{formatCurrency(opexStats.inst)}</div>
                <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                  {((opexStats.inst / opexStats.totalOpex) * 100).toFixed(1)}% • $569 / tanque
                </p>
              </div>

              <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Insumos Diarios Taller</span>
                <div className="text-xl font-black text-slate-900 mt-1">{formatCurrency(opexStats.insumos)}</div>
                <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                  {((opexStats.insumos / opexStats.totalOpex) * 100).toFixed(1)}% • $487 / tanque
                </p>
              </div>

              <div className="bg-white rounded-2xl p-4 border border-blue-200/80 shadow-xs bg-linear-to-br from-blue-50/40 to-white">
                <span className="text-[11px] font-bold text-blue-700 uppercase tracking-wider">💎 Inversión Maquinaria (CAPEX)</span>
                <div className="text-xl font-black text-blue-900 mt-1">{formatCurrency(opexStats.capex)}</div>
                <p className="text-[11px] text-blue-600 font-medium mt-0.5">Excluido de OPEX (Bienes de uso)</p>
              </div>
            </div>

            {/* Filter and Search Bar */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3 flex-1">
                <div className="relative flex-1 min-w-[240px]">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type="text"
                    value={searchOpex}
                    onChange={(e) => setSearchOpex(e.target.value)}
                    placeholder="Buscar por concepto, repuesto, cuenta o descripción..."
                    className="w-full pl-9 pr-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-purple-500 focus:outline-hidden transition"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={selectedOpexSubCat}
                    onChange={(e) => setSelectedOpexSubCat(e.target.value)}
                    className="py-2 px-3 text-xs bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-700 focus:bg-white focus:border-purple-500"
                  >
                    <option value="all">Todas las Categorías</option>
                    <option value="maquinaria">Mantenimiento Maquinaria</option>
                    <option value="instalaciones">Mantenimiento Instalaciones</option>
                    <option value="insumos">Insumos Diarios Taller</option>
                    <option value="capex">Compra Maquinaria (CAPEX)</option>
                  </select>

                  <select
                    value={selectedOpexAccount}
                    onChange={(e) => setSelectedOpexAccount(e.target.value)}
                    className="py-2 px-3 text-xs bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-700 focus:bg-white focus:border-purple-500"
                  >
                    <option value="all">Todas las Cuentas</option>
                    <option value="mp">Mercado Pago</option>
                    <option value="efectivo">Caja Efectivo</option>
                  </select>

                  <select
                    value={selectedOpexMonth}
                    onChange={(e) => setSelectedOpexMonth(e.target.value)}
                    className="py-2 px-3 text-xs bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-700 focus:bg-white focus:border-purple-500"
                  >
                    <option value="all">Todos los Meses 2026</option>
                    {data.monthlyBreakdown.map(m => (
                      <option key={m.monthKey} value={m.monthKey}>{m.monthName}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="text-xs font-bold text-purple-900 bg-purple-50 px-3.5 py-2 rounded-xl border border-purple-200">
                Suma Filtrada: <span className="font-black text-purple-700">{formatCurrency(opexFilteredTotal)}</span>
              </div>
            </div>

            {/* Expenses History Table */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
              <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Histórico de Comprobantes de Gastos Operativos de Planta</h3>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    157 comprobantes registrados en la hoja GASTOS_OPERATIVOS
                  </p>
                </div>
                <span className="text-xs font-semibold text-slate-500">
                  {filteredOpexExpenses.length} registros
                </span>
              </div>

              <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="sticky top-0 bg-slate-50 text-slate-600 font-bold border-b border-slate-200 shadow-2xs z-10">
                    <tr>
                      <th className="py-3 px-4">Fecha</th>
                      <th className="py-3 px-3">Subcategoría</th>
                      <th className="py-3 px-4">Concepto & Descripción</th>
                      <th className="py-3 px-3">Cuenta Pago</th>
                      <th className="py-3 px-3">Mes Imputado</th>
                      <th className="py-3 px-4 text-right">Monto ($)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredOpexExpenses.map((exp) => (
                      <tr key={exp.id} className={`hover:bg-slate-50/80 transition ${exp.isCapex ? "bg-blue-50/30" : ""}`}>
                        <td className="py-3 px-4 font-semibold text-slate-700 whitespace-nowrap">
                          {exp.dateFormatted}
                        </td>
                        <td className="py-3 px-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            exp.isCapex ? "bg-blue-100 text-blue-800" :
                            exp.isMaquinaria ? "bg-amber-100 text-amber-800" :
                            exp.isInstalaciones ? "bg-purple-100 text-purple-800" : "bg-emerald-100 text-emerald-800"
                          }`}>
                            {exp.subCategory}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900">{exp.concept}</div>
                          {exp.description && (
                            <div className="text-[11px] text-slate-500 font-medium mt-0.5">{exp.description}</div>
                          )}
                        </td>
                        <td className="py-3 px-3 text-slate-600 font-medium">
                          {exp.account}
                        </td>
                        <td className="py-3 px-3 text-slate-600 font-medium whitespace-nowrap">
                          {exp.monthName}
                        </td>
                        <td className="py-3 px-4 text-right font-black text-slate-900 whitespace-nowrap">
                          {formatCurrency(exp.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB: EVOLUCIÓN MENSUAL CONSOLIDADA */}
        {activeTab === "matriz" && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
              <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50">
                <h3 className="text-sm font-bold text-slate-900">Evolución Mensual Consolidada de Costos de Planta</h3>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  Consolidación real de Gas GLP + Mano de Obra + Edenor + Gastos Operativos / Mantenimiento
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                      <th className="py-3 px-4">Mes</th>
                      <th className="py-3 px-3 text-center">Tanques</th>
                      <th className="py-3 px-3 text-right text-amber-700">Gas (L)</th>
                      <th className="py-3 px-3 text-right text-amber-700">Rendimiento (L/u)</th>
                      <th className="py-3 px-3 text-right text-amber-700">Gas ($)</th>
                      <th className="py-3 px-3 text-right text-blue-700">MDO ($)</th>
                      <th className="py-3 px-3 text-right text-amber-600">Luz Edenor ($)</th>
                      <th className="py-3 px-3 text-right text-purple-700">Gastos OPEX ($)</th>
                      <th className="py-3 px-4 text-right font-black text-slate-900 bg-slate-100/60">Total Planta ($)</th>
                      <th className="py-3 px-4 text-right font-black text-emerald-800 bg-emerald-50/60">Costo / Tanque</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.monthlyBreakdown.map((m) => (
                      <tr key={m.monthKey} className="hover:bg-slate-50/80 transition">
                        <td className="py-3 px-4 font-bold text-slate-900">{m.monthName}</td>
                        <td className="py-3 px-3 text-center font-bold text-slate-700">{m.tanquesFabricados} u</td>
                        <td className="py-3 px-3 text-right font-semibold text-amber-700">{m.gasLitros.toLocaleString("es-AR")} L</td>
                        <td className="py-3 px-3 text-right font-semibold text-amber-700">{m.gasLitrosPorTanque.toFixed(2)} L/u</td>
                        <td className="py-3 px-3 text-right font-semibold text-amber-700">{formatCurrency(m.gasInversion)}</td>
                        <td className="py-3 px-3 text-right font-semibold text-blue-700">{formatCurrency(m.mdoTotal)}</td>
                        <td className="py-3 px-3 text-right font-semibold text-amber-600">{formatCurrency(m.luzTotal)}</td>
                        <td className="py-3 px-3 text-right font-semibold text-purple-700">{formatCurrency(m.opexTotal)}</td>
                        <td className="py-3 px-4 text-right font-black text-slate-900 bg-slate-50/60">{formatCurrency(m.costoTotalOperativo)}</td>
                        <td className="py-3 px-4 text-right font-black text-emerald-800 bg-emerald-50/60">{formatCurrency(m.costoUnitarioTotal)} / u</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB: OPERARIOS & MANO DE OBRA */}
        {activeTab === "operarios" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {data.operatorsData.map((op) => (
                <div key={op.key} className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-bold text-slate-900">{op.name}</h4>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        op.isMaintenanceSupport ? "bg-purple-100 text-purple-800" :
                        op.isWarehouse ? "bg-blue-100 text-blue-800" : "bg-amber-100 text-amber-800"
                      }`}>
                        {op.role}
                      </span>
                    </div>
                    {op.notes && (
                      <p className="text-xs text-slate-500 font-medium mb-4">{op.notes}</p>
                    )}
                  </div>

                  <div className="space-y-2 pt-3 border-t border-slate-100 text-xs">
                    <div className="flex justify-between text-slate-600">
                      <span>Sueldo Acumulado 2026:</span>
                      <strong className="text-slate-900">{formatCurrency(op.totalSalary)}</strong>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Tanques Fabricados:</span>
                      <strong className="text-slate-900">{op.totalTanksFabricated} u</strong>
                    </div>
                    {op.totalTanksFabricated > 0 && (
                      <div className="flex justify-between text-slate-600">
                        <span>Costo Unitario MDO:</span>
                        <strong className="text-emerald-700">{formatCurrency(op.avgCostPerFabricatedTank)} / u</strong>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB: ELECTRICIDAD EDENOR */}
        {activeTab === "electricidad" && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
              <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50">
                <h3 className="text-sm font-bold text-slate-900">Historial de Facturas Edenor (Planta Quilmes 4550)</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                      <th className="py-3 px-4">Fecha Pago</th>
                      <th className="py-3 px-4">Mes Consumido</th>
                      <th className="py-3 px-4">Concepto</th>
                      <th className="py-3 px-4 text-center">Tanques en Mes</th>
                      <th className="py-3 px-4 text-right">Monto Total ($)</th>
                      <th className="py-3 px-4 text-right font-black text-amber-600">Costo / Tanque</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.electricityRecords.map((el) => (
                      <tr key={el.id} className="hover:bg-slate-50/80 transition">
                        <td className="py-3 px-4 font-semibold text-slate-700">{el.paymentDateFormatted}</td>
                        <td className="py-3 px-4 font-bold text-slate-900">{el.consumedMonthName}</td>
                        <td className="py-3 px-4 text-slate-600 font-medium">{el.concept}</td>
                        <td className="py-3 px-4 text-center font-bold text-slate-700">{el.tanksProducedInMonth} u</td>
                        <td className="py-3 px-4 text-right font-bold text-slate-900">{formatCurrency(el.amount)}</td>
                        <td className="py-3 px-4 text-right font-black text-amber-600">{formatCurrency(el.costPerTank)} / u</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB: ZEPPELIN & GAS GLP */}
        {activeTab === "gas" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Nivel Actual Zeppelin</span>
                <div className="text-2xl font-black text-amber-600 mt-1">{data.tankStatus.currentPercentage.toFixed(1)}%</div>
                <p className="text-xs text-slate-500 mt-0.5">{Math.round(data.tankStatus.currentLiters)} Litros disponibles</p>
              </div>

              <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Última Lectura</span>
                <div className="text-2xl font-black text-slate-900 mt-1">{data.tankStatus.lastReadingDate}</div>
                <p className="text-xs text-slate-500 mt-0.5">Hora: {data.tankStatus.lastReadingTime}</p>
              </div>

              <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Última Recarga</span>
                <div className="text-2xl font-black text-slate-900 mt-1">{data.tankStatus.lastRefillDate}</div>
                <p className="text-xs text-slate-500 mt-0.5">{data.tankStatus.lastRefillLiters} Litros cargados</p>
              </div>

              <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Precio Litro GLP</span>
                <div className="text-2xl font-black text-emerald-700 mt-1">{formatCurrencyExact(data.tankStatus.latestPricePerLiter)}</div>
                <p className="text-xs text-slate-500 mt-0.5">Precio vigente YPF Gas</p>
              </div>
            </div>
          </div>
        )}

        {/* TAB: EVENTOS & RECARGAS */}
        {activeTab === "eventos" && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
              <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50">
                <h3 className="text-sm font-bold text-slate-900">Histórico de Recargas y Lecturas del Zeppelin</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                      <th className="py-3 px-4">Fecha</th>
                      <th className="py-3 px-3">Hora</th>
                      <th className="py-3 px-3">Tipo</th>
                      <th className="py-3 px-3 text-center">% Antes</th>
                      <th className="py-3 px-3 text-right">Litros Cargados</th>
                      <th className="py-3 px-3 text-center">% Después</th>
                      <th className="py-3 px-3 text-right">Precio/L</th>
                      <th className="py-3 px-4 text-right font-black text-slate-900">Total Factura</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.gasEvents.map((ev) => (
                      <tr key={ev.id} className="hover:bg-slate-50/80 transition">
                        <td className="py-3 px-4 font-semibold text-slate-700">{ev.fechaFormatted}</td>
                        <td className="py-3 px-3 text-slate-500">{ev.hora}</td>
                        <td className="py-3 px-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            ev.tipo === "Recarga" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700"
                          }`}>
                            {ev.tipo}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center font-semibold text-slate-600">{ev.porcentajeAntes > 0 ? `${ev.porcentajeAntes}%` : "—"}</td>
                        <td className="py-3 px-3 text-right font-bold text-amber-700">{ev.cargaLitros > 0 ? `${ev.cargaLitros} L` : "—"}</td>
                        <td className="py-3 px-3 text-center font-semibold text-slate-600">{ev.porcentajeDespues > 0 ? `${ev.porcentajeDespues}%` : "—"}</td>
                        <td className="py-3 px-3 text-right font-medium text-slate-700">{formatCurrencyExact(ev.precioLitro)}</td>
                        <td className="py-3 px-4 text-right font-black text-slate-900">{ev.costoTotal > 0 ? formatCurrency(ev.costoTotal) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}

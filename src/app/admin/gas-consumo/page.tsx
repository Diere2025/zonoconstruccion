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
  Search,
  ChevronDown,
  AlertTriangle,
  Package,
  Boxes,
  Briefcase,
  Receipt,
  PiggyBank,
  CalendarDays,
  BarChart2,
  PieChart,
  ArrowUpRight,
  Filter,
  Scale
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
  
  // Selected calculation period for Cruce Integral: "current" (Agosto 2026), "annual" (Promedio Anual), or specific "2026-07", etc.
  const [selectedPeriod, setSelectedPeriod] = useState<string>("current");
  
  const [searchFabricatedInput, setSearchFabricatedInput] = useState<string>("");
  const [selectedFamily, setSelectedFamily] = useState<string>("all");

  // OPEX Tab Period & Filter State: "all" (Todo el Año) or specific "2026-08", "2026-07", etc.
  const [selectedOpexPeriod, setSelectedOpexPeriod] = useState<string>("all");
  const [searchOpex, setSearchOpex] = useState<string>("");
  const [selectedOpexSubCat, setSelectedOpexSubCat] = useState<string>("all");

  // Make vs Buy Simulator State
  const [simulatorModelSku, setSimulatorModelSku] = useState<string>("AquaFort - TRIC 500L Gris");
  const [simulatorOfferPrice, setSimulatorOfferPrice] = useState<number>(65000);
  const [showSimulator, setShowSimulator] = useState<boolean>(true);

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

  const MONTH_NAMES_ES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

  const formatMonthName = (yearMonth: string) => {
    if (!yearMonth || !yearMonth.includes('-')) return yearMonth;
    const [y, m] = yearMonth.split('-').map(Number);
    if (!y || !m) return yearMonth;
    return `${MONTH_NAMES_ES[m - 1]} ${y}`;
  };

  const formatCurrency = (val?: number) => {
    if (val === undefined || val === null) return "$0";
    return `$${Math.round(val).toLocaleString("es-AR")}`;
  };

  const formatCurrencyExact = (val?: number) => {
    if (val === undefined || val === null) return "$0,00";
    return `$${val.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Base benchmarks calculated dynamically based on selected period
  const activePeriodMetrics = useMemo(() => {
    if (!data) {
      return {
        label: "Mes Actual (Agosto 2026)",
        gasPrice: 1051.10,
        gasLitersPerTank: 7.57,
        gasCostPerTank: 7957,
        laborCostPerTank: 4800,
        electricityCostPerTank: 815,
        opexCostPerTank: 1412,
        totalPlantCostPerTank: 14984,
        tanksInPeriod: 541
      };
    }

    const latestPrice = data.tankStatus?.latestPricePerLiter || 1051.10;

    if (selectedPeriod === "annual") {
      const avgGasL = data.summary2026?.avgGasLitersPerTank || 7.57;
      const gasCost = Math.round(avgGasL * latestPrice);
      const laborCost = data.costBenchmarks.baseLaborCostPerTank || 4800;
      const electricCost = data.costBenchmarks.baseElectricityCostPerTank || 815;
      const opexCost = data.costBenchmarks.baseOpexCostPerTank || 2494;
      const totalPlant = gasCost + laborCost + electricCost + opexCost;

      return {
        label: "Promedio Anual Acumulado 2026 (Consolidado)",
        gasPrice: latestPrice,
        gasLitersPerTank: avgGasL,
        gasCostPerTank: gasCost,
        laborCostPerTank: laborCost,
        electricityCostPerTank: electricCost,
        opexCostPerTank: opexCost,
        totalPlantCostPerTank: totalPlant,
        tanksInPeriod: data.summary2026?.totalTanksRotomolded || 4472
      };
    }

    // Specific Month or Current Month ("current" defaults to latest month in breakdown)
    const targetMonthKey = selectedPeriod === "current" ? (data.monthlyBreakdown[0]?.monthKey || "2026-09") : selectedPeriod;
    const monthData = data.monthlyBreakdown.find(m => m.monthKey === targetMonthKey);

    if (monthData) {
      const gasLiters = monthData.gasLitrosPorTanque > 0 ? monthData.gasLitrosPorTanque : (data.summary2026?.avgGasLitersPerTank || 7.57);
      const gasCost = Math.round(gasLiters * latestPrice);
      const laborCost = (monthData as any).mdoDirectaCostoUnitario > 0 ? (monthData as any).mdoDirectaCostoUnitario : (data.costBenchmarks.baseLaborCostPerTank || 4800);
      const electricCost = monthData.luzCostoUnitario > 0 ? monthData.luzCostoUnitario : (data.costBenchmarks.baseElectricityCostPerTank || 815);
      const opexCost = monthData.opexCostoUnitario > 0 ? monthData.opexCostoUnitario : (data.costBenchmarks.baseOpexCostPerTank || 2494);
      const totalPlant = gasCost + laborCost + electricCost + opexCost;

      const isCurrentInCourse = selectedPeriod === "current" || monthData.monthKey === data.monthlyBreakdown[0]?.monthKey;
      const mdoNote = monthData.isEstimatedMdo ? " (Base MDO: Julio 2026)" : "";

      return {
        label: `${monthData.monthName} ${isCurrentInCourse ? "(Mes en Curso)" : ""}${mdoNote}`,
        gasPrice: latestPrice,
        gasLitersPerTank: gasLiters,
        gasCostPerTank: gasCost,
        laborCostPerTank: laborCost,
        electricityCostPerTank: electricCost,
        opexCostPerTank: opexCost,
        totalPlantCostPerTank: totalPlant,
        tanksInPeriod: monthData.tanquesFabricados
      };
    }

    return {
      label: "Mes Actual (Septiembre 2026 - Base MDO: Julio)",
      gasPrice: latestPrice,
      gasLitersPerTank: 7.57,
      gasCostPerTank: 7957,
      laborCostPerTank: 4800,
      electricityCostPerTank: 815,
      opexCostPerTank: 2494,
      totalPlantCostPerTank: 16066,
      tanksInPeriod: 517
    };
  }, [data, selectedPeriod]);

  // Product Ordering Helper: 1. Tricapa Gris, 2. Tricapa Beige, 3. Bicapa, 4. Cuatricapa, 5. Resto
  const getProductSortRank = (name: string): { groupRank: number; liters: number } => {
    const lower = name.toLowerCase();
    const match = lower.match(/(\d+)\s*l/);
    const liters = match ? parseInt(match[1], 10) : 9999;

    // 1. Tricapa Gris
    if ((lower.includes('tric') || lower.includes('tricapa')) && lower.includes('gris')) {
      return { groupRank: 1, liters };
    }
    // 2. Tricapa Beige
    if ((lower.includes('tric') || lower.includes('tricapa')) && lower.includes('beige')) {
      return { groupRank: 2, liters };
    }
    // 1b. Tricapa general
    if (lower.includes('tric') || lower.includes('tricapa')) {
      return { groupRank: 2.5, liters };
    }
    // 3. Bicapa
    if (lower.includes('bic') || lower.includes('bicapa')) {
      return { groupRank: 3, liters };
    }
    // 4. Cuatricapa
    if (lower.includes('cuatr') || lower.includes('cuatricapa')) {
      return { groupRank: 4, liters };
    }
    // 5. Resto (Cisternas, Tachos, Conos, etc.)
    return { groupRank: 5, liters };
  };

  // Filtered fabricated products
  const filteredFabricatedProducts = useMemo(() => {
    if (!data?.fabricatedProducts) return [];
    return data.fabricatedProducts.filter(p => {
      // Exclude CIEGO variants
      if (p.name.toLowerCase().includes('ciego')) return false;

      const matchSearch = p.name.toLowerCase().includes(searchFabricatedInput.toLowerCase()) || 
                          p.sku.toLowerCase().includes(searchFabricatedInput.toLowerCase()) ||
                          p.family.toLowerCase().includes(searchFabricatedInput.toLowerCase());
      const matchFamily = selectedFamily === "all" || p.family === selectedFamily;
      return matchSearch && matchFamily;
    }).map(p => {
      const gasCost = Math.round(p.score * activePeriodMetrics.gasCostPerTank);
      const mdoCost = Math.round(p.score * activePeriodMetrics.laborCostPerTank);
      const luzCost = Math.round(p.score * activePeriodMetrics.electricityCostPerTank);
      const opexCost = Math.round(p.score * activePeriodMetrics.opexCostPerTank);
      const plantOpCost = gasCost + mdoCost + luzCost + opexCost;
      const costoDirectoMarginal = Math.round(p.costInsumos + gasCost);
      const costoDirectoPlanta = Math.round(costoDirectoMarginal + mdoCost);
      const costoEstructuraFija = Math.round(luzCost + opexCost);
      const totalIntegralCost = Math.round(p.costInsumos + plantOpCost);
      const marginValue = p.price > 0 ? p.price - totalIntegralCost : 0;
      const marginPct = p.price > 0 ? parseFloat(((marginValue / p.price) * 100).toFixed(1)) : 0;

      return {
        ...p,
        gasCost,
        mdoCost,
        luzCost,
        opexCost,
        costoDirectoMarginal,
        costoDirectoPlanta,
        costoEstructuraFija,
        plantOpCost,
        totalIntegralCost,
        marginValue,
        marginPct
      };
    }).sort((a, b) => {
      const rankA = getProductSortRank(a.name);
      const rankB = getProductSortRank(b.name);
      if (rankA.groupRank !== rankB.groupRank) {
        return rankA.groupRank - rankB.groupRank;
      }
      if (rankA.liters !== rankB.liters) {
        return rankA.liters - rankB.liters;
      }
      return a.name.localeCompare(b.name);
    });
  }, [data?.fabricatedProducts, searchFabricatedInput, selectedFamily, activePeriodMetrics]);

  const uniqueFamilies = useMemo(() => {
    if (!data?.fabricatedProducts) return [];
    const setF = new Set<string>();
    data.fabricatedProducts.forEach(p => {
      if (p.family && !p.name.toLowerCase().includes('ciego')) setF.add(p.family);
    });
    return Array.from(setF);
  }, [data?.fabricatedProducts]);

  const selectedSimProduct = useMemo(() => {
    if (!data?.fabricatedProducts) return null;
    return data.fabricatedProducts.find(p => p.name === simulatorModelSku) || data.fabricatedProducts[0];
  }, [data?.fabricatedProducts, simulatorModelSku]);

  const simMetrics = useMemo(() => {
    if (!selectedSimProduct) return null;
    const score = selectedSimProduct.score || 1.0;
    const insumos = selectedSimProduct.costInsumos || 0;
    const gas = Math.round(score * activePeriodMetrics.gasCostPerTank);
    const mdoHorno = Math.round(score * activePeriodMetrics.laborCostPerTank);
    const luz = Math.round(score * activePeriodMetrics.electricityCostPerTank);
    const opex = Math.round(score * activePeriodMetrics.opexCostPerTank);

    const costoPuroEvitable = insumos + gas;
    const costoDirectoPlanta = costoPuroEvitable + mdoHorno;
    const costoEstructuraFija = luz + opex;
    const costoIntegralTotal = costoDirectoPlanta + costoEstructuraFija;

    const difVsPuro = simulatorOfferPrice - costoPuroEvitable;
    const convieneComprar = simulatorOfferPrice < costoPuroEvitable;
    const sobrecostoReal = simulatorOfferPrice + costoEstructuraFija - costoIntegralTotal;

    return {
      name: selectedSimProduct.name,
      score,
      insumos,
      gas,
      mdoHorno,
      luz,
      opex,
      costoPuroEvitable,
      costoDirectoPlanta,
      costoEstructuraFija,
      costoIntegralTotal,
      difVsPuro,
      convieneComprar,
      sobrecostoReal
    };
  }, [selectedSimProduct, activePeriodMetrics, simulatorOfferPrice]);

  // OPEX Data in Selected Period (Monthly vs Annual)
  const opexInPeriod = useMemo(() => {
    if (!data?.operationalExpenses) return [];
    return data.operationalExpenses.filter(e => {
      if (selectedOpexPeriod === "all") return true;
      return e.monthKey === selectedOpexPeriod;
    });
  }, [data?.operationalExpenses, selectedOpexPeriod]);

  // Filtered operational expenses (OPEX) in the table
  const filteredOpexExpenses = useMemo(() => {
    return opexInPeriod.filter(e => {
      const matchSearch = e.concept.toLowerCase().includes(searchOpex.toLowerCase()) ||
                          e.description.toLowerCase().includes(searchOpex.toLowerCase()) ||
                          e.subCategory.toLowerCase().includes(searchOpex.toLowerCase());
      
      let matchSubCat = true;
      if (selectedOpexSubCat === "mo_mantenimiento") matchSubCat = (e as any).isMdoMantenimiento;
      else if (selectedOpexSubCat === "maquinaria") matchSubCat = e.isMaquinaria;
      else if (selectedOpexSubCat === "instalaciones") matchSubCat = e.isInstalaciones;
      else if (selectedOpexSubCat === "insumos") matchSubCat = e.isInsumoDiario;
      else if (selectedOpexSubCat === "capex") matchSubCat = e.isCapex;

      return matchSearch && matchSubCat;
    });
  }, [opexInPeriod, searchOpex, selectedOpexSubCat]);

  const opexFilteredTotal = useMemo(() => {
    return filteredOpexExpenses.reduce((acc, e) => acc + e.amount, 0);
  }, [filteredOpexExpenses]);

  // OPEX stats in selected period
  const opexStats = useMemo(() => {
    let totalOpex = 0;
    let moMantenimiento = 0;
    let maq = 0;
    let inst = 0;
    let insumos = 0;
    let capex = 0;

    opexInPeriod.forEach(e => {
      if (e.isCapex) {
        capex += e.amount;
      } else {
        totalOpex += e.amount;
        if ((e as any).isMdoMantenimiento) moMantenimiento += e.amount;
        else if (e.isMaquinaria) maq += e.amount;
        else if (e.isInstalaciones) inst += e.amount;
        else if (e.isInsumoDiario) insumos += e.amount;
      }
    });

    let tanksInPeriod = data?.summary2026?.totalTanksRotomolded || 4472;
    if (selectedOpexPeriod !== "all") {
      const mData = data?.monthlyBreakdown.find(m => m.monthKey === selectedOpexPeriod);
      if (mData) tanksInPeriod = mData.tanquesFabricados;
    }

    const costPerTank = tanksInPeriod > 0 && totalOpex > 0 ? Math.round(totalOpex / tanksInPeriod) : 0;
    const moMantenimientoCostPerTank = tanksInPeriod > 0 && moMantenimiento > 0 ? Math.round(moMantenimiento / tanksInPeriod) : 0;
    const maqCostPerTank = tanksInPeriod > 0 && maq > 0 ? Math.round(maq / tanksInPeriod) : 0;
    const instCostPerTank = tanksInPeriod > 0 && inst > 0 ? Math.round(inst / tanksInPeriod) : 0;
    const insumosCostPerTank = tanksInPeriod > 0 && insumos > 0 ? Math.round(insumos / tanksInPeriod) : 0;

    return { totalOpex, moMantenimiento, maq, inst, insumos, capex, costPerTank, moMantenimientoCostPerTank, maqCostPerTank, instCostPerTank, insumosCostPerTank, tanksInPeriod };
  }, [opexInPeriod, selectedOpexPeriod, data]);

  // Top Concept Ranking in Selected Period
  const topConceptsRank = useMemo(() => {
    const map: Record<string, { concept: string; subCat: string; totalAmount: number; count: number; sampleDesc: string }> = {};

    opexInPeriod.forEach(e => {
      if (e.isCapex) return;
      const key = e.concept.trim();
      if (!map[key]) {
        map[key] = {
          concept: key,
          subCat: e.subCategory,
          totalAmount: 0,
          count: 0,
          sampleDesc: e.description || ''
        };
      }
      map[key].totalAmount += e.amount;
      map[key].count++;
      if (e.description && !map[key].sampleDesc) map[key].sampleDesc = e.description;
    });

    return Object.values(map).sort((a, b) => b.totalAmount - a.totalAmount);
  }, [opexInPeriod]);

  // Top 5 Largest Individual Expenses in Selected Period
  const topSingleExpenses = useMemo(() => {
    return [...opexInPeriod]
      .filter(e => !e.isCapex)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);
  }, [opexInPeriod]);

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
      <header className="bg-white border-b border-slate-200 shadow-2xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-linear-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white shadow-xs">
              <Factory className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 leading-tight">Costos Integrales de Fabricación</h1>
              <p className="text-xs text-slate-500 font-medium">Insumos (Col E) • Gas GLP • Mano de Obra • Edenor • Gastos Operativos & Mantenimiento</p>
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
            <span className="ml-1 bg-purple-100 text-purple-800 text-[10px] px-1.5 py-0.2 rounded-full font-bold">$4.811/u</span>
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
            {/* Period Selector Banner */}
            <div className="bg-white rounded-2xl p-4 border border-amber-200/80 shadow-xs flex flex-wrap items-center justify-between gap-4 bg-linear-to-r from-amber-50/40 via-white to-orange-50/20">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center">
                  <CalendarDays className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-amber-900">Período de Base de Cálculo de Costos de Planta:</div>
                  <div className="text-sm font-black text-slate-900">{activePeriodMetrics.label}</div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-500">Ver como:</span>
                <select
                  value={selectedPeriod}
                  onChange={(e) => setSelectedPeriod(e.target.value)}
                  className="py-2 px-3.5 text-xs font-bold bg-white border border-slate-300 rounded-xl shadow-2xs focus:border-amber-500 text-slate-800 cursor-pointer"
                >
                  <option value="current">🌟 Mes Actual (Agosto 2026) - Actualizado</option>
                  <option value="annual">📊 Promedio Anual Acumulado 2026 (Consolidado)</option>
                  <option disabled>──────────</option>
                  {data.monthlyBreakdown.map(m => (
                    <option key={m.monthKey} value={m.monthKey}>📅 {m.monthName} ({m.tanquesFabricados} u)</option>
                  ))}
                </select>
              </div>
            </div>

            {/* MAKE VS BUY DECISION SIMULATOR (FABRICAR VS COMPRAR A TERCEROS) */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
              <div className="px-5 py-4 bg-linear-to-r from-slate-900 via-slate-800 to-slate-900 text-white flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-400/30 flex items-center justify-center">
                    <Scale className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      Simulador & Análisis Make vs. Buy: ¿Fabricar Internamente o Comprar a un Proveedor?
                      <span className="text-[10px] font-black px-2 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full">
                        Decisión Estratégica
                      </span>
                    </h3>
                    <p className="text-xs text-slate-300 font-normal mt-0.5">
                      Evalúa ofertas de proveedores terceros separando los <strong>costos variables puros</strong> de la <strong>estructura fija no evitable de planta</strong>.
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setShowSimulator(!showSimulator)}
                  className="text-xs font-bold text-amber-400 hover:text-amber-300 transition py-1 px-3 bg-white/10 hover:bg-white/15 rounded-lg"
                >
                  {showSimulator ? "Ocultar Simulador ▲" : "Abrir Simulador ▼"}
                </button>
              </div>

              {showSimulator && simMetrics && (
                <div className="p-5 space-y-5 bg-slate-50/40">
                  {/* Selector Controls */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white p-4 rounded-xl border border-slate-200">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        1. Seleccionar Producto Fabricado:
                      </label>
                      <select
                        value={simulatorModelSku}
                        onChange={(e) => setSimulatorModelSku(e.target.value)}
                        className="w-full py-2 px-3 text-xs font-bold bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:bg-white focus:border-amber-500"
                      >
                        {data.fabricatedProducts.map((p) => (
                          <option key={p.id} value={p.name}>
                            {p.name} (Score: {p.score.toFixed(2)} • Venta: {formatCurrency(p.price)})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        2. Precio Unitario que te ofrece el Proveedor Externo ($):
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-2 text-xs font-bold text-slate-400">$</span>
                        <input
                          type="number"
                          value={simulatorOfferPrice}
                          onChange={(e) => setSimulatorOfferPrice(parseFloat(e.target.value) || 0)}
                          placeholder="65000"
                          className="w-full pl-7 pr-3 py-2 text-xs font-black text-slate-900 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:border-amber-500"
                        />
                      </div>
                    </div>
                  </div>

                  {/* 3 Cost Layers Comparison Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {/* Layer 1: Pure Marginal Cost */}
                    <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        1. Costo Puro Evitable
                      </span>
                      <div className="text-xl font-black text-slate-800 mt-1">{formatCurrency(simMetrics.costoPuroEvitable)}</div>
                      <p className="text-[11px] text-slate-600 mt-1">
                        Insumos ({formatCurrency(simMetrics.insumos)}) + Gas ({formatCurrency(simMetrics.gas)}).
                      </p>
                      <p className="text-[10px] text-slate-500 font-medium mt-1">
                        💡 Desembolso evitable si apagás el horno.
                      </p>
                    </div>

                    {/* Layer 2: Direct Plant Cost (HIGHLIGHTED IN GREEN) */}
                    <div className="bg-white p-4 rounded-2xl border-2 border-emerald-500 shadow-xs bg-linear-to-b from-emerald-50/40 to-white relative">
                      <span className="absolute -top-2.5 right-3 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 bg-emerald-600 text-white rounded-full">
                        ⭐ Costo Clave Directo
                      </span>
                      <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider">
                        2. Costo Directo de Planta
                      </span>
                      <div className="text-xl font-black text-emerald-950 mt-1">{formatCurrency(simMetrics.costoDirectoPlanta)}</div>
                      <p className="text-[11px] text-emerald-900 mt-1">
                        Insumos + Gas + Operario Horno ({formatCurrency(simMetrics.mdoHorno)}).
                      </p>
                      <p className="text-[10px] text-emerald-700 font-bold mt-1">
                        🎯 Costo variable directo al pie de máquina.
                      </p>
                    </div>

                    {/* Layer 3: Fixed Structure (Not Avoidable) */}
                    <div className="bg-white p-4 rounded-2xl border border-purple-200 shadow-xs bg-linear-to-b from-purple-50/20 to-white">
                      <span className="text-[11px] font-bold text-purple-700 uppercase tracking-wider">
                        3. Estructura Fija de Planta
                      </span>
                      <div className="text-xl font-black text-purple-950 mt-1">{formatCurrency(simMetrics.costoEstructuraFija)}</div>
                      <p className="text-[11px] text-slate-600 mt-1">
                        Luz ({formatCurrency(simMetrics.luz)}) + Mant. & OPEX ({formatCurrency(simMetrics.opex)}).
                      </p>
                      <p className="text-[10px] text-purple-700 font-bold mt-1">
                        ⚠️ Se sigue pagando igual aunque compres afuera.
                      </p>
                    </div>

                    {/* Layer 4: Total Absorbed Integral Cost */}
                    <div className="bg-white p-4 rounded-2xl border border-slate-300 shadow-xs bg-linear-to-b from-slate-100/50 to-white">
                      <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                        4. Costo Integral Total
                      </span>
                      <div className="text-xl font-black text-slate-900 mt-1">{formatCurrency(simMetrics.costoIntegralTotal)}</div>
                      <p className="text-[11px] text-slate-600 mt-1">
                        Suma de las 3 capas anteriores.
                      </p>
                      <p className="text-[10px] text-slate-500 font-medium mt-1">
                        Para fijación de precios y rentabilidad.
                      </p>
                    </div>
                  </div>

                  {/* Real-time Verdict Banner */}
                  <div className={`p-4 rounded-2xl border text-xs flex items-start gap-3.5 shadow-2xs ${
                    simMetrics.convieneComprar
                      ? "bg-emerald-50 border-emerald-300 text-emerald-950"
                      : "bg-rose-50 border-rose-300 text-rose-950"
                  }`}>
                    {simMetrics.convieneComprar ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                    )}
                    <div className="space-y-1">
                      <div className="font-black text-sm">
                        {simMetrics.convieneComprar
                          ? `🟢 CONVIENE COMPRAR AL PROVEEDOR (${formatCurrency(simulatorOfferPrice)} vs ${formatCurrency(simMetrics.costoPuroEvitable)} costo puro)`
                          : `🔴 NO CONVIENE COMPRAR AL PROVEEDOR (Perdés ${formatCurrency(simMetrics.difVsPuro)} por tanque)`
                        }
                      </div>
                      <div className="text-xs leading-relaxed">
                        {simMetrics.convieneComprar ? (
                          <>
                            El precio del proveedor (<strong>{formatCurrency(simulatorOfferPrice)}</strong>) es menor a tu costo variable evitable de insumos y gas (<strong>{formatCurrency(simMetrics.costoPuroEvitable)}</strong>). Te ahorrás <strong>{formatCurrency(Math.abs(simMetrics.difVsPuro))}</strong> por tanque ({formatCurrency(Math.abs(simMetrics.difVsPuro) * 100)} en un lote de 100u).
                          </>
                        ) : (
                          <>
                            Aunque el proveedor cobre <strong>{formatCurrency(simulatorOfferPrice)}</strong> (que parece menor al costo integral de <strong>{formatCurrency(simMetrics.costoIntegralTotal)}</strong>), tu costo directo evitable es de solo <strong>{formatCurrency(simMetrics.costoPuroEvitable)}</strong>. 
                            Como los costos de estructura fija (<strong>{formatCurrency(simMetrics.costoEstructuraFija)}</strong> de luz y mantenimiento) <strong>los vas a seguir pagando igual en la planta</strong>, comprarle al proveedor te dejaría un costo real absorbido de <strong>{formatCurrency(simulatorOfferPrice + simMetrics.costoEstructuraFija)}</strong> (un sobrecosto de <strong>{formatCurrency(simMetrics.difVsPuro)}</strong> por unidad).
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Filters Bar */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3 flex-1">
                <div className="relative flex-1 min-w-[240px]">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type="text"
                    value={searchFabricatedInput}
                    onChange={(e) => setSearchFabricatedInput(e.target.value)}
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
                  <h3 className="text-sm font-bold text-slate-900">Matriz de Costos por Capas (Puro vs Directo vs Integral) ({activePeriodMetrics.label})</h3>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    Diferenciación de <strong>Costo Puro Evitable</strong> (Decisión Proveedor), <strong>Mano de Obra</strong>, <strong>Estructura Fija</strong> y <strong>Costo Integral Total</strong>
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
                      <th className="py-3 px-3 text-right text-slate-600 bg-slate-50/50">Costo Puro Evitable</th>
                      <th className="py-3 px-3 text-right text-blue-700">MDO Horno</th>
                      <th className="py-3 px-3 text-right font-black text-emerald-950 bg-emerald-100/80 border-x-2 border-emerald-400 shadow-2xs">
                        ⭐ Costo Directo Planta
                      </th>
                      <th className="py-3 px-3 text-right text-purple-700 bg-purple-50/30">Estructura Fija</th>
                      <th className="py-3 px-4 text-right font-black text-slate-900 bg-amber-50/60">Costo Integral</th>
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
                        
                        {/* Costo Puro Evitable (Insumos + Gas) */}
                        <td className="py-3 px-3 text-right text-slate-700 bg-slate-50/40 whitespace-nowrap">
                          <div>{formatCurrency((p as any).costoDirectoMarginal)}</div>
                          <span className="text-[9px] font-medium text-slate-500">Insumos + Gas</span>
                        </td>

                        <td className="py-3 px-3 text-right font-semibold text-blue-700">
                          {formatCurrency(p.mdoCost)}
                        </td>

                        {/* Costo Directo Planta (HIGHLIGHTED IN GREEN) */}
                        <td className="py-3 px-3 text-right font-black text-emerald-950 bg-emerald-50 border-x-2 border-emerald-400 whitespace-nowrap">
                          <div className="text-sm">{formatCurrency((p as any).costoDirectoPlanta)}</div>
                          <span className="text-[9px] font-bold text-emerald-800">Directo al Pie</span>
                        </td>

                        <td className="py-3 px-3 text-right font-semibold text-purple-700 bg-purple-50/20 whitespace-nowrap">
                          <div>{formatCurrency((p as any).costoEstructuraFija)}</div>
                          <span className="text-[9px] font-medium text-purple-600">Luz + Mant.</span>
                        </td>

                        <td className="py-3 px-4 text-right font-black text-slate-900 bg-amber-50/60 whitespace-nowrap">
                          {formatCurrency(p.totalIntegralCost)}
                        </td>
                        <td className="py-3 px-3 text-right font-bold text-slate-700 whitespace-nowrap">
                          {formatCurrency(p.price)}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
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

        {/* TAB: GASTOS OPERATIVOS & MANTENIMIENTO (CON SELECTOR MENSUAL / ANUAL) */}
        {activeTab === "gastos_opex" && (
          <div className="space-y-6">
            {/* Period Selector Banner for OPEX */}
            <div className="bg-white rounded-2xl p-4 border border-purple-200/80 shadow-xs flex flex-wrap items-center justify-between gap-4 bg-linear-to-r from-purple-50/40 via-white to-amber-50/20">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-purple-100 text-purple-800 flex items-center justify-center">
                  <CalendarDays className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-purple-900">Período de Análisis de Gastos Operativos:</div>
                  <div className="text-sm font-black text-slate-900">
                    {selectedOpexPeriod === "all" ? "Todo el Año 2026 (Acumulado Consolidado)" : formatMonthName(selectedOpexPeriod)}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-500">Filtrar período:</span>
                <select
                  value={selectedOpexPeriod}
                  onChange={(e) => setSelectedOpexPeriod(e.target.value)}
                  className="py-2 px-3.5 text-xs font-bold bg-white border border-purple-300 rounded-xl shadow-2xs focus:border-purple-600 text-purple-950 cursor-pointer"
                >
                  <option value="all">📊 Todo el Año 2026 (Acumulado)</option>
                  <option disabled>──────────</option>
                  {data.monthlyBreakdown.map(m => (
                    <option key={m.monthKey} value={m.monthKey}>
                      📅 {m.monthName} ({formatCurrency(m.opexTotal)})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* KPI Cards (Dynamic based on selectedOpexPeriod) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3.5">
              <div className="bg-white rounded-2xl p-4 border border-purple-200/80 shadow-xs bg-linear-to-br from-purple-50/40 to-white">
                <span className="text-[10px] font-bold text-purple-700 uppercase tracking-wider">
                  Total Mantenimiento & OPEX
                </span>
                <div className="text-lg font-black text-purple-900 mt-1">{formatCurrency(opexStats.totalOpex)}</div>
                <p className="text-[11px] text-purple-700 font-bold mt-0.5">
                  {formatCurrency(opexStats.costPerTank)} / tanque ({opexStats.tanksInPeriod} u)
                </p>
              </div>

              <div className="bg-white rounded-2xl p-4 border border-blue-200 shadow-xs bg-linear-to-br from-blue-50/30 to-white">
                <span className="text-[10px] font-bold text-blue-800 uppercase tracking-wider">MO Mantenimiento (Julio Verón)</span>
                <div className="text-lg font-black text-blue-900 mt-1">{formatCurrency(opexStats.moMantenimiento)}</div>
                <p className="text-[11px] text-blue-700 font-medium mt-0.5">
                  {opexStats.totalOpex > 0 ? ((opexStats.moMantenimiento / opexStats.totalOpex) * 100).toFixed(1) : "0"}% • {formatCurrency(opexStats.moMantenimientoCostPerTank)} / u
                </p>
              </div>

              <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Repuestos Maquinaria</span>
                <div className="text-lg font-black text-slate-900 mt-1">{formatCurrency(opexStats.maq)}</div>
                <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                  {opexStats.totalOpex > 0 ? ((opexStats.maq / opexStats.totalOpex) * 100).toFixed(1) : "0"}% • {formatCurrency(opexStats.maqCostPerTank)} / u
                </p>
              </div>

              <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Instalaciones</span>
                <div className="text-lg font-black text-slate-900 mt-1">{formatCurrency(opexStats.inst)}</div>
                <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                  {opexStats.totalOpex > 0 ? ((opexStats.inst / opexStats.totalOpex) * 100).toFixed(1) : "0"}% • {formatCurrency(opexStats.instCostPerTank)} / u
                </p>
              </div>

              <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Insumos Diarios</span>
                <div className="text-lg font-black text-slate-900 mt-1">{formatCurrency(opexStats.insumos)}</div>
                <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                  {opexStats.totalOpex > 0 ? ((opexStats.insumos / opexStats.totalOpex) * 100).toFixed(1) : "0"}% • {formatCurrency(opexStats.insumosCostPerTank)} / u
                </p>
              </div>

              <div className="bg-white rounded-2xl p-4 border border-blue-200/80 shadow-xs bg-linear-to-br from-slate-50 to-white">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">💎 Bienes de Uso (CAPEX)</span>
                <div className="text-lg font-black text-slate-800 mt-1">{formatCurrency(opexStats.capex)}</div>
                <p className="text-[10px] text-slate-400 font-medium mt-0.5">Amortizable (No OPEX)</p>
              </div>
            </div>

            {/* Visual Analytics & Top Concepts Section for Selected Period */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Left Column: Visual Category Distribution & Top Invoices */}
              <div className="lg:col-span-1 space-y-6">
                {/* Visual Distribution Bar */}
                <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                      <PieChart className="w-4 h-4 text-purple-600" />
                      Distribución ({selectedOpexPeriod === "all" ? "Anual" : formatMonthName(selectedOpexPeriod)})
                    </h3>
                  </div>

                  {/* Multi-segment visual progress bar */}
                  <div className="h-4 w-full bg-slate-100 rounded-full overflow-hidden flex shadow-inner">
                    <div 
                      style={{ width: `${opexStats.totalOpex > 0 ? (opexStats.moMantenimiento / opexStats.totalOpex) * 100 : 0}%` }} 
                      className="bg-blue-600 hover:bg-blue-700 transition" 
                      title={`MO Mantenimiento (Julio Verón): ${formatCurrency(opexStats.moMantenimiento)}`}
                    />
                    <div 
                      style={{ width: `${opexStats.totalOpex > 0 ? (opexStats.maq / opexStats.totalOpex) * 100 : 0}%` }} 
                      className="bg-amber-500 hover:bg-amber-600 transition" 
                      title={`Repuestos Maquinaria: ${formatCurrency(opexStats.maq)}`}
                    />
                    <div 
                      style={{ width: `${opexStats.totalOpex > 0 ? (opexStats.inst / opexStats.totalOpex) * 100 : 0}%` }} 
                      className="bg-purple-500 hover:bg-purple-600 transition" 
                      title={`Instalaciones: ${formatCurrency(opexStats.inst)}`}
                    />
                    <div 
                      style={{ width: `${opexStats.totalOpex > 0 ? (opexStats.insumos / opexStats.totalOpex) * 100 : 0}%` }} 
                      className="bg-emerald-500 hover:bg-emerald-600 transition" 
                      title={`Insumos: ${formatCurrency(opexStats.insumos)}`}
                    />
                  </div>

                  <div className="space-y-2.5 text-xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-blue-600 shrink-0"></span>
                        <span className="text-slate-600 font-medium">MO Mantenimiento (Julio Verón):</span>
                      </div>
                      <span className="font-bold text-slate-900">
                        {formatCurrency(opexStats.moMantenimiento)} <strong className="text-blue-700">({opexStats.totalOpex > 0 ? ((opexStats.moMantenimiento / opexStats.totalOpex) * 100).toFixed(1) : 0}%)</strong>
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-amber-500 shrink-0"></span>
                        <span className="text-slate-600 font-medium">Repuestos Maquinaria:</span>
                      </div>
                      <span className="font-bold text-slate-900">
                        {formatCurrency(opexStats.maq)} <strong className="text-amber-700">({opexStats.totalOpex > 0 ? ((opexStats.maq / opexStats.totalOpex) * 100).toFixed(1) : 0}%)</strong>
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-purple-500 shrink-0"></span>
                        <span className="text-slate-600 font-medium">Mantenimiento Instalaciones:</span>
                      </div>
                      <span className="font-bold text-slate-900">
                        {formatCurrency(opexStats.inst)} <strong className="text-purple-700">({opexStats.totalOpex > 0 ? ((opexStats.inst / opexStats.totalOpex) * 100).toFixed(1) : 0}%)</strong>
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-emerald-500 shrink-0"></span>
                        <span className="text-slate-600 font-medium">Insumos Diarios Taller:</span>
                      </div>
                      <span className="font-bold text-slate-900">
                        {formatCurrency(opexStats.insumos)} <strong className="text-emerald-700">({opexStats.totalOpex > 0 ? ((opexStats.insumos / opexStats.totalOpex) * 100).toFixed(1) : 0}%)</strong>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Top Single Invoices */}
                <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-3">
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <ArrowUpRight className="w-4 h-4 text-amber-600" />
                    Mayores Gastos ({selectedOpexPeriod === "all" ? "Anual" : formatMonthName(selectedOpexPeriod)})
                  </h3>
                  <div className="space-y-2.5">
                    {topSingleExpenses.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">No hay gastos en este período.</p>
                    ) : (
                      topSingleExpenses.map((exp) => (
                        <div key={exp.id} className="flex items-start justify-between text-xs p-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 transition border border-slate-100">
                          <div>
                            <div className="font-bold text-slate-900">{exp.concept}</div>
                            <div className="text-[10px] text-slate-500 font-medium">{exp.dateFormatted} • {exp.subCategory}</div>
                            {exp.description && (
                              <div className="text-[10px] text-slate-600 italic mt-0.5 truncate max-w-[200px]">{exp.description}</div>
                            )}
                          </div>
                          <div className="font-black text-slate-900 text-right shrink-0 ml-2">
                            {formatCurrency(exp.amount)}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Right Column: Top Concept Rankings */}
              <div className="lg:col-span-2 bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                        <BarChart2 className="w-4 h-4 text-purple-600" />
                        Ranking de Conceptos de Gastos Más Altos ({selectedOpexPeriod === "all" ? "Acumulado 2026" : formatMonthName(selectedOpexPeriod)})
                      </h3>
                      <p className="text-xs text-slate-500 font-medium mt-0.5">
                        Rubros con mayor impacto en costos operativos para el período seleccionado
                      </p>
                    </div>
                    <span className="text-xs font-bold text-purple-700 bg-purple-50 px-2.5 py-1 rounded-lg border border-purple-200">
                      Top Rubros
                    </span>
                  </div>

                  <div className="space-y-4">
                    {topConceptsRank.length === 0 ? (
                      <p className="text-xs text-slate-400 italic py-6 text-center">No hay conceptos registrados en este período.</p>
                    ) : (
                      topConceptsRank.slice(0, 7).map((c, idx) => {
                        const pct = opexStats.totalOpex > 0 ? (c.totalAmount / opexStats.totalOpex) * 100 : 0;
                        return (
                          <div key={c.concept} className="space-y-1.5">
                            <div className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-2">
                                <span className="w-5 h-5 rounded-md bg-slate-100 text-slate-700 font-bold flex items-center justify-center text-[10px]">
                                  {idx + 1}
                                </span>
                                <span className="font-bold text-slate-900">{c.concept}</span>
                                <span className="text-[10px] text-slate-400 font-medium hidden sm:inline">({c.count} compras)</span>
                              </div>
                              <div className="text-right">
                                <strong className="text-slate-900">{formatCurrency(c.totalAmount)}</strong>
                                <span className="text-[11px] text-purple-700 font-black ml-1.5">({pct.toFixed(1)}%)</span>
                              </div>
                            </div>

                            {/* Progress bar */}
                            <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                              <div 
                                style={{ width: `${pct}%` }} 
                                className={`h-full rounded-full transition ${
                                  idx === 0 ? "bg-amber-500" :
                                  idx === 1 ? "bg-purple-500" :
                                  idx === 2 ? "bg-blue-500" : "bg-emerald-500"
                                }`}
                              />
                            </div>

                            {c.sampleDesc && (
                              <div className="text-[10px] text-slate-500 italic pl-7 truncate">
                                Ejemplos: {c.sampleDesc}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-500 flex items-center justify-between">
                  <span>Total analizado en el período: <strong>{formatCurrency(opexStats.totalOpex)}</strong></span>
                  <span className="font-bold text-purple-700">{formatCurrency(opexStats.costPerTank)} / tanque</span>
                </div>
              </div>
            </div>

            {/* Filter and Search Bar for Historical Receipts */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3 flex-1">
                <div className="relative flex-1 min-w-[240px]">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type="text"
                    value={searchOpex}
                    onChange={(e) => setSearchOpex(e.target.value)}
                    placeholder="Buscar por concepto, repuesto, descripción o ferretería..."
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
                    <option value="mo_mantenimiento">MO Mantenimiento (Julio Verón)</option>
                    <option value="maquinaria">Repuestos Maquinaria</option>
                    <option value="instalaciones">Mantenimiento Instalaciones</option>
                    <option value="insumos">Insumos Diarios Taller</option>
                    <option value="capex">Compra Maquinaria (CAPEX)</option>
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
                  <h3 className="text-sm font-bold text-slate-900">
                    Histórico de Comprobantes & Sueldos ({selectedOpexPeriod === "all" ? "Todos los Meses" : formatMonthName(selectedOpexPeriod)})
                  </h3>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    Comprobantes registrados en GASTOS_OPERATIVOS y Mano de Obra Mantenimiento
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
                      <th className="py-3 px-4 text-right">Monto ($)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredOpexExpenses.map((exp) => (
                      <tr key={exp.id} className={`hover:bg-slate-50/80 transition ${exp.isCapex ? "bg-blue-50/30" : (exp as any).isMdoMantenimiento ? "bg-blue-50/20" : ""}`}>
                        <td className="py-3 px-4 font-semibold text-slate-700 whitespace-nowrap">
                          {exp.dateFormatted}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            exp.isCapex ? "bg-slate-100 text-slate-800" :
                            (exp as any).isMdoMantenimiento ? "bg-blue-100 text-blue-900" :
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
            {/* Notice for Estimated August Data */}
            <div className="bg-amber-50/70 border border-amber-200/90 rounded-2xl p-4 text-xs text-amber-900 flex items-start gap-3 shadow-2xs">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <strong className="font-bold">Aviso sobre Agosto 2026:</strong> Los valores de <strong>MDO</strong> y <strong>Luz Edenor</strong> para el mes en curso se computan como <em>estimados proporcionales (26/31 días)</em> basados en meses anteriores para reflejar costos realistas. Tan pronto cargues las facturas y recibos en la planilla oficial, se actualizarán automáticamente a valores definitivos.
              </div>
            </div>

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
                      <th className="py-3 px-3 text-right text-amber-700">Gas Consumido (L)</th>
                      <th className="py-3 px-3 text-right text-amber-700">Rendimiento (L/u)</th>
                      <th className="py-3 px-3 text-right text-amber-700">Gas Consumido ($)</th>
                      <th className="py-3 px-3 text-right text-slate-600 bg-slate-50/50">Recargas / Facturas ($)</th>
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
                        <td className="py-3 px-4 font-bold text-slate-900">
                          {m.monthName}
                          {m.monthKey === "2026-08" && (
                            <span className="ml-1.5 inline-block text-[9px] font-black px-1.5 py-0.2 bg-amber-100 text-amber-900 rounded-sm">
                              En Curso
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-center font-bold text-slate-700">{m.tanquesFabricados} u</td>
                        <td className="py-3 px-3 text-right font-semibold text-amber-700">{m.gasLitros.toLocaleString("es-AR")} L</td>
                        <td className="py-3 px-3 text-right font-semibold text-amber-700">{m.gasLitrosPorTanque.toFixed(2)} L/u</td>
                        <td className="py-3 px-3 text-right font-semibold text-amber-700">{formatCurrency(m.gasInversion)}</td>
                        
                        {/* Recargas / Facturas YPF Column */}
                        <td className="py-3 px-3 text-right text-slate-600 bg-slate-50/30">
                          <div>{m.gasInversionRecarga ? formatCurrency(m.gasInversionRecarga) : "—"}</div>
                          {m.stockZeppelinPct !== undefined && (
                            <span className="inline-block text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1 rounded-xs">
                              Stock: {m.stockZeppelinPct}% en Zeppelin
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-3 text-right font-semibold text-blue-700">
                          <div>{formatCurrency(m.mdoTotal)}</div>
                          {m.isEstimatedMdo && (
                            <span className="inline-block text-[9px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1 rounded-xs">
                              ⚠️ Est. Proporcional
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-3 text-right font-semibold text-amber-600">
                          <div>{formatCurrency(m.luzTotal)}</div>
                          {m.isEstimatedLuz && (
                            <span className="inline-block text-[9px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1 rounded-xs">
                              ⚠️ Est. Proporcional
                            </span>
                          )}
                        </td>

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
            {/* Notice for August salaries */}
            <div className="bg-amber-50/70 border border-amber-200/90 rounded-2xl p-4 text-xs text-amber-900 flex items-start gap-3 shadow-2xs">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <strong className="font-bold">Sueldos de Agosto en Curso:</strong> Los haberes de Agosto aún no fueron liquidados definitivamente en la hoja <code>Sueldos</code>. El sistema proyecta proporcionalmente sobre la base de <strong>Julio 2026</strong> (factor 26/31 días) para mantener un costo unitario por tanque preciso.
              </div>
            </div>

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
            {/* Notice for Pending August Bill */}
            <div className="bg-amber-50/70 border border-amber-200/90 rounded-2xl p-4 text-xs text-amber-900 flex items-start gap-3 shadow-2xs">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <strong className="font-bold">Factura de Agosto Pendiente:</strong> La factura de Edenor correspondiente al consumo de Agosto se emite y abona a mes vencido durante Septiembre. Mientras tanto, el sistema computa un <strong>estimado proporcional de $458.741 ($848/u)</strong> basado en el promedio de los últimos 3 meses ($546.730/mes). Al registrar el pago en la planilla oficial, se actualizará automáticamente.
              </div>
            </div>

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
                      <tr key={el.id} className={`hover:bg-slate-50/80 transition ${el.isEstimated ? "bg-amber-50/40" : ""}`}>
                        <td className="py-3 px-4 font-semibold text-slate-700">
                          {el.paymentDateFormatted}
                          {el.isEstimated && (
                            <span className="ml-2 inline-block text-[9px] font-black px-1.5 py-0.2 bg-amber-200 text-amber-900 rounded-xs">
                              PENDIENTE
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-900">{el.consumedMonthName}</td>
                        <td className="py-3 px-4 text-slate-600 font-medium">
                          {el.concept}
                          {el.isEstimated && (
                            <span className="text-[10px] text-amber-700 block font-bold mt-0.5">
                              ⚠️ Estimación proporcional (promedio Mayo-Julio)
                            </span>
                          )}
                        </td>
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

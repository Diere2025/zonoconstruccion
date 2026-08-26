"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { 
  Factory, 
  Wrench, 
  Package, 
  AlertTriangle, 
  CheckCircle2, 
  RefreshCw, 
  Download, 
  ExternalLink, 
  Search, 
  Filter, 
  X, 
  TrendingUp, 
  Loader2, 
  Sparkles, 
  Layers, 
  Droplet, 
  PieChart, 
  ChevronRight, 
  Info,
  SlidersHorizontal,
  ArrowUpRight,
  ArrowDownRight,
  ShieldCheck,
  Building2,
  Flame
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FactoryStockItem } from "@/app/api/admin/stock-fabrica-data/route";

// Search normalizer helper
const normalizeSearchText = (text: string): string => {
  return (text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
};

export default function StockFabricaPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastSync, setLastSync] = useState<string>("");
  const [stockItems, setStockItems] = useState<FactoryStockItem[]>([]);

  // Filtering states
  const [categoryTab, setCategoryTab] = useState<"real_fab" | "ensamblados" | "all_fab_propia" | "all">("real_fab");
  const [selectedLitraje, setSelectedLitraje] = useState<string>("all");
  const [selectedStockLevel, setSelectedStockLevel] = useState<"all" | "in_stock" | "zero" | "negative">("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Detail Modal
  const [selectedItemDetail, setSelectedItemDetail] = useState<FactoryStockItem | null>(null);

  // Fetch data
  const fetchData = async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    try {
      const res = await fetch("/api/admin/stock-fabrica-data");
      const json = await res.json();
      if (json.success && Array.isArray(json.items)) {
        setStockItems(json.items);
        setLastSync(new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      }
    } catch (err) {
      console.error("Error al cargar datos de stock de fábrica:", err);
    } finally {
      setLoading(false);
      if (isManualRefresh) setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Distinct Litrajes available in the list
  const availableLitrajes = useMemo(() => {
    const set = new Set<string>();
    stockItems.forEach(i => {
      if (i.litraje?.label && i.litraje.label !== 'Otros') {
        set.add(i.litraje.label);
      }
    });
    return Array.from(set).sort((a, b) => {
      const numA = parseInt(a.replace(/\D/g, '') || '0');
      const numB = parseInt(b.replace(/\D/g, '') || '0');
      return numA - numB;
    });
  }, [stockItems]);

  // Filter items based on active criteria
  const filteredItems = useMemo(() => {
    const qNorm = normalizeSearchText(searchQuery);

    return stockItems.filter(item => {
      // 1. Category Tab Filter
      if (categoryTab === "real_fab" && !item.esFabricacionPropiaReal) return false;
      if (categoryTab === "ensamblados" && !item.esEnsamblado) return false;
      if (categoryTab === "all_fab_propia" && item.categoriaTipo === "terceros") return false;

      // 2. Litraje Filter
      if (selectedLitraje !== "all" && item.litraje.label !== selectedLitraje) return false;

      // 3. Stock Level Filter
      if (selectedStockLevel === "in_stock" && item.actual <= 0) return false;
      if (selectedStockLevel === "zero" && item.actual !== 0) return false;
      if (selectedStockLevel === "negative" && item.actual >= 0) return false;

      // 4. Search Filter
      if (qNorm) {
        const prodNorm = normalizeSearchText(item.producto);
        const provNorm = normalizeSearchText(item.proveedor);
        const litNorm = normalizeSearchText(item.litraje.label);
        if (!prodNorm.includes(qNorm) && !provNorm.includes(qNorm) && !litNorm.includes(qNorm)) {
          return false;
        }
      }

      return true;
    });
  }, [stockItems, categoryTab, selectedLitraje, selectedStockLevel, searchQuery]);

  // Summary Metrics based on currently filtered items or real fab items
  const stats = useMemo(() => {
    const targetSet = categoryTab === 'all' ? filteredItems : stockItems.filter(i => i.esFabricacionPropiaReal);

    const totalStockActual = targetSet.reduce((acc, i) => acc + i.actual, 0);
    const totalFabricado = targetSet.reduce((acc, i) => acc + i.fabricacion, 0);
    const totalVentas = targetSet.reduce((acc, i) => acc + i.venta, 0);
    const totalCompras = targetSet.reduce((acc, i) => acc + i.compra, 0);
    const totalAjustesIn = targetSet.reduce((acc, i) => acc + i.ajusteEntrada, 0);
    const totalAjustesOut = targetSet.reduce((acc, i) => acc + i.ajusteSalida, 0);
    const totalSobrantes = targetSet.reduce((acc, i) => acc + i.sobrantesZono, 0);
    const sinStockCount = targetSet.filter(i => i.actual <= 0).length;
    const conStockCount = targetSet.filter(i => i.actual > 0).length;
    const totalLitrosStock = targetSet.reduce((acc, i) => acc + (i.actual > 0 ? i.actual * i.litraje.litros : 0), 0);

    return {
      totalStockActual,
      totalFabricado,
      totalVentas,
      totalCompras,
      totalAjustesIn,
      totalAjustesOut,
      totalSobrantes,
      sinStockCount,
      conStockCount,
      totalLitrosStock
    };
  }, [stockItems, filteredItems, categoryTab]);

  // Export to CSV
  const handleExportCSV = () => {
    if (filteredItems.length === 0) return;
    const headers = [
      "Producto",
      "Proveedor",
      "Tipo",
      "Stock Actual",
      "Fabricación (1ra)",
      "Ventas / Reservas",
      "Compras",
      "Ajustes Entrada",
      "Ajustes Salida",
      "Ensamblaje",
      "Piezas Ensamblaje",
      "Sobrantes Zono",
      "Stock Inicial"
    ];

    const rows = filteredItems.map(i => [
      `"${i.producto.replace(/"/g, '""')}"`,
      `"${i.proveedor.replace(/"/g, '""')}"`,
      i.esFabricacionPropiaReal ? "Fabricación Propia Real" : i.esEnsamblado ? "Ensamblado" : "Otro",
      i.actual,
      i.fabricacion,
      i.venta,
      i.compra,
      i.ajusteEntrada,
      i.ajusteSalida,
      i.ensamblaje,
      i.piezaEnsamblaje,
      i.sobrantesZono,
      i.inicial
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Stock_Fabrica_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header Bar */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-brand-50 text-brand-600 rounded-2xl border border-brand-100/80 shadow-xs">
              <Factory className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-black text-slate-900 tracking-tight">
                  Stock de Fábrica (Fabricación Propia)
                </h1>
                <span className="text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs">
                  En Vivo
                </span>
              </div>
              <p className="text-xs text-slate-400 font-semibold mt-0.5">
                Control de inventario físico resultante, rotomoldeo de 1ra, compras, ventas Zono y ajustes.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {lastSync && (
              <span className="text-[10px] font-bold text-slate-400 hidden sm:inline-block">
                Última sincronización: {lastSync}
              </span>
            )}

            <Link
              href="/admin/gas-consumo"
              className="px-3.5 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200/80 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer"
            >
              <Factory className="w-3.5 h-3.5 text-amber-600" />
              Costos de Fabricación
            </Link>

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
              href="https://docs.google.com/spreadsheets/d/1cjOzl_E8ZIhdt0jDg8aAnSc4IbRDwAeQxWZwxQMxwiI"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 bg-slate-50 hover:bg-slate-100 text-slate-500 hover:text-slate-800 rounded-xl border border-slate-200 transition-colors shadow-2xs"
              title="Abrir Planilla de Stock de Fábrica en Google Sheets"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </div>

        {/* KPI Cards Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
          {/* Stock Físico Actual */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Stock Físico Actual</span>
              <div className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg">
                <Package className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-black text-emerald-700 tracking-tight font-mono">
                {stats.totalStockActual.toLocaleString('es-AR')} <span className="text-xs font-semibold text-slate-400">u.</span>
              </div>
              <p className="text-[10px] text-emerald-600 font-bold mt-0.5">
                {stats.conStockCount} modelos disponibles
              </p>
            </div>
          </div>

          {/* Total Fabricado 1ra */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Fabricación Acumulada</span>
              <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
                <Factory className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-black text-blue-700 tracking-tight font-mono">
                {stats.totalFabricado.toLocaleString('es-AR')} <span className="text-xs font-semibold text-slate-400">u.</span>
              </div>
              <p className="text-[10px] text-blue-600 font-bold mt-0.5">1ra calidad rotomoldeo</p>
            </div>
          </div>

          {/* Total Ventas / Reservas */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Ventas / Reservas</span>
              <div className="p-1.5 bg-rose-50 text-rose-600 rounded-lg">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-black text-rose-600 tracking-tight font-mono">
                {stats.totalVentas.toLocaleString('es-AR')} <span className="text-xs font-semibold text-slate-400">u.</span>
              </div>
              <p className="text-[10px] text-rose-500 font-bold mt-0.5">Salidas Zono</p>
            </div>
          </div>

          {/* Tanques Sin Stock */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Sin Stock / Críticos</span>
              <div className="p-1.5 bg-amber-50 text-amber-600 rounded-lg">
                <AlertTriangle className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-black text-amber-600 tracking-tight font-mono">
                {stats.sinStockCount} <span className="text-xs font-semibold text-slate-400">modelos</span>
              </div>
              <p className="text-[10px] text-amber-600 font-bold mt-0.5">Stock en 0 o negativo</p>
            </div>
          </div>

          {/* Capacidad en Litros */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Capacidad Almacenada</span>
              <div className="p-1.5 bg-cyan-50 text-cyan-600 rounded-lg">
                <Droplet className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-black text-cyan-700 tracking-tight font-mono">
                {(stats.totalLitrosStock / 1000).toLocaleString('es-AR', { maximumFractionDigits: 0 })}k <span className="text-xs font-semibold text-slate-400">L</span>
              </div>
              <p className="text-[10px] text-cyan-600 font-bold mt-0.5">{stats.totalLitrosStock.toLocaleString('es-AR')} L equivalentes</p>
            </div>
          </div>
        </div>

        {/* Filter and Control Bar */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 space-y-4">
          {/* Category Tabs */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-100 pb-3">
            <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200/60 overflow-x-auto max-w-full">
              <button
                onClick={() => setCategoryTab("real_fab")}
                className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                  categoryTab === "real_fab" ? "bg-white text-blue-700 shadow-xs" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                <Factory className="w-3.5 h-3.5 text-blue-600" /> 
                Fabricación Propia Real ({stockItems.filter(i => i.esFabricacionPropiaReal).length})
              </button>
              <button
                onClick={() => setCategoryTab("ensamblados")}
                className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                  categoryTab === "ensamblados" ? "bg-white text-purple-700 shadow-xs" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                <Wrench className="w-3.5 h-3.5 text-purple-600" /> 
                Ensamblados & BioFort ({stockItems.filter(i => i.esEnsamblado).length})
              </button>
              <button
                onClick={() => setCategoryTab("all_fab_propia")}
                className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                  categoryTab === "all_fab_propia" ? "bg-white text-amber-700 shadow-xs" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                <Building2 className="w-3.5 h-3.5 text-amber-600" /> 
                Todos Fab. Propia ({stockItems.filter(i => i.categoriaTipo !== "terceros").length})
              </button>
              <button
                onClick={() => setCategoryTab("all")}
                className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                  categoryTab === "all" ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                <Layers className="w-3.5 h-3.5 text-slate-500" /> 
                Inventario Completo ({stockItems.length})
              </button>
            </div>

            <span className="text-[11px] font-bold text-slate-400">
              Mostrando <strong className="text-slate-700">{filteredItems.length}</strong> de {stockItems.length} productos
            </span>
          </div>

          {/* Filter Dropdowns & Search */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-1">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar tanque o producto..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-7 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-brand-500/10 focus:border-brand-500"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Litraje Filter */}
            <div>
              <select
                value={selectedLitraje}
                onChange={e => setSelectedLitraje(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-brand-500/10 focus:border-brand-500 cursor-pointer"
              >
                <option value="all">🛢️ Capacidad: Todas</option>
                {availableLitrajes.map(lit => (
                  <option key={lit} value={lit}>
                    {lit}
                  </option>
                ))}
              </select>
            </div>

            {/* Stock Level Filter */}
            <div>
              <select
                value={selectedStockLevel}
                onChange={e => setSelectedStockLevel(e.target.value as any)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-brand-500/10 focus:border-brand-500 cursor-pointer"
              >
                <option value="all">📦 Nivel de Stock: Todos</option>
                <option value="in_stock">✅ Con Stock Disponible (&gt; 0)</option>
                <option value="zero">⚠️ Sin Stock / En Cero (= 0)</option>
                <option value="negative">❌ Stock Negativo (&lt; 0)</option>
              </select>
            </div>

            {/* Reset Filters */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setSelectedLitraje("all");
                  setSelectedStockLevel("all");
                  setSearchQuery("");
                }}
                className="w-full py-2 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" /> Limpiar Filtros
              </Button>
            </div>
          </div>
        </div>

        {/* Main Stock Table */}
        {loading ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-16 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 text-brand-600 animate-spin" />
            <span className="text-xs font-bold text-slate-500">Cargando stock de fábrica desde Google Sheets...</span>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="p-3.5 bg-slate-50/70 border-b border-slate-200/80 flex items-center justify-between">
              <div className="text-xs font-black text-slate-800 flex items-center gap-2">
                <Package className="w-4 h-4 text-brand-600" />
                Matriz de Stock Físico y Movimientos ({filteredItems.length} registros)
              </div>
              <div className="text-[10px] font-extrabold text-slate-400 uppercase">
                Haz clic en cualquier producto para ver la fórmula detallada
              </div>
            </div>

            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[9px] font-black uppercase text-slate-400 tracking-wider">
                    <th className="px-3.5 py-2.5 min-w-[220px]">Producto</th>
                    <th className="px-3.5 py-2.5 w-28 text-center bg-emerald-50/40 text-emerald-900 border-x border-emerald-100">
                      Stock Actual
                    </th>
                    <th className="px-3.5 py-2.5 w-24 text-center text-blue-700 bg-blue-50/30">
                      + Fabricación
                    </th>
                    <th className="px-3.5 py-2.5 w-24 text-center text-rose-700 bg-rose-50/30">
                      - Ventas Zono
                    </th>
                    <th className="px-3.5 py-2.5 w-20 text-center text-amber-700">
                      + Compras
                    </th>
                    <th className="px-3.5 py-2.5 w-20 text-center text-emerald-600">
                      + Aj. Entrada
                    </th>
                    <th className="px-3.5 py-2.5 w-20 text-center text-orange-600">
                      - Aj. Salida
                    </th>
                    <th className="px-3.5 py-2.5 w-20 text-center text-purple-700">
                      + Ensamblaje
                    </th>
                    <th className="px-3.5 py-2.5 w-20 text-center text-teal-700">
                      + Sobrantes
                    </th>
                    <th className="px-3.5 py-2.5 w-20 text-center text-slate-500">
                      Inicial
                    </th>
                    <th className="px-3.5 py-2.5 w-16 text-center">Fórmula</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {filteredItems.length > 0 ? (
                    filteredItems.map((item) => {
                      const isReal = item.esFabricacionPropiaReal;
                      const isZero = item.actual === 0;
                      const isNegative = item.actual < 0;
                      const isPositive = item.actual > 0;

                      return (
                        <tr
                          key={item.id}
                          onClick={() => setSelectedItemDetail(item)}
                          className="hover:bg-blue-50/30 transition-colors cursor-pointer group"
                        >
                          {/* Producto */}
                          <td className="px-3.5 py-2.5">
                            <div className="flex flex-col">
                              <div className="flex items-center gap-1.5">
                                <span className="font-black text-slate-900 text-xs">{item.producto}</span>
                                {isReal && (
                                  <span className="px-1.5 py-0.2 rounded bg-blue-50 text-blue-700 font-extrabold text-[9px] border border-blue-200">
                                    Fab. Planta
                                  </span>
                                )}
                                {item.esEnsamblado && (
                                  <span className="px-1.5 py-0.2 rounded bg-purple-50 text-purple-700 font-extrabold text-[9px] border border-purple-200">
                                    Ensamblado
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-400 font-bold">
                                <span>Capacidad: {item.litraje.label}</span>
                                <span>·</span>
                                <span>{item.proveedor}</span>
                              </div>
                            </div>
                          </td>

                          {/* Stock Actual Resultante */}
                          <td className="px-3.5 py-2.5 text-center font-mono font-black text-sm bg-emerald-50/20 border-x border-emerald-100/60">
                            {isPositive ? (
                              <span className="inline-flex items-center px-2.5 py-1 rounded-xl bg-emerald-100 text-emerald-800 font-black shadow-2xs">
                                {item.actual} u.
                              </span>
                            ) : isZero ? (
                              <span className="inline-flex items-center px-2.5 py-1 rounded-xl bg-amber-50 text-amber-700 font-bold border border-amber-200/60">
                                0 u.
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2.5 py-1 rounded-xl bg-rose-100 text-rose-800 font-black border border-rose-200">
                                {item.actual} u.
                              </span>
                            )}
                          </td>

                          {/* Fabricación (1ra) */}
                          <td className="px-3.5 py-2.5 text-center font-mono font-bold text-blue-700 bg-blue-50/10">
                            {item.fabricacion > 0 ? `+${item.fabricacion}` : <span className="text-slate-300">0</span>}
                          </td>

                          {/* Ventas / Reservas */}
                          <td className="px-3.5 py-2.5 text-center font-mono font-bold text-rose-600 bg-rose-50/10">
                            {item.venta > 0 ? `-${item.venta}` : <span className="text-slate-300">0</span>}
                          </td>

                          {/* Compras */}
                          <td className="px-3.5 py-2.5 text-center font-mono text-slate-700">
                            {item.compra > 0 ? `+${item.compra}` : <span className="text-slate-300">0</span>}
                          </td>

                          {/* Ajustes Entrada */}
                          <td className="px-3.5 py-2.5 text-center font-mono text-emerald-600">
                            {item.ajusteEntrada > 0 ? `+${item.ajusteEntrada}` : <span className="text-slate-300">0</span>}
                          </td>

                          {/* Ajustes Salida */}
                          <td className="px-3.5 py-2.5 text-center font-mono text-orange-600">
                            {item.ajusteSalida > 0 ? `-${item.ajusteSalida}` : <span className="text-slate-300">0</span>}
                          </td>

                          {/* Ensamblaje */}
                          <td className="px-3.5 py-2.5 text-center font-mono text-purple-700">
                            {item.ensamblaje > 0 ? `+${item.ensamblaje}` : <span className="text-slate-300">0</span>}
                          </td>

                          {/* Sobrantes */}
                          <td className="px-3.5 py-2.5 text-center font-mono text-teal-700">
                            {item.sobrantesZono > 0 ? `+${item.sobrantesZono}` : <span className="text-slate-300">0</span>}
                          </td>

                          {/* Inicial */}
                          <td className="px-3.5 py-2.5 text-center font-mono text-slate-500">
                            {item.inicial}
                          </td>

                          {/* Botón Detalle */}
                          <td className="px-3.5 py-2.5 text-center">
                            <button className="p-1 rounded-lg text-slate-400 group-hover:text-brand-600 group-hover:bg-brand-50 transition-colors">
                              <Info className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={11} className="py-12 text-center text-slate-400 font-bold text-xs">
                        No se encontraron productos que coincidan con los filtros seleccionados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Product Math Breakdown Modal */}
        {selectedItemDetail && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
              {/* Modal Header */}
              <div className="p-5 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                    Desglose Matemático de Stock Físico
                  </span>
                  <h3 className="text-base font-black text-white mt-0.5">{selectedItemDetail.producto}</h3>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Proveedor: {selectedItemDetail.proveedor} · Capacidad: {selectedItemDetail.litraje.label}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedItemDetail(null)}
                  className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar">
                {/* Result Highlight Card */}
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-black uppercase text-emerald-800 tracking-wider">
                      Stock Físico Resultante Actual
                    </span>
                    <div className="text-3xl font-black text-emerald-900 font-mono mt-0.5">
                      {selectedItemDetail.actual} <span className="text-sm font-semibold text-emerald-700">unidades</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] font-bold text-emerald-700 block">Capacidad Almacenada</span>
                    <span className="text-base font-black text-cyan-800 font-mono">
                      {(selectedItemDetail.actual > 0 ? selectedItemDetail.actual * selectedItemDetail.litraje.litros : 0).toLocaleString('es-AR')} Litros
                    </span>
                  </div>
                </div>

                {/* Mathematical Equation Card */}
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                  <span className="text-xs font-black uppercase text-slate-700 flex items-center gap-1.5">
                    <Info className="w-4 h-4 text-brand-600" /> Fórmula de Cálculo del Stock
                  </span>
                  <div className="p-3 bg-white border border-slate-200 rounded-xl text-xs font-mono text-slate-800 font-bold overflow-x-auto">
                    Stock = Inicial ({selectedItemDetail.inicial}) + Compra ({selectedItemDetail.compra}) - Venta ({selectedItemDetail.venta}) + Fabricación ({selectedItemDetail.fabricacion}) + Ajuste In ({selectedItemDetail.ajusteEntrada}) - Ajuste Out ({selectedItemDetail.ajusteSalida}) + Ensamblaje ({selectedItemDetail.ensamblaje}) + Sobrantes ({selectedItemDetail.sobrantesZono}) - Piezas Usadas ({selectedItemDetail.piezaEnsamblaje})
                  </div>
                </div>

                {/* Breakdown Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                  <div className="p-3 bg-blue-50/80 border border-blue-200/80 rounded-xl">
                    <span className="text-[9px] font-black uppercase text-blue-600 block">+ Fabricación (1ra)</span>
                    <span className="text-lg font-black text-blue-900 font-mono">+{selectedItemDetail.fabricacion} u.</span>
                  </div>
                  <div className="p-3 bg-rose-50/80 border border-rose-200/80 rounded-xl">
                    <span className="text-[9px] font-black uppercase text-rose-600 block">- Ventas / Reservas</span>
                    <span className="text-lg font-black text-rose-900 font-mono">-{selectedItemDetail.venta} u.</span>
                  </div>
                  <div className="p-3 bg-slate-100 border border-slate-200 rounded-xl">
                    <span className="text-[9px] font-black uppercase text-slate-500 block">+ Compras Externas</span>
                    <span className="text-lg font-black text-slate-800 font-mono">+{selectedItemDetail.compra} u.</span>
                  </div>
                  <div className="p-3 bg-emerald-50/80 border border-emerald-200/80 rounded-xl">
                    <span className="text-[9px] font-black uppercase text-emerald-600 block">+ Ajustes Entrada</span>
                    <span className="text-lg font-black text-emerald-900 font-mono">+{selectedItemDetail.ajusteEntrada} u.</span>
                  </div>
                  <div className="p-3 bg-orange-50/80 border border-orange-200/80 rounded-xl">
                    <span className="text-[9px] font-black uppercase text-orange-600 block">- Ajustes Salida</span>
                    <span className="text-lg font-black text-orange-900 font-mono">-{selectedItemDetail.ajusteSalida} u.</span>
                  </div>
                  <div className="p-3 bg-purple-50/80 border border-purple-200/80 rounded-xl">
                    <span className="text-[9px] font-black uppercase text-purple-600 block">+ Ensamblaje</span>
                    <span className="text-lg font-black text-purple-900 font-mono">+{selectedItemDetail.ensamblaje} u.</span>
                  </div>
                  <div className="p-3 bg-teal-50/80 border border-teal-200/80 rounded-xl">
                    <span className="text-[9px] font-black uppercase text-teal-600 block">+ Sobrantes Zono</span>
                    <span className="text-lg font-black text-teal-900 font-mono">+{selectedItemDetail.sobrantesZono} u.</span>
                  </div>
                  <div className="p-3 bg-slate-100 border border-slate-200 rounded-xl">
                    <span className="text-[9px] font-black uppercase text-slate-500 block">Stock Inicial</span>
                    <span className="text-lg font-black text-slate-700 font-mono">{selectedItemDetail.inicial} u.</span>
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
                <Button
                  onClick={() => setSelectedItemDetail(null)}
                  className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-black"
                >
                  Cerrar
                </Button>
              </div>
            </div>
          </div>
        )}
  </div>
);
}

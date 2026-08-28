"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { 
  Calculator, 
  RefreshCw, 
  TrendingUp, 
  DollarSign, 
  Layers, 
  CheckCircle2, 
  Download, 
  Copy, 
  Search, 
  Sliders, 
  Sparkles, 
  Truck, 
  ShieldCheck, 
  HelpCircle, 
  Factory, 
  Package, 
  Settings2, 
  ArrowRight,
  Filter,
  Flame,
  Check,
  AlertCircle,
  FileSpreadsheet
} from "lucide-react";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";

interface ProductData {
  id: string;
  name: string;
  family: string;
  category: string;
  liters: string;
  isManufactured: boolean;
  originType: string;
  rawInsumosColE: number;
  plantCost: number;
  costGas: number;
  costMdo: number;
  costFijo: number;
  costBaseReal: number;
  isFeatured: boolean;
}

interface CategoryConfig {
  useCustom: boolean;
  marginDistributorPct: number; // Ganancia neta Distribuidor (20+)
  discountCorralonPct: number;  // % OFF para Corralón (10-19u)
  discountDistributorPct: number; // % OFF para Distribuidor (20+u)
}

interface ProductOverride {
  mode: "auto" | "margin" | "fixed_price";
  customMarginDistPct?: number;
  customFixedListPrice?: number;
}

export default function ListaMayoristaConfigPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [products, setProducts] = useState<ProductData[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  
  // 1. Global Settings
  const [globalFreightPct, setGlobalFreightPct] = useState<number>(10.0);
  const [globalMarginDistributorPct, setGlobalMarginDistributorPct] = useState<number>(10.0); // 10% base
  const [globalDiscountCorralonPct, setGlobalDiscountCorralonPct] = useState<number>(8.0); // 8% OFF
  const [globalDiscountDistributorPct, setGlobalDiscountDistributorPct] = useState<number>(14.0); // 14% OFF
  
  // 2. Category Settings Map
  const [categoryConfigs, setCategoryConfigs] = useState<Record<string, CategoryConfig>>({
    "Biodigestores": {
      useCustom: false,
      marginDistributorPct: 20.0,
      discountCorralonPct: 8.0,
      discountDistributorPct: 14.0
    }
  });

  // 3. Product Overrides Map
  const [productOverrides, setProductOverrides] = useState<Record<string, ProductOverride>>({});

  // 4. UI Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategoryTab, setSelectedCategoryTab] = useState<string>("all");
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [copiedSummary, setCopiedSummary] = useState(false);

  // Load Initial Data
  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/admin/lista-mayorista-data");
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Error al cargar catálogo de costos");
      setProducts(json.products || []);
      setCategories(json.categories || []);

      // Load saved settings from localStorage if available
      const savedConfig = localStorage.getItem("zono_mayorista_config_v1");
      if (savedConfig) {
        try {
          const parsed = JSON.parse(savedConfig);
          if (parsed.globalFreightPct !== undefined) setGlobalFreightPct(parsed.globalFreightPct);
          if (parsed.globalMarginDistributorPct !== undefined) setGlobalMarginDistributorPct(parsed.globalMarginDistributorPct);
          if (parsed.globalDiscountCorralonPct !== undefined) setGlobalDiscountCorralonPct(parsed.globalDiscountCorralonPct);
          if (parsed.globalDiscountDistributorPct !== undefined) setGlobalDiscountDistributorPct(parsed.globalDiscountDistributorPct);
          if (parsed.categoryConfigs) setCategoryConfigs(parsed.categoryConfigs);
          if (parsed.productOverrides) setProductOverrides(parsed.productOverrides);
        } catch (e) {
          console.warn("Error parsing saved config:", e);
        }
      }
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

  // Save Settings to LocalStorage whenever they change
  const saveCurrentSettings = () => {
    const payload = {
      globalFreightPct,
      globalMarginDistributorPct,
      globalDiscountCorralonPct,
      globalDiscountDistributorPct,
      categoryConfigs,
      productOverrides
    };
    localStorage.setItem("zono_mayorista_config_v1", JSON.stringify(payload));
  };

  useEffect(() => {
    if (!loading && products.length > 0) {
      saveCurrentSettings();
    }
  }, [globalFreightPct, globalMarginDistributorPct, globalDiscountCorralonPct, globalDiscountDistributorPct, categoryConfigs, productOverrides]);

  // Reset to Recommended Base
  const handleResetToDefaults = () => {
    setGlobalFreightPct(10.0);
    setGlobalMarginDistributorPct(10.0);
    setGlobalDiscountCorralonPct(8.0);
    setGlobalDiscountDistributorPct(14.0);
    setCategoryConfigs({
      "Biodigestores": {
        useCustom: false,
        marginDistributorPct: 20.0,
        discountCorralonPct: 8.0,
        discountDistributorPct: 14.0
      }
    });
    setProductOverrides({});
  };

  // Math Engine: Calculates Prices for every product dynamically
  const calculatedProducts = useMemo(() => {
    return products.map((prod) => {
      const catConfig = categoryConfigs[prod.category];
      const override = productOverrides[prod.id];

      // 1. Determine active parameters for this item
      let activeMarginDistPct = globalMarginDistributorPct;
      let activeDiscountCorrPct = globalDiscountCorralonPct;
      let activeDiscountDistPct = globalDiscountDistributorPct;
      let isCategoryCustom = false;
      let isProductCustom = false;

      // Category override
      if (catConfig && catConfig.useCustom) {
        activeMarginDistPct = catConfig.marginDistributorPct;
        activeDiscountCorrPct = catConfig.discountCorralonPct;
        activeDiscountDistPct = catConfig.discountDistributorPct;
        isCategoryCustom = true;
      }

      // Product individual override
      if (override && override.mode === "margin" && override.customMarginDistPct !== undefined) {
        activeMarginDistPct = override.customMarginDistPct;
        isProductCustom = true;
      }

      const costBase = prod.costBaseReal;
      const freightFactor = (100 - globalFreightPct) / 100; // e.g. 0.90

      let priceList = 0;
      let priceCorralon = 0;
      let priceDistributor = 0;

      if (override && override.mode === "fixed_price" && override.customFixedListPrice) {
        // Fixed List Price override
        isProductCustom = true;
        priceList = override.customFixedListPrice;
        priceCorralon = Math.round((priceList * (1 - activeDiscountCorrPct / 100)) / 100) * 100;
        priceDistributor = Math.round((priceList * (1 - activeDiscountDistPct / 100)) / 100) * 100;
      } else {
        // Dynamic calculation from Cost + Margin
        // Distribuidor target price
        const distMarginFactor = 1 + (activeMarginDistPct / 100);
        priceDistributor = Math.round(((costBase * distMarginFactor) / freightFactor) / 100) * 100;

        // List Price derived from Distribuidor discount %
        const distDiscountFactor = 1 - (activeDiscountDistPct / 100);
        priceList = Math.round((priceDistributor / distDiscountFactor) / 100) * 100;

        // Corralón price derived from List Price - Corralón discount %
        const corrDiscountFactor = 1 - (activeDiscountCorrPct / 100);
        priceCorralon = Math.round((priceList * corrDiscountFactor) / 100) * 100;
      }

      // Calculate Net Profits and Margins
      const fleteList = Math.round(priceList * (globalFreightPct / 100));
      const netProfitList = priceList - fleteList - costBase;
      const marginListPct = ((netProfitList / costBase) * 100);

      const fleteCorr = Math.round(priceCorralon * (globalFreightPct / 100));
      const netProfitCorr = priceCorralon - fleteCorr - costBase;
      const marginCorrPct = ((netProfitCorr / costBase) * 100);

      const fleteDist = Math.round(priceDistributor * (globalFreightPct / 100));
      const netProfitDist = priceDistributor - fleteDist - costBase;
      const marginDistPct = ((netProfitDist / costBase) * 100);

      return {
        ...prod,
        activeMarginDistPct,
        activeDiscountCorrPct,
        activeDiscountDistPct,
        isCategoryCustom,
        isProductCustom,
        priceList,
        fleteList,
        netProfitList,
        marginListPct,
        priceCorralon,
        fleteCorr,
        netProfitCorr,
        marginCorrPct,
        priceDistributor,
        fleteDist,
        netProfitDist,
        marginDistPct
      };
    });
  }, [products, globalFreightPct, globalMarginDistributorPct, globalDiscountCorralonPct, globalDiscountDistributorPct, categoryConfigs, productOverrides]);

  // Filtered view
  const filteredProducts = useMemo(() => {
    return calculatedProducts.filter((p) => {
      const matchQuery = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || p.family.toLowerCase().includes(searchQuery.toLowerCase());
      const matchCat = selectedCategoryTab === "all" || p.category === selectedCategoryTab;
      return matchQuery && matchCat;
    });
  }, [calculatedProducts, searchQuery, selectedCategoryTab]);

  // Excel Export Handler
  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();

    const rows = calculatedProducts.map(p => ({
      "Categoría": p.category,
      "Producto / Modelo": p.name,
      "Tipo Origen": p.originType,
      "Costo Base Real ($)": p.costBaseReal,
      "PRECIO DE LISTA (3-9 u)": p.priceList,
      "Flete 10% [Lista]": p.fleteList,
      "Ganancia Neta Zono [Lista]": p.netProfitList,
      "Margen s/Costo [Lista]": `${p.marginListPct.toFixed(1)}%`,
      "CORRALÓN (10-19 u)": p.priceCorralon,
      "Descuento Corralón": `${p.activeDiscountCorrPct}% OFF`,
      "Flete 10% [Corralón]": p.fleteCorr,
      "Ganancia Neta Zono [Corralón]": p.netProfitCorr,
      "Margen s/Costo [Corralón]": `${p.marginCorrPct.toFixed(1)}%`,
      "DISTRIBUIDOR (20+ u)": p.priceDistributor,
      "Descuento Distribuidor": `${p.activeDiscountDistPct}% OFF`,
      "Flete 10% [Distribuidor]": p.fleteDist,
      "Ganancia Neta Zono [Distribuidor]": p.netProfitDist,
      "Margen s/Costo [Distribuidor]": `${p.marginDistPct.toFixed(1)}%`
    }));

    const wsAll = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, wsAll, "Lista Mayorista");

    XLSX.writeFile(wb, "Lista_Precios_Mayorista_Personalizada.xlsx");
  };

  // Copy Summary to Clipboard
  const handleCopySummary = () => {
    const lines = [
      "📋 *LISTA DE PRECIOS MAYORISTA AQUAFORT / ZONO*",
      "• Precios de Lista para 3 a 9 tanques (Ferretero)",
      `• 10 a 19 tanques: ${globalDiscountCorralonPct}% OFF`,
      `• 20 o más tanques: ${globalDiscountDistributorPct}% OFF`,
      "• Flete incluido puesto en corralón/local",
      "",
      "--- LÍNEA TRICAPA GRIS ---"
    ];

    calculatedProducts.filter(p => p.category === "Tricapa Gris").forEach(p => {
      lines.push(`• ${p.name}: Lista $${p.priceList.toLocaleString('es-AR')} | 10u: $${p.priceCorralon.toLocaleString('es-AR')} | 20u: $${p.priceDistributor.toLocaleString('es-AR')}`);
    });

    lines.push("", "--- LÍNEA TRICAPA BEIGE ---");
    calculatedProducts.filter(p => p.category === "Tricapa Beige").forEach(p => {
      lines.push(`• ${p.name}: Lista $${p.priceList.toLocaleString('es-AR')} | 10u: $${p.priceCorralon.toLocaleString('es-AR')} | 20u: $${p.priceDistributor.toLocaleString('es-AR')}`);
    });

    navigator.clipboard.writeText(lines.join("\n"));
    setCopiedSummary(true);
    setTimeout(() => setCopiedSummary(false), 2500);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-16">
      {/* Header */}
      <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-brand-50 text-brand-600 rounded-2xl">
              <Calculator className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-black text-slate-900 tracking-tight">
                  Configurador de Lista Mayorista
                </h1>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  Costos Híbridos Reales Activos
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium">
                Calculá automáticamente el Precio de Lista y descuentos por volumen a partir del costo y margen deseado.
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={handleCopySummary}
            className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-sm"
          >
            {copiedSummary ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
            <span>{copiedSummary ? "Copiado!" : "Copiar Resumen"}</span>
          </button>
          
          <button
            onClick={handleExportExcel}
            className="px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-2xl text-xs font-black transition-all flex items-center gap-2 shadow-lg shadow-brand-600/20 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Descargar Excel (.xlsx)</span>
          </button>
        </div>
      </div>

      {/* Control Panel: Global Configuration */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950 text-white p-6 rounded-3xl shadow-xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-700 pb-4">
          <div className="space-y-0.5">
            <h2 className="text-sm font-black uppercase tracking-wider text-brand-400 flex items-center gap-2">
              <Sliders className="w-4 h-4" />
              Parámetros Globales del Modelo Mayorista
            </h2>
            <p className="text-xs text-slate-300">
              Modificá el margen base o los descuentos y todos los precios de lista se recalcularán automáticamente en tiempo real.
            </p>
          </div>

          <button
            onClick={handleResetToDefaults}
            className="text-[11px] font-bold text-slate-400 hover:text-white transition-colors underline self-start sm:self-auto cursor-pointer"
          >
            Restablecer Valores Sugeridos (10% Base / 8% Corr / 14% Dist)
          </button>
        </div>

        {/* 4 Inputs Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Base Margin Distributor */}
          <div className="bg-slate-800/80 border border-slate-700/80 p-4 rounded-2xl space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                Ganancia Neta Distribuidor (20+ u)
              </span>
              <span className="text-xs font-mono font-black text-emerald-400">
                {globalMarginDistributorPct}%
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                max="100"
                step="1"
                value={globalMarginDistributorPct}
                onChange={(e) => setGlobalMarginDistributorPct(parseFloat(e.target.value) || 0)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm font-mono font-black text-white focus:ring-2 focus:ring-brand-500 outline-none"
              />
              <span className="text-xs font-bold text-slate-400">%</span>
            </div>
            <p className="text-[10px] text-slate-400">Piso mínimo de ganancia limpia de la empresa.</p>
          </div>

          {/* Discount Corralon */}
          <div className="bg-slate-800/80 border border-slate-700/80 p-4 rounded-2xl space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                Descuento Corralón (10 a 19 u)
              </span>
              <span className="text-xs font-mono font-black text-indigo-400">
                -{globalDiscountCorralonPct}% OFF
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                max="50"
                step="0.5"
                value={globalDiscountCorralonPct}
                onChange={(e) => setGlobalDiscountCorralonPct(parseFloat(e.target.value) || 0)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm font-mono font-black text-white focus:ring-2 focus:ring-brand-500 outline-none"
              />
              <span className="text-xs font-bold text-slate-400">%</span>
            </div>
            <p className="text-[10px] text-slate-400">Descuento aplicado sobre el Precio de Lista.</p>
          </div>

          {/* Discount Distributor */}
          <div className="bg-slate-800/80 border border-slate-700/80 p-4 rounded-2xl space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                Descuento Distribuidor (20+ u)
              </span>
              <span className="text-xs font-mono font-black text-brand-400">
                -{globalDiscountDistributorPct}% OFF
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                max="50"
                step="0.5"
                value={globalDiscountDistributorPct}
                onChange={(e) => setGlobalDiscountDistributorPct(parseFloat(e.target.value) || 0)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm font-mono font-black text-white focus:ring-2 focus:ring-brand-500 outline-none"
              />
              <span className="text-xs font-bold text-slate-400">%</span>
            </div>
            <p className="text-[10px] text-slate-400">El mayor descuento por volumen de compra.</p>
          </div>

          {/* Freight Cost */}
          <div className="bg-slate-800/80 border border-slate-700/80 p-4 rounded-2xl space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                Costo Logístico / Flete
              </span>
              <span className="text-xs font-mono font-black text-amber-400">
                {globalFreightPct}%
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                max="30"
                step="0.5"
                value={globalFreightPct}
                onChange={(e) => setGlobalFreightPct(parseFloat(e.target.value) || 0)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm font-mono font-black text-white focus:ring-2 focus:ring-brand-500 outline-none"
              />
              <span className="text-xs font-bold text-slate-400">%</span>
            </div>
            <p className="text-[10px] text-slate-400">% de la facturación deducido para logística.</p>
          </div>
        </div>
      </div>

      {/* Category Tabs & Specific Category Configurations */}
      <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-4">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-brand-600" />
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
              Categorías & Ajuste por Tipo de Producto
            </h3>
          </div>

          {/* Category Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
            <button
              onClick={() => setSelectedCategoryTab("all")}
              className={cn(
                "px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer",
                selectedCategoryTab === "all" ? "bg-slate-900 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              )}
            >
              Todos ({calculatedProducts.length})
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategoryTab(cat)}
                className={cn(
                  "px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer",
                  selectedCategoryTab === cat ? "bg-brand-600 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                )}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Selected Category Custom Configuration Box (When not 'all') */}
        {selectedCategoryTab !== "all" && (
          <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-3 animate-in fade-in">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <span className="text-xs font-black text-slate-900 uppercase tracking-wider">
                  Configuración para {selectedCategoryTab}
                </span>
                <p className="text-[11px] text-slate-500">
                  Podés fijar un margen exclusivo más alto o más bajo para esta categoría de productos (ej: Biodigestores).
                </p>
              </div>

              <label className="flex items-center gap-2 cursor-pointer select-none bg-white px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 shadow-sm">
                <input
                  type="checkbox"
                  checked={categoryConfigs[selectedCategoryTab]?.useCustom || false}
                  onChange={(e) => {
                    const isChecked = e.target.checked;
                    setCategoryConfigs(prev => ({
                      ...prev,
                      [selectedCategoryTab]: {
                        useCustom: isChecked,
                        marginDistributorPct: prev[selectedCategoryTab]?.marginDistributorPct || globalMarginDistributorPct,
                        discountCorralonPct: prev[selectedCategoryTab]?.discountCorralonPct || globalDiscountCorralonPct,
                        discountDistributorPct: prev[selectedCategoryTab]?.discountDistributorPct || globalDiscountDistributorPct
                      }
                    }));
                  }}
                  className="w-4 h-4 rounded border-slate-300 text-brand-600 accent-brand-600"
                />
                <span>Personalizar Margen de esta Categoría</span>
              </label>
            </div>

            {/* Custom Category Inputs */}
            {categoryConfigs[selectedCategoryTab]?.useCustom && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-200">
                <div className="space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Ganancia Distribuidor (20+)</span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      value={categoryConfigs[selectedCategoryTab]?.marginDistributorPct || 10}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        setCategoryConfigs(prev => ({
                          ...prev,
                          [selectedCategoryTab]: { ...prev[selectedCategoryTab], marginDistributorPct: val }
                        }));
                      }}
                      className="w-full bg-white border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs font-mono font-bold text-slate-900"
                    />
                    <span className="text-xs font-bold text-slate-500">%</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Descuento Corralón (10-19u)</span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      value={categoryConfigs[selectedCategoryTab]?.discountCorralonPct || 8}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        setCategoryConfigs(prev => ({
                          ...prev,
                          [selectedCategoryTab]: { ...prev[selectedCategoryTab], discountCorralonPct: val }
                        }));
                      }}
                      className="w-full bg-white border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs font-mono font-bold text-slate-900"
                    />
                    <span className="text-xs font-bold text-slate-500">%</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Descuento Distribuidor (20+u)</span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      value={categoryConfigs[selectedCategoryTab]?.discountDistributorPct || 14}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        setCategoryConfigs(prev => ({
                          ...prev,
                          [selectedCategoryTab]: { ...prev[selectedCategoryTab], discountDistributorPct: val }
                        }));
                      }}
                      className="w-full bg-white border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs font-mono font-bold text-slate-900"
                    />
                    <span className="text-xs font-bold text-slate-500">%</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Search Bar */}
        <div className="flex items-center gap-3 bg-slate-50 border border-slate-200/80 px-4 py-2.5 rounded-2xl">
          <Search className="w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por nombre, capacidad o modelo (ej: 500L, Tricapa, Biodigestor, Tapa)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-transparent text-xs font-bold text-slate-800 outline-none placeholder:text-slate-400"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="text-xs text-slate-400 hover:text-slate-600 font-bold">
              Limpiar
            </button>
          )}
        </div>

        {/* Dynamic Table */}
        <div className="overflow-x-auto border border-slate-100 rounded-2xl shadow-sm">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-900 text-white text-[11px] font-black uppercase tracking-wider">
                <th className="py-3.5 px-4">Producto / Modelo</th>
                <th className="py-3.5 px-3">Tipo de Origen</th>
                <th className="py-3.5 px-3 text-right">Costo Base ($)</th>
                <th className="py-3.5 px-3.5 bg-brand-700 text-white text-right">📋 PRECIO DE LISTA (3-9u)</th>
                <th className="py-3.5 px-3.5 bg-indigo-900 text-white text-right">📦 CORRALÓN (10-19u)</th>
                <th className="py-3.5 px-3.5 bg-emerald-900 text-white text-right">🚛 DISTRIBUIDOR (20+u)</th>
                <th className="py-3.5 px-3 text-center">Ajuste</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredProducts.map((p) => {
                const isOverridden = p.isProductCustom;

                return (
                  <tr key={p.id} className={cn("hover:bg-slate-50/80 transition-colors", p.isFeatured && "bg-amber-50/20")}>
                    {/* Name & Badge */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div>
                          <span className="font-bold text-slate-900 block">{p.name}</span>
                          <span className="text-[10px] text-slate-400 font-medium">{p.category}</span>
                        </div>
                        {isOverridden && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-purple-100 text-purple-800">
                            Custom
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Origin Type */}
                    <td className="py-3 px-3">
                      {p.isManufactured ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                          <Factory className="w-3 h-3 text-blue-600" />
                          Planta Zono
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                          <Package className="w-3 h-3 text-slate-500" />
                          Terminado (Col E)
                        </span>
                      )}
                    </td>

                    {/* Base Cost */}
                    <td className="py-3 px-3 text-right">
                      <div className="font-mono font-bold text-slate-900">
                        ${Math.round(p.costBaseReal).toLocaleString("es-AR")}
                      </div>
                      <span className="text-[9px] text-slate-400 block font-medium">
                        {p.isManufactured ? `Ins: $${Math.round(p.rawInsumosColE).toLocaleString("es-AR")}` : "Costo Compra"}
                      </span>
                    </td>

                    {/* PRECIO DE LISTA */}
                    <td className="py-3 px-3.5 text-right bg-brand-50/40 border-x border-brand-100">
                      <div className="font-mono font-black text-slate-900 text-sm">
                        ${p.priceList.toLocaleString("es-AR")}
                      </div>
                      <span className="text-[9px] font-bold text-brand-700 block">
                        Neto: +${p.netProfitList.toLocaleString("es-AR")} ({p.marginListPct.toFixed(0)}%)
                      </span>
                    </td>

                    {/* CORRALON */}
                    <td className="py-3 px-3.5 text-right bg-indigo-50/40 border-r border-indigo-100">
                      <div className="font-mono font-black text-slate-900 text-sm">
                        ${p.priceCorralon.toLocaleString("es-AR")}
                      </div>
                      <span className="text-[9px] font-bold text-indigo-700 block">
                        -{p.activeDiscountCorrPct}% (Neto: +${p.netProfitCorr.toLocaleString("es-AR")})
                      </span>
                    </td>

                    {/* DISTRIBUIDOR */}
                    <td className="py-3 px-3.5 text-right bg-emerald-50/40 border-r border-emerald-100">
                      <div className="font-mono font-black text-slate-900 text-sm">
                        ${p.priceDistributor.toLocaleString("es-AR")}
                      </div>
                      <span className="text-[9px] font-bold text-emerald-700 block">
                        -{p.activeDiscountDistPct}% (Neto: +${p.netProfitDist.toLocaleString("es-AR")})
                      </span>
                    </td>

                    {/* Edit Override Button */}
                    <td className="py-3 px-3 text-center">
                      <button
                        onClick={() => setEditingProductId(editingProductId === p.id ? null : p.id)}
                        className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
                        title="Ajuste fino individual"
                      >
                        <Settings2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal / Panel for Individual Product Override */}
      {editingProductId && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-100 space-y-4 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h4 className="text-sm font-black text-slate-900">Ajuste Exclusivo de Producto</h4>
                <span className="text-xs text-slate-500 font-bold">
                  {products.find(p => p.id === editingProductId)?.name}
                </span>
              </div>
              <button
                onClick={() => setEditingProductId(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Mode selection */}
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                <input
                  type="radio"
                  name="override_mode"
                  checked={!productOverrides[editingProductId] || productOverrides[editingProductId]?.mode === "auto"}
                  onChange={() => {
                    setProductOverrides(prev => {
                      const copy = { ...prev };
                      delete copy[editingProductId];
                      return copy;
                    });
                  }}
                  className="accent-brand-600"
                />
                <span>Automático (Heredar de Categoría / Global)</span>
              </label>

              <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                <input
                  type="radio"
                  name="override_mode"
                  checked={productOverrides[editingProductId]?.mode === "margin"}
                  onChange={() => {
                    setProductOverrides(prev => ({
                      ...prev,
                      [editingProductId]: {
                        mode: "margin",
                        customMarginDistPct: prev[editingProductId]?.customMarginDistPct || 10
                      }
                    }));
                  }}
                  className="accent-brand-600"
                />
                <span>Fijar Ganancia Neta Distribuidor (%)</span>
              </label>

              {productOverrides[editingProductId]?.mode === "margin" && (
                <div className="pl-6 pt-1 flex items-center gap-2">
                  <input
                    type="number"
                    value={productOverrides[editingProductId]?.customMarginDistPct || 10}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      setProductOverrides(prev => ({
                        ...prev,
                        [editingProductId]: { ...prev[editingProductId], customMarginDistPct: val }
                      }));
                    }}
                    className="w-24 border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-mono font-bold text-slate-900"
                  />
                  <span className="text-xs font-bold text-slate-500">% ganancia limpia</span>
                </div>
              )}

              <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                <input
                  type="radio"
                  name="override_mode"
                  checked={productOverrides[editingProductId]?.mode === "fixed_price"}
                  onChange={() => {
                    setProductOverrides(prev => ({
                      ...prev,
                      [editingProductId]: {
                        mode: "fixed_price",
                        customFixedListPrice: prev[editingProductId]?.customFixedListPrice || 100000
                      }
                    }));
                  }}
                  className="accent-brand-600"
                />
                <span>Fijar Precio de Lista Manual ($)</span>
              </label>

              {productOverrides[editingProductId]?.mode === "fixed_price" && (
                <div className="pl-6 pt-1 flex items-center gap-2">
                  <input
                    type="number"
                    step="500"
                    value={productOverrides[editingProductId]?.customFixedListPrice || 100000}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      setProductOverrides(prev => ({
                        ...prev,
                        [editingProductId]: { ...prev[editingProductId], customFixedListPrice: val }
                      }));
                    }}
                    className="w-32 border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-mono font-bold text-slate-900"
                  />
                  <span className="text-xs font-bold text-slate-500">$ ARS Lista</span>
                </div>
              )}
            </div>

            <div className="pt-3 border-t flex justify-end">
              <button
                onClick={() => setEditingProductId(null)}
                className="px-5 py-2 bg-brand-600 text-white rounded-xl text-xs font-black hover:bg-brand-700 transition-all cursor-pointer"
              >
                Listo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

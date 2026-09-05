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
  FileSpreadsheet,
  FileText,
  Database,
  Save,
  X,
  Eye,
  EyeOff,
  CheckCircle,
  Clock,
  Ban,
  CheckSquare,
  Square,
  Edit3
} from "lucide-react";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

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
  defaultCommercialized?: boolean;
}

interface CategoryConfig {
  useCustom: boolean;
  marginDistributorPct: number; // Ganancia neta Distribuidor (20+)
  discountCorralonPct: number;  // % OFF para Corralón (10-19u)
  discountDistributorPct: number; // % OFF para Distribuidor (20+u)
}

interface ProductItemState {
  isCommercialized: boolean;
  isConfirmed: boolean;
  mode: "auto" | "margin" | "fixed_price";
  customMarginDistPct?: number;
  customFixedListPrice?: number;
}

export default function ListaMayoristaConfigPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [products, setProducts] = useState<ProductData[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  
  // 1. List Metadata
  const [listNumber, setListNumber] = useState("13");
  const [listDate, setListDate] = useState("Septiembre 2026");

  // 2. Global Settings
  const [globalFreightPct, setGlobalFreightPct] = useState<number>(10.0);
  const [globalMarginDistributorPct, setGlobalMarginDistributorPct] = useState<number>(10.0); // 10% base
  const [globalDiscountCorralonPct, setGlobalDiscountCorralonPct] = useState<number>(8.0); // 8% OFF
  const [globalDiscountDistributorPct, setGlobalDiscountDistributorPct] = useState<number>(14.0); // 14% OFF
  
  // 3. Category Settings Map
  const [categoryConfigs, setCategoryConfigs] = useState<Record<string, CategoryConfig>>({
    "Biodigestores": {
      useCustom: false,
      marginDistributorPct: 20.0,
      discountCorralonPct: 8.0,
      discountDistributorPct: 14.0
    }
  });

  // 4. Product States Map (isCommercialized, isConfirmed, overrides)
  const [productStates, setProductStates] = useState<Record<string, ProductItemState>>({});

  // 5. UI Filters & Selection
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategoryTab, setSelectedCategoryTab] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "COMMERCIALIZED" | "PENDING" | "CONFIRMED" | "EXCLUDED">("ALL");
  const [editingProduct, setEditingProduct] = useState<ProductData | null>(null);
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [isSavingDb, setIsSavingDb] = useState(false);
  const [lastSavedDbAt, setLastSavedDbAt] = useState<string | null>(null);

  // Load Initial Data
  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/admin/lista-mayorista-data");
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Error al cargar catálogo de costos");
      const fetchedProducts: ProductData[] = json.products || [];
      setProducts(fetchedProducts);
      setCategories(json.categories || []);

      // Initialize product states from localStorage (v2 with fallback to v1)
      const savedConfigV2 = localStorage.getItem("zono_mayorista_config_v2");
      const savedConfigV1 = localStorage.getItem("zono_mayorista_config_v1");
      let savedStates: Record<string, ProductItemState> = {};

      if (savedConfigV1) {
        try {
          const parsedV1 = JSON.parse(savedConfigV1);
          if (parsedV1.globalFreightPct !== undefined) setGlobalFreightPct(parsedV1.globalFreightPct);
          if (parsedV1.globalMarginDistributorPct !== undefined) setGlobalMarginDistributorPct(parsedV1.globalMarginDistributorPct);
          if (parsedV1.globalDiscountCorralonPct !== undefined) setGlobalDiscountCorralonPct(parsedV1.globalDiscountCorralonPct);
          if (parsedV1.globalDiscountDistributorPct !== undefined) setGlobalDiscountDistributorPct(parsedV1.globalDiscountDistributorPct);
          if (parsedV1.categoryConfigs) setCategoryConfigs(parsedV1.categoryConfigs);
          if (parsedV1.productOverrides) {
            Object.entries(parsedV1.productOverrides).forEach(([id, override]: [string, any]) => {
              savedStates[id] = {
                isCommercialized: true,
                isConfirmed: true,
                mode: override.mode || "auto",
                customFixedListPrice: override.customFixedListPrice,
                customMarginDistPct: override.customMarginDistPct
              };
            });
          }
          if (parsedV1.productStates) {
            savedStates = { ...savedStates, ...parsedV1.productStates };
          }
        } catch (e) {
          console.warn("Error parsing saved config v1:", e);
        }
      }

      if (savedConfigV2) {
        try {
          const parsedV2 = JSON.parse(savedConfigV2);
          if (parsedV2.listNumber) setListNumber(parsedV2.listNumber);
          if (parsedV2.listDate) setListDate(parsedV2.listDate);
          if (parsedV2.globalFreightPct !== undefined) setGlobalFreightPct(parsedV2.globalFreightPct);
          if (parsedV2.globalMarginDistributorPct !== undefined) setGlobalMarginDistributorPct(parsedV2.globalMarginDistributorPct);
          if (parsedV2.globalDiscountCorralonPct !== undefined) setGlobalDiscountCorralonPct(parsedV2.globalDiscountCorralonPct);
          if (parsedV2.globalDiscountDistributorPct !== undefined) setGlobalDiscountDistributorPct(parsedV2.globalDiscountDistributorPct);
          if (parsedV2.categoryConfigs) setCategoryConfigs(parsedV2.categoryConfigs);
          if (parsedV2.productStates) {
            savedStates = { ...savedStates, ...parsedV2.productStates };
          }
        } catch (e) {
          console.warn("Error parsing saved config v2:", e);
        }
      }

      // Priorizar configuración persistida en Supabase DB si existe
      if (json.savedDbConfig) {
        try {
          const dbConf = json.savedDbConfig;
          if (dbConf.listNumber) setListNumber(dbConf.listNumber);
          if (dbConf.listDate) setListDate(dbConf.listDate);
          if (dbConf.globalFreightPct !== undefined) setGlobalFreightPct(dbConf.globalFreightPct);
          if (dbConf.globalMarginDistributorPct !== undefined) setGlobalMarginDistributorPct(dbConf.globalMarginDistributorPct);
          if (dbConf.globalDiscountCorralonPct !== undefined) setGlobalDiscountCorralonPct(dbConf.globalDiscountCorralonPct);
          if (dbConf.globalDiscountDistributorPct !== undefined) setGlobalDiscountDistributorPct(dbConf.globalDiscountDistributorPct);
          if (dbConf.categoryConfigs) setCategoryConfigs(dbConf.categoryConfigs);
          if (dbConf.productStates) {
            savedStates = { ...savedStates, ...dbConf.productStates };
          }
          if (dbConf.savedAt) {
            setLastSavedDbAt(new Date(dbConf.savedAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }));
          }
        } catch (e) {
          console.warn("Error applying savedDbConfig:", e);
        }
      }

      // Merge defaults with saved states
      const initialStates: Record<string, ProductItemState> = {};
      fetchedProducts.forEach(p => {
        if (savedStates[p.id]) {
          initialStates[p.id] = savedStates[p.id];
        } else {
          // Default: 1100L not commercialized, others true
          initialStates[p.id] = {
            isCommercialized: p.defaultCommercialized !== false,
            isConfirmed: false,
            mode: "auto"
          };
        }
      });
      setProductStates(initialStates);

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
      listNumber,
      listDate,
      globalFreightPct,
      globalMarginDistributorPct,
      globalDiscountCorralonPct,
      globalDiscountDistributorPct,
      categoryConfigs,
      productStates
    };
    localStorage.setItem("zono_mayorista_config_v2", JSON.stringify(payload));
  };

  useEffect(() => {
    if (!loading && products.length > 0) {
      saveCurrentSettings();
    }
  }, [listNumber, listDate, globalFreightPct, globalMarginDistributorPct, globalDiscountCorralonPct, globalDiscountDistributorPct, categoryConfigs, productStates]);

  // Reset to Recommended Base
  const handleResetToDefaults = () => {
    if (!confirm("¿Deseas restablecer los parámetros globales y estados a los valores base recomendados?")) return;
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
    const defaultStates: Record<string, ProductItemState> = {};
    products.forEach(p => {
      defaultStates[p.id] = {
        isCommercialized: p.defaultCommercialized !== false,
        isConfirmed: false,
        mode: "auto"
      };
    });
    setProductStates(defaultStates);
  };

  // Toggle commercialized state
  const toggleCommercialized = (prodId: string) => {
    setProductStates(prev => {
      const current = prev[prodId] || { isCommercialized: true, isConfirmed: false, mode: "auto" };
      return {
        ...prev,
        [prodId]: {
          ...current,
          isCommercialized: !current.isCommercialized
        }
      };
    });
  };

  // Toggle confirmed state (1-click OK)
  const toggleConfirmed = (prodId: string) => {
    setProductStates(prev => {
      const current = prev[prodId] || { isCommercialized: true, isConfirmed: false, mode: "auto" };
      return {
        ...prev,
        [prodId]: {
          ...current,
          isConfirmed: !current.isConfirmed
        }
      };
    });
  };

  // Math Engine: Calculates Prices for every product dynamically
  const calculatedProducts = useMemo(() => {
    // Pass 1: Calculate raw prices for all items
    const rawCalculated = products.map((prod) => {
      const catConfig = categoryConfigs[prod.category];
      const state = productStates[prod.id] || {
        isCommercialized: prod.defaultCommercialized !== false,
        isConfirmed: false,
        mode: "auto"
      };

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
      if (state.mode === "margin" && state.customMarginDistPct !== undefined) {
        activeMarginDistPct = state.customMarginDistPct;
        isProductCustom = true;
      }

      const costBase = prod.costBaseReal;
      const freightFactor = (100 - globalFreightPct) / 100; // e.g. 0.90

      let priceList = 0;
      let priceCorralon = 0;
      let priceDistributor = 0;

      if (state.mode === "fixed_price" && state.customFixedListPrice) {
        // Fixed List Price override
        isProductCustom = true;
        priceList = state.customFixedListPrice;
        priceCorralon = Math.round((priceList * (1 - activeDiscountCorrPct / 100)) / 100) * 100;
        priceDistributor = Math.round((priceList * (1 - activeDiscountDistPct / 100)) / 100) * 100;
      } else {
        // Dynamic calculation from Cost + Margin
        const distMarginFactor = 1 + (activeMarginDistPct / 100);
        priceDistributor = Math.round(((costBase * distMarginFactor) / freightFactor) / 100) * 100;

        const distDiscountFactor = 1 - (activeDiscountDistPct / 100);
        priceList = Math.round((priceDistributor / distDiscountFactor) / 100) * 100;

        const corrDiscountFactor = 1 - (activeDiscountCorrPct / 100);
        priceCorralon = Math.round((priceList * corrDiscountFactor) / 100) * 100;
      }

      return {
        ...prod,
        isCommercialized: state.isCommercialized,
        isConfirmed: state.isConfirmed,
        mode: state.mode,
        customMarginDistPct: state.customMarginDistPct,
        customFixedListPrice: state.customFixedListPrice,
        activeMarginDistPct,
        activeDiscountCorrPct,
        activeDiscountDistPct,
        isCategoryCustom,
        isProductCustom,
        priceList,
        priceCorralon,
        priceDistributor
      };
    });

    // Map Sépticas prices by litraje
    const septicaMap: Record<string, { priceList: number; priceCorralon: number; priceDistributor: number; isConfirmed: boolean }> = {};
    rawCalculated.filter(p => p.category === "Cámaras Sépticas").forEach(s => {
      septicaMap[s.liters] = {
        priceList: s.priceList,
        priceCorralon: s.priceCorralon,
        priceDistributor: s.priceDistributor,
        isConfirmed: s.isConfirmed
      };
    });

    // Pass 2: Finalize metrics and link Desengrasadoras to Sépticas of same capacity
    return rawCalculated.map(prod => {
      let finalPriceList = prod.priceList;
      let finalPriceCorralon = prod.priceCorralon;
      let finalPriceDistributor = prod.priceDistributor;
      let finalIsConfirmed = prod.isConfirmed;
      let isLinkedToSeptica = false;

      // Link Desengrasadoras (300L, 500L, 600L, 750L, 1000L, 3000L) to Sépticas unless custom fixed price
      if (prod.category === "Cámaras Desengrasadoras" && septicaMap[prod.liters] && prod.mode !== "fixed_price") {
        const matchingSept = septicaMap[prod.liters];
        finalPriceList = matchingSept.priceList;
        finalPriceCorralon = matchingSept.priceCorralon;
        finalPriceDistributor = matchingSept.priceDistributor;
        finalIsConfirmed = matchingSept.isConfirmed || prod.isConfirmed;
        isLinkedToSeptica = true;
      }

      const costBase = prod.costBaseReal;
      const fleteList = Math.round(finalPriceList * (globalFreightPct / 100));
      const netProfitList = finalPriceList - fleteList - costBase;
      const marginListPct = ((netProfitList / costBase) * 100);

      const fleteCorr = Math.round(finalPriceCorralon * (globalFreightPct / 100));
      const netProfitCorr = finalPriceCorralon - fleteCorr - costBase;
      const marginCorrPct = ((netProfitCorr / costBase) * 100);

      const fleteDist = Math.round(finalPriceDistributor * (globalFreightPct / 100));
      const netProfitDist = finalPriceDistributor - fleteDist - costBase;
      const marginDistPct = ((netProfitDist / costBase) * 100);

      return {
        ...prod,
        priceList: finalPriceList,
        fleteList,
        netProfitList,
        marginListPct,
        priceCorralon: finalPriceCorralon,
        fleteCorr,
        netProfitCorr,
        marginCorrPct,
        priceDistributor: finalPriceDistributor,
        fleteDist,
        netProfitDist,
        marginDistPct,
        isConfirmed: finalIsConfirmed,
        isLinkedToSeptica
      };
    });
  }, [products, globalFreightPct, globalMarginDistributorPct, globalDiscountCorralonPct, globalDiscountDistributorPct, categoryConfigs, productStates]);

  // Overall Statistics for Lista 13
  const stats = useMemo(() => {
    const total = calculatedProducts.length;
    const commercialized = calculatedProducts.filter(p => p.isCommercialized).length;
    const confirmed = calculatedProducts.filter(p => p.isCommercialized && p.isConfirmed).length;
    const pending = commercialized - confirmed;
    const excluded = total - commercialized;
    const progressPct = commercialized > 0 ? Math.round((confirmed / commercialized) * 100) : 0;

    return { total, commercialized, confirmed, pending, excluded, progressPct };
  }, [calculatedProducts]);

  // Filtered view
  const filteredProducts = useMemo(() => {
    return calculatedProducts.filter((p) => {
      // 1. Search Query
      const matchQuery = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         p.family.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         p.category.toLowerCase().includes(searchQuery.toLowerCase());

      // 2. Category Tab
      const matchCat = selectedCategoryTab === "all" || p.category === selectedCategoryTab;

      // 3. Status Filter
      let matchStatus = true;
      if (statusFilter === "COMMERCIALIZED") matchStatus = p.isCommercialized;
      else if (statusFilter === "PENDING") matchStatus = p.isCommercialized && !p.isConfirmed;
      else if (statusFilter === "CONFIRMED") matchStatus = p.isCommercialized && p.isConfirmed;
      else if (statusFilter === "EXCLUDED") matchStatus = !p.isCommercialized;

      return matchQuery && matchCat && matchStatus;
    });
  }, [calculatedProducts, searchQuery, selectedCategoryTab, statusFilter]);

  // Excel Export Handler (Exact columns: Producto | Precio Lista | Precio Corralón | Precio Distribuidor)
  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();

    // Solo exportar productos comercializados en Lista 13
    const activeProducts = calculatedProducts.filter(p => p.isCommercialized);

    const rows = activeProducts.map(p => ({
      "Producto": p.name,
      "Precio Lista": p.priceList,
      "Precio Corralón": p.priceCorralon,
      "Precio Distribuidor": p.priceDistributor
    }));

    const ws = XLSX.utils.json_to_sheet(rows);

    // Ajuste de anchos de columna en Excel
    ws["!cols"] = [
      { wch: 38 }, // Producto
      { wch: 16 }, // Precio Lista
      { wch: 18 }, // Precio Corralón
      { wch: 20 }  // Precio Distribuidor
    ];

    XLSX.utils.book_append_sheet(wb, ws, `Lista ${listNumber}`);
    XLSX.writeFile(wb, `Lista_${listNumber}_Mayorista_Zono_${listDate.replace(/\s+/g, '_')}.xlsx`);
  };

  // PDF Export Handler (Exact columns: Producto | Precio Lista | Precio Corralón | Precio Distribuidor)
  const handleExportPDF = () => {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const activeProducts = calculatedProducts.filter(p => p.isCommercialized);

    // Header Banner
    doc.setFillColor(0, 21, 56); // #001538 Navy
    doc.rect(0, 0, 210, 26, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.text("ZONO CONSTRUCCIÓN  |  AQUAFORT", 14, 11);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.text(`LISTA DE PRECIOS MAYORISTA N° ${listNumber}  —  VIGENCIA: ${listDate.toUpperCase()}`, 14, 19);

    // Conditions info box
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(14, 30, 182, 14, 2, 2, "F");

    doc.setTextColor(30, 41, 59);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("CONDICIONES:", 18, 35.5);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text(`• Precio Lista: 3 a 9 unidades   |   • Corralón (10-19u): -${globalDiscountCorralonPct}% OFF   |   • Distribuidor (20+u): -${globalDiscountDistributorPct}% OFF   |   • Flete incluido`, 18, 40.5);

    // Prepare table data grouped by category
    const tableBody: any[] = [];

    categories.forEach(cat => {
      const prodsInCat = activeProducts.filter(p => p.category === cat);
      if (prodsInCat.length > 0) {
        // Category Section Header Row
        tableBody.push([
          {
            content: cat.toUpperCase(),
            colSpan: 4,
            styles: {
              fillColor: [226, 232, 240],
              textColor: [15, 23, 42],
              fontStyle: "bold",
              fontSize: 8.5,
              halign: "left"
            }
          }
        ]);

        // Product Rows
        prodsInCat.forEach(p => {
          tableBody.push([
            p.name,
            `$${p.priceList.toLocaleString("es-AR")}`,
            `$${p.priceCorralon.toLocaleString("es-AR")}`,
            `$${p.priceDistributor.toLocaleString("es-AR")}`
          ]);
        });
      }
    });

    autoTable(doc, {
      startY: 48,
      head: [["Producto", "Precio Lista", "Precio Corralón", "Precio Distribuidor"]],
      body: tableBody,
      theme: "striped",
      headStyles: {
        fillColor: [0, 21, 56],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 8.5,
        halign: "center"
      },
      columnStyles: {
        0: { halign: "left", fontStyle: "bold", cellWidth: 80 },
        1: { halign: "right", fontStyle: "normal", cellWidth: 34 },
        2: { halign: "right", fontStyle: "normal", cellWidth: 34 },
        3: { halign: "right", fontStyle: "bold", textColor: [0, 105, 255], cellWidth: 34 }
      },
      styles: {
        fontSize: 8,
        cellPadding: 2
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252]
      },
      margin: { left: 14, right: 14 },
      didDrawPage: (data) => {
        const pageCount = (doc as any).internal.getNumberOfPages();
        doc.setFontSize(7.5);
        doc.setTextColor(148, 163, 184);
        doc.text(
          `Lista N° ${listNumber} — Zono Construcción  |  Página ${data.pageNumber} de ${pageCount}`,
          14,
          doc.internal.pageSize.height - 6
        );
      }
    });

    doc.save(`Lista_${listNumber}_Mayorista_Zono_${listDate.replace(/\s+/g, '_')}.pdf`);
  };

  // Copy Summary to Clipboard
  const handleCopySummary = () => {
    const activeProducts = calculatedProducts.filter(p => p.isCommercialized);

    const lines = [
      `📋 *LISTA DE PRECIOS MAYORISTA N° ${listNumber} — AQUAFORT / ZONO*`,
      `📅 *Vigencia:* ${listDate}`,
      "• Precios de Lista para 3 a 9 unidades (Ferretero)",
      `• 10 a 19 unidades (Corralón): -${globalDiscountCorralonPct}% OFF`,
      `• 20 o más unidades (Distribuidor): -${globalDiscountDistributorPct}% OFF`,
      "• Flete incluido puesto en corralón/local",
      ""
    ];

    categories.forEach(cat => {
      const prodsInCat = activeProducts.filter(p => p.category === cat);
      if (prodsInCat.length > 0) {
        lines.push(`--- ${cat.toUpperCase()} ---`);
        prodsInCat.forEach(p => {
          lines.push(`• ${p.name}: Lista $${p.priceList.toLocaleString('es-AR')} | Corralón (10u): $${p.priceCorralon.toLocaleString('es-AR')} | Distr. (20u): $${p.priceDistributor.toLocaleString('es-AR')}`);
        });
        lines.push("");
      }
    });

    navigator.clipboard.writeText(lines.join("\n"));
    setCopiedSummary(true);
    setTimeout(() => setCopiedSummary(false), 2500);
  };

  const handleSaveToDatabase = async () => {
    try {
      setIsSavingDb(true);
      const res = await fetch("/api/admin/save-lista-mayorista", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listNumber,
          listDate,
          globalFreightPct,
          globalMarginDistributorPct,
          globalDiscountCorralonPct,
          globalDiscountDistributorPct,
          categoryConfigs,
          productStates,
          items: calculatedProducts
        })
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Error al guardar en la base de datos");
      const timeStr = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
      setLastSavedDbAt(timeStr);
      alert(`✅ ¡Lista ${listNumber} guardada y publicada en la Base de Datos con éxito! (${timeStr} hs)`);
    } catch (err: any) {
      alert("❌ Error: " + (err.message || "Error al conectar con la base de datos"));
    } finally {
      setIsSavingDb(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20">
      {/* Top Banner: Lista 13 Header */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-xs shrink-0">
            <Calculator className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-black text-slate-900 tracking-tight">
                Lista de Precios Mayorista
              </h1>
              <div className="flex items-center gap-1.5 bg-indigo-50 text-indigo-700 border border-indigo-200 px-3 py-0.5 rounded-full text-xs font-black">
                <span>Lista N°</span>
                <input
                  type="text"
                  value={listNumber}
                  onChange={(e) => setListNumber(e.target.value)}
                  className="w-8 bg-transparent text-center font-black outline-none border-b border-indigo-400"
                />
              </div>
              <span className="text-xs text-slate-500 font-bold">
                ({listDate})
              </span>
              {lastSavedDbAt && (
                <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-md font-bold flex items-center gap-1">
                  <Database className="w-3 h-3" /> En BD: {lastSavedDbAt} hs
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Revisá producto por producto, confirmá los precios finales y guardá la Lista {listNumber} oficial en la Base de Datos.
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={handleCopySummary}
            className="px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            {copiedSummary ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
            <span>{copiedSummary ? "¡Copiado!" : "Copiar"}</span>
          </button>
          
          <button
            onClick={handleExportExcel}
            className="px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Excel</span>
          </button>

          <button
            onClick={handleExportPDF}
            className="px-3.5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <FileText className="w-4 h-4" />
            <span>PDF</span>
          </button>

          <button
            onClick={handleSaveToDatabase}
            disabled={isSavingDb}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-black transition-all flex items-center gap-1.5 shadow-md shadow-blue-600/20 cursor-pointer"
          >
            {isSavingDb ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Database className="w-4 h-4" />
            )}
            <span>{isSavingDb ? "Guardando..." : "Guardar en BD"}</span>
          </button>
        </div>
      </div>

      {/* Progress & Review Status Banner */}
      <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            <h2 className="text-sm font-bold text-slate-900">
              Progreso de Revisión y Aprobación de Lista {listNumber}
            </h2>
          </div>
          <span className="text-xs font-mono font-bold text-slate-600">
            {stats.confirmed} de {stats.commercialized} productos confirmados ({stats.progressPct}%)
          </span>
        </div>

        {/* Progress Bar */}
        <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden flex">
          <div 
            className="bg-emerald-500 transition-all duration-300"
            style={{ width: `${stats.progressPct}%` }}
          />
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
          <button
            onClick={() => setStatusFilter("ALL")}
            className={cn(
              "px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer",
              statusFilter === "ALL" ? "bg-slate-900 text-white shadow-xs" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            )}
          >
            Todos ({stats.total})
          </button>

          <button
            onClick={() => setStatusFilter("COMMERCIALIZED")}
            className={cn(
              "px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer",
              statusFilter === "COMMERCIALIZED" ? "bg-indigo-600 text-white shadow-xs" : "bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
            )}
          >
            En Lista {listNumber} ({stats.commercialized})
          </button>

          <button
            onClick={() => setStatusFilter("CONFIRMED")}
            className={cn(
              "px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer flex items-center gap-1.5",
              statusFilter === "CONFIRMED" ? "bg-emerald-600 text-white shadow-xs" : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
            )}
          >
            <CheckCircle className="w-3.5 h-3.5" />
            Confirmados OK ({stats.confirmed})
          </button>

          <button
            onClick={() => setStatusFilter("PENDING")}
            className={cn(
              "px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer flex items-center gap-1.5",
              statusFilter === "PENDING" ? "bg-amber-600 text-white shadow-xs" : "bg-amber-50 text-amber-700 hover:bg-amber-100"
            )}
          >
            <Clock className="w-3.5 h-3.5" />
            Pendientes de Revisar ({stats.pending})
          </button>

          <button
            onClick={() => setStatusFilter("EXCLUDED")}
            className={cn(
              "px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer flex items-center gap-1.5",
              statusFilter === "EXCLUDED" ? "bg-rose-600 text-white shadow-xs" : "bg-rose-50 text-rose-700 hover:bg-rose-100"
            )}
          >
            <Ban className="w-3.5 h-3.5" />
            No Comercializados ({stats.excluded})
          </button>
        </div>
      </div>

      {/* Control Panel: Global Configuration */}
      <div className="bg-slate-900 text-white p-6 rounded-3xl shadow-xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div className="space-y-0.5">
            <h2 className="text-sm font-black uppercase tracking-wider text-indigo-400 flex items-center gap-2">
              <Sliders className="w-4 h-4" />
              Parámetros Base del Modelo Mayorista
            </h2>
            <p className="text-xs text-slate-400">
              Modificá el margen base o los descuentos y todos los precios se recalcularán automáticamente en tiempo real.
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
                Ganancia Distribuidor (20+ u)
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
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm font-mono font-black text-white focus:ring-2 focus:ring-indigo-500 outline-none"
              />
              <span className="text-xs font-bold text-slate-400">%</span>
            </div>
            <p className="text-[10px] text-slate-400">Piso mínimo de ganancia limpia de la fábrica.</p>
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
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm font-mono font-black text-white focus:ring-2 focus:ring-indigo-500 outline-none"
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
              <span className="text-xs font-mono font-black text-indigo-400">
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
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm font-mono font-black text-white focus:ring-2 focus:ring-indigo-500 outline-none"
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
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm font-mono font-black text-white focus:ring-2 focus:ring-indigo-500 outline-none"
              />
              <span className="text-xs font-bold text-slate-400">%</span>
            </div>
            <p className="text-[10px] text-slate-400">% deducido de cada venta para el flete.</p>
          </div>
        </div>
      </div>

      {/* Category Tabs & Search Bar */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Category Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
            <button
              onClick={() => setSelectedCategoryTab("all")}
              className={cn(
                "px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer",
                selectedCategoryTab === "all" ? "bg-slate-900 text-white shadow-xs" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
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
                  selectedCategoryTab === cat ? "bg-indigo-600 text-white shadow-xs" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                )}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Search Input */}
          <div className="relative w-full md:w-72">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por nombre, litros..."
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>
        </div>
      </div>

      {/* Main Pricing Table */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-900 text-white text-[11px] font-black uppercase tracking-wider">
                <th className="py-4 px-4 text-center w-16">¿En Lista?</th>
                <th className="py-4 px-4">Producto / Modelo</th>
                <th className="py-4 px-3 text-center">Tipo de Origen</th>
                <th className="py-4 px-3 text-right">Costo Base ($)</th>
                <th className="py-4 px-4 bg-blue-900/90 text-right text-blue-100">
                  📋 Lista (3-9 u)
                </th>
                <th className="py-4 px-4 bg-indigo-900/90 text-right text-indigo-100">
                  📦 Corralón (10-19 u)
                </th>
                <th className="py-4 px-4 bg-emerald-900/90 text-right text-emerald-100">
                  🚛 Distribuidor (20+ u)
                </th>
                <th className="py-4 px-4 text-center">Estado / Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-600" />
                    Cargando catálogo mayorista...
                  </td>
                </tr>
              ) : filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-slate-400">
                    No se encontraron productos con los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                filteredProducts.map((p) => {
                  return (
                    <tr 
                      key={p.id}
                      className={cn(
                        "hover:bg-slate-50/80 transition-colors",
                        !p.isCommercialized && "bg-slate-50/50 opacity-60",
                        p.isConfirmed && p.isCommercialized && "bg-emerald-50/30"
                      )}
                    >
                      {/* Checkbox: ¿En Lista? */}
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => toggleCommercialized(p.id)}
                          className={cn(
                            "p-1.5 rounded-lg border transition-all cursor-pointer",
                            p.isCommercialized 
                              ? "bg-indigo-50 border-indigo-200 text-indigo-600 hover:bg-indigo-100" 
                              : "bg-slate-100 border-slate-200 text-slate-400 hover:bg-slate-200"
                          )}
                          title={p.isCommercialized ? "Excluir de Lista 13" : "Incluir en Lista 13"}
                        >
                          {p.isCommercialized ? (
                            <CheckSquare className="w-4 h-4" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      </td>

                      {/* Product Name & Category */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <div>
                            <span className="font-bold text-slate-900 block">
                              {p.name}
                            </span>
                            <span className="text-[10px] text-slate-400 font-medium flex items-center gap-1">
                              {p.category}
                              {p.isLinkedToSeptica && (
                                <span className="text-[9px] font-black text-indigo-600 bg-indigo-50 border border-indigo-200 px-1.5 py-0.2 rounded-md">
                                  = Séptica {p.liters}
                                </span>
                              )}
                            </span>
                          </div>
                          {p.isFeatured && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-amber-50 text-amber-700 border border-amber-200">
                              Top
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Origin Type */}
                      <td className="py-3 px-3 text-center">
                        <span className={cn(
                          "px-2 py-0.5 rounded-full text-[10px] font-bold",
                          p.isManufactured 
                            ? "bg-blue-50 text-blue-700 border border-blue-200" 
                            : "bg-slate-100 text-slate-600 border border-slate-200"
                        )}>
                          {p.isManufactured ? "Planta Zono" : "Terminado"}
                        </span>
                      </td>

                      {/* Cost Base Real */}
                      <td className="py-3 px-3 text-right font-mono font-bold text-slate-900">
                        ${p.costBaseReal.toLocaleString("es-AR")}
                        {p.isManufactured && (
                          <span className="block text-[9px] text-slate-400 font-normal">
                            Insumo: ${p.rawInsumosColE.toLocaleString("es-AR")}
                          </span>
                        )}
                      </td>

                      {/* Tier 1: Precio de Lista (3-9 u) */}
                      <td className="py-3 px-4 text-right bg-blue-50/30">
                        <span className="font-mono font-black text-slate-900 text-sm block">
                          ${p.priceList.toLocaleString("es-AR")}
                        </span>
                        <span className="text-[10px] font-mono text-blue-600 font-bold">
                          Neto: +${p.netProfitList.toLocaleString("es-AR")} ({p.marginListPct.toFixed(0)}%)
                        </span>
                      </td>

                      {/* Tier 2: Corralón (10-19 u) */}
                      <td className="py-3 px-4 text-right bg-indigo-50/30">
                        <span className="font-mono font-black text-slate-900 text-sm block">
                          ${p.priceCorralon.toLocaleString("es-AR")}
                        </span>
                        <span className="text-[10px] font-mono text-indigo-600 font-bold">
                          -{p.activeDiscountCorrPct}% (Neto: +${p.netProfitCorr.toLocaleString("es-AR")})
                        </span>
                      </td>

                      {/* Tier 3: Distribuidor (20+ u) */}
                      <td className="py-3 px-4 text-right bg-emerald-50/30">
                        <span className="font-mono font-black text-emerald-900 text-sm block">
                          ${p.priceDistributor.toLocaleString("es-AR")}
                        </span>
                        <span className="text-[10px] font-mono text-emerald-600 font-bold">
                          -{p.activeDiscountDistPct}% (Neto: +${p.netProfitDist.toLocaleString("es-AR")})
                        </span>
                      </td>

                      {/* Actions & Confirmation Button */}
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {p.isCommercialized ? (
                            <>
                              <button
                                onClick={() => toggleConfirmed(p.id)}
                                className={cn(
                                  "px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1",
                                  p.isConfirmed 
                                    ? "bg-emerald-600 text-white shadow-xs hover:bg-emerald-700" 
                                    : "bg-slate-100 text-slate-600 hover:bg-emerald-50 hover:text-emerald-700 border border-slate-200"
                                )}
                                title={p.isConfirmed ? "Desmarcar confirmación" : "Confirmar precio para Lista 13"}
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>{p.isConfirmed ? "OK" : "Aprobar"}</span>
                              </button>

                              <button
                                onClick={() => setEditingProduct(p)}
                                className="p-1.5 rounded-xl bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-500 border border-slate-200 transition-all cursor-pointer"
                                title="Ajuste Fino de Precio"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          ) : (
                            <span className="text-[10px] font-bold text-rose-600 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full">
                              No en Lista
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Ajuste Fino Individual */}
      {editingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-sm text-slate-900">Ajuste de Precio para Lista {listNumber}</h3>
                <p className="text-xs text-slate-500">{editingProduct.name}</p>
              </div>
              <button 
                onClick={() => setEditingProduct(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Product Summary */}
            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Costo Base Real:</span>
                <span className="font-mono font-bold text-slate-900">${editingProduct.costBaseReal.toLocaleString("es-AR")}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Tipo de Producto:</span>
                <span className="font-bold text-slate-700">{editingProduct.originType}</span>
              </div>
            </div>

            {/* Mode Selector */}
            <div className="space-y-3">
              <label className="text-xs font-bold text-slate-700 block">Modo de Fijación de Precio:</label>
              
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setProductStates(prev => ({
                      ...prev,
                      [editingProduct.id]: {
                        ...prev[editingProduct.id],
                        mode: "auto"
                      }
                    }));
                  }}
                  className={cn(
                    "py-2 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer",
                    (productStates[editingProduct.id]?.mode || "auto") === "auto"
                      ? "bg-indigo-600 text-white border-indigo-600"
                      : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                  )}
                >
                  Automático
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setProductStates(prev => ({
                      ...prev,
                      [editingProduct.id]: {
                        ...prev[editingProduct.id],
                        mode: "margin",
                        customMarginDistPct: prev[editingProduct.id]?.customMarginDistPct || globalMarginDistributorPct
                      }
                    }));
                  }}
                  className={cn(
                    "py-2 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer",
                    productStates[editingProduct.id]?.mode === "margin"
                      ? "bg-indigo-600 text-white border-indigo-600"
                      : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                  )}
                >
                  Fijar Margen %
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const currentCalculated = calculatedProducts.find(p => p.id === editingProduct.id);
                    setProductStates(prev => ({
                      ...prev,
                      [editingProduct.id]: {
                        ...prev[editingProduct.id],
                        mode: "fixed_price",
                        customFixedListPrice: prev[editingProduct.id]?.customFixedListPrice || currentCalculated?.priceList || 0
                      }
                    }));
                  }}
                  className={cn(
                    "py-2 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer",
                    productStates[editingProduct.id]?.mode === "fixed_price"
                      ? "bg-indigo-600 text-white border-indigo-600"
                      : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                  )}
                >
                  Precio Fijo $
                </button>
              </div>

              {/* Custom Margin Input */}
              {productStates[editingProduct.id]?.mode === "margin" && (
                <div className="space-y-1 pt-2">
                  <label className="text-xs font-bold text-slate-700">Margen Distribuidor Deseado (%):</label>
                  <input
                    type="number"
                    value={productStates[editingProduct.id]?.customMarginDistPct || globalMarginDistributorPct}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      setProductStates(prev => ({
                        ...prev,
                        [editingProduct.id]: {
                          ...prev[editingProduct.id],
                          customMarginDistPct: val
                        }
                      }));
                    }}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold"
                  />
                </div>
              )}

              {/* Custom Fixed List Price Input */}
              {productStates[editingProduct.id]?.mode === "fixed_price" && (
                <div className="space-y-1 pt-2">
                  <label className="text-xs font-bold text-slate-700">Precio de Lista Fijo ($):</label>
                  <input
                    type="number"
                    step="100"
                    value={productStates[editingProduct.id]?.customFixedListPrice || 0}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      setProductStates(prev => ({
                        ...prev,
                        [editingProduct.id]: {
                          ...prev[editingProduct.id],
                          customFixedListPrice: val
                        }
                      }));
                    }}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold"
                  />
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="pt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setEditingProduct(null)}
                className="flex-1 py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all"
              >
                Cerrar
              </button>
              <button
                type="button"
                onClick={() => {
                  // Guardar y confirmar
                  setProductStates(prev => ({
                    ...prev,
                    [editingProduct.id]: {
                      ...prev[editingProduct.id],
                      isConfirmed: true
                    }
                  }));
                  setEditingProduct(null);
                }}
                className="flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>Guardar y Confirmar OK</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

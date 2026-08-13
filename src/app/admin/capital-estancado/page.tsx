"use client";

import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { formatPrice } from "@/lib/utils";
import { 
  AlertTriangle, 
  TrendingDown, 
  TrendingUp, 
  Search, 
  Filter, 
  Download, 
  Sparkles, 
  RefreshCw, 
  ArrowUpDown, 
  ChevronDown, 
  CheckCircle2, 
  Layers, 
  Tag, 
  Percent, 
  Coins, 
  Clock, 
  ArrowRight, 
  X, 
  Info, 
  SlidersHorizontal,
  Package,
  BadgeAlert,
  Flame,
  CheckCircle,
  HelpCircle,
  Factory,
  Boxes
} from "lucide-react";

interface Product {
  id: string;
  name: string;
  sku?: string;
  category?: string;
  price: number;
  cost_price?: number;
  stock_current?: number;
  stock_physical?: number;
  stock_reserved?: number;
  is_active?: boolean;
  is_on_sale?: boolean;
  image_url?: string;
  brand?: string;
  is_insumo?: boolean;
  insumo_use?: string;
  production_type?: string;
  mapped_real_product_id?: string;
  created_at?: string;
}

interface OrderItem {
  id: string;
  order_id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  orders: {
    id: string;
    order_date: string;
    status: string;
  } | null;
}

interface StagnantProductMetric {
  product: Product;
  stockPhysical: number;
  stockReserved: number;
  stockAvailable: number;
  stock: number; // stockAvailable
  unitCost: number;
  unitPrice: number;
  capitalTiedUp: number; // stockAvailable * UnitCost
  capitalTiedUpPvp: number; // stockAvailable * UnitPrice
  unitsSold: number;
  revenueGenerated: number;
  dailySpeed: number; // unitsSold / activeDays
  daysOfStock: number; // stockAvailable / dailySpeed
  riskLevel: 'critical' | 'moderate' | 'healthy' | 'out_of_stock';
  category: string;
  isInsumo: boolean;
  activeDays: number;
  isNewProduct: boolean;
}

type PeriodDays = 30 | 60 | 90 | 180 | 365;
type RiskFilter = 'all' | 'critical' | 'moderate' | 'healthy';
type InsumoFilter = 'exclude' | 'only' | 'all';
type SortKey = 'capitalTiedUp' | 'capitalTiedUpPvp' | 'daysOfStock' | 'stock' | 'unitsSold' | 'name';

export default function CapitalEstancadoPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Raw data from DB
  const [products, setProducts] = useState<Product[]>([]);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);

  // Filter & Search states
  const [periodDays, setPeriodDays] = useState<PeriodDays>(90);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedRisk, setSelectedRisk] = useState<RiskFilter>("all");
  const [selectedInsumoFilter, setSelectedInsumoFilter] = useState<InsumoFilter>("exclude");
  const [sortKey, setSortKey] = useState<SortKey>("capitalTiedUp");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Promo Simulation Modal state
  const [promoProduct, setPromoProduct] = useState<StagnantProductMetric | null>(null);
  const [discountPercent, setDiscountPercent] = useState<number>(20);
  const [targetStockPercent, setTargetStockPercent] = useState<number>(50); // % of stock to liquidate
  const [updatingPromo, setUpdatingPromo] = useState(false);

  // Helper to identify insumos / raw materials / components
  const checkIsInsumo = (p: Product): boolean => {
    if (p.is_insumo) return true;
    if (p.insumo_use) return true;
    const nameLower = (p.name || "").toLowerCase();
    const skuLower = (p.sku || "").toLowerCase();
    if (nameLower.includes("tacho") || skuLower.includes("tacho")) return true;
    return false;
  };

  // Load Data
  useEffect(() => {
    fetchData();
  }, [periodDays]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Calculate Date cutoff
      const now = new Date();
      const cutoffDate = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);
      const cutoffStr = cutoffDate.toISOString().split("T")[0];

      // 2. Fetch Products & Order Items in parallel
      const [productsRes] = await Promise.all([
        supabase
          .from("products")
          .select("id, name, sku, category, price, cost_price, stock_current, stock_physical, stock_reserved, is_active, is_on_sale, image_url, brand, is_insumo, insumo_use, production_type, mapped_real_product_id, created_at")
          .eq("is_active", true)
      ]);

      if (productsRes.error) throw productsRes.error;
      const fetchedProducts: Product[] = productsRes.data || [];
      setProducts(fetchedProducts);

      // Paginated query for order_items
      let fetchedOrderItems: OrderItem[] = [];
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const itemsRes = await supabase
          .from("order_items")
          .select(`
            id,
            order_id,
            product_id,
            product_name,
            quantity,
            unit_price,
            subtotal,
            orders!inner (
              id,
              order_date,
              status
            )
          `)
          .neq("orders.status", "Cancelado")
          .gte("orders.order_date", cutoffStr)
          .range(page * pageSize, (page + 1) * pageSize - 1);

        if (itemsRes.error) throw itemsRes.error;

        const batch = (itemsRes.data || []) as unknown as OrderItem[];
        fetchedOrderItems = [...fetchedOrderItems, ...batch];

        if (batch.length < pageSize) {
          hasMore = false;
        } else {
          page++;
        }
      }

      setOrderItems(fetchedOrderItems);
    } catch (err: any) {
      console.error("Error fetching capital estancado data:", err);
      setError(err.message || "No se pudieron cargar los datos de stock y ventas.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  // Derive categories list
  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.category) set.add(p.category);
    });
    return Array.from(set).sort();
  }, [products]);

  // Helper for text normalization
  const normalizeStr = (str: string): string => {
    return (str || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "");
  };

  // Build product lookup maps
  const { productById, productByNormName, productByNormSku } = useMemo(() => {
    const byId = new Map<string, Product>();
    const byNormName = new Map<string, Product>();
    const byNormSku = new Map<string, Product>();

    products.forEach((p) => {
      byId.set(p.id, p);
      const normN = normalizeStr(p.name);
      if (normN) byNormName.set(normN, p);
      const normS = normalizeStr(p.sku || "");
      if (normS) byNormSku.set(normS, p);
    });

    return { productById: byId, productByNormName: byNormName, productByNormSku: byNormSku };
  }, [products]);

  // Aggregate Sales by product_id with fallback to mapped products and name matching
  const productSalesMap = useMemo(() => {
    const map = new Map<string, { qty: number; revenue: number; firstSaleDate?: string }>();

    const addSale = (targetProductId: string, qty: number, rev: number, orderDate?: string) => {
      const current = map.get(targetProductId) || { qty: 0, revenue: 0 };
      let earliestDate = current.firstSaleDate;
      if (orderDate) {
        if (!earliestDate || orderDate < earliestDate) {
          earliestDate = orderDate;
        }
      }
      map.set(targetProductId, {
        qty: current.qty + qty,
        revenue: current.revenue + rev,
        firstSaleDate: earliestDate
      });
    };

    orderItems.forEach((item) => {
      const qty = Number(item.quantity) || 0;
      const rev = Number(item.subtotal) || (Number(item.unit_price) * qty) || 0;
      if (qty <= 0) return;

      const orderDate = item.orders?.order_date;

      let resolvedProduct: Product | undefined;

      if (item.product_id) {
        resolvedProduct = productById.get(item.product_id);
        if (resolvedProduct && resolvedProduct.mapped_real_product_id) {
          const mapped = productById.get(resolvedProduct.mapped_real_product_id);
          if (mapped) resolvedProduct = mapped;
        }
      }

      // Fallback matching by name or SKU if not resolved by product_id
      if (!resolvedProduct && item.product_name) {
        const normItemName = normalizeStr(item.product_name);
        resolvedProduct = productByNormName.get(normItemName) || productByNormSku.get(normItemName);
      }

      if (resolvedProduct) {
        addSale(resolvedProduct.id, qty, rev, orderDate);
      } else if (item.product_id) {
        addSale(item.product_id, qty, rev, orderDate);
      }
    });

    return map;
  }, [orderItems, productById, productByNormName, productByNormSku]);

  // Compute Metrics for each product
  const calculatedMetrics: StagnantProductMetric[] = useMemo(() => {
    return products.map((product) => {
      const isInsumo = checkIsInsumo(product);

      // Determine physical stock, reserved stock, and AVAILABLE stock
      const stockPhysical = product.stock_physical !== undefined && product.stock_physical !== null
        ? Number(product.stock_physical)
        : Number(product.stock_current || 0);

      const stockReserved = Number(product.stock_reserved || 0);
      // Available stock = physical stock minus reserved stock (clamped at 0 for calculations)
      const stockAvailable = Math.max(0, stockPhysical - stockReserved);

      // Determine unit cost: cost_price if > 0, else catalog price fallback
      const unitCost = (product.cost_price && product.cost_price > 0) ? product.cost_price : product.price;
      const unitPrice = product.price || 0;

      // Capital Tied Up is based strictly on AVAILABLE Stock
      const capitalTiedUp = stockAvailable * unitCost;
      const capitalTiedUpPvp = stockAvailable * unitPrice;

      const sales = productSalesMap.get(product.id) || { qty: 0, revenue: 0 };
      const unitsSold = sales.qty;
      const revenueGenerated = sales.revenue;

      // Calculate effective active days for products launched/sold recently
      let activeDays: number = periodDays;
      const firstDateStr = sales.firstSaleDate || product.created_at;

      if (firstDateStr) {
        const dateObj = new Date(firstDateStr);
        const nowObj = new Date();
        const diffDays = Math.max(1, Math.ceil((nowObj.getTime() - dateObj.getTime()) / (1000 * 60 * 60 * 24)));
        if (diffDays < periodDays) {
          activeDays = diffDays;
        }
      }

      const isNewProduct = activeDays < periodDays;
      const dailySpeed = unitsSold / activeDays;

      let daysOfStock: number;
      let riskLevel: 'critical' | 'moderate' | 'healthy' | 'out_of_stock';

      if (stockAvailable <= 0) {
        daysOfStock = 0;
        riskLevel = 'out_of_stock';
      } else if (dailySpeed === 0) {
        daysOfStock = 9999; // Represents Infinity (0 sales with positive available stock)
        riskLevel = 'critical';
      } else {
        daysOfStock = Math.round(stockAvailable / dailySpeed);
        if (daysOfStock > 90) {
          riskLevel = 'critical';
        } else if (daysOfStock >= 45) {
          riskLevel = 'moderate';
        } else {
          riskLevel = 'healthy';
        }
      }

      return {
        product,
        stockPhysical,
        stockReserved,
        stockAvailable,
        stock: stockAvailable,
        unitCost,
        unitPrice,
        capitalTiedUp,
        capitalTiedUpPvp,
        unitsSold,
        revenueGenerated,
        dailySpeed,
        daysOfStock,
        riskLevel,
        category: product.category || "Sin Categoría",
        isInsumo,
        activeDays,
        isNewProduct
      };
    });
  }, [products, productSalesMap, periodDays]);

  // Filtered & Sorted Metrics
  const filteredMetrics = useMemo(() => {
    return calculatedMetrics.filter((m) => {
      // Insumo Filter logic
      if (selectedInsumoFilter === 'exclude' && m.isInsumo) return false;
      if (selectedInsumoFilter === 'only' && !m.isInsumo) return false;

      // Exclude zero-stock products unless specifically sorting or searching
      if (m.stock <= 0 && selectedRisk !== 'all') return false;

      // Risk filter
      if (selectedRisk === 'critical' && m.riskLevel !== 'critical') return false;
      if (selectedRisk === 'moderate' && m.riskLevel !== 'moderate') return false;
      if (selectedRisk === 'healthy' && m.riskLevel !== 'healthy') return false;

      // Category filter
      if (selectedCategory !== 'all' && m.category !== selectedCategory) return false;

      // Search term
      if (searchTerm.trim() !== '') {
        const term = searchTerm.toLowerCase();
        const nameMatch = m.product.name.toLowerCase().includes(term);
        const skuMatch = (m.product.sku || '').toLowerCase().includes(term);
        const catMatch = m.category.toLowerCase().includes(term);
        if (!nameMatch && !skuMatch && !catMatch) return false;
      }

      return true;
    }).sort((a, b) => {
      let valA: any;
      let valB: any;

      if (sortKey === 'name') {
        valA = a.product.name.toLowerCase();
        valB = b.product.name.toLowerCase();
      } else {
        valA = a[sortKey];
        valB = b[sortKey];
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [calculatedMetrics, selectedInsumoFilter, selectedRisk, selectedCategory, searchTerm, sortKey, sortOrder]);

  // Global KPI Summaries (calculated over filtered items or baseline)
  const summary = useMemo(() => {
    let totalStockCapital = 0;
    let totalStockCapitalPvp = 0;
    let totalStagnantCapital = 0; // Critical + Moderate
    let totalStagnantCapitalPvp = 0;
    let criticalCapital = 0;
    let moderateCapital = 0;
    let criticalCount = 0;
    let moderateCount = 0;
    let totalProductsWithStock = 0;
    let insumosCount = 0;

    const categoryStagnantMap = new Map<string, number>();

    // Compute metrics considering current insumo filter context
    const metricsToSummary = calculatedMetrics.filter(m => {
      if (selectedInsumoFilter === 'exclude' && m.isInsumo) return false;
      if (selectedInsumoFilter === 'only' && !m.isInsumo) return false;
      return true;
    });

    metricsToSummary.forEach((m) => {
      if (m.stock > 0) {
        totalStockCapital += m.capitalTiedUp;
        totalStockCapitalPvp += m.capitalTiedUpPvp;
        totalProductsWithStock++;

        if (m.isInsumo) insumosCount++;

        if (m.riskLevel === 'critical') {
          totalStagnantCapital += m.capitalTiedUp;
          totalStagnantCapitalPvp += m.capitalTiedUpPvp;
          criticalCapital += m.capitalTiedUp;
          criticalCount++;

          const catVal = categoryStagnantMap.get(m.category) || 0;
          categoryStagnantMap.set(m.category, catVal + m.capitalTiedUp);
        } else if (m.riskLevel === 'moderate') {
          totalStagnantCapital += m.capitalTiedUp;
          totalStagnantCapitalPvp += m.capitalTiedUpPvp;
          moderateCapital += m.capitalTiedUp;
          moderateCount++;

          const catVal = categoryStagnantMap.get(m.category) || 0;
          categoryStagnantMap.set(m.category, catVal + m.capitalTiedUp);
        }
      }
    });

    const stagnantPct = totalStockCapital > 0 ? (totalStagnantCapital / totalStockCapital) * 100 : 0;

    // Find top category with most stagnant capital
    let topCategory = "N/A";
    let maxCatVal = 0;
    categoryStagnantMap.forEach((val, cat) => {
      if (val > maxCatVal) {
        maxCatVal = val;
        topCategory = cat;
      }
    });

    return {
      totalStockCapital,
      totalStockCapitalPvp,
      totalStagnantCapital,
      totalStagnantCapitalPvp,
      stagnantPct,
      criticalCapital,
      moderateCapital,
      criticalCount,
      moderateCount,
      totalProductsWithStock,
      insumosCount,
      topCategory,
      topCategoryVal: maxCatVal
    };
  }, [calculatedMetrics, selectedInsumoFilter]);

  // Sorting Toggle Handler
  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortOrder('desc');
    }
  };

  // CSV Export Handler
  const exportCSV = () => {
    if (filteredMetrics.length === 0) return;

    const headers = [
      "SKU",
      "Producto",
      "Categoría",
      "Tipo",
      "Stock Físico",
      "Costo Unitario (ARS)",
      "Precio Venta (ARS)",
      "Capital a Costo (ARS)",
      "Valor Potencial a PVP (ARS)",
      `Ventas (${periodDays}d)`,
      "Velocidad Diaria (U/día)",
      "Días de Cobertura",
      "Nivel de Riesgo",
      "En Oferta"
    ];

    const rows = filteredMetrics.map((m) => [
      `"${m.product.sku || ''}"`,
      `"${m.product.name.replace(/"/g, '""')}"`,
      `"${m.category.replace(/"/g, '""')}"`,
      m.isInsumo ? "Insumo / Componente" : "Venta Directa",
      m.stock,
      m.unitCost.toFixed(2),
      m.unitPrice.toFixed(2),
      m.capitalTiedUp.toFixed(2),
      m.capitalTiedUpPvp.toFixed(2),
      m.unitsSold,
      m.dailySpeed.toFixed(2),
      m.isInsumo ? "N/A (Uso Interno)" : (m.daysOfStock >= 9999 ? "Sin Ventas (>90d)" : m.daysOfStock),
      m.isInsumo ? "Componente Interno" : (m.riskLevel === 'critical' ? 'Crítico' : m.riskLevel === 'moderate' ? 'Moderado' : m.riskLevel === 'healthy' ? 'Sano' : 'Sin Stock'),
      m.product.is_on_sale ? "Sí" : "No"
    ]);

    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `capital_estancado_${periodDays}dias_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Handle Promo Activation
  const handleApplyPromo = async () => {
    if (!promoProduct) return;
    setUpdatingPromo(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const currentPrice = promoProduct.unitPrice;
      const promoPrice = Math.round(currentPrice * (1 - discountPercent / 100));

      const { error: updateErr } = await supabase
        .from("products")
        .update({
          is_on_sale: true,
          price: promoPrice
        })
        .eq("id", promoProduct.product.id);

      if (updateErr) throw updateErr;

      setSuccessMsg(`Promoción activada para "${promoProduct.product.name}". Nuevo precio: ${formatPrice(promoPrice)} (-${discountPercent}%).`);
      setPromoProduct(null);
      fetchData(); // Reload data
    } catch (err: any) {
      console.error("Error activating promo:", err);
      setError(err.message || "Error al actualizar la promoción del producto.");
    } finally {
      setUpdatingPromo(false);
    }
  };

  return (
    <div className="space-y-8 pb-16">
      {/* 🚀 Header Banner */}
      <div className="relative bg-gradient-to-br from-slate-900 via-indigo-950 to-brand-950 p-8 md:p-10 rounded-3xl text-white shadow-2xl overflow-hidden border border-indigo-900/30">
        <div className="absolute right-0 bottom-0 opacity-10 translate-y-1/3 translate-x-1/4 pointer-events-none">
          <Coins className="w-[450px] h-[450px] text-brand-400" />
        </div>
        <div className="relative z-10 space-y-3 max-w-3xl">
          <div className="flex items-center gap-2">
            <span className="bg-brand-500/25 border border-brand-400/30 text-brand-200 text-xs font-black uppercase tracking-widest px-3 py-1 rounded-full backdrop-blur-md flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-brand-400 animate-pulse" />
              Finanzas & Gestión de Stock
            </span>
            <span className="bg-amber-500/20 border border-amber-400/30 text-amber-200 text-xs font-bold px-3 py-1 rounded-full backdrop-blur-md">
              Análisis de Cobertura
            </span>
          </div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight leading-tight text-white">
            Análisis de Capital Estancado
          </h1>
          <p className="text-slate-300 font-medium text-sm md:text-base leading-relaxed">
            Identifica el dinero inmovilizado en depósito según la velocidad real de tus ventas. Evalúa el riesgo de obsolescencia y activa promociones inteligentes para liberar liquidez rápidamente.
          </p>

          <div className="pt-2 flex flex-wrap items-center gap-3">
            <button
              onClick={handleRefresh}
              disabled={refreshing || loading}
              className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white font-bold text-xs px-4 py-2.5 rounded-xl backdrop-blur-md border border-white/10 transition-all duration-200 active:scale-95 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
              Sincronizar Datos
            </button>
            <button
              onClick={exportCSV}
              disabled={filteredMetrics.length === 0}
              className="inline-flex items-center gap-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 font-bold text-xs px-4 py-2.5 rounded-xl backdrop-blur-md border border-emerald-400/20 transition-all duration-200 active:scale-95 disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              Exportar Reporte CSV
            </button>
          </div>
        </div>
      </div>

      {/* ⚠️ Error & Success Messages */}
      {error && (
        <div className="bg-rose-50 border border-rose-200 p-5 rounded-2xl flex items-start gap-3 text-rose-800 text-sm font-semibold shadow-sm animate-fadeIn">
          <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <span className="block font-bold text-rose-950">Atención:</span>
            <p className="text-rose-700">{error}</p>
          </div>
        </div>
      )}

      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-200 p-5 rounded-2xl flex items-start gap-3 text-emerald-800 text-sm font-semibold shadow-sm animate-fadeIn">
          <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <span className="block font-bold text-emerald-950">Operación Exitosa:</span>
            <p className="text-emerald-700">{successMsg}</p>
          </div>
        </div>
      )}

      {/* 📊 KPI Header Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Capital Total en Stock */}
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-3 relative overflow-hidden group hover:border-slate-200 transition-all duration-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-slate-400">Total en Depósito</span>
            <div className="w-10 h-10 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-600">
              <Package className="w-5 h-5" />
            </div>
          </div>
          <div>
            <span className="text-2xl lg:text-3xl font-black text-slate-900 tracking-tight block">
              {formatPrice(summary.totalStockCapital)}
            </span>
            <span className="text-xs text-indigo-600 font-bold block mt-0.5">
              PVP: {formatPrice(summary.totalStockCapitalPvp)}
            </span>
            <span className="text-[11px] text-slate-500 font-medium mt-1 block">
              {summary.totalProductsWithStock} SKUs evaluados
            </span>
          </div>
          <div className="h-1 w-full bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-slate-400 w-full rounded-full" />
          </div>
        </div>

        {/* Card 2: Capital Estancado */}
        <div className="bg-gradient-to-br from-rose-50 to-amber-50/50 p-6 rounded-3xl border border-rose-100/80 shadow-sm space-y-3 relative overflow-hidden group hover:shadow-md transition-all duration-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-rose-700">Capital Estancado</span>
            <div className="w-10 h-10 bg-rose-100 rounded-2xl flex items-center justify-center text-rose-600">
              <BadgeAlert className="w-5 h-5" />
            </div>
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl lg:text-3xl font-black text-rose-900 tracking-tight">
                {formatPrice(summary.totalStagnantCapital)}
              </span>
            </div>
            <span className="text-xs text-indigo-700 font-bold block mt-0.5">
              PVP Potencial: {formatPrice(summary.totalStagnantCapitalPvp)}
            </span>
            <span className="text-[11px] text-rose-700 font-bold mt-1 flex items-center gap-1">
              <TrendingDown className="w-3.5 h-3.5 text-rose-600" />
              {summary.stagnantPct.toFixed(1)}% del capital evaluado inmovilizado
            </span>
          </div>
          <div className="h-1.5 w-full bg-rose-100 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-rose-500 to-amber-500 rounded-full transition-all duration-500" 
              style={{ width: `${Math.min(100, summary.stagnantPct)}%` }}
            />
          </div>
        </div>

        {/* Card 3: Productos Críticos */}
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-3 relative overflow-hidden group hover:border-slate-200 transition-all duration-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-slate-400">Estancamiento Crítico</span>
            <div className="w-10 h-10 bg-rose-100/70 rounded-2xl flex items-center justify-center text-rose-500">
              <Flame className="w-5 h-5" />
            </div>
          </div>
          <div>
            <span className="text-2xl lg:text-3xl font-black text-rose-900 tracking-tight block">
              {summary.criticalCount} SKUs
            </span>
            <span className="text-xs text-slate-500 font-medium mt-1 block">
              Sin ventas directas o &gt;90d stock ({formatPrice(summary.criticalCapital)})
            </span>
          </div>
          <div className="h-1 w-full bg-slate-100 rounded-full overflow-hidden">
            <div 
              className="h-full bg-rose-500 rounded-full" 
              style={{ width: `${summary.totalProductsWithStock > 0 ? (summary.criticalCount / summary.totalProductsWithStock) * 100 : 0}%` }}
            />
          </div>
        </div>

        {/* Card 4: Categoría más Afectada */}
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-3 relative overflow-hidden group hover:border-slate-200 transition-all duration-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-slate-400">Mayor Impacto por Rubro</span>
            <div className="w-10 h-10 bg-amber-100/70 rounded-2xl flex items-center justify-center text-amber-600">
              <Tag className="w-5 h-5" />
            </div>
          </div>
          <div>
            <span className="text-lg lg:text-xl font-black text-slate-800 tracking-tight truncate block">
              {summary.topCategory}
            </span>
            <span className="text-xs font-bold text-amber-600 mt-1 block">
              {formatPrice(summary.topCategoryVal)} inmovilizados
            </span>
          </div>
          <div className="h-1 w-full bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-amber-400 w-full rounded-full" />
          </div>
        </div>
      </div>

      {/* 🛠️ Filters & Controls Panel */}
      <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-2 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-5 h-5 text-brand-600" />
            <h2 className="text-base font-black text-slate-800 tracking-tight">Filtros & Período de Ventas</h2>
          </div>

          {/* Timeframe Buttons */}
          <div className="flex items-center gap-1.5 bg-slate-100/80 p-1.5 rounded-2xl overflow-x-auto">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-2">Ventas:</span>
            {([30, 60, 90, 180, 365] as PeriodDays[]).map((d) => (
              <button
                key={d}
                onClick={() => setPeriodDays(d)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all duration-200 whitespace-nowrap ${
                  periodDays === d
                    ? "bg-brand-600 text-white shadow-sm shadow-brand-600/20"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
                }`}
              >
                Últimos {d} días
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Search Box */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar SKU, Nombre, Tacho..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 text-xs font-medium bg-slate-50 border border-slate-200 rounded-2xl text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Insumos / Tipo Producto Filter */}
          <div>
            <select
              value={selectedInsumoFilter}
              onChange={(e) => setSelectedInsumoFilter(e.target.value as InsumoFilter)}
              className="w-full px-3.5 py-2.5 text-xs font-bold bg-indigo-50/60 border border-indigo-200/70 rounded-2xl text-indigo-950 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all cursor-pointer"
            >
              <option value="exclude">🛡️ Ocultar Insumos / Componentes (Predeterminado)</option>
              <option value="only">🧩 Solo Insumos y Materias Primas (Tachos, etc.)</option>
              <option value="all">🌐 Mostrar Todo (Productos + Insumos)</option>
            </select>
          </div>

          {/* Risk Filter */}
          <div>
            <select
              value={selectedRisk}
              onChange={(e) => setSelectedRisk(e.target.value as RiskFilter)}
              className="w-full px-3.5 py-2.5 text-xs font-bold bg-slate-50 border border-slate-200 rounded-2xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all cursor-pointer"
            >
              <option value="all">⚡ Todos los niveles de rotación</option>
              <option value="critical">🔴 Estancamiento Crítico (Sin ventas / &gt;90d)</option>
              <option value="moderate">🟡 Riesgo Moderado (45 a 90 días stock)</option>
              <option value="healthy">🟢 Rotación Sana (&lt;45 días stock)</option>
            </select>
          </div>

          {/* Category Filter */}
          <div>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full px-3.5 py-2.5 text-xs font-bold bg-slate-50 border border-slate-200 rounded-2xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all cursor-pointer"
            >
              <option value="all">📦 Todas las Categorías ({categories.length})</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* 📋 Main Data Table */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden space-y-0">
        <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
              Detalle de Productos y Capital Inmovilizado
              <span className="text-xs font-bold bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full">
                {filteredMetrics.length} resultados
              </span>
            </h3>
            <p className="text-xs text-slate-400 font-medium mt-0.5">
              Haz clic en los encabezados para ordenar la lista. Los insumos/tachos se filtran por defecto para evitar alertas falsas.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="p-16 text-center space-y-3">
            <RefreshCw className="w-8 h-8 text-brand-500 animate-spin mx-auto" />
            <p className="text-sm font-bold text-slate-600">Calculando velocidad de ventas y cobertura de stock...</p>
          </div>
        ) : filteredMetrics.length === 0 ? (
          <div className="p-16 text-center space-y-3">
            <Package className="w-12 h-12 text-slate-300 mx-auto" />
            <p className="text-base font-bold text-slate-700">No se encontraron productos con los filtros aplicados</p>
            <p className="text-xs text-slate-400">
              Prueba cambiando el filtro de Insumos o la búsqueda.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-100 text-[11px] font-black uppercase tracking-wider text-slate-500">
                  <th className="py-4 px-5">Producto / SKU</th>
                  <th 
                    onClick={() => toggleSort('stock')} 
                    className="py-4 px-4 cursor-pointer hover:bg-slate-100/70 transition-colors text-right"
                  >
                    <div className="flex items-center justify-end gap-1">
                      Stock Disponible
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th className="py-4 px-4 text-right">Costo / Precio Unit.</th>
                  <th 
                    onClick={() => toggleSort('capitalTiedUp')} 
                    className="py-4 px-4 cursor-pointer hover:bg-slate-100/70 transition-colors text-right"
                  >
                    <div className="flex items-center justify-end gap-1">
                      Capital Inmovilizado
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th 
                    onClick={() => toggleSort('unitsSold')} 
                    className="py-4 px-4 cursor-pointer hover:bg-slate-100/70 transition-colors text-center"
                  >
                    <div className="flex items-center justify-center gap-1">
                      Ventas ({periodDays}d)
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th 
                    onClick={() => toggleSort('daysOfStock')} 
                    className="py-4 px-4 cursor-pointer hover:bg-slate-100/70 transition-colors text-center"
                  >
                    <div className="flex items-center justify-center gap-1">
                      Días Cobertura
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th className="py-4 px-4 text-center">Nivel de Riesgo</th>
                  <th className="py-4 px-5 text-center">Acción Recomendada</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredMetrics.map((m) => {
                  const isCritical = !m.isInsumo && m.riskLevel === 'critical';
                  const isModerate = !m.isInsumo && m.riskLevel === 'moderate';
                  const isHealthy = !m.isInsumo && m.riskLevel === 'healthy';

                  return (
                    <tr 
                      key={m.product.id}
                      className={`hover:bg-slate-50/70 transition-colors ${
                        isCritical ? "bg-rose-50/20" : isModerate ? "bg-amber-50/10" : m.isInsumo ? "bg-slate-50/40" : ""
                      }`}
                    >
                      {/* Product details */}
                      <td className="py-4 px-5">
                        <div className="space-y-1 max-w-xs">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-slate-900 line-clamp-1">
                              {m.product.name}
                            </span>
                            {m.isInsumo && (
                              <span className="bg-indigo-100/80 text-indigo-900 border border-indigo-200/60 text-[10px] font-black px-2 py-0.5 rounded-full shrink-0 flex items-center gap-1">
                                <Factory className="w-3 h-3 text-indigo-600" />
                                INSUMO FABRICACIÓN
                              </span>
                            )}
                            {m.isNewProduct && !m.isInsumo && (
                              <span className="bg-sky-100 text-sky-800 border border-sky-200/60 text-[10px] font-black px-2 py-0.5 rounded-full shrink-0">
                                NUEVO ({m.activeDays}d activo)
                              </span>
                            )}
                            {m.product.is_on_sale && !m.isInsumo && (
                              <span className="bg-emerald-100 text-emerald-800 text-[10px] font-black px-2 py-0.5 rounded-full shrink-0">
                                OFERTA
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-slate-400 font-medium">
                            <span>SKU: {m.product.sku || "N/A"}</span>
                            <span>•</span>
                            <span className="bg-slate-100 px-2 py-0.5 rounded-md text-slate-600">
                              {m.category}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Stock */}
                      <td className="py-4 px-4 text-right">
                        <span className="font-black text-slate-900 text-sm block">
                          {m.stockAvailable} u.
                        </span>
                        <span className="block text-[10px] font-medium text-slate-400">
                          (Físico: {m.stockPhysical} • Res: {m.stockReserved})
                        </span>
                      </td>

                      {/* Cost / Price */}
                      <td className="py-4 px-4 text-right space-y-0.5">
                        <span className="block font-bold text-slate-800">
                          {formatPrice(m.unitCost)}
                        </span>
                        {!m.isInsumo && (
                          <span className="block text-[10px] text-slate-400">
                            Venta: {formatPrice(m.unitPrice)}
                          </span>
                        )}
                      </td>

                      {/* Capital Inmovilizado */}
                      <td className="py-4 px-4 text-right">
                        <span className={`text-sm font-black block ${
                          isCritical ? "text-rose-700" : isModerate ? "text-amber-700" : m.isInsumo ? "text-indigo-900" : "text-slate-800"
                        }`}>
                          {formatPrice(m.capitalTiedUp)}
                        </span>
                        {!m.isInsumo && (
                          <span className="block text-[11px] font-bold text-indigo-600">
                            PVP: {formatPrice(m.capitalTiedUpPvp)}
                          </span>
                        )}
                      </td>

                      {/* Sales in period */}
                      <td className="py-4 px-4 text-center">
                        {m.isInsumo ? (
                          <span className="text-[11px] font-medium text-slate-400 block italic">
                            Uso en Ensamblado
                          </span>
                        ) : (
                          <>
                            <span className="font-black text-slate-800 text-sm block">
                              {m.unitsSold} u.
                            </span>
                            <span className="text-[10px] text-slate-400 block font-medium">
                              ({m.dailySpeed.toFixed(2)}/día{m.isNewProduct ? ` • ${m.activeDays}d` : ""})
                            </span>
                          </>
                        )}
                      </td>

                      {/* Days of Stock */}
                      <td className="py-4 px-4 text-center font-bold">
                        {m.isInsumo ? (
                          <span className="text-slate-400 text-xs font-medium">
                            Stock Materia Prima
                          </span>
                        ) : m.daysOfStock >= 9999 ? (
                          <span className="text-rose-600 font-black text-xs bg-rose-100/60 px-2.5 py-1 rounded-full inline-block">
                            Sin Ventas
                          </span>
                        ) : (
                          <span className={`text-xs ${
                            m.daysOfStock > 90 ? "text-rose-600 font-black" : m.daysOfStock >= 45 ? "text-amber-600 font-bold" : "text-emerald-600 font-bold"
                          }`}>
                            {m.daysOfStock} días
                          </span>
                        )}
                      </td>

                      {/* Risk Badge */}
                      <td className="py-4 px-4 text-center">
                        {m.isInsumo ? (
                          <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 text-[11px] font-bold px-3 py-1 rounded-full">
                            <Boxes className="w-3 h-3 text-slate-500" />
                            Uso Interno
                          </span>
                        ) : isCritical ? (
                          <span className="inline-flex items-center gap-1 bg-rose-100 text-rose-800 text-[11px] font-black px-3 py-1 rounded-full">
                            <Flame className="w-3 h-3 text-rose-600" />
                            Crítico (&gt;90d)
                          </span>
                        ) : isModerate ? (
                          <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 text-[11px] font-bold px-3 py-1 rounded-full">
                            <Clock className="w-3 h-3 text-amber-600" />
                            Moderado (45-90d)
                          </span>
                        ) : isHealthy ? (
                          <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 text-[11px] font-bold px-3 py-1 rounded-full">
                            <CheckCircle className="w-3 h-3 text-emerald-600" />
                            Sano (&lt;45d)
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs">Sin Stock</span>
                        )}
                      </td>

                      {/* Action Button */}
                      <td className="py-4 px-5 text-center">
                        {m.isInsumo ? (
                          <span className="text-[11px] font-medium text-slate-400 bg-slate-100/60 px-2.5 py-1 rounded-lg inline-block">
                            No se vende directo
                          </span>
                        ) : m.stock > 0 ? (
                          <button
                            onClick={() => setPromoProduct(m)}
                            className="inline-flex items-center gap-1.5 bg-brand-50 hover:bg-brand-100 text-brand-700 font-bold text-xs px-3.5 py-2 rounded-xl transition-all duration-200 active:scale-95 border border-brand-200/60"
                          >
                            <Sparkles className="w-3.5 h-3.5 text-brand-600" />
                            Promocionar
                          </button>
                        ) : (
                          <span className="text-slate-300 text-xs">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 🏷️ Promotion Simulator Drawer / Modal */}
      {promoProduct && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden border border-slate-100 animate-scaleUp">
            {/* Header */}
            <div className="bg-gradient-to-r from-brand-600 to-indigo-600 p-6 text-white relative">
              <button
                onClick={() => setPromoProduct(null)}
                className="absolute right-5 top-5 text-white/80 hover:text-white bg-white/10 p-1.5 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
              <span className="bg-white/20 text-white text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full inline-block mb-2">
                Simulador de Oferta
              </span>
              <h3 className="text-xl font-black leading-snug pr-8">
                {promoProduct.product.name}
              </h3>
              <p className="text-white/80 text-xs mt-1 font-medium">
                SKU: {promoProduct.product.sku || "N/A"} • Stock Actual: {promoProduct.stock} u.
              </p>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6">
              {/* Product Status Summary */}
              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-100 text-xs">
                <div>
                  <span className="text-slate-400 block font-bold">Capital Estancado:</span>
                  <span className="text-slate-900 font-black text-sm">
                    {formatPrice(promoProduct.capitalTiedUp)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block font-bold">Precio Actual:</span>
                  <span className="text-slate-900 font-black text-sm">
                    {formatPrice(promoProduct.unitPrice)}
                  </span>
                </div>
              </div>

              {/* Discount Selector Controls */}
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-black uppercase text-slate-700 tracking-wider">
                      Descuento Sugerido:
                    </label>
                    <span className="text-lg font-black text-brand-600">
                      -{discountPercent}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="50"
                    step="5"
                    value={discountPercent}
                    onChange={(e) => setDiscountPercent(Number(e.target.value))}
                    className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-brand-600"
                  />
                  <div className="flex justify-between text-[10px] text-slate-400 font-bold mt-1">
                    <span>5%</span>
                    <span>20%</span>
                    <span>35%</span>
                    <span>50%</span>
                  </div>
                </div>

                {/* Simulation Calculations */}
                {(() => {
                  const newPrice = Math.round(promoProduct.unitPrice * (1 - discountPercent / 100));
                  const unitsToSell = Math.ceil((promoProduct.stock * targetStockPercent) / 100);
                  const expectedCashUnlocked = unitsToSell * newPrice;

                  return (
                    <div className="bg-emerald-50/70 border border-emerald-100 p-4 rounded-2xl space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-emerald-800 font-medium">Nuevo Precio Promocional:</span>
                        <span className="font-black text-emerald-900 text-sm">{formatPrice(newPrice)}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-emerald-800 font-medium">Liquidando el {targetStockPercent}% del stock ({unitsToSell} u.):</span>
                        <span className="font-black text-emerald-900">{formatPrice(expectedCashUnlocked)}</span>
                      </div>
                      <p className="text-[11px] text-emerald-700 pt-1 font-medium border-t border-emerald-200/50">
                        ⚡ Esta acción liberará aproximadamente <strong>{formatPrice(expectedCashUnlocked)}</strong> en liquidez de caja.
                      </p>
                    </div>
                  );
                })()}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setPromoProduct(null)}
                  className="w-1/3 py-3 text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleApplyPromo}
                  disabled={updatingPromo}
                  className="w-2/3 py-3 text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 active:scale-95 rounded-xl shadow-md shadow-brand-600/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {updatingPromo ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  Activar Promoción en Catálogo
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

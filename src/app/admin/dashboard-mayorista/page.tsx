"use client";

import React, { useEffect, useState, useMemo, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { formatPrice } from "@/lib/utils";
import {
  TrendingUp,
  Package,
  Users,
  ShoppingCart,
  Award,
  ArrowUpRight,
  Loader2,
  Calendar,
  Search,
  DollarSign,
  MapPin,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  Filter,
  BarChart3,
  Percent,
  CheckCircle2,
  Building2,
  Tag,
  Link2,
  Unlink,
  Sparkles,
  X,
  AlertCircle,
  Check
} from "lucide-react";

interface DashboardData {
  kpis: {
    total_orders: number;
    total_revenue: number;
    avg_ticket: number;
    unique_clients: number;
    total_units: number;
    earliest_date: string;
    latest_date: string;
  };
  top_clients: Array<{
    customer_name: string;
    client_id: string | null;
    locality: string | null;
    orders_count: number;
    total_spent: number;
    avg_ticket: number;
    last_order_date: string;
  }>;
  top_products: Array<{
    product_name: string;
    current_product_id: string | null;
    is_mapped: boolean;
    total_quantity: number;
    total_revenue: number;
    avg_unit_price: number;
  }>;
  top_sellers: Array<{
    seller_name: string;
    is_active: boolean;
    orders_count: number;
    total_revenue: number;
    percentage: number;
  }>;
  monthly_trend: Array<{
    month: string;
    orders_count: number;
    total_revenue: number;
  }>;
  top_localities: Array<{
    locality: string;
    orders_count: number;
    total_revenue: number;
  }>;
}

interface HistoricalMappingItem {
  historical_name: string;
  total_qty: number;
  total_revenue: number;
  occurrences: number;
  current_product_id: string | null;
  current_product_name: string | null;
  is_mapped: boolean;
}

interface CatalogProduct {
  id: string;
  name: string;
  category: string;
}

const MonthlyTrendSection = React.memo(function MonthlyTrendSection({
  trend,
  formatPrice,
}: {
  trend: Array<{ month: string; orders_count: number; total_revenue: number }>;
  formatPrice: (n: number) => string;
}) {
  const [hoveredMonth, setHoveredMonth] = useState<{ month: string; orders_count: number; total_revenue: number } | null>(null);

  const formatMonthLabel = (mStr: string) => {
    if (!mStr) return "";
    const [year, month] = mStr.split("-");
    const monthNames = [
      "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
      "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
    ];
    const mIndex = parseInt(month, 10) - 1;
    return `${monthNames[mIndex] || month} ${year}`;
  };

  const maxMonthlyRevenue = useMemo(() => {
    if (!trend?.length) return 1;
    return Math.max(...trend.map(m => m.total_revenue));
  }, [trend]);

  if (!trend || trend.length === 0) return null;

  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-2xs space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-black text-slate-900 tracking-tight flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-blue-600" /> Evolución Mensual de Ventas Mayoristas
          </h3>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Facturación y volumen de pedidos mes a mes ({trend.length} meses analizados)
          </p>
        </div>
        <div className="text-left sm:text-right">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            Pico Histórico Mensual:
          </span>
          <div className="text-xs font-black text-emerald-600">
            {formatPrice(maxMonthlyRevenue)}
          </div>
        </div>
      </div>

      {/* Dynamic Month Details Strip (Always visible, never clipped) */}
      <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 min-h-[52px]">
        {hoveredMonth ? (
          <>
            <div className="flex items-center gap-2.5">
              <div className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-pulse" />
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Mes Seleccionado</span>
                <div className="text-sm font-black text-slate-900">{formatMonthLabel(hoveredMonth.month)}</div>
              </div>
            </div>
            <div className="flex items-center gap-4 sm:gap-6 flex-wrap">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Facturación</span>
                <div className="text-sm font-black text-emerald-600">{formatPrice(hoveredMonth.total_revenue)}</div>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Pedidos</span>
                <div className="text-sm font-black text-blue-600">{hoveredMonth.orders_count} órdenes</div>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Ticket Promedio</span>
                <div className="text-sm font-bold text-slate-700">
                  {formatPrice(hoveredMonth.orders_count > 0 ? hoveredMonth.total_revenue / hoveredMonth.orders_count : 0)}
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-between w-full text-xs text-slate-500 font-medium py-0.5">
            <span className="flex items-center gap-1.5 text-slate-600 font-semibold">
              💡 Pasá el cursor o tocá cualquier barra para ver el desglose exacto de ese mes.
            </span>
            <span className="hidden sm:inline text-slate-400 text-[11px]">
              {trend.length} meses registrados
            </span>
          </div>
        )}
      </div>

      {/* Visual Bars */}
      <div className="pt-2 pb-2 overflow-x-auto overflow-y-hidden">
        <div 
          onMouseLeave={() => setHoveredMonth(null)}
          className="flex items-end gap-2 min-w-[700px] h-48 border-b border-slate-200 pb-2"
        >
          {trend.map((m, idx) => {
            const heightPercent = maxMonthlyRevenue > 0 ? (m.total_revenue / maxMonthlyRevenue) * 100 : 0;
            const isSelected = hoveredMonth?.month === m.month;

            return (
              <div
                key={idx}
                onMouseEnter={() => setHoveredMonth(m)}
                onClick={() => setHoveredMonth(m)}
                className="flex-1 flex flex-col items-center gap-1 group relative h-full justify-end cursor-pointer py-1"
              >
                {/* Bar */}
                <div
                  style={{ height: `${Math.max(heightPercent, 4)}%` }}
                  className={`w-full rounded-t-md transition-opacity duration-150 ${
                    isSelected
                      ? 'bg-blue-600 ring-2 ring-blue-400 shadow-md opacity-100'
                      : hoveredMonth
                      ? 'bg-gradient-to-t from-blue-600 to-indigo-500 opacity-40 hover:opacity-100'
                      : 'bg-gradient-to-t from-blue-600 to-indigo-500 opacity-100 hover:from-blue-500 hover:to-cyan-400 shadow-2xs'
                  }`}
                />
                <span className={`text-[9px] font-bold transition-colors duration-150 rotate-45 origin-left truncate w-8 mt-2 ${
                  isSelected ? 'text-blue-700 font-black' : 'text-slate-400 group-hover:text-slate-800'
                }`}>
                  {m.month.slice(2)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});

function WholesaleDashboardContent() {
  const searchParams = useSearchParams();
  const urlTab = searchParams.get('tab');

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'clients' | 'products' | 'sellers' | 'localities' | 'mapping'>('clients');

  // Filter state
  const [periodPreset, setPeriodPreset] = useState<string>('all');
  const [customFrom, setCustomFrom] = useState<string>('');
  const [customTo, setCustomTo] = useState<string>('');
  const [showCustomDates, setShowCustomDates] = useState(false);

  // Search & Pagination states
  const [clientSearch, setClientSearch] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [clientsLimit, setClientsLimit] = useState(15);
  const [productsLimit, setProductsLimit] = useState(15);

  // Mapping Tool States
  const [mappingModalOpen, setMappingModalOpen] = useState(false);
  const [mappingLoading, setMappingLoading] = useState(false);
  const [historicalItems, setHistoricalItems] = useState<HistoricalMappingItem[]>([]);
  const [catalogProducts, setCatalogProducts] = useState<CatalogProduct[]>([]);
  const [mappingSearch, setMappingSearch] = useState('');
  const [mappingFilter, setMappingFilter] = useState<'unmapped' | 'mapped' | 'all'>('unmapped');
  const [savingMappingFor, setSavingMappingFor] = useState<string | null>(null);
  const [selectedMappingProduct, setSelectedMappingProduct] = useState<Record<string, string>>({});
  const [mappingSuccessMessage, setMappingSuccessMessage] = useState<string | null>(null);

  const fetchMetrics = async (preset = periodPreset, from = customFrom, to = customTo) => {
    try {
      setRefreshing(true);
      let queryParams = new URLSearchParams();

      if (preset === 'custom') {
        if (from) queryParams.set('from', from);
        if (to) queryParams.set('to', to);
      } else if (preset === '2026') {
        queryParams.set('from', '2026-01-01');
        queryParams.set('to', '2026-12-31');
      } else if (preset === '2025') {
        queryParams.set('from', '2025-01-01');
        queryParams.set('to', '2025-12-31');
      } else if (preset === '2024') {
        queryParams.set('from', '2024-01-01');
        queryParams.set('to', '2024-12-31');
      } else if (preset === '2023') {
        queryParams.set('from', '2023-01-01');
        queryParams.set('to', '2023-12-31');
      } else if (preset === 'last_12m') {
        const d = new Date();
        d.setFullYear(d.getFullYear() - 1);
        queryParams.set('from', d.toISOString().split('T')[0]);
      }

      const res = await fetch(`/api/admin/dashboard-mayorista?${queryParams.toString()}`);
      const json = await res.json();
      if (json.success && json.data) {
        setData(json.data);
      }
    } catch (err) {
      console.error("Error fetching wholesale metrics:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchMappings = async () => {
    try {
      setMappingLoading(true);
      const res = await fetch('/api/admin/dashboard-mayorista/mappings');
      const json = await res.json();
      if (json.success) {
        setHistoricalItems(json.historical_products || []);
        setCatalogProducts(json.catalog_products || []);
        // Initialize mapping selections
        const initMap: Record<string, string> = {};
        (json.historical_products || []).forEach((h: HistoricalMappingItem) => {
          if (h.current_product_id) {
            initMap[h.historical_name] = h.current_product_id;
          }
        });
        setSelectedMappingProduct(initMap);
      }
    } catch (err) {
      console.error("Error fetching mappings:", err);
    } finally {
      setMappingLoading(false);
    }
  };

  useEffect(() => {
    if (urlTab && ['clients', 'products', 'sellers', 'localities', 'mapping'].includes(urlTab)) {
      setActiveTab(urlTab as any);
      setTimeout(() => {
        const el = document.getElementById('mapping-section');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }, [urlTab]);

  useEffect(() => {
    fetchMetrics();
  }, [periodPreset]);

  useEffect(() => {
    if (mappingModalOpen || activeTab === 'mapping') {
      fetchMappings();
    }
  }, [mappingModalOpen, activeTab]);

  const handleApplyCustomDates = () => {
    setPeriodPreset('custom');
    fetchMetrics('custom', customFrom, customTo);
  };

  const handleSaveMapping = async (historicalName: string, productId: string | null) => {
    try {
      setSavingMappingFor(historicalName);
      const res = await fetch('/api/admin/dashboard-mayorista/mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          historical_name: historicalName,
          current_product_id: productId || null
        })
      });
      const json = await res.json();
      if (json.success) {
        const count = json.result?.updated_items_count || 0;
        setMappingSuccessMessage(`Vinculación guardada. Se actualizaron ${count} ítems en el historial.`);
        setTimeout(() => setMappingSuccessMessage(null), 4000);

        // Update local state
        setHistoricalItems(prev => prev.map(item => {
          if (item.historical_name === historicalName) {
            const currentProd = catalogProducts.find(p => p.id === productId);
            return {
              ...item,
              current_product_id: productId,
              current_product_name: currentProd?.name || null,
              is_mapped: Boolean(productId)
            };
          }
          return item;
        }));

        // Refresh dashboard metrics
        fetchMetrics();
      }
    } catch (err) {
      console.error("Error saving mapping:", err);
    } finally {
      setSavingMappingFor(null);
    }
  };

  // Filtered Clients
  const filteredClients = useMemo(() => {
    if (!data?.top_clients) return [];
    if (!clientSearch.trim()) return data.top_clients;
    const q = clientSearch.toLowerCase();
    return data.top_clients.filter(c =>
      c.customer_name.toLowerCase().includes(q) ||
      (c.locality && c.locality.toLowerCase().includes(q))
    );
  }, [data?.top_clients, clientSearch]);

  // Filtered Products
  const filteredProducts = useMemo(() => {
    if (!data?.top_products) return [];
    if (!productSearch.trim()) return data.top_products;
    const q = productSearch.toLowerCase();
    return data.top_products.filter(p =>
      p.product_name.toLowerCase().includes(q)
    );
  }, [data?.top_products, productSearch]);

  // Filtered Historical Items for Mapping Tool
  const filteredHistoricalForMapping = useMemo(() => {
    return historicalItems.filter(h => {
      if (mappingFilter === 'unmapped' && h.is_mapped) return false;
      if (mappingFilter === 'mapped' && !h.is_mapped) return false;
      if (mappingSearch.trim()) {
        const q = mappingSearch.toLowerCase();
        const matchesHist = h.historical_name.toLowerCase().includes(q);
        const matchesCurr = h.current_product_name?.toLowerCase().includes(q);
        return matchesHist || matchesCurr;
      }
      return true;
    });
  }, [historicalItems, mappingFilter, mappingSearch]);

  const maxProductQty = useMemo(() => {
    if (!data?.top_products?.length) return 1;
    return Math.max(...data.top_products.map(p => p.total_quantity));
  }, [data?.top_products]);

  return (
    <div className="min-h-screen bg-slate-50/60 text-slate-800 p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-50 border border-blue-200/80 rounded-xl text-blue-600 shadow-2xs">
              <TrendingUp className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black tracking-tight text-slate-900">
                  Dashboard Mayorista
                </h1>
                <span className="text-[11px] font-black uppercase px-2.5 py-0.5 rounded-full bg-blue-100/70 text-blue-700 border border-blue-200">
                  Canal B2B
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Métricas consolidadas de ventas mayoristas, rankings históricos y perfil de clientes
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => {
              setActiveTab('mapping');
              const el = document.getElementById('mapping-section');
              if (el) el.scrollIntoView({ behavior: 'smooth' });
            }}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-xl bg-purple-600 hover:bg-purple-700 text-white transition shadow-xs cursor-pointer"
          >
            <Link2 className="w-4 h-4" />
            <span>Vincular Productos del Pasado</span>
          </button>

          <button
            onClick={() => fetchMetrics()}
            disabled={refreshing}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-xl bg-white border border-slate-200 text-slate-700 hover:text-slate-900 hover:bg-slate-50 transition shadow-2xs cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-blue-600" : ""}`} />
            <span>Actualizar</span>
          </button>

          <Link
            href="/vendedores/pedidos?list_type=todos&status=Todos&client_type=mayoristas"
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition cursor-pointer"
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            <span>Ver Pedidos Mayoristas</span>
          </Link>

          <Link
            href="/vendedores/presupuestos-mayorista"
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 transition shadow-2xs cursor-pointer"
          >
            <span>Cotizador B2B</span>
            <ArrowUpRight className="w-3.5 h-3.5 text-slate-400" />
          </Link>
        </div>
      </div>

      {/* Period Filter Bar */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-2xs">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 mr-1.5">
            <Filter className="w-3.5 h-3.5 text-slate-400" /> Período:
          </span>
          {[
            { id: 'all', label: 'Histórico Total (2023-2026)' },
            { id: '2026', label: '2026' },
            { id: '2025', label: '2025' },
            { id: '2024', label: '2024' },
            { id: '2023', label: '2023' },
            { id: 'last_12m', label: 'Últimos 12 Meses' },
            { id: 'custom', label: 'Personalizado' },
          ].map((btn) => (
            <button
              key={btn.id}
              onClick={() => {
                setPeriodPreset(btn.id);
                if (btn.id === 'custom') {
                  setShowCustomDates(true);
                } else {
                  setShowCustomDates(false);
                }
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                periodPreset === btn.id
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200/70'
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>

        {showCustomDates && (
          <div className="flex items-center gap-2 pt-2 md:pt-0 border-t md:border-t-0 border-slate-100">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold text-slate-500">Desde:</span>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs text-slate-800 focus:border-blue-500 outline-none"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold text-slate-500">Hasta:</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs text-slate-800 focus:border-blue-500 outline-none"
              />
            </div>
            <button
              onClick={handleApplyCustomDates}
              className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition cursor-pointer"
            >
              Filtrar
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 space-y-4">
          <Loader2 className="w-9 h-9 animate-spin text-blue-600" />
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
            Cargando Métricas Mayoristas...
          </p>
        </div>
      ) : data ? (
        <>
          {/* KPI Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* Facturación */}
            <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-2xs hover:border-slate-300 transition">
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider">Facturación Mayorista</span>
                <div className="p-2 bg-blue-50 rounded-xl text-blue-600">
                  <DollarSign className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-black text-slate-900 tracking-tight">
                {formatPrice(data.kpis?.total_revenue || 0)}
              </div>
              <p className="text-[10px] text-slate-400 font-semibold mt-1">
                Total acumulado en el período
              </p>
            </div>

            {/* Total Pedidos */}
            <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-2xs hover:border-slate-300 transition">
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider">Pedidos Totales</span>
                <div className="p-2 bg-emerald-50 rounded-xl text-emerald-600">
                  <ShoppingCart className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-black text-slate-900 tracking-tight">
                {(data.kpis?.total_orders || 0).toLocaleString('es-AR')}
              </div>
              <p className="text-[10px] text-slate-400 font-semibold mt-1">
                Órdenes B2B registradas
              </p>
            </div>

            {/* Ticket Promedio */}
            <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-2xs hover:border-slate-300 transition">
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider">Ticket Promedio</span>
                <div className="p-2 bg-amber-50 rounded-xl text-amber-600">
                  <Percent className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-black text-slate-900 tracking-tight">
                {formatPrice(data.kpis?.avg_ticket || 0)}
              </div>
              <p className="text-[10px] text-slate-400 font-semibold mt-1">
                Promedio por orden mayorista
              </p>
            </div>

            {/* Clientes Únicos */}
            <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-2xs hover:border-slate-300 transition">
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider">Clientes B2B</span>
                <div className="p-2 bg-purple-50 rounded-xl text-purple-600">
                  <Building2 className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-black text-slate-900 tracking-tight">
                {(data.kpis?.unique_clients || 0).toLocaleString('es-AR')}
              </div>
              <p className="text-[10px] text-slate-400 font-semibold mt-1">
                Compradores en cartera
              </p>
            </div>

            {/* Unidades Vendidas */}
            <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-2xs hover:border-slate-300 transition">
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider">Unidades Totales</span>
                <div className="p-2 bg-cyan-50 rounded-xl text-cyan-600">
                  <Package className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-black text-slate-900 tracking-tight">
                {(data.kpis?.total_units || 0).toLocaleString('es-AR')}
              </div>
              <p className="text-[10px] text-slate-400 font-semibold mt-1">
                Tanques y productos despachados
              </p>
            </div>
          </div>

          {/* Monthly Trend Evolution */}
          {data.monthly_trend && data.monthly_trend.length > 0 && (
            <MonthlyTrendSection trend={data.monthly_trend} formatPrice={formatPrice} />
          )}

          {/* Tab Navigation */}
          <div id="mapping-section" className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto scroll-mt-6">
            {[
              { id: 'clients', label: 'Top Clientes Mayoristas', icon: Building2, count: data.top_clients?.length },
              { id: 'products', label: 'Top Productos (Actuales & Históricos)', icon: Package, count: data.top_products?.length },
              { id: 'sellers', label: 'Rendimiento Vendedores', icon: Users, count: data.top_sellers?.length },
              { id: 'localities', label: 'Distribución Geográfica', icon: MapPin, count: data.top_localities?.length },
              { id: 'mapping', label: '🔗 Vincular Productos', icon: Link2, count: historicalItems.filter(h => !h.is_mapped).length }
            ].map(tab => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer shrink-0 ${
                    active
                      ? 'bg-blue-50 text-blue-700 border border-blue-200 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-transparent'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                  {tab.count !== undefined && (
                    <span className={`text-[10px] font-black px-1.5 py-0.25 rounded-md ${
                      tab.id === 'mapping' && tab.count > 0
                        ? 'bg-amber-100 text-amber-800 border border-amber-200'
                        : active ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'
                    }`}>
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* TAB 1: TOP CLIENTS */}
          {activeTab === 'clients' && (
            <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-2xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-black text-slate-900 tracking-tight flex items-center gap-2">
                    <Award className="w-4 h-4 text-amber-500" /> Ranking de Clientes Mayoristas
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Clientes ordenados por volumen total facturado y cantidad de pedidos
                  </p>
                </div>

                <div className="relative w-full sm:w-72">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={clientSearch}
                    onChange={(e) => setClientSearch(e.target.value)}
                    placeholder="Buscar cliente o localidad..."
                    className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:border-blue-500 outline-none transition"
                  />
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-500">
                      <th className="py-3 px-3.5 text-center w-12">#</th>
                      <th className="py-3 px-3.5">Cliente / Razón Social</th>
                      <th className="py-3 px-3.5">Localidad</th>
                      <th className="py-3 px-3.5 text-center">Pedidos</th>
                      <th className="py-3 px-3.5 text-right">Facturación Total</th>
                      <th className="py-3 px-3.5 text-right">Ticket Promedio</th>
                      <th className="py-3 px-3.5 text-center">Última Compra</th>
                      <th className="py-3 px-3.5 text-center w-24">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {filteredClients.slice(0, clientsLimit).map((client, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/70 transition">
                        <td className="py-3 px-3.5 text-center font-black">
                          {idx === 0 ? (
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-100 text-amber-800 text-xs">🥇</span>
                          ) : idx === 1 ? (
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-200 text-slate-700 text-xs">🥈</span>
                          ) : idx === 2 ? (
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-orange-100 text-orange-800 text-xs">🥉</span>
                          ) : (
                            <span className="text-slate-400 text-[11px]">#{idx + 1}</span>
                          )}
                        </td>
                        <td className="py-3 px-3.5 font-bold text-slate-900">
                          <div className="truncate max-w-[280px]" title={client.customer_name}>
                            {client.customer_name}
                          </div>
                        </td>
                        <td className="py-3 px-3.5 text-slate-600 font-medium">
                          {client.locality || 'Sin especificar'}
                        </td>
                        <td className="py-3 px-3.5 text-center font-black text-blue-600">
                          {client.orders_count}
                        </td>
                        <td className="py-3 px-3.5 text-right font-black text-emerald-600 text-sm">
                          {formatPrice(client.total_spent)}
                        </td>
                        <td className="py-3 px-3.5 text-right font-semibold text-slate-700">
                          {formatPrice(client.avg_ticket)}
                        </td>
                        <td className="py-3 px-3.5 text-center text-slate-500 font-medium">
                          {client.last_order_date ? new Date(client.last_order_date).toLocaleDateString('es-AR') : '-'}
                        </td>
                        <td className="py-3 px-3.5 text-center">
                          <Link
                            href={`/vendedores/pedidos?search=${encodeURIComponent(client.customer_name.split('(')[0].trim())}&client_type=mayoristas`}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold rounded-lg bg-slate-100 hover:bg-blue-600 hover:text-white text-slate-700 transition"
                            title="Ver pedidos de este cliente"
                          >
                            <span>Ver</span>
                            <ExternalLink className="w-3 h-3" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {filteredClients.length > clientsLimit && (
                <div className="text-center pt-2">
                  <button
                    onClick={() => setClientsLimit(prev => prev + 25)}
                    className="px-4 py-2 text-xs font-bold rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer"
                  >
                    Mostrar más clientes ({filteredClients.length - clientsLimit} restantes)
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: TOP PRODUCTS */}
          {activeTab === 'products' && (
            <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-2xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-black text-slate-900 tracking-tight flex items-center gap-2">
                      <Package className="w-4 h-4 text-cyan-600" /> Productos Más Vendidos Mayoristas
                    </h3>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
                      Consolidados con catálogo
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Ranking por volumen de unidades y facturación generada (los productos históricos vinculados se suman al producto actual)
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative w-full sm:w-64">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                      placeholder="Buscar producto..."
                      className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:border-blue-500 outline-none transition"
                    />
                  </div>
                  <button
                    onClick={() => setMappingModalOpen(true)}
                    className="px-3 py-1.5 text-xs font-bold rounded-xl bg-purple-50 border border-purple-200 text-purple-700 hover:bg-purple-100 transition shrink-0"
                  >
                    🔗 Vincular
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-500">
                      <th className="py-3 px-3.5 text-center w-12">#</th>
                      <th className="py-3 px-3.5">Producto</th>
                      <th className="py-3 px-3.5 text-center w-32">Estado Catálogo</th>
                      <th className="py-3 px-3.5 w-60">Volumen de Unidades</th>
                      <th className="py-3 px-3.5 text-right">Facturación Generada</th>
                      <th className="py-3 px-3.5 text-right">Precio Promedio Unitario</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {filteredProducts.slice(0, productsLimit).map((prod, idx) => {
                      const percent = maxProductQty > 0 ? (prod.total_quantity / maxProductQty) * 100 : 0;
                      return (
                        <tr key={idx} className="hover:bg-slate-50/70 transition">
                          <td className="py-3 px-3.5 text-center font-black">
                            <span className="text-slate-400 text-[11px]">#{idx + 1}</span>
                          </td>
                          <td className="py-3 px-3.5 font-bold text-slate-900">
                            {prod.product_name}
                          </td>
                          <td className="py-3 px-3.5 text-center">
                            {prod.is_mapped ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                Vinculado
                              </span>
                            ) : (
                              <button
                                onClick={() => {
                                  setMappingSearch(prod.product_name);
                                  setMappingModalOpen(true);
                                }}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition cursor-pointer"
                                title="Hacé clic para vincular a un producto actual"
                              >
                                <Sparkles className="w-3 h-3 text-amber-600" />
                                Sin vincular
                              </button>
                            )}
                          </td>
                          <td className="py-3 px-3.5">
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-[11px] font-black">
                                <span className="text-cyan-700 font-bold">{prod.total_quantity.toLocaleString('es-AR')} u.</span>
                              </div>
                              <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                <div
                                  style={{ width: `${percent}%` }}
                                  className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full"
                                />
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-3.5 text-right font-black text-emerald-600 text-sm">
                            {formatPrice(prod.total_revenue)}
                          </td>
                          <td className="py-3 px-3.5 text-right font-semibold text-slate-700">
                            {formatPrice(prod.avg_unit_price)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {filteredProducts.length > productsLimit && (
                <div className="text-center pt-2">
                  <button
                    onClick={() => setProductsLimit(prev => prev + 25)}
                    className="px-4 py-2 text-xs font-bold rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer"
                  >
                    Mostrar más productos ({filteredProducts.length - productsLimit} restantes)
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: TOP SELLERS */}
          {activeTab === 'sellers' && (
            <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-2xs space-y-4">
              <div>
                <h3 className="text-base font-black text-slate-900 tracking-tight flex items-center gap-2">
                  <Users className="w-4 h-4 text-purple-600" /> Rendimiento de Vendedores Mayoristas
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Desglose comercial por asesor (incluye historial de cuentas activas y registros históricos)
                </p>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-500">
                      <th className="py-3 px-3.5 text-center w-12">#</th>
                      <th className="py-3 px-3.5">Vendedor</th>
                      <th className="py-3 px-3.5 text-center">Estado</th>
                      <th className="py-3 px-3.5 text-center">Pedidos</th>
                      <th className="py-3 px-3.5 text-right">Facturación Total</th>
                      <th className="py-3 px-3.5 w-48 text-right">Participación en Ventas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {data.top_sellers?.map((seller, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/70 transition">
                        <td className="py-3 px-3.5 text-center font-black">
                          <span className="text-slate-400 text-[11px]">#{idx + 1}</span>
                        </td>
                        <td className="py-3 px-3.5 font-bold text-slate-900">
                          {seller.seller_name}
                        </td>
                        <td className="py-3 px-3.5 text-center">
                          {seller.is_active ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                              Activo
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                              Histórico
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3.5 text-center font-black text-blue-600">
                          {seller.orders_count}
                        </td>
                        <td className="py-3 px-3.5 text-right font-black text-emerald-600 text-sm">
                          {formatPrice(seller.total_revenue)}
                        </td>
                        <td className="py-3 px-3.5">
                          <div className="space-y-1">
                            <div className="flex justify-end text-[11px] font-black text-slate-700">
                              {seller.percentage}%
                            </div>
                            <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                              <div
                                style={{ width: `${seller.percentage}%` }}
                                className="h-full bg-purple-500 rounded-full"
                              />
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: TOP LOCALITIES */}
          {activeTab === 'localities' && (
            <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-2xs space-y-4">
              <div>
                <h3 className="text-base font-black text-slate-900 tracking-tight flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-rose-500" /> Distribución Geográfica de Envíos Mayoristas
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Zonas y localidades con mayor demanda mayorista
                </p>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-500">
                      <th className="py-3 px-3.5 text-center w-12">#</th>
                      <th className="py-3 px-3.5">Localidad / Zona</th>
                      <th className="py-3 px-3.5 text-center">Pedidos Entregados</th>
                      <th className="py-3 px-3.5 text-right">Facturación Acumulada</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {data.top_localities?.map((loc, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/70 transition">
                        <td className="py-3 px-3.5 text-center font-black">
                          <span className="text-slate-400 text-[11px]">#{idx + 1}</span>
                        </td>
                        <td className="py-3 px-3.5 font-bold text-slate-900">
                          {loc.locality}
                        </td>
                        <td className="py-3 px-3.5 text-center font-black text-blue-600">
                          {loc.orders_count}
                        </td>
                        <td className="py-3 px-3.5 text-right font-black text-emerald-600 text-sm">
                          {formatPrice(loc.total_revenue)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 5: MAPPING TOOL */}
          {activeTab === 'mapping' && (
            <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-2xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div>
                  <h3 className="text-base font-black text-slate-900 tracking-tight flex items-center gap-2">
                    <Link2 className="w-5 h-5 text-purple-600" /> Vinculación de Productos del Pasado a Actuales
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Asigná productos antiguos (ej: Powerlit) a los modelos actuales del catálogo. Las ventas pasadas se computarán bajo el producto actual en rankings y perfiles de clientes.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      // Auto-suggestion logic based on matching words or capacity
                      historicalItems.forEach(h => {
                        if (!h.is_mapped) {
                          const hLower = h.historical_name.toLowerCase();
                          // Try to find candidate by capacity or key terms
                          let candidate = catalogProducts.find(cp => {
                            const cpLower = cp.name.toLowerCase();
                            // Exact capacity match (e.g. 470L, 1000L, 750L)
                            const matchL = hLower.match(/(\d+)\s*l/);
                            if (matchL) {
                              const lit = matchL[1];
                              if (cpLower.includes(lit + 'l') || cpLower.includes(lit + ' litros')) {
                                if (hLower.includes('bic') && cpLower.includes('bic')) return true;
                                if (hLower.includes('tric') && cpLower.includes('tric')) return true;
                                if (hLower.includes('biodigestor') && cpLower.includes('biodigestor')) return true;
                              }
                            }
                            if (hLower.includes('base') && cpLower.includes('base')) {
                              if (hLower.includes('102') && cpLower.includes('102')) return true;
                              if (hLower.includes('145') && cpLower.includes('145')) return true;
                              if (hLower.includes('74') && cpLower.includes('74')) return true;
                            }
                            if (hLower.includes('flotante') && cpLower.includes('flotante')) return true;
                            if (hLower.includes('tapa rosca') && cpLower.includes('tapa rosca')) return true;
                            return false;
                          });
                          if (candidate) {
                            setSelectedMappingProduct(prev => ({ ...prev, [h.historical_name]: candidate.id }));
                          }
                        }
                      });
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl bg-purple-100 text-purple-800 hover:bg-purple-200 transition cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                    <span>Auto-sugerir Coincidencias</span>
                  </button>
                </div>
              </div>

              {mappingSuccessMessage && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{mappingSuccessMessage}</span>
                </div>
              )}

              {/* Filters for mapping */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
                  {[
                    { id: 'unmapped', label: 'Sin Vincular' },
                    { id: 'mapped', label: 'Vinculados' },
                    { id: 'all', label: 'Todos' }
                  ].map(f => (
                    <button
                      key={f.id}
                      onClick={() => setMappingFilter(f.id as any)}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                        mappingFilter === f.id ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                <div className="relative w-full sm:w-72">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={mappingSearch}
                    onChange={(e) => setMappingSearch(e.target.value)}
                    placeholder="Buscar producto histórico..."
                    className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:border-blue-500 outline-none"
                  />
                </div>
              </div>

              {/* Mapping Table */}
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-500">
                      <th className="py-3 px-3.5">Nombre Original en Planilla Histórica</th>
                      <th className="py-3 px-3.5 text-center w-28">Volumen</th>
                      <th className="py-3 px-3.5 text-right w-36">Total Facturado</th>
                      <th className="py-3 px-3.5 w-96">Producto Actual en Catálogo</th>
                      <th className="py-3 px-3.5 text-center w-28">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {filteredHistoricalForMapping.map((h, idx) => {
                      const selectedId = selectedMappingProduct[h.historical_name] || '';
                      const isSaving = savingMappingFor === h.historical_name;
                      const hasChanged = selectedId !== (h.current_product_id || '');

                      return (
                        <tr key={idx} className="hover:bg-slate-50/70 transition">
                          <td className="py-3 px-3.5 font-bold text-slate-900">
                            <div>{h.historical_name}</div>
                            <div className="text-[10px] text-slate-400 font-medium">
                              {h.occurrences} pedidos históricos
                            </div>
                          </td>
                          <td className="py-3 px-3.5 text-center font-black text-cyan-700">
                            {h.total_qty.toLocaleString('es-AR')} u.
                          </td>
                          <td className="py-3 px-3.5 text-right font-black text-emerald-600">
                            {formatPrice(h.total_revenue)}
                          </td>
                          <td className="py-3 px-3.5">
                            <select
                              value={selectedId}
                              onChange={(e) => {
                                const val = e.target.value;
                                setSelectedMappingProduct(prev => ({ ...prev, [h.historical_name]: val }));
                              }}
                              className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-semibold outline-none cursor-pointer ${
                                selectedId
                                  ? 'bg-blue-50/40 border-blue-200 text-blue-900'
                                  : 'bg-white border-slate-200 text-slate-600'
                              }`}
                            >
                              <option value="">-- Sin Vincular (Mantener como histórico) --</option>
                              {catalogProducts.map(cp => (
                                <option key={cp.id} value={cp.id}>
                                  {cp.name} ({cp.category})
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-3 px-3.5 text-center">
                            <button
                              onClick={() => handleSaveMapping(h.historical_name, selectedId || null)}
                              disabled={isSaving || !hasChanged}
                              className={`px-3 py-1 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1 mx-auto ${
                                isSaving
                                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                                  : hasChanged
                                  ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-2xs cursor-pointer'
                                  : 'bg-slate-100 text-slate-400 cursor-default'
                              }`}
                            >
                              {isSaving ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <span>Guardar</span>
                              )}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-20 text-slate-400 text-sm font-medium">
          No se encontraron métricas para el período seleccionado.
        </div>
      )}

      {/* MODAL: VINCULAR PRODUCTOS (When triggered from button in header) */}
      {mappingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
              <div>
                <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                  <Link2 className="w-5 h-5 text-purple-600" /> Vincular Productos del Pasado al Catálogo Actual
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Asociá modelos de tanques y productos históricos para consolidar las estadísticas en el catálogo actual
                </p>
              </div>
              <button
                onClick={() => setMappingModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-200/50 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-5 flex-1 overflow-y-auto space-y-4">
              {mappingSuccessMessage && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{mappingSuccessMessage}</span>
                </div>
              )}

              {/* Filters */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
                  {[
                    { id: 'unmapped', label: 'Sin Vincular' },
                    { id: 'mapped', label: 'Vinculados' },
                    { id: 'all', label: 'Todos' }
                  ].map(f => (
                    <button
                      key={f.id}
                      onClick={() => setMappingFilter(f.id as any)}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                        mappingFilter === f.id ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                <div className="relative w-full sm:w-72">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={mappingSearch}
                    onChange={(e) => setMappingSearch(e.target.value)}
                    placeholder="Buscar producto histórico..."
                    className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:border-blue-500 outline-none"
                  />
                </div>
              </div>

              {/* Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase text-slate-500">
                      <th className="py-2.5 px-3">Producto en Planilla</th>
                      <th className="py-2.5 px-3 text-center w-24">Unidades</th>
                      <th className="py-2.5 px-3 w-72">Vincular a Producto Actual</th>
                      <th className="py-2.5 px-3 text-center w-24">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {filteredHistoricalForMapping.slice(0, 50).map((h, idx) => {
                      const selectedId = selectedMappingProduct[h.historical_name] || '';
                      const isSaving = savingMappingFor === h.historical_name;
                      const hasChanged = selectedId !== (h.current_product_id || '');

                      return (
                        <tr key={idx} className="hover:bg-slate-50/70">
                          <td className="py-2.5 px-3 font-bold text-slate-900">
                            <div>{h.historical_name}</div>
                            <div className="text-[10px] text-slate-400 font-medium">
                              {formatPrice(h.total_revenue)} en ventas
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-center font-black text-cyan-700">
                            {h.total_qty.toLocaleString('es-AR')}
                          </td>
                          <td className="py-2.5 px-3">
                            <select
                              value={selectedId}
                              onChange={(e) => {
                                const val = e.target.value;
                                setSelectedMappingProduct(prev => ({ ...prev, [h.historical_name]: val }));
                              }}
                              className={`w-full px-2 py-1 rounded-lg border text-xs font-semibold outline-none cursor-pointer ${
                                selectedId
                                  ? 'bg-blue-50/50 border-blue-200 text-blue-900'
                                  : 'bg-white border-slate-200 text-slate-600'
                              }`}
                            >
                              <option value="">-- Sin Vincular --</option>
                              {catalogProducts.map(cp => (
                                <option key={cp.id} value={cp.id}>
                                  {cp.name}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <button
                              onClick={() => handleSaveMapping(h.historical_name, selectedId || null)}
                              disabled={isSaving || !hasChanged}
                              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1 mx-auto ${
                                isSaving
                                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                                  : hasChanged
                                  ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-2xs cursor-pointer'
                                  : 'bg-slate-100 text-slate-400 cursor-default'
                              }`}
                            >
                              {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <span>Guardar</span>}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
              <span className="text-xs text-slate-500 font-medium">
                {historicalItems.filter(h => h.is_mapped).length} de {historicalItems.length} productos históricos vinculados
              </span>
              <button
                onClick={() => setMappingModalOpen(false)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function WholesaleDashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50/60 p-8 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      }
    >
      <WholesaleDashboardContent />
    </Suspense>
  );
}


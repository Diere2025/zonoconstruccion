"use client";

import React, { useEffect, useState } from "react";
import { formatPrice } from "@/lib/utils";
import { 
  TrendingUp, 
  Package, 
  Users, 
  ShoppingCart, 
  Award, 
  ArrowUpRight, 
  Loader2, 
  Clock, 
  RefreshCw, 
  ArrowUpDown, 
  ChevronDown, 
  Calendar, 
  ChevronLeft, 
  ChevronRight, 
  ArrowUp, 
  ArrowDown, 
  Truck, 
  MapPin, 
  Search, 
  DollarSign, 
  Target, 
  ShieldAlert, 
  PlusCircle, 
  Wallet,
  CheckCircle2
} from "lucide-react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import CategorySalesChart, { CategoryData } from "@/components/dashboard/CategorySalesChart";
import CancelledOrdersChart, { DailyCancelledData } from "@/components/dashboard/CancelledOrdersChart";
import SalesTrendChart, { DailyTrendPoint } from "@/components/dashboard/SalesTrendChart";
import WeeklyComparisonChart from "@/components/dashboard/WeeklyComparisonChart";
import { OrderStatusBadge } from "@/components/ui/Badge";

export interface TopCustomer {
  name: string;
  totalSales: number;
  ordersCount: number;
}

export interface LocalityRank {
  locality: string;
  totalSales: number;
  ordersCount: number;
}

export default function AdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [productSortKey, setProductSortKey] = useState<'billing' | 'qty'>('billing');
  const [productSearchTerm, setProductSearchTerm] = useState('');
  const [productPage, setProductPage] = useState(1);
  const [productPageSize, setProductPageSize] = useState(10);
  const [allPeriodOrders, setAllPeriodOrders] = useState<any[]>([]);

  // Date Helpers
  const getTodayDate = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getRelativeDate = (daysAgo: number) => {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getStartOfWeek = () => {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const date = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${date}`;
  };

  const getStartOfMonth = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}-01`;
  };

  const getPreviousMonthRange = () => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    const year = d.getFullYear();
    const month = d.getMonth();
    const startStr = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month + 1, 0).getDate();
    const endStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    return { start: startStr, end: endStr };
  };

  const formatInputDisplay = (dateStr: string) => {
    if (!dateStr) return "";
    const parts = dateStr.split("-");
    if (parts.length !== 3) return dateStr;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  };

  const formatPct = (value: number, total: number) => {
    if (total === 0) return "0.0%";
    const pct = (value / total) * 100;
    return `${pct.toFixed(1)}%`;
  };

  const [startDate, setStartDate] = useState(getStartOfMonth());
  const [endDate, setEndDate] = useState(getTodayDate());
  const [presetRange, setPresetRange] = useState("mes");

  // Custom Picker States
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [tempStartDate, setTempStartDate] = useState(startDate);
  const [tempEndDate, setTempEndDate] = useState(endDate);
  const [tempPresetRange, setTempPresetRange] = useState(presetRange);
  const [viewDate, setViewDate] = useState(new Date());
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);

  // Stats & Data States
  const [stats, setStats] = useState({
    monthlySales: 0,
    activeOrders: 0,
    deliveredCount: 0,
    pendingCount: 0,
    cancelledCount: 0,
    totalOrdersCount: 0,
    deliveredBilling: 0,
    pendingBilling: 0,
    cancelledBilling: 0,
    totalBillingCount: 0,
    totalClients: 0,
    totalProducts: 0,
    averageOrderValue: 0,
    fulfillmentRate: 0,
    cancellationRate: 0,
    avgSalesPerSeller: 0,
    activeSellersCount: 0
  });

  // Period Comparison Variance States (% delta vs previous period)
  const [prevStats, setPrevStats] = useState<{
    salesVarPct: number | null;
    ordersVarPct: number | null;
    aovVarPct: number | null;
    deliveredVarPct: number | null;
    prevStartDate: string;
    prevEndDate: string;
  }>({
    salesVarPct: null,
    ordersVarPct: null,
    aovVarPct: null,
    deliveredVarPct: null,
    prevStartDate: "",
    prevEndDate: ""
  });

  const [topSellers, setTopSellers] = useState<any[]>([]);
  const [topCustomers, setTopCustomers] = useState<TopCustomer[]>([]);
  const [topLocalities, setTopLocalities] = useState<LocalityRank[]>([]);
  const [leaderboardTab, setLeaderboardTab] = useState<"customers" | "sellers" | "localities">("customers");
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [productsSold, setProductsSold] = useState<any[]>([]);
  const [sellersList, setSellersList] = useState<any[]>([]);
  const [selectedSellerId, setSelectedSellerId] = useState<string>("all");

  const [categorySales, setCategorySales] = useState<CategoryData[]>([]);
  const [totalCategoryQty, setTotalCategoryQty] = useState<number>(0);
  const [dailyCancelledData, setDailyCancelledData] = useState<DailyCancelledData[]>([]);
  const [dailyTrendData, setDailyTrendData] = useState<DailyTrendPoint[]>([]);
  const [selectedCatFilter, setSelectedCatFilter] = useState<string>("all");
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string>("");

  const PRESETS = [
    { id: "hoy", label: "Hoy" },
    { id: "ayer", label: "Ayer" },
    { id: "7dias", label: "Últimos 7 días" },
    { id: "30dias", label: "Últimos 30 días" },
    { id: "semana", label: "Esta semana" },
    { id: "mes", label: "Este mes" },
    { id: "mes_pasado", label: "Mes pasado" },
    { id: "personalizado", label: "Personalizado" }
  ];

  const DAY_NAMES = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

  useEffect(() => {
    if (isPickerOpen) {
      setTempStartDate(startDate);
      setTempEndDate(endDate);
      setTempPresetRange(presetRange);
      if (startDate) {
        const parts = startDate.split("-");
        if (parts.length === 3) {
          setViewDate(new Date(Number(parts[0]), Number(parts[1]) - 1, 1));
        }
      }
    }
  }, [isPickerOpen, startDate, endDate, presetRange]);

  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (year: number, month: number) => {
    const day = new Date(year, month, 1).getDay();
    return day === 0 ? 6 : day - 1;
  };

  const renderCalendarMonth = (year: number, month: number) => {
    const daysInMonth = getDaysInMonth(year, month);
    const firstDayIndex = getFirstDayOfMonth(year, month);
    
    const days = [];
    for (let i = 0; i < firstDayIndex; i++) {
      days.push(null);
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      days.push({
        dateStr,
        day: d
      });
    }
    return days;
  };

  const handleTempPresetChange = (preset: string) => {
    setTempPresetRange(preset);
    if (preset === "personalizado") return;

    let start = getTodayDate();
    let end = getTodayDate();

    switch (preset) {
      case "hoy":
        start = getTodayDate();
        end = getTodayDate();
        break;
      case "ayer":
        start = getRelativeDate(1);
        end = getRelativeDate(1);
        break;
      case "7dias":
        start = getRelativeDate(6);
        end = getTodayDate();
        break;
      case "30dias":
        start = getRelativeDate(29);
        end = getTodayDate();
        break;
      case "semana":
        start = getStartOfWeek();
        end = getTodayDate();
        break;
      case "mes":
        start = getStartOfMonth();
        end = getTodayDate();
        break;
      case "mes_pasado":
        const range = getPreviousMonthRange();
        start = range.start;
        end = range.end;
        break;
    }

    setTempStartDate(start);
    setTempEndDate(end);

    const parts = start.split("-");
    if (parts.length === 3) {
      setViewDate(new Date(Number(parts[0]), Number(parts[1]) - 1, 1));
    }
  };

  const handleDayClick = (dateStr: string) => {
    setTempPresetRange("personalizado");
    if (!tempStartDate || (tempStartDate && tempEndDate)) {
      setTempStartDate(dateStr);
      setTempEndDate("");
    } else {
      if (dateStr < tempStartDate) {
        setTempStartDate(dateStr);
        setTempEndDate("");
      } else {
        setTempEndDate(dateStr);
      }
    }
  };

  const getRangeLabel = () => {
    const startFmt = formatInputDisplay(startDate);
    const endFmt = formatInputDisplay(endDate);

    if (presetRange === "hoy") return `Hoy (${startFmt})`;
    if (presetRange === "ayer") return `Ayer (${startFmt})`;
    if (presetRange === "7dias") return `Últimos 7 días (${startFmt} - ${endFmt})`;
    if (presetRange === "30dias") return `Últimos 30 días (${startFmt} - ${endFmt})`;
    if (presetRange === "semana") return `Esta semana (${startFmt} - ${endFmt})`;
    if (presetRange === "mes") return `Este mes (${startFmt} - ${endFmt})`;
    if (presetRange === "mes_pasado") return `Mes pasado (${startFmt} - ${endFmt})`;
    return `Personalizado (${startFmt} - ${endFmt})`;
  };

  const getDayClasses = (dateStr: string) => {
    const isStart = dateStr === tempStartDate;
    const isEnd = dateStr === tempEndDate;
    const inRange = tempStartDate && tempEndDate && dateStr > tempStartDate && dateStr < tempEndDate;
    const inHoverRange = tempStartDate && !tempEndDate && hoveredDate && dateStr > tempStartDate && dateStr <= hoveredDate;
    const isToday = dateStr === getTodayDate();

    let classes = "w-8 h-8 flex items-center justify-center text-xs font-semibold relative transition-all cursor-pointer ";

    if (isStart && isEnd) {
      classes += "bg-brand-600 text-white rounded-lg z-10 shadow-xs";
    } else if (isStart) {
      classes += "bg-brand-600 text-white rounded-l-lg z-10 shadow-xs";
    } else if (isEnd) {
      classes += "bg-brand-600 text-white rounded-r-lg z-10 shadow-xs";
    } else if (inRange) {
      classes += "bg-brand-50 text-brand-700 rounded-none hover:bg-brand-100";
    } else if (inHoverRange) {
      classes += "bg-brand-50/60 text-brand-600 rounded-none hover:bg-brand-100";
    } else {
      classes += "text-slate-700 hover:bg-slate-100 hover:text-slate-900 rounded-lg";
    }

    if (isToday && !isStart && !isEnd) {
      classes += " border border-brand-500 text-brand-600 rounded-lg font-bold";
    }

    return { classes, isStart, isEnd };
  };

  const prevMonth = () => {
    setViewDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setViewDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const formatMonthHeader = (date: Date) => {
    const month = date.getMonth();
    const year = date.getFullYear();
    const names = [
      "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
      "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
    ];
    return `${names[month]} ${year}`;
  };

  const calculatePreviousPeriod = (sDateStr: string, eDateStr: string) => {
    try {
      const s = new Date(sDateStr + "T00:00:00");
      const e = new Date(eDateStr + "T00:00:00");
      const durationDays = Math.max(1, Math.round((e.getTime() - s.getTime()) / (1000 * 3600 * 24)) + 1);

      const prevEnd = new Date(s.getTime());
      prevEnd.setDate(prevEnd.getDate() - 1);

      const prevStart = new Date(prevEnd.getTime());
      prevStart.setDate(prevStart.getDate() - durationDays + 1);

      const formatYMD = (d: Date) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      };

      return {
        prevStartStr: formatYMD(prevStart),
        prevEndStr: formatYMD(prevEnd)
      };
    } catch (err) {
      return { prevStartStr: sDateStr, prevEndStr: eDateStr };
    }
  };

  const loadData = async (start: string, end: string, sellerId: string = selectedSellerId) => {
    try {
      setLoading(true);
      setIsRefreshing(true);

      const { prevStartStr, prevEndStr } = calculatePreviousPeriod(start, end);

      let recentQuery = supabase.from("orders")
        .select("id, legacy_code, customer_name, total_amount, status, created_at, order_date, seller_id")
        .order("created_at", { ascending: false })
        .limit(6);
        
      let rangeQuery = supabase.from("orders")
        .select("id, legacy_code, customer_name, locality, total_amount, status, seller_id, order_date, created_at")
        .gte("order_date", start)
        .lte("order_date", end);

      let prevRangeQuery = supabase.from("orders")
        .select("id, legacy_code, total_amount, status, seller_id, order_date")
        .gte("order_date", prevStartStr)
        .lte("order_date", prevEndStr);

      let itemsQuery = supabase
        .from("order_items")
        .select(`
          product_name, 
          quantity, 
          unit_price, 
          products(sku, category),
          orders!inner(id, status, order_date, created_at, seller_id)
        `)
        .neq("orders.status", "Cancelado")
        .gte("orders.order_date", start)
        .lte("orders.order_date", end);

      if (sellerId !== "all") {
        recentQuery = recentQuery.eq("seller_id", sellerId);
        rangeQuery = rangeQuery.eq("seller_id", sellerId);
        prevRangeQuery = prevRangeQuery.eq("seller_id", sellerId);
        itemsQuery = itemsQuery.eq("orders.seller_id", sellerId);
      }

      const [
        clientsCountRes,
        productsCountRes,
        sellersRes,
        recentOrdersRes,
        ordersInRangeRes,
        prevOrdersRes,
        itemsRes
      ] = await Promise.all([
        supabase.from("clients").select("id", { count: "exact", head: true }),
        supabase.from("products").select("id", { count: "exact", head: true }),
        supabase.from("sellers").select("id, full_name"),
        recentQuery,
        rangeQuery,
        prevRangeQuery,
        itemsQuery
      ]);

      if (ordersInRangeRes.error) throw ordersInRangeRes.error;
      if (sellersRes.error) throw sellersRes.error;
      if (itemsRes.error) throw itemsRes.error;

      const rawOrdersInRange = ordersInRangeRes.data || [];
      const rawPrevOrders = prevOrdersRes.data || [];
      const sellers = sellersRes.data || [];
      setSellersList(sellers);

      // Deduplicate current period orders
      const seenLegacyCodes = new Set<string>();
      const ordersInRange = rawOrdersInRange.filter(o => {
        if (o.legacy_code && String(o.legacy_code).trim() !== '') {
          const code = String(o.legacy_code).trim();
          if (seenLegacyCodes.has(code)) return false;
          seenLegacyCodes.add(code);
        }
        return true;
      });

      // Deduplicate previous period orders
      const seenPrevCodes = new Set<string>();
      const prevOrdersInRange = rawPrevOrders.filter(o => {
        if (o.legacy_code && String(o.legacy_code).trim() !== '') {
          const code = String(o.legacy_code).trim();
          if (seenPrevCodes.has(code)) return false;
          seenPrevCodes.add(code);
        }
        return true;
      });

      // Current Period Sales Sum (all except Cancelado)
      const activeOrdersList = ordersInRange.filter(o => o.status !== "Cancelado");
      const salesSum = activeOrdersList.reduce((acc, o) => acc + (Number(o.total_amount) || 0), 0);

      // Previous Period Sales & AOV
      const prevActiveOrders = prevOrdersInRange.filter(o => o.status !== "Cancelado");
      const prevSalesSum = prevActiveOrders.reduce((acc, o) => acc + (Number(o.total_amount) || 0), 0);
      const prevOrdersCount = prevOrdersInRange.length;
      const prevAOV = prevActiveOrders.length > 0 ? prevSalesSum / prevActiveOrders.length : 0;
      const prevDeliveredBilling = prevOrdersInRange.filter(o => o.status === "Entregado").reduce((acc, o) => acc + (Number(o.total_amount) || 0), 0);

      // Compute Period-over-Period Variances (% delta)
      const salesVarPct = prevSalesSum > 0 ? ((salesSum - prevSalesSum) / prevSalesSum) * 100 : null;
      const ordersVarPct = prevOrdersCount > 0 ? ((ordersInRange.length - prevOrdersCount) / prevOrdersCount) * 100 : null;
      const currentAOV = activeOrdersList.length > 0 ? salesSum / activeOrdersList.length : 0;
      const aovVarPct = prevAOV > 0 ? ((currentAOV - prevAOV) / prevAOV) * 100 : null;
      const deliveredVarPct = prevDeliveredBilling > 0 ? (((ordersInRange.filter(o => o.status === "Entregado").reduce((acc, o) => acc + (Number(o.total_amount) || 0), 0)) - prevDeliveredBilling) / prevDeliveredBilling) * 100 : null;

      setPrevStats({
        salesVarPct,
        ordersVarPct,
        aovVarPct,
        deliveredVarPct,
        prevStartDate: prevStartStr,
        prevEndDate: prevEndStr
      });

      const deliveredCount = ordersInRange.filter(o => o.status === "Entregado").length;
      const pendingCount = ordersInRange.filter(o => ["Pendiente", "Confirmado", "Entregando"].includes(o.status)).length;
      const cancelledCount = ordersInRange.filter(o => o.status === "Cancelado").length;
      const totalOrdersCount = ordersInRange.length;

      const deliveredBilling = ordersInRange
        .filter(o => o.status === "Entregado")
        .reduce((acc, o) => acc + (Number(o.total_amount) || 0), 0);
      const pendingBilling = ordersInRange
        .filter(o => ["Pendiente", "Confirmado", "Entregando"].includes(o.status))
        .reduce((acc, o) => acc + (Number(o.total_amount) || 0), 0);
      const cancelledBilling = ordersInRange
        .filter(o => o.status === "Cancelado")
        .reduce((acc, o) => acc + (Number(o.total_amount) || 0), 0);
      const totalBillingCount = deliveredBilling + pendingBilling + cancelledBilling;

      const fulfillmentRate = totalOrdersCount > 0 ? (deliveredCount / totalOrdersCount) * 100 : 0;
      const cancellationRate = totalOrdersCount > 0 ? (cancelledCount / totalOrdersCount) * 100 : 0;

      // Top Sellers
      const sellerSales: Record<string, number> = {};
      ordersInRange
        .filter(o => o.status !== "Cancelado")
        .forEach(o => {
          if (o.seller_id) {
            sellerSales[o.seller_id] = (sellerSales[o.seller_id] || 0) + (Number(o.total_amount) || 0);
          }
        });

      const sellersRanked = Object.entries(sellerSales)
        .map(([id, sales]) => {
          const seller = sellers.find(s => s.id === id);
          return {
            id,
            name: seller ? seller.full_name : "Vendedor Desconocido",
            sales
          };
        })
        .sort((a, b) => b.sales - a.sales)
        .slice(0, 5);

      const activeSellersCount = Object.keys(sellerSales).length;
      const avgSalesPerSeller = activeSellersCount > 0 ? salesSum / activeSellersCount : 0;

      // Top Customers
      const customerSalesMap: Record<string, { name: string; totalSales: number; ordersCount: number }> = {};
      ordersInRange
        .filter(o => o.status !== "Cancelado")
        .forEach(o => {
          const name = (o.customer_name || 'Cliente sin Nombre').trim();
          if (!customerSalesMap[name]) {
            customerSalesMap[name] = { name, totalSales: 0, ordersCount: 0 };
          }
          customerSalesMap[name].totalSales += (Number(o.total_amount) || 0);
          customerSalesMap[name].ordersCount += 1;
        });

      const customersRanked = Object.values(customerSalesMap)
        .sort((a, b) => b.totalSales - a.totalSales)
        .slice(0, 5);

      // Top Localities
      const localityMap: Record<string, { locality: string; totalSales: number; ordersCount: number }> = {};
      ordersInRange
        .filter(o => o.status !== "Cancelado")
        .forEach(o => {
          const locName = (o.locality || 'Sin Localidad / Mostrador').trim();
          if (!localityMap[locName]) {
            localityMap[locName] = { locality: locName, totalSales: 0, ordersCount: 0 };
          }
          localityMap[locName].totalSales += (Number(o.total_amount) || 0);
          localityMap[locName].ordersCount += 1;
        });

      const localitiesRanked = Object.values(localityMap)
        .sort((a, b) => b.totalSales - a.totalSales)
        .slice(0, 5);

      setTopSellers(sellersRanked);
      setTopCustomers(customersRanked);
      setTopLocalities(localitiesRanked);

      setStats({
        monthlySales: salesSum,
        activeOrders: totalOrdersCount,
        deliveredCount,
        pendingCount,
        cancelledCount,
        totalOrdersCount,
        deliveredBilling,
        pendingBilling,
        cancelledBilling,
        totalBillingCount,
        totalClients: clientsCountRes.count || 0,
        totalProducts: productsCountRes.count || 0,
        averageOrderValue: currentAOV,
        fulfillmentRate,
        cancellationRate,
        avgSalesPerSeller,
        activeSellersCount
      });

      setAllPeriodOrders(ordersInRange);

      const formattedRecent = (recentOrdersRes.data || []).map(o => {
        const seller = sellers.find(s => s.id === o.seller_id);
        return {
          ...o,
          sellerName: seller ? seller.full_name : "Desconocido"
        };
      });
      setRecentOrders(formattedRecent);

      const items = itemsRes.data || [];
      const productSales: Record<string, { name: string, sku: string, category: string, qty: number, total: number }> = {};
      
      const getCategoryForProduct = (pNameRaw: string, dbCategoryRaw: string | undefined, orderPrimaryCategory?: string): string => {
        const pName = (pNameRaw || '').toLowerCase();
        let cat = dbCategoryRaw;
        const isDiscount = pName.includes('descuento') || pName.includes('bonificaci');

        if (isDiscount) {
          if (pName.includes('mep')) return 'MEPS';
          if (pName.includes('bomba')) return 'Bombas';
          return orderPrimaryCategory || 'Tanques de Agua';
        }

        if (pName.includes('bomba') || cat === 'Bombas') {
          return 'Bombas';
        } else if (pName.includes('puerta') || pName.includes('ventana') || cat === 'Aberturas') {
          return 'Aberturas';
        } else if (pName.includes('termotanque') || pName.includes('turboflex') || cat === 'Termotanques') {
          return 'Termotanques';
        } else if (
          cat === 'Complementos para tanques' ||
          cat === 'Tanques' ||
          cat === 'Tanques Bicapa' ||
          cat === 'Tanques Cisterna' ||
          cat === 'Tanques Tricapa Beige' ||
          cat === 'Tanques Tricapa Oferta' ||
          pName.includes('cuatr') || 
          pName.includes('cuatricapa') || 
          pName.includes('aquafort') || 
          pName.includes('tanque') || 
          pName.includes('cisterna') || 
          pName.includes('tricapa') || 
          pName.includes('bicapa') ||
          pName.includes('complemento') ||
          pName.includes('base') ||
          pName.includes('hierro') ||
          pName.includes('flotante') ||
          pName.includes('boya')
        ) {
          return 'Tanques de Agua';
        } else if (
          pName.includes('biofort') || 
          pName.includes('biodigestor') || 
          pName.includes('biolam') ||
          pName.includes('awaduct') ||
          pName.includes('desengrasadora') || 
          pName.includes('séptica') || 
          pName.includes('septica') || 
          pName.includes('cámara') || 
          pName.includes('camara') ||
          cat === 'Biodigestores' ||
          cat === 'Cámaras Sépticas' ||
          cat === 'Cámaras Desengrasadoras'
        ) {
          return 'Biodigestores';
        } else if (
          pName.includes('pintura') || 
          pName.includes('latex') || 
          pName.includes('látex') || 
          pName.includes('andina') || 
          pName.includes('lavable') || 
          pName.includes('zono') ||
          pName.includes('pinceleta') ||
          pName.includes('pincel') ||
          pName.includes('lija') ||
          pName.includes('rodillo') ||
          pName.includes('guante') ||
          pName.includes('fijador') ||
          pName.includes('sellador') ||
          pName.includes('enduido') ||
          pName.includes('endui') ||
          pName.includes('sintetico') ||
          pName.includes('sintético') ||
          cat === 'Pinturas' ||
          cat === 'Herramientas de pintura' ||
          cat === 'Accesorios de pintura'
        ) {
          return 'Pinturas';
        } else if (
          pName.includes('venda') || 
          pName.includes('mep') ||
          pName.includes('meps') || 
          (pName.includes('rodillo') && pName.includes('meps')) ||
          (pName.includes('guante') && pName.includes('meps')) ||
          pName.includes('equilibrio') || 
          cat === 'MEPS'
        ) {
          return 'MEPS';
        } else if (pName.includes('escalera')) {
          return 'Escaleras';
        } else if (!cat || cat.trim() === '' || cat === 'otro' || cat === 'Otros' || cat === 'Interno') {
          return 'Otros / General';
        }

        return cat;
      };

      const orderPrimaryCatMap: Record<string, string> = {};
      items.forEach(item => {
        const pName = item.product_name || '';
        const isDiscount = pName.toLowerCase().includes('descuento') || pName.toLowerCase().includes('bonificaci');
        if (!isDiscount) {
          const orderId = (item as any).orders?.id || (item as any).order_id;
          if (orderId && !orderPrimaryCatMap[orderId]) {
            const cat = getCategoryForProduct(pName, (item as any).products?.category);
            if (cat && cat !== 'Otros / General') {
              orderPrimaryCatMap[orderId] = cat;
            }
          }
        }
      });

      const catSalesMap: Record<string, {
        category: string;
        totalBilling: number;
        totalQty: number;
        productsMap: Record<string, number>;
      }> = {};

      let totalCatBillingAcc = 0;
      let totalCatQtyAcc = 0;

      items.forEach(item => {
        const rawSku = (item as any).products?.sku || 'SIN SKU';
        const normName = (item.product_name || 'DESCONOCIDO').trim();
        const key = normName.toLowerCase();
        const orderId = (item as any).orders?.id || (item as any).order_id;
        const orderPrimaryCat = orderPrimaryCatMap[orderId] || 'Tanques de Agua';

        const cat = getCategoryForProduct(normName, (item as any).products?.category, orderPrimaryCat);

        if (!productSales[key]) {
          productSales[key] = {
            name: normName,
            sku: rawSku,
            category: cat,
            qty: 0,
            total: 0
          };
        } else if (productSales[key].sku.startsWith('AUTO-') && !rawSku.startsWith('AUTO-') && rawSku !== 'SIN SKU') {
          productSales[key].sku = rawSku;
        }

        productSales[key].qty += Number(item.quantity) || 0;
        productSales[key].total += (Number(item.quantity) || 0) * (Number(item.unit_price) || 0);

        if (!catSalesMap[cat]) {
          catSalesMap[cat] = {
            category: cat,
            totalBilling: 0,
            totalQty: 0,
            productsMap: {}
          };
        }

        const qty = Number(item.quantity) || 0;
        const lineTotal = qty * (Number(item.unit_price) || 0);

        catSalesMap[cat].totalBilling += lineTotal;
        catSalesMap[cat].totalQty += qty;
        totalCatBillingAcc += lineTotal;
        totalCatQtyAcc += qty;

        const prodName = item.product_name || 'Desconocido';
        catSalesMap[cat].productsMap[prodName] = (catSalesMap[cat].productsMap[prodName] || 0) + lineTotal;
      });

      const sortedProductSales = Object.values(productSales);
      setProductsSold(sortedProductSales);

      const categorySalesList: CategoryData[] = Object.values(catSalesMap).map(c => {
        let topProd = '';
        let maxVal = -1;
        Object.entries(c.productsMap).forEach(([pName, val]) => {
          if (val > maxVal) {
            maxVal = val;
            topProd = pName;
          }
        });

        return {
          category: c.category,
          totalBilling: c.totalBilling,
          totalQty: c.totalQty,
          pctBilling: totalCatBillingAcc > 0 ? (c.totalBilling / totalCatBillingAcc) * 100 : 0,
          pctQty: totalCatQtyAcc > 0 ? (c.totalQty / totalCatQtyAcc) * 100 : 0,
          topProduct: topProd
        };
      });

      setCategorySales(categorySalesList);
      setTotalCategoryQty(totalCatQtyAcc);

      const generateDateRange = (startDateStr: string, endDateStr: string) => {
        const dates: string[] = [];
        try {
          let curr = new Date(startDateStr + "T00:00:00");
          const stop = new Date(endDateStr + "T00:00:00");
          while (curr <= stop) {
            const y = curr.getFullYear();
            const m = String(curr.getMonth() + 1).padStart(2, '0');
            const d = String(curr.getDate()).padStart(2, '0');
            dates.push(`${y}-${m}-${d}`);
            curr.setDate(curr.getDate() + 1);
          }
        } catch (e) {
          dates.push(startDateStr);
        }
        return dates.length > 0 ? dates : [startDateStr];
      };

      const dateRange = generateDateRange(start, end);

      const dailyCancelledList: DailyCancelledData[] = dateRange.map(dStr => {
        const parts = dStr.split("-");
        const displayDate = parts.length === 3 ? `${parts[2]}/${parts[1]}` : dStr;

        const ordersOnDate = ordersInRange.filter(o => {
          const oDate = (o.order_date || o.created_at || "").slice(0, 10);
          return oDate === dStr;
        });

        const cancelledOrdersOnDate = ordersOnDate.filter(o => o.status === "Cancelado");

        const cancelledCount = cancelledOrdersOnDate.length;
        const totalOrdersCountOnDate = ordersOnDate.length;
        const cancelledBillingOnDate = cancelledOrdersOnDate.reduce((acc, o) => acc + (Number(o.total_amount) || 0), 0);
        const totalBillingOnDate = ordersOnDate.reduce((acc, o) => acc + (Number(o.total_amount) || 0), 0);

        return {
          date: dStr,
          displayDate,
          cancelledCount,
          totalOrdersCount: totalOrdersCountOnDate,
          cancelledBilling: cancelledBillingOnDate,
          totalBilling: totalBillingOnDate
        };
      });

      setDailyCancelledData(dailyCancelledList);

      const dailyTrendList: DailyTrendPoint[] = dateRange.map(dStr => {
        const parts = dStr.split("-");
        const displayDate = parts.length === 3 ? `${parts[2]}/${parts[1]}` : dStr;

        const ordersOnDate = ordersInRange.filter(o => {
          const oDate = (o.order_date || o.created_at || "").slice(0, 10);
          return oDate === dStr;
        });

        const activeOnDate = ordersOnDate.filter(o => o.status !== "Cancelado");
        const salesOnDate = activeOnDate.reduce((acc, o) => acc + (Number(o.total_amount) || 0), 0);

        const deliveredOnDate = ordersOnDate.filter(o => o.status === "Entregado");
        const deliveredSalesOnDate = deliveredOnDate.reduce((acc, o) => acc + (Number(o.total_amount) || 0), 0);

        return {
          date: dStr,
          displayDate,
          sales: salesOnDate,
          ordersCount: ordersOnDate.length,
          deliveredCount: deliveredOnDate.length,
          deliveredSales: deliveredSalesOnDate
        };
      });

      setDailyTrendData(dailyTrendList);
      setLastRefreshedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));

    } catch (err) {
      console.error("Error loading admin dashboard stats:", err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadData(startDate, endDate);
  }, []);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 text-brand-600 animate-spin" />
        <p className="text-slate-500 font-medium text-xs">Cargando métricas consolidadas...</p>
      </div>
    );
  }

  const sortedProductsSold = [...productsSold]
    .filter((p) => selectedCatFilter === "all" || p.category === selectedCatFilter)
    .filter((p) => {
      if (!productSearchTerm.trim()) return true;
      const term = productSearchTerm.toLowerCase();
      return p.name.toLowerCase().includes(term) || (p.sku && p.sku.toLowerCase().includes(term));
    })
    .sort((a, b) => {
      if (productSortKey === "qty") {
        return b.qty - a.qty;
      } else {
        return b.total - a.total;
      }
    });

  const totalProductPages = Math.max(1, Math.ceil(sortedProductsSold.length / productPageSize));
  const paginatedProducts = sortedProductsSold.slice(
    (productPage - 1) * productPageSize,
    productPage * productPageSize
  );

  useEffect(() => {
    setProductPage(1);
  }, [selectedCatFilter, productSearchTerm, productSortKey, productPageSize]);

  const month1Year = viewDate.getFullYear();
  const month1Month = viewDate.getMonth();
  const month1Days = renderCalendarMonth(month1Year, month1Month);

  const nextMonthDate = new Date(month1Year, month1Month + 1, 1);
  const month2Year = nextMonthDate.getFullYear();
  const month2Month = nextMonthDate.getMonth();
  const month2Days = renderCalendarMonth(month2Year, month2Month);

  return (
    <div className="space-y-6 pb-12">
      {/* Title & Top Toolbar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            Dashboard General ERP
          </h1>
          <p className="text-xs text-slate-500 font-normal mt-0.5">
            Consola central de control y métricas consolidadas de venta y distribución.
            {lastRefreshedAt && (
              <span className="text-slate-400 ml-1">
                (Actualizado: {lastRefreshedAt})
              </span>
            )}
          </p>
        </div>

        {/* Global Filters & Manual Refresh */}
        <div className="bg-white p-2 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row items-stretch md:items-center gap-2.5 w-full md:w-auto">
          {/* Refresh Button */}
          <button
            type="button"
            onClick={() => loadData(startDate, endDate, selectedSellerId)}
            disabled={isRefreshing}
            className="px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            title="Refrescar datos"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-brand-600' : ''}`} />
            <span>Refrescar</span>
          </button>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            {/* Seller Filter */}
            <div className="min-w-[150px]">
              <select
                value={selectedSellerId}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedSellerId(val);
                  loadData(startDate, endDate, val);
                }}
                className="select-standard py-1.5"
              >
                <option value="all">Todos los Vendedores</option>
                {sellersList.map(s => (
                  <option key={s.id} value={s.id}>{s.full_name}</option>
                ))}
              </select>
            </div>

            {/* Custom Date Range Picker */}
            <div className="relative min-w-[220px]">
              <button
                type="button"
                onClick={() => setIsPickerOpen(!isPickerOpen)}
                className="w-full px-3 py-1.5 rounded-xl border border-slate-200 font-semibold text-xs bg-slate-50 text-slate-700 hover:bg-slate-100/70 transition-all flex items-center justify-between gap-2 cursor-pointer"
              >
                <div className="flex items-center gap-1.5 truncate">
                  <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="truncate">{getRangeLabel()}</span>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              </button>

              {isPickerOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsPickerOpen(false)} />
                  
                  <div className="absolute right-0 top-full mt-2 z-50 bg-white border border-slate-200/80 rounded-2xl shadow-xl flex flex-col md:flex-row overflow-hidden w-full max-w-[95vw] md:max-w-none md:w-[650px] animate-in fade-in slide-in-from-top-2 duration-150">
                    {/* Left presets bar */}
                    <div className="w-full md:w-[160px] border-b md:border-b-0 md:border-r border-slate-100 p-3 flex flex-row md:flex-col overflow-x-auto md:overflow-x-visible gap-1 shrink-0 bg-slate-50/60">
                      {PRESETS.map((p) => {
                        const active = tempPresetRange === p.id;
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => handleTempPresetChange(p.id)}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-medium text-xs whitespace-nowrap text-left transition-all w-full ${
                              active 
                                ? "bg-brand-50 text-brand-700 font-semibold" 
                                : "text-slate-600 hover:bg-slate-100 hover:text-slate-800"
                            }`}
                          >
                            <span className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 ${
                              active ? "border-brand-600 text-brand-600" : "border-slate-300"
                            }`}>
                              {active && <span className="w-1.5 h-1.5 rounded-full bg-brand-600" />}
                            </span>
                            {p.label}
                          </button>
                        );
                      })}
                    </div>

                    {/* Right calendars and inputs */}
                    <div className="flex-1 p-4 md:p-5 flex flex-col justify-between min-w-0 bg-white">
                      <div className="flex items-center justify-between mb-3 border-b border-slate-50 pb-2">
                        <button
                          type="button"
                          onClick={prevMonth}
                          className="p-1 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <span className="text-xs font-bold text-slate-600">
                          Seleccionar Rango
                        </span>
                        <button
                          type="button"
                          onClick={nextMonth}
                          className="p-1 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Month grids */}
                      <div className="flex flex-col sm:flex-row gap-6">
                        <div className="flex-1">
                          <div className="text-center font-bold text-xs text-slate-700 mb-2">
                            {formatMonthHeader(viewDate)}
                          </div>
                          <div className="grid grid-cols-7 gap-y-1 gap-x-1 text-center">
                            {DAY_NAMES.map(d => (
                              <span key={d} className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">{d}</span>
                            ))}
                            {month1Days.map((dayObj, idx) => {
                              if (!dayObj) return <div key={`empty-1-${idx}`} className="w-8 h-8" />;
                              const { classes } = getDayClasses(dayObj.dateStr);
                              return (
                                <button
                                  key={dayObj.dateStr}
                                  type="button"
                                  onClick={() => handleDayClick(dayObj.dateStr)}
                                  onMouseEnter={() => setHoveredDate(dayObj.dateStr)}
                                  onMouseLeave={() => setHoveredDate(null)}
                                  className={classes}
                                >
                                  {dayObj.day}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className="flex-1 hidden md:block">
                          <div className="text-center font-bold text-xs text-slate-700 mb-2">
                            {formatMonthHeader(nextMonthDate)}
                          </div>
                          <div className="grid grid-cols-7 gap-y-1 gap-x-1 text-center">
                            {DAY_NAMES.map(d => (
                              <span key={d} className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">{d}</span>
                            ))}
                            {month2Days.map((dayObj, idx) => {
                              if (!dayObj) return <div key={`empty-2-${idx}`} className="w-8 h-8" />;
                              const { classes } = getDayClasses(dayObj.dateStr);
                              return (
                                <button
                                  key={dayObj.dateStr}
                                  type="button"
                                  onClick={() => handleDayClick(dayObj.dateStr)}
                                  onMouseEnter={() => setHoveredDate(dayObj.dateStr)}
                                  onMouseLeave={() => setHoveredDate(null)}
                                  className={classes}
                                >
                                  {dayObj.day}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      {/* Bottom display & actions */}
                      <div className="flex flex-wrap items-center justify-between border-t border-slate-100 pt-4 mt-4 gap-3">
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-xl px-2 py-1 relative">
                            <div className="relative w-20">
                              <input 
                                type="date" 
                                className="opacity-0 absolute inset-0 w-full h-full cursor-pointer z-10"
                                value={tempStartDate || ""}
                                onChange={(e) => {
                                  setTempStartDate(e.target.value);
                                  setTempPresetRange("personalizado");
                                }}
                              />
                              <div className="text-center font-semibold text-xs text-slate-700 py-0.5 select-none">
                                {tempStartDate ? formatInputDisplay(tempStartDate) : "Desde"}
                              </div>
                            </div>
                            
                            <span className="text-slate-400 font-bold text-xs">-</span>
                            
                            <div className="relative w-20">
                              <input 
                                type="date" 
                                className="opacity-0 absolute inset-0 w-full h-full cursor-pointer z-10"
                                value={tempEndDate || ""}
                                onChange={(e) => {
                                  setTempEndDate(e.target.value);
                                  setTempPresetRange("personalizado");
                                }}
                              />
                              <div className="text-center font-semibold text-xs text-slate-700 py-0.5 select-none">
                                {tempEndDate ? formatInputDisplay(tempEndDate) : "Hasta"}
                              </div>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => setIsPickerOpen(false)}
                            className="px-3 py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            disabled={!tempStartDate || !tempEndDate}
                            onClick={() => {
                              setStartDate(tempStartDate);
                              setEndDate(tempEndDate);
                              setPresetRange(tempPresetRange);
                              loadData(tempStartDate, tempEndDate, selectedSellerId);
                              setIsPickerOpen(false);
                            }}
                            className="px-4 py-1.5 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50"
                          >
                            Aplicar
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Quick Action Shortcuts Toolbar */}
      <div className="bg-slate-900 p-4 rounded-2xl text-slate-200 shadow-xs border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700/80 flex items-center justify-center text-brand-400 shrink-0">
            <Target className="w-4.5 h-4.5" />
          </div>
          <div>
            <h3 className="text-xs font-semibold text-white">Accesos Rápidos</h3>
            <p className="text-[11px] text-slate-400 font-normal">Acceso directo a las herramientas operativas principales</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <Link href="/vendedores/presupuestos">
            <button type="button" className="px-3 py-1.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-medium text-xs transition-all flex items-center gap-1.5 shadow-xs cursor-pointer">
              <PlusCircle className="w-3.5 h-3.5" />
              Cotizador
            </button>
          </Link>

          <Link href="/vendedores/pedidos">
            <button type="button" className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs border border-slate-700 transition-all flex items-center gap-1.5 cursor-pointer">
              <ShoppingCart className="w-3.5 h-3.5 text-brand-400" />
              Pedidos
            </button>
          </Link>

          <Link href="/vendedores/ruteo">
            <button type="button" className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs border border-slate-700 transition-all flex items-center gap-1.5 cursor-pointer">
              <Truck className="w-3.5 h-3.5 text-emerald-400" />
              Ruteo
            </button>
          </Link>

          <Link href="/admin/rentabilidad">
            <button type="button" className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs border border-slate-700 transition-all flex items-center gap-1.5 cursor-pointer">
              <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
              Rentabilidad
            </button>
          </Link>

          <Link href="/admin/finanzas">
            <button type="button" className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs border border-slate-700 transition-all flex items-center gap-1.5 cursor-pointer">
              <Wallet className="w-3.5 h-3.5 text-purple-400" />
              Finanzas
            </button>
          </Link>
        </div>
      </div>

      {/* Expanded Metrics Grid (6 Executive KPI Cards with PoP comparison) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {/* KPI 1: Facturación Total */}
        <div className="card-enterprise p-4 flex flex-col justify-between space-y-2.5">
          <div className="flex items-start justify-between">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Facturación Total</p>
            <div className="w-7 h-7 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
              <TrendingUp className="w-3.5 h-3.5" />
            </div>
          </div>
          <div>
            <h3 className="text-xl font-bold text-slate-900 leading-none tabular-nums">{formatPrice(stats.monthlySales)}</h3>
            
            {prevStats.salesVarPct !== null && (
              <div className="mt-1.5 flex items-center gap-1 text-[11px] font-semibold">
                {prevStats.salesVarPct >= 0 ? (
                  <span className="text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-md flex items-center gap-0.5">
                    <ArrowUp className="w-3 h-3" /> +{prevStats.salesVarPct.toFixed(1)}%
                  </span>
                ) : (
                  <span className="text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded-md flex items-center gap-0.5">
                    <ArrowDown className="w-3 h-3" /> {prevStats.salesVarPct.toFixed(1)}%
                  </span>
                )}
                <span className="text-slate-400 text-[10px] font-normal">vs anterior</span>
              </div>
            )}
          </div>

          <div className="border-t border-slate-100 pt-2 space-y-1 text-[10px] font-medium text-slate-500">
            <div className="flex justify-between">
              <span>Entregado:</span>
              <span className="text-emerald-700 font-semibold tabular-nums">{formatPrice(stats.deliveredBilling)}</span>
            </div>
            <div className="flex justify-between">
              <span>Pendiente:</span>
              <span className="text-blue-700 font-semibold tabular-nums">{formatPrice(stats.pendingBilling)}</span>
            </div>
          </div>
        </div>

        {/* KPI 2: Pedidos en Rango */}
        <div className="card-enterprise p-4 flex flex-col justify-between space-y-2.5">
          <div className="flex items-start justify-between">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Pedidos Totales</p>
            <div className="w-7 h-7 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0">
              <Package className="w-3.5 h-3.5" />
            </div>
          </div>
          <div>
            <h3 className="text-xl font-bold text-slate-900 leading-none tabular-nums">{stats.totalOrdersCount}</h3>

            {prevStats.ordersVarPct !== null && (
              <div className="mt-1.5 flex items-center gap-1 text-[11px] font-semibold">
                {prevStats.ordersVarPct >= 0 ? (
                  <span className="text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-md flex items-center gap-0.5">
                    <ArrowUp className="w-3 h-3" /> +{prevStats.ordersVarPct.toFixed(1)}%
                  </span>
                ) : (
                  <span className="text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded-md flex items-center gap-0.5">
                    <ArrowDown className="w-3 h-3" /> {prevStats.ordersVarPct.toFixed(1)}%
                  </span>
                )}
                <span className="text-slate-400 text-[10px] font-normal">vs anterior</span>
              </div>
            )}
          </div>

          <div className="border-t border-slate-100 pt-2 space-y-1 text-[10px] font-medium text-slate-500">
            <div className="flex justify-between">
              <span>Entregados:</span>
              <span className="text-emerald-700 font-semibold tabular-nums">{stats.deliveredCount}</span>
            </div>
            <div className="flex justify-between">
              <span>Pendientes:</span>
              <span className="text-blue-700 font-semibold tabular-nums">{stats.pendingCount}</span>
            </div>
          </div>
        </div>

        {/* KPI 3: Ticket Promedio por Pedido (AOV) */}
        <div className="card-enterprise p-4 flex flex-col justify-between space-y-2.5">
          <div className="flex items-start justify-between">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Ticket Promedio</p>
            <div className="w-7 h-7 rounded-lg bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 shrink-0">
              <DollarSign className="w-3.5 h-3.5" />
            </div>
          </div>
          <div>
            <h3 className="text-xl font-bold text-slate-900 leading-none tabular-nums">{formatPrice(stats.averageOrderValue)}</h3>

            {prevStats.aovVarPct !== null && (
              <div className="mt-1.5 flex items-center gap-1 text-[11px] font-semibold">
                {prevStats.aovVarPct >= 0 ? (
                  <span className="text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-md flex items-center gap-0.5">
                    <ArrowUp className="w-3 h-3" /> +{prevStats.aovVarPct.toFixed(1)}%
                  </span>
                ) : (
                  <span className="text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded-md flex items-center gap-0.5">
                    <ArrowDown className="w-3 h-3" /> {prevStats.aovVarPct.toFixed(1)}%
                  </span>
                )}
                <span className="text-slate-400 text-[10px] font-normal">vs anterior</span>
              </div>
            )}
          </div>

          <div className="border-t border-slate-100 pt-2 text-[10px] text-slate-400 font-medium">
            Valor medio por pedido activo
          </div>
        </div>

        {/* KPI 4: Cumplimiento Logístico */}
        <div className="card-enterprise p-4 flex flex-col justify-between space-y-2.5">
          <div className="flex items-start justify-between">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Cumplimiento %</p>
            <div className="w-7 h-7 rounded-lg bg-teal-50 border border-teal-100 flex items-center justify-center text-teal-600 shrink-0">
              <Truck className="w-3.5 h-3.5" />
            </div>
          </div>
          <div>
            <h3 className="text-xl font-bold text-slate-900 leading-none tabular-nums">{stats.fulfillmentRate.toFixed(1)}%</h3>
            
            <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden mt-2">
              <div 
                className="bg-teal-500 h-full rounded-full transition-all duration-500" 
                style={{ width: `${Math.min(100, stats.fulfillmentRate)}%` }}
              />
            </div>
          </div>

          <div className="border-t border-slate-100 pt-2 flex justify-between items-center text-[10px] font-medium text-slate-500">
            <span>Entregados:</span>
            <span className="text-teal-700 font-semibold tabular-nums">{stats.deliveredCount} / {stats.totalOrdersCount}</span>
          </div>
        </div>

        {/* KPI 5: Tasa de Anulaciones */}
        <div className="card-enterprise p-4 flex flex-col justify-between space-y-2.5">
          <div className="flex items-start justify-between">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Cancelaciones %</p>
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
              stats.cancellationRate > 10 ? 'bg-rose-100 text-rose-700' : 'bg-rose-50 text-rose-600'
            }`}>
              <ShieldAlert className="w-3.5 h-3.5" />
            </div>
          </div>
          <div>
            <h3 className="text-xl font-bold text-slate-900 leading-none tabular-nums">{stats.cancellationRate.toFixed(1)}%</h3>
            <p className="text-[10px] font-semibold text-rose-600 mt-1 tabular-nums">
              {formatPrice(stats.cancelledBilling)}
            </p>
          </div>

          <div className="border-t border-slate-100 pt-2 flex justify-between items-center text-[10px] font-medium text-slate-500">
            <span>Anulados:</span>
            <span className="text-rose-700 font-semibold tabular-nums">{stats.cancelledCount} pedidos</span>
          </div>
        </div>

        {/* KPI 6: Rendimiento Vendedores */}
        <div className="card-enterprise p-4 flex flex-col justify-between space-y-2.5">
          <div className="flex items-start justify-between">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Vendedores</p>
            <div className="w-7 h-7 rounded-lg bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-600 shrink-0">
              <Users className="w-3.5 h-3.5" />
            </div>
          </div>
          <div>
            <h3 className="text-xl font-bold text-slate-900 leading-none tabular-nums">{stats.activeSellersCount}</h3>
            <p className="text-[10px] font-semibold text-purple-700 mt-1 tabular-nums">
              Media: {formatPrice(stats.avgSalesPerSeller)}
            </p>
          </div>

          <div className="border-t border-slate-100 pt-2 text-[10px] text-slate-400 font-medium">
            Facturación media / vendedor
          </div>
        </div>
      </div>

      {/* Interactive Sales Trend Chart (Evolución Diaria) */}
      <SalesTrendChart data={dailyTrendData} />

      {/* Weekly Evolution & WoW Performance Comparison */}
      <WeeklyComparisonChart orders={allPeriodOrders} />

      {/* Multi-Category Leaderboard Rankings (Vendedores / Clientes / Localidades) */}
      <div className="card-enterprise p-6 space-y-5">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 shadow-2xs">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 tracking-tight">
                Rankings y Líderes del Período
              </h2>
              <p className="text-xs text-slate-500 font-normal">
                Consolidado de desempeño comercial por vendedores, clientes destacados y destinos de entrega
              </p>
            </div>
          </div>

          {/* Mobile Tab Switcher */}
          <div className="flex sm:hidden items-center gap-1 bg-slate-100 p-1 rounded-2xl border border-slate-200 text-xs font-bold w-full">
            <button
              type="button"
              onClick={() => setLeaderboardTab("sellers")}
              className={`flex-1 py-1.5 rounded-xl transition-all cursor-pointer text-center ${
                leaderboardTab === "sellers" ? "bg-white text-slate-900 shadow-xs" : "text-slate-500"
              }`}
            >
              Vendedores
            </button>
            <button
              type="button"
              onClick={() => setLeaderboardTab("customers")}
              className={`flex-1 py-1.5 rounded-xl transition-all cursor-pointer text-center ${
                leaderboardTab === "customers" ? "bg-white text-slate-900 shadow-xs" : "text-slate-500"
              }`}
            >
              Clientes
            </button>
            <button
              type="button"
              onClick={() => setLeaderboardTab("localities")}
              className={`flex-1 py-1.5 rounded-xl transition-all cursor-pointer text-center ${
                leaderboardTab === "localities" ? "bg-white text-slate-900 shadow-xs" : "text-slate-500"
              }`}
            >
              Localidades
            </button>
          </div>
        </div>

        {/* 3-Column Grid for Desktop / Tabbed for Mobile */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Column 1: Top Vendedores */}
          <div className={`space-y-3 p-4 bg-slate-50/70 rounded-2xl border border-slate-100 ${leaderboardTab !== "sellers" ? "hidden md:block" : ""}`}>
            <div className="flex items-center gap-2 border-b border-slate-200/60 pb-2.5">
              <Award className="w-4 h-4 text-amber-500" />
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Vendedores Líderes
              </h3>
            </div>
            <div className="space-y-2.5">
              {topSellers.map((seller, idx) => (
                <div key={seller.id} className="flex items-center justify-between bg-white p-3 rounded-xl border border-slate-200/80 shadow-2xs">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`w-5 h-5 rounded-md font-bold text-[10px] shrink-0 flex items-center justify-center ${
                      idx === 0 ? "bg-amber-100 text-amber-800 font-black" :
                      idx === 1 ? "bg-slate-200 text-slate-800" :
                      idx === 2 ? "bg-orange-100 text-orange-800" :
                      "bg-slate-100 text-slate-600"
                    }`}>
                      {idx + 1}
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-bold text-xs text-slate-900 truncate max-w-[120px]" title={seller.name}>
                        {seller.name}
                      </h4>
                      <p className="text-[10px] text-slate-400 font-medium">
                        Vendedor #{idx + 1}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-slate-900 shrink-0 tabular-nums font-mono">
                    {formatPrice(seller.sales)}
                  </span>
                </div>
              ))}
              {topSellers.length === 0 && (
                <p className="text-xs font-medium text-slate-400 text-center py-6">
                  No hay ventas en este período.
                </p>
              )}
            </div>
          </div>

          {/* Column 2: Top Clientes */}
          <div className={`space-y-3 p-4 bg-slate-50/70 rounded-2xl border border-slate-100 ${leaderboardTab !== "customers" ? "hidden md:block" : ""}`}>
            <div className="flex items-center gap-2 border-b border-slate-200/60 pb-2.5">
              <Users className="w-4 h-4 text-brand-600" />
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Clientes Principales
              </h3>
            </div>
            <div className="space-y-2.5">
              {topCustomers.map((cust, idx) => (
                <div key={cust.name} className="flex items-center justify-between bg-white p-3 rounded-xl border border-slate-200/80 shadow-2xs">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`w-5 h-5 rounded-md font-bold text-[10px] shrink-0 flex items-center justify-center ${
                      idx === 0 ? "bg-amber-100 text-amber-800 font-black" :
                      idx === 1 ? "bg-slate-200 text-slate-800" :
                      idx === 2 ? "bg-orange-100 text-orange-800" :
                      "bg-slate-100 text-slate-600"
                    }`}>
                      {idx + 1}
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-bold text-xs text-slate-900 truncate max-w-[120px]" title={cust.name}>
                        {cust.name}
                      </h4>
                      <p className="text-[10px] text-slate-400 font-medium">
                        {cust.ordersCount} {cust.ordersCount === 1 ? "pedido" : "pedidos"}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-slate-900 shrink-0 tabular-nums font-mono">
                    {formatPrice(cust.totalSales)}
                  </span>
                </div>
              ))}
              {topCustomers.length === 0 && (
                <p className="text-xs font-medium text-slate-400 text-center py-6">
                  No hay compras en este período.
                </p>
              )}
            </div>
          </div>

          {/* Column 3: Top Localidades */}
          <div className={`space-y-3 p-4 bg-slate-50/70 rounded-2xl border border-slate-100 ${leaderboardTab !== "localities" ? "hidden md:block" : ""}`}>
            <div className="flex items-center gap-2 border-b border-slate-200/60 pb-2.5">
              <MapPin className="w-4 h-4 text-emerald-600" />
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Localidades Destacadas
              </h3>
            </div>
            <div className="space-y-2.5">
              {topLocalities.map((loc, idx) => (
                <div key={loc.locality} className="flex items-center justify-between bg-white p-3 rounded-xl border border-slate-200/80 shadow-2xs">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`w-5 h-5 rounded-md font-bold text-[10px] shrink-0 flex items-center justify-center ${
                      idx === 0 ? "bg-emerald-100 text-emerald-800 font-black" :
                      idx === 1 ? "bg-teal-100 text-teal-800" :
                      "bg-slate-100 text-slate-600"
                    }`}>
                      {idx + 1}
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-bold text-xs text-slate-900 truncate max-w-[120px]" title={loc.locality}>
                        {loc.locality}
                      </h4>
                      <p className="text-[10px] text-slate-400 font-medium">
                        {loc.ordersCount} despachos
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-slate-900 shrink-0 tabular-nums font-mono">
                    {formatPrice(loc.totalSales)}
                  </span>
                </div>
              ))}
              {topLocalities.length === 0 && (
                <p className="text-xs font-medium text-slate-400 text-center py-6">
                  No hay despachos en este período.
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-100 p-3 rounded-xl flex items-center gap-2">
          <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <p className="text-[10px] text-slate-500 font-medium">
            Cómputo consolidado en tiempo real deduplicando órdenes y excluyendo cancelaciones.
          </p>
        </div>
      </div>

      {/* Category Sales & Donut Chart */}
      <CategorySalesChart
        categories={categorySales}
        totalBillingAll={stats.deliveredBilling + stats.pendingBilling}
        totalQtyAll={totalCategoryQty}
      />

      {/* Products Sold Breakdown Table with PAGINATION */}
      <div className="card-enterprise p-6 space-y-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <ShoppingCart className="w-4 h-4 text-brand-600" />
              Productos más Vendidos en el Periodo
            </h2>
            <p className="text-xs text-slate-500 font-normal">
              Desglose detallado por producto e integración de familias
            </p>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="relative flex-1 md:w-60">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar producto o SKU..."
                value={productSearchTerm}
                onChange={(e) => setProductSearchTerm(e.target.value)}
                className="input-standard pl-8.5 py-1.5"
              />
            </div>

            <span className="text-xs bg-slate-100 text-slate-700 px-3 py-1.5 rounded-xl font-semibold shrink-0">
              {sortedProductsSold.length} Artículos
            </span>
          </div>
        </div>

        {/* Category Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1 scrollbar-none">
          <button
            type="button"
            onClick={() => setSelectedCatFilter("all")}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
              selectedCatFilter === "all"
                ? "bg-brand-600 text-white shadow-xs"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            Todas las Categorías
          </button>
          {categorySales.map((cat) => (
            <button
              key={cat.category}
              type="button"
              onClick={() => setSelectedCatFilter(cat.category)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
                selectedCatFilter === cat.category
                  ? "bg-brand-600 text-white shadow-xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {cat.category}
            </button>
          ))}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-100 text-[11px] font-semibold uppercase text-slate-400">
                <th className="py-2.5">Producto</th>
                <th className="py-2.5">SKU</th>
                <th className="py-2.5">Categoría</th>
                <th 
                  className={`py-2.5 text-center cursor-pointer select-none transition-colors hover:text-slate-800 ${
                    productSortKey === 'qty' ? 'text-brand-600 font-bold' : ''
                  }`}
                  onClick={() => setProductSortKey('qty')}
                >
                  <div className="flex items-center justify-center gap-1">
                    Unidades Vendidas
                    {productSortKey === 'qty' ? (
                      <ChevronDown className="w-3.5 h-3.5 text-brand-600 shrink-0" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 text-slate-300 shrink-0" />
                    )}
                  </div>
                </th>
                <th 
                  className={`py-2.5 text-right cursor-pointer select-none transition-colors hover:text-slate-800 ${
                    productSortKey === 'billing' ? 'text-brand-600 font-bold' : ''
                  }`}
                  onClick={() => setProductSortKey('billing')}
                >
                  <div className="flex items-center justify-end gap-1">
                    Monto Facturado
                    {productSortKey === 'billing' ? (
                      <ChevronDown className="w-3.5 h-3.5 text-brand-600 shrink-0" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 text-slate-300 shrink-0" />
                    )}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
              {paginatedProducts.map((prod, idx) => (
                <tr key={idx} className="hover:bg-slate-50/60 transition-colors">
                  <td className="py-3 font-semibold text-slate-900">{prod.name}</td>
                  <td className="py-3 font-mono text-xs text-slate-500">{prod.sku}</td>
                  <td className="py-3">
                    <span className="inline-block px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                      {prod.category}
                    </span>
                  </td>
                  <td className="py-3 text-center">
                    <span className={`inline-block px-2.5 py-0.5 border font-bold rounded-lg transition-colors tabular-nums ${
                      productSortKey === 'qty' 
                        ? 'bg-brand-50 border-brand-200 text-brand-700' 
                        : 'bg-slate-50 border-slate-200 text-slate-800'
                    }`}>
                      {prod.qty}
                    </span>
                  </td>
                  <td className={`py-3 text-right font-bold transition-colors tabular-nums ${
                    productSortKey === 'billing' ? 'text-brand-700' : 'text-slate-900'
                  }`}>
                    {formatPrice(prod.total)}
                  </td>
                </tr>
              ))}
              {paginatedProducts.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400 font-medium text-xs">
                    No se registran productos que coincidan con los filtros seleccionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {sortedProductsSold.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-100 text-xs font-semibold text-slate-600">
            <div className="flex items-center gap-3">
              <span>
                Mostrando{" "}
                <strong className="text-slate-900">
                  {(productPage - 1) * productPageSize + 1}
                </strong>{" "}
                a{" "}
                <strong className="text-slate-900">
                  {Math.min(productPage * productPageSize, sortedProductsSold.length)}
                </strong>{" "}
                de <strong className="text-slate-900">{sortedProductsSold.length}</strong> artículos
              </span>

              {/* Page Size Selector */}
              <div className="hidden sm:flex items-center gap-1.5 pl-3 border-l border-slate-200">
                <span className="text-slate-400 font-normal">Por pág:</span>
                {[10, 25, 50].map((size) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => {
                      setProductPageSize(size);
                      setProductPage(1);
                    }}
                    className={`px-2 py-0.5 rounded-lg text-xs transition-all cursor-pointer ${
                      productPageSize === size
                        ? "bg-brand-600 text-white font-bold"
                        : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>

            {/* Navigation Buttons */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setProductPage((p) => Math.max(1, p - 1))}
                disabled={productPage === 1}
                className="px-2.5 py-1 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1 shadow-2xs"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Anterior</span>
              </button>

              {/* Page Numbers */}
              <div className="flex items-center gap-1 px-1">
                {Array.from({ length: totalProductPages }, (_, i) => i + 1)
                  .filter((p) => p === 1 || p === totalProductPages || Math.abs(p - productPage) <= 1)
                  .map((p, pIdx, arr) => {
                    const prevP = arr[pIdx - 1];
                    const hasGap = prevP && p - prevP > 1;
                    return (
                      <React.Fragment key={p}>
                        {hasGap && <span className="px-1 text-slate-400">...</span>}
                        <button
                          type="button"
                          onClick={() => setProductPage(p)}
                          className={`w-7 h-7 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center ${
                            productPage === p
                              ? "bg-brand-600 text-white shadow-xs"
                              : "text-slate-600 hover:bg-slate-100"
                          }`}
                        >
                          {p}
                        </button>
                      </React.Fragment>
                    );
                  })}
              </div>

              <button
                type="button"
                onClick={() => setProductPage((p) => Math.min(totalProductPages, p + 1))}
                disabled={productPage === totalProductPages}
                className="px-2.5 py-1 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1 shadow-2xs"
              >
                <span className="hidden sm:inline">Siguiente</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Cancelled Orders Percentage & Daily Chart at the very bottom */}
      <CancelledOrdersChart
        totalOrdersCount={stats.totalOrdersCount}
        cancelledCount={stats.cancelledCount}
        deliveredCount={stats.deliveredCount}
        pendingCount={stats.pendingCount}
        totalBillingCount={stats.totalBillingCount}
        cancelledBilling={stats.cancelledBilling}
        deliveredBilling={stats.deliveredBilling}
        pendingBilling={stats.pendingBilling}
        dailyData={dailyCancelledData}
      />
    </div>
  );
}

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
  AlertCircle,
  Database,
  RefreshCw,
  ArrowUpDown,
  ChevronDown,
  Calendar,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import CategorySalesChart, { CategoryData } from "@/components/dashboard/CategorySalesChart";
import CancelledOrdersChart, { DailyCancelledData } from "@/components/dashboard/CancelledOrdersChart";

export interface TopCustomer {
  name: string;
  totalSales: number;
  ordersCount: number;
}

export default function AdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [productSortKey, setProductSortKey] = useState<'billing' | 'qty'>('billing');
  
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

  const [datePreset, setDatePreset] = useState<string>("month");
  const [customStartDate, setCustomStartDate] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  });
  const [customEndDate, setCustomEndDate] = useState<string>(getTodayDate());

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
  });
  
  const [topSellers, setTopSellers] = useState<any[]>([]);
  const [topCustomers, setTopCustomers] = useState<TopCustomer[]>([]);
  const [leaderboardTab, setLeaderboardTab] = useState<"customers" | "sellers">("customers");
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [productsSold, setProductsSold] = useState<any[]>([]);
  const [sellersList, setSellersList] = useState<any[]>([]);
  const [selectedSellerId, setSelectedSellerId] = useState<string>("all");

  const [categorySales, setCategorySales] = useState<CategoryData[]>([]);
  const [totalCategoryQty, setTotalCategoryQty] = useState<number>(0);
  const [dailyCancelledData, setDailyCancelledData] = useState<DailyCancelledData[]>([]);
  const [selectedCatFilter, setSelectedCatFilter] = useState<string>("all");

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

  const [startDate, setStartDate] = useState(getTodayDate());
  const [endDate, setEndDate] = useState(getTodayDate());
  const [presetRange, setPresetRange] = useState("hoy");

  // Custom Picker States
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [tempStartDate, setTempStartDate] = useState(startDate);
  const [tempEndDate, setTempEndDate] = useState(endDate);
  const [tempPresetRange, setTempPresetRange] = useState(presetRange);
  const [viewDate, setViewDate] = useState(new Date());
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);

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
    return day === 0 ? 6 : day - 1; // Mon=0, Tue=1, ... Sun=6
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

    let classes = "w-8 h-8 flex items-center justify-center text-xs font-bold relative transition-all cursor-pointer ";

    if (isStart && isEnd) {
      classes += "bg-brand-600 text-white rounded-lg z-10 shadow-sm";
    } else if (isStart) {
      classes += "bg-brand-600 text-white rounded-l-lg z-10 shadow-sm";
    } else if (isEnd) {
      classes += "bg-brand-600 text-white rounded-r-lg z-10 shadow-sm";
    } else if (inRange) {
      classes += "bg-brand-50 text-brand-700 rounded-none hover:bg-brand-100";
    } else if (inHoverRange) {
      classes += "bg-brand-50/60 text-brand-600 rounded-none hover:bg-brand-100";
    } else {
      classes += "text-slate-700 hover:bg-slate-100 hover:text-slate-900 rounded-lg";
    }

    if (isToday && !isStart && !isEnd) {
      classes += " border border-brand-500 text-brand-600 rounded-lg";
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

  const handlePresetChange = (preset: string) => {
    setPresetRange(preset);
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

    setStartDate(start);
    setEndDate(end);
    loadData(start, end, selectedSellerId);
  };

  const handleStartDateChange = (val: string) => {
    setStartDate(val);
    setPresetRange("personalizado");
  };

  const handleEndDateChange = (val: string) => {
    setEndDate(val);
    setPresetRange("personalizado");
  };

  const loadData = async (start: string, end: string, sellerId: string = selectedSellerId) => {
    try {
      setLoading(true);

      let recentQuery = supabase.from("orders")
        .select("id, legacy_code, customer_name, total_amount, status, created_at, order_date, seller_id")
        .order("created_at", { ascending: false })
        .limit(6);
        
      let rangeQuery = supabase.from("orders")
        .select("id, legacy_code, customer_name, total_amount, status, seller_id, order_date, created_at")
        .gte("order_date", start)
        .lte("order_date", end);

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
        itemsQuery = itemsQuery.eq("orders.seller_id", sellerId);
      }

      const [
        clientsCountRes,
        productsCountRes,
        sellersRes,
        recentOrdersRes,
        ordersInRangeRes,
        itemsRes
      ] = await Promise.all([
        supabase.from("clients").select("id", { count: "exact", head: true }),
        supabase.from("products").select("id", { count: "exact", head: true }),
        supabase.from("sellers").select("id, full_name"),
        recentQuery,
        rangeQuery,
        itemsQuery
      ]);

      if (ordersInRangeRes.error) throw ordersInRangeRes.error;
      if (sellersRes.error) throw sellersRes.error;
      if (itemsRes.error) throw itemsRes.error;

      const rawOrdersInRange = ordersInRangeRes.data || [];
      const sellers = sellersRes.data || [];
      setSellersList(sellers);

      // Deduplicate orders in range by legacy_code to prevent double counting
      const seenLegacyCodes = new Set<string>();
      const ordersInRange = rawOrdersInRange.filter(o => {
        if (o.legacy_code && String(o.legacy_code).trim() !== '') {
          const code = String(o.legacy_code).trim();
          if (seenLegacyCodes.has(code)) return false;
          seenLegacyCodes.add(code);
        }
        return true;
      });

      // Compute Sales Sum (all except Cancelado)
      const salesSum = ordersInRange
        .filter(o => o.status !== "Cancelado")
        .reduce((acc, o) => acc + (Number(o.total_amount) || 0), 0);

      // Compute breakdowns for orders count
      const deliveredCount = ordersInRange.filter(o => o.status === "Entregado").length;
      const pendingCount = ordersInRange.filter(o => ["Pendiente", "Confirmado", "Entregando"].includes(o.status)).length;
      const cancelledCount = ordersInRange.filter(o => o.status === "Cancelado").length;
      const totalOrdersCount = ordersInRange.length;

      // Compute breakdowns for billing
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

      // Compute Top Sellers for current range
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

      // Compute Top Customers for current range
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

      setTopSellers(sellersRanked);
      setTopCustomers(customersRanked);

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
      });

      setTopSellers(sellersRanked);

      // Format recent orders with seller names
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
      
      // Helper function for category classification
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

      // Pass 1: Build map of primary category per order ID
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

      // Category Breakdown Aggregation
      const catSalesMap: Record<string, {
        category: string;
        totalBilling: number;
        totalQty: number;
        productsMap: Record<string, number>;
      }> = {};

      let totalCatBillingAcc = 0;
      let totalCatQtyAcc = 0;

      // Pass 2: Aggregate product sales and category totals
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
          // Prefer explicit human SKU over auto-generated SKU
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

      // Generate Daily Cancelled Breakdown
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

    } catch (err) {
      console.error("Error loading admin dashboard stats:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(startDate, endDate);
  }, []);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-10 h-10 text-brand-600 animate-spin" />
        <p className="text-slate-500 font-bold text-xs tracking-wider uppercase">Cargando Panel de Control General...</p>
      </div>
    );
  }

  const sortedProductsSold = [...productsSold]
    .filter((p) => selectedCatFilter === "all" || p.category === selectedCatFilter)
    .sort((a, b) => {
      if (productSortKey === "qty") {
        return b.qty - a.qty;
      } else {
        return b.total - a.total;
      }
    });

  const month1Year = viewDate.getFullYear();
  const month1Month = viewDate.getMonth();
  const month1Days = renderCalendarMonth(month1Year, month1Month);

  const nextMonthDate = new Date(month1Year, month1Month + 1, 1);
  const month2Year = nextMonthDate.getFullYear();
  const month2Month = nextMonthDate.getMonth();
  const month2Days = renderCalendarMonth(month2Year, month2Month);

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Dashboard General ERP</h1>
          <p className="text-xs font-semibold text-slate-400 mt-1">
            Panel de administración y estadísticas consolidadas del sistema de operaciones.
          </p>
        </div>
               {/* Filters */}
        <div className="bg-white p-3 rounded-2xl border border-slate-200/60 shadow-sm flex flex-col md:flex-row items-stretch md:items-end gap-3 w-full md:w-auto">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="space-y-1 min-w-[140px]">
              <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none">Vendedor</label>
              <select
                value={selectedSellerId}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedSellerId(val);
                  loadData(startDate, endDate, val);
                }}
                className="w-full px-3 py-1.5 rounded-lg border border-slate-200 font-bold text-xs bg-slate-50 text-slate-700 focus:outline-none focus:ring-1 focus:ring-brand-500 cursor-pointer"
              >
                <option value="all">Todos los Vendedores</option>
                {sellersList.map(s => (
                  <option key={s.id} value={s.id}>{s.full_name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1 relative min-w-[240px]">
              <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none">Período de Ventas</label>
              <button
                type="button"
                onClick={() => setIsPickerOpen(!isPickerOpen)}
                className="w-full px-3 py-1.5 rounded-lg border border-slate-200 font-bold text-xs bg-slate-50 text-slate-700 hover:bg-slate-100/60 transition-all flex items-center justify-between gap-3 cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 text-[11px]"><Calendar className="w-3.5 h-3.5" /></span>
                  <span>{getRangeLabel()}</span>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {isPickerOpen && (
                <>
                  {/* Backdrop overlay */}
                  <div className="fixed inset-0 z-40" onClick={() => setIsPickerOpen(false)} />
                  
                  {/* Floating Panel */}
                  <div className="absolute right-0 top-full mt-2 z-50 bg-white border border-slate-200/80 rounded-2xl shadow-2xl flex flex-col md:flex-row overflow-hidden w-full max-w-[95vw] md:max-w-none md:w-[650px] animate-in fade-in slide-in-from-top-2 duration-150">
                    {/* Left presets bar */}
                    <div className="w-full md:w-[160px] border-b md:border-b-0 md:border-r border-slate-100 p-3 flex flex-row md:flex-col overflow-x-auto md:overflow-x-visible gap-1 shrink-0 bg-slate-50/60">
                      {PRESETS.map((p) => {
                        const active = tempPresetRange === p.id;
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => handleTempPresetChange(p.id)}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-bold text-xs whitespace-nowrap text-left transition-all w-full ${
                              active 
                                ? "bg-brand-50 text-brand-700" 
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
                      {/* Calendars header navigation */}
                      <div className="flex items-center justify-between mb-3 border-b border-slate-50 pb-2">
                        <button
                          type="button"
                          onClick={prevMonth}
                          className="p-1 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                          Seleccionar Período
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
                        {/* Month 1 */}
                        <div className="flex-1">
                          <div className="text-center font-black text-xs text-slate-700 mb-3">
                            {formatMonthHeader(viewDate)}
                          </div>
                          <div className="grid grid-cols-7 gap-y-1 gap-x-1 text-center">
                            {DAY_NAMES.map(d => (
                              <span key={d} className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1">{d}</span>
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

                        {/* Month 2 */}
                        <div className="flex-1 hidden md:block">
                          <div className="text-center font-black text-xs text-slate-700 mb-3">
                            {formatMonthHeader(nextMonthDate)}
                          </div>
                          <div className="grid grid-cols-7 gap-y-1 gap-x-1 text-center">
                            {DAY_NAMES.map(d => (
                              <span key={d} className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1">{d}</span>
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
                        <div className="flex items-center gap-1.5">
                          <input 
                            type="checkbox" 
                            id="compare-dates" 
                            className="rounded border-slate-300 text-brand-600 focus:ring-brand-500 h-3.5 w-3.5 cursor-pointer"
                          />
                          <label htmlFor="compare-dates" className="text-[9px] font-black text-slate-400 uppercase tracking-widest cursor-pointer select-none">
                            Comparar
                          </label>
                        </div>

                        <div className="flex items-center gap-2">
                          {/* Date inputs overlay wrapper */}
                          <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-xl px-2 py-1 relative">
                            {/* Desde */}
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
                              <div className="text-center font-bold text-[10px] text-slate-700 py-0.5 select-none">
                                {tempStartDate ? formatInputDisplay(tempStartDate) : "Desde"}
                              </div>
                            </div>
                            
                            <span className="text-slate-400 font-bold text-xs">-</span>
                            
                            {/* Hasta */}
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
                              <div className="text-center font-bold text-[10px] text-slate-700 py-0.5 select-none">
                                {tempEndDate ? formatInputDisplay(tempEndDate) : "Hasta"}
                              </div>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => setIsPickerOpen(false)}
                            className="px-2.5 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
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
                            className="px-3.5 py-1.5 text-xs font-black text-white bg-brand-600 hover:bg-brand-700 rounded-xl shadow-sm transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                          >
                            Actualizar
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

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm flex items-start justify-between min-h-[120px]">
          <div className="space-y-1">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Facturación Total (Rango)</p>
            <h3 className="text-xl font-black text-slate-900 leading-none">{formatPrice(stats.monthlySales)}</h3>
            
            <div className="flex flex-col gap-1 mt-2.5">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                <span className="text-[9px] font-bold text-slate-500 tracking-wide uppercase leading-none">
                  {formatPrice(stats.deliveredBilling)} <span className="text-[8px] text-slate-400 font-extrabold ml-0.5">({formatPct(stats.deliveredBilling, stats.totalBillingCount)})</span> Entregados
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                <span className="text-[9px] font-bold text-slate-500 tracking-wide uppercase leading-none">
                  {formatPrice(stats.pendingBilling)} <span className="text-[8px] text-slate-400 font-extrabold ml-0.5">({formatPct(stats.pendingBilling, stats.totalBillingCount)})</span> Pendientes
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                <span className="text-[9px] font-bold text-slate-500 tracking-wide uppercase leading-none">
                  {formatPrice(stats.cancelledBilling)} <span className="text-[8px] text-slate-400 font-extrabold ml-0.5">({formatPct(stats.cancelledBilling, stats.totalBillingCount)})</span> Anulados
                </span>
              </div>
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0 self-start">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm flex items-start justify-between min-h-[120px]">
          <div className="space-y-1">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Pedidos en Rango</p>
            <h3 className="text-xl font-black text-slate-900 leading-none">{stats.totalOrdersCount}</h3>
            
            <div className="flex flex-col gap-1 mt-2.5">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                <span className="text-[9px] font-bold text-slate-500 tracking-wide uppercase leading-none">
                  {stats.deliveredCount} <span className="text-[8px] text-slate-400 font-extrabold ml-0.5">({formatPct(stats.deliveredCount, stats.totalOrdersCount)})</span> Entregados
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                <span className="text-[9px] font-bold text-slate-500 tracking-wide uppercase leading-none">
                  {stats.pendingCount} <span className="text-[8px] text-slate-400 font-extrabold ml-0.5">({formatPct(stats.pendingCount, stats.totalOrdersCount)})</span> Pendientes
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                <span className="text-[9px] font-bold text-slate-500 tracking-wide uppercase leading-none">
                  {stats.cancelledCount} <span className="text-[8px] text-slate-400 font-extrabold ml-0.5">({formatPct(stats.cancelledCount, stats.totalOrdersCount)})</span> Anulados
                </span>
              </div>
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 shrink-0 self-start">
            <Package className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm flex items-center justify-between">
          <div className="space-y-1.5">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Clientes Registrados</p>
            <h3 className="text-xl font-black text-slate-900">{stats.totalClients}</h3>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Base de clientes única</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600 shrink-0">
            <Users className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm flex items-center justify-between">
          <div className="space-y-1.5">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Productos en Catálogo</p>
            <h3 className="text-xl font-black text-slate-900">{stats.totalProducts}</h3>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Artículos registrados</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center text-orange-600 shrink-0">
            <Database className="w-5 h-5" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Orders List */}
        <div className="lg:col-span-2 bg-white p-6 rounded-3xl border border-slate-200/60 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-sm font-black text-slate-800 uppercase tracking-wider">Últimos Pedidos Cargados</h2>
            <Link href="/vendedores/pedidos">
              <span className="text-[10px] font-black text-brand-600 hover:text-brand-800 uppercase tracking-widest flex items-center gap-0.5 cursor-pointer">
                Ver Gestión Pedidos <ArrowUpRight className="w-3.5 h-3.5" />
              </span>
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-100 text-[10px] font-black uppercase text-slate-400">
                  <th className="py-2.5">Código</th>
                  <th className="py-2.5">Cliente</th>
                  <th className="py-2.5">Vendedor</th>
                  <th className="py-2.5 text-right">Monto</th>
                  <th className="py-2.5 text-center">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-semibold text-slate-700">
                {recentOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-slate-50/40">
                    <td className="py-3 font-bold text-brand-600 uppercase tracking-wider">
                      {order.legacy_code || "SIN REF"}
                    </td>
                    <td className="py-3 font-bold text-slate-900 truncate max-w-[150px]" title={order.customer_name}>
                      {order.customer_name}
                    </td>
                    <td className="py-3 text-slate-500 font-medium truncate max-w-[100px]" title={order.sellerName}>
                      {order.sellerName}
                    </td>
                    <td className="py-3 text-right font-bold text-slate-900">
                      {formatPrice(order.total_amount)}
                    </td>
                    <td className="py-3 text-center">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                        order.status === "Entregado" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" :
                        order.status === "Cancelado" ? "bg-red-50 text-red-700 border border-red-200" :
                        order.status === "Entregando" ? "bg-amber-50 text-amber-700 border border-amber-200" :
                        "bg-blue-50 text-blue-700 border border-blue-200"
                      }`}>
                        {order.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {recentOrders.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400 font-bold">
                      No hay pedidos registrados en el sistema.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Leaderboard Card: Clientes Principales & Vendedores Líderes */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200/60 shadow-sm flex flex-col justify-between">
          <div>
            {/* Tab Selector Header */}
            <div className="flex items-center justify-between gap-2 mb-4 border-b border-slate-100 pb-3">
              <button
                type="button"
                onClick={() => setLeaderboardTab("customers")}
                className={`flex items-center gap-1.5 text-xs font-black uppercase tracking-wider pb-1 transition-all cursor-pointer border-b-2 ${
                  leaderboardTab === "customers"
                    ? "text-brand-700 border-brand-600"
                    : "text-slate-400 border-transparent hover:text-slate-700"
                }`}
              >
                <Users className="w-4 h-4 text-brand-600" />
                Clientes Principales
              </button>

              <button
                type="button"
                onClick={() => setLeaderboardTab("sellers")}
                className={`flex items-center gap-1.5 text-xs font-black uppercase tracking-wider pb-1 transition-all cursor-pointer border-b-2 ${
                  leaderboardTab === "sellers"
                    ? "text-brand-700 border-brand-600"
                    : "text-slate-400 border-transparent hover:text-slate-700"
                }`}
              >
                <Award className="w-4 h-4 text-amber-500" />
                Vendedores Líderes
              </button>
            </div>

            {/* Content */}
            {leaderboardTab === "customers" ? (
              <div className="space-y-4">
                {topCustomers.map((cust, idx) => (
                  <div key={cust.name} className="flex items-center justify-between border-b border-slate-50 pb-3 last:border-b-0 last:pb-0">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-6 h-6 rounded-md font-black text-xs shrink-0 flex items-center justify-center ${
                        idx === 0 ? "bg-amber-100 text-amber-800" :
                        idx === 1 ? "bg-slate-200 text-slate-800" :
                        idx === 2 ? "bg-orange-100 text-orange-800" :
                        "bg-slate-100 text-slate-500"
                      }`}>
                        {idx + 1}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-bold text-xs text-slate-900 truncate max-w-[140px]" title={cust.name}>
                          {cust.name}
                        </h3>
                        <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">
                          {cust.ordersCount} {cust.ordersCount === 1 ? "Pedido" : "Pedidos"} en el periodo
                        </p>
                      </div>
                    </div>
                    <span className="text-xs font-black text-slate-900 shrink-0">
                      {formatPrice(cust.totalSales)}
                    </span>
                  </div>
                ))}
                {topCustomers.length === 0 && (
                  <p className="text-xs font-bold text-slate-400 text-center py-8">
                    No hay compras registradas en este periodo.
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {topSellers.map((seller, idx) => (
                  <div key={seller.id} className="flex items-center justify-between border-b border-slate-50 pb-3 last:border-b-0 last:pb-0">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-6 h-6 rounded-md font-black text-xs shrink-0 flex items-center justify-center ${
                        idx === 0 ? "bg-amber-100 text-amber-800" :
                        idx === 1 ? "bg-slate-200 text-slate-800" :
                        idx === 2 ? "bg-orange-100 text-orange-800" :
                        "bg-slate-100 text-slate-500"
                      }`}>
                        {idx + 1}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-bold text-xs text-slate-900 truncate max-w-[140px]" title={seller.name}>
                          {seller.name}
                        </h3>
                        <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">
                          Ventas del Periodo
                        </p>
                      </div>
                    </div>
                    <span className="text-xs font-black text-slate-900 shrink-0">
                      {formatPrice(seller.sales)}
                    </span>
                  </div>
                ))}
                {topSellers.length === 0 && (
                  <p className="text-xs font-bold text-slate-400 text-center py-8">
                    No hay ventas registradas en este periodo.
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl flex items-start gap-2.5 mt-4">
            <Clock className="w-4.5 h-4.5 text-slate-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-[10px] text-slate-500 uppercase tracking-wider">Corte Estadístico</p>
              <p className="text-[10px] font-semibold text-slate-400 leading-snug mt-0.5">
                Las estadísticas computan pedidos registrados en el periodo, deduplicando códigos y excluyendo cancelados.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Category Sales & Donut Chart */}
      <CategorySalesChart
        categories={categorySales}
        totalBillingAll={stats.deliveredBilling + stats.pendingBilling}
        totalQtyAll={totalCategoryQty}
      />

      {/* Products Sold Breakdown */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200/60 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <h2 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
              <ShoppingCart className="w-4.5 h-4.5 text-brand-600" />
              Productos más Vendidos en el Periodo
            </h2>
            <p className="text-[11px] font-semibold text-slate-400 mt-0.5">
              Desglose detallado por producto e integración de categorías
            </p>
          </div>
          <span className="text-[10px] bg-brand-50 border border-brand-100 text-brand-700 px-2 py-0.5 rounded-full font-black uppercase tracking-wider">
            {sortedProductsSold.length} Productos
          </span>
        </div>

        {/* Category Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1 scrollbar-none">
          <button
            type="button"
            onClick={() => setSelectedCatFilter("all")}
            className={`px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap cursor-pointer ${
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
              className={`px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap cursor-pointer ${
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
              <tr className="border-b border-slate-100 text-[10px] font-black uppercase text-slate-400">
                <th className="py-2.5">Producto</th>
                <th className="py-2.5">SKU</th>
                <th className="py-2.5">Categoría</th>
                <th 
                  className={`py-2.5 text-center cursor-pointer select-none transition-colors hover:text-slate-800 ${
                    productSortKey === 'qty' ? 'text-brand-600 font-extrabold' : ''
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
                    productSortKey === 'billing' ? 'text-brand-600 font-extrabold' : ''
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
            <tbody className="divide-y divide-slate-100 text-xs font-semibold text-slate-700">
              {sortedProductsSold.map((prod, idx) => (
                <tr key={idx} className="hover:bg-slate-50/40">
                  <td className="py-3 font-bold text-slate-900">{prod.name}</td>
                  <td className="py-3 font-mono text-[10px] text-slate-500 uppercase">{prod.sku}</td>
                  <td className="py-3">
                    <span className="inline-block px-2.5 py-0.5 rounded-md text-[9px] font-extrabold uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-200">
                      {prod.category}
                    </span>
                  </td>
                  <td className="py-3 text-center">
                    <span className={`inline-block px-3 py-1 border font-extrabold rounded-lg transition-colors ${
                      productSortKey === 'qty' 
                        ? 'bg-brand-50 border-brand-200 text-brand-700' 
                        : 'bg-slate-50 border-slate-100 text-slate-800'
                    }`}>
                      {prod.qty}
                    </span>
                  </td>
                  <td className={`py-3 text-right font-black transition-colors ${
                    productSortKey === 'billing' ? 'text-brand-700' : 'text-slate-900'
                  }`}>
                    {formatPrice(prod.total)}
                  </td>
                </tr>
              ))}
              {sortedProductsSold.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400 font-bold">
                    No se registran ventas de productos para la categoría seleccionada en este periodo.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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

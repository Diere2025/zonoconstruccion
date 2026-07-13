"use client";

import React, { useEffect, useState } from "react";
import { formatPrice } from "@/lib/utils";
import { 
  TrendingUp, 
  Loader2, 
  AlertCircle,
  ArrowUpDown,
  ChevronDown,
  Calendar,
  ChevronLeft,
  ChevronRight,
  TrendingDown,
  Info,
  Download
} from "lucide-react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

interface Seller {
  id: string;
  full_name: string;
}

interface ProductMargin {
  sku: string;
  name: string;
  qty: number;
  revenue: number;
  cost: number;
  marginVal: number;
  marginPct: number;
}

interface MissingCostOrder {
  itemId: string;
  orderId: string;
  orderCode: string;
  orderDate: string;
  customerName: string;
  sellerName: string;
  channel: string;
  productName: string;
  productSku: string;
  productId: string | null;
  qty: number;
  unitPrice: number;
  subtotal: number;
}

interface MissingCatalogProduct {
  id: string;
  name: string;
  sku: string;
  price: number;
  suppliersCount: number;
}

interface DbPriceListItem {
  sku: string | null;
  final_cost: number | string | null;
  price_lists: {
    supplier_id: string;
    is_active: boolean;
  } | null;
}

interface DbRelation {
  product_id: string;
  supplier_id: string;
  is_primary: boolean;
}

interface DbOrderItem {
  id: string;
  order_id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  historical_unit_cost: number | null;
  products: {
    id: string;
    sku: string | null;
    name: string;
    price: number;
  } | null;
  orders: {
    id: string;
    legacy_code: string | null;
    customer_name: string;
    order_date: string;
    status: string;
    seller_id: string | null;
    channel: string;
  } | null;
}

interface DbCatalogProduct {
  id: string;
  sku: string | null;
  name: string;
  price: number;
  is_active: boolean;
}

export default function RentabilidadDashboard() {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'products' | 'missing-orders' | 'missing-catalog'>('products');
  const [productSortKey, setProductSortKey] = useState<'margin_pct' | 'margin_val' | 'billing' | 'qty'>('margin_val');
  const [productSortOrder, setProductSortOrder] = useState<'asc' | 'desc'>('desc');

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
    const start = new Date(d.setDate(diff));
    const year = start.getFullYear();
    const month = String(start.getMonth() + 1).padStart(2, '0');
    const dateVal = String(start.getDate()).padStart(2, '0');
    return `${year}-${month}-${dateVal}`;
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

  const formatPctValue = (value: number) => {
    return `${value.toFixed(1)}%`;
  };

  // Initial Range state set to current month (for better overview of profitability data)
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

  // State values for calculation
  const [sellersList, setSellersList] = useState<Seller[]>([]);
  const [selectedSellerId, setSelectedSellerId] = useState<string>("all");
  const [selectedChannel, setSelectedChannel] = useState<string>("all");

  const [metrics, setMetrics] = useState({
    totalRevenue: 0,
    totalCost: 0,
    totalMarginVal: 0,
    totalMarginPct: 0,
    missingCostItemsCount: 0,
    missingCostOrdersCount: 0,
    totalActiveOrdersCount: 0,
  });

  const [productsMarginList, setProductsMarginList] = useState<ProductMargin[]>([]);
  const [missingCostOrdersList, setMissingCostOrdersList] = useState<MissingCostOrder[]>([]);
  const [missingCatalogProductsList, setMissingCatalogProductsList] = useState<MissingCatalogProduct[]>([]);

  const loadData = async (
    start: string, 
    end: string, 
    sellerId: string = selectedSellerId, 
    channel: string = selectedChannel
  ) => {
    try {
      setLoading(true);

      // 1. Fetch reference lists (sellers, products, relations, and active price list costs)
      const [sellersRes, allProductsRes, relationsRes, activeCostItemsRes] = await Promise.all([
        supabase.from("sellers").select("id, full_name"),
        supabase.from("products").select("id, sku, name, price, is_active").eq("is_active", true),
        supabase.from("product_supplier_relations").select("product_id, supplier_id, is_primary"),
        supabase.from("price_list_items").select("sku, final_cost, price_lists!inner(supplier_id, is_active)").eq("price_lists.is_active", true)
      ]);

      if (sellersRes.error) throw sellersRes.error;
      if (allProductsRes.error) throw allProductsRes.error;
      if (relationsRes.error) throw relationsRes.error;
      if (activeCostItemsRes.error) throw activeCostItemsRes.error;

      const sellers = sellersRes.data || [];
      setSellersList(sellers);
      const activeCatalogProducts = allProductsRes.data || [];
      const relations = relationsRes.data || [];
      const activeCostItems = activeCostItemsRes.data || [];

      // 2. Fetch order items for the given period (excluding cancelled ones) with pagination
      let orderItems: DbOrderItem[] = [];
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        let itemsQuery = supabase
          .from("order_items")
          .select(`
            id,
            order_id,
            product_id,
            product_name,
            quantity,
            unit_price,
            historical_unit_cost,
            products (
              id,
              sku,
              name,
              price
            ),
            orders!inner (
              id,
              legacy_code,
              customer_name,
              order_date,
              status,
              seller_id,
              channel
            )
          `)
          .neq("orders.status", "Cancelado")
          .gte("orders.order_date", start)
          .lte("orders.order_date", end)
          .range(page * pageSize, (page + 1) * pageSize - 1);

        if (sellerId !== "all") {
          itemsQuery = itemsQuery.eq("orders.seller_id", sellerId);
        }
        if (channel !== "all") {
          itemsQuery = itemsQuery.eq("orders.channel", channel);
        }

        const itemsRes = await itemsQuery;
        if (itemsRes.error) throw itemsRes.error;

        const fetchedItems = (itemsRes.data || []) as unknown as DbOrderItem[];
        orderItems = [...orderItems, ...fetchedItems];

        if (fetchedItems.length < pageSize) {
          hasMore = false;
        } else {
          page++;
        }
      }

      // 3. Build Cost Maps in Memory
      // Mapping Active Price List Cost Items: sku -> Map(supplierId -> final_cost)
      const priceListCostMap = new Map<string, Map<string, number>>();
      (activeCostItems as unknown as DbPriceListItem[]).forEach((item) => {
        const sku = (item.sku || "").trim().toLowerCase();
        const supId = item.price_lists?.supplier_id;
        const cost = Number(item.final_cost) || 0;
        if (sku && supId) {
          if (!priceListCostMap.has(sku)) {
            priceListCostMap.set(sku, new Map());
          }
          priceListCostMap.get(sku)!.set(supId, cost);
        }
      });

      // Mapping Product Supplier Relations: product_id -> { primarySupplierId, allSuppliers }
      const relationsMap = new Map<string, { primarySupplierId?: string; allSuppliers: string[] }>();
      (relations as unknown as DbRelation[]).forEach((r) => {
        const pid = r.product_id;
        const sid = r.supplier_id;
        const isPrimary = r.is_primary;
        if (!relationsMap.has(pid)) {
          relationsMap.set(pid, { allSuppliers: [] });
        }
        const val = relationsMap.get(pid)!;
        val.allSuppliers.push(sid);
        if (isPrimary) {
          val.primarySupplierId = sid;
        }
      });

      // Fallback helper to resolve current catalog cost for a product
      const getCatalogCost = (pId: string | null, sku: string): number => {
        if (!sku) return 0;
        const cleanSku = sku.trim().toLowerCase();
        const costBySupplier = priceListCostMap.get(cleanSku);
        if (!costBySupplier) return 0;

        if (pId) {
          const suppliers = relationsMap.get(pId);
          if (suppliers) {
            // A. Check primary supplier
            if (suppliers.primarySupplierId && costBySupplier.has(suppliers.primarySupplierId)) {
              return costBySupplier.get(suppliers.primarySupplierId)!;
            }
            // B. Check any related supplier
            for (const sid of suppliers.allSuppliers) {
              if (costBySupplier.has(sid)) {
                return costBySupplier.get(sid)!;
              }
            }
          }
        }
        // C. General fallback: return any valid cost recorded for this SKU in active lists
        for (const c of costBySupplier.values()) {
          if (c > 0) return c;
        }
        return 0;
      };

      // 4. Compute Margins and Identify Anomalies
      let totalRevenue = 0;
      let totalCost = 0;
      const missingCostOrdersGroup = new Set<string>();
      const missingOrdersTemp: MissingCostOrder[] = [];
      const productStatsMap: Record<string, {
        sku: string;
        name: string;
        qty: number;
        revenue: number;
        cost: number;
      }> = {};

      (orderItems as unknown as DbOrderItem[]).forEach((item) => {
        const order = item.orders;
        if (!order) return;

        const qty = Number(item.quantity) || 0;
        const priceSold = Number(item.unit_price) || 0;
        const itemRevenue = qty * priceSold;

        // Resolve cost (historical or catalog fallback)
        let resolvedUnitCost = Number(item.historical_unit_cost) || 0;

        const resolvedSku = (item.products?.sku || item.product_name || "").trim();

        if (resolvedUnitCost <= 0) {
          resolvedUnitCost = getCatalogCost(item.product_id, resolvedSku);
        }

        const itemCost = qty * resolvedUnitCost;
        const isDiscount = priceSold < 0 || 
                           (item.product_name || "").toLowerCase().includes("descuento") || 
                           (item.products?.sku || "").toLowerCase().includes("descuento");
        const isCostMissing = resolvedUnitCost <= 0 && !isDiscount;

        totalRevenue += itemRevenue;
        totalCost += itemCost;

        // Group by product
        const prodSku = item.products?.sku || (item.product_name && priceListCostMap.has(item.product_name.trim().toLowerCase()) ? item.product_name.trim() : "SIN SKU");
        const prodKey = prodSku !== "SIN SKU" ? prodSku : item.product_name;
        if (!productStatsMap[prodKey]) {
          productStatsMap[prodKey] = {
            sku: prodSku,
            name: item.product_name,
            qty: 0,
            revenue: 0,
            cost: 0
          };
        }
        productStatsMap[prodKey].qty += qty;
        productStatsMap[prodKey].revenue += itemRevenue;
        productStatsMap[prodKey].cost += itemCost;

        if (isCostMissing) {
          missingCostOrdersGroup.add(order.id);
          const sellerName = sellers.find(s => s.id === order.seller_id)?.full_name || "Desconocido";
          missingOrdersTemp.push({
            itemId: item.id,
            orderId: order.id,
            orderCode: order.legacy_code || "Sin Código",
            orderDate: order.order_date,
            customerName: order.customer_name,
            sellerName,
            channel: order.channel,
            productName: item.product_name,
            productSku: prodSku,
            productId: item.product_id,
            qty,
            unitPrice: priceSold,
            subtotal: itemRevenue
          });
        }
      });

      // Calculate missing active catalog products
      const missingCatalogTemp: MissingCatalogProduct[] = [];
      (activeCatalogProducts as unknown as DbCatalogProduct[]).forEach((p) => {
        const isDiscount = (p.sku || "").toLowerCase().includes("descuento") || 
                           (p.name || "").toLowerCase().includes("descuento") ||
                           (Number(p.price) || 0) < 0;
        if (isDiscount) return;

        const catalogCost = getCatalogCost(p.id, p.sku || "");
        if (catalogCost <= 0) {
          // Retrieve related supplier name(s)
          const relatedSupplierIds = relationsMap.get(p.id)?.allSuppliers || [];
          missingCatalogTemp.push({
            id: p.id,
            name: p.name,
            sku: p.sku || "SIN SKU",
            price: Number(p.price) || 0,
            suppliersCount: relatedSupplierIds.length
          });
        }
      });

      // Compute final products list with profitability metrics
      const productsMargin = Object.values(productStatsMap).map(p => {
        const marginVal = p.revenue - p.cost;
        const marginPct = p.revenue > 0 ? (marginVal / p.revenue) * 100 : 0;
        return {
          ...p,
          marginVal,
          marginPct
        };
      });

      const uniqueActiveOrdersCount = new Set(orderItems.map(item => item.order_id)).size;
      const totalMarginVal = totalRevenue - totalCost;
      const totalMarginPct = totalRevenue > 0 ? (totalMarginVal / totalRevenue) * 100 : 0;

      setMetrics({
        totalRevenue,
        totalCost,
        totalMarginVal,
        totalMarginPct,
        missingCostItemsCount: missingOrdersTemp.length,
        missingCostOrdersCount: missingCostOrdersGroup.size,
        totalActiveOrdersCount: uniqueActiveOrdersCount,
      });

      setProductsMarginList(productsMargin);
      setMissingCostOrdersList(missingOrdersTemp);
      setMissingCatalogProductsList(missingCatalogTemp);

    } catch (err) {
      console.error("Error loading profitability metrics:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(startDate, endDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDaySelectAndReload = (start: string, end: string, range: string) => {
    setStartDate(start);
    setEndDate(end);
    setPresetRange(range);
    loadData(start, end, selectedSellerId, selectedChannel);
    setIsPickerOpen(false);
  };

  const handleExportMissingCostsCSV = () => {
    if (missingCostOrdersList.length === 0) return;

    const headers = [
      "Pedido",
      "Fecha",
      "Cliente",
      "Vendedor",
      "Canal",
      "SKU",
      "Producto",
      "Cantidad",
      "Precio Venta",
      "Subtotal"
    ];

    const rows = missingCostOrdersList.map(item => [
      item.orderCode,
      new Date(item.orderDate).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }),
      item.customerName,
      item.sellerName,
      item.channel,
      item.productSku,
      item.productName,
      item.qty.toString(),
      item.unitPrice.toFixed(2),
      item.subtotal.toFixed(2)
    ]);

    const csvContent = [
      headers.join(";"),
      ...rows.map(row => row.map(val => `"${(val || "").replace(/"/g, '""')}"`).join(";"))
    ].join("\n");

    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `pedidos_sin_costos_${startDate}_al_${endDate}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportMissingCatalogCSV = () => {
    if (missingCatalogProductsList.length === 0) return;

    const headers = [
      "SKU",
      "Nombre del Producto",
      "Precio Venta",
      "Cantidad Proveedores"
    ];

    const rows = missingCatalogProductsList.map(p => [
      p.sku,
      p.name,
      p.price.toFixed(2),
      p.suppliersCount.toString()
    ]);

    const csvContent = [
      headers.join(";"),
      ...rows.map(row => row.map(val => `"${(val || "").replace(/"/g, '""')}"`).join(";"))
    ].join("\n");

    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `catalogo_sin_costos_${getTodayDate()}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Sorting function for products margin list
  const sortedProductsMarginList = [...productsMarginList].sort((a, b) => {
    const factor = productSortOrder === 'asc' ? 1 : -1;
    if (productSortKey === 'qty') return (a.qty - b.qty) * factor;
    if (productSortKey === 'billing') return (a.revenue - b.revenue) * factor;
    if (productSortKey === 'margin_val') return (a.marginVal - b.marginVal) * factor;
    return (a.marginPct - b.marginPct) * factor;
  });

  const toggleSort = (key: 'margin_pct' | 'margin_val' | 'billing' | 'qty') => {
    if (productSortKey === key) {
      setProductSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setProductSortKey(key);
      setProductSortOrder('desc');
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-10 h-10 text-brand-600 animate-spin" />
        <p className="text-slate-500 font-bold text-xs tracking-wider uppercase">Analizando rentabilidad y costos...</p>
      </div>
    );
  }

  const month1Year = viewDate.getFullYear();
  const month1Month = viewDate.getMonth();
  const month1Days = renderCalendarMonth(month1Year, month1Month);

  const nextMonthDate = new Date(month1Year, month1Month + 1, 1);
  const month2Year = nextMonthDate.getFullYear();
  const month2Month = nextMonthDate.getMonth();
  const month2Days = renderCalendarMonth(month2Year, month2Month);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Rentabilidad y Margen de Contribución</h1>
          <p className="text-xs font-semibold text-slate-400 mt-1">
            Análisis de costos y márgenes de ganancia basado en los precios de venta y los costos de catálogo o históricos.
          </p>
        </div>

        {/* Global Dashboard Filters */}
        <div className="bg-white p-3 rounded-2xl border border-slate-200/60 shadow-sm flex flex-wrap items-stretch md:items-end gap-3 w-full md:w-auto">
          {/* Seller Filter */}
          <div className="space-y-1 min-w-[130px]">
            <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none">Vendedor</label>
            <select
              value={selectedSellerId}
              onChange={(e) => {
                const val = e.target.value;
                setSelectedSellerId(val);
                loadData(startDate, endDate, val, selectedChannel);
              }}
              className="w-full px-3 py-1.5 rounded-lg border border-slate-200 font-bold text-xs bg-slate-50 text-slate-700 focus:outline-none focus:ring-1 focus:ring-brand-500 cursor-pointer"
            >
              <option value="all">Todos los Vendedores</option>
              {sellersList.map(s => (
                <option key={s.id} value={s.id}>{s.full_name}</option>
              ))}
            </select>
          </div>

          {/* Sales Channel Filter */}
          <div className="space-y-1 min-w-[130px]">
            <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none">Canal de Venta</label>
            <select
              value={selectedChannel}
              onChange={(e) => {
                const val = e.target.value;
                setSelectedChannel(val);
                loadData(startDate, endDate, selectedSellerId, val);
              }}
              className="w-full px-3 py-1.5 rounded-lg border border-slate-200 font-bold text-xs bg-slate-50 text-slate-700 focus:outline-none focus:ring-1 focus:ring-brand-500 cursor-pointer"
            >
              <option value="all">Todos los Canales</option>
              <option value="web_organica">Web Orgánica</option>
              <option value="mostrador_minorista">Mostrador Minorista</option>
              <option value="mayorista">Mayorista</option>
            </select>
          </div>

          {/* Date Picker Button */}
          <div className="space-y-1 relative min-w-[240px]">
            <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none">Período Seleccionado</label>
            <button
              type="button"
              onClick={() => setIsPickerOpen(!isPickerOpen)}
              className="w-full px-3 py-1.5 rounded-lg border border-slate-200 font-bold text-xs bg-slate-50 text-slate-700 hover:bg-slate-100/60 transition-all flex items-center justify-between gap-3 cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>{getRangeLabel()}</span>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {isPickerOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsPickerOpen(false)} />
                <div className="absolute right-0 top-full mt-2 z-50 bg-white border border-slate-200/80 rounded-2xl shadow-2xl flex flex-col md:flex-row overflow-hidden w-full max-w-[95vw] md:max-w-none md:w-[650px] animate-in fade-in slide-in-from-top-2 duration-150">
                  {/* Presets Column */}
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

                  {/* Calendars Column */}
                  <div className="flex-1 p-4 md:p-5 flex flex-col justify-between min-w-0 bg-white">
                    <div className="flex items-center justify-between mb-3 border-b border-slate-50 pb-2">
                      <button
                        type="button"
                        onClick={prevMonth}
                        className="p-1 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        Rango de Análisis
                      </span>
                      <button
                        type="button"
                        onClick={nextMonth}
                        className="p-1 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>

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

                    {/* Actions bar inside picker */}
                    <div className="flex items-center justify-end border-t border-slate-100 pt-4 mt-4 gap-2">
                      <button
                        type="button"
                        onClick={() => setIsPickerOpen(false)}
                        className="px-3 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        disabled={!tempStartDate || !tempEndDate}
                        onClick={() => handleDaySelectAndReload(tempStartDate, tempEndDate, tempPresetRange)}
                        className="px-4 py-1.5 text-xs font-black text-white bg-brand-600 hover:bg-brand-700 rounded-xl shadow-sm transition-all cursor-pointer disabled:opacity-50"
                      >
                        Aplicar
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI: Revenue */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200/60 shadow-sm flex flex-col justify-between min-h-[120px]">
          <div>
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Volumen Vendido (Facturación)</span>
            <span className="text-2xl font-black text-slate-900 leading-none">{formatPrice(metrics.totalRevenue)}</span>
          </div>
          <div className="text-[10px] text-slate-500 font-bold mt-2">
            Basado en {metrics.totalActiveOrdersCount} pedidos procesados.
          </div>
        </div>

        {/* KPI: Cost */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200/60 shadow-sm flex flex-col justify-between min-h-[120px]">
          <div>
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Costo de Mercadería</span>
            <div className="flex items-baseline gap-1.5 flex-wrap">
              <span className="text-2xl font-black text-slate-900 leading-none">{formatPrice(metrics.totalCost)}</span>
              <span className="text-xs font-bold text-slate-400">
                ({formatPctValue(metrics.totalRevenue > 0 ? (metrics.totalCost / metrics.totalRevenue) * 100 : 0)})
              </span>
            </div>
          </div>
          <div className="text-[10px] text-slate-500 font-bold mt-2 flex items-center gap-1">
            {metrics.missingCostItemsCount > 0 ? (
              <span className="text-amber-600 font-extrabold flex items-center gap-0.5">
                <AlertCircle className="w-3.5 h-3.5" /> {metrics.missingCostItemsCount} ítems no tienen costo definido.
              </span>
            ) : (
              <span className="text-emerald-600">✅ 100% de los costos definidos.</span>
            )}
          </div>
        </div>

        {/* KPI: Margen ARS */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200/60 shadow-sm flex flex-col justify-between min-h-[120px]">
          <div>
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Contribución Marginal ($)</span>
            <span className="text-2xl font-black text-slate-900 leading-none">{formatPrice(metrics.totalMarginVal)}</span>
          </div>
          <div className="mt-2">
            <span className={`text-xs font-black inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full ${
              metrics.totalMarginVal >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
            }`}>
              {metrics.totalMarginVal >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
              {formatPrice(metrics.totalMarginVal)}
            </span>
          </div>
        </div>

        {/* KPI: Margen % */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200/60 shadow-sm flex flex-col justify-between min-h-[120px]">
          <div>
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Margen de Rentabilidad (%)</span>
            <span className="text-2xl font-black text-slate-900 leading-none">{formatPctValue(metrics.totalMarginPct)}</span>
          </div>
          <div className="mt-2">
            <div className="w-full bg-slate-100 rounded-full h-1.5">
              <div 
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  metrics.totalMarginPct > 35 ? "bg-emerald-500" : metrics.totalMarginPct > 15 ? "bg-brand-500" : "bg-amber-500"
                }`}
                style={{ width: `${Math.min(Math.max(metrics.totalMarginPct, 0), 100)}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Main Container Alerts */}
      {metrics.missingCostOrdersCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-3xl p-5 flex items-start gap-4">
          <AlertCircle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="text-sm font-black text-amber-950">Atención: Existen pedidos con rentabilidad indeterminada</h4>
            <p className="text-xs text-amber-900/80 leading-relaxed font-semibold">
              Hay **{metrics.missingCostOrdersCount} pedidos** ({metrics.missingCostItemsCount} productos vendidos) dentro de este rango que contienen productos sin costo asignado. El margen calculado anteriormente los evalúa con costo $0, por lo que la rentabilidad mostrada puede ser artificialmente alta.
            </p>
            <div className="pt-2">
              <button 
                onClick={() => setActiveTab('missing-orders')}
                className="text-[10px] font-black uppercase tracking-wider text-amber-700 hover:text-amber-900 bg-amber-100/60 hover:bg-amber-100 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
              >
                Visualizar Pedidos Afectados ➔
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tabs Selection Navigation */}
      <div className="bg-white p-2 rounded-2xl border border-slate-200/60 shadow-sm flex gap-2">
        <button
          onClick={() => setActiveTab('products')}
          className={`flex-1 py-3 px-4 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
            activeTab === 'products' 
              ? "bg-slate-900 text-white shadow-sm" 
              : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
          }`}
        >
          Contribución por Producto
        </button>
        <button
          onClick={() => setActiveTab('missing-orders')}
          className={`flex-1 py-3 px-4 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer relative ${
            activeTab === 'missing-orders' 
              ? "bg-slate-900 text-white shadow-sm" 
              : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
          }`}
        >
          Pedidos sin Costos ({metrics.missingCostOrdersCount})
          {metrics.missingCostOrdersCount > 0 && (
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-500 rounded-full animate-ping" />
          )}
        </button>
        <button
          onClick={() => setActiveTab('missing-catalog')}
          className={`flex-1 py-3 px-4 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
            activeTab === 'missing-catalog' 
              ? "bg-slate-900 text-white shadow-sm" 
              : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
          }`}
        >
          Catálogo sin Costos ({missingCatalogProductsList.length})
        </button>
      </div>

      {/* Tab Contents */}
      <div className="bg-white rounded-3xl border border-slate-200/60 shadow-sm overflow-hidden">
        
        {/* TAB 1: Product margins contribution list */}
        {activeTab === 'products' && (
          <div className="p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-md font-black text-slate-800 uppercase tracking-wider">Contribución de Ventas por Producto</h3>
              <span className="text-xs text-slate-400 font-bold">Total productos vendidos: {productsMarginList.length}</span>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400 font-black uppercase tracking-wider">
                    <th className="py-3.5 px-4">SKU / Producto</th>
                    <th className="py-3.5 px-4 text-center cursor-pointer select-none hover:text-slate-700" onClick={() => toggleSort('qty')}>
                      Cant. Vendida <ArrowUpDown className="inline w-3 h-3 ml-0.5" />
                    </th>
                    <th className="py-3.5 px-4 text-right cursor-pointer select-none hover:text-slate-700" onClick={() => toggleSort('billing')}>
                      Facturación Total <ArrowUpDown className="inline w-3 h-3 ml-0.5" />
                    </th>
                    <th className="py-3.5 px-4 text-right cursor-pointer select-none hover:text-slate-700" onClick={() => toggleSort('margin_val')}>
                      Costo Total <ArrowUpDown className="inline w-3 h-3 ml-0.5" />
                    </th>
                    <th className="py-3.5 px-4 text-right cursor-pointer select-none hover:text-slate-700" onClick={() => toggleSort('margin_val')}>
                      Margen ($) <ArrowUpDown className="inline w-3 h-3 ml-0.5" />
                    </th>
                    <th className="py-3.5 px-4 text-right cursor-pointer select-none hover:text-slate-700" onClick={() => toggleSort('margin_pct')}>
                      Margen (%) <ArrowUpDown className="inline w-3 h-3 ml-0.5" />
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                  {sortedProductsMarginList.map((p, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-4 px-4">
                        <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">{p.sku}</span>
                        <span className="block text-sm font-extrabold text-slate-800 truncate max-w-md" title={p.name}>{p.name}</span>
                      </td>
                      <td className="py-4 px-4 text-center text-slate-900 font-bold">{p.qty} u.</td>
                      <td className="py-4 px-4 text-right text-slate-900 font-bold">{formatPrice(p.revenue)}</td>
                      <td className="py-4 px-4 text-right text-slate-500">{formatPrice(p.cost)}</td>
                      <td className="py-4 px-4 text-right">
                        <span className={`font-bold ${p.marginVal >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                          {formatPrice(p.marginVal)}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-right">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full font-black text-[10px] uppercase tracking-wider ${
                          p.marginPct > 35 
                            ? "bg-emerald-50 text-emerald-600" 
                            : p.marginPct > 15 
                              ? "bg-brand-50 text-brand-600" 
                              : p.marginPct >= 0 
                                ? "bg-amber-50 text-amber-600" 
                                : "bg-red-50 text-red-600"
                        }`}>
                          {formatPctValue(p.marginPct)}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {sortedProductsMarginList.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400 font-bold">
                        No hay ventas registradas en el período seleccionado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 2: Orders with missing costs list */}
        {activeTab === 'missing-orders' && (
          <div className="p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
              <div>
                <h3 className="text-md font-black text-slate-800 uppercase tracking-wider">Pedidos Afectados por Costos Faltantes</h3>
                <p className="text-xs text-slate-400 mt-1 font-semibold">
                  Muestra las ventas cuyo costo unitario se resolvió en $0 debido a la ausencia de costos históricos y de catálogo.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {missingCostOrdersList.length > 0 && (
                  <button
                    onClick={handleExportMissingCostsCSV}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-50 text-brand-700 hover:bg-brand-100 border border-brand-100 text-xs font-black rounded-xl transition-colors cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Exportar CSV
                  </button>
                )}
                <span className="bg-amber-50 text-amber-700 text-xs font-black px-3 py-1.5 rounded-xl border border-amber-100 whitespace-nowrap">
                  Pedidos afectados: {metrics.missingCostOrdersCount}
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400 font-black uppercase tracking-wider">
                    <th className="py-3.5 px-4">Pedido / Fecha</th>
                    <th className="py-3.5 px-4">Cliente / Vendedor</th>
                    <th className="py-3.5 px-4">Canal</th>
                    <th className="py-3.5 px-4">Producto sin Costo</th>
                    <th className="py-3.5 px-4 text-center">Cant.</th>
                    <th className="py-3.5 px-4 text-right">Precio Venta</th>
                    <th className="py-3.5 px-4 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                  {missingCostOrdersList.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-4 px-4 whitespace-nowrap">
                        <span className="block text-sm font-black text-brand-600 hover:text-brand-800 transition-colors">
                          {item.orderCode}
                        </span>
                        <span className="block text-[10px] text-slate-400 font-bold">{new Date(item.orderDate).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
                      </td>
                      <td className="py-4 px-4">
                        <span className="block text-slate-800 font-extrabold">{item.customerName}</span>
                        <span className="block text-[10px] text-slate-400 font-bold">Vendedor: {item.sellerName}</span>
                      </td>
                      <td className="py-4 px-4 whitespace-nowrap">
                        <span className="inline-block px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-slate-100 text-slate-600">
                          {item.channel}
                        </span>
                      </td>
                      <td className="py-4 px-4">
                        <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">{item.productSku}</span>
                        <span className="block text-sm font-extrabold text-slate-800 truncate max-w-xs">{item.productName}</span>
                      </td>
                      <td className="py-4 px-4 text-center text-slate-900 font-bold">{item.qty}</td>
                      <td className="py-4 px-4 text-right text-slate-900 font-bold">{formatPrice(item.unitPrice)}</td>
                      <td className="py-4 px-4 text-right whitespace-nowrap">
                        <Link 
                          href="/admin/compras?tab=new_purchase"
                          className="inline-flex text-[10px] font-black text-brand-600 hover:text-brand-800 uppercase tracking-widest border-b border-brand-200 cursor-pointer"
                        >
                          Cargar Costo (ERP)
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {missingCostOrdersList.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400 font-bold">
                        ¡Felicitaciones! Todos los pedidos tienen sus costos de mercadería asociados en este período.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: Products missing from catalog costs */}
        {activeTab === 'missing-catalog' && (
          <div className="p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
              <div>
                <h3 className="text-md font-black text-slate-800 uppercase tracking-wider">Productos Activos sin Costo en Catálogo</h3>
                <p className="text-xs text-slate-400 mt-1 font-semibold">
                  Auditoría de catálogo: Muestra los productos actualmente activos en tienda que no tienen costos de proveedor cargados en el sistema ERP.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {missingCatalogProductsList.length > 0 && (
                  <button
                    onClick={handleExportMissingCatalogCSV}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-50 text-brand-700 hover:bg-brand-100 border border-brand-100 text-xs font-black rounded-xl transition-colors cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Exportar CSV
                  </button>
                )}
                <span className="bg-red-50 text-red-700 text-xs font-black px-3 py-1.5 rounded-xl border border-red-100 whitespace-nowrap">
                  Productos sin costo: {missingCatalogProductsList.length}
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400 font-black uppercase tracking-wider">
                    <th className="py-3.5 px-4">SKU</th>
                    <th className="py-3.5 px-4">Nombre del Producto</th>
                    <th className="py-3.5 px-4 text-right">Precio de Venta</th>
                    <th className="py-3.5 px-4 text-center">Proveedores Asociados</th>
                    <th className="py-3.5 px-4 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                  {missingCatalogProductsList.map((p, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-4 px-4 font-black text-slate-500 whitespace-nowrap">{p.sku}</td>
                      <td className="py-4 px-4">
                        <span className="block text-sm font-extrabold text-slate-800 truncate max-w-md">{p.name}</span>
                      </td>
                      <td className="py-4 px-4 text-right text-slate-900 font-bold">{formatPrice(p.price)}</td>
                      <td className="py-4 px-4 text-center">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                          p.suppliersCount > 0 ? "bg-slate-100 text-slate-600" : "bg-red-50 text-red-600"
                        }`}>
                          {p.suppliersCount > 0 ? `${p.suppliersCount} proveedor(es)` : "Sin Proveedor"}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-right whitespace-nowrap">
                        <Link 
                          href="/admin/compras?tab=new_purchase"
                          className="inline-flex text-[10px] font-black text-brand-600 hover:text-brand-800 uppercase tracking-widest border-b border-brand-200 cursor-pointer"
                        >
                          Cargar en Lista ➔
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {missingCatalogProductsList.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400 font-bold">
                        ¡Increíble! El 100% de tus productos activos tienen costos cargados en sus listas de proveedores.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>

      {/* Informative Footer Card */}
      <div className="bg-slate-950 p-6 rounded-[2rem] border border-slate-900 shadow-xl flex items-start gap-4 text-white">
        <Info className="w-6 h-6 text-brand-400 shrink-0 mt-0.5" />
        <div className="space-y-2">
          <h4 className="text-sm font-black uppercase tracking-wider text-brand-400">¿Cómo se calcula el Margen de Contribución?</h4>
          <p className="text-xs text-slate-300 leading-relaxed font-semibold">
            El sistema calcula la rentabilidad restando el costo del producto del precio de venta facturado. Para determinar el costo unitario de cada producto vendido, el sistema sigue dos niveles de resolución:
          </p>
          <ul className="text-xs text-slate-300 leading-relaxed font-semibold list-decimal list-inside space-y-1.5 pl-2">
            <li>
              <strong className="text-white">Costo Histórico de Venta:</strong> Se intenta utilizar el valor exacto de `historical_unit_cost` guardado en el detalle del pedido. Esto preserva el margen real aunque los costos de lista del proveedor cambien en el futuro.
            </li>
            <li>
              <strong className="text-white">Costo de Catálogo (Fallback):</strong> Si el histórico es 0 o inexistente (por ejemplo, pedidos importados de planillas legacy), el sistema busca en tiempo real el costo final calculado (`final_cost`) en la lista de precios activa del proveedor primario asignado a ese producto.
            </li>
          </ul>
          <p className="text-[10px] text-slate-500 font-bold pt-2">
            Nota: Si ambos valores resultan en 0, el artículo se marca como &quot;Costo Faltante&quot; y puede ser corregido cargando su respectiva factura de compra o actualizando las listas de proveedores en el módulo de compras del ERP.
          </p>
        </div>
      </div>
    </div>
  );
}

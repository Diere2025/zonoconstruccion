"use client";

import React, { useEffect, useState, useMemo } from "react";
import { 
  PackageCheck, 
  Calendar, 
  DollarSign, 
  ShoppingBag, 
  AlertTriangle, 
  Clock, 
  Search, 
  Download, 
  Filter, 
  RefreshCw, 
  Loader2, 
  ChevronDown, 
  ChevronUp, 
  CheckCircle2, 
  Truck, 
  Users, 
  Layers, 
  TrendingUp, 
  MapPin,
  ArrowUpDown,
  FileSpreadsheet,
  AlertCircle,
  XCircle,
  History
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatPrice } from "@/lib/utils";

interface OrderRecord {
  id: string;
  order_date: string;
  initial_delivery_date: string;
  max_delivery_date: string;
  customer_name: string;
  locality: string;
  address: string;
  total_amount: number;
  status: string; // Order status: Pendiente, Confirmado, Entregando, Entregado, Cancelado, Anulado
  category?: string;
  seller_id?: string;
  client_id?: string;
  sellers?: {
    full_name: string;
    email?: string;
  };
  clients?: {
    is_wholesale?: boolean;
    business_name?: string;
  };
  deliveries?: {
    status: string;
    delivery_date: string;
    carrier_id?: string;
  }[];
  order_items: {
    id: string;
    product_id: string;
    product_name: string;
    quantity: number;
    unit_price: number;
    subtotal: number;
    products?: {
      category: string;
    };
  }[];
}

export default function PendingDeliveryBillingPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orders, setOrders] = useState<OrderRecord[]>([]);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [statusViewFilter, setStatusViewFilter] = useState<'pending_only' | 'delivered_only' | 'cancelled_only' | 'all'>('pending_only');
  const [dateRangePreset, setDateRangePreset] = useState<'all' | 'overdue' | 'today' | 'next7' | 'next30' | 'custom'>('all');
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedSeller, setSelectedSeller] = useState<string>("all");
  const [selectedLogisticsStatus, setSelectedLogisticsStatus] = useState<string>("all");
  
  // UI Tabs & Table sorting
  const [activeTab, setActiveTab] = useState<'overview' | 'date' | 'category' | 'seller' | 'logistics' | 'table'>('overview');
  const [dateGrouping, setDateGrouping] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [sortField, setSortField] = useState<'date' | 'amount' | 'customer'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  const [cronogramaView, setCronogramaView] = useState<'chart' | 'list'>('chart');

  // Compact price formatter for bar chart badges
  const formatCompactPrice = (num: number) => {
    if (num >= 1000000) return `$${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `$${(num / 1000).toFixed(0)}k`;
    return `$${Math.round(num)}`;
  };

  // Helper date formatted YYYY-MM-DD
  const getTodayStr = () => {
    const d = new Date();
    return d.toISOString().split("T")[0];
  };

  const fetchOrdersData = async () => {
    setRefreshing(true);
    setError(null);
    try {
      const [ordersRes, productsRes] = await Promise.all([
        supabase
          .from("orders")
          .select(`
            *,
            sellers ( full_name, email ),
            clients ( is_wholesale ),
            deliveries ( status, delivery_date, carrier_id ),
            order_items ( id, product_id, product_name, quantity, unit_price, subtotal )
          `)
          .order("order_date", { ascending: false }),
        supabase.from("products").select("id, category")
      ]);

      if (ordersRes.error) throw ordersRes.error;

      const productsMap = new Map((productsRes.data || []).map((p: any) => [p.id, p]));

      const mergedOrders: OrderRecord[] = (ordersRes.data || []).map((o: any) => {
        const rawItems = o.order_items || [];
        const enrichedItems = rawItems.map((item: any) => {
          const prod = item.product_id ? productsMap.get(item.product_id) : null;
          return {
            ...item,
            subtotal: item.subtotal || (Number(item.unit_price || 0) * Number(item.quantity || 0)),
            products: prod ? { category: prod.category } : undefined
          };
        });

        return {
          ...o,
          order_items: enrichedItems
        };
      });

      setOrders(mergedOrders);
    } catch (err: any) {
      console.error("Error fetching delivery billing data:", err);
      setError(err.message || "Error al cargar la información de pedidos.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchOrdersData();
  }, []);

  // Compute effective target delivery date for an order
  const getEffectiveDeliveryDate = (order: OrderRecord): string => {
    if (order.deliveries && order.deliveries.length > 0 && order.deliveries[0].delivery_date) {
      return order.deliveries[0].delivery_date;
    }
    return order.initial_delivery_date || order.order_date || getTodayStr();
  };

  // Helper to categorize order status into standard buckets
  const getStatusCategory = (statusStr: string): 'pending' | 'delivered' | 'cancelled' => {
    const s = (statusStr || "").toLowerCase();
    if (s === "entregado" || s === "completado") return 'delivered';
    if (s === "cancelado" || s === "anulado" || s === "rechazado") return 'cancelled';
    return 'pending';
  };

  // Compute effective product category for an item or order
  const getItemCategory = (item: any, orderCat?: string): string => {
    if (item.products?.category) return item.products.category;
    const name = (item.product_name || "").toLowerCase();
    if (name.includes("aquafort") || name.includes("tanque")) return "Tanques de Agua";
    if (name.includes("biofort") || name.includes("biodigestor")) return "Biodigestores";
    if (name.includes("meps") || name.includes("equilibrio")) return "MEPS";
    if (name.includes("escalera")) return "Escaleras";
    if (orderCat) return orderCat;
    return "Otros / Sin Categoría";
  };

  // Filtered orders list
  const filteredOrders = useMemo(() => {
    const today = getTodayStr();

    return orders.filter(order => {
      const deliveryDate = getEffectiveDeliveryDate(order);
      const statusCat = getStatusCategory(order.status);

      // Status View Filter
      if (statusViewFilter === 'pending_only' && statusCat !== 'pending') return false;
      if (statusViewFilter === 'delivered_only' && statusCat !== 'delivered') return false;
      if (statusViewFilter === 'cancelled_only' && statusCat !== 'cancelled') return false;

      // Search text
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const customerMatch = (order.customer_name || "").toLowerCase().includes(q);
        const codeMatch = (order.id || "").toLowerCase().includes(q);
        const localityMatch = (order.locality || "").toLowerCase().includes(q);
        const sellerMatch = (order.sellers?.full_name || "").toLowerCase().includes(q);
        const itemMatch = order.order_items?.some(i => i.product_name.toLowerCase().includes(q));
        if (!customerMatch && !codeMatch && !localityMatch && !sellerMatch && !itemMatch) {
          return false;
        }
      }

      // Date Range Preset
      if (dateRangePreset === 'overdue') {
        if (deliveryDate >= today || statusCat === 'delivered') return false;
      } else if (dateRangePreset === 'today') {
        if (deliveryDate !== today) return false;
      } else if (dateRangePreset === 'next7') {
        const next7 = new Date();
        next7.setDate(next7.getDate() + 7);
        const next7Str = next7.toISOString().split("T")[0];
        if (deliveryDate < today || deliveryDate > next7Str) return false;
      } else if (dateRangePreset === 'next30') {
        const next30 = new Date();
        next30.setDate(next30.getDate() + 30);
        const next30Str = next30.toISOString().split("T")[0];
        if (deliveryDate < today || deliveryDate > next30Str) return false;
      } else if (dateRangePreset === 'custom') {
        if (customStartDate && deliveryDate < customStartDate) return false;
        if (customEndDate && deliveryDate > customEndDate) return false;
      }

      // Seller filter
      if (selectedSeller !== "all") {
        if (order.seller_id !== selectedSeller && order.sellers?.full_name !== selectedSeller) {
          return false;
        }
      }

      // Logistics Status filter
      if (selectedLogisticsStatus !== "all") {
        const delStatus = order.deliveries?.[0]?.status || "pendiente_ruteo";
        if (delStatus !== selectedLogisticsStatus) return false;
      }

      // Category filter
      if (selectedCategory !== "all") {
        const hasCategory = order.order_items?.some(item => getItemCategory(item, order.category) === selectedCategory) ||
          order.category === selectedCategory;
        if (!hasCategory) return false;
      }

      return true;
    }).sort((a, b) => {
      if (sortField === 'date') {
        const dateA = getEffectiveDeliveryDate(a);
        const dateB = getEffectiveDeliveryDate(b);
        return sortOrder === 'asc' ? dateA.localeCompare(dateB) : dateB.localeCompare(dateA);
      } else if (sortField === 'amount') {
        return sortOrder === 'asc' ? a.total_amount - b.total_amount : b.total_amount - a.total_amount;
      } else if (sortField === 'customer') {
        return sortOrder === 'asc' 
          ? a.customer_name.localeCompare(b.customer_name)
          : b.customer_name.localeCompare(a.customer_name);
      }
      return 0;
    });
  }, [orders, statusViewFilter, searchQuery, dateRangePreset, customStartDate, customEndDate, selectedCategory, selectedSeller, selectedLogisticsStatus, sortField, sortOrder]);

  // Overall Metrics Aggregations (Historical & Current selection)
  const stats = useMemo(() => {
    const today = getTodayStr();
    
    let totalSelectionAmount = 0;
    let pendingAmount = 0;
    let pendingCount = 0;
    let deliveredAmount = 0;
    let deliveredCount = 0;
    let cancelledAmount = 0;
    let cancelledCount = 0;
    let overdueCount = 0;
    let overdueAmount = 0;
    let todayCount = 0;
    let todayAmount = 0;
    let totalItemsCount = 0;

    filteredOrders.forEach(o => {
      const amt = Number(o.total_amount || 0);
      const statusCat = getStatusCategory(o.status);
      totalSelectionAmount += amt;

      if (statusCat === 'pending') {
        pendingAmount += amt;
        pendingCount++;
        const dDate = getEffectiveDeliveryDate(o);
        if (dDate < today) {
          overdueCount++;
          overdueAmount += amt;
        } else if (dDate === today) {
          todayCount++;
          todayAmount += amt;
        }
      } else if (statusCat === 'delivered') {
        deliveredAmount += amt;
        deliveredCount++;
      } else if (statusCat === 'cancelled') {
        cancelledAmount += amt;
        cancelledCount++;
      }

      o.order_items?.forEach(item => {
        totalItemsCount += Number(item.quantity || 0);
      });
    });

    const totalOrdersCount = filteredOrders.length;
    const avgTicket = totalOrdersCount > 0 ? totalSelectionAmount / totalOrdersCount : 0;

    return {
      totalSelectionAmount,
      totalOrdersCount,
      pendingAmount,
      pendingCount,
      deliveredAmount,
      deliveredCount,
      cancelledAmount,
      cancelledCount,
      avgTicket,
      overdueCount,
      overdueAmount,
      todayCount,
      todayAmount,
      totalItemsCount
    };
  }, [filteredOrders]);

  // Unique Sellers List for dropdown filter
  const sellersList = useMemo(() => {
    const map = new Map<string, string>();
    orders.forEach(o => {
      if (o.seller_id && o.sellers?.full_name) {
        map.set(o.seller_id, o.sellers.full_name);
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [orders]);

  // Breakdown by Category
  const categoryBreakdown = useMemo(() => {
    const map = new Map<string, { category: string; amount: number; qty: number; pendingAmt: number; deliveredAmt: number; count: Set<string> }>();

    filteredOrders.forEach(order => {
      const orderItems = order.order_items || [];
      const statusCat = getStatusCategory(order.status);
      
      if (orderItems.length > 0) {
        orderItems.forEach(item => {
          const cat = getItemCategory(item, order.category);
          const subtotal = Number(item.subtotal || (item.unit_price * item.quantity) || 0);
          const qty = Number(item.quantity || 0);

          if (!map.has(cat)) {
            map.set(cat, { category: cat, amount: 0, qty: 0, pendingAmt: 0, deliveredAmt: 0, count: new Set() });
          }
          const curr = map.get(cat)!;
          curr.amount += subtotal;
          curr.qty += qty;
          if (statusCat === 'pending') curr.pendingAmt += subtotal;
          if (statusCat === 'delivered') curr.deliveredAmt += subtotal;
          curr.count.add(order.id);
        });
      } else {
        const cat = order.category || "Otros / Sin Categoría";
        const amt = Number(order.total_amount || 0);
        if (!map.has(cat)) {
          map.set(cat, { category: cat, amount: 0, qty: 0, pendingAmt: 0, deliveredAmt: 0, count: new Set() });
        }
        const curr = map.get(cat)!;
        curr.amount += amt;
        if (statusCat === 'pending') curr.pendingAmt += amt;
        if (statusCat === 'delivered') curr.deliveredAmt += amt;
        curr.count.add(order.id);
      }
    });

    return Array.from(map.values())
      .map(item => ({
        category: item.category,
        amount: item.amount,
        qty: item.qty,
        pendingAmt: item.pendingAmt,
        deliveredAmt: item.deliveredAmt,
        ordersCount: item.count.size,
        percentage: stats.totalSelectionAmount > 0 ? (item.amount / stats.totalSelectionAmount) * 100 : 0
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [filteredOrders, stats.totalSelectionAmount]);

  // Breakdown by Delivery Date (Timeline - Smart Bucketing)
  const dateBreakdown = useMemo(() => {
    const todayStr = getTodayStr();
    const todayObj = new Date(todayStr + "T00:00:00");

    const groupsMap = new Map<string, {
      date: string;
      label: string;
      subLabel: string;
      type: 'overdue_15_plus' | 'overdue_8_to_15' | 'overdue_1_to_7' | 'today' | 'upcoming_day' | 'future_7_plus';
      amount: number;
      pendingAmount: number;
      deliveredAmount: number;
      count: number;
      overdue: boolean;
      sortOrder: number;
    }>();

    // Pre-seed default bucket entries
    groupsMap.set('overdue_15_plus', {
      date: 'overdue_15_plus',
      label: '+15d Vencido',
      subLabel: 'Hace +15 días',
      type: 'overdue_15_plus',
      amount: 0, pendingAmount: 0, deliveredAmount: 0, count: 0, overdue: true,
      sortOrder: 1
    });

    groupsMap.set('overdue_8_to_15', {
      date: 'overdue_8_to_15',
      label: '8-15d Vencido',
      subLabel: 'Hace 8 a 15 días',
      type: 'overdue_8_to_15',
      amount: 0, pendingAmount: 0, deliveredAmount: 0, count: 0, overdue: true,
      sortOrder: 2
    });

    groupsMap.set('overdue_1_to_7', {
      date: 'overdue_1_to_7',
      label: '1-7d Vencido',
      subLabel: 'Hace 1 a 7 días',
      type: 'overdue_1_to_7',
      amount: 0, pendingAmount: 0, deliveredAmount: 0, count: 0, overdue: true,
      sortOrder: 3
    });

    groupsMap.set('today', {
      date: todayStr,
      label: 'HOY',
      subLabel: 'Fecha de Hoy',
      type: 'today',
      amount: 0, pendingAmount: 0, deliveredAmount: 0, count: 0, overdue: false,
      sortOrder: 4
    });

    groupsMap.set('future_7_plus', {
      date: 'future_7_plus',
      label: '+1 Semana',
      subLabel: 'En +7 días',
      type: 'future_7_plus',
      amount: 0, pendingAmount: 0, deliveredAmount: 0, count: 0, overdue: false,
      sortOrder: 999
    });

    filteredOrders.forEach(order => {
      const dDateStr = getEffectiveDeliveryDate(order);
      const statusCat = getStatusCategory(order.status);
      const amt = Number(order.total_amount || 0);

      if (dateGrouping === 'weekly' || dateGrouping === 'monthly') {
        let key = dDateStr;
        if (dateGrouping === 'weekly') {
          const d = new Date(dDateStr + "T00:00:00");
          const firstDayOfYear = new Date(d.getFullYear(), 0, 1);
          const pastDaysOfYear = (d.getTime() - firstDayOfYear.getTime()) / 86400000;
          const weekNum = Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
          key = `Semana ${weekNum} (${d.getFullYear()})`;
        } else {
          const parts = dDateStr.split("-");
          if (parts.length >= 2) key = `${parts[0]}-${parts[1]}`;
        }
        if (!groupsMap.has(key)) {
          groupsMap.set(key, {
            date: key, label: key, subLabel: '', type: 'upcoming_day',
            amount: 0, pendingAmount: 0, deliveredAmount: 0, count: 0, overdue: false, sortOrder: 50
          });
        }
        const curr = groupsMap.get(key)!;
        curr.amount += amt;
        if (statusCat === 'pending') curr.pendingAmount += amt;
        if (statusCat === 'delivered') curr.deliveredAmount += amt;
        curr.count += 1;
        return;
      }

      // Smart daily grouping by diffDays
      const dDateObj = new Date(dDateStr + "T00:00:00");
      const diffMs = dDateObj.getTime() - todayObj.getTime();
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

      let key = "";
      if (diffDays <= -16) {
        key = 'overdue_15_plus';
      } else if (diffDays >= -15 && diffDays <= -8) {
        key = 'overdue_8_to_15';
      } else if (diffDays >= -7 && diffDays <= -1) {
        key = 'overdue_1_to_7';
      } else if (diffDays === 0) {
        key = 'today';
      } else if (diffDays >= 1 && diffDays <= 7) {
        key = `day_${dDateStr}`;
        if (!groupsMap.has(key)) {
          const parts = dDateStr.split('-');
          const shortLabel = parts.length === 3 ? `${parts[2]}/${parts[1]}` : dDateStr;
          groupsMap.set(key, {
            date: dDateStr,
            label: shortLabel,
            subLabel: `En ${diffDays}d`,
            type: 'upcoming_day',
            amount: 0, pendingAmount: 0, deliveredAmount: 0, count: 0, overdue: false,
            sortOrder: 10 + diffDays
          });
        }
      } else {
        key = 'future_7_plus';
      }

      const curr = groupsMap.get(key)!;
      curr.amount += amt;
      if (statusCat === 'pending') curr.pendingAmount += amt;
      if (statusCat === 'delivered') curr.deliveredAmount += amt;
      curr.count += 1;
    });

    return Array.from(groupsMap.values())
      .filter(g => g.count > 0)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [filteredOrders, dateGrouping]);

  // Breakdown by Seller
  const sellerBreakdown = useMemo(() => {
    const map = new Map<string, { seller: string; amount: number; pendingAmt: number; deliveredAmt: number; count: number }>();

    filteredOrders.forEach(order => {
      const sellerName = order.sellers?.full_name || "Vendedor Sin Asignar";
      const amt = Number(order.total_amount || 0);
      const statusCat = getStatusCategory(order.status);

      if (!map.has(sellerName)) {
        map.set(sellerName, { seller: sellerName, amount: 0, pendingAmt: 0, deliveredAmt: 0, count: 0 });
      }
      const curr = map.get(sellerName)!;
      curr.amount += amt;
      if (statusCat === 'pending') curr.pendingAmt += amt;
      if (statusCat === 'delivered') curr.deliveredAmt += amt;
      curr.count += 1;
    });

    return Array.from(map.values()).sort((a, b) => b.amount - a.amount);
  }, [filteredOrders]);

  // Breakdown by Logistics Status
  const logisticsStatusBreakdown = useMemo(() => {
    const map = new Map<string, { label: string; amount: number; count: number; color: string }>();
    
    const statuses = [
      { key: 'pendiente_ruteo', label: 'Pendiente de Ruteo', color: 'bg-amber-500' },
      { key: 'ruteado', label: 'Ruteado / Programado', color: 'bg-blue-500' },
      { key: 'en_recorrido', label: 'En Recorrido', color: 'bg-indigo-500' },
      { key: 'entregado', label: 'Entregado / Completado', color: 'bg-emerald-500' },
      { key: 'fallido', label: 'Entrega Fallida / Reprogramar', color: 'bg-rose-500' }
    ];

    statuses.forEach(s => {
      map.set(s.key, { label: s.label, amount: 0, count: 0, color: s.color });
    });

    filteredOrders.forEach(order => {
      const delStatus = order.deliveries?.[0]?.status || (getStatusCategory(order.status) === 'delivered' ? 'entregado' : 'pendiente_ruteo');
      if (map.has(delStatus)) {
        const curr = map.get(delStatus)!;
        curr.amount += Number(order.total_amount || 0);
        curr.count += 1;
      } else {
        const fallback = 'pendiente_ruteo';
        const curr = map.get(fallback)!;
        curr.amount += Number(order.total_amount || 0);
        curr.count += 1;
      }
    });

    return Array.from(map.values());
  }, [filteredOrders]);

  const toggleExpandOrder = (id: string) => {
    setExpandedOrders(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Export to CSV
  const handleExportCSV = () => {
    if (filteredOrders.length === 0) return;

    const headers = [
      "ID Pedido",
      "Fecha Pedido",
      "Fecha Entrega Est.",
      "Cliente",
      "Localidad",
      "Direccion",
      "Vendedor",
      "Monto Total ($ ARS)",
      "Estado Pedido (ERP)",
      "Estado Logistica",
      "Categorias Items"
    ];

    const rows = filteredOrders.map(o => {
      const delStatus = o.deliveries?.[0]?.status || (getStatusCategory(o.status) === 'delivered' ? 'entregado' : 'pendiente_ruteo');
      const itemCats = Array.from(new Set(o.order_items?.map(i => getItemCategory(i, o.category)) || [])).join(" | ");

      return [
        `"${o.id.substring(0, 8)}"`,
        `"${o.order_date || ''}"`,
        `"${getEffectiveDeliveryDate(o)}"`,
        `"${(o.customer_name || '').replace(/"/g, '""')}"`,
        `"${(o.locality || '').replace(/"/g, '""')}"`,
        `"${(o.address || '').replace(/"/g, '""')}"`,
        `"${(o.sellers?.full_name || 'N/A').replace(/"/g, '""')}"`,
        o.total_amount || 0,
        `"${o.status}"`,
        `"${delStatus}"`,
        `"${itemCats}"`
      ].join(",");
    });

    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + [headers.join(","), ...rows].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Reporte_Facturacion_Entregas_${getTodayStr()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[450px] gap-3">
        <Loader2 className="w-10 h-10 text-brand-600 animate-spin" />
        <span className="text-sm font-bold text-slate-500 uppercase tracking-wider animate-pulse">
          Cargando facturación e histórico de entregas...
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="bg-rose-50 border border-rose-100 p-6 rounded-2xl flex flex-col items-center text-center gap-3">
          <AlertCircle className="w-10 h-10 text-rose-500" />
          <h2 className="text-base font-black text-rose-950 uppercase tracking-wider">Error de Carga</h2>
          <p className="text-xs font-semibold text-rose-800">{error}</p>
          <button 
            onClick={fetchOrdersData}
            className="mt-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs flex items-center gap-2 shadow-sm transition-all"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Reintentar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6 pb-16">
      {/* Header Title & Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-brand-600 flex items-center justify-center text-white shadow-md shadow-brand-600/30">
              <PackageCheck className="w-5.5 h-5.5" />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 tracking-tight uppercase">
                Facturación y Control de Entregas
              </h1>
              <p className="text-xs text-slate-500 font-medium">
                Monitoreo de facturación pendiente de entrega e histórico completo de pedidos (Entregados, Cancelados).
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchOrdersData}
            disabled={refreshing}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
            title="Actualizar datos"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-brand-600" : ""}`} />
            Actualizar
          </button>
          
          <button
            onClick={handleExportCSV}
            disabled={filteredOrders.length === 0}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl flex items-center gap-2 shadow-sm transition-all cursor-pointer disabled:opacity-50"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            Exportar CSV ({filteredOrders.length})
          </button>
        </div>
      </div>

      {/* Primary Mode Selector: Pendientes vs Histórico */}
      <div className="flex items-center gap-2 bg-slate-200/80 p-1.5 rounded-2xl border border-slate-300">
        {[
          { id: 'pending_only', label: 'Solo Pendientes de Entrega', count: stats.pendingCount, icon: Clock, badgeBg: 'bg-amber-500 text-white' },
          { id: 'delivered_only', label: 'Histórico Entregados', count: stats.deliveredCount, icon: CheckCircle2, badgeBg: 'bg-emerald-600 text-white' },
          { id: 'cancelled_only', label: 'Histórico Cancelados', count: stats.cancelledCount, icon: XCircle, badgeBg: 'bg-rose-600 text-white' },
          { id: 'all', label: 'Histórico Completo (Todos)', count: stats.totalOrdersCount, icon: History, badgeBg: 'bg-slate-700 text-white' }
        ].map(m => {
          const Icon = m.icon;
          const isActive = statusViewFilter === m.id;
          return (
            <button
              key={m.id}
              onClick={() => setStatusViewFilter(m.id as any)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                isActive 
                  ? "bg-slate-950 text-white shadow-md shadow-slate-950/20" 
                  : "text-slate-700 hover:text-slate-950 hover:bg-slate-300/60"
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? "text-brand-400" : "text-slate-500"}`} />
              <span className="truncate">{m.label}</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${m.badgeBg}`}>
                {m.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Dynamic KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Selection Amount */}
        <div className="bg-slate-950 text-white p-5 rounded-2xl border border-slate-900 shadow-lg relative overflow-hidden">
          <div className="absolute -right-4 -bottom-4 opacity-10 text-brand-400 pointer-events-none">
            <DollarSign className="w-32 h-32" />
          </div>
          <span className="text-[10px] font-black uppercase tracking-widest text-brand-400 block mb-1">
            {statusViewFilter === 'pending_only' ? 'Total Pendiente Entrega' :
             statusViewFilter === 'delivered_only' ? 'Total Entregado' :
             statusViewFilter === 'cancelled_only' ? 'Total Cancelado' : 'Total Selección Vista'}
          </span>
          <div className="text-2xl font-black tracking-tight text-white">
            {formatPrice(stats.totalSelectionAmount)}
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-slate-400 font-medium border-t border-slate-900 pt-2.5">
            <span>{stats.totalOrdersCount} pedidos en vista</span>
            <span className="text-brand-300 font-bold">{stats.totalItemsCount} unidades</span>
          </div>
        </div>

        {/* Retenido Pendiente */}
        <div className="bg-amber-50 border border-amber-200 p-5 rounded-2xl shadow-sm relative overflow-hidden">
          <span className="text-[10px] font-black uppercase tracking-widest text-amber-800 block mb-1 flex items-center gap-1">
            <Clock className="w-3 h-3 text-amber-600" /> Pendiente de Entrega
          </span>
          <div className="text-2xl font-black tracking-tight text-amber-950">
            {formatPrice(stats.pendingAmount)}
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-amber-800 font-bold border-t border-amber-200/60 pt-2.5">
            <span>{stats.pendingCount} pedidos retenidos</span>
            <span className="bg-amber-200 text-amber-900 px-2 py-0.5 rounded-full text-[10px]">
              Por Entregar
            </span>
          </div>
        </div>

        {/* Histórico Entregado */}
        <div className="bg-emerald-50 border border-emerald-200 p-5 rounded-2xl shadow-sm relative overflow-hidden">
          <span className="text-[10px] font-black uppercase tracking-widest text-emerald-800 block mb-1 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Entregado Físicamente
          </span>
          <div className="text-2xl font-black tracking-tight text-emerald-950">
            {formatPrice(stats.deliveredAmount)}
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-emerald-800 font-bold border-t border-emerald-200/60 pt-2.5">
            <span>{stats.deliveredCount} entregas completadas</span>
            <span className="bg-emerald-200 text-emerald-900 px-2 py-0.5 rounded-full text-[10px]">
              Completado
            </span>
          </div>
        </div>

        {/* Alertas Atrasados / Cancelados */}
        <div className="bg-rose-50 border border-rose-200 p-5 rounded-2xl shadow-sm relative overflow-hidden">
          <span className="text-[10px] font-black uppercase tracking-widest text-rose-800 block mb-1 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 text-rose-600" /> Vencidos ({stats.overdueCount}) / Cancelados ({stats.cancelledCount})
          </span>
          <div className="text-2xl font-black tracking-tight text-rose-950">
            {formatPrice(stats.overdueAmount + stats.cancelledAmount)}
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-rose-800 font-bold border-t border-rose-200/60 pt-2.5">
            <span>{stats.overdueCount} atrasados de fecha</span>
            <span className="bg-rose-200 text-rose-900 px-2 py-0.5 rounded-full text-[10px]">
              Alerta Logística
            </span>
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Search Box */}
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por cliente, ID, localidad, vendedor o producto..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all"
            />
          </div>

          {/* Quick Date Presets */}
          <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
            {[
              { id: 'all', label: 'Todos los Períodos' },
              { id: 'overdue', label: '⚠️ Vencidos' },
              { id: 'today', label: 'Hoy' },
              { id: 'next7', label: 'Próximos 7 días' },
              { id: 'next30', label: 'Próximos 30 días' },
              { id: 'custom', label: 'Personalizado' }
            ].map(p => (
              <button
                key={p.id}
                onClick={() => setDateRangePreset(p.id as any)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  dateRangePreset === p.id 
                    ? "bg-white text-slate-900 shadow-sm" 
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Secondary Filter Dropdowns */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 border-t border-slate-100 pt-4">
          {/* Category Filter */}
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">
              Filtrar por Categoría
            </label>
            <select
              value={selectedCategory}
              onChange={e => setSelectedCategory(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            >
              <option value="all">Todas las Categorías</option>
              {categoryBreakdown.map(c => (
                <option key={c.category} value={c.category}>
                  {c.category} ({formatPrice(c.amount)})
                </option>
              ))}
            </select>
          </div>

          {/* Seller Filter */}
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">
              Filtrar por Vendedor
            </label>
            <select
              value={selectedSeller}
              onChange={e => setSelectedSeller(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            >
              <option value="all">Todos los Vendedores</option>
              {sellersList.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* Logistics Status Filter */}
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">
              Estado de Ruteo / Logística
            </label>
            <select
              value={selectedLogisticsStatus}
              onChange={e => setSelectedLogisticsStatus(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            >
              <option value="all">Todos los Estados Logísticos</option>
              <option value="pendiente_ruteo">Pendiente de Ruteo</option>
              <option value="ruteado">Ruteado / Programado</option>
              <option value="en_recorrido">En Recorrido</option>
              <option value="entregado">Entregado Físicamente</option>
              <option value="fallido">Entrega Fallida / Reintento</option>
            </select>
          </div>
        </div>

        {/* Custom Range Picker */}
        {dateRangePreset === 'custom' && (
          <div className="flex flex-wrap items-center gap-3 bg-brand-50/50 p-3 rounded-xl border border-brand-100 text-xs">
            <span className="font-bold text-brand-900">Rango personalizado:</span>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={customStartDate}
                onChange={e => setCustomStartDate(e.target.value)}
                className="px-2.5 py-1.5 bg-white border border-brand-200 rounded-lg text-xs font-bold text-slate-800"
              />
              <span className="text-slate-400">hasta</span>
              <input
                type="date"
                value={customEndDate}
                onChange={e => setCustomEndDate(e.target.value)}
                className="px-2.5 py-1.5 bg-white border border-brand-200 rounded-lg text-xs font-bold text-slate-800"
              />
            </div>
          </div>
        )}
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center gap-2 border-b border-slate-200 overflow-x-auto pb-1 custom-sidebar-scrollbar">
        {[
          { id: 'overview', label: 'Resumen General', icon: Layers },
          { id: 'date', label: 'Por Fecha Entrega', icon: Calendar },
          { id: 'category', label: 'Por Categoría', icon: ShoppingBag },
          { id: 'seller', label: 'Por Vendedor', icon: Users },
          { id: 'logistics', label: 'Por Ruteo / Logística', icon: Truck },
          { id: 'table', label: `Listado Pedidos (${filteredOrders.length})`, icon: PackageCheck }
        ].map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2.5 font-bold text-xs rounded-t-xl transition-all cursor-pointer whitespace-nowrap ${
                activeTab === tab.id
                  ? "bg-white text-brand-600 border border-slate-200 border-b-white -mb-px shadow-xs"
                  : "text-slate-500 hover:text-slate-900 hover:bg-slate-100"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* TAB CONTENT: Overview */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Category Distribution */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-slate-900 text-sm tracking-tight uppercase flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-brand-600" />
                Facturación por Categoría
              </h3>
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                {categoryBreakdown.length} Categorías
              </span>
            </div>

            <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1.5 custom-sidebar-scrollbar">
              {categoryBreakdown.map(cat => (
                <div key={cat.category} className="space-y-1.5 bg-slate-50/60 p-2.5 rounded-xl border border-slate-100">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                    <span className="truncate pr-2">{cat.category}</span>
                    <span className="shrink-0">{formatPrice(cat.amount)} ({cat.percentage.toFixed(1)}%)</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden flex">
                    <div
                      className="bg-emerald-500 h-full transition-all duration-500"
                      style={{ width: `${stats.totalSelectionAmount > 0 ? (cat.deliveredAmt / stats.totalSelectionAmount) * 100 : 0}%` }}
                      title={`Entregado: ${formatPrice(cat.deliveredAmt)}`}
                    />
                    <div
                      className="bg-amber-500 h-full transition-all duration-500"
                      style={{ width: `${stats.totalSelectionAmount > 0 ? (cat.pendingAmt / stats.totalSelectionAmount) * 100 : 0}%` }}
                      title={`Pendiente: ${formatPrice(cat.pendingAmt)}`}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-400 font-medium">
                    <span>{cat.ordersCount} pedidos</span>
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-700 font-bold">Entregado: {formatPrice(cat.deliveredAmt)}</span>
                      <span className="text-amber-700 font-bold">Pendiente: {formatPrice(cat.pendingAmt)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Timeline Summary preview */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4 flex flex-col min-h-[480px]">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-black text-slate-900 text-sm tracking-tight uppercase flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-brand-600" />
                  Cronograma de Entregas Futuras
                </h3>
                <span className="text-[10px] text-slate-400 font-bold">
                  {dateBreakdown.length} fechas estipuladas
                </span>
              </div>

              {/* View Switcher */}
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-bold">
                <button
                  onClick={() => setCronogramaView('chart')}
                  className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                    cronogramaView === 'chart' 
                      ? "bg-white text-brand-700 shadow-xs font-black" 
                      : "text-slate-500 hover:text-slate-900"
                  }`}
                >
                  📊 Gráfico de Barras
                </button>
                <button
                  onClick={() => setCronogramaView('list')}
                  className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                    cronogramaView === 'list' 
                      ? "bg-white text-brand-700 shadow-xs font-black" 
                      : "text-slate-500 hover:text-slate-900"
                  }`}
                >
                  📋 Lista
                </button>
              </div>
            </div>

            {cronogramaView === 'chart' ? (
              /* Interactive Bar Chart View */
              (() => {
                const today = getTodayStr();
                const maxAmount = Math.max(...dateBreakdown.map(d => d.pendingAmount || d.amount), 1);

                return (
                  <div className="flex-1 flex flex-col justify-between space-y-4 pt-4">
                    <div className="text-[11px] text-slate-500 font-medium flex items-center justify-between bg-brand-50/50 p-2.5 rounded-xl border border-brand-100">
                      <span>💡 <b>Fechas agrupadas por vencimiento y períodos</b> (Vencidos por rango, Semana Actual y +1 Semana).</span>
                    </div>

                    <div className="overflow-x-auto custom-sidebar-scrollbar pt-12 pb-2">
                      <div className="flex items-end gap-3 min-w-max h-[300px] px-3">
                        {dateBreakdown.map(d => {
                          const pendingVal = d.pendingAmount || d.amount;
                          const heightPct = Math.max(12, Math.min(100, (pendingVal / maxAmount) * 100));

                          let barGradient = "bg-gradient-to-t from-brand-600 to-brand-400";
                          let labelColor = "text-slate-800";
                          let badgeText = d.overdue ? "Vencido" : "";

                          if (d.type === 'overdue_15_plus') {
                            barGradient = "bg-gradient-to-t from-rose-800 to-rose-600";
                            labelColor = "text-rose-700 font-black";
                            badgeText = "+15d Vencido";
                          } else if (d.type === 'overdue_8_to_15') {
                            barGradient = "bg-gradient-to-t from-rose-600 to-rose-400";
                            labelColor = "text-rose-600 font-black";
                            badgeText = "8-15d Vencido";
                          } else if (d.type === 'overdue_1_to_7') {
                            barGradient = "bg-gradient-to-t from-amber-600 to-rose-500";
                            labelColor = "text-rose-600 font-black";
                            badgeText = "1-7d Vencido";
                          } else if (d.type === 'today') {
                            barGradient = "bg-gradient-to-t from-amber-500 to-amber-300";
                            labelColor = "text-amber-800 font-black";
                            badgeText = "HOY";
                          } else if (d.type === 'future_7_plus') {
                            barGradient = "bg-gradient-to-t from-indigo-600 to-indigo-400";
                            labelColor = "text-indigo-700 font-black";
                            badgeText = "+1 Semana";
                          }

                          return (
                            <div key={d.date} className="flex flex-col items-center gap-2 group w-24 relative cursor-pointer">
                              {/* Top Value Badges */}
                              <div className="flex flex-col items-center gap-0.5 group-hover:-translate-y-1 transition-transform">
                                <span className="bg-slate-950 text-white text-[10px] font-black px-2 py-0.5 rounded-full shadow-xs whitespace-nowrap">
                                  {formatCompactPrice(pendingVal)}
                                </span>
                                <span className="text-[9px] font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded-md">
                                  {d.count} {d.count === 1 ? 'ped.' : 'peds.'}
                                </span>
                              </div>

                              {/* Vertical Bar Element */}
                              <div className="w-full h-[200px] flex items-end justify-center bg-slate-50 rounded-xl p-1 border border-slate-150">
                                <div
                                  className={`w-full rounded-t-lg transition-all duration-500 group-hover:brightness-110 shadow-sm ${barGradient}`}
                                  style={{ height: `${heightPct}%` }}
                                />
                              </div>

                              {/* Bottom Date Label */}
                              <div className="text-center">
                                <span className={`text-[11px] font-black block ${labelColor}`}>
                                  {d.label}
                                </span>
                                {badgeText && (
                                  <span className={`text-[8px] font-black uppercase block ${
                                    d.overdue ? "text-rose-600" : d.type === 'today' ? "text-amber-700" : "text-indigo-600"
                                  }`}>
                                    {badgeText}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })()
            ) : (
              /* List Cards View */
              <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1.5 custom-sidebar-scrollbar flex-1">
                {dateBreakdown.map(d => (
                  <div
                    key={d.date}
                    className={`p-3.5 rounded-xl border flex items-center justify-between transition-all ${
                      d.overdue
                        ? "bg-rose-50 border-rose-200 text-rose-950"
                        : "bg-slate-50 border-slate-200 text-slate-900"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${d.overdue ? "bg-rose-200 text-rose-900" : "bg-slate-200 text-slate-700"}`}>
                        <Calendar className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-bold text-xs flex items-center gap-1.5">
                          {d.label || d.date}
                          {d.overdue && (
                            <span className="text-[9px] bg-rose-600 text-white font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md">
                              Vencido
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-500 font-medium">
                          {d.count} {d.count === 1 ? 'pedido' : 'pedidos'} {d.subLabel ? `(${d.subLabel})` : ''}
                        </span>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="font-black text-sm tracking-tight text-amber-700" title="Monto Pendiente de Entrega">
                        {formatPrice(d.pendingAmount)}
                      </div>
                      <div className="text-[10px] text-slate-500 font-bold">
                        Pendiente <span className="text-slate-400 font-normal">| Entregado: <span className="text-emerald-700 font-bold">{formatPrice(d.deliveredAmount)}</span></span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB CONTENT: Date Breakdown */}
      {activeTab === 'date' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h3 className="font-black text-slate-900 text-sm tracking-tight uppercase flex items-center gap-2">
                <Calendar className="w-4 h-4 text-brand-600" />
                Desglose Temporal por Fecha de Entrega
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Visualización de montos facturados agrupados por fecha de entrega programada.
              </p>
            </div>

            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
              {[
                { id: 'daily', label: 'Diario' },
                { id: 'weekly', label: 'Semanal' },
                { id: 'monthly', label: 'Mensual' }
              ].map(g => (
                <button
                  key={g.id}
                  onClick={() => setDateGrouping(g.id as any)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    dateGrouping === g.id
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {g.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {dateBreakdown.map(item => (
              <div
                key={item.date}
                className={`p-4 rounded-2xl border transition-all ${
                  item.overdue
                    ? "bg-rose-50/70 border-rose-200"
                    : "bg-slate-50/70 border-slate-200"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    {item.label || item.date}
                  </span>
                  {item.overdue && (
                    <span className="bg-rose-600 text-white text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full">
                      Vencido
                    </span>
                  )}
                </div>

                <div className="text-xl font-black text-amber-700 mb-1" title="Monto Pendiente de Entrega">
                  {formatPrice(item.pendingAmount)}
                </div>
                <div className="text-[10px] text-slate-400 font-bold mb-2">
                  Pendiente de Entrega ({item.count} {item.count === 1 ? 'pedido' : 'pedidos'})
                </div>

                <div className="space-y-1 text-[11px] text-slate-600 border-t border-slate-200/60 pt-2 font-medium">
                  <div className="flex justify-between">
                    <span>Entregado Completado:</span>
                    <span className="font-bold text-emerald-700">{formatPrice(item.deliveredAmount)}</span>
                  </div>
                  <div className="flex justify-between text-slate-400 text-[10px] pt-1">
                    <span>Total Histórico Período:</span>
                    <span className="font-semibold">{formatPrice(item.amount)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB CONTENT: Category Breakdown */}
      {activeTab === 'category' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
          <div>
            <h3 className="font-black text-slate-900 text-sm tracking-tight uppercase flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-brand-600" />
              Facturación por Categoría de Producto
            </h3>
            <p className="text-xs text-slate-500 font-medium">
              Análisis del volumen monetario y físico por categoría en la selección actual.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {categoryBreakdown.map(cat => (
              <div key={cat.category} className="p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-slate-900 uppercase tracking-tight">
                    {cat.category}
                  </span>
                  <span className="bg-brand-100 text-brand-800 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md">
                    {cat.percentage.toFixed(1)}% Total
                  </span>
                </div>

                <div className="text-2xl font-black text-slate-900">
                  {formatPrice(cat.amount)}
                </div>

                <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden flex">
                  <div
                    className="bg-emerald-500 h-full"
                    style={{ width: `${stats.totalSelectionAmount > 0 ? (cat.deliveredAmt / stats.totalSelectionAmount) * 100 : 0}%` }}
                  />
                  <div
                    className="bg-amber-500 h-full"
                    style={{ width: `${stats.totalSelectionAmount > 0 ? (cat.pendingAmt / stats.totalSelectionAmount) * 100 : 0}%` }}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 border-t border-slate-200 pt-2 font-medium">
                  <div>
                    <span className="block text-[10px] text-slate-400 font-bold uppercase">Entregado</span>
                    <span className="font-bold text-emerald-700">{formatPrice(cat.deliveredAmt)}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-slate-400 font-bold uppercase">Pendiente</span>
                    <span className="font-bold text-amber-700">{formatPrice(cat.pendingAmt)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB CONTENT: Seller Breakdown */}
      {activeTab === 'seller' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
          <div>
            <h3 className="font-black text-slate-900 text-sm tracking-tight uppercase flex items-center gap-2">
              <Users className="w-4 h-4 text-brand-600" />
              Facturación e Histórico por Vendedor
            </h3>
            <p className="text-xs text-slate-500 font-medium">
              Ventas cerradas por cada integrante con estado de entregas.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sellerBreakdown.map(s => (
              <div key={s.seller} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900 truncate">
                    {s.seller}
                  </span>
                  <span className="text-xs font-bold text-brand-600">
                    {s.count} {s.count === 1 ? 'pedido' : 'pedidos'}
                  </span>
                </div>
                <div className="text-xl font-black text-slate-900">
                  {formatPrice(s.amount)}
                </div>
                <div className="text-[10px] text-slate-500 font-medium border-t border-slate-200 pt-2 flex justify-between">
                  <span>Pendiente: <b className="text-amber-700">{formatPrice(s.pendingAmt)}</b></span>
                  <span>Entregado: <b className="text-emerald-700">{formatPrice(s.deliveredAmt)}</b></span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB CONTENT: Logistics Status Breakdown */}
      {activeTab === 'logistics' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
          <div>
            <h3 className="font-black text-slate-900 text-sm tracking-tight uppercase flex items-center gap-2">
              <Truck className="w-4 h-4 text-brand-600" />
              Facturación por Estado de Ruteo y Logística
            </h3>
            <p className="text-xs text-slate-500 font-medium">
              Etapas del proceso logístico del histórico de pedidos.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {logisticsStatusBreakdown.map(st => (
              <div key={st.label} className="p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${st.color}`} />
                  <span className="text-xs font-black text-slate-800">
                    {st.label}
                  </span>
                </div>

                <div className="text-2xl font-black text-slate-900">
                  {formatPrice(st.amount)}
                </div>

                <div className="text-xs font-bold text-slate-600 border-t border-slate-200 pt-2 flex justify-between">
                  <span>{st.count} pedidos</span>
                  <span className="text-slate-400">
                    {stats.totalSelectionAmount > 0 ? ((st.amount / stats.totalSelectionAmount) * 100).toFixed(1) : 0}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB CONTENT / ALWAYS DISPLAY: Detailed Table */}
      {(activeTab === 'table' || activeTab === 'overview') && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden space-y-0">
          <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-black text-slate-900 text-sm tracking-tight uppercase flex items-center gap-2">
                <PackageCheck className="w-4 h-4 text-brand-600" />
                Listado Detallado de Pedidos en Vista ({filteredOrders.length})
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Haz clic sobre cualquier pedido para desglosar sus artículos físicos.
              </p>
            </div>

            {/* Sorting control */}
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-400 font-bold">Ordenar por:</span>
              <button
                onClick={() => {
                  if (sortField === 'date') setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
                  else { setSortField('date'); setSortOrder('asc'); }
                }}
                className={`px-2.5 py-1 rounded-lg border text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                  sortField === 'date' ? "bg-slate-900 text-white border-slate-900" : "bg-slate-50 border-slate-200 text-slate-700"
                }`}
              >
                Fecha {sortField === 'date' && (sortOrder === 'asc' ? '↑' : '↓')}
              </button>

              <button
                onClick={() => {
                  if (sortField === 'amount') setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
                  else { setSortField('amount'); setSortOrder('desc'); }
                }}
                className={`px-2.5 py-1 rounded-lg border text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                  sortField === 'amount' ? "bg-slate-900 text-white border-slate-900" : "bg-slate-50 border-slate-200 text-slate-700"
                }`}
              >
                Monto {sortField === 'amount' && (sortOrder === 'asc' ? '↑' : '↓')}
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950 text-slate-300 uppercase text-[10px] font-black tracking-wider">
                <tr>
                  <th className="py-3.5 px-4">Pedido / ID</th>
                  <th className="py-3.5 px-4">Fecha Entrega</th>
                  <th className="py-3.5 px-4">Cliente / Localidad</th>
                  <th className="py-3.5 px-4">Vendedor</th>
                  <th className="py-3.5 px-4 text-right">Monto Total</th>
                  <th className="py-3.5 px-4">Estado Pedido</th>
                  <th className="py-3.5 px-4">Estado Ruteo</th>
                  <th className="py-3.5 px-4 text-center">Detalle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400 font-bold">
                      No se encontraron pedidos con los filtros seleccionados.
                    </td>
                  </tr>
                ) : (
                  filteredOrders.map(o => {
                    const targetDate = getEffectiveDeliveryDate(o);
                    const statusCat = getStatusCategory(o.status);
                    const isOverdue = targetDate < getTodayStr() && statusCat === 'pending';
                    const isToday = targetDate === getTodayStr() && statusCat === 'pending';
                    const isExpanded = expandedOrders.has(o.id);
                    const delStatus = o.deliveries?.[0]?.status || (statusCat === 'delivered' ? 'entregado' : 'pendiente_ruteo');

                    return (
                      <React.Fragment key={o.id}>
                        <tr 
                          onClick={() => toggleExpandOrder(o.id)}
                          className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                        >
                          <td className="py-3.5 px-4 font-bold text-slate-900">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-brand-700">#{o.id.substring(0, 8)}</span>
                              {o.clients?.is_wholesale && (
                                <span className="text-[9px] bg-purple-100 text-purple-800 font-black uppercase px-1.5 py-0.5 rounded-md">
                                  Mayorista
                                </span>
                              )}
                            </div>
                            <span className="block text-[10px] text-slate-400 font-normal">
                              Creado: {o.order_date || 'N/A'}
                            </span>
                          </td>

                          <td className="py-3.5 px-4 font-semibold text-slate-800">
                            <div className="flex items-center gap-1.5">
                              <Calendar className="w-3.5 h-3.5 text-slate-400" />
                              <span>{targetDate}</span>
                            </div>
                            {isOverdue && (
                              <span className="inline-block mt-0.5 text-[9px] bg-rose-100 text-rose-800 font-black uppercase px-1.5 py-0.5 rounded-md">
                                Vencido
                              </span>
                            )}
                            {isToday && (
                              <span className="inline-block mt-0.5 text-[9px] bg-amber-100 text-amber-900 font-black uppercase px-1.5 py-0.5 rounded-md">
                                Hoy
                              </span>
                            )}
                          </td>

                          <td className="py-3.5 px-4">
                            <div className="font-bold text-slate-900">{o.customer_name}</div>
                            <div className="text-[11px] text-slate-500 flex items-center gap-1">
                              <MapPin className="w-3 h-3 text-slate-400" />
                              {o.locality || 'Sin localidad'}
                            </div>
                          </td>

                          <td className="py-3.5 px-4 font-medium text-slate-700">
                            {o.sellers?.full_name || 'Sin asignar'}
                          </td>

                          <td className="py-3.5 px-4 text-right font-black text-slate-900 text-sm">
                            {formatPrice(o.total_amount || 0)}
                          </td>

                          <td className="py-3.5 px-4">
                            <span className={`inline-block text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
                              statusCat === 'delivered' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
                              statusCat === 'cancelled' ? 'bg-rose-100 text-rose-800 border border-rose-200' :
                              'bg-amber-100 text-amber-800 border border-amber-200'
                            }`}>
                              {o.status}
                            </span>
                          </td>

                          <td className="py-3.5 px-4">
                            <span className={`inline-block text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-lg ${
                              delStatus === 'entregado' ? 'bg-emerald-100 text-emerald-800' :
                              delStatus === 'ruteado' ? 'bg-blue-100 text-blue-800' :
                              delStatus === 'en_recorrido' ? 'bg-indigo-100 text-indigo-800' :
                              delStatus === 'fallido' ? 'bg-rose-100 text-rose-800' :
                              'bg-amber-100 text-amber-800'
                            }`}>
                              {delStatus === 'entregado' ? 'Entregado' :
                               delStatus === 'ruteado' ? 'Ruteado' :
                               delStatus === 'en_recorrido' ? 'En Recorrido' :
                               delStatus === 'fallido' ? 'Entrega Fallida' : 'Pendiente Ruteo'}
                            </span>
                          </td>

                          <td className="py-3.5 px-4 text-center">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleExpandOrder(o.id);
                              }}
                              className="p-1 hover:bg-slate-200 rounded-lg transition-colors text-slate-500"
                            >
                              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </button>
                          </td>
                        </tr>

                        {/* Order Items Expanded View */}
                        {isExpanded && (
                          <tr className="bg-slate-50/90 border-t border-b border-slate-200">
                            <td colSpan={8} className="p-4">
                              <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3">
                                <div className="flex items-center justify-between text-xs font-black text-slate-800 uppercase tracking-wider border-b border-slate-100 pb-2">
                                  <span>Artículos físicos ({o.order_items?.length || 0})</span>
                                  <span>Dirección: {o.address || 'Sin especificar'}</span>
                                </div>

                                <div className="space-y-2">
                                  {o.order_items?.length === 0 ? (
                                    <span className="text-xs text-slate-400 italic">No hay ítems registrados en este pedido.</span>
                                  ) : (
                                    o.order_items?.map(item => (
                                      <div key={item.id} className="flex items-center justify-between text-xs py-1 border-b border-slate-50 last:border-0">
                                        <div className="flex items-center gap-2">
                                          <span className="font-black text-brand-600 bg-brand-50 px-2 py-0.5 rounded-md">
                                            {item.quantity}x
                                          </span>
                                          <span className="font-semibold text-slate-800">{item.product_name}</span>
                                          <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md font-bold">
                                            {getItemCategory(item, o.category)}
                                          </span>
                                        </div>
                                        <div className="font-mono font-bold text-slate-900">
                                          {formatPrice(item.subtotal || (item.unit_price * item.quantity))}
                                        </div>
                                      </div>
                                    ))
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

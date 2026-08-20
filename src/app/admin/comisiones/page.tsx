"use client";

import React, { useEffect, useState, useMemo } from "react";
import { 
  Coins, 
  Calendar, 
  DollarSign, 
  Users, 
  TrendingUp, 
  Settings, 
  Download, 
  RefreshCw, 
  Loader2, 
  Search, 
  ChevronDown, 
  ChevronUp, 
  CheckCircle2, 
  AlertTriangle, 
  Info, 
  FileSpreadsheet, 
  Sliders, 
  ShieldCheck, 
  Plus, 
  Trash2, 
  Save, 
  Package, 
  HelpCircle,
  Eye
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatPrice } from "@/lib/utils";

// Commission Matrix Rules Interfaces
export interface TierRate {
  tier_min_sales: number;
  rate_pct: number;
  max_amount?: number; // Maximum commission cap for this category & tier
}

export interface CategoryGroupConfig {
  id: string;
  name: string;
  categories: string[];
  rates: TierRate[];
}

export interface CommissionMatrixConfig {
  tiers: { min_sales: number }[];
  category_groups: CategoryGroupConfig[];
}

// Default initial config based on provided specification spreadsheet
const DEFAULT_COMMISSION_CONFIG: CommissionMatrixConfig = {
  tiers: [
    { min_sales: 25000000 },
    { min_sales: 32500000 },
    { min_sales: 40000000 },
    { min_sales: 50000000 },
    { min_sales: 60000000 },
    { min_sales: 70000000 }
  ],
  category_groups: [
    {
      id: "group_1",
      name: "Tanques, Blos, Pinturas",
      categories: ["Tanques de Agua", "Biodigestores", "Cámaras Sépticas", "Pinturas"],
      rates: [
        { tier_min_sales: 25000000, rate_pct: 1.05 },
        { tier_min_sales: 32500000, rate_pct: 1.15 },
        { tier_min_sales: 40000000, rate_pct: 1.25 },
        { tier_min_sales: 50000000, rate_pct: 1.38 },
        { tier_min_sales: 60000000, rate_pct: 1.50 },
        { tier_min_sales: 70000000, rate_pct: 1.60 }
      ]
    },
    {
      id: "group_2",
      name: "Herramientas, Termotanques, Instalaciones",
      categories: ["Herramientas", "Termotanques", "Instalaciones", "Caños Termofusión", "MEPS", "Escaleras", "Insumos", "Otros"],
      rates: [
        { tier_min_sales: 25000000, rate_pct: 0.45 },
        { tier_min_sales: 32500000, rate_pct: 0.55 },
        { tier_min_sales: 40000000, rate_pct: 0.65 },
        { tier_min_sales: 50000000, rate_pct: 0.78 },
        { tier_min_sales: 60000000, rate_pct: 0.90 },
        { tier_min_sales: 70000000, rate_pct: 1.00 }
      ]
    }
  ]
};

interface SellerCommissionSummary {
  seller_id: string;
  seller_name: string;
  seller_email: string;
  total_orders_count: number;
  total_net_sales: number; // Pure product sales excluding freight, card surcharges, and exchanges
  reached_tier_threshold: number;
  group_breakdowns: {
    group_id: string;
    group_name: string;
    net_sales: number;
    applied_rate_pct: number;
    calculated_commission: number;
    max_cap_amount?: number;
    final_commission: number;
    was_capped: boolean;
  }[];
  total_commission_payable: number;
  effective_commission_pct: number;
  included_orders: any[];
  excluded_orders: any[];
}

export default function SellerCommissionsPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Period Selector: Defaults to previous month
  const [selectedYear, setSelectedYear] = useState<number>(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.getFullYear();
  });
  const [selectedMonth, setSelectedMonth] = useState<number>(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.getMonth() + 1; // 1-12
  });

  // Active Tab: Liquidation vs Matrix Config
  const [activeTab, setActiveTab] = useState<'settlement' | 'config'>('settlement');
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSellerAudit, setSelectedSellerAudit] = useState<SellerCommissionSummary | null>(null);
  
  // Matrix Config State
  const [config, setConfig] = useState<CommissionMatrixConfig>(DEFAULT_COMMISSION_CONFIG);
  const [savingConfig, setSavingConfig] = useState(false);
  const [configSaveSuccess, setConfigSaveSuccess] = useState<string | null>(null);

  // Data storage
  const [orders, setOrders] = useState<any[]>([]);
  const [sellers, setSellers] = useState<any[]>([]);
  const [exchanges, setExchanges] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);

  // Month Names Helper
  const MONTH_NAMES = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
  ];

  // Helper date formatted YYYY-MM
  const periodLabel = `${MONTH_NAMES[selectedMonth - 1]} ${selectedYear}`;

  // Helper to determine the effective delivery date of an order (prioritizing official Route Sheet date)
  const getOrderDeliveryDate = (order: any): string => {
    if (Array.isArray(order.deliveries) && order.deliveries.length > 0) {
      const del = order.deliveries[0];
      if (del?.route_sheets?.delivery_date) return del.route_sheets.delivery_date.split('T')[0];
      if (del?.real_delivery_date) return del.real_delivery_date.split('T')[0];
      if (del?.delivery_date) return del.delivery_date.split('T')[0];
    } else if (order.deliveries) {
      const del = order.deliveries as any;
      if (del?.route_sheets?.delivery_date) return del.route_sheets.delivery_date.split('T')[0];
      if (del?.real_delivery_date) return del.real_delivery_date.split('T')[0];
      if (del?.delivery_date) return del.delivery_date.split('T')[0];
    }
    if (order.initial_delivery_date) return order.initial_delivery_date.split('T')[0];
    return (order.order_date || "").split('T')[0];
  };

  const loadAllData = async () => {
    setRefreshing(true);
    setError(null);
    try {
      // 1. Fetch Config from database if exists
      const { data: configData } = await supabase
        .from("seller_commission_configs")
        .select("*")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (configData && configData.rules) {
        setConfig(configData.rules);
      }

      // 2. Compute date range for selected month
      const startDateStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`;
      const lastDay = new Date(selectedYear, selectedMonth, 0).getDate();
      const endDateStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

      // Query from 2 months prior up to the 15th of the next month to catch all postponed deliveries
      const priorDate = new Date(selectedYear, selectedMonth - 3, 1);
      const queryStartStr = `${priorDate.getFullYear()}-${String(priorDate.getMonth() + 1).padStart(2, '0')}-01`;
      
      const nextDate = new Date(selectedYear, selectedMonth, 15);
      const queryEndStr = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}-${String(nextDate.getDate()).padStart(2, '0')}T23:59:59`;

      // 3. Paginated fetch of delivered orders created in candidate range
      let allDeliveredOrders: any[] = [];
      let from = 0;
      const step = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data: pageData, error: pageErr } = await supabase
          .from("orders")
          .select(`
            id,
            legacy_code,
            order_date,
            initial_delivery_date,
            customer_name,
            total_amount,
            status,
            category,
            seller_id,
            freight_type,
            payment_method_id,
            order_items ( id, product_id, product_name, quantity, unit_price, subtotal ),
            deliveries ( delivery_date, real_delivery_date, status, route_sheets ( id, delivery_date, status ) )
          `)
          .eq("status", "Entregado")
          .gte("order_date", queryStartStr)
          .lte("order_date", queryEndStr)
          .range(from, from + step - 1);

        if (pageErr) throw pageErr;
        if (pageData && pageData.length > 0) {
          allDeliveredOrders = allDeliveredOrders.concat(pageData);
          from += step;
          if (pageData.length < step) hasMore = false;
        } else {
          hasMore = false;
        }
      }

      const [sellersRes, exchangesRes, productsRes] = await Promise.all([
        supabase.from("sellers").select("id, full_name, email"),
        supabase.from("returns_exchanges").select("id, order_id, legacy_code, type, status"),
        supabase.from("products").select("id, category, name")
      ]);

      setOrders(allDeliveredOrders);
      setSellers(sellersRes.data || []);
      setExchanges(exchangesRes.data || []);
      setProducts(productsRes.data || []);

    } catch (err: any) {
      console.error("Error loading commissions data:", err);
      setError(err.message || "Error al cargar la información de ventas y comisiones.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, [selectedYear, selectedMonth]);

  // Helper to normalize raw database categories into clean Macro Categories
  const normalizeToMacroCategory = (rawCat?: string): string => {
    const c = (rawCat || "").trim();
    const lower = c.toLowerCase();
    if (lower.includes("instalaci") || lower.includes("colocaci")) return "Instalaciones";
    if (lower.includes("tanque") || lower.includes("cisterna") || lower.includes("complementos para tanques")) return "Tanques de Agua";
    if (lower.includes("biodigestor") || lower.includes("séptica") || lower.includes("septica") || lower.includes("desengrasadora")) return "Biodigestores";
    if (lower.includes("membrana") || lower.includes("meps")) return "MEPS";
    if (lower.includes("pintura")) return "Pinturas";
    if (lower.includes("herramienta")) return "Herramientas";
    if (lower.includes("termotanque")) return "Termotanques";
    if (lower.includes("termofusión") || lower.includes("termofusion") || lower.includes("caño")) return "Caños Termofusión";
    if (lower.includes("escalera")) return "Escaleras";
    if (lower.includes("insumo")) return "Insumos";
    if (c && c !== "otro" && c !== "Otros" && c !== "Interno") return c;
    return "Otros";
  };

  // Calculate all available clean macro product categories
  const allAvailableCategories = useMemo(() => {
    const defaults = [
      "Tanques de Agua", "Biodigestores", "Cámaras Sépticas", "Pinturas",
      "Herramientas", "Termotanques", "Instalaciones", "Caños Termofusión",
      "MEPS", "Escaleras", "Insumos", "Otros"
    ];
    const dbMacroCats = products.map(p => normalizeToMacroCategory(p.category)).filter(Boolean);
    return Array.from(new Set([...defaults, ...dbMacroCats])).sort();
  }, [products]);

  // Unassigned categories (not assigned to any group yet)
  const unassignedCategories = useMemo(() => {
    const assigned = new Set(config.category_groups.flatMap(g => g.categories.map(c => c.toLowerCase())));
    return allAvailableCategories.filter(cat => !assigned.has(cat.toLowerCase()));
  }, [allAvailableCategories, config.category_groups]);

  // Helper to map item category to clean macro category
  const getItemCategory = (item: any, orderCat?: string): string => {
    const nameLower = ((item.product_name || item.name || "") as string).toLowerCase();
    if (nameLower.includes("instalaci") || nameLower.includes("colocaci")) return "Instalaciones";
    if (item.product_id) {
      const prod = products.find(p => p.id === item.product_id);
      if (prod?.category) return normalizeToMacroCategory(prod.category);
    }
    if (orderCat) return normalizeToMacroCategory(orderCat);
    return "Otros";
  };

  // Helper to determine which Category Group an item belongs to
  const getCategoryGroupForCategory = (catName: string): CategoryGroupConfig => {
    for (const grp of config.category_groups) {
      if (grp.categories.some(c => c.toLowerCase() === catName.toLowerCase())) {
        return grp;
      }
    }
    // Default fallback to second group or first group
    return config.category_groups[config.category_groups.length - 1] || config.category_groups[0];
  };

  // Calculate Seller Commission Summaries
  const sellerSummaries = useMemo<SellerCommissionSummary[]>(() => {
    const exchangeOrderIds = new Set<string>();
    const exchangeLegacyCodes = new Set<string>();

    exchanges.forEach(ex => {
      if (ex.type === 'cambio' && ex.status !== 'Rechazado') {
        if (ex.order_id) exchangeOrderIds.add(ex.order_id);
        if (ex.legacy_code) exchangeLegacyCodes.add(ex.legacy_code.trim().toLowerCase());
      }
    });

    const postponedJulyCodes = new Set([
      'js24198', 'js24220', 'js24221', 'js24229', 'js24241', 'js24246', 'js24251',
      'js24257', 'js24265', 'js24293', 'js24279', 'js24287', 'js24296', 'js24281', 'js24266', 'js24289',
      'js24280', 'js24268', 'js24286', 'js24295', 'js24274', 'js24283', 'js24290', 'js24285', 'js24294',
      'js24267', 'js23900', 'js24230', 'js24023', 'js24065', 'js24075', 'js24193', 'js24238', 'js24240',
      'js24252', 'js24223', 'js24079', 'js24159', 'js24232', 'js24206', 'js24237', 'js24182', 'js24202',
      'js24254', 'js24213', 'js24228', 'js24258', 'js24263', 'js23822', 'js24055', 'lk01409', 'js24242',
      'js24236',
      // Remaining August delivered/postponed codes
      'js24142', 'js24211', 'js24212', 'js24215', 'js24259', 'js24219', 'js24243', 'js24234', 'js24227',
      'js24235', 'js24249', 'js24256', 'js24245', 'js24262', 'lk01493', 'js24217', 'js24173', 'js24184',
      'js24247', 'camb1469', 'js23952', 'camb1475'
    ]);

    const summariesMap = new Map<string, {
      seller_id: string;
      seller_name: string;
      seller_email: string;
      included_orders: any[];
      excluded_orders: any[];
      group_sales: Map<string, number>;
    }>();

    const processedSellerCodes = new Map<string, Set<string>>();

    // Initialize sellers map
    sellers.forEach(s => {
      processedSellerCodes.set(s.id, new Set<string>());
      summariesMap.set(s.id, {
        seller_id: s.id,
        seller_name: s.full_name || 'Sin Nombre',
        seller_email: s.email || '',
        included_orders: [],
        excluded_orders: [],
        group_sales: new Map()
      });
    });

    const startDateStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`;
    const lastDay = new Date(selectedYear, selectedMonth, 0).getDate();
    const endDateStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    // Process orders
    orders.forEach(order => {
      const sellerId = order.seller_id;
      if (!sellerId || !summariesMap.has(sellerId)) return;

      const sellerEntry = summariesMap.get(sellerId)!;

      // Exclusion Check 0: Effective delivery date must fall in selected month
      const effectiveDeliveryDate = getOrderDeliveryDate(order);
      if (effectiveDeliveryDate < startDateStr || effectiveDeliveryDate > endDateStr) {
        sellerEntry.excluded_orders.push({
          ...order,
          effective_delivery_date: effectiveDeliveryDate,
          exclude_reason: `Entregado fuera del período (${effectiveDeliveryDate})`
        });
        return;
      }

      // Exclusion Check 0.1: Postponed in logistics check
      const orderLegacyLower = (order.legacy_code || "").trim().toLowerCase();
      const legacyParts = orderLegacyLower.split('/').map((p: string) => p.trim());
      const isPostponed = legacyParts.some((p: string) => p && postponedJulyCodes.has(p));
      if (selectedMonth === 7 && selectedYear === 2026 && isPostponed) {
        sellerEntry.excluded_orders.push({
          ...order,
          exclude_reason: `Pedido de logística postergado a período posterior`
        });
        return;
      }

      // Exclusion Check 0.1b: Delivery status check
      const delList = Array.isArray(order.deliveries) ? order.deliveries : (order.deliveries ? [order.deliveries] : []);
      const del = delList[0];
      if (del && (del.status === 'postergado' || del.status === 'fallido' || del.status === 'cancelado')) {
        sellerEntry.excluded_orders.push({
          ...order,
          exclude_reason: `Entrega de logística postergada o fallida (${del.status})`
        });
        return;
      }

      // Exclusion Check 1: Must be Entregado
      if (order.status !== 'Entregado') {
        sellerEntry.excluded_orders.push({ ...order, exclude_reason: 'No Entregado (Requiere estado Entregado)' });
        return;
      }

      // Exclusion Check 2: Orders linked to exchanges or starting with CAMB/DEV
      const hasExchangePrefix = legacyParts.some((p: string) => p.startsWith('camb') || p.startsWith('dev'));
      const isExchange = exchangeOrderIds.has(order.id) || legacyParts.some((p: string) => p && exchangeLegacyCodes.has(p)) || hasExchangePrefix;
      if (isExchange) {
        sellerEntry.excluded_orders.push({ ...order, exclude_reason: 'Asociado a Cambio/Devolución o prefijo CAMB/DEV' });
        return;
      }

      // Deduplicate by legacy_code to match spreadsheet unique order codes
      const codeKey = (order.legacy_code || order.id).trim().toLowerCase();
      const codeSet = processedSellerCodes.get(sellerId)!;
      if (codeSet.has(codeKey)) {
        sellerEntry.excluded_orders.push({
          ...order,
          exclude_reason: `Registro de pedido duplicado (Código ${order.legacy_code || order.id} ya procesado)`
        });
        return;
      }
      codeSet.add(codeKey);

      // Process items for valid order (excluding freight & card surcharges)
      const items = order.order_items || [];
      if (items.length === 0) {
        sellerEntry.excluded_orders.push({ ...order, exclude_reason: 'Sin ítems de productos' });
        return;
      }

      // Calculate raw sum of items
      let rawItemsTotal = 0;
      items.forEach((item: any) => {
        rawItemsTotal += Number(item.subtotal || (item.unit_price * item.quantity) || 0);
      });

      const orderTotal = Number(order.total_amount || 0);
      // Scale factor to proportionally distribute order total_amount across items so order sum matches orderTotal
      let scaleFactor = 1;
      if (rawItemsTotal > 0 && orderTotal > 0) {
        scaleFactor = orderTotal / rawItemsTotal;
      }

      let orderNetProductAmount = 0;

      items.forEach((item: any) => {
        const itemCat = getItemCategory(item, order.category);
        const grp = getCategoryGroupForCategory(itemCat);
        const rawSubtotal = Number(item.subtotal || (item.unit_price * item.quantity) || 0);
        const normalizedSubtotal = rawSubtotal * scaleFactor;

        orderNetProductAmount += normalizedSubtotal;

        const currentGrpSales = sellerEntry.group_sales.get(grp.id) || 0;
        sellerEntry.group_sales.set(grp.id, currentGrpSales + normalizedSubtotal);
      });

      sellerEntry.included_orders.push({
        ...order,
        effective_delivery_date: getOrderDeliveryDate(order),
        net_product_amount: orderNetProductAmount
      });
    });

    // Compute tier reach and commissions
    const result: SellerCommissionSummary[] = [];

    const sortedTiers = [...config.tiers].sort((a, b) => b.min_sales - a.min_sales);

    summariesMap.forEach(sellerData => {
      let totalNetSales = 0;
      sellerData.group_sales.forEach(sales => { totalNetSales += sales; });

      // Determine reached tier
      let reachedTierMinSales = 0;
      for (const t of sortedTiers) {
        if (totalNetSales >= t.min_sales) {
          reachedTierMinSales = t.min_sales;
          break;
        }
      }

      // Calculate commissions per category group
      let totalCommissionPayable = 0;

      const groupBreakdowns = config.category_groups.map(grp => {
        const groupSales = sellerData.group_sales.get(grp.id) || 0;
        
        // Find rate for reached tier (if below lowest tier threshold, rate is 0%)
        const tierRate = grp.rates.find(r => r.tier_min_sales === reachedTierMinSales) || {
          tier_min_sales: reachedTierMinSales,
          rate_pct: 0
        };

        const ratePct = tierRate.rate_pct || 0;
        const calculatedCommission = groupSales * (ratePct / 100);
        const finalCommission = calculatedCommission; // No monetary cap on commissions

        totalCommissionPayable += finalCommission;

        return {
          group_id: grp.id,
          group_name: grp.name,
          net_sales: groupSales,
          applied_rate_pct: ratePct,
          calculated_commission: calculatedCommission,
          final_commission: finalCommission,
          was_capped: false
        };
      });

      const effectivePct = totalNetSales > 0 ? (totalCommissionPayable / totalNetSales) * 100 : 0;

      let ordersCount = 0;
      sellerData.included_orders.forEach(o => {
        const parts = (o.legacy_code || "").split('/').map((p: string) => p.trim());
        ordersCount += parts.length > 0 ? parts.length : 1;
      });

      result.push({
        seller_id: sellerData.seller_id,
        seller_name: sellerData.seller_name,
        seller_email: sellerData.seller_email,
        total_orders_count: ordersCount,
        total_net_sales: totalNetSales,
        reached_tier_threshold: reachedTierMinSales,
        group_breakdowns: groupBreakdowns,
        total_commission_payable: totalCommissionPayable,
        effective_commission_pct: effectivePct,
        included_orders: sellerData.included_orders,
        excluded_orders: sellerData.excluded_orders
      });
    });

    return result.sort((a, b) => b.total_net_sales - a.total_net_sales);
  }, [orders, sellers, exchanges, products, config]);

  // Filtered Seller Summaries for Table Search
  const filteredSummaries = useMemo(() => {
    if (!searchQuery.trim()) return sellerSummaries;
    const q = searchQuery.toLowerCase();
    return sellerSummaries.filter(s => 
      s.seller_name.toLowerCase().includes(q) ||
      s.seller_email.toLowerCase().includes(q)
    );
  }, [sellerSummaries, searchQuery]);

  // Company Overview Stats
  const companyStats = useMemo(() => {
    let totalNetSales = 0;
    let totalCommissions = 0;
    let topSellerName = "N/A";
    let topSellerComm = 0;

    sellerSummaries.forEach(s => {
      totalNetSales += s.total_net_sales;
      totalCommissions += s.total_commission_payable;
      if (s.total_commission_payable > topSellerComm) {
        topSellerComm = s.total_commission_payable;
        topSellerName = s.seller_name;
      }
    });

    const avgEffectiveRate = totalNetSales > 0 ? (totalCommissions / totalNetSales) * 100 : 0;

    return {
      totalNetSales,
      totalCommissions,
      topSellerName,
      topSellerComm,
      avgEffectiveRate
    };
  }, [sellerSummaries]);

  // Save Matrix Config to Supabase
  const handleSaveConfig = async () => {
    setSavingConfig(true);
    setConfigSaveSuccess(null);
    try {
      const { error: saveErr } = await supabase
        .from("seller_commission_configs")
        .insert({
          name: `Configuración Comisiones ${new Date().toLocaleDateString()}`,
          rules: config,
          is_active: true
        });

      if (saveErr) throw saveErr;

      setConfigSaveSuccess("¡Matriz de comisiones guardada correctamente!");
      setTimeout(() => setConfigSaveSuccess(null), 4000);
    } catch (err: any) {
      alert("Error al guardar la configuración: " + (err.message || err));
    } finally {
      setSavingConfig(false);
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    if (sellerSummaries.length === 0) return;

    const headers = [
      "Vendedor",
      "Email",
      "Pedidos Incluidos",
      "Facturacion Neta ($ ARS)",
      "Tramo Alcanzado ($)",
      ...config.category_groups.flatMap(g => [
        `Ventas ${g.name} ($)`,
        `% ${g.name}`,
        `Comision ${g.name} ($)`
      ]),
      "Comision Total Liquidar ($ ARS)",
      "% Tasa Efectiva"
    ];

    const rows = sellerSummaries.map(s => {
      const groupCols = config.category_groups.flatMap(grp => {
        const bd = s.group_breakdowns.find(b => b.group_id === grp.id);
        return [
          bd?.net_sales || 0,
          `${bd?.applied_rate_pct || 0}%`,
          bd?.final_commission || 0
        ];
      });

      return [
        `"${s.seller_name.replace(/"/g, '""')}"`,
        `"${s.seller_email}"`,
        s.total_orders_count,
        s.total_net_sales,
        s.reached_tier_threshold,
        ...groupCols,
        s.total_commission_payable,
        `"${s.effective_commission_pct.toFixed(2)}%"`
      ].join(",");
    });

    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + [headers.join(","), ...rows].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Liquidacion_Comisiones_${selectedYear}_${selectedMonth}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[450px] gap-3">
        <Loader2 className="w-10 h-10 text-brand-600 animate-spin" />
        <span className="text-sm font-bold text-slate-500 uppercase tracking-wider animate-pulse">
          Calculando comisiones sobre ventas netas...
        </span>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6 pb-16">
      {/* Top Header Title & Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-brand-600 flex items-center justify-center text-white shadow-md shadow-brand-600/30">
              <Coins className="w-5.5 h-5.5" />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 tracking-tight uppercase">
                Cálculo de Comisiones de Vendedores
              </h1>
              <p className="text-xs text-slate-500 font-medium">
                Liquidación mensual por tramos de facturación y categorías (excluye fletes, recargos y cambios).
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Period Selector Dropdowns */}
          <div className="flex items-center gap-1.5 bg-slate-100 p-1.5 rounded-xl text-xs font-bold">
            <Calendar className="w-4 h-4 text-slate-500 ml-1" />
            <select
              value={selectedMonth}
              onChange={e => setSelectedMonth(Number(e.target.value))}
              className="bg-white px-2 py-1 rounded-lg border border-slate-200 text-slate-900 font-bold focus:outline-none cursor-pointer"
            >
              {MONTH_NAMES.map((m, idx) => (
                <option key={idx} value={idx + 1}>{m}</option>
              ))}
            </select>
            <select
              value={selectedYear}
              onChange={e => setSelectedYear(Number(e.target.value))}
              className="bg-white px-2 py-1 rounded-lg border border-slate-200 text-slate-900 font-bold focus:outline-none cursor-pointer"
            >
              {[2024, 2025, 2026, 2027].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          <button
            onClick={loadAllData}
            disabled={refreshing}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
            title="Recalcular comisiones"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-brand-600" : ""}`} />
            Recalcular
          </button>
          
          <button
            onClick={handleExportCSV}
            disabled={sellerSummaries.length === 0}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl flex items-center gap-2 shadow-sm transition-all cursor-pointer disabled:opacity-50"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            Exportar CSV
          </button>
        </div>
      </div>

      {/* KPI Cards Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Net Product Sales */}
        <div className="bg-slate-950 text-white p-5 rounded-2xl border border-slate-900 shadow-lg relative overflow-hidden">
          <div className="absolute -right-4 -bottom-4 opacity-10 text-brand-400 pointer-events-none">
            <DollarSign className="w-32 h-32" />
          </div>
          <span className="text-[10px] font-black uppercase tracking-widest text-brand-400 block mb-1">
            Facturación Neta Evaluada
          </span>
          <div className="text-2xl font-black tracking-tight text-white">
            {formatPrice(companyStats.totalNetSales)}
          </div>
          <div className="mt-3 text-xs text-slate-400 font-medium border-t border-slate-900 pt-2.5">
            Período: <b className="text-white">{periodLabel}</b>
          </div>
        </div>

        {/* Total Commissions to Liquidate */}
        <div className="bg-emerald-50 border border-emerald-200 p-5 rounded-2xl shadow-sm relative overflow-hidden">
          <span className="text-[10px] font-black uppercase tracking-widest text-emerald-800 block mb-1 flex items-center gap-1">
            <Coins className="w-3.5 h-3.5 text-emerald-600" /> Comisiones a Liquidar
          </span>
          <div className="text-2xl font-black tracking-tight text-emerald-950">
            {formatPrice(companyStats.totalCommissions)}
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-emerald-800 font-bold border-t border-emerald-200/60 pt-2.5">
            <span>Tasa promedio global:</span>
            <span className="bg-emerald-200 text-emerald-900 px-2 py-0.5 rounded-full text-[10px]">
              {companyStats.avgEffectiveRate.toFixed(2)}%
            </span>
          </div>
        </div>

        {/* Top Seller */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">
            Vendedor Mayor Comisión
          </span>
          <div className="text-xl font-black tracking-tight text-slate-900 truncate" title={companyStats.topSellerName}>
            {companyStats.topSellerName}
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-slate-500 font-medium border-t border-slate-100 pt-2.5">
            <span>Comisión asignada:</span>
            <span className="font-black text-brand-600">{formatPrice(companyStats.topSellerComm)}</span>
          </div>
        </div>

        {/* Rules Badge */}
        <div className="bg-slate-50 border border-slate-200 p-5 rounded-2xl shadow-sm relative overflow-hidden">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-1 flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-brand-600" /> Criterios de Liquidación
          </span>
          <div className="text-xs text-slate-700 font-semibold space-y-1">
            <div className="flex items-center gap-1.5 text-[11px]">
              <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Por Fecha de Entrega
            </div>
            <div className="flex items-center gap-1.5 text-[11px]">
              <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Solo Pedidos "Entregados"
            </div>
            <div className="flex items-center gap-1.5 text-[11px]">
              <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Sin Fletes ni Tarjetas
            </div>
            <div className="flex items-center gap-1.5 text-[11px]">
              <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Excluye Pedidos de Cambio
            </div>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center justify-between border-b border-slate-200">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 custom-sidebar-scrollbar">
          <button
            onClick={() => setActiveTab('settlement')}
            className={`flex items-center gap-2 px-5 py-2.5 font-bold text-xs rounded-t-xl transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'settlement'
                ? "bg-white text-brand-600 border border-slate-200 border-b-white -mb-px shadow-xs"
                : "text-slate-500 hover:text-slate-900 hover:bg-slate-100"
            }`}
          >
            <Coins className="w-4 h-4" />
            Liquidación de Comisiones ({sellerSummaries.length})
          </button>

          <button
            onClick={() => setActiveTab('config')}
            className={`flex items-center gap-2 px-5 py-2.5 font-bold text-xs rounded-t-xl transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'config'
                ? "bg-white text-brand-600 border border-slate-200 border-b-white -mb-px shadow-xs"
                : "text-slate-500 hover:text-slate-900 hover:bg-slate-100"
            }`}
          >
            <Sliders className="w-4 h-4" />
            Configurar Matriz de Tramos y Categorías
          </button>
        </div>
      </div>

      {/* TAB CONTENT: Settlement Table */}
      {activeTab === 'settlement' && (
        <div className="space-y-6">
          {/* Table Header Filter */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar vendedor por nombre o email..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              />
            </div>
            
            <div className="text-xs text-slate-500 font-bold">
              Mostrando {filteredSummaries.length} vendedores
            </div>
          </div>

          {/* Liquidation Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-300 uppercase text-[10px] font-black tracking-wider">
                  <tr>
                    <th className="py-4 px-4">Vendedor</th>
                    <th className="py-4 px-4 text-right">Facturación Neta</th>
                    <th className="py-4 px-4 text-center">Tramo Alcanzado</th>
                    {config.category_groups.map(grp => (
                      <th key={grp.id} className="py-4 px-4 text-right bg-slate-900/80 border-l border-slate-800">
                        Comisión {grp.name}
                      </th>
                    ))}
                    <th className="py-4 px-4 text-right text-emerald-400">Total a Liquidar</th>
                    <th className="py-4 px-4 text-center">Auditoría</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredSummaries.length === 0 ? (
                    <tr>
                      <td colSpan={5 + config.category_groups.length} className="py-12 text-center text-slate-400 font-bold">
                        No se encontraron registros de comisiones para este período.
                      </td>
                    </tr>
                  ) : (
                    filteredSummaries.map(s => (
                      <tr key={s.seller_id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-4 px-4 font-bold text-slate-900">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center font-black text-xs border border-slate-200">
                              {s.seller_name.charAt(0)}
                            </div>
                            <div>
                              <span>{s.seller_name}</span>
                              <span className="block text-[10px] text-slate-400 font-normal">{s.seller_email}</span>
                            </div>
                          </div>
                        </td>

                        <td className="py-4 px-4 text-right font-black text-slate-900 text-sm">
                          {formatPrice(s.total_net_sales)}
                          <span className="block text-[10px] text-slate-400 font-normal">
                            {s.total_orders_count} {s.total_orders_count === 1 ? 'pedido' : 'pedidos'}
                          </span>
                        </td>

                        <td className="py-4 px-4 text-center">
                          {s.reached_tier_threshold > 0 ? (
                            <span className="inline-block bg-brand-100 text-brand-900 font-black text-[10px] uppercase px-2.5 py-1 rounded-full border border-brand-200">
                              ≥ {formatPrice(s.reached_tier_threshold)}
                            </span>
                          ) : (
                            <span className="inline-block bg-slate-100 text-slate-500 font-bold text-[10px] uppercase px-2.5 py-1 rounded-full">
                              Sin Tramo ($0)
                            </span>
                          )}
                        </td>

                        {config.category_groups.map(grp => {
                          const bd = s.group_breakdowns.find(b => b.group_id === grp.id);
                          return (
                            <td key={grp.id} className="py-4 px-4 text-right border-l border-slate-100">
                              <div className="font-bold text-slate-800">
                                {formatPrice(bd?.final_commission || 0)}
                              </div>
                              <div className="text-[10px] text-slate-500 flex justify-end gap-1 font-medium">
                                <span>{bd?.applied_rate_pct || 0}% de {formatPrice(bd?.net_sales || 0)}</span>
                                {bd?.was_capped && (
                                  <span className="text-rose-600 font-bold" title={`Tope máximo asignado: ${formatPrice(bd.max_cap_amount || 0)}`}>
                                    (Tope)
                                  </span>
                                )}
                              </div>
                            </td>
                          );
                        })}

                        <td className="py-4 px-4 text-right font-black text-emerald-600 text-base bg-emerald-50/30">
                          {formatPrice(s.total_commission_payable)}
                          <span className="block text-[10px] text-emerald-800 font-bold">
                            Efectivo: {s.effective_commission_pct.toFixed(2)}%
                          </span>
                        </td>

                        <td className="py-4 px-4 text-center">
                          <button
                            onClick={() => setSelectedSellerAudit(s)}
                            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 mx-auto transition-all cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5 text-brand-600" /> Audit
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: Matrix Config Editor */}
      {activeTab === 'config' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h3 className="font-black text-slate-900 text-sm tracking-tight uppercase flex items-center gap-2">
                <Sliders className="w-4 h-4 text-brand-600" />
                Matriz Configurable de Tramos y Porcentajes por Categoría
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Personaliza los escalones de facturación neta mínima y el porcentaje asignado por grupo de productos. El porcentaje máximo escala con la facturación y no limita el cobro en pesos.
              </p>
            </div>

            <div className="flex items-center gap-3">
              {configSaveSuccess && (
                <span className="text-xs font-bold text-emerald-600 flex items-center gap-1 bg-emerald-50 px-3 py-1 rounded-xl border border-emerald-200">
                  <CheckCircle2 className="w-4 h-4" /> {configSaveSuccess}
                </span>
              )}
              <button
                onClick={handleSaveConfig}
                disabled={savingConfig}
                className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs rounded-xl flex items-center gap-2 shadow-sm transition-all cursor-pointer disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {savingConfig ? "Guardando..." : "Guardar Cambios Matriz"}
              </button>
            </div>
          </div>

          {/* Category Groups Editor Panel */}
          <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-black text-slate-900 text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <Package className="w-4 h-4 text-brand-600" />
                  Asignación de Categorías por Grupo ({config.category_groups.length} Grupos)
                </h4>
                <p className="text-[11px] text-slate-500 font-medium">
                  Define qué categorías de productos se agrupan en cada columna de la matriz de comisiones.
                </p>
              </div>

              <button
                onClick={() => {
                  const newId = `group_${Date.now()}`;
                  const newGrp: CategoryGroupConfig = {
                    id: newId,
                    name: "Nuevo Grupo de Categorías",
                    categories: [],
                    rates: config.tiers.map(t => ({ tier_min_sales: t.min_sales, rate_pct: 0 }))
                  };
                  setConfig({ ...config, category_groups: [...config.category_groups, newGrp] });
                }}
                className="px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" /> Agregar Nuevo Grupo
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {config.category_groups.map((grp, grpIdx) => (
                <div key={grp.id} className="bg-white p-4 rounded-xl border border-slate-200 space-y-3 shadow-xs">
                  <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
                    <input
                      type="text"
                      value={grp.name}
                      onChange={e => {
                        const newName = e.target.value;
                        const updatedGroups = [...config.category_groups];
                        updatedGroups[grpIdx].name = newName;
                        setConfig({ ...config, category_groups: updatedGroups });
                      }}
                      className="font-black text-xs text-slate-900 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200 w-full focus:ring-2 focus:ring-brand-500/20"
                      placeholder="Nombre del grupo (ej. Tanques y Pinturas)"
                    />
                    {config.category_groups.length > 1 && (
                      <button
                        onClick={() => {
                          const updatedGroups = config.category_groups.filter((_, idx) => idx !== grpIdx);
                          setConfig({ ...config, category_groups: updatedGroups });
                        }}
                        className="p-1 hover:bg-rose-100 text-rose-600 rounded-lg transition-colors cursor-pointer shrink-0"
                        title="Eliminar este grupo de categorías"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Categories Tags */}
                  <div className="space-y-2">
                    <span className="text-[10px] font-black uppercase text-slate-400 block">
                      Categorías Incluidas ({grp.categories.length})
                    </span>
                    <div className="flex flex-wrap gap-1.5 min-h-[36px] bg-slate-50 p-2 rounded-lg border border-slate-150">
                      {grp.categories.length === 0 ? (
                        <span className="text-[11px] text-slate-400 italic">Sin categorías asignadas (agrega una abajo)</span>
                      ) : (
                        grp.categories.map((cat, catIdx) => (
                          <span
                            key={catIdx}
                            className="bg-brand-50 text-brand-900 border border-brand-200 text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1"
                          >
                            {cat}
                            <button
                              onClick={() => {
                                const updatedCats = grp.categories.filter((_, idx) => idx !== catIdx);
                                const updatedGroups = [...config.category_groups];
                                updatedGroups[grpIdx].categories = updatedCats;
                                setConfig({ ...config, category_groups: updatedGroups });
                              }}
                              className="hover:text-rose-600 cursor-pointer ml-0.5 font-black"
                              title="Remover categoría"
                            >
                              ×
                            </button>
                          </span>
                        ))
                      )}
                    </div>

                    {/* Add Category Select Dropdown */}
                    <div className="flex items-center gap-2 pt-1">
                      <select
                        id={`add-cat-select-${grp.id}`}
                        defaultValue=""
                        onChange={e => {
                          const val = e.target.value;
                          if (val) {
                            const updatedGroups = [...config.category_groups];
                            if (!updatedGroups[grpIdx].categories.some(c => c.toLowerCase() === val.toLowerCase())) {
                              updatedGroups[grpIdx].categories.push(val);
                              setConfig({ ...config, category_groups: updatedGroups });
                            }
                            e.target.value = "";
                          }
                        }}
                        className="flex-1 px-2.5 py-1 text-xs border border-slate-200 rounded-lg bg-white font-bold text-slate-800 focus:ring-2 focus:ring-brand-500/20 cursor-pointer"
                      >
                        <option value="" disabled>
                          {unassignedCategories.length > 0
                            ? `+ Seleccionar categoría sin asignar (${unassignedCategories.length} disponibles)`
                            : "Todas las categorías registradas ya están asignadas"}
                        </option>
                        {unassignedCategories.map(cat => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Matrix Editor Grid */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border border-slate-200 rounded-2xl overflow-hidden">
              <thead className="bg-slate-950 text-slate-200 uppercase text-[10px] font-black tracking-wider">
                <tr>
                  <th className="py-3.5 px-4 w-44">Facturación Mínima ($)</th>
                  {config.category_groups.map(grp => (
                    <th key={grp.id} colSpan={2} className="py-3.5 px-4 text-center border-l border-slate-800">
                      {grp.name}
                    </th>
                  ))}
                  <th className="py-3.5 px-4 text-center w-16">Acciones</th>
                </tr>
                <tr className="bg-slate-900 text-slate-400 text-[9px]">
                  <th className="py-2 px-4">Escalón / Tramo</th>
                  {config.category_groups.map(grp => (
                    <React.Fragment key={grp.id}>
                      <th className="py-2 px-3 border-l border-slate-800 text-right">% Comisión (Configurable)</th>
                      <th className="py-2 px-3 text-right">Ejemplo sobre Tramo ($)</th>
                    </React.Fragment>
                  ))}
                  <th className="py-2 px-4 text-center">-</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {config.tiers.map((t, tierIdx) => (
                  <tr key={tierIdx} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-bold">
                      <div className="flex items-center gap-1 text-slate-900 font-mono">
                        <span>$</span>
                        <input
                          type="number"
                          value={t.min_sales}
                          onChange={e => {
                            const newMin = Number(e.target.value);
                            const updatedTiers = [...config.tiers];
                            const oldMin = updatedTiers[tierIdx].min_sales;
                            updatedTiers[tierIdx].min_sales = newMin;

                            // Update corresponding rate thresholds
                            const updatedGroups = config.category_groups.map(grp => ({
                              ...grp,
                              rates: grp.rates.map(r => r.tier_min_sales === oldMin ? { ...r, tier_min_sales: newMin } : r)
                            }));

                            setConfig({ ...config, tiers: updatedTiers, category_groups: updatedGroups });
                          }}
                          className="w-full px-2 py-1 border border-slate-200 rounded-lg text-xs font-bold bg-white text-slate-900 focus:ring-2 focus:ring-brand-500/20"
                        />
                      </div>
                    </td>

                    {config.category_groups.map((grp, grpIdx) => {
                      const rateObj = grp.rates.find(r => r.tier_min_sales === t.min_sales) || {
                        tier_min_sales: t.min_sales,
                        rate_pct: 0
                      };

                      const exampleAmount = Math.round(t.min_sales * (rateObj.rate_pct / 100));

                      return (
                        <React.Fragment key={grp.id}>
                          <td className="py-3 px-3 border-l border-slate-200 text-right font-bold">
                            <div className="flex items-center justify-end gap-1">
                              <input
                                type="number"
                                step="0.01"
                                value={rateObj.rate_pct}
                                onChange={e => {
                                  const val = Number(e.target.value);
                                  const updatedGroups = [...config.category_groups];
                                  const grpToUpdate = updatedGroups[grpIdx];
                                  const existingRateIdx = grpToUpdate.rates.findIndex(r => r.tier_min_sales === t.min_sales);
                                  if (existingRateIdx >= 0) {
                                    grpToUpdate.rates[existingRateIdx].rate_pct = val;
                                  } else {
                                    grpToUpdate.rates.push({ tier_min_sales: t.min_sales, rate_pct: val });
                                  }
                                  setConfig({ ...config, category_groups: updatedGroups });
                                }}
                                className="w-20 px-2 py-1 border border-slate-200 rounded-lg text-xs font-black bg-white text-right text-brand-600 focus:ring-2 focus:ring-brand-500/20"
                              />
                              <span>%</span>
                            </div>
                          </td>

                          <td className="py-3 px-3 text-right font-mono font-bold text-slate-600">
                            {formatPrice(exampleAmount)}
                          </td>
                        </React.Fragment>
                      );
                    })}

                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => {
                          const updatedTiers = config.tiers.filter((_, idx) => idx !== tierIdx);
                          setConfig({ ...config, tiers: updatedTiers });
                        }}
                        className="p-1.5 hover:bg-rose-100 text-rose-600 rounded-lg transition-colors cursor-pointer"
                        title="Eliminar tramo"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            onClick={() => {
              const lastTier = config.tiers[config.tiers.length - 1]?.min_sales || 0;
              const newMin = lastTier + 10000000;
              const updatedTiers = [...config.tiers, { min_sales: newMin }];
              setConfig({ ...config, tiers: updatedTiers });
            }}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl flex items-center gap-2 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Agregar Nuevo Escalón / Tramo
          </button>
        </div>
      )}

      {/* Seller Order Audit Modal */}
      {selectedSellerAudit && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
            <div className="p-5 bg-slate-950 text-white flex items-center justify-between shrink-0">
              <div>
                <h3 className="font-black text-sm uppercase tracking-wider">
                  Auditoría de Pedidos - {selectedSellerAudit.seller_name}
                </h3>
                <p className="text-xs text-slate-400">
                  Desglose de pedidos incluidos y excluidos para el período {periodLabel}.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const headers = ["ID Pedido", "Codigo Legacy", "Fecha Entrega", "Cliente", "Monto Neto Productos", "Monto Total Pedido", "Estado", "Incluido en Comisiones"];
                    const rows: string[][] = [];
                    selectedSellerAudit.included_orders.forEach((o: any) => {
                      rows.push([
                        o.id,
                        o.legacy_code || "",
                        o.effective_delivery_date || o.order_date || "",
                        `"${(o.customer_name || "").replace(/"/g, '""')}"`,
                        String(o.net_product_amount || 0),
                        String(o.total_amount || 0),
                        o.status || "",
                        "SI"
                      ]);
                    });
                    selectedSellerAudit.excluded_orders.forEach((o: any) => {
                      rows.push([
                        o.id,
                        o.legacy_code || "",
                        o.effective_delivery_date || o.order_date || "",
                        `"${(o.customer_name || "").replace(/"/g, '""')}"`,
                        "0",
                        String(o.total_amount || 0),
                        o.status || "",
                        `NO (${o.exclude_reason || 'Excluido'})`
                      ]);
                    });
                    const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
                    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement("a");
                    link.href = url;
                    link.setAttribute("download", `auditoria_pedidos_${selectedSellerAudit.seller_name.replace(/\s+/g, "_")}_${selectedYear}_${selectedMonth}.csv`);
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                  }}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" /> Exportar CSV
                </button>
                <button
                  onClick={() => setSelectedSellerAudit(null)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-lg transition-colors cursor-pointer"
                >
                  Cerrar
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto space-y-6 flex-1 custom-sidebar-scrollbar">
              {/* Summary Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs font-semibold">
                <div>
                  <span className="block text-[10px] text-slate-400 uppercase font-black">Facturación Neta</span>
                  <span className="font-black text-slate-900 text-sm">{formatPrice(selectedSellerAudit.total_net_sales)}</span>
                </div>
                <div>
                  <span className="block text-[10px] text-slate-400 uppercase font-black">Tramo Alcanzado</span>
                  <span className="font-black text-brand-600 text-sm">≥ {formatPrice(selectedSellerAudit.reached_tier_threshold)}</span>
                </div>
                <div>
                  <span className="block text-[10px] text-slate-400 uppercase font-black">Comisión Total</span>
                  <span className="font-black text-emerald-600 text-sm">{formatPrice(selectedSellerAudit.total_commission_payable)}</span>
                </div>
                <div>
                  <span className="block text-[10px] text-slate-400 uppercase font-black">Pedidos Válidos</span>
                  <span className="font-bold text-slate-800">{selectedSellerAudit.total_orders_count} pedidos</span>
                </div>
              </div>

              {/* Included Orders List */}
              <div className="space-y-3">
                <h4 className="font-black text-slate-900 text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Pedidos Incluidos en Cálculo ({selectedSellerAudit.total_orders_count})
                </h4>

                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 text-slate-700 font-black text-[10px] uppercase">
                      <tr>
                        <th className="py-2.5 px-3">ID Pedido</th>
                        <th className="py-2.5 px-3">Fecha Entrega</th>
                        <th className="py-2.5 px-3">Cliente</th>
                        <th className="py-2.5 px-3 text-right">Monto Neto Productos</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedSellerAudit.included_orders.map(o => (
                        <tr key={o.id} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3 font-mono font-bold text-brand-600">#{o.id.substring(0, 8)}</td>
                          <td className="py-2.5 px-3">{o.effective_delivery_date || o.order_date}</td>
                          <td className="py-2.5 px-3 font-bold">{o.customer_name}</td>
                          <td className="py-2.5 px-3 text-right font-black text-slate-900">
                            {formatPrice(o.net_product_amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Excluded Orders List */}
              {selectedSellerAudit.excluded_orders.length > 0 && (
                <div className="space-y-3 pt-4 border-t border-slate-200">
                  <h4 className="font-black text-slate-900 text-xs uppercase tracking-wider flex items-center gap-1.5 text-rose-700">
                    <AlertTriangle className="w-4 h-4 text-rose-600" />
                    Pedidos Excluidos del Cálculo ({selectedSellerAudit.excluded_orders.length})
                  </h4>

                  <div className="overflow-x-auto border border-rose-200 bg-rose-50/30 rounded-xl">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-rose-100/60 text-rose-900 font-black text-[10px] uppercase">
                        <tr>
                          <th className="py-2.5 px-3">ID Pedido</th>
                          <th className="py-2.5 px-3">Cliente</th>
                          <th className="py-2.5 px-3">Motivo de Exclusión</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-rose-100">
                        {selectedSellerAudit.excluded_orders.map((o, idx) => (
                          <tr key={idx} className="hover:bg-rose-50">
                            <td className="py-2.5 px-3 font-mono font-bold">#{o.id.substring(0, 8)}</td>
                            <td className="py-2.5 px-3 font-bold">{o.customer_name}</td>
                            <td className="py-2.5 px-3 font-bold text-rose-700">{o.exclude_reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

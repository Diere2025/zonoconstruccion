"use client";

import React, { useEffect, useState, useMemo } from "react";
import { formatPrice } from "@/lib/utils";
import { 
  TrendingUp, 
  Package, 
  Award, 
  ArrowRight, 
  Loader2, 
  Calculator, 
  CreditCard, 
  PlusCircle, 
  ShoppingCart, 
  ShieldCheck, 
  DollarSign, 
  Truck, 
  RefreshCw, 
  FileText, 
  CheckCircle2, 
  Clock, 
  AlertTriangle,
  Users
} from "lucide-react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

interface SellerStats {
  totalSales: number;
  totalOrders: number;
  averageTicket: number;
  deliveredCount: number;
  pendingCount: number;
  reviewCount: number;
  cancelledCount: number;
  retailSales: number;
  retailCount: number;
  wholesaleSales: number;
  wholesaleCount: number;
}

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

export default function VendedoresDashboard() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sellerName, setSellerName] = useState<string>("Vendedor");
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [stats, setStats] = useState<SellerStats>({
    totalSales: 0,
    totalOrders: 0,
    averageTicket: 0,
    deliveredCount: 0,
    pendingCount: 0,
    reviewCount: 0,
    cancelledCount: 0,
    retailSales: 0,
    retailCount: 0,
    wholesaleSales: 0,
    wholesaleCount: 0,
  });

  const now = useMemo(() => new Date(), []);
  const currentMonthName = MONTH_NAMES[now.getMonth()];
  const currentYear = now.getFullYear();

  const loadDashboardData = async (isManualRefresh = false) => {
    try {
      if (isManualRefresh) setRefreshing(true);
      else setLoading(true);

      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) return;

      const userId = userData.user.id;
      const userEmail = (userData.user.email || "").toLowerCase();

      // Consultar perfil de vendedor
      const { data: seller } = await supabase
        .from("sellers")
        .select("id, full_name, email, role, seller_type")
        .or(`id.eq.${userId},email.ilike.${userEmail}`)
        .maybeSingle();

      const fullName = seller?.full_name || userData.user.user_metadata?.full_name || userEmail.split("@")[0] || "Vendedor";
      setSellerName(fullName);

      const sellerIds = Array.from(new Set([userId, seller?.id].filter(Boolean)));

      // Calcular rango de mes actual
      const startOfMonthStr = `${currentYear}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
      const startOfMonthDate = new Date(currentYear, now.getMonth(), 1, 0, 0, 0, 0);

      // Consultar pedidos del vendedor
      const { data: orders, error: ordersErr } = await supabase
        .from("orders")
        .select("id, legacy_code, customer_name, locality, address, total_amount, status, channel, order_date, created_at, seller_id")
        .in("seller_id", sellerIds)
        .order("created_at", { ascending: false });

      if (ordersErr) {
        console.warn("Error cargando pedidos del vendedor:", ordersErr);
      }

      const allOrders = orders || [];

      // Guardar últimos 8 pedidos recientes
      setRecentOrders(allOrders.slice(0, 8));

      // Filtrar pedidos pertenecientes al mes en curso
      const monthlyOrders = allOrders.filter((o) => {
        if (o.order_date) {
          const dStr = String(o.order_date).split("T")[0];
          if (dStr >= startOfMonthStr) return true;
        }
        if (o.created_at) {
          const d = new Date(o.created_at);
          if (d >= startOfMonthDate) return true;
        }
        return false;
      });

      const validMonthlyOrders = monthlyOrders.filter(
        (o) => o.status !== "Anulado" && o.status !== "Cancelado"
      );

      const totalSales = validMonthlyOrders.reduce((acc, o) => acc + (Number(o.total_amount) || 0), 0);
      const totalOrders = monthlyOrders.length;
      const averageTicket = validMonthlyOrders.length > 0 ? totalSales / validMonthlyOrders.length : 0;

      const deliveredCount = monthlyOrders.filter((o) => o.status === "Entregado").length;
      const pendingCount = monthlyOrders.filter((o) => o.status === "Pendiente").length;
      const reviewCount = monthlyOrders.filter(
        (o) => o.status === "En Revisión" || o.status === "En Revision"
      ).length;
      const cancelledCount = monthlyOrders.filter(
        (o) => o.status === "Anulado" || o.status === "Cancelado"
      ).length;

      const retailOrders = validMonthlyOrders.filter((o) => o.channel !== "mayorista");
      const wholesaleOrders = validMonthlyOrders.filter((o) => o.channel === "mayorista");

      const retailSales = retailOrders.reduce((acc, o) => acc + (Number(o.total_amount) || 0), 0);
      const wholesaleSales = wholesaleOrders.reduce((acc, o) => acc + (Number(o.total_amount) || 0), 0);

      setStats({
        totalSales,
        totalOrders,
        averageTicket,
        deliveredCount,
        pendingCount,
        reviewCount,
        cancelledCount,
        retailSales,
        retailCount: retailOrders.length,
        wholesaleSales,
        wholesaleCount: wholesaleOrders.length,
      });
    } catch (err) {
      console.warn("Error cargando métricas de vendedor:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return "-";
    try {
      const cleanStr = dateStr.includes("T") ? dateStr.split("T")[0] : dateStr;
      const parts = cleanStr.split("-");
      if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      const day = String(d.getDate()).padStart(2, "0");
      const month = String(d.getMonth() + 1).padStart(2, "0");
      return `${day}/${month}/${d.getFullYear()}`;
    } catch {
      return dateStr;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "Entregado":
        return { bg: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500", label: "Entregado" };
      case "Pendiente":
        return { bg: "bg-amber-50 text-amber-700 border-amber-200", dot: "bg-amber-500", label: "Pendiente" };
      case "En Revisión":
      case "En Revision":
        return { bg: "bg-blue-50 text-blue-700 border-blue-200", dot: "bg-blue-500", label: "En Revisión" };
      case "Anulado":
      case "Cancelado":
        return { bg: "bg-rose-50 text-rose-700 border-rose-200", dot: "bg-rose-500", label: "Anulado" };
      default:
        return { bg: "bg-slate-50 text-slate-700 border-slate-200", dot: "bg-slate-400", label: status || "Pendiente" };
    }
  };

  const sellerFirstName = sellerName.split(" ")[0];

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-9 h-9 text-brand-600 animate-spin" />
        <p className="text-slate-500 text-xs font-semibold">Cargando tu panel de ventas...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-black text-slate-900 tracking-tight">
              ¡Hola, {sellerFirstName}! 👋
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-brand-50 text-brand-700 border border-brand-200/60">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-pulse" />
              Panel de Ventas
            </span>
          </div>
          <p className="text-xs text-slate-500 font-medium mt-1">
            Resumen de tu actividad y estadísticas del mes de{" "}
            <span className="font-bold text-slate-700">{currentMonthName} {currentYear}</span>.
          </p>
        </div>

        <button
          type="button"
          onClick={() => loadDashboardData(true)}
          disabled={refreshing}
          className="flex items-center gap-2 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-2xs shrink-0 disabled:opacity-50"
          title="Actualizar métricas en tiempo real"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${refreshing ? "animate-spin" : ""}`} />
          <span>{refreshing ? "Actualizando..." : "Actualizar"}</span>
        </button>
      </div>

      {/* Accesos Rápidos Principales */}
      <div>
        <div className="flex items-center justify-between mb-3 px-1">
          <h2 className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4 text-brand-600" />
            Accesos de Trabajo
          </h2>
          <span className="text-[11px] font-semibold text-slate-400">Atajos rápidos</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Presupuestar */}
          <Link href="/vendedores/presupuestos" className="group">
            <div className="bg-white hover:bg-indigo-50/40 p-4 rounded-2xl border border-slate-200/80 hover:border-indigo-300 shadow-2xs hover:shadow-sm transition-all duration-200 flex flex-col justify-between h-full group-hover:-translate-y-0.5">
              <div className="flex items-start justify-between gap-2">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <Calculator className="w-5 h-5" />
                </div>
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-100/70 text-indigo-700">
                  Minorista
                </span>
              </div>
              <div className="mt-3">
                <h3 className="text-sm font-black text-slate-900 group-hover:text-indigo-900 transition-colors flex items-center justify-between">
                  <span>Presupuestar</span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-indigo-600 group-hover:translate-x-1 transition-all" />
                </h3>
                <p className="text-[11px] text-slate-500 font-medium mt-0.5 leading-snug">
                  Cotizar artículos y enviar a WhatsApp
                </p>
              </div>
            </div>
          </Link>

          {/* Cotizar Mayorista */}
          <Link href="/vendedores/presupuestos-mayorista" className="group">
            <div className="bg-white hover:bg-emerald-50/40 p-4 rounded-2xl border border-slate-200/80 hover:border-emerald-300 shadow-2xs hover:shadow-sm transition-all duration-200 flex flex-col justify-between h-full group-hover:-translate-y-0.5">
              <div className="flex items-start justify-between gap-2">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-100/70 text-emerald-700">
                  Mayorista
                </span>
              </div>
              <div className="mt-3">
                <h3 className="text-sm font-black text-slate-900 group-hover:text-emerald-900 transition-colors flex items-center justify-between">
                  <span>Cotizar</span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-emerald-600 group-hover:translate-x-1 transition-all" />
                </h3>
                <p className="text-[11px] text-slate-500 font-medium mt-0.5 leading-snug">
                  Presupuestos B2B y lista mayorista
                </p>
              </div>
            </div>
          </Link>

          {/* Chequear Pagos */}
          <Link href="/admin/cobros-mp" className="group">
            <div className="bg-white hover:bg-sky-50/40 p-4 rounded-2xl border border-slate-200/80 hover:border-sky-300 shadow-2xs hover:shadow-sm transition-all duration-200 flex flex-col justify-between h-full group-hover:-translate-y-0.5">
              <div className="flex items-start justify-between gap-2">
                <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 border border-sky-100 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-sky-100/70 text-sky-700">
                  Cobros MP
                </span>
              </div>
              <div className="mt-3">
                <h3 className="text-sm font-black text-slate-900 group-hover:text-sky-900 transition-colors flex items-center justify-between">
                  <span>Chequear Pagos</span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-sky-600 group-hover:translate-x-1 transition-all" />
                </h3>
                <p className="text-[11px] text-slate-500 font-medium mt-0.5 leading-snug">
                  Cobros en vivo y acreditaciones
                </p>
              </div>
            </div>
          </Link>

          {/* Cargar Pedido */}
          <Link href="/vendedores/pedidos?tab=form&client_type=minoristas" className="group">
            <div className="bg-white hover:bg-violet-50/40 p-4 rounded-2xl border border-slate-200/80 hover:border-violet-300 shadow-2xs hover:shadow-sm transition-all duration-200 flex flex-col justify-between h-full group-hover:-translate-y-0.5">
              <div className="flex items-start justify-between gap-2">
                <div className="w-10 h-10 rounded-xl bg-violet-50 text-violet-600 border border-violet-100 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <PlusCircle className="w-5 h-5" />
                </div>
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-violet-100/70 text-violet-700">
                  Nuevo
                </span>
              </div>
              <div className="mt-3">
                <h3 className="text-sm font-black text-slate-900 group-hover:text-violet-900 transition-colors flex items-center justify-between">
                  <span>Cargar Pedido</span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-violet-600 group-hover:translate-x-1 transition-all" />
                </h3>
                <p className="text-[11px] text-slate-500 font-medium mt-0.5 leading-snug">
                  Registrar venta con reserva de stock
                </p>
              </div>
            </div>
          </Link>

          {/* Mis Pedidos */}
          <Link href="/vendedores/pedidos?tab=list&client_type=minoristas" className="group">
            <div className="bg-white hover:bg-slate-100/70 p-4 rounded-2xl border border-slate-200/80 hover:border-slate-300 shadow-2xs hover:shadow-sm transition-all duration-200 flex flex-col justify-between h-full group-hover:-translate-y-0.5">
              <div className="flex items-start justify-between gap-2">
                <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 border border-slate-200 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <ShoppingCart className="w-5 h-5" />
                </div>
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-200/70 text-slate-700">
                  Listado
                </span>
              </div>
              <div className="mt-3">
                <h3 className="text-sm font-black text-slate-900 group-hover:text-slate-950 transition-colors flex items-center justify-between">
                  <span>Mis Pedidos</span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-700 group-hover:translate-x-1 transition-all" />
                </h3>
                <p className="text-[11px] text-slate-500 font-medium mt-0.5 leading-snug">
                  Seguimiento de pedidos y entregas
                </p>
              </div>
            </div>
          </Link>
        </div>
      </div>

      {/* Estadísticas del Mes */}
      <div>
        <div className="flex items-center justify-between mb-3 px-1">
          <h2 className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
            <DollarSign className="w-4 h-4 text-emerald-600" />
            Tus Ventas de {currentMonthName}
          </h2>
          <span className="text-[11px] font-semibold text-slate-400">
            {stats.totalOrders} pedidos totales este mes
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Total Facturado */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-500">Ventas del Mes</span>
              <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center shrink-0">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-black text-slate-900 tracking-tight">
                {formatPrice(stats.totalSales)}
              </div>
              <p className="text-[11px] text-emerald-600 font-bold mt-1">
                Facturado neto en {currentMonthName}
              </p>
            </div>
          </div>

          {/* Card 2: Cantidad de Pedidos */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-500">Pedidos Cargados</span>
              <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center shrink-0">
                <Package className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-black text-slate-900 tracking-tight">
                {stats.totalOrders}
              </div>
              <p className="text-[11px] text-slate-400 font-medium mt-1">
                {stats.totalOrders === 1 ? "1 pedido registrado" : `${stats.totalOrders} pedidos registrados`}
              </p>
            </div>
          </div>

          {/* Card 3: Ticket Promedio */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-500">Ticket Promedio</span>
              <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100 flex items-center justify-center shrink-0">
                <Award className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-black text-slate-900 tracking-tight">
                {formatPrice(stats.averageTicket)}
              </div>
              <p className="text-[11px] text-slate-400 font-medium mt-1">
                Monto promedio por pedido
              </p>
            </div>
          </div>

          {/* Card 4: Estado de Entregas */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-500">Estado de Entregas</span>
              <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 border border-amber-100 flex items-center justify-center shrink-0">
                <Truck className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold">
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                {stats.deliveredCount} Entregados
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 text-[11px] font-bold">
                <Clock className="w-3 h-3 text-amber-600" />
                {stats.pendingCount} Pendientes
              </span>
              {stats.reviewCount > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 text-[11px] font-bold">
                  <AlertTriangle className="w-3 h-3 text-blue-600" />
                  {stats.reviewCount} En Revisión
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Desglose por Canal & Últimos Pedidos */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Desglose Canal */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <Users className="w-4 h-4 text-brand-600" />
              Canales de Venta
            </h3>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              {currentMonthName}
            </span>
          </div>

          <div className="space-y-3">
            {/* Minorista */}
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-brand-500" />
                  Minoristas (B2C)
                </span>
                <span className="text-slate-500 text-[11px]">
                  {stats.retailCount} {stats.retailCount === 1 ? "pedido" : "pedidos"}
                </span>
              </div>
              <div className="text-base font-black text-slate-900">
                {formatPrice(stats.retailSales)}
              </div>
            </div>

            {/* Mayorista */}
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  Mayoristas (B2B)
                </span>
                <span className="text-slate-500 text-[11px]">
                  {stats.wholesaleCount} {stats.wholesaleCount === 1 ? "pedido" : "pedidos"}
                </span>
              </div>
              <div className="text-base font-black text-slate-900">
                {formatPrice(stats.wholesaleSales)}
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100">
            <Link
              href="/vendedores/pedidos?tab=form&client_type=minoristas"
              className="w-full py-2.5 bg-brand-600 hover:bg-brand-700 active:scale-98 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-xs"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Cargar Nuevo Pedido</span>
            </Link>
          </div>
        </div>

        {/* Últimos Pedidos */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden flex flex-col justify-between">
          <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <ShoppingCart className="w-4 h-4 text-brand-600" />
                Tus Últimos Pedidos
              </h3>
              <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                Pedidos recientes cargados con tu usuario
              </p>
            </div>
            <Link
              href="/vendedores/pedidos?tab=list&client_type=minoristas"
              className="text-xs font-bold text-brand-600 hover:text-brand-700 flex items-center gap-1 group"
            >
              <span>Ver todos</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </div>

          <div className="flex-1 overflow-x-auto">
            {recentOrders.length === 0 ? (
              <div className="p-8 text-center text-slate-400 space-y-2">
                <Package className="w-8 h-8 mx-auto text-slate-300" />
                <p className="text-xs font-bold text-slate-600">No registrás pedidos recientes</p>
                <p className="text-[11px] text-slate-400">
                  ¡Hacé clic en Cargar Pedido o Presupuestar para ingresar una venta!
                </p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50/70 border-b border-slate-100 text-[10px] font-black uppercase tracking-wider text-slate-400">
                    <th className="py-2.5 px-3.5">Código</th>
                    <th className="py-2.5 px-3">Fecha</th>
                    <th className="py-2.5 px-3">Cliente</th>
                    <th className="py-2.5 px-3">Localidad</th>
                    <th className="py-2.5 px-3 text-right">Total</th>
                    <th className="py-2.5 px-3 text-center">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {recentOrders.map((ord) => {
                    const badge = getStatusBadge(ord.status);
                    return (
                      <tr key={ord.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-2.5 px-3.5 font-mono font-bold text-slate-900">
                          <Link
                            href={`/vendedores/pedidos?tab=list&search=${encodeURIComponent(ord.legacy_code || "")}`}
                            className="hover:text-brand-600 hover:underline"
                            title="Buscar este pedido en el listado"
                          >
                            {ord.legacy_code || "S/C"}
                          </Link>
                        </td>
                        <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">
                          {formatDate(ord.order_date || ord.created_at)}
                        </td>
                        <td className="py-2.5 px-3 font-bold text-slate-800 truncate max-w-[140px]" title={ord.customer_name}>
                          {ord.customer_name || "Consumidor Final"}
                        </td>
                        <td className="py-2.5 px-3 text-slate-500 truncate max-w-[120px]" title={ord.locality}>
                          {ord.locality || "-"}
                        </td>
                        <td className="py-2.5 px-3 text-right font-black text-slate-900 whitespace-nowrap">
                          {formatPrice(Number(ord.total_amount) || 0)}
                        </td>
                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${badge.bg}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                            {badge.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div className="p-3 bg-slate-50/50 border-t border-slate-100 flex justify-end">
            <Link
              href="/vendedores/pedidos?tab=list&client_type=minoristas"
              className="text-xs font-bold text-slate-600 hover:text-slate-900 flex items-center gap-1"
            >
              <span>Ir al listado completo de pedidos</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import React, { useEffect, useState } from "react";
import { formatPrice } from "@/lib/utils";
import { TrendingUp, Package, Award, ArrowRight, Loader2, AlertCircle, FileText, ShoppingBag } from "lucide-react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

export default function VendedoresDashboard() {
  const [loading, setLoading] = useState(true);
  const [migrationMissing, setMigrationMissing] = useState(false);
  const [stats, setStats] = useState({
    commissionRate: 8.0,
    monthlySales: 0,
    activeOrders: 0,
    estimatedCommission: 0, // Comisión acumulada disponible
  });

  useEffect(() => {
    async function loadDashboardData() {
      try {
        setLoading(true);
        const { data: userData } = await supabase.auth.getUser();
        if (!userData?.user) return;

        const userId = userData.user.id;

        // Redirigir si es administrador
        const { data: seller } = await supabase
          .from("sellers")
          .select("role")
          .eq("id", userId)
          .single();

        if (seller?.role === "admin") {
          window.location.href = "/admin/dashboard";
          return;
        }

        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        // Ejecutar consultas en paralelo para evitar cuellos de botella de red
        const [balanceRes, ordersCountRes, monthlyOrdersRes] = await Promise.all([
          supabase
            .from("seller_commission_balances")
            .select("commission_rate, total_commission_earned, total_commission_paid, commission_available")
            .eq("seller_id", userId)
            .maybeSingle(),
          supabase
            .from("orders")
            .select("*", { count: "exact", head: true })
            .eq("seller_id", userId)
            .in("status", ["Pendiente", "Confirmado"]),
          supabase
            .from("orders")
            .select("total_amount")
            .eq("seller_id", userId)
            .eq("status", "Entregado")
            .gte("created_at", startOfMonth.toISOString())
        ]);

        if (balanceRes.error) {
          if (balanceRes.error.code === "P0001" || balanceRes.error.message.includes("relation")) {
            setMigrationMissing(true);
          }
          throw balanceRes.error;
        }

        const balance = balanceRes.data;
        const activeOrdersCount = ordersCountRes.count;
        const monthlyOrders = monthlyOrdersRes.data;

        const monthlySalesSum = monthlyOrders?.reduce((acc, o) => acc + (Number(o.total_amount) || 0), 0) || 0;

        setStats({
          commissionRate: balance ? Number(balance.commission_rate) : 8.0,
          monthlySales: monthlySalesSum,
          activeOrders: activeOrdersCount || 0,
          estimatedCommission: balance ? Number(balance.commission_available) : 0,
        });
      } catch (err) {
        console.warn("Error cargando estadísticas reales del vendedor. Usando valores por defecto o cero.", err);
      } finally {
        setLoading(false);
      }
    }

    loadDashboardData();
  }, []);

  if (loading) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-10 h-10 text-brand-600 animate-spin" />
        <p className="text-slate-500 font-medium">Cargando estadísticas reales...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-black text-slate-900 tracking-tight">Mi Panel de Vendedor</h1>
        <p className="text-[11px] text-slate-400 font-semibold">Resumen de tu actividad y comisiones en tiempo real.</p>
      </div>

      {migrationMissing && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 p-3 rounded-xl flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-xs">Migración SQL Requerida</p>
            <p className="text-[11px] text-amber-700 mt-0.5">
              Para ver estadísticas y comisiones reales, recuerda ejecutar el script <code className="bg-amber-100 px-1.5 py-0.5 rounded font-mono text-[10px]">db_migration_v4_erp.sql</code> en el SQL Editor de tu consola de Supabase.
            </p>
          </div>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          title="Tasa de Comisión" 
          value={`${stats.commissionRate}%`} 
          icon={<Award className="w-4.5 h-4.5 text-brand-600" />}
          color="bg-brand-50"
          desc="Tasa de incentivo"
        />
        <StatCard 
          title="Ventas Entregadas (Mes)" 
          value={`${formatPrice(stats.monthlySales)}`} 
          icon={<TrendingUp className="w-4.5 h-4.5 text-emerald-600" />}
          color="bg-emerald-50"
          desc="Acumulado entregado"
        />
        <StatCard 
          title="Comisión Disponible" 
          value={`${formatPrice(stats.estimatedCommission)}`} 
          icon={<div className="w-4.5 h-4.5 text-blue-600 font-black flex items-center justify-center text-xs">$</div>}
          color="bg-blue-50"
          desc="Saldo neto a retirar"
        />
        <StatCard 
          title="Pedidos Activos" 
          value={stats.activeOrders.toString()} 
          icon={<Package className="w-4.5 h-4.5 text-orange-600" />}
          color="bg-orange-50"
          desc="Pendientes y Confirmados"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Quick Actions */}
        <div className="bg-white p-4 rounded-xl border border-slate-200/60 shadow-sm">
          <h2 className="text-xs font-black text-slate-800 uppercase tracking-wider mb-3">Acciones Rápidas</h2>
          <div className="space-y-2">
            <Link href="/vendedores/presupuestos">
              <div className="group flex items-center justify-between p-2.5 rounded-lg bg-slate-50 hover:bg-brand-50 border border-slate-100 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-white rounded-md flex items-center justify-center text-brand-600 shadow-sm border border-slate-100">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-xs text-slate-900">Armar Presupuesto</h3>
                    <p className="text-[10px] text-slate-400 font-medium">Cotiza para enviar por WhatsApp</p>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-brand-500 transition-colors" />
              </div>
            </Link>
            
            <Link href="/vendedores/pedidos">
              <div className="group flex items-center justify-between p-2.5 rounded-lg bg-slate-50 hover:bg-emerald-50 border border-slate-100 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-white rounded-md flex items-center justify-center text-emerald-600 shadow-sm border border-slate-100">
                    <ShoppingBag className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-xs text-slate-900">Cargar Nuevo Pedido</h3>
                    <p className="text-[10px] text-slate-400 font-medium">Registra una venta confirmada</p>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-emerald-500 transition-colors" />
              </div>
            </Link>
          </div>
        </div>

        {/* Info Board */}
        <div className="bg-gradient-to-br from-brand-950 to-slate-950 p-4 rounded-xl border border-slate-800 shadow-sm text-white relative overflow-hidden flex flex-col justify-center min-h-[140px]">
           <div className="relative z-10">
              <h2 className="text-xs font-black uppercase tracking-wider text-brand-400 mb-1">Objetivo del Mes</h2>
              <p className="text-[11px] text-slate-300 font-medium mb-3">Alcanzá $2,000,000 en ventas entregadas para subir tu comisión al 9%.</p>
              
              <div className="w-full bg-slate-900 rounded-full h-2 mb-1.5 overflow-hidden border border-slate-800">
                  <div className="bg-brand-500 h-2 rounded-full" style={{ width: `${Math.min((stats.monthlySales / 2000000) * 100, 100)}%` }}></div>
              </div>
              <div className="flex justify-between text-[10px] font-bold text-slate-400">
                 <span>{formatPrice(stats.monthlySales)}</span>
                 <span>$2,000,000</span>
              </div>
           </div>
           {/* Decoración */}
           <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-brand-500/10 blur-2xl rounded-full" />
        </div>
      </div>
    </div>
  );
}
function StatCard({ title, value, icon, color, desc }: { title: string, value: string, icon: any, color: string, desc: string }) {
  return (
    <div className="bg-white p-3 rounded-xl border border-slate-200/60 shadow-sm flex items-center justify-between gap-3">
      <div className="space-y-1">
        <p className="text-[10px] font-bold text-slate-500 leading-none">{title}</p>
        <h3 className="text-lg font-black text-slate-900 leading-none">{value}</h3>
        <p className="text-[9px] uppercase font-bold tracking-wider text-slate-400 leading-none">{desc}</p>
      </div>
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
        {icon}
      </div>
    </div>
  );
}

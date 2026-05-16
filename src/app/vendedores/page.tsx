"use client";

import React, { useEffect, useState } from "react";
import { formatPrice } from "@/lib/utils";
import { TrendingUp, Package, Clock, Award, ArrowRight } from "lucide-react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

export default function VendedoresDashboard() {
  const [stats, setStats] = useState({
    commissionRate: 8.0,
    monthlySales: 1500000,
    activeOrders: 5,
    estimatedCommission: 120000,
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-black text-slate-900 tracking-tighter">Mi Panel de Vendedor</h1>
        <p className="text-slate-500 font-medium mt-1">Resumen de tu actividad y comisiones.</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Tasa de Comisión" 
          value={`${stats.commissionRate}%`} 
          icon={<Award className="w-6 h-6 text-brand-600" />}
          color="bg-brand-50"
          desc="Nivel Principiante"
        />
        <StatCard 
          title="Ventas del Mes" 
          value={`${formatPrice(stats.monthlySales)}`} 
          icon={<TrendingUp className="w-6 h-6 text-emerald-600" />}
          color="bg-emerald-50"
          desc="Total acumulado"
        />
        <StatCard 
          title="Comisión Estimada" 
          value={`${formatPrice(stats.estimatedCommission)}`} 
          icon={<div className="w-6 h-6 text-blue-600 font-black flex items-center justify-center">$</div>}
          color="bg-blue-50"
          desc="A liquidar a fin de mes"
        />
        <StatCard 
          title="Pedidos Activos" 
          value={stats.activeOrders.toString()} 
          icon={<Package className="w-6 h-6 text-orange-600" />}
          color="bg-orange-50"
          desc="En preparación o envío"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Quick Actions */}
        <div className="bg-white p-8 rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100">
          <h2 className="text-xl font-black text-slate-900 mb-6">Acciones Rápidas</h2>
          <div className="space-y-4">
            <Link href="/vendedores/presupuestos">
              <div className="group flex items-center justify-between p-4 rounded-2xl bg-slate-50 hover:bg-brand-50 border border-slate-100 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-brand-600 shadow-sm">
                    <FileText className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900">Armar Presupuesto</h3>
                    <p className="text-xs text-slate-500 font-medium">Cotiza para enviar por WhatsApp</p>
                  </div>
                </div>
                <ArrowRight className="w-5 h-5 text-slate-300 group-hover:text-brand-500 transition-colors" />
              </div>
            </Link>
            
            <Link href="/vendedores/pedidos">
              <div className="group flex items-center justify-between p-4 rounded-2xl bg-slate-50 hover:bg-emerald-50 border border-slate-100 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-emerald-600 shadow-sm">
                    <ShoppingBag className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900">Cargar Nuevo Pedido</h3>
                    <p className="text-xs text-slate-500 font-medium">Registra una venta confirmada</p>
                  </div>
                </div>
                <ArrowRight className="w-5 h-5 text-slate-300 group-hover:text-emerald-500 transition-colors" />
              </div>
            </Link>
          </div>
        </div>

        {/* Info Board */}
        <div className="bg-gradient-to-br from-brand-900 to-slate-900 p-8 rounded-[2.5rem] shadow-2xl text-white relative overflow-hidden">
           <div className="relative z-10">
              <h2 className="text-xl font-black mb-2">Objetivo del Mes</h2>
              <p className="text-brand-200 font-medium mb-6">Alcanzá $2,000,000 en ventas para subir tu comisión al 9%.</p>
              
              <div className="w-full bg-slate-800 rounded-full h-4 mb-2 overflow-hidden border border-slate-700">
                 <div className="bg-brand-500 h-4 rounded-full" style={{ width: '75%' }}></div>
              </div>
              <div className="flex justify-between text-xs font-bold text-slate-400">
                 <span>$1,500,000</span>
                 <span>$2,000,000</span>
              </div>
           </div>
           {/* Decoración */}
           <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-brand-500/20 blur-3xl rounded-full" />
        </div>
      </div>
    </div>
  );
}

import { FileText, ShoppingBag } from "lucide-react";

function StatCard({ title, value, icon, color, desc }: { title: string, value: string, icon: any, color: string, desc: string }) {
  return (
    <div className="bg-white p-6 rounded-[2rem] shadow-xl shadow-slate-200/40 border border-slate-100">
      <div className="flex justify-between items-start mb-4">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}>
          {icon}
        </div>
      </div>
      <h3 className="text-3xl font-black text-slate-900 mb-1">{value}</h3>
      <p className="text-sm font-bold text-slate-600">{title}</p>
      <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400 mt-2">{desc}</p>
    </div>
  );
}

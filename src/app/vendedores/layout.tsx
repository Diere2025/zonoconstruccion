"use client";

import React, { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { LayoutDashboard, FileText, ShoppingBag, Map, Settings, LogOut, Loader2, BookOpen } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export default function VendedoresLayout({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/");
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50"><Loader2 className="w-8 h-8 animate-spin text-brand-500" /></div>;
  }

  // Simplified auth check for UI demo (in production should check sellers table)
  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="bg-white p-8 rounded-3xl shadow-xl text-center max-w-sm">
          <Settings className="w-12 h-12 text-brand-500 mx-auto mb-4" />
          <h2 className="text-2xl font-black mb-2">Portal Vendedores</h2>
          <p className="text-slate-500 mb-6 font-medium">Inicia sesión como administrador o vendedor para acceder.</p>
          <Link href="/admin">
             <button className="w-full bg-brand-600 text-white font-bold py-3 rounded-xl">Ir al Login</button>
          </Link>
        </div>
      </div>
    );
  }

  const navItems = [
    { label: "Dashboard", href: "/vendedores", icon: <LayoutDashboard className="w-5 h-5" /> },
    { label: "Presupuestos", href: "/vendedores/presupuestos", icon: <FileText className="w-5 h-5" /> },
    { label: "Pedidos", href: "/vendedores/pedidos", icon: <ShoppingBag className="w-5 h-5" /> },
    { label: "Recursos y Zonas", href: "/vendedores/recursos", icon: <BookOpen className="w-5 h-5" /> },
  ];

  return (
    <div className="min-h-[calc(100vh-80px)] bg-slate-50 flex flex-col md:flex-row border-t border-slate-200">
      {/* Sidebar */}
      <aside className="w-full md:w-64 bg-white border-r border-slate-200 flex flex-col h-auto md:min-h-full shadow-sm z-10">
        <div className="p-6 border-b border-slate-100 flex items-center gap-3">
          <div className="w-10 h-10 bg-brand-100 text-brand-600 rounded-xl flex items-center justify-center font-black text-xl">
             V
          </div>
          <div>
            <h2 className="font-black text-slate-900 leading-tight text-sm">Venta Orgánica</h2>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{session.user.email}</p>
          </div>
        </div>
        
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href}>
              <div className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-colors",
                pathname === item.href 
                  ? "bg-brand-50 text-brand-700" 
                  : "text-slate-600 hover:bg-slate-50 hover:text-brand-600"
              )}>
                {item.icon}
                {item.label}
              </div>
            </Link>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-100">
           <button 
             onClick={handleLogout}
             className="flex items-center gap-2 text-sm font-bold text-red-500 hover:bg-red-50 w-full px-4 py-3 rounded-xl transition-colors"
           >
             <LogOut className="w-5 h-5" /> Cerrar Sesión
           </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-6 md:p-8 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}

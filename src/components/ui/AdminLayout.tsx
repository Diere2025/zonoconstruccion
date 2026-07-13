"use client";

import React, { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { 
  BarChart3, 
  ShoppingBag, 
  Settings, 
  Phone,
  LogOut, 
  Users, 
  Menu, 
  X, 
  ExternalLink,
  Database,
  Truck,
  ShoppingCart,
  Factory,
  UserCheck,
  Calculator,
  BookOpen,
  Clock,
  Map,
  Wallet,
  RefreshCw,
  Upload,
  Target,
  Coins,
  Package
} from "lucide-react";
import { supabase } from "@/lib/supabase";

interface AdminLayoutProps {
  children: React.ReactNode;
}

interface SidebarLink {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
  sellerOnly?: boolean;
}

interface SidebarSection {
  title: string;
  links: SidebarLink[];
}

export function AdminLayout({ children }: AdminLayoutProps) {
  const pathname = usePathname();
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('sidebar_open');
      return saved !== null ? saved === 'true' : true;
    }
    return true;
  });
  const [userEmail, setUserEmail] = useState("");
  const [userRole, setUserRole] = useState<'seller' | 'admin'>('seller');

  const toggleSidebar = () => {
    setIsSidebarOpen(prev => {
      const next = !prev;
      localStorage.setItem('sidebar_open', next.toString());
      return next;
    });
  };

  useEffect(() => {
    async function getUserDetails() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserEmail(user.email || "");
        
        // Fetch role
        const { data: seller } = await supabase
          .from('sellers')
          .select('role')
          .eq('id', user.id)
          .single();

        if (seller?.role === 'admin') {
          setUserRole('admin');
        }
      }
    }
    getUserDetails();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/admin"; // Redirect to login
  };

  const linkSections: SidebarSection[] = [
    {
      title: "Consola de Control",
      links: [
        { name: "Dashboard General", href: "/admin/dashboard", icon: BarChart3, adminOnly: true },
        { name: "Dashboard Vendedor", href: "/vendedores", icon: BarChart3, sellerOnly: true },
        { name: "Pedidos", href: "/vendedores/pedidos", icon: ShoppingCart },
        { name: "Importar Pedidos", href: "/admin/importar-pedidos", icon: Upload, adminOnly: true },
        { name: "Clientes y Direcciones", href: "/vendedores/clientes", icon: Users },
        { name: "Cotizador / Presupuestos", href: "/vendedores/presupuestos", icon: Calculator },
        { name: "Postventa y Reclamos", href: "/vendedores/postventa", icon: RefreshCw },
        { name: "Meta Ads", href: "/admin/meta-ads", icon: Target, adminOnly: true }
      ]
    },
    {
      title: "Tesorería y Administración",
      links: [
        { name: "Caja Diaria", href: "/vendedores/caja", icon: Wallet },
        { name: "Administración y Finanzas", href: "/admin/finanzas", icon: Coins, adminOnly: true }
      ]
    },
    {
      title: "Logística y Distribución",
      links: [
        { name: "Ruteo de Entregas", href: "/vendedores/ruteo", icon: Truck },
        { name: "Auditoría de Entregas", href: "/admin/auditoria-logistica", icon: Clock, adminOnly: true },
        { name: "Zonas y Localidades", href: "/admin/localidades-zonas", icon: Map, adminOnly: true },
        { name: "Tiempos de Entrega", href: "/admin/tiempos-entrega", icon: Clock, adminOnly: true }
      ]
    },
    {
      title: "Catálogo y Costos",
      links: [
        { name: "Catálogo General", href: "/admin", icon: Database, adminOnly: true },
        { name: "Control de Stock", href: "/admin/stock", icon: Package, adminOnly: true },
        { name: "Proveedores (ERP)", href: "/admin/compras?tab=suppliers", icon: Users, adminOnly: true },
        { name: "Compras y Costos (ERP)", href: "/admin/compras?tab=new_purchase", icon: Factory, adminOnly: true },
        { name: "Rentabilidad y Margen", href: "/admin/rentabilidad", icon: BarChart3, adminOnly: true }
      ]
    },
    {
      title: "Soporte",
      links: [
        { name: "Recursos y FAQs", href: "/vendedores/recursos", icon: BookOpen }
      ]
    },
    {
      title: "Configuración",
      links: [
        { name: "Configuración General", href: "/admin/ajustes", icon: Settings, adminOnly: true }
      ]
    }
  ];

  const isActive = (path: string) => {
    const cleanPathname = pathname.replace(/\/$/, "");
    const urlParts = path.split('?');
    const pathOnly = urlParts[0].replace(/\/$/, "");
    const queryOnly = urlParts[1];
    
    if (queryOnly) {
      if (typeof window !== 'undefined') {
        const searchParams = new URLSearchParams(window.location.search);
        const linkParams = new URLSearchParams(queryOnly);
        const activeTab = searchParams.get('tab') || 'suppliers';
        const linkTab = linkParams.get('tab');
        return cleanPathname === pathOnly && activeTab === linkTab;
      }
    }
    
    if (pathOnly === "/admin" || pathOnly === "/vendedores") {
      return cleanPathname === pathOnly;
    }
    
    return cleanPathname === pathOnly || cleanPathname.startsWith(pathOnly + "/");
  };

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900 font-sans">
      {/* Mobile Sidebar Overlay */}
      {!isSidebarOpen && (
        <div 
          onClick={() => {
            setIsSidebarOpen(true);
            localStorage.setItem('sidebar_open', 'true');
          }}
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm lg:hidden"
        />
      )}

      {/* Sidebar Navigation */}
      <aside 
        className={`fixed inset-y-0 left-0 z-50 flex flex-col bg-slate-950 border-r border-slate-900 text-white transition-all duration-300 transform lg:translate-x-0 lg:static lg:h-screen ${
          isSidebarOpen 
            ? "-translate-x-full lg:w-64 lg:min-w-[16rem]" 
            : "translate-x-0 lg:w-0 lg:min-w-0 lg:overflow-hidden lg:border-r-0"
        }`}
      >
        {/* Sidebar Header */}
        <div className="h-14 flex items-center justify-between px-6 border-b border-slate-900 shrink-0">
          <Link 
            href={userRole === 'admin' ? "/admin/dashboard" : "/vendedores"} 
            className="flex items-center gap-2 group"
          >
            <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center font-black text-white text-lg shadow-md shadow-brand-600/30">
              Z
            </div>
            <div>
              <span className="font-black text-sm tracking-tight text-white group-hover:text-brand-400 transition-colors">
                Zono Construcción
              </span>
              <span className="block text-[9px] font-black text-slate-500 uppercase tracking-widest leading-none">
                Sistemas ERP
              </span>
            </div>
          </Link>
          <button 
            onClick={() => {
              setIsSidebarOpen(true);
              localStorage.setItem('sidebar_open', 'true');
            }} 
            className="lg:hidden p-1.5 rounded-lg hover:bg-slate-900 transition-colors text-slate-400"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Content */}
        <div className="flex-1 overflow-y-auto custom-sidebar-scrollbar px-4 py-4 space-y-6">
          {linkSections.map((section, sIdx) => {
            const visibleLinks = section.links.filter(link => {
              if (link.adminOnly && userRole !== 'admin') return false;
              if (link.sellerOnly && userRole === 'admin') return false;
              return true;
            });

            if (visibleLinks.length === 0) return null;

            return (
              <div key={sIdx} className="space-y-3">
                <h4 className="px-3 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] opacity-90">
                  {section.title}
                </h4>
                <div className="space-y-1">
                  {visibleLinks.map(link => {
                    const Icon = link.icon;
                    const active = isActive(link.href);
                    return (
                      <Link 
                        key={link.href}
                        href={link.href}
                        className={`group flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] font-bold transition-all duration-150 ${
                          active 
                            ? "bg-gradient-to-r from-brand-600 to-brand-500 text-white shadow-md shadow-brand-950/40" 
                            : "text-slate-300 hover:text-white hover:bg-slate-900/60"
                        }`}
                      >
                        <Icon className={`w-4 h-4 shrink-0 transition-colors ${
                          active 
                            ? "text-white" 
                            : "text-slate-400 group-hover:text-slate-200"
                        }`} />
                        {link.name}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Enlaces Generales */}
          <div className="space-y-3">
            <h4 className="px-3 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] opacity-90">Atajos</h4>
            <div className="space-y-1">
              <Link 
                href="/" 
                target="_blank"
                className="flex items-center justify-between px-3 py-2.5 rounded-xl text-[13px] font-bold text-slate-300 hover:text-white hover:bg-slate-900/60 transition-all group"
              >
                <span className="flex items-center gap-2.5">
                  <ShoppingBag className="w-4 h-4 text-slate-400 group-hover:text-slate-200" />
                  Ir a Tienda Pública
                </span>
                <ExternalLink className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-200" />
              </Link>
            </div>
          </div>
        </div>

        {/* User Info & Logout Footer */}
        <div className="p-4 border-t border-slate-900 shrink-0 bg-slate-950/80 backdrop-blur-md">
          {userEmail && (
            <div className="px-3 py-2.5 bg-slate-900 border border-slate-800 rounded-xl mb-3 shadow-sm">
              <span className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Identificado como</span>
              <span className="block text-xs font-bold text-slate-200 truncate" title={userEmail}>
                {userEmail}
              </span>
              <span className="inline-block bg-slate-800 text-slate-300 text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full mt-1.5">
                {userRole === 'admin' ? 'Administrador' : 'Vendedor Externo'}
              </span>
            </div>
          )}
          <button 
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 py-3.5 bg-red-950/20 hover:bg-red-600 text-red-400 hover:text-white border border-red-900/50 hover:border-red-600 rounded-xl text-xs font-black uppercase tracking-widest transition-all cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Cerrar Sesión
          </button>
        </div>
      </aside>

      {/* Main Content Pane */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Topbar */}
        <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-4">
            <button 
              onClick={toggleSidebar}
              className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-500 cursor-pointer"
              title={isSidebarOpen ? "Colapsar barra lateral" : "Expandir barra lateral"}
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="h-6 w-px bg-slate-200" />
            <h2 className="font-black text-slate-800 text-sm tracking-tight uppercase">
              {pathname === "/admin" ? "Catálogo e Inventario" :
               pathname === "/admin/stock" ? "Control y Sincronización de Stock" :
               pathname === "/admin/finanzas" ? "Administración y Finanzas" :
               pathname === "/admin/compras" ? "Costos y Proveedores" :
               pathname === "/admin/tiempos-entrega" ? "Tiempos de Entrega" :
               pathname === "/admin/localidades-zonas" ? "Zonas y Localidades" :
               pathname === "/admin/importar-pedidos" ? "Importación de Pedidos" :
               pathname === "/admin/rentabilidad" ? "Rentabilidad y Margen" :
               pathname === "/admin/ajustes" ? "Configuración General" :
               pathname === "/admin/meta-ads" ? "Meta Ads Performance" :
               pathname === "/vendedores" ? "Dashboard Operativo" :
               pathname === "/vendedores/pedidos" ? "Ingresar Pedido" :
               pathname === "/vendedores/clientes" ? "Clientes y Direcciones" :
               pathname === "/vendedores/presupuestos" ? "Cotizador / Presupuestos" :
               pathname === "/vendedores/caja" ? "Caja Diaria" :
               pathname === "/vendedores/ruteo" ? "Ruteo de Entregas" :
               pathname === "/vendedores/postventa" ? "Postventa y Reclamos" :
               pathname === "/vendedores/recursos" ? "Recursos y FAQs" : "Panel ERP"}
            </h2>
          </div>

          <div className="flex items-center gap-4">
            {/* Quick Badge */}
            <span className="bg-slate-100 border text-slate-600 text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-xl flex items-center gap-1.5">
              <UserCheck className="w-3.5 h-3.5 text-slate-400" />
              Sesión Segura
            </span>
          </div>
        </header>

        {/* Viewport Scroll Container */}
        <main className="flex-1 overflow-auto p-4">
          {children}
        </main>
      </div>
    </div>
  );
}

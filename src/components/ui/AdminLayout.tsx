"use client";

import React, { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { 
  BarChart3, 
  ShoppingBag, 
  Settings, 
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
  Package,
  PackageCheck,
  AlertTriangle,
  ChevronRight,
  Home,
  Shield,
  ShieldCheck,
  Layers,
  Flame
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
  const router = useRouter();
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('sidebar_open');
      return saved !== null ? saved === 'true' : true;
    }
    return true;
  });
  const [userEmail, setUserEmail] = useState("");
  const [userRole, setUserRole] = useState<'seller' | 'admin'>('seller');
  const [isRestrictedSeller, setIsRestrictedSeller] = useState(false);

  const toggleSidebar = () => {
    setIsSidebarOpen(prev => {
      const next = !prev;
      localStorage.setItem('sidebar_open', next.toString());
      return next;
    });
  };

  useEffect(() => {
    // Redirigir cualquier acceso de gestión en zono.com.ar hacia el dominio oficial del ERP
    if (typeof window !== 'undefined') {
      const host = window.location.hostname.toLowerCase();
      if (host === 'zono.com.ar' || host === 'www.zono.com.ar') {
        const targetUrl = `https://zono-erp.pages.dev${window.location.pathname}${window.location.search}`;
        window.location.replace(targetUrl);
        return;
      }
    }

    async function getUserDetails() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const email = user.email || "";
        setUserEmail(email);
        const emailLower = email.toLowerCase();

        // Check if Admin by email
        let isAdminUser = emailLower === 'diego.boveda@gmail.com' || 
                           emailLower.includes('admin') || 
                           emailLower.includes('diego') || 
                           emailLower === 'caroibarra.93@gmail.com';

        if (isAdminUser) {
          setUserRole('admin');
        } else {
          setUserRole('seller');
        }

        try {
          const { data: seller } = await supabase
            .from('sellers')
            .select('id, name, full_name, role')
            .or(`id.eq.${user.id},email.ilike.${emailLower}`)
            .maybeSingle();

          if (seller?.role === 'admin') {
            setUserRole('admin');
            isAdminUser = true;
          }

          const nameLower = (seller?.full_name || seller?.name || "").toLowerCase();
          const isRestricted = !isAdminUser && (
            emailLower.includes("jazmin") || 
            emailLower.includes("jazmín") || 
            nameLower.includes("jazmin") || 
            nameLower.includes("jazmín") || 
            emailLower.includes("ludmila") ||
            emailLower.includes("ludmilakrenz") ||
            nameLower.includes("ludmila") ||
            user.id === "13430e05-b61a-4a3f-9fc3-152d377c4b0c" || // Jazmin
            user.id === "8207801b-b6cb-48cc-af0f-d2f9f2c98032" ||   // Ludmila
            user.id === "4c9b5ed0-3946-4df6-b4d5-3bdc9b1a6c7f"    // Ludmila Auth
          );
          
          setIsRestrictedSeller(Boolean(isRestricted));
        } catch (e) {
          console.warn("Error checking seller role in AdminLayout:", e);
        }
      }
    }
    getUserDetails();
  }, [pathname]);

  // Route guard: Restricted sellers (Jazmín & Ludmila) can access /vendedores/presupuestos and /admin/cobros-mp
  useEffect(() => {
    if (isRestrictedSeller && pathname && pathname !== '/vendedores/presupuestos' && pathname !== '/admin/cobros-mp') {
      router.replace('/vendedores/presupuestos');
    }
  }, [isRestrictedSeller, pathname, router]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/admin";
  };

  const linkSections: SidebarSection[] = [
    {
      title: "Consola de Control",
      links: [
        { name: "Dashboard General", href: "/admin/dashboard", icon: BarChart3, adminOnly: true },
        { name: "Dashboard Vendedor", href: "/vendedores", icon: BarChart3, sellerOnly: true },
        { name: "Gestión de Pedidos", href: "/vendedores/pedidos", icon: ShoppingCart },
        { name: "Importar Pedidos", href: "/admin/importar-pedidos", icon: Upload, adminOnly: true },
        { name: "Clientes y Direcciones", href: "/vendedores/clientes", icon: Users },
        { name: "Cotizador / Presupuestos", href: "/vendedores/presupuestos", icon: Calculator },
        { name: "Chequeo de Pagos", href: "/admin/cobros-mp", icon: ShieldCheck },
        { name: "Postventa y Reclamos", href: "/vendedores/postventa", icon: RefreshCw },
        { name: "Meta Ads Performance", href: "/admin/meta-ads", icon: Target, adminOnly: true }
      ]
    },
    {
      title: "Tesorería y Finanzas",
      links: [
        { name: "Caja Diaria", href: "/vendedores/caja", icon: Wallet },
        { name: "Administración y Finanzas", href: "/admin/finanzas", icon: Coins, adminOnly: true },
        { name: "Comisiones de Vendedores", href: "/admin/comisiones", icon: Coins, adminOnly: true }
      ]
    },
    {
      title: "Logística y Distribución",
      links: [
        { name: "Ruteo de Entregas", href: "/vendedores/ruteo", icon: Truck },
        { name: "Facturación Pendiente", href: "/admin/facturacion-pendiente", icon: PackageCheck, adminOnly: true },
        { name: "Auditoría de Entregas", href: "/admin/auditoria-logistica", icon: Clock, adminOnly: true },
        { name: "Zonas y Localidades", href: "/admin/localidades-zonas", icon: Map, adminOnly: true },
        { name: "Tiempos de Entrega", href: "/admin/tiempos-entrega", icon: Clock, adminOnly: true }
      ]
    },
    {
      title: "Fábrica y Producción",
      links: [
        { name: "Control de Producción", href: "/admin/produccion", icon: Factory, adminOnly: true },
        { name: "Stock de Fábrica", href: "/admin/stock-fabrica", icon: Layers, adminOnly: true },
        { name: "Costos de Fabricación", href: "/admin/gas-consumo", icon: Factory, adminOnly: true }
      ]
    },
    {
      title: "Catálogo y Costos",
      links: [
        { name: "Catálogo General", href: "/admin/catalogo", icon: Database, adminOnly: true },
        { name: "Control de Stock", href: "/admin/stock", icon: Package, adminOnly: true },
        { name: "Capital Estancado", href: "/admin/capital-estancado", icon: AlertTriangle, adminOnly: true },
        { name: "Proveedores (ERP)", href: "/admin/compras?tab=suppliers", icon: Users, adminOnly: true },
        { name: "Lista de Precios Mayorista", href: "/admin/lista-mayorista", icon: Calculator, adminOnly: true },
        { name: "Rentabilidad y Margen", href: "/admin/rentabilidad", icon: BarChart3, adminOnly: true }
      ]
    },
    {
      title: "Soporte y Configuración",
      links: [
        { name: "Recursos y FAQs", href: "/vendedores/recursos", icon: BookOpen },
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
    
    if (pathOnly === "/admin/catalogo" || pathOnly === "/vendedores") {
      return cleanPathname === pathOnly;
    }
    
    return cleanPathname === pathOnly || cleanPathname.startsWith(pathOnly + "/");
  };

  // Compute dynamic breadcrumbs from current pathname
  const getBreadcrumbs = () => {
    for (const section of linkSections) {
      for (const link of section.links) {
        if (isActive(link.href)) {
          return {
            section: section.title,
            page: link.name
          };
        }
      }
    }

    if (pathname === "/admin/catalogo") return { section: "Catálogo y Costos", page: "Catálogo General" };
    if (pathname === "/vendedores") return { section: "Consola de Control", page: "Dashboard Vendedor" };
    return { section: "Panel ERP", page: "Inicio" };
  };

  const breadcrumbs = getBreadcrumbs();
  const userInitial = userEmail ? userEmail.charAt(0).toUpperCase() : "U";

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900 font-sans antialiased">
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          onClick={toggleSidebar}
          className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-xs lg:hidden"
        />
      )}

      {/* Sidebar Navigation */}
      <aside 
        className={`fixed inset-y-0 left-0 z-50 flex flex-col bg-slate-900 border-r border-slate-800 text-slate-200 transition-all duration-300 transform lg:translate-x-0 lg:static lg:h-screen ${
          isSidebarOpen 
            ? "translate-x-0 w-64 min-w-[16rem]" 
            : "-translate-x-full lg:w-0 lg:min-w-0 lg:overflow-hidden lg:border-r-0"
        }`}
      >
        {/* Sidebar Header / Brand */}
        <div className="h-16 flex items-center justify-between px-5 border-b border-slate-800/80 shrink-0 bg-slate-950/40">
          <Link 
            href={userRole === 'admin' ? "/admin/dashboard" : isRestrictedSeller ? "/vendedores/presupuestos" : "/vendedores"} 
            className="flex items-center gap-3 group"
          >
            <div className="w-8 h-8 rounded-xl bg-brand-600 flex items-center justify-center font-black text-white text-base shadow-xs shadow-brand-600/30 group-hover:scale-105 transition-transform">
              Z
            </div>
            <div className="leading-none">
              <span className="font-bold text-sm tracking-tight text-white group-hover:text-brand-300 transition-colors">
                Zono Construcción
              </span>
              <span className="block text-[10px] font-semibold text-slate-400 mt-1 uppercase tracking-wider">
                Sistema ERP
              </span>
            </div>
          </Link>

          <button 
            onClick={toggleSidebar} 
            className="lg:hidden p-1.5 rounded-lg hover:bg-slate-800 transition-colors text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Content */}
        <div className="flex-1 overflow-y-auto custom-sidebar-scrollbar px-3 py-4 space-y-6">
          {linkSections.map((section, sIdx) => {
            const visibleLinks = section.links.filter(link => {
              if (isRestrictedSeller) {
                return link.href === "/vendedores/presupuestos" || link.href === "/admin/cobros-mp";
              }
              if (link.adminOnly && userRole !== 'admin') return false;
              if (link.sellerOnly && userRole === 'admin') return false;
              return true;
            });

            if (visibleLinks.length === 0) return null;

            return (
              <div key={sIdx} className="space-y-1.5">
                <h4 className="px-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                  {section.title}
                </h4>
                <div className="space-y-0.5">
                  {visibleLinks.map(link => {
                    const Icon = link.icon;
                    const active = isActive(link.href);
                    return (
                      <Link 
                        key={link.href}
                        href={link.href}
                        className={`group flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-all duration-150 ${
                          active 
                            ? "bg-brand-600 text-white font-semibold shadow-xs" 
                            : "text-slate-300 hover:text-white hover:bg-slate-800/60"
                        }`}
                      >
                        <Icon className={`w-4 h-4 shrink-0 transition-colors ${
                          active 
                            ? "text-white" 
                            : "text-slate-400 group-hover:text-slate-200"
                        }`} />
                        <span className="truncate">{link.name}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Atajos Rápidos / Tienda - Solo para Admin */}
          {userRole === 'admin' && (
            <div className="space-y-1.5 pt-2 border-t border-slate-800/80">
              <h4 className="px-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Acceso Público</h4>
              <Link 
                href="/" 
                target="_blank"
                className="flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800/60 transition-all group"
              >
                <span className="flex items-center gap-2.5">
                  <ShoppingBag className="w-4 h-4 text-slate-400 group-hover:text-slate-200" />
                  Catálogo Web
                </span>
                <ExternalLink className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-300" />
              </Link>
            </div>
          )}
        </div>

        {/* User Info & Logout Footer */}
        <div className="p-3 border-t border-slate-800/80 shrink-0 bg-slate-950/60">
          {userEmail && (
            <div className="flex items-center gap-3 p-2 rounded-xl bg-slate-800/40 border border-slate-800 mb-2">
              <div className="w-8 h-8 rounded-lg bg-brand-700/80 text-white font-bold text-xs flex items-center justify-center shrink-0 border border-brand-500/30">
                {userInitial}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-slate-200 truncate" title={userEmail}>
                  {userEmail}
                </p>
                <span className="inline-block text-[10px] text-brand-300 font-medium">
                  {userRole === 'admin' ? 'Administrador' : 'Vendedor'}
                </span>
              </div>
            </div>
          )}

          <button 
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-slate-800/50 hover:bg-rose-950/40 text-slate-400 hover:text-rose-300 border border-slate-700/50 hover:border-rose-900/50 rounded-xl text-xs font-medium transition-all cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Cerrar Sesión
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Topbar with Breadcrumbs */}
        <header className="h-16 bg-white border-b border-slate-200/80 flex items-center justify-between px-6 shrink-0 z-10 shadow-2xs">
          <div className="flex items-center gap-4 min-w-0">
            <button 
              onClick={toggleSidebar}
              className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-500 hover:text-slate-800 cursor-pointer"
              title={isSidebarOpen ? "Ocultar menú lateral" : "Mostrar menú lateral"}
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="h-5 w-px bg-slate-200" />

            {/* Dynamic Breadcrumbs */}
            <nav className="flex items-center gap-1.5 text-xs text-slate-500 truncate">
              <span className="font-medium text-slate-400 hover:text-slate-600 transition-colors">
                {breadcrumbs.section}
              </span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />
              <span className="font-semibold text-slate-900 truncate">
                {breadcrumbs.page}
              </span>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            {/* Live System Status Pill */}
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>En Línea</span>
            </div>

            {/* Role Badge */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-100 border border-slate-200 text-slate-700 text-xs font-medium">
              <Shield className="w-3.5 h-3.5 text-slate-500" />
              <span>{userRole === 'admin' ? 'Admin' : 'Vendedor'}</span>
            </div>
          </div>
        </header>

        {/* Viewport Scroll Area */}
        <main className="flex-1 overflow-auto p-4 sm:p-6 bg-slate-50 custom-scrollbar">
          <div className="w-full space-y-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

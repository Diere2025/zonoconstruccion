"use client";

import React, { useState, useEffect, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { 
  BarChart3, 
  TrendingUp,
  Link2,
  ShoppingBag, 
  Settings, 
  LogOut, 
  Users, 
  Menu, 
  X, 
  Database,
  Truck,
  ShoppingCart,
  Factory,
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
  Shield,
  ShieldCheck,
  Layers,
  KeyRound,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FileSpreadsheet,
  PlusCircle,
  ClipboardCheck,
  Printer,
  ClipboardList,
  Boxes
} from "lucide-react";
import { supabase } from "@/lib/supabase";

interface AdminLayoutProps {
  children: React.ReactNode;
}

type UserRole = 'seller' | 'admin' | 'logistica' | 'fletero' | 'administracion' | 'compras';

function isUserRole(value: string): value is UserRole {
  return ['seller', 'admin', 'logistica', 'fletero', 'administracion', 'compras'].includes(value);
}

function normalizeUserRoles(primaryRole?: string | null, roles?: unknown): UserRole[] {
  const candidates = [
    ...(Array.isArray(roles) ? roles : []),
    primaryRole
  ];
  const normalized = candidates
    .map(role => String(role || '').trim().toLowerCase())
    .filter(isUserRole);
  return Array.from(new Set(normalized.length > 0 ? normalized : ['seller'])) as UserRole[];
}

interface SidebarLink {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
  sellerOnly?: boolean;
  allowedRoles?: UserRole[];
}

interface SidebarSection {
  title: string;
  links: SidebarLink[];
}

interface ImpersonationStatus {
  active: boolean;
  administratorName?: string;
  targetName?: string;
  targetEmail?: string;
  targetRole?: string;
  expiresAt?: number;
}

interface ImpersonationUser {
  id: string;
  full_name: string;
  email: string;
  role: string;
  is_active: boolean;
  auth_user?: { id: string; email?: string } | null;
}

// In-memory module cache to eliminate flashing across navigation
let cachedUserRole: UserRole | null = null;
let cachedUserRoles: UserRole[] | null = null;
let cachedIsRestricted: boolean | null = null;
let cachedUserEmail: string | null = null;
let cachedCanUseWholesale: boolean | null = null;

function clearCachedIdentity() {
  cachedUserRole = null;
  cachedUserRoles = null;
  cachedIsRestricted = null;
  cachedUserEmail = null;
  cachedCanUseWholesale = null;
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem('zono_user_email');
    sessionStorage.removeItem('zono_user_role');
    sessionStorage.removeItem('zono_user_roles');
    sessionStorage.removeItem('zono_is_restricted');
    sessionStorage.removeItem('zono_can_use_wholesale');
    sessionStorage.removeItem('zono_role_loaded');
  }
}

export function AdminLayout({ children }: AdminLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    if (typeof window !== 'undefined') {
      if (window.innerWidth < 1024) return false;
      const saved = localStorage.getItem('sidebar_open');
      return saved !== null ? saved === 'true' : true;
    }
    return true;
  });

  const closeSidebarOnMobile = () => {
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setIsSidebarOpen(false);
    }
  };

  const [userEmail, setUserEmail] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return cachedUserEmail || sessionStorage.getItem('zono_user_email') || "";
    }
    return "";
  });

  const [isRoleLoaded, setIsRoleLoaded] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return cachedUserRoles !== null || (
        sessionStorage.getItem('zono_role_loaded') === 'true' &&
        sessionStorage.getItem('zono_user_roles') !== null
      );
    }
    return false;
  });

  const [userRole, setUserRole] = useState<UserRole>(() => {
    if (typeof window !== 'undefined') {
      if (cachedUserRole) return cachedUserRole;
      const saved = sessionStorage.getItem('zono_user_role');
      if (saved && isUserRole(saved)) return saved;
    }
    return 'seller';
  });

  const [userRoles, setUserRoles] = useState<UserRole[]>(() => {
    if (typeof window !== 'undefined') {
      if (cachedUserRoles) return cachedUserRoles;
      try {
        const stored = JSON.parse(sessionStorage.getItem('zono_user_roles') || '[]');
        return normalizeUserRoles(sessionStorage.getItem('zono_user_role'), stored);
      } catch {
        return normalizeUserRoles(sessionStorage.getItem('zono_user_role'));
      }
    }
    return ['seller'];
  });

  const [isRestrictedSeller, setIsRestrictedSeller] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      if (cachedIsRestricted !== null) return cachedIsRestricted;
      const saved = sessionStorage.getItem('zono_is_restricted');
      if (saved !== null) return saved === 'true';
    }
    return false;
  });

  const [canUseWholesale, setCanUseWholesale] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      if (cachedCanUseWholesale !== null) return cachedCanUseWholesale;
      return sessionStorage.getItem('zono_can_use_wholesale') === 'true';
    }
    return false;
  });
  const [isWholesalePermissionLoaded, setIsWholesalePermissionLoaded] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('zono_can_use_wholesale') !== null;
    }
    return false;
  });

  // Self Password Change State
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [selfNewPassword, setSelfNewPassword] = useState("");
  const [selfConfirmPassword, setSelfConfirmPassword] = useState("");
  const [showSelfPwd, setShowSelfPwd] = useState(false);
  const [isChangingSelfPwd, setIsChangingSelfPwd] = useState(false);
  const [selfPwdError, setSelfPwdError] = useState<string | null>(null);
  const [selfPwdSuccess, setSelfPwdSuccess] = useState(false);

  // Real-session impersonation state. The target session is a genuine Supabase session,
  // so permissions and RLS are identical to signing in as that user.
  const [impersonation, setImpersonation] = useState<ImpersonationStatus>({ active: false });
  const [showImpersonationModal, setShowImpersonationModal] = useState(false);
  const [impersonationUsers, setImpersonationUsers] = useState<ImpersonationUser[]>([]);
  const [impersonationSearch, setImpersonationSearch] = useState('');
  const [selectedImpersonationUserId, setSelectedImpersonationUserId] = useState('');
  const [isLoadingImpersonationUsers, setIsLoadingImpersonationUsers] = useState(false);
  const [isSwitchingSession, setIsSwitchingSession] = useState(false);
  const [impersonationError, setImpersonationError] = useState('');

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession()
      .then(({ data: { session } }) => fetch('/api/admin/impersonate', {
        cache: 'no-store',
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined
      }))
      .then(async result => result.ok ? result.json() : { active: false })
      .then(status => {
        if (mounted) setImpersonation(status);
      })
      .catch(() => {
        if (mounted) setImpersonation({ active: false });
      });
    return () => { mounted = false; };
  }, []);

  const handleSelfPasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setSelfPwdError(null);
    setSelfPwdSuccess(false);

    if (selfNewPassword.length < 6) {
      setSelfPwdError("La contraseña debe tener al menos 6 caracteres");
      return;
    }

    if (selfNewPassword !== selfConfirmPassword) {
      setSelfPwdError("Las contraseñas no coinciden");
      return;
    }

    setIsChangingSelfPwd(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: selfNewPassword });
      if (error) {
        setSelfPwdError("Error al cambiar contraseña: " + error.message);
        setIsChangingSelfPwd(false);
        return;
      }

      setSelfPwdSuccess(true);
      setSelfNewPassword("");
      setSelfConfirmPassword("");
      setTimeout(() => {
        setShowChangePasswordModal(false);
        setSelfPwdSuccess(false);
      }, 2000);
    } catch (err: unknown) {
      setSelfPwdError(err instanceof Error ? err.message : "Error al actualizar contraseña");
    } finally {
      setIsChangingSelfPwd(false);
    }
  };

  const toggleSidebar = () => {
    setIsSidebarOpen(prev => {
      const next = !prev;
      if (typeof window !== 'undefined' && window.innerWidth >= 1024) {
        localStorage.setItem('sidebar_open', next.toString());
      }
      return next;
    });
  };

  // Close sidebar automatically on navigation on mobile
  useEffect(() => {
    closeSidebarOnMobile();
  }, [pathname]);

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
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setIsRoleLoaded(true);
          return;
        }

        const email = user.email || "";
        setUserEmail(email);
        cachedUserEmail = email;
        const emailLower = email.toLowerCase();

        // Check if Admin by email
        let isAdminUser = emailLower === 'diego.boveda@gmail.com' || 
                          emailLower.includes('admin') || 
                          emailLower.includes('diego') || 
                          emailLower === 'caroibarra.93@gmail.com';

        let detectedRole: UserRole = isAdminUser ? 'admin' : 'seller';
        let detectedRoles = normalizeUserRoles(
          detectedRole,
          user.user_metadata?.roles
        );

        // Check user metadata first for instant role detection
        const metaRole = (user.user_metadata?.role || '').toLowerCase();
        if (metaRole) {
          if (isUserRole(metaRole)) detectedRole = metaRole;
          if (metaRole === 'admin') isAdminUser = true;
        }
        detectedRoles = normalizeUserRoles(detectedRole, user.user_metadata?.roles);

        let detectedRestricted = false;
        let detectedCanUseWholesale = isAdminUser;

        try {
          const { data: seller } = await supabase
            .from('sellers')
            .select('id, full_name, role, roles, seller_type, can_sell_wholesale')
            .or(`id.eq.${user.id},email.ilike.${emailLower}`)
            .maybeSingle();

          if (seller?.role) {
            const roleLower = seller.role.toLowerCase();
            if (isUserRole(roleLower)) detectedRole = roleLower;
            if (roleLower === 'admin') {
              isAdminUser = true;
            }
          }
          detectedRoles = normalizeUserRoles(detectedRole, seller?.roles);
          if (detectedRoles.includes('admin')) {
            detectedRole = 'admin';
            isAdminUser = true;
          }

          const nameLower = (seller?.full_name || "").toLowerCase();
          detectedCanUseWholesale = isAdminUser || seller?.can_sell_wholesale === true || seller?.seller_type === 'mayorista';
          detectedRestricted = !isAdminUser && (
            emailLower.includes("jazmin") || 
            emailLower.includes("jazmín") || 
            nameLower.includes("jazmin") || 
            nameLower.includes("jazmín") || 
            emailLower.includes("ludmila") ||
            emailLower.includes("ludmilakrenz") ||
            nameLower.includes("ludmila") ||
            emailLower.includes("facundo") ||
            emailLower.includes("facundopaz") ||
            nameLower.includes("facundo") ||
            user.id === "13430e05-b61a-4a3f-9fc3-152d377c4b0c" ||   // Jazmin
            user.id === "54b2d319-8f6f-47ff-b794-b7731978410a" ||   // Ludmila
            user.id === "8207801b-b6cb-48cc-af0f-d2f9f2c98032" ||   // Ludmila Old
            user.id === "3820a0fe-bb0a-4a84-ad85-79e49868cad7"     // Facundo Paz
          );
        } catch (e) {
          console.warn("Error checking seller role in AdminLayout:", e);
        }

        setUserRole(detectedRole);
        setUserRoles(detectedRoles);
        setIsRestrictedSeller(detectedRestricted);
        setCanUseWholesale(detectedCanUseWholesale);
        setIsWholesalePermissionLoaded(true);
        cachedUserRole = detectedRole;
        cachedUserRoles = detectedRoles;
        cachedIsRestricted = detectedRestricted;
        cachedCanUseWholesale = detectedCanUseWholesale;

        if (typeof window !== 'undefined') {
          sessionStorage.setItem('zono_user_email', email);
          sessionStorage.setItem('zono_user_role', detectedRole);
          sessionStorage.setItem('zono_user_roles', JSON.stringify(detectedRoles));
          sessionStorage.setItem('zono_is_restricted', detectedRestricted ? 'true' : 'false');
          sessionStorage.setItem('zono_can_use_wholesale', detectedCanUseWholesale ? 'true' : 'false');
          sessionStorage.setItem('zono_role_loaded', 'true');
        }
      } finally {
        setIsRoleLoaded(true);
      }
    }

    getUserDetails();
  }, [pathname]);

  const hasRole = useCallback((role: UserRole) => userRoles.includes(role), [userRoles]);
  const isAdminRole = hasRole('admin');
  const isSpecializedOperator = !isAdminRole && !hasRole('seller') && userRoles.some(role =>
    ['logistica', 'fletero', 'administracion', 'compras'].includes(role)
  );

  const canAccessSpecializedRoute = useCallback((path: string, search: string) => {
    if (isAdminRole) return true;

    const allowedPaths = new Set<string>();
    if (hasRole('logistica')) {
      ['/admin/cobros-mp', '/admin/fleteros', '/admin/control-planillas', '/vendedores/ruteo/comprobantes', '/vendedores/ruteo/remitos']
        .forEach(route => allowedPaths.add(route));
    }
    if (hasRole('fletero')) allowedPaths.add('/admin/cobros-mp');
    if (hasRole('administracion')) {
      ['/admin/cobros-mp', '/admin/finanzas', '/admin/rendiciones']
        .forEach(route => allowedPaths.add(route));
    }
    if (hasRole('compras')) {
      allowedPaths.add('/admin/stock');
      allowedPaths.add('/admin/compras');
    }

    const pathAllowed = Array.from(allowedPaths).some(route => {
      // Administración puede usar la pantalla financiera principal, pero EERR
      // conserva su permiso exclusivo de administrador.
      if (hasRole('administracion') && route === '/admin/finanzas') return path === route;
      return path === route || path.startsWith(`${route}/`);
    });
    if (!pathAllowed) return false;

    if (path === '/admin/compras' && hasRole('compras')) {
      const tab = new URLSearchParams(search).get('tab') || 'purchase_orders';
      return ['purchase_orders', 'purchase_calculator', 'alerts'].includes(tab);
    }
    return true;
  }, [hasRole, isAdminRole]);

  // Route guards per role. Multi-role users receive the union of every assigned role.
  useEffect(() => {
    if (!isRoleLoaded) return;
    const search = typeof window !== 'undefined' ? window.location.search : '';
    if (isSpecializedOperator && pathname && !canAccessSpecializedRoute(pathname, search)) {
      const fallback = hasRole('compras') ? '/admin/compras?tab=purchase_orders' : '/admin/cobros-mp';
      router.replace(fallback);
    } else if (isRestrictedSeller && isWholesalePermissionLoaded && pathname) {
      const query = search;
      const isWholesaleRoute =
        pathname === '/vendedores/presupuestos-mayorista' ||
        (pathname === '/vendedores/clientes' && query.includes('client_type=mayoristas')) ||
        (pathname.startsWith('/vendedores/pedidos') && query.includes('client_type=mayoristas'));
      const isRestrictedRouteAllowed =
        pathname === '/vendedores' ||
        pathname === '/vendedores/presupuestos' ||
        pathname === '/admin/cobros-mp' ||
        (pathname.startsWith('/vendedores/pedidos') && !query.includes('client_type=mayoristas')) ||
        (canUseWholesale && isWholesaleRoute);
      if (!isRestrictedRouteAllowed) router.replace('/vendedores');
    } else if (
      userRole === 'seller' && 
      !isRestrictedSeller && 
      pathname && 
      pathname.startsWith('/admin/dashboard')
    ) {
      router.replace('/vendedores');
    }
  }, [isRoleLoaded, userRole, userRoles, isSpecializedOperator, canAccessSpecializedRoute, hasRole, isRestrictedSeller, canUseWholesale, isWholesalePermissionLoaded, pathname, router]);

  const destinationForRole = (role?: string) => {
    if (role === 'admin') return '/admin/dashboard';
    if (role === 'compras') return '/admin/compras?tab=purchase_orders';
    if (role === 'logistica' || role === 'fletero' || role === 'administracion') return '/admin/cobros-mp';
    return '/vendedores';
  };

  const openImpersonationModal = async () => {
    setShowImpersonationModal(true);
    setImpersonationError('');
    setSelectedImpersonationUserId('');
    setIsLoadingImpersonationUsers(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('La sesión de administrador no está disponible.');
      const result = await fetch('/api/admin/vendedores', {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      const payload = await result.json();
      if (!result.ok) throw new Error(payload.error || 'No se pudieron cargar los usuarios.');
      const users = (payload.data || []).filter((candidate: ImpersonationUser) =>
        candidate.is_active !== false && Boolean(candidate.auth_user?.id && candidate.auth_user?.email)
      );
      setImpersonationUsers(users);
    } catch (error) {
      setImpersonationError(error instanceof Error ? error.message : 'No se pudieron cargar los usuarios.');
    } finally {
      setIsLoadingImpersonationUsers(false);
    }
  };

  const startImpersonation = async () => {
    const target = impersonationUsers.find(candidate => candidate.id === selectedImpersonationUserId);
    if (!target?.auth_user?.id) {
      setImpersonationError('Seleccioná un usuario con cuenta de acceso.');
      return;
    }

    setIsSwitchingSession(true);
    setImpersonationError('');
    let administratorToken = '';
    try {
      const { data: { session } } = await supabase.auth.getSession();
      administratorToken = session?.access_token || '';
      if (!administratorToken) throw new Error('La sesión de administrador no está disponible.');
      const result = await fetch('/api/admin/impersonate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${administratorToken}`
        },
        body: JSON.stringify({
          action: 'start',
          targetUserId: target.id,
          targetAuthUserId: target.auth_user.id
        })
      });
      const payload = await result.json();
      if (!result.ok) throw new Error(payload.error || 'No se pudo iniciar Ver como.');

      const { error } = await supabase.auth.verifyOtp({ token_hash: payload.tokenHash, type: 'magiclink' });
      if (error) {
        await fetch('/api/admin/impersonate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${administratorToken}`
          },
          body: JSON.stringify({ action: 'cancel' })
        }).catch(() => undefined);
        throw error;
      }

      clearCachedIdentity();
      window.location.href = destinationForRole(payload.targetRole);
    } catch (error) {
      setImpersonationError(error instanceof Error ? error.message : 'No se pudo cambiar la sesión.');
      setIsSwitchingSession(false);
    }
  };

  const stopImpersonation = async () => {
    setIsSwitchingSession(true);
    setImpersonationError('');
    try {
      const result = await fetch('/api/admin/impersonate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop' })
      });
      const payload = await result.json();
      if (!result.ok) throw new Error(payload.error || 'No se pudo volver a la sesión de administrador.');
      const { error } = await supabase.auth.verifyOtp({ token_hash: payload.tokenHash, type: 'magiclink' });
      if (error) throw error;
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('La sesión administradora no pudo validarse.');
      const finishResult = await fetch('/api/admin/impersonate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ action: 'finish' })
      });
      const finishPayload = await finishResult.json();
      if (!finishResult.ok) throw new Error(finishPayload.error || 'No se pudo cerrar la sesión temporal.');
      clearCachedIdentity();
      window.location.href = '/admin/dashboard';
    } catch (error) {
      setImpersonationError(error instanceof Error ? error.message : 'No se pudo volver a la sesión de administrador.');
      setIsSwitchingSession(false);
    }
  };

  const handleLogout = async () => {
    if (impersonation.active) {
      await stopImpersonation();
      return;
    }
    clearCachedIdentity();
    await supabase.auth.signOut();
    window.location.href = "/admin";
  };

  const linkSections: SidebarSection[] = [
    {
      title: "Canal Minorista (B2C)",
      links: [
        { name: "Dashboard Minorista", href: "/admin/dashboard", icon: BarChart3, adminOnly: true },
        { name: "Dashboard Vendedor", href: "/vendedores", icon: BarChart3, sellerOnly: true },
        { name: "Cargar Pedido", href: "/vendedores/pedidos?tab=form&client_type=minoristas", icon: PlusCircle },
        { name: "Pedidos Minoristas", href: "/vendedores/pedidos?tab=list&client_type=minoristas", icon: ShoppingCart },
        { name: "Cotizador Minorista", href: "/vendedores/presupuestos", icon: Calculator },
        { name: "Presupuestos Minoristas", href: "/vendedores/cotizaciones?channel=minorista", icon: ClipboardCheck },
        { name: "Clientes Minoristas", href: "/vendedores/clientes", icon: Users },
        { name: "Meta Ads Performance", href: "/admin/meta-ads", icon: Target, adminOnly: true },
        { name: "Postventa y Reclamos", href: "/vendedores/postventa", icon: RefreshCw }
      ]
    },
    {
      title: "Canal Mayorista (B2B)",
      links: [
        { name: "Dashboard Mayorista", href: "/admin/dashboard-mayorista", icon: TrendingUp, adminOnly: true },
        { name: "Cargar Pedido Mayorista", href: "/vendedores/pedidos?tab=form&client_type=mayoristas", icon: PlusCircle },
        { name: "Pedidos Mayoristas", href: "/vendedores/pedidos?tab=list&list_type=todos&status=Todos&client_type=mayoristas", icon: ShoppingBag },
        { name: "Clientes Mayoristas", href: "/vendedores/clientes?client_type=mayoristas", icon: Users },
        { name: "Cotizador Mayorista", href: "/vendedores/presupuestos-mayorista", icon: Calculator },
        { name: "Presupuestos Mayoristas", href: "/vendedores/cotizaciones?channel=mayorista", icon: ClipboardCheck },
        { name: "Lista Precios Mayorista", href: "/admin/lista-mayorista", icon: Calculator, adminOnly: true },
        { name: "Vincular Productos", href: "/admin/dashboard-mayorista?tab=mapping", icon: Link2, adminOnly: true }
      ]
    },
    {
      title: "Operaciones y Control",
      links: [
        { name: "Chequeo de Pagos", href: "/admin/cobros-mp", icon: ShieldCheck, allowedRoles: ['logistica', 'fletero', 'administracion'] },
        { name: "Sincronizar Planillas", href: "/admin/importar-pedidos", icon: Upload, adminOnly: true }
      ]
    },
    {
      title: "Tesorería y Finanzas",
      links: [
        { name: "Rendiciones de Recorridos", href: "/admin/rendiciones", icon: ClipboardList, allowedRoles: ['admin', 'administracion'] },
        { name: "Caja Diaria", href: "/vendedores/caja", icon: Wallet, adminOnly: true },
        { name: "Estado de Resultados (EERR)", href: "/admin/finanzas/eerr", icon: FileSpreadsheet, adminOnly: true },
        { name: "Administración y Finanzas", href: "/admin/finanzas", icon: Coins, adminOnly: true },
        { name: "Comisiones de Vendedores", href: "/admin/comisiones", icon: Coins, adminOnly: true }
      ]
    },
    {
      title: "Logística y Distribución",
      links: [
        { name: "Gestión de Transportistas", href: "/admin/fleteros", icon: Truck, allowedRoles: ['admin', 'logistica'] },
        { name: "Ruteo de Entregas", href: "/vendedores/ruteo", icon: Truck },
        { name: "Impresión Logística", href: "/vendedores/ruteo/comprobantes", icon: Printer, allowedRoles: ['admin', 'logistica'] },
        { name: "Facturación Pendiente", href: "/admin/facturacion-pendiente", icon: PackageCheck, adminOnly: true },
        { name: "Control de Planillas", href: "/admin/control-planillas", icon: ClipboardCheck, allowedRoles: ['admin', 'logistica'] },
        { name: "Pedidos en Espera", href: "/admin/compras?tab=hold_orders", icon: Clock, adminOnly: true },
        { name: "Reclamos y Cambios", href: "/admin/compras?tab=claims_exchanges", icon: RefreshCw, adminOnly: true },
        { name: "Auditoría de Entregas", href: "/admin/auditoria-logistica", icon: Clock, adminOnly: true },
        { name: "Zonas y Localidades", href: "/admin/localidades-zonas", icon: Map, adminOnly: true },
        { name: "Tiempos de Entrega", href: "/admin/tiempos-entrega", icon: Clock, adminOnly: true }
      ]
    },
    {
      title: "Compras",
      links: [
        { name: "Órdenes de Compra", href: "/admin/compras?tab=purchase_orders", icon: ClipboardList, allowedRoles: ['admin', 'compras'] },
        { name: "Asistente de Compra", href: "/admin/compras?tab=purchase_calculator", icon: ShoppingCart, allowedRoles: ['admin', 'compras'] },
        { name: "Alertas de Costos", href: "/admin/compras?tab=alerts", icon: AlertTriangle, allowedRoles: ['admin', 'compras'] },
        { name: "Proveedores", href: "/admin/compras?tab=suppliers", icon: Users, adminOnly: true },
        { name: "Listas y Precios", href: "/admin/compras?tab=pricelists", icon: FileSpreadsheet, adminOnly: true },
        { name: "Registrar Compra", href: "/admin/compras?tab=new_purchase", icon: PlusCircle, adminOnly: true },
        { name: "Recepción de Remitos", href: "/admin/compras?tab=receptions", icon: PackageCheck, adminOnly: true },
        { name: "Historial de Compras", href: "/admin/compras?tab=purchases_history", icon: Clock, adminOnly: true }
      ]
    },
    {
      title: "Fábrica y Producción",
      links: [
        { name: "Control de Producción", href: "/admin/produccion", icon: Factory, adminOnly: true },
        { name: "Órdenes de Producción", href: "/admin/compras?tab=production", icon: ClipboardList, adminOnly: true },
        { name: "Recetas (BOM)", href: "/admin/compras?tab=boms", icon: Boxes, adminOnly: true },
        { name: "Insumos / Stock", href: "/admin/compras?tab=insumos", icon: Layers, adminOnly: true },
        { name: "Explorador BOM", href: "/admin/compras?tab=bom_explorer", icon: Database, adminOnly: true },
        { name: "Análisis Make vs Buy", href: "/admin/compras?tab=make_vs_buy", icon: Calculator, adminOnly: true },
        { name: "Stock de Fábrica", href: "/admin/stock-fabrica", icon: Layers, adminOnly: true },
        { name: "Costos de Fabricación", href: "/admin/gas-consumo", icon: Factory, adminOnly: true }
      ]
    },
    {
      title: "Inventario y Catálogo",
      links: [
        { name: "Catálogo General", href: "/admin/catalogo", icon: Database, adminOnly: true },
        { name: "Control de Stock", href: "/admin/stock", icon: Package, allowedRoles: ['admin', 'compras'] },
        { name: "Capital Estancado", href: "/admin/capital-estancado", icon: AlertTriangle, adminOnly: true },
        { name: "Lista de Precios Mayorista", href: "/admin/lista-mayorista", icon: Calculator, adminOnly: true },
        { name: "Rentabilidad y Margen", href: "/admin/rentabilidad", icon: BarChart3, adminOnly: true }
      ]
    },
    {
      title: "Soporte y Configuración",
      links: [
        { name: "Recursos y FAQs", href: "/vendedores/recursos", icon: BookOpen },
        { name: "Gestión de Usuarios", href: "/admin/vendedores", icon: Users, adminOnly: true },
        { name: "Configuración General", href: "/admin/ajustes", icon: Settings, adminOnly: true }
      ]
    }
  ];

  const isActive = (path: string) => {
    const cleanPathname = pathname.replace(/\/$/, "");
    const urlParts = path.split('?');
    const pathOnly = urlParts[0].replace(/\/$/, "");
    const queryOnly = urlParts[1];
    
    if (typeof window !== 'undefined') {
      const searchParams = new URLSearchParams(window.location.search);

      if (cleanPathname === "/vendedores/pedidos") {
        const currentClientType = searchParams.get('client_type') || 'minoristas';
        const currentTab = searchParams.get('tab') || 'list';
        if (queryOnly) {
          const linkParams = new URLSearchParams(queryOnly);
          const linkClientType = linkParams.get('client_type') || 'minoristas';
          const linkTab = linkParams.get('tab') || 'list';
          return pathOnly === "/vendedores/pedidos" && currentClientType === linkClientType && currentTab === linkTab;
        } else {
          return pathOnly === "/vendedores/pedidos" && currentClientType === 'minoristas' && currentTab === 'list';
        }
      }

      if (queryOnly) {
        const linkParams = new URLSearchParams(queryOnly);
        const activeTab = searchParams.get('tab') || 'suppliers';
        const linkTab = linkParams.get('tab');
        return cleanPathname === pathOnly && activeTab === linkTab;
      }
    }
    
    if (pathOnly === "/admin/catalogo" || pathOnly === "/vendedores" || pathOnly === "/admin/dashboard-mayorista" || pathOnly === "/vendedores/ruteo") {
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

    if (pathname === "/admin/catalogo") return { section: "Inventario y Catálogo", page: "Catálogo General" };
    if (pathname === "/vendedores") return { section: "Consola de Control", page: "Dashboard Vendedor" };
    return { section: "Panel ERP", page: "Inicio" };
  };

  const breadcrumbs = getBreadcrumbs();
  const userInitial = userEmail ? userEmail.charAt(0).toUpperCase() : "U";
  const roleLabel = userRoles.map(role => ({
    admin: 'Administrador',
    logistica: 'Logística',
    compras: 'Compras',
    fletero: 'Transportista',
    administracion: 'Administración',
    seller: 'Vendedor'
  })[role]).join(' + ');
  const normalizedImpersonationSearch = impersonationSearch.trim().toLowerCase();
  const filteredImpersonationUsers = impersonationUsers.filter(candidate => {
    if ((candidate.auth_user?.email || candidate.email || '').toLowerCase() === userEmail.toLowerCase()) return false;
    if (!normalizedImpersonationSearch) return true;
    return `${candidate.full_name} ${candidate.auth_user?.email || candidate.email} ${candidate.role}`
      .toLowerCase()
      .includes(normalizedImpersonationSearch);
  });

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
            href={isAdminRole ? "/admin/dashboard" : hasRole('logistica') || hasRole('fletero') || hasRole('administracion') ? "/admin/cobros-mp" : hasRole('compras') ? "/admin/compras?tab=purchase_orders" : "/vendedores"}
            onClick={closeSidebarOnMobile}
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
          {!isRoleLoaded ? (
            <div className="space-y-4 px-2 py-3 animate-pulse">
              <div className="h-3 w-20 bg-slate-800 rounded mb-3" />
              <div className="space-y-2">
                <div className="h-8 bg-slate-800/60 rounded-xl" />
                <div className="h-8 bg-slate-800/60 rounded-xl" />
              </div>
            </div>
          ) : (
            linkSections.map((section, sIdx) => {
              const visibleLinks = section.links.filter(link => {
                if (isSpecializedOperator) {
                  if (link.allowedRoles?.some(role => userRoles.includes(role))) return true;
                  if (hasRole('administracion')) {
                    return link.href === "/admin/finanzas";
                  }
                  return false;
                }
                if (isRestrictedSeller) {
                  const isAllowedWholesaleLink = canUseWholesale && (
                    link.href === "/vendedores/pedidos?tab=form&client_type=mayoristas" ||
                    link.href === "/vendedores/pedidos?tab=list&list_type=todos&status=Todos&client_type=mayoristas" ||
                    link.href === "/vendedores/clientes?client_type=mayoristas" ||
                    link.href === "/vendedores/presupuestos-mayorista"
                  );
                  return (
                    isAllowedWholesaleLink ||
                    link.href === "/vendedores" ||
                    link.href === "/vendedores/presupuestos" ||
                    link.href === "/vendedores/pedidos?tab=form&client_type=minoristas" ||
                    link.href === "/vendedores/pedidos?tab=list&client_type=minoristas" ||
                    link.href === "/admin/cobros-mp"
                  );
                }
                if (link.adminOnly && !isAdminRole) return false;
                if (link.allowedRoles && !link.allowedRoles.some(role => userRoles.includes(role))) return false;
                if (link.sellerOnly && isAdminRole) return false;
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
                          onClick={() => {
                            closeSidebarOnMobile();
                            if (link.href.includes('/vendedores/pedidos')) {
                              window.dispatchEvent(new CustomEvent('zono_nav_pedidos', { detail: { href: link.href } }));
                            }
                          }}
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
            })
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
                  {roleLabel}
                </span>
              </div>
            </div>
          )}

          {isAdminRole && !impersonation.active && (
            <button
              onClick={() => {
                closeSidebarOnMobile();
                void openImpersonationModal();
              }}
              className="w-full flex items-center justify-center gap-2 py-1.5 px-3 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 hover:text-indigo-200 border border-indigo-500/25 hover:border-indigo-400/40 rounded-xl text-xs font-semibold transition-all mb-2 cursor-pointer"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Ver como usuario</span>
            </button>
          )}

          {/* Self-service password change (Blocked for Fleteros and impersonated sessions) */}
          {!hasRole('fletero') && !impersonation.active && (
            <button
              onClick={() => {
                closeSidebarOnMobile();
                setSelfNewPassword("");
                setSelfConfirmPassword("");
                setSelfPwdError(null);
                setSelfPwdSuccess(false);
                setShowChangePasswordModal(true);
              }}
              className="w-full flex items-center justify-center gap-2 py-1.5 px-3 bg-slate-800/40 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/50 hover:border-slate-600 rounded-xl text-xs font-medium transition-all mb-2 cursor-pointer"
            >
              <KeyRound className="w-3.5 h-3.5 text-indigo-400" />
              <span>Cambiar Mi Contraseña</span>
            </button>
          )}

          <button 
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-slate-800/50 hover:bg-rose-950/40 text-slate-400 hover:text-rose-300 border border-slate-700/50 hover:border-rose-900/50 rounded-xl text-xs font-medium transition-all cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            {impersonation.active ? 'Volver a Administrador' : 'Cerrar Sesión'}
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
              <span>
                {roleLabel}
              </span>
            </div>
          </div>
        </header>

        {impersonation.active && (
          <div className="shrink-0 border-b border-amber-300 bg-amber-50 px-4 sm:px-6 py-2.5 text-xs text-amber-950">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Eye className="w-4 h-4 shrink-0 text-amber-700" />
                <span className="truncate">
                  Estás navegando como <strong>{impersonation.targetName || impersonation.targetEmail}</strong>
                  {impersonation.targetRole ? ` (${impersonation.targetRole})` : ''}. Se aplican sus permisos y datos reales.
                </span>
              </div>
              <button
                onClick={() => void stopImpersonation()}
                disabled={isSwitchingSession}
                className="shrink-0 inline-flex items-center justify-center gap-2 rounded-lg border border-amber-400 bg-white px-3 py-1.5 font-bold text-amber-900 hover:bg-amber-100 disabled:opacity-60"
              >
                {isSwitchingSession ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Shield className="w-3.5 h-3.5" />}
                Volver a administrador
              </button>
            </div>
            {impersonationError && <p className="mt-1.5 font-semibold text-rose-700">{impersonationError}</p>}
          </div>
        )}

        {/* Viewport Scroll Area */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-6 bg-slate-50 custom-scrollbar min-w-0">
          <div className="w-full min-w-0 space-y-6">
            {children}
          </div>
        </main>
      </div>

      {/* Modal: Ver como usuario */}
      {showImpersonationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl max-w-xl w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between gap-4 p-5 border-b border-slate-100">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                  <Eye className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900">Ver como usuario</h3>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">
                    Se abrirá una sesión real de ese usuario. Verás exactamente sus permisos, menús y datos.
                  </p>
                </div>
              </div>
              <button
                onClick={() => !isSwitchingSession && setShowImpersonationModal(false)}
                disabled={isSwitchingSession}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="relative">
                <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  value={impersonationSearch}
                  onChange={event => setImpersonationSearch(event.target.value)}
                  placeholder="Buscar por nombre, correo o rol..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                />
              </div>

              <div className="max-h-72 overflow-y-auto rounded-2xl border border-slate-200 divide-y divide-slate-100">
                {isLoadingImpersonationUsers ? (
                  <div className="py-12 flex items-center justify-center gap-2 text-sm text-slate-500">
                    <Loader2 className="w-4 h-4 animate-spin" /> Cargando usuarios...
                  </div>
                ) : filteredImpersonationUsers.length === 0 ? (
                  <div className="py-12 text-center text-sm text-slate-500">No hay usuarios disponibles.</div>
                ) : filteredImpersonationUsers.map(candidate => {
                  const selected = candidate.id === selectedImpersonationUserId;
                  return (
                    <button
                      key={candidate.id}
                      type="button"
                      onClick={() => setSelectedImpersonationUserId(candidate.id)}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${selected ? 'bg-indigo-50' : 'bg-white hover:bg-slate-50'}`}
                    >
                      <span className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${selected ? 'border-indigo-600' : 'border-slate-300'}`}>
                        {selected && <span className="w-2 h-2 rounded-full bg-indigo-600" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-slate-900 truncate">{candidate.full_name}</span>
                        <span className="block text-xs text-slate-500 truncate">{candidate.auth_user?.email || candidate.email}</span>
                      </span>
                      <span className="rounded-full bg-slate-100 border border-slate-200 px-2 py-1 text-[10px] font-bold uppercase text-slate-600">
                        {candidate.role || 'seller'}
                      </span>
                    </button>
                  );
                })}
              </div>

              {impersonationError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-700 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{impersonationError}</span>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 px-5 py-4 bg-slate-50 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowImpersonationModal(false)}
                disabled={isSwitchingSession}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void startImpersonation()}
                disabled={!selectedImpersonationUserId || isSwitchingSession}
                className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 inline-flex items-center gap-2"
              >
                {isSwitchingSession ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                {isSwitchingSession ? 'Cambiando sesión...' : 'Ver como este usuario'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Cambiar Mi Contraseña */}
      {showChangePasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                  <KeyRound className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-sm text-slate-900">Cambiar Contraseña</h3>
              </div>
              <button 
                onClick={() => setShowChangePasswordModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {selfPwdSuccess ? (
              <div className="py-4 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <h4 className="font-bold text-sm text-slate-900">¡Contraseña Actualizada!</h4>
                <p className="text-xs text-slate-500">Tu nueva contraseña ha sido guardada con éxito.</p>
              </div>
            ) : (
              <form onSubmit={handleSelfPasswordChange} className="space-y-4">
                {selfPwdError && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{selfPwdError}</span>
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Nueva Contraseña</label>
                  <div className="relative">
                    <input
                      type={showSelfPwd ? "text" : "password"}
                      required
                      placeholder="Mínimo 6 caracteres"
                      value={selfNewPassword}
                      onChange={(e) => setSelfNewPassword(e.target.value)}
                      className="w-full pl-3.5 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSelfPwd(!showSelfPwd)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      {showSelfPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Confirmar Contraseña</label>
                  <input
                    type={showSelfPwd ? "text" : "password"}
                    required
                    placeholder="Repetir nueva contraseña"
                    value={selfConfirmPassword}
                    onChange={(e) => setSelfConfirmPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>

                <div className="pt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowChangePasswordModal(false)}
                    className="flex-1 py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isChangingSelfPwd}
                    className="flex-1 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {isChangingSelfPwd ? <Loader2 className="w-4 h-4 animate-spin" /> : "Guardar"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

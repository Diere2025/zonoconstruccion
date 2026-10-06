import type { ComponentType } from 'react';
import { AlertTriangle, BarChart3, BookOpen, Boxes, Calculator, CalendarDays, ClipboardCheck, ClipboardList, Clock, Coins, Database, Factory, FileSpreadsheet, FileText, Layers, Link2, Map, Package, PackageCheck, PlusCircle, Printer, RefreshCw, Settings, ShieldCheck, ShoppingBag, ShoppingCart, Target, TrendingUp, Truck, Upload, Users, Wallet } from 'lucide-react';

export type UserRole = 'seller' | 'admin' | 'logistica' | 'fletero' | 'administracion' | 'compras';
export interface ErpLink {
  id: string;
  name: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  adminOnly?: boolean;
  sellerOnly?: boolean;
  allowedRoles?: UserRole[];
  ownerEmail?: string;
}
export interface ErpModule {
  id: string;
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  links: ErpLink[];
}
export interface NavigationIdentity {
  roles: UserRole[];
  restrictedSeller: boolean;
  canUseWholesale: boolean;
  email?: string;
}

export const erpModules: ErpModule[] = [
  { id: 'direccion', title: 'Dirección General', description: 'Seguimiento global, resultados y publicidad.', icon: BarChart3, links: [
    { id: "direccion-1", name: "Dashboard General", href: "/admin/dashboard", icon: BarChart3, adminOnly: true },
    { id: "direccion-2", name: "Meta Ads", href: "/admin/meta-ads", icon: Target, adminOnly: true },
    { id: "direccion-prompts", name: "Prompts de campañas", href: "/admin/prompts-campanas", icon: FileText, ownerEmail: 'diego.boveda@gmail.com' },
    { id: "direccion-3", name: "Estado de Resultados (EERR)", href: "/admin/finanzas/eerr", icon: FileSpreadsheet, adminOnly: true },
    { id: "direccion-4", name: "Rentabilidad y Margen", href: "/admin/rentabilidad", icon: BarChart3, adminOnly: true },
    { id: "direccion-5", name: "Capital Estancado", href: "/admin/capital-estancado", icon: AlertTriangle, adminOnly: true },
  ] },
  { id: 'minorista', title: 'Ventas Minoristas', description: 'Pedidos, presupuestos y clientes del canal minorista.', icon: ShoppingCart, links: [
    { id: "minorista-1", name: "Panel del Vendedor", href: "/vendedores", icon: BarChart3, sellerOnly: true },
    { id: "minorista-2", name: "Cargar Pedido", href: "/vendedores/pedidos?tab=form&client_type=minoristas", icon: PlusCircle },
    { id: "minorista-3", name: "Pedidos Minoristas", href: "/vendedores/pedidos?tab=list&client_type=minoristas", icon: ShoppingCart },
    { id: "minorista-4", name: "Cotizador Minorista", href: "/vendedores/presupuestos", icon: Calculator },
    { id: "minorista-5", name: "Presupuestos Minoristas", href: "/vendedores/cotizaciones?channel=minorista", icon: ClipboardCheck },
    { id: "minorista-6", name: "Clientes Minoristas", href: "/vendedores/clientes", icon: Users },
  ] },
  { id: 'mayorista', title: 'Ventas Mayoristas', description: 'Operación comercial y análisis del canal mayorista.', icon: ShoppingBag, links: [
    { id: "mayorista-1", name: "Dashboard Mayorista", href: "/admin/dashboard-mayorista", icon: TrendingUp, adminOnly: true },
    { id: "mayorista-2", name: "Cargar Pedido Mayorista", href: "/vendedores/pedidos?tab=form&client_type=mayoristas", icon: PlusCircle },
    { id: "mayorista-3", name: "Pedidos Mayoristas", href: "/vendedores/pedidos?tab=list&list_type=todos&status=Todos&client_type=mayoristas", icon: ShoppingBag },
    { id: "mayorista-4", name: "Clientes Mayoristas", href: "/vendedores/clientes?client_type=mayoristas", icon: Users },
    { id: "mayorista-5", name: "Cotizador Mayorista", href: "/vendedores/presupuestos-mayorista", icon: Calculator },
    { id: "mayorista-6", name: "Presupuestos Mayoristas", href: "/vendedores/cotizaciones?channel=mayorista", icon: ClipboardCheck },
  ] },
  { id: 'tesoreria', title: 'Tesorería y Finanzas', description: 'Pagos, rendiciones, cuentas y comprobantes.', icon: Wallet, links: [
    { id: "tesoreria-1", name: "Chequeo de Pagos", href: "/admin/cobros-mp", icon: ShieldCheck, allowedRoles: ['admin', 'seller', 'logistica', 'fletero', 'administracion'] },
    { id: "tesoreria-2", name: "Rendiciones de Recorridos", href: "/admin/rendiciones", icon: ClipboardList, allowedRoles: ['admin', 'administracion'] },
    { id: "tesoreria-3", name: "Caja Diaria", href: "/admin/caja", icon: Wallet, adminOnly: true },
    { id: "tesoreria-4", name: "Movimientos", href: "/admin/finanzas", icon: Coins, allowedRoles: ['admin', 'administracion'] },
    { id: "tesoreria-planificacion", name: "Planificación de pagos", href: "/admin/finanzas/planificacion", icon: CalendarDays, adminOnly: true },
    { id: "tesoreria-5", name: "Cuentas y saldos", href: "/admin/finanzas?tab=accounts", icon: Wallet, allowedRoles: ['admin', 'administracion'] },
    { id: "tesoreria-6", name: "Cuentas corrientes", href: "/admin/finanzas?tab=cc", icon: BookOpen, allowedRoles: ['admin', 'administracion'] },
    { id: "tesoreria-7", name: "Comprobantes a validar", href: "/admin/finanzas?tab=validations", icon: ShieldCheck, allowedRoles: ['admin', 'administracion'] },
    { id: "tesoreria-8", name: "Comprobantes de Tesorería", href: "/admin/comprobantes-tesoreria", icon: FileText, allowedRoles: ['admin', 'administracion'] },
    { id: "tesoreria-9", name: "Comisiones de Vendedores", href: "/admin/comisiones", icon: Coins, adminOnly: true },
    { id: "tesoreria-caja-personal", name: "Mi Caja", href: "/vendedores/caja", icon: Wallet, sellerOnly: true },
  ] },
  { id: 'logistica', title: 'Logística y Distribución', description: 'Entregas, recorridos, transportistas e impresión.', icon: Truck, links: [
    { id: 'logistica-solicitudes', name: 'Solicitudes a Logística', href: '/solicitudes-logistica', icon: ClipboardList },
    { id: "logistica-1", name: "Gestión de Transportistas", href: "/admin/fleteros", icon: Truck, allowedRoles: ['admin', 'logistica'] },
    { id: "logistica-2", name: "Ruteo de Entregas", href: "/vendedores/ruteo", icon: Truck },
    { id: "logistica-3", name: "Impresión Logística", href: "/vendedores/ruteo/comprobantes", icon: Printer, allowedRoles: ['admin', 'logistica'] },
    { id: "logistica-4", name: "Facturación Pendiente", href: "/admin/facturacion-pendiente", icon: PackageCheck, adminOnly: true },
    { id: "logistica-5", name: "Control de Planillas", href: "/admin/control-planillas", icon: ClipboardCheck, allowedRoles: ['admin', 'logistica'] },
    { id: "logistica-6", name: "Pedidos en Espera", href: "/admin/compras?tab=hold_orders", icon: Clock, adminOnly: true },
    { id: "logistica-7", name: "Auditoría de Entregas", href: "/admin/auditoria-logistica", icon: Clock, adminOnly: true },
    { id: "logistica-8", name: "Zonas y Localidades", href: "/admin/localidades-zonas", icon: Map, adminOnly: true },
    { id: "logistica-9", name: "Tiempos de Entrega", href: "/admin/tiempos-entrega", icon: Clock, adminOnly: true },
    { id: "logistica-10", name: "Categorías de impresión", href: "/admin/configuracion-impresion", icon: Printer, allowedRoles: ['admin', 'logistica'] },
  ] },
  { id: 'compras', title: 'Compras y Proveedores', description: 'Abastecimiento, proveedores y control de costos.', icon: ShoppingCart, links: [
    { id: "compras-1", name: "Órdenes de Compra", href: "/admin/compras?tab=purchase_orders", icon: ClipboardList, allowedRoles: ['admin', 'compras'] },
    { id: "compras-2", name: "Asistente de Compra", href: "/admin/compras?tab=purchase_calculator", icon: ShoppingCart, allowedRoles: ['admin', 'compras'] },
    { id: "compras-3", name: "Alertas de Costos", href: "/admin/compras?tab=alerts", icon: AlertTriangle, allowedRoles: ['admin', 'compras'] },
    { id: "compras-4", name: "Proveedores", href: "/admin/compras?tab=suppliers", icon: Users, adminOnly: true },
    { id: "compras-5", name: "Listas de Proveedores", href: "/admin/compras?tab=pricelists", icon: FileSpreadsheet, adminOnly: true },
    { id: "compras-7", name: "Recepción de Remitos", href: "/admin/compras?tab=receptions", icon: PackageCheck, adminOnly: true },
    { id: "compras-8", name: "Historial de Compras", href: "/admin/compras?tab=purchases_history", icon: Clock, adminOnly: true },
    { id: "compras-9", name: "Precios y Fórmulas", href: "/admin/compras?tab=relations", icon: Calculator, adminOnly: true },
  ] },
  { id: 'produccion', title: 'Fábrica y Producción', description: 'Fabricación, recetas, insumos y costos.', icon: Factory, links: [
    { id: "produccion-1", name: "Control de Producción", href: "/admin/produccion", icon: Factory, adminOnly: true },
    { id: "produccion-2", name: "Órdenes de Producción", href: "/admin/compras?tab=production", icon: ClipboardList, adminOnly: true },
    { id: "produccion-3", name: "Recetas de Producción", href: "/admin/compras?tab=boms", icon: Boxes, adminOnly: true },
    { id: "produccion-4", name: "Insumos / Stock", href: "/admin/compras?tab=insumos", icon: Layers, adminOnly: true },
    { id: "produccion-5", name: "Explorador de Recetas", href: "/admin/compras?tab=bom_explorer", icon: Database, adminOnly: true },
    { id: "produccion-6", name: "Fabricar o Comprar", href: "/admin/compras?tab=make_vs_buy", icon: Calculator, adminOnly: true },
    { id: "produccion-7", name: "Stock de Fábrica", href: "/admin/stock-fabrica", icon: Layers, adminOnly: true },
    { id: "produccion-8", name: "Costos de Fabricación", href: "/admin/gas-consumo", icon: Factory, adminOnly: true },
  ] },
  { id: 'inventario', title: 'Inventario y Catálogo', description: 'Productos, existencias y precios de venta.', icon: Package, links: [
    { id: "inventario-1", name: "Catálogo General", href: "/admin/catalogo", icon: Database, adminOnly: true },
    { id: "inventario-2", name: "Control de Stock", href: "/admin/stock", icon: Package, allowedRoles: ['admin', 'compras'] },
    { id: "inventario-3", name: "Lista de Precios Mayorista", href: "/admin/lista-mayorista", icon: Calculator, adminOnly: true },
    { id: "inventario-4", name: "Vinculación de Productos Mayoristas", href: "/admin/dashboard-mayorista?tab=mapping", icon: Link2, adminOnly: true },
  ] },
  { id: 'postventa', title: 'Postventa', description: 'Cambios, garantías y atención posterior a la venta.', icon: RefreshCw, links: [
    { id: "postventa-1", name: "Postventa y Garantías", href: "/vendedores/postventa", icon: RefreshCw },
    { id: "postventa-2", name: "Gestión de Reclamos y Cambios", href: "/admin/compras?tab=claims_exchanges", icon: RefreshCw, adminOnly: true },
  ] },
  { id: 'soporte', title: 'Soporte y Sistema', description: 'Incidencias, recursos, usuarios y configuración.', icon: Settings, links: [
    { id: "soporte-1", name: "Incidencias y Tickets", href: "/incidencias", icon: ClipboardList },
    { id: "soporte-2", name: "Recursos y Preguntas Frecuentes", href: "/vendedores/recursos", icon: BookOpen },
    { id: "soporte-3", name: "Gestión de Usuarios", href: "/admin/vendedores", icon: Users, adminOnly: true },
    { id: "soporte-4", name: "Configuración General", href: "/admin/ajustes", icon: Settings, adminOnly: true },
    { id: "soporte-5", name: "Sincronizar Planillas", href: "/admin/importar-pedidos", icon: Upload, allowedRoles: ['admin', 'compras'] },
  ] },
];

// One visibility policy for both the sidebar and the home screen.
export function visibleErpModules(identity: NavigationIdentity): ErpModule[] {
  const { roles, restrictedSeller, canUseWholesale } = identity;
  const admin = roles.includes('admin');
  const specialized = !admin && !roles.includes('seller') && roles.some(role =>
    ['logistica', 'fletero', 'administracion', 'compras'].includes(role));
  return erpModules.map(module => ({ ...module, links: module.links.filter(link => {
    if (link.ownerEmail && identity.email?.trim().toLowerCase() !== link.ownerEmail) return false;
    if (link.href === '/incidencias' || link.href === '/solicitudes-logistica') return true;
    if (specialized) return Boolean(link.allowedRoles?.some(role => roles.includes(role)));
    if (restrictedSeller && !admin) {
      const wholesale = canUseWholesale && [
        '/vendedores/pedidos?tab=form&client_type=mayoristas',
        '/vendedores/pedidos?tab=list&list_type=todos&status=Todos&client_type=mayoristas',
        '/vendedores/clientes?client_type=mayoristas', '/vendedores/presupuestos-mayorista',
        '/vendedores/cotizaciones?channel=mayorista'
      ].includes(link.href);
      return wholesale || [
        '/admin/cobros-mp', '/vendedores', '/vendedores/presupuestos',
        '/vendedores/pedidos?tab=form&client_type=minoristas',
        '/vendedores/pedidos?tab=list&client_type=minoristas'
      ].includes(link.href);
    }
    if (link.adminOnly && !admin) return false;
    if (link.allowedRoles && !link.allowedRoles.some(role => roles.includes(role))) return false;
    if (link.sellerOnly && admin) return false;
    return true;
  }) })).filter(module => module.links.length > 0);
}

function navigationPath(path: string) {
  const clean = path.replace(/\/$/, '');
  return clean === '/vendedores/ruteo/remitos' ? '/vendedores/ruteo/comprobantes' : clean;
}

function destinationQuery(path: string, search: string) {
  const params = new URLSearchParams(search);
  if (path === '/vendedores/pedidos') {
    if (!params.has('tab')) params.set('tab', 'list');
    if (!params.has('client_type')) params.set('client_type', 'minoristas');
    params.delete('list_type');
    params.delete('status');
  }
  if (path === '/vendedores/clientes' && !params.has('client_type')) params.set('client_type', 'minoristas');
  if (path === '/admin/compras' && !params.has('tab')) params.set('tab', 'purchase_orders');
  if (path === '/admin/finanzas') {
    const tab = params.get('tab');
    if (!['accounts', 'cc', 'validations'].includes(tab || '')) params.set('tab', 'flow');
  }
  return params;
}

export function activeErpLink(modules: ErpModule[], pathname: string, search: string) {
  const path = navigationPath(pathname);
  const current = destinationQuery(path, search);
  let best: { module: ErpModule; link: ErpLink; score: number } | undefined;
  for (const entry of modules) for (const link of entry.links) {
    const [rawPath, query = ''] = link.href.split('?');
    const targetPath = navigationPath(rawPath);
    if (path !== targetPath && !path.startsWith(`${targetPath}/`)) continue;
    if (targetPath === '/vendedores' && path !== targetPath) continue;
    const target = destinationQuery(targetPath, query);
    if (Array.from(target.entries()).some(([key, value]) => current.get(key) !== value)) continue;
    const score = targetPath.length * 10 + Array.from(target.keys()).length;
    if (!best || score > best.score) best = { module: entry, link, score };
  }
  return best;
}

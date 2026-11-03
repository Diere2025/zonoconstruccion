import type { ErpModule } from './erpNavigation';
import { Settings, BarChart3 } from 'lucide-react';

// Presentation consumes authorized links. Screen IDs, URLs and access rules
// continue to belong to erpNavigation.
export function presentErpModules(modules: ErpModule[]): ErpModule[] {
  const logistics = modules.find(module => module.id === 'logistica');
  if (!logistics) return modules;
  const configuration = new Set(['logistica-via-cargo', 'logistica-1', 'logistica-8', 'logistica-10']);
  const analysis = new Set(['logistica-4', 'logistica-9']);
  const groups = ['Planificación y ruteo', 'Solicitudes y esperas', 'Control de entregas'];
  const operation = logistics.links.filter(link => !configuration.has(link.id) && !analysis.has(link.id))
    .sort((left, right) => groups.indexOf(logisticsGroup(left.id)) - groups.indexOf(logisticsGroup(right.id)));
  const result = modules.map(module => module.id === 'logistica'
    ? { ...module, description: 'Planificación, solicitudes y control de entregas.', links: operation }
    : module);
  result.push({
    id: 'analisis-logistica', title: 'Análisis · Logística',
    description: 'Facturación pendiente y tiempos de entrega.', icon: BarChart3,
    links: logistics.links.filter(link => analysis.has(link.id)),
  }, {
    id: 'configuracion-logistica', title: 'Configuración · Logística',
    description: 'Transportistas, despacho, zonas y categorías de impresión.', icon: Settings,
    links: logistics.links.filter(link => configuration.has(link.id)),
  });
  return result.filter(module => module.links.length > 0);
}

export function logisticsGroup(id: string): string {
  if (['logistica-planificacion', 'logistica-2', 'logistica-3'].includes(id)) return 'Planificación y ruteo';
  if (['logistica-solicitudes', 'logistica-6'].includes(id)) return 'Solicitudes y esperas';
  return 'Control de entregas';
}

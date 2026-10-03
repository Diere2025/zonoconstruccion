export const CAMPAIGN_OPTIONS = [
  { value: 'all', label: 'Todas las campañas' },
  { value: 'cooper', label: 'Termotanques Cooper' },
  { value: 'universal', label: 'Termotanques Universal' },
  { value: 'bio500', label: 'Biofort Combo 500 L' },
  { value: 'bioauto', label: 'Biofort Autolimpiable' },
  { value: 'tanques', label: 'Tanques Aquafort' },
  { value: 'escaleras', label: 'Escaleras' },
  { value: 'latex', label: 'Látex Zono' },
  { value: 'meps', label: 'MEPS / Equilibrio' },
];

export const ACCOUNT_OPTIONS = ['S731.04', 'S731.01', 'S731.02', 'S731.03'].map(value => ({ value, label: value }));
export const SOURCE_OPTIONS = [
  { value: 'meta', label: 'Meta Ads' }, { value: 'erp', label: 'ERP / pedidos' },
  { value: 'whaticket', label: 'Whaticket' }, { value: 'costos', label: 'BD Costos' },
  { value: 'precios', label: 'BD Precios · PVP por fecha' },
  { value: 'planillas', label: 'Planillas de vendedores' },
  { value: 'compras', label: 'Compras y reposición' },
  { value: 'logistica', label: 'Logística y entregas' },
];
export const FOCUS_OPTIONS = [
  { value: 'profit', label: 'Rentabilidad real' },
  { value: 'scale', label: 'Escalar inversión' },
  { value: 'creative', label: 'Anuncios y saturación' },
  { value: 'service', label: 'Atención y cierre de consultas' },
  { value: 'pricing', label: 'Precio y promociones' },
  { value: 'cannibal', label: 'Canibalización entre campañas' },
  { value: 'operations', label: 'Capacidad, stock y entregas' },
  { value: 'debt', label: 'Caja y aporte a deuda' },
];
export const COMPARISON_OPTIONS = [
  { value: 'prior', label: 'Período anterior equivalente' },
  { value: 'weekdays', label: 'Mismos días de semana' },
  { value: 'before_after', label: 'Antes y después de cambios' },
  { value: 'year', label: 'Mismo período del año anterior' },
];

export interface PromptParameters {
  campaigns: string[];
  campaignsExtra: string;
  accounts: string[];
  sources: string[];
  focus: string[];
  comparisons: string[];
  objective: string;
  periodDays: number;
  recentDays: number;
  fromDate: string;
  toDate: string;
  includeToday: boolean;
  maxAdditionalUsd: string;
  marginGoal: string;
  usdArsRule: string;
  costRule: string;
  freightRule: string;
  debtRule: string;
  recentChanges: string;
  operationalLimits: string;
  previousReport: string;
  extraInstructions: string;
}

export const DEFAULT_PARAMETERS: PromptParameters = {
  campaigns: ['all'], campaignsExtra: '', accounts: ['S731.04'], sources: SOURCE_OPTIONS.map(option => option.value),
  focus: ['profit', 'scale', 'creative', 'service'], comparisons: ['prior', 'weekdays'],
  objective: 'Aumentar la contribución después de publicidad y logística sin perder facturación',
  periodDays: 14, recentDays: 3, fromDate: '', toDate: '', includeToday: true, maxAdditionalUsd: '', marginGoal: '',
  usdArsRule: 'Costo efectivo de pago de la pauta; si falta, presentar escenarios y aclarar el tipo de cambio',
  costRule: 'BD Costos, sin IVA según criterio gerencial; verificar si el valor de origen ya excluye IVA',
  freightRule: 'Usar costos reales y costo incremental del recorrido compartido; si faltan, escenarios explícitos',
  debtRule: 'Sin aporte adicional a deuda, salvo que se indique un porcentaje',
  recentChanges: '', operationalLimits: '', previousReport: '', extraInstructions: '',
};

export interface PromptTemplate { key: string; name: string; description: string; parameters: Partial<PromptParameters> }
export const PROMPT_TEMPLATES: PromptTemplate[] = [
  { key: 'general', name: 'Todas las campañas', description: 'Mapa de rentabilidad y prioridades de inversión.', parameters: { campaigns: ['all'], focus: ['profit', 'scale', 'service', 'cannibal'] } },
  { key: 'cooper', name: 'Cooper · escalar con margen', description: 'Ventas por capacidad, publicidad, precio y carga comercial.', parameters: { campaigns: ['cooper'], focus: ['profit', 'scale', 'creative', 'service', 'pricing'], operationalLimits: 'Cooper tiene reposición inmediata; comprobar capacidad de atención y entrega, no asumir quiebre por el stock registrado.' } },
  { key: 'bio500', name: 'Biofort 500 L · ventas y costo', description: 'Costo de mensajes, cierres, combos y logística compartida.', parameters: { campaigns: ['bio500'], focus: ['profit', 'creative', 'service', 'pricing'], operationalLimits: 'Biofort se fabrica internamente; el stock registrado puede ser incorrecto. Verificar capacidad y plazos reales de fabricación.' } },
  { key: 'bioauto', name: 'Biofort Autolimpiable', description: 'Operaciones grandes, presupuestos, seguimiento y margen.', parameters: { campaigns: ['bioauto'], focus: ['profit', 'service', 'creative', 'operations'], operationalLimits: 'Producto fabricado internamente; revisar cotizaciones abiertas y tiempos de cierre antes de atribuir cambios a la pauta.' } },
  { key: 'tanques', name: 'Tanques Aquafort', description: 'Mix de capacidades, fabricación y ventas por anuncio.', parameters: { campaigns: ['tanques'], focus: ['profit', 'scale', 'creative', 'operations'], operationalLimits: 'Tanques de fabricación propia; el stock del ERP puede ser incorrecto. Revisar producción y entrega reales.' } },
  { key: 'escaleras', name: 'Escaleras · prueba comercial', description: 'Unidades necesarias, costo por venta y aporte a deuda.', parameters: { campaigns: ['escaleras'], focus: ['profit', 'scale', 'pricing', 'debt'], debtRule: 'Evaluar como escenario un aporte a deuda del 10% sobre el costo de la mercadería vendida; mostrarlo por separado sin duplicar costos.', recentChanges: 'Precio de referencia histórico $159.000 e inversión inicial US$30/día: verificar ambos valores actuales en fuentes antes de usarlos.' } },
  { key: 'latex', name: 'Látex Zono · combos', description: 'Balde individual, dos unidades y kit con enduído y fijador.', parameters: { campaigns: ['latex'], focus: ['profit', 'pricing', 'creative', 'service'], recentChanges: 'Promociones históricas: 1 balde $63.800, 2 a $59.800 cada uno, kit látex + enduído 4 L + fijador 4 L $89.900. Verificar precios vigentes.' } },
  { key: 'universal', name: 'Universal · liquidación', description: 'Ventas remanentes frente a Cooper y decisión de pauta.', parameters: { campaigns: ['universal', 'cooper'], focus: ['profit', 'pricing', 'cannibal'], operationalLimits: 'Universal sin reposición prevista. Analizar salida rentable de remanentes y comparación con Cooper; no recomendar compra de más Universal por stock ERP.' } },
  { key: 'meps', name: 'MEPS / Equilibrio', description: 'Diagnóstico de ventas y decisión de continuidad.', parameters: { campaigns: ['meps'], focus: ['profit', 'creative', 'service', 'pricing'] } },
  { key: 'cannibal', name: 'Campañas · competencia interna', description: 'Presupuesto, públicos y tiempo de las vendedoras.', parameters: { campaigns: ['all'], focus: ['cannibal', 'service', 'profit', 'creative'], comparisons: ['prior', 'weekdays', 'before_after'] } },
];

function labels(values: string[], options: { value: string; label: string }[]) {
  return values.map(value => options.find(option => option.value === value)?.label || value).join(', ') || 'Todas las disponibles';
}
function given(value: string) { return value.trim() || 'No informado; investigar en las fuentes y mostrar escenarios si afecta la decisión'; }

export function buildMarketingPrompt(p: PromptParameters): string {
  return `Actuá como analista comercial y de publicidad de Zono Construcción y Hogar. Hacé una investigación profunda con datos reales y terminá con decisiones concretas. Fecha de ejecución: la fecha actual del entorno. Zona horaria: America/Argentina/Buenos_Aires. Si algún dato no está disponible, investigá lo posible y explicá el límite; no inventes resultados ni sustituyas datos actuales por históricos.

PARÁMETROS
- Campañas / productos: ${labels(p.campaigns, CAMPAIGN_OPTIONS)}${p.campaignsExtra.trim() ? `; adicionales: ${p.campaignsExtra.trim()}` : ''}. Verificá nombres e IDs actuales en Meta; los nombres de esta plantilla pueden haber cambiado.
- Cuentas publicitarias: ${p.accounts.join(', ') || 'Identificar cuentas vigentes'}.
- Fuentes a cruzar: ${labels(p.sources, SOURCE_OPTIONS)}. Si una fuente esencial quedó fuera, indicá cómo limita la conclusión.
- Focos principales: ${labels(p.focus, FOCUS_OPTIONS)}. Profundizá estos temas sin omitir la rentabilidad básica.
- Objetivo de negocio: ${given(p.objective)}.
- Período principal: ${p.fromDate && p.toDate ? `desde ${p.fromDate} hasta ${p.toDate} inclusive` : `últimos ${p.periodDays} días COMPLETOS`}; señal reciente: últimos ${p.recentDays} días COMPLETOS dentro del período principal cuando corresponda.
- Comparaciones: ${labels(p.comparisons, COMPARISON_OPTIONS)}. Usar cortes y días equivalentes.
- Hoy: ${p.includeToday ? 'incluirlo aparte como día parcial, con hora exacta de corte' : 'excluir del análisis principal'}.
- Aumento máximo diario de pauta: ${p.maxAdditionalUsd.trim() ? `US$${p.maxAdditionalUsd.trim()} adicionales por día` : 'no definido; proponer escenarios sin asumir autorización para cambiar presupuestos'}.
- Meta de margen / ganancia: ${given(p.marginGoal)}.
- Conversión USD/ARS: ${given(p.usdArsRule)}.
- Costos: ${given(p.costRule)}. Usar precio efectivamente vendido y costo histórico si existe; comparar por separado con costo de reposición y PVP vigentes. Nunca descontar IVA dos veces.
- Flete y gastos variables: ${given(p.freightRule)}.
- Aporte a deuda: ${given(p.debtRule)}.
- Cambios recientes: ${given(p.recentChanges)}. Tratar referencias históricas como hipótesis hasta verificar vigencia.
- Límites operativos: ${given(p.operationalLimits)}.
- Informe anterior: ${given(p.previousReport)}.
- Instrucciones adicionales: ${given(p.extraInstructions)}.

MÉTODO DE INVESTIGACIÓN
1. Registrá fecha, hora, moneda, cobertura y estado de cada fuente. Buscá Meta Ads directamente, pedidos e ítems del ERP, anulados y devoluciones, planillas aún no importadas, Whaticket con líneas y agentes, BD Costos, BD Precios (PVP por fecha), logística y compras cuando corresponda. Detectá duplicados, pedidos sin costo, retrasos de carga y ventas todavía pendientes. Cuantificá la cobertura de costos y atribución. No expongas tokens ni datos personales.
2. Compará períodos equivalentes, separando minorista, mayorista y operaciones excepcionales. Mostrá facturación, pedidos, unidades y ticket. Descomponé la variación en volumen, precio, mezcla, descuentos y anulaciones. Separá fecha de pedido, entrega y cobro: facturar no equivale a dinero disponible.
3. En Meta, bajá campaña, conjunto y anuncio con ID, estado, gasto, presupuesto, conversaciones, costo por conversación, impresiones, alcance, frecuencia, CPM, CTR de enlace, destino de WhatsApp y evolución diaria. Incluí anuncios pausados si tuvieron gasto dentro del período. Una frecuencia alta o un día flojo no demuestran saturación; buscá deterioro sostenido y muestra suficiente. Si proyectás gasto de hoy, usá patrones comparables y un rango, sin extrapolación lineal obligatoria.
4. Cruzá Whaticket con pedidos. Buscá metadatos verificables de origen del anuncio (por ejemplo source_id o ctwa_clid), teléfono normalizado, ticket y código de pedido. Clasificá cada vinculación como confirmada, probable o sin atribución; nunca asignes una venta a un anuncio solo por compartir producto o línea de WhatsApp, ni la dupliques. Diferenciá anuncio de entrada, productos finalmente comprados y venta cruzada. Compará cohortes de consultas con igual tiempo disponible para cerrar.
5. Medí consultas únicas y repetidas, primera respuesta humana, consultas fuera de horario o sin respuesta, presupuestos, seguimientos, ventas, tiempo hasta cerrar y motivos de pérdida. Evaluá si una campaña absorbe tiempo comercial que necesitaban otras. Revisá muestras de conversaciones anonimizadas antes de atribuir causas a un vendedor.
6. Calculá por familia, campaña y anuncio atribuible: ventas brutas, anulaciones, ventas válidas, costo de mercadería, margen antes de pauta, publicidad convertida a ARS, flete, comisiones, embalaje, contribución luego de gastos variables, margen porcentual, costo por pedido válido y efectivo cobrado. La publicidad de consultas sin venta y pedidos anulados sigue siendo gasto. En combos repartí descuentos y costos compartidos sin duplicar ingresos; en recorridos compartidos distinguí costo asignado y costo incremental. No llames ganancia neta a un resultado que excluye gastos fijos e impuestos.
7. Para cada cambio importante evaluá hipótesis: inversión, entrega de Meta, calidad de consultas, atención, demora para cerrar, precio, competencia, canibalización de presupuestos o públicos, stock real, fabricación, logística y caja. Separá dato comprobado, inferencia y dato faltante. El stock registrado de tanques y biodigestores fabricados internamente puede ser incorrecto; Cooper tiene reposición inmediata. Universal estaba en liquidación sin nueva reposición prevista: verificá si sigue vigente.
8. Calculá punto de equilibrio, contribución por venta, costo máximo por venta y por conversación (solo con conversión observada confiable), ventas diarias/semanales necesarias y escenarios de presupuesto conservador/base. No asumas que duplicar pauta duplica ventas. Si hay aporte a deuda, separá resultado comercial, dinero destinado a deuda y remanente; no cuentes deuda como otro costo de mercadería.

ENTREGA
- Diagnóstico inicial: qué deja dinero, qué consume recursos y cuál es el límite principal.
- Tabla por campaña/familia: gasto, conversaciones, pedidos y cobertura de atribución, ventas válidas, anulados, costos, gastos variables, contribución y margen.
- Tabla por anuncio atribuible con decisión: mantener, aumentar, observar, renovar o pausar. Si faltan ventas vinculadas, no inventes ranking de rentabilidad por anuncio.
- Tres acciones prioritarias para próximas 48–72 horas: acción concreta, motivo, impacto esperado, supuestos y medida de éxito.
- Propuesta de inversión con importes cuando el dato lo permite, condiciones para aumentar o frenar y capacidad de atención necesaria.
- Comparación con informe anterior si se proporcionó y lista breve de datos faltantes que podrían cambiar la decisión.
- Guardá informe fechado y tabla resumen si el entorno lo permite. Analizá y recomendá; no modifiques presupuestos, precios, pedidos, anuncios ni envíes mensajes sin instrucción expresa.`;
}

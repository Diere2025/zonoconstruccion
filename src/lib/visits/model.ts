export const visitStatuses = { proposed: 'Propuesta', confirmed: 'Confirmada', completed: 'Realizada', missed: 'No realizada', cancelled: 'Cancelada' } as const;
export const outcomes = { pending: 'En seguimiento', won: 'Venta concretada', lost: 'Venta no concretada' } as const;
export const lossReasons = { price: 'Precio / presupuesto', payment: 'Forma de pago / financiación', competitor: 'Eligió otro proveedor', self_install: 'Lo hará por su cuenta', technical: 'Condiciones técnicas no viables', postponed: 'Obra postergada / cancelada', no_response: 'No respondió tras seguimiento', other: 'Otro motivo' } as const;
export const pendingReasons = { contact: 'Pendiente de contactar', quote: 'Pendiente de presupuesto', response: 'Esperando respuesta', evaluating: 'Evaluando presupuesto', financing: 'Esperando financiación', construction: 'Esperando avance de obra', other: 'Otra gestión pendiente' } as const;
export const contactResults = { attempted: 'Intento sin respuesta', contacted: 'Se comunicó con el cliente' } as const;
export const quoteStatuses = { draft: 'Borrador', sent: 'Enviado', accepted: 'Aceptado', rejected: 'Rechazado', replaced: 'Reemplazado' } as const;
export const eventLabels: Record<string, string> = { create: 'Solicitud creada', edit: 'Datos actualizados', assign: 'Responsables actualizados', contact: 'Contacto registrado', kit: 'Kit definido', appointment: 'Visita coordinada', visit_result: 'Resultado de visita', quote: 'Presupuesto registrado', quote_status: 'Estado de presupuesto', outcome: 'Resultado comercial', note: 'Observación', payment: 'Cobro de visita informado', order_link: 'Pedido vinculado', order_unlink: 'Pedido desvinculado', attachment: 'Archivo adjunto' };
export type Outcome = keyof typeof outcomes;
export type AppointmentStatus = keyof typeof visitStatuses;
export interface Kit { id: string; name: string; sku: string | null; price: number; custom?: boolean; }
export interface Person { id: string; name: string; roles: string[]; }
export interface VisitsMe { id: string; name: string; commercial: boolean; administrator: boolean; kits: Kit[]; people: Person[]; default_installer_id?: string; default_visit_fee?: number; localities?: {id:string;name:string}[]; extra_products?: VisitExtra[]; }
export interface VisitCase {
  id: string; number: number; version: number; customer_name: string; phone: string; locality: string; address: string;
  locality_id?:string|null; installation_date?:string|null; requested_date?:string|null; requested_time?:string|null; maps_url: string; request_reason: string; notes: string; seller_id: string; installer_id: string | null;
  interest_kit: Kit; final_kit: Kit | null; outcome: Outcome; outcome_reason: string; outcome_note: string;
  outcome_at: string | null; next_action: string; next_at: string | null; next_owner_id: string | null;
  contact_status: 'none' | 'attempted' | 'contacted'; quote_amount: number | null; quote_status: string;
  quote_id: string | null; last_visit_at: string | null; visit_count: number; payment_amount: number; deposit_amount?:number;
  initial_installation_amount?: number | null; visit_fee?: number; discount_visit_fee?: boolean; extras?: string; extras_products?: VisitExtra[]; created_at: string; updated_at: string;
}
export interface Appointment { id: string; case_id: string; mode: 'onsite' | 'video'; date: string; start_time: string; end_time: string; status: AppointmentStatus; client_confirmed: boolean; installer_confirmed: boolean; note: string; result: string; performed_at: string | null; }
export interface QuoteLine { description: string; quantity: number; unit_price: number; }
export interface VisitQuote { id: string; case_id: string; number: number; kit: Kit; lines: QuoteLine[]; total: number; conditions: string; exclusions: string; valid_until: string; status: keyof typeof quoteStatuses; communicated_at: string | null; created_at: string; }
export interface VisitEvent { id: string; actor_id: string; kind: string; body: string; data: Record<string, unknown>; created_at: string; }
export interface VisitAttachment { id: string; name: string; mime: string; bytes: number; url: string; }
export interface VisitOrder { order_id: string; reference: string; }
export interface VisitDetail { visit: VisitCase; commercial?: {whaticket_link:string}|null; appointments: Appointment[]; quotes: VisitQuote[]; events: VisitEvent[]; orders: VisitOrder[]; attachments: VisitAttachment[]; }
export const visitCode = (n: number) => `VIS-${String(n).padStart(6, '0')}`;
export const money = (n: number | null) => n === null ? 'Sin presupuesto' : new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 }).format(Number(n));
export const localDate = (value: string) => new Date(value).toLocaleDateString('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' });
export const dateTimeLabel = (value: string | null) => value ? new Date(value).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'short', timeStyle: 'short' }) : 'Sin fecha';
export function reasonLabel(outcome: string, reason: string): string {
  const labels: Record<string, string> = outcome === 'lost' ? lossReasons : pendingReasons;
  return labels[reason] || '';
}
export function safeExternalUrl(value: string): string {
  if (!value) return '';
  try { const url = new URL(value); return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : ''; } catch { return ''; }
}
export function quoteTotal(lines: QuoteLine[]): number {
  return Math.round(lines.reduce((total, line) => total + Math.round(line.quantity * line.unit_price * 100) / 100, 0) * 100) / 100;
}
export function summarizeVisits(visits: VisitCase[]) {
  const visited = visits.filter(v => v.visit_count > 0);
  const won = visited.filter(v => v.outcome === 'won').length;
  const reasons: Record<string, number> = {};
  for (const v of visited.filter(v => v.outcome === 'lost')) reasons[v.outcome_reason] = (reasons[v.outcome_reason] || 0) + 1;
  return { appointments: visits.reduce((n, v) => n + v.visit_count, 0), opportunities: visited.length, won, pending: visited.filter(v => v.outcome === 'pending').length, lost: visited.filter(v => v.outcome === 'lost').length, conversion: visited.length ? Math.round(won * 100 / visited.length) : 0, reasons };
}

export function sortVisitKits(kits: Kit[]): Kit[] {
  const capacity = (name: string) => { const match = name.match(/(\d+(?:[.,]\d+)?)\s*(?:l|litros)\b/i); return match ? Number(match[1].replace(',', '.')) : Number.MAX_SAFE_INTEGER; };
  return [...kits].sort((a,b) => Number(/autolimp/i.test(b.name)) - Number(/autolimp/i.test(a.name)) || capacity(a.name) - capacity(b.name) || a.name.localeCompare(b.name,'es',{numeric:true}));
}

export interface VisitExtra { code: 'additional' | 'termination'; name:string; product_id:string|null; quantity:number; unit_price:number|null; unit: 'metro' | 'unidad'; }

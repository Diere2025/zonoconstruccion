import { contactResults, lossReasons, pendingReasons, safeExternalUrl, quoteTotal, visitStatuses } from './model';
export class VisitsError extends Error { constructor(message: string, public status = 400) { super(message); } }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function requireId(value: unknown): string { if (typeof value !== 'string' || !uuid.test(value)) throw new VisitsError('La referencia no es válida.'); return value; }
function text(data: Record<string, unknown>, key: string, required = false, max = 3000) {
  const value = data[key] ?? '';
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw new VisitsError(`Completá ${key} con un texto válido.`);
}
function date(value: unknown) { if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(`${value}T12:00:00Z`)) || new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) !== value) throw new VisitsError('La fecha no es válida.'); }
function instant(value: unknown) { if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value) || !Number.isFinite(Date.parse(value))) throw new VisitsError('Indicá una fecha y hora válidas.'); }
function amount(value: unknown) { if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100000000 || Math.abs(value * 100 - Math.round(value * 100)) > 0.00001) throw new VisitsError('El importe debe ser positivo y tener hasta dos decimales.'); }
export function validateCommand(command: string, data: Record<string, unknown>) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new VisitsError('Los datos no son válidos.');
  if (JSON.stringify(data).length > 40000) throw new VisitsError('Los datos son demasiado extensos.');
  switch (command) {
    case 'create': case 'edit':
      for (const field of ['customer_name', 'phone', 'locality', 'request_reason']) text(data, field, true, 500);
      if(data.locality_id)requireId(data.locality_id);text(data,'whaticket_link');if(data.whaticket_link && !safeExternalUrl(String(data.whaticket_link)))throw new VisitsError('El enlace de Whaticket debe comenzar con https:// o http://.');
      for (const field of ['address', 'maps_url', 'notes']) text(data, field);
      if (data.maps_url && !safeExternalUrl(String(data.maps_url))) throw new VisitsError('El enlace de Maps debe comenzar con https:// o http://.');
      if (command === 'create') { requireId(data.kit_id); requireId(data.seller_id); if (data.installer_id) requireId(data.installer_id); }
      if (command === 'create') { if (data.initial_installation_amount !== '' && data.initial_installation_amount != null) amount(Number(data.initial_installation_amount)); if (data.visit_fee != null) amount(Number(data.visit_fee)); if (data.scheduled_date) date(data.scheduled_date); if (data.scheduled_time && !/^([01]\d|2[0-2]):[0-5]\d$/.test(String(data.scheduled_time))) throw new VisitsError('Indicá una hora entre 00:00 y 22:59.'); }
      break;
    case 'extras': text(data,'extras',false,6000);if(data.extras_products!==undefined){if(!Array.isArray(data.extras_products)||data.extras_products.length>2)throw new VisitsError('Elegí los adicionales disponibles.');for(const item of data.extras_products){if(!['additional','termination'].includes(item.code)||typeof item.quantity!=='number'||item.quantity<=0||item.quantity>10000||(item.code==='termination'&&!Number.isInteger(item.quantity)))throw new VisitsError('Indicá metros o unidades válidas.');}}break;
    case 'agreement': if (data.initial_installation_amount !== '' && data.initial_installation_amount != null) amount(Number(data.initial_installation_amount)); amount(Number(data.visit_fee || 0)); break;
    case 'assign': requireId(data.seller_id); if (data.installer_id) requireId(data.installer_id); break;
    case 'contact':
      if (!(String(data.result) in contactResults)) throw new VisitsError('Seleccioná el resultado del contacto.');
      text(data, 'body', true); text(data, 'channel', true, 100); text(data, 'interlocutor', true, 250); instant(data.at); break;
    case 'kit': kit(data); text(data, 'body', false); break;
    case 'appointment':
      if (data.appointment_id) requireId(data.appointment_id);
      if (!['onsite', 'video'].includes(String(data.mode)) || !['proposed', 'confirmed', 'cancelled'].includes(String(data.status))) throw new VisitsError('La visita no es válida.');
      date(data.date);
      if (!/^\d{2}:\d{2}$/.test(String(data.start_time)) || !/^\d{2}:\d{2}$/.test(String(data.end_time)) || String(data.start_time) >= String(data.end_time) || String(data.end_time) > '23:59') throw new VisitsError('Indicá una franja horaria válida.');
      if (data.status === 'confirmed' && (!data.client_confirmed || !data.installer_confirmed)) throw new VisitsError('La visita requiere confirmación del cliente y del instalador.');
      text(data, 'body', Boolean(data.appointment_id)); break;
    case 'visit_result':
      requireId(data.appointment_id); if (!['completed', 'missed'].includes(String(data.status)) || !(String(data.status) in visitStatuses)) throw new VisitsError('Seleccioná el resultado de la visita.');
      text(data, 'body', true); if (data.status === 'completed') instant(data.performed_at);
      text(data, 'technical', false, 6000); if (data.status === 'completed') { text(data, 'next_action', true); instant(data.next_at); requireId(data.next_owner_id); }
      break;
    case 'quote':
      kit(data); date(data.valid_until); text(data, 'conditions', true); text(data, 'exclusions');
      if (!['draft', 'sent'].includes(String(data.status))) throw new VisitsError('Seleccioná borrador o enviado.');
      if (data.status === 'sent') instant(data.communicated_at);
      if (!Array.isArray(data.lines) || !data.lines.length || data.lines.length > 30) throw new VisitsError('Agregá entre uno y treinta conceptos al presupuesto.');
      for (const line of data.lines) {
        if (!line || typeof line !== 'object') throw new VisitsError('El concepto no es válido.');
        text(line, 'description', true, 300); amount(line.unit_price);
        if (typeof line.quantity !== 'number' || !Number.isFinite(line.quantity) || line.quantity <= 0 || line.quantity > 10000 || Math.abs(line.quantity * 100 - Math.round(line.quantity * 100)) > 0.00001) throw new VisitsError('La cantidad debe ser mayor que cero, con hasta dos decimales.');
      }
      amount(quoteTotal(data.lines as Parameters<typeof quoteTotal>[0])); break;
    case 'quote_status': requireId(data.quote_id); if (!['sent', 'accepted', 'rejected'].includes(String(data.status))) throw new VisitsError('El estado de presupuesto no es válido.'); text(data, 'body', true); break;
    case 'outcome':
      text(data, 'body', true); if (data.outcome === 'lost') { if (!(String(data.reason) in lossReasons)) throw new VisitsError('Indicá el motivo de la venta no concretada.'); }
      else if (data.outcome === 'pending') { if (!(String(data.reason) in pendingReasons)) throw new VisitsError('Indicá por qué sigue pendiente.'); text(data, 'next_action', true); instant(data.next_at); requireId(data.next_owner_id); }
      else if (data.outcome === 'won') { instant(data.at); kit(data); if(data.installation_date)date(data.installation_date); }
      else throw new VisitsError('Seleccioná el resultado comercial.'); break;
    case 'payment': if(data.payment_kind!==undefined && !['visit','deposit'].includes(String(data.payment_kind)))throw new VisitsError('Seleccioná visita o seña.'); amount(data.amount); text(data, 'body', true); text(data, 'method', true, 100); text(data, 'receiver', true, 250); instant(data.at); break;
    case 'order_link': requireId(data.order_id); break;
    case 'order_unlink': requireId(data.order_id); text(data, 'body', true); break;
    case 'note': text(data, 'body', true); break;
    default: throw new VisitsError('La acción no está disponible.');
  }
}

function kit(data: Record<string, unknown>) { if (data.kit_id === 'other') text(data, 'custom_kit', true, 300); else requireId(data.kit_id); }

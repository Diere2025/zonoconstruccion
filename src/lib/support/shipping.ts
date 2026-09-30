import type { Status, Ticket } from './types';

export interface ShippingRequest {
    locality: string;
    province: string;
    postal_code: string;
    address: string;
    customer: string;
    reference: string;
    products: string;
    conditions: string;
}
export interface ShippingQuote {
    carrier: string;
    cost: number;
    customer_price: number;
    payment: 'origin' | 'destination';
    delivery: string;
    valid_until: string;
    conditions: string;
}
export const shippingStatuses: Record<Status, string> = {
    new: 'Pendiente', in_progress: 'Cotizando', waiting_requester: 'Faltan datos',
    waiting_validation: 'Cotizada', closed: 'Finalizada', cancelled: 'Cancelada',
};
export const paymentLabels = { origin: 'Pago en origen', destination: 'Pago en destino' };
export const isShipping = (ticket: Ticket) => ticket.workflow === 'shipping';
export const ticketPath = (ticket: Ticket) => `${isShipping(ticket) ? '/solicitudes-logistica' : '/incidencias'}/${ticket.id}`;
export const statusLabel = (ticket: Ticket) => (isShipping(ticket) ? shippingStatuses : undefined)?.[ticket.status];
export function quoteExpired(quote: ShippingQuote, now = new Date()): boolean {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
    return quote.valid_until < today;
}
export const shippingActionLabels = {
    take: 'Comenzar cotización', request_validation: 'Publicar cotización',
    validate: 'Elegir opción y finalizar', reject: 'Pedir recotización',
    withdraw: 'Retomar cotización', close_admin: 'Finalizar sin elección',
    cancel: 'Cancelar solicitud', reopen: 'Reabrir solicitud', restore: 'Restaurar solicitud',
};

export const statuses = { new: 'Nuevo', in_progress: 'En atención', waiting_requester: 'Esperando respuesta', waiting_validation: 'En revisión', closed: 'Cerrado', cancelled: 'Cancelado' } as const;
export const priorities = { low: 'Baja', medium: 'Media', high: 'Alta', critical: 'Crítica' } as const;
export const ticketTypes = { error: 'Error', improvement: 'Mejora', feature: 'Nueva función', question: 'Consulta', request: 'Solicitud operativa' } as const;
export type Status = keyof typeof statuses;
export type Priority = keyof typeof priorities;
export type TicketType = keyof typeof ticketTypes;
export interface Sector {
    id: string;
    name: string;
    active: boolean;
}
export interface Person {
    id: string;
    name: string;
    active: boolean;
}
export interface ResponsiblePerson extends Person {
    sector_ids: string[];
}
export interface ResponsibilityOptions {
    sectors: Sector[];
    people: ResponsiblePerson[];
}
export interface SupportMe {
    user_id: string;
    is_admin: boolean;
    is_manager: boolean;
    sector_ids: string[];
    sectors: Sector[];
    people: Person[];
    assignee_ids?: string[];
    impersonating?: boolean;
}
export interface Ticket {
    workflow: 'incident' | 'shipping';
    shipping_request: import('./shipping').ShippingRequest | null;
    shipping_quotes: import('./shipping').ShippingQuote[];
    shipping_selected: number | null;
    id: string;
    number: number;
    created_by: string;
    sector_id: string;
    title: string;
    description: string;
    module: string;
    steps: string;
    expected: string;
    actual: string;
    impact: string;
    type: TicketType;
    priority: Priority;
    suggested_priority: Priority;
    status: Status;
    assignee_id: string | null;
    version: number;
    solution: string;
    closure_kind: string | null;
    closed_at: string | null;
    closed_by: string | null;
    created_at: string;
    updated_at: string;
}
export interface Attachment {
    id: string;
    name: string;
    mime: string;
    bytes: number;
    message_id?: string;
    width?: number;
    height?: number;
}
export interface SupportEvent {
    id: string;
    actor_id: string;
    kind: string;
    message_id?: string;
    visibility: 'public' | 'internal';
    created_at: string;
    details: {
        status?: Status;
        from?: Status;
        legacy_id?: string;
    };
    message: {
        body: string;
        attachments: Attachment[];
    } | null;
}
export interface ActionRequest {
    id: string;
    kind: 'information' | 'action' | 'validation';
    message_id: string;
    recipient_id: string;
    message?: {
        body: string;
    };
}
export interface SupportNotification {
    number?: number;
    title?: string;
    workflow?: 'incident' | 'shipping';
    id: string;
    ticket_id: string;
    kind: string;
    read_at: string | null;
    created_at: string;
}
export const code = (number: number) => `INC-${String(number).padStart(6, '0')}`;
export const dateLabel = (value: string) => new Date(value).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'short', timeStyle: 'short' });
export const isOpen = (status: Status) => status !== 'closed' && status !== 'cancelled';
export const manages = (me: SupportMe, ticket: Ticket) => me.is_admin || me.sector_ids.includes(ticket.sector_id);
export function responsibleLabel(ticket: Pick<Ticket, 'sector_id' | 'assignee_id'>, sectors: Sector[], name: (id: string) => string): string {
    if (ticket.assignee_id) return name(ticket.assignee_id);
    return `Equipo de ${sectors.find(s => s.id === ticket.sector_id)?.name || 'área responsable'}`;
}

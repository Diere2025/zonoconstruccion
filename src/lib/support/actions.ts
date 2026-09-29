import { isOpen, manages, type SupportMe, type Ticket } from './types';
export type TicketAction = 'take' | 'request_validation' | 'request_info' | 'request_action' | 'withdraw' | 'close_admin' | 'cancel' | 'reopen' | 'restore' | 'validate' | 'reject';
export const actionLabels: Record<TicketAction, string> = { take: 'Tomar ticket', request_validation: 'Enviar a revisión', request_info: 'Pedir información', request_action: 'Pedir una acción', withdraw: 'Retomar atención', close_admin: 'Cerrar ahora', cancel: 'Cancelar ticket', reopen: 'Reabrir', restore: 'Restaurar', validate: 'Funciona, cerrar', reject: 'Sigue fallando' };
export function availableActions(me: SupportMe, ticket: Ticket): TicketAction[] {
    const result: TicketAction[] = [];
    const manager = manages(me,ticket);
    const requester = ticket.created_by === me.user_id;
    if (manager && ticket.status === 'new') result.push('take');
    if (manager && ['new','in_progress'].includes(ticket.status)) result.push('request_validation','request_info','request_action');
    if (manager && ['waiting_requester','waiting_validation'].includes(ticket.status)) result.push('withdraw');
    if (requester && ticket.status === 'waiting_validation') result.push('validate','reject');
    if (me.is_admin && isOpen(ticket.status)) result.push('close_admin','cancel');
    if ((manager || requester) && ticket.status === 'closed') result.push('reopen');
    if (me.is_admin && ticket.status === 'cancelled') result.push('restore');
    return result;
}
export function nextActor(ticket: Ticket, name: (id: string) => string): string {
    if (ticket.status === 'waiting_validation') return `${name(ticket.created_by)} debe probar`;
    if (ticket.status === 'waiting_requester') return `${name(ticket.created_by)} debe responder`;
    if (!isOpen(ticket.status)) return '';
    return ticket.assignee_id ? `${name(ticket.assignee_id)} debe atender` : 'Pendiente de asignación';
}

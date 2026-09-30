import { priorities, type SupportEvent, type SupportMe } from './types';

export const administrativeEvents = ['assign', 'take', 'transfer', 'classify', 'unassigned'];
export function administrativeEventContext(event: SupportEvent, me: SupportMe): string | null {
    if (!administrativeEvents.includes(event.kind)) return null;
    const area = me.sectors.find(s => s.id === event.details.sector_id)?.name;
    const person = me.people.find(p => p.id === event.details.assignee_id)?.name;
    const responsible = event.details.assignee_id ? person || 'persona designada' : area ? `Equipo de ${area}` : 'equipo del área';
    if (event.kind === 'transfer') return `${area ? `Área responsable: ${area}. ` : 'Se cambió el área responsable. '}Responsable: ${responsible}.`;
    if (event.kind === 'classify') return event.details.priority ? `Prioridad actualizada a ${priorities[event.details.priority]}.` : 'Se actualizaron los datos de clasificación del ticket.';
    return `Responsable: ${responsible}.`;
}

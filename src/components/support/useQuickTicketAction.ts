'use client';
import { useRef, useState } from 'react';
import { actionCommand, availableActions, type TicketAction } from '@/lib/support/actions';
import { commandBody, errorMessage, supportRequest } from '@/lib/support/client';
import type { SupportMe, Ticket } from '@/lib/support/types';

export function isQuickTicketAction(action: TicketAction) {
    return action === 'start';
}
export function useQuickTicketAction() {
    const lock = useRef(false);
    const [pending, setPending] = useState<string | null>(null);
    const [error, setError] = useState('');
    const run = async (ticket: Ticket, action: TicketAction, me: SupportMe, onSaved: (ticket: Ticket) => void, onError: () => void) => {
        if (lock.current || me.impersonating || !isQuickTicketAction(action) || !availableActions(me, ticket).includes(action)) return;
        lock.current = true;
        setPending(ticket.id);setError('');
        try {
            const operation = actionCommand(action, ticket);
            const result = await supportRequest<{ticket: Ticket}>('tickets/' + ticket.id + '/actions', {
                method: 'POST', body: commandBody(operation.payload, ticket.version, operation.command),
            });
            onSaved(result.ticket);
            window.dispatchEvent(new Event('support-notifications-refresh'));
        } catch (e) {
            setError(errorMessage(e));onError();
        } finally {
            lock.current = false;setPending(null);
        }
    };
    return { pending, error, run };
}

'use client';
import { useState } from 'react';
import { commandBody, errorMessage, supportRequest } from '@/lib/support/client';
import { priorities, responsibleLabel, ticketTypes, type SupportMe, type Ticket } from '@/lib/support/types';
import { isShipping } from '@/lib/support/shipping';
import { Alert, fieldClass, primaryClass } from './SupportShell';
import { ResponsibilityPicker } from './ResponsibilityPicker';

export function TicketDataEditor({ ticket, me, onDone }: { ticket: Ticket; me: SupportMe; onDone: () => Promise<void> }) {
    const [assignee, setAssignee] = useState(ticket.assignee_id || 'area');
    const [sector, setSector] = useState(ticket.sector_id);
    const [priority, setPriority] = useState(ticket.priority);
    const [kind, setKind] = useState(ticket.type);
    const [reason, setReason] = useState('');
    const [ready, setReady] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const shipping = isShipping(ticket);
    const transferring = sector !== ticket.sector_id;
    const changed = transferring || assignee !== (ticket.assignee_id || 'area') || priority !== ticket.priority || kind !== ticket.type;
    const current = responsibleLabel(ticket, me.sectors, id => me.people.find(p => p.id === id)?.name || 'Usuario');
    const save = async (event: React.FormEvent) => {
        event.preventDefault();
        if (busy || !changed || !ready || me.impersonating) return;
        if (!assignee) { setError('Elegí una persona o el equipo del área.'); return; }
        setBusy(true); setError('');
        try {
            await supportRequest(`tickets/${ticket.id}/actions`, { method: 'POST', body: commandBody({
                sector_id: sector, responsibility_kind: assignee === 'area' ? 'area' : 'person',
                assignee_id: assignee === 'area' ? null : assignee, priority, type: kind,
                body: transferring ? reason.trim() : '',
            }, ticket.version, 'edit') });
            await onDone();
        } catch (e) { setError(errorMessage(e)); }
        finally { setBusy(false); }
    };
    return <form onSubmit={save} onChange={() => setError('')} className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
        <div><h3 className="text-sm font-semibold">Editar datos del ticket</h3><p className="mt-1 text-xs text-slate-500">Responsable actual: <strong className="font-medium text-slate-700">{current}</strong></p></div>
        {error && <Alert>{error}</Alert>}
        <fieldset disabled={busy || me.impersonating} className="space-y-4">
            <div className="max-w-2xl"><ResponsibilityPicker fixedSector={!me.is_admin || shipping} sector={sector} assignee={assignee} onReady={setReady}
                onChange={(area, person) => { setSector(area); setAssignee(person); }}/></div>
            {transferring && <label className="block max-w-2xl text-sm font-semibold">Motivo del cambio de área
                <input required value={reason} maxLength={10000} onChange={e => setReason(e.target.value)} className={`${fieldClass} mt-1`} placeholder="Ej.: Esta solicitud debe resolverla Sistemas"/>
            </label>}
            <div className="grid max-w-2xl gap-3 sm:grid-cols-2">
                <label className="text-sm font-semibold">Prioridad<select value={priority} onChange={e => setPriority(e.target.value as Ticket['priority'])} className={`${fieldClass} mt-1`}>{Object.entries(priorities).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
                {!shipping && <label className="text-sm font-semibold">Tipo<select value={kind} onChange={e => setKind(e.target.value as Ticket['type'])} className={`${fieldClass} mt-1`}>{Object.entries(ticketTypes).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>}
            </div>
            <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3"><button className={primaryClass} disabled={!ready || !changed || !assignee || (transferring && !reason.trim())}>{busy ? 'Guardando…' : 'Guardar cambios'}</button>
                {transferring && <p className="text-xs text-slate-500">Al guardar, el ticket pasará al área y responsable elegidos.</p>}
            </div>
        </fieldset>
    </form>;
}

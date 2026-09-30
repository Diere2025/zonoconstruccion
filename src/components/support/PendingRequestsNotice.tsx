import Link from 'next/link';
import { ClipboardCheck } from 'lucide-react';
import { code, type PendingSupportRequest } from '@/lib/support/types';

export function PendingRequestsNotice({ requests }: { requests: PendingSupportRequest[] }) {
    if (!requests.length) return null;
    return <section aria-label="Solicitudes que requieren tu respuesta" className="mb-4 rounded-lg border border-violet-200 bg-violet-50 p-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-violet-900"><ClipboardCheck className="size-4 shrink-0" />Tenés {requests.length === 1 ? 'una solicitud que requiere' : `${requests.length} solicitudes que requieren`} tu respuesta</div>
        <p className="mt-1 text-xs text-violet-700">Te toca revisar o responder estas solicitudes, aunque pertenezcan a otra área.</p>
        <ul className="mt-2 space-y-1">{requests.map(request => <li key={request.ticket_id}><Link
            href={`${request.workflow === 'shipping' ? '/solicitudes-logistica' : '/incidencias'}/${request.ticket_id}`}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-white/70 px-3 py-2 text-sm text-violet-950 hover:bg-white focus-visible:outline-2 focus-visible:outline-violet-500">
            <span className="min-w-0"><span className="mr-2 text-xs text-violet-600">{code(request.number)}</span>{request.title}</span>
            <span className="shrink-0 text-xs font-semibold text-violet-700">{request.kind === 'validation' ? request.workflow === 'shipping' ? 'Elegir opción' : 'Revisar solución' : 'Responder solicitud'} →</span>
        </Link></li>)}</ul>
    </section>;
}

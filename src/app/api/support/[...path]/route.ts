import { NextRequest, NextResponse } from 'next/server';
import { authorize, body, json, privateHeaders, storageClient } from '@/lib/support/server';
import { SupportError, databaseError, inspectImage, object, operation, uuid } from '@/lib/support/validation';
import type { SupportMe } from '@/lib/support/types';
import { managementVisibilityFilter, pendingResponsibilityFilter } from '@/lib/support/responsibility';
export const runtime = 'edge';
export const dynamic = 'force-dynamic';
type Context = {
    params: Promise<{
        path: string[];
    }>;
};
const actions = new Set(['edit', 'take', 'assign', 'classify', 'request_info', 'request_action', 'request_validation', 'respond', 'validate', 'reject', 'withdraw', 'close_admin', 'cancel', 'reopen', 'restore', 'transfer', 'shipping_quote', 'shipping_finish', 'shipping_requote']);
function cursor(raw: string | null): [
    string,
    string
] | null {
    if (!raw)
        return null;
    try {
        const parsed = JSON.parse(atob(raw));
        if (!Array.isArray(parsed) || parsed.length !== 2 || typeof parsed[0] !== 'string' || !/^\d{4}-\d\d-\d\dT[\d:.+-]+Z?$/.test(parsed[0]) || !Number.isFinite(Date.parse(parsed[0])))
            throw new Error();
        return [parsed[0], uuid(parsed[1])];
    }
    catch {
        throw new SupportError('La página solicitada no es válida.');
    }
}
function nextCursor(row: {
    created_at?: string;
    updated_at?: string;
    id: string;
}, field: 'created_at' | 'updated_at') { return btoa(JSON.stringify([row[field], row.id])); }
async function handle(request: NextRequest, context: Context): Promise<NextResponse> {
    const { path } = await context.params;
    const { db, user, impersonating } = await authorize(request);
    const isGet = request.method === 'GET';
    const params = request.nextUrl.searchParams;
    const limit = Math.max(1, Math.min(100, Number(params.get('limit')) || 25));
    if (path.length === 1 && path[0] === 'me' && isGet) {
        const [result, pending] = await Promise.all([
            db.rpc('support_me'),
            db.from('support_action_requests').select('ticket_id,kind,ticket:support_tickets!ticket_id(workflow,number,title)')
                .eq('recipient_id', user.id).eq('state', 'open').order('created_at', { ascending: true }),
        ]);
        databaseError(result.error);
        databaseError(pending.error);
        return json({ ...result.data, impersonating, pending_requests: (pending.data || []).flatMap(row => {
            const ticket = Array.isArray(row.ticket) ? row.ticket[0] : row.ticket;
            return ticket ? [{ ticket_id: row.ticket_id, kind: row.kind, ...ticket }] : [];
        }) });
    }
    if (path.length === 1 && path[0] === 'responsibles' && isGet) {
        const result = await db.rpc('support_responsibility_options');
        databaseError(result.error);
        return json(result.data);
    }
    if (path[0] === 'tickets' && path.length === 1) {
        if (isGet) {
            const me = await db.rpc('support_me');
            databaseError(me.error);
            const identity = me.data as SupportMe;
            let query = db.from('support_tickets').select('*');
            const workflow = params.get('workflow') || 'incident';
            if (!['incident', 'shipping'].includes(workflow)) throw new SupportError('La bandeja solicitada no es válida.');
            query = query.eq('workflow', workflow);
            if (params.get('mode') !== 'manage')
                query = query.eq('created_by', user.id);
            else if (!identity.is_manager)
                throw new SupportError('No tenés acceso a gestión.', 403);
            else if (!identity.is_admin)
                query = query.or(managementVisibilityFilter(identity));
            for (const field of ['status', 'priority', 'type', 'sector_id', 'assignee_id', 'created_by']) {
                const filter = params.get(field);
                if (filter)
                    query = query.eq(field, field.endsWith('_id') || field === 'created_by' ? uuid(filter) : filter);
            }
            const view = params.get('view') || 'pending';
            if (view === 'pending')
                query = params.get('mode') === 'manage'
                    ? query.or(pendingResponsibilityFilter(identity)).in('status', ['new', 'in_progress'])
                    : query.in('status', ['waiting_requester', 'waiting_validation']);
            if (view === 'unassigned')
                query = query.is('assignee_id', null).not('status', 'in', '(closed,cancelled)');
            if (view === 'assigned')
                query = query.eq('assignee_id', user.id).not('status', 'in', '(closed,cancelled)');
            if (view === 'action')
                query = query.in('status', ['waiting_requester', 'waiting_validation']);
            // All really includes pending, unassigned, completed and cancelled requests.
            if (view === 'cancelled') query = query.eq('status', 'cancelled');
            if (view === 'open')
                query = query.not('status', 'in', '(closed,cancelled)');
            if (view === 'closed')
                query = query.eq('status', 'closed');
            const q = params.get('q')?.trim().slice(0, 160);
            if (q) {
                const number = q.match(/^INC-(\d+)$/i)?.[1];
                query = number ? query.eq('number', number) : query.ilike('title', `%${q.replace(/[\\%_]/g, '\\$&')}%`);
            }
            const after = cursor(params.get('cursor'));
            if (after)
                query = query.or(`updated_at.lt.${after[0]},and(updated_at.eq.${after[0]},id.lt.${after[1]})`);
            const rows = await query.order('updated_at', { ascending: false }).order('id', { ascending: false }).limit(limit + 1);
            databaseError(rows.error);
            const items = (rows.data || []).slice(0, limit);
            const people = items.length ? await db.rpc('support_ticket_people', { p_tickets: items.map(item => item.id) }) : { data: [], error: null };
            databaseError(people.error);
            return json({ items, people: people.data, next: (rows.data?.length || 0) > limit ? nextCursor(items[items.length - 1], 'updated_at') : null });
        }
        if (request.method === 'POST') {
            const op = operation(await body(request));
            const result = await db.rpc('support_command', { p_command: 'create', p_ticket: null, p_key: op.key, p_version: null, p_data: op.data });
            databaseError(result.error);
            return json(result.data, 201);
        }
    }
    if (path[0] === 'tickets' && path.length >= 2) {
        const id = uuid(path[1]);
        const ticket = await db.from('support_tickets').select('*').eq('id', id).maybeSingle();
        databaseError(ticket.error);
        if (!ticket.data)
            throw new SupportError('No se encontró la incidencia.', 404);
        if (path.length === 2 && isGet) {
            const [me, pending] = await Promise.all([db.rpc('support_me', { p_ticket: id }), db.from('support_action_requests').select('id,kind,message_id,recipient_id,message:support_messages!message_id(body)').eq('ticket_id', id).eq('state', 'open').maybeSingle()]);
            databaseError(me.error);
            databaseError(pending.error);
            const reports = await db.from('support_events').select('message_id').eq('ticket_id', id).eq('visibility','public').in('kind',['create','imported']).not('message_id','is',null);
            databaseError(reports.error);
            const attachments = reports.data?.length ? await db.from('support_attachments').select('id,name,mime,bytes,width,height,message_id').eq('ticket_id',id).eq('visibility','public').eq('state','linked').in('message_id',reports.data.map(e=>e.message_id)) : { data: [], error: null };
            databaseError(attachments.error);
            return json({ ticket: ticket.data, me: { ...me.data, impersonating }, pending: pending.data, report_attachments: attachments.data });
        }
        if (path[2] === 'timeline' && path.length === 3 && isGet) {
            let query = db.from('support_events').select('id,actor_id,kind,visibility,created_at,details,message_id,message:support_messages!message_id(body,attachments:support_attachments(id,name,mime,bytes,width,height,message_id))').eq('ticket_id', id);
            const category = params.get('category') || 'all';
            if (!['all','conversation','notes'].includes(category)) throw new SupportError('La vista de historial no es válida.');
            if (category === 'conversation') query = query.eq('visibility','public').or('message_id.not.is.null,kind.in.(assign,take,transfer,classify,unassigned)').not('kind','in','(create,imported)');
            if (category === 'notes') query = query.eq('visibility','internal').not('message_id','is',null);
            const after = cursor(params.get('cursor'));
            if (after)
                query = query.or(`created_at.lt.${after[0]},and(created_at.eq.${after[0]},id.lt.${after[1]})`);
            const rows = await query.order('created_at', { ascending: false }).order('id', { ascending: false }).limit(limit + 1);
            databaseError(rows.error);
            const items = (rows.data || []).slice(0, limit);
            return json({ items, next: (rows.data?.length || 0) > limit ? nextCursor(items[items.length - 1], 'created_at') : null });
        }
        if (path.length === 3 && request.method === 'POST' && ['messages', 'actions', 'read'].includes(path[2])) {
            const raw = object(await body(request));
            const op = operation(raw);
            const command = path[2] === 'messages' ? 'message' : path[2] === 'read' ? 'read' : String(raw.action);
            if (path[2] === 'actions' && !actions.has(command))
                throw new SupportError('La acción no es válida.');
            const result = command === 'edit'
                ? await db.rpc('support_edit_ticket', { p_ticket: id, p_key: op.key, p_version: op.version, p_data: op.data })
                : await db.rpc('support_command', { p_command: command, p_ticket: id, p_key: op.key, p_version: op.version, p_data: op.data });
            databaseError(result.error);
            return json(result.data);
        }
    }
    if (path[0] === 'uploads' && path.length === 1 && request.method === 'POST') {
        if (Number(request.headers.get('content-length')) > 11 * 1024 * 1024)
            throw new SupportError('Cada imagen puede pesar hasta 10 MB.', 413);
        const form = await request.formData();
        const file = form.get('file');
        if (!(file instanceof File) || file.size > 10 * 1024 * 1024)
            throw new SupportError('Seleccioná una imagen de hasta 10 MB.', 413);
        const bytes = new Uint8Array(await file.arrayBuffer());
        const image = inspectImage(bytes, file.type);
        const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(b => b.toString(16).padStart(2, '0')).join('');
        const id = form.get('ticket_id') ? uuid(form.get('ticket_id')) : null;
        const visibility = form.get('visibility') || 'public';
        const key = uuid(form.get('idempotencyKey'));
        const reserve = await db.rpc('support_command', { p_command: 'upload_reserve', p_ticket: id, p_key: key, p_version: null, p_data: { name: file.name.slice(0, 180) || 'captura.png', mime: image.mime, bytes: file.size, visibility, digest } });
        databaseError(reserve.error);
        const reservation = await db.from('support_attachments').select('id,state,path,name,mime,bytes').eq('id', reserve.data.id).eq('created_by', user.id).maybeSingle();
        databaseError(reservation.error);
        if (!reservation.data)
            throw new SupportError('La reserva de imagen ya no está disponible.');
        if (reservation.data.state === 'linked')
            throw new SupportError('Esta imagen ya se envió. Actualizá la incidencia.', 409);
        if (reservation.data.state === 'ready')
            return json({ id: reservation.data.id, name: reservation.data.name, mime: reservation.data.mime, bytes: reservation.data.bytes });
        const storage = storageClient();
        const uploaded = await storage.storage.from('support-attachments').upload(reservation.data.path, bytes, { contentType: image.mime, upsert: false });
        // Retry after a lost response can encounter an already uploaded object; verify it.
        if (uploaded.error) {
            const existing = await storage.storage.from('support-attachments').download(reservation.data.path);
            if (existing.error || !existing.data)
                throw new SupportError('No se pudo subir la imagen. Reintentá el envío.', 503);
            const original = new Uint8Array(await existing.data.arrayBuffer());
            if (original.length !== bytes.length || !original.every((v, i) => v === bytes[i]))
                throw new SupportError('La reserva corresponde a otra imagen.', 409);
        }
        const finalized = await storage.rpc('support_finish_upload', { p_id: reservation.data.id, p_user: user.id, p_width: image.width, p_height: image.height });
        databaseError(finalized.error);
        return json({ id: reservation.data.id, name: reservation.data.name, mime: image.mime, bytes: file.size }, 201);
    }
    if (path[0] === 'attachments' && path.length === 2 && isGet) {
        const attachment = await db.from('support_attachments').select('id,path,name,mime,state').eq('id', uuid(path[1])).eq('state', 'linked').maybeSingle();
        databaseError(attachment.error);
        if (!attachment.data)
            throw new SupportError('No se encontró la imagen.', 404);
        const file = await storageClient().storage.from('support-attachments').download(attachment.data.path);
        if (file.error || !file.data)
            throw new SupportError('No se pudo recuperar la imagen. Intentá nuevamente.', 503);
        return new NextResponse(file.data, { headers: { ...privateHeaders, 'Content-Type': attachment.data.mime, 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(attachment.data.name)}`, 'Content-Security-Policy': "default-src 'none'; sandbox" } });
    }
    if (path[0] === 'notifications' && path.length === 1) {
        if (isGet) {
            const [result, unread] = await Promise.all([
                db.from('support_notifications').select('id,ticket_id,kind,read_at,created_at,ticket:support_tickets!ticket_id(workflow,number,title)')
                    .order('read_at', { ascending: true, nullsFirst: true }).order('created_at', { ascending: false }).limit(40),
                db.from('support_notifications').select('id', { count: 'exact', head: true }).is('read_at', null),
            ]);
            databaseError(result.error);
            databaseError(unread.error);
            return json({ impersonating, unread_count: unread.count || 0, items: (result.data || []).map(row => {
                const ticket = Array.isArray(row.ticket) ? row.ticket[0] : row.ticket;
                return { ...row, workflow: ticket?.workflow, number: ticket?.number, title: ticket?.title };
            }) });
        }
        if (request.method === 'PATCH') {
            const op = operation(await body(request));
            if (op.data.ids !== undefined || op.data.before !== undefined) {
                const ids = op.data.ids;
                const before = op.data.before;
                if (ids !== undefined && (!Array.isArray(ids) || ids.length < 1 || ids.length > 40 || before !== undefined))
                    throw new SupportError('Los avisos seleccionados no son válidos.');
                if (before !== undefined && (typeof before !== 'string' || !Number.isFinite(Date.parse(before))))
                    throw new SupportError('La fecha de lectura no es válida.');
                const result = await db.rpc('support_read_notifications', {
                    p_ids: Array.isArray(ids) ? ids.map(id => uuid(id)) : null,
                    p_before: before === undefined ? null : before,
                });
                databaseError(result.error);
                return json(result.data);
            }
            const result = await db.rpc('support_command', { p_command: 'notification_read', p_ticket: null, p_key: op.key, p_version: null, p_data: op.data });
            databaseError(result.error);
            return json(result.data);
        }
    }
    if (path[0] === 'settings' && path.length === 1) {
        const me = await db.rpc('support_me');
        databaseError(me.error);
        if (!me.data.is_admin)
            throw new SupportError('Solo el administrador puede configurar incidencias.', 403);
        if (isGet) {
            const [admins, members] = await Promise.all([db.from('support_admins').select('*'), db.from('support_sector_members').select('*')]);
            databaseError(admins.error);
            databaseError(members.error);
            return json({ me: me.data, admins: admins.data, members: members.data });
        }
        if (request.method === 'POST') {
            const raw = object(await body(request));
            const op = operation(raw);
            if (!['sector_save', 'member_save', 'admin_save'].includes(String(raw.action)))
                throw new SupportError('La configuración no es válida.');
            const result = await db.rpc('support_command', { p_command: raw.action, p_ticket: null, p_key: op.key, p_version: null, p_data: op.data });
            databaseError(result.error);
            return json(result.data);
        }
    }
    throw new SupportError('No se encontró la operación.', 404);
}
async function safe(request: NextRequest, context: Context) {
    try {
        return await handle(request, context);
    }
    catch (error) {
        if (error instanceof SupportError)
            return json({ error: error.message }, error.status);
        console.error('support_request_failed', { path: request.nextUrl.pathname });
        return json({ error: 'No se pudo completar la operación. Intentá nuevamente.' }, 503);
    }
}
export const GET = safe;
export const POST = safe;
export const PATCH = safe;

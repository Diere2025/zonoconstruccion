'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, Loader2, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { errorMessage, supportRequest } from '@/lib/support/client';
import { eventLabels } from '@/lib/support/eventLabels';
import { code, dateLabel, type SupportNotification } from '@/lib/support/types';

interface Notifications { items: SupportNotification[]; unread_count: number }

export function SupportNotifications() {
    const [userId, setUserId] = useState<string | null>(null);
    useEffect(() => {
        let alive = true;
        let changed = false;
        void supabase.auth.getSession().then(({ data }) => {
            if (alive && !changed) setUserId(data.session?.user.id || null);
        }).catch(() => {});
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            changed = true;
            setUserId(session?.user.id || null);
        });
        return () => { alive = false; subscription.unsubscribe(); };
    }, []);
    return userId ? <NotificationBell key={userId} /> : null;
}

function NotificationBell() {
    const [data, setData] = useState<Notifications | null>(null);
    const [open, setOpen] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const container = useRef<HTMLDivElement>(null);
    const alive = useRef(false);
    const running = useRef(false);
    const pending = useRef(false);
    const pathname = usePathname();
    const refresh = useCallback(async () => {
        if (!alive.current) return;
        if (running.current) { pending.current = true; return; }
        running.current = true;
        setLoading(true);
        try {
            const result = await supportRequest<Notifications>('notifications');
            if (alive.current) { setData(result); setError(''); }
        } catch (e) {
            if (alive.current) setError(errorMessage(e));
        } finally {
            running.current = false;
            if (alive.current) setLoading(false);
            if (alive.current && pending.current) { pending.current = false; void refresh(); }
        }
    }, []);
    useEffect(() => {
        alive.current = true;
        void refresh();
        const visibleRefresh = () => { if (document.visibilityState === 'visible') void refresh(); };
        const timer = setInterval(visibleRefresh, 30000);
        window.addEventListener('focus', visibleRefresh);
        document.addEventListener('visibilitychange', visibleRefresh);
        window.addEventListener('support-notifications-refresh', visibleRefresh);
        return () => {
            alive.current = false;
            clearInterval(timer);
            window.removeEventListener('focus', visibleRefresh);
            document.removeEventListener('visibilitychange', visibleRefresh);
            window.removeEventListener('support-notifications-refresh', visibleRefresh);
        };
    }, [refresh]);
    useEffect(() => { setOpen(false); void refresh(); }, [pathname, refresh]);
    useEffect(() => {
        if (!open) return;
        const outside = (event: PointerEvent) => {
            if (!container.current?.contains(event.target as Node)) setOpen(false);
        };
        const escape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setOpen(false);
                container.current?.querySelector('button')?.focus();
            }
        };
        document.addEventListener('pointerdown', outside);
        document.addEventListener('keydown', escape);
        return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
    }, [open]);
    const unread = data?.unread_count || 0;
    return <div ref={container} className="relative shrink-0">
        <button type="button" aria-label={`Notificaciones de incidencias: ${unread} sin leer${error ? '. No se pudo actualizar' : ''}`} aria-expanded={open}
            onClick={() => { setOpen(!open); if (!open) void refresh(); }}
            className={`inline-flex min-h-9 items-center gap-2 rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-indigo-500 ${unread ? 'border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
            <Bell className="size-4" />
            <span className="hidden md:inline">Incidencias</span>
            {unread > 0 && <span aria-hidden="true" className="min-w-5 rounded-full bg-indigo-600 px-1.5 py-0.5 text-center text-white">{unread > 99 ? '99+' : unread}</span>}
            {error && <span className="text-amber-600" aria-hidden="true">!</span>}
        </button>
        <span className="sr-only" role="status" aria-live="polite">{data ? `${unread} avisos de incidencias sin leer` : ''}</span>
        {open && <section aria-label="Notificaciones de incidencias" className="absolute right-0 top-full z-50 mt-2 w-96 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 p-3">
                <div><h2 className="text-sm font-semibold text-slate-900">Actividad de incidencias</h2><p className="text-xs text-slate-500">{unread} avisos sin leer</p></div>
                <button type="button" aria-label="Cerrar notificaciones" onClick={() => setOpen(false)} className="rounded-md p-2 text-slate-500 hover:bg-slate-100"><X className="size-4" /></button>
            </div>
            {error && <div role="alert" className="m-3 rounded-md bg-amber-50 p-3 text-xs text-amber-800">{error}<button type="button" disabled={loading} onClick={() => void refresh()} className="ml-2 font-semibold underline">Reintentar</button></div>}
            <div className="max-h-[min(24rem,60vh)] overflow-y-auto p-2">
                {!data && loading && <p className="flex items-center gap-2 p-3 text-sm text-slate-500"><Loader2 className="size-4 animate-spin" />Cargando avisos…</p>}
                {data?.items.length === 0 && <p className="p-3 text-sm text-slate-500">No hay avisos por ahora.</p>}
                {data?.items.map(notice => <Link key={notice.id} onClick={() => setOpen(false)} href={`${notice.workflow === 'shipping' ? '/solicitudes-logistica' : '/incidencias'}/${notice.ticket_id}`}
                    className={`mb-1 block rounded-lg p-3 text-sm hover:bg-slate-100 ${notice.read_at ? 'text-slate-500' : 'bg-indigo-50 text-indigo-950'}`}>
                    <div className="flex items-center gap-2"><span className="flex-1 font-semibold">{eventLabels[notice.kind] || 'Nueva actividad'}</span>{!notice.read_at && <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-semibold text-white">Sin leer</span>}</div>
                    {notice.title && <p className="mt-1 truncate">{notice.number ? `${code(notice.number)} · ` : ''}{notice.title}</p>}
                    <p className="mt-1 text-xs text-slate-500">{dateLabel(notice.created_at)}</p>
                    <span className="mt-2 block text-xs font-semibold text-indigo-600">Abrir {notice.workflow === 'shipping' ? 'solicitud' : 'incidencia'} →</span>
                </Link>)}
            </div>
            <Link href="/incidencias" onClick={() => setOpen(false)} className="block border-t border-slate-100 px-4 py-3 text-center text-sm font-semibold text-indigo-600 hover:bg-indigo-50">Ver todas las incidencias</Link>
        </section>}
    </div>;
}

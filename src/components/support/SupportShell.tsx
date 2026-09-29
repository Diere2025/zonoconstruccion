'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Session } from '@supabase/supabase-js';
import { Bell, ClipboardList, Loader2, Plus, Settings, ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { AdminLayout } from '@/components/ui/AdminLayout';
import { ModernLogin } from '@/components/auth/ModernLogin';
import { supportRequest, errorMessage } from '@/lib/support/client';
import type { SupportMe, SupportNotification } from '@/lib/support/types';
type Identity = SupportMe & {
    impersonating?: boolean;
};
const SupportContext = createContext<{
    me: Identity;
    refresh: () => Promise<void>;
} | null>(null);
export function useSupport() { const value = useContext(SupportContext); if (!value)
    throw new Error('Support context required'); return value; }
export function Alert({ children }: {
    children: React.ReactNode;
}) { return <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{children}</p>; }
export function Loading() { return <div className="flex items-center justify-center gap-3 py-8 text-slate-500"><Loader2 className="size-5 animate-spin"/>Cargando incidencias…</div>; }
export const fieldClass = 'w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 max-sm:text-base text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100';
export const primaryClass = 'inline-flex items-center justify-center gap-2 rounded-md bg-indigo-600 px-3 py-1.5 max-sm:min-h-11 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-indigo-500';
export const secondaryClass = 'inline-flex items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 max-sm:min-h-11 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-indigo-500';
export function SupportShell({ children }: {
    children: React.ReactNode;
}) {
    const [session, setSession] = useState<Session | null>(null);
    const [ready, setReady] = useState(false);
    useEffect(() => {
        let alive = true;
        void supabase.auth.getSession().then(({ data }) => { if (alive) {
            setSession(data.session);
            setReady(true);
        } }).catch(() => { if (alive)
            setReady(true); });
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => { setSession(next); setReady(true); });
        return () => { alive = false; subscription.unsubscribe(); };
    }, []);
    if (!ready)
        return <Loading />;
    if (!session)
        return <ModernLogin onLoginSuccess={next => setSession(next)}/>;
    return <AuthenticatedShell key={session.user.id}>{children}</AuthenticatedShell>;
}
function AuthenticatedShell({ children }: {
    children: React.ReactNode;
}) {
    const [me, setMe] = useState<Identity | null>(null);
    const [error, setError] = useState('');
    const [notices, setNotices] = useState<SupportNotification[]>([]);
    const [showNotices, setShowNotices] = useState(false);
    const pathname = usePathname();
    const refresh = useCallback(async () => {
        try {
            const [identity, notifications] = await Promise.all([supportRequest<Identity>('me'), supportRequest<{
                    items: SupportNotification[];
                }>('notifications')]);
            setMe(identity);
            setNotices(notifications.items);
            setError('');
        }
        catch (e) {
            setError(errorMessage(e));
        }
    }, []);
    useEffect(() => {
        let alive = true;
        let running = false;
        const load = async () => { if (!alive || running)
            return; running = true; try {
            const [identity, notifications] = await Promise.all([supportRequest<Identity>('me'), supportRequest<{
                    items: SupportNotification[];
                }>('notifications')]);
            if (alive) {
                setMe(identity);
                setNotices(notifications.items);
                setError('');
            }
        }
        catch (e) {
            if (alive) {
                setError(errorMessage(e));
                setMe(null);
            }
        }
        finally {
            running = false;
        } };
        void load();
        const timer = setInterval(() => { if (document.visibilityState === 'visible')
            void load(); }, 60000);
        const focus = () => { void load(); };
        window.addEventListener('focus', focus);
        return () => { alive = false; clearInterval(timer); window.removeEventListener('focus', focus); };
    }, []);
    const unread = notices.filter(n => !n.read_at).length;
    return <AdminLayout><div className="mx-auto w-full p-3 text-slate-900 sm:p-4">
    <header className="mb-3 flex flex-wrap items-center justify-between gap-4">
      <h1 className="text-lg font-semibold tracking-tight">Incidencias</h1>
      <div className="relative flex items-center gap-2"><button aria-label={`Notificaciones: ${unread} sin leer`} aria-expanded={showNotices} onClick={() => setShowNotices(!showNotices)} className={secondaryClass}><Bell className="size-4"/>{unread > 0 && <span className="rounded-full bg-indigo-600 px-2 text-xs text-white">{unread}</span>}</button><Link href="/incidencias/nueva" className={primaryClass}><Plus className="size-4"/>Nuevo ticket</Link>
        {showNotices && <div className="absolute right-0 top-14 z-40 max-h-96 w-80 overflow-auto rounded-2xl border border-slate-200 bg-white p-3 shadow-xl"><h2 className="mb-2 font-semibold">Actividad reciente</h2>{notices.length === 0 ? <p className="p-3 text-sm text-slate-500">No hay avisos por ahora.</p> : notices.map(n => <Link key={n.id} onClick={() => setShowNotices(false)} href={`/incidencias/${n.ticket_id}`} className={`mb-1 block rounded-md p-3 text-sm hover:bg-slate-100 ${n.read_at ? 'text-slate-500' : 'bg-indigo-50 text-indigo-900'}`}>{eventLabels[n.kind] || 'Nueva actividad en una incidencia'}<span className="mt-1 block text-xs">Abrir incidencia →</span></Link>)}</div>}
      </div>
    </header>
    {error && <div className="mb-4"><Alert>{error}</Alert><button onClick={() => void refresh()} className={`${secondaryClass} mt-2`}>Reintentar</button></div>}
    {me && <SupportContext.Provider value={{ me, refresh }}><nav aria-label="Incidencias" className="mb-3 flex flex-wrap gap-2 border-b border-slate-200 pb-2">
      {me.is_manager && <Tab href="/incidencias" active={pathname === '/incidencias' || pathname === '/incidencias/gestion'}><ShieldCheck className="size-4"/>Gestión</Tab>}
      <Tab href={me.is_manager ? '/incidencias/mis' : '/incidencias'} active={pathname === '/incidencias/mis' || (!me.is_manager && pathname === '/incidencias')}><ClipboardList className="size-4"/>Mis solicitudes</Tab>
      {me.is_admin && <Tab href="/incidencias/configuracion" active={pathname === '/incidencias/configuracion'}><Settings className="size-4"/>Configuración</Tab>}
    </nav>{me.impersonating && <div className="mb-4"><Alert>Estás viendo la cuenta de otro usuario. Volvé a tu cuenta para realizar cambios.</Alert></div>}{children}</SupportContext.Provider>}
    {!me && !error && <Loading />}
  </div></AdminLayout>;
}
function Tab({ href, active, children }: {
    href: string;
    active: boolean;
    children: React.ReactNode;
}) { return <Link href={href} className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold ${active ? 'bg-indigo-100 text-indigo-700' : 'text-slate-500 hover:bg-slate-100'}`}>{children}</Link>; }
export const eventLabels: Record<string, string> = { imported: 'Importado de la planilla', create: 'Incidencia creada', take: 'Incidencia tomada', assign: 'Responsable asignado', classify: 'Clasificación actualizada', message: 'Nuevo mensaje', request_info: 'Solicitud de información', request_action: 'Acción solicitada', request_validation: 'Solución lista para probar', respond: 'Respuesta del solicitante', validate: 'Solución confirmada y ticket cerrado', reject: 'La prueba sigue fallando', withdraw: 'Solicitud retirada', cancel: 'Incidencia cancelada', close_admin: 'Cierre administrativo', reopen: 'Incidencia reabierta', restore: 'Incidencia restaurada', transfer: 'Transferencia de sector', unassigned: 'Incidencia enviada a la bandeja sin asignar' };

'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Session } from '@supabase/supabase-js';
import { ClipboardList, Loader2, Plus, Settings, ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { AdminLayout } from '@/components/ui/AdminLayout';
import { ModernLogin } from '@/components/auth/ModernLogin';
import { supportRequest, errorMessage } from '@/lib/support/client';
import type { SupportMe } from '@/lib/support/types';
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
    const pathname = usePathname();
    const shipping = pathname.startsWith('/solicitudes-logistica');
    const root = shipping ? '/solicitudes-logistica' : '/incidencias';
    const refresh = useCallback(async () => {
        try {
            const identity = await supportRequest<Identity>('me');
            setMe(identity);
            window.dispatchEvent(new Event('support-notifications-refresh'));
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
            const identity = await supportRequest<Identity>('me');
            if (alive) {
                setMe(identity);
                window.dispatchEvent(new Event('support-notifications-refresh'));
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
    return <AdminLayout><div className="mx-auto w-full p-3 text-slate-900 sm:p-4">
    <header className="mb-3 flex flex-wrap items-center justify-between gap-4">
      <h1 className="text-lg font-semibold tracking-tight">{shipping?'Solicitudes a Logística':'Incidencias'}</h1>
      <Link href={`${root}/nueva`} className={primaryClass}><Plus className="size-4"/>{shipping?'Solicitar cotización':'Nuevo ticket'}</Link>
    </header>
    {error && <div className="mb-4"><Alert>{error}</Alert><button onClick={() => void refresh()} className={`${secondaryClass} mt-2`}>Reintentar</button></div>}
    {me && <SupportContext.Provider value={{ me, refresh }}><nav aria-label="Incidencias" className="mb-3 flex flex-wrap gap-2 border-b border-slate-200 pb-2">
      {me.is_manager && <Tab href={root} active={pathname === root || pathname === `${root}/gestion`}><ShieldCheck className="size-4"/>Gestión</Tab>}
      <Tab href={me.is_manager ? `${root}/mis` : root} active={pathname === `${root}/mis` || (!me.is_manager && pathname === root)}><ClipboardList className="size-4"/>Mis solicitudes</Tab>
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
export { eventLabels } from '@/lib/support/eventLabels';

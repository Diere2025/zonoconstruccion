'use client';
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { ModernLogin } from '@/components/auth/ModernLogin';
import { AdminLayout } from '@/components/ui/AdminLayout';
import { visitsRequest } from '@/lib/visits/client';
import type { VisitsMe } from '@/lib/visits/model';
import VisitsWorkspace from './VisitsWorkspace';
export default function VisitsPortal() {
  const [userId, setUserId] = useState<string | null | undefined>(undefined), [loaded, setLoaded] = useState<{ key: string; me: VisitsMe | null; error: string } | null>(null), [attempt, setAttempt] = useState(0);
  const requestKey = `${userId}:${attempt}`;
  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => { if (active) setUserId(data.session?.user.id || null); }).catch(() => { if (active) setUserId(null); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => { setUserId(session?.user.id || null); });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);
  useEffect(() => {
    let active = true;
    if (userId) void visitsRequest('/api/visits/session').then(value => { if (active) setLoaded({ key: requestKey, me: value, error: '' }); }).catch(e => { if (active) setLoaded({ key: requestKey, me: null, error: e.message }); });
    return () => { active = false; };
  }, [userId, requestKey]);
  const me = loaded?.key === requestKey ? loaded.me : null;
  const error = loaded?.key === requestKey ? loaded.error : '';
  if (userId === null) return <ModernLogin onLoginSuccess={session => setUserId(session.user.id)} />;
  if (!me) return <div className="flex min-h-screen items-center justify-center p-6">{error ? <div role="alert" className="max-w-lg rounded-xl border bg-white p-5 text-sm"><p>{error}</p><button className="mt-4 font-semibold text-indigo-700 underline" onClick={() => setAttempt(n => n + 1)}>Reintentar</button></div> : <p role="status" className="flex items-center gap-3 text-sm text-slate-500"><Loader2 className="animate-spin" size={20} />Verificando acceso a visitas…</p>}</div>;
  return <AdminLayout><VisitsWorkspace key={userId} me={me} /></AdminLayout>;
}

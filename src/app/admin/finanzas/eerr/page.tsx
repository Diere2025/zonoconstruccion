'use client';

import { useEffect, useState } from 'react';
import EstadoResultadosView from '@/components/finanzas/EstadoResultadosView';
import { supabase } from '@/lib/supabase';
import { createAuthenticatedRequester } from '@/lib/authenticatedRequest';
import { Loader2 } from 'lucide-react';

const checkAccess = createAuthenticatedRequester(supabase);

export default function AdminFinanzasEERRPage() {
  const [access, setAccess] = useState<'loading' | 'allowed' | 'denied'>('loading');
  const [message, setMessage] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    checkAccess('/api/admin/finanzas/eerr?action=access')
      .then(() => { if (active) setAccess('allowed'); })
      .catch((error: Error) => { if (active) { setMessage(error.message); setAccess('denied'); } });
    return () => { active = false; };
  }, [attempt]);
  if (access === 'loading') return <div className="flex items-center gap-2 p-4 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Verificando acceso a Dirección General…</div>;
  if (access === 'denied') return <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{message}<button type="button" className="ml-3 font-semibold underline" onClick={() => { setAccess('loading'); setAttempt(value => value + 1); }}>Reintentar</button></div>;
  return <div className="mx-auto max-w-7xl space-y-3 overflow-x-hidden"><EstadoResultadosView /></div>;
}

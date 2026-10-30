"use client";

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { createAuthenticatedRequester } from '@/lib/authenticatedRequest';
import type { RoleScreenOverrides } from '@/lib/roleScreenAccess';

const request = createAuthenticatedRequester(supabase);
// La respuesta contiene los accesos de toda la identidad, no los de una URL.
// Cambiar filtros o pestañas no debe desmontar formularios ya abiertos.
export function useRoleScreenAccess(identity: string, enabled: boolean) {
  const [state, setState] = useState<{ identity: string; overrides: RoleScreenOverrides; error: string; ready: boolean }>({ identity: '', overrides: {}, error: '', ready: false });
  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    let generation = 0;
    async function load() {
      const current = ++generation;
      try {
        const data = await request('/api/role-screen-access');
        if (!disposed && current === generation) setState({ identity, overrides: data.overrides, error: '', ready: true });
      } catch (error) {
        if (!disposed && current === generation) setState(previous => ({
          identity,
          overrides: previous.identity === identity ? previous.overrides : {},
          ready: previous.identity === identity && previous.ready,
          error: error instanceof Error ? error.message : 'No se pudieron cargar los accesos.',
        }));
      }
    }
    void load();
    const refresh = () => { void load(); };
    const interval = window.setInterval(refresh, 60_000);
    window.addEventListener('focus', refresh);
    window.addEventListener('erp-screen-access-updated', refresh);
    const { data: { subscription } } = supabase.auth.onAuthStateChange(refresh);
    return () => {
      disposed = true;
      window.clearInterval(interval);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('erp-screen-access-updated', refresh);
      subscription.unsubscribe();
    };
  }, [identity, enabled]);
  return { overrides: state.identity === identity ? state.overrides : {},
    ready: enabled && state.identity === identity && state.ready,
    error: state.identity === identity ? state.error : '' };
}

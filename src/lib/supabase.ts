import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Prevent multiple instances of Supabase client in development due to HMR
const getSupabaseClient = (): SupabaseClient => {
  if (typeof window !== 'undefined') {
    // Browser side
    const win = window as any;
    if (!win.supabaseGlobal) {
      win.supabaseGlobal = createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          lock: async (name, acquireTimeout, fn) => {
            return await fn();
          }
        }
      });
    }
    return win.supabaseGlobal;
  } else {
    // Server side
    const globalAny = global as any;
    if (!globalAny.supabaseGlobal) {
      globalAny.supabaseGlobal = createClient(supabaseUrl, supabaseAnonKey);
    }
    return globalAny.supabaseGlobal;
  }
};

export const supabase = getSupabaseClient();


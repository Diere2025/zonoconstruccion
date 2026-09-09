"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { 
  Loader2, 
  ShieldAlert 
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { AdminLayout } from "@/components/ui/AdminLayout";
import { ModernLogin } from "@/components/auth/ModernLogin";

let globalAdminSession: any = null;
let globalCheckedUserId: string | null = null;
let globalIsAdmin = false;

// Cache to prevent duplicate concurrent queries to `sellers` table
let cachedUserId: string | null = null;
let cachedRole: string | null = null;
let rolePromise: Promise<string | null> | null = null;

async function getSellerRole(userId: string, email?: string): Promise<string | null> {
  if (cachedUserId === userId && cachedRole !== null) {
    return cachedRole;
  }
  if (rolePromise && cachedUserId === userId) {
    return rolePromise;
  }
  cachedUserId = userId;

  const fetchPromise = (async () => {
    try {
      if (userId) {
        const { data, error } = await supabase
          .from('sellers')
          .select('role')
          .eq('id', userId)
          .maybeSingle();

        if (data?.role) {
          cachedRole = data.role;
          return data.role;
        }
      }

      if (email) {
        const { data: byEmail } = await supabase
          .from('sellers')
          .select('role')
          .ilike('email', email)
          .maybeSingle();

        if (byEmail?.role) {
          cachedRole = byEmail.role;
          return byEmail.role;
        }
      }

      // Default role for authenticated user
      return 'seller';
    } catch (err) {
      console.warn("Exception fetching seller role:", err);
      return 'seller';
    } finally {
      rolePromise = null;
    }
  })();

  rolePromise = fetchPromise;
  return fetchPromise;
}

function clearRoleCache() {
  cachedUserId = null;
  cachedRole = null;
  rolePromise = null;
  globalAdminSession = null;
  globalCheckedUserId = null;
  globalIsAdmin = false;
  if (typeof window !== "undefined") {
    sessionStorage.removeItem('zono_user_role');
    sessionStorage.removeItem('zono_user_email');
    sessionStorage.removeItem('zono_role_loaded');
    sessionStorage.removeItem('zono_is_restricted');
  }
}

export default function AdminLayoutWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [session, setSession] = useState<any>(globalAdminSession);
  const [isAdmin, setIsAdmin] = useState(globalIsAdmin);
  const [checkedUserId, setCheckedUserId] = useState<string | null>(globalCheckedUserId);
  const [loading, setLoading] = useState(!globalCheckedUserId);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [authLogs, setAuthLogs] = useState<string[]>([]);

  const addLog = (msg: string) => {
    const timestamp = new Date().toISOString().split("T")[1].slice(0, 8);
    const formatted = `[${timestamp}] ${msg}`;
    setAuthLogs(prev => [...prev.slice(-15), formatted]);
  };

  const processUserRole = async (user: any): Promise<boolean> => {
    if (!user) {
      addLog("No user in session, ending loading");
      globalCheckedUserId = null;
      globalIsAdmin = false;
      setCheckedUserId(null);
      setIsAdmin(false);
      setLoading(false);
      return false;
    }

    addLog(`User detected (${user.email || user.id}). Checking admin status...`);
    const email = (user.email || "").toLowerCase();

    // 1. Check if user is known admin email
    if (
      email === "diego.boveda@gmail.com" || 
      email === "caroibarra.93@gmail.com" || 
      email.includes("admin") || 
      email.includes("diego")
    ) {
      addLog("User verified as admin via email pattern/list");
      globalCheckedUserId = user.id;
      globalIsAdmin = true;
      setCheckedUserId(user.id);
      setIsAdmin(true);
      setLoading(false);
      return true;
    }

    // 2. Check user metadata for instant role detection
    const metaRole = (user.user_metadata?.role || "").toLowerCase();
    if (metaRole && ['admin', 'seller', 'logistica', 'administracion', 'fletero'].includes(metaRole)) {
      addLog(`User verified via metadata role: ${metaRole}`);
      globalCheckedUserId = user.id;
      globalIsAdmin = true;
      setCheckedUserId(user.id);
      setIsAdmin(true);
      setLoading(false);
      return true;
    }

    // 3. Check memory cache or session storage
    if (cachedUserId === user.id && cachedRole) {
      const userIsAuthorized = cachedRole === 'admin' || cachedRole === 'seller' || cachedRole === 'logistica' || cachedRole === 'administracion' || cachedRole === 'fletero' || Boolean(cachedRole);
      globalCheckedUserId = user.id;
      globalIsAdmin = userIsAuthorized;
      setCheckedUserId(user.id);
      setIsAdmin(userIsAuthorized);
      setLoading(false);
      return userIsAuthorized;
    }

    if (typeof window !== "undefined") {
      const storedRole = sessionStorage.getItem('zono_user_role');
      const storedEmail = sessionStorage.getItem('zono_user_email');
      if (storedRole && storedEmail === email) {
        addLog(`User verified via session storage: ${storedRole}`);
        globalCheckedUserId = user.id;
        globalIsAdmin = true;
        setCheckedUserId(user.id);
        setIsAdmin(true);
        setLoading(false);
        return true;
      }
    }

    // 4. Check seller role in database
    try {
      const role = await getSellerRole(user.id, email);
      addLog(`Role from sellers table: ${role}`);
      const userIsAuthorized = role === 'admin' || role === 'seller' || role === 'logistica' || role === 'administracion' || role === 'fletero' || Boolean(role);
      
      if (typeof window !== "undefined" && role) {
        sessionStorage.setItem('zono_user_role', role);
        sessionStorage.setItem('zono_user_email', email);
      }

      globalCheckedUserId = user.id;
      globalIsAdmin = userIsAuthorized;
      setCheckedUserId(user.id);
      setIsAdmin(userIsAuthorized);
      setLoading(false);
      return userIsAuthorized;
    } catch (err: any) {
      addLog(`Role check error: ${err.message}`);
      globalCheckedUserId = user.id;
      globalIsAdmin = false;
      setCheckedUserId(user.id);
      setIsAdmin(false);
      setLoading(false);
      return false;
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const host = window.location.hostname.toLowerCase();
      if (host === 'zono.com.ar' || host === 'www.zono.com.ar') {
        const targetUrl = `https://zono-erp.pages.dev${window.location.pathname}${window.location.search}`;
        window.location.replace(targetUrl);
        return;
      }
    }

    let isMounted = true;
    addLog("AdminLayout mounted, checking session...");

    // Safety timeout: Never hang on loading spinner
    const timer = setTimeout(() => {
      if (isMounted && loading) {
        addLog("Auth check exceeded 4s timeout - enabling diagnostics");
        setShowDiagnostics(true);
      }
    }, 4000);

    async function checkAuth() {
      try {
        const { data: { session: currentSession }, error } = await supabase.auth.getSession();
        if (error) {
          addLog(`getSession error: ${error.message}`);
        }
        if (!isMounted) return;

        if (currentSession?.user) {
          globalAdminSession = currentSession;
          await processUserRole(currentSession.user);
          if (isMounted) {
            setSession(currentSession);
          }
        } else {
          await processUserRole(null);
          if (isMounted) {
            setSession(null);
          }
        }
      } catch (err: any) {
        addLog(`Auth check caught exception: ${err.message || err}`);
        if (isMounted) setLoading(false);
      }
    }

    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (!isMounted) return;

      if (!newSession?.user) {
        clearRoleCache();
        if (isMounted) {
          setSession(null);
          setCheckedUserId(null);
          setIsAdmin(false);
          setLoading(false);
        }
      } else {
        globalAdminSession = newSession;
        if (globalCheckedUserId !== newSession.user.id) {
          await processUserRole(newSession.user);
        }
        if (isMounted) {
          setSession(newSession);
        }
      }
    });

    return () => {
      isMounted = false;
      clearTimeout(timer);
      subscription.unsubscribe();
    };
  }, []);

  const handleResetSession = async () => {
    addLog("Manual session reset requested. Clearing storage and signing out...");
    try {
      clearRoleCache();
      if (typeof window !== "undefined") {
        window.localStorage.clear();
        window.sessionStorage.clear();
      }
      await supabase.auth.signOut();
      window.location.reload();
    } catch (e: any) {
      alert(`Error during reset: ${e.message}`);
    }
  };

  const isRoleVerified = Boolean(session?.user?.id && checkedUserId === session.user.id);
  const isVerifying = loading || (Boolean(session?.user) && !isRoleVerified);

  if (isVerifying) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#070b14] text-white p-6 font-sans">
        <Loader2 className="w-10 h-10 animate-spin text-blue-500 mb-4" />
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
          Iniciando Zono ERP...
        </p>
        
        {showDiagnostics && (
          <div className="w-full max-w-md bg-slate-900 p-6 rounded-2xl shadow-xl border border-slate-800 animate-in fade-in slide-in-from-bottom-4 duration-300 mt-6">
            <h3 className="text-xs font-black text-slate-300 uppercase tracking-wider mb-2">Diagnóstico de Autenticación</h3>
            <div className="bg-slate-950 text-slate-400 font-mono text-[10px] p-3 rounded-lg max-h-36 overflow-y-auto space-y-1 mb-4">
              {authLogs.map((log, idx) => (
                <div key={idx} className="border-b border-slate-800/60 pb-0.5 last:border-0">{log}</div>
              ))}
            </div>
            <div className="flex gap-2">
              <Button onClick={() => setLoading(false)} className="flex-1 text-xs py-2 h-auto bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold">
                Ignorar
              </Button>
              <Button onClick={handleResetSession} className="flex-1 text-xs py-2 h-auto bg-red-600/30 hover:bg-red-600 text-red-300 hover:text-white font-bold border border-red-500/30">
                Restablecer Sesión
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (!session) {
    return (
      <ModernLogin
        onLoginSuccess={async (newSession) => {
          globalAdminSession = newSession;
          if (newSession?.user) {
            await processUserRole(newSession.user);
          }
          setSession(newSession);
        }}
      />
    );
  }

  // Admin access validation
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-[#070b14] text-white flex items-center justify-center p-6 relative overflow-hidden font-sans">
        <div className="bg-slate-900/80 border border-red-500/20 backdrop-blur-xl p-10 rounded-[2.5rem] shadow-2xl w-full max-w-md text-center">
          <div className="w-16 h-16 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center justify-center mx-auto mb-6 text-red-400">
            <ShieldAlert className="w-8 h-8 animate-pulse" />
          </div>
          <h2 className="text-2xl font-black text-white tracking-tight">Acceso Denegado</h2>
          <p className="text-slate-400 font-medium text-xs mt-2 leading-relaxed">
            Tu cuenta no posee permisos de Administrador para acceder a este módulo central.
          </p>
          <Button
            onClick={() => {
              clearRoleCache();
              supabase.auth.signOut();
            }}
            className="w-full mt-6 py-4 font-black rounded-2xl bg-red-600/20 hover:bg-red-600 text-red-300 hover:text-white border border-red-500/30 transition-all cursor-pointer"
          >
            Cerrar Sesión
          </Button>
        </div>
      </div>
    );
  }

  return (
    <AdminLayout>
      {children}
    </AdminLayout>
  );
}

"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Settings, Loader2, ShieldAlert, Mail, ArrowLeft, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { AdminLayout } from "@/components/ui/AdminLayout";

let globalAdminSession: any = null;
let globalAdminChecked = false;
let globalIsAdmin = false;

// Cache to prevent duplicate concurrent queries to `sellers` table
let cachedUserId: string | null = null;
let cachedRole: string | null = null;
let rolePromise: Promise<string | null> | null = null;

async function getSellerRole(userId: string): Promise<string | null> {
  if (cachedUserId === userId && cachedRole !== null) {
    return cachedRole;
  }
  if (rolePromise && cachedUserId === userId) {
    return rolePromise;
  }
  cachedUserId = userId;
  rolePromise = (async () => {
    try {
      const { data, error } = await supabase
        .from('sellers')
        .select('role')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        console.warn("Error fetching seller role:", error.message);
        // Do not cache error as permanent null
        return null;
      }
      cachedRole = data?.role || null;
      return cachedRole;
    } catch (err) {
      console.warn("Exception fetching seller role:", err);
      return null;
    } finally {
      rolePromise = null;
    }
  })();
  return rolePromise;
}

const clearRoleCache = () => {
  cachedUserId = null;
  cachedRole = null;
  rolePromise = null;
};

export default function AdminLayoutWrapper({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<any>(globalAdminSession);
  const [loading, setLoading] = useState(!globalAdminChecked);
  const [isAdmin, setIsAdmin] = useState(globalIsAdmin);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Password Recovery States
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const [authLogs, setAuthLogs] = useState<string[]>([]);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const router = useRouter();

  const addLog = (msg: string) => {
    console.log(msg);
    setAuthLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  useEffect(() => {
    // Show diagnostics after 10 seconds if still loading (prevents premature warning pages)
    const timer = setTimeout(() => {
      setShowDiagnostics(true);
    }, 10000);

    if (globalAdminChecked) {
      setLoading(false);
    }

    async function checkAuth() {
      addLog("checkAuth started");
      try {
        addLog("fetching session...");
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          addLog(`session fetch error: ${sessionError.message}`);
        } else {
          addLog(`session fetched successfully. User present: ${!!session?.user}`);
        }
        globalAdminSession = session;
        setSession(session);
        
        if (session?.user) {
          addLog(`fetching seller role for user id: ${session.user.id}`);
          const role = await getSellerRole(session.user.id);
          addLog(`seller role query finished. Role: ${role}`);
          globalIsAdmin = role === 'admin';
          setIsAdmin(globalIsAdmin);
        } else {
          addLog("no user in session, admin is false");
          globalIsAdmin = false;
          setIsAdmin(false);
        }
        globalAdminChecked = true;
      } catch (err: any) {
        addLog(`Auth check caught exception: ${err.message || err}`);
      } finally {
        addLog("checkAuth finished, setting loading to false");
        setLoading(false);
      }
    }

    checkAuth();

    addLog("subscribing to onAuthStateChange...");
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      addLog(`onAuthStateChange event: ${event}, user present: ${!!session?.user}`);
      globalAdminSession = session;
      setSession(session);
      try {
        if (session?.user) {
          addLog("onAuthStateChange: fetching seller role...");
          const role = await getSellerRole(session.user.id);
          addLog(`onAuthStateChange: seller role query finished. Role: ${role}`);
          globalIsAdmin = role === 'admin';
          setIsAdmin(globalIsAdmin);
        } else {
          addLog("onAuthStateChange: no user, admin is false");
          globalIsAdmin = false;
          setIsAdmin(false);
          clearRoleCache();
        }
        globalAdminChecked = true;
      } catch (err: any) {
        addLog(`onAuthStateChange handler caught exception: ${err.message || err}`);
      } finally {
        addLog("onAuthStateChange finished processing, setting loading to false");
        setLoading(false);
      }
    });

    return () => {
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
      addLog("Sign out complete. Reloading...");
      window.location.reload();
    } catch (e: any) {
      addLog(`Error during reset: ${e.message}`);
      alert(`Error during reset: ${e.message}`);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-6">
        <Loader2 className="w-8 h-8 animate-spin text-brand-500 mb-4" />
        
        {showDiagnostics && (
          <div className="w-full max-w-md bg-white p-6 rounded-2xl shadow-xl border border-slate-200 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider mb-2">Diagnóstico de Autenticación</h3>
            <p className="text-xs text-slate-500 mb-4">La carga está demorando más de lo habitual. Registro de eventos:</p>
            <div className="bg-slate-900 text-slate-200 font-mono text-[10px] p-3 rounded-lg max-h-40 overflow-y-auto space-y-1 mb-4">
              {authLogs.map((log, idx) => (
                <div key={idx} className="border-b border-slate-800 pb-0.5 last:border-0">{log}</div>
              ))}
              {authLogs.length === 0 && <div className="text-slate-500">Iniciando logs...</div>}
            </div>
            <div className="flex gap-2">
              <Button onClick={() => setLoading(false)} className="flex-1 text-xs py-2 h-auto bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold">
                Ignorar y Mostrar Pantalla
              </Button>
              <Button onClick={handleResetSession} className="flex-1 text-xs py-2 h-auto bg-red-600 hover:bg-red-700 text-white font-bold">
                Restablecer Sesión
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password: loginPassword,
    });
    if (error) alert("Credenciales inválidas");
    setIsLoggingIn(false);
  };

  const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSendingReset(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) {
        alert("Error al enviar el correo: " + error.message);
      } else {
        setResetSent(true);
      }
    } catch (err: any) {
      alert("Error inesperado: " + err.message);
    } finally {
      setIsSendingReset(false);
    }
  };

  if (!session) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white p-12 rounded-[3rem] shadow-2xl border border-slate-100 w-full max-w-md">
          {isForgotPassword ? (
            resetSent ? (
              // Success recovery email screen
              <div className="text-center space-y-6">
                <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto animate-bounce-slow">
                  <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                </div>
                <div>
                  <h1 className="text-3xl font-black text-slate-900 tracking-tighter">Enlace enviado</h1>
                  <p className="text-slate-500 font-medium text-sm mt-2 leading-relaxed">
                    Enviamos un correo de recuperación a: <br />
                    <strong className="text-slate-800 break-all">{forgotEmail}</strong>
                  </p>
                </div>
                <div className="pt-4">
                  <button
                    onClick={() => {
                      setIsForgotPassword(false);
                      setResetSent(false);
                    }}
                    className="flex items-center justify-center gap-2 w-full py-4 text-xs font-black uppercase tracking-widest border border-slate-200 hover:bg-slate-50 rounded-2xl transition-all text-slate-500 hover:text-slate-700 cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Volver al Inicio
                  </button>
                </div>
              </div>
            ) : (
              // Forgot password email request screen
              <div className="space-y-6">
                <div className="text-center">
                  <div className="w-16 h-16 bg-brand-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
                    <Mail className="w-8 h-8 text-brand-600" />
                  </div>
                  <h1 className="text-3xl font-black text-slate-900 tracking-tighter">Recuperar Acceso</h1>
                  <p className="text-slate-500 font-medium mt-2">Ingresá tu correo para recibir un enlace de recuperación</p>
                </div>

                <form onSubmit={handleForgotPasswordSubmit} className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Email</label>
                    <input 
                      type="email" 
                      required 
                      className="w-full px-5 py-4 rounded-2xl border border-slate-100 focus:ring-4 focus:ring-brand-500/10 bg-slate-50 font-bold"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                    />
                  </div>
                  
                  <div className="space-y-3">
                    <Button type="submit" disabled={isSendingReset} className="w-full py-8 text-md font-black rounded-2xl">
                      {isSendingReset ? <Loader2 className="animate-spin" /> : "Enviar Enlace"}
                    </Button>
                    
                    <button
                      type="button"
                      onClick={() => setIsForgotPassword(false)}
                      className="flex items-center justify-center gap-2 w-full py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      Volver a Iniciar Sesión
                    </button>
                  </div>
                </form>
              </div>
            )
          ) : (
            // Standard login form
            <div className="space-y-6">
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-brand-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
                  <Settings className="w-8 h-8 text-brand-600 animate-spin-slow" />
                </div>
                <h1 className="text-3xl font-black text-slate-900 tracking-tighter">Zono ERP</h1>
                <p className="text-slate-500 font-medium mt-2">Portal de Administración y Operaciones</p>
              </div>
              
              <form onSubmit={handleLogin} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Email</label>
                  <input 
                    type="email" 
                    required 
                    className="w-full px-5 py-4 rounded-2xl border border-slate-100 focus:ring-4 focus:ring-brand-500/10 bg-slate-50 font-bold"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Contraseña</label>
                    <button
                      type="button"
                      onClick={() => setIsForgotPassword(true)}
                      className="text-[10px] font-black uppercase tracking-widest text-brand-600 hover:text-brand-700 transition-colors font-bold"
                    >
                      ¿La olvidaste?
                    </button>
                  </div>
                  <input 
                    type="password" 
                    required 
                    className="w-full px-5 py-4 rounded-2xl border border-slate-100 focus:ring-4 focus:ring-brand-500/10 bg-slate-50 font-bold"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                  />
                </div>
                <Button type="submit" disabled={isLoggingIn} className="w-full py-8 text-lg font-black rounded-2xl">
                  {isLoggingIn ? <Loader2 className="animate-spin" /> : "Iniciar Sesión"}
                </Button>
              </form>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Admin access validation
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white p-12 rounded-[3rem] shadow-2xl border border-slate-100 w-full max-w-md text-center">
          <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <ShieldAlert className="w-8 h-8 text-red-600 animate-pulse" />
          </div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tighter">Acceso Denegado</h1>
          <p className="text-slate-500 font-medium mt-2">No tienes permisos de administrador para ingresar a esta sección.</p>
          <Button onClick={() => supabase.auth.signOut()} className="w-full mt-6 py-6 font-bold rounded-2xl bg-red-100 hover:bg-red-600 text-red-700 hover:text-white transition-all">
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

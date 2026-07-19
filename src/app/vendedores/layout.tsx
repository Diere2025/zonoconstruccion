"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Settings, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { AdminLayout } from "@/components/ui/AdminLayout";

let globalSession: any = null;
let globalSessionChecked = false;

export default function VendedoresLayout({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<any>(globalSession);
  const [loading, setLoading] = useState(!globalSessionChecked);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const router = useRouter();

  useEffect(() => {
    console.log("[VendedoresLayout] useEffect mounted");
    
    if (globalSessionChecked) {
      setLoading(false);
    }

    // Race to prevent getSession from hanging forever
    const getSessionPromise = supabase.auth.getSession();
    const timeoutPromise = new Promise<{ data: { session: null }; error: any }>((_, reject) =>
      setTimeout(() => reject(new Error("Timeout getting session")), 2500)
    );

    Promise.race([getSessionPromise, timeoutPromise as any])
      .then(({ data: { session } }) => {
        console.log("[VendedoresLayout] getSession resolved. Session user:", session?.user?.email);
        globalSession = session;
        globalSessionChecked = true;
        setSession(session);
        setLoading(false);
      })
      .catch(err => {
        console.error("[VendedoresLayout] getSession error or timeout:", err);
        globalSessionChecked = true;
        setLoading(false);
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      console.log("[VendedoresLayout] onAuthStateChange fired. Event:", _event, "Session user:", session?.user?.email);
      globalSession = session;
      globalSessionChecked = true;
      setSession(session);
      setLoading(false);
    });

    return () => {
      console.log("[VendedoresLayout] useEffect unmounting");
      subscription.unsubscribe();
    };
  }, []);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50"><Loader2 className="w-8 h-8 animate-spin text-brand-500" /></div>;
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

  if (!session) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white p-12 rounded-[3rem] shadow-2xl border border-slate-100 w-full max-w-md">
          <div className="text-center mb-10">
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
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Contraseña</label>
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
      </div>
    );
  }

  return (
    <AdminLayout>
      {children}
    </AdminLayout>
  );
}

"use client";

import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Loader2 } from "lucide-react";
import { AdminLayout } from "@/components/ui/AdminLayout";
import { ModernLogin } from "@/components/auth/ModernLogin";

let globalSession: any = null;
let globalSessionChecked = false;

export default function VendedoresLayout({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<any>(globalSession);
  const [loading, setLoading] = useState(!globalSessionChecked);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const host = window.location.hostname.toLowerCase();
      if (host === 'zono.com.ar' || host === 'www.zono.com.ar') {
        const targetUrl = `https://zono-erp.pages.dev${window.location.pathname}${window.location.search}`;
        window.location.replace(targetUrl);
        return;
      }
    }

    if (globalSessionChecked) {
      setLoading(false);
    }

    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        globalSession = session;
        globalSessionChecked = true;
        setSession(session);
        setLoading(false);
      })
      .catch(err => {
        console.error("[VendedoresLayout] getSession error:", err);
        globalSessionChecked = true;
        setLoading(false);
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      globalSession = session;
      globalSessionChecked = true;
      setSession(session);
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#070b14] text-white p-6 font-sans">
        <Loader2 className="w-10 h-10 animate-spin text-blue-500 mb-4" />
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
          Iniciando Zono ERP...
        </p>
      </div>
    );
  }

  if (!session) {
    return (
      <ModernLogin 
        onLoginSuccess={(newSession) => {
          globalSession = newSession;
          globalSessionChecked = true;
          setSession(newSession);
        }} 
      />
    );
  }

  return (
    <AdminLayout>
      {children}
    </AdminLayout>
  );
}

"use client";

import React, { useEffect, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { PublicHome } from "@/components/PublicHome";

function ErpRedirector() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/admin');
    const timer = setTimeout(() => {
      if (window.location.pathname === '/') window.location.replace('/admin');
    }, 1000);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div className="min-h-screen bg-[#070b14] flex items-center justify-center text-white p-6 font-sans">
      <div className="text-center space-y-4 max-w-sm">
        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
        <h2 className="text-lg font-black tracking-tight text-white">ZONO ERP</h2>
        <p className="text-xs text-slate-400 font-medium">Ingresando al sistema de gestión...</p>

        <a href="/admin" className="text-sm text-indigo-300 underline">Ir al inicio</a>
      </div>
    </div>
  );
}

const subscribeToLocation = () => () => {};
const serverLocation = (): boolean | null => null;
const browserLocation = () => {
  const host = window.location.hostname.toLowerCase();
  const search = new URLSearchParams(window.location.search);
  return host.includes('zono-erp') || host.includes('pages.dev') || search.get('erp') === 'true';
};

export default function RootPage() {
  const isErp = useSyncExternalStore(subscribeToLocation, browserLocation, serverLocation);
  if (isErp === null) return <div role="status" className="min-h-screen flex items-center justify-center bg-slate-50 text-sm text-slate-500">Cargando Zono…</div>;

  // When visiting on zono-erp.pages.dev, redirect into the ERP
  if (isErp === true) {
    return <ErpRedirector />;
  }

  // On zono.com.ar, www.zono.com.ar and default localhost, render the public website
  return <PublicHome />;
}

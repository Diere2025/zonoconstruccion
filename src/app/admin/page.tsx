"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AdminPage() {
  const router = useRouter();

  useEffect(() => {
    try {
      router.replace("/admin/dashboard");
    } catch {
      window.location.replace("/admin/dashboard");
    }
    const timer = setTimeout(() => {
      if (typeof window !== 'undefined' && window.location.pathname !== '/admin/dashboard') {
        window.location.replace("/admin/dashboard");
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white p-6 font-sans">
      <div className="text-center space-y-4">
        <div className="w-10 h-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto" />
        <h2 className="text-lg font-black tracking-tight text-white">ZONO ERP</h2>
        <p className="text-xs text-slate-400 font-medium">Cargando Dashboard Principal...</p>
        <div className="pt-2">
          <a href="/admin/dashboard" className="text-xs text-blue-400 underline font-medium">
            Hacé clic aquí si no redirige automáticamente
          </a>
        </div>
      </div>
    </div>
  );
}

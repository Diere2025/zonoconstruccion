"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AdminPage() {
  const router = useRouter();

  useEffect(() => {
    const getTargetRoute = () => {
      if (typeof window !== "undefined") {
        const role = sessionStorage.getItem("zono_user_role");
        const isRestricted = sessionStorage.getItem("zono_is_restricted") === "true";
        if (role === "seller" || isRestricted) return "/vendedores";
        if (role === "logistica" || role === "fletero") return "/admin/cobros-mp";
        if (role === "administracion") return "/admin/cobros-mp";
      }
      return "/admin/dashboard";
    };

    const target = getTargetRoute();
    try {
      router.replace(target);
    } catch {
      window.location.replace(target);
    }
    const timer = setTimeout(() => {
      if (typeof window !== "undefined") {
        const currentTarget = getTargetRoute();
        if (window.location.pathname !== currentTarget) {
          window.location.replace(currentTarget);
        }
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white p-6 font-sans">
      <div className="text-center space-y-4">
        <div className="w-10 h-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto" />
        <h2 className="text-lg font-black tracking-tight text-white">ZONO ERP</h2>
        <p className="text-xs text-slate-400 font-medium">Ingresando al sistema...</p>
      </div>
    </div>
  );
}

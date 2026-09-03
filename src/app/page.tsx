"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    async function redirectByRole() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          router.replace("/admin");
          return;
        }

        const emailLower = (user.email || '').toLowerCase();
        if (
          emailLower === 'diego.boveda@gmail.com' ||
          emailLower.includes('admin') ||
          emailLower.includes('diego') ||
          emailLower === 'caroibarra.93@gmail.com'
        ) {
          router.replace("/admin/dashboard");
          return;
        }

        const metaRole = (user.user_metadata?.role || '').toLowerCase();
        if (metaRole === 'logistica' || metaRole === 'fletero' || metaRole === 'administracion') {
          router.replace("/admin/cobros-mp");
          return;
        }

        const { data: seller } = await supabase
          .from('sellers')
          .select('role')
          .or(`id.eq.${user.id},email.ilike.${emailLower}`)
          .maybeSingle();

        const isRestricted = emailLower.includes("jazmin") || 
                             emailLower.includes("jazmín") || 
                             emailLower.includes("ludmila") ||
                             emailLower.includes("facundo");

        if (isRestricted) {
          router.replace("/vendedores/presupuestos");
          return;
        }

        const role = (seller?.role || metaRole || '').toLowerCase();
        if (role === 'logistica' || role === 'fletero' || role === 'administracion') {
          router.replace("/admin/cobros-mp");
        } else if (role === 'admin') {
          router.replace("/admin/dashboard");
        } else {
          router.replace("/vendedores");
        }
      } catch {
        router.replace("/admin/dashboard");
      }
    }

    redirectByRole();
  }, [router]);

  return (
    <div className="min-h-screen bg-[#070b14] flex items-center justify-center text-white p-6 font-sans">
      <div className="text-center space-y-4">
        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
        <h2 className="text-lg font-black tracking-tight text-white">ZONO ERP</h2>
        <p className="text-xs text-slate-400 font-medium">Ingresando al sistema de gestión...</p>
      </div>
    </div>
  );
}

"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { PublicHome } from "@/components/PublicHome";

function ErpRedirector() {
  const router = useRouter();
  const [showManualLink, setShowManualLink] = useState(false);

  useEffect(() => {
    let redirected = false;

    const doRedirect = (targetPath: string) => {
      if (redirected) return;
      redirected = true;
      try {
        router.replace(targetPath);
      } catch {
        window.location.replace(targetPath);
      }
      // Safety guarantee: hard navigate if router.replace didn't change location
      setTimeout(() => {
        if (typeof window !== 'undefined' && window.location.pathname !== targetPath) {
          window.location.replace(targetPath);
        }
      }, 500);
    };

    // Safety timeout: Maximum 2 seconds before forcing redirect to /admin/dashboard
    const fallbackTimer = setTimeout(() => {
      setShowManualLink(true);
      doRedirect("/admin/dashboard");
    }, 2000);

    async function redirectByRole() {
      try {
        // 1. Fast local session check (with 1s timeout)
        const sessionPromise = supabase.auth.getSession();
        const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 1000));
        const res = await Promise.race([sessionPromise, timeoutPromise]) as any;

        const session = res?.data?.session;
        const user = session?.user;

        if (!user) {
          clearTimeout(fallbackTimer);
          doRedirect("/admin/dashboard");
          return;
        }

        const emailLower = (user.email || '').toLowerCase();
        if (
          emailLower === 'diego.boveda@gmail.com' ||
          emailLower.includes('admin') ||
          emailLower.includes('diego') ||
          emailLower === 'caroibarra.93@gmail.com'
        ) {
          clearTimeout(fallbackTimer);
          doRedirect("/admin/dashboard");
          return;
        }

        const isRestricted = emailLower.includes("jazmin") || 
                             emailLower.includes("jazmín") || 
                             emailLower.includes("ludmila") ||
                             emailLower.includes("facundo");

        if (isRestricted) {
          clearTimeout(fallbackTimer);
          doRedirect("/vendedores/presupuestos");
          return;
        }

        const metaRole = (user.user_metadata?.role || '').toLowerCase();
        if (metaRole === 'logistica' || metaRole === 'fletero' || metaRole === 'administracion') {
          clearTimeout(fallbackTimer);
          doRedirect("/admin/cobros-mp");
          return;
        }

        // 2. Check cached role in sessionStorage
        if (typeof window !== 'undefined') {
          const storedRole = (sessionStorage.getItem('zono_user_role') || '').toLowerCase();
          if (storedRole) {
            clearTimeout(fallbackTimer);
            if (storedRole === 'admin') {
              doRedirect("/admin/dashboard");
            } else if (storedRole === 'logistica' || storedRole === 'fletero' || storedRole === 'administracion') {
              doRedirect("/admin/cobros-mp");
            } else {
              doRedirect("/vendedores");
            }
            return;
          }
        }

        // 3. Fast sellers query with 1s timeout
        let dbRole = metaRole;
        try {
          const sellerPromise = supabase
            .from('sellers')
            .select('role')
            .eq('id', user.id)
            .maybeSingle();
          const sellerTimeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 1000));
          const sellerRes = await Promise.race([sellerPromise, sellerTimeout]) as any;
          if (sellerRes?.data?.role) {
            dbRole = sellerRes.data.role.toLowerCase();
          }
        } catch {
          // Ignore and use metaRole or default
        }

        clearTimeout(fallbackTimer);
        if (dbRole === 'logistica' || dbRole === 'fletero' || dbRole === 'administracion') {
          doRedirect("/admin/cobros-mp");
        } else if (dbRole === 'admin') {
          doRedirect("/admin/dashboard");
        } else {
          doRedirect("/vendedores");
        }
      } catch {
        clearTimeout(fallbackTimer);
        doRedirect("/admin/dashboard");
      }
    }

    redirectByRole();

    return () => {
      clearTimeout(fallbackTimer);
    };
  }, [router]);

  return (
    <div className="min-h-screen bg-[#070b14] flex items-center justify-center text-white p-6 font-sans">
      <div className="text-center space-y-4 max-w-sm">
        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
        <h2 className="text-lg font-black tracking-tight text-white">ZONO ERP</h2>
        <p className="text-xs text-slate-400 font-medium">Ingresando al sistema de gestión...</p>

        {showManualLink && (
          <div className="pt-2 animate-in fade-in duration-300">
            <a
              href="/admin/dashboard"
              className="inline-flex items-center justify-center px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg transition-all"
            >
              Hacé clic aquí para entrar &rarr;
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

export default function RootPage() {
  const [isErp, setIsErp] = useState<boolean | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const host = window.location.hostname.toLowerCase();
      const search = window.location.search.toLowerCase();
      // Only route to ERP if accessing explicitly on the ERP subdomain/pages.dev or via ?erp=true
      if (host.includes('zono-erp') || host.includes('pages.dev') || search.includes('erp=true')) {
        setIsErp(true);
      } else {
        setIsErp(false);
      }
    }
  }, []);

  // When visiting on zono-erp.pages.dev, redirect into the ERP
  if (isErp === true) {
    return <ErpRedirector />;
  }

  // On zono.com.ar, www.zono.com.ar and default localhost, render the public website
  return <PublicHome />;
}

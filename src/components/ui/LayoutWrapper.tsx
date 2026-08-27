"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { Navbar } from "@/components/ui/Navbar";
import { CartDrawer } from "@/components/ui/CartDrawer";

interface LayoutWrapperProps {
  children: React.ReactNode;
}

export function LayoutWrapper({ children }: LayoutWrapperProps) {
  const pathname = usePathname();
  
  // Detect if we are inside administrative or seller portals
  const isPortal = pathname.startsWith("/admin") || pathname.startsWith("/vendedores") || pathname.startsWith("/reset-password");

  if (isPortal) {
    // Return children directly without public store header, footer or drawers
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
        {children}
      </div>
    );
  }

  // Otherwise render full storefront layout with public header and footer
  return (
    <>
      <Navbar />
      <main className="flex-grow pt-20">
        {children}
      </main>
      <CartDrawer />
      
      <footer id="site-footer" className="bg-slate-950 text-white py-12 border-t border-slate-900 mt-auto">
        <div className="container mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="text-gray-400 text-sm">
            &copy; {new Date().getFullYear()} <strong>Zono Construcción y Hogar</strong>. Todos los derechos reservados.
          </div>
          <div className="flex space-x-8 text-sm font-bold text-slate-500">
            <a href="#" className="hover:text-white transition-colors">Términos</a>
            <a href="#" className="hover:text-white transition-colors">Privacidad</a>
            <a href="#" className="hover:text-white transition-colors">Cookies</a>
          </div>
        </div>
      </footer>
    </>
  );
}

"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ShoppingCart, Menu, X, Phone } from "lucide-react";
import { useCartStore } from "@/store/useCartStore";
import { Button } from "./Button";
import { cn } from "@/lib/utils";

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const totalItems = useCartStore((state) => state.totalItems());
  const setCartOpen = useCartStore((state) => state.setCartOpen);

  return (
    <header className="fixed w-full top-0 z-50 glass">
      <div className="container mx-auto px-6 h-20 flex justify-between items-center">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 group">
          <div className="relative font-black text-2xl tracking-tighter text-brand-900 group-hover:scale-105 transition-transform">
            ZONO<span className="text-brand-600">HOME</span>
          </div>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center space-x-10 font-bold text-slate-600">
          <Link href="/#productos" className="hover:text-brand-600 transition-colors">Catálogo</Link>
          <Link href="/#nosotros" className="hover:text-brand-600 transition-colors">Nosotros</Link>
          <Link href="/#contacto" className="hover:text-brand-600 transition-colors">Ubicación</Link>
        </nav>

        {/* Actions */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" className="relative" onClick={() => setCartOpen(true)}>
            <ShoppingCart className="w-6 h-6 text-slate-700" />
            {totalItems > 0 && (
              <span className="absolute -top-1 -right-1 bg-brand-600 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center animate-in zoom-in">
                {totalItems}
              </span>
            )}
          </Button>
          
          <a href="https://wa.me/5491157694181?text=Hola!%20Te%20contacto%20desde%20la%20p%C3%A1gina%20web%20de%20ZonoHome%20y%20me%20gustar%C3%ADa%20recibir%20asesoramiento." target="_blank" className="hidden lg:block">
            <Button variant="success" className="w-full gap-2 rounded-full">
              <Phone className="w-4 h-4 text-white" />
              <span className="text-white">WhatsApp</span>
            </Button>
          </a>

          {/* Mobile Toggle */}
          <button 
            className="md:hidden text-slate-700 hover:text-brand-600 focus:outline-none"
            onClick={() => setIsOpen(!isOpen)}
          >
            {isOpen ? <X className="w-8 h-8" /> : <Menu className="w-8 h-8" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {isOpen && (
        <div className="md:hidden bg-white border-t border-slate-100 absolute w-full shadow-2xl animate-in slide-in-from-top duration-300">
          <div className="flex flex-col px-6 py-8 space-y-6 font-bold text-lg">
            <Link href="/#productos" onClick={() => setIsOpen(false)} className="text-slate-700 hover:text-brand-600">Catálogo</Link>
            <Link href="/#nosotros" onClick={() => setIsOpen(false)} className="text-slate-700 hover:text-brand-600">Nosotros</Link>
            <Link href="/#contacto" onClick={() => setIsOpen(false)} className="text-slate-700 hover:text-brand-600">Ubicación</Link>
            <a href="https://wa.me/5491157694181?text=Hola!%20Te%20contacto%20desde%20la%20p%C3%A1gina%20web%20de%20ZonoHome%20y%20me%20gustar%C3%ADa%20recibir%20asesoramiento." target="_blank" className="w-full">
              <Button variant="success" className="w-full gap-2 py-6 rounded-2xl text-white">
                <Phone className="w-5 h-5" />
                WhatsApp
              </Button>
            </a>
          </div>
        </div>
      )}
    </header>
  );
}

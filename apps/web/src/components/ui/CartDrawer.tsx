"use client";

import React, { useEffect, useState } from "react";
import { useCartStore } from "@/store/useCartStore";
import { Button } from "./Button";
import { X, ShoppingBag, Plus, Minus, Trash2, Send } from "lucide-react";
import Image from "next/image";
import { formatPrice } from "@/lib/utils";
import { trackEvent } from "@/lib/analytics";
import { motion, AnimatePresence } from "framer-motion";

export function CartDrawer() {
  const { items, addItem, removeItem, updateQuantity, totalPrice, isCartOpen, setCartOpen } = useCartStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const handleWhatsAppCheckout = () => {
    const message = `Hola ZonoHome! Mi pedido es:\n\n${items
      .map((item) => `- ${item.quantity}x ${item.name} (${formatPrice(item.price * item.quantity)})`)
      .join("\n")}\n\n*Total: ${formatPrice(totalPrice())}*`;

    trackEvent("InitiateCheckout", {
      content_ids: items.map((item) => item.id),
      contents: items.map((item) => ({
        id: item.id,
        quantity: item.quantity,
        item_price: item.price,
      })),
      value: totalPrice(),
      currency: "ARS",
      num_items: items.reduce((acc, item) => acc + item.quantity, 0),
    });

    const encodedMessage = encodeURIComponent(message);
    window.open(`https://wa.me/5491157694181?text=${encodedMessage}`, "_blank");
  };

  return (
    <AnimatePresence>
      {isCartOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setCartOpen(false)}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100]"
          />
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl z-[101] flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-6 h-6 text-brand-600" />
                <h2 className="text-xl font-black text-slate-900">Tu Pedido</h2>
              </div>
              <button onClick={() => setCartOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                <X className="w-6 h-6 text-slate-500" />
              </button>
            </div>

            {/* Items */}
            <div className="flex-grow overflow-y-auto p-6 space-y-6">
              {items.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center space-y-4">
                  <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center text-slate-300">
                    <ShoppingBag className="w-10 h-10" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900">Tu carrito está vacío</h3>
                  <p className="text-sm text-slate-500 max-w-[200px]">
                    Agrega algunos productos para comenzar tu pedido.
                  </p>
                  <Button variant="outline" onClick={() => setCartOpen(false)} className="mt-4">
                    Volver a la tienda
                  </Button>
                </div>
              ) : (
                items.map((item) => (
                  <div key={item.id} className="flex gap-4 group">
                    <div className="relative w-24 h-24 bg-slate-50 rounded-xl overflow-hidden flex-shrink-0 border border-slate-100">
                      <Image src={item.image_url} alt={item.name} fill className="object-contain p-2" />
                    </div>
                    <div className="flex-grow flex flex-col">
                      <h4 className="font-bold text-slate-900 leading-tight mb-1">{item.name}</h4>
                      <p className="text-sm font-semibold text-brand-600 mb-2">{formatPrice(item.price)}</p>
                      
                      <div className="mt-auto flex items-center justify-between">
                        <div className="flex items-center border border-slate-200 rounded-lg h-9">
                          <button 
                            onClick={() => updateQuantity(item.id, item.quantity - 1)}
                            className="px-2 hover:text-brand-600 transition-colors"
                          >
                            <Minus className="w-4 h-4" />
                          </button>
                          <span className="px-2 font-bold text-slate-700 min-w-[2rem] text-center">{item.quantity}</span>
                          <button 
                            onClick={() => updateQuantity(item.id, item.quantity + 1)}
                            className="px-2 hover:text-brand-600 transition-colors"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                        <button 
                          onClick={() => removeItem(item.id)}
                          className="text-slate-300 hover:text-red-500 transition-colors p-2"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            {items.length > 0 && (
              <div className="p-6 border-t border-slate-100 bg-slate-50/50 space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-medium">Subtotal</span>
                  <span className="text-xl font-black text-slate-900">{formatPrice(totalPrice())}</span>
                </div>
                <Button 
                  onClick={handleWhatsAppCheckout}
                  variant="success" 
                  className="w-full py-7 rounded-2xl gap-3 shadow-lg shadow-green-500/20 text-lg text-white"
                >
                  <Send className="w-5 h-5 text-white" />
                  Enviar Pedido por WhatsApp
                </Button>
                <div className="text-center">
                  <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">
                    Pagarás al recibir o acordarás con el vendedor
                  </p>
                </div>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

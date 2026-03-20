"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import { Product } from "@/types";
import { useCartStore } from "@/store/useCartStore";
import { Button } from "./Button";
import { ShoppingCart, X, CheckCircle2, Truck, ShieldCheck, Factory, Plus, Edit2 } from "lucide-react";
import { cn, formatPrice } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

interface ProductModalProps {
  product: Product;
  isOpen: boolean;
  onClose: () => void;
  allProducts?: Product[];
  isAdmin?: boolean;
  onEdit?: (product: Product) => void;
}

export function ProductModal({ product, isOpen, onClose, allProducts = [], isAdmin = false, onEdit }: ProductModalProps) {
  const addItem = useCartStore((state) => state.addItem);
  const setCartOpen = useCartStore((state) => state.setCartOpen);

  const [currentImageIdx, setCurrentImageIdx] = useState(0);

  useEffect(() => {
    if (isOpen) setCurrentImageIdx(0);
  }, [isOpen]);

  if (!product) return null;

  const allImages = [
    product.image_url,
    ...(product.settings?.gallery || [])
  ].filter(url => url && url.trim() !== "");

  const handleAddToCart = () => {
    addItem(product);
    onClose();
    setCartOpen(true);
  };

  const handleAddUpsell = (upsellProduct: Product) => {
    addItem(upsellProduct);
    setCartOpen(true);
  };

  // Obtener los productos vinculados para Upsell
  const upsellProducts = allProducts.filter(p => product.upsell_ids?.includes(p.id));

  // Helper para formatear la descripción con negritas, itálicas y saltos de línea
  const formatDescription = (text: string) => {
    if (!text) return "Sin descripción disponible.";
    
    // Escapar HTML básico para seguridad
    let formatted = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    // Negritas: **texto**
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong class="text-slate-900 font-black">$1</strong>');
    
    // Itálicas: *texto*
    formatted = formatted.replace(/\*(.*?)\*/g, '<em class="italic">$1</em>');
    
    // Listas: - texto
    formatted = formatted.replace(/^- (.*)$/gm, '<li class="ml-4 list-disc">$1</li>');
    
    // Saltos de línea
    formatted = formatted.replace(/\n/g, '<br />');

    return formatted;
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 md:p-10">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
          />
          
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="relative w-full max-w-5xl max-h-[90vh] bg-white rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col md:flex-row"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Botón Cerrar y Editar Admin */}
            <div className="absolute top-6 right-6 z-20 flex gap-2">
              {isAdmin && onEdit && (
                <button
                  onClick={() => onEdit(product)}
                  className="flex items-center gap-2 px-4 py-2 rounded-full bg-brand-600 text-white hover:bg-brand-700 transition-all shadow-lg shadow-brand-600/20 text-xs font-black uppercase tracking-widest"
                >
                  <Edit2 className="w-4 h-4" /> Editar Producto
                </button>
              )}
              <button
                onClick={onClose}
                className="p-2 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-900 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Imagen del Producto */}
            <div className="w-full md:w-2/5 bg-slate-50 relative p-8 flex items-center justify-center min-h-[300px] border-r border-slate-100">
              <div className="w-full flex flex-col items-center">
                <div className="relative w-full aspect-square flex-shrink-0">
                  <Image
                    src={allImages[currentImageIdx] || "https://placehold.co/600x600?text=Procesando"}
                    alt={product.name}
                    fill
                    className="object-contain"
                    sizes="(max-width: 768px) 100vw, 500px"
                    unoptimized
                  />
                </div>

                {/* Miniaturas */}
                {allImages.length > 1 && (
                  <div className="flex gap-3 mt-8 w-full flex-wrap justify-center">
                    {allImages.map((imgUrl, idx) => (
                      <button
                        key={idx}
                        onClick={() => setCurrentImageIdx(idx)}
                        className={cn(
                          "relative w-16 h-16 sm:w-20 sm:h-20 rounded-2xl border-2 flex-shrink-0 overflow-hidden bg-white transition-all shadow-sm",
                          currentImageIdx === idx ? "border-brand-600 shadow-brand-600/20 scale-105 opacity-100" : "border-slate-200 opacity-60 hover:opacity-100 hover:border-slate-300"
                        )}
                      >
                        <Image src={imgUrl} alt={`${product.name} - Vista ${idx + 1}`} fill className="object-contain p-1" unoptimized />
                      </button>
                    ))}
                  </div>
                )}
              </div>
              
              {/* Badges */}
              <div className="absolute top-8 left-8 flex flex-col gap-2">
                {product.is_on_sale && (
                  <span className="bg-red-600 text-white text-[10px] font-black px-3 py-1.5 rounded-xl uppercase tracking-widest animate-pulse">
                    OFERTA ESPECIAL
                  </span>
                )}
                {product.is_featured && (
                  <span className="bg-emerald-600 text-white text-[10px] font-black px-3 py-1.5 rounded-xl uppercase tracking-widest shadow-lg">
                    DESTACADO
                  </span>
                )}
              </div>
            </div>

            {/* Detalles del Producto */}
            <div className="w-full md:w-3/5 p-8 md:p-12 overflow-y-auto scrollbar-hide">
              <div className="h-full flex flex-col">
                <div className="mb-8">
                  {product.brand && (
                    <span className="text-xs font-black text-brand-600 uppercase tracking-[0.2em] mb-3 block">
                      {product.brand}
                    </span>
                  )}
                  <h2 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tighter mb-4 leading-tight">
                    {product.name}
                  </h2>
                  <div className="flex items-center gap-4 mb-6">
                    <span className="text-4xl font-black text-slate-900">
                      {formatPrice(product.price)}
                    </span>
                    {product.is_on_sale && (
                      <span className="text-xl text-slate-400 line-through decoration-red-500/50">
                        {formatPrice(product.price * 1.2)}
                      </span>
                    )}
                  </div>
                </div>

                <div className="space-y-6 mb-10 text-slate-600 font-medium leading-relaxed text-sm md:text-base">
                  <div 
                    dangerouslySetInnerHTML={{ __html: formatDescription(product.description || "") }} 
                  />
                </div>

                {/* Sección Upsell - Marketinero */}
                {upsellProducts.length > 0 && (
                  <div className="mb-10 p-6 bg-brand-50/50 rounded-[2rem] border border-brand-100/50 border-dashed">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="w-10 h-10 rounded-xl bg-brand-600 flex items-center justify-center text-white shadow-lg shadow-brand-600/20">
                        <ShoppingCart className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest leading-none mb-1">¡El Combo Perfecto!</h4>
                        <p className="text-[10px] text-brand-600 font-bold uppercase tracking-wider">Los que compraron este producto también agregaron:</p>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {upsellProducts.map(up => (
                        <div key={up.id} className="bg-white p-3 rounded-2xl border border-slate-100 flex items-center gap-3 group/item">
                          <div className="w-14 h-14 bg-slate-50 rounded-xl flex-shrink-0 relative p-1">
                            <Image src={up.image_url} alt={up.name} fill className="object-contain p-1" unoptimized />
                          </div>
                          <div className="flex-grow min-w-0">
                            <p className="text-[10px] font-bold text-slate-800 truncate mb-0.5">{up.name}</p>
                            <p className="text-xs font-black text-brand-600">{formatPrice(up.price)}</p>
                          </div>
                          <button 
                            onClick={() => handleAddUpsell(up)}
                            className="p-2 rounded-lg bg-brand-50 text-brand-600 hover:bg-brand-600 hover:text-white transition-all shadow-sm"
                            title="Agregar al carrito"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-auto pt-8 border-t border-slate-100">
                  <Button 
                    onClick={handleAddToCart}
                    size="lg" 
                    className="w-full rounded-2xl h-16 text-lg font-black group shadow-xl shadow-brand-600/20"
                  >
                    Agregar al carrito 
                    <ShoppingCart className="ml-3 w-6 h-6 group-hover:scale-110 transition-transform" />
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

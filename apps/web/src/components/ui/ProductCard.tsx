"use client";

import React from "react";
import Image from "next/image";
import { Product } from "@/types";
import { useCartStore } from "@/store/useCartStore";
import { Button } from "./Button";
import { ShoppingCart, Plus, Star } from "lucide-react";
import { cn, formatPrice } from "@/lib/utils";
import { trackEvent } from "@/lib/analytics";

interface ProductCardProps {
  product: Product;
  onOpenModal?: (product: Product) => void;
}

export function ProductCard({ product, onOpenModal }: ProductCardProps) {
  const addItem = useCartStore((state) => state.addItem);
  const setCartOpen = useCartStore((state) => state.setCartOpen);

  const handleAdd = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    addItem(product);
    setCartOpen(true);
    trackEvent("AddToCart", {
      content_name: product.name,
      content_category: product.category,
      content_ids: [product.id],
      value: product.price,
      currency: "ARS",
    });
  };

  const handleCardClick = () => {
    if (onOpenModal) {
      onOpenModal(product);
    }
  };

  return (
    <div 
      onClick={handleCardClick}
      className={cn(
        "product-card flex flex-col h-full group bg-white rounded-3xl border border-slate-100 hover:border-brand-200 transition-all duration-300 cursor-pointer hover:shadow-xl hover:shadow-brand-600/5",
        "relative"
      )}
    >
      {/* Container de Imagen - Mas compacto */}
      <div className="relative aspect-square w-full bg-white flex items-center justify-center p-4 overflow-hidden rounded-t-3xl">
        <div className="absolute top-3 left-3 flex flex-col gap-1.5 z-10">
          {product.dimensions && (
            <span className="bg-brand-600/90 text-white text-[9px] font-black px-2 py-1 rounded-lg uppercase tracking-widest shadow-lg">
              {product.dimensions}
            </span>
          )}
        </div>

        <div className="absolute top-3 right-3 flex flex-col items-end gap-1.5 z-10">
          {product.is_featured && (
            <div className="bg-amber-400 text-white p-1 rounded-lg shadow-lg shadow-amber-500/30">
              <Star className="w-3.5 h-3.5 fill-current" />
            </div>
          )}
          {product.is_on_sale && (
            <span className="bg-red-600 text-white text-[9px] font-black px-2 py-1 rounded-lg uppercase tracking-widest animate-pulse shadow-lg">
              OFF
            </span>
          )}
        </div>

        <div className="relative w-full h-full transition-transform duration-500 group-hover:scale-105">
          <Image
            src={product.image_url && product.image_url.trim() !== "" ? product.image_url : "https://placehold.co/600x600?text=Procesando"}
            alt={product.name}
            fill
            className="object-contain p-2"
            sizes="(max-width: 768px) 100vw, 300px"
            unoptimized
          />
        </div>
      </div>

      {/* Info Content - Mas compacto */}
      <div className="p-4 flex flex-col flex-grow">
        {product.brand && (
          <span className="text-[9px] font-black text-brand-600 uppercase tracking-widest mb-1 opacity-70">
            {product.brand}
          </span>
        )}
        <h3 className="text-sm font-bold text-slate-900 mb-1 line-clamp-2 min-h-[2.5rem] leading-tight group-hover:text-brand-600 transition-colors">
          {product.name}
        </h3>
        
        {/* Descripción corta opcional */}
        {product.description && (
          <p className="text-[10px] text-slate-500 font-medium leading-relaxed mb-4 line-clamp-2">
            {product.description.replace(/\*\*|\*/g, '')}
          </p>
        )}
        
        <div className="mt-auto pt-3 flex items-center justify-between gap-3 border-t border-slate-50">
          <div className="flex flex-col">
            <span className="text-lg font-black text-slate-900 leading-none">
              {formatPrice(product.price)}
            </span>
            {product.is_on_sale && (
              <span className="text-[10px] text-slate-400 line-through mt-0.5">
                {formatPrice(product.price * 1.2)}
              </span>
            )}
          </div>
          <button
            onClick={handleAdd}
            className="p-2 transition-all duration-300 rounded-xl bg-brand-50 text-brand-600 hover:bg-brand-600 hover:text-white shadow-sm"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import React from "react";
import Image from "next/image";
import { Product } from "@/types";
import { useCartStore } from "@/store/useCartStore";
import { Button } from "./Button";
import { ShoppingCart, Plus } from "lucide-react";
import { cn, formatPrice } from "@/lib/utils";
import { trackEvent } from "@/lib/analytics";

interface ProductCardProps {
  product: Product;
}

export function ProductCard({ product }: ProductCardProps) {
  const addItem = useCartStore((state) => state.addItem);
  const setCartOpen = useCartStore((state) => state.setCartOpen);

  const handleAdd = (e: React.MouseEvent) => {
    e.preventDefault();
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

  return (
    <div className="product-card flex flex-col h-full group bg-white rounded-3xl border border-slate-100 hover:border-brand-200 transition-all duration-300">
      {/* Container de Imagen - Mas compacto */}
      <div className="relative aspect-square w-full bg-white flex items-center justify-center p-4 overflow-hidden rounded-t-3xl">
        <div className="absolute top-3 left-3 flex flex-col gap-1.5 z-10">
          {product.dimensions && (
            <span className="bg-brand-600/90 text-white text-[9px] font-black px-2 py-1 rounded-lg uppercase tracking-widest shadow-lg">
              {product.dimensions}
            </span>
          )}
        </div>

        {product.is_on_sale && (
          <div className="absolute top-3 right-3 z-10">
            <span className="bg-red-600 text-white text-[9px] font-black px-2 py-1 rounded-lg uppercase tracking-widest animate-pulse">
              OFF
            </span>
          </div>
        )}

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
        <h3 className="text-sm font-bold text-slate-900 mb-1.5 line-clamp-2 min-h-[2.5rem] leading-tight group-hover:text-brand-600 transition-colors">
          {product.name}
        </h3>
        
        <div className="mt-auto pt-3 flex items-center justify-between gap-3 border-t border-slate-50">
          <span className="text-lg font-black text-slate-900">
            {formatPrice(product.price)}
          </span>
          <button
            onClick={handleAdd}
            className="p-2 transition-all duration-300 rounded-xl bg-brand-50 text-brand-600 hover:bg-brand-600 hover:text-white"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

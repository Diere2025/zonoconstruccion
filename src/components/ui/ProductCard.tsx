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
    <div className="product-card flex flex-col h-full group">
      {/* Container de Imagen */}
      <div className="relative aspect-square w-full bg-white flex items-center justify-center p-8 overflow-hidden">
        <span className="absolute top-4 left-4 bg-slate-100 text-slate-600 text-[10px] font-bold px-2 py-1 rounded-full border border-slate-200 z-10 uppercase tracking-widest">
          {product.category}
        </span>
        <div className="relative w-full h-full transition-transform duration-500 group-hover:scale-110">
          <Image
            src={product.image_url && product.image_url.trim() !== "" ? product.image_url : "https://placehold.co/600x600?text=Procesando+Imagen"}
            alt={product.name}
            fill
            className="object-contain"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            unoptimized
          />
        </div>
      </div>

      {/* Info Content */}
      <div className="p-6 flex flex-col flex-grow">
        <h3 className="text-lg font-bold text-slate-900 mb-2 line-clamp-2 min-h-[3.5rem] group-hover:text-brand-600 transition-colors">
          {product.name}
        </h3>
        <p className="text-sm text-slate-500 mb-6 line-clamp-2 flex-grow">
          {product.description}
        </p>

        <div className="mt-auto space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-2xl font-black text-slate-900">
              {formatPrice(product.price)}
            </span>
          </div>

          <Button
            onClick={handleAdd}
            variant="outline"
            className="w-full gap-2 border-brand-200 text-brand-700 hover:bg-brand-600 hover:text-white hover:border-brand-600 transition-all duration-300"
          >
            <Plus className="w-4 h-4" />
            <span>Agregar al Carrito</span>
          </Button>
        </div>
      </div>
    </div>
  );
}

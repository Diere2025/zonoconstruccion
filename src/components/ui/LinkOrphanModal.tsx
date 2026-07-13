"use client";

import React, { useState, useEffect } from "react";
import { Product } from "@/types";
import { supabase } from "@/lib/supabase";
import { Button } from "./Button";
import { X, Search, CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface LinkOrphanModalProps {
  orphanName: string;
  skuCandidate: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  allProducts: Product[];
}

export function LinkOrphanModal({ 
  orphanName, 
  skuCandidate, 
  isOpen, 
  onClose, 
  onSuccess, 
  allProducts 
}: LinkOrphanModalProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [linking, setLinking] = useState(false);
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [recommendedProduct, setRecommendedProduct] = useState<Product | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    
    // Set initial search term to the candidate SKU or the orphan name
    setSearchTerm(skuCandidate || orphanName);
    
    // Find a recommended match based on candidate SKU or name (ignoring SKU suffixes in names)
    const cleanOrphanName = orphanName.replace(/\s*\([^)]+\)\s*$/, '').trim();
    const match = allProducts.find(p => 
      (skuCandidate && p.sku?.toLowerCase() === skuCandidate.toLowerCase()) ||
      p.sku?.toLowerCase() === orphanName.toLowerCase() ||
      p.name?.toLowerCase() === orphanName.toLowerCase() ||
      p.name?.toLowerCase() === cleanOrphanName.toLowerCase()
    );
    setRecommendedProduct(match || null);
  }, [isOpen, orphanName, skuCandidate, allProducts]);

  useEffect(() => {
    if (!searchTerm.trim()) {
      setSearchResults([]);
      return;
    }
    
    const terms = searchTerm.toLowerCase().split(/\s+/).filter(Boolean);
    const results = allProducts.filter(p => {
      const searchableText = `${p.name} ${p.sku || ""} ${p.brand || ""} ${p.category || ""}`.toLowerCase();
      return terms.every(term => searchableText.includes(term));
    }).slice(0, 10); // Limit to 10 results for performance
    
    setSearchResults(results);
  }, [searchTerm, allProducts]);

  const handleLink = async (productId: string, productSku: string) => {
    if (!confirm(`¿Estás seguro de asociar todos los ítems de pedido llamados "${orphanName}" al producto con SKU "${productSku}"?`)) {
      return;
    }
    
    setLinking(true);
    try {
      // Update all order_items where product_name is orphanName AND product_id IS NULL
      const { error } = await supabase
        .from("order_items")
        .update({ product_id: productId })
        .eq("product_name", orphanName)
        .is("product_id", null);

      if (error) throw error;
      
      alert(`¡Vinculación exitosa! Todos los ítems "${orphanName}" han sido asociados al producto "${productSku}".`);
      onSuccess();
      onClose();
    } catch (err: any) {
      console.warn("Error linking orphan product:", err);
      alert("Error al vincular: " + err.message);
    } finally {
      setLinking(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-md z-[200] flex items-center justify-center p-6 overflow-y-auto">
      <div className="bg-white rounded-[3rem] w-full max-w-xl shadow-3xl border border-white/20 my-auto scale-in-center overflow-hidden">
        {/* Header */}
        <div className="p-8 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
          <div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tighter">Asociar a Producto Existente</h2>
            <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-widest mt-1">Vincular ítems sin código del catálogo</p>
          </div>
          <button onClick={onClose} className="p-3 hover:bg-white rounded-2xl transition-all shadow-sm">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>
        
        {/* Content */}
        <div className="p-8 space-y-6">
          {/* Orphan Info */}
          <div className="p-5 bg-amber-50/60 rounded-3xl border border-amber-100/50 space-y-2">
            <span className="text-[9px] font-black uppercase tracking-wider text-amber-700 block">Nombre original en pedidos:</span>
            <p className="text-sm font-extrabold text-slate-800">{orphanName}</p>
            {skuCandidate && (
              <p className="text-xs font-semibold text-slate-500">
                SKU sugerido en pedido: <span className="bg-white px-2 py-0.5 rounded border border-slate-200 uppercase font-bold text-slate-700">{skuCandidate}</span>
              </p>
            )}
          </div>

          {/* Recommended Match if any */}
          {recommendedProduct && (
            <div className="p-5 bg-brand-50/60 rounded-3xl border border-brand-100/50 flex items-start gap-4 shadow-sm animate-pulse-slow">
              <div className="p-3 bg-brand-600 rounded-2xl text-white">
                <Sparkles className="w-5 h-5" />
              </div>
              <div className="flex-1 space-y-1">
                <span className="text-[9px] font-black uppercase tracking-wider text-brand-700 block">Coincidencia automática sugerida:</span>
                <p className="text-xs font-black text-slate-800">{recommendedProduct.name}</p>
                <div className="flex items-center gap-2">
                  <span className="bg-white text-brand-700 border border-brand-100 text-[9px] font-black px-1.5 py-0.25 rounded uppercase tracking-wider">
                    SKU: {recommendedProduct.sku}
                  </span>
                  <span className="text-[10px] text-slate-400 font-medium">ARS {recommendedProduct.price?.toLocaleString('es-AR')}</span>
                </div>
                <Button 
                  onClick={() => handleLink(recommendedProduct.id, recommendedProduct.sku || "")}
                  disabled={linking}
                  className="mt-3 w-full sm:w-auto px-4 py-2 text-xs font-black uppercase tracking-wider bg-brand-600 text-white rounded-xl shadow-lg shadow-brand-600/10"
                >
                  {linking ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : null}
                  Vincular a esta coincidencia
                </Button>
              </div>
            </div>
          )}

          {/* Search bar */}
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Buscar en el Catálogo de Productos</label>
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input 
                type="text" 
                placeholder="Buscar por SKU, nombre, marca..." 
                className="w-full pl-11 pr-5 py-4 rounded-2xl border border-slate-200 focus:outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all font-bold text-xs bg-slate-50"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          {/* Search Results List */}
          <div className="space-y-3">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block">Resultados de búsqueda ({searchResults.length})</span>
            <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 border border-slate-100 rounded-3xl shadow-inner bg-slate-50/50 p-2 space-y-1">
              {searchResults.length === 0 ? (
                <div className="p-8 text-center text-slate-400 font-bold text-xs">
                  {searchTerm.trim() ? "No se encontraron productos coincidentes" : "Ingresá un término de búsqueda"}
                </div>
              ) : (
                searchResults.map(p => (
                  <div key={p.id} className="p-3 hover:bg-white rounded-2xl transition-all flex items-center justify-between group bg-white/40 mb-1 border border-transparent hover:border-slate-100 hover:shadow-sm">
                    <div className="space-y-1 pr-4 min-w-0 flex-1">
                      <p className="text-[11px] font-bold text-slate-800 truncate" title={p.name}>{p.name}</p>
                      <div className="flex flex-wrap gap-2 items-center">
                        <span className="bg-slate-100 text-slate-700 text-[8px] font-black px-1.5 py-0.25 rounded uppercase tracking-wider">
                          {p.sku}
                        </span>
                        {p.brand && (
                          <span className="text-[8px] font-bold text-slate-400">{p.brand}</span>
                        )}
                        <span className="text-[9px] font-black text-brand-600">
                          ARS {p.price?.toLocaleString('es-AR')}
                        </span>
                      </div>
                    </div>
                    <Button
                      onClick={() => handleLink(p.id, p.sku || "")}
                      disabled={linking}
                      variant="ghost"
                      className="px-3 py-1.5 h-auto text-[9px] font-black uppercase tracking-wider border border-slate-200 hover:bg-brand-600 hover:text-white rounded-xl"
                    >
                      Asociar
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-50 bg-slate-50/50 flex justify-end gap-3">
          <Button 
            variant="ghost" 
            onClick={onClose} 
            disabled={linking}
            className="rounded-2xl px-6 font-bold"
          >
            Cancelar
          </Button>
        </div>
      </div>
    </div>
  );
}

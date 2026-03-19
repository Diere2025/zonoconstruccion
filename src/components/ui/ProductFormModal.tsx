"use client";

import React, { useState, useEffect } from "react";
import { Product } from "@/types";
import { supabase } from "@/lib/supabase";
import { Button } from "./Button";
import { X, Search, CheckCircle2, Plus, Image as ImageIcon, Loader2 } from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/utils";

interface ProductFormModalProps {
  product: Partial<Product> | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  allProducts: Product[];
}

export function ProductFormModal({ product, isOpen, onClose, onSuccess, allProducts }: ProductFormModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  
  const [formData, setFormData] = useState({
    sku: "",
    name: "",
    description: "",
    price: 0,
    category: "Hogar",
    image_url: "",
    brand: "",
    dimensions: "",
    is_featured: false,
    is_on_sale: false,
    upsell_ids: [] as string[]
  });

  const [priceInput, setPriceInput] = useState("");
  const [categorySearch, setCategorySearch] = useState("");
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [upsellSearch, setUpsellSearch] = useState("");
  const [upsellSearchResults, setUpsellSearchResults] = useState<Product[]>([]);

  useEffect(() => {
    if (product) {
      setFormData({
        sku: product.sku || "",
        name: product.name || "",
        description: product.description || "",
        price: product.price || 0,
        category: product.category || "Hogar",
        image_url: product.image_url || "",
        brand: product.brand || "",
        dimensions: product.dimensions || "",
        is_featured: product.is_featured || false,
        is_on_sale: product.is_on_sale || false,
        upsell_ids: product.upsell_ids || []
      });
      setPriceInput(product.price ? product.price.toLocaleString('es-AR', { minimumFractionDigits: 0 }) : "");
    } else {
      setFormData({
        sku: "",
        name: "",
        description: "",
        price: 0,
        category: "Hogar",
        image_url: "",
        brand: "",
        dimensions: "",
        is_featured: false,
        is_on_sale: false,
        upsell_ids: []
      });
      setPriceInput("");
    }
    setSelectedFile(null);
  }, [product, isOpen]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) setSelectedFile(e.target.files[0]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    const finalPriceVal = parseFloat(priceInput.replace(/\./g, "").replace(",", "."));
    let finalImageUrl = formData.image_url;

    if (selectedFile) {
      setUploading(true);
      const fileExt = selectedFile.name.split('.').pop();
      const filePath = `products/${Math.random()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from('product-images').upload(filePath, selectedFile);
      if (!uploadError) {
        const { data: publicUrlData } = supabase.storage.from('product-images').getPublicUrl(filePath);
        finalImageUrl = publicUrlData.publicUrl;
      }
      setUploading(false);
    }

    const payload = { 
      ...formData, 
      price: isNaN(finalPriceVal) ? 0 : finalPriceVal, 
      image_url: finalImageUrl 
    };

    if (product?.id) {
      const { error } = await supabase.from('products').update(payload).eq('id', product.id);
      if (!error) { 
        onSuccess(); 
        onClose();
      } else { 
        console.error("Update error:", error); 
        alert("Error al actualizar: " + error.message); 
      }
    } else {
      const { error } = await supabase.from('products').insert([payload]);
      if (!error) { 
        onSuccess(); 
        onClose();
      } else { 
        console.error("Insert error:", error); 
        alert("Error al crear: " + error.message); 
      }
    }
    setSubmitting(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-md z-[200] flex items-center justify-center p-6 overflow-y-auto">
      <div className="bg-white rounded-[3rem] w-full max-w-2xl shadow-3xl border border-white/20 my-auto scale-in-center">
        <div className="p-10 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
          <h2 className="text-3xl font-black text-slate-900 tracking-tighter">{product?.id ? 'Editar Producto' : 'Nuevo Producto'}</h2>
          <button onClick={onClose} className="p-3 hover:bg-white rounded-2xl transition-all shadow-sm">
            <X className="w-6 h-6 text-slate-400" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-10 grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* 1. IMAGEN PRIMERO */}
          <div className="md:col-span-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block">Imagen</label>
            <div className="flex items-center gap-6 p-4 bg-slate-50 rounded-3xl border border-slate-100">
              <div className="w-24 h-24 rounded-2xl bg-white border border-slate-200 flex items-center justify-center overflow-hidden shadow-inner">
                {(selectedFile || formData.image_url) ? (
                  <img src={selectedFile ? URL.createObjectURL(selectedFile) : formData.image_url} className="w-full h-full object-cover" />
                ) : (
                  <ImageIcon className="w-8 h-8 opacity-20" />
                )}
              </div>
              <div className="flex-1">
                <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" id="image-upload-modal" />
                <label htmlFor="image-upload-modal" className="inline-flex items-center px-6 py-3 bg-white border-2 border-slate-100 rounded-xl text-xs font-black text-slate-700 hover:border-brand-600 hover:text-brand-600 cursor-pointer transition-all uppercase tracking-widest shadow-sm">
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                  Cambiar Imagen
                </label>
                <p className="text-[9px] text-slate-400 mt-2 font-medium">PNG, JPG o WebP. Se recomienda fondo blanco.</p>
              </div>
            </div>
          </div>

          {/* 2. DESTACADO Y LIQUIDACIÓN */}
          <div className="flex items-center gap-8 py-6 px-8 bg-slate-50 rounded-[1.5rem] border border-slate-100 md:col-span-2 shadow-inner">
            <label className="flex items-center gap-3 cursor-pointer group">
              <input type="checkbox" className="w-6 h-6 rounded-lg border-2 border-slate-300 text-brand-600 focus:ring-brand-500/20 cursor-pointer transition-all checked:border-brand-600" checked={formData.is_featured} onChange={e => setFormData({...formData, is_featured: e.target.checked})} />
              <span className="text-sm font-black text-slate-600 uppercase tracking-widest group-hover:text-slate-900 transition-colors">Destacado</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer group">
              <input type="checkbox" className="w-6 h-6 rounded-lg border-2 border-slate-300 text-red-600 focus:ring-red-500/20 cursor-pointer transition-all checked:border-red-600" checked={formData.is_on_sale} onChange={e => setFormData({...formData, is_on_sale: e.target.checked})} />
              <span className="text-sm font-black text-slate-600 uppercase tracking-widest group-hover:text-slate-900 transition-colors">Liquidación</span>
            </label>
          </div>

          {/* 3. SKU Y CATEGORÍA */}
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Nombre Interno (SKU)</label>
            <input 
              required 
              placeholder="Ej: TANQUE-300L-P" 
              className="w-full px-5 py-4 rounded-2xl border border-slate-100 focus:ring-4 focus:ring-brand-500/10 bg-slate-50 font-bold" 
              value={formData.sku} 
              onChange={e => setFormData({...formData, sku: e.target.value.toUpperCase()})} 
            />
          </div>
          
          <div className="space-y-2 relative">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Categoría</label>
            <div className="relative group">
              <input 
                required 
                placeholder="Escribí o buscá..." 
                className="w-full px-5 py-4 rounded-2xl border border-slate-100 focus:ring-4 focus:ring-brand-500/10 bg-slate-50 font-bold" 
                value={formData.category} 
                onChange={e => {
                  setFormData({...formData, category: e.target.value});
                  setCategorySearch(e.target.value);
                  setShowCategoryDropdown(true);
                }}
                onFocus={() => setShowCategoryDropdown(true)}
              />
              <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300">
                <Search className="w-5 h-5" />
              </div>
            </div>
            
            {showCategoryDropdown && (
              <div className="absolute top-full left-0 right-0 z-[110] mt-2 bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden max-h-48 overflow-y-auto divide-y divide-slate-50 scrollbar-hide">
                {Array.from(new Set(allProducts.map(p => p.category)))
                  .sort()
                  .filter(cat => cat.toLowerCase().includes(categorySearch.toLowerCase()))
                  .map(cat => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => {
                        setFormData({...formData, category: cat});
                        setShowCategoryDropdown(false);
                      }}
                      className="w-full px-5 py-3 text-left text-xs font-bold text-slate-700 hover:bg-brand-50 hover:text-brand-600 transition-colors flex items-center justify-between"
                    >
                      {cat}
                      {formData.category === cat && <CheckCircle2 className="w-4 h-4 text-brand-500" />}
                    </button>
                  ))}
              </div>
            )}
            {showCategoryDropdown && (
              <div className="fixed inset-0 z-[105]" onClick={() => setShowCategoryDropdown(false)} />
            )}
          </div>

          <div className="space-y-2 md:col-span-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Nombre Público</label>
            <input 
              required 
              className="w-full px-5 py-4 rounded-2xl border border-slate-100 focus:ring-4 focus:ring-brand-500/10 bg-slate-50 font-bold" 
              value={formData.name} 
              onChange={e => setFormData({...formData, name: e.target.value})} 
            />
          </div>

          {/* 4. PRECIO Y MARCA ANTES DE DESCRIPCIÓN */}
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Precio (ARS)</label>
            <input 
              type="text" 
              required 
              placeholder="Ej: 274.900,00" 
              className="w-full px-5 py-4 rounded-2xl border border-slate-100 focus:ring-4 focus:ring-brand-500/10 bg-slate-50 font-black text-brand-600" 
              value={priceInput} 
              onChange={e => setPriceInput(e.target.value)} 
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Marca</label>
            <input 
              placeholder="Ej: Aquafort" 
              className="w-full px-5 py-4 rounded-2xl border border-slate-100 focus:ring-4 focus:ring-brand-500/10 bg-slate-50 font-bold" 
              value={formData.brand} 
              onChange={e => setFormData({...formData, brand: e.target.value})} 
            />
          </div>

          {/* 5. DESCRIPCIÓN */}
          <div className="space-y-2 md:col-span-2">
            <div className="flex items-center justify-between mb-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Descripción</label>
              <div className="flex gap-1">
                {[
                  { label: "B", title: "Negrita", prefix: "**", suffix: "**" },
                  { label: "I", title: "Itálica", prefix: "*", suffix: "*", className: "italic" },
                  { label: "• List", title: "Lista", prefix: "\n- ", suffix: "" },
                ].map((tool) => (
                  <button
                    key={tool.title}
                    type="button"
                    onClick={() => {
                      const textarea = document.getElementById('product-desc-modal') as HTMLTextAreaElement;
                      const start = textarea.selectionStart;
                      const end = textarea.selectionEnd;
                      const text = textarea.value;
                      const selected = text.substring(start, end);
                      const newText = text.substring(0, start) + tool.prefix + selected + tool.suffix + text.substring(end);
                      setFormData({...formData, description: newText});
                    }}
                    className={cn("px-2 py-1 text-[9px] font-black bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors", tool.className)}
                    title={tool.title}
                  >
                    {tool.label}
                  </button>
                ))}
              </div>
            </div>
            <textarea 
              id="product-desc-modal"
              className="w-full px-5 py-4 rounded-2xl border border-slate-100 focus:ring-4 focus:ring-brand-500/10 bg-slate-50 font-medium h-48 leading-relaxed resize-none" 
              value={formData.description} 
              onChange={e => setFormData({...formData, description: e.target.value})} 
              placeholder="Insertar detalles técnicos, ventajas o notas..."
            />
          </div>

          {/* 6. UPSELLS */}
          <div className="md:col-span-2 p-6 bg-white rounded-[2rem] border border-slate-100 shadow-sm">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4 block">🔥 Upsell / Productos Vinculados</label>
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input 
                  type="text" 
                  placeholder="Buscar para vincular..." 
                  className="w-full pl-9 pr-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold"
                  value={upsellSearch}
                  onChange={(e) => {
                    const term = e.target.value;
                    setUpsellSearch(term);
                    if (term.length > 2) {
                      const results = allProducts.filter(p => 
                        (p.name.toLowerCase().includes(term.toLowerCase()) || 
                         p.category.toLowerCase().includes(term.toLowerCase())) && 
                        p.id !== product?.id && 
                        !(formData.upsell_ids || []).includes(p.id)
                      ).slice(0, 5);
                      setUpsellSearchResults(results);
                    } else {
                      setUpsellSearchResults([]);
                    }
                  }}
                />
                
                {upsellSearchResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-xl border border-slate-100 z-50 overflow-hidden divide-y divide-slate-50">
                    {upsellSearchResults.map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setFormData({...formData, upsell_ids: [...(formData.upsell_ids || []), p.id]});
                          setUpsellSearch("");
                          setUpsellSearchResults([]);
                        }}
                        className="w-full px-4 py-3 text-left hover:bg-brand-50 flex items-center justify-between group"
                      >
                        <span className="text-[10px] font-bold text-slate-700">{p.name}</span>
                        <Plus className="w-3.5 h-3.5 text-slate-300 group-hover:text-brand-600" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {(formData.upsell_ids || []).map(id => {
                  const p = allProducts.find(prod => prod.id === id);
                  if (!p) return null;
                  return (
                    <div key={id} className="flex items-center gap-2 bg-brand-600 text-white px-3 py-1.5 rounded-xl">
                      <span className="text-[9px] font-black truncate max-w-[150px]">{p.name}</span>
                      <button 
                        type="button" 
                        onClick={() => setFormData({...formData, upsell_ids: (formData.upsell_ids || []).filter(val => val !== id)})}
                        className="p-1 hover:bg-white/20 rounded-lg"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 7. BOTONES */}
          <div className="md:col-span-2 flex gap-4 mt-4">
            <Button type="submit" disabled={submitting || uploading} className="flex-1 rounded-2xl h-16 text-lg font-black shadow-2xl shadow-brand-600/20">
              {uploading ? <Loader2 className="animate-spin" /> : product?.id ? 'Guardar Cambios' : 'Crear Producto'}
            </Button>
            <Button type="button" variant="ghost" onClick={onClose} className="rounded-2xl h-16 font-bold">Cancelar</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

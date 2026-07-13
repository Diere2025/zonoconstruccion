"use client";

import React, { useState, useEffect } from "react";
import { Product } from "@/types";
import { supabase } from "@/lib/supabase";
import { Button } from "./Button";
import { X, Search, CheckCircle2, Plus, Image as ImageIcon, Loader2, Trash2 } from "lucide-react";
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
  const [galleryFiles, setGalleryFiles] = useState<File[]>([]);
  
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
    is_active: true,
    upsell_ids: [] as string[],
    settings: { gallery: [] as string[] },
    parent_id: null as string | null,
    variant_type: "estandar",
    production_type: "comprado" as "comprado" | "fabricado" | "ensamblado",
    is_insumo: false,
    insumo_use: "fabricacion" as "fabricacion" | "ensamblado" | "ensamblado_venta" | undefined,
    labor_cost: 0,
    overhead_cost: 0,
    cost_price: 0,
    is_generic: false,
    mapped_real_product_id: null as string | null
  });

  const [priceInput, setPriceInput] = useState("");
  const [categorySearch, setCategorySearch] = useState("");
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [upsellSearch, setUpsellSearch] = useState("");
  const [upsellSearchResults, setUpsellSearchResults] = useState<Product[]>([]);
  const [parentSearch, setParentSearch] = useState("");
  const [parentSearchResults, setParentSearchResults] = useState<Product[]>([]);

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
        is_active: product.is_active !== false, // Por defecto true, a menos que sea explícitamente false
        upsell_ids: product.upsell_ids || [],
        settings: product.settings || { gallery: [] },
        parent_id: product.parent_id || null,
        variant_type: product.variant_type || "estandar",
        production_type: product.production_type || "comprado",
        is_insumo: product.is_insumo || false,
        insumo_use: product.insumo_use || "fabricacion",
        labor_cost: product.labor_cost || 0,
        overhead_cost: product.overhead_cost || 0,
        cost_price: product.cost_price || 0,
        is_generic: product.is_generic || false,
        mapped_real_product_id: product.mapped_real_product_id || null
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
        is_active: true,
        upsell_ids: [],
        settings: { gallery: [] },
        parent_id: null,
        variant_type: "estandar",
        production_type: "comprado",
        is_insumo: false,
        insumo_use: "fabricacion",
        labor_cost: 0,
        overhead_cost: 0,
        cost_price: 0,
        is_generic: false,
        mapped_real_product_id: null
      });
      setPriceInput("");
    }
    setSelectedFile(null);
    setParentSearch("");
    setParentSearchResults([]);
  }, [product, isOpen]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) setSelectedFile(e.target.files[0]);
  };

  const handleGalleryFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setGalleryFiles(prev => [...prev, ...newFiles]);
    }
  };

  const removeGalleryUrl = (url: string) => {
    setFormData(prev => ({
      ...prev,
      settings: {
        ...prev.settings,
        gallery: (prev.settings?.gallery || []).filter((u: string) => u !== url)
      }
    }));
  };

  const removeGalleryFile = (index: number) => {
    setGalleryFiles(prev => prev.filter((_, i) => i !== index));
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

    const newGalleryUrls: string[] = [];
    if (galleryFiles.length > 0) {
      setUploading(true);
      for (const file of galleryFiles) {
        const fileExt = file.name.split('.').pop();
        const filePath = `products/gallery/${Math.random()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage.from('product-images').upload(filePath, file);
        if (!uploadError) {
          const { data: publicUrlData } = supabase.storage.from('product-images').getPublicUrl(filePath);
          newGalleryUrls.push(publicUrlData.publicUrl);
        }
      }
      setUploading(false);
    }

    const payload = { 
      ...formData, 
      price: isNaN(finalPriceVal) ? 0 : finalPriceVal, 
      image_url: finalImageUrl,
      settings: {
        ...formData.settings,
        gallery: [...(formData.settings?.gallery || []), ...newGalleryUrls]
      }
    };

    if (product?.id) {
      const { error } = await supabase.from('products').update(payload).eq('id', product.id);
      if (!error) { 
        onSuccess(); 
        onClose();
      } else { 
        console.warn("Update error:", error); 
        alert("Error al actualizar: " + error.message); 
      }
    } else {
      const { error } = await supabase.from('products').insert([payload]);
      if (!error) { 
        onSuccess(); 
        onClose();
      } else { 
        console.warn("Insert error:", error); 
        if (error.message.includes("unique constraint") || error.code === "23505") {
          alert("Error: Ya existe un producto con el mismo SKU en el catálogo. Si estás resolviendo un huérfano, vinculalo al producto existente o utilizá un SKU diferente.");
        } else {
          alert("Error al crear: " + error.message);
        }
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
          <div className="md:col-span-2 space-y-4">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block">Imágenes</label>
            
            {/* Imagen Principal */}
            <div className="flex items-center gap-6 p-4 bg-slate-50 rounded-3xl border border-slate-100">
              <div className="w-24 h-24 rounded-2xl bg-white border border-slate-200 flex items-center justify-center overflow-hidden shadow-inner flex-shrink-0 relative group">
                {(selectedFile || formData.image_url) ? (
                  <img src={selectedFile ? URL.createObjectURL(selectedFile) : formData.image_url} className="w-full h-full object-contain p-2" />
                ) : (
                  <ImageIcon className="w-8 h-8 opacity-20" />
                )}
                <div className="absolute top-1 left-1 bg-brand-600 text-white text-[8px] font-black px-2 py-0.5 rounded shadow-sm">PRINCIPAL</div>
              </div>
              <div className="flex-1">
                <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" id="image-upload-main" />
                <label htmlFor="image-upload-main" className="inline-flex items-center px-6 py-3 bg-white border-2 border-slate-100 rounded-xl text-xs font-black text-slate-700 hover:border-brand-600 hover:text-brand-600 cursor-pointer transition-all uppercase tracking-widest shadow-sm">
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                  Elegir Principal
                </label>
                <p className="text-[9px] text-slate-400 mt-2 font-medium">PNG, JPG o WebP. Se recomienda fondo blanco.</p>
              </div>
            </div>

            {/* Galería Secundaria */}
            <div className="p-4 bg-slate-50 rounded-3xl border border-slate-100">
              <div className="flex flex-wrap gap-4 items-center">
                
                {/* URLs ya subidas */}
                {formData.settings?.gallery?.map((url: string, idx: number) => (
                  <div key={idx} className="w-20 h-20 rounded-xl bg-white border border-slate-200 flex items-center justify-center overflow-hidden shadow-inner relative group">
                    <img src={url} className="w-full h-full object-contain p-2" />
                    <button type="button" onClick={() => removeGalleryUrl(url)} className="absolute inset-0 bg-red-500/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Trash2 className="w-5 h-5 text-white" />
                    </button>
                  </div>
                ))}

                {/* Archivos pendientes de subir */}
                {galleryFiles.map((file, idx) => (
                  <div key={idx} className="w-20 h-20 rounded-xl bg-white border border-slate-200 flex items-center justify-center overflow-hidden shadow-inner relative group">
                    <img src={URL.createObjectURL(file)} className="w-full h-full object-contain p-2 opacity-70" />
                    <div className="absolute top-1 right-1 bg-amber-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded shadow-sm">NUEVO</div>
                    <button type="button" onClick={() => removeGalleryFile(idx)} className="absolute inset-0 bg-red-500/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Trash2 className="w-5 h-5 text-white" />
                    </button>
                  </div>
                ))}

                {/* Dropzone para sumar a la galería */}
                <input type="file" accept="image/*" multiple onChange={handleGalleryFileChange} className="hidden" id="image-upload-gallery" />
                <label htmlFor="image-upload-gallery" className="w-20 h-20 flex flex-col items-center justify-center bg-white border-2 border-dashed border-slate-200 rounded-xl text-slate-400 hover:border-brand-600 hover:text-brand-600 cursor-pointer transition-all shadow-sm">
                  <Plus className="w-6 h-6 mb-1" />
                  <span className="text-[8px] font-black uppercase tracking-widest">Añadir</span>
                </label>
              </div>
            </div>
          </div>

          {/* 2. DESTACADO, LIQUIDACIÓN Y VISIBILIDAD */}
          <div className="flex flex-wrap items-center gap-8 py-6 px-8 bg-slate-50 rounded-[1.5rem] border border-slate-100 md:col-span-2 shadow-inner">
            <label className="flex items-center gap-3 cursor-pointer group">
              <input type="checkbox" className="w-6 h-6 rounded-lg border-2 border-slate-300 text-brand-600 focus:ring-brand-500/20 cursor-pointer transition-all checked:border-brand-600" checked={formData.is_featured} onChange={e => setFormData({...formData, is_featured: e.target.checked})} />
              <span className="text-sm font-black text-slate-600 uppercase tracking-widest group-hover:text-slate-900 transition-colors">Destacado</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer group">
              <input type="checkbox" className="w-6 h-6 rounded-lg border-2 border-slate-300 text-red-600 focus:ring-red-500/20 cursor-pointer transition-all checked:border-red-600" checked={formData.is_on_sale} onChange={e => setFormData({...formData, is_on_sale: e.target.checked})} />
              <span className="text-sm font-black text-slate-600 uppercase tracking-widest group-hover:text-slate-900 transition-colors">Liquidación</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer group ml-auto">
              <input type="checkbox" className="w-6 h-6 rounded-lg border-2 border-slate-300 text-blue-600 focus:ring-blue-500/20 cursor-pointer transition-all checked:border-blue-600" checked={formData.is_active} onChange={e => setFormData({...formData, is_active: e.target.checked})} />
              <span className="text-sm font-black text-slate-600 uppercase tracking-widest group-hover:text-blue-600 transition-colors">Visible (Activo)</span>
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

          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Dimensiones</label>
            <input 
              placeholder="Ej: 0.80m x 1.20m" 
              className="w-full px-5 py-4 rounded-2xl border border-slate-100 focus:ring-4 focus:ring-brand-500/10 bg-slate-50 font-bold" 
              value={formData.dimensions} 
              onChange={e => setFormData({...formData, dimensions: e.target.value})} 
            />
          </div>

          {/* Configuración de Costos y Producción */}
          <div className="md:col-span-2 p-6 bg-slate-50 rounded-[2rem] border border-slate-100 shadow-inner space-y-6">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">🏭 Configuración de Costos y Producción</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Es Insumo / Materia Prima */}
              <div className="space-y-2">
                <label className="flex items-center gap-3 cursor-pointer group mt-2">
                  <input 
                    type="checkbox" 
                    className="w-6 h-6 rounded-lg border-2 border-slate-300 text-brand-600 focus:ring-brand-500/20 cursor-pointer transition-all checked:border-brand-600" 
                    checked={formData.is_insumo} 
                    onChange={e => setFormData({
                      ...formData, 
                      is_insumo: e.target.checked,
                      insumo_use: e.target.checked ? formData.insumo_use || 'fabricacion' : undefined
                    })} 
                  />
                  <span className="text-sm font-black text-slate-600 uppercase tracking-widest group-hover:text-slate-900 transition-colors">¿Es Insumo / Materia Prima?</span>
                </label>
              </div>

              {/* Uso del Insumo */}
              {formData.is_insumo && (
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Uso del Insumo</label>
                  <select
                    value={formData.insumo_use || 'fabricacion'}
                    onChange={e => setFormData({ ...formData, insumo_use: e.target.value as any })}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white font-bold text-xs outline-none cursor-pointer focus:ring-4 focus:ring-brand-500/10"
                  >
                    <option value="fabricacion">Únicamente para Fabricación</option>
                    <option value="ensamblado">Únicamente para Ensamblado</option>
                    <option value="ensamblado_venta">Ensamblado y también para Venta</option>
                  </select>
                </div>
              )}

              {/* Es Insumo Genérico / Ficticio */}
              {formData.is_insumo && (
                <div className="space-y-2">
                  <label className="flex items-center gap-3 cursor-pointer group mt-2">
                    <input 
                      type="checkbox" 
                      className="w-6 h-6 rounded-lg border-2 border-slate-300 text-brand-600 focus:ring-brand-500/20 cursor-pointer transition-all checked:border-brand-600" 
                      checked={formData.is_generic} 
                      onChange={e => setFormData({
                        ...formData, 
                        is_generic: e.target.checked,
                        mapped_real_product_id: e.target.checked ? formData.mapped_real_product_id : null
                      })} 
                    />
                    <span className="text-sm font-black text-slate-600 uppercase tracking-widest group-hover:text-slate-900 transition-colors">¿Es Insumo Genérico (Ficticio)?</span>
                  </label>
                </div>
              )}

              {/* Mapeo del Insumo Genérico */}
              {formData.is_insumo && formData.is_generic && (
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Insumo Real del Inventario Mapeado</label>
                  <select
                    value={formData.mapped_real_product_id || ""}
                    onChange={e => setFormData({ ...formData, mapped_real_product_id: e.target.value || null })}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white font-bold text-xs outline-none cursor-pointer focus:ring-4 focus:ring-brand-500/10"
                  >
                    <option value="">Seleccionar insumo real...</option>
                    {allProducts
                      .filter(p => p.id !== product?.id && p.is_insumo && !p.is_generic)
                      .map(p => (
                        <option key={p.id} value={p.id}>
                          {p.sku ? `[${p.sku}] ` : ''}{p.name}
                        </option>
                      ))}
                  </select>
                  <p className="text-[8px] text-slate-400 font-medium">Asociación central. Si cambia, afectará todas las recetas.</p>
                </div>
              )}

              {/* Tipo de Producción */}
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Origen / Tipo de Producción</label>
                <select
                  value={formData.production_type || 'comprado'}
                  onChange={e => setFormData({ ...formData, production_type: e.target.value as any })}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white font-bold text-xs outline-none cursor-pointer focus:ring-4 focus:ring-brand-500/10"
                >
                  <option value="comprado">Comprado (Proveedor)</option>
                  <option value="fabricado">Fabricado por nosotros</option>
                  <option value="ensamblado">Ensamblado (Combinado)</option>
                </select>
              </div>

              {/* Costos dependiendo del tipo de producción */}
              {formData.production_type === 'comprado' ? (
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Costo Base / Compra (ARS)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white font-bold text-xs focus:ring-4 focus:ring-brand-500/10 outline-none"
                    value={formData.cost_price || ''}
                    onChange={e => setFormData({ ...formData, cost_price: parseFloat(e.target.value) || 0 })}
                  />
                  <p className="text-[8px] text-slate-400 font-medium">Costo de adquisición directa.</p>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Costo de Mano de Obra (ARS)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white font-bold text-xs focus:ring-4 focus:ring-brand-500/10 outline-none"
                      value={formData.labor_cost || ''}
                      onChange={e => setFormData({ ...formData, labor_cost: parseFloat(e.target.value) || 0 })}
                    />
                    <p className="text-[8px] text-slate-400 font-medium">Costo de mano de obra directa para producir 1 unidad.</p>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Gastos Indirectos / Overhead (ARS)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white font-bold text-xs focus:ring-4 focus:ring-brand-500/10 outline-none"
                      value={formData.overhead_cost || ''}
                      onChange={e => setFormData({ ...formData, overhead_cost: parseFloat(e.target.value) || 0 })}
                    />
                    <p className="text-[8px] text-slate-400 font-medium">Costos de energía, desgaste, mantenimiento, etc., por unidad.</p>
                  </div>
                  <div className="space-y-2 md:col-span-2 p-3 bg-white/50 rounded-xl border border-slate-100 flex justify-between items-center">
                    <div>
                      <span className="text-[9px] font-black text-slate-400 block uppercase tracking-wider">Costo Unitario Total</span>
                      <span className="text-xs font-bold text-slate-500">
                        {formData.production_type === 'fabricado' ? 'Fabricación' : 'Ensamblado'} (Componentes BOM + Costos Directos)
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-lg font-black text-brand-600 block">
                        {formData.cost_price ? `$${formData.cost_price.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '$0.00'}
                      </span>
                      <span className="text-[8px] text-slate-400 font-medium block">Calculado automáticamente por base de datos</span>
                    </div>
                  </div>
                </>
              )}
            </div>
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

          {/* 5.5 VARIANTE Y RELACIÓN */}
          <div className="md:col-span-2 p-6 bg-slate-50 rounded-[2rem] border border-slate-100 shadow-inner space-y-4">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">🔗 Configuración de Variante (Opcional)</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Producto Principal */}
              <div className="space-y-2 relative">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Producto Principal (Padre)</label>
                
                {formData.parent_id ? (
                  <div className="flex items-center justify-between bg-brand-50 border border-brand-100 px-4 py-3 rounded-xl">
                    <div className="min-w-0 flex-1">
                      <span className="text-[9px] font-black text-brand-500 block uppercase tracking-wider">
                        {allProducts.find(p => p.id === formData.parent_id)?.sku || "SIN SKU"}
                      </span>
                      <span className="text-xs font-bold text-slate-700 truncate block">
                        {allProducts.find(p => p.id === formData.parent_id)?.name || "Producto no encontrado"}
                      </span>
                    </div>
                    <button 
                      type="button" 
                      onClick={() => setFormData(prev => ({ ...prev, parent_id: null }))}
                      className="ml-2 text-xs font-black text-red-600 hover:text-red-800 transition-colors uppercase tracking-wider bg-white px-2.5 py-1 rounded-lg border border-red-100 shadow-sm"
                    >
                      Desvincular
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input 
                      type="text" 
                      placeholder="Buscar producto principal..." 
                      className="w-full pl-9 pr-4 py-3 rounded-xl border border-slate-200 bg-white text-xs font-bold focus:ring-4 focus:ring-brand-500/10 outline-none"
                      value={parentSearch}
                      onChange={(e) => {
                        const term = e.target.value;
                        setParentSearch(term);
                        if (term.length > 1) {
                          // Filtrar productos que puedan ser padre
                          // Excluir el producto actual y productos que ya sean variantes
                          const results = allProducts.filter(p => 
                            (p.name.toLowerCase().includes(term.toLowerCase()) || 
                             (p.sku && p.sku.toLowerCase().includes(term.toLowerCase()))) && 
                            p.id !== product?.id &&
                            !p.parent_id
                          ).slice(0, 5);
                          setParentSearchResults(results);
                        } else {
                          setParentSearchResults([]);
                        }
                      }}
                    />
                    {parentSearchResults.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-xl border border-slate-100 z-50 overflow-hidden divide-y divide-slate-50 max-h-48 overflow-y-auto">
                        {parentSearchResults.map(p => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              setFormData(prev => ({ ...prev, parent_id: p.id }));
                              setParentSearch("");
                              setParentSearchResults([]);
                            }}
                            className="w-full px-4 py-3 text-left hover:bg-brand-50 flex items-center justify-between group"
                          >
                            <div className="min-w-0 flex-1">
                              <span className="text-[8px] font-black text-brand-500 block uppercase tracking-wider">{p.sku}</span>
                              <span className="text-[10px] font-bold text-slate-700 block truncate">{p.name}</span>
                            </div>
                            <Plus className="w-3.5 h-3.5 text-slate-300 group-hover:text-brand-600 flex-shrink-0" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Tipo de Variante */}
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Tipo de Variante</label>
                <div className="flex gap-2">
                  <select
                    value={["estandar", "Gris", "Ciego", "Ciego Gris", "Beige", "Rojo", "Verde"].includes(formData.variant_type || "") ? (formData.variant_type || "estandar") : "custom"}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "custom") {
                        setFormData(prev => ({ ...prev, variant_type: "" }));
                      } else {
                        setFormData(prev => ({ ...prev, variant_type: val }));
                      }
                    }}
                    className="flex-1 px-4 py-3 rounded-xl border border-slate-200 bg-white font-bold text-xs outline-none cursor-pointer focus:ring-4 focus:ring-brand-500/10"
                  >
                    <option value="estandar">Estándar</option>
                    <option value="Gris">Gris</option>
                    <option value="Ciego">Ciego</option>
                    <option value="Ciego Gris">Ciego Gris</option>
                    <option value="Beige">Beige</option>
                    <option value="Rojo">Rojo</option>
                    <option value="Verde">Verde</option>
                    <option value="custom">Personalizado...</option>
                  </select>
                  
                  {(!["estandar", "Gris", "Ciego", "Ciego Gris", "Beige", "Rojo", "Verde"].includes(formData.variant_type || "")) && (
                    <input 
                      type="text"
                      placeholder="Ej. Ciego Azul"
                      className="w-1/2 px-3 py-3 rounded-xl border border-slate-200 bg-white font-bold text-xs focus:ring-4 focus:ring-brand-500/10 outline-none"
                      value={formData.variant_type || ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        setFormData(prev => ({ ...prev, variant_type: val }));
                      }}
                    />
                  )}
                </div>
                <p className="text-[8px] text-slate-400 font-medium mt-1">
                  Establecé el tipo de variante para que los vendedores la diferencien al vender.
                </p>
              </div>

            </div>
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

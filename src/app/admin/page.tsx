"use client";

export const runtime = "edge";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { Plus, Edit2, Trash2, Save, X, Image as ImageIcon, Search, Loader2, Upload, Settings, LogOut, CheckCircle2 } from "lucide-react";
import { cn, formatPrice } from "@/lib/utils";
import { Product } from "@/types";
import { supabase } from "@/lib/supabase";
import Image from "next/image";
import { ProductFormModal } from "@/components/ui/ProductFormModal";

export default function AdminPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  
  // Tab State
  const [activeTab, setActiveTab] = useState<'products' | 'settings' | 'import'>('products');
  const [session, setSession] = useState<any>(null);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password: loginPassword,
    });
    if (error) alert("Credenciales inválidas");
    setIsLoggingIn(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };
  
  // Settings State
  const [aboutImageUrl, setAboutImageUrl] = useState('');
  const [settingsFile, setSettingsFile] = useState<File | null>(null);
  const [landingProductId, setLandingProductId] = useState('');
  const [landingCategories, setLandingCategories] = useState<string[]>([]);

  // Import State
  const [importData, setImportData] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importStatus, setImportStatus] = useState<string | null>(null);

  // Form State
  const [editingProduct, setEditingProduct] = useState<Partial<Product> | null>(null);

  useEffect(() => {
    fetchProducts();
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase.from('site_settings').select('*').in('id', ['about_image_url', 'landing_hero_product_id', 'landing_categories']);
      if (error) {
        console.warn("No se encontró configuración previa en Supabase:", error.message);
        return;
      }
      if (data) {
        const aboutImg = data.find(d => d.id === 'about_image_url');
        const heroProduct = data.find(d => d.id === 'landing_hero_product_id');
        const landingCats = data.find(d => d.id === 'landing_categories');
        if (aboutImg) setAboutImageUrl(aboutImg.value);
        if (heroProduct) setLandingProductId(heroProduct.value);
        if (landingCats && landingCats.value) setLandingCategories(landingCats.value.split(',').filter(Boolean));
      }
    } catch (err) {
      console.error("Error cargando ajustes:", err);
    }
  };

  async function fetchProducts() {
    setLoading(true);
    const { data } = await supabase.from('products').select('*').order('created_at', { ascending: false });
    if (data) setProducts(data);
    setLoading(false);
  }

  const handleOpenForm = (product?: Product) => {
    setEditingProduct(product || null);
    setIsFormOpen(true);
  };

  // Handle ?edit=ID parameter for deep-linking from catalog
  useEffect(() => {
    if (session && products.length > 0) {
      const urlParams = new URLSearchParams(window.location.search);
      const editId = urlParams.get('edit');
      if (editId) {
        const product = products.find(p => p.id === editId);
        if (product) {
          handleOpenForm(product);
          // Clean the URL without reloading
          const newUrl = window.location.pathname;
          window.history.replaceState({}, '', newUrl);
        }
      }
    }
  }, [products, session]);


  // Actualización rápida inline (precio, categoría, destacado, liquidación)
  const handleQuickUpdate = async (productId: string, field: string, value: any) => {
    // Actualizar estado local inmediatamente
    setProducts(prev => prev.map(p => p.id === productId ? { ...p, [field]: value } : p));
    // Persistir en Supabase
    const { error } = await supabase.from('products').update({ [field]: value }).eq('id', productId);
    if (error) {
      alert('Error al actualizar: ' + error.message);
      fetchProducts(); // Revertir
    }
  };

  const handleSettingsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    let finalUrl = aboutImageUrl;

    try {
      if (settingsFile) {
        const fileExt = settingsFile.name.split('.').pop();
        const filePath = `settings/about-${Math.random()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage.from('product-images').upload(filePath, settingsFile);
        
        if (uploadError) {
          console.error("Error al subir imagen de fábrica:", uploadError);
          alert("Error al subir la imagen: " + uploadError.message);
          setSubmitting(false);
          return;
        }

        const { data: publicUrlData } = supabase.storage.from('product-images').getPublicUrl(filePath);
        finalUrl = publicUrlData.publicUrl;
      }

      const { error } = await supabase.from('site_settings').upsert([
        { id: 'about_image_url', value: finalUrl },
        { id: 'landing_hero_product_id', value: landingProductId },
        { id: 'landing_categories', value: landingCategories.join(',') },
      ]);
      
      if (error) {
        console.error("Error en upsert de site_settings:", error);
        alert("🚨 Error de Base de Datos:\n" + error.message);
      } else {
        setAboutImageUrl(finalUrl); 
        setSettingsFile(null); 
        alert("✅ ¡Configuración guardada con éxito!"); 
        fetchSettings();
      }
    } catch (err) {
      console.error("Error crítico en ajustes:", err);
      alert("Error inesperado en los ajustes.");
    } finally {
      setSubmitting(false);
    }
  };

  const processData = async (data: string) => {
    if (!data.trim()) return;
    setSubmitting(true);
    setImportStatus("Procesando...");
    
    const lines = data.split("\n");
    let updatedCount = 0;
    let errors = 0;

    for (const line of lines) {
      if (!line.trim() || line.startsWith("SKU,")) continue; // Saltar cabecera si existe
      
      const parts = line.split(",").map(p => p.trim());
      if (parts.length < 2) continue;

      const sku = parts[0];
      const name = parts[1] || "";
      const priceStr = parts[2] || "0";
      const category = parts[3] || "Varios";
      const brand = parts[4] || "";
      const dimensions = parts[5] || "";
      const is_on_sale = parts[6] ? parts[6].toLowerCase() === 'true' : false;
      const is_featured = parts[7] ? parts[7].toLowerCase() === 'true' : false;
      const description = parts[8] || "";
      const image_url = parts[9] || "";
      
      const price = parseFloat(priceStr.replace(/\./g, "").replace(",", "."));
      if (isNaN(price)) { errors++; continue; }

      const upsertPayload: any = { 
        sku, 
        price,
        name,
        category,
        brand,
        dimensions,
        is_on_sale,
        is_featured,
        description,
        image_url
      };

      const { error } = await supabase.from('products').upsert(upsertPayload, { onConflict: 'sku' });
      if (!error) updatedCount++; else errors++;
    }

    setImportStatus(`Completado: ${updatedCount} actualizados, ${errors} errores.`);
    fetchProducts();
    setSubmitting(false);
  };

  const handleMassUpdate = async () => {
    await processData(importData);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      if (content) {
        await processData(content);
      }
    };
    reader.readAsText(file);
  };

  const handleDelete = async (id: string) => {
    if (confirm("¿Estás seguro de eliminar este producto?")) {
      const { error } = await supabase.from('products').delete().eq('id', id);
      if (!error) fetchProducts();
    }
  };

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.sku && p.sku.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  if (!session) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white p-12 rounded-[3rem] shadow-2xl border border-slate-100 w-full max-w-md">
          <div className="text-center mb-10">
            <div className="w-16 h-16 bg-brand-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <Settings className="w-8 h-8 text-brand-600 animate-spin-slow" />
            </div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tighter">Panel Admin</h1>
            <p className="text-slate-500 font-medium mt-2">Ingresa para gestionar el sitio</p>
          </div>
          
          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Email</label>
              <input 
                type="email" 
                required 
                className="w-full px-5 py-4 rounded-2xl border border-slate-100 focus:ring-4 focus:ring-brand-500/10 bg-slate-50 font-bold"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Contraseña</label>
              <input 
                type="password" 
                required 
                className="w-full px-5 py-4 rounded-2xl border border-slate-100 focus:ring-4 focus:ring-brand-500/10 bg-slate-50 font-bold"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={isLoggingIn} className="w-full py-8 text-lg font-black rounded-2xl">
              {isLoggingIn ? <Loader2 className="animate-spin" /> : "Iniciar Sesión"}
            </Button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-6 py-12 max-w-6xl">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
        <div>
          <div className="flex flex-col md:flex-row md:items-center gap-4 mb-2">
            <h1 className="text-4xl font-black text-slate-900 tracking-tighter">Panel de Control</h1>
            <button 
              onClick={handleLogout} 
              className="flex items-center gap-2 text-[10px] font-black text-red-500 hover:text-white hover:bg-red-500 uppercase tracking-[0.2em] border border-red-100 hover:border-red-500 px-4 py-2 rounded-xl transition-all w-fit"
            >
              <LogOut className="w-3.5 h-3.5" />
              Cerrar Sesión
            </button>
          </div>
          <p className="text-slate-500 font-medium">Gestión total de catálogo e inventario</p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex bg-slate-100 p-1 rounded-2xl shadow-inner">
            <button 
              onClick={() => setActiveTab('products')}
              className={cn(
                "px-4 py-2 rounded-xl text-sm font-black transition-all",
                activeTab === 'products' ? "bg-white text-brand-600 shadow-sm" : "text-slate-400 hover:text-slate-600"
              )}
            >
              Productos
            </button>
            <button 
              onClick={() => setActiveTab('import')}
              className={cn(
                "px-4 py-2 rounded-xl text-sm font-black transition-all",
                activeTab === 'import' ? "bg-white text-brand-600 shadow-sm" : "text-slate-400 hover:text-slate-600"
              )}
            >
              Carga Masiva
            </button>
            <button 
              onClick={() => setActiveTab('settings')}
              className={cn(
                "px-4 py-2 rounded-xl text-sm font-black transition-all",
                activeTab === 'settings' ? "bg-white text-brand-600 shadow-sm" : "text-slate-400 hover:text-slate-600"
              )}
            >
              Ajustes
            </button>
          </div>
          
          {activeTab === 'products' && (
            <Button onClick={() => handleOpenForm()} className="gap-2 rounded-2xl shadow-lg shadow-brand-600/20 py-6">
              <Plus className="w-5 h-5" />
              Nuevo Producto
            </Button>
          )}
        </div>
      </div>

      {activeTab === 'products' ? (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-8">
            <div className="lg:col-span-3 relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
              <input 
                type="text" 
                placeholder="Buscar por nombre, SKU o categoría..." 
                className="w-full pl-12 pr-4 py-4 rounded-[1.5rem] border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all font-medium"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="bg-brand-50 p-4 rounded-3xl border border-brand-100 flex flex-col justify-center">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-500 mb-1">Total Items</span>
              <span className="text-3xl font-black text-brand-900 leading-none">{products.length}</span>
            </div>
          </div>

          <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-2xl shadow-slate-200/50 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Producto / Interno</th>
                    <th className="px-4 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 min-w-[180px]">Categoría</th>
                    <th className="px-4 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 min-w-[150px]">Precio (ARS)</th>
                    <th className="px-4 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 text-center">⭐</th>
                    <th className="px-4 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 text-center">🏷️</th>
                    <th className="px-4 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {loading ? (
                    <tr><td colSpan={6} className="py-32 text-center"><Loader2 className="w-10 h-10 animate-spin mx-auto text-brand-200" /></td></tr>
                  ) : filteredProducts.map((product) => (
                    <tr key={product.id} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center text-slate-300 overflow-hidden border border-slate-100 flex-shrink-0">
                            {product.image_url ? <img src={product.image_url} className="w-full h-full object-cover" /> : <ImageIcon className="w-5 h-5" />}
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold text-slate-900 text-sm truncate">{product.name}</div>
                            <div className="text-[10px] font-black text-brand-500 uppercase tracking-widest">{product.sku || "SIN SKU"}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 min-w-[160px]">
                        <select
                          value={product.category}
                          onChange={(e) => handleQuickUpdate(product.id, 'category', e.target.value)}
                          className="w-full text-[10px] font-black uppercase tracking-widest px-3 py-2 rounded-xl border border-slate-200 bg-white focus:ring-4 focus:ring-brand-500/10 focus:border-brand-300 cursor-pointer transition-all outline-none shadow-sm"
                        >
                          {Array.from(new Set(products.map(p => p.category))).sort().map(cat => (
                            <option key={cat} value={cat}>{cat}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-4">
                        <input
                          type="text"
                          className="w-32 px-3 py-2 rounded-xl border border-slate-200 font-black text-slate-900 text-sm bg-white focus:ring-2 focus:ring-brand-500/20 focus:border-brand-300"
                          defaultValue={new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2 }).format(product.price)}
                          onBlur={(e) => {
                            const val = e.target.value.replace(/\./g, '').replace(',', '.');
                            const num = parseFloat(val);
                            if (!isNaN(num) && num !== product.price) handleQuickUpdate(product.id, 'price', num);
                          }}
                          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                        />
                      </td>
                      <td className="px-4 py-4 text-center">
                        <input
                          type="checkbox"
                          checked={product.is_featured || false}
                          onChange={(e) => handleQuickUpdate(product.id, 'is_featured', e.target.checked)}
                          className="w-5 h-5 rounded-lg border-2 border-slate-300 text-emerald-600 focus:ring-emerald-500/20 cursor-pointer accent-emerald-600"
                          title="Destacado"
                        />
                      </td>
                      <td className="px-4 py-4 text-center">
                        <input
                          type="checkbox"
                          checked={product.is_on_sale || false}
                          onChange={(e) => handleQuickUpdate(product.id, 'is_on_sale', e.target.checked)}
                          className="w-5 h-5 rounded-lg border-2 border-slate-300 text-red-600 focus:ring-red-500/20 cursor-pointer accent-red-600"
                          title="Liquidación"
                        />
                      </td>
                      <td className="px-4 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => handleOpenForm(product)} className="p-2 text-slate-300 hover:text-brand-600 hover:bg-brand-50 rounded-xl transition-all" title="Editar todo"><Edit2 className="w-4 h-4" /></button>
                          <button onClick={() => handleDelete(product.id)} className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all" title="Eliminar"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : activeTab === 'import' ? (
        <div className="max-w-4xl">
          <div className="bg-white p-10 rounded-[2.5rem] shadow-2xl border border-slate-100">
            <div className="flex justify-between items-start mb-2 group">
              <h2 className="text-3xl font-black text-slate-900 tracking-tighter">Carga Masiva de Productos</h2>
              <div className="flex flex-col items-end gap-1">
                <a 
                  href="/ejemplo_carga_masiva.csv" 
                  download 
                  className="text-[10px] font-black text-brand-600 hover:text-brand-700 uppercase tracking-widest border-b border-brand-200"
                >
                  Descargar Ejemplo CSV
                </a>
                <label className="text-[10px] font-black text-slate-400 group-hover:text-brand-500 transition-colors uppercase tracking-widest cursor-pointer">
                  O subí un archivo .csv
                  <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
                </label>
              </div>
            </div>
            <p className="text-slate-500 mb-8 font-medium">Pegá los datos o subí tu archivo CSV. Si el SKU coincide, se actualiza el producto.</p>
            
            <div className="space-y-6">
              <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 text-[10px] font-mono text-slate-500 mb-4">
                Orden: SKU, Nombre, Precio, Categoría, Marca, Dimensiones, Oferta (true/false), Destacado (true/false), Descripción, URL Imagen
              </div>
              <textarea 
                className="w-full h-64 p-6 rounded-3xl border border-slate-200 focus:ring-4 focus:ring-brand-500/10 font-mono text-sm leading-relaxed outline-none"
                placeholder={"Ejemplo:\nSKU-1, Producto A, 250000, Tanques, Aquafort, 1x1m, false, true, Mi producto, https://...\nSKU-2, Producto B, 50000, Bombas, Daewoo, 0.5x0.5m, true, false, Una bomba, https://..."}
                value={importData}
                onChange={(e) => setImportData(e.target.value)}
              />
              {importStatus && <div className="p-4 bg-slate-900 text-white rounded-2xl text-xs font-bold text-center">{importStatus}</div>}
              <Button onClick={handleMassUpdate} className="w-full py-8 text-lg font-black rounded-2xl shadow-2xl shadow-brand-600/20" disabled={submitting}>
                {submitting ? <Loader2 className="animate-spin" /> : <Upload className="mr-2" />}
                Procesar e Importar Productos
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="max-w-2xl">
          <div className="bg-white p-10 rounded-[2.5rem] shadow-2xl border border-slate-100">
            <h2 className="text-3xl font-black text-slate-900 mb-8 tracking-tighter">Ajustes Generales</h2>
            <form onSubmit={handleSettingsSubmit} className="space-y-8">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Producto destacado en Landing /tanques</label>
                <select
                  value={landingProductId}
                  onChange={(e) => setLandingProductId(e.target.value)}
                  className="w-full px-5 py-4 rounded-2xl border border-slate-100 focus:ring-4 focus:ring-brand-500/10 bg-slate-50 font-bold"
                >
                  <option value="">Automático</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Categorías Landing</label>
                <div className="flex flex-wrap gap-3">
                  {Array.from(new Set(products.map(p => p.category))).sort().map(cat => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => landingCategories.includes(cat) ? setLandingCategories(prev => prev.filter(c => c !== cat)) : setLandingCategories(prev => [...prev, cat])}
                      className={`px-4 py-2 rounded-xl text-xs font-bold border ${landingCategories.includes(cat) ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-slate-400 border-slate-200'}`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>
              <Button type="submit" disabled={submitting} className="w-full py-7 font-black rounded-2xl">
                {submitting ? <Loader2 className="animate-spin" /> : "Guardar Configuración"}
              </Button>
            </form>
          </div>
        </div>
      )}

      {/* REUSABLE MODAL */}
      <ProductFormModal 
        product={editingProduct} 
        isOpen={isFormOpen} 
        onClose={() => setIsFormOpen(false)} 
        onSuccess={fetchProducts}
        allProducts={products}
      />
    </div>
  );
}

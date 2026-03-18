"use client";

export const runtime = "edge";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { Plus, Edit2, Trash2, Save, X, Image as ImageIcon, Search, Loader2, Upload, Settings, LogOut } from "lucide-react";
import { cn, formatPrice } from "@/lib/utils";
import { Product } from "@/types";
import { supabase } from "@/lib/supabase";
import Image from "next/image";

export default function AdminPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  
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

  // Import State
  const [importData, setImportData] = useState("");
  const [importStatus, setImportStatus] = useState<string | null>(null);

  // Form State
  const [editingProduct, setEditingProduct] = useState<Partial<Product> | null>(null);
  const [formData, setFormData] = useState({
    sku: "",
    name: "",
    description: "",
    price: 0,
    category: "Hogar",
    image_url: ""
  });
  const [priceInput, setPriceInput] = useState("");

  useEffect(() => {
    fetchProducts();
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase.from('site_settings').select('value').eq('id', 'about_image_url').single();
      if (error) {
        console.warn("No se encontró configuración previa en Supabase:", error.message);
        return;
      }
      if (data) setAboutImageUrl(data.value);
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
    if (product) {
      setEditingProduct(product);
      setFormData({
        sku: product.sku || "",
        name: product.name,
        description: product.description || "",
        price: product.price,
        category: product.category,
        image_url: product.image_url || ""
      });
      setPriceInput(product.price.toString().replace('.', ','));
    } else {
      setEditingProduct(null);
      setFormData({
        sku: "",
        name: "",
        description: "",
        price: 0,
        category: "Hogar",
        image_url: ""
      });
      setPriceInput("");
    }
    setSelectedFile(null);
    setIsFormOpen(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) setSelectedFile(e.target.files[0]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    const finalPrice = parseFloat(priceInput.replace(/\./g, "").replace(",", "."));
    let finalImageUrl = formData.image_url;

    if (selectedFile) {
      setUploading(true);
      const fileExt = selectedFile.name.split('.').pop();
      const filePath = `${Math.random()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from('product-images').upload(filePath, selectedFile);
      if (!uploadError) {
        const { data: publicUrlData } = supabase.storage.from('product-images').getPublicUrl(filePath);
        finalImageUrl = publicUrlData.publicUrl;
      }
      setUploading(false);
    }

    const payload = { 
      ...formData, 
      price: isNaN(finalPrice) ? 0 : finalPrice, 
      image_url: finalImageUrl 
    };

    if (editingProduct?.id) {
      const { error } = await supabase.from('products').update(payload).eq('id', editingProduct.id);
      if (!error) { setIsFormOpen(false); fetchProducts(); }
    } else {
      const { error } = await supabase.from('products').insert([payload]);
      if (!error) { setIsFormOpen(false); fetchProducts(); }
    }
    setSubmitting(false);
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

      console.log("Intentando guardar URL en Supabase:", finalUrl);
      const { error } = await supabase.from('site_settings').upsert({ id: 'about_image_url', value: finalUrl });
      
      if (error) {
        console.error("Error en upsert de site_settings:", error);
        alert("🚨 Error de Base de Datos:\n" + error.message + "\n\nIMPORTANTE: Asegúrate de haber ejecutado el SQL para crear la tabla 'site_settings'.");
      } else {
        setAboutImageUrl(finalUrl); 
        setSettingsFile(null); 
        alert("✅ ¡Configuración de fábrica guardada con éxito!"); 
        fetchSettings(); // Refrescar estado
      }
    } catch (err) {
      console.error("Error crítico en ajustes:", err);
      alert("Error inesperado en los ajustes.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleMassUpdate = async () => {
    if (!importData.trim()) return;
    setSubmitting(true);
    setImportStatus("Procesando...");
    
    // Format: SKU,Price OR SKU,Name,Price,Category
    const lines = importData.split("\n");
    let updatedCount = 0;
    let errors = 0;

    for (const line of lines) {
      const parts = line.split(",").map(p => p.trim());
      if (parts.length < 2) continue;

      const sku = parts[0];
      const name = parts.length >= 3 ? parts[1] : null;
      const priceStr = parts.length >= 3 ? parts[2] : parts[1];
      const category = parts.length >= 4 ? parts[3] : "Varios";
      
      const price = parseFloat(priceStr.replace(/\./g, "").replace(",", "."));
      if (isNaN(price)) { errors++; continue; }

      const upsertPayload: any = { sku, price };
      if (name) upsertPayload.name = name;
      if (category) upsertPayload.category = category;

      const { error } = await supabase.from('products').upsert(upsertPayload, { onConflict: 'sku' });
      if (!error) updatedCount++; else errors++;
    }

    setImportStatus(`Completado: ${updatedCount} actualizados, ${errors} errores.`);
    fetchProducts();
    setSubmitting(false);
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
      {/* Header section */}
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
                    <th className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Producto / Interno</th>
                    <th className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Categoría</th>
                    <th className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Precio (ARS)</th>
                    <th className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {loading ? (
                    <tr><td colSpan={4} className="py-32 text-center"><Loader2 className="w-10 h-10 animate-spin mx-auto text-brand-200" /></td></tr>
                  ) : filteredProducts.map((product) => (
                    <tr key={product.id} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-5">
                          <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-300 overflow-hidden border border-slate-100">
                            {product.image_url ? <img src={product.image_url} className="w-full h-full object-cover" /> : <ImageIcon className="w-6 h-6" />}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900">{product.name}</div>
                            <div className="text-[10px] font-black text-brand-500 uppercase tracking-widest">{product.sku || "SIN SKU"}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <span className="px-3 py-1 bg-slate-100 text-slate-600 rounded-lg text-[9px] font-black uppercase tracking-widest">{product.category}</span>
                      </td>
                      <td className="px-8 py-6 font-black text-slate-900">{formatPrice(product.price)}</td>
                      <td className="px-8 py-6 text-right">
                        <div className="flex items-center justify-end gap-3">
                          <button onClick={() => handleOpenForm(product)} className="p-2 text-slate-300 hover:text-brand-600 hover:bg-brand-50 rounded-xl transition-all"><Edit2 className="w-4 h-4" /></button>
                          <button onClick={() => handleDelete(product.id)} className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"><Trash2 className="w-4 h-4" /></button>
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
        <div className="max-w-3xl">
          <div className="bg-white p-10 rounded-[2.5rem] shadow-2xl border border-slate-100">
            <h2 className="text-3xl font-black text-slate-900 mb-2 tracking-tighter">Carga Masiva de Precios</h2>
            <p className="text-slate-500 mb-8 font-medium">Pega los datos separados por coma. Si el SKU coincide, se actualiza el precio. Si no existe, se crea el producto.</p>
            
            <div className="space-y-6">
              <div className="p-5 bg-brand-50 rounded-2xl border border-brand-100 mb-6">
                <p className="text-xs font-black text-brand-700 uppercase tracking-widest mb-2">Formato Recomendado:</p>
                <code className="text-[10px] text-brand-900 font-mono">SKU, Nombre, Precio, Categoría</code>
                <p className="text-[9px] text-brand-600 mt-2 italic">* También puedes usar solo SKU, Precio (si el producto ya existe)</p>
              </div>

              <textarea 
                className="w-full h-64 p-6 rounded-3xl border border-slate-200 focus:ring-4 focus:ring-brand-500/10 font-mono text-sm leading-relaxed outline-none"
                placeholder={"Ejemplo:\nSKU123, Tanque Aquafort, 250000, Tanques\nSKU456, 180000"}
                value={importData}
                onChange={(e) => setImportData(e.target.value)}
              />

              {importStatus && (
                <div className="p-4 bg-slate-900 text-white rounded-2xl text-xs font-bold text-center">
                  {importStatus}
                </div>
              )}

              <Button 
                onClick={handleMassUpdate} 
                className="w-full py-8 text-lg font-black rounded-2xl shadow-2xl shadow-brand-600/20"
                disabled={submitting}
              >
                {submitting ? <Loader2 className="animate-spin" /> : <Upload className="mr-2" />}
                Procesar e Importar Precios
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
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Imagen Sección "Nuestra Fábrica"</label>
                <div className="space-y-6">
                  {(settingsFile || aboutImageUrl) && (
                    <div className="relative w-full h-56 rounded-3xl overflow-hidden shadow-inner border border-slate-100">
                      <Image src={settingsFile ? URL.createObjectURL(settingsFile) : aboutImageUrl} alt="Preview" fill className="object-cover" unoptimized />
                    </div>
                  )}
                  <div className="relative group">
                    <input type="file" id="settings-file" className="hidden" onChange={(e) => e.target.files && setSettingsFile(e.target.files[0])} accept="image/*" />
                    <label htmlFor="settings-file" className="flex flex-col items-center justify-center w-full py-10 border-2 border-dashed border-slate-100 rounded-3xl cursor-pointer hover:bg-brand-50 hover:border-brand-200 transition-all">
                      <Plus className="w-10 h-10 text-slate-200 group-hover:text-brand-500 mb-3" />
                      <span className="font-bold text-slate-400 group-hover:text-brand-700">{settingsFile ? settingsFile.name : "Subir nueva foto de fábrica"}</span>
                    </label>
                  </div>
                </div>
              </div>
              <Button type="submit" disabled={submitting} className="w-full py-7 font-black rounded-2xl shadow-xl shadow-brand-600/10">
                {submitting ? <Loader2 className="animate-spin" /> : <Save className="mr-2" />}
                Guardar Configuración
              </Button>
            </form>
          </div>
        </div>
      )}

      {/* Manual Product Form Modal */}
      {isFormOpen && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-md z-[100] flex items-center justify-center p-6 overflow-y-auto">
          <div className="bg-white rounded-[3rem] w-full max-w-2xl shadow-3xl border border-white/20 my-auto">
            <div className="p-10 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
              <h2 className="text-3xl font-black text-slate-900 tracking-tighter">{editingProduct ? 'Editar Producto' : 'Nuevo Producto'}</h2>
              <button onClick={() => setIsFormOpen(false)} className="p-3 hover:bg-white rounded-2xl transition-all shadow-sm"><X className="w-6 h-6 text-slate-400" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-10 grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Nombre Interno (SKU)</label>
                <input required placeholder="Ej: TANQUE-300L-P" className="w-full px-5 py-4 rounded-2xl border border-slate-100 focus:ring-4 focus:ring-brand-500/10 bg-slate-50 font-bold" value={formData.sku} onChange={e => setFormData({...formData, sku: e.target.value.toUpperCase()})} />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Categoría</label>
                <select className="w-full px-5 py-4 rounded-2xl border border-slate-100 focus:ring-4 focus:ring-brand-500/10 bg-slate-50 font-bold" value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})}>
                  <option>Hogar</option><option>Tanques</option><option>Tratamiento</option><option>Ferretería</option><option>Varios</option>
                </select>
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Nombre Público</label>
                <input required className="w-full px-5 py-4 rounded-2xl border border-slate-100 focus:ring-4 focus:ring-brand-500/10 bg-slate-50 font-bold" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Descripción</label>
                <textarea className="w-full px-5 py-4 rounded-2xl border border-slate-100 focus:ring-4 focus:ring-brand-500/10 bg-slate-50 font-medium h-24 italic" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Precio (ARS)</label>
                <input type="text" required placeholder="Ej: 274.900,00" className="w-full px-5 py-4 rounded-2xl border border-slate-100 focus:ring-4 focus:ring-brand-500/10 bg-slate-50 font-black text-brand-600" value={priceInput} onChange={e => setPriceInput(e.target.value)} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Imagen</label>
                <div className="flex items-center gap-6 p-4 bg-slate-50 rounded-3xl border border-slate-100">
                  <div className="w-20 h-20 rounded-2xl bg-white border border-slate-200 flex items-center justify-center overflow-hidden">
                    {(selectedFile || formData.image_url) ? <img src={selectedFile ? URL.createObjectURL(selectedFile) : formData.image_url} className="w-full h-full object-cover" /> : <ImageIcon className="w-8 h-8 opacity-20" />}
                  </div>
                  <div className="flex-1">
                    <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" id="image-upload" />
                    <label htmlFor="image-upload" className="inline-flex items-center px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-black text-slate-700 hover:bg-brand-50 cursor-pointer transition-all uppercase tracking-widest">Cambiar Imagen</label>
                  </div>
                </div>
              </div>
              <div className="md:col-span-2 flex gap-4 mt-4">
                <Button type="submit" disabled={submitting || uploading} className="flex-1 rounded-2xl h-16 text-lg font-black shadow-2xl shadow-brand-600/20">
                  {uploading ? <Loader2 className="animate-spin" /> : editingProduct ? 'Guardar Cambios' : 'Crear Producto'}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setIsFormOpen(false)} className="rounded-2xl h-16 font-bold">Cancelar</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

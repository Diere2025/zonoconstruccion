"use client";

export const runtime = "edge";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { Plus, Edit2, Trash2, Save, X, Image as ImageIcon, Search, Loader2, Upload, Settings, LogOut, CheckCircle2, Download, Menu, RefreshCw, Eye, EyeOff } from "lucide-react";
import { cn, formatPrice } from "@/lib/utils";
import { Product } from "@/types";
import { supabase } from "@/lib/supabase";
import Image from "next/image";
import { ProductFormModal } from "@/components/ui/ProductFormModal";

export default function AdminPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [submittingType, setSubmittingType] = useState<'manual' | 'sheets' | null>(null);
  const [cleaningDuplicates, setCleaningDuplicates] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<{message: string, isError: boolean} | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
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
  const [tanquesCategories, setTanquesCategories] = useState<string[]>([]);

  // Import State
  const [importData, setImportData] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [importErrors, setImportErrors] = useState<string[]>([]);

  // Form State
  const [editingProduct, setEditingProduct] = useState<Partial<Product> | null>(null);

  useEffect(() => {
    fetchProducts();
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase.from('site_settings').select('*').in('id', ['about_image_url', 'landing_hero_product_id', 'landing_categories', 'tanques_categories']);
      if (error) {
        console.warn("No se encontró configuración previa en Supabase:", error.message);
        return;
      }
      if (data) {
        const aboutImg = data.find(d => d.id === 'about_image_url');
        const heroProduct = data.find(d => d.id === 'landing_hero_product_id');
        const landingCats = data.find(d => d.id === 'landing_categories');
        const tanquesCats = data.find(d => d.id === 'tanques_categories');

        if (aboutImg) setAboutImageUrl(aboutImg.value);
        if (heroProduct) setLandingProductId(heroProduct.value);
        if (landingCats && landingCats.value) setLandingCategories(landingCats.value.split(',').filter(Boolean));
        if (tanquesCats && tanquesCats.value) setTanquesCategories(tanquesCats.value.split(',').filter(Boolean));
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
    setSavingSettings(true);
    let finalUrl = aboutImageUrl;

    try {
      if (settingsFile) {
        const fileExt = settingsFile.name.split('.').pop();
        const filePath = `settings/about-${Math.random()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage.from('product-images').upload(filePath, settingsFile);
        
        if (uploadError) {
          console.error("Error al subir imagen de fábrica:", uploadError);
          alert("Error al subir la imagen: " + uploadError.message);
          setSavingSettings(false);
          return;
        }

        const { data: publicUrlData } = supabase.storage.from('product-images').getPublicUrl(filePath);
        finalUrl = publicUrlData.publicUrl;
      }

      const { error } = await supabase.from('site_settings').upsert([
        { id: 'about_image_url', value: finalUrl },
        { id: 'landing_hero_product_id', value: landingProductId },
        { id: 'landing_categories', value: landingCategories.join(',') },
        { id: 'tanques_categories', value: tanquesCategories.join(',') },
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
      setSavingSettings(false);
    }
  };

  const parseCSV = (csvText: string) => {
    const result: string[][] = [];
    let currentWord = '';
    let inQuotes = false;
    let currentRow: string[] = [];
    
    // Normalizamos saltos de línea por si viene de Windows (\r\n) -> (\n)
    const text = csvText.replace(/\r\n/g, '\n');
    
    // Autodetectar delimitador según primera línea
    const firstLine = text.split('\n')[0] || '';
    const delimiter = firstLine.includes(';') ? ';' : ',';
    
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i + 1];

      if (inQuotes) {
        if (char === '"' && nextChar === '"') {
          currentWord += '"';
          i++;
        } else if (char === '"') {
          inQuotes = false;
        } else {
          currentWord += char;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === delimiter) {
          currentRow.push(currentWord.trim());
          currentWord = '';
        } else if (char === '\n') {
          currentRow.push(currentWord.trim());
          if (currentRow.length > 1 || currentRow[0] !== '') {
            result.push(currentRow);
          }
          currentRow = [];
          currentWord = '';
        } else {
          currentWord += char;
        }
      }
    }
    
    currentRow.push(currentWord.trim());
    if (currentRow.length > 1 || currentRow[0] !== '') {
      result.push(currentRow);
    }
    
    return result;
  };

  const processData = async (data: string) => {
    if (!data.trim()) {
      setSubmittingType(null);
      return;
    }
    setImportStatus("Procesando...");
    setImportErrors([]);
    
    const rows = parseCSV(data);
    let updatedCount = 0;
    let errors = 0;
    const errorMessages: string[] = [];

    // Pre-cargar SKUs para hacer match case-insensitive
    const { data: existingProducts } = await supabase.from('products').select('sku');
    const skuMap = new Map<string, string>(); // lowercase -> real case
    if (existingProducts) {
      existingProducts.forEach(p => {
        if (p.sku) skuMap.set(p.sku.toLowerCase().trim(), p.sku);
      });
    }

    for (const parts of rows) {
      if (!parts[0] || parts[0].toLowerCase().startsWith("sku")) continue; // Saltar cabecera
      if (parts.length < 2) continue;

      let sku = parts[0].trim();
      // Si el SKU existe pero con otras mayúsculas/minúsculas, usamos el original para no duplicar
      const realSku = skuMap.get(sku.toLowerCase());
      if (realSku) {
        sku = realSku;
      }

      // Si vienen exactamente 2 columnas, asumimos SKU y Precio
      if (parts.length === 2) {
        const priceStr = parts[1] || "0";
        const cleanStr = priceStr.replace(/[$\s]/g, ""); // Remover "$" y espacios
        let price = parseFloat(cleanStr.replace(/\./g, "").replace(",", "."));
        
        if (isNaN(price)) { 
          price = 0;
        }
        
        // Intentar actualizar primero
        const { error: updateError, data } = await supabase
          .from('products')
          .update({ price })
          .eq('sku', sku)
          .select();

        if (updateError) {
          errors++;
          errorMessages.push(`SKU ${sku}: ${updateError.message}`);
        } else if (!data || data.length === 0) {
          // No existe, crearlo como interno/oculto
          const upsertPayload = {
            sku,
            name: `[Interno] ${sku}`,
            price,
            category: 'Interno',
            image_url: '', // Sin imagen
            is_active: false // Inactivo por defecto al ser interno
          };
          const { error: insertError } = await supabase.from('products').insert(upsertPayload);
          if (insertError) {
             errors++;
             errorMessages.push(`SKU ${sku}: Error al crear (${insertError.message})`);
          } else {
             updatedCount++;
          }
        } else {
          updatedCount++;
        }

      } else {
        // Formato completo de 10 columnas, usamos UPSERT
        const upsertPayload: any = { sku };
        const name = parts[1] || `[Interno] ${sku}`;
        const priceStr = parts[2] || "0";
        const category = parts[3] || "Interno";
        const brand = parts[4] || "";
        const dimensions = parts[5] || "";
        const is_on_sale = parts[6] ? parts[6].toLowerCase() === 'true' : false;
        const is_featured = parts[7] ? parts[7].toLowerCase() === 'true' : false;
        const description = parts[8] || "";
        const image_url = parts[9] || "";
        
        const cleanStr = priceStr.replace(/[$\s]/g, "");
        let price = parseFloat(cleanStr.replace(/\./g, "").replace(",", "."));
        
        if (isNaN(price)) { 
          price = 0;
        }

        upsertPayload.name = name;
        upsertPayload.price = price;
        upsertPayload.category = category;
        upsertPayload.brand = brand;
        upsertPayload.dimensions = dimensions;
        upsertPayload.is_on_sale = is_on_sale;
        upsertPayload.is_featured = is_featured;
        upsertPayload.description = description;
        upsertPayload.image_url = image_url;

        const { error } = await supabase.from('products').upsert(upsertPayload, { onConflict: 'sku' });
        if (error) {
          errors++;
          errorMessages.push(`SKU ${sku}: ${error.message}`);
        } else {
          updatedCount++;
        }
      }
    }

    const errorDetails = errors > 0 ? ` Revisar los detalles abajo o descargar el log.` : "";
    setImportStatus(`Completado: ${updatedCount} actualizados, ${errors} errores.${errorDetails}`);
    setImportErrors(errorMessages);
    fetchProducts();
    setSubmittingType(null);
  };

  const handleGoogleSheetsSync = async () => {
    setSubmittingType('sheets');
    setImportStatus("Descargando planilla desde Google Sheets...");
    setImportErrors([]);
    try {
      const response = await fetch("https://docs.google.com/spreadsheets/d/1K3c_6SMScaTkSI3FMDnQPVyj-c7MSqQEoWW4q3mL3Jg/export?format=csv&gid=508601925");
      if (!response.ok) throw new Error("Error al descargar la planilla. Verificá que sea pública.");
      
      const csvText = await response.text();
      const rows = parseCSV(csvText);
      
      let syntheticCsv = "SKU,Precio\\n"; // Cabecera para que sea ignorada
      let count = 0;
      
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!row[1] || row[1].toLowerCase() === "producto" || row[1].trim() === "") continue;
        // Columna B (1) es SKU/Nombre, Columna C (2) es Precio
        const sku = row[1].replace(/"/g, '""'); // Escapar comillas dobles
        const price = row[2] || "0";
        syntheticCsv += `"${sku}","${price}"\n`;
        count++;
      }
      
      if (count === 0) {
         setImportStatus("No se encontraron productos válidos en la planilla.");
         setSubmittingType(null);
         return;
      }
      
      setImportStatus(`Procesando ${count} productos desde Google Sheets...`);
      // Llamamos al processData enviándole este CSV sintético que armamos
      // Ya tiene exactamente 2 columnas (SKU y Precio)
      processData(syntheticCsv);
    } catch (e: any) {
      setImportStatus(`Error de sincronización: ${e.message}`);
      setSubmittingType(null);
    }
  };

  const handleDownloadCSV = () => {
    const header = ["SKU", "Nombre", "Precio", "Categoría", "Marca", "Dimensiones", "Oferta", "Destacado", "Descripción", "URL_Imagen"];
    
    const rows = products.map(p => {
      const escapeCSV = (str: any) => {
        if (str == null) return "";
        let s = String(str);
        if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
          s = '"' + s.replace(/"/g, '""') + '"';
        }
        return s;
      };
      
      return [
        escapeCSV(p.sku),
        escapeCSV(p.name),
        p.price,
        escapeCSV(p.category),
        escapeCSV(p.brand),
        escapeCSV(p.dimensions),
        p.is_on_sale ? "true" : "false",
        p.is_featured ? "true" : "false",
        escapeCSV(p.description),
        escapeCSV(p.image_url)
      ].join(",");
    });
    
    const csvContent = [header.join(","), ...rows].join("\n");
    // Añadimos BOM para que Excel detecte correctamente el UTF-8 y los acentos
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' }); 
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const date = new Date().toISOString().split('T')[0];
    a.download = `catalogo_productos_${date}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleMassUpdate = async () => {
    setSubmittingType('manual');
    processData(importData);
  };

  const handleCleanDuplicates = async () => {
    if (!confirm("Esto agrupará todos los productos por SKU y eliminará los duplicados manteniendo el que tenga mejor información. ¿Estás seguro?")) return;
    
    setCleaningDuplicates(true);
    setCleanupResult(null);
    try {
      const { data: allProducts, error } = await supabase.from('products').select('*');
      if (error) throw error;
      if (!allProducts) return;

      // Agrupar por SKU normalizado
      const skuGroups = new Map<string, Product[]>();
      allProducts.forEach(p => {
        if (!p.sku) return;
        const normalizedSku = p.sku.toLowerCase().trim();
        if (!skuGroups.has(normalizedSku)) {
          skuGroups.set(normalizedSku, []);
        }
        skuGroups.get(normalizedSku)!.push(p);
      });

      let deletedCount = 0;

      for (const [sku, group] of skuGroups.entries()) {
        if (group.length > 1) {
          // Evaluar cada producto
          const scoredGroup = group.map(p => {
            let score = 0;
            if (p.image_url) score += 10;
            if (p.category !== 'Interno') score += 5;
            if (!p.name.includes('[Interno]')) score += 5;
            if (p.description) score += 1;
            if (p.brand) score += 1;
            return { product: p, score };
          });

          // Ordenar de mayor a menor puntaje
          scoredGroup.sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            // Si empatan, el más antiguo se salva (asumiendo que tiene id menor o fue creado antes)
            return a.product.id < b.product.id ? -1 : 1;
          });

          // Salvar al primero, eliminar al resto
          const toDelete = scoredGroup.slice(1);
          
          for (const item of toDelete) {
            await supabase.from('products').delete().eq('id', item.product.id);
            deletedCount++;
          }
        }
      }

      setCleanupResult({ message: `¡Limpieza exitosa! Se eliminaron ${deletedCount} productos duplicados.`, isError: false });
      if (deletedCount > 0) {
        fetchProducts();
      }
    } catch (e: any) {
      setCleanupResult({ message: `Error al limpiar duplicados: ${e.message}`, isError: true });
    } finally {
      setCleaningDuplicates(false);
    }
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

  const searchTerms = searchTerm.toLowerCase().split(/\s+/).filter(Boolean);
  const filteredProducts = products.filter(p => {
    if (searchTerms.length === 0) return true;
    const searchableText = `${p.name} ${p.category} ${p.sku || ''}`.toLowerCase();
    return searchTerms.every(term => searchableText.includes(term));
  });

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
              <table className="w-full text-left table-fixed">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 w-full">Producto / Interno</th>
                    <th className="px-4 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 w-32 md:w-40">Categoría</th>
                    <th className="px-4 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 w-32 md:w-40">Precio (ARS)</th>
                    <th className="px-2 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 text-center w-12" title="Destacado">⭐</th>
                    <th className="px-2 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 text-center w-12" title="Liquidación">🏷️</th>
                    <th className="px-2 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 text-center w-16" title="Visible en Catálogo Público">👁️</th>
                    <th className="px-4 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 text-right w-24">Acciones</th>
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
                          <div className="min-w-0 flex-1 overflow-hidden">
                            <div className="font-bold text-slate-900 text-sm truncate">{product.name}</div>
                            <div className="text-[10px] font-black text-brand-500 uppercase tracking-widest truncate">{product.sku || "SIN SKU"}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
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
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 font-black text-slate-900 text-sm bg-white focus:ring-2 focus:ring-brand-500/20 focus:border-brand-300"
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
                      <td className="px-2 py-4 text-center">
                        <button
                          onClick={() => handleQuickUpdate(product.id, 'is_active', product.is_active === false ? true : false)}
                          className={cn("p-2 rounded-xl transition-all", product.is_active === false ? "bg-slate-100 text-slate-400 hover:bg-slate-200" : "bg-blue-50 text-blue-600 hover:bg-blue-100")}
                          title={product.is_active === false ? "Oculto" : "Visible"}
                        >
                          {product.is_active === false ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
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
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 group gap-4">
              <h2 className="text-3xl font-black text-slate-900 tracking-tighter">Carga Masiva de Productos</h2>
              <div className="flex flex-col items-start md:items-end gap-3">
                <button
                  onClick={handleDownloadCSV}
                  className="px-5 py-2.5 bg-brand-50 text-brand-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-brand-100 transition-colors flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Descargar Catálogo Actual (CSV)
                </button>
                <div className="flex gap-4">
                  <a 
                    href="/ejemplo_carga_masiva.csv" 
                    download 
                    className="text-[10px] font-black text-slate-400 hover:text-slate-600 uppercase tracking-widest border-b border-slate-200"
                  >
                    Plantilla de Ejemplo
                  </a>
                </div>
              </div>
            </div>
            
            <div className="mb-6">
              <label className="flex flex-col items-center justify-center gap-3 bg-brand-50 hover:bg-brand-100 text-brand-700 p-8 rounded-[2rem] border-2 border-dashed border-brand-200 cursor-pointer transition-colors group">
                <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                  <Upload className="w-6 h-6 text-brand-600" />
                </div>
                <div className="text-center">
                  <span className="font-black text-xl block mb-1">Subir Archivo .CSV</span>
                  <span className="font-medium text-brand-600/70 text-sm">Hacé click acá para cargar tu archivo de Excel guardado como CSV</span>
                </div>
                <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
              </label>
            </div>

            <p className="text-slate-500 mb-6 font-medium">O si preferís, pegá los datos manualmente en el cuadro de abajo. Si el SKU coincide, se actualiza el producto.</p>
            
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
              {importStatus && <div className={`p-4 rounded-2xl text-xs font-bold text-center ${importErrors.length > 0 ? 'bg-red-600 text-white shadow-xl shadow-red-600/20' : 'bg-slate-900 text-white shadow-xl shadow-slate-900/20'}`}>{importStatus}</div>}
              {importErrors.length > 0 && (
                <div className="flex flex-col gap-3 animate-in fade-in slide-in-from-top-4 duration-300">
                  <div className="bg-red-50 text-red-700 p-4 rounded-2xl border border-red-100 max-h-48 overflow-y-auto text-[11px] font-mono leading-relaxed shadow-inner">
                    {importErrors.map((err, idx) => (
                      <div key={idx} className="mb-1 border-b border-red-100/50 pb-1 last:border-0">{err}</div>
                    ))}
                  </div>
                  <button
                    onClick={() => {
                      const blob = new Blob(["ERRORES DE CARGA MASIVA\n========================\n\n" + importErrors.join("\n")], { type: 'text/plain;charset=utf-8;' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `log_errores_importacion_${new Date().toISOString().split('T')[0]}.txt`;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(url);
                    }}
                    className="self-end px-5 py-2.5 bg-white text-red-600 border border-red-200 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-red-50 hover:border-red-300 transition-all flex items-center gap-2"
                  >
                    <Download className="w-4 h-4" /> Descargar Log Completo
                  </button>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Button onClick={handleMassUpdate} className="w-full py-8 text-lg font-black rounded-2xl shadow-2xl shadow-brand-600/20" disabled={submittingType !== null}>
                  {submittingType === 'manual' ? <Loader2 className="animate-spin" /> : <Upload className="mr-2" />}
                  Procesar CSV Manual
                </Button>
                <Button onClick={handleGoogleSheetsSync} className="w-full py-8 text-lg font-black bg-green-600 hover:bg-green-700 rounded-2xl shadow-2xl shadow-green-600/20" disabled={submittingType !== null}>
                  {submittingType === 'sheets' ? <Loader2 className="animate-spin" /> : <RefreshCw className="mr-2" />}
                  Sincronizar Google Sheets
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="max-w-2xl">
          <div className="bg-white p-10 rounded-[2.5rem] shadow-2xl border border-slate-100">
            <h2 className="text-3xl font-black text-slate-900 mb-8 tracking-tighter">Ajustes de Landings</h2>
            <form onSubmit={handleSettingsSubmit} className="space-y-12">
              
              {/* Sección Landing Principal */}
              <div className="space-y-6 bg-slate-50/50 p-6 rounded-3xl border border-slate-100">
                <div className="border-b border-slate-200 pb-4 mb-6">
                  <h3 className="text-xl font-black text-slate-800">Landing Principal (Inicio)</h3>
                  <p className="text-slate-500 text-sm font-medium">Sitio web general y catálogo</p>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-brand-500 uppercase tracking-[0.2em] mb-4">Orden y Visibilidad de Categorías</label>
                  <div className="flex flex-col gap-2 mb-6 p-4 rounded-2xl bg-white border border-slate-200 shadow-sm">
                    {landingCategories.map((cat, index) => (
                      <div
                        key={cat}
                        draggable
                        onDragStart={(e) => e.dataTransfer.setData("text/plain", index.toString())}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          const fromIndex = parseInt(e.dataTransfer.getData("text/plain"));
                          if (isNaN(fromIndex)) return;
                          const newCats = [...landingCategories];
                          const [movedItem] = newCats.splice(fromIndex, 1);
                          newCats.splice(index, 0, movedItem);
                          setLandingCategories(newCats);
                        }}
                        className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-slate-800 font-bold flex items-center justify-between cursor-move shadow-sm active:scale-[0.98] transition-transform"
                      >
                        <div className="flex items-center gap-3">
                          <Menu className="w-5 h-5 text-slate-400" />
                          {cat}
                        </div>
                        <button
                          type="button"
                          onClick={() => setLandingCategories(prev => prev.filter(c => c !== cat))}
                          className="text-slate-400 hover:text-red-500 transition-colors p-1"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    {landingCategories.length === 0 && (
                       <div className="p-4 rounded-xl border-2 border-dashed border-slate-200 text-slate-400 text-center font-bold text-sm">
                         Ninguna categoría ordenable fijada. Se muestran todas por orden alfabético.
                       </div>
                    )}
                  </div>
                  
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Categorías Ocultas (Agregar al inicio)</label>
                  <div className="flex flex-wrap gap-2">
                    {Array.from(new Set(products.map(p => p.category)))
                      .filter(cat => !landingCategories.includes(cat))
                      .sort()
                      .map(cat => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setLandingCategories(prev => [...prev, cat])}
                          className="px-4 py-2 rounded-xl text-xs font-bold border bg-white text-slate-400 border-slate-200 hover:bg-slate-50 hover:text-brand-600 transition-colors flex items-center gap-2"
                        >
                           <Plus className="w-3 h-3" /> {cat}
                        </button>
                      ))}
                  </div>
                </div>
              </div>

              {/* Sección Landing Tanques */}
              <div className="space-y-6 bg-blue-50/30 p-6 rounded-3xl border border-blue-100/50">
                <div className="border-b border-blue-100 pb-4 mb-6">
                  <h3 className="text-xl font-black text-blue-900">Landing Específica (Tanques)</h3>
                  <p className="text-blue-600/70 text-sm font-medium">Página promocional exclusiva para ventas de agua</p>
                </div>

                <div className="mb-6">
                  <label className="block text-[10px] font-black text-blue-500 uppercase tracking-[0.2em] mb-4">Producto destacado Principal (Hero)</label>
                  <select
                    value={landingProductId}
                    onChange={(e) => setLandingProductId(e.target.value)}
                    className="w-full px-5 py-4 rounded-2xl border border-blue-200 focus:ring-4 focus:ring-blue-500/10 bg-white font-bold text-slate-700 outline-none"
                  >
                    <option value="">Selección Automática (Más caro)</option>
                    {products.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-blue-500 uppercase tracking-[0.2em] mb-4">Categorías Visibles en Tanques (Arrastrá para ordenar)</label>
                  <div className="flex flex-col gap-2 mb-6 p-4 rounded-2xl bg-white border border-blue-100 shadow-sm">
                    {tanquesCategories.map((cat, index) => (
                      <div
                        key={cat}
                        draggable
                        onDragStart={(e) => e.dataTransfer.setData("text/plain", "t-" + index.toString())}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          const transferData = e.dataTransfer.getData("text/plain");
                          if (!transferData.startsWith("t-")) return;
                          const fromIndex = parseInt(transferData.replace("t-", ""));
                          if (isNaN(fromIndex)) return;
                          const newCats = [...tanquesCategories];
                          const [movedItem] = newCats.splice(fromIndex, 1);
                          newCats.splice(index, 0, movedItem);
                          setTanquesCategories(newCats);
                        }}
                        className="bg-blue-50/50 p-3 rounded-xl border border-blue-100 text-blue-900 font-bold flex items-center justify-between cursor-move shadow-sm active:scale-[0.98] transition-transform"
                      >
                        <div className="flex items-center gap-3">
                          <Menu className="w-5 h-5 text-blue-300" />
                          {cat}
                        </div>
                        <button
                          type="button"
                          onClick={() => setTanquesCategories(prev => prev.filter(c => c !== cat))}
                          className="text-blue-300 hover:text-red-500 transition-colors p-1"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    {tanquesCategories.length === 0 && (
                       <div className="p-4 rounded-xl border-2 border-dashed border-blue-200 text-blue-400 text-center font-bold text-sm">
                         Ninguna categoría elegida. Se mostrarán TODAS las de la tienda por defecto.
                       </div>
                    )}
                  </div>
                  
                  <label className="block text-[10px] font-black text-blue-400 uppercase tracking-[0.2em] mb-4">Agregar Categorías a Landing Tanques</label>
                  <div className="flex flex-wrap gap-2">
                    {Array.from(new Set(products.map(p => p.category)))
                      .filter(cat => !tanquesCategories.includes(cat))
                      .sort()
                      .map(cat => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setTanquesCategories(prev => [...prev, cat])}
                          className="px-4 py-2 rounded-xl text-xs font-bold border bg-white text-blue-500 border-blue-200 hover:bg-blue-50 transition-colors flex items-center gap-2"
                        >
                           <Plus className="w-3 h-3" /> {cat}
                        </button>
                      ))}
                  </div>
                </div>
              </div>
              
              <Button type="submit" disabled={savingSettings} className="w-full py-8 text-lg shadow-xl shadow-brand-600/20 font-black rounded-[2rem]">
                {savingSettings ? <Loader2 className="animate-spin" /> : "Guardar Configuración"}
              </Button>
            </form>

            <div className="mt-12 pt-12 border-t border-slate-200">
              <div className="bg-red-50/50 p-8 rounded-[2rem] border border-red-100">
                <div className="mb-6">
                  <h3 className="text-2xl font-black text-red-900 flex items-center gap-2">
                    Mantenimiento de Base de Datos
                  </h3>
                  <p className="text-red-700/80 font-medium mt-2">Acciones destructivas para limpiar o reparar el catálogo general.</p>
                </div>
                
                <div className="bg-white p-6 rounded-3xl border border-red-100 shadow-sm flex flex-col gap-4">
                  <div>
                    <h4 className="font-bold text-slate-900 mb-1">Limpiar Productos Duplicados</h4>
                    <p className="text-sm text-slate-500 font-medium">Agrupa productos con el mismo SKU y elimina los que tengan menor información (sin fotos, internos o sin descripción). Mantiene intacto el mejor producto de cada grupo.</p>
                  </div>
                  
                  {cleanupResult && (
                    <div className={`p-4 rounded-xl text-sm font-bold ${cleanupResult.isError ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                      {cleanupResult.message}
                    </div>
                  )}

                  <button 
                    onClick={handleCleanDuplicates}
                    disabled={cleaningDuplicates}
                    className="w-full sm:w-auto self-start px-6 py-4 bg-red-100 text-red-700 hover:bg-red-600 hover:text-white rounded-2xl font-black uppercase tracking-widest text-xs transition-all flex items-center gap-2 disabled:opacity-50"
                  >
                    {cleaningDuplicates ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    Ejecutar Limpieza
                  </button>
                </div>
              </div>
            </div>
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

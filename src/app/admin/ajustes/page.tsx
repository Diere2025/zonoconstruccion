"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { 
  Plus, 
  Trash2, 
  X, 
  Loader2, 
  Menu, 
  Globe, 
  CreditCard, 
  Database, 
  Phone, 
  Link as LinkIcon, 
  Megaphone, 
  Users, 
  Check, 
  AlertCircle,
  ToggleLeft,
  ToggleRight,
  Pencil,
  Settings
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Product } from "@/types";

interface Seller {
  id: string;
  full_name: string;
  role: string;
  is_active: boolean;
}

interface PhoneLine {
  id: string;
  name: string;
  phone_number: string;
  is_active: boolean;
  seller_id?: string | null; // For backward compatibility
  seller_phone_lines?: { seller_id: string }[];
}

interface OrderMedium {
  id: string;
  name: string;
  requires_phone_line: boolean;
  is_active: boolean;
}

interface AdvertisingSource {
  id: string;
  name: string;
  is_active: boolean;
}

export default function AjustesPage() {
  const [mainTab, setMainTab] = useState<"general" | "payments" | "reception" | "maintenance">("general");
  const [receptionSubTab, setReceptionSubTab] = useState<"lines" | "mediums" | "sources">("lines");

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  
  // General & Landings Settings State
  const [aboutImageUrl, setAboutImageUrl] = useState('');
  const [settingsFile, setSettingsFile] = useState<File | null>(null);
  const [landingProductId, setLandingProductId] = useState('');
  const [landingCategories, setLandingCategories] = useState<string[]>([]);
  const [tanquesCategories, setTanquesCategories] = useState<string[]>([]);

  // Payment Methods State
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [newPmName, setNewPmName] = useState("");
  const [newPmSurcharge, setNewPmSurcharge] = useState(0);
  const [newPmInstallments, setNewPmInstallments] = useState(1);

  // Reception Parameters State
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [phoneLines, setPhoneLines] = useState<PhoneLine[]>([]);
  const [orderMediums, setOrderMediums] = useState<OrderMedium[]>([]);
  const [advertisingSources, setAdvertisingSources] = useState<AdvertisingSource[]>([]);

  // Forms states for Reception
  const [newLineName, setNewLineName] = useState("");
  const [newLineNumber, setNewLineNumber] = useState("");
  const [savingLine, setSavingLine] = useState(false);

  const [newMediumName, setNewMediumName] = useState("");
  const [newMediumRequiresPhone, setNewMediumRequiresPhone] = useState(false);
  const [savingMedium, setSavingMedium] = useState(false);

  const [newSourceName, setNewSourceName] = useState("");
  const [savingSource, setSavingSource] = useState(false);

  // Edit states for Reception
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [editingLineName, setEditingLineName] = useState("");
  const [editingLineNumber, setEditingLineNumber] = useState("");
  const [savingLineEdit, setSavingLineEdit] = useState(false);

  const [editingMediumId, setEditingMediumId] = useState<string | null>(null);
  const [editingMediumName, setEditingMediumName] = useState("");
  const [savingMediumEdit, setSavingMediumEdit] = useState(false);

  const [editingSourceId, setEditingSourceId] = useState<string | null>(null);
  const [editingSourceName, setEditingSourceName] = useState("");
  const [savingSourceEdit, setSavingSourceEdit] = useState(false);

  // DB Maintenance State
  const [cleaningDuplicates, setCleaningDuplicates] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<{message: string, isError: boolean} | null>(null);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const [
          prodRes,
          pmRes,
          sellersRes,
          linesRes,
          mediumsRes,
          sourcesRes
        ] = await Promise.all([
          supabase.from('products').select('*').order('name'),
          supabase.from('payment_methods').select('*').order('name'),
          supabase.from("sellers").select("id, full_name, role, is_active").order("full_name"),
          supabase.from("phone_lines").select("*, seller_phone_lines(seller_id)").order("name"),
          supabase.from("order_mediums").select("*").order("name"),
          supabase.from("advertising_sources").select("*").order("name")
        ]);

        if (prodRes.data) setProducts(prodRes.data);
        if (pmRes.data) setPaymentMethods(pmRes.data);
        if (sellersRes.data) setSellers(sellersRes.data);
        if (linesRes.data) setPhoneLines(linesRes.data);
        if (mediumsRes.data) setOrderMediums(mediumsRes.data);
        if (sourcesRes.data) setAdvertisingSources(sourcesRes.data);

        // Fetch site settings
        const { data: settingsData } = await supabase
          .from('site_settings')
          .select('*')
          .in('id', ['landing_categories', 'tanques_categories', 'landing_hero_product_id', 'about_image_url']);

        if (settingsData) {
          const landingProd = settingsData.find(s => s.id === 'landing_hero_product_id');
          const aboutImg = settingsData.find(s => s.id === 'about_image_url');
          const landingCats = settingsData.find(s => s.id === 'landing_categories');
          const tanquesCats = settingsData.find(s => s.id === 'tanques_categories');

          if (landingProd && landingProd.value) setLandingProductId(landingProd.value);
          if (aboutImg && aboutImg.value) setAboutImageUrl(aboutImg.value);
          if (landingCats && landingCats.value) setLandingCategories(landingCats.value.split(',').filter(Boolean));
          if (tanquesCats && tanquesCats.value) setTanquesCategories(tanquesCats.value.split(',').filter(Boolean));
        }
      } catch (err) {
        console.error("Error cargando datos de configuración:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // --- Payment Methods Helpers ---
  const refreshPaymentMethods = async () => {
    const { data } = await supabase.from('payment_methods').select('*').order('name');
    if (data) setPaymentMethods(data);
  };

  const handleTogglePaymentMethodActive = async (id: string, currentStatus: boolean) => {
    setPaymentMethods(prev => prev.map(pm => pm.id === id ? { ...pm, is_active: !currentStatus } : pm));
    const { error } = await supabase
      .from('payment_methods')
      .update({ is_active: !currentStatus })
      .eq('id', id);
    if (error) {
      alert("Error al cambiar estado del medio de pago: " + error.message);
      await refreshPaymentMethods();
    }
  };

  const handleSetPaymentMethodDefault = async (id: string) => {
    setPaymentMethods(prev => prev.map(pm => ({ ...pm, is_default: pm.id === id })));
    await supabase.from('payment_methods').update({ is_default: false }).neq('id', id);
    const { error } = await supabase.from('payment_methods').update({ is_default: true }).eq('id', id);
    if (error) {
      alert("Error al establecer medio de pago por defecto: " + error.message);
      await refreshPaymentMethods();
    }
  };

  const handleAddPaymentMethod = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPmName.trim()) return;
    
    const { data, error } = await supabase
      .from('payment_methods')
      .insert({
        name: newPmName.trim(),
        surcharge_percentage: newPmSurcharge,
        installments: newPmInstallments,
        is_active: true,
        is_default: false
      })
      .select()
      .single();
      
    if (error) {
      alert("Error al agregar medio de pago: " + error.message);
    } else if (data) {
      setPaymentMethods(prev => [...prev, data]);
      setNewPmName("");
      setNewPmSurcharge(0);
      setNewPmInstallments(1);
    }
  };

  // --- General Settings Submit ---
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
      }
    } catch (err) {
      console.error("Error crítico en ajustes:", err);
      alert("Error inesperado en los ajustes.");
    } finally {
      setSavingSettings(false);
    }
  };

  // --- DB Maintenance Helpers ---
  const handleCleanDuplicates = async () => {
    if (!confirm("Esto agrupará todos los productos por SKU y eliminará los duplicados manteniendo el que tenga mejor información. ¿Estás seguro?")) return;
    
    setCleaningDuplicates(true);
    setCleanupResult(null);
    try {
      const { data: allProducts, error } = await supabase.from('products').select('*');
      if (error) throw error;
      if (!allProducts) return;

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
          const scoredGroup = group.map(p => {
            let score = 0;
            if (p.image_url) score += 10;
            if (p.category !== 'Interno') score += 5;
            if (!p.name.includes('[Interno]')) score += 5;
            if (p.description) score += 1;
            if (p.brand) score += 1;
            return { product: p, score };
          });

          scoredGroup.sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            return a.product.id < b.product.id ? -1 : 1;
          });

          const toDelete = scoredGroup.slice(1);
          
          for (const item of toDelete) {
            await supabase.from('products').delete().eq('id', item.product.id);
            deletedCount++;
          }
        }
      }

      setCleanupResult({ message: `¡Limpieza exitosa! Se eliminaron ${deletedCount} productos duplicados.`, isError: false });
    } catch (e: any) {
      setCleanupResult({ message: `Error al limpiar duplicados: ${e.message}`, isError: true });
    } finally {
      setCleaningDuplicates(false);
    }
  };

  // --- Reception Settings Helpers ---
  const refreshPhoneLines = async () => {
    const { data } = await supabase.from("phone_lines").select("*, seller_phone_lines(seller_id)").order("name");
    if (data) setPhoneLines(data);
  };

  const refreshMediums = async () => {
    const { data } = await supabase.from("order_mediums").select("*").order("name");
    if (data) setOrderMediums(data);
  };

  const refreshSources = async () => {
    const { data } = await supabase.from("advertising_sources").select("*").order("name");
    if (data) setAdvertisingSources(data);
  };

  const handleAddPhoneLine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLineName.trim() || !newLineNumber.trim()) return;

    setSavingLine(true);
    try {
      const { error } = await supabase.from("phone_lines").insert({
        name: newLineName.trim(),
        phone_number: newLineNumber.trim(),
        is_active: true
      });

      if (error) throw error;

      setNewLineName("");
      setNewLineNumber("");
      await refreshPhoneLines();
    } catch (err: any) {
      alert("Error al agregar línea: " + err.message);
    } finally {
      setSavingLine(false);
    }
  };

  const handleToggleLineActive = async (id: string, currentStatus: boolean) => {
    setPhoneLines(prev => prev.map(line => line.id === id ? { ...line, is_active: !currentStatus } : line));
    const { error } = await supabase.from("phone_lines").update({ is_active: !currentStatus }).eq("id", id);
    if (error) {
      alert("Error al cambiar estado: " + error.message);
      await refreshPhoneLines();
    }
  };

  const handleDeletePhoneLine = async (id: string, name: string) => {
    if (!confirm(`¿Estás seguro de eliminar la línea "${name}"? Esto removerá todas sus asociaciones.`)) return;

    try {
      const { error } = await supabase.from("phone_lines").delete().eq("id", id);
      if (error) throw error;
      await refreshPhoneLines();
    } catch (err: any) {
      alert("Error al eliminar línea: " + err.message);
    }
  };

  const handleStartEditLine = (line: PhoneLine) => {
    setEditingLineId(line.id);
    setEditingLineName(line.name);
    setEditingLineNumber(line.phone_number);
  };

  const handleSaveEditLine = async (id: string) => {
    if (!editingLineName.trim() || !editingLineNumber.trim()) return;
    setSavingLineEdit(true);
    try {
      const { error } = await supabase
        .from("phone_lines")
        .update({ name: editingLineName.trim(), phone_number: editingLineNumber.trim() })
        .eq("id", id);
      if (error) throw error;
      setEditingLineId(null);
      await refreshPhoneLines();
    } catch (err: any) {
      alert("Error al actualizar la línea: " + err.message);
    } finally {
      setSavingLineEdit(false);
    }
  };

  const handleAssociateSeller = async (lineId: string, sellerId: string) => {
    if (!sellerId) return;
    try {
      const { error } = await supabase.from("seller_phone_lines").insert({
        phone_line_id: lineId,
        seller_id: sellerId
      });
      if (error) throw error;
      await refreshPhoneLines();
    } catch (err: any) {
      alert("Error al asociar vendedor: " + err.message);
    }
  };

  const handleRemoveSellerAssociation = async (lineId: string, sellerId: string) => {
    try {
      const { error } = await supabase
        .from("seller_phone_lines")
        .delete()
        .eq("phone_line_id", lineId)
        .eq("seller_id", sellerId);
      if (error) throw error;
      await refreshPhoneLines();
    } catch (err: any) {
      alert("Error al remover asociación: " + err.message);
    }
  };

  const handleAddMedium = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMediumName.trim()) return;

    setSavingMedium(true);
    try {
      const { error } = await supabase.from("order_mediums").insert({
        name: newMediumName.trim(),
        requires_phone_line: newMediumRequiresPhone,
        is_active: true
      });

      if (error) throw error;

      setNewMediumName("");
      setNewMediumRequiresPhone(false);
      await refreshMediums();
    } catch (err: any) {
      alert("Error al agregar medio: " + err.message);
    } finally {
      setSavingMedium(false);
    }
  };

  const handleToggleMediumActive = async (id: string, currentStatus: boolean) => {
    setOrderMediums(prev => prev.map(m => m.id === id ? { ...m, is_active: !currentStatus } : m));
    const { error } = await supabase.from("order_mediums").update({ is_active: !currentStatus }).eq("id", id);
    if (error) {
      alert("Error al cambiar estado: " + error.message);
      await refreshMediums();
    }
  };

  const handleToggleMediumRequiresPhone = async (id: string, currentStatus: boolean) => {
    setOrderMediums(prev => prev.map(m => m.id === id ? { ...m, requires_phone_line: !currentStatus } : m));
    const { error } = await supabase.from("order_mediums").update({ requires_phone_line: !currentStatus }).eq("id", id);
    if (error) {
      alert("Error al cambiar requerimiento de línea: " + error.message);
      await refreshMediums();
    }
  };

  const handleDeleteMedium = async (id: string, name: string) => {
    if (!confirm(`¿Estás seguro de eliminar el medio "${name}"?`)) return;

    try {
      const { error } = await supabase.from("order_mediums").delete().eq("id", id);
      if (error) throw error;
      await refreshMediums();
    } catch (err: any) {
      alert("Error al eliminar medio: " + err.message);
    }
  };

  const handleStartEditMedium = (medium: OrderMedium) => {
    setEditingMediumId(medium.id);
    setEditingMediumName(medium.name);
  };

  const handleSaveEditMedium = async (id: string) => {
    if (!editingMediumName.trim()) return;
    setSavingMediumEdit(true);
    try {
      const { error } = await supabase
        .from("order_mediums")
        .update({ name: editingMediumName.trim() })
        .eq("id", id);
      if (error) throw error;
      setEditingMediumId(null);
      await refreshMediums();
    } catch (err: any) {
      alert("Error al actualizar el medio: " + err.message);
    } finally {
      setSavingMediumEdit(false);
    }
  };

  const handleAddSource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSourceName.trim()) return;

    setSavingSource(true);
    try {
      const { error } = await supabase.from("advertising_sources").insert({
        name: newSourceName.trim(),
        is_active: true
      });

      if (error) throw error;

      setNewSourceName("");
      await refreshSources();
    } catch (err: any) {
      alert("Error al agregar procedencia: " + err.message);
    } finally {
      setSavingSource(false);
    }
  };

  const handleToggleSourceActive = async (id: string, currentStatus: boolean) => {
    setAdvertisingSources(prev => prev.map(s => s.id === id ? { ...s, is_active: !currentStatus } : s));
    const { error } = await supabase.from("advertising_sources").update({ is_active: !currentStatus }).eq("id", id);
    if (error) {
      alert("Error al cambiar estado: " + error.message);
      await refreshSources();
    }
  };

  const handleDeleteSource = async (id: string, name: string) => {
    if (!confirm(`¿Estás seguro de eliminar la procedencia "${name}"?`)) return;

    try {
      const { error } = await supabase.from("advertising_sources").delete().eq("id", id);
      if (error) throw error;
      await refreshSources();
    } catch (err: any) {
      alert("Error al eliminar procedencia: " + err.message);
    }
  };

  const handleStartEditSource = (source: AdvertisingSource) => {
    setEditingSourceId(source.id);
    setEditingSourceName(source.name);
  };

  const handleSaveEditSource = async (id: string) => {
    if (!editingSourceName.trim()) return;
    setSavingSourceEdit(true);
    try {
      const { error } = await supabase
        .from("advertising_sources")
        .update({ name: editingSourceName.trim() })
        .eq("id", id);
      if (error) throw error;
      setEditingSourceId(null);
      await refreshSources();
    } catch (err: any) {
      alert("Error al actualizar la procedencia: " + err.message);
    } finally {
      setSavingSourceEdit(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-10 h-10 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header Standard ERP */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
            <Settings className="w-6 h-6 text-brand-600 shrink-0" />
            Configuración General
          </h1>
          <p className="text-xs font-semibold text-slate-500 mt-0.5">
            Administración de landings, medios de pago, parámetros de recepción y mantenimiento del sistema
          </p>
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <div className="flex items-center gap-1.5 p-1 bg-slate-100 border border-slate-200/80 rounded-xl overflow-x-auto">
        <button
          type="button"
          onClick={() => setMainTab("general")}
          className={`flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
            mainTab === "general"
              ? "bg-white text-brand-600 shadow-sm font-black"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
          }`}
        >
          <Globe className="w-4 h-4" />
          General y Landings
        </button>
        <button
          type="button"
          onClick={() => setMainTab("payments")}
          className={`flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
            mainTab === "payments"
              ? "bg-white text-brand-600 shadow-sm font-black"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
          }`}
        >
          <CreditCard className="w-4 h-4" />
          Medios de Pago
        </button>
        <button
          type="button"
          onClick={() => setMainTab("reception")}
          className={`flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
            mainTab === "reception"
              ? "bg-white text-brand-600 shadow-sm font-black"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
          }`}
        >
          <Phone className="w-4 h-4" />
          Parámetros de Recepción
        </button>
        <button
          type="button"
          onClick={() => setMainTab("maintenance")}
          className={`flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
            mainTab === "maintenance"
              ? "bg-white text-brand-600 shadow-sm font-black"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
          }`}
        >
          <Database className="w-4 h-4" />
          Mantenimiento BD
        </button>
      </div>

      {/* TAB 1: GENERAL & LANDINGS */}
      {mainTab === "general" && (
        <div className="animate-in fade-in duration-200 space-y-6 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <h2 className="text-xl font-black text-slate-900 tracking-tight">Ajustes de Landings y Contenido</h2>
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
                          className="text-slate-400 hover:text-red-500 transition-colors p-1 text-slate-400"
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
                    className="w-full px-5 py-4 rounded-2xl border border-blue-200 focus:ring-4 focus:ring-blue-500/10 bg-white font-bold text-slate-700 outline-none animate-none"
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
          </div>
        )}

        {/* TAB 2: PAYMENT METHODS */}
        {mainTab === "payments" && (
          <div className="animate-in fade-in duration-200 space-y-6">
            <h2 className="text-3xl font-black text-slate-900 mb-6 tracking-tighter">Medios de Pago y Recargos</h2>
            
            <div className="space-y-6 bg-slate-50/50 p-6 rounded-3xl border border-slate-100">
              <div className="border-b border-slate-200 pb-4 mb-6">
                <h3 className="text-xl font-black text-slate-800">Planes y Medios de Pago</h3>
                <p className="text-slate-500 text-sm font-medium">Controla cuáles planes y recargos están vigentes en el sistema</p>
              </div>

              {/* Formulario Agregar Medio de Pago */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                <span className="block font-black text-slate-800 text-[10px] uppercase tracking-wider">Agregar Nuevo Medio de Pago</span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-[9px] font-black text-slate-400 uppercase">Nombre / Descripción</span>
                    <input
                      type="text"
                      placeholder="Ej. Cuota Simple (Abr-26)"
                      value={newPmName}
                      onChange={(e) => setNewPmName(e.target.value)}
                      className="px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/10 text-xs font-bold bg-slate-50 text-slate-700"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[9px] font-black text-slate-400 uppercase">Recargo (%)</span>
                    <input
                      type="number"
                      placeholder="Ej. 34"
                      value={newPmSurcharge}
                      onChange={(e) => setNewPmSurcharge(Number(e.target.value))}
                      className="px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/10 text-xs font-bold bg-slate-50 text-slate-700"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[9px] font-black text-slate-400 uppercase">Cuotas por Defecto</span>
                    <input
                      type="number"
                      placeholder="Ej. 6"
                      value={newPmInstallments}
                      onChange={(e) => setNewPmInstallments(Number(e.target.value))}
                      className="px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/10 text-xs font-bold bg-slate-50 text-slate-700"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => handleAddPaymentMethod(e)}
                  className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-black uppercase tracking-widest text-[9px] transition-all flex items-center gap-1.5 shadow-md shadow-brand-600/10 self-start cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Agregar Medio de Pago
                </button>
              </div>

              {/* Listado de Medios de Pago */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left table-fixed">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        <th className="px-4 py-2 text-[9px] font-black uppercase tracking-wider text-slate-400 w-1/2">Medio de Pago</th>
                        <th className="px-3 py-2 text-[9px] font-black uppercase tracking-wider text-slate-400 text-center w-20">Recargo</th>
                        <th className="px-3 py-2 text-[9px] font-black uppercase tracking-wider text-slate-400 text-center w-20">Cuotas</th>
                        <th className="px-3 py-2 text-[9px] font-black uppercase tracking-wider text-slate-400 text-center w-20">Vigente</th>
                        <th className="px-3 py-2 text-[9px] font-black uppercase tracking-wider text-slate-400 text-center w-28">Por Defecto</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {paymentMethods.map((pm) => (
                        <tr key={pm.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-4 py-2.5 text-xs font-bold text-slate-800 truncate">
                            {pm.name}
                          </td>
                          <td className="px-3 py-2.5 text-xs font-extrabold text-red-500 text-center">
                            {pm.surcharge_percentage}%
                          </td>
                          <td className="px-3 py-2.5 text-xs font-bold text-slate-600 text-center">
                            {pm.installments}
                          </td>
                          <td className="px-3 py-2.5 text-center animate-none">
                            <input
                              type="checkbox"
                              checked={pm.is_active}
                              onChange={() => handleTogglePaymentMethodActive(pm.id, pm.is_active)}
                              className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500/10 cursor-pointer accent-brand-600"
                              title="Habilitar/Deshabilitar este medio de pago"
                            />
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            {pm.id === "a3a890a8-b677-4b7b-8ffb-d36c2e7b5ad3" || pm.name.toLowerCase().includes("efectivo") ? (
                              <span className="text-[8px] font-bold text-slate-400 uppercase">Fijo Efectivo</span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleSetPaymentMethodDefault(pm.id)}
                                className={`px-2 py-1 rounded-md text-[8px] font-black uppercase tracking-wider transition-all border ${
                                  pm.is_default 
                                    ? 'bg-brand-50 border-brand-200 text-brand-700 font-extrabold shadow-sm' 
                                    : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'
                                }`}
                              >
                                {pm.is_default ? "Vigente default" : "Marcar default"}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: RECEPTION PARAMETERS */}
        {mainTab === "reception" && (
          <div className="animate-in fade-in duration-200 space-y-6">
            <h2 className="text-3xl font-black text-slate-900 mb-4 tracking-tighter">Parámetros de Recepción</h2>
            <p className="text-slate-500 font-semibold text-xs mb-6 uppercase tracking-wider text-brand-600">
              Gestión de Medios, Líneas y Canales de Ingreso de Pedidos
            </p>

            {/* Custom Reception SubTabs Navigation */}
            <div className="flex border-b border-slate-200 mb-8 p-1 bg-slate-50 rounded-2xl max-w-md">
              <button
                type="button"
                onClick={() => setReceptionSubTab("lines")}
                className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-black uppercase tracking-wider rounded-xl transition-all ${
                  receptionSubTab === "lines"
                    ? "bg-white text-brand-600 shadow-sm border border-slate-200/50"
                    : "text-slate-400 hover:text-slate-700"
                }`}
              >
                <Phone className="w-4 h-4" />
                Líneas Telefónicas
              </button>
              <button
                type="button"
                onClick={() => setReceptionSubTab("mediums")}
                className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-black uppercase tracking-wider rounded-xl transition-all ${
                  receptionSubTab === "mediums"
                    ? "bg-white text-brand-600 shadow-sm border border-slate-200/50"
                    : "text-slate-400 hover:text-slate-700"
                }`}
              >
                <LinkIcon className="w-4 h-4" />
                Medios
              </button>
            </div>

            {/* SUBTAB 1: LÍNEAS TELEFÓNICAS */}
            {receptionSubTab === "lines" && (
              <div className="space-y-8 animate-in fade-in duration-200">
                {/* Create Form */}
                <form onSubmit={handleAddPhoneLine} className="bg-slate-50/50 p-6 rounded-3xl border border-slate-100 space-y-4">
                  <span className="block font-black text-slate-800 text-[10px] uppercase tracking-wider">Agregar Nueva Línea Telefónica</span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[9px] font-black text-slate-400 uppercase">Nombre de la Línea</span>
                      <input
                        type="text"
                        required
                        placeholder="Ej. WhatsApp Ventas 1"
                        value={newLineName}
                        onChange={(e) => setNewLineName(e.target.value)}
                        className="px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-4 focus:ring-brand-500/10 text-xs font-bold bg-white text-slate-700"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[9px] font-black text-slate-400 uppercase">Número telefónico</span>
                      <input
                        type="text"
                        required
                        placeholder="Ej. +54 9 11 1234 5678"
                        value={newLineNumber}
                        onChange={(e) => setNewLineNumber(e.target.value)}
                        className="px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-4 focus:ring-brand-500/10 text-xs font-bold bg-white text-slate-700"
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={savingLine}
                    className="px-5 py-3 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-black uppercase tracking-widest text-[9px] transition-all flex items-center gap-1.5 shadow-md shadow-brand-600/10 self-start cursor-pointer"
                  >
                    {savingLine ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    Guardar Línea
                  </button>
                </form>

                {/* List Table */}
                <div className="bg-white rounded-[2rem] border border-slate-200/80 shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100">
                          <th className="px-5 py-4 text-[9px] font-black uppercase tracking-wider text-slate-400 w-1/4">Línea</th>
                          <th className="px-5 py-4 text-[9px] font-black uppercase tracking-wider text-slate-400 w-1/5">Número</th>
                          <th className="px-5 py-4 text-[9px] font-black uppercase tracking-wider text-slate-400 text-center w-24">Vigente</th>
                          <th className="px-5 py-4 text-[9px] font-black uppercase tracking-wider text-slate-400 w-2/5">Vendedores Asociados (N a N)</th>
                          <th className="px-5 py-4 text-[9px] font-black uppercase tracking-wider text-slate-400 text-center w-20">Acción</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {phoneLines.map((line) => {
                          const associatedSellers = (line.seller_phone_lines || []).map(spl => 
                            sellers.find(s => s.id === spl.seller_id)
                          ).filter(Boolean) as Seller[];

                          const nonAssociatedSellers = sellers.filter(s => 
                            s.is_active && !(line.seller_phone_lines || []).some(spl => spl.seller_id === s.id)
                          );

                          const isEditing = line.id === editingLineId;

                          return (
                            <tr key={line.id} className="hover:bg-slate-50/50 transition-colors align-top">
                              <td className="px-5 py-4 font-bold text-xs text-slate-800">
                                {isEditing ? (
                                  <input
                                    type="text"
                                    value={editingLineName}
                                    onChange={(e) => setEditingLineName(e.target.value)}
                                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-bold w-full bg-slate-50 text-slate-700 outline-none"
                                  />
                                ) : (
                                  line.name
                                )}
                              </td>
                              <td className="px-5 py-4 text-xs font-extrabold text-slate-600">
                                {isEditing ? (
                                  <input
                                    type="text"
                                    value={editingLineNumber}
                                    onChange={(e) => setEditingLineNumber(e.target.value)}
                                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-bold w-full bg-slate-50 text-slate-700 outline-none"
                                  />
                                ) : (
                                  line.phone_number
                                )}
                              </td>
                              <td className="px-5 py-4 text-center">
                                <button
                                  type="button"
                                  disabled={isEditing}
                                  onClick={() => handleToggleLineActive(line.id, line.is_active)}
                                  className="focus:outline-none transition-transform active:scale-95 inline-block cursor-pointer disabled:opacity-50"
                                >
                                  {line.is_active ? (
                                    <ToggleRight className="w-10 h-10 text-emerald-500 animate-none" />
                                  ) : (
                                    <ToggleLeft className="w-10 h-10 text-slate-300 animate-none" />
                                  )}
                                </button>
                              </td>
                              <td className="px-5 py-4 space-y-3">
                                {/* Seller Badges */}
                                <div className="flex flex-wrap gap-1.5 animate-none">
                                  {associatedSellers.map(seller => (
                                    <span 
                                      key={seller.id} 
                                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-brand-50 border border-brand-100 text-brand-700 rounded-lg text-[10px] font-extrabold"
                                    >
                                      {seller.full_name}
                                      <button
                                        type="button"
                                        disabled={isEditing}
                                        onClick={() => handleRemoveSellerAssociation(line.id, seller.id)}
                                        className="text-brand-400 hover:text-red-600 transition-colors p-0.5 cursor-pointer disabled:opacity-50"
                                        title="Remover vendedor"
                                      >
                                        <X className="w-2.5 h-2.5" />
                                      </button>
                                    </span>
                                  ))}
                                  {associatedSellers.length === 0 && !line.seller_id && (
                                    <span className="inline-flex px-2.5 py-1 bg-slate-100 border border-slate-200 text-slate-500 rounded-lg text-[9px] font-black uppercase tracking-wide">
                                      Global / Todos
                                    </span>
                                  )}
                                  {line.seller_id && !associatedSellers.some(s => s.id === line.seller_id) && (() => {
                                    const legacySeller = sellers.find(s => s.id === line.seller_id);
                                    return legacySeller ? (
                                      <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg text-[10px] font-extrabold" title="Relación heredada (antigua)">
                                        {legacySeller.full_name} (Heredado)
                                        <button
                                          type="button"
                                          disabled={isEditing}
                                          onClick={async () => {
                                            await handleAssociateSeller(line.id, legacySeller.id);
                                            await supabase.from("phone_lines").update({ seller_id: null }).eq("id", line.id);
                                            await refreshPhoneLines();
                                          }}
                                          className="text-amber-500 hover:text-brand-600 ml-1 font-black text-[9px] cursor-pointer disabled:opacity-50"
                                          title="Convertir a relación Many-to-Many limpia"
                                        >
                                          [Migrar]
                                        </button>
                                      </span>
                                    ) : null;
                                  })()}
                                </div>

                                {/* Association Dropdown Selector */}
                                {nonAssociatedSellers.length > 0 && !isEditing && (
                                  <div className="flex items-center gap-2">
                                    <select
                                      defaultValue=""
                                      onChange={(e) => {
                                        handleAssociateSeller(line.id, e.target.value);
                                        e.target.value = "";
                                      }}
                                      className="px-2.5 py-1.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/10 text-[10px] font-black uppercase bg-white text-slate-500 cursor-pointer"
                                    >
                                      <option value="">+ Vincular Vendedor</option>
                                      {nonAssociatedSellers.map(s => (
                                        <option key={s.id} value={s.id}>{s.full_name}</option>
                                      ))}
                                    </select>
                                  </div>
                                )}
                              </td>
                              <td className="px-5 py-4 text-center">
                                <div className="flex items-center justify-center gap-1.5">
                                  {isEditing ? (
                                    <>
                                      <button
                                        type="button"
                                        disabled={savingLineEdit}
                                        onClick={() => handleSaveEditLine(line.id)}
                                        className="p-2 bg-emerald-50 hover:bg-emerald-600 text-emerald-600 hover:text-white border border-emerald-100 hover:border-emerald-600 rounded-xl transition-all cursor-pointer"
                                        title="Guardar cambios"
                                      >
                                        {savingLineEdit ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setEditingLineId(null)}
                                        className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200 rounded-xl transition-all cursor-pointer"
                                        title="Cancelar"
                                      >
                                        <X className="w-4 h-4" />
                                      </button>
                                    </>
                                  ) : (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => handleStartEditLine(line)}
                                        className="p-2 bg-slate-50 hover:bg-brand-600 text-slate-500 hover:text-white border border-slate-100 hover:border-brand-600 rounded-xl transition-all cursor-pointer"
                                        title="Editar línea"
                                      >
                                        <Pencil className="w-4 h-4" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleDeletePhoneLine(line.id, line.name)}
                                        className="p-2 bg-red-50 hover:bg-red-600 text-red-600 hover:text-white border border-red-100 hover:border-red-600 rounded-xl transition-all cursor-pointer"
                                        title="Eliminar línea"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                        {phoneLines.length === 0 && (
                          <tr>
                            <td colSpan={5} className="text-center py-10 font-bold text-slate-400 text-xs">
                              No hay líneas registradas en el sistema.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* SUBTAB 2: MEDIOS DE RECEPCIÓN */}
            {receptionSubTab === "mediums" && (
              <div className="space-y-8 animate-in fade-in duration-200">
                {/* Create Form */}
                <form onSubmit={handleAddMedium} className="bg-slate-50/50 p-6 rounded-3xl border border-slate-100 space-y-4">
                  <span className="block font-black text-slate-800 text-[10px] uppercase tracking-wider">Agregar Nuevo Medio de Recepción</span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[9px] font-black text-slate-400 uppercase">Nombre del Medio</span>
                      <input
                        type="text"
                        required
                        placeholder="Ej. Facebook Messenger"
                        value={newMediumName}
                        onChange={(e) => setNewMediumName(e.target.value)}
                        className="px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-4 focus:ring-brand-500/10 text-xs font-bold bg-white text-slate-700"
                      />
                    </div>
                    <div className="flex items-center gap-2 self-end h-12">
                      <input
                        type="checkbox"
                        id="requiresPhone"
                        checked={newMediumRequiresPhone}
                        onChange={(e) => setNewMediumRequiresPhone(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500/10 cursor-pointer accent-brand-600"
                      />
                      <label htmlFor="requiresPhone" className="text-[10px] font-black text-slate-600 uppercase tracking-wide cursor-pointer select-none">
                        Requiere Línea Telefónica
                      </label>
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={savingMedium}
                    className="px-5 py-3 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-black uppercase tracking-widest text-[9px] transition-all flex items-center gap-1.5 shadow-md shadow-brand-600/10 self-start cursor-pointer"
                  >
                    {savingMedium ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    Guardar Medio
                  </button>
                </form>

                {/* List Table */}
                <div className="bg-white rounded-[2rem] border border-slate-200/80 shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100">
                          <th className="px-5 py-4 text-[9px] font-black uppercase tracking-wider text-slate-400 w-1/2">Medio</th>
                          <th className="px-5 py-4 text-[9px] font-black uppercase tracking-wider text-slate-400 text-center w-36">Requiere Línea</th>
                          <th className="px-5 py-4 text-[9px] font-black uppercase tracking-wider text-slate-400 text-center w-28">Vigente</th>
                          <th className="px-5 py-4 text-[9px] font-black uppercase tracking-wider text-slate-400 text-center w-28">Acción</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {orderMediums.map((medium) => {
                          const isEditing = medium.id === editingMediumId;
                          return (
                            <tr key={medium.id} className="hover:bg-slate-50/50 transition-colors">
                              <td className="px-5 py-4 font-bold text-xs text-slate-800">
                                {isEditing ? (
                                  <input
                                    type="text"
                                    value={editingMediumName}
                                    onChange={(e) => setEditingMediumName(e.target.value)}
                                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-bold w-full bg-slate-50 text-slate-700 outline-none"
                                  />
                                ) : (
                                  medium.name
                                )}
                              </td>
                              <td className="px-5 py-4 text-center animate-none">
                                <input
                                  type="checkbox"
                                  disabled={isEditing}
                                  checked={medium.requires_phone_line}
                                  onChange={() => handleToggleMediumRequiresPhone(medium.id, medium.requires_phone_line)}
                                  className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500/10 cursor-pointer accent-brand-600 disabled:opacity-50"
                                  title="Cambiar requerimiento de línea"
                                />
                              </td>
                              <td className="px-5 py-4 text-center">
                                <button
                                  type="button"
                                  disabled={isEditing}
                                  onClick={() => handleToggleMediumActive(medium.id, medium.is_active)}
                                  className="focus:outline-none transition-transform active:scale-95 inline-block cursor-pointer disabled:opacity-50"
                                >
                                  {medium.is_active ? (
                                    <ToggleRight className="w-10 h-10 text-emerald-500 animate-none" />
                                  ) : (
                                    <ToggleLeft className="w-10 h-10 text-slate-300 animate-none" />
                                  )}
                                </button>
                              </td>
                              <td className="px-5 py-4 text-center">
                                <div className="flex items-center justify-center gap-1.5">
                                  {isEditing ? (
                                    <>
                                      <button
                                        type="button"
                                        disabled={savingMediumEdit}
                                        onClick={() => handleSaveEditMedium(medium.id)}
                                        className="p-2 bg-emerald-50 hover:bg-emerald-600 text-emerald-600 hover:text-white border border-emerald-100 hover:border-emerald-600 rounded-xl transition-all cursor-pointer"
                                        title="Guardar cambios"
                                      >
                                        {savingMediumEdit ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setEditingMediumId(null)}
                                        className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200 rounded-xl transition-all cursor-pointer"
                                        title="Cancelar"
                                      >
                                        <X className="w-4 h-4" />
                                      </button>
                                    </>
                                  ) : (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => handleStartEditMedium(medium)}
                                        className="p-2 bg-slate-50 hover:bg-brand-600 text-slate-500 hover:text-white border border-slate-100 hover:border-brand-600 rounded-xl transition-all cursor-pointer"
                                        title="Editar medio"
                                      >
                                        <Pencil className="w-4 h-4" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteMedium(medium.id, medium.name)}
                                        className="p-2 bg-red-50 hover:bg-red-600 text-red-600 hover:text-white border border-red-100 hover:border-red-600 rounded-xl transition-all cursor-pointer"
                                        title="Eliminar medio"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                        {orderMediums.length === 0 && (
                          <tr>
                            <td colSpan={4} className="text-center py-10 font-bold text-slate-400 text-xs">
                              No hay medios registrados en el sistema.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}


          </div>
        )}

        {/* TAB 4: DATABASE MAINTENANCE */}
        {mainTab === "maintenance" && (
          <div className="animate-in fade-in duration-200 space-y-6">
            <h2 className="text-3xl font-black text-slate-900 mb-6 tracking-tighter">Mantenimiento de Base de Datos</h2>
            
            <div className="bg-red-50/50 p-8 rounded-[2rem] border border-red-100">
              <div className="mb-6">
                <h3 className="text-2xl font-black text-red-900 flex items-center gap-2">
                  Mantenimiento de Catálogo
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
                  className="w-full sm:w-auto self-start px-6 py-4 bg-red-100 text-red-700 hover:bg-red-600 hover:text-white rounded-2xl font-black uppercase tracking-widest text-[9px] transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  {cleaningDuplicates ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  Ejecutar Limpieza
                </button>
              </div>
            </div>

            {/* SECCIÓN ADICIONAL: CONFIGURACIONES EN DESUSO */}
            <div className="bg-slate-50 p-8 rounded-[2rem] border border-slate-200 mt-6 space-y-6">
              <div>
                <h3 className="text-2xl font-black text-slate-800 flex items-center gap-2">
                  <Megaphone className="w-6 h-6 text-slate-500" />
                  Procedencias de Atribución (En desuso)
                </h3>
                <p className="text-slate-500 font-medium mt-1 text-sm">
                  Parámetros de procedencia publicitaria que ya no se utilizan en la carga diaria de pedidos pero se conservan para registros históricos.
                </p>
              </div>

              <div className="space-y-8">
                {/* Create Form */}
                <form onSubmit={handleAddSource} className="bg-white p-6 rounded-3xl border border-slate-200 space-y-4 max-w-2xl">
                  <span className="block font-black text-slate-800 text-[10px] uppercase tracking-wider">Agregar Nueva Procedencia</span>
                  <div className="grid grid-cols-1 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[9px] font-black text-slate-400 uppercase">Nombre de la Procedencia</span>
                      <input
                        type="text"
                        required
                        placeholder="Ej. Instagram Orgánico"
                        value={newSourceName}
                        onChange={(e) => setNewSourceName(e.target.value)}
                        className="px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-4 focus:ring-brand-500/10 text-xs font-bold bg-white text-slate-700"
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={savingSource}
                    className="px-5 py-3 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-black uppercase tracking-widest text-[9px] transition-all flex items-center gap-1.5 shadow-md shadow-brand-600/10 self-start cursor-pointer"
                  >
                    {savingSource ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    Guardar Procedencia
                  </button>
                </form>

                {/* List Table */}
                <div className="bg-white rounded-[2rem] border border-slate-200/80 shadow-sm overflow-hidden max-w-4xl">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100">
                          <th className="px-5 py-4 text-[9px] font-black uppercase tracking-wider text-slate-400 w-3/4">Procedencia</th>
                          <th className="px-5 py-4 text-[9px] font-black uppercase tracking-wider text-slate-400 text-center w-28">Vigente</th>
                          <th className="px-5 py-4 text-[9px] font-black uppercase tracking-wider text-slate-400 text-center w-28">Acción</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {advertisingSources.map((source) => {
                          const isEditing = source.id === editingSourceId;
                          return (
                            <tr key={source.id} className="hover:bg-slate-50/50 transition-colors">
                              <td className="px-5 py-4 font-bold text-xs text-slate-800">
                                {isEditing ? (
                                  <input
                                    type="text"
                                    value={editingSourceName}
                                    onChange={(e) => setEditingSourceName(e.target.value)}
                                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-bold w-full bg-slate-50 text-slate-700 outline-none"
                                  />
                                ) : (
                                  source.name
                                )}
                              </td>
                              <td className="px-5 py-4 text-center">
                                <button
                                  type="button"
                                  disabled={isEditing}
                                  onClick={() => handleToggleSourceActive(source.id, source.is_active)}
                                  className="focus:outline-none transition-transform active:scale-95 inline-block cursor-pointer disabled:opacity-50"
                                >
                                  {source.is_active ? (
                                    <ToggleRight className="w-10 h-10 text-emerald-500 animate-none" />
                                  ) : (
                                    <ToggleLeft className="w-10 h-10 text-slate-300 animate-none" />
                                  )}
                                </button>
                              </td>
                              <td className="px-5 py-4 text-center">
                                <div className="flex items-center justify-center gap-1.5">
                                  {isEditing ? (
                                    <>
                                      <button
                                        type="button"
                                        disabled={savingSourceEdit}
                                        onClick={() => handleSaveEditSource(source.id)}
                                        className="p-2 bg-emerald-50 hover:bg-emerald-600 text-emerald-600 hover:text-white border border-emerald-100 hover:border-emerald-600 rounded-xl transition-all cursor-pointer"
                                        title="Guardar cambios"
                                      >
                                        {savingSourceEdit ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setEditingSourceId(null)}
                                        className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200 rounded-xl transition-all cursor-pointer"
                                        title="Cancelar"
                                      >
                                        <X className="w-4 h-4" />
                                      </button>
                                    </>
                                  ) : (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => handleStartEditSource(source)}
                                        className="p-2 bg-slate-50 hover:bg-brand-600 text-slate-500 hover:text-white border border-slate-100 hover:border-brand-600 rounded-xl transition-all cursor-pointer"
                                        title="Editar procedencia"
                                      >
                                        <Pencil className="w-4 h-4" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteSource(source.id, source.name)}
                                        className="p-2 bg-red-50 hover:bg-red-600 text-red-600 hover:text-white border border-red-100 hover:border-red-600 rounded-xl transition-all cursor-pointer"
                                        title="Eliminar procedencia"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                        {advertisingSources.length === 0 && (
                          <tr>
                            <td colSpan={3} className="text-center py-10 font-bold text-slate-400 text-xs">
                              No hay procedencias registradas en el sistema.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
    </div>
  );
}

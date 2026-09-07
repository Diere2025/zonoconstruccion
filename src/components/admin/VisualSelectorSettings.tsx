"use client";

import React, { useState, useEffect, useMemo } from "react";
import { 
  Upload, 
  Link as LinkIcon, 
  Save, 
  RotateCcw, 
  Check, 
  Loader2, 
  ImageIcon, 
  Layers,
  Sparkles,
  Search,
  Plus,
  Trash2,
  Edit2,
  Eye,
  EyeOff,
  ChevronRight,
  PackageCheck,
  AlertCircle,
  Grid,
  List
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Product } from "@/types";
import { 
  VisualCatalogConfig, 
  VisualFamily, 
  VisualSubGroup, 
  VisualItemOption,
  DEFAULT_FAMILY_IMAGES,
  generateDefaultVisualConfig
} from "@/lib/visualSelectorConfig";

interface VisualSelectorSettingsProps {
  products?: Product[];
}

export default function VisualSelectorSettings({ products = [] }: VisualSelectorSettingsProps) {
  const [config, setConfig] = useState<VisualCatalogConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Local products in case parent passed empty
  const [localProducts, setLocalProducts] = useState<Product[]>(products);
  const [includeInactiveInPicker, setIncludeInactiveInPicker] = useState(false);
  const [adminItemsView, setAdminItemsView] = useState<'grid' | 'list'>('list');

  // Selected navigation hierarchy in the admin
  const [selectedFamilyId, setSelectedFamilyId] = useState<string>('tanques');
  const [selectedSubgroupId, setSelectedSubgroupId] = useState<string>('tricapa_gris');

  // Edit/Add modal state
  const [editingItem, setEditingItem] = useState<{
    familyId: string;
    subgroupId: string;
    item: VisualItemOption;
    isNew: boolean;
  } | null>(null);

  // Product picker modal for associating a DB product
  const [isPickingProduct, setIsPickingProduct] = useState(false);
  const [productSearch, setProductSearch] = useState("");

  // Uploading state
  const [uploading, setUploading] = useState(false);

  // Load existing config from site_settings or generate default from products
  useEffect(() => {
    async function loadConfig() {
      setLoading(true);
      try {
        let prods = products;
        if (!prods || prods.length === 0) {
          let allDbProds: Product[] = [];
          let from = 0;
          const step = 1000;
          while (true) {
            const { data: chunk, error } = await supabase
              .from('products')
              .select('*')
              .order('name')
              .range(from, from + step - 1);
            if (error || !chunk || chunk.length === 0) break;
            allDbProds.push(...chunk);
            if (chunk.length < step) break;
            from += step;
          }

          if (allDbProds.length > 0) {
            prods = allDbProds;
            setLocalProducts(allDbProds);
          }
        } else {
          setLocalProducts(products);
        }

        const { data } = await supabase
          .from('site_settings')
          .select('value')
          .eq('id', 'visual_selector_tree')
          .single();

        if (data && data.value) {
          try {
            const parsed: VisualCatalogConfig = JSON.parse(data.value);
            if (parsed.families && parsed.families.length > 0) {
              // Normalize existing labels: e.g. "300 Litros" -> "300L"
              const normalizedFamilies = parsed.families.map(f => ({
                ...f,
                subgroups: f.subgroups.map(s => ({
                  ...s,
                  items: s.items.map(it => ({
                    ...it,
                    label: it.label.replace(/(\d+)\s*Litros/gi, '$1L')
                  }))
                }))
              }));

              const normalizedConfig: VisualCatalogConfig = {
                ...parsed,
                families: normalizedFamilies
              };

              setConfig(normalizedConfig);
              if (normalizedConfig.families[0]) {
                setSelectedFamilyId(normalizedConfig.families[0].id);
                if (normalizedConfig.families[0].subgroups[0]) {
                  setSelectedSubgroupId(normalizedConfig.families[0].subgroups[0].id);
                }
              }
              setLoading(false);
              return;
            }
          } catch (e) {}
        }

        // Fallback: generate default from current database products
        const def = generateDefaultVisualConfig(prods);
        setConfig(def);
        if (def.families[0]) {
          setSelectedFamilyId(def.families[0].id);
          if (def.families[0].subgroups[0]) {
            setSelectedSubgroupId(def.families[0].subgroups[0].id);
          }
        }
      } catch (err) {
        const def = generateDefaultVisualConfig(localProducts.length > 0 ? localProducts : products);
        setConfig(def);
      } finally {
        setLoading(false);
      }
    }
    loadConfig();
  }, [products]);

  // Selected Family and Subgroup objects
  const currentFamily = config?.families.find(f => f.id === selectedFamilyId);
  const currentSubgroup = currentFamily?.subgroups.find(s => s.id === selectedSubgroupId);

  // Toggle active on item
  const handleToggleItemActive = (itemId: string) => {
    if (!config) return;
    setConfig(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        families: prev.families.map(f => {
          if (f.id !== selectedFamilyId) return f;
          return {
            ...f,
            subgroups: f.subgroups.map(s => {
              if (s.id !== selectedSubgroupId) return s;
              return {
                ...s,
                items: s.items.map(it => {
                  if (it.id !== itemId) return it;
                  return { ...it, isActive: !it.isActive };
                })
              };
            })
          };
        })
      };
    });
  };

  // Delete item
  const handleDeleteItem = (itemId: string) => {
    if (!confirm("¿Estás seguro de eliminar este ítem/opción del selector?")) return;
    if (!config) return;
    setConfig(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        families: prev.families.map(f => {
          if (f.id !== selectedFamilyId) return f;
          return {
            ...f,
            subgroups: f.subgroups.map(s => {
              if (s.id !== selectedSubgroupId) return s;
              return {
                ...s,
                items: s.items.filter(it => it.id !== itemId)
              };
            })
          };
        })
      };
    });
  };

  // Save changes to editing item
  const handleSaveItemModal = () => {
    if (!editingItem || !config) return;
    const { familyId, subgroupId, item, isNew } = editingItem;

    setConfig(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        families: prev.families.map(f => {
          if (f.id !== familyId) return f;
          return {
            ...f,
            subgroups: f.subgroups.map(s => {
              if (s.id !== subgroupId) return s;
              let nextItems = [...s.items];
              if (isNew) {
                nextItems.push(item);
              } else {
                nextItems = nextItems.map(it => it.id === item.id ? item : it);
              }
              return { ...s, items: nextItems };
            })
          };
        })
      };
    });

    setEditingItem(null);
  };

  // Helper to upload an image to Supabase Storage
  const uploadImageFile = async (file: File): Promise<string> => {
    const ext = file.name.split('.').pop();
    const filePath = `visual-selector/${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from('product-images')
      .upload(filePath, file, { upsert: true });
    if (uploadError) throw uploadError;
    const { data: publicUrlData } = supabase.storage
      .from('product-images')
      .getPublicUrl(filePath);
    return publicUrlData.publicUrl;
  };

  // Upload image to Supabase Storage for item being edited
  const handleUploadImageForEditing = async (file: File) => {
    if (!editingItem) return;
    setUploading(true);
    try {
      const url = await uploadImageFile(file);
      setEditingItem({
        ...editingItem,
        item: {
          ...editingItem.item,
          imageUrl: url
        }
      });
    } catch (err: any) {
      alert("Error al subir imagen: " + err.message);
    } finally {
      setUploading(false);
    }
  };

  // Upload image for a Family
  const handleUploadFamilyImage = async (familyId: string, file: File) => {
    setUploading(true);
    try {
      const url = await uploadImageFile(file);
      setConfig(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          families: prev.families.map(f => f.id === familyId ? { ...f, imageUrl: url } : f)
        };
      });
    } catch (err: any) {
      alert("Error al subir imagen de familia: " + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handlePromptFamilyImageUrl = (familyId: string) => {
    const current = config?.families.find(f => f.id === familyId)?.imageUrl || "";
    const url = prompt("Pegá la URL directa de la imagen para esta Familia:", current);
    if (url !== null && url.trim()) {
      setConfig(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          families: prev.families.map(f => f.id === familyId ? { ...f, imageUrl: url.trim() } : f)
        };
      });
    }
  };

  // Upload image for a Subgroup
  const handleUploadSubgroupImage = async (familyId: string, subgroupId: string, file: File) => {
    setUploading(true);
    try {
      const url = await uploadImageFile(file);
      setConfig(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          families: prev.families.map(f => {
            if (f.id !== familyId) return f;
            return {
              ...f,
              subgroups: f.subgroups.map(s => s.id === subgroupId ? { ...s, imageUrl: url } : s)
            };
          })
        };
      });
    } catch (err: any) {
      alert("Error al subir imagen de subgrupo: " + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handlePromptSubgroupImageUrl = (familyId: string, subgroupId: string) => {
    const fam = config?.families.find(f => f.id === familyId);
    const current = fam?.subgroups.find(s => s.id === subgroupId)?.imageUrl || "";
    const url = prompt("Pegá la URL directa de la imagen para esta Línea / Subgrupo:", current);
    if (url !== null && url.trim()) {
      setConfig(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          families: prev.families.map(f => {
            if (f.id !== familyId) return f;
            return {
              ...f,
              subgroups: f.subgroups.map(s => s.id === subgroupId ? { ...s, imageUrl: url.trim() } : s)
            };
          })
        };
      });
    }
  };

  // Update Family details (name, description)
  const handleUpdateFamilyDetails = (familyId: string, updates: Partial<VisualFamily>) => {
    setConfig(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        families: prev.families.map(f => f.id === familyId ? { ...f, ...updates } : f)
      };
    });
  };

  // Add a new Family
  const handleAddFamily = () => {
    const name = prompt("Nombre de la nueva Familia (ej: Termotanques Universal, Bombas, etc.):");
    if (!name || !name.trim()) return;

    const newFamilyId = `fam_${Date.now()}`;
    const defaultSubgroupId = `sub_${Date.now()}`;

    const newFamily: VisualFamily = {
      id: newFamilyId,
      name: name.trim(),
      description: `Productos de ${name.trim()}`,
      isActive: true,
      imageUrl: DEFAULT_FAMILY_IMAGES.termotanques || DEFAULT_FAMILY_IMAGES.tanques,
      subgroups: [
        {
          id: defaultSubgroupId,
          name: "General",
          description: "Opciones principales",
          isActive: true,
          items: []
        }
      ]
    };

    setConfig(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        families: [...prev.families, newFamily]
      };
    });

    setSelectedFamilyId(newFamilyId);
    setSelectedSubgroupId(defaultSubgroupId);
  };

  // Delete a Family
  const handleDeleteFamily = (familyId: string) => {
    const fam = config?.families.find(f => f.id === familyId);
    if (!fam) return;
    if (!confirm(`¿Eliminar la familia "${fam.name}" y todos sus subgrupos?`)) return;

    setConfig(prev => {
      if (!prev) return prev;
      const nextFamilies = prev.families.filter(f => f.id !== familyId);
      return {
        ...prev,
        families: nextFamilies
      };
    });

    const remaining = config?.families.filter(f => f.id !== familyId);
    if (remaining && remaining[0]) {
      setSelectedFamilyId(remaining[0].id);
      if (remaining[0].subgroups[0]) setSelectedSubgroupId(remaining[0].subgroups[0].id);
    }
  };

  // Update Subgroup details (name, description)
  const handleUpdateSubgroupDetails = (familyId: string, subgroupId: string, updates: Partial<VisualSubGroup>) => {
    setConfig(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        families: prev.families.map(f => {
          if (f.id !== familyId) return f;
          return {
            ...f,
            subgroups: f.subgroups.map(s => s.id === subgroupId ? { ...s, ...updates } : s)
          };
        })
      };
    });
  };

  // Add a new Subgroup to current family
  const handleAddSubgroup = (familyId: string) => {
    const name = prompt("Nombre de la nueva Línea / Subgrupo (ej: Eléctricos, A Gas, Conexión Inferior):");
    if (!name || !name.trim()) return;

    const newSubgroupId = `sub_${Date.now()}`;
    const newSubgroup: VisualSubGroup = {
      id: newSubgroupId,
      name: name.trim(),
      description: `Línea ${name.trim()}`,
      isActive: true,
      imageUrl: currentFamily?.imageUrl,
      items: []
    };

    setConfig(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        families: prev.families.map(f => {
          if (f.id !== familyId) return f;
          return {
            ...f,
            subgroups: [...f.subgroups, newSubgroup]
          };
        })
      };
    });

    setSelectedSubgroupId(newSubgroupId);
  };

  // Delete a Subgroup
  const handleDeleteSubgroup = (familyId: string, subgroupId: string) => {
    const fam = config?.families.find(f => f.id === familyId);
    const sub = fam?.subgroups.find(s => s.id === subgroupId);
    if (!sub) return;
    if (!confirm(`¿Eliminar el subgrupo "${sub.name}"?`)) return;

    setConfig(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        families: prev.families.map(f => {
          if (f.id !== familyId) return f;
          return {
            ...f,
            subgroups: f.subgroups.filter(s => s.id !== subgroupId)
          };
        })
      };
    });

    const remaining = fam?.subgroups.filter(s => s.id !== subgroupId);
    if (remaining && remaining[0]) {
      setSelectedSubgroupId(remaining[0].id);
    }
  };

  // Save all config to Supabase site_settings
  const handleSaveToDatabase = async () => {
    if (!config) return;
    setSaving(true);
    try {
      const updatedConfig = {
        ...config,
        updatedAt: new Date().toISOString()
      };

      const { error } = await supabase
        .from('site_settings')
        .upsert({
          id: 'visual_selector_tree',
          value: JSON.stringify(updatedConfig),
          updated_at: new Date().toISOString()
        });

      if (error) throw error;
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err: any) {
      alert("Error al guardar configuración: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Batch format all labels from "{N} Litros" to "{N}L"
  const handleBatchFormatLitrosToL = () => {
    if (!config) return;
    setConfig(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        families: prev.families.map(f => ({
          ...f,
          subgroups: f.subgroups.map(s => ({
            ...s,
            items: s.items.map(it => ({
              ...it,
              label: it.label.replace(/(\d+)\s*Litros/gi, '$1L')
            }))
          }))
        }))
      };
    });
  };

  // Reset to auto-generated from catalog
  const handleResetToCatalogDefaults = () => {
    if (!confirm("¿Restablecer la configuración a los productos y litrajes actualmente existentes en la base de datos?")) return;
    const prodsToUse = (localProducts && localProducts.length > 0) ? localProducts : products;
    const def = generateDefaultVisualConfig(prodsToUse);
    setConfig(def);
    if (def.families[0]) {
      setSelectedFamilyId(def.families[0].id);
      if (def.families[0].subgroups[0]) {
        setSelectedSubgroupId(def.families[0].subgroups[0].id);
      }
    }
  };

  // Filtered products for search in product picker with smart word token matching
  const filteredProductsForPicker = useMemo(() => {
    let list = (localProducts && localProducts.length > 0) ? localProducts : products;
    if (!includeInactiveInPicker) {
      list = list.filter(p => p.is_active !== false);
    }

    if (!productSearch.trim()) {
      const subName = (currentSubgroup?.name || '').toLowerCase();
      const famName = (currentFamily?.name || '').toLowerCase();
      return [...list].sort((a, b) => {
        const aText = `${a.name} ${a.sku || ''}`.toLowerCase();
        const bText = `${b.name} ${b.sku || ''}`.toLowerCase();
        const aMatches = (subName && aText.includes(subName)) || (famName && aText.includes(famName));
        const bMatches = (subName && bText.includes(subName)) || (famName && bText.includes(famName));
        if (aMatches && !bMatches) return -1;
        if (!aMatches && bMatches) return 1;
        return a.name.localeCompare(b.name);
      }).slice(0, 100);
    }

    const rawTokens = productSearch.toLowerCase().trim().split(/\s+/).filter(Boolean);
    return list.filter(p => {
      const text = `${p.name} ${p.sku || ''} ${p.category || ''}`.toLowerCase();
      // Normalize text for flexible match (e.g. 40l vs 40 l vs 40 litros)
      const normalizedText = text.replace(/(\d+)\s*litros?/g, '$1l').replace(/(\d+)\s*l\b/g, '$1l');

      return rawTokens.every(rawTok => {
        const tok = rawTok.replace(/(\d+)\s*litros?/g, '$1l');
        if (text.includes(rawTok) || normalizedText.includes(tok)) return true;
        if (rawTok.endsWith('l') && !isNaN(Number(rawTok.slice(0, -1)))) {
          const num = rawTok.slice(0, -1);
          if (text.includes(`${num}l`) || text.includes(`${num} l`) || text.includes(`${num} litros`) || text.includes(`${num}litros`)) {
            return true;
          }
        }
        if (rawTok === 'tanque' && text.includes('termo')) return true;
        if (rawTok === 'termo' && text.includes('termotanque')) return true;
        if (rawTok === 'tanques' && (text.includes('tanque') || text.includes('termo'))) return true;
        return false;
      });
    }).slice(0, 100);
  }, [localProducts, products, productSearch, includeInactiveInPicker, currentSubgroup, currentFamily]);

  if (loading) {
    return (
      <div className="py-12 text-center text-slate-500 font-bold flex items-center justify-center gap-2">
        <Loader2 className="w-5 h-5 animate-spin text-brand-600" />
        <span>Cargando configuración del selector...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      
      {/* HEADER WITH ACTIONS */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 bg-white rounded-2xl border border-slate-200/80 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-black text-base text-slate-800 tracking-tight">Gestor del Selector Visual</h3>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800">
              100% Configurable
            </span>
          </div>
          <p className="text-xs text-slate-500 font-medium mt-1">
            Agregá o quitá litrajes, combos y productos, cambiá imágenes o activá/desactivá opciones al instante.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleBatchFormatLitrosToL}
            title="Convertir todas las etiquetas 'Litros' a 'L' (ej: 300 Litros -> 300L)"
            className="px-3 py-2 rounded-xl border border-brand-200 bg-brand-50/60 text-brand-700 hover:bg-brand-100 text-xs font-bold transition-all flex items-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5 text-brand-600" />
            <span>Formatear a "300L"</span>
          </button>

          <button
            type="button"
            onClick={handleResetToCatalogDefaults}
            title="Regenerar opciones según el catálogo activo"
            className="px-3 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold transition-all flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Sincronizar Catálogo</span>
          </button>

          <button
            type="button"
            onClick={handleSaveToDatabase}
            disabled={saving}
            className="px-5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-black text-xs uppercase tracking-wider shadow-md hover:shadow-brand-600/20 transition-all flex items-center gap-2 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>{saving ? 'Guardando...' : 'Guardar Cambios'}</span>
          </button>
        </div>
      </div>

      {/* SAVE SUCCESS BANNER */}
      {saveSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl flex items-center gap-2 text-xs font-black animate-in fade-in duration-150">
          <Check className="w-4 h-4 text-emerald-600" />
          <span>¡Configuración guardada y sincronizada para todos los vendedores!</span>
        </div>
      )}

      {/* 2-LEVEL SELECTION BAR (FAMILY -> SUBGROUP) */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
        
        {/* NIVEL 1: FAMILIAS */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <span className="text-[10px] font-black uppercase text-slate-400 shrink-0">Familia:</span>
          {config?.families.map(f => (
            <button
              key={f.id}
              type="button"
              onClick={() => {
                setSelectedFamilyId(f.id);
                setSelectedSubgroupId(f.subgroups[0]?.id || "");
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider whitespace-nowrap transition-all ${
                selectedFamilyId === f.id
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {f.name}
            </button>
          ))}

          {/* BOTÓN CREAR FAMILIA */}
          <button
            type="button"
            onClick={handleAddFamily}
            title="Crear una nueva familia de productos (ej: Cooper, Universal, Bombas, etc.)"
            className="px-3 py-1.5 rounded-lg border border-dashed border-brand-300 bg-brand-50/50 hover:bg-brand-100 text-brand-700 text-xs font-black uppercase tracking-wider whitespace-nowrap transition-all flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Nueva Familia</span>
          </button>
        </div>

        {/* NIVEL 2: SUBGRUPOS (COLORES / MARCAS / COMBOS / LÍNEAS) */}
        {currentFamily && (
          <div className="flex items-center gap-2 overflow-x-auto pt-2 border-t border-slate-100">
            <span className="text-[10px] font-black uppercase text-slate-400 shrink-0">Línea / Subgrupo:</span>
            {currentFamily.subgroups.map(s => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSelectedSubgroupId(s.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider whitespace-nowrap transition-all ${
                  selectedSubgroupId === s.id
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {s.name} ({s.items.filter(i => i.isActive).length}/{s.items.length})
              </button>
            ))}

            {/* BOTÓN CREAR SUBGRUPO */}
            <button
              type="button"
              onClick={() => handleAddSubgroup(currentFamily.id)}
              title={`Agregar un subgrupo a ${currentFamily.name}`}
              className="px-2.5 py-1.5 rounded-lg border border-dashed border-slate-300 hover:border-brand-400 bg-slate-50 hover:bg-brand-50 text-slate-600 hover:text-brand-700 text-xs font-black uppercase tracking-wider whitespace-nowrap transition-all flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Nuevo Subgrupo</span>
            </button>
          </div>
        )}

      </div>

      {/* GESTIÓN DE IMÁGENES Y DESCRIPCIONES DE FAMILIA Y SUBGRUPO */}
      {currentFamily && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          
          {/* CARD FAMILIA (IMAGEN, NOMBRE Y DESCRIPCIÓN) */}
          <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-14 h-14 rounded-xl bg-slate-50 border border-slate-200 p-1 flex items-center justify-center shrink-0 overflow-hidden shadow-inner">
                  {currentFamily.imageUrl ? (
                    <img src={currentFamily.imageUrl} alt={currentFamily.name} className="max-h-full max-w-full object-contain" />
                  ) : (
                    <ImageIcon className="w-6 h-6 text-slate-300" />
                  )}
                </div>
                <div className="min-w-0">
                  <span className="text-[9px] font-black uppercase text-brand-600 tracking-wider">Familia</span>
                  <h5 className="text-xs font-black text-slate-800 truncate">{currentFamily.name}</h5>
                  <p className="text-[10px] text-slate-400">Paso 1 del selector visual</p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <label className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold transition-all cursor-pointer flex items-center gap-1">
                  <Upload className="w-3.5 h-3.5 text-brand-600" />
                  <span>Subir</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (file) handleUploadFamilyImage(currentFamily.id, file);
                    }}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => handlePromptFamilyImageUrl(currentFamily.id)}
                  title="Pegar URL de imagen"
                  className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-50 text-xs font-bold"
                >
                  <LinkIcon className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* EDICIÓN DE NOMBRE, DESCRIPCIÓN Y ELIMINACIÓN DE FAMILIA */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-slate-100">
              <div>
                <label className="text-[9px] font-black uppercase tracking-wider text-slate-400 block mb-0.5">Nombre Familia</label>
                <input
                  type="text"
                  value={currentFamily.name}
                  onChange={e => handleUpdateFamilyDetails(currentFamily.id, { name: e.target.value })}
                  placeholder="Ej: Tanques de Agua..."
                  className="w-full px-2.5 py-1 text-xs font-bold border border-slate-200 rounded-lg outline-none focus:border-brand-500 bg-slate-50/50"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-0.5">
                  <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Descripción Corta</label>
                  <button
                    type="button"
                    onClick={() => handleDeleteFamily(currentFamily.id)}
                    className="text-[9px] font-bold text-red-500 hover:text-red-700 flex items-center gap-0.5"
                    title="Eliminar esta familia por completo"
                  >
                    <Trash2 className="w-2.5 h-2.5" />
                    <span>Eliminar Familia</span>
                  </button>
                </div>
                <input
                  type="text"
                  value={currentFamily.description || ''}
                  onChange={e => handleUpdateFamilyDetails(currentFamily.id, { description: e.target.value })}
                  placeholder="Ej: Tanques tricapa, bicapa, bases..."
                  className="w-full px-2.5 py-1 text-xs font-medium border border-slate-200 rounded-lg outline-none focus:border-brand-500 bg-slate-50/50"
                />
              </div>
            </div>
          </div>

          {/* CARD SUBGRUPO (IMAGEN, NOMBRE Y DESCRIPCIÓN - EJ: BICAPA NEGRO) */}
          {currentSubgroup ? (
            <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-14 h-14 rounded-xl bg-slate-50 border border-slate-200 p-1 flex items-center justify-center shrink-0 overflow-hidden shadow-inner">
                    {currentSubgroup.imageUrl ? (
                      <img src={currentSubgroup.imageUrl} alt={currentSubgroup.name} className="max-h-full max-w-full object-contain" />
                    ) : (
                      <ImageIcon className="w-6 h-6 text-slate-300" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <span className="text-[9px] font-black uppercase text-slate-500 tracking-wider">Línea / Subgrupo</span>
                    <h5 className="text-xs font-black text-slate-800 truncate">{currentSubgroup.name}</h5>
                    <p className="text-[10px] text-slate-400">Paso 2 del selector visual</p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <label className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold transition-all cursor-pointer flex items-center gap-1">
                    <Upload className="w-3.5 h-3.5 text-brand-600" />
                    <span>Subir</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (file) handleUploadSubgroupImage(currentFamily.id, currentSubgroup.id, file);
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => handlePromptSubgroupImageUrl(currentFamily.id, currentSubgroup.id)}
                    title="Pegar URL de imagen"
                    className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-50 text-xs font-bold"
                  >
                    <LinkIcon className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* EDICIÓN DE NOMBRE, DESCRIPCIÓN Y ELIMINACIÓN DE SUBGRUPO */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-slate-100">
                <div>
                  <label className="text-[9px] font-black uppercase tracking-wider text-slate-400 block mb-0.5">Nombre Línea / Subgrupo</label>
                  <input
                    type="text"
                    value={currentSubgroup.name}
                    onChange={e => handleUpdateSubgroupDetails(currentFamily.id, currentSubgroup.id, { name: e.target.value })}
                    placeholder="Ej: Bicapa Negro..."
                    className="w-full px-2.5 py-1 text-xs font-bold border border-slate-200 rounded-lg outline-none focus:border-brand-500 bg-slate-50/50"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-0.5">
                    <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Descripción / Detalle</label>
                    <button
                      type="button"
                      onClick={() => handleDeleteSubgroup(currentFamily.id, currentSubgroup.id)}
                      className="text-[9px] font-bold text-red-500 hover:text-red-700 flex items-center gap-0.5"
                      title="Eliminar este subgrupo"
                    >
                      <Trash2 className="w-2.5 h-2.5" />
                      <span>Eliminar Línea</span>
                    </button>
                  </div>
                  <input
                    type="text"
                    value={currentSubgroup.description || ''}
                    onChange={e => handleUpdateSubgroupDetails(currentFamily.id, currentSubgroup.id, { description: e.target.value })}
                    placeholder="Ej: Tanques bicapa reforzados color negro..."
                    className="w-full px-2.5 py-1 text-xs font-medium border border-slate-200 rounded-lg outline-none focus:border-brand-500 bg-slate-50/50"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="p-6 bg-slate-50/80 rounded-xl border border-dashed border-slate-300 text-center flex flex-col items-center justify-center gap-2">
              <span className="text-xs font-bold text-slate-600">Esta familia todavía no tiene subgrupos / líneas.</span>
              <p className="text-[11px] text-slate-400 max-w-xs">
                Creá una línea (o "General") para poder cargar y vincular los litrajes y productos directamente.
              </p>
              <button
                type="button"
                onClick={() => handleAddSubgroup(currentFamily.id)}
                className="mt-1 px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-black text-xs uppercase tracking-wider flex items-center gap-1.5 shadow-sm transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Crear Subgrupo / Línea</span>
              </button>
            </div>
          )}

        </div>
      )}

      {/* ITEMS / LITRAJES / COMBOS SECTION */}
      {currentSubgroup && (
        <div className="space-y-4">
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
            <div>
              <h4 className="font-black text-sm text-slate-800">
                Litrajes y Opciones de {currentSubgroup.name} ({currentSubgroup.items.length})
              </h4>
              <p className="text-xs text-slate-400 font-medium">
                Solo las opciones activas aparecerán en el selector del vendedor.
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* CONFIGURAR VISTA DE LITRAJES PARA LOS VENDEDORES (LISTA O CUADRÍCULA CON IMÁGENES) */}
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200">
                <span className="text-[10px] font-black uppercase text-slate-500 px-1.5 hidden sm:inline">
                  Vendedores ven:
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setConfig(prev => {
                      if (!prev) return prev;
                      return {
                        ...prev,
                        showItemImages: false,
                        itemsViewMode: 'list'
                      };
                    });
                  }}
                  className={`px-2 py-1 rounded text-xs font-bold flex items-center gap-1 transition-all ${
                    config?.itemsViewMode === 'list' || !config?.showItemImages
                      ? 'bg-white text-brand-600 shadow-sm font-black'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="Listado limpio sin imágenes (más rápido y claro cuando las fotos son iguales)"
                >
                  <List className="w-3.5 h-3.5" />
                  <span>Listado</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setConfig(prev => {
                      if (!prev) return prev;
                      return {
                        ...prev,
                        showItemImages: true,
                        itemsViewMode: 'grid'
                      };
                    });
                  }}
                  className={`px-2 py-1 rounded text-xs font-bold flex items-center gap-1 transition-all ${
                    config?.itemsViewMode === 'grid' && config?.showItemImages
                      ? 'bg-white text-brand-600 shadow-sm font-black'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="Cuadrícula con imágenes por cada litraje"
                >
                  <Grid className="w-3.5 h-3.5" />
                  <span>Fotos</span>
                </button>
              </div>

              {/* TOGGLE VISTA ADMIN */}
              <div className="flex items-center border-l border-slate-200 pl-2">
                <button
                  type="button"
                  onClick={() => setAdminItemsView(adminItemsView === 'list' ? 'grid' : 'list')}
                  className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold"
                  title={adminItemsView === 'list' ? "Cambiar a vista cuadrícula de administración" : "Cambiar a vista tabla"}
                >
                  {adminItemsView === 'list' ? <Grid className="w-3.5 h-3.5" /> : <List className="w-3.5 h-3.5" />}
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  setEditingItem({
                    familyId: selectedFamilyId,
                    subgroupId: selectedSubgroupId,
                    isNew: true,
                    item: {
                      id: `custom_${Date.now()}`,
                      label: "Nueva Opción / Litraje",
                      isActive: true,
                      description: "",
                      imageUrl: currentSubgroup.imageUrl || DEFAULT_FAMILY_IMAGES.tanques,
                      allowCiego: selectedFamilyId === 'tanques'
                    }
                  });
                }}
                className="px-3.5 py-1.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-black uppercase tracking-wider transition-colors flex items-center gap-1.5 shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Agregar Opción</span>
              </button>
            </div>
          </div>

          {currentSubgroup.items.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-xl border border-dashed border-slate-200 text-slate-400 text-xs">
              No hay opciones registradas en este subgrupo. Hacé clic en "Agregar Opción" arriba para sumar una.
            </div>
          ) : adminItemsView === 'list' ? (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-black uppercase text-slate-500">
                      <th className="py-2.5 px-3">Estado</th>
                      <th className="py-2.5 px-3">Litraje / Título</th>
                      <th className="py-2.5 px-3">Producto Vinculado</th>
                      <th className="py-2.5 px-3 text-right">Precio DB</th>
                      <th className="py-2.5 px-3 text-center">Foto</th>
                      <th className="py-2.5 px-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {currentSubgroup.items.map(item => {
                      const linkedProduct = (products.length > 0 ? products : localProducts).find(p => p.id === item.productId);
                      return (
                        <tr key={item.id} className={`hover:bg-slate-50/80 transition-colors ${!item.isActive ? 'opacity-60 bg-slate-50/40' : ''}`}>
                          <td className="py-2.5 px-3">
                            <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                              item.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-500'
                            }`}>
                              {item.isActive ? 'Visible' : 'Oculto'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-2">
                              <span className="font-black text-slate-800">{item.label}</span>
                              {item.badge && (
                                <span className="px-1.5 py-0.2 rounded text-[8px] font-black uppercase bg-amber-100 text-amber-800">
                                  {item.badge}
                                </span>
                              )}
                            </div>
                            {item.description && <p className="text-[10px] text-slate-400 truncate max-w-xs">{item.description}</p>}
                          </td>
                          <td className="py-2.5 px-3">
                            {linkedProduct ? (
                              <span className="font-bold text-brand-600 truncate max-w-xs block" title={linkedProduct.name}>
                                {linkedProduct.name}
                              </span>
                            ) : (
                              <span className="font-bold text-amber-600 flex items-center gap-1 text-[11px]">
                                <AlertCircle className="w-3 h-3" /> Sin vincular
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right font-black text-slate-700">
                            {linkedProduct ? `$${linkedProduct.price.toLocaleString('es-AR')}` : '-'}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <div className="w-7 h-7 mx-auto rounded border border-slate-200 bg-slate-50 p-0.5 flex items-center justify-center overflow-hidden">
                              {item.imageUrl ? (
                                <img src={item.imageUrl} alt="" className="max-h-full max-w-full object-contain" />
                              ) : (
                                <ImageIcon className="w-3.5 h-3.5 text-slate-300" />
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => handleToggleItemActive(item.id)}
                                title={item.isActive ? "Ocultar" : "Mostrar"}
                                className="p-1 text-slate-400 hover:text-slate-700 transition-colors"
                              >
                                {item.isActive ? <Eye className="w-3.5 h-3.5 text-emerald-600" /> : <EyeOff className="w-3.5 h-3.5 text-slate-400" />}
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingItem({
                                  familyId: selectedFamilyId,
                                  subgroupId: selectedSubgroupId,
                                  item,
                                  isNew: false
                                })}
                                className="p-1 text-slate-400 hover:text-brand-600 transition-colors"
                                title="Editar"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteItem(item.id)}
                                className="p-1 text-slate-400 hover:text-red-600 transition-colors"
                                title="Eliminar"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {currentSubgroup.items.map(item => {
                const linkedProduct = (products.length > 0 ? products : localProducts).find(p => p.id === item.productId);
                
                return (
                  <div
                    key={item.id}
                    className={`p-4 rounded-xl border transition-all bg-white flex flex-col justify-between ${
                      item.isActive 
                        ? 'border-slate-200 shadow-sm' 
                        : 'border-slate-200/60 bg-slate-50/50 opacity-60'
                    }`}
                  >
                    <div>
                      {/* TOP BADGE & TOGGLE */}
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                          item.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-500'
                        }`}>
                          {item.isActive ? 'Visible' : 'Oculto'}
                        </span>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleToggleItemActive(item.id)}
                            title={item.isActive ? "Ocultar del selector" : "Hacer visible"}
                            className="p-1 text-slate-400 hover:text-slate-700 transition-colors"
                          >
                            {item.isActive ? <Eye className="w-4 h-4 text-emerald-600" /> : <EyeOff className="w-4 h-4 text-slate-400" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingItem({
                              familyId: selectedFamilyId,
                              subgroupId: selectedSubgroupId,
                              item,
                              isNew: false
                            })}
                            className="p-1 text-slate-400 hover:text-brand-600 transition-colors"
                            title="Editar opción"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteItem(item.id)}
                            className="p-1 text-slate-400 hover:text-red-600 transition-colors"
                            title="Eliminar opción"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* IMAGE & INFO */}
                      <div className="flex items-center gap-3">
                        <div className="w-16 h-16 rounded-lg bg-slate-50 border border-slate-100 p-1 flex items-center justify-center shrink-0 overflow-hidden">
                          {item.imageUrl ? (
                            <img src={item.imageUrl} alt={item.label} className="max-h-full max-w-full object-contain" />
                          ) : (
                            <ImageIcon className="w-6 h-6 text-slate-300" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          {item.badge && (
                            <span className="inline-block px-1.5 py-0.2 rounded text-[8px] font-black uppercase tracking-wide bg-amber-100 text-amber-800 mb-0.5">
                              {item.badge}
                            </span>
                          )}
                          <h5 className="font-black text-xs text-slate-800 truncate">{item.label}</h5>
                          <p className="text-[10px] text-slate-400 truncate">{item.description || 'Sin descripción'}</p>
                        </div>
                      </div>

                      {/* LINKED PRODUCT STATUS */}
                      <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px]">
                        <span className="font-bold text-slate-400">Producto DB:</span>
                        {linkedProduct ? (
                          <span className="font-black text-brand-600 truncate max-w-[160px]" title={linkedProduct.name}>
                            {linkedProduct.name} (${linkedProduct.price.toLocaleString('es-AR')})
                          </span>
                        ) : (
                          <span className="font-bold text-amber-600 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" /> Sin vincular
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

        </div>
      )}

      {/* MODAL PARA EDITAR / AGREGAR ITEM */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden">
            
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h4 className="font-black text-sm text-slate-800">
                  {editingItem.isNew ? 'Agregar Nueva Opción / Combo' : 'Editar Opción'}
                </h4>
                <p className="text-xs text-slate-400 font-medium">Configurá el nombre, imagen y producto vinculado</p>
              </div>
              <button
                onClick={() => setEditingItem(null)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              
              {/* NOMBRE / LABEL */}
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400">Título / Litraje</label>
                <input
                  type="text"
                  value={editingItem.item.label}
                  onChange={e => setEditingItem({
                    ...editingItem,
                    item: { ...editingItem.item, label: e.target.value }
                  })}
                  placeholder="Ej: 500 Litros, Combo BioFort 600L + Lodos..."
                  className="w-full px-3 py-2 text-xs font-bold border border-slate-200 rounded-lg outline-none focus:border-brand-500 mt-1"
                />
              </div>

              {/* BADGE (OPCIONAL) */}
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400">Etiqueta Destacada (Opcional)</label>
                <input
                  type="text"
                  value={editingItem.item.badge || ''}
                  onChange={e => setEditingItem({
                    ...editingItem,
                    item: { ...editingItem.item, badge: e.target.value || undefined }
                  })}
                  placeholder="Ej: Slim, Chato, Oferta, Más Vendido..."
                  className="w-full px-3 py-2 text-xs font-bold border border-slate-200 rounded-lg outline-none focus:border-brand-500 mt-1"
                />
              </div>

              {/* VINCULACIÓN CON PRODUCTO DB */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase text-slate-500">Producto Vinculado en DB</span>
                  <button
                    type="button"
                    onClick={() => setIsPickingProduct(true)}
                    className="text-xs font-black text-brand-600 hover:underline flex items-center gap-1"
                  >
                    <Search className="w-3 h-3" />
                    <span>Seleccionar Producto</span>
                  </button>
                </div>

                {editingItem.item.productId ? (
                  <div className="text-xs font-bold text-slate-800 bg-white p-2 rounded-lg border border-slate-200 flex items-center justify-between">
                    <span className="truncate">
                      {products.find(p => p.id === editingItem.item.productId)?.name || editingItem.item.productId}
                    </span>
                    <button
                      type="button"
                      onClick={() => setEditingItem({
                        ...editingItem,
                        item: { ...editingItem.item, productId: undefined }
                      })}
                      className="text-red-500 hover:text-red-700 font-bold ml-2 text-[10px]"
                    >
                      Desvincular
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-amber-700 font-medium">Ningún producto vinculado.</p>
                )}
              </div>

              {/* IMAGEN DE LA OPCIÓN */}
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 mb-1 block">Imagen</label>
                <div className="flex items-center gap-3">
                  <div className="w-16 h-16 rounded-lg border border-slate-200 bg-slate-50 p-1 flex items-center justify-center shrink-0 overflow-hidden">
                    {editingItem.item.imageUrl ? (
                      <img src={editingItem.item.imageUrl} alt="preview" className="max-h-full max-w-full object-contain" />
                    ) : (
                      <ImageIcon className="w-6 h-6 text-slate-300" />
                    )}
                  </div>

                  <div className="flex-1 space-y-1.5">
                    <input
                      type="text"
                      value={editingItem.item.imageUrl || ''}
                      onChange={e => setEditingItem({
                        ...editingItem,
                        item: { ...editingItem.item, imageUrl: e.target.value }
                      })}
                      placeholder="https://..."
                      className="w-full px-2.5 py-1 text-xs border border-slate-200 rounded-lg outline-none font-mono"
                    />

                    <label className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-600 hover:bg-slate-50 cursor-pointer">
                      <Upload className="w-3 h-3" />
                      <span>{uploading ? 'Subiendo...' : 'Subir Imagen'}</span>
                      <input 
                        type="file" 
                        accept="image/*" 
                        className="hidden" 
                        onChange={e => {
                          const file = e.target.files?.[0];
                          if (file) handleUploadImageForEditing(file);
                        }}
                      />
                    </label>
                  </div>
                </div>
              </div>

              {/* TOGGLE PERMITIR CIEGO */}
              {selectedFamilyId === 'tanques' && (
                <div className="flex items-center justify-between p-3 rounded-xl border border-slate-200">
                  <div>
                    <p className="text-xs font-black text-slate-800">Permitir opción "Ciego"</p>
                    <p className="text-[10px] text-slate-400">Ofrecer al vendedor el botón de variante Ciego</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={Boolean(editingItem.item.allowCiego)}
                    onChange={e => setEditingItem({
                      ...editingItem,
                      item: { ...editingItem.item, allowCiego: e.target.checked }
                    })}
                    className="w-4 h-4 rounded text-brand-600 focus:ring-brand-500 border-slate-300"
                  />
                </div>
              )}

            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-white"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={handleSaveItemModal}
                className="px-5 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-black uppercase tracking-wider"
              >
                Aplicar
              </button>
            </div>

          </div>
        </div>
      )}

      {/* MODAL PARA BUSCAR PRODUCTO DEL CATÁLOGO */}
      {isPickingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl max-h-[85vh] flex flex-col overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h4 className="font-black text-sm text-slate-800">Vincular Producto del Catálogo</h4>
              <button
                onClick={() => setIsPickingProduct(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700"
              >
                ✕
              </button>
            </div>

            <div className="p-3 border-b border-slate-100 bg-slate-50 space-y-2">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={productSearch}
                  onChange={e => setProductSearch(e.target.value)}
                  placeholder="Buscar por nombre o SKU (ej: universal, 500 gris, tricapa)..."
                  className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium outline-none bg-white focus:ring-2 focus:ring-brand-500/20"
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-500 px-0.5">
                <span>Resultados: {filteredProductsForPicker.length} productos</span>
                <label className="flex items-center gap-1.5 cursor-pointer select-none font-bold text-slate-600 hover:text-slate-900">
                  <input
                    type="checkbox"
                    checked={includeInactiveInPicker}
                    onChange={e => setIncludeInactiveInPicker(e.target.checked)}
                    className="w-3.5 h-3.5 rounded text-brand-600 focus:ring-brand-500 border-slate-300"
                  />
                  <span>Incluir productos inactivos en catálogo</span>
                </label>
              </div>
            </div>

            <div className="p-3 overflow-y-auto flex-1 divide-y divide-slate-100">
              {filteredProductsForPicker.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs">
                  No se encontraron productos coincidentes. Probá activando "Incluir productos inactivos" o refiná el término.
                </div>
              ) : (
                filteredProductsForPicker.map(p => (
                  <div
                    key={p.id}
                    onClick={() => {
                      if (editingItem) {
                        setEditingItem({
                          ...editingItem,
                          item: {
                            ...editingItem.item,
                            productId: p.id,
                            label: editingItem.item.label === "Nueva Opción / Litraje" ? p.name : editingItem.item.label,
                            imageUrl: editingItem.item.imageUrl || p.image_url
                          }
                        });
                      }
                      setIsPickingProduct(false);
                    }}
                    className="py-2.5 px-3 hover:bg-slate-50 rounded-lg cursor-pointer transition-colors flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[9px] font-black text-brand-600 uppercase tracking-wider">{p.sku || 'SIN SKU'}</span>
                        {!p.is_active && (
                          <span className="px-1.5 py-0.2 rounded text-[8px] font-black uppercase bg-slate-100 text-slate-500 border border-slate-200">
                            Inactivo en DB
                          </span>
                        )}
                      </div>
                      <p className="font-bold text-xs text-slate-800 truncate">{p.name}</p>
                    </div>
                    <span className="font-black text-xs text-slate-700 shrink-0">${p.price.toLocaleString('es-AR')}</span>
                  </div>
                ))
              )}
            </div>

            <div className="p-3 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button
                type="button"
                onClick={() => setIsPickingProduct(false)}
                className="px-4 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-600"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

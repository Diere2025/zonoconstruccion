"use client";

import React, { useState, useMemo, useEffect } from "react";
import { 
  X, 
  ChevronRight, 
  ArrowLeft, 
  Sparkles, 
  Check, 
  Plus, 
  Layers, 
  Info,
  Settings,
  Flame,
  Droplet,
  Paintbrush,
  Wrench,
  PackageCheck,
  CheckCircle2,
  AlertCircle,
  List,
  Grid
} from "lucide-react";
import { Product } from "@/types";
import { 
  VisualCatalogConfig,
  VisualFamily,
  VisualSubGroup,
  VisualItemOption,
  generateDefaultVisualConfig,
  findRecommendedBase,
  findFlotanteProduct
} from "@/lib/visualSelectorConfig";
import { supabase } from "@/lib/supabase";

interface VisualProductSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  onAddProduct: (product: Product) => void;
  onAddProducts?: (products: Product[]) => void;
  isAdmin?: boolean;
}

export default function VisualProductSelectorModal({
  isOpen,
  onClose,
  products,
  onAddProduct,
  onAddProducts,
  isAdmin = false
}: VisualProductSelectorModalProps) {
  const [config, setConfig] = useState<VisualCatalogConfig | null>(null);
  const [loading, setLoading] = useState(true);

  // Cascade Navigation State
  // Step 1: Family, Step 2: Subgroup, Step 3: Items/Litrajes, Step 4: Options & Addons
  const [selectedFamilyId, setSelectedFamilyId] = useState<string | null>(null);
  const [selectedSubgroupId, setSelectedSubgroupId] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<VisualItemOption | null>(null);

  // Tanque / Product Options State
  const [isCiego, setIsCiego] = useState(false);
  const [includeBase, setIncludeBase] = useState(false);
  const [includeFlotante, setIncludeFlotante] = useState(false);

  // Feedback banner
  const [addedFeedback, setAddedFeedback] = useState<string | null>(null);

  // Load configuration from site_settings or generate from active products
  useEffect(() => {
    if (!isOpen) return;
    async function loadTree() {
      setLoading(true);
      try {
        const { data } = await supabase
          .from('site_settings')
          .select('value')
          .eq('id', 'visual_selector_tree')
          .single();

        if (data && data.value) {
          try {
            const parsed: VisualCatalogConfig = JSON.parse(data.value);
            if (parsed && parsed.families && parsed.families.length > 0) {
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
              setConfig({ ...parsed, families: normalizedFamilies });
              setLoading(false);
              return;
            }
          } catch (e) {}
        }

        // Fallback: auto-generate default from active products
        const def = generateDefaultVisualConfig(products);
        setConfig(def);
      } catch (err) {
        const def = generateDefaultVisualConfig(products);
        setConfig(def);
      } finally {
        setLoading(false);
      }
    }
    loadTree();
  }, [isOpen, products]);

  // Reset cascade
  const handleReset = () => {
    setSelectedFamilyId(null);
    setSelectedSubgroupId(null);
    setSelectedItem(null);
    setIsCiego(false);
    setIncludeBase(false);
    setIncludeFlotante(false);
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  // Resolve current active family, subgroup, item
  const activeFamilies = useMemo(() => {
    return (config?.families || []).filter(f => f.isActive !== false);
  }, [config]);

  const currentFamily = useMemo(() => {
    return activeFamilies.find(f => f.id === selectedFamilyId);
  }, [activeFamilies, selectedFamilyId]);

  const activeSubgroups = useMemo(() => {
    return (currentFamily?.subgroups || []).filter(s => s.isActive !== false);
  }, [currentFamily]);

  const currentSubgroup = useMemo(() => {
    return activeSubgroups.find(s => s.id === selectedSubgroupId);
  }, [activeSubgroups, selectedSubgroupId]);

  const activeItems = useMemo(() => {
    return (currentSubgroup?.items || []).filter(it => it.isActive !== false);
  }, [currentSubgroup]);

  // Product resolution from database
  const resolvedMainProduct = useMemo(() => {
    if (!selectedItem || !selectedItem.productId) return undefined;
    if (isCiego && selectedItem.ciegoProductId) {
      return products.find(p => p.id === selectedItem.ciegoProductId);
    }
    return products.find(p => p.id === selectedItem.productId);
  }, [products, selectedItem, isCiego]);

  const resolvedBaseProduct = useMemo(() => {
    if (!selectedItem || !selectedItem.recommendedBaseCm) return undefined;
    return findRecommendedBase(products, selectedItem.recommendedBaseCm);
  }, [products, selectedItem]);

  const resolvedFlotanteProduct = useMemo(() => {
    return findFlotanteProduct(products);
  }, [products]);

  // Format currency
  const fmt = (val?: number) => {
    if (val === undefined || val === null) return "$0";
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(val);
  };

  // Add confirmed items to order
  const handleConfirmAdd = () => {
    const toAdd: Product[] = [];

    // 1. Add main product
    if (resolvedMainProduct) {
      toAdd.push(resolvedMainProduct);
    }

    // 2. Add base if selected
    if (includeBase && resolvedBaseProduct) {
      toAdd.push(resolvedBaseProduct);
    }

    // 3. Add flotante if selected
    if (includeFlotante && resolvedFlotanteProduct) {
      toAdd.push(resolvedFlotanteProduct);
    }

    if (toAdd.length === 0) {
      alert("No se encontró ningún producto para agregar.");
      return;
    }

    if (onAddProducts) {
      onAddProducts(toAdd);
    } else {
      toAdd.forEach(p => onAddProduct(p));
    }

    setAddedFeedback(`¡${toAdd.length} producto(s) agregado(s) con éxito al pedido!`);
    setTimeout(() => {
      setAddedFeedback(null);
      handleReset();
    }, 1200);
  };

  // Quick direct add for items that don't need accessories
  const handleQuickAdd = (item: VisualItemOption) => {
    const p = products.find(prod => prod.id === item.productId);
    if (!p) {
      alert("No se encontró el producto en el catálogo.");
      return;
    }
    onAddProduct(p);
    setAddedFeedback(`¡${p.name} agregado al pedido!`);
    setTimeout(() => setAddedFeedback(null), 1200);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-3 md:p-6 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200/80 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">
        
        {/* MODAL HEADER */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-50 to-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center text-brand-600 shadow-sm">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-slate-800 tracking-tight">Catálogo Visual en Cascada</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-brand-100 text-brand-700">
                  Rápido
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium">Navegá paso a paso para configurar y agregar productos</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isAdmin && (
              <a 
                href="/admin/ajustes" 
                target="_blank" 
                rel="noreferrer"
                title="Configurar opciones e imágenes"
                className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-brand-600 hover:border-brand-300 text-xs font-bold transition-colors"
              >
                <Settings className="w-3.5 h-3.5" />
                <span>Configurar Catálogo</span>
              </a>
            )}
            <button
              onClick={handleClose}
              className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* BREADCRUMBS BAR */}
        <div className="px-5 py-2.5 bg-slate-50/70 border-b border-slate-200/60 flex items-center justify-between text-xs font-bold text-slate-600 overflow-x-auto">
          <div className="flex items-center gap-1.5 flex-nowrap">
            <button 
              onClick={handleReset}
              className={`hover:text-brand-600 transition-colors ${!selectedFamilyId ? 'text-brand-600 font-extrabold' : ''}`}
            >
              Inicio
            </button>

            {currentFamily && (
              <>
                <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <button
                  onClick={() => {
                    setSelectedSubgroupId(null);
                    setSelectedItem(null);
                  }}
                  className={`hover:text-brand-600 transition-colors ${!selectedSubgroupId ? 'text-brand-600 font-extrabold' : ''}`}
                >
                  {currentFamily.name}
                </button>
              </>
            )}

            {currentSubgroup && (
              <>
                <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <button
                  onClick={() => setSelectedItem(null)}
                  className={`hover:text-brand-600 transition-colors ${!selectedItem ? 'text-brand-600 font-extrabold' : ''}`}
                >
                  {currentSubgroup.name}
                </button>
              </>
            )}

            {selectedItem && (
              <>
                <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="text-brand-600 font-extrabold">{selectedItem.label}</span>
              </>
            )}
          </div>

          {(selectedFamilyId || selectedSubgroupId || selectedItem) && (
            <button
              onClick={() => {
                if (selectedItem) {
                  setSelectedItem(null);
                } else if (selectedSubgroupId) {
                  if (currentFamily && currentFamily.subgroups.length <= 1) {
                    setSelectedFamilyId(null);
                    setSelectedSubgroupId(null);
                  } else {
                    setSelectedSubgroupId(null);
                  }
                } else {
                  setSelectedFamilyId(null);
                }
              }}
              className="flex items-center gap-1 text-slate-500 hover:text-slate-800 transition-colors font-bold px-2 py-1 rounded-md hover:bg-slate-200/60"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Atrás</span>
            </button>
          )}
        </div>

        {/* NOTIFICATION FEEDBACK */}
        {addedFeedback && (
          <div className="bg-emerald-600 text-white py-2 px-4 text-center font-black text-xs flex items-center justify-center gap-2 animate-in slide-in-from-top duration-150">
            <Check className="w-4 h-4" />
            <span>{addedFeedback}</span>
          </div>
        )}

        {/* MODAL BODY */}
        <div className="p-5 overflow-y-auto flex-1 bg-white">
          
          {/* LEVEL 1: FAMILIAS PRINCIPALES */}
          {!selectedFamilyId && (
            <div className="space-y-4">
              <div className="text-center max-w-md mx-auto mb-6">
                <h4 className="text-base font-black text-slate-800">¿Qué producto deseás agregar?</h4>
                <p className="text-xs text-slate-500 font-medium mt-1">Elegí la familia de productos</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {activeFamilies.map(fam => (
                  <div
                    key={fam.id}
                    onClick={() => {
                      setSelectedFamilyId(fam.id);
                      if (fam.subgroups.length === 1) {
                        setSelectedSubgroupId(fam.subgroups[0].id);
                      }
                    }}
                    className="p-4 rounded-xl border border-slate-200 hover:border-brand-500 hover:shadow-lg transition-all cursor-pointer bg-white flex flex-col items-center text-center group hover:-translate-y-0.5"
                  >
                    <div className="w-full h-36 rounded-lg bg-slate-50 flex items-center justify-center overflow-hidden mb-3 p-2 group-hover:bg-brand-50/40 transition-colors">
                      {fam.imageUrl ? (
                        <img 
                          src={fam.imageUrl} 
                          alt={fam.name}
                          className="max-h-full max-w-full object-contain group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <Layers className="w-10 h-10 text-slate-300" />
                      )}
                    </div>
                    <h5 className="font-black text-sm text-slate-800 group-hover:text-brand-600 transition-colors">
                      {fam.name}
                    </h5>
                    <p className="text-[11px] text-slate-500 font-medium mt-0.5">{fam.description}</p>
                    <span className="mt-3 text-[10px] font-black uppercase tracking-wider text-brand-600 group-hover:underline flex items-center gap-1">
                      Explorar <ChevronRight className="w-3 h-3" />
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* LEVEL 2: SUBGRUPOS (COLORES / MARCAS / COMBOS) */}
          {selectedFamilyId && !selectedSubgroupId && currentFamily && (
            <div className="space-y-4">
              <div className="text-center max-w-md mx-auto mb-6">
                <h4 className="text-base font-black text-slate-800">Seleccioná la línea o modelo</h4>
                <p className="text-xs text-slate-500 font-medium mt-1">Opciones activas para {currentFamily.name}</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {activeSubgroups.map(sub => (
                  <div
                    key={sub.id}
                    onClick={() => setSelectedSubgroupId(sub.id)}
                    className="p-4 rounded-xl border border-slate-200 hover:border-brand-500 hover:shadow-md transition-all cursor-pointer bg-white flex items-center gap-4 group"
                  >
                    <div className="w-24 h-24 rounded-lg bg-slate-50 p-1 flex items-center justify-center shrink-0 border border-slate-100 overflow-hidden">
                      {sub.imageUrl ? (
                        <img 
                          src={sub.imageUrl} 
                          alt={sub.name}
                          className="max-h-full max-w-full object-contain group-hover:scale-105 transition-transform"
                        />
                      ) : (
                        <Layers className="w-8 h-8 text-slate-300" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {sub.badgeColor && (
                          <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${sub.badgeColor}`}>
                            Línea
                          </span>
                        )}
                        <h5 className="font-black text-sm text-slate-800 group-hover:text-brand-600 transition-colors truncate">
                          {sub.name}
                        </h5>
                      </div>
                      <p className="text-[11px] text-slate-500 font-medium line-clamp-2">{sub.description}</p>
                      <p className="text-[10px] text-brand-600 font-bold mt-2 flex items-center gap-1">
                        Ver litrajes disponibles ({sub.items.filter(i => i.isActive).length}) <ChevronRight className="w-3 h-3" />
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* LEVEL 3: ITEMS / LITRAJES / COMBOS */}
          {selectedSubgroupId && !selectedItem && currentSubgroup && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-100">
                <div>
                  <h4 className="text-base font-black text-slate-800">Elegí la capacidad / opción</h4>
                  <p className="text-xs text-slate-500 font-medium">
                    Mostrando capacidades disponibles para {currentSubgroup.name}
                  </p>
                </div>

                {/* Seller on-the-fly view mode toggle */}
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 self-end sm:self-auto">
                  <button
                    type="button"
                    onClick={() => {
                      setConfig(prev => prev ? { ...prev, itemsViewMode: 'list', showItemImages: false } : prev);
                    }}
                    className={`px-2 py-1 rounded text-xs font-bold flex items-center gap-1 transition-all ${
                      config?.itemsViewMode === 'list' || !config?.showItemImages
                        ? 'bg-white text-brand-600 shadow-sm font-black'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <List className="w-3.5 h-3.5" />
                    <span>Listado</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConfig(prev => prev ? { ...prev, itemsViewMode: 'grid', showItemImages: true } : prev);
                    }}
                    className={`px-2 py-1 rounded text-xs font-bold flex items-center gap-1 transition-all ${
                      config?.itemsViewMode === 'grid' && config?.showItemImages
                        ? 'bg-white text-brand-600 shadow-sm font-black'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Grid className="w-3.5 h-3.5" />
                    <span>Fotos</span>
                  </button>
                </div>
              </div>

              {activeItems.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs">
                  No hay opciones disponibles en este subgrupo actualmente.
                </div>
              ) : config?.itemsViewMode === 'list' || !config?.showItemImages ? (
                /* CLEAN HIGH-DENSITY LIST VIEW (NO REPETITIVE IMAGES) */
                <div className="divide-y divide-slate-100 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  {activeItems.map(item => {
                    const prodMatch = products.find(p => p.id === item.productId);
                    const isAvailable = Boolean(prodMatch);

                    return (
                      <div
                        key={item.id}
                        onClick={() => {
                          if (item.allowCiego || item.recommendedBaseCm) {
                            setSelectedItem(item);
                          } else {
                            handleQuickAdd(item);
                          }
                        }}
                        className={`p-3.5 flex items-center justify-between gap-4 transition-all ${
                          isAvailable
                            ? 'hover:bg-brand-50/50 cursor-pointer group'
                            : 'bg-slate-50/60 opacity-60'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="font-black text-sm text-slate-800 group-hover:text-brand-600 transition-colors">
                              {item.label}
                            </span>
                            {item.badge && (
                              <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wide bg-amber-100 text-amber-800">
                                {item.badge}
                              </span>
                            )}
                          </div>
                          {prodMatch && (
                            <p className="text-[11px] text-slate-500 font-medium truncate">
                              {prodMatch.name}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          <div className="text-right">
                            {prodMatch ? (
                              <p className="font-black text-base text-slate-900 group-hover:text-brand-600 transition-colors">
                                {fmt(prodMatch.price)}
                              </p>
                            ) : (
                              <p className="text-xs font-bold text-slate-400">Consultar</p>
                            )}
                            <span className="text-[10px] font-bold text-slate-400">
                              {item.allowCiego || item.recommendedBaseCm ? 'Configurar opciones' : 'Agregar directo'}
                            </span>
                          </div>

                          <div className="w-8 h-8 rounded-lg bg-slate-100 group-hover:bg-brand-600 group-hover:text-white text-slate-600 flex items-center justify-center transition-colors">
                            {item.allowCiego || item.recommendedBaseCm ? (
                              <ChevronRight className="w-4 h-4" />
                            ) : (
                              <Plus className="w-4 h-4" />
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* GRID CARDS VIEW WITH IMAGES */
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {activeItems.map(item => {
                    const prodMatch = products.find(p => p.id === item.productId);
                    const isAvailable = Boolean(prodMatch);

                    return (
                      <div
                        key={item.id}
                        onClick={() => {
                          if (item.allowCiego || item.recommendedBaseCm) {
                            setSelectedItem(item);
                          } else {
                            handleQuickAdd(item);
                          }
                        }}
                        className={`p-3 rounded-xl border transition-all text-center flex flex-col justify-between ${
                          isAvailable 
                            ? 'border-slate-200 hover:border-brand-500 hover:shadow-md cursor-pointer bg-white group hover:-translate-y-0.5' 
                            : 'border-slate-100 bg-slate-50/60 opacity-60'
                        }`}
                      >
                        <div>
                          {item.badge && (
                            <span className="inline-block px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wide bg-amber-100 text-amber-800 mb-1">
                              {item.badge}
                            </span>
                          )}
                          <div className="w-16 h-16 mx-auto mb-2 flex items-center justify-center p-1 overflow-hidden">
                            <img 
                              src={prodMatch?.image_url || item.imageUrl || currentSubgroup.imageUrl} 
                              alt={item.label}
                              className="max-h-full max-w-full object-contain group-hover:scale-110 transition-transform"
                            />
                          </div>
                          <h6 className="font-black text-xs text-slate-800 group-hover:text-brand-600 transition-colors">
                            {item.label}
                          </h6>
                        </div>

                        <div className="mt-3 pt-2 border-t border-slate-100">
                          {prodMatch ? (
                            <>
                              <p className="font-black text-sm text-brand-600">{fmt(prodMatch.price)}</p>
                              <span className="text-[9px] font-bold text-slate-400">
                                {item.allowCiego || item.recommendedBaseCm ? 'Configurar' : 'Agregar'}
                              </span>
                            </>
                          ) : (
                            <p className="text-[10px] font-bold text-slate-400">Consultar</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* LEVEL 4: OPCIONES Y ACCESORIOS (COMPLETO / CIEGO / BASE / FLOTANTE) */}
          {selectedItem && (
            <div className="space-y-6 max-w-2xl mx-auto">
              
              {/* RESUMEN DEL PRODUCTO SELECCIONADO */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-4">
                <div className="w-20 h-20 bg-white rounded-lg border border-slate-200 p-2 flex items-center justify-center shrink-0">
                  <img 
                    src={resolvedMainProduct?.image_url || selectedItem.imageUrl || currentSubgroup?.imageUrl} 
                    alt={selectedItem.label}
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[8px] font-black uppercase bg-brand-100 text-brand-800">
                      {currentSubgroup?.name}
                    </span>
                    <span className="text-xs font-black text-slate-400">|</span>
                    <span className="text-xs font-black text-slate-700">{selectedItem.label}</span>
                  </div>
                  <h5 className="font-black text-sm text-slate-900 mt-1">
                    {resolvedMainProduct?.name || selectedItem.label}
                  </h5>
                  <p className="text-xs font-black text-brand-600 mt-0.5">
                    Precio: {fmt(resolvedMainProduct?.price)}
                  </p>
                </div>
              </div>

              {/* 1. SELECCIÓN DE VARIANTE: COMPLETO VS CIEGO (SI APLICA) */}
              {selectedItem.allowCiego && (
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                    1. Perforación y Accesorios de Fábrica
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    
                    <div 
                      onClick={() => setIsCiego(false)}
                      className={`p-3 rounded-xl border cursor-pointer transition-all ${
                        !isCiego 
                          ? 'border-brand-500 bg-brand-50/40 ring-2 ring-brand-500/20' 
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-black text-xs text-slate-800">🔘 Completo (Estándar)</span>
                        {!isCiego && <Check className="w-4 h-4 text-brand-600" />}
                      </div>
                      <p className="text-[10px] text-slate-500 mt-1">Con orificios y flotante de fábrica incluido.</p>
                    </div>

                    <div 
                      onClick={() => setIsCiego(true)}
                      className={`p-3 rounded-xl border cursor-pointer transition-all ${
                        isCiego 
                          ? 'border-amber-500 bg-amber-50/40 ring-2 ring-amber-500/20' 
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-black text-xs text-slate-800">🔘 Ciego (Sin Orificios)</span>
                        {isCiego && <Check className="w-4 h-4 text-amber-600" />}
                      </div>
                      <p className="text-[10px] text-slate-500 mt-1">Sin perforaciones, ideal para conexiones a medida.</p>
                    </div>

                  </div>
                </div>
              )}

              {/* 2. ACCESORIOS RECOMENDADOS (BASE Y FLOTANTE) */}
              {(resolvedBaseProduct || resolvedFlotanteProduct) && (
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                    2. Agregar Accesorios en 1 Clic
                  </label>
                  
                  <div className="space-y-2.5">
                    {/* BASE RECOMENDADA */}
                    {resolvedBaseProduct && (
                      <div 
                        onClick={() => setIncludeBase(!includeBase)}
                        className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                          includeBase 
                            ? 'border-brand-500 bg-brand-50/30 ring-1 ring-brand-500/20' 
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <input 
                            type="checkbox" 
                            checked={includeBase} 
                            onChange={() => {}} 
                            className="w-4 h-4 rounded text-brand-600 focus:ring-brand-500 border-slate-300"
                          />
                          <div>
                            <p className="font-black text-xs text-slate-800 flex items-center gap-1.5">
                              <span>{resolvedBaseProduct.name}</span>
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
                                Recomendada ({selectedItem.recommendedBaseCm} cm)
                              </span>
                            </p>
                            <p className="text-[10px] text-slate-500 font-medium">Estructura de hierro reforzada para base segura</p>
                          </div>
                        </div>
                        <span className="font-black text-xs text-slate-800">+{fmt(resolvedBaseProduct.price)}</span>
                      </div>
                    )}

                    {/* FLOTANTE ADICIONAL */}
                    {resolvedFlotanteProduct && (
                      <div 
                        onClick={() => setIncludeFlotante(!includeFlotante)}
                        className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                          includeFlotante 
                            ? 'border-brand-500 bg-brand-50/30 ring-1 ring-brand-500/20' 
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <input 
                            type="checkbox" 
                            checked={includeFlotante} 
                            onChange={() => {}} 
                            className="w-4 h-4 rounded text-brand-600 focus:ring-brand-500 border-slate-300"
                          />
                          <div>
                            <p className="font-black text-xs text-slate-800">{resolvedFlotanteProduct.name}</p>
                            <p className="text-[10px] text-slate-500 font-medium">Repuesto o flotante adicional</p>
                          </div>
                        </div>
                        <span className="font-black text-xs text-slate-800">+{fmt(resolvedFlotanteProduct.price)}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* RESUMEN TOTAL Y BOTÓN DE CONFIRMACIÓN */}
              <div className="p-4 rounded-xl bg-slate-900 text-white flex flex-col sm:flex-row items-center justify-between gap-4 mt-6">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Total a Agregar</p>
                  <p className="text-xl font-black text-white">
                    {fmt(
                      (resolvedMainProduct?.price || 0) +
                      (includeBase && resolvedBaseProduct ? resolvedBaseProduct.price : 0) +
                      (includeFlotante && resolvedFlotanteProduct ? resolvedFlotanteProduct.price : 0)
                    )}
                  </p>
                  <p className="text-[11px] text-slate-300">
                    {1 + (includeBase ? 1 : 0) + (includeFlotante ? 1 : 0)} producto(s) en total
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleConfirmAdd}
                  className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-black text-xs uppercase tracking-wider shadow-lg hover:shadow-brand-500/30 transition-all flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>Agregar al Pedido</span>
                </button>
              </div>

            </div>
          )}

        </div>

        {/* MODAL FOOTER */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 font-medium">
          <div className="flex items-center gap-2">
            <Info className="w-3.5 h-3.5 text-slate-400" />
            <span>Los productos agregados se pueden ajustar o eliminar en el carrito en cualquier momento.</span>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-1.5 rounded-lg border border-slate-200 text-slate-700 font-black text-xs hover:bg-slate-100 transition-colors"
          >
            Cerrar
          </button>
        </div>

      </div>
    </div>
  );
}

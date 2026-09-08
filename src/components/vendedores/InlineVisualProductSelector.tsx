"use client";

import React, { useState, useMemo, useEffect } from "react";
import { 
  ChevronRight, 
  ArrowLeft, 
  Sparkles, 
  Check, 
  Plus, 
  Layers, 
  List, 
  Grid 
} from "lucide-react";
import { Product } from "@/types";
import { 
  VisualCatalogConfig,
  VisualItemOption,
  generateDefaultVisualConfig,
  findRecommendedBase,
  findFlotanteProduct
} from "@/lib/visualSelectorConfig";
import { supabase } from "@/lib/supabase";

interface InlineVisualProductSelectorProps {
  products: Product[];
  onAddProduct: (product: Product) => void;
  onAddProducts?: (products: Product[]) => void;
}

export default function InlineVisualProductSelector({
  products,
  onAddProduct,
  onAddProducts
}: InlineVisualProductSelectorProps) {
  const [config, setConfig] = useState<VisualCatalogConfig | null>(null);
  const [loading, setLoading] = useState(true);

  // Cascade Navigation State
  const [selectedFamilyId, setSelectedFamilyId] = useState<string | null>(null);
  const [selectedSubgroupId, setSelectedSubgroupId] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<VisualItemOption | null>(null);

  // Tanque / Product Options State
  const [isCiego, setIsCiego] = useState(false);
  const [includeBase, setIncludeBase] = useState(false);
  const [includeFlotante, setIncludeFlotante] = useState(false);

  // Feedback banner
  const [addedFeedback, setAddedFeedback] = useState<string | null>(null);

  // Load configuration from site_settings or fallback
  useEffect(() => {
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
  }, [products]);

  // Reset cascade
  const handleReset = () => {
    setSelectedFamilyId(null);
    setSelectedSubgroupId(null);
    setSelectedItem(null);
    setIsCiego(false);
    setIncludeBase(false);
    setIncludeFlotante(false);
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
    if (!selectedItem) return undefined;
    if (isCiego && selectedItem.ciegoProductId) {
      const ciegoMatch = products.find(p => p.id === selectedItem.ciegoProductId);
      if (ciegoMatch) return ciegoMatch;
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

    if (resolvedMainProduct) toAdd.push(resolvedMainProduct);
    if (includeBase && resolvedBaseProduct) toAdd.push(resolvedBaseProduct);
    if (includeFlotante && resolvedFlotanteProduct) toAdd.push(resolvedFlotanteProduct);

    if (toAdd.length === 0) {
      alert("No se encontró ningún producto para agregar.");
      return;
    }

    if (onAddProducts) {
      onAddProducts(toAdd);
    } else {
      toAdd.forEach(p => onAddProduct(p));
    }

    setAddedFeedback(`¡${toAdd.length} producto(s) agregado(s)!`);
    setTimeout(() => {
      setAddedFeedback(null);
      handleReset();
    }, 1200);
  };

  // Helper to compute item price (for combos, kits or direct products)
  const getItemPrice = (item: VisualItemOption, prodMatch?: Product) => {
    if (item.price !== undefined) return item.price;
    if (item.isCombo && item.comboItems && item.comboItems.length > 0) {
      return item.comboItems.reduce((acc, ci) => {
        const p = products.find(prod => prod.id === ci.productId);
        const unit = ci.customPrice !== undefined ? ci.customPrice : (p?.price || 0);
        return acc + unit * (ci.quantity || 1);
      }, 0);
    }
    return prodMatch?.price;
  };

  // Quick direct add for items without customization
  const handleQuickAdd = (item: VisualItemOption) => {
    // 1. If it is a combo with bundled products
    if (item.isCombo && item.comboItems && item.comboItems.length > 0) {
      const itemsToAdd: (Product & { 
        customPrice?: number; 
        quantity?: number; 
        bundleParentId?: string; 
        isIncludedInKit?: boolean; 
        baseQuantity?: number; 
      })[] = [];

      const isKit = (item.label || "").toLowerCase().includes("kit") || (item.badge || "").toLowerCase().includes("kit");
      const primaryItem = item.comboItems[0];
      const primaryProd = products.find(p => p.id === primaryItem.productId);
      const parentId = primaryProd?.id;

      for (let idx = 0; idx < item.comboItems.length; idx++) {
        const ci = item.comboItems[idx];
        const prod = products.find(p => p.id === ci.productId);
        if (prod) {
          const effectiveBase = ci.basePrice !== undefined ? ci.basePrice : prod.price;
          const effectiveCustom = ci.customPrice !== undefined ? ci.customPrice : prod.price;
          const discType = ci.discountType || (effectiveCustom < effectiveBase ? 'percentage' : undefined);
          const discVal = ci.discountValue !== undefined ? ci.discountValue : (discType === 'percentage' && effectiveBase > 0 ? Math.round(((effectiveBase - effectiveCustom) / effectiveBase) * 100) : undefined);

          itemsToAdd.push({
            ...prod,
            quantity: ci.quantity || 1,
            customPrice: effectiveCustom,
            basePrice: effectiveBase,
            discountType: discType,
            discountValue: discVal,
            bundleParentId: (isKit && idx > 0) ? parentId : undefined,
            isIncludedInKit: isKit && idx > 0,
            baseQuantity: ci.quantity || 1
          } as any);
        }
      }
      if (itemsToAdd.length > 0) {
        if (onAddProducts) {
          onAddProducts(itemsToAdd as any);
        } else {
          itemsToAdd.forEach(p => onAddProduct(p as any));
        }
        setAddedFeedback(`¡${item.label} agregado!`);
        setTimeout(() => setAddedFeedback(null), 1200);
        return;
      }
    }

    // 2. Single product add
    const p = products.find(prod => prod.id === item.productId);
    if (!p) {
      alert("No se encontró el producto en el catálogo.");
      return;
    }
    const finalProduct = item.price !== undefined ? { ...p, price: item.price, customPrice: item.price } : p;
    onAddProduct(finalProduct as any);
    setAddedFeedback(`¡${item.label || p.name} agregado!`);
    setTimeout(() => setAddedFeedback(null), 1200);
  };

  if (loading) {
    return (
      <div className="py-6 text-center text-slate-400 font-bold text-xs flex items-center justify-center gap-2">
        <Sparkles className="w-4 h-4 animate-spin text-brand-600" />
        <span>Cargando selector visual...</span>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200/90 bg-white overflow-hidden shadow-xs">
      
      {/* NAVEGACIÓN PASO A PASO / BREADCRUMB */}
      <div className="px-3 py-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between text-xs font-bold text-slate-600 gap-2">
        <div className="flex items-center gap-1.5 overflow-x-auto min-w-0">
          <button 
            type="button"
            onClick={handleReset}
            className={`hover:text-brand-600 transition-colors uppercase tracking-wider text-[10px] whitespace-nowrap ${!selectedFamilyId ? 'text-brand-600 font-black' : ''}`}
          >
            Categorías
          </button>

          {currentFamily && (
            <>
              <ChevronRight className="w-3 h-3 text-slate-400 shrink-0" />
              <button
                type="button"
                onClick={() => {
                  setSelectedSubgroupId(null);
                  setSelectedItem(null);
                }}
                className={`hover:text-brand-600 transition-colors uppercase tracking-wider text-[10px] whitespace-nowrap ${!selectedSubgroupId ? 'text-brand-600 font-black' : ''}`}
              >
                {currentFamily.name}
              </button>
            </>
          )}

          {currentSubgroup && (
            <>
              <ChevronRight className="w-3 h-3 text-slate-400 shrink-0" />
              <button
                type="button"
                onClick={() => setSelectedItem(null)}
                className={`hover:text-brand-600 transition-colors uppercase tracking-wider text-[10px] whitespace-nowrap ${!selectedItem ? 'text-brand-600 font-black' : ''}`}
              >
                {currentSubgroup.name}
              </button>
            </>
          )}

          {selectedItem && (
            <>
              <ChevronRight className="w-3 h-3 text-slate-400 shrink-0" />
              <span className="text-brand-600 font-black uppercase tracking-wider text-[10px] truncate max-w-[120px]">
                {selectedItem.label}
              </span>
            </>
          )}
        </div>

        {(selectedFamilyId || selectedSubgroupId || selectedItem) && (
          <button
            type="button"
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
            className="flex items-center gap-1 text-slate-500 hover:text-slate-900 transition-colors font-bold px-2 py-0.5 rounded hover:bg-slate-200/60 text-[10px] shrink-0"
          >
            <ArrowLeft className="w-3 h-3" />
            <span>Volver</span>
          </button>
        )}
      </div>

      {/* FEEDBACK BANNER */}
      {addedFeedback && (
        <div className="bg-emerald-600 text-white py-1.5 px-3 text-center font-black text-xs flex items-center justify-center gap-1.5 animate-in slide-in-from-top duration-150">
          <Check className="w-3.5 h-3.5 stroke-[3]" />
          <span>{addedFeedback}</span>
        </div>
      )}

      {/* ÁREA DE CONTENIDO */}
      <div className="p-3">
        
        {/* PASO 1: FAMILIAS PRINCIPALES */}
        {!selectedFamilyId && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {activeFamilies.map(fam => (
              <div
                key={fam.id}
                onClick={() => {
                  setSelectedFamilyId(fam.id);
                  if (fam.subgroups.length === 1) {
                    setSelectedSubgroupId(fam.subgroups[0].id);
                  }
                }}
                className="p-3 rounded-xl border border-slate-200/80 hover:border-brand-500 hover:shadow-xs transition-all cursor-pointer bg-white group flex flex-col items-center text-center"
              >
                <div className="w-14 h-14 rounded-lg bg-slate-50 border border-slate-100 p-1 flex items-center justify-center mb-2 overflow-hidden">
                  {fam.imageUrl ? (
                    <img 
                      src={fam.imageUrl} 
                      alt={fam.name}
                      className="max-h-full max-w-full object-contain group-hover:scale-110 transition-transform"
                    />
                  ) : (
                    <Layers className="w-6 h-6 text-slate-300" />
                  )}
                </div>
                <h5 className="font-black text-xs text-slate-800 group-hover:text-brand-600 transition-colors leading-tight">
                  {fam.name}
                </h5>
                <span className="mt-1 text-[9px] font-black uppercase tracking-wider text-brand-600 flex items-center gap-0.5">
                  Ver opciones <ChevronRight className="w-2.5 h-2.5" />
                </span>
              </div>
            ))}
          </div>
        )}

        {/* PASO 2: SUBGRUPOS (LÍNEA / MODELO) */}
        {selectedFamilyId && !selectedSubgroupId && currentFamily && (
          <div className="space-y-2">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">
              Línea de {currentFamily.name}:
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {activeSubgroups.map(sub => (
                <div
                  key={sub.id}
                  onClick={() => setSelectedSubgroupId(sub.id)}
                  className="p-2.5 rounded-xl border border-slate-200/80 hover:border-brand-500 hover:shadow-xs transition-all cursor-pointer bg-white flex items-center gap-3 group"
                >
                  <div className="w-12 h-12 rounded-lg bg-slate-50 p-1 flex items-center justify-center shrink-0 border border-slate-100 overflow-hidden">
                    {sub.imageUrl ? (
                      <img 
                        src={sub.imageUrl} 
                        alt={sub.name}
                        className="max-h-full max-w-full object-contain group-hover:scale-105 transition-transform"
                      />
                    ) : (
                      <Layers className="w-5 h-5 text-slate-300" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h5 className="font-black text-xs text-slate-800 group-hover:text-brand-600 transition-colors truncate">
                      {sub.name}
                    </h5>
                    <p className="text-[10px] text-slate-400 truncate">{sub.description || 'Línea de productos'}</p>
                    <p className="text-[9px] text-brand-600 font-black mt-0.5 flex items-center gap-0.5">
                      {sub.items.filter(i => i.isActive).length} litrajes <ChevronRight className="w-2.5 h-2.5" />
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* PASO 3: ITEMS / LITRAJES */}
        {selectedSubgroupId && !selectedItem && currentSubgroup && (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-slate-100">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                {currentSubgroup.name} ({activeItems.length} opciones)
              </span>

              {/* Botón de alternancia de vista para el vendedor */}
              <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                <button
                  type="button"
                  onClick={() => {
                    setConfig(prev => prev ? { ...prev, itemsViewMode: 'list', showItemImages: false } : prev);
                  }}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 transition-all ${
                    config?.itemsViewMode === 'list' || !config?.showItemImages
                      ? 'bg-white text-brand-600 shadow-xs font-black'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                  title="Vista en lista sin fotos"
                >
                  <List className="w-3 h-3" />
                  <span>Lista</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConfig(prev => prev ? { ...prev, itemsViewMode: 'grid', showItemImages: true } : prev);
                  }}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 transition-all ${
                    config?.itemsViewMode === 'grid' && config?.showItemImages
                      ? 'bg-white text-brand-600 shadow-xs font-black'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                  title="Vista en fotos"
                >
                  <Grid className="w-3 h-3" />
                  <span>Fotos</span>
                </button>
              </div>
            </div>

            {activeItems.length === 0 ? (
              <div className="p-6 text-center text-slate-400 text-xs">
                No hay opciones disponibles en este subgrupo actualmente.
              </div>
            ) : config?.itemsViewMode === 'list' || !config?.showItemImages ? (
              /* MODO LISTA COMPACTA (ALTA DENSIDAD, SIN FOTOS REPETITIVAS) */
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden max-h-[280px] overflow-y-auto">
                {activeItems.map(item => {
                  const prodMatch = products.find(p => p.id === item.productId);
                  const isAvailable = Boolean(prodMatch) || Boolean(item.isCombo && item.comboItems && item.comboItems.length > 0);
                  const calculatedPrice = getItemPrice(item, prodMatch);

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
                      className={`p-2.5 flex items-center justify-between gap-3 transition-colors ${
                        isAvailable
                          ? 'hover:bg-brand-50/60 cursor-pointer group'
                          : 'bg-slate-50/60 opacity-60'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-black text-xs text-slate-800 group-hover:text-brand-600 transition-colors">
                            {item.label}
                          </span>
                          {item.badge && (
                            <span className="px-1.5 py-0.2 rounded text-[8px] font-black uppercase bg-amber-100 text-amber-800">
                              {item.badge}
                            </span>
                          )}
                        </div>
                        {item.description ? (
                          <p className="text-[10px] text-slate-400 truncate">{item.description}</p>
                        ) : prodMatch ? (
                          <p className="text-[10px] text-slate-400 truncate">{prodMatch.name}</p>
                        ) : null}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <div className="text-right">
                          {calculatedPrice !== undefined ? (
                            <span className="font-black text-xs text-slate-900 group-hover:text-brand-600">
                              {fmt(calculatedPrice)}
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold text-slate-400">Consultar</span>
                          )}
                        </div>
                        <div className="w-6 h-6 rounded bg-slate-100 group-hover:bg-brand-600 group-hover:text-white text-slate-600 flex items-center justify-center transition-colors">
                          {item.allowCiego || item.recommendedBaseCm ? (
                            <ChevronRight className="w-3.5 h-3.5" />
                          ) : (
                            <Plus className="w-3.5 h-3.5" />
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* MODO CUADRÍCULA CON FOTOS */
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[300px] overflow-y-auto p-0.5">
                {activeItems.map(item => {
                  const prodMatch = products.find(p => p.id === item.productId);
                  const isAvailable = Boolean(prodMatch) || Boolean(item.isCombo && item.comboItems && item.comboItems.length > 0);
                  const calculatedPrice = getItemPrice(item, prodMatch);

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
                      className={`p-2 rounded-xl border transition-all text-center flex flex-col justify-between ${
                        isAvailable 
                          ? 'border-slate-200 hover:border-brand-500 hover:shadow-xs cursor-pointer bg-white group' 
                          : 'border-slate-100 bg-slate-50/60 opacity-60'
                      }`}
                    >
                      <div>
                        {item.badge && (
                          <span className="inline-block px-1.5 py-0.2 rounded text-[7px] font-black uppercase bg-amber-100 text-amber-800 mb-1">
                            {item.badge}
                          </span>
                        )}
                        <div className="w-12 h-12 mx-auto mb-1 flex items-center justify-center p-0.5 overflow-hidden">
                          <img 
                            src={prodMatch?.image_url || item.imageUrl || currentSubgroup.imageUrl} 
                            alt={item.label}
                            className="max-h-full max-w-full object-contain group-hover:scale-105 transition-transform"
                          />
                        </div>
                        <h6 className="font-black text-[11px] text-slate-800 group-hover:text-brand-600 transition-colors leading-tight">
                          {item.label}
                        </h6>
                      </div>

                      <div className="mt-1.5 pt-1 border-t border-slate-100">
                        {calculatedPrice !== undefined ? (
                          <p className="font-black text-xs text-brand-600">{fmt(calculatedPrice)}</p>
                        ) : (
                          <p className="text-[9px] font-bold text-slate-400">Consultar</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* PASO 4: CONFIGURACIÓN RÁPIDA (CIEGO / BASE / FLOTANTE) */}
        {selectedItem && (
          <div className="space-y-3">
            
            {/* ENCABEZADO RESUMEN */}
            <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex items-center gap-3">
              <div className="w-12 h-12 bg-white rounded border border-slate-200 p-1 flex items-center justify-center shrink-0">
                <img 
                  src={resolvedMainProduct?.image_url || selectedItem.imageUrl || currentSubgroup?.imageUrl} 
                  alt={selectedItem.label}
                  className="max-h-full max-w-full object-contain"
                />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-[8px] font-black uppercase tracking-wider text-brand-600">
                  {currentSubgroup?.name}
                </span>
                <h5 className="font-black text-xs text-slate-800 truncate leading-tight">
                  {resolvedMainProduct?.name || selectedItem.label}
                </h5>
                <p className="text-xs font-black text-slate-900 mt-0.5">
                  {fmt(resolvedMainProduct?.price)}
                </p>
              </div>
            </div>

            {/* OPCIÓN CIEGO */}
            {selectedItem.allowCiego && (
              <div className="space-y-1">
                <span className="text-[9px] font-black uppercase text-slate-400">Tipo de Tanque:</span>
                <div className="grid grid-cols-2 gap-2">
                  <div 
                    onClick={() => setIsCiego(false)}
                    className={`p-2 rounded-lg border cursor-pointer transition-all ${
                      !isCiego 
                        ? 'border-brand-500 bg-brand-50/50 ring-1 ring-brand-500/30' 
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-black text-xs text-slate-800">Estándar</span>
                      {!isCiego && <Check className="w-3.5 h-3.5 text-brand-600 stroke-[3]" />}
                    </div>
                    <p className="text-[9px] text-slate-400">Con perforaciones de fábrica.</p>
                  </div>

                  <div 
                    onClick={() => setIsCiego(true)}
                    className={`p-2 rounded-lg border cursor-pointer transition-all ${
                      isCiego 
                        ? 'border-amber-500 bg-amber-50/50 ring-1 ring-amber-500/30' 
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-black text-xs text-slate-800">Ciego</span>
                      {isCiego && <Check className="w-3.5 h-3.5 text-amber-600 stroke-[3]" />}
                    </div>
                    <p className="text-[9px] text-slate-400">Sin perforaciones.</p>
                  </div>
                </div>
              </div>
            )}

            {/* ACCESORIOS RECOMENDADOS (BASE Y FLOTANTE) */}
            {(resolvedBaseProduct || resolvedFlotanteProduct) && (
              <div className="space-y-1">
                <span className="text-[9px] font-black uppercase text-slate-400">Accesorios:</span>
                
                <div className="space-y-1.5">
                  {resolvedBaseProduct && (
                    <div 
                      onClick={() => setIncludeBase(!includeBase)}
                      className={`p-2 rounded-lg border cursor-pointer transition-all flex items-center justify-between ${
                        includeBase 
                          ? 'border-brand-500 bg-brand-50/40 ring-1 ring-brand-500/30' 
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <input 
                          type="checkbox" 
                          checked={includeBase} 
                          onChange={() => {}} 
                          className="w-3.5 h-3.5 rounded text-brand-600 focus:ring-brand-500 border-slate-300"
                        />
                        <div>
                          <p className="font-black text-xs text-slate-800 flex items-center gap-1.5">
                            <span>{resolvedBaseProduct.name}</span>
                            <span className="text-[8px] font-bold px-1 py-0.2 rounded bg-blue-100 text-blue-700">
                              {selectedItem.recommendedBaseCm} cm
                            </span>
                          </p>
                        </div>
                      </div>
                      <span className="font-black text-xs text-slate-800">+{fmt(resolvedBaseProduct.price)}</span>
                    </div>
                  )}

                  {resolvedFlotanteProduct && (
                    <div 
                      onClick={() => setIncludeFlotante(!includeFlotante)}
                      className={`p-2 rounded-lg border cursor-pointer transition-all flex items-center justify-between ${
                        includeFlotante 
                          ? 'border-brand-500 bg-brand-50/40 ring-1 ring-brand-500/30' 
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <input 
                          type="checkbox" 
                          checked={includeFlotante} 
                          onChange={() => {}} 
                          className="w-3.5 h-3.5 rounded text-brand-600 focus:ring-brand-500 border-slate-300"
                        />
                        <div>
                          <p className="font-black text-xs text-slate-800">{resolvedFlotanteProduct.name}</p>
                        </div>
                      </div>
                      <span className="font-black text-xs text-slate-800">+{fmt(resolvedFlotanteProduct.price)}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* BOTÓN CONFIRMAR */}
            <div className="p-3 rounded-xl bg-slate-900 text-white flex items-center justify-between gap-3">
              <div>
                <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Total a Cargar</p>
                <p className="text-base font-black text-white">
                  {fmt(
                    (resolvedMainProduct?.price || 0) +
                    (includeBase && resolvedBaseProduct ? resolvedBaseProduct.price : 0) +
                    (includeFlotante && resolvedFlotanteProduct ? resolvedFlotanteProduct.price : 0)
                  )}
                </p>
              </div>

              <button
                type="button"
                onClick={handleConfirmAdd}
                className="px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white font-black text-xs uppercase tracking-wider shadow-xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Agregar al Pedido</span>
              </button>
            </div>

          </div>
        )}

      </div>

    </div>
  );
}

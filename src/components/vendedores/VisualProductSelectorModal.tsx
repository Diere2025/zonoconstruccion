"use client";

import React, { useState, useMemo, useEffect } from "react";
import { 
  X, 
  ChevronRight, 
  ChevronDown,
  ChevronUp,
  ArrowLeft, 
  Sparkles, 
  Check, 
  Plus, 
  Layers, 
  Info,
  Settings,
  List,
  Grid,
  Search,
  Trash2,
  Package,
  Tag,
  Percent,
  ShoppingBag,
  ShoppingCart
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
import { evaluateDiscountSuggestions, DiscountSuggestion } from "@/lib/discountRules";
import { formatPrice, normalizeText } from "@/lib/utils";

export interface VisualOrderItem extends Product {
  quantity: number;
  customPrice: number;
  basePrice?: number;
  discountType?: 'percentage' | 'fixed';
  discountValue?: number;
  bundleParentId?: string;
  isIncludedInKit?: boolean;
  baseQuantity?: number;
}

interface VisualProductSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  orderItems?: VisualOrderItem[];
  onAddProduct: (product: Product) => void;
  onAddProducts?: (products: Product[]) => void;
  onUpdateQuantity?: (id: string, qty: number) => void;
  onUpdateCustomPrice?: (id: string, price: number) => void;
  onUpdateItemDiscount?: (id: string, discountType: 'percentage' | 'fixed', discountValue: number) => void;
  onRemoveItem?: (id: string) => void;
  onUpdateKitQuantity?: (kitId: string, newQty: number, included: VisualOrderItem[]) => void;
  onRemoveKit?: (kitId: string, included: VisualOrderItem[]) => void;
  onClearOrderItems?: () => void;
  orderDiscountType?: 'percentage' | 'fixed';
  orderDiscountValue?: number;
  onUpdateOrderDiscount?: (type: 'percentage' | 'fixed', value: number) => void;
  onApplyDiscountSuggestion?: (sug: DiscountSuggestion) => void;
  isAdmin?: boolean;
}

export default function VisualProductSelectorModal({
  isOpen,
  onClose,
  products,
  orderItems = [],
  onAddProduct,
  onAddProducts,
  onUpdateQuantity,
  onUpdateCustomPrice,
  onUpdateItemDiscount,
  onRemoveItem,
  onUpdateKitQuantity,
  onRemoveKit,
  onClearOrderItems,
  orderDiscountType = 'percentage',
  orderDiscountValue = 0,
  onUpdateOrderDiscount,
  onApplyDiscountSuggestion,
  isAdmin = false
}: VisualProductSelectorModalProps) {
  const [config, setConfig] = useState<VisualCatalogConfig | null>(null);
  const [loading, setLoading] = useState(true);

  // Search & Navigation
  const [searchQuery, setSearchQuery] = useState("");
  const [mobileTab, setMobileTab] = useState<'catalog' | 'cart'>('catalog');

  // Cascade Navigation State
  // Step 1: Family, Step 2: Subgroup, Step 3: Items/Litrajes, Step 4: Options & Addons
  const [selectedFamilyId, setSelectedFamilyId] = useState<string | null>(null);
  const [selectedSubgroupId, setSelectedSubgroupId] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<VisualItemOption | null>(null);

  // Tanque / Product Options State
  const [isCiego, setIsCiego] = useState(false);
  const [includeBase, setIncludeBase] = useState(false);
  const [includeFlotante, setIncludeFlotante] = useState(false);

  // Kit Accordion State in Cart
  const [expandedKits, setExpandedKits] = useState<Record<string, boolean>>({});
  const toggleKitExpand = (kitId: string) => {
    setExpandedKits(prev => ({ ...prev, [kitId]: !prev[kitId] }));
  };

  // Item Discounts Accordion State in Cart
  const [openDiscountItemIds, setOpenDiscountItemIds] = useState<Record<string, boolean>>({});
  const toggleItemDiscount = (id: string) => {
    setOpenDiscountItemIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Feedback banner
  const [addedFeedback, setAddedFeedback] = useState<string | null>(null);

  // View mode: defaults to 'grid' (Fotos)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  useEffect(() => {
    try {
      const saved = localStorage.getItem('zonoconstruccion_selector_view_mode');
      if (saved === 'list' || saved === 'grid') {
        setViewMode(saved);
      } else {
        setViewMode('grid');
      }
    } catch (e) {}
  }, []);

  const handleToggleViewMode = (mode: 'grid' | 'list') => {
    setViewMode(mode);
    try {
      localStorage.setItem('zonoconstruccion_selector_view_mode', mode);
    } catch (e) {}
  };

  // Load configuration from site_settings or fallback
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
    setSearchQuery("");
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  // Format currency helper
  const fmt = (val?: number) => {
    if (val === undefined || val === null) return "$0";
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(val);
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

  // Fast text search across all products (accent and case insensitive)
  const searchResults = useMemo(() => {
    const q = normalizeText(searchQuery);
    if (!q) return [];
    const words = q.split(/\s+/).filter(Boolean);
    return products
      .filter(p => {
        const full = normalizeText(`${p.name} ${p.sku || ""} ${p.category || ""}`);
        return words.every(w => full.includes(w));
      })
      .slice(0, 40);
  }, [products, searchQuery]);

  // Product resolution for selected item options
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

  // Compute item price
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

  // Add confirmed items to order
  const handleConfirmAdd = () => {
    const toAdd: Product[] = [];

    if (resolvedMainProduct) {
      toAdd.push(resolvedMainProduct);
    }
    if (includeBase && resolvedBaseProduct) {
      toAdd.push(resolvedBaseProduct);
    }
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

    setAddedFeedback(`¡${toAdd.length} producto(s) agregado(s) con éxito!`);
    setTimeout(() => {
      setAddedFeedback(null);
      handleReset();
    }, 1200);
  };

  // Quick direct add for items
  const handleQuickAdd = (item: VisualItemOption) => {
    // 1. Combo / Kit
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
        setAddedFeedback(`¡${item.label} agregado al pedido!`);
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
    setAddedFeedback(`¡${item.label || p.name} agregado al pedido!`);
    setTimeout(() => setAddedFeedback(null), 1200);
  };

  // Quick add from search result
  const handleAddSearchItem = (p: Product) => {
    onAddProduct(p);
    setAddedFeedback(`¡${p.name} agregado!`);
    setTimeout(() => setAddedFeedback(null), 1200);
  };

  // Group items in live cart (discounts and editable products)
  const { discountItems, standardItems, totalOrderCount } = useMemo(() => {
    const isDisc = (i: VisualOrderItem) => {
      const name = (i.name || "").toLowerCase();
      const sku = (i.sku || "").toLowerCase();
      return name.includes("descuento") || sku.includes("descuento") || name.includes("bonificaci") || sku.includes("bonificaci") || (i.customPrice < 0);
    };

    const discounts = orderItems.filter(isDisc);
    const standards = orderItems.filter(i => !isDisc(i));

    return {
      discountItems: discounts,
      standardItems: standards,
      totalOrderCount: orderItems.length
    };
  }, [orderItems]);

  // Calculate live gross subtotal and order discount
  const itemsGrossSubtotal = useMemo(() => {
    return orderItems.reduce((acc, item) => {
      const name = (item.name || "").toLowerCase();
      const sku = (item.sku || "").toLowerCase();
      const isDisc = name.includes("descuento") || sku.includes("descuento") || name.includes("bonificaci") || sku.includes("bonificaci");
      const unit = item.customPrice !== undefined ? item.customPrice : item.price;
      const effectivePrice = isDisc ? -Math.abs(unit) : unit;
      return acc + (effectivePrice * item.quantity);
    }, 0);
  }, [orderItems]);

  const orderDiscountAmount = useMemo(() => {
    if (!orderDiscountValue || orderDiscountValue <= 0) return 0;
    if (orderDiscountType === 'percentage') {
      return Math.round(itemsGrossSubtotal * (Math.min(100, orderDiscountValue) / 100));
    }
    return Math.min(itemsGrossSubtotal, orderDiscountValue);
  }, [itemsGrossSubtotal, orderDiscountType, orderDiscountValue]);

  const subtotal = Math.max(0, itemsGrossSubtotal - orderDiscountAmount);

  // Evaluar sugerencias automáticas de bonificaciones por cantidad (ej: MEP x2, x3, x6, x12)
  const discountSuggestions = useMemo(() => {
    return evaluateDiscountSuggestions(orderItems, products);
  }, [orderItems, products]);

  const handleApplyDiscountSuggestion = (sug: DiscountSuggestion) => {
    if (onApplyDiscountSuggestion) {
      onApplyDiscountSuggestion(sug);
      return;
    }

    if (sug.existingDiscountItemId) {
      onRemoveItem?.(sug.existingDiscountItemId);
    }

    if (sug.itemDiscountAction) {
      const { itemIds, discountPct } = sug.itemDiscountAction;
      itemIds.forEach(id => {
        onUpdateItemDiscount?.(id, 'percentage', discountPct);
      });
      return;
    }

    if (sug.targetProduct) {
      const prodToAdd = {
        ...sug.targetProduct,
        quantity: sug.suggestedQty,
        customPrice: -sug.unitDiscount,
        basePrice: -sug.unitDiscount
      };
      if (onAddProducts) {
        onAddProducts([prodToAdd]);
      } else {
        onAddProduct(prodToAdd);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-1.5 sm:p-2.5 md:p-3.5 overflow-hidden animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200/90 w-full max-w-[98vw] 2xl:max-w-[1760px] h-[96vh] flex flex-col overflow-hidden">
        
        {/* ======================= MODAL HEADER ======================= */}
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-gradient-to-r from-slate-50 via-white to-slate-50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center text-brand-600 shadow-sm shrink-0">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-slate-800 tracking-tight">
                  Selector de Productos y Detalle del Pedido
                </h3>
                <span className="hidden sm:inline-flex px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-brand-100 text-brand-700">
                  Carga Rápida
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium">
                Agregá productos o kits y administrá las cantidades en tiempo real
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Quick status pill */}
            <div className="hidden md:flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200 text-xs">
              <ShoppingCart className="w-4 h-4 text-emerald-600" />
              <span className="font-bold text-slate-700">
                {totalOrderCount} {totalOrderCount === 1 ? 'artículo' : 'artículos'}
              </span>
              <span className="text-slate-300">|</span>
              <span className="font-black text-emerald-700">{fmt(subtotal)}</span>
            </div>

            {isAdmin && (
              <a 
                href="/admin/ajustes" 
                target="_blank" 
                rel="noreferrer"
                title="Configurar opciones e imágenes del catálogo"
                className="hidden xl:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-brand-600 hover:border-brand-300 text-xs font-bold transition-colors"
              >
                <Settings className="w-3.5 h-3.5" />
                <span>Configurar Catálogo</span>
              </a>
            )}

            {/* Confirm & Close Button */}
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-sm hover:shadow transition-all cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>Confirmar y Volver</span>
            </button>

            <button
              type="button"
              onClick={handleClose}
              className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              title="Cerrar modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* FEEDBACK BANNER */}
        {addedFeedback && (
          <div className="bg-emerald-600 text-white py-2 px-4 text-center font-black text-xs flex items-center justify-center gap-2 animate-in slide-in-from-top duration-150 shrink-0">
            <Check className="w-4 h-4" />
            <span>{addedFeedback}</span>
          </div>
        )}

        {/* MOBILE TAB SELECTOR (< lg screens) */}
        <div className="lg:hidden flex border-b border-slate-200 bg-slate-50 shrink-0">
          <button
            type="button"
            onClick={() => setMobileTab('catalog')}
            className={`flex-1 py-2.5 text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 border-b-2 transition-colors ${
              mobileTab === 'catalog'
                ? 'border-brand-600 text-brand-600 bg-white'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Search className="w-3.5 h-3.5" />
            <span>1. Catálogo / Buscador</span>
          </button>
          <button
            type="button"
            onClick={() => setMobileTab('cart')}
            className={`flex-1 py-2.5 text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 border-b-2 transition-colors ${
              mobileTab === 'cart'
                ? 'border-emerald-600 text-emerald-600 bg-white'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            <span>2. Detalle del Pedido ({totalOrderCount})</span>
          </button>
        </div>

        {/* ======================= MODAL BODY (SPLIT 2 COLUMNS) ======================= */}
        <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 min-h-0">
          
          {/* ========================================================= */}
          {/* LEFT COLUMN: BUSCADOR MANUAL + SELECTOR VISUAL EN CASCADA */}
          {/* ========================================================= */}
          <div className={`lg:col-span-7 flex flex-col h-full overflow-hidden bg-white ${
            mobileTab === 'cart' ? 'hidden lg:flex' : 'flex'
          }`}>
            
            {/* SEARCH BAR AT TOP OF LEFT COLUMN */}
            <div className="p-3.5 border-b border-slate-100 bg-slate-50/70 shrink-0">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscá por nombre, capacidad o código (ej: 1000L, bicapa, membrana, kit...)"
                  className="w-full pl-9 pr-8 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all placeholder:text-slate-400 placeholder:font-normal"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-0.5 rounded cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* IF SEARCH IS ACTIVE: SHOW INSTANT SEARCH RESULTS */}
            {searchQuery.trim().length > 0 ? (
              <div className="flex-1 overflow-y-auto p-4 min-h-0">
                <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-100">
                  <span className="text-xs font-bold text-slate-500">
                    Resultados para &quot;<span className="text-slate-900 font-extrabold">{searchQuery}</span>&quot; ({searchResults.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="text-[11px] font-bold text-brand-600 hover:underline cursor-pointer"
                  >
                    Volver al catálogo visual
                  </button>
                </div>

                {searchResults.length === 0 ? (
                  <div className="p-10 text-center text-slate-400 space-y-2">
                    <Package className="w-8 h-8 mx-auto text-slate-300" />
                    <p className="font-bold text-xs text-slate-600">No se encontraron productos coincidentes.</p>
                    <p className="text-[11px] text-slate-400">Probá con otra palabra clave o navegá el catálogo visual por familias.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 overflow-hidden bg-white shadow-2xs">
                    {searchResults.map(p => {
                      const isDiscontinued = (p as any).is_discontinued || false;
                      const currentStock = (p as any).stock_current !== undefined ? (p as any).stock_current : 999;
                      return (
                        <div
                          key={p.id}
                          onClick={() => handleAddSearchItem(p)}
                          className="p-3 flex items-center justify-between gap-3 hover:bg-brand-50/40 active:bg-brand-50/70 transition-all cursor-pointer group select-none"
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div className="w-10 h-10 rounded-lg bg-slate-100 p-1 flex items-center justify-center shrink-0 border border-slate-200 overflow-hidden group-hover:border-brand-300 group-hover:bg-white transition-colors">
                              {p.image_url ? (
                                <img src={p.image_url} alt={p.name} className="max-h-full max-w-full object-contain" />
                              ) : (
                                <Package className="w-5 h-5 text-slate-400 group-hover:text-brand-500 transition-colors" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              {p.sku && (
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block group-hover:text-slate-500 transition-colors">
                                  {p.sku}
                                </span>
                              )}
                              <p className="font-bold text-xs text-slate-800 truncate group-hover:text-brand-600 transition-colors" title={p.name}>
                                {p.name}
                              </p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="font-black text-xs text-emerald-600">{fmt(p.price)}</span>
                                {isDiscontinued && (
                                  <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800">
                                    Descontinuado (Stock: {currentStock})
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAddSearchItem(p);
                            }}
                            className="px-3 py-1.5 bg-brand-600 group-hover:bg-brand-700 active:scale-95 text-white rounded-lg text-xs font-black flex items-center gap-1 shrink-0 transition-all shadow-2xs cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Agregar</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              /* IF SEARCH IS NOT ACTIVE: SHOW BREADCRUMBS & VISUAL CASCADE */
              <>
                {/* BREADCRUMBS BAR */}
                <div className="px-4 py-2.5 bg-slate-50/90 border-b border-slate-200/70 flex items-center justify-between text-xs font-bold text-slate-600 shrink-0 overflow-x-auto">
                  <div className="flex items-center gap-1.5 flex-nowrap">
                    <button 
                      type="button"
                      onClick={handleReset}
                      className={`hover:text-brand-600 transition-colors cursor-pointer ${!selectedFamilyId ? 'text-brand-600 font-extrabold' : ''}`}
                    >
                      Familias
                    </button>

                    {currentFamily && (
                      <>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedSubgroupId(null);
                            setSelectedItem(null);
                          }}
                          className={`hover:text-brand-600 transition-colors cursor-pointer ${!selectedSubgroupId ? 'text-brand-600 font-extrabold' : ''}`}
                        >
                          {currentFamily.name}
                        </button>
                      </>
                    )}

                    {currentSubgroup && (
                      <>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <button
                          type="button"
                          onClick={() => setSelectedItem(null)}
                          className={`hover:text-brand-600 transition-colors cursor-pointer ${!selectedItem ? 'text-brand-600 font-extrabold' : ''}`}
                        >
                          {currentSubgroup.name}
                        </button>
                      </>
                    )}

                    {selectedItem && (
                      <>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="text-brand-600 font-extrabold truncate max-w-[150px]">{selectedItem.label}</span>
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
                      className="flex items-center gap-1 text-slate-500 hover:text-slate-800 transition-colors font-bold px-2 py-1 rounded-md hover:bg-slate-200/60 cursor-pointer shrink-0"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>Atrás</span>
                    </button>
                  )}
                </div>

                {/* SCROLLABLE CASCADE CONTAINER */}
                <div className="flex-1 overflow-y-auto p-4 min-h-0 bg-white">
                  
                  {/* LEVEL 1: FAMILIAS PRINCIPALES */}
                  {!selectedFamilyId && (
                    <div className="space-y-4">
                      <div className="text-center max-w-md mx-auto mb-4">
                        <h4 className="text-sm font-black text-slate-800 uppercase tracking-wide">
                          Elegí la familia de productos
                        </h4>
                        <p className="text-[11px] text-slate-500 font-medium">
                          Navegá para armar tu pedido o kit
                        </p>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {activeFamilies.map(fam => (
                          <div
                            key={fam.id}
                            onClick={() => {
                              setSelectedFamilyId(fam.id);
                              if (fam.subgroups.length === 1) {
                                setSelectedSubgroupId(fam.subgroups[0].id);
                              }
                            }}
                            className="p-3.5 rounded-xl border border-slate-200 hover:border-brand-500 hover:shadow-md transition-all cursor-pointer bg-white flex flex-col items-center text-center group hover:-translate-y-0.5"
                          >
                            <div className="w-full h-28 rounded-lg bg-slate-50 flex items-center justify-center overflow-hidden mb-2.5 p-2 group-hover:bg-brand-50/40 transition-colors">
                              {fam.imageUrl ? (
                                <img 
                                  src={fam.imageUrl} 
                                  alt={fam.name}
                                  className="max-h-full max-w-full object-contain group-hover:scale-105 transition-transform duration-300"
                                />
                              ) : (
                                <Layers className="w-8 h-8 text-slate-300" />
                              )}
                            </div>
                            <h5 className="font-black text-xs text-slate-800 group-hover:text-brand-600 transition-colors line-clamp-1">
                              {fam.name}
                            </h5>
                            <p className="text-[10px] text-slate-400 font-medium mt-0.5 line-clamp-1">{fam.description}</p>
                            <span className="mt-2 text-[9px] font-black uppercase tracking-wider text-brand-600 group-hover:underline flex items-center gap-0.5">
                              Explorar <ChevronRight className="w-2.5 h-2.5" />
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* LEVEL 2: SUBGRUPOS (LÍNEAS / MODELOS) */}
                  {selectedFamilyId && !selectedSubgroupId && currentFamily && (
                    <div className="space-y-4">
                      <div className="text-center max-w-md mx-auto mb-3">
                        <h4 className="text-sm font-black text-slate-800 uppercase tracking-wide">
                          Línea o modelo
                        </h4>
                        <p className="text-[11px] text-slate-500 font-medium">Opciones activas para {currentFamily.name}</p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {activeSubgroups.map(sub => (
                          <div
                            key={sub.id}
                            onClick={() => setSelectedSubgroupId(sub.id)}
                            className="p-3 rounded-xl border border-slate-200 hover:border-brand-500 hover:shadow-md transition-all cursor-pointer bg-white flex items-center gap-3.5 group"
                          >
                            <div className="w-20 h-20 rounded-lg bg-slate-50 p-1 flex items-center justify-center shrink-0 border border-slate-100 overflow-hidden">
                              {sub.imageUrl ? (
                                <img 
                                  src={sub.imageUrl} 
                                  alt={sub.name}
                                  className="max-h-full max-w-full object-contain group-hover:scale-105 transition-transform"
                                />
                              ) : (
                                <Layers className="w-6 h-6 text-slate-300" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 mb-0.5">
                                {sub.badgeColor && (
                                  <span className={`px-1.5 py-0.2 rounded text-[7.5px] font-black uppercase ${sub.badgeColor}`}>
                                    Línea
                                  </span>
                                )}
                                <h5 className="font-black text-xs text-slate-800 group-hover:text-brand-600 transition-colors truncate">
                                  {sub.name}
                                </h5>
                              </div>
                              <p className="text-[10px] text-slate-500 font-medium line-clamp-2">{sub.description}</p>
                              <p className="text-[9.5px] text-brand-600 font-bold mt-1.5 flex items-center gap-0.5">
                                Ver disponibles ({sub.items.filter(i => i.isActive).length}) <ChevronRight className="w-2.5 h-2.5" />
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
                      <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
                        <div>
                          <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">
                            Capacidades y Modelos
                          </h4>
                          <p className="text-[10.5px] text-slate-400 font-medium">
                            Disponibles para {currentSubgroup.name}
                          </p>
                        </div>

                        {/* View mode toggle */}
                        <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                          <button
                            type="button"
                            onClick={() => handleToggleViewMode('list')}
                            className={`px-2 py-0.5 rounded text-[10.5px] font-bold flex items-center gap-1 transition-all cursor-pointer ${
                              viewMode === 'list'
                                ? 'bg-white text-brand-600 shadow-2xs font-black'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            <List className="w-3 h-3" />
                            <span>Listado</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleViewMode('grid')}
                            className={`px-2 py-0.5 rounded text-[10.5px] font-bold flex items-center gap-1 transition-all cursor-pointer ${
                              viewMode === 'grid'
                                ? 'bg-white text-brand-600 shadow-2xs font-black'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            <Grid className="w-3 h-3" />
                            <span>Fotos</span>
                          </button>
                        </div>
                      </div>

                      {activeItems.length === 0 ? (
                        <div className="p-8 text-center text-slate-400 text-xs">
                          No hay opciones disponibles en este subgrupo actualmente.
                        </div>
                      ) : viewMode === 'list' ? (
                        /* HIGH DENSITY LIST VIEW */
                        <div className="divide-y divide-slate-100 bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
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
                                className={`p-3 flex items-center justify-between gap-3 transition-all ${
                                  isAvailable
                                    ? 'hover:bg-brand-50/40 cursor-pointer group'
                                    : 'bg-slate-50/60 opacity-60'
                                }`}
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5 mb-0.5">
                                    <span className="font-black text-xs text-slate-800 group-hover:text-brand-600 transition-colors">
                                      {item.label}
                                    </span>
                                    {item.badge && (
                                      <span className="px-1.5 py-0.2 rounded text-[8px] font-black uppercase tracking-wide bg-amber-100 text-amber-800">
                                        {item.badge}
                                      </span>
                                    )}
                                  </div>
                                  {item.description ? (
                                    <p className="text-[10px] text-slate-500 font-medium truncate">
                                      {item.description}
                                    </p>
                                  ) : prodMatch ? (
                                    <p className="text-[10px] text-slate-500 font-medium truncate">
                                      {prodMatch.name}
                                    </p>
                                  ) : null}
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                  <div className="text-right">
                                    {calculatedPrice !== undefined ? (
                                      <p className="font-black text-xs text-slate-900 group-hover:text-brand-600 transition-colors">
                                        {fmt(calculatedPrice)}
                                      </p>
                                    ) : (
                                      <p className="text-[10px] font-bold text-slate-400">Consultar</p>
                                    )}
                                    <span className="text-[9px] font-bold text-slate-400">
                                      {item.allowCiego || item.recommendedBaseCm ? 'Configurar' : 'Agregar'}
                                    </span>
                                  </div>

                                  <div className="w-7 h-7 rounded-lg bg-slate-100 group-hover:bg-brand-600 group-hover:text-white text-slate-600 flex items-center justify-center transition-colors">
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
                        /* GRID CARDS VIEW WITH ENHANCED PHOTOS */
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          {activeItems.map(item => {
                            const prodMatch = products.find(p => p.id === item.productId);
                            const isAvailable = Boolean(prodMatch) || Boolean(item.isCombo && item.comboItems && item.comboItems.length > 0);
                            const calculatedPrice = getItemPrice(item, prodMatch);
                            const imgSrc = prodMatch?.image_url || item.imageUrl || currentSubgroup.imageUrl;

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
                                className={`p-3 rounded-2xl border transition-all flex flex-col justify-between relative group ${
                                  isAvailable 
                                    ? 'border-slate-200 hover:border-brand-500 hover:shadow-lg cursor-pointer bg-white hover:-translate-y-1' 
                                    : 'border-slate-100 bg-slate-50/60 opacity-60'
                                }`}
                              >
                                <div>
                                  {/* Contenedor amplio de fotografía */}
                                  <div className="h-32 sm:h-38 w-full rounded-xl bg-slate-50/80 group-hover:bg-slate-50 border border-slate-100 flex items-center justify-center p-2.5 relative overflow-hidden transition-colors mb-2">
                                    {item.badge && (
                                      <span className="absolute top-2 left-2 z-10 px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-wider bg-amber-500 text-white shadow-xs">
                                        {item.badge}
                                      </span>
                                    )}
                                    {imgSrc ? (
                                      <img 
                                        src={imgSrc} 
                                        alt={item.label}
                                        className="max-h-full max-w-full object-contain drop-shadow-xs group-hover:scale-105 transition-transform duration-300"
                                      />
                                    ) : (
                                      <div className="w-10 h-10 rounded-lg bg-slate-200/60 flex items-center justify-center text-slate-400">
                                        <Package className="w-5 h-5" />
                                      </div>
                                    )}
                                  </div>

                                  <h6 className="font-black text-xs sm:text-sm text-slate-900 group-hover:text-brand-600 transition-colors leading-tight line-clamp-1">
                                    {item.label}
                                  </h6>
                                  {item.description ? (
                                    <p className="text-[10px] text-slate-500 font-medium line-clamp-2 mt-0.5 leading-snug min-h-[1.6rem]" title={item.description}>
                                      {item.description}
                                    </p>
                                  ) : prodMatch?.name ? (
                                    <p className="text-[10px] text-slate-500 font-medium truncate mt-0.5 leading-snug" title={prodMatch.name}>
                                      {prodMatch.name}
                                    </p>
                                  ) : null}
                                </div>

                                <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                                  <div>
                                    {calculatedPrice !== undefined ? (
                                      <>
                                        <p className="font-black text-xs sm:text-sm text-brand-600 tracking-tight leading-none">
                                          {fmt(calculatedPrice)}
                                        </p>
                                        {item.isCombo && item.comboItems && item.comboItems.length > 0 && (
                                          <span className="text-[8px] font-extrabold text-slate-400 block mt-0.5">
                                            {item.comboItems.length} componentes
                                          </span>
                                        )}
                                      </>
                                    ) : (
                                      <p className="text-[10px] font-bold text-slate-400">Consultar</p>
                                    )}
                                  </div>

                                  <div className="flex items-center gap-1 bg-brand-600 group-hover:bg-brand-700 text-white text-[10px] font-black px-2.5 py-1 rounded-lg shadow-xs transition-all shrink-0">
                                    {item.allowCiego || item.recommendedBaseCm ? (
                                      <>
                                        <span>Configurar</span>
                                        <ChevronRight className="w-3 h-3 stroke-[2.5]" />
                                      </>
                                    ) : (
                                      <>
                                        <Plus className="w-3 h-3 stroke-[3]" />
                                        <span>Agregar</span>
                                      </>
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

                  {/* LEVEL 4: OPCIONES Y ACCESORIOS (COMPLETO / CIEGO / BASE / FLOTANTE) */}
                  {selectedItem && (
                    <div className="space-y-4 max-w-xl mx-auto">
                      {/* Product Header */}
                      <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-3">
                        <div className="w-16 h-16 bg-white rounded-lg border border-slate-200 p-1.5 flex items-center justify-center shrink-0">
                          <img 
                            src={resolvedMainProduct?.image_url || selectedItem.imageUrl || currentSubgroup?.imageUrl} 
                            alt={selectedItem.label}
                            className="max-h-full max-w-full object-contain"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="px-1.5 py-0.2 rounded text-[7.5px] font-black uppercase bg-brand-100 text-brand-800">
                              {currentSubgroup?.name}
                            </span>
                            <span className="text-xs font-black text-slate-400">|</span>
                            <span className="text-xs font-black text-slate-700">{selectedItem.label}</span>
                          </div>
                          <h5 className="font-black text-xs text-slate-900 mt-0.5 truncate">
                            {resolvedMainProduct?.name || selectedItem.label}
                          </h5>
                          <p className="text-xs font-black text-brand-600 mt-0.5">
                            Precio: {fmt(resolvedMainProduct?.price)}
                          </p>
                        </div>
                      </div>

                      {/* 1. Variante Ciego vs Estándar */}
                      {selectedItem.allowCiego && (
                        <div className="space-y-1.5">
                          <label className="text-[9.5px] font-black uppercase tracking-wider text-slate-500">
                            1. Perforaciones de Fábrica
                          </label>
                          <div className="grid grid-cols-2 gap-2">
                            <div 
                              onClick={() => setIsCiego(false)}
                              className={`p-2.5 rounded-xl border cursor-pointer transition-all ${
                                !isCiego 
                                  ? 'border-brand-500 bg-brand-50/40 ring-1 ring-brand-500/20' 
                                  : 'border-slate-200 bg-white hover:border-slate-300'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-black text-xs text-slate-800">🔘 Estándar</span>
                                {!isCiego && <Check className="w-3.5 h-3.5 text-brand-600" />}
                              </div>
                              <p className="text-[9.5px] text-slate-500 mt-0.5">Con orificios originales.</p>
                            </div>

                            <div 
                              onClick={() => setIsCiego(true)}
                              className={`p-2.5 rounded-xl border cursor-pointer transition-all ${
                                isCiego 
                                  ? 'border-amber-500 bg-amber-50/40 ring-1 ring-amber-500/20' 
                                  : 'border-slate-200 bg-white hover:border-slate-300'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-black text-xs text-slate-800">🔘 Ciego</span>
                                {isCiego && <Check className="w-3.5 h-3.5 text-amber-600" />}
                              </div>
                              <p className="text-[9.5px] text-slate-500 mt-0.5">Sin orificios para obra.</p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 2. Accesorios recomendados */}
                      {(resolvedBaseProduct || resolvedFlotanteProduct) && (
                        <div className="space-y-1.5">
                          <label className="text-[9.5px] font-black uppercase tracking-wider text-slate-500">
                            2. Accesorios en 1 Clic
                          </label>
                          <div className="space-y-2">
                            {resolvedBaseProduct && (
                              <div 
                                onClick={() => setIncludeBase(!includeBase)}
                                className={`p-2.5 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                                  includeBase 
                                    ? 'border-brand-500 bg-brand-50/30 ring-1 ring-brand-500/20' 
                                    : 'border-slate-200 bg-white hover:border-slate-300'
                                }`}
                              >
                                <div className="flex items-center gap-2.5">
                                  <input 
                                    type="checkbox" 
                                    checked={includeBase} 
                                    onChange={() => {}} 
                                    className="w-3.5 h-3.5 rounded text-brand-600 focus:ring-brand-500 border-slate-300"
                                  />
                                  <div>
                                    <p className="font-black text-xs text-slate-800 flex items-center gap-1.5">
                                      <span>{resolvedBaseProduct.name}</span>
                                      <span className="text-[8.5px] font-bold px-1.5 py-0.2 rounded bg-blue-100 text-blue-700">
                                        Recomendada ({selectedItem.recommendedBaseCm} cm)
                                      </span>
                                    </p>
                                    <p className="text-[9.5px] text-slate-500">Estructura de hierro reforzada</p>
                                  </div>
                                </div>
                                <span className="font-black text-xs text-slate-800">+{fmt(resolvedBaseProduct.price)}</span>
                              </div>
                            )}

                            {resolvedFlotanteProduct && (
                              <div 
                                onClick={() => setIncludeFlotante(!includeFlotante)}
                                className={`p-2.5 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                                  includeFlotante 
                                    ? 'border-brand-500 bg-brand-50/30 ring-1 ring-brand-500/20' 
                                    : 'border-slate-200 bg-white hover:border-slate-300'
                                }`}
                              >
                                <div className="flex items-center gap-2.5">
                                  <input 
                                    type="checkbox" 
                                    checked={includeFlotante} 
                                    onChange={() => {}} 
                                    className="w-3.5 h-3.5 rounded text-brand-600 focus:ring-brand-500 border-slate-300"
                                  />
                                  <div>
                                    <p className="font-black text-xs text-slate-800">{resolvedFlotanteProduct.name}</p>
                                    <p className="text-[9.5px] text-slate-500">Repuesto o flotante adicional</p>
                                  </div>
                                </div>
                                <span className="font-black text-xs text-slate-800">+{fmt(resolvedFlotanteProduct.price)}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Total & Confirm Button */}
                      <div className="p-3.5 rounded-xl bg-slate-900 text-white flex items-center justify-between gap-3 mt-4">
                        <div>
                          <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Total a Agregar</p>
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
                          className="px-5 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-black text-xs uppercase tracking-wider shadow-md hover:shadow-brand-500/30 transition-all flex items-center gap-1.5 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Agregar al Pedido</span>
                        </button>
                      </div>
                    </div>
                  )}

                </div>
              </>
            )}

            {/* Mobile Footer for Left Column */}
            <div className="lg:hidden p-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
              <span className="text-xs font-bold text-slate-600">
                {totalOrderCount} {totalOrderCount === 1 ? 'producto' : 'productos'} en pedido
              </span>
              <button
                type="button"
                onClick={() => setMobileTab('cart')}
                className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-black flex items-center gap-1.5"
              >
                <ShoppingCart className="w-3.5 h-3.5" />
                <span>Ver Pedido ({fmt(subtotal)})</span>
              </button>
            </div>

          </div>

          {/* ========================================================= */}
          {/* RIGHT COLUMN: DETALLE DEL PEDIDO (CARRITO EN TIEMPO REAL) */}
          {/* ========================================================= */}
          <div className={`lg:col-span-5 flex flex-col h-full bg-slate-50/70 overflow-hidden ${
            mobileTab === 'catalog' ? 'hidden lg:flex' : 'flex'
          }`}>
            
            {/* RIGHT COLUMN HEADER */}
            <div className="p-3.5 border-b border-slate-200 bg-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-emerald-600" />
                <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                  Detalle del Pedido
                </h4>
                {totalOrderCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-200">
                    {totalOrderCount}
                  </span>
                )}
              </div>

              {orderItems.length > 0 && onClearOrderItems && (
                <button
                  type="button"
                  onClick={() => {
                    if (confirm("¿Vaciar todos los artículos seleccionados del pedido?")) {
                      onClearOrderItems();
                    }
                  }}
                  className="text-slate-400 hover:text-red-600 text-[10.5px] font-bold flex items-center gap-1 transition-colors cursor-pointer px-2 py-1 rounded hover:bg-red-50"
                  title="Vaciar todos los productos"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Vaciar</span>
                </button>
              )}
            </div>

            {/* LIVE CART ITEMS LIST */}
            <div className="flex-1 overflow-y-auto p-3 space-y-1.5 min-h-0">
              
              {orderItems.length === 0 ? (
                <div className="p-8 border-2 border-dashed border-slate-200 rounded-2xl text-center bg-white space-y-3 my-auto">
                  <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
                    <ShoppingBag className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="font-black text-slate-700 text-xs uppercase tracking-wide">
                      El pedido está vacío
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1 max-w-xs mx-auto">
                      Buscá o seleccioná productos o kits desde el panel izquierdo para agregarlos al pedido.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  {/* SUGERENCIAS AUTOMÁTICAS DE BONIFICACIÓN */}
                  {discountSuggestions.length > 0 && (
                    <div className="space-y-1.5 mb-2 shrink-0">
                      {discountSuggestions.map((sug) => (
                        <div 
                          key={sug.ruleId} 
                          className="bg-gradient-to-r from-amber-500/10 via-amber-100 to-amber-50 border border-amber-300 rounded-xl p-2.5 flex items-center justify-between gap-2 shadow-xs animate-in slide-in-from-top duration-200"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-7 h-7 rounded-lg bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-2xs">
                              <Sparkles className="w-3.5 h-3.5" />
                            </span>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[8px] font-black uppercase tracking-wider bg-amber-200 text-amber-900 px-1 py-0.2 rounded">
                                  Beneficio
                                </span>
                                <p className="font-extrabold text-xs text-amber-950 truncate">
                                  {sug.ruleName} ({sug.suggestedQty} unid.)
                                </p>
                              </div>
                              <p className="text-[10.5px] text-amber-800 font-medium truncate">
                                {sug.description} → Ahorro: <strong>{fmt(sug.totalDiscount)}</strong>
                              </p>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleApplyDiscountSuggestion(sug)}
                            className="px-2.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[11px] font-black shrink-0 flex items-center gap-1 shadow-xs transition-all cursor-pointer hover:scale-102"
                          >
                            <Check className="w-3 h-3" />
                            {sug.action === 'upgrade' ? 'Actualizar' : 'Aplicar'}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* LISTA COMPACTA DE ARTÍCULOS Y SERVICIOS */}
                  {standardItems.map((item, idx) => {
                    const nameLower = (item.name || "").toLowerCase();
                    const isKitService = (nameLower.includes("kit instalaci") || nameLower.includes("kit de instalaci") || nameLower.startsWith("kit ")) && item.customPrice > 0;
                    const isIncludedZero = item.customPrice === 0 || item.isIncludedInKit;

                    // Mostrar prioritariamente el SKU si existe (salvo AUTO-); si no, usar el nombre
                    const rawSku = (item.sku || "").trim();
                    const isAutoSku = rawSku.toUpperCase().startsWith("AUTO-") || rawSku.toUpperCase().startsWith("AUTO_");
                    const displayName = (rawSku && !isAutoSku) ? rawSku : item.name;

                    return (
                      <React.Fragment key={`${item.id}-${idx}`}>
                        <div 
                          className={`rounded-lg py-1.5 px-2.5 border transition-all flex items-center justify-between gap-2 ${
                          isKitService 
                            ? 'bg-emerald-50/50 border-emerald-300' 
                            : isIncludedZero 
                              ? 'bg-slate-50/70 border-slate-200' 
                              : 'bg-white border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        {/* SKU/Nombre + Tags en una sola línea limpia */}
                        <div className="flex-1 min-w-0 flex items-center gap-1.5">
                          {isKitService && (
                            <span className="inline-flex items-center gap-0.5 text-[7.5px] font-black uppercase tracking-wider px-1 py-0.2 bg-emerald-100 text-emerald-800 rounded border border-emerald-200 shrink-0">
                              Kit
                            </span>
                          )}
                          {isIncludedZero && (
                            <span className="inline-flex items-center gap-0.5 text-[7.5px] font-extrabold uppercase tracking-wider px-1 py-0.2 bg-emerald-50 text-emerald-700 rounded border border-emerald-200 shrink-0">
                              $0
                            </span>
                          )}
                          {Boolean(item.discountValue && item.discountValue > 0) && (
                            <span className="inline-flex items-center gap-0.5 text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded border border-amber-300 shrink-0">
                              {item.discountType === 'percentage' ? `${item.discountValue}% OFF` : `-$${formatPrice(item.discountValue || 0)}`}
                            </span>
                          )}
                          <p className="font-bold text-slate-800 text-xs truncate" title={displayName}>
                            {displayName}
                          </p>
                          {Boolean(item.basePrice && item.basePrice > item.customPrice) && (
                            <span className="text-[10px] text-slate-400 line-through shrink-0">
                              {formatPrice(item.basePrice!)}
                            </span>
                          )}
                        </div>

                        {/* Controles en línea compacta: [-] {qty} [+] | $ {precio} | 🗑️ */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          {/* Stepper compacto */}
                          <div className="flex items-center bg-slate-100 border border-slate-200 rounded-md overflow-hidden h-6.5">
                            <button 
                              type="button" 
                              onClick={() => onUpdateQuantity?.(item.id, item.quantity - 1)} 
                              className="px-1.5 font-black text-slate-500 hover:bg-slate-200 text-xs h-full cursor-pointer transition-colors"
                              title="Restar 1 unidad"
                            >
                              -
                            </button>
                            <span className="px-1.5 font-black text-xs min-w-[1.2rem] text-center text-slate-800">
                              {item.quantity}
                            </span>
                            <button 
                              type="button" 
                              onClick={() => onUpdateQuantity?.(item.id, item.quantity + 1)} 
                              className="px-1.5 font-black text-slate-500 hover:bg-slate-200 text-xs h-full cursor-pointer transition-colors"
                              title="Sumar 1 unidad"
                            >
                              +
                            </button>
                          </div>

                          {/* Precio unitario editable compacto */}
                          <div className="flex items-center bg-slate-50 border border-slate-200 rounded-md px-1.5 h-6.5">
                            <span className="text-[9.5px] font-bold text-slate-400 mr-0.5">$</span>
                            <input 
                              type="number" 
                              value={item.customPrice}
                              onChange={(e) => onUpdateCustomPrice?.(item.id, Number(e.target.value))}
                              className="w-16 text-xs font-bold text-right outline-none bg-transparent text-slate-800"
                              title="Precio unitario (editable)"
                            />
                          </div>

                          {/* Botón para aplicar o editar descuento por producto */}
                          <button
                            type="button"
                            onClick={() => toggleItemDiscount(item.id)}
                            className={`h-6.5 px-1.5 rounded-md border text-[10px] font-bold flex items-center gap-0.5 transition-colors cursor-pointer ${
                              Boolean(item.discountValue && item.discountValue > 0)
                                ? 'bg-amber-100 border-amber-300 text-amber-800'
                                : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-amber-50 hover:text-amber-700 hover:border-amber-200'
                            }`}
                            title="Aplicar descuento a este producto"
                          >
                            <Percent className="w-2.5 h-2.5" />
                            {Boolean(item.discountValue && item.discountValue > 0) && (
                              <span>{item.discountType === 'percentage' ? `${item.discountValue}%` : `$`}</span>
                            )}
                          </button>

                          {/* Botón para SACAR producto */}
                          {onRemoveItem && (
                            <button 
                              type="button"
                              onClick={() => onRemoveItem(item.id)}
                              className="text-slate-300 hover:text-red-500 p-1 rounded hover:bg-red-50 transition-colors cursor-pointer"
                              title="Sacar del pedido"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Sub-fila expandida para configurar descuento de este producto */}
                      {openDiscountItemIds[item.id] && (
                        <div className="bg-amber-50/70 border border-amber-200/90 rounded-md px-2 py-1.5 flex items-center justify-between gap-2 text-xs animate-in fade-in duration-150">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-bold text-amber-900">Desc. producto:</span>
                            <div className="flex items-center bg-white border border-amber-300 rounded overflow-hidden text-[10px]">
                              <button
                                type="button"
                                onClick={() => onUpdateItemDiscount?.(item.id, 'percentage', item.discountValue || 0)}
                                className={`px-1.5 py-0.5 font-black cursor-pointer ${item.discountType === 'percentage' || !item.discountType ? 'bg-amber-500 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                              >
                                %
                              </button>
                              <button
                                type="button"
                                onClick={() => onUpdateItemDiscount?.(item.id, 'fixed', item.discountValue || 0)}
                                className={`px-1.5 py-0.5 font-black cursor-pointer ${item.discountType === 'fixed' ? 'bg-amber-500 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                              >
                                $
                              </button>
                            </div>
                            <input
                              type="number"
                              value={item.discountValue || ""}
                              placeholder="0"
                              onChange={(e) => onUpdateItemDiscount?.(item.id, item.discountType || 'percentage', Number(e.target.value))}
                              className="w-16 px-1.5 py-0.5 bg-white border border-amber-300 rounded text-xs font-bold text-right outline-none text-slate-800"
                            />
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="text-[10.5px] text-amber-800 font-bold">
                              {item.discountType === 'percentage'
                                ? `(-${fmt(Math.round(((item.basePrice || item.price) * (item.discountValue || 0)) / 100))}/u)`
                                : `(-${fmt(item.discountValue || 0)}/u)`}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                onUpdateItemDiscount?.(item.id, 'percentage', 0);
                                toggleItemDiscount(item.id);
                              }}
                              className="text-[10px] font-extrabold text-red-500 hover:text-red-700 cursor-pointer"
                            >
                              Limpiar
                            </button>
                          </div>
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}

                {/* 3. DESCUENTOS Y BONIFICACIONES COMPACTO */}
                {discountItems.map((item, idx) => (
                  <div 
                    key={`${item.id}-${idx}`} 
                    className="bg-amber-50/60 border border-amber-200 rounded-lg py-1.5 px-2.5 flex items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      <span className="inline-flex items-center gap-1 text-[7.5px] font-black uppercase tracking-wider px-1 py-0.2 bg-amber-100 text-amber-800 rounded border border-amber-200 shrink-0">
                        <Tag className="w-2.5 h-2.5 text-amber-600" /> Descuento
                      </span>
                      <p className="font-bold text-slate-800 text-xs truncate">{item.name}</p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Selector de cantidad compacto para bonificaciones */}
                      <div className="flex items-center bg-white border border-amber-200 rounded-md overflow-hidden h-6.5">
                        <button 
                          type="button" 
                          onClick={() => onUpdateQuantity?.(item.id, item.quantity - 1)} 
                          className="px-1.5 font-black text-slate-500 hover:bg-amber-100 text-xs h-full cursor-pointer transition-colors"
                          title="Restar 1 unidad"
                        >
                          -
                        </button>
                        <span className="px-1.5 font-black text-xs min-w-[1.2rem] text-center text-slate-800">
                          {item.quantity}
                        </span>
                        <button 
                          type="button" 
                          onClick={() => onUpdateQuantity?.(item.id, item.quantity + 1)} 
                          className="px-1.5 font-black text-slate-500 hover:bg-amber-100 text-xs h-full cursor-pointer transition-colors"
                          title="Sumar 1 unidad"
                        >
                          +
                        </button>
                      </div>

                      {/* Precio editable con -$ */}
                      <div className="flex items-center bg-white border border-amber-300 rounded-md px-1.5 h-6.5">
                        <span className="text-[9.5px] font-bold text-amber-700 mr-0.5">-$</span>
                        <input 
                          type="number" 
                          value={Math.abs(item.customPrice) || ""}
                          placeholder="0"
                          onChange={(e) => onUpdateCustomPrice?.(item.id, -Math.abs(Number(e.target.value)))}
                          className="w-16 text-xs font-bold text-right outline-none bg-transparent text-amber-900"
                          title="Monto del descuento unitario (editable)"
                        />
                      </div>

                      <span className="font-black text-xs text-amber-700 bg-amber-100/60 px-1.5 py-0.5 rounded border border-amber-200/60 min-w-[3.5rem] text-right">
                        -{fmt(Math.abs(item.customPrice * item.quantity))}
                      </span>

                      {onRemoveItem && (
                        <button 
                          type="button"
                          onClick={() => onRemoveItem(item.id)}
                          className="text-slate-400 hover:text-red-500 p-1 rounded hover:bg-red-50 transition-colors cursor-pointer"
                          title="Quitar bonificación"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </>
            )}

          </div>

          {/* CART FOOTER WITH SUBTOTAL AND CONFIRM BUTTON */}
          <div className="p-3.5 border-t border-slate-200 bg-white shrink-0 space-y-2.5">
            {/* Descuento al total del pedido en modal */}
            <div className="bg-slate-50 p-2 rounded-xl border border-slate-200/80 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-600 flex items-center gap-1">
                  <Tag className="w-3 h-3 text-amber-600" /> Descuento Total Pedido
                </span>
                {orderDiscountAmount > 0 && (
                  <span className="text-[10px] font-black text-amber-700 bg-amber-100/70 px-1.5 py-0.2 rounded border border-amber-200">
                    -{fmt(orderDiscountAmount)}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <div className="flex items-center bg-white border border-slate-200 rounded-lg overflow-hidden text-xs shrink-0">
                  <button
                    type="button"
                    onClick={() => onUpdateOrderDiscount?.('percentage', orderDiscountValue || 0)}
                    className={`px-2 py-1 font-black cursor-pointer ${orderDiscountType === 'percentage' ? 'bg-amber-500 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                  >
                    %
                  </button>
                  <button
                    type="button"
                    onClick={() => onUpdateOrderDiscount?.('fixed', orderDiscountValue || 0)}
                    className={`px-2 py-1 font-black cursor-pointer ${orderDiscountType === 'fixed' ? 'bg-amber-500 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                  >
                    $
                  </button>
                </div>
                <input
                  type="number"
                  value={orderDiscountValue || ""}
                  placeholder={orderDiscountType === 'percentage' ? "% Desc. general" : "$ Desc. general"}
                  onChange={(e) => onUpdateOrderDiscount?.(orderDiscountType || 'percentage', Number(e.target.value))}
                  className="flex-1 px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none text-slate-800 placeholder:text-slate-400"
                />
                {orderDiscountValue > 0 && (
                  <button
                    type="button"
                    onClick={() => onUpdateOrderDiscount?.('percentage', 0)}
                    className="text-slate-400 hover:text-red-500 p-1 text-xs font-bold cursor-pointer"
                    title="Eliminar descuento general"
                  >
                    ✕
                  </button>
                )}
              </div>
              <p className="text-[9px] text-slate-400 font-medium italic mt-1">
                💡 En planilla se registra como <strong>Descuento Compra Mayorista</strong> y los artículos van a precio de lista.
              </p>
            </div>

            <div className="space-y-1 text-xs">
              {orderDiscountAmount > 0 && (
                <div className="flex items-center justify-between text-slate-500 font-bold">
                  <span>Subtotal Artículos:</span>
                  <span>{fmt(itemsGrossSubtotal)}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  {orderDiscountAmount > 0 ? "Subtotal Neto:" : "Subtotal Artículos:"}
                </span>
                <span className="text-base font-black text-slate-900">
                  {fmt(subtotal)}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleClose}
              className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-md hover:shadow-emerald-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>Confirmar Productos y Volver al Pedido</span>
            </button>
          </div>

          </div>

        </div>

      </div>
    </div>
  );
}

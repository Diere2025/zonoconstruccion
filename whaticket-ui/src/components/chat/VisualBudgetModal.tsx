"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Plus,
  Minus,
  Trash2,
  Save,
  ShoppingBag,
  ShoppingCart,
  Layers,
  ChevronRight,
  Search,
  Check,
  Package,
  Truck,
  CreditCard,
  FileText,
  Copy,
  ArrowLeft,
  List,
  Grid,
  Sparkles,
  MessageSquare
} from 'lucide-react';
import { Ticket, Budget, BudgetItem } from '../../types';
import {
  CatalogProduct,
  VisualCatalogConfig,
  VisualFamily,
  VisualSubGroup,
  VisualItemOption,
  fetchCatalogProducts,
  fetchVisualCatalogTree,
  createBudget,
  findRecommendedBase,
  findFlotanteProduct
} from '../../services/catalogService';
import { toast } from 'sonner';

interface VisualBudgetModalProps {
  isOpen: boolean;
  onClose: () => void;
  ticket: Ticket;
  onBudgetCreated?: (budget: Budget) => void;
  onInsertIntoChat?: (text: string) => void;
}

export const VisualBudgetModal: React.FC<VisualBudgetModalProps> = ({
  isOpen,
  onClose,
  ticket,
  onBudgetCreated,
  onInsertIntoChat,
}) => {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [config, setConfig] = useState<VisualCatalogConfig | null>(null);
  const [loading, setLoading] = useState(true);

  // Cascade Navigation State
  const [selectedFamilyId, setSelectedFamilyId] = useState<string | null>(null);
  const [selectedSubgroupId, setSelectedSubgroupId] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<VisualItemOption | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileTab, setMobileTab] = useState<'catalog' | 'cart'>('catalog');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Level 4 Configuration State (Tank accessories cascade)
  const [isCiego, setIsCiego] = useState(false);
  const [includeBase, setIncludeBase] = useState(false);
  const [includeFlotante, setIncludeFlotante] = useState(false);

  // Order / Cart items
  const [cartItems, setCartItems] = useState<BudgetItem[]>([]);
  const [shippingType, setShippingType] = useState<'gratis' | 'costo' | 'acordar'>('gratis');
  const [customShippingCost, setCustomShippingCost] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<string>('Efectivo / Transferencia');
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [addedFeedback, setAddedFeedback] = useState<string | null>(null);

  // Load products and tree
  useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;

    async function loadData() {
      setLoading(true);
      try {
        const prods = await fetchCatalogProducts();
        if (isMounted) {
          setProducts(prods);
          const tree = await fetchVisualCatalogTree(prods);
          setConfig(tree);
        }
      } catch (err) {
        console.error('Error loading visual catalog:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  // Reset Level 4 states when item changes
  useEffect(() => {
    setIsCiego(false);
    setIncludeBase(false);
    setIncludeFlotante(false);
  }, [selectedItem?.id]);

  // Current cascade levels
  const currentFamily = useMemo(() => {
    if (!config || !selectedFamilyId) return null;
    return config.families.find((f) => f.id === selectedFamilyId) || null;
  }, [config, selectedFamilyId]);

  const currentSubgroup = useMemo(() => {
    if (!currentFamily || !selectedSubgroupId) return null;
    return currentFamily.subgroups.find((s) => s.id === selectedSubgroupId) || null;
  }, [currentFamily, selectedSubgroupId]);

  const activeItems = useMemo(() => {
    if (!currentSubgroup) return [];
    return currentSubgroup.items.filter((it) => it.isActive !== false);
  }, [currentSubgroup]);

  // Accessories resolution for Level 4
  const resolvedBaseProduct = useMemo(() => {
    if (!selectedItem?.recommendedBaseCm) return undefined;
    return findRecommendedBase(products, selectedItem.recommendedBaseCm);
  }, [products, selectedItem]);

  const resolvedFlotanteProduct = useMemo(() => {
    if (!selectedItem) return undefined;
    return findFlotanteProduct(products);
  }, [products, selectedItem]);

  const resolvedMainProduct = useMemo(() => {
    if (!selectedItem) return null;
    if (isCiego && selectedItem.ciegoProductId) {
      const cp = products.find((p) => p.id === selectedItem.ciegoProductId);
      if (cp) return cp;
    }
    if (selectedItem.productId) {
      const p = products.find((p) => p.id === selectedItem.productId);
      if (p) return p;
    }
    return {
      id: selectedItem.productId || selectedItem.id,
      name: selectedItem.label,
      price: selectedItem.price || 0,
    };
  }, [selectedItem, isCiego, products]);

  // Search results
  const searchResults = useMemo(() => {
    if (!searchQuery.trim() || !products.length) return [];
    const query = searchQuery.toLowerCase().trim();
    return products
      .filter((p) => {
        const name = (p.name || '').toLowerCase();
        const sku = (p.sku || '').toLowerCase();
        return name.includes(query) || sku.includes(query);
      })
      .slice(0, 30);
  }, [searchQuery, products]);

  // Formatting helpers
  const fmt = (val: number) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      maximumFractionDigits: 0,
    }).format(val || 0);
  };

  // Cart operations
  const handleAddItem = (product: { id: string; name: string; price: number }) => {
    setCartItems((prev) => {
      const existing = prev.find((item) => item.productId === product.id);
      if (existing) {
        return prev.map((item) =>
          item.productId === product.id
            ? {
                ...item,
                quantity: item.quantity + 1,
                subtotal: (item.quantity + 1) * item.price,
              }
            : item
        );
      }
      return [
        ...prev,
        {
          productId: product.id,
          name: product.name,
          price: product.price,
          quantity: 1,
          subtotal: product.price,
        },
      ];
    });

    setAddedFeedback(product.name);
    setTimeout(() => setAddedFeedback(null), 1200);
  };

  // Level 4: Add configured tank + accessories in 1 click
  const handleAddConfiguredItem = () => {
    if (!selectedItem || !resolvedMainProduct) return;
    const newItems: BudgetItem[] = [];

    // 1. Tanque principal (Estándar o Ciego)
    const mainPrice = resolvedMainProduct.price || selectedItem.price || 0;
    let mainName = resolvedMainProduct.name;
    if (isCiego && !mainName.toLowerCase().includes('ciego')) {
      mainName = `${mainName} (Ciego)`;
    }

    newItems.push({
      productId: resolvedMainProduct.id,
      name: mainName,
      price: mainPrice,
      quantity: 1,
      subtotal: mainPrice,
    });

    // 2. Base recomendada si se seleccionó
    if (includeBase && resolvedBaseProduct) {
      newItems.push({
        productId: resolvedBaseProduct.id,
        name: resolvedBaseProduct.name,
        price: resolvedBaseProduct.price,
        quantity: 1,
        subtotal: resolvedBaseProduct.price,
      });
    }

    // 3. Flotante si se seleccionó
    if (includeFlotante && resolvedFlotanteProduct) {
      newItems.push({
        productId: resolvedFlotanteProduct.id,
        name: resolvedFlotanteProduct.name,
        price: resolvedFlotanteProduct.price,
        quantity: 1,
        subtotal: resolvedFlotanteProduct.price,
      });
    }

    setCartItems((prev) => {
      const updated = [...prev];
      for (const it of newItems) {
        const existingIdx = updated.findIndex((u) => u.name.toLowerCase() === it.name.toLowerCase());
        if (existingIdx >= 0) {
          updated[existingIdx].quantity += 1;
          updated[existingIdx].subtotal = updated[existingIdx].quantity * updated[existingIdx].price;
        } else {
          updated.push(it);
        }
      }
      return updated;
    });

    toast.success(`¡${selectedItem.label} agregado al presupuesto!`);
    setSelectedItem(null);
  };

  const handleUpdateQuantity = (index: number, newQty: number) => {
    if (newQty <= 0) {
      handleRemoveItem(index);
      return;
    }
    setCartItems((prev) =>
      prev.map((item, i) =>
        i === index
          ? {
              ...item,
              quantity: newQty,
              subtotal: newQty * item.price,
            }
          : item
      )
    );
  };

  const handleRemoveItem = (index: number) => {
    setCartItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Calculations
  const subtotal = useMemo(() => {
    return cartItems.reduce((acc, item) => acc + (item.subtotal || item.price * item.quantity), 0);
  }, [cartItems]);

  const shippingCost = useMemo(() => {
    if (shippingType === 'gratis') return 0;
    if (shippingType === 'costo') return Number(customShippingCost) || 0;
    return 0;
  }, [shippingType, customShippingCost]);

  const total = useMemo(() => {
    return subtotal + shippingCost;
  }, [subtotal, shippingCost]);

  const totalOrderCount = useMemo(() => {
    return cartItems.reduce((acc, it) => acc + it.quantity, 0);
  }, [cartItems]);

  const budgetCode = useMemo(() => {
    const randomSuffix = Math.floor(100000 + Math.random() * 900000);
    return `ZC-${randomSuffix}`;
  }, []);

  const handleClose = () => {
    setSelectedFamilyId(null);
    setSelectedSubgroupId(null);
    setSelectedItem(null);
    setSearchQuery('');
    setCartItems([]);
    onClose();
  };

  // Formatted WhatsApp message
  const formattedWhatsAppText = useMemo(() => {
    const lines: string[] = [];

    lines.push('*Zono Construcción y Hogar*');
    lines.push('_Presupuesto Detallado_');
    lines.push(`#${budgetCode}`);
    lines.push('');

    cartItems.forEach((item) => {
      lines.push(`🔸 ${item.quantity}x *${item.name}* a ${fmt(item.price)}`);
    });

    lines.push('➖');
    lines.push(`*Subtotal Productos:* ${fmt(subtotal)}`);

    if (shippingType === 'gratis') {
      lines.push('*Envío:* Gratis 🚛');
    } else if (shippingType === 'costo') {
      lines.push(`*Envío:* ${fmt(shippingCost)} 🚛`);
    } else {
      lines.push('*Envío:* A acordar con el asesor 🚛');
    }

    lines.push(`*Medio de pago:* ${paymentMethod}`);
    lines.push('➖');
    lines.push(`*TOTAL A ABONAR:* ${fmt(total)}`);

    if (notes && notes.trim()) {
      lines.push('');
      lines.push(`*Observaciones:* ${notes.trim()}`);
    }

    return lines.join('\n');
  }, [budgetCode, cartItems, subtotal, shippingType, shippingCost, paymentMethod, total, notes]);

  // Submission
  const handleSaveAndPassToChat = async (passToChat: boolean) => {
    if (cartItems.length === 0) {
      toast.error('Agregá al menos un producto al presupuesto');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        code: budgetCode,
        ticketId: ticket.id,
        contactId: ticket.contact?.id || (ticket as any).contactId,
        total,
        subtotal,
        discount: 0,
        shippingCost,
        paymentMethod,
        items: cartItems,
        summaryText: formattedWhatsAppText,
        notes,
      };

      const savedBudget = await createBudget(payload);

      // Dispatch global event so ContactDrawer and other views refresh immediately
      window.dispatchEvent(
        new CustomEvent('whaticket_budget_created', { detail: savedBudget })
      );

      if (onBudgetCreated) {
        onBudgetCreated(savedBudget);
      }

      if (passToChat && onInsertIntoChat) {
        onInsertIntoChat(formattedWhatsAppText);
        toast.success('¡Presupuesto guardado y cargado en el chat para enviar!');
      } else {
        navigator.clipboard.writeText(formattedWhatsAppText);
        toast.success('¡Presupuesto guardado y copiado al portapapeles!');
      }

      handleClose();
    } catch (err: any) {
      console.error('Error saving budget:', err);
      toast.error(err.response?.data?.message || 'Error al guardar el presupuesto');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const modalContent = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-2 sm:p-4 overflow-hidden animate-in fade-in duration-200 select-none">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200/90 dark:border-slate-800 w-full max-w-[98vw] 2xl:max-w-[1600px] h-[92vh] max-h-[880px] flex flex-col overflow-hidden">
        {/* ======================= MODAL HEADER ======================= */}
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-gradient-to-r from-slate-50 via-white to-slate-50 dark:from-slate-900 dark:via-slate-900 dark:to-slate-900 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-900 flex items-center justify-center text-red-600 dark:text-red-400 shadow-xs shrink-0">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-slate-800 dark:text-slate-100 tracking-tight">
                  Selector de Productos y Detalle del Presupuesto
                </h3>
                <span className="hidden sm:inline-flex px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300">
                  Carga Rápida
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                  #{budgetCode}
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium">
                Cliente: <span className="font-bold text-slate-700 dark:text-slate-200">{ticket.contact?.name || 'Cliente'}</span> ({ticket.contact?.number || 'Sin teléfono'})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Quick status pill */}
            <div className="hidden md:flex items-center gap-2 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
              <ShoppingCart className="w-4 h-4 text-emerald-600" />
              <span className="font-bold text-slate-700 dark:text-slate-200">
                {totalOrderCount} {totalOrderCount === 1 ? 'artículo' : 'artículos'}
              </span>
              <span className="text-slate-300">|</span>
              <span className="font-black text-emerald-600 font-mono">{fmt(subtotal)}</span>
            </div>

            {/* Confirm & Pass to Chat Button */}
            <button
              type="button"
              disabled={isSubmitting || cartItems.length === 0}
              onClick={() => handleSaveAndPassToChat(true)}
              className="px-4 py-2 rounded-xl text-xs font-black bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-2 shadow-md shadow-emerald-600/30 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
              title="Guarda en base de datos y coloca el mensaje en el cuadro de texto para editar y enviar"
            >
              <MessageSquare className="w-4 h-4" />
              <span className="hidden sm:inline">Guardar y Pasar al Chat</span>
              <span className="sm:hidden">Pasar al Chat</span>
            </button>

            {/* Close Button */}
            <button
              type="button"
              onClick={handleClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Mobile Tab Switcher */}
        <div className="flex lg:hidden border-b border-slate-200 dark:border-slate-800 shrink-0">
          <button
            type="button"
            onClick={() => setMobileTab('catalog')}
            className={`flex-1 py-2.5 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer ${
              mobileTab === 'catalog'
                ? 'border-b-2 border-red-600 text-red-600 dark:text-red-400'
                : 'text-slate-500'
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            <span>Catálogo Visual</span>
          </button>
          <button
            type="button"
            onClick={() => setMobileTab('cart')}
            className={`flex-1 py-2.5 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer ${
              mobileTab === 'cart'
                ? 'border-b-2 border-red-600 text-red-600 dark:text-red-400'
                : 'text-slate-500'
            }`}
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            <span>Presupuesto ({totalOrderCount})</span>
          </button>
        </div>

        {/* ======================= MODAL BODY ======================= */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 min-h-0 overflow-hidden">
          {/* ========================================================= */}
          {/* LEFT COLUMN: CATÁLOGO VISUAL Y SELECCIÓN EN CASCADA */}
          {/* ========================================================= */}
          <div
            className={`lg:col-span-7 flex flex-col h-full border-r border-slate-200 dark:border-slate-800 overflow-hidden bg-slate-50/50 dark:bg-slate-900/40 ${
              mobileTab === 'cart' ? 'hidden lg:flex' : 'flex'
            }`}
          >
            {/* Search bar */}
            <div className="p-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscá por nombre, capacidad o código (ej: 1000L, bicapa, membrana, kit...)"
                  className="w-full pl-9 pr-8 py-2 text-xs rounded-xl bg-slate-100 dark:bg-slate-800 border-none focus:ring-2 focus:ring-red-500 text-slate-800 dark:text-slate-100 placeholder-slate-400 font-medium"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer p-0.5"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Breadcrumb Navigation Bar */}
            {!searchQuery && (
              <div className="px-4 py-2 border-b border-slate-200/80 dark:border-slate-800 bg-white/70 dark:bg-slate-900/60 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-1.5 text-xs text-slate-500 overflow-x-auto whitespace-nowrap py-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedFamilyId(null);
                      setSelectedSubgroupId(null);
                      setSelectedItem(null);
                    }}
                    className="hover:text-red-600 transition-colors font-medium cursor-pointer"
                  >
                    Familias
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
                        className="hover:text-red-600 transition-colors font-medium cursor-pointer"
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
                        className="hover:text-red-600 transition-colors font-bold text-red-600 dark:text-red-400 cursor-pointer"
                      >
                        {currentSubgroup.name}
                      </button>
                    </>
                  )}

                  {selectedItem && (
                    <>
                      <ChevronRight className="w-3 h-3 text-slate-400 shrink-0" />
                      <span className="font-bold text-slate-800 dark:text-slate-100">
                        {selectedItem.label}
                      </span>
                    </>
                  )}
                </div>

                {/* Back button */}
                {(selectedFamilyId || selectedSubgroupId || selectedItem) && (
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedItem) setSelectedItem(null);
                      else if (selectedSubgroupId) setSelectedSubgroupId(null);
                      else if (selectedFamilyId) setSelectedFamilyId(null);
                    }}
                    className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 flex items-center gap-1 font-bold pl-2 cursor-pointer shrink-0"
                  >
                    <ArrowLeft className="w-3 h-3" />
                    <span>Atrás</span>
                  </button>
                )}
              </div>
            )}

            {/* Catalog content */}
            {searchQuery ? (
              /* SEARCH RESULTS */
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>Resultados para "{searchQuery}"</span>
                  <span>{searchResults.length} encontrados</span>
                </div>

                {searchResults.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-xs">
                    No encontramos productos que coincidan con la búsqueda.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-800 shadow-2xs">
                    {searchResults.map((p) => (
                      <div
                        key={p.id}
                        onClick={() => handleAddItem(p)}
                        className="p-3 flex items-center justify-between gap-3 hover:bg-red-50/40 dark:hover:bg-slate-700/50 transition-all cursor-pointer group select-none"
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-700 p-1 flex items-center justify-center shrink-0 border border-slate-200 dark:border-slate-600 overflow-hidden">
                            <Package className="w-5 h-5 text-slate-400 group-hover:text-red-500 transition-colors" />
                          </div>
                          <div className="min-w-0 flex-1">
                            {p.sku && (
                              <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">
                                {p.sku}
                              </span>
                            )}
                            <p className="font-bold text-xs text-slate-800 dark:text-slate-100 truncate group-hover:text-red-600 transition-colors" title={p.name}>
                              {p.name}
                            </p>
                            <span className="font-black text-xs text-emerald-600 font-mono">
                              {fmt(p.price)}
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAddItem(p);
                          }}
                          className="px-3 py-1.5 bg-red-600 group-hover:bg-red-700 active:scale-95 text-white rounded-lg text-xs font-black flex items-center gap-1 shrink-0 transition-all cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Agregar</span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : loading ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-2 text-slate-400 text-xs">
                <Sparkles className="w-6 h-6 animate-spin text-red-500" />
                <span>Cargando catálogo visual...</span>
              </div>
            ) : (
              /* CASCADE VIEWS */
              <div className="flex-1 overflow-y-auto p-4">
                {/* LEVEL 4: ACCESORIOS Y CONFIGURACIÓN (TANQUES, CIEGO, BASE, FLOTANTE) */}
                {selectedItem ? (
                  <div className="space-y-4 max-w-xl mx-auto py-2">
                    {/* Header del Producto Seleccionado */}
                    <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center gap-3.5 shadow-2xs">
                      <div className="w-16 h-16 bg-white dark:bg-slate-700 rounded-xl border border-slate-200 dark:border-slate-600 p-1 flex items-center justify-center shrink-0 overflow-hidden">
                        {selectedItem.imageUrl || currentSubgroup?.imageUrl ? (
                          <img
                            src={selectedItem.imageUrl || currentSubgroup?.imageUrl}
                            alt={selectedItem.label}
                            className="max-h-full max-w-full object-contain"
                          />
                        ) : (
                          <Package className="w-8 h-8 text-slate-400" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300">
                            {currentSubgroup?.name}
                          </span>
                          <span className="text-xs font-black text-slate-300 dark:text-slate-600">|</span>
                          <span className="text-xs font-black text-slate-700 dark:text-slate-200">{selectedItem.label}</span>
                        </div>
                        <h5 className="font-black text-sm text-slate-900 dark:text-slate-100 mt-0.5 truncate">
                          {resolvedMainProduct?.name || selectedItem.label}
                        </h5>
                        <p className="text-xs font-black text-emerald-600 font-mono mt-0.5">
                          Precio: {fmt(resolvedMainProduct?.price || selectedItem.price || 0)}
                        </p>
                      </div>
                    </div>

                    {/* 1. Perforaciones: Estándar vs Ciego */}
                    {selectedItem.allowCiego && (
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                          1. Perforaciones de Fábrica
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          <div
                            onClick={() => setIsCiego(false)}
                            className={`p-2.5 rounded-xl border cursor-pointer transition-all ${
                              !isCiego
                                ? 'border-red-500 bg-red-50/50 dark:bg-red-950/20 ring-1 ring-red-500/30'
                                : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-black text-xs text-slate-800 dark:text-slate-100">🔘 Estándar</span>
                              {!isCiego && <Check className="w-3.5 h-3.5 text-red-600" />}
                            </div>
                            <p className="text-[10px] text-slate-500 mt-0.5">Con orificios originales de fábrica.</p>
                          </div>

                          <div
                            onClick={() => setIsCiego(true)}
                            className={`p-2.5 rounded-xl border cursor-pointer transition-all ${
                              isCiego
                                ? 'border-amber-500 bg-amber-50/50 dark:bg-amber-950/20 ring-1 ring-amber-500/30'
                                : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-black text-xs text-slate-800 dark:text-slate-100">🔘 Ciego</span>
                              {isCiego && <Check className="w-3.5 h-3.5 text-amber-600" />}
                            </div>
                            <p className="text-[10px] text-slate-500 mt-0.5">Sin orificios para perforar en obra.</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 2. Accesorios en 1 Clic */}
                    {(resolvedBaseProduct || resolvedFlotanteProduct) && (
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                          2. Accesorios Recomendados en 1 Clic
                        </label>
                        <div className="space-y-2">
                          {resolvedBaseProduct && (
                            <div
                              onClick={() => setIncludeBase(!includeBase)}
                              className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                                includeBase
                                  ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20 ring-1 ring-emerald-500/30'
                                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300'
                              }`}
                            >
                              <div className="flex items-center gap-2.5">
                                <input
                                  type="checkbox"
                                  checked={includeBase}
                                  onChange={() => {}}
                                  className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 pointer-events-none"
                                />
                                <div>
                                  <p className="font-bold text-xs text-slate-800 dark:text-slate-100">
                                    Base de Hierro Reforzada ({selectedItem.recommendedBaseCm} cm)
                                  </p>
                                  <p className="text-[10px] text-slate-400">
                                    Medida exacta y recomendada para este tanque
                                  </p>
                                </div>
                              </div>
                              <span className="font-black text-xs text-emerald-600 font-mono">
                                +{fmt(resolvedBaseProduct.price)}
                              </span>
                            </div>
                          )}

                          {resolvedFlotanteProduct && (
                            <div
                              onClick={() => setIncludeFlotante(!includeFlotante)}
                              className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                                includeFlotante
                                  ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20 ring-1 ring-emerald-500/30'
                                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300'
                              }`}
                            >
                              <div className="flex items-center gap-2.5">
                                <input
                                  type="checkbox"
                                  checked={includeFlotante}
                                  onChange={() => {}}
                                  className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 pointer-events-none"
                                />
                                <div>
                                  <p className="font-bold text-xs text-slate-800 dark:text-slate-100">
                                    Flotante Eco Varilla Plástica 1/2"
                                  </p>
                                  <p className="text-[10px] text-slate-400">
                                    Válvula de corte para carga automática
                                  </p>
                                </div>
                              </div>
                              <span className="font-black text-xs text-emerald-600 font-mono">
                                +{fmt(resolvedFlotanteProduct.price)}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Footer de Level 4: Total bundle y botón */}
                    <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3">
                      <div>
                        <span className="text-[10px] text-slate-400 uppercase font-bold block">Total Configurado:</span>
                        <span className="text-base font-black text-slate-900 dark:text-slate-100 font-mono">
                          {fmt(
                            (resolvedMainProduct?.price || selectedItem.price || 0) +
                            (includeBase && resolvedBaseProduct ? resolvedBaseProduct.price : 0) +
                            (includeFlotante && resolvedFlotanteProduct ? resolvedFlotanteProduct.price : 0)
                          )}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedItem(null)}
                          className="px-3 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors cursor-pointer"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={handleAddConfiguredItem}
                          className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-black flex items-center gap-2 shadow-lg shadow-red-600/30 active:scale-95 transition-all cursor-pointer"
                        >
                          <ShoppingCart className="w-4 h-4" />
                          <span>Agregar al Presupuesto</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ) : !selectedFamilyId ? (
                  /* LEVEL 1: FAMILIAS */
                  <div className="space-y-3">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                      Seleccioná una Familia de Productos:
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {config?.families.map((fam) => (
                        <div
                          key={fam.id}
                          onClick={() => setSelectedFamilyId(fam.id)}
                          className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-red-500 hover:shadow-lg transition-all bg-white dark:bg-slate-800 flex flex-col items-center text-center cursor-pointer group shadow-2xs"
                        >
                          <div className="w-16 h-16 rounded-xl bg-slate-50 dark:bg-slate-700/50 flex items-center justify-center p-2 mb-2 group-hover:scale-105 transition-transform overflow-hidden">
                            {fam.imageUrl ? (
                              <img
                                src={fam.imageUrl}
                                alt={fam.name}
                                className="max-h-full max-w-full object-contain"
                              />
                            ) : (
                              <Layers className="w-7 h-7 text-red-500" />
                            )}
                          </div>
                          <h4 className="font-bold text-xs text-slate-800 dark:text-slate-100 group-hover:text-red-600 transition-colors">
                            {fam.name}
                          </h4>
                          <span className="text-[10px] text-slate-400 mt-0.5">
                            {fam.subgroups?.length || 0} subgrupos
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : !selectedSubgroupId ? (
                  /* LEVEL 2: SUBGRUPOS */
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                        Modelos de {currentFamily?.name}:
                      </p>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {currentFamily?.subgroups.map((sub) => (
                        <div
                          key={sub.id}
                          onClick={() => setSelectedSubgroupId(sub.id)}
                          className="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-red-500 hover:shadow-md transition-all bg-white dark:bg-slate-800 flex flex-col items-center text-center cursor-pointer group shadow-2xs"
                        >
                          <div className="w-14 h-14 rounded-xl bg-slate-50 dark:bg-slate-700/50 flex items-center justify-center p-1.5 mb-2 group-hover:scale-105 transition-transform overflow-hidden">
                            {sub.imageUrl ? (
                              <img
                                src={sub.imageUrl}
                                alt={sub.name}
                                className="max-h-full max-w-full object-contain"
                              />
                            ) : (
                              <Package className="w-6 h-6 text-red-500" />
                            )}
                          </div>
                          <h4 className="font-bold text-xs text-slate-800 dark:text-slate-100 group-hover:text-red-600 transition-colors">
                            {sub.name}
                          </h4>
                          <span className="text-[10px] text-slate-400 mt-0.5">
                            {sub.items?.length || 0} capacidades
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  /* LEVEL 3: CAPACIDADES / ITEMS */
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-black text-xs text-slate-800 dark:text-slate-100 uppercase tracking-wider">
                          Capacidades y Modelos
                        </h4>
                        <p className="text-[11px] text-slate-400">
                          Disponibles para {currentSubgroup?.name}
                        </p>
                      </div>

                      {/* View mode toggle */}
                      <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
                        <button
                          type="button"
                          onClick={() => setViewMode('list')}
                          className={`px-2 py-0.5 rounded text-[10.5px] font-bold flex items-center gap-1 transition-all cursor-pointer ${
                            viewMode === 'list'
                              ? 'bg-white dark:bg-slate-700 text-red-600 font-black shadow-2xs'
                              : 'text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          <List className="w-3 h-3" />
                          <span>Listado</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setViewMode('grid')}
                          className={`px-2 py-0.5 rounded text-[10.5px] font-bold flex items-center gap-1 transition-all cursor-pointer ${
                            viewMode === 'grid'
                              ? 'bg-white dark:bg-slate-700 text-red-600 font-black shadow-2xs'
                              : 'text-slate-600 dark:text-slate-400'
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
                      /* LIST VIEW */
                      <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-800 shadow-2xs">
                        {activeItems.map((item) => {
                          const linkedProd = item.productId
                            ? products.find((p) => p.id === item.productId)
                            : null;
                          const price = item.price || linkedProd?.price || 0;
                          const isConfigurable = Boolean(item.allowCiego || item.recommendedBaseCm);

                          return (
                            <div
                              key={item.id}
                              onClick={() => {
                                if (isConfigurable) {
                                  setSelectedItem(item);
                                } else {
                                  handleAddItem({
                                    id: item.productId || item.id,
                                    name: item.label,
                                    price,
                                  });
                                }
                              }}
                              className="p-3 flex items-center justify-between gap-3 hover:bg-red-50/40 dark:hover:bg-slate-700/50 transition-all cursor-pointer group select-none"
                            >
                              <div>
                                <h5 className="font-bold text-xs text-slate-800 dark:text-slate-100 group-hover:text-red-600 transition-colors">
                                  {item.label}
                                </h5>
                                <span className="font-black text-xs text-emerald-600 font-mono">
                                  {fmt(price)}
                                </span>
                              </div>

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (isConfigurable) {
                                    setSelectedItem(item);
                                  } else {
                                    handleAddItem({
                                      id: item.productId || item.id,
                                      name: item.label,
                                      price,
                                    });
                                  }
                                }}
                                className="px-3 py-1.5 bg-red-600 group-hover:bg-red-700 active:scale-95 text-white rounded-lg text-xs font-black flex items-center gap-1 shrink-0 transition-all cursor-pointer"
                              >
                                {isConfigurable ? (
                                  <>
                                    <span>Configurar</span>
                                    <ChevronRight className="w-3.5 h-3.5" />
                                  </>
                                ) : (
                                  <>
                                    <Plus className="w-3.5 h-3.5" />
                                    <span>Agregar</span>
                                  </>
                                )}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      /* GRID (FOTOS) VIEW */
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {activeItems.map((item) => {
                          const linkedProd = item.productId
                            ? products.find((p) => p.id === item.productId)
                            : null;
                          const price = item.price || linkedProd?.price || 0;
                          const isConfigurable = Boolean(item.allowCiego || item.recommendedBaseCm);

                          return (
                            <div
                              key={item.id}
                              onClick={() => {
                                if (isConfigurable) {
                                  setSelectedItem(item);
                                }
                              }}
                              className={`p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-red-500 hover:shadow-md transition-all bg-white dark:bg-slate-800 flex flex-col justify-between group shadow-2xs ${
                                isConfigurable ? 'cursor-pointer' : ''
                              }`}
                            >
                              <div>
                                <div className="w-full h-20 rounded-lg bg-slate-50 dark:bg-slate-700/50 flex items-center justify-center p-1 overflow-hidden mb-2">
                                  {item.imageUrl ? (
                                    <img
                                      src={item.imageUrl}
                                      alt={item.label}
                                      className="max-h-full max-w-full object-contain group-hover:scale-105 transition-transform"
                                    />
                                  ) : (
                                    <Package className="w-7 h-7 text-slate-300" />
                                  )}
                                </div>

                                <div className="flex items-center justify-between gap-1">
                                  <h5 className="font-bold text-xs text-slate-800 dark:text-slate-100 group-hover:text-red-600 transition-colors">
                                    {item.label}
                                  </h5>
                                  {item.badge && (
                                    <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase bg-amber-100 text-amber-800">
                                      {item.badge}
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between">
                                <span className="font-black text-xs text-emerald-600 font-mono">
                                  {fmt(price)}
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (isConfigurable) {
                                      setSelectedItem(item);
                                    } else {
                                      handleAddItem({
                                        id: item.productId || item.id,
                                        name: item.label,
                                        price,
                                      });
                                    }
                                  }}
                                  className="px-2.5 py-1 bg-red-600 hover:bg-red-700 active:scale-95 text-white rounded-lg text-xs font-bold flex items-center gap-1 transition-all cursor-pointer"
                                >
                                  {isConfigurable ? (
                                    <>
                                      <span>Configurar</span>
                                      <ChevronRight className="w-3 h-3" />
                                    </>
                                  ) : (
                                    <>
                                      <Plus className="w-3 h-3" />
                                      <span>Agregar</span>
                                    </>
                                  )}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ========================================================= */}
          {/* RIGHT COLUMN: DETALLE DEL PRESUPUESTO & TOTALES */}
          {/* ========================================================= */}
          <div
            className={`lg:col-span-5 flex flex-col h-full bg-white dark:bg-slate-900 overflow-hidden ${
              mobileTab === 'catalog' ? 'hidden lg:flex' : 'flex'
            }`}
          >
            {/* Header */}
            <div className="p-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-900/60 shrink-0">
              <span className="font-black text-xs text-slate-700 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                <ShoppingCart className="w-4 h-4 text-emerald-600" />
                Detalle del Presupuesto ({totalOrderCount})
              </span>
              {cartItems.length > 0 && (
                <button
                  type="button"
                  onClick={() => setCartItems([])}
                  className="text-[11px] font-bold text-rose-500 hover:underline cursor-pointer"
                >
                  Vaciar todo
                </button>
              )}
            </div>

            {/* Cart Items List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
              {cartItems.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
                  <ShoppingBag className="w-10 h-10 stroke-[1.5] text-slate-300 dark:text-slate-700 mb-2" />
                  <p className="font-bold text-xs text-slate-600 dark:text-slate-300">
                    El presupuesto está vacío
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Seleccioná productos o capacidades desde el catálogo a la izquierda.
                  </p>
                </div>
              ) : (
                cartItems.map((item, idx) => (
                  <div
                    key={idx}
                    className="bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-col gap-1.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-bold text-xs text-slate-800 dark:text-slate-100 leading-tight">
                        {item.name}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(idx)}
                        className="text-slate-400 hover:text-rose-500 transition-colors p-0.5 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="flex items-center justify-between mt-1">
                      {/* Counter */}
                      <div className="flex items-center gap-1.5 bg-white dark:bg-slate-700 rounded-lg p-0.5 border border-slate-200 dark:border-slate-600">
                        <button
                          type="button"
                          onClick={() => handleUpdateQuantity(idx, item.quantity - 1)}
                          className="p-1 hover:bg-slate-100 dark:hover:bg-slate-600 rounded text-slate-600 dark:text-slate-300 cursor-pointer"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-6 text-center font-bold text-xs text-slate-800 dark:text-slate-100">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleUpdateQuantity(idx, item.quantity + 1)}
                          className="p-1 hover:bg-slate-100 dark:hover:bg-slate-600 rounded text-slate-600 dark:text-slate-300 cursor-pointer"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>

                      {/* Price per item & Subtotal */}
                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 block font-mono">
                          {fmt(item.price)} c/u
                        </span>
                        <span className="font-black text-xs text-slate-800 dark:text-slate-100 font-mono">
                          {fmt(item.subtotal || item.price * item.quantity)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Config: Envío, Pago y Notas */}
            {cartItems.length > 0 && (
              <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 space-y-2 shrink-0">
                {/* Envío */}
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 flex items-center gap-1">
                    <Truck className="w-3 h-3 text-emerald-600" />
                    Envío
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setShippingType('gratis')}
                      className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        shippingType === 'gratis'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      Gratis
                    </button>
                    <button
                      type="button"
                      onClick={() => setShippingType('costo')}
                      className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        shippingType === 'costo'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      Con costo
                    </button>
                  </div>
                  {shippingType === 'costo' && (
                    <div className="mt-1 flex items-center gap-1">
                      <span className="text-xs text-slate-400 font-mono">$</span>
                      <input
                        type="number"
                        min="0"
                        step="100"
                        value={customShippingCost || ''}
                        onChange={(e) => setCustomShippingCost(Number(e.target.value))}
                        placeholder="Monto del flete"
                        className="w-full px-2 py-1 text-xs rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono"
                      />
                    </div>
                  )}
                </div>

                {/* Medio de Pago */}
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 flex items-center gap-1">
                    <CreditCard className="w-3 h-3 text-blue-600" />
                    Medio de pago
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full px-2 py-1 text-xs rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-medium cursor-pointer"
                  >
                    <option value="Efectivo / Transferencia">Efectivo / Transferencia</option>
                    <option value="Tarjeta de Débito">Tarjeta de Débito</option>
                    <option value="Tarjeta de Crédito">Tarjeta de Crédito</option>
                    <option value="Mercado Pago">Mercado Pago</option>
                    <option value="A convenir">A convenir</option>
                  </select>
                </div>
              </div>
            )}

            {/* Totals & Actions Footer */}
            <div className="p-3.5 bg-slate-900 text-white border-t border-slate-800 space-y-2.5 shrink-0">
              <div className="space-y-1 text-xs">
                <div className="flex justify-between text-slate-400">
                  <span>Subtotal:</span>
                  <span className="font-mono">{fmt(subtotal)}</span>
                </div>
                {shippingCost > 0 && (
                  <div className="flex justify-between text-slate-400">
                    <span>Envío:</span>
                    <span className="font-mono">{fmt(shippingCost)}</span>
                  </div>
                )}
                <div className="flex justify-between items-baseline pt-1 border-t border-slate-800">
                  <span className="font-bold text-sm text-slate-100">TOTAL:</span>
                  <span className="font-black text-xl text-emerald-400 font-mono">
                    {fmt(total)}
                  </span>
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={isSubmitting || cartItems.length === 0}
                  onClick={() => handleSaveAndPassToChat(false)}
                  className="flex-1 py-2.5 px-3 text-xs font-bold rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer"
                  title="Guardar en base de datos sin pegar en el chat"
                >
                  <Save className="w-3.5 h-3.5" />
                  Solo Guardar
                </button>

                <button
                  type="button"
                  disabled={isSubmitting || cartItems.length === 0}
                  onClick={() => handleSaveAndPassToChat(true)}
                  className="flex-1 py-2.5 px-3 text-xs font-black rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-600/30 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                  title="Guarda en base de datos y coloca el presupuesto en el cuadro de mensaje para editar y enviar"
                >
                  <MessageSquare className="w-4 h-4" />
                  Guardar y Pasar al Chat
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined'
    ? createPortal(modalContent, document.body)
    : modalContent;
};

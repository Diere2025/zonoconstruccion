"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Product, PaymentMethod } from "@/types";
import { Search, Plus, Trash2, Copy, Check, Calculator, ArrowRight, Save, Package } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatPrice } from "@/lib/utils";

interface QuoteItem extends Product {
  quantity: number;
  customPrice: number;
}

interface Kit {
  id: string;
  name: string;
  items: QuoteItem[];
  detailText: string;
}

export default function PresupuestosPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [quoteItems, setQuoteItems] = useState<QuoteItem[]>([]);
  const [usageCounts, setUsageCounts] = useState<Record<string, number>>({});
  
  const [savedKits, setSavedKits] = useState<Kit[]>([]);
  const [kitDetailText, setKitDetailText] = useState("");
  const [showSaveKitModal, setShowSaveKitModal] = useState(false);
  const [newKitName, setNewKitName] = useState("");
  const [newKitDetail, setNewKitDetail] = useState("");
  
  const [paymentType, setPaymentType] = useState<'efectivo' | 'tarjeta'>('efectivo');
  const [cardInstallments, setCardInstallments] = useState<number>(3);
  const [cardSurcharge, setCardSurcharge] = useState<number>(34);

  const selectedPaymentMethod = paymentType === 'efectivo' 
    ? { id: "1", name: "Efectivo / Transferencia", surcharge_percentage: 0, installments: 1, is_active: true }
    : { id: "2", name: cardInstallments === 1 ? "Tarjeta de Crédito (1 Pago)" : `Tarjeta de Crédito (${cardInstallments} Cuotas)`, surcharge_percentage: cardSurcharge, installments: cardInstallments, is_active: true };
  
  const [isFreeShipping, setIsFreeShipping] = useState(true);
  const [shippingCost, setShippingCost] = useState<number>(0);
  const [includeIVA, setIncludeIVA] = useState(false);
  
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function fetchProducts() {
      const { data } = await supabase.from("products").select("*").order("name");
      if (data) setProducts(data);
    }
    fetchProducts();
    // In the future: fetch payment_methods from Supabase
    
    // Cargar uso frecuente y kits
    try {
      const counts = JSON.parse(localStorage.getItem('product_usage_counts') || '{}');
      setUsageCounts(counts);
      const kits = JSON.parse(localStorage.getItem('personal_kits') || '[]');
      setSavedKits(kits);
    } catch(e) {}
  }, []);

  const frequentProducts = React.useMemo(() => {
    if (products.length === 0) return [];
    const sortedIds = Object.keys(usageCounts).sort((a, b) => usageCounts[b] - usageCounts[a]);
    return sortedIds
      .map(id => products.find(p => p.id === id))
      .filter(Boolean)
      .slice(0, 10) as Product[];
  }, [products, usageCounts]);

  const searchTerms = searchTerm.toLowerCase().split(/\s+/).filter(Boolean);
  const filteredProducts = products.filter(p => {
    if (searchTerms.length === 0) return false;
    const searchableText = `${p.name} ${p.sku || ''}`.toLowerCase();
    return searchTerms.every(term => searchableText.includes(term));
  }).slice(0, 10); // Limit search results

  const addItem = (product: Product) => {
    const existing = quoteItems.find(i => i.id === product.id);
    if (existing) {
      setQuoteItems(quoteItems.map(i => i.id === product.id ? { ...i, quantity: i.quantity + 1 } : i));
    } else {
      setQuoteItems([...quoteItems, { ...product, quantity: 1, customPrice: product.price }]);
    }
    setSearchTerm("");
    
    // Guardar uso en localStorage
    try {
      const counts = { ...usageCounts };
      counts[product.id] = (counts[product.id] || 0) + 1;
      localStorage.setItem('product_usage_counts', JSON.stringify(counts));
      setUsageCounts(counts);
    } catch (e) {}
  };

  const handleSaveKit = () => {
    if (!newKitName.trim() || quoteItems.length === 0) return;
    const newKit: Kit = {
      id: Math.random().toString(36).substring(7),
      name: newKitName,
      items: [...quoteItems],
      detailText: newKitDetail
    };
    const updatedKits = [...savedKits, newKit];
    setSavedKits(updatedKits);
    localStorage.setItem('personal_kits', JSON.stringify(updatedKits));
    setShowSaveKitModal(false);
    setNewKitName("");
    setNewKitDetail("");
    alert("Kit guardado con éxito.");
  };

  const loadKit = (kit: Kit) => {
    setQuoteItems([...quoteItems, ...kit.items]);
    if (kit.detailText) {
      setKitDetailText(prev => prev ? `${prev}\n${kit.detailText}` : kit.detailText);
    }
  };

  const deleteKit = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("¿Eliminar este kit?")) {
      const updated = savedKits.filter(k => k.id !== id);
      setSavedKits(updated);
      localStorage.setItem('personal_kits', JSON.stringify(updated));
    }
  };

  const removeItem = (id: string) => {
    setQuoteItems(quoteItems.filter(i => i.id !== id));
  };

  const updateQuantity = (id: string, qty: number) => {
    if (qty < 1) return;
    setQuoteItems(quoteItems.map(i => i.id === id ? { ...i, quantity: qty } : i));
  };

  const updateCustomPrice = (id: string, price: number) => {
    setQuoteItems(quoteItems.map(i => i.id === id ? { ...i, customPrice: price } : i));
  };

  // Calculations
  const subtotal = quoteItems.reduce((acc, item) => acc + item.customPrice * item.quantity, 0);
  const shippingAmount = isFreeShipping ? 0 : shippingCost;
  const surcharge = subtotal * (selectedPaymentMethod.surcharge_percentage / 100);
  const subtotalWithSurchargeAndShipping = subtotal + surcharge + shippingAmount;
  const ivaAmount = includeIVA ? subtotalWithSurchargeAndShipping * 0.21 : 0;
  const total = subtotalWithSurchargeAndShipping + ivaAmount;
  const installmentValue = selectedPaymentMethod.installments > 1 ? total / selectedPaymentMethod.installments : 0;

  const generateWhatsAppText = () => {
    let text = `*Zono Construcción y Hogar*\n`;
    text += `_Presupuesto Detallado_\n\n`;
    
    quoteItems.forEach(item => {
      const internalName = item.sku || item.name;
      if (item.quantity > 1) {
        text += `🔸 ${item.quantity}x *${internalName}* a ${formatPrice(item.customPrice)} c/u\n`;
        text += `   Subtotal: ${formatPrice(item.customPrice * item.quantity)}\n`;
      } else {
        text += `🔸 1x *${internalName}* a ${formatPrice(item.customPrice)}\n`;
      }
    });
    
    text += `➖\n`;
    text += `*Subtotal Productos:* ${formatPrice(subtotal)}\n`;
    if (isFreeShipping) {
      text += `*Envío:* Gratis\n`;
    } else if (shippingCost > 0) {
      text += `*Envío:* ${formatPrice(shippingCost)}\n`;
    }
    text += `*Medio de pago:* ${selectedPaymentMethod.name}\n`;
    if (surcharge > 0) {
      text += `*Recargo por pago en cuotas:* ${formatPrice(surcharge)} (${selectedPaymentMethod.surcharge_percentage}%)\n`;
    }
    if (includeIVA) {
      text += `*IVA (21%):* ${formatPrice(ivaAmount)}\n`;
    }
    if (kitDetailText) {
      text += `*Aclaración:* ${kitDetailText}\n`;
    }
    text += `➖\n`;
    text += `*TOTAL A ABONAR:* ${formatPrice(total)}\n`;
    
    if (selectedPaymentMethod.installments > 1) {
      text += `\n💳 Podes pagarlo en *${selectedPaymentMethod.installments} cuotas fijas de ${formatPrice(installmentValue)}*\n`;
    }
    
    return text;
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generateWhatsAppText());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-black text-slate-900 tracking-tighter">Armador de Presupuestos</h1>
        <p className="text-slate-500 font-medium mt-1">Cotizá rápido y enviá la propuesta lista por WhatsApp.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left Col: Builder */}
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-3xl shadow-xl shadow-slate-200/40 border border-slate-100">
            <h2 className="font-black text-lg text-slate-800 mb-4 flex items-center gap-2">
              <Search className="w-5 h-5 text-brand-500" /> Agregar Productos
            </h2>
            <div className="relative">
              <input 
                type="text" 
                className="w-full pl-4 pr-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500/20 outline-none font-medium"
                placeholder="Buscar por nombre o interno (SKU)..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            
            {savedKits.length > 0 && !searchTerm && (
              <div className="mt-4 border-b border-slate-100 pb-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Mis Kits Guardados</p>
                <div className="flex flex-wrap gap-2">
                  {savedKits.map(kit => (
                    <button
                      key={kit.id}
                      type="button"
                      onClick={() => loadKit(kit)}
                      className="px-3 py-1.5 bg-indigo-50 border border-indigo-100 text-indigo-600 hover:bg-indigo-600 hover:text-white rounded-lg text-xs font-bold transition-all shadow-sm flex items-center gap-2 group"
                      title="Cargar kit al presupuesto"
                    >
                      <Package className="w-3.5 h-3.5 text-indigo-400 group-hover:text-white transition-colors" />
                      {kit.name}
                      <span onClick={(e) => deleteKit(kit.id, e)} className="ml-1 p-0.5 rounded-md hover:bg-red-500 hover:text-white text-indigo-300 transition-colors">
                        <Trash2 className="w-3 h-3" />
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            
            {/* Tags de productos más utilizados */}
            {frequentProducts.length > 0 && !searchTerm && (
              <div className="mt-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Más Utilizados</p>
                <div className="flex flex-wrap gap-2">
                  {frequentProducts.map(p => (
                    <button
                      key={p.id}
                      onClick={() => addItem(p)}
                      className="px-2.5 py-1 bg-brand-50 border border-brand-100 text-brand-600 hover:bg-brand-600 hover:text-white rounded-md text-[10px] font-black uppercase tracking-wide transition-all shadow-sm flex items-center gap-1 group"
                      title={p.name}
                    >
                      <Plus className="w-3 h-3 text-brand-400 group-hover:text-white transition-colors" />
                      {p.sku || p.name.substring(0, 20) + '...'}
                    </button>
                  ))}
                </div>
              </div>
            )}
            
            {searchTerm && (
              <div className="mt-2 border border-slate-100 rounded-xl overflow-hidden bg-slate-50">
                {filteredProducts.map(p => (
                  <div key={p.id} className="flex justify-between items-center p-3 hover:bg-white border-b border-slate-100 last:border-0 transition-colors">
                    <div>
                      <p className="text-[10px] font-black text-brand-500 uppercase tracking-widest">{p.sku || "SIN INTERNO"}</p>
                      <p className="font-bold text-sm text-slate-800">{p.name}</p>
                      <p className="text-xs text-brand-600 font-bold">{formatPrice(p.price)}</p>
                    </div>
                    <button 
                      onClick={() => addItem(p)}
                      className="p-2 bg-brand-100 text-brand-600 rounded-lg hover:bg-brand-500 hover:text-white transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                {filteredProducts.length === 0 && <div className="p-4 text-center text-sm text-slate-500 font-medium">No se encontraron productos.</div>}
              </div>
            )}
          </div>

          <div className="bg-white p-6 rounded-3xl shadow-xl shadow-slate-200/40 border border-slate-100">
             <h2 className="font-black text-lg text-slate-800 mb-4 flex items-center gap-2">
              <Calculator className="w-5 h-5 text-brand-500" /> Método de Pago
            </h2>
            <div className="space-y-3">
              <label className={`flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition-colors ${paymentType === 'efectivo' ? 'border-brand-500 bg-brand-50' : 'border-slate-100 hover:border-slate-200'}`}>
                <div className="flex items-center gap-3">
                  <input 
                    type="radio" 
                    name="paymentType" 
                    className="w-4 h-4 text-brand-600"
                    checked={paymentType === 'efectivo'}
                    onChange={() => setPaymentType('efectivo')}
                  />
                  <span className="font-bold text-slate-800 text-sm">Efectivo / Transferencia</span>
                </div>
              </label>

              <label className={`flex flex-col p-4 rounded-xl border-2 cursor-pointer transition-colors ${paymentType === 'tarjeta' ? 'border-brand-500 bg-brand-50' : 'border-slate-100 hover:border-slate-200'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <input 
                      type="radio" 
                      name="paymentType" 
                      className="w-4 h-4 text-brand-600"
                      checked={paymentType === 'tarjeta'}
                      onChange={() => setPaymentType('tarjeta')}
                    />
                    <span className="font-bold text-slate-800 text-sm">Tarjeta de Crédito</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Recargo %</span>
                    <input 
                      type="number"
                      value={cardSurcharge}
                      onChange={(e) => setCardSurcharge(Number(e.target.value))}
                      onClick={(e) => e.stopPropagation()}
                      className="w-16 px-2 py-1 text-sm font-bold border border-slate-200 rounded-lg text-center focus:ring-2 focus:ring-brand-500/20 outline-none bg-white text-red-500"
                    />
                  </div>
                </div>
                
                {paymentType === 'tarjeta' && (
                  <div className="mt-4 pt-4 border-t border-brand-100/50 flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Cantidad de Cuotas</span>
                    <div className="flex gap-2">
                      {[1, 3, 6].map(cuota => (
                        <button
                          key={cuota}
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setCardInstallments(cuota); }}
                          className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all border-2 ${cardInstallments === cuota ? 'bg-brand-600 border-brand-600 text-white' : 'bg-white border-brand-100 text-brand-600 hover:border-brand-300'}`}
                        >
                          {cuota} {cuota === 1 ? 'Pago' : 'Cuotas'}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </label>
            </div>
          </div>
        </div>

        {/* Right Col: Preview */}
        <div className="bg-white p-6 rounded-[2.5rem] shadow-2xl shadow-brand-500/10 border border-slate-100 flex flex-col h-full">
          <h2 className="font-black text-xl text-slate-900 mb-6 flex justify-between items-center">
            <span>Vista Previa del Presupuesto</span>
            <div className="flex items-center gap-3">
              {quoteItems.length > 0 && (
                <>
                  <button 
                    onClick={() => setShowSaveKitModal(true)}
                    className="text-xs font-bold text-slate-400 hover:text-indigo-600 transition-colors flex items-center gap-1"
                    title="Guardar este presupuesto como Kit"
                  >
                    <Save className="w-3.5 h-3.5" /> Guardar Kit
                  </button>
                  <button 
                    onClick={() => { setQuoteItems([]); setKitDetailText(""); }}
                    className="text-xs font-bold text-slate-400 hover:text-red-500 transition-colors flex items-center gap-1"
                    title="Vaciar presupuesto"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Limpiar
                  </button>
                </>
              )}
              <span className="text-sm bg-brand-50 text-brand-600 px-3 py-1 rounded-lg">
                {quoteItems.length} items
              </span>
            </div>
          </h2>
          
          <div className="flex-1 overflow-y-auto pr-2 space-y-4 mb-6 max-h-[400px]">
            {quoteItems.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-2">
                <Calculator className="w-12 h-12 opacity-20" />
                <p className="font-medium text-sm">No hay productos agregados.</p>
              </div>
            ) : (
              quoteItems.map(item => (
                <div key={item.id} className="p-4 bg-slate-50 border border-slate-100 rounded-2xl relative group">
                  <button 
                    onClick={() => removeItem(item.id)}
                    className="absolute -top-2 -right-2 bg-red-100 text-red-600 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <p className="text-[10px] font-black text-brand-500 uppercase tracking-widest mb-1">{item.sku || "SIN INTERNO"}</p>
                  <p className="font-bold text-slate-800 text-sm mb-3 pr-6">{item.name}</p>
                  
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center bg-white border border-slate-200 rounded-lg overflow-hidden">
                      <button onClick={() => updateQuantity(item.id, item.quantity - 1)} className="px-3 py-1 font-black text-slate-500 hover:bg-slate-50">-</button>
                      <span className="px-2 font-bold text-sm min-w-[2rem] text-center">{item.quantity}</span>
                      <button onClick={() => updateQuantity(item.id, item.quantity + 1)} className="px-3 py-1 font-black text-slate-500 hover:bg-slate-50">+</button>
                    </div>
                    
                    <div className="flex items-center gap-2">
                       <span className="text-xs font-bold text-slate-400">$</span>
                       <input 
                         type="number" 
                         value={item.customPrice}
                         onChange={(e) => updateCustomPrice(item.id, Number(e.target.value))}
                         className="w-24 px-2 py-1 text-sm font-bold border border-slate-200 rounded-lg text-right focus:ring-2 focus:ring-brand-500/20 outline-none"
                       />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="border-t border-slate-100 pt-6 space-y-3 mb-6">
            <div className="flex justify-between text-sm font-medium text-slate-500">
              <span>Subtotal Productos</span>
              <span>{formatPrice(subtotal)}</span>
            </div>
            
            <div className="flex justify-between items-center text-sm font-medium text-slate-500">
              <label className="flex items-center gap-2 cursor-pointer">
                <span>Envío Gratis</span>
                <input 
                  type="checkbox" 
                  checked={isFreeShipping} 
                  onChange={(e) => setIsFreeShipping(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500/20 cursor-pointer"
                />
              </label>
              {isFreeShipping ? (
                <span className="text-brand-600 font-bold uppercase text-[10px] tracking-widest bg-brand-50 px-2 py-1 rounded-md border border-brand-100">Gratis</span>
              ) : (
                <div className="flex items-center gap-1">
                  <span className="text-xs font-bold text-slate-400">$</span>
                  <input 
                    type="number"
                    value={shippingCost || ''}
                    onChange={(e) => setShippingCost(Number(e.target.value))}
                    className="w-24 px-2 py-1 text-sm font-bold border border-slate-200 rounded-lg text-right focus:ring-2 focus:ring-brand-500/20 outline-none bg-white"
                    placeholder="Costo envío..."
                  />
                </div>
              )}
            </div>
            
            {surcharge > 0 && (
              <div className="flex justify-between text-sm font-bold text-red-500">
                <span>Recargo ({selectedPaymentMethod.name})</span>
                <span>+{formatPrice(surcharge)}</span>
              </div>
            )}
            
            <div className="flex justify-between items-center text-sm font-medium text-slate-500">
              <label className="flex items-center gap-2 cursor-pointer">
                <span>Factura con IVA (+21%)</span>
                <input 
                  type="checkbox" 
                  checked={includeIVA} 
                  onChange={(e) => setIncludeIVA(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500/20 cursor-pointer"
                />
              </label>
              {includeIVA && (
                <span className="font-bold text-slate-600">+{formatPrice(ivaAmount)}</span>
              )}
            </div>

            <div className="flex justify-between text-2xl font-black text-slate-900 pt-2 border-t border-slate-100">
              <span>Total</span>
              <span>{formatPrice(total)}</span>
            </div>
            {selectedPaymentMethod.installments > 1 && (
              <div className="flex justify-between text-sm font-bold text-brand-600 bg-brand-50 p-3 rounded-xl mt-2">
                <span>{selectedPaymentMethod.installments} cuotas fijas de:</span>
                <span>{formatPrice(installmentValue)}</span>
              </div>
            )}
            
            <div className="mt-4 space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Aclaraciones / Detalle del Combo</label>
              <textarea 
                value={kitDetailText}
                onChange={(e) => setKitDetailText(e.target.value)}
                placeholder="Ej. Con 15% de descuento aplicado en el total."
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500/20 bg-slate-50 text-sm font-medium outline-none resize-none h-20"
              />
            </div>
          </div>

          <Button 
            onClick={handleCopy} 
            disabled={quoteItems.length === 0}
            className="w-full py-6 rounded-2xl text-lg font-black flex items-center justify-center gap-2"
          >
            {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
            {copied ? "¡Copiado al portapapeles!" : "Copiar Resumen para WhatsApp"}
          </Button>
          
          {quoteItems.length > 0 && (
             <div className="mt-4 p-4 bg-slate-900 rounded-2xl">
               <pre className="text-[10px] text-slate-300 font-mono whitespace-pre-wrap">
                 {generateWhatsAppText()}
               </pre>
             </div>
          )}
        </div>
      </div>

      {/* Modal Guardar Kit */}
      {showSaveKitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md flex flex-col animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100">
              <h2 className="text-xl font-black text-slate-900">Guardar como Kit</h2>
              <p className="text-sm font-medium text-slate-500 mt-1">Guardá esta combinación de productos y precios para usarla rápido en el futuro.</p>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Nombre del Kit</label>
                <input 
                  type="text" 
                  value={newKitName}
                  onChange={(e) => setNewKitName(e.target.value)}
                  placeholder="Ej. Combo Tanque + Base"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500/20 bg-slate-50 font-bold outline-none"
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Detalle / Descuento (Opcional)</label>
                <textarea 
                  value={newKitDetail}
                  onChange={(e) => setNewKitDetail(e.target.value)}
                  placeholder="Ej. Incluye 15% de descuento por pago en efectivo."
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500/20 bg-slate-50 text-sm font-medium outline-none resize-none h-20"
                />
              </div>
            </div>
            
            <div className="p-6 border-t border-slate-100 bg-slate-50 rounded-b-3xl flex justify-end gap-3">
               <button 
                 onClick={() => setShowSaveKitModal(false)}
                 className="px-5 py-2.5 rounded-xl font-bold text-slate-600 hover:bg-slate-200 transition-colors"
               >
                 Cancelar
               </button>
               <Button onClick={handleSaveKit} className="px-6 py-2.5 rounded-xl font-black">
                 Guardar Kit
               </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

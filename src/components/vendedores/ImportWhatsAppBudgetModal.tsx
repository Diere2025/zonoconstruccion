"use client";

import React, { useState } from "react";
import { 
  X, 
  Download, 
  CheckCircle2, 
  AlertTriangle, 
  Tag, 
  CreditCard, 
  Truck, 
  FileText, 
  ClipboardPaste,
  Trash2,
  RefreshCw,
  Package
} from "lucide-react";
import { Product } from "@/types";
import { formatPrice } from "@/lib/utils";
import { 
  parseWhatsAppBudget, 
  matchParsedItemsToProducts, 
  MatchedOrderItem, 
  ParsedWhatsAppBudget 
} from "@/lib/whatsappBudgetParser";

interface OrderItem extends Product {
  quantity: number;
  customPrice: number;
  basePrice?: number;
  discountType?: 'percentage' | 'fixed';
  discountValue?: number;
  bundleParentId?: string;
  isIncludedInKit?: boolean;
  baseQuantity?: number;
}

interface ImportWhatsAppBudgetModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  currentItemsCount: number;
  onApplyBudget: (budgetData: {
    items: OrderItem[];
    orderDiscountType?: 'percentage' | 'fixed';
    orderDiscountValue?: number;
    paymentType?: 'efectivo' | 'tarjeta';
    paymentMethodName?: string;
    cardInstallments?: number;
    cardSurcharge?: number;
    shippingCost?: number;
    isFreeShipping?: boolean;
    aclaraciones?: string;
  }, mode: 'replace' | 'append') => void;
}

export default function ImportWhatsAppBudgetModal({
  isOpen,
  onClose,
  products,
  currentItemsCount,
  onApplyBudget
}: ImportWhatsAppBudgetModalProps) {
  const [inputText, setInputText] = useState("");
  const [parsedResult, setParsedResult] = useState<ParsedWhatsAppBudget | null>(null);
  const [matches, setMatches] = useState<MatchedOrderItem[]>([]);
  const [importMode, setImportMode] = useState<'replace' | 'append'>('replace');
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  if (!isOpen) return null;

  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setInputText(text);
        analyzeText(text);
      }
    } catch (e) {
      alert("No se pudo acceder al portapapeles. Podés pegar el texto manualmente con Ctrl+V.");
    }
  };

  const analyzeText = (textToAnalyze?: string) => {
    const text = textToAnalyze !== undefined ? textToAnalyze : inputText;
    if (!text.trim()) {
      alert("Por favor ingresá o pegá el texto del presupuesto de WhatsApp.");
      return;
    }

    setIsAnalyzing(true);
    try {
      const parsed = parseWhatsAppBudget(text);
      if (parsed.items.length === 0) {
        alert("No se detectaron artículos en el texto. Verificá que el mensaje tenga el formato de presupuesto de Zono.");
        setIsAnalyzing(false);
        return;
      }

      const matchedList = matchParsedItemsToProducts(parsed.items, products);
      setParsedResult(parsed);
      setMatches(matchedList);
    } catch (err) {
      console.error("Error analizando presupuesto de WhatsApp:", err);
      alert("Ocurrió un error al interpretar el mensaje. Verificá el formato.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleUpdateMatchedProduct = (index: number, newProductId: string) => {
    const selectedProd = products.find(p => p.id === newProductId);
    if (!selectedProd) return;

    setMatches(prev => {
      const copy = [...prev];
      copy[index] = {
        ...copy[index],
        product: selectedProd,
        matchType: 'exact_name',
        confidence: 1.0
      };
      return copy;
    });
  };

  const handleConfirmImport = () => {
    if (!parsedResult || matches.length === 0) return;

    // Convertir matches a OrderItem[]
    const finalItems: OrderItem[] = matches.map((m) => {
      const isDisc = m.parsedItem.isDiscountItem || (m.parsedItem.unitPrice < 0);
      
      if (isDisc) {
        return {
          id: m.product?.id || `discount-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          name: m.parsedItem.name || m.product?.name || "Descuento",
          sku: m.product?.sku || "DESCUENTO",
          description: "Descuento aplicado",
          price: 0,
          customPrice: -Math.abs(m.parsedItem.unitPrice),
          basePrice: -Math.abs(m.parsedItem.unitPrice),
          category: "Descuento",
          image_url: "",
          is_active: true,
          quantity: m.parsedItem.quantity || 1,
          cost: 0
        };
      }

      const baseProd = m.product;
      const targetPrice = m.parsedItem.unitPrice;
      const effectiveBase = m.parsedItem.basePrice !== undefined 
        ? m.parsedItem.basePrice 
        : (baseProd?.price || targetPrice);

      return {
        ...(baseProd || {
          id: `custom-item-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          name: m.parsedItem.name,
          sku: m.parsedItem.name,
          description: "",
          price: targetPrice,
          category: "General",
          image_url: "",
          is_active: true,
          cost: 0
        }),
        quantity: m.parsedItem.quantity,
        customPrice: targetPrice,
        basePrice: effectiveBase,
        discountType: m.parsedItem.discountType,
        discountValue: m.parsedItem.discountValue,
        isIncludedInKit: m.parsedItem.isIncludedInKit,
        cost: (baseProd as any)?.cost || 0
      };
    });

    onApplyBudget({
      items: finalItems,
      orderDiscountType: parsedResult.orderDiscountType,
      orderDiscountValue: parsedResult.orderDiscountValue,
      paymentType: parsedResult.paymentType,
      paymentMethodName: parsedResult.paymentMethodName,
      cardInstallments: parsedResult.cardInstallments,
      cardSurcharge: parsedResult.cardSurcharge,
      shippingCost: parsedResult.shippingCost,
      isFreeShipping: parsedResult.isFreeShipping,
      aclaraciones: parsedResult.kitDetailText
    }, importMode);

    onClose();
  };

  const handleReset = () => {
    setInputText("");
    setParsedResult(null);
    setMatches([]);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shadow-2xs">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-black text-slate-900 uppercase tracking-wide">
                Importar Presupuesto de WhatsApp
              </h2>
              <p className="text-[11px] font-medium text-slate-500">
                Interpretá el mensaje enviado al cliente (formato nuevo o anterior) para crear el pedido.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Textarea Input */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1">
                <FileText className="w-3.5 h-3.5 text-brand-500" /> Texto del Presupuesto
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePasteFromClipboard}
                  className="text-xs font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2.5 py-1 rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                  title="Pegar automáticamente desde el portapapeles"
                >
                  <ClipboardPaste className="w-3.5 h-3.5" /> Pegar Portapapeles
                </button>
                {inputText && (
                  <button
                    type="button"
                    onClick={handleReset}
                    className="text-xs font-bold text-slate-400 hover:text-red-500 p-1 transition-colors cursor-pointer"
                    title="Limpiar"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Pegá acá el mensaje completo de WhatsApp...
Ejemplo:
*Zono Construcción y Hogar*
_Presupuesto Detallado_

🔸 1x *Biodigestor Autolimpiante 1000L* a $480.000 (~$564.700~ | *15% OFF*)
🔸 1x *Kit de Instalación* (Incluido en el Kit)
🏷️ *Descuento Combo Biodigestor*: -$45.000
..."
              className="w-full h-32 p-3 text-xs font-mono bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none resize-none leading-relaxed text-slate-800"
            />
            
            <div className="flex items-center justify-between pt-1">
              <p className="text-[10px] text-slate-400">
                💡 Funciona con presupuestos con o sin precios tachados, combos, y cuotas.
              </p>
              <button
                type="button"
                onClick={() => analyzeText()}
                disabled={isAnalyzing || !inputText.trim()}
                className="px-4 py-1.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white rounded-lg text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isAnalyzing ? 'animate-spin' : ''}`} /> Analizar Mensaje
              </button>
            </div>
          </div>

          {/* Parsed Preview */}
          {parsedResult && (
            <div className="space-y-4 pt-3 border-t border-slate-100 animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Package className="w-4 h-4 text-brand-600" /> Artículos Detectados ({matches.length})
                </h3>
                {matches.some(m => !m.product && !m.parsedItem.isDiscountItem) && (
                  <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 text-amber-500" /> Revisar productos no vinculados
                  </span>
                )}
              </div>

              {/* Items List */}
              <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                {matches.map((m, idx) => {
                  const isDisc = m.parsedItem.isDiscountItem || m.parsedItem.unitPrice < 0;
                  const isKit = m.parsedItem.isIncludedInKit || m.parsedItem.unitPrice === 0;

                  return (
                    <div 
                      key={idx}
                      className={`p-2.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2 transition-all ${
                        isDisc
                          ? 'bg-amber-50/50 border-amber-200'
                          : m.product
                          ? 'bg-white border-slate-200'
                          : 'bg-amber-50/30 border-amber-300'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-black bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200">
                            {m.parsedItem.quantity}x
                          </span>
                          <span className="text-xs font-black text-slate-800 truncate">
                            {m.parsedItem.name}
                          </span>
                          {isDisc && (
                            <span className="text-[9.5px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.2 rounded border border-amber-200">
                              Bonificación
                            </span>
                          )}
                          {isKit && (
                            <span className="text-[9.5px] font-bold text-blue-700 bg-blue-100 px-1.5 py-0.2 rounded border border-blue-200">
                              Incluido en Kit
                            </span>
                          )}
                          {m.parsedItem.discountValue && m.parsedItem.discountValue > 0 && (
                            <span className="text-[9.5px] font-black text-amber-600 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                              {m.parsedItem.discountValue}% OFF
                            </span>
                          )}
                        </div>

                        {/* Vinculación con Catálogo */}
                        {!isDisc && (
                          <div className="mt-1 flex items-center gap-1.5 text-[10.5px]">
                            <span className="text-slate-400 font-medium">Catálogo:</span>
                            {m.product ? (
                              <span className="font-bold text-emerald-700 flex items-center gap-0.5">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                {m.product.name}
                              </span>
                            ) : (
                              <div className="flex items-center gap-1">
                                <span className="font-bold text-amber-600">No vinculado exacto:</span>
                                <select
                                  onChange={(e) => handleUpdateMatchedProduct(idx, e.target.value)}
                                  className="text-[10px] font-bold bg-white border border-amber-300 rounded px-1.5 py-0.5 outline-none max-w-[200px]"
                                  defaultValue=""
                                >
                                  <option value="" disabled>Seleccionar producto...</option>
                                  {products.map(p => (
                                    <option key={p.id} value={p.id}>{p.name} (${p.price})</option>
                                  ))}
                                </select>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Precio */}
                      <div className="text-right shrink-0">
                        {isDisc ? (
                          <span className="text-xs font-black text-amber-700">
                            -{formatPrice(Math.abs(m.parsedItem.unitPrice * m.parsedItem.quantity))}
                          </span>
                        ) : isKit ? (
                          <span className="text-xs font-bold text-blue-600">
                            $0
                          </span>
                        ) : (
                          <div>
                            <div className="text-xs font-black text-slate-800">
                              {formatPrice(m.parsedItem.unitPrice * m.parsedItem.quantity)}
                            </div>
                            {m.parsedItem.basePrice && m.parsedItem.basePrice > m.parsedItem.unitPrice && (
                              <div className="text-[10px] text-slate-400 line-through">
                                {formatPrice(m.parsedItem.basePrice * m.parsedItem.quantity)}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Condiciones comerciales detectadas */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                {/* Descuento Global */}
                <div className="space-y-0.5">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1">
                    <Tag className="w-3 h-3 text-amber-500" /> Descuento Global
                  </span>
                  <p className="font-bold text-slate-800">
                    {parsedResult.orderDiscountValue && parsedResult.orderDiscountValue > 0
                      ? `${parsedResult.orderDiscountValue}${parsedResult.orderDiscountType === 'percentage' ? '%' : ' $'}`
                      : 'Ninguno'}
                  </p>
                </div>

                {/* Medio de pago */}
                <div className="space-y-0.5">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1">
                    <CreditCard className="w-3 h-3 text-brand-500" /> Pago
                  </span>
                  <p className="font-bold text-slate-800 capitalize truncate">
                    {parsedResult.paymentMethodName || parsedResult.paymentType}
                    {parsedResult.cardInstallments > 1 ? ` (${parsedResult.cardInstallments} c.)` : ''}
                  </p>
                </div>

                {/* Envío */}
                <div className="space-y-0.5">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1">
                    <Truck className="w-3 h-3 text-blue-500" /> Envío
                  </span>
                  <p className="font-bold text-slate-800">
                    {parsedResult.isFreeShipping ? 'Gratis' : formatPrice(parsedResult.shippingCost)}
                  </p>
                </div>

                {/* Total */}
                <div className="space-y-0.5">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">
                    Total Presupuesto
                  </span>
                  <p className="font-black text-brand-600">
                    {parsedResult.totalAnnounced ? formatPrice(parsedResult.totalAnnounced) : 'Calculado'}
                  </p>
                </div>
              </div>

              {/* Aclaraciones / Notas si existen */}
              {parsedResult.kitDetailText && (
                <div className="bg-amber-50/50 p-2.5 rounded-lg border border-amber-200 text-xs">
                  <span className="font-bold text-amber-900">Aclaración detectada: </span>
                  <span className="text-amber-800 italic">{parsedResult.kitDetailText}</span>
                </div>
              )}

              {/* Modalidad de importación si ya hay items */}
              {currentItemsCount > 0 && (
                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-700">Ya tenés {currentItemsCount} producto(s) en el pedido:</span>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1 cursor-pointer font-medium text-slate-600">
                      <input 
                        type="radio" 
                        name="importMode" 
                        checked={importMode === 'replace'} 
                        onChange={() => setImportMode('replace')}
                      />
                      Reemplazar
                    </label>
                    <label className="flex items-center gap-1 cursor-pointer font-medium text-slate-600">
                      <input 
                        type="radio" 
                        name="importMode" 
                        checked={importMode === 'append'} 
                        onChange={() => setImportMode('append')}
                      />
                      Sumar
                    </label>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 border-t border-slate-100 bg-slate-50/80 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            Cancelar
          </button>

          {parsedResult && matches.length > 0 && (
            <button
              type="button"
              onClick={handleConfirmImport}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" /> Confirmar e Importar al Pedido
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { 
  Calculator, 
  Search, 
  Plus, 
  Trash2, 
  Copy, 
  Check, 
  Download, 
  Building2, 
  Truck, 
  CreditCard, 
  FileText, 
  ShieldCheck, 
  Package, 
  RefreshCw,
  Layers,
  Sliders
} from "lucide-react";
import { formatPrice, cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { defaultQuoteValidity, saveSalesQuote } from "@/lib/salesQuotes";
import { getWholesaleCatalogKind } from "@/lib/visualSelectorConfig";
import { Product, OrderDiscountItem } from "@/types";
import VisualProductSelectorModal, { QuantityInput, VisualOrderItem } from "@/components/vendedores/VisualProductSelectorModal";
import WholesaleClientModal from "@/components/vendedores/WholesaleClientModal";

interface WholesaleProduct {
  id: string;
  name: string;
  category: string;
  family?: string;
  liters?: string;
  isManufactured?: boolean;
  priceList: number; // 3-9 u
  priceCorralon: number; // 10-19 u
  priceDistributor: number; // 20+ u
  isCommercialized: boolean;
}

interface QuoteCartItem {
  id: string; // unique cart row id
  productId: string;
  name: string;
  category: string;
  liters?: string;
  variant: "standard" | "ciego";
  allowsCiego: boolean;
  quantity: number;
  priceList: number;
  priceCorralon: number;
  priceDistributor: number;
  customPrice?: number;
  discountType?: 'percentage' | 'fixed';
  discountValue?: number;
}

interface ClientOption {
  id: string;
  business_name: string;
  tax_id?: string;
  phone_primary?: string;
  billing_address?: string;
  is_wholesale?: boolean;
  default_discount_tier?: "auto" | "list" | "corralon" | "distributor";
  default_discount_coef?: number | null;
  default_discount_label?: string | null;
}

export default function PresupuestosMayoristaPage() {
  const router = useRouter();

  // State: Master Wholesale Catalog from DB
  const [products, setProducts] = useState<WholesaleProduct[]>([]);
  const listNumber = "12";
  const [listDate, setListDate] = useState("Junio 2026");
  const [discountCorralonPct, setDiscountCorralonPct] = useState(8);
  const [discountDistributorPct, setDiscountDistributorPct] = useState(14);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [catalogError, setCatalogError] = useState('');
  const [catalogReloadKey, setCatalogReloadKey] = useState(0);

  // State: Client Selection
  const [selectedClient, setSelectedClient] = useState<ClientOption | null>(null);

  // State: Cart Items
  const [cartItems, setCartItems] = useState<QuoteCartItem[]>([]);

  // State: Order Discounts (Múltiples descuentos en cascada)
  const [orderDiscounts, setOrderDiscounts] = useState<OrderDiscountItem[]>([
    { id: '1', description: 'Otros', type: 'percentage', value: 0 }
  ]);

  // Commercial Controls
  const [freightType, setFreightType] = useState<string>("Flete Incluido (En depósito)");
  const [customFreightAmount, setCustomFreightAmount] = useState<number>(0);
  const [paymentCondition, setPaymentCondition] = useState<string>("Contado / Transferencia contra entrega");
  const [deliveryDays, setDeliveryDays] = useState<string>("48 a 72 hs hábiles");
  const [includeIva, setIncludeIva] = useState<boolean>(false);
  const [notes, setNotes] = useState<string>("");

  // UI status
  const [copiedWhatsapp, setCopiedWhatsapp] = useState(false);
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  const [showProductSelector, setShowProductSelector] = useState(false);
  const [showWholesaleClientModal, setShowWholesaleClientModal] = useState(false);
  const [editingQuoteId, setEditingQuoteId] = useState<string | null>(null);
  const [editingQuoteNumber, setEditingQuoteNumber] = useState<string | null>(null);

  useEffect(() => {
    const quoteId = new URLSearchParams(window.location.search).get('quoteId');
    if (!quoteId) return;
    let cancelled = false;
    async function loadQuote() {
      const { data: quote, error } = await supabase.from('sales_quotes')
        .select('*, sales_quote_items(*)').eq('id', quoteId).single();
      if (cancelled) return;
      if (error || !quote || quote.channel !== 'mayorista') {
        alert('No se pudo abrir el presupuesto mayorista.');
        return;
      }
      if (quote.status === 'converted' || quote.converted_order_id) {
        alert('Este presupuesto ya tiene un pedido asociado y no se puede editar.');
        router.push('/vendedores/cotizaciones?channel=mayorista');
        return;
      }
      const conditions = quote.commercial_conditions || {};
      const savedItems = (quote.sales_quote_items || []).sort((a: any, b: any) => a.sort_order - b.sort_order);
      setEditingQuoteId(quote.id);
      setEditingQuoteNumber(quote.quote_number);
      setSelectedClient({
        id: quote.client_id || '',
        business_name: quote.customer_name || 'Cliente sin nombre',
        phone_primary: quote.customer_phone || undefined,
        is_wholesale: true
      });
      setCartItems(savedItems.map((item: any) => ({
        id: item.id,
        productId: item.product_id || '',
        name: item.product_name,
        category: item.metadata?.category || '',
        liters: item.metadata?.liters,
        variant: item.variant === 'ciego' ? 'ciego' : 'standard',
        allowsCiego: getWholesaleCatalogKind({ name: item.product_name, category: item.metadata?.category || '' }) === 'tank',
        quantity: Number(item.quantity),
        priceList: Number(item.list_unit_price),
        priceCorralon: Number(item.list_unit_price),
        priceDistributor: Number(item.list_unit_price),
        customPrice: !item.metadata?.discountValue && Number(item.unit_price) !== Number(item.list_unit_price)
          ? Number(item.unit_price) : undefined,
        discountType: item.metadata?.discountType,
        discountValue: Number(item.metadata?.discountValue) || undefined
      })));
      const savedDiscounts = conditions.orderDiscounts;
      setOrderDiscounts(Array.isArray(savedDiscounts) && savedDiscounts.length
        ? savedDiscounts
        : Number(quote.discount_amount) > 0
          ? [{ id: 'saved-discount', description: 'Descuento del presupuesto', type: 'fixed', value: Number(quote.discount_amount) }]
          : [{ id: '1', description: 'Otros', type: 'percentage', value: 0 }]);
      setFreightType(conditions.freightType || 'Flete Incluido (En depósito)');
      setCustomFreightAmount(Number(quote.freight_amount) || 0);
      setPaymentCondition(conditions.paymentCondition || 'Contado / Transferencia contra entrega');
      setDeliveryDays(conditions.deliveryDays || '48 a 72 hs hábiles');
      setIncludeIva(Boolean(conditions.includeIva));
      setNotes(quote.notes || '');
    }
    loadQuote();
    return () => { cancelled = true; };
  }, [router]);
  // saved item prices instead of being recalculated from today's costs.
  useEffect(() => {
    async function loadCatalog() {
      try {
        setLoadingCatalog(true);
        setCatalogError('');
        const res = await fetch(`/api/vendedores/wholesale-catalog?listNumber=${encodeURIComponent(listNumber)}`);
        const json = await res.json();
        if (!res.ok || !json.success || !Array.isArray(json.products)) {
          throw new Error(json.error || 'No se pudo cargar la lista mayorista del ERP.');
        }
        if (json.success && json.products) {
          const activeList = json.savedDbConfig;
          if (activeList) {
            if (activeList.listDate) setListDate(activeList.listDate);
            if (activeList.globalDiscountCorralonPct) setDiscountCorralonPct(activeList.globalDiscountCorralonPct);
            if (activeList.globalDiscountDistributorPct) setDiscountDistributorPct(activeList.globalDiscountDistributorPct);
          }

          // Compute prices based on active parameters
          const corrPct = activeList?.globalDiscountCorralonPct ?? 8;
          const distPct = activeList?.globalDiscountDistributorPct ?? 14;

          const prods: WholesaleProduct[] = json.products
            .filter((p: any) =>
              p.defaultCommercialized !== false &&
              p.isCommercialized !== false &&
              getWholesaleCatalogKind(p)
            )
            .map((p: any) => {
              const baseCost = p.costBaseReal || 50000;
              const priceList = json.isPersistedList ? Number(p.priceList || 0) : Math.round(baseCost * 1.35);
              const priceCorralon = json.isPersistedList ? Number(p.priceCorralon || 0) : Math.round(priceList * (1 - corrPct / 100));
              const priceDistributor = json.isPersistedList ? Number(p.priceDistributor || 0) : Math.round(priceList * (1 - distPct / 100));

              return {
                id: p.id,
                name: p.name,
                category: p.category,
                family: p.family,
                liters: p.liters,
                isManufactured: p.isManufactured,
                priceList,
                priceCorralon,
                priceDistributor,
                isCommercialized: true
              };
            });

          setProducts(prods);
        }
      } catch (err) {
        console.error("Error loading wholesale catalog:", err);
        setProducts([]);
        setCatalogError(err instanceof Error ? err.message : 'No se pudo cargar la lista mayorista del ERP.');
      } finally {
        setLoadingCatalog(false);
      }
    }

    loadCatalog();
  }, [listNumber, catalogReloadKey]);

  // Compute Volume Tier and Totals
  const totalTanksCount = useMemo(() => {
    return cartItems.reduce((acc, item) => acc + (item.allowsCiego ? item.quantity : 0), 0);
  }, [cartItems]);

  const activeTier = useMemo(() => {
    if (totalTanksCount >= 30) return "wholesale30";
    if (totalTanksCount >= 20) return "distributor";
    if (totalTanksCount >= 10) return "corralon";
    return "list";
  }, [totalTanksCount]);

  const suggestedVolumeDiscount = useMemo<OrderDiscountItem | undefined>(() => {
    const value = activeTier === 'wholesale30' ? 15
      : activeTier === 'distributor' ? discountDistributorPct
      : activeTier === 'corralon' ? discountCorralonPct : 0;
    return value > 0
      ? { id: 'wholesale-volume-tier', description: `Descuento por volumen (${totalTanksCount} tanques)`, type: 'percentage', value }
      : undefined;
  }, [activeTier, discountCorralonPct, discountDistributorPct, totalTanksCount]);

  const appliedVolumeDiscount = orderDiscounts.find(d => d.id === 'wholesale-volume-tier' && d.value > 0);
  const appliedVolumeLabel = appliedVolumeDiscount
    ? `${appliedVolumeDiscount.value}% aplicado manualmente`
    : 'Precio de lista';

  const applySuggestedVolumeDiscount = () => {
    if (!suggestedVolumeDiscount) return;
    setOrderDiscounts(previous => {
      const index = previous.findIndex(d => d.id === suggestedVolumeDiscount.id);
      if (index < 0) return [...previous, suggestedVolumeDiscount];
      return previous.map((discount, i) => i === index ? suggestedVolumeDiscount : discount);
    });
  };

  // Cart Calculations
  const calculatedItems = useMemo(() => {
    return cartItems.map(item => {
      let unitPrice = item.priceList;
      if (item.customPrice !== undefined && item.customPrice > 0) {
        unitPrice = item.customPrice;
      } else if (item.discountValue && item.discountValue > 0) {
        if (item.discountType === 'percentage') {
          unitPrice = Math.max(0, Math.round(unitPrice * (1 - item.discountValue / 100)));
        } else {
          unitPrice = Math.max(0, unitPrice - item.discountValue);
        }
      }

      const subtotal = unitPrice * item.quantity;
      return {
        ...item,
        effectiveUnitPrice: unitPrice,
        subtotal
      };
    });
  }, [cartItems]);

  const subtotalProducts = useMemo(() => {
    return calculatedItems.reduce((acc, item) => acc + item.subtotal, 0);
  }, [calculatedItems]);

  // Descuentos globales en cascada (20+5 no es 25%, se calculan secuencialmente sobre el saldo remanente)
  const { totalOrderDiscountAmount, orderDiscountBreakdown } = useMemo(() => {
    let rem = subtotalProducts;
    const breakdown = orderDiscounts.map(d => {
      const val = d.value ? Math.max(0, d.value) : 0;
      if (val <= 0 || rem <= 0) return { ...d, amount: 0, balanceBefore: rem, balanceAfter: rem };
      let amt = 0;
      if (d.type === 'percentage') {
        amt = Math.round(rem * (Math.min(100, val) / 100));
      } else {
        amt = Math.min(rem, val);
      }
      const balanceBefore = rem;
      rem = Math.max(0, rem - amt);
      return { ...d, amount: amt, balanceBefore, balanceAfter: rem };
    });
    return {
      totalOrderDiscountAmount: breakdown.reduce((sum, d) => sum + d.amount, 0),
      orderDiscountBreakdown: breakdown
    };
  }, [subtotalProducts, orderDiscounts]);

  const netProductsSubtotal = useMemo(() => {
    return Math.max(0, subtotalProducts - totalOrderDiscountAmount);
  }, [subtotalProducts, totalOrderDiscountAmount]);

  const totalFreight = useMemo(() => {
    return freightType.includes("Incluido") ? 0 : customFreightAmount;
  }, [freightType, customFreightAmount]);

  const ivaAmount = useMemo(() => {
    return includeIva ? Math.round((netProductsSubtotal + totalFreight) * 0.21) : 0;
  }, [includeIva, netProductsSubtotal, totalFreight]);

  const grandTotal = useMemo(() => {
    return netProductsSubtotal + totalFreight + ivaAmount;
  }, [netProductsSubtotal, totalFreight, ivaAmount]);

  const effectiveLeadName = selectedClient?.business_name || '';
  const effectiveLeadContact = selectedClient?.phone_primary || '';
  const hasLeadIdentity = Boolean(selectedClient);

  const visualProducts = useMemo<Product[]>(() => products.flatMap(product => {
    const price = product.priceList;
    const isAlreadyCiego = product.name.toLowerCase().includes('(ciego)') || product.name.toLowerCase().includes('ciego');
    const baseProduct: Product = {
      id: product.id,
      name: product.name,
      description: product.name,
      price,
      image_url: '',
      category: product.category,
      sku: product.name,
      is_active: true,
      variant_type: isAlreadyCiego ? 'ciego' : 'standard'
    };

    if (getWholesaleCatalogKind(product) !== 'tank') return [baseProduct];
    if (isAlreadyCiego) return [baseProduct];

    return [
      baseProduct,
      {
        ...baseProduct,
        id: `${product.id}::ciego`,
        name: `${product.name} (Ciego)`,
        parent_id: product.id,
        variant_type: 'ciego'
      }
    ];
  }), [products]);

  const visualOrderItems = useMemo<VisualOrderItem[]>(() => calculatedItems.map(item => ({
    id: item.id,
    name: `${item.name}${item.allowsCiego && item.variant === 'ciego' && !item.name.toLowerCase().includes('ciego') ? ' (Ciego)' : ''}`,
    description: item.name,
    price: item.effectiveUnitPrice,
    image_url: '',
    category: item.category,
    sku: item.name,
    is_active: true,
    quantity: item.quantity,
    customPrice: item.effectiveUnitPrice,
    basePrice: item.priceList,
    discountType: item.discountType,
    discountValue: item.discountValue,
  })), [calculatedItems]);

  const handleUpdateItemDiscount = (cartItemId: string, discountType: 'percentage' | 'fixed', discountValue: number) => {
    setCartItems(prev => prev.map(item => {
      if (item.id !== cartItemId) return item;
      return {
        ...item,
        discountType,
        discountValue: Math.max(0, discountValue),
        customPrice: undefined
      };
    }));
  };

  // Cart Actions
  const handleAddToCart = (product: WholesaleProduct, variant: "standard" | "ciego" = "standard") => {
    const allowsCiego = getWholesaleCatalogKind(product) === 'tank';
    const effectiveVariant = allowsCiego ? variant : 'standard';
    setCartItems(prev => {
      const existingIdx = prev.findIndex(
        i => i.productId === product.id && i.variant === effectiveVariant
      );
      if (existingIdx >= 0) {
        const copy = [...prev];
        copy[existingIdx].quantity += 1;
        return copy;
      }
      return [
        ...prev,
        {
          id: `${product.id}-${effectiveVariant}-${Date.now()}`,
          productId: product.id,
          name: product.name,
          category: product.category,
          liters: product.liters,
          variant: effectiveVariant,
          allowsCiego,
          quantity: 1,
          priceList: product.priceList,
          priceCorralon: product.priceCorralon,
          priceDistributor: product.priceDistributor
        }
      ];
    });
  };

  const handleAddVisualProduct = (product: Product) => {
    const isCiego = product.variant_type?.toLowerCase() === 'ciego' || product.id.endsWith('::ciego');
    const baseId = product.parent_id || product.id.replace(/::ciego$/, '');
    const wholesaleProduct = products.find(candidate => candidate.id === baseId);
    if (!wholesaleProduct) return;
    handleAddToCart(wholesaleProduct, isCiego ? 'ciego' : 'standard');
  };

  const handleAddVisualProducts = (selectedProducts: Product[]) => {
    selectedProducts.forEach(handleAddVisualProduct);
  };

  const handleUpdateCustomPrice = (cartItemId: string, price: number) => {
    setCartItems(previous => previous.map(item => item.id === cartItemId
      ? { ...item, customPrice: Math.max(0, price) }
      : item));
  };

  const handleUpdateQuantity = (cartItemId: string, newQty: number) => {
    if (newQty <= 0) {
      handleRemoveItem(cartItemId);
      return;
    }
    setCartItems(prev =>
      prev.map(item => (item.id === cartItemId ? { ...item, quantity: newQty } : item))
    );
  };

  const handleToggleVariant = (cartItemId: string) => {
    setCartItems(prev =>
      prev.map(item =>
        item.id === cartItemId && item.allowsCiego
          ? { ...item, variant: item.variant === "standard" ? "ciego" : "standard" }
          : item
      )
    );
  };

  const handleRemoveItem = (cartItemId: string) => {
    setCartItems(prev => prev.filter(item => item.id !== cartItemId));
  };

  const handleClearCart = () => {
    if (confirm("¿Limpiar todo el presupuesto actual?")) {
      setCartItems([]);
    }
  };

  // WhatsApp Quote Text Generation
  const generateWhatsAppMessage = () => {
    const clientName = effectiveLeadName || "Estimado Cliente";
    const dateStr = new Date().toLocaleDateString("es-AR");

    const lines: string[] = [
      `*PRESUPUESTO* 📋`,
      `*AQUAFORT — Soluciones para el agua*`,
      `📅 Fecha: ${dateStr}`,
      `👤 Cliente: *${clientName}*`,
      "",
      `🏷️ *Descuento por volumen:* ${appliedVolumeLabel}`,
      `📦 *Total Unidades:* ${totalTanksCount} tanques`,
      "",
      "--- *DETALLE DEL PRESUPUESTO* ---"
    ];

    calculatedItems.forEach(item => {
      const variantTag = item.allowsCiego && item.variant === "ciego" ? " [CIEGO]" : "";
      lines.push(`• *${item.quantity}x* ${item.name}${variantTag}`);
      lines.push(`   Unit: $${item.effectiveUnitPrice.toLocaleString("es-AR")} | Subtotal: $${item.subtotal.toLocaleString("es-AR")}`);
    });

    lines.push("");
    lines.push(`💰 *SUBTOTAL PRODUCTOS:* $${subtotalProducts.toLocaleString("es-AR")}`);
    orderDiscountBreakdown.filter(d => d.amount > 0).forEach(d => {
      lines.push(`🏷️ *${d.description}* (${d.type === 'percentage' ? `${d.value}%` : `$${d.value.toLocaleString("es-AR")}`}): -$${d.amount.toLocaleString("es-AR")}`);
    });
    if (totalOrderDiscountAmount > 0) {
      lines.push(`💵 *Subtotal c/ Descuento:* $${netProductsSubtotal.toLocaleString("es-AR")}`);
    }
    if (totalFreight > 0) {
      lines.push(`🚚 *Flete:* $${totalFreight.toLocaleString("es-AR")}`);
    } else {
      lines.push(`🚚 *Logística:* Flete Incluido`);
    }

    if (includeIva) {
      lines.push(`🏛️ *IVA (21%):* $${ivaAmount.toLocaleString("es-AR")}`);
    }

    lines.push(`⭐ *TOTAL FINAL:* $${grandTotal.toLocaleString("es-AR")}`);
    lines.push("");
    lines.push(`💳 *Forma de Pago:* ${paymentCondition}`);
    lines.push(`⏱️ *Plazo de Entrega:* ${deliveryDays}`);
    if (notes) lines.push(`📝 *Observaciones:* ${notes}`);
    lines.push("");
    lines.push("Presupuesto válido por 5 días hábiles sujeto a disponibilidad de stock.");

    return lines.join("\n");
  };

  const handleCopyWhatsApp = () => {
    if (cartItems.length === 0) {
      alert("Agregá al menos un producto al presupuesto");
      return;
    }
    const text = generateWhatsAppMessage();
    navigator.clipboard.writeText(text);
    setCopiedWhatsapp(true);
    setTimeout(() => setCopiedWhatsapp(false), 2500);
  };

  // PDF Quote Generation
  const handleExportPDF = () => {
    if (cartItems.length === 0) {
      alert("Agregá al menos un producto al presupuesto");
      return;
    }

    const doc = new jsPDF();
    const clientName = effectiveLeadName || "Cliente";

    // Header Branding
    doc.setFillColor(0, 21, 56);
    doc.rect(0, 0, 210, 32, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("AQUAFORT", 14, 13);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text("Soluciones para el agua", 14, 20);
    doc.text(`Lista N° ${listNumber} (${listDate})`, 14, 26);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("PRESUPUESTO", 196, 15, { align: "right" });
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`Fecha: ${new Date().toLocaleDateString("es-AR")}`, 196, 22, { align: "right" });
    doc.text(`Volumen: ${appliedVolumeLabel}`, 196, 28, { align: "right" });

    // Client Info Box
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(14, 38, 182, 22, 2, 2, "F");
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(14, 38, 182, 22, 2, 2, "S");

    doc.setTextColor(15, 23, 42);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text(`CLIENTE: ${clientName}`, 18, 45);
    doc.setFont("helvetica", "normal");
    doc.text(`CUIT: ${selectedClient?.tax_id || "No informado"}`, 18, 51);
    doc.text(`Contacto: ${effectiveLeadContact || "No informado"}`, 18, 56);

    doc.text(`Entrega: ${deliveryDays}`, 115, 45);

    // Items Table
    const tableBody = calculatedItems.map(item => [
      item.quantity.toString(),
      `${item.name}${item.allowsCiego ? (item.variant === "ciego" ? " (CIEGO)" : " (Estándar)") : ""}`,
      item.category,
      `$${item.effectiveUnitPrice.toLocaleString("es-AR")}`,
      `$${item.subtotal.toLocaleString("es-AR")}`
    ]);

    autoTable(doc, {
      startY: 66,
      head: [["Cant.", "Producto / Modelo", "Categoría", "Precio Unit.", "Subtotal"]],
      body: tableBody,
      theme: "striped",
      headStyles: {
        fillColor: [0, 21, 56],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 8.5,
        halign: "center"
      },
      columnStyles: {
        0: { halign: "center", fontStyle: "bold", cellWidth: 16 },
        1: { halign: "left", fontStyle: "bold", cellWidth: 86 },
        2: { halign: "left", fontStyle: "normal", cellWidth: 32 },
        3: { halign: "right", fontStyle: "normal", cellWidth: 24 },
        4: { halign: "right", fontStyle: "bold", textColor: [0, 105, 255], cellWidth: 24 }
      },
      styles: {
        fontSize: 8,
        cellPadding: 2.5
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252]
      },
      margin: { left: 14, right: 14 }
    });

    // Totals Table & Commercial notes
    const finalY = (doc as any).lastAutoTable.finalY + 6;

    const appliedDiscounts = orderDiscountBreakdown.filter(d => d.amount > 0);
    const boxHeight = 28 + (appliedDiscounts.length * 5) + (totalOrderDiscountAmount > 0 ? 5 : 0);

    doc.setFillColor(241, 245, 249);
    doc.roundedRect(120, finalY, 76, boxHeight, 2, 2, "F");

    let currY = finalY + 7;
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text(`Subtotal Productos (${totalTanksCount} u):`, 124, currY);
    doc.text(`$${subtotalProducts.toLocaleString("es-AR")}`, 192, currY, { align: "right" });

    appliedDiscounts.forEach(d => {
      currY += 5;
      doc.setTextColor(180, 83, 9);
      doc.text(`${d.description} (${d.type === 'percentage' ? `${d.value}%` : '$'}):`, 124, currY);
      doc.text(`-$${d.amount.toLocaleString("es-AR")}`, 192, currY, { align: "right" });
    });

    if (totalOrderDiscountAmount > 0) {
      currY += 5;
      doc.setTextColor(71, 85, 105);
      doc.text(`Subtotal c/ Descuento:`, 124, currY);
      doc.text(`$${netProductsSubtotal.toLocaleString("es-AR")}`, 192, currY, { align: "right" });
    }

    currY += 6;
    doc.setTextColor(71, 85, 105);
    doc.text("Logística / Flete:", 124, currY);
    doc.text(totalFreight > 0 ? `$${totalFreight.toLocaleString("es-AR")}` : "Incluido", 192, currY, { align: "right" });

    if (includeIva) {
      currY += 6;
      doc.text("IVA (21%):", 124, currY);
      doc.text(`$${ivaAmount.toLocaleString("es-AR")}`, 192, currY, { align: "right" });
    }

    currY += 6;
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 21, 56);
    doc.text("TOTAL FINAL:", 124, currY);
    doc.text(`$${grandTotal.toLocaleString("es-AR")}`, 192, currY, { align: "right" });

    // Notes
    if (notes) {
      doc.setFontSize(8);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(100, 116, 139);
      doc.text(`Obs: ${notes}`, 14, finalY + 10);
    }

    doc.save(`Presupuesto_AquaFort_${clientName.replace(/\s+/g, "_")}_Lista${listNumber}.pdf`);
  };

  const buildWholesaleQuote = () => ({
    channel: 'mayorista' as const,
    clientId: selectedClient?.id || null,
    customerName: effectiveLeadName,
    customerPhone: effectiveLeadContact,
    subtotal: subtotalProducts,
    discountType: totalOrderDiscountAmount > 0 ? 'fixed' as const : null,
    discountValue: totalOrderDiscountAmount,
    discountAmount: totalOrderDiscountAmount,
    freightAmount: totalFreight,
    taxAmount: ivaAmount,
    totalAmount: grandTotal,
    commercialConditions: {
      listNumber,
      listDate,
      tier: appliedVolumeDiscount ? 'manual_volume' : 'list',
      tierLabel: appliedVolumeLabel,
      freightType,
      paymentCondition,
      deliveryDays,
      includeIva,
      source: 'cotizador_mayorista',
      orderDiscounts: orderDiscounts.filter(d => d.value > 0),
      orderDiscountAmount: totalOrderDiscountAmount
    },
    notes,
    validUntil: defaultQuoteValidity(),
    status: 'draft' as const,
    items: calculatedItems.map(item => ({
      productId: item.productId,
      productName: item.name,
      variant: item.variant,
      quantity: item.quantity,
      listUnitPrice: item.priceList,
      unitPrice: item.effectiveUnitPrice,
      discountPercentage: item.priceList > 0
        ? Math.round((1 - item.effectiveUnitPrice / item.priceList) * 10000) / 100
        : 0,
      subtotal: item.subtotal,
      metadata: { category: item.category, liters: item.liters, discountType: item.discountType, discountValue: item.discountValue }
    }))
  });

  const handleSaveWholesaleQuote = async () => {
    if (!cartItems.length || !hasLeadIdentity) {
      alert('Agregá productos y seleccioná un cliente mayorista.');
      return;
    }
    try {
      setIsCreatingOrder(true);
      const quote = await saveSalesQuote(buildWholesaleQuote(), editingQuoteId || undefined);
      setEditingQuoteId(quote.id);
      setEditingQuoteNumber(quote.quote_number);
      router.replace(`/vendedores/presupuestos-mayorista?quoteId=${quote.id}`);
      alert(`Presupuesto ${quote.quote_number} guardado.`);
    } catch (error: any) {
      alert(`No se pudo guardar el presupuesto: ${error.message || error}`);
    } finally {
      setIsCreatingOrder(false);
    }
  };

  // La conversión usa el formulario normal de pedidos para completar entrega,
  // procedencia y pagos antes de activar planillas, stock y Telegram.
  const handleCreateWholesaleOrder = async () => {
    if (cartItems.length === 0) {
      alert("Agregá productos al presupuesto antes de confirmar el pedido.");
      return;
    }
    if (!hasLeadIdentity) {
      alert("Seleccioná un cliente mayorista antes de continuar.");
      return;
    }

    try {
      setIsCreatingOrder(true);
      const quote = await saveSalesQuote(buildWholesaleQuote(), editingQuoteId || undefined);
      sessionStorage.setItem('preloaded_budget', JSON.stringify({
        quoteId: quote.id,
        quoteNumber: quote.quote_number,
        channel: 'mayorista',
        clientId: selectedClient?.id || null,
        customerName: effectiveLeadName,
        customerPhone: effectiveLeadContact,
        orderDiscounts: orderDiscounts.filter(d => d.value > 0),
        orderDiscountType: 'fixed',
        orderDiscountValue: totalOrderDiscountAmount,
        notes: `[Presupuesto ${quote.quote_number} · Lista ${listNumber}] ${notes}`.trim(),
        items: calculatedItems.map(item => ({
          id: item.productId,
          name: `${item.name}${item.allowsCiego ? (item.variant === 'ciego' ? ' (CIEGO)' : ' (Estándar)') : ''}`,
          sku: item.name,
          quantity: item.quantity,
          customPrice: item.effectiveUnitPrice,
          basePrice: item.priceList,
          discountType: item.discountType || 'percentage',
          discountValue: item.discountValue !== undefined ? item.discountValue : (item.priceList > 0 ? Math.round((1 - item.effectiveUnitPrice / item.priceList) * 10000) / 100 : 0)
        }))
      }));
      router.push('/vendedores/pedidos?tab=form&client_type=mayoristas');
    } catch (err: any) {
      alert("Error al preparar el pedido: " + (err.message || "Error desconocido"));
    } finally {
      setIsCreatingOrder(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-3 pb-24">
      <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shadow-xs shrink-0">
            <Calculator className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-black text-slate-900 tracking-tight">
                Cotizador & Presupuestos Mayoristas
              </h1>
              <span className="bg-blue-600 text-white px-2.5 py-0.5 rounded-full text-xs font-black">
                Lista {listNumber}
              </span>
              <span className="text-xs text-slate-500 font-bold">
                ({listDate})
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Armá cotizaciones por volumen para Corralones y Distribuidores. Las variantes estándar/ciego se aplican únicamente a tanques y cisternas.
            </p>
          </div>
        </div>

        {/* Top Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-100 rounded-xl text-xs font-black text-blue-800">
            Lista 12 vigente · descuentos por volumen: 5% / 10% / 15%
          </span>
          <Link
            href={`/admin/lista-mayorista?listNumber=${listNumber}`}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Configurar Lista {listNumber}</span>
          </Link>
          <Link
            href="/vendedores/pedidos?tab=list&list_type=todos&status=Todos&client_type=mayoristas"
            className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
          >
            <Package className="w-3.5 h-3.5" />
            <span>Ver Pedidos Mayoristas</span>
          </Link>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          {/* 1. Client Card */}
          <div className="bg-slate-50/90 p-4 rounded-xl border border-slate-200/95 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-emerald-600" />
                <h2 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                  Cuenta del Cliente
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowWholesaleClientModal(true)}
                className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[9px] font-black text-emerald-700 transition hover:bg-emerald-100"
              >
                <Search className="h-3 w-3" /> {selectedClient ? "Cambiar mayorista" : "Buscar / crear"}
              </button>
            </div>
            {selectedClient ? (
              <div className="rounded-lg border border-emerald-100 bg-emerald-50/70 p-2.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-black text-slate-900">{selectedClient.business_name}</span>
                  <button type="button" onClick={() => setSelectedClient(null)} className="text-[9px] font-bold text-slate-500 hover:text-red-600">Limpiar</button>
                </div>
                <p className="mt-0.5 text-[10px] text-slate-500">CUIT: {selectedClient.tax_id || "S/D"} · Tel: {selectedClient.phone_primary || "S/D"}</p>
                {selectedClient.billing_address && <p className="mt-0.5 text-[10px] text-slate-500">{selectedClient.billing_address}</p>}
              </div>
            ) : (
              <button type="button" onClick={() => setShowWholesaleClientModal(true)} className="w-full rounded-xl border-2 border-dashed border-emerald-200 bg-emerald-50/60 px-3 py-4 text-center text-xs font-black text-slate-800 transition hover:border-emerald-400 hover:bg-emerald-50">
                Seleccionar cliente mayorista
                <span className="mt-1 block text-[10px] font-semibold text-slate-500">Buscá por razón social, CUIT, teléfono o código; también podés crear uno nuevo.</span>
              </button>
            )}
          </div>

        </div>

        <div className="space-y-3">
          {/* Cart Items Detail */}
          <div className="bg-slate-50/90 p-3 sm:p-4 rounded-xl border border-slate-200/95 space-y-3">
            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                <div className="flex items-center gap-2">
                  <h2 className="flex items-center gap-1.5 font-black text-slate-800 text-xs uppercase tracking-wider">
                    <Package className="w-4 h-4 text-blue-600" /> Detalle del presupuesto
                  </h2>
                  <span className="text-[10px] font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full border border-slate-200">
                    {cartItems.length} {cartItems.length === 1 ? 'artículo' : 'artículos'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setShowProductSelector(true)} disabled={loadingCatalog || products.length === 0} className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-[10.5px] font-black uppercase tracking-wider flex items-center gap-1 border border-blue-200 disabled:opacity-50">
                    <Plus className="w-3 h-3" /> {cartItems.length ? 'Modificar' : 'Agregar productos'}
                  </button>
                  {cartItems.length > 0 && <button type="button" onClick={handleClearCart} className="p-1 text-slate-400 hover:text-red-600" title="Vaciar presupuesto"><Trash2 className="w-3.5 h-3.5" /></button>}
                </div>
              </div>
              {catalogError && (
                <div className="flex items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 p-2 text-[11px] font-bold text-red-700">
                  <span>{catalogError}</span>
                  <button type="button" onClick={() => setCatalogReloadKey(key => key + 1)} className="shrink-0 rounded bg-white px-2 py-1">Reintentar</button>
                </div>
              )}

            {cartItems.length === 0 ? (
              <button type="button" onClick={() => setShowProductSelector(true)} disabled={loadingCatalog || products.length === 0} className="w-full rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/50 px-3 py-6 text-center text-xs font-bold text-slate-600 hover:border-blue-400 hover:bg-blue-50/40 disabled:opacity-50">
                {loadingCatalog ? 'Cargando Lista 12...' : 'Seleccionar productos para el presupuesto'}
              </button>
            ) : (
              <div className="space-y-1.5 max-h-[380px] overflow-y-auto pr-1">
                {calculatedItems.map(item => (
                  <div
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-1.5">
                      <span className="truncate text-xs font-bold text-slate-800" title={item.name}>{item.name}</span>
                      {item.allowsCiego && <button type="button" onClick={() => handleToggleVariant(item.id)} className={cn('shrink-0 rounded border px-1.5 py-0.5 text-[8px] font-black', item.variant === 'ciego' ? 'border-amber-300 bg-amber-100 text-amber-800' : 'border-slate-200 bg-slate-100 text-slate-600')}>{item.variant === 'ciego' ? 'Ciego' : 'Estándar'}</button>}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <div className="flex h-7 items-center overflow-hidden rounded-md border border-slate-200 bg-slate-100">
                        <button type="button" onClick={() => handleUpdateQuantity(item.id, item.quantity - 1)} className="h-full px-1.5 text-xs font-black text-slate-500 hover:bg-slate-200">−</button>
                        <QuantityInput value={item.quantity} onChange={quantity => handleUpdateQuantity(item.id, quantity)} />
                        <button type="button" onClick={() => handleUpdateQuantity(item.id, item.quantity + 1)} className="h-full px-1.5 text-xs font-black text-slate-500 hover:bg-slate-200">+</button>
                      </div>
                      <div className="flex h-7 items-center rounded-md border border-slate-200 bg-slate-50 px-1.5">
                        <span className="mr-0.5 text-[10px] text-slate-400">$</span>
                        <input type="number" min={0} value={item.effectiveUnitPrice} onChange={event => handleUpdateCustomPrice(item.id, Number(event.target.value))} className="w-20 bg-transparent text-right text-xs font-bold text-slate-800 outline-none" aria-label={`Precio de ${item.name}`} />
                      </div>
                      <span className="min-w-20 text-right text-xs font-black text-slate-900">${item.subtotal.toLocaleString('es-AR')}</span>
                      <button type="button" onClick={() => handleRemoveItem(item.id)} className="p-1 text-slate-400 hover:text-red-600" aria-label={`Quitar ${item.name}`}><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2">
                <button type="button" onClick={() => setShowProductSelector(true)} disabled={loadingCatalog || products.length === 0} className="flex items-center gap-1 text-[11px] font-bold text-blue-700 hover:text-blue-900 disabled:opacity-50"><Plus className="w-3 h-3" /> Agregar más productos</button>
                <span className="text-[10px] font-black uppercase text-slate-500">Subtotal artículos: <strong className="ml-1 text-sm text-slate-900">${subtotalProducts.toLocaleString('es-AR')}</strong></span>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs space-y-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-slate-800">Descuentos del presupuesto</h3>
                <button type="button" onClick={() => setShowProductSelector(true)} className="text-[10px] font-bold text-blue-700 hover:text-blue-900">Modificar</button>
              </div>
              {suggestedVolumeDiscount && !orderDiscounts.some(discount => discount.id === suggestedVolumeDiscount.id && discount.value === suggestedVolumeDiscount.value) && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] font-bold text-amber-800">
                  <span>Sugerencia: {suggestedVolumeDiscount.value}% por volumen ({totalTanksCount} tanques)</span>
                  <button type="button" onClick={applySuggestedVolumeDiscount} className="rounded-md bg-amber-500 px-2 py-1 text-white hover:bg-amber-600">Aplicar descuento</button>
                </div>
              )}
              {orderDiscountBreakdown.filter(discount => discount.amount > 0).map(discount => (
                <div key={discount.id} className="flex items-center justify-between gap-2 text-[11px] text-slate-600">
                  <span>{discount.description} ({discount.type === 'percentage' ? `${discount.value}%` : `$${discount.value.toLocaleString('es-AR')}`})</span>
                  <span className="font-black text-amber-700">−${discount.amount.toLocaleString('es-AR')}</span>
                </div>
              ))}
              {totalOrderDiscountAmount === 0 && <p className="text-[10px] text-slate-400">Sin descuentos aplicados.</p>}
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-700">Costo de flete</span>
                <select
                  value={freightType}
                  onChange={(e) => setFreightType(e.target.value)}
                  className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-medium outline-none"
                >
                  <option value="Flete Incluido (En depósito)">Flete Incluido</option>
                  <option value="Retiro en Fábrica Zono">Retiro en Fábrica</option>
                  <option value="Flete Especial">Flete Especial ($)</option>
                </select>
              </div>

              {freightType === "Flete Especial" && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Monto Flete ($):</span>
                  <input
                    type="number"
                    value={customFreightAmount}
                    onChange={(e) => setCustomFreightAmount(parseFloat(e.target.value) || 0)}
                    className="w-28 bg-white border border-slate-200 rounded-lg px-2 py-1 text-right font-bold text-xs outline-none"
                  />
                </div>
              )}

              <div className="flex items-center justify-between border-t border-slate-100 pt-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-700">Condición de pago</span>
                <select
                  value={paymentCondition}
                  onChange={(e) => setPaymentCondition(e.target.value)}
                  className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-medium outline-none"
                >
                  <option value="Contado / Transferencia contra entrega">Contado / Transf.</option>
                  <option value="Cuenta Corriente (30 días)">Cta Cte (30 días)</option>
                  <option value="Valores / Cheques (30/60 días)">Valores / Cheques</option>
                  <option value="Anticipo 50% + Saldo contra entrega">50% Ant. + Saldo</option>
                </select>
              </div>

              <label className="flex items-center justify-between border-t border-slate-100 pt-2 cursor-pointer">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-700">Factura con IVA (+21%)</span>
                <input type="checkbox" checked={includeIva} onChange={event => setIncludeIva(event.target.checked)} className="h-4 w-4 accent-blue-600" />
              </label>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs space-y-1.5">
              <div className="flex justify-between text-xs text-slate-600">
                <span>Subtotal ({cartItems.reduce((sum, item) => sum + item.quantity, 0)} unidades):</span>
                <span>${subtotalProducts.toLocaleString("es-AR")}</span>
              </div>
              {orderDiscountBreakdown.filter(d => d.amount > 0).map((d, i) => (
                <div key={d.id || i} className="flex justify-between text-xs text-amber-700">
                  <span>{d.description} ({d.type === 'percentage' ? `${d.value}%` : `$${d.value.toLocaleString("es-AR")}`}):</span>
                  <span>-${d.amount.toLocaleString("es-AR")}</span>
                </div>
              ))}
              {totalOrderDiscountAmount > 0 && (
                <div className="flex justify-between text-xs font-bold text-slate-700 pt-1 border-t border-slate-100">
                  <span>Subtotal c/ Descuento:</span>
                  <span>${netProductsSubtotal.toLocaleString("es-AR")}</span>
                </div>
              )}
              {totalFreight > 0 && (
                <div className="flex justify-between text-xs text-slate-600">
                  <span>Flete:</span>
                  <span>${totalFreight.toLocaleString("es-AR")}</span>
                </div>
              )}
              {includeIva && (
                <div className="flex justify-between text-xs text-slate-600">
                  <span>IVA (21%):</span>
                  <span>${ivaAmount.toLocaleString("es-AR")}</span>
                </div>
              )}
              <div className="flex justify-between items-baseline pt-2 border-t border-slate-200">
                <span className="font-black text-sm text-slate-800">TOTAL PRESUPUESTO:</span>
                <span className="font-black text-xl text-slate-900 font-mono">
                  ${grandTotal.toLocaleString("es-AR")}
                </span>
              </div>
            </div>

            {/* Action Buttons: WhatsApp, PDF, Confirmar Pedido */}
            <div className="space-y-2 pt-2">
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={handleCopyWhatsApp}
                  className="py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
                >
                  {copiedWhatsapp ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  <span>{copiedWhatsapp ? "¡Copiado!" : "Copiar WhatsApp"}</span>
                </button>

                <button
                  onClick={handleExportPDF}
                  className="py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Descargar PDF</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  onClick={handleSaveWholesaleQuote}
                  disabled={isCreatingOrder || cartItems.length === 0 || !hasLeadIdentity}
                  className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-2xl text-xs font-black transition-all flex items-center justify-center gap-2 shadow-md shadow-emerald-600/20 cursor-pointer"
                >
                  <FileText className="w-4 h-4" />
                  <span>{isCreatingOrder ? "Guardando..." : "Guardar Presupuesto"}</span>
                </button>
                <button
                  onClick={handleCreateWholesaleOrder}
                  disabled={isCreatingOrder || cartItems.length === 0 || !hasLeadIdentity}
                  className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-2xl text-xs font-black transition-all flex items-center justify-center gap-2 shadow-md shadow-blue-600/20 cursor-pointer"
                >
                  {isCreatingOrder ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Package className="w-4 h-4" />}
                  <span>{isCreatingOrder ? "Preparando..." : "Convertir en Pedido"}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <VisualProductSelectorModal
        isOpen={showProductSelector}
        onClose={() => setShowProductSelector(false)}
        products={visualProducts}
        orderItems={visualOrderItems}
        onAddProduct={handleAddVisualProduct}
        onAddProducts={handleAddVisualProducts}
        onUpdateQuantity={handleUpdateQuantity}
        onUpdateCustomPrice={handleUpdateCustomPrice}
        onUpdateItemDiscount={handleUpdateItemDiscount}
        orderDiscounts={orderDiscounts}
        suggestedOrderDiscount={suggestedVolumeDiscount}
        onApplySuggestedOrderDiscount={applySuggestedVolumeDiscount}
        onUpdateOrderDiscounts={setOrderDiscounts}
        onRemoveItem={handleRemoveItem}
        onClearOrderItems={() => setCartItems([])}
        isAdmin={true}
        isWholesaleContext={true}
        context="presupuesto"
      />

      <WholesaleClientModal
        open={showWholesaleClientModal}
        selectedClientId={selectedClient?.id}
        onClose={() => setShowWholesaleClientModal(false)}
        onSelect={client => {
          setSelectedClient({
            id: client.id,
            business_name: client.business_name,
            tax_id: client.tax_id || undefined,
            phone_primary: client.phone_primary,
            billing_address: client.billing_address || undefined,
            is_wholesale: true,
            default_discount_coef: client.default_discount_coef,
            default_discount_label: client.default_discount_label
          });
          const coefficient = Number(client.default_discount_coef);
          if (Number.isFinite(coefficient) && coefficient >= 0 && coefficient < 1) {
            const discountPct = Math.round((1 - coefficient) * 10000) / 100;
            setOrderDiscounts(previous => [{
              id: previous[0]?.id || '1',
              description: client.default_discount_label || `Descuento mayorista ${discountPct}%`,
              type: 'percentage',
              value: discountPct
            }, ...previous.slice(1)]);
          }
        }}
      />

    </div>
  );
}

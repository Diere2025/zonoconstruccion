"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Product, PaymentMethod } from "@/types";
import { Search, Plus, Trash2, Copy, Check, Calculator, ArrowRight, Save, Package, Globe, Edit2, ShoppingBag, Download } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn, formatPrice } from "@/lib/utils";

interface QuoteItem extends Product {
  quantity: number;
  customPrice: number;
  cost?: number;
}

interface Kit {
  id: string;
  name: string;
  items: QuoteItem[];
  detailText: string;
  category: string;
  isGlobal: boolean;
  sellerId: string;
}

const KIT_CATEGORIES = [
  "Tanques de Agua",
  "Pinturas",
  "Biodigestores",
  "Instalaciones de biodigestores",
  "Otros"
];

const PAINT_MAP: Record<string, string> = {
  // Techos (20Kg -> 10Kg)
  "54b4ba52-0dda-4201-8c48-54f4913fbe9f": "ec184d22-847d-4e7a-8d86-632ca87a34de", // Beige
  "d319edef-c63a-4b1d-b33c-3f4858f865f4": "79950648-6075-41de-9741-2a01921f8e10", // Blanco
  "6e2f5179-ed92-4f77-ac9d-89f0e2778aa7": "962593d8-ae5a-4d82-89c9-e10db6e05fd0", // Gris
  "03e4aba4-dda5-411a-9751-85b7059b3cf3": "5662b1fe-6df2-46b6-94af-2bcbf11e3d07", // Rojo
  "136bdacb-c24c-4631-83a9-fc4dd90c714b": "23c65f06-e3bd-42f6-83a2-4be43eb486cd", // Verde
  // Frentes (20Kg -> 10Kg)
  "5ded3152-6171-47fc-a5a7-51e4887765c0": "5e66d6a2-a607-4de0-b7bc-21d1e1fcf331", // Blanco
  "52e6f9e0-0b2c-47b0-a066-dde152133700": "c3e840dc-c854-422f-a64d-77c34f9eed45", // Beige
  "f6cc821e-b3fa-4832-88d1-14bd6a83c676": "02a99cb7-07db-4c18-a431-2b9e25cca7f4", // Gris
  "f1209a4b-6b24-4209-906a-83c1c4b3a431": "5129354e-b8db-4717-954b-cc68c99aecd5", // Rojo
  "f7b091d4-dc5f-426a-aee6-e8086235f087": "f12a005c-2de4-47d3-93d2-db70a356c9bf"  // Verde
};

const EXCLUDED_IDS = [
  "c40fbee8-e216-4822-bf6d-5265e75cf30b",
  "c436969c-b49c-420a-b7e1-683ca037e857",
  "84d167b0-16e2-45b3-9ddc-f3955438d040",
  "e220bf90-ab0d-4f94-aa1e-cc802018d231",
  "15d8d2aa-8feb-4b73-91b2-64557e210f50",
  "adfebc13-cfb2-498d-8979-1da1a4f66a88",
  "da5f1a12-1755-4d9d-b78e-73878ccef704",
  "cfc521fe-d091-48f9-949f-6ab98579cbcf",
  ...Object.values(PAINT_MAP)
];

const normalizeForMatching = (text: string): string => {
  if (!text) return "";
  return text
    .toString()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
};

const parsePrice = (val: string | number): number => {
  if (!val) return 0;
  let clean = val.toString().trim().replace(/[^0-9.,-]/g, '');
  if (!clean) return 0;
  
  const hasComma = clean.includes(',');
  const hasDot = clean.includes('.');
  
  if (hasComma && hasDot) {
    clean = clean.replace(/\./g, '').replace(/,/g, '.');
  } else if (hasComma) {
    clean = clean.replace(/,/g, '.');
  } else if (hasDot) {
    clean = clean.replace(/\./g, '');
  }
  
  const parsed = parseFloat(clean);
  return isNaN(parsed) ? 0 : parsed;
};

interface ParsedBudgetItem {
  name: string;
  quantity: number;
  price: number;
}

interface ParsedBudget {
  items: ParsedBudgetItem[];
  isFreeShipping: boolean;
  shippingCost: number;
  paymentType: 'efectivo' | 'tarjeta';
  cardInstallments: number;
  cardSurcharge: number;
  includeIVA: boolean;
  kitDetailText: string;
}

const parseWhatsAppBudget = (text: string): ParsedBudget => {
  const lines = text.split('\n');
  const items: ParsedBudgetItem[] = [];
  let isFreeShipping = true;
  let shippingCost = 0;
  let paymentType: 'efectivo' | 'tarjeta' = 'efectivo';
  let cardInstallments = 1;
  let cardSurcharge = 34;
  let includeIVA = false;
  let kitDetailText = '';

  const itemRegex = /(?:🔸|•|\*|-)?\s*(\d+)\s*[xX]\s*\*([^*]+)\*\s*a\s*\$?\s*([\d.,]+)/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const itemMatch = line.match(itemRegex);
    if (itemMatch) {
      const quantity = parseInt(itemMatch[1], 10);
      const productName = itemMatch[2].trim();
      const unitPrice = parsePrice(itemMatch[3]);
      items.push({
        name: productName,
        quantity,
        price: unitPrice
      });
      continue;
    }

    if (line.toLowerCase().includes('*envio:*') || line.toLowerCase().includes('*envío:*')) {
      if (line.toLowerCase().includes('gratis')) {
        isFreeShipping = true;
        shippingCost = 0;
      } else {
        isFreeShipping = false;
        const match = line.match(/\$?([\d.,]+)/);
        if (match) {
          shippingCost = parsePrice(match[1]);
        }
      }
    }

    if (line.toLowerCase().includes('*medio de pago:*')) {
      if (line.toLowerCase().includes('tarjeta')) {
        paymentType = 'tarjeta';
      } else {
        paymentType = 'efectivo';
      }

      const installmentsMatch = line.match(/(\d+)\s*cuotas/i);
      if (installmentsMatch) {
        cardInstallments = parseInt(installmentsMatch[1], 10);
      }
    }

    if (line.toLowerCase().includes('*recargo por pago en cuotas:*') || line.toLowerCase().includes('*recargo:*')) {
      const percentMatch = line.match(/\((\d+)%\)/);
      if (percentMatch) {
        cardSurcharge = parseInt(percentMatch[1], 10);
      }
    }

    if (line.toLowerCase().includes('*iva (21%):*') || line.toLowerCase().includes('*iva:*')) {
      includeIVA = true;
    }

    if (line.toLowerCase().includes('*aclaracion:*') || line.toLowerCase().includes('*aclaración:*')) {
      const match = line.match(/\*aclaraci[oó]n:\*\s*(.*)/i);
      if (match) {
        kitDetailText = match[1].trim();
      }
    }
  }

  const textLower = text.toLowerCase();
  if (paymentType === 'tarjeta' && cardInstallments === 1) {
    const cuotasMatch = textLower.match(/(\d+)\s*cuotas\s*fijas/);
    if (cuotasMatch) {
      cardInstallments = parseInt(cuotasMatch[1], 10);
    }
  }

  return {
    items,
    isFreeShipping,
    shippingCost,
    paymentType,
    cardInstallments,
    cardSurcharge,
    includeIVA,
    kitDetailText
  };
};

export default function PresupuestosPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [quoteItems, setQuoteItems] = useState<QuoteItem[]>([]);
  const [usageCounts, setUsageCounts] = useState<Record<string, number>>({});
  
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [savedKits, setSavedKits] = useState<Kit[]>([]);
  const [kitDetailText, setKitDetailText] = useState("");
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>("");
  const [adminSellerFilter, setAdminSellerFilter] = useState<string>("mis_kits");
  const [selectedKitId, setSelectedKitId] = useState<string>("");
  
  const [showSaveKitModal, setShowSaveKitModal] = useState(false);
  const [newKitName, setNewKitName] = useState("");
  const [newKitDetail, setNewKitDetail] = useState("");
  const [newKitCategory, setNewKitCategory] = useState("Otros");
  const [newKitGlobal, setNewKitGlobal] = useState(false);
  
  const [showEditNameModal, setShowEditNameModal] = useState(false);
  const [editKitId, setEditKitId] = useState("");
  const [editKitNameValue, setEditKitNameValue] = useState("");
  
  const [paymentType, setPaymentType] = useState<'efectivo' | 'tarjeta'>('efectivo');
  const [cardInstallments, setCardInstallments] = useState<number>(6);
  const [cardSurcharge, setCardSurcharge] = useState<number>(34);

  const selectedPaymentMethod = paymentType === 'efectivo' 
    ? { id: "1", name: "Efectivo / Transferencia", surcharge_percentage: 0, installments: 1, is_active: true }
    : { id: "2", name: cardInstallments === 1 ? "Tarjeta de Crédito (1 Pago)" : `Tarjeta de Crédito (${cardInstallments} Cuotas)`, surcharge_percentage: cardSurcharge, installments: cardInstallments, is_active: true };
  
  const [isFreeShipping, setIsFreeShipping] = useState(true);
  const [shippingCost, setShippingCost] = useState<number>(0);
  const [includeIVA, setIncludeIVA] = useState(false);
  
  const [copied, setCopied] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importText, setImportText] = useState("");

  useEffect(() => {
    async function loadInitialData() {
      try {
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) return;
        const userId = userData.user.id;
        setCurrentUserId(userId);

        // Cargar productos, rol de vendedor y kits en paralelo
        const [productsRes, sellerRes, kitsRes] = await Promise.all([
          supabase.from("products").select("*").order("name"),
          supabase.from('sellers').select('role').eq('id', userId).single(),
          supabase.from('kits').select(`
            *,
            kit_items (
              product_id,
              quantity,
              custom_price,
              products (*)
            )
          `).order('created_at', { ascending: false })
        ]);

        if (productsRes.data) {
          const rawProducts = productsRes.data;
          const productsWithParentPrices = rawProducts.map(p => {
            if (p.parent_id) {
              const parentProduct = rawProducts.find(parent => parent.id === p.parent_id);
              if (parentProduct) {
                return {
                  ...p,
                  price: parentProduct.price
                };
              }
            }
            return p;
          });
          setProducts(productsWithParentPrices);
        }
        
        const isUserAdmin = sellerRes.data?.role === 'admin';
        setIsAdmin(isUserAdmin);

        if (kitsRes.data) {
          const mappedKits: Kit[] = kitsRes.data.map((k: any) => ({
            id: k.id,
            name: k.name,
            detailText: k.detail_text || "",
            category: k.category,
            isGlobal: k.is_global,
            sellerId: k.seller_id,
            items: (k.kit_items || []).map((item: any) => ({
              ...item.products,
              quantity: item.quantity,
              customPrice: item.custom_price
            }))
          }));
          setSavedKits(mappedKits);
        }
      } catch (err) {
        console.error("Error loading initial data in budgets:", err);
      }
    }
    
    loadInitialData();

    // Cargar uso frecuente
    try {
      const counts = JSON.parse(localStorage.getItem('product_usage_counts') || '{}');
      setUsageCounts(counts);
    } catch(e) {}
  }, []);

  const frequentProducts = React.useMemo(() => {
    if (products.length === 0) return [];
    const sortedIds = Object.keys(usageCounts).sort((a, b) => usageCounts[b] - usageCounts[a]);
    return sortedIds
      .map(id => products.find(p => p.id === id))
      .filter(p => p && p.is_active !== false && !p.name?.toLowerCase().startsWith('[interno]') && !p.parent_id && !EXCLUDED_IDS.includes(p.id)) // Exclude inactive, internal, child variants and dynamic variants from favorites list
      .slice(0, 10) as Product[];
  }, [products, usageCounts]);


  const getDisplayVariants = (p: Product, allProducts: Product[]) => {
    if (p.id === "be0f3766-cf7e-4b57-a474-b06ba9316de2") {
      const ids = [
        "c40fbee8-e216-4822-bf6d-5265e75cf30b", // 3/4 RAO
        "c436969c-b49c-420a-b7e1-683ca037e857", // ECO
        "84d167b0-16e2-45b3-9ddc-f3955438d040", // EGEO 1/2
        "e220bf90-ab0d-4f94-aa1e-cc802018d231"  // EGEO 3/4
      ];
      return allProducts
        .filter(prod => ids.includes(prod.id))
        .map(prod => {
          let vType = prod.variant_type || "";
          if (prod.id === "c40fbee8-e216-4822-bf6d-5265e75cf30b") vType = "3/4";
          else if (prod.id === "c436969c-b49c-420a-b7e1-683ca037e857") vType = "ECO";
          else if (prod.id === "84d167b0-16e2-45b3-9ddc-f3955438d040") vType = "EGEO 1/2";
          else if (prod.id === "e220bf90-ab0d-4f94-aa1e-cc802018d231") vType = "EGEO 3/4";
          return { ...prod, variant_type: vType };
        });
    }
    if (p.id === "f0478d75-ae8a-42ae-8662-6ac3262bc43c") {
      const ids = [
        "15d8d2aa-8feb-4b73-91b2-64557e210f50", // 74cms
        "adfebc13-cfb2-498d-8979-1da1a4f66a88", // 90cms
        "da5f1a12-1755-4d9d-b78e-73878ccef704", // 102cms
        "cfc521fe-d091-48f9-949f-6ab98579cbcf"  // 145cms
      ];
      return allProducts
        .filter(prod => ids.includes(prod.id))
        .map(prod => {
          let vType = prod.variant_type || "";
          if (prod.id === "15d8d2aa-8feb-4b73-91b2-64557e210f50") vType = "74cms";
          else if (prod.id === "adfebc13-cfb2-498d-8979-1da1a4f66a88") vType = "90cms";
          else if (prod.id === "da5f1a12-1755-4d9d-b78e-73878ccef704") vType = "102cms";
          else if (prod.id === "cfc521fe-d091-48f9-949f-6ab98579cbcf") vType = "145cms";
          return { ...prod, variant_type: vType };
        });
    }
    if (PAINT_MAP[p.id]) {
      const childId = PAINT_MAP[p.id];
      return allProducts
        .filter(prod => prod.id === childId)
        .map(prod => ({ ...prod, variant_type: "10Kg" }));
    }
    return allProducts.filter(prod => prod.parent_id === p.id);
  };

  const searchTerms = searchTerm.toLowerCase().split(/\s+/).filter(Boolean);
  const filteredProducts = products.filter(p => {
    if (p.is_active === false) return false; // Hide inactive products
    if (p.name?.toLowerCase().startsWith('[interno]')) return false; // Hide internal raw placeholders
    if (p.sku?.startsWith('AUTO-COMP-') && (!p.price || p.price === 0)) return false; // Hide legacy $0 auto-comp items
    if (p.parent_id) return false; // Hide child variants from main search results
    if (EXCLUDED_IDS.includes(p.id)) return false; // Hide dynamic variants from main results
    if (searchTerms.length === 0) return false;
    
    let extraSearchable = "";
    if (p.id === "be0f3766-cf7e-4b57-a474-b06ba9316de2") {
      extraSearchable = " 3/4 eco egeo 1/2 3/4 flotante plastico eco";
    } else if (p.id === "f0478d75-ae8a-42ae-8662-6ac3262bc43c") {
      extraSearchable = " 74cms 74 cms 90cms 90 cms 102cms 102 cms 145cms 145 cms base hierro refuerzo";
    } else if (PAINT_MAP[p.id]) {
      extraSearchable = " 10kg 10 kg 10";
    }

    const childVariants = getDisplayVariants(p, products);
    const childrenText = childVariants.map(child => `${child.name} ${child.sku || ''}`).join(' ');

    const searchableText = `${p.name} ${p.sku || ''} ${extraSearchable} ${childrenText}`.toLowerCase();
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

  const handleSaveKit = async () => {
    if (!newKitName.trim() || quoteItems.length === 0) return;
    
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return alert("Debes iniciar sesión.");

    try {
      const { data: newKitData, error: kitError } = await supabase.from('kits').insert({
        name: newKitName,
        detail_text: newKitDetail,
        category: newKitCategory,
        seller_id: userData.user.id,
        is_global: isAdmin ? newKitGlobal : false
      }).select().single();

      if (kitError) throw kitError;

      const itemsToInsert = quoteItems.map(item => ({
        kit_id: newKitData.id,
        product_id: item.id,
        quantity: item.quantity,
        custom_price: item.customPrice
      }));

      const { error: itemsError } = await supabase.from('kit_items').insert(itemsToInsert);
      if (itemsError) throw itemsError;

      const addedKit: Kit = {
        id: newKitData.id,
        name: newKitData.name,
        detailText: newKitData.detail_text || "",
        category: newKitData.category,
        isGlobal: newKitData.is_global,
        sellerId: newKitData.seller_id,
        items: [...quoteItems]
      };
      setSavedKits([addedKit, ...savedKits]);
      
      setShowSaveKitModal(false);
      setNewKitName("");
      setNewKitDetail("");
      setNewKitCategory("Otros");
      setNewKitGlobal(false);
      alert("Kit guardado con éxito.");
    } catch (error) {
      console.error(error);
      alert("Error al guardar el kit.");
    }
  };

  const loadKit = (kit: Kit) => {
    const newQuoteItems = [...quoteItems];
    for (const kitItem of kit.items) {
      const existing = newQuoteItems.find(i => i.id === kitItem.id);
      if (existing) {
        existing.quantity += kitItem.quantity;
        existing.customPrice = kitItem.customPrice;
      } else {
        newQuoteItems.push({ ...kitItem });
      }
    }
    setQuoteItems(newQuoteItems);
    
    if (kit.detailText) {
      setKitDetailText(prev => prev ? `${prev}\n${kit.detailText}` : kit.detailText);
    }
  };

  const deleteKit = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("¿Eliminar este kit?")) {
      const { error } = await supabase.from('kits').delete().eq('id', id);
      if (!error) {
        setSavedKits(savedKits.filter(k => k.id !== id));
      } else {
        alert("Error al eliminar el kit.");
      }
    }
  };

  const makeKitGlobal = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("¿Hacer este kit global para todos los vendedores?")) {
      const { error } = await supabase.from('kits').update({ is_global: true }).eq('id', id);
      if (!error) {
        setSavedKits(savedKits.map(k => k.id === id ? { ...k, isGlobal: true } : k));
        alert("El kit ahora es global.");
      } else {
        alert("Error al hacer el kit global.");
      }
    }
  };

  const handleEditKitName = async () => {
    if (!editKitNameValue.trim() || !editKitId) return;
    
    const { error } = await supabase.from('kits').update({ name: editKitNameValue }).eq('id', editKitId);
    if (!error) {
      setSavedKits(savedKits.map(k => k.id === editKitId ? { ...k, name: editKitNameValue } : k));
      setShowEditNameModal(false);
      setEditKitId("");
      setEditKitNameValue("");
    } else {
      alert("Error al actualizar el nombre.");
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

  const handleConvertToOrder = () => {
    const budgetData = {
      items: quoteItems.map(item => ({
        id: item.id,
        name: item.name,
        sku: item.sku || '',
        quantity: item.quantity,
        customPrice: item.customPrice,
        cost: item.cost || 0
      })),
      paymentType,
      cardInstallments,
      cardSurcharge
    };
    sessionStorage.setItem('preloaded_budget', JSON.stringify(budgetData));
    router.push('/vendedores/pedidos');
  };

  const handleImportFromText = () => {
    if (!importText.trim()) {
      alert("Por favor pega el texto del presupuesto.");
      return;
    }

    try {
      const parsed = parseWhatsAppBudget(importText);
      if (parsed.items.length === 0) {
        alert("No se encontraron productos en el texto pegado. Verifica que tenga el formato correcto.");
        return;
      }

      const newItems: QuoteItem[] = [];
      const unmatchedNames: string[] = [];

      parsed.items.forEach(parsedItem => {
        const normalizedMsgName = normalizeForMatching(parsedItem.name);

        // Try matching by exact normalized name
        let matchedProduct = products.find(p => normalizeForMatching(p.name) === normalizedMsgName);

        // Try matching by SKU / internal code
        if (!matchedProduct) {
          matchedProduct = products.find(p => p.sku && normalizeForMatching(p.sku) === normalizedMsgName);
        }

        // Try matching by substring
        if (!matchedProduct) {
          matchedProduct = products.find(p => {
            const nameNorm = normalizeForMatching(p.name);
            return nameNorm.includes(normalizedMsgName) || normalizedMsgName.includes(nameNorm);
          });
        }

        if (matchedProduct) {
          newItems.push({
            ...matchedProduct,
            quantity: parsedItem.quantity,
            customPrice: parsedItem.price,
            cost: (matchedProduct as QuoteItem).cost || 0
          });
        } else {
          unmatchedNames.push(parsedItem.name);
        }
      });

      if (newItems.length > 0) {
        setQuoteItems(newItems);
        setPaymentType(parsed.paymentType);
        setCardInstallments(parsed.cardInstallments);
        setCardSurcharge(parsed.cardSurcharge);
        setIsFreeShipping(parsed.isFreeShipping);
        setShippingCost(parsed.shippingCost);
        setIncludeIVA(parsed.includeIVA);
        setKitDetailText(parsed.kitDetailText);

        setShowImportModal(false);
        setImportText("");

        if (unmatchedNames.length > 0) {
          alert(
            "Se importó el presupuesto, pero no se pudieron emparejar los siguientes productos del catálogo:\n\n" +
            unmatchedNames.map(n => `- ${n}`).join("\n") +
            "\n\nPor favor, agrégalos manualmente."
          );
        } else {
          alert("¡Presupuesto importado con éxito!");
        }
      } else {
        alert("No se pudo emparejar ningún producto con el catálogo actual.");
      }
    } catch (err: any) {
      console.error("Error al importar el presupuesto:", err);
      alert("Error al procesar el texto del presupuesto: " + err.message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-lg font-black text-slate-900 tracking-tight">Armador de Presupuestos</h1>
          <p className="text-[11px] text-slate-400 font-semibold">Cotizá rápido y enviá la propuesta lista por WhatsApp.</p>
        </div>
        <Button 
          onClick={() => setShowImportModal(true)}
          className="flex items-center gap-1.5 py-1.5 px-3 rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs uppercase tracking-wider transition-all shadow-sm w-fit"
        >
          <Download className="w-3.5 h-3.5" />
          Importar Mensaje / WhatsApp
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left Col: Builder */}
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200/60 shadow-sm">
            <h2 className="font-black text-xs text-slate-800 mb-3 flex items-center gap-1.5 uppercase tracking-wider">
              <Search className="w-4 h-4 text-brand-500" /> Agregar Productos
            </h2>
            <div className="relative">
              <input 
                type="text" 
                className="w-full pl-3 pr-3 py-1.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-brand-500/10 outline-none font-bold text-xs"
                placeholder="Buscar por nombre o interno (SKU)..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            
            {(() => {
              const displayKits = savedKits.filter(k => {
                if (selectedCategoryFilter && k.category !== selectedCategoryFilter) return false;
                if (adminSellerFilter === 'mis_kits') {
                   return k.isGlobal || k.sellerId === currentUserId;
                }
                return true;
              });

              if ((savedKits.length === 0 && !isAdmin) || searchTerm) return null;

              return (
                <div className="mt-3 border-b border-slate-100 pb-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 mb-2">
                    <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Kits Guardados</p>
                    <div className="flex items-center gap-1.5">
                      <select 
                        value={selectedCategoryFilter} 
                        onChange={(e) => setSelectedCategoryFilter(e.target.value)}
                        className="text-[10px] px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50 outline-none font-bold text-slate-600 cursor-pointer"
                      >
                        <option value="">Todas las categorías</option>
                        {KIT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                      {isAdmin && (
                        <select
                          value={adminSellerFilter}
                          onChange={(e) => setAdminSellerFilter(e.target.value)}
                          className="text-[10px] px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50 outline-none font-bold text-slate-600 cursor-pointer"
                        >
                          <option value="mis_kits">Mis Kits y Globales</option>
                          <option value="todos">Todos los Kits</option>
                        </select>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
                    <select
                      value={selectedKitId}
                      onChange={(e) => setSelectedKitId(e.target.value)}
                      className="flex-1 w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white outline-none font-bold text-slate-700 cursor-pointer shadow-sm focus:ring-2 focus:ring-brand-500/10"
                    >
                      <option value="">-- Seleccionar un Kit --</option>
                      {displayKits.map(kit => (
                        <option key={kit.id} value={kit.id}>
                          {kit.isGlobal ? "⭐ " : ""}{kit.name}
                        </option>
                      ))}
                    </select>

                    <div className="flex gap-1.5 w-full sm:w-auto">
                      <button
                        type="button"
                        onClick={() => {
                          const kit = displayKits.find(k => k.id === selectedKitId);
                          if (kit) loadKit(kit);
                        }}
                        disabled={!selectedKitId}
                        className="flex-1 sm:flex-none px-3 py-1.5 bg-brand-50 border border-brand-100 text-brand-600 hover:bg-brand-600 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-xs font-black transition-all flex items-center justify-center gap-1.5 group"
                      >
                        <Package className="w-3.5 h-3.5 text-brand-400 group-hover:text-white transition-colors" />
                        Cargar
                      </button>

                      {(() => {
                        const selectedKit = displayKits.find(k => k.id === selectedKitId);
                        if (!selectedKit) return null;
                        
                        const canModify = selectedKit.sellerId === currentUserId || isAdmin;
                        
                        return (
                          <>
                            {isAdmin && !selectedKit.isGlobal && (
                              <button
                                type="button"
                                onClick={(e) => makeKitGlobal(selectedKit.id, e)}
                                className="px-2 py-1.5 bg-indigo-50 border border-indigo-100 text-indigo-600 hover:bg-indigo-500 hover:text-white rounded-lg transition-all flex items-center justify-center"
                                title="Hacer Global"
                              >
                                <Globe className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {canModify && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditKitId(selectedKit.id);
                                  setEditKitNameValue(selectedKit.name);
                                  setShowEditNameModal(true);
                                }}
                                className="px-2 py-1.5 bg-amber-50 border border-amber-100 text-amber-600 hover:bg-amber-500 hover:text-white rounded-lg transition-all flex items-center justify-center"
                                title="Editar Nombre"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {canModify && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  deleteKit(selectedKit.id, e);
                                  setSelectedKitId("");
                                }}
                                className="px-2 py-1.5 bg-red-50 border border-red-100 text-red-600 hover:bg-red-500 hover:text-white rounded-lg transition-all flex items-center justify-center"
                                title="Eliminar Kit"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </div>
                  {displayKits.length === 0 && <span className="text-[10px] text-slate-400 font-medium block mt-1.5">No hay kits en esta categoría.</span>}
                </div>
              );
            })()}
            
            {/* Tags de productos más utilizados */}
            {frequentProducts.length > 0 && !searchTerm && (
              <div className="mt-3">
                <p className="text-[9px] font-black uppercase tracking-wider text-slate-400 mb-1.5">Más Utilizados</p>
                <div className="flex flex-wrap gap-1.5">
                  {frequentProducts.flatMap(p => {
                    const childVariants = getDisplayVariants(p, products);
                    const parentLabel = p.sku || p.name;
                    const displayParentLabel = parentLabel.length > 30 ? parentLabel.substring(0, 28) + '...' : parentLabel;

                    const tags = [
                      <button
                        key={`freq-parent-${p.id}`}
                        onClick={() => addItem(p)}
                        className="px-2 py-0.5 bg-brand-50 border border-brand-100 text-brand-600 hover:bg-brand-600 hover:text-white rounded text-[9px] font-black uppercase tracking-wide transition-all flex items-center gap-1 group"
                        title={p.name}
                      >
                        <Plus className="w-2.5 h-2.5 text-brand-400 group-hover:text-white transition-colors" />
                        {displayParentLabel}
                      </button>
                    ];
                    childVariants.forEach(v => {
                      const childLabel = v.sku || v.name;
                      const displayChildLabel = childLabel.length > 30 ? childLabel.substring(0, 28) + '...' : childLabel;
                      tags.push(
                        <button
                          key={`freq-child-${p.id}-${v.id}`}
                          onClick={() => addItem(v)}
                          className={cn(
                            "px-2 py-0.5 border rounded text-[9px] font-black uppercase tracking-wide transition-all flex items-center gap-1 group",
                            v.variant_type?.toLowerCase().includes('ciego')
                              ? "bg-amber-50 border-amber-100 text-amber-700 hover:bg-amber-600 hover:text-white"
                              : "bg-blue-50 border-blue-100 text-blue-700 hover:bg-blue-600 hover:text-white"
                          )}
                          title={v.name}
                        >
                          <Plus className="w-2.5 h-2.5 transition-colors" />
                          {displayChildLabel}
                        </button>
                      );
                    });
                    return tags;
                  })}
                </div>
              </div>
            )}
            
            {searchTerm && (
              <div className="mt-2 border border-slate-200/60 rounded-lg overflow-hidden bg-slate-50">
                {filteredProducts.map(p => {
                  const childVariants = getDisplayVariants(p, products);
                  return (
                    <div 
                      key={p.id} 
                      onClick={() => addItem(p)}
                      className="flex justify-between items-center p-2 hover:bg-white border-b border-slate-100 last:border-0 transition-colors cursor-pointer group"
                    >
                      <div>
                        <p className="text-[9px] font-black text-brand-500 uppercase tracking-wider">{p.sku || "SIN SKU"}</p>
                        <p className="font-bold text-xs text-slate-800">{p.name}</p>
                        <p className="text-[11px] text-brand-600 font-bold">{formatPrice(p.price)}</p>
                      </div>
                      {childVariants.length > 0 ? (
                        <div className="flex gap-1.5 flex-wrap justify-end max-w-[280px]">
                          <button 
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              addItem(p);
                            }}
                            className="px-2 py-1.5 bg-brand-50 text-brand-600 hover:bg-brand-600 hover:text-white rounded-lg text-[9px] font-black uppercase tracking-wider transition-all"
                          >
                            {p.id === "be0f3766-cf7e-4b57-a474-b06ba9316de2" 
                              ? "RAO 1/2" 
                              : p.id === "f0478d75-ae8a-42ae-8662-6ac3262bc43c" 
                              ? "85cms" 
                              : p.id === "c43b57f2-4e6e-4016-adf6-5bf1e1650087"
                              ? "20CMx25M"
                              : PAINT_MAP[p.id]
                              ? "20Kg"
                              : "Estándar"}
                          </button>
                          {childVariants.map(v => (
                            <button 
                              key={`search-child-${p.id}-${v.id}`}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                addItem(v);
                              }}
                              className={cn(
                                "px-2 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all",
                                v.variant_type?.toLowerCase().includes('ciego')
                                  ? "bg-amber-50 text-amber-700 hover:bg-amber-600 hover:text-white"
                                  : "bg-blue-50 text-blue-700 hover:bg-blue-600 hover:text-white"
                              )}
                            >
                              {v.variant_type || 'Variante'}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <button 
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            addItem(p);
                          }}
                          className="p-1.5 bg-brand-100 text-brand-600 rounded-lg hover:bg-brand-500 hover:text-white transition-colors"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  );
                })}
                {filteredProducts.length === 0 && <div className="p-3 text-center text-xs text-slate-500 font-medium">No se encontraron productos.</div>}
              </div>
            )}
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200/60 shadow-sm">
             <h2 className="font-black text-xs text-slate-800 mb-3 flex items-center gap-1.5 uppercase tracking-wider">
              <Calculator className="w-4 h-4 text-brand-500" /> Método de Pago
            </h2>
            <div className="space-y-2">
              <label className={`flex items-center justify-between p-2.5 rounded-lg border-2 cursor-pointer transition-colors ${paymentType === 'efectivo' ? 'border-brand-500 bg-brand-50' : 'border-slate-100 hover:border-slate-200'}`}>
                <div className="flex items-center gap-2.5">
                  <input 
                    type="radio" 
                    name="paymentType" 
                    className="w-3.5 h-3.5 text-brand-600"
                    checked={paymentType === 'efectivo'}
                    onChange={() => setPaymentType('efectivo')}
                  />
                  <span className="font-bold text-slate-800 text-xs">Efectivo / Transferencia</span>
                </div>
              </label>

              <label className={`flex flex-col p-2.5 rounded-lg border-2 cursor-pointer transition-colors ${paymentType === 'tarjeta' ? 'border-brand-500 bg-brand-50' : 'border-slate-100 hover:border-slate-200'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <input 
                      type="radio" 
                      name="paymentType" 
                      className="w-3.5 h-3.5 text-brand-600"
                      checked={paymentType === 'tarjeta'}
                      onChange={() => setPaymentType('tarjeta')}
                    />
                    <span className="font-bold text-slate-800 text-xs">Tarjeta de Crédito</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Recargo %</span>
                    <input 
                      type="number"
                      value={cardSurcharge}
                      onChange={(e) => setCardSurcharge(Number(e.target.value))}
                      onClick={(e) => e.stopPropagation()}
                      className="w-12 px-1.5 py-0.5 text-xs font-bold border border-slate-200 rounded text-center focus:ring-2 focus:ring-brand-500/10 outline-none bg-white text-red-500"
                    />
                  </div>
                </div>
                
                {paymentType === 'tarjeta' && (
                  <div className="mt-3 pt-3 border-t border-brand-100/50 flex flex-col gap-1.5" onClick={(e) => e.stopPropagation()}>
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Cantidad de Cuotas</span>
                    <div className="flex gap-1.5">
                      {[1, 3, 6].map(cuota => (
                        <button
                          key={cuota}
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setCardInstallments(cuota); }}
                          className={`flex-1 py-1 rounded text-xs font-bold transition-all border ${cardInstallments === cuota ? 'bg-brand-600 border-brand-600 text-white' : 'bg-white border-brand-100 text-brand-600 hover:border-brand-300'}`}
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
        <div className="bg-white p-4 rounded-xl border border-slate-200/60 shadow-sm flex flex-col h-full">
          <h2 className="font-black text-xs text-slate-800 uppercase tracking-wider mb-4 flex justify-between items-center border-b border-slate-100 pb-2">
            <span>Vista Previa del Presupuesto</span>
            <div className="flex items-center gap-3">
              {quoteItems.length > 0 && (
                <>
                  <button 
                    onClick={() => setShowSaveKitModal(true)}
                    className="text-[10px] font-black text-slate-400 hover:text-indigo-600 transition-colors flex items-center gap-1 uppercase tracking-wider"
                    title="Guardar este presupuesto como Kit"
                  >
                    <Save className="w-3 h-3" /> Guardar Kit
                  </button>
                  <button 
                    onClick={() => { setQuoteItems([]); setKitDetailText(""); }}
                    className="text-[10px] font-black text-slate-400 hover:text-red-500 transition-colors flex items-center gap-1 uppercase tracking-wider"
                    title="Vaciar presupuesto"
                  >
                    <Trash2 className="w-3 h-3" /> Limpiar
                  </button>
                </>
              )}
              <span className="text-[10px] font-bold bg-brand-50 text-brand-600 px-2 py-0.5 rounded border border-brand-100">
                {quoteItems.length} items
              </span>
            </div>
          </h2>
          
          <div className="flex-1 overflow-y-auto pr-1 space-y-2 mb-4 max-h-[300px]">
            {quoteItems.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-1.5 py-8">
                <Calculator className="w-10 h-10 opacity-20" />
                <p className="font-bold text-xs">No hay productos agregados.</p>
              </div>
            ) : (
              quoteItems.map(item => (
                <div key={item.id} className="p-2 bg-slate-50 border border-slate-100 rounded-lg relative group flex flex-col sm:flex-row sm:items-center justify-between gap-1.5" title={item.name}>
                  <button 
                    onClick={() => removeItem(item.id)}
                    className="absolute top-1.5 right-1.5 bg-red-100 text-red-600 p-0.5 rounded-md opacity-0 group-hover:opacity-100 transition-opacity z-10"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>

                  <div className="flex-1 min-w-0 pr-6">
                    <p className="text-[9px] font-black text-brand-500 uppercase tracking-wider leading-tight mb-0.5">{item.sku || "SIN INTERNO"}</p>
                    <p className="font-bold text-slate-800 text-xs truncate">{item.name}</p>
                  </div>
                  
                  <div className="flex items-center gap-1.5 sm:shrink-0 mt-1 sm:mt-0">
                    <div className="flex items-center bg-white border border-slate-200 rounded overflow-hidden h-6">
                      <button onClick={() => updateQuantity(item.id, item.quantity - 1)} className="px-2 font-black text-slate-500 hover:bg-slate-50 leading-none text-xs">-</button>
                      <span className="px-1 font-bold text-xs min-w-[1.25rem] text-center">{item.quantity}</span>
                      <button onClick={() => updateQuantity(item.id, item.quantity + 1)} className="px-2 font-black text-slate-500 hover:bg-slate-50 leading-none text-xs">+</button>
                    </div>
                    
                    <div className="flex items-center gap-1 bg-white border border-slate-200 rounded px-1.5 h-6">
                       <span className="text-[10px] font-bold text-slate-400">$</span>
                       <input 
                         type="number" 
                         value={item.customPrice}
                         onChange={(e) => updateCustomPrice(item.id, Number(e.target.value))}
                         className="w-16 px-0.5 text-xs font-bold text-right outline-none bg-transparent"
                       />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="border-t border-slate-100 pt-4 space-y-2 mb-4">
            <div className="flex justify-between text-xs font-medium text-slate-500">
              <span>Subtotal Productos</span>
              <span>{formatPrice(subtotal)}</span>
            </div>
            
            <div className="flex justify-between items-center text-xs font-medium text-slate-500">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <span>Envío Gratis</span>
                <input 
                  type="checkbox" 
                  checked={isFreeShipping} 
                  onChange={(e) => setIsFreeShipping(e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-500/10 cursor-pointer"
                />
              </label>
              {isFreeShipping ? (
                <span className="text-brand-600 font-bold uppercase text-[9px] tracking-wider bg-brand-50 px-1.5 py-0.5 rounded border border-brand-100">Gratis</span>
              ) : (
                <div className="flex items-center gap-1">
                  <span className="text-xs font-bold text-slate-400">$</span>
                  <input 
                    type="number"
                    value={shippingCost || ''}
                    onChange={(e) => setShippingCost(Number(e.target.value))}
                    className="w-20 px-1.5 py-0.5 text-xs font-bold border border-slate-200 rounded text-right focus:ring-2 focus:ring-brand-500/10 outline-none bg-white"
                    placeholder="Costo..."
                  />
                </div>
              )}
            </div>
            
            {surcharge > 0 && (
               <div className="flex justify-between text-xs font-bold text-red-500">
                 <span>Recargo ({selectedPaymentMethod.name})</span>
                 <span>+{formatPrice(surcharge)}</span>
               </div>
            )}
            
            <div className="flex justify-between items-center text-xs font-medium text-slate-500">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <span>Factura con IVA (+21%)</span>
                <input 
                  type="checkbox" 
                  checked={includeIVA} 
                  onChange={(e) => setIncludeIVA(e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-500/10 cursor-pointer"
                />
              </label>
              {includeIVA && (
                <span className="font-bold text-slate-600">+{formatPrice(ivaAmount)}</span>
              )}
            </div>

            <div className="flex justify-between text-base font-black text-slate-900 pt-1.5 border-t border-slate-100">
              <span>Total</span>
              <span>{formatPrice(total)}</span>
            </div>
            {selectedPaymentMethod.installments > 1 && (
              <div className="flex justify-between text-xs font-bold text-brand-600 bg-brand-50 p-2.5 rounded-lg mt-1.5 border border-brand-100">
                <span>{selectedPaymentMethod.installments} cuotas fijas de:</span>
                <span>{formatPrice(installmentValue)}</span>
              </div>
            )}
            
            <div className="mt-3 space-y-1">
              <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Aclaraciones / Detalle del Combo</label>
              <textarea 
                value={kitDetailText}
                onChange={(e) => setKitDetailText(e.target.value)}
                placeholder="Ej. Con 15% de descuento aplicado en el total."
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-brand-500/10 bg-slate-50 text-xs font-bold outline-none resize-none h-14"
              />
            </div>
          </div>

          <Button 
            onClick={handleCopy} 
            disabled={quoteItems.length === 0}
            className="w-full py-2.5 rounded-xl text-xs font-black flex items-center justify-center gap-1.5"
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? "¡Copiado al portapapeles!" : "Copiar Resumen para WhatsApp"}
          </Button>

          {quoteItems.length > 0 && (
            <button 
              type="button"
              onClick={handleConvertToOrder}
              className="w-full mt-2 py-2.5 px-4 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all shadow-sm"
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              Crear Pedido con este Presupuesto
            </button>
          )}
          
          {quoteItems.length > 0 && (
             <div className="mt-3 p-3 bg-slate-900 rounded-lg">
               <pre className="text-[9px] text-slate-300 font-mono whitespace-pre-wrap">
                 {generateWhatsAppText()}
               </pre>
             </div>
          )}
        </div>
      </div>

      {/* Modal Guardar Kit */}
      {showSaveKitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md flex flex-col animate-in fade-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-slate-100">
              <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider">Guardar como Kit</h2>
              <p className="text-[11px] font-semibold text-slate-400 mt-0.5">Guardá esta combinación de productos y precios para usarla rápido en el futuro.</p>
            </div>
            
            <div className="p-4 space-y-3">
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Nombre del Kit</label>
                <input 
                  type="text" 
                  value={newKitName}
                  onChange={(e) => setNewKitName(e.target.value)}
                  placeholder="Ej. Combo Tanque + Base"
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-brand-500/10 bg-slate-50 font-bold text-xs outline-none"
                  autoFocus
                />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Detalle / Descuento (Opcional)</label>
                <textarea 
                  value={newKitDetail}
                  onChange={(e) => setNewKitDetail(e.target.value)}
                  placeholder="Ej. Incluye 15% de descuento por pago en efectivo."
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-brand-500/10 bg-slate-50 text-xs font-bold outline-none resize-none h-16"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Categoría</label>
                <select 
                  value={newKitCategory}
                  onChange={(e) => setNewKitCategory(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-brand-500/10 bg-slate-50 font-bold text-xs outline-none cursor-pointer"
                >
                  {KIT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              
              {isAdmin && (
                <div className="pt-1">
                  <label className="flex items-center gap-2 cursor-pointer bg-brand-50 p-2.5 rounded-lg border border-brand-100">
                    <input 
                      type="checkbox" 
                      checked={newKitGlobal}
                      onChange={(e) => setNewKitGlobal(e.target.checked)}
                      className="w-3.5 h-3.5 rounded text-brand-600 focus:ring-brand-500/10"
                    />
                    <span className="text-xs font-bold text-brand-700">Hacer este Kit Global (visible para todos)</span>
                  </label>
                </div>
              )}
            </div>
            
            <div className="p-4 border-t border-slate-100 bg-slate-50 rounded-b-xl flex justify-end gap-2">
               <button 
                 onClick={() => setShowSaveKitModal(false)}
                 className="px-4 py-1.5 rounded-lg font-bold text-xs text-slate-600 hover:bg-slate-200 transition-colors"
               >
                 Cancelar
               </button>
               <Button onClick={handleSaveKit} className="px-4 py-1.5 rounded-lg font-black text-xs">
                 Guardar Kit
               </Button>
            </div>
          </div>
        </div>
      )}
      {/* Modal Editar Nombre Kit */}
      {showEditNameModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm flex flex-col animate-in fade-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-slate-100">
              <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider">Editar Nombre del Kit</h2>
            </div>
            <div className="p-4 space-y-3">
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Nuevo Nombre</label>
                <input 
                  type="text" 
                  value={editKitNameValue}
                  onChange={(e) => setEditKitNameValue(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-brand-500/10 bg-slate-50 font-bold text-xs outline-none"
                  autoFocus
                />
              </div>
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50 rounded-b-xl flex justify-end gap-2">
               <button 
                 onClick={() => {
                   setShowEditNameModal(false);
                   setEditKitId("");
                 }}
                 className="px-4 py-1.5 rounded-lg font-bold text-xs text-slate-600 hover:bg-slate-200 transition-colors"
               >
                 Cancelar
               </button>
               <Button onClick={handleEditKitName} className="px-4 py-1.5 rounded-lg font-black text-xs">
                 Guardar
               </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Importar Presupuesto */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg flex flex-col animate-in fade-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-slate-100">
              <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider">Importar Presupuesto desde Texto</h2>
              <p className="text-[11px] font-semibold text-slate-400 mt-0.5">Pegá el mensaje de WhatsApp o texto enviado al cliente para recrear el presupuesto.</p>
            </div>
            <div className="p-4 space-y-3">
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Texto del Mensaje</label>
                <textarea 
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  placeholder="Pegá aquí el mensaje del presupuesto..."
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-brand-500/10 bg-slate-50 font-medium text-xs outline-none h-60"
                  autoFocus
                />
              </div>
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50 rounded-b-xl flex justify-end gap-2">
               <button 
                 onClick={() => {
                   setShowImportModal(false);
                   setImportText("");
                 }}
                 className="px-4 py-1.5 rounded-lg font-bold text-xs text-slate-600 hover:bg-slate-200 transition-colors"
               >
                 Cancelar
               </button>
               <Button onClick={handleImportFromText} className="px-4 py-1.5 rounded-lg font-black text-xs">
                 Importar Presupuesto
               </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

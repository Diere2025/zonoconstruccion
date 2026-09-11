"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Product, PaymentMethod } from "@/types";
import { Search, Plus, Trash2, Copy, Check, Calculator, ArrowRight, Save, Package, Globe, Edit2, ShoppingBag, Download, ChevronDown, ChevronUp, Layers, Tag, Percent, Sparkles, Printer, FileText, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn, formatPrice } from "@/lib/utils";
import InlineVisualProductSelector from "@/components/vendedores/InlineVisualProductSelector";
import PrintableBudgetModal from "@/components/vendedores/PrintableBudgetModal";
import { evaluateDiscountSuggestions, DiscountSuggestion } from "@/lib/discountRules";
import { parseWhatsAppBudget, matchParsedItemsToProducts, parsePrice, isDiscountItem } from "@/lib/whatsappBudgetParser";

interface QuoteItem extends Product {
  quantity: number;
  customPrice: number;
  basePrice?: number;
  discountType?: 'percentage' | 'fixed';
  discountValue?: number;
  cost?: number;
  bundleParentId?: string;
  isIncludedInKit?: boolean;
  baseQuantity?: number;
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
  
  const [dbPaymentMethods, setDbPaymentMethods] = useState<{ id: string; name: string; surcharge_percentage: number; installments: number }[]>([]);
  const [paymentType, setPaymentType] = useState<'efectivo' | 'tarjeta'>('efectivo');
  const [cardInstallments, setCardInstallments] = useState<number>(6);
  const [cardSurcharge, setCardSurcharge] = useState<number>(42);

  const matchedMethod = dbPaymentMethods.find(m => m.surcharge_percentage === cardSurcharge && m.installments === cardInstallments);
  const paymentMethodName = paymentType === 'efectivo' 
    ? "Efectivo / Transferencia" 
    : (matchedMethod ? matchedMethod.name : (cardInstallments === 1 ? "Tarjeta de Crédito (1 Pago)" : `Tarjeta de Crédito (${cardInstallments} Cuotas)`));

  const selectedPaymentMethod = paymentType === 'efectivo' 
    ? { id: "1", name: "Efectivo / Transferencia", surcharge_percentage: 0, installments: 1, is_active: true }
    : { id: matchedMethod?.id || "2", name: paymentMethodName, surcharge_percentage: cardSurcharge, installments: cardInstallments, is_active: true };
  
  const [isFreeShipping, setIsFreeShipping] = useState(true);
  const [shippingCost, setShippingCost] = useState<number>(0);
  const [includeIVA, setIncludeIVA] = useState(false);

  // Global Budget Discount States
  const [orderDiscountType, setOrderDiscountType] = useState<'percentage' | 'fixed'>('percentage');
  const [orderDiscountValue, setOrderDiscountValue] = useState<number>(0);

  // Item Discounts Accordion State in Budget Preview
  const [openItemDiscountIds, setOpenItemDiscountIds] = useState<Record<string, boolean>>({});
  const toggleItemDiscount = (id: string) => {
    setOpenItemDiscountIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const updateItemDiscount = (id: string, discountType: 'percentage' | 'fixed', discountValue: number) => {
    setQuoteItems(prev => prev.map(item => {
      if (item.id !== id) return item;
      const base = item.basePrice !== undefined ? item.basePrice : (item.price || item.customPrice || 0);
      const val = Math.max(0, discountValue);
      let newPrice = base;
      if (val > 0) {
        if (discountType === 'percentage') {
          newPrice = Math.round(base * (1 - Math.min(100, val) / 100));
        } else {
          newPrice = Math.max(0, base - val);
        }
      }
      return {
        ...item,
        basePrice: base,
        discountType,
        discountValue: val,
        customPrice: newPrice
      };
    }));
  };
  
  const [copied, setCopied] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importText, setImportText] = useState("");

  // Printable and Export Modal States
  const [clientName, setClientName] = useState<string>("");
  const [clientPhone, setClientPhone] = useState<string>("");
  const [sellerName, setSellerName] = useState<string>("Asesor Comercial Zono");
  const [budgetNumber, setBudgetNumber] = useState<string>(() => `ZC-${Math.floor(100000 + Math.random() * 900000)}`);
  const [showPrintModal, setShowPrintModal] = useState<boolean>(false);

  useEffect(() => {
    async function loadInitialData() {
      try {
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) return;
        const userId = userData.user.id;
        setCurrentUserId(userId);

        // Cargar productos, rol de vendedor, kits y medios de pago en paralelo
        const [productsRes, sellerRes, kitsRes, payMethodsRes] = await Promise.all([
          supabase.from("products").select("*").eq("is_active", true).order("name"),
          supabase.from('sellers').select('role, full_name').eq('id', userId).single(),
          supabase.from('kits').select(`
            *,
            kit_items (
              product_id,
              quantity,
              custom_price,
              products (*)
            )
          `).order('created_at', { ascending: false }),
          supabase.from('payment_methods').select('id, name, surcharge_percentage, installments').eq('is_active', true).order('surcharge_percentage', { ascending: false })
        ]);

        if (payMethodsRes.data) {
          setDbPaymentMethods(payMethodsRes.data);
        }

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
        if (sellerRes.data?.full_name) {
          setSellerName(sellerRes.data.full_name);
        }

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
      .filter(p => p && p.is_active !== false && !p.name?.toLowerCase().startsWith('[interno]') && !p.parent_id && !EXCLUDED_IDS.includes(p.id)) // Exclude inactive, internal, child variants, and dynamic variants
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

  const normalizeSearchText = (text: string) => {
    if (!text) return "";
    return text.toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  };

  const searchTerms = normalizeSearchText(searchTerm).split(/\s+/).filter(Boolean);
  const filteredProducts = products.filter(p => {
    if (p.is_active === false) return false; // Hide inactive products
    if (p.name?.toLowerCase().startsWith('[interno]')) return false; // Hide internal raw placeholders
    if (p.category === 'Interno') return false;
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

    const searchableText = normalizeSearchText(`${p.name} ${p.sku || ''} ${p.brand || ''} ${extraSearchable} ${childrenText}`);
    return searchTerms.every(term => searchableText.includes(term));
  }).slice(0, 15); // Limit search results

  const addItems = (newProducts: Product[]) => {
    setQuoteItems(prev => {
      const next = [...prev];
      newProducts.forEach(prod => {
        const qtyToAdd = (prod as any).quantity || 1;
        const targetPrice = (prod as any).customPrice !== undefined ? (prod as any).customPrice : prod.price;
        const effectiveBase = (prod as any).basePrice !== undefined 
          ? (prod as any).basePrice 
          : prod.price;
        const discountType = (prod as any).discountType !== undefined 
          ? (prod as any).discountType 
          : (targetPrice < effectiveBase ? 'percentage' : undefined);
        const discountValue = (prod as any).discountValue !== undefined 
          ? (prod as any).discountValue 
          : (discountType === 'percentage' && effectiveBase > 0 
              ? Math.round(((effectiveBase - targetPrice) / effectiveBase) * 100) 
              : undefined);

        const bundleParentId = (prod as any).bundleParentId;
        const isIncludedInKit = (prod as any).isIncludedInKit;
        const baseQuantity = (prod as any).baseQuantity;

        const existing = next.find(i => 
          i.id === prod.id && 
          i.bundleParentId === bundleParentId && 
          Boolean(i.isIncludedInKit) === Boolean(isIncludedInKit)
        );
        if (existing) {
          existing.quantity += qtyToAdd;
          if ((prod as any).customPrice !== undefined) {
            existing.customPrice = targetPrice;
          }
          existing.basePrice = effectiveBase;
          existing.discountType = discountType || existing.discountType;
          existing.discountValue = discountValue !== undefined ? discountValue : existing.discountValue;
          if (bundleParentId) existing.bundleParentId = bundleParentId;
          if (isIncludedInKit !== undefined) existing.isIncludedInKit = isIncludedInKit;
          if (baseQuantity) existing.baseQuantity = baseQuantity;
        } else {
          next.push({ 
            ...prod, 
            quantity: qtyToAdd, 
            customPrice: targetPrice,
            basePrice: effectiveBase,
            discountType,
            discountValue,
            bundleParentId,
            isIncludedInKit,
            baseQuantity: baseQuantity || qtyToAdd
          });
        }
      });
      return next;
    });
    setSearchTerm("");
  };

  const addItem = (product: Product) => {
    addItems([product]);
    
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
    setQuoteItems(prev => prev.map(item => {
      if (item.id !== id) return item;
      const isDisc = isDiscountItem(item) || price < 0;
      if (isDisc) {
        return {
          ...item,
          customPrice: -Math.abs(price)
        };
      }
      const base = item.basePrice !== undefined ? item.basePrice : (item.price || price);
      const isDiscounted = base > price && price > 0;
      const discVal = isDiscounted ? Math.round(((base - price) / base) * 100) : 0;
      return {
        ...item,
        basePrice: base,
        discountType: isDiscounted ? 'percentage' : undefined,
        discountValue: isDiscounted ? discVal : 0,
        customPrice: price
      };
    }));
  };

  const [expandedKits, setExpandedKits] = useState<Record<string, boolean>>({});

  const toggleKitExpand = (kitId: string) => {
    setExpandedKits(prev => ({ ...prev, [kitId]: !prev[kitId] }));
  };

  const handleUpdateKitQuantity = (kitId: string, newQty: number, includedItems: QuoteItem[]) => {
    if (newQty < 1) {
      handleRemoveKit(kitId, includedItems);
      return;
    }
    const currentKit = quoteItems.find(i => i.id === kitId);
    if (!currentKit) return;
    const oldQty = currentKit.quantity || 1;
    const incIds = new Set(includedItems.map(i => i.id));

    setQuoteItems(prev => prev.map(item => {
      if (item.id === kitId) {
        return { ...item, quantity: newQty };
      }
      if (incIds.has(item.id) || item.bundleParentId === kitId) {
        const baseQty = item.baseQuantity || Math.max(1, Math.round(item.quantity / oldQty));
        return { ...item, quantity: baseQty * newQty };
      }
      return item;
    }));
  };

  const handleRemoveKit = (kitId: string, includedItems: QuoteItem[]) => {
    const idsToRemove = new Set([kitId, ...includedItems.map(i => i.id)]);
    setQuoteItems(prev => prev.filter(item => {
      if (idsToRemove.has(item.id)) return false;
      if (item.bundleParentId === kitId) return false;
      return true;
    }));
  };

  // Automatic discount suggestions (e.g. MEP x2, x3, x6, etc.)
  const discountSuggestions = useMemo(() => {
    return evaluateDiscountSuggestions(quoteItems, products);
  }, [quoteItems, products]);

  const handleApplyDiscountSuggestion = (sug: DiscountSuggestion) => {
    setQuoteItems(prev => {
      let filtered = prev;
      if (sug.existingDiscountItemId) {
        filtered = filtered.filter(i => i.id !== sug.existingDiscountItemId);
      }

      if (sug.itemDiscountAction) {
        const { itemIds, discountPct } = sug.itemDiscountAction;
        return filtered.map(item => {
          if (!itemIds.includes(item.id)) return item;
          const base = item.basePrice !== undefined ? item.basePrice : (item.price || item.customPrice || 0);
          const newPrice = Math.max(0, Math.round(base * (1 - discountPct / 100)));
          return {
            ...item,
            basePrice: base,
            discountType: 'percentage',
            discountValue: discountPct,
            customPrice: newPrice
          };
        });
      }

      if (sug.targetProduct) {
        const newDiscountItem: QuoteItem = {
          ...sug.targetProduct,
          quantity: sug.suggestedQty,
          customPrice: -sug.unitDiscount,
          basePrice: -sug.unitDiscount
        };
        return [...filtered, newDiscountItem];
      }

      return filtered;
    });
  };

  const { kitGroups, discountItems, standardItems, totalQuoteCount } = useMemo(() => {
    const isDisc = (i: QuoteItem) => isDiscountItem(i) || (i.customPrice < 0);
    const isKit = (i: QuoteItem) => {
      const name = (i.name || "").toLowerCase();
      return (name.includes("kit instalaci") || name.includes("kit de instalaci") || name.startsWith("kit ")) && !isDisc(i);
    };

    const kits = quoteItems.filter(isKit);
    const claimed = new Set<string>();

    const kitGroupsList = kits.map(kit => {
      claimed.add(kit.id);
      const included = quoteItems.filter(i => {
        if (claimed.has(i.id)) return false;
        if (i.bundleParentId && i.bundleParentId === kit.id) return true;
        if (i.isIncludedInKit) return true;
        if (i.customPrice === 0) return true;
        return false;
      });
      included.forEach(inc => claimed.add(inc.id));
      return { kit, included };
    });

    const remaining = quoteItems.filter(i => !claimed.has(i.id));
    const discounts = remaining.filter(isDisc);
    const discountIds = new Set(discounts.map(d => d.id));
    const standards = remaining.filter(i => !discountIds.has(i.id));

    return {
      kitGroups: kitGroupsList,
      discountItems: discounts,
      standardItems: standards,
      totalQuoteCount: quoteItems.length
    };
  }, [quoteItems]);

  // Calculations
  const itemsGrossSubtotal = useMemo(() => {
    return quoteItems.reduce((acc, item) => {
      const isDisc = isDiscountItem(item);
      const itemVal = isDisc ? -Math.abs(item.customPrice) : item.customPrice;
      return acc + itemVal * item.quantity;
    }, 0);
  }, [quoteItems]);

  const { totalListPrice, totalItemDiscountAmount, hasAnyItemDiscount } = useMemo(() => {
    let listPrice = 0;
    let itemDiscounts = 0;
    let hasDisc = false;

    quoteItems.forEach(item => {
      const isDisc = isDiscountItem(item) || item.customPrice < 0;
      if (isDisc) {
        const discVal = Math.abs(item.customPrice * item.quantity);
        if (discVal > 0) {
          hasDisc = true;
          itemDiscounts += discVal;
        }
        return;
      }
      const base = item.basePrice !== undefined ? item.basePrice : (item.price || item.customPrice);
      if (base > item.customPrice && item.customPrice > 0) {
        hasDisc = true;
        listPrice += base * item.quantity;
        itemDiscounts += (base - item.customPrice) * item.quantity;
      } else {
        listPrice += item.customPrice * item.quantity;
      }
    });

    return {
      totalListPrice: listPrice,
      totalItemDiscountAmount: itemDiscounts,
      hasAnyItemDiscount: hasDisc && itemDiscounts > 0
    };
  }, [quoteItems]);

  const orderDiscountAmount = useMemo(() => {
    if (!orderDiscountValue || orderDiscountValue <= 0) return 0;
    if (orderDiscountType === 'percentage') {
      return Math.round(itemsGrossSubtotal * (Math.min(100, orderDiscountValue) / 100));
    }
    return Math.min(itemsGrossSubtotal, Math.max(0, orderDiscountValue));
  }, [itemsGrossSubtotal, orderDiscountType, orderDiscountValue]);

  const subtotal = Math.max(0, itemsGrossSubtotal - orderDiscountAmount);
  const shippingAmount = isFreeShipping ? 0 : shippingCost;
  const surcharge = subtotal * (selectedPaymentMethod.surcharge_percentage / 100);
  const subtotalWithSurchargeAndShipping = subtotal + surcharge + shippingAmount;
  const ivaAmount = includeIVA ? subtotalWithSurchargeAndShipping * 0.21 : 0;
  const total = Math.max(0, subtotalWithSurchargeAndShipping + ivaAmount);
  const installmentValue = selectedPaymentMethod.installments > 1 ? total / selectedPaymentMethod.installments : 0;
  const totalSavings = totalItemDiscountAmount + orderDiscountAmount;

  const generateWhatsAppText = () => {
    let text = `*Zono Construcción y Hogar*\n`;
    text += `_Presupuesto Detallado_\n\n`;
    
    quoteItems.forEach(item => {
      const internalName = item.sku || item.name;
      const isDisc = isDiscountItem(item);
      const base = item.basePrice !== undefined ? item.basePrice : (item.price || item.customPrice);
      const isDiscounted = !isDisc && base > item.customPrice && item.customPrice > 0;

      if (isDisc) {
        const discAmount = Math.abs(item.customPrice * item.quantity);
        text += `🏷️ *${item.name || internalName}*: -${formatPrice(discAmount)}\n`;
      } else if (item.customPrice === 0) {
        if (item.quantity > 1) {
          text += `🔸 ${item.quantity}x *${internalName}* (Incluido en el Kit)\n`;
        } else {
          text += `🔸 1x *${internalName}* (Incluido en el Kit)\n`;
        }
      } else if (isDiscounted) {
        const discPct = item.discountValue || (base > 0 ? Math.round(((base - item.customPrice) / base) * 100) : 0);
        if (item.quantity > 1) {
          text += `🔸 ${item.quantity}x *${internalName}* a ${formatPrice(item.customPrice)} c/u (~${formatPrice(base)}~ | *${discPct}% OFF*)\n`;
          text += `   Subtotal: ${formatPrice(item.customPrice * item.quantity)}\n`;
        } else {
          text += `🔸 1x *${internalName}* a ${formatPrice(item.customPrice)} (~${formatPrice(base)}~ | *${discPct}% OFF*)\n`;
        }
      } else {
        if (item.quantity > 1) {
          text += `🔸 ${item.quantity}x *${internalName}* a ${formatPrice(item.customPrice)} c/u\n`;
          text += `   Subtotal: ${formatPrice(item.customPrice * item.quantity)}\n`;
        } else {
          text += `🔸 1x *${internalName}* a ${formatPrice(item.customPrice)}\n`;
        }
      }
    });
    
    text += `➖\n`;
    if (hasAnyItemDiscount && totalItemDiscountAmount > 0) {
      text += `*Precio de Lista:* ${formatPrice(totalListPrice)}\n`;
      text += `🏷️ *Descuento Aplicado:* -${formatPrice(totalItemDiscountAmount)}\n`;
      text += `*Subtotal Productos:* ${formatPrice(itemsGrossSubtotal)}\n`;
    } else {
      text += `*Subtotal Productos:* ${formatPrice(itemsGrossSubtotal)}\n`;
    }

    if (orderDiscountAmount > 0) {
      text += `🏷️ *Descuento Presupuesto (${orderDiscountType === 'percentage' ? `${orderDiscountValue}%` : 'Monto Fijo'}):* -${formatPrice(orderDiscountAmount)}\n`;
      text += `*Subtotal con Descuento:* ${formatPrice(subtotal)}\n`;
    }

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
    
    if (totalSavings > 0) {
      text += `🎉 *¡Ahorro Total en este presupuesto: ${formatPrice(totalSavings)}!*\n`;
    }

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
      items: quoteItems.map(item => {
        const isDisc = isDiscountItem(item);
        return {
          id: item.id,
          name: item.name,
          sku: item.sku || (isDisc ? 'DESCUENTO' : ''),
          quantity: item.quantity,
          customPrice: isDisc ? -Math.abs(item.customPrice) : item.customPrice,
          basePrice: item.basePrice !== undefined ? item.basePrice : (item.price || item.customPrice),
          discountType: item.discountType,
          discountValue: item.discountValue,
          cost: item.cost || 0,
          bundleParentId: item.bundleParentId,
          isIncludedInKit: item.isIncludedInKit,
          baseQuantity: item.baseQuantity
        };
      }),
      orderDiscountType,
      orderDiscountValue,
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
        if (isDiscountItem(parsedItem)) {
          newItems.push({
            id: `discount-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            name: parsedItem.name || "Descuento",
            description: "Descuento aplicado",
            price: parsedItem.unitPrice || 0,
            customPrice: parsedItem.unitPrice || 0,
            image_url: "",
            category: "Descuento",
            sku: "DESCUENTO",
            quantity: 1,
            is_active: true
          });
          return;
        }

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
            customPrice: parsedItem.unitPrice || 0,
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
            

            

            {/* Selector Visual Integrado (cuando no se está escribiendo en el buscador) */}
            {!searchTerm && (
              <div className="pt-3 border-t border-slate-100 mt-3">
                <InlineVisualProductSelector
                  products={products}
                  onAddProduct={addItem}
                  onAddProducts={addItems}
                />
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

            {/* Selector Desplegable de Medio de Pago / Plan */}
            <div className="mb-3">
              <label className="block text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1">
                Elegir Plan de Pago / Recargo
              </label>
              <select
                value={
                  paymentType === 'efectivo'
                    ? 'efectivo'
                    : (dbPaymentMethods.find(m => m.surcharge_percentage === cardSurcharge && m.installments === cardInstallments)?.id || 'custom')
                }
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === 'efectivo') {
                    setPaymentType('efectivo');
                  } else if (val === 'custom') {
                    setPaymentType('tarjeta');
                  } else if (val === 'cuota-42') {
                    setPaymentType('tarjeta');
                    setCardSurcharge(42);
                    setCardInstallments(6);
                  } else if (val === 'naranja-51') {
                    setPaymentType('tarjeta');
                    setCardSurcharge(51);
                    setCardInstallments(1);
                  } else {
                    const pm = dbPaymentMethods.find(m => m.id === val);
                    if (pm) {
                      setPaymentType('tarjeta');
                      setCardSurcharge(pm.surcharge_percentage);
                      setCardInstallments(pm.installments || 6);
                    }
                  }
                }}
                className="w-full px-2.5 py-1.5 text-xs font-bold border border-slate-200 rounded-lg outline-none bg-slate-50 text-slate-700 focus:ring-2 focus:ring-brand-500/10 focus:border-brand-500 cursor-pointer"
              >
                <option value="efectivo">💵 Efectivo / Transferencia (0% Recargo)</option>
                {dbPaymentMethods
                  .filter(m => m.surcharge_percentage > 0)
                  .map(pm => (
                    <option key={pm.id} value={pm.id}>
                      💳 {pm.name} (+{pm.surcharge_percentage}% Recargo{pm.installments > 1 ? ` - ${pm.installments} cuotas` : ''})
                    </option>
                  ))}
                {dbPaymentMethods.filter(m => m.surcharge_percentage > 0).length === 0 && (
                  <>
                    <option value="cuota-42">💳 Cuota Simple (Sept-26) (+42% Recargo - 6 cuotas)</option>
                    <option value="naranja-51">💳 Tarjeta Naranja (Sept-26) (+51% Recargo - 1 cuota)</option>
                  </>
                )}
                <option value="custom">⚙️ Personalizado (Ingresar recargo manual)</option>
              </select>
            </div>

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
                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                  0% Recargo
                </span>
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
                    <span className="font-bold text-slate-800 text-xs">Tarjeta / Financiación</span>
                  </div>
                  <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Recargo %</span>
                    <input 
                      type="number" 
                      value={cardSurcharge} 
                      onChange={(e) => {
                        setCardSurcharge(Number(e.target.value));
                        setPaymentType('tarjeta');
                      }} 
                      className="w-12 px-1.5 py-0.5 text-xs font-bold border border-slate-200 rounded text-center focus:ring-2 focus:ring-brand-500/10 outline-none bg-white text-red-500" 
                    />
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setPaymentType('tarjeta');
                          setCardSurcharge(42);
                          setCardInstallments(6);
                        }}
                        className={`px-1.5 py-0.5 text-[9px] font-bold rounded border transition-colors cursor-pointer ${cardSurcharge === 42 && paymentType === 'tarjeta' ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                        title="Aplicar 42% (Cuota Simple)"
                      >
                        42%
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPaymentType('tarjeta');
                          setCardSurcharge(51);
                          setCardInstallments(1);
                        }}
                        className={`px-1.5 py-0.5 text-[9px] font-bold rounded border transition-colors cursor-pointer ${cardSurcharge === 51 && paymentType === 'tarjeta' ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                        title="Aplicar 51% (Tarjeta Naranja)"
                      >
                        51%
                      </button>
                    </div>
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
              {totalQuoteCount > 0 && (
                <span className="text-[10px] font-bold bg-white text-slate-600 px-2 py-0.5 rounded-full border border-slate-200 shadow-2xs">
                  {kitGroups.length > 0 ? (
                    <>
                      <span className="text-emerald-700 font-black">{kitGroups.length} {kitGroups.length === 1 ? 'Kit' : 'Kits'}</span>
                      {standardItems.length > 0 && ` + ${standardItems.length} ind.`}
                      <span className="text-slate-400 font-normal ml-1">({totalQuoteCount} ítems)</span>
                    </>
                  ) : (
                    <>{totalQuoteCount} {totalQuoteCount === 1 ? 'ítem' : 'ítems'}</>
                  )}
                </span>
              )}
            </div>
          </h2>
          
          <div className="flex-1 overflow-y-auto pr-1 space-y-2 mb-4 max-h-[460px]">
            {quoteItems.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-1.5 py-8">
                <Calculator className="w-10 h-10 opacity-20" />
                <p className="font-bold text-xs">No hay productos agregados.</p>
                <p className="text-[11px] text-slate-400 font-medium">Seleccioná del catálogo o selector visual para presupuestar.</p>
              </div>
            ) : (
              <>
                {/* 1. KITS COMPLETOS AGRUPADOS */}
                {kitGroups.map(({ kit, included }) => {
                  const isExpanded = expandedKits[kit.id] ?? false;
                  const kitTotal = kit.customPrice * kit.quantity;
                  return (
                    <div 
                      key={kit.id} 
                      className="bg-white border-2 border-emerald-200/90 hover:border-emerald-300 rounded-xl p-3 shadow-xs transition-all animate-in fade-in zoom-in-95 duration-150"
                    >
                      {/* Header del Kit: Etiqueta y botón eliminar */}
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 bg-emerald-100/80 text-emerald-800 rounded-md border border-emerald-200">
                          <Package className="w-3 h-3 text-emerald-600" /> Kit Completo de Instalación
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveKit(kit.id, included)}
                          className="text-slate-400 hover:text-red-500 p-1 rounded hover:bg-red-50 transition-colors"
                          title="Eliminar kit completo y sus insumos incluidos"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Fila Principal: Nombre del Kit, Total y Controles */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-black text-slate-800 text-xs leading-snug">
                            {kit.name}
                          </p>
                          <span className="text-[11px] font-extrabold text-emerald-600 block mt-0.5">
                            {formatPrice(kitTotal)}
                          </span>
                        </div>

                        {/* Stepper + Input de Precio */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <div className="flex items-center bg-slate-100 border border-slate-200 rounded-lg overflow-hidden h-7">
                            <button 
                              type="button" 
                              onClick={() => handleUpdateKitQuantity(kit.id, kit.quantity - 1, included)} 
                              className="px-2 font-black text-slate-500 hover:bg-slate-200 leading-none text-xs h-full transition-colors"
                            >
                              -
                            </button>
                            <span className="px-2 font-black text-xs min-w-[1.5rem] text-center text-slate-800">
                              {kit.quantity}
                            </span>
                            <button 
                              type="button" 
                              onClick={() => handleUpdateKitQuantity(kit.id, kit.quantity + 1, included)} 
                              className="px-2 font-black text-slate-500 hover:bg-slate-200 leading-none text-xs h-full transition-colors"
                            >
                              +
                            </button>
                          </div>

                          <div className="flex items-center bg-slate-100 border border-slate-200 rounded-lg px-2 h-7">
                            <span className="text-[10px] font-bold text-slate-400 mr-0.5">$</span>
                            <input 
                              type="number" 
                              value={kit.customPrice}
                              onChange={(e) => updateCustomPrice(kit.id, Number(e.target.value))}
                              className="w-20 text-xs font-bold text-right outline-none bg-transparent text-slate-800"
                              title="Precio total del Kit"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Plegable con detalle de insumos incluidos */}
                      {included.length > 0 && (
                        <div className="mt-2.5 pt-2 border-t border-emerald-100/80">
                          <button
                            type="button"
                            onClick={() => toggleKitExpand(kit.id)}
                            className="w-full flex items-center justify-between text-[10px] font-bold text-emerald-800 bg-emerald-50/70 hover:bg-emerald-100/70 py-1.5 px-2.5 rounded-lg transition-colors border border-emerald-200/60"
                          >
                            <span className="flex items-center gap-1.5">
                              <Layers className="w-3.5 h-3.5 text-emerald-600" />
                              <span>{included.length} insumos y equipos incluidos (sin cargo adicional)</span>
                            </span>
                            <span className="flex items-center gap-0.5 text-[9px] uppercase tracking-wider font-black text-emerald-700">
                              {isExpanded ? "Ocultar" : "Ver detalle"}
                              {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            </span>
                          </button>

                          {isExpanded && (
                            <div className="mt-2 bg-slate-50/90 rounded-lg border border-slate-200/90 divide-y divide-slate-100 overflow-hidden animate-in fade-in duration-150">
                              {included.map(inc => (
                                <div key={inc.id} className="p-1.5 px-2.5 flex items-center justify-between gap-2 text-xs group hover:bg-white transition-colors">
                                  <div className="flex items-center gap-2 min-w-0 flex-1">
                                    <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[9px] font-black shrink-0">
                                      ✓
                                    </span>
                                    <span className="font-black text-slate-700 text-[11px] shrink-0">
                                      {inc.quantity}x
                                    </span>
                                    <span className="text-slate-600 text-[11px] truncate" title={inc.name}>
                                      {inc.name}
                                    </span>
                                    <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1 py-0.5 rounded border border-emerald-100 shrink-0">
                                      Incluido $0
                                    </span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => removeItem(inc.id)}
                                    className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-0.5"
                                    title="Quitar este insumo del kit"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* BANNER DE SUGERENCIAS AUTOMÁTICAS DE BONIFICACIÓN */}
                {discountSuggestions.length > 0 && (
                  <div className="space-y-1.5 mb-2">
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
                              {sug.description} → Ahorro: <strong>{formatPrice(sug.totalDiscount)}</strong>
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

                {/* 2. PRODUCTOS ESTÁNDAR / INDIVIDUALES */}
                {standardItems.map(item => (
                  <div 
                    key={item.id} 
                    className="bg-white border border-slate-200 hover:border-brand-300 rounded-xl p-2.5 shadow-xs transition-all relative group flex flex-col justify-between gap-2 animate-in fade-in zoom-in-95 duration-150"
                    title={item.name}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex-1 min-w-0 pr-2">
                        {item.sku && (
                          <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block leading-tight">
                            {item.sku}
                          </span>
                        )}
                        <p className="font-bold text-slate-800 text-xs truncate leading-snug">
                          {item.name}
                        </p>
                        <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                          <span className="text-[11px] font-black text-slate-800">
                            Total: {formatPrice(item.customPrice * item.quantity)}
                          </span>
                          {item.basePrice && item.basePrice > item.customPrice && (
                            <>
                              <span className="text-[10px] text-slate-400 line-through font-semibold">
                                {formatPrice(item.basePrice * item.quantity)}
                              </span>
                              <span className="text-[9px] font-black text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                                {item.discountValue || Math.round(((item.basePrice - item.customPrice) / item.basePrice) * 100)}% OFF
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {/* Stepper */}
                        <div className="flex items-center bg-slate-100 border border-slate-200 rounded-lg overflow-hidden h-7">
                          <button 
                            type="button" 
                            onClick={() => updateQuantity(item.id, item.quantity - 1)} 
                            className="px-2 font-black text-slate-500 hover:bg-slate-200 leading-none text-xs h-full transition-colors"
                          >
                            -
                          </button>
                          <span className="px-2 font-black text-xs min-w-[1.25rem] text-center text-slate-800">
                            {item.quantity}
                          </span>
                          <button 
                            type="button" 
                            onClick={() => updateQuantity(item.id, item.quantity + 1)} 
                            className="px-2 font-black text-slate-500 hover:bg-slate-200 leading-none text-xs h-full transition-colors"
                          >
                            +
                          </button>
                        </div>

                        {/* Precio editable */}
                        <div className="flex items-center bg-slate-100 border border-slate-200 rounded-lg px-2 h-7">
                          <span className="text-[10px] font-bold text-slate-400 mr-0.5">$</span>
                          <input 
                            type="number" 
                            value={item.customPrice}
                            onChange={(e) => updateCustomPrice(item.id, Number(e.target.value))}
                            className="w-18 text-xs font-bold text-right outline-none bg-transparent text-slate-800"
                            title="Precio unitario (editable)"
                          />
                        </div>

                        {/* Botón para aplicar o editar descuento por producto */}
                        <button
                          type="button"
                          onClick={() => toggleItemDiscount(item.id)}
                          className={`h-7 px-1.5 rounded-lg border text-[10px] font-bold flex items-center gap-0.5 transition-colors cursor-pointer ${
                            Boolean(item.discountValue && item.discountValue > 0) || (item.basePrice && item.basePrice > item.customPrice)
                              ? 'bg-amber-100 border-amber-300 text-amber-800'
                              : 'bg-slate-100 border-slate-200 text-slate-500 hover:bg-amber-50 hover:text-amber-700 hover:border-amber-200'
                          }`}
                          title="Configurar descuento para este producto"
                        >
                          <Percent className="w-2.5 h-2.5" />
                          {Boolean(item.discountValue && item.discountValue > 0) ? (
                            <span>{item.discountType === 'percentage' || !item.discountType ? `${item.discountValue}%` : `$`}</span>
                          ) : (item.basePrice && item.basePrice > item.customPrice ? (
                            <span>{Math.round(((item.basePrice - item.customPrice) / item.basePrice) * 100)}%</span>
                          ) : null)}
                        </button>

                        {/* Eliminar */}
                        <button 
                          type="button"
                          onClick={() => removeItem(item.id)}
                          className="text-slate-300 hover:text-red-500 p-1 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
                          title="Eliminar artículo"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Sub-fila expandida para configurar descuento de este producto */}
                    {openItemDiscountIds[item.id] && (
                      <div className="w-full mt-1 bg-amber-50/80 border border-amber-200/90 rounded-lg p-2 flex flex-wrap items-center justify-between gap-2 text-xs animate-in fade-in duration-150">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-bold text-amber-900">Descuento:</span>
                          <div className="flex items-center bg-white border border-amber-300 rounded overflow-hidden text-[10px]">
                            <button
                              type="button"
                              onClick={() => updateItemDiscount(item.id, 'percentage', item.discountValue || 0)}
                              className={`px-1.5 py-0.5 font-black cursor-pointer ${item.discountType === 'percentage' || !item.discountType ? 'bg-amber-500 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                            >
                              %
                            </button>
                            <button
                              type="button"
                              onClick={() => updateItemDiscount(item.id, 'fixed', item.discountValue || 0)}
                              className={`px-1.5 py-0.5 font-black cursor-pointer ${item.discountType === 'fixed' ? 'bg-amber-500 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                            >
                              $
                            </button>
                          </div>
                          <input
                            type="number"
                            value={item.discountValue || ""}
                            placeholder="0"
                            onChange={(e) => updateItemDiscount(item.id, item.discountType || 'percentage', Number(e.target.value))}
                            className="w-16 px-1.5 py-0.5 bg-white border border-amber-300 rounded text-xs font-bold text-right outline-none text-slate-800"
                          />
                          <span className="text-[10px] text-amber-800 font-bold">
                            {item.discountType === 'percentage' || !item.discountType ? '%' : '$'}
                          </span>
                        </div>

                        <div className="flex items-center gap-1">
                          {[5, 10, 15, 20].map((pct) => (
                            <button
                              key={pct}
                              type="button"
                              onClick={() => updateItemDiscount(item.id, 'percentage', pct)}
                              className={`px-1.5 py-0.5 rounded text-[9.5px] font-bold border transition-colors cursor-pointer ${
                                (item.discountType === 'percentage' || !item.discountType) && item.discountValue === pct
                                  ? 'bg-amber-500 text-white border-amber-600'
                                  : 'bg-white text-slate-600 border-amber-200 hover:bg-amber-100'
                              }`}
                            >
                              {pct}%
                            </button>
                          ))}
                          {Boolean(item.discountValue || (item.basePrice && item.basePrice > item.customPrice)) && (
                            <button
                              type="button"
                              onClick={() => updateItemDiscount(item.id, 'percentage', 0)}
                              className="px-1.5 py-0.5 rounded text-[9.5px] font-bold text-rose-600 hover:bg-rose-50 border border-rose-200 cursor-pointer"
                              title="Quitar descuento y volver a precio de lista"
                            >
                              Quitar
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {/* 3. BONIFICACIONES Y DESCUENTOS */}
                {discountItems.map(item => (
                  <div 
                    key={item.id} 
                    className="bg-amber-50/60 border border-amber-300 rounded-xl p-2.5 shadow-xs transition-all relative flex flex-col sm:flex-row sm:items-center justify-between gap-2 animate-in fade-in zoom-in-95 duration-150"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 bg-amber-200 text-amber-900 rounded border border-amber-300 shrink-0">
                        <Tag className="w-3 h-3 text-amber-700" /> Descuento
                      </span>
                      <p className="font-bold text-slate-800 text-xs truncate">
                        {item.name}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Botón rápido 15% (calcula 15% del total de productos) */}
                      {itemsGrossSubtotal > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            const disc15 = Math.round(itemsGrossSubtotal * 0.15);
                            updateCustomPrice(item.id, -disc15);
                          }}
                          className="px-1.5 py-1 bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 rounded text-[10px] font-black cursor-pointer transition-all"
                          title="Calcular 15% del total de productos"
                        >
                          15%
                        </button>
                      )}

                      {/* Input editable de monto de descuento */}
                      <div className="flex items-center bg-white border border-amber-400 rounded-lg px-2 h-7 shadow-2xs">
                        <span className="text-[10px] font-black text-amber-600 mr-0.5">-$</span>
                        <input 
                          type="number" 
                          value={Math.abs(item.customPrice) === 0 ? "" : Math.abs(item.customPrice)}
                          onChange={(e) => {
                            const val = Math.abs(Number(e.target.value));
                            updateCustomPrice(item.id, -val);
                          }}
                          placeholder="Monto..."
                          className="w-22 text-xs font-black text-right outline-none bg-transparent text-amber-900"
                          title="Ingresá el monto de descuento"
                        />
                      </div>

                      <button 
                        type="button"
                        onClick={() => removeItem(item.id)}
                        className="text-slate-400 hover:text-red-500 p-1 rounded hover:bg-red-50 transition-colors cursor-pointer"
                        title="Quitar bonificación"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>

          <div className="border-t border-slate-100 pt-4 space-y-2.5 mb-4">
            {/* Si hay descuentos por producto / combo */}
            {hasAnyItemDiscount && (
              <>
                <div className="flex justify-between text-xs font-medium text-slate-400">
                  <span>Precio de Lista:</span>
                  <span className="line-through">{formatPrice(totalListPrice)}</span>
                </div>
                <div className="flex justify-between text-xs font-bold text-amber-800 bg-amber-50/90 px-2.5 py-1.5 rounded-lg border border-amber-200">
                  <span className="flex items-center gap-1">
                    <Tag className="w-3.5 h-3.5 text-amber-600" /> Descuento Productos / Combo:
                  </span>
                  <span>-{formatPrice(totalItemDiscountAmount)}</span>
                </div>
              </>
            )}

            <div className="flex justify-between text-xs font-medium text-slate-700">
              <span>{orderDiscountAmount > 0 ? "Subtotal Neto:" : "Subtotal Productos:"}</span>
              <span className="font-bold">{formatPrice(itemsGrossSubtotal)}</span>
            </div>

            {/* Descuento global al total del presupuesto */}
            <div className="flex flex-col gap-2 p-2.5 bg-slate-50 rounded-xl border border-slate-200">
              <div className="flex items-center justify-between">
                <span className="text-[9.5px] font-black text-slate-700 uppercase tracking-wide flex items-center gap-1">
                  <Tag className="w-3.5 h-3.5 text-amber-600" /> Descuento al Total del Presupuesto
                </span>
                {orderDiscountAmount > 0 && (
                  <span className="text-[10.5px] font-black text-amber-700 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-md">
                    -{formatPrice(orderDiscountAmount)}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                <div className="flex items-center bg-white border border-slate-200 rounded-lg overflow-hidden text-xs shrink-0">
                  <button
                    type="button"
                    onClick={() => setOrderDiscountType('percentage')}
                    className={`px-2.5 py-1.5 font-black cursor-pointer transition-colors ${
                      orderDiscountType === 'percentage' ? 'bg-amber-500 text-white' : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    %
                  </button>
                  <button
                    type="button"
                    onClick={() => setOrderDiscountType('fixed')}
                    className={`px-2.5 py-1.5 font-black cursor-pointer transition-colors ${
                      orderDiscountType === 'fixed' ? 'bg-amber-500 text-white' : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    $
                  </button>
                </div>

                <div className="relative flex-1">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">
                    {orderDiscountType === 'percentage' ? '%' : '$'}
                  </span>
                  <input
                    type="number"
                    value={orderDiscountValue === 0 ? "" : orderDiscountValue}
                    onChange={(e) => setOrderDiscountValue(Math.max(0, Number(e.target.value)))}
                    placeholder={orderDiscountType === 'percentage' ? "Ej: 10 para 10%" : "Ej: 15000"}
                    className="w-full pl-6 pr-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none focus:ring-2 focus:ring-brand-500/10 focus:border-brand-500"
                  />
                </div>

                {orderDiscountValue > 0 && (
                  <button
                    type="button"
                    onClick={() => setOrderDiscountValue(0)}
                    className="text-xs font-bold text-slate-400 hover:text-red-500 px-1.5 py-1 rounded transition-colors cursor-pointer"
                    title="Quitar descuento"
                  >
                    ✕
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1.5 pt-0.5">
                <span className="text-[9px] font-bold text-slate-400 uppercase">Rápido:</span>
                {[5, 10, 15, 20].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => {
                      setOrderDiscountType('percentage');
                      setOrderDiscountValue(pct);
                    }}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-colors cursor-pointer ${
                      orderDiscountType === 'percentage' && orderDiscountValue === pct
                        ? 'bg-amber-500 text-white border-amber-600'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-amber-50 hover:border-amber-300'
                    }`}
                  >
                    {pct}%
                  </button>
                ))}
              </div>
            </div>

            {orderDiscountAmount > 0 && (
              <div className="flex justify-between text-xs font-bold text-amber-700 bg-amber-50 px-2.5 py-1.5 rounded-lg border border-amber-200">
                <span>Descuento Presupuesto ({orderDiscountType === 'percentage' ? `${orderDiscountValue}%` : 'Monto Fijo'}):</span>
                <span>-{formatPrice(orderDiscountAmount)}</span>
              </div>
            )}
            
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
            
            <div className="mt-3 space-y-2 pt-2 border-t border-slate-100">
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Nombre del Cliente (Opcional)</label>
                <input 
                  type="text" 
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="Ej. Juan Pérez"
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-brand-500/10 bg-slate-50 text-xs font-bold outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Aclaraciones / Detalle del Combo</label>
                <textarea 
                  value={kitDetailText}
                  onChange={(e) => setKitDetailText(e.target.value)}
                  placeholder="Ej. Con 15% de descuento aplicado en el total."
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-brand-500/10 bg-slate-50 text-xs font-bold outline-none resize-none h-14"
                />
              </div>
            </div>
          </div>

          <div className="space-y-2 mt-3">
            <Button 
              onClick={handleCopy} 
              disabled={quoteItems.length === 0}
              className="w-full py-2.5 rounded-xl text-xs font-black flex items-center justify-center gap-1.5"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? "¡Copiado al portapapeles!" : "Copiar Resumen para WhatsApp"}
            </Button>

            <button 
              type="button"
              onClick={() => setShowPrintModal(true)}
              disabled={quoteItems.length === 0}
              className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer"
              title="Abrir vista previa para descargar PDF, guardar o copiar imagen o imprimir"
            >
              <FileText className="w-4 h-4 text-blue-400" />
              <span>Imprimir / Exportar a PDF o Imagen</span>
            </button>

            {quoteItems.length > 0 && (
              <button 
                type="button"
                onClick={handleConvertToOrder}
                className="w-full py-2.5 px-4 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all shadow-sm"
              >
                <ShoppingBag className="w-3.5 h-3.5" />
                Crear Pedido con este Presupuesto
              </button>
            )}
          </div>
          
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

      {/* Modal Imprimir / Exportar Presupuesto */}
      <PrintableBudgetModal
        isOpen={showPrintModal}
        onClose={() => setShowPrintModal(false)}
        quoteItems={quoteItems}
        clientName={clientName}
        setClientName={setClientName}
        clientPhone={clientPhone}
        setClientPhone={setClientPhone}
        sellerName={sellerName}
        setSellerName={setSellerName}
        budgetNumber={budgetNumber}
        orderDiscountType={orderDiscountType}
        orderDiscountValue={orderDiscountValue}
        orderDiscountAmount={orderDiscountAmount}
        itemsGrossSubtotal={itemsGrossSubtotal}
        subtotal={subtotal}
        isFreeShipping={isFreeShipping}
        shippingCost={shippingCost}
        selectedPaymentMethod={selectedPaymentMethod}
        surcharge={surcharge}
        includeIVA={includeIVA}
        ivaAmount={ivaAmount}
        total={total}
        installmentValue={installmentValue}
        totalSavings={totalSavings}
        hasAnyItemDiscount={hasAnyItemDiscount}
        totalItemDiscountAmount={totalItemDiscountAmount}
        totalListPrice={totalListPrice}
        kitDetailText={kitDetailText}
      />
    </div>
  );
}

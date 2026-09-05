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
  UserPlus, 
  Building2, 
  MapPin, 
  Phone, 
  Truck, 
  CreditCard, 
  FileText, 
  ShieldCheck, 
  Sparkles, 
  CheckCircle2, 
  Package, 
  ArrowRight,
  RefreshCw,
  Layers,
  Database,
  Sliders,
  AlertCircle
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatPrice, cn } from "@/lib/utils";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

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
  quantity: number;
  priceList: number;
  priceCorralon: number;
  priceDistributor: number;
  customPrice?: number;
}

interface ClientOption {
  id: string;
  business_name: string;
  tax_id?: string;
  phone_primary?: string;
  billing_address?: string;
  is_wholesale?: boolean;
  default_discount_tier?: "auto" | "list" | "corralon" | "distributor";
}

export default function PresupuestosMayoristaPage() {
  const router = useRouter();

  // State: Master Wholesale Catalog from DB
  const [products, setProducts] = useState<WholesaleProduct[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [listNumber, setListNumber] = useState("13");
  const [listDate, setListDate] = useState("Septiembre 2026");
  const [discountCorralonPct, setDiscountCorralonPct] = useState(8);
  const [discountDistributorPct, setDiscountDistributorPct] = useState(14);
  const [loadingCatalog, setLoadingCatalog] = useState(true);

  // State: Client Selection
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [clientSearch, setClientSearch] = useState("");
  const [selectedClient, setSelectedClient] = useState<ClientOption | null>(null);
  const [showNewClientModal, setShowNewClientModal] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newClientTaxId, setNewClientTaxId] = useState("");
  const [newClientPhone, setNewClientPhone] = useState("");
  const [newClientAddress, setNewClientAddress] = useState("");
  const [creatingClient, setCreatingClient] = useState(false);

  // State: Cart Items
  const [cartItems, setCartItems] = useState<QuoteCartItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [productSearch, setProductSearch] = useState("");

  // Commercial Controls
  const [forcedTier, setForcedTier] = useState<"auto" | "list" | "corralon" | "distributor">("auto");
  const [freightType, setFreightType] = useState<string>("Flete Incluido (En depósito)");
  const [customFreightAmount, setCustomFreightAmount] = useState<number>(0);
  const [paymentCondition, setPaymentCondition] = useState<string>("Contado / Transferencia contra entrega");
  const [deliveryDays, setDeliveryDays] = useState<string>("48 a 72 hs hábiles");
  const [includeIva, setIncludeIva] = useState<boolean>(false);
  const [notes, setNotes] = useState<string>("");

  // UI status
  const [copiedWhatsapp, setCopiedWhatsapp] = useState(false);
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  const [createdOrderNumber, setCreatedOrderNumber] = useState<string | null>(null);

  // Load Wholesale Catalog (Lista 13)
  useEffect(() => {
    async function loadCatalog() {
      try {
        setLoadingCatalog(true);
        const res = await fetch("/api/admin/lista-mayorista-data");
        const json = await res.json();
        if (json.success && json.products) {
          const activeList = json.savedDbConfig;
          if (activeList) {
            if (activeList.listNumber) setListNumber(activeList.listNumber);
            if (activeList.listDate) setListDate(activeList.listDate);
            if (activeList.globalDiscountCorralonPct) setDiscountCorralonPct(activeList.globalDiscountCorralonPct);
            if (activeList.globalDiscountDistributorPct) setDiscountDistributorPct(activeList.globalDiscountDistributorPct);
          }

          // Compute prices based on active parameters
          const corrPct = activeList?.globalDiscountCorralonPct ?? 8;
          const distPct = activeList?.globalDiscountDistributorPct ?? 14;

          const prods: WholesaleProduct[] = json.products
            .filter((p: any) => p.defaultCommercialized !== false)
            .map((p: any) => {
              const baseCost = p.costBaseReal || 50000;
              const priceList = Math.round(baseCost * 1.35);
              const priceCorralon = Math.round(priceList * (1 - corrPct / 100));
              const priceDistributor = Math.round(priceList * (1 - distPct / 100));

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
          setCategories(json.categories || []);
        }
      } catch (err) {
        console.error("Error loading wholesale catalog:", err);
      } finally {
        setLoadingCatalog(false);
      }
    }

    async function loadClients() {
      try {
        const { data } = await supabase
          .from("clients")
          .select("id, business_name, tax_id, phone_primary, billing_address, is_wholesale")
          .order("business_name");
        if (data) setClients(data);
      } catch (err) {
        console.error("Error loading clients:", err);
      }
    }

    loadCatalog();
    loadClients();
  }, []);

  // Compute Volume Tier and Totals
  const totalTanksCount = useMemo(() => {
    return cartItems.reduce((acc, item) => acc + item.quantity, 0);
  }, [cartItems]);

  const activeTier = useMemo(() => {
    if (forcedTier !== "auto") return forcedTier;
    if (totalTanksCount >= 20) return "distributor";
    if (totalTanksCount >= 10) return "corralon";
    return "list";
  }, [totalTanksCount, forcedTier]);

  const activeTierLabel = useMemo(() => {
    switch (activeTier) {
      case "distributor":
        return `Distribuidor (20+ u) — ${discountDistributorPct}% OFF`;
      case "corralon":
        return `Corralón (10-19 u) — ${discountCorralonPct}% OFF`;
      default:
        return "Precio de Lista (3 a 9 u)";
    }
  }, [activeTier, discountCorralonPct, discountDistributorPct]);

  // Cart Calculations
  const calculatedItems = useMemo(() => {
    return cartItems.map(item => {
      let unitPrice = item.priceList;
      if (activeTier === "corralon") unitPrice = item.priceCorralon;
      if (activeTier === "distributor") unitPrice = item.priceDistributor;
      if (item.customPrice !== undefined && item.customPrice > 0) unitPrice = item.customPrice;

      const subtotal = unitPrice * item.quantity;
      return {
        ...item,
        effectiveUnitPrice: unitPrice,
        subtotal
      };
    });
  }, [cartItems, activeTier]);

  const subtotalProducts = useMemo(() => {
    return calculatedItems.reduce((acc, item) => acc + item.subtotal, 0);
  }, [calculatedItems]);

  const totalFreight = useMemo(() => {
    return freightType.includes("Incluido") ? 0 : customFreightAmount;
  }, [freightType, customFreightAmount]);

  const ivaAmount = useMemo(() => {
    return includeIva ? Math.round((subtotalProducts + totalFreight) * 0.21) : 0;
  }, [includeIva, subtotalProducts, totalFreight]);

  const grandTotal = useMemo(() => {
    return subtotalProducts + totalFreight + ivaAmount;
  }, [subtotalProducts, totalFreight, ivaAmount]);

  // Cart Actions
  const handleAddToCart = (product: WholesaleProduct, variant: "standard" | "ciego" = "standard") => {
    setCartItems(prev => {
      const existingIdx = prev.findIndex(
        i => i.productId === product.id && i.variant === variant
      );
      if (existingIdx >= 0) {
        const copy = [...prev];
        copy[existingIdx].quantity += 1;
        return copy;
      }
      return [
        ...prev,
        {
          id: `${product.id}-${variant}-${Date.now()}`,
          productId: product.id,
          name: product.name,
          category: product.category,
          liters: product.liters,
          variant,
          quantity: 1,
          priceList: product.priceList,
          priceCorralon: product.priceCorralon,
          priceDistributor: product.priceDistributor
        }
      ];
    });
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
        item.id === cartItemId
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

  // Create Client
  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClientName.trim()) return;
    try {
      setCreatingClient(true);
      const { data, error } = await supabase
        .from("clients")
        .insert({
          business_name: newClientName.trim(),
          tax_id: newClientTaxId.trim() || null,
          phone_primary: newClientPhone.trim() || "S/D",
          billing_address: newClientAddress.trim() || null,
          is_wholesale: true
        })
        .select()
        .single();

      if (error) throw error;
      if (data) {
        setClients(prev => [data, ...prev]);
        setSelectedClient(data);
        setShowNewClientModal(false);
        setNewClientName("");
        setNewClientTaxId("");
        setNewClientPhone("");
        setNewClientAddress("");
      }
    } catch (err: any) {
      alert("Error al crear cliente: " + err.message);
    } finally {
      setCreatingClient(false);
    }
  };

  // WhatsApp Quote Text Generation
  const generateWhatsAppMessage = () => {
    const clientName = selectedClient ? selectedClient.business_name : "Estimado Cliente";
    const dateStr = new Date().toLocaleDateString("es-AR");

    const lines: string[] = [
      `*PRESUPUESTO MAYORISTA N° ${listNumber}* 📋`,
      `*Zono Construcción / AquaFort*`,
      `📅 Fecha: ${dateStr}`,
      `👤 Cliente: *${clientName}*`,
      "",
      `🏷️ *Escala Aplicada:* ${activeTierLabel}`,
      `📦 *Total Unidades:* ${totalTanksCount} tanques`,
      "",
      "--- *DETALLE DEL PEDIDO* ---"
    ];

    calculatedItems.forEach(item => {
      const variantTag = item.variant === "ciego" ? " [CIEGO]" : "";
      lines.push(`• *${item.quantity}x* ${item.name}${variantTag}`);
      lines.push(`   Unit: $${item.effectiveUnitPrice.toLocaleString("es-AR")} | Subtotal: $${item.subtotal.toLocaleString("es-AR")}`);
    });

    lines.push("");
    lines.push(`💰 *SUBTOTAL PRODUCTOS:* $${subtotalProducts.toLocaleString("es-AR")}`);
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
    const clientName = selectedClient ? selectedClient.business_name : "Cliente Mayorista";

    // Header Branding
    doc.setFillColor(0, 21, 56);
    doc.rect(0, 0, 210, 32, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("ZONO CONSTRUCCIÓN", 14, 13);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text("AquaFort & BioFort — Fábrica y Distribución Mayorista", 14, 20);
    doc.text(`Lista Oficial N° ${listNumber} (${listDate})`, 14, 26);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("PRESUPUESTO MAYORISTA", 196, 15, { align: "right" });
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`Fecha: ${new Date().toLocaleDateString("es-AR")}`, 196, 22, { align: "right" });
    doc.text(`Escala: ${activeTierLabel.split("—")[0]}`, 196, 28, { align: "right" });

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
    doc.text(`CUIT: ${selectedClient?.tax_id || "Consumidor Final / No informado"}`, 18, 51);
    doc.text(`Dirección: ${selectedClient?.billing_address || "A convenir"}`, 18, 56);

    doc.text(`Condición Pago: ${paymentCondition}`, 115, 45);
    doc.text(`Entrega: ${deliveryDays}`, 115, 51);
    doc.text(`Flete: ${freightType}`, 115, 56);

    // Items Table
    const tableBody = calculatedItems.map(item => [
      item.quantity.toString(),
      `${item.name}${item.variant === "ciego" ? " (CIEGO)" : " (Estándar)"}`,
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

    doc.setFillColor(241, 245, 249);
    doc.roundedRect(120, finalY, 76, 28, 2, 2, "F");

    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text(`Subtotal Productos (${totalTanksCount} u):`, 124, finalY + 7);
    doc.text(`$${subtotalProducts.toLocaleString("es-AR")}`, 192, finalY + 7, { align: "right" });

    doc.text("Logística / Flete:", 124, finalY + 13);
    doc.text(totalFreight > 0 ? `$${totalFreight.toLocaleString("es-AR")}` : "Incluido", 192, finalY + 13, { align: "right" });

    if (includeIva) {
      doc.text("IVA (21%):", 124, finalY + 19);
      doc.text(`$${ivaAmount.toLocaleString("es-AR")}`, 192, finalY + 19, { align: "right" });
    }

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 21, 56);
    doc.text("TOTAL FINAL:", 124, finalY + 25);
    doc.text(`$${grandTotal.toLocaleString("es-AR")}`, 192, finalY + 25, { align: "right" });

    // Notes
    if (notes) {
      doc.setFontSize(8);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(100, 116, 139);
      doc.text(`Obs: ${notes}`, 14, finalY + 10);
    }

    doc.save(`Presupuesto_Mayorista_${clientName.replace(/\s+/g, "_")}_Lista${listNumber}.pdf`);
  };

  // Convert to Wholesale Order in Supabase
  const handleCreateWholesaleOrder = async () => {
    if (cartItems.length === 0) {
      alert("Agregá productos al presupuesto antes de confirmar el pedido.");
      return;
    }
    if (!selectedClient) {
      alert("Por favor seleccioná un cliente para registrar el pedido.");
      return;
    }

    if (!confirm(`¿Confirmar y registrar Pedido Mayorista para "${selectedClient.business_name}" por un total de $${grandTotal.toLocaleString("es-AR")} (${totalTanksCount} tanques)?`)) {
      return;
    }

    try {
      setIsCreatingOrder(true);
      const { data: userData } = await supabase.auth.getUser();
      const sellerId = userData.user?.id || null;

      // Create Order
      const { data: orderData, error: orderError } = await supabase
        .from("orders")
        .insert({
          seller_id: sellerId,
          client_id: selectedClient.id,
          customer_name: selectedClient.business_name,
          address: selectedClient.billing_address || "Entrega mayorista a coordinar",
          channel: "mayorista",
          category: "Mayorista",
          total_amount: grandTotal,
          freight_type: freightType,
          payment_status: "Pendiente",
          status: "Pendiente",
          order_date: new Date().toISOString(),
          totals: {
            subtotal: subtotalProducts,
            freight: totalFreight,
            tax: ivaAmount,
            total: grandTotal,
            tanksCount: totalTanksCount,
            tier: activeTier
          },
          delivery_notes: `[Mayorista Lista ${listNumber}] Escala: ${activeTierLabel}. ${notes}`
        })
        .select()
        .single();

      if (orderError) throw orderError;

      // Create Order Items
      if (orderData && calculatedItems.length > 0) {
        const itemsToInsert = calculatedItems.map(item => ({
          order_id: orderData.id,
          product_id: item.productId,
          product_name: `${item.name}${item.variant === "ciego" ? " (CIEGO)" : " (Estándar)"}`,
          quantity: item.quantity,
          unit_price: item.effectiveUnitPrice,
          subtotal: item.subtotal
        }));

        await supabase.from("order_items").insert(itemsToInsert);
      }

      setCreatedOrderNumber(orderData.id.slice(0, 8).toUpperCase());
      alert(`🎉 ¡Pedido Mayorista registrado con éxito! (ID: #${orderData.id.slice(0, 8).toUpperCase()})`);
      router.push("/vendedores/pedidos");

    } catch (err: any) {
      alert("Error al registrar pedido: " + (err.message || "Error desconocido"));
    } finally {
      setIsCreatingOrder(false);
    }
  };

  // Normalization helper for multi-word search
  const normalizeText = (text: string) => {
    if (!text) return "";
    return text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // remove accents
      .replace(/[-_()]/g, " "); // replace hyphens and parentheses with spaces
  };

  // Filter Catalog (Multi-word search)
  const filteredProducts = useMemo(() => {
    const trimmed = productSearch.trim();
    const searchTerms = trimmed ? normalizeText(trimmed).split(/\s+/).filter(Boolean) : [];

    return products.filter(p => {
      const matchCat = selectedCategory === "all" || p.category === selectedCategory;

      if (searchTerms.length === 0) {
        return matchCat;
      }

      const targetText = normalizeText(
        `${p.name} ${p.category} ${p.family || ""} ${p.liters || ""}`
      );

      const matchesSearch = searchTerms.every(term => targetText.includes(term));

      if (selectedCategory !== "all") {
        return matchCat && matchesSearch;
      }
      return matchesSearch;
    });
  }, [products, selectedCategory, productSearch]);

  // Filter Clients (Multi-word search)
  const filteredClients = useMemo(() => {
    if (!clientSearch.trim()) return clients.slice(0, 10);
    const searchTerms = normalizeText(clientSearch.trim()).split(/\s+/).filter(Boolean);
    return clients.filter(c => {
      const targetText = normalizeText(
        `${c.business_name} ${c.tax_id || ""} ${c.phone_primary || ""} ${c.billing_address || ""}`
      );
      return searchTerms.every(term => targetText.includes(term));
    }).slice(0, 15);
  }, [clients, clientSearch]);

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-24">
      {/* Top Banner */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
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
              Armá cotizaciones por volumen para Corralones y Distribuidores, alterná variantes estándar/ciego y convertí en pedido mayorista.
            </p>
          </div>
        </div>

        {/* Top Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href="/admin/lista-mayorista"
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Configurar Lista {listNumber}</span>
          </Link>
          <Link
            href="/vendedores/pedidos"
            className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
          >
            <Package className="w-3.5 h-3.5" />
            <span>Ver Tablero de Pedidos</span>
          </Link>
        </div>
      </div>

      {/* Main Grid: Left (Catalog & Client) + Right (Cart & Presupuesto) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: Client Selector & Products Catalog (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* 1. Client Card */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-blue-600" />
                <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                  1. Cliente Mayorista / Corralón
                </h2>
              </div>
              <button
                onClick={() => setShowNewClientModal(true)}
                className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 cursor-pointer"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>+ Nuevo Cliente</span>
              </button>
            </div>

            {selectedClient ? (
              <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-2xl flex items-center justify-between">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-black text-slate-900 text-sm">{selectedClient.business_name}</span>
                    {selectedClient.is_wholesale && (
                      <span className="text-[10px] bg-blue-600 text-white px-2 py-0.5 rounded-full font-bold">Mayorista</span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 flex items-center gap-3">
                    <span>CUIT: {selectedClient.tax_id || "S/D"}</span>
                    <span>Tel: {selectedClient.phone_primary || "S/D"}</span>
                  </div>
                  {selectedClient.billing_address && (
                    <div className="text-[11px] text-slate-600 flex items-center gap-1 mt-1">
                      <MapPin className="w-3 h-3 text-slate-400" />
                      <span>{selectedClient.billing_address}</span>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setSelectedClient(null)}
                  className="px-2.5 py-1 text-xs font-bold text-slate-500 hover:text-red-600 bg-white border border-slate-200 rounded-lg cursor-pointer"
                >
                  Cambiar
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    placeholder="Buscar por Razón Social o CUIT..."
                    value={clientSearch}
                    onChange={(e) => setClientSearch(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:border-blue-500 focus:bg-white transition-all"
                  />
                </div>
                {filteredClients.length > 0 && (
                  <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 bg-white">
                    {filteredClients.map(c => (
                      <button
                        key={c.id}
                        onClick={() => {
                          setSelectedClient(c);
                          setClientSearch("");
                        }}
                        className="w-full text-left px-3.5 py-2 hover:bg-blue-50/50 flex items-center justify-between text-xs cursor-pointer transition-colors"
                      >
                        <span className="font-bold text-slate-800">{c.business_name}</span>
                        <span className="text-slate-400 font-mono text-[11px]">{c.tax_id || "Sin CUIT"}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 2. Product Catalog Selection */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-blue-600" />
                <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                  2. Catálogo Lista {listNumber}
                </h2>
              </div>
              <div className="relative w-48">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  placeholder="Filtrar modelo..."
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:bg-white focus:border-blue-500"
                />
              </div>
            </div>

            {/* Category Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
              <button
                onClick={() => setSelectedCategory("all")}
                className={cn(
                  "px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all cursor-pointer",
                  selectedCategory === "all" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                )}
              >
                Todos ({products.length})
              </button>
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={cn(
                    "px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all cursor-pointer",
                    selectedCategory === cat ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Product Table / Cards */}
            {loadingCatalog ? (
              <div className="py-12 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
                <span>Cargando catálogo oficial de Lista {listNumber}...</span>
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="py-10 text-center text-slate-400 text-xs border border-dashed border-slate-200 rounded-2xl space-y-2">
                <p>No se encontraron productos para <strong className="text-slate-700">&quot;{productSearch}&quot;</strong>.</p>
                <button
                  onClick={() => { setProductSearch(""); setSelectedCategory("all"); }}
                  className="text-blue-600 font-bold hover:underline cursor-pointer"
                >
                  Limpiar búsqueda y ver todo el catálogo
                </button>
              </div>
            ) : (
              <div className="max-h-[500px] overflow-y-auto space-y-2 pr-1">
                {filteredProducts.map(p => {
                  const displayPrice = activeTier === "distributor" ? p.priceDistributor : (activeTier === "corralon" ? p.priceCorralon : p.priceList);

                  return (
                    <div
                      key={p.id}
                      className="p-3 bg-slate-50 hover:bg-slate-100/80 border border-slate-200/70 rounded-2xl flex items-center justify-between gap-3 transition-colors"
                    >
                      <div className="space-y-0.5 min-w-0 flex-1">
                        <div className="font-bold text-slate-900 text-xs truncate">
                          {p.name}
                        </div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-2">
                          <span className="font-medium text-slate-400">{p.category}</span>
                          <span className="text-slate-300">•</span>
                          <span>Lista: ${p.priceList.toLocaleString("es-AR")}</span>
                          <span className="text-slate-300">•</span>
                          <span className="text-blue-600 font-bold">Corr: ${p.priceCorralon.toLocaleString("es-AR")}</span>
                          <span className="text-slate-300">•</span>
                          <span className="text-indigo-600 font-bold">Dist: ${p.priceDistributor.toLocaleString("es-AR")}</span>
                        </div>
                      </div>

                      {/* Quick Add Buttons: Estándar & Ciego */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => handleAddToCart(p, "standard")}
                          className="px-2.5 py-1.5 bg-white hover:bg-blue-600 hover:text-white border border-slate-200 text-slate-700 rounded-xl text-[11px] font-bold transition-all flex items-center gap-1 shadow-xs cursor-pointer"
                          title="Agregar con salida estándar"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Estándar</span>
                        </button>
                        <button
                          onClick={() => handleAddToCart(p, "ciego")}
                          className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-500 hover:text-white border border-amber-200 text-amber-800 rounded-xl text-[11px] font-bold transition-all flex items-center gap-1 shadow-xs cursor-pointer"
                          title="Agregar variante CIEGO (sin salida)"
                        >
                          <Plus className="w-3 h-3" />
                          <span>CIEGO</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Cart, Volume Tier & Presupuesto Summary (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Volume Scale Status Card */}
          <div className="bg-slate-900 text-white p-5 rounded-3xl shadow-md space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-black uppercase tracking-wider text-slate-300">
                  Escala de Volumen Activa
                </span>
              </div>
              <span className="text-xs font-black bg-blue-500/30 text-blue-300 border border-blue-400/30 px-2.5 py-0.5 rounded-full">
                {totalTanksCount} {totalTanksCount === 1 ? "tanque" : "tanques"} en total
              </span>
            </div>

            <div className="p-3 bg-slate-800/80 rounded-2xl border border-slate-700/60 space-y-1">
              <div className="text-sm font-black text-white flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>{activeTierLabel}</span>
              </div>
              <p className="text-[11px] text-slate-400">
                {totalTanksCount < 10 && (
                  <span>Agregá <strong className="text-amber-300">{10 - totalTanksCount} tanques más</strong> para alcanzar la Escala Corralón (-{discountCorralonPct}%).</span>
                )}
                {totalTanksCount >= 10 && totalTanksCount < 20 && (
                  <span>Agregá <strong className="text-amber-300">{20 - totalTanksCount} tanques más</strong> para alcanzar la Escala Distribuidor (-{discountDistributorPct}%).</span>
                )}
                {totalTanksCount >= 20 && (
                  <span className="text-emerald-300 font-bold">¡Máxima escala de Distribuidor alcanzada! (-{discountDistributorPct}%)</span>
                )}
              </p>
            </div>

            {/* Forced Tier Selector */}
            <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-800">
              <span className="text-slate-400">Forzar escala manual:</span>
              <select
                value={forcedTier}
                onChange={(e) => setForcedTier(e.target.value as any)}
                className="bg-slate-800 text-white text-xs font-bold px-2 py-1 rounded-lg border border-slate-700 outline-none"
              >
                <option value="auto">Automático por Cantidad</option>
                <option value="list">Fijo Precio Lista (3-9u)</option>
                <option value="corralon">Fijo Corralón (10-19u)</option>
                <option value="distributor">Fijo Distribuidor (20+u)</option>
              </select>
            </div>
          </div>

          {/* Cart Items Detail */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <Layers className="w-4 h-4 text-blue-600" />
                <span>Ítems del Presupuesto ({cartItems.length})</span>
              </h2>
              {cartItems.length > 0 && (
                <button
                  onClick={handleClearCart}
                  className="text-xs font-bold text-slate-400 hover:text-red-600 transition-colors cursor-pointer"
                >
                  Vaciar
                </button>
              )}
            </div>

            {cartItems.length === 0 ? (
              <div className="py-10 text-center text-slate-400 text-xs border border-dashed border-slate-200 rounded-2xl">
                Seleccioná tanques del catálogo de la izquierda para armar el presupuesto.
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[350px] overflow-y-auto pr-1">
                {calculatedItems.map(item => (
                  <div
                    key={item.id}
                    className="p-3 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-bold text-slate-900 text-xs leading-tight">
                          {item.name}
                        </div>
                        <div className="flex items-center gap-1.5 mt-1">
                          <button
                            onClick={() => handleToggleVariant(item.id)}
                            className={cn(
                              "text-[10px] font-black px-2 py-0.5 rounded-md cursor-pointer transition-all",
                              item.variant === "ciego"
                                ? "bg-amber-100 text-amber-800 border border-amber-300"
                                : "bg-slate-200 text-slate-700"
                            )}
                          >
                            {item.variant === "ciego" ? "CIEGO (Sin salida)" : "Estándar (Con salida)"}
                          </button>
                        </div>
                      </div>

                      <button
                        onClick={() => handleRemoveItem(item.id)}
                        className="text-slate-400 hover:text-red-600 p-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Quantity & Price Controls */}
                    <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-200/50">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleUpdateQuantity(item.id, item.quantity - 1)}
                          className="w-6 h-6 rounded-lg bg-white border border-slate-300 flex items-center justify-center font-bold hover:bg-slate-100 cursor-pointer"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => handleUpdateQuantity(item.id, parseInt(e.target.value) || 1)}
                          className="w-10 text-center font-bold bg-white border border-slate-200 rounded-lg py-0.5 outline-none"
                        />
                        <button
                          onClick={() => handleUpdateQuantity(item.id, item.quantity + 1)}
                          className="w-6 h-6 rounded-lg bg-white border border-slate-300 flex items-center justify-center font-bold hover:bg-slate-100 cursor-pointer"
                        >
                          +
                        </button>
                      </div>

                      <div className="text-right">
                        <span className="text-[11px] text-slate-400">
                          ${item.effectiveUnitPrice.toLocaleString("es-AR")} c/u =
                        </span>{" "}
                        <span className="font-black text-slate-900">
                          ${item.subtotal.toLocaleString("es-AR")}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Commercial Parameters Accordion */}
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-700">Flete / Logística:</span>
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

              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-700">Condición de Pago:</span>
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

              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-700">Facturación:</span>
                <button
                  onClick={() => setIncludeIva(!includeIva)}
                  className={cn(
                    "px-2.5 py-1 rounded-lg font-bold transition-all text-xs cursor-pointer",
                    includeIva ? "bg-indigo-600 text-white" : "bg-white border border-slate-200 text-slate-700"
                  )}
                >
                  {includeIva ? "Factura A (+21% IVA)" : "Precio Final"}
                </button>
              </div>
            </div>

            {/* Totals Summary */}
            <div className="p-4 bg-slate-900 text-white rounded-2xl space-y-2">
              <div className="flex justify-between text-xs text-slate-400">
                <span>Subtotal ({totalTanksCount} tanques):</span>
                <span>${subtotalProducts.toLocaleString("es-AR")}</span>
              </div>
              {totalFreight > 0 && (
                <div className="flex justify-between text-xs text-slate-400">
                  <span>Flete:</span>
                  <span>${totalFreight.toLocaleString("es-AR")}</span>
                </div>
              )}
              {includeIva && (
                <div className="flex justify-between text-xs text-slate-400">
                  <span>IVA (21%):</span>
                  <span>${ivaAmount.toLocaleString("es-AR")}</span>
                </div>
              )}
              <div className="flex justify-between items-baseline pt-2 border-t border-slate-800">
                <span className="font-black text-sm text-slate-200">TOTAL PRESUPUESTO:</span>
                <span className="font-black text-xl text-emerald-400 font-mono">
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

              <button
                onClick={handleCreateWholesaleOrder}
                disabled={isCreatingOrder || cartItems.length === 0}
                className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-2xl text-xs font-black transition-all flex items-center justify-center gap-2 shadow-md shadow-blue-600/20 cursor-pointer"
              >
                {isCreatingOrder ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Package className="w-4 h-4" />
                )}
                <span>{isCreatingOrder ? "Registrando Pedido..." : "Generar Pedido Mayorista"}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Modal: Create Client */}
      {showNewClientModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-black text-slate-900 text-sm flex items-center gap-2">
                <Building2 className="w-4 h-4 text-blue-600" />
                <span>Nuevo Cliente Mayorista</span>
              </h3>
              <button
                onClick={() => setShowNewClientModal(false)}
                className="text-slate-400 hover:text-slate-600 text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateClient} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Razón Social / Nombre Comercial *</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Corralón Don Pedro S.A."
                  value={newClientName}
                  onChange={(e) => setNewClientName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-blue-500"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">CUIT / DNI</label>
                <input
                  type="text"
                  placeholder="30-XXXXXXXX-X"
                  value={newClientTaxId}
                  onChange={(e) => setNewClientTaxId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-blue-500"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Teléfono / WhatsApp</label>
                <input
                  type="text"
                  placeholder="11-XXXX-XXXX"
                  value={newClientPhone}
                  onChange={(e) => setNewClientPhone(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-blue-500"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Dirección de Depósito / Entrega</label>
                <input
                  type="text"
                  placeholder="Calle, Número, Localidad"
                  value={newClientAddress}
                  onChange={(e) => setNewClientAddress(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-blue-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowNewClientModal(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creatingClient}
                  className="px-4 py-2 bg-blue-600 text-white rounded-xl font-bold cursor-pointer disabled:opacity-50"
                >
                  {creatingClient ? "Guardando..." : "Guardar Cliente"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

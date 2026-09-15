"use client";

import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { formatPrice } from "@/lib/utils";
import {
  Search,
  X,
  ShoppingCart,
  Copy,
  Plus,
  Minus,
  Trash2,
  Sparkles,
  ArrowRight,
  RefreshCw,
  Info,
  CheckCircle2
} from "lucide-react";

interface DbProduct {
  id: string;
  name: string;
  sku: string | null;
  category: string;
  price: number;
  image_url: string | null;
  is_active: boolean;
}

interface GroupItem {
  id: string;
  product: DbProduct;
  measure: string;
  price: number;
}

interface ProductGroup {
  id: string;
  name: string;
  category: string;
  image_url: string | null;
  items: GroupItem[];
}

interface CartItem {
  product: DbProduct;
  quantity: number;
}

// Orden prioritario de familias en el cotizador (todas las cuplas juntas al inicio, luego codos, tees, caños, etc.)
const TF_GROUP_ORDER = [
  "Cuplas",
  "Cupla Inserto Hembra",
  "Cupla Inserto Macho",
  "Codos 90°",
  "Codo Inserto Hembra 90°",
  "Tee",
  "Tee Inserto Hembra",
  "Caño fusión",
  "Buje de reducción",
  "Curvas 90°",
  "Sobrepaso",
  "Tapas",
  "Unión doble",
  "Llaves de Paso",
  "Llave esférica manija corta",
];

// Subcategorías / Grupos de Termofusión para filtro rápido
const TF_GROUP_FILTERS = [
  { id: "all", label: "Todos los Accesorios" },
  { id: "Cuplas", label: "Cuplas" },
  { id: "Cupla Inserto Hembra", label: "Cuplas Hembra" },
  { id: "Cupla Inserto Macho", label: "Cuplas Macho" },
  { id: "Codos 90°", label: "Codos" },
  { id: "Codo Inserto Hembra 90°", label: "Codos Hembra" },
  { id: "Tee", label: "Tee" },
  { id: "Tee Inserto Hembra", label: "Tee Hembra" },
  { id: "Caño fusión", label: "Caños" },
  { id: "Buje de reducción", label: "Bujes" },
  { id: "Curvas 90°", label: "Curvas 90°" },
  { id: "Sobrepaso", label: "Sobrepasos" },
  { id: "Tapas", label: "Tapas" },
  { id: "Unión doble", label: "Uniones Dobles" },
  { id: "Llaves de Paso", label: "Llaves de Paso" },
  { id: "Llave esférica manija corta", label: "Llaves Esféricas" },
];

/**
 * Normaliza y clasifica un producto de Termofusión en su grupo familiar
 * y extrae la medida limpia para mostrar dentro de la tarjeta.
 */
function getTfGroupAndMeasure(p: DbProduct): { group: string; measure: string } {
  const name = p.name;
  const lower = name.toLowerCase();

  // 1. Buje de reducción
  if (lower.includes("buje")) {
    const m = name.match(/(\d+\s*x\s*\d+)/i);
    return { group: "Buje de reducción", measure: m ? m[1].replace(/\s+/g, " ") + " mm" : name };
  }

  // 2. Caño fusión
  if (lower.includes("caño") || lower.includes("cano")) {
    const m = name.match(/(\d+\s*mm)/i);
    const spec = name.match(/(\d+,\d+\s*mm)/i);
    return { group: "Caño fusión", measure: (m ? m[1] : "") + (spec ? " (" + spec[1] + ")" : "") };
  }

  // 3. Codos 90°
  if (lower.includes("codo")) {
    if (lower.includes("inserto") || lower.includes("cim")) {
      const m = name.match(/(1\/2|3\/4)\s*x\s*(\d+\s*mm)/i);
      return { group: "Codo Inserto Hembra 90°", measure: m ? m[2] + " x " + m[1] + '"' : name };
    }
    const m = name.match(/(\d+\s*mm)/i);
    return { group: "Codos 90°", measure: m ? m[1] : name };
  }

  // 4. Cuplas
  if (lower.includes("cupla")) {
    if (lower.includes("macho") || lower.includes("cuimm")) {
      const m = name.match(/(1\/2|3\/4|3\/8)\s*x\s*(\d+\s*mm)/i);
      return { group: "Cupla Inserto Macho", measure: m ? m[2] + " x " + m[1] + '"' : name };
    }
    if (lower.includes("hembra") || lower.includes("cuimh")) {
      const m = name.match(/(1\/2|3\/4|3\/8)\s*x\s*(\d+\s*mm)/i);
      return { group: "Cupla Inserto Hembra", measure: m ? m[2] + " x " + m[1] + '"' : name };
    }
    const m = name.match(/(\d+\s*mm)/i);
    return { group: "Cuplas", measure: m ? m[1] : name };
  }

  // 5. Sobrepaso
  if (lower.includes("sobrepaso")) {
    const m = name.match(/(\d+\s*mm)/i);
    return { group: "Sobrepaso", measure: "Corto " + (m ? m[1] : "") };
  }

  // 6. Curvas 90°
  if (lower.includes("curva")) {
    const m = name.match(/(\d+\s*mm)/i);
    return { group: "Curvas 90°", measure: m ? m[1] : name };
  }

  // 7. Llave esférica manija corta
  if (lower.includes("esferica") || lower.includes("esférica")) {
    let type = "";
    if (lower.includes("metalica") || lower.includes("metálica")) type = " (Metálica)";
    if (lower.includes("plastica") || lower.includes("plástica")) type = " (Plástica)";
    const m = name.match(/(\d+)(?:\s*\(|(?:\s*Metalica|\s*Plastica|$))/i);
    return { group: "Llave esférica manija corta", measure: (m ? m[1] + " mm" : "") + type };
  }

  // 8. Tapas
  if (lower.includes("tapa")) {
    const m = name.match(/(\d+\s*mm)/i);
    return { group: "Tapas", measure: m ? m[1] : name };
  }

  // 9. Tee
  if (lower.includes("tee")) {
    if (lower.includes("inserto") || lower.includes("teeim") || lower.includes("tim")) {
      const m = name.match(/(1\/2|3\/4)\s*x\s*(\d+\s*mm)/i);
      return { group: "Tee Inserto Hembra", measure: m ? m[2] + " x " + m[1] + '"' : name };
    }
    const m = name.match(/(\d+\s*mm)/i);
    return { group: "Tee", measure: m ? m[1] : name };
  }

  // 10. Unión doble
  if (lower.includes("union") || lower.includes("unión")) {
    const m = name.match(/(\d+\s*mm)/i);
    return { group: "Unión doble", measure: "Fusión " + (m ? m[1] : "") };
  }

  // 11. Llaves de Paso
  if (lower.includes("llave paso") || lower.includes("cabezal")) {
    const m = name.match(/(\d+\s*mm)/i);
    return { group: "Llaves de Paso", measure: "C/ Cabezal de bronce " + (m ? m[1] : "") };
  }

  // Fallback
  return { group: p.name, measure: p.name };
}

export default function PresupuestadorPublico() {
  const [products, setProducts] = useState<DbProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<{ [productId: string]: number }>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTfGroup, setActiveTfGroup] = useState("all");
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [copied, setCopied] = useState(false);

  // Cargar únicamente productos de Termofusión activos desde Supabase
  const loadProducts = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, sku, category, price, image_url, is_active")
        .eq("is_active", true)
        .eq("category", "Caños Termofusión")
        .gt("price", 0)
        .order("price", { ascending: true });

      if (error) throw error;
      if (data) {
        setProducts(data);
      }
    } catch (err) {
      console.error("Error al cargar productos:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
  }, []);

  // Agrupamiento inteligente de productos en familias/tarjetas únicas con orden prioritario
  const groupedProducts: ProductGroup[] = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const groupsMap = new Map<string, ProductGroup>();

    products.forEach(p => {
      const tfData = getTfGroupAndMeasure(p);
      const groupName = tfData.group;
      const measureLabel = tfData.measure;
      const imageUrl = p.image_url;

      if (!groupsMap.has(groupName)) {
        groupsMap.set(groupName, {
          id: groupName,
          name: groupName,
          category: p.category,
          image_url: imageUrl,
          items: []
        });
      }

      const grp = groupsMap.get(groupName)!;
      // Mantener la primera imagen válida para todo el grupo
      if (!grp.image_url && imageUrl) {
        grp.image_url = imageUrl;
      }

      grp.items.push({
        id: p.id,
        product: p,
        measure: measureLabel,
        price: p.price
      });
    });

    // Convertir a lista y ordenar medidas dentro de cada grupo por precio ascendente
    let result = Array.from(groupsMap.values()).map(grp => {
      grp.items.sort((a, b) => a.price - b.price);
      return grp;
    });

    // Ordenar las tarjetas: todas las cuplas juntas al inicio, luego codos, tees, etc.
    result.sort((a, b) => {
      const idxA = TF_GROUP_ORDER.indexOf(a.name);
      const idxB = TF_GROUP_ORDER.indexOf(b.name);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.name.localeCompare(b.name);
    });

    // Filtro de accesorio específico si no es 'all'
    if (activeTfGroup !== "all") {
      result = result.filter(grp => grp.name.toLowerCase() === activeTfGroup.toLowerCase());
    }

    // Filtro de búsqueda por texto
    if (query) {
      result = result
        .map(grp => {
          const groupMatches = grp.name.toLowerCase().includes(query);
          if (groupMatches) return grp;

          // Filtrar ítems que coincidan con la medida o término
          const matchingItems = grp.items.filter(it =>
            it.measure.toLowerCase().includes(query) ||
            it.product.name.toLowerCase().includes(query)
          );

          if (matchingItems.length > 0) {
            return { ...grp, items: matchingItems };
          }
          return null;
        })
        .filter((g): g is ProductGroup => g !== null);
    }

    return result;
  }, [products, activeTfGroup, searchQuery]);

  // Manejo de cantidades en el carrito
  const handleUpdateQty = (productId: string, delta: number) => {
    setCart(prev => {
      const current = prev[productId] || 0;
      const next = current + delta;
      if (next <= 0) {
        const copy = { ...prev };
        delete copy[productId];
        return copy;
      }
      return { ...prev, [productId]: next };
    });
  };

  const handleClearCart = () => {
    if (window.confirm("¿Deseas vaciar todos los productos seleccionados?")) {
      setCart({});
      setIsCartOpen(false);
    }
  };

  // Artículos en carrito
  const cartItems: CartItem[] = useMemo(() => {
    return Object.entries(cart)
      .map(([id, qty]) => {
        const prod = products.find(p => p.id === id);
        if (!prod) return null;
        return { product: prod, quantity: qty };
      })
      .filter((item): item is CartItem => item !== null);
  }, [cart, products]);

  const totalItems = useMemo(() => {
    return Object.values(cart).reduce((a, b) => a + b, 0);
  }, [cart]);

  const totalPrice = useMemo(() => {
    return cartItems.reduce((acc, item) => acc + item.product.price * item.quantity, 0);
  }, [cartItems]);

  // Generar texto del presupuesto compatible al 100% con el importador de WhatsApp del ERP
  const generateBudgetMessage = () => {
    const today = new Date().toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    });

    let text = `📋 *PRESUPUESTO - SISTEMAS DE TERMOFUSIÓN*\n`;
    if (customerName.trim()) {
      text += `👤 *Cliente:* ${customerName.trim()}\n`;
    }
    text += `📅 *Fecha:* ${today}\n\n`;
    text += `*Detalle de Productos:*\n`;

    cartItems.forEach(item => {
      const formattedItemPrice = item.product.price.toLocaleString("es-AR");
      text += `🔸 ${item.quantity}x *${item.product.name}* a $${formattedItemPrice}\n`;
    });

    text += `\n*TOTAL ESTIMADO:* $${totalPrice.toLocaleString("es-AR")}\n\n`;
    text += `*Envío:* A coordinar con vendedora\n`;
    text += `*Medio de pago:* Efectivo / Transferencia\n`;
    text += `--------------------------------\n`;
    text += `_Generado con el Cotizador Online ZonoHome_`;

    return text;
  };

  // Copiar al portapapeles
  const handleCopyBudget = () => {
    const text = generateBudgetMessage();
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  // Iconos SVG para cuando no hay foto aún
  const renderGroupPlaceholder = (group: ProductGroup) => {
    const name = group.name.toLowerCase();
    let bgGradient = "from-teal-500/10 to-emerald-500/10 text-emerald-600";
    let icon = "🔧";

    if (name.includes("caño") || name.includes("cano")) {
      icon = "📏";
      bgGradient = "from-emerald-500/10 to-green-600/10 text-emerald-700";
    } else if (name.includes("codo") || name.includes("curva")) {
      icon = "🔄";
      bgGradient = "from-teal-500/10 to-cyan-500/10 text-teal-700";
    } else if (name.includes("llave") || name.includes("esferica")) {
      icon = "🚰";
      bgGradient = "from-blue-500/10 to-indigo-500/10 text-blue-700";
    } else if (name.includes("cupla") || name.includes("buje") || name.includes("union")) {
      icon = "⚙️";
      bgGradient = "from-emerald-500/10 to-teal-500/10 text-emerald-800";
    } else if (name.includes("tanque") || name.includes("cisterna")) {
      icon = "💧";
      bgGradient = "from-blue-500/10 to-sky-500/10 text-blue-600";
    } else if (name.includes("biodigestor")) {
      icon = "🌱";
      bgGradient = "from-green-500/10 to-lime-500/10 text-green-700";
    }

    return (
      <div className={`w-full h-full flex flex-col items-center justify-center bg-gradient-to-br ${bgGradient} rounded-xl p-2`}>
        <span className="text-2xl select-none">{icon}</span>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-32">
      {/* Header fijo superior */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white font-bold shadow-md shadow-emerald-500/20">
              <span className="text-lg">Z</span>
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="font-extrabold text-base tracking-tight text-slate-900 leading-none">
                  ZonoHome
                </h1>
                <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                  Cotizador
                </span>
              </div>
              <p className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Precios oficiales en vivo
              </p>
            </div>
          </div>

          {/* Botón Carrito en Header */}
          <button
            onClick={() => setIsCartOpen(true)}
            className="relative flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-900 text-white font-semibold text-xs shadow-md shadow-slate-900/10 hover:bg-slate-800 active:scale-95 transition-all"
          >
            <ShoppingCart className="w-4 h-4 text-emerald-400" />
            <span className="hidden sm:inline">Presupuesto</span>
            {totalItems > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-emerald-500 text-slate-950 font-extrabold text-[11px]">
                {totalItems}
              </span>
            )}
          </button>
        </div>

        {/* Buscador en Vivo */}
        <div className="max-w-4xl mx-auto px-4 pb-3">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Buscar por medida (20mm, 25mm, 32mm, 1/2) o accesorio..."
              className="w-full pl-10 pr-9 py-2.5 bg-slate-100/80 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all placeholder:text-slate-400"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded-full"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Filtros Rápidos de Accesorios de Termofusión (Scroll Horizontal) */}
        <div className="max-w-4xl mx-auto px-4 py-2 border-t border-slate-100 overflow-x-auto scrollbar-none flex gap-1.5 bg-slate-50/50">
          {TF_GROUP_FILTERS.map(sub => (
            <button
              key={sub.id}
              onClick={() => setActiveTfGroup(sub.id)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium whitespace-nowrap transition-all ${
                activeTfGroup === sub.id
                  ? "bg-slate-900 text-white font-semibold shadow-sm"
                  : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
              }`}
            >
              {sub.label}
            </button>
          ))}
        </div>
      </header>

      {/* Contenido Principal */}
      <main className="max-w-4xl mx-auto px-4 pt-4">
        {/* Banner Informativo Rápido */}
        <div className="mb-4 p-3 rounded-xl bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-transparent border border-emerald-200/60 flex items-start gap-2.5">
          <Sparkles className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <div className="text-xs text-slate-700 leading-relaxed">
            <span className="font-semibold text-emerald-950">¡Cotizá tus materiales fácilmente!</span>{" "}
            Encontrá cada accesorio con todas sus medidas disponibles en una sola tarjeta. Sumá las cantidades que necesites y tocá <strong>&quot;Ver Presupuesto&quot;</strong>.
          </div>
        </div>

        {/* Estado de Carga */}
        {loading ? (
          <div className="py-16 text-center">
            <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-600">Cargando catálogo actualizado...</p>
          </div>
        ) : groupedProducts.length === 0 ? (
          <div className="py-16 text-center bg-white rounded-2xl border border-slate-200 p-8">
            <Search className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <h3 className="font-semibold text-slate-800 text-sm">No encontramos productos</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
              Probá modificando los términos de búsqueda o cambiando la categoría seleccionada.
            </p>
            <button
              onClick={() => {
                setSearchQuery("");
                setActiveTfGroup("all");
              }}
              className="mt-4 px-4 py-2 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-semibold hover:bg-emerald-100 transition-colors"
            >
              Restablecer filtros
            </button>
          </div>
        ) : (
          /* Grilla de Tarjetas Agrupadas por Familia */
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {groupedProducts.map(group => {
              // Calcular cantidad y subtotal seleccionados en esta tarjeta
              const groupSelectedQty = group.items.reduce((acc, it) => acc + (cart[it.id] || 0), 0);
              const groupSelectedSubtotal = group.items.reduce((acc, it) => acc + (it.price * (cart[it.id] || 0)), 0);
              const hasItemsSelected = groupSelectedQty > 0;

              return (
                <div
                  key={group.id}
                  className={`bg-white rounded-2xl border transition-all overflow-hidden flex flex-col justify-between ${
                    hasItemsSelected
                      ? "border-emerald-500 ring-2 ring-emerald-500/10 shadow-md"
                      : "border-slate-200/90 shadow-sm hover:border-slate-300 hover:shadow"
                  }`}
                >
                  {/* Encabezado de la Tarjeta con Foto y Título de la Familia */}
                  <div className="p-3.5 bg-gradient-to-b from-slate-50/70 to-white border-b border-slate-100 flex items-center gap-3.5">
                    <div className="w-16 h-16 shrink-0 rounded-xl overflow-hidden bg-white border border-slate-200/80 flex items-center justify-center p-1 relative shadow-sm">
                      {group.image_url && group.image_url.trim() !== "" ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={group.image_url}
                          alt={group.name}
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        renderGroupPlaceholder(group)
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-slate-900 text-sm sm:text-base leading-snug">
                        {group.name}
                      </h3>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {group.items.length} {group.items.length === 1 ? "medida disponible" : "medidas disponibles"}
                      </p>

                      {hasItemsSelected && (
                        <div className="mt-1.5 flex items-center gap-1.5">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[11px] font-bold">
                            ✓ {groupSelectedQty} en lista
                          </span>
                          <span className="text-[11px] font-semibold text-slate-700">
                            ({formatPrice(groupSelectedSubtotal)})
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Lista de Medidas / Variantes dentro de la misma Tarjeta */}
                  <div className="p-2 space-y-1 divide-y divide-slate-100/80">
                    {group.items.map(item => {
                      const qty = cart[item.id] || 0;
                      const hasQty = qty > 0;

                      return (
                        <div
                          key={item.id}
                          className={`pt-2.5 pb-2 px-2.5 rounded-xl flex items-center justify-between gap-3 transition-colors ${
                            hasQty ? "bg-emerald-50/70" : "hover:bg-slate-50/80"
                          }`}
                        >
                          {/* Medida y Precio (SIN CÓDIGOS SKU) */}
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-xs sm:text-sm text-slate-800 leading-tight">
                              {item.measure}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs font-extrabold text-emerald-600">
                                {formatPrice(item.price)}
                              </span>
                              {hasQty && (
                                <span className="text-[10px] text-slate-500 font-medium">
                                  Subtotal: <strong className="text-slate-700">{formatPrice(item.price * qty)}</strong>
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Control de Cantidad Táctil */}
                          <div className="shrink-0">
                            {hasQty ? (
                              <div className="flex items-center gap-1 bg-white rounded-lg p-0.5 border border-emerald-300 shadow-sm">
                                <button
                                  onClick={() => handleUpdateQty(item.id, -1)}
                                  className="w-7 h-7 rounded bg-slate-100 text-slate-700 font-bold hover:bg-slate-200 active:scale-95 flex items-center justify-center text-xs"
                                  aria-label="Restar uno"
                                >
                                  <Minus className="w-3.5 h-3.5" />
                                </button>
                                <span className="w-7 text-center font-bold text-xs text-slate-900">
                                  {qty}
                                </span>
                                <button
                                  onClick={() => handleUpdateQty(item.id, 1)}
                                  className="w-7 h-7 rounded bg-emerald-600 text-white font-bold hover:bg-emerald-700 active:scale-95 flex items-center justify-center text-xs"
                                  aria-label="Sumar uno"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => handleUpdateQty(item.id, 1)}
                                className="py-1.5 px-3 rounded-lg bg-slate-100 hover:bg-emerald-600 hover:text-white text-slate-700 font-semibold text-xs flex items-center gap-1 transition-all active:scale-95 shadow-sm"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>Sumar</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Barra Inferior Flotante Fija (Sticky Bottom Bar) */}
      {totalItems > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 p-3 pb-6 sm:pb-3 bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-2xl animate-in slide-in-from-bottom duration-200">
          <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                <ShoppingCart className="w-3.5 h-3.5 text-emerald-600" />
                <span>{totalItems} {totalItems === 1 ? "artículo" : "artículos"}</span>
              </div>
              <div className="font-extrabold text-lg text-slate-900 leading-none mt-0.5">
                {formatPrice(totalPrice)}
              </div>
            </div>

            <button
              onClick={() => setIsCartOpen(true)}
              className="px-5 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold text-sm shadow-lg shadow-emerald-600/30 hover:shadow-emerald-600/40 active:scale-95 transition-all flex items-center gap-2"
            >
              <span>Ver Presupuesto</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Modal / Bottom Sheet de Presupuesto */}
      {isCartOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in duration-150">
          <div className="bg-white w-full max-w-lg max-h-[90vh] rounded-t-3xl sm:rounded-2xl flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-bottom sm:zoom-in-95 duration-200">
            {/* Header del Modal */}
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs">
                  {totalItems}
                </div>
                <h3 className="font-bold text-slate-900 text-sm sm:text-base">
                  Tu Presupuesto Detallado
                </h3>
              </div>
              <button
                onClick={() => setIsCartOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-200/60 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Contenido scrolleable */}
            <div className="p-4 overflow-y-auto flex-1 divide-y divide-slate-100">
              {/* Campo de Nombre del Cliente */}
              <div className="pb-3">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Tu Nombre o Localidad (Opcional):
                </label>
                <input
                  type="text"
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
                  placeholder="Ej: Marcelo - Morón"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                />
              </div>

              {/* Lista de Artículos */}
              <div className="py-2 space-y-2.5">
                {cartItems.length === 0 ? (
                  <div className="py-8 text-center text-slate-400 text-xs">
                    No seleccionaste ningún producto todavía.
                  </div>
                ) : (
                  cartItems.map(({ product, quantity }) => {
                    const cleanItemData = getTfGroupAndMeasure(product);
                    const displayName = product.category === "Caños Termofusión"
                      ? `${cleanItemData.group} - ${cleanItemData.measure}`
                      : product.name;

                    return (
                      <div key={product.id} className="flex items-center justify-between gap-2 pt-2">
                        <div className="flex-1 min-w-0">
                          <h5 className="font-semibold text-xs text-slate-900 truncate">
                            {displayName}
                          </h5>
                          <p className="text-[11px] text-slate-500">
                            {quantity} x {formatPrice(product.price)} ={" "}
                            <strong className="text-slate-800 font-bold">
                              {formatPrice(product.price * quantity)}
                            </strong>
                          </p>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <div className="flex items-center bg-slate-100 rounded-lg p-0.5 border border-slate-200">
                            <button
                              onClick={() => handleUpdateQty(product.id, -1)}
                              className="w-6 h-6 rounded bg-white shadow-sm flex items-center justify-center text-slate-600 hover:bg-slate-50 text-xs font-bold"
                            >
                              -
                            </button>
                            <span className="w-6 text-center text-xs font-bold text-slate-800">
                              {quantity}
                            </span>
                            <button
                              onClick={() => handleUpdateQty(product.id, 1)}
                              className="w-6 h-6 rounded bg-emerald-600 text-white shadow-sm flex items-center justify-center text-xs font-bold"
                            >
                              +
                            </button>
                          </div>
                          <button
                            onClick={() => handleUpdateQty(product.id, -quantity)}
                            className="p-1.5 text-slate-400 hover:text-red-500 transition-colors"
                            title="Eliminar ítem"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Total y Notas */}
              <div className="pt-3">
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/80 mb-3">
                  <div className="flex justify-between items-center text-xs text-slate-500 mb-1">
                    <span>Subtotal Productos ({totalItems}):</span>
                    <span className="font-semibold text-slate-700">{formatPrice(totalPrice)}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm font-extrabold text-slate-900 pt-1 border-t border-slate-200">
                    <span>Total Estimado:</span>
                    <span className="text-base text-emerald-600">{formatPrice(totalPrice)}</span>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-2 leading-relaxed flex items-center gap-1">
                    <Info className="w-3 h-3 text-slate-400 shrink-0" />
                    Valores de lista oficial. Stock, envíos y formas de pago a confirmar con la vendedora.
                  </p>
                </div>

                {/* Vista previa del mensaje */}
                <div className="mb-3">
                  <span className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Mensaje que se enviará:
                  </span>
                  <div className="bg-slate-900 text-emerald-300 font-mono text-[10px] p-2.5 rounded-xl max-h-24 overflow-y-auto whitespace-pre-wrap select-all">
                    {generateBudgetMessage()}
                  </div>
                </div>
              </div>
            </div>

            {/* Footer con Acciones (Únicamente Copiar Mensaje) */}
            <div className="p-4 pb-7 sm:pb-4 bg-slate-50 border-t border-slate-100 flex items-center gap-2">
              <button
                onClick={handleCopyBudget}
                disabled={cartItems.length === 0}
                className={`flex-1 py-3.5 px-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-lg transition-all active:scale-98 disabled:opacity-50 cursor-pointer ${
                  copied
                    ? "bg-emerald-700 text-white shadow-emerald-700/25"
                    : "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/25"
                }`}
              >
                {copied ? (
                  <>
                    <CheckCircle2 className="w-5 h-5 text-white" />
                    <span>¡Copiado al portapapeles!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-5 h-5" />
                    <span>Copiar Mensaje</span>
                  </>
                )}
              </button>

              <button
                onClick={handleClearCart}
                disabled={cartItems.length === 0}
                className="py-3.5 px-3.5 rounded-xl bg-white border border-slate-200 text-slate-400 hover:text-red-600 text-xs font-semibold hover:bg-red-50 transition-colors disabled:opacity-50 cursor-pointer"
                title="Vaciar lista"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

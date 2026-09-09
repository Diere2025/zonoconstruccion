"use client";

import React, { useState, useEffect, useMemo } from "react";
import { 
  Calendar, 
  CalendarClock, 
  Clock, 
  CheckCircle2, 
  Trash2, 
  Plus, 
  Search, 
  RefreshCw, 
  TrendingUp, 
  ArrowUpRight, 
  X, 
  Loader2,
  AlertCircle,
  FileSpreadsheet,
  Layers,
  Percent,
  DollarSign,
  CheckSquare,
  Square,
  Filter
} from "lucide-react";
import { formatPrice, cn } from "@/lib/utils";
import { Product } from "@/types";

interface ScheduledItem {
  id: string;
  product_id: string | null;
  product_name: string;
  sku: string | null;
  price: number;
  effective_date: string;
  status: "pending" | "applied" | "cancelled";
  applied_at: string | null;
  notes: string | null;
  created_at: string;
  products?: {
    id: string;
    name: string;
    sku: string | null;
    price: number;
    brand: string | null;
    category: string | null;
    is_active: boolean;
  } | null;
}

interface ScheduledPricesManagerProps {
  products: Product[];
  onPricesUpdated?: () => void;
}

export function ScheduledPricesManager({ products, onPricesUpdated }: ScheduledPricesManagerProps) {
  const [scheduledItems, setScheduledItems] = useState<ScheduledItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncingSheets, setSyncingSheets] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Filters for list
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "applied">("all");
  const [searchTerm, setSearchTerm] = useState("");

  // Form State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"single" | "batch">("single");

  // Single Form State
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [customProductName, setCustomProductName] = useState("");
  const [singlePriceInput, setSinglePriceInput] = useState("");
  const [prodSearch, setProdSearch] = useState("");

  // Batch Form State
  const [batchBrand, setBatchBrand] = useState<string>("");
  const [batchCategory, setBatchCategory] = useState<string>("");
  const [batchSearch, setBatchSearch] = useState<string>("");
  const [batchPricingType, setBatchPricingType] = useState<"fixed" | "percentage">("fixed");
  const [batchFixedPrice, setBatchFixedPrice] = useState<string>("");
  const [batchPercentage, setBatchPercentage] = useState<string>("10");
  const [batchRoundHundreds, setBatchRoundHundreds] = useState<boolean>(true);
  const [selectedBatchProductIds, setSelectedBatchProductIds] = useState<Set<string>>(new Set());

  // Shared Date & Notes
  const getTomorrowStr = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split("T")[0];
  };

  const [effectiveDate, setEffectiveDate] = useState(getTomorrowStr());
  const [notes, setNotes] = useState("");

  // Available brands & categories from catalog
  const availableBrands = useMemo(() => {
    const brands = Array.from(new Set(products.map(p => p.brand).filter(Boolean) as string[])).sort();
    return brands;
  }, [products]);

  const availableCategories = useMemo(() => {
    const cats = Array.from(new Set(products.map(p => p.category).filter(Boolean) as string[])).sort();
    return cats;
  }, [products]);

  // Matching products for batch mode
  const matchingBatchProducts = useMemo(() => {
    if (formMode !== "batch") return [];
    return products.filter(p => {
      if (batchBrand && p.brand !== batchBrand) return false;
      if (batchCategory && p.category !== batchCategory) return false;
      if (batchSearch) {
        const q = batchSearch.toLowerCase();
        const matchName = p.name.toLowerCase().includes(q);
        const matchSku = p.sku?.toLowerCase().includes(q);
        if (!matchName && !matchSku) return false;
      }
      return true;
    });
  }, [products, formMode, batchBrand, batchCategory, batchSearch]);

  // When matching batch products change, select all by default
  useEffect(() => {
    if (formMode === "batch") {
      const allIds = new Set(matchingBatchProducts.map(p => p.id));
      setSelectedBatchProductIds(allIds);
    }
  }, [matchingBatchProducts, formMode]);

  // Calculate new batch price helper
  const calculateBatchNewPrice = (currentPrice: number): number => {
    if (batchPricingType === "fixed") {
      const p = parseFloat(batchFixedPrice.replace(/[$.\s]/g, "").replace(",", "."));
      return isNaN(p) ? 0 : p;
    } else {
      const pct = parseFloat(batchPercentage.replace(",", "."));
      if (isNaN(pct) || currentPrice <= 0) return currentPrice;
      let computed = currentPrice * (1 + pct / 100);
      if (batchRoundHundreds) {
        computed = Math.round(computed / 100) * 100;
      } else {
        computed = Math.round(computed);
      }
      return computed;
    }
  };

  // Fetch scheduled items from API
  const fetchScheduled = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/scheduled-prices");
      const data = await res.json();
      if (data.success && Array.isArray(data.updates)) {
        setScheduledItems(data.updates);
        if (data.appliedCount > 0 && onPricesUpdated) {
          onPricesUpdated();
        }
      }
    } catch (err: any) {
      console.error("Error al cargar precios programados:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchScheduled();
  }, []);

  // Sync from Google Sheets 'PVP por Fecha'
  const handleSyncSheets = async () => {
    setSyncingSheets(true);
    setActionMessage(null);
    try {
      const res = await fetch("/api/admin/scheduled-prices/sync-sheets", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Error al sincronizar con Google Sheets");

      setActionMessage({
        type: "success",
        text: `Sincronización con 'PVP por Fecha': ${data.newScheduledCreated || 0} nuevos precios futuros detectados. ${data.appliedCount || 0} aplicados hoy.`
      });
      await fetchScheduled();
      if (onPricesUpdated) onPricesUpdated();
    } catch (err: any) {
      setActionMessage({ type: "error", text: err.message || "Error al sincronizar." });
    } finally {
      setSyncingSheets(false);
    }
  };

  // Submit single scheduled price
  const handleSingleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPrice = parseFloat(singlePriceInput.replace(/[$.\s]/g, "").replace(",", "."));
    if (isNaN(cleanPrice) || cleanPrice <= 0) {
      setActionMessage({ type: "error", text: "Por favor ingresa un precio válido mayor a 0." });
      return;
    }

    const matchedProd = products.find(p => p.id === selectedProductId);
    const finalName = matchedProd ? matchedProd.name : customProductName.trim();

    if (!finalName) {
      setActionMessage({ type: "error", text: "Debes seleccionar o escribir un nombre de producto." });
      return;
    }

    setSubmitting(true);
    setActionMessage(null);

    try {
      const res = await fetch("/api/admin/scheduled-prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item: {
            product_id: matchedProd ? matchedProd.id : null,
            product_name: finalName,
            sku: matchedProd?.sku || null,
            price: cleanPrice,
            effective_date: effectiveDate,
            notes: notes.trim() || undefined
          }
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Error al guardar precio programado.");

      setActionMessage({
        type: "success",
        text: `Precio programado para "${finalName}" a $${cleanPrice.toLocaleString("es-AR")} para el ${effectiveDate}.`
      });

      setIsFormOpen(false);
      setSelectedProductId("");
      setCustomProductName("");
      setSinglePriceInput("");
      setNotes("");
      setEffectiveDate(getTomorrowStr());

      await fetchScheduled();
      if (onPricesUpdated) onPricesUpdated();
    } catch (err: any) {
      setActionMessage({ type: "error", text: err.message || "Error al programar el precio." });
    } finally {
      setSubmitting(false);
    }
  };

  // Submit batch scheduled prices
  const handleBatchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const selectedProds = matchingBatchProducts.filter(p => selectedBatchProductIds.has(p.id));

    if (selectedProds.length === 0) {
      setActionMessage({ type: "error", text: "No has seleccionado ningún producto para actualizar." });
      return;
    }

    const itemsToSchedule: Array<{
      product_id: string;
      product_name: string;
      sku: string | null;
      price: number;
      effective_date: string;
      notes?: string;
    }> = [];

    const defaultNotes = notes.trim() || (batchPricingType === "fixed" 
      ? `Aumento por lote a precio fijo $${batchFixedPrice}` 
      : `Aumento por lote de +${batchPercentage}%`);

    for (const prod of selectedProds) {
      const newPrice = calculateBatchNewPrice(prod.price);
      if (newPrice <= 0) continue;

      itemsToSchedule.push({
        product_id: prod.id,
        product_name: prod.name,
        sku: prod.sku || null,
        price: newPrice,
        effective_date: effectiveDate,
        notes: defaultNotes
      });
    }

    if (itemsToSchedule.length === 0) {
      setActionMessage({ type: "error", text: "Verifica los valores ingresados. Ningún producto arrojó un precio válido." });
      return;
    }

    setSubmitting(true);
    setActionMessage(null);

    try {
      const res = await fetch("/api/admin/scheduled-prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: itemsToSchedule })
      });

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Error al guardar aumento masivo.");

      setActionMessage({
        type: "success",
        text: `¡Éxito! Se programó el aumento de ${data.count || itemsToSchedule.length} productos para el ${effectiveDate}.`
      });

      setIsFormOpen(false);
      setNotes("");
      setBatchFixedPrice("");
      setEffectiveDate(getTomorrowStr());

      await fetchScheduled();
      if (onPricesUpdated) onPricesUpdated();
    } catch (err: any) {
      setActionMessage({ type: "error", text: err.message || "Error al programar lote." });
    } finally {
      setSubmitting(false);
    }
  };

  // Cancel a scheduled price
  const handleCancel = async (id: string, name: string) => {
    if (!confirm(`¿Deseas cancelar la programación de aumento para "${name}"?`)) return;

    setCancellingId(id);
    setActionMessage(null);
    try {
      const res = await fetch(`/api/admin/scheduled-prices?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Error al cancelar.");

      setActionMessage({ type: "success", text: "Programación cancelada con éxito." });
      await fetchScheduled();
    } catch (err: any) {
      setActionMessage({ type: "error", text: err.message || "Error al cancelar." });
    } finally {
      setCancellingId(null);
    }
  };

  // Quick date presets
  const setQuickDate = (daysFromNow: number) => {
    const d = new Date();
    d.setDate(d.getDate() + daysFromNow);
    setEffectiveDate(d.toISOString().split("T")[0]);
  };

  const setFirstOfNextMonth = () => {
    const d = new Date();
    const nextMonth = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    setEffectiveDate(nextMonth.toISOString().split("T")[0]);
  };

  // Batch selection helpers
  const handleToggleSelectAllBatch = () => {
    if (selectedBatchProductIds.size === matchingBatchProducts.length) {
      setSelectedBatchProductIds(new Set());
    } else {
      setSelectedBatchProductIds(new Set(matchingBatchProducts.map(p => p.id)));
    }
  };

  const handleToggleBatchProduct = (id: string) => {
    const next = new Set(selectedBatchProductIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedBatchProductIds(next);
  };

  // Filtered list
  const filteredItems = useMemo(() => {
    return scheduledItems.filter(item => {
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const matchName = item.product_name.toLowerCase().includes(q);
        const matchSku = item.sku?.toLowerCase().includes(q);
        const matchNotes = item.notes?.toLowerCase().includes(q);
        if (!matchName && !matchSku && !matchNotes) return false;
      }
      return true;
    });
  }, [scheduledItems, statusFilter, searchTerm]);

  const pendingCount = scheduledItems.filter(i => i.status === "pending").length;

  return (
    <div className="space-y-6">
      {/* Header & Quick stats */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-600">
              <CalendarClock className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900">Precios Programados</h2>
                {pendingCount > 0 && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-amber-100 text-amber-800 border border-amber-200">
                    {pendingCount} pendientes
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Programa variaciones de precios individuales o por lote con fecha futura de vigencia. Los aumentos entran automáticamente a la base de datos sin depender de planillas externas.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleSyncSheets}
            disabled={syncingSheets}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors cursor-pointer disabled:opacity-50"
            title="Importa aumentos cargados a futuro en la hoja 'PVP por Fecha' de Google Sheets"
          >
            {syncingSheets ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
            Sincronizar desde "PVP por Fecha"
          </button>

          <button
            onClick={() => setIsFormOpen(!isFormOpen)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-brand-600 text-white hover:bg-brand-700 transition-colors cursor-pointer shadow-sm shadow-brand-600/20"
          >
            {isFormOpen ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {isFormOpen ? "Cerrar Panel" : "Programar Aumento"}
          </button>
        </div>
      </div>

      {/* Action alerts */}
      {actionMessage && (
        <div className={cn(
          "p-4 rounded-xl text-xs flex items-center gap-3 border",
          actionMessage.type === "success" 
            ? "bg-emerald-50 text-emerald-800 border-emerald-200" 
            : "bg-red-50 text-red-800 border-red-200"
        )}>
          {actionMessage.type === "success" ? <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" /> : <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />}
          <span>{actionMessage.text}</span>
          <button onClick={() => setActionMessage(null)} className="ml-auto text-slate-400 hover:text-slate-600">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* FORM: Programar aumento (Individual o Lote) */}
      {isFormOpen && (
        <div className="bg-slate-50 border border-slate-200 p-5 rounded-2xl space-y-4 shadow-sm">
          {/* Form Tabs */}
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setFormMode("single")}
                className={cn(
                  "flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer",
                  formMode === "single"
                    ? "bg-brand-600 text-white shadow-sm shadow-brand-600/20"
                    : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
                )}
              >
                <TrendingUp className="w-3.5 h-3.5" />
                Producto Individual
              </button>
              <button
                type="button"
                onClick={() => setFormMode("batch")}
                className={cn(
                  "flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer",
                  formMode === "batch"
                    ? "bg-brand-600 text-white shadow-sm shadow-brand-600/20"
                    : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
                )}
              >
                <Layers className="w-3.5 h-3.5" />
                Aumento Masivo por Lote (Marca / Rubro)
              </button>
            </div>
            <span className="text-xs text-slate-500 hidden sm:inline">
              Entrará en vigencia automáticamente al iniciar la fecha elegida
            </span>
          </div>

          {/* TAB 1: INDIVIDUAL */}
          {formMode === "single" ? (
            <form onSubmit={handleSingleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Product Selector */}
                <div className="space-y-1.5 lg:col-span-2">
                  <label className="text-xs font-bold text-slate-700">Producto a Actualizar</label>
                  <div className="space-y-2">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        placeholder="Filtrar por nombre o SKU..."
                        value={prodSearch}
                        onChange={(e) => setProdSearch(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500"
                      />
                    </div>
                    <select
                      value={selectedProductId}
                      onChange={(e) => {
                        setSelectedProductId(e.target.value);
                        const sel = products.find(p => p.id === e.target.value);
                        if (sel) {
                          setSinglePriceInput(sel.price ? String(sel.price) : "");
                        }
                      }}
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500 text-slate-800"
                    >
                      <option value="">-- Selecciona un producto del catálogo --</option>
                      {products
                        .filter(p => !prodSearch || p.name.toLowerCase().includes(prodSearch.toLowerCase()) || p.sku?.toLowerCase().includes(prodSearch.toLowerCase()))
                        .slice(0, 150)
                        .map(p => (
                          <option key={p.id} value={p.id}>
                            {p.name} (Actual: {formatPrice(p.price)}) {p.brand ? `[${p.brand}]` : ""}
                          </option>
                        ))}
                    </select>
                  </div>

                  {!selectedProductId && (
                    <div className="pt-1">
                      <label className="text-[11px] text-slate-500">O escribe el nombre manual (si no está en catálogo):</label>
                      <input
                        type="text"
                        placeholder="Nombre exacto del producto..."
                        value={customProductName}
                        onChange={(e) => setCustomProductName(e.target.value)}
                        className="w-full mt-1 px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500"
                      />
                    </div>
                  )}
                </div>

                {/* Price & Effective Date */}
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">Nuevo Precio ($)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">$</span>
                      <input
                        type="text"
                        required
                        placeholder="89300"
                        value={singlePriceInput}
                        onChange={(e) => setSinglePriceInput(e.target.value)}
                        className="w-full pl-7 pr-3 py-2 text-xs font-bold bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500 text-slate-900"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                      <span>Fecha de Vigencia</span>
                      <span className="text-[10px] text-slate-400 font-normal">Año-Mes-Día</span>
                    </label>
                    <input
                      type="date"
                      required
                      value={effectiveDate}
                      onChange={(e) => setEffectiveDate(e.target.value)}
                      className="w-full px-3 py-2 text-xs font-bold bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500 text-slate-900 cursor-pointer"
                    />

                    {/* Quick date buttons */}
                    <div className="flex flex-wrap gap-1 pt-1">
                      <button
                        type="button"
                        onClick={() => setQuickDate(1)}
                        className="px-2 py-0.5 text-[10px] font-bold bg-white border border-slate-200 rounded hover:bg-slate-100 text-slate-700"
                      >
                        Mañana
                      </button>
                      <button
                        type="button"
                        onClick={() => setQuickDate(3)}
                        className="px-2 py-0.5 text-[10px] font-bold bg-white border border-slate-200 rounded hover:bg-slate-100 text-slate-700"
                      >
                        En 3 días
                      </button>
                      <button
                        type="button"
                        onClick={setFirstOfNextMonth}
                        className="px-2 py-0.5 text-[10px] font-bold bg-white border border-slate-200 rounded hover:bg-slate-100 text-slate-700"
                      >
                        1° próx. mes
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Notas / Motivo (opcional)</label>
                <input
                  type="text"
                  placeholder="Ej: Aumento oficial lista de precios..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-200/60"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CalendarClock className="w-3.5 h-3.5" />}
                  Guardar Programación
                </button>
              </div>
            </form>
          ) : (
            /* TAB 2: BATCH / LOTE */
            <form onSubmit={handleBatchSubmit} className="space-y-4">
              {/* Filter Controls */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 bg-white rounded-xl border border-slate-200">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-600 flex items-center gap-1">
                    <Filter className="w-3 h-3 text-slate-400" />
                    Filtrar por Marca
                  </label>
                  <select
                    value={batchBrand}
                    onChange={(e) => setBatchBrand(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500"
                  >
                    <option value="">-- Todas las marcas --</option>
                    {availableBrands.map(b => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-600">Filtrar por Categoría</label>
                  <select
                    value={batchCategory}
                    onChange={(e) => setBatchCategory(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500"
                  >
                    <option value="">-- Todas las categorías --</option>
                    {availableCategories.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-600">Búsqueda (Nombre o SKU)</label>
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Ej: Techos y Frentes 20kg..."
                      value={batchSearch}
                      onChange={(e) => setBatchSearch(e.target.value)}
                      className="w-full pl-7 pr-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500"
                    />
                  </div>
                </div>
              </div>

              {/* Price adjustment method */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="p-3.5 bg-white rounded-xl border border-slate-200 space-y-3 lg:col-span-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800">Tipo de Modificación</span>
                    <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg">
                      <button
                        type="button"
                        onClick={() => setBatchPricingType("fixed")}
                        className={cn(
                          "px-2.5 py-1 rounded-md text-[11px] font-bold transition-all",
                          batchPricingType === "fixed" ? "bg-white text-brand-600 shadow-sm" : "text-slate-500"
                        )}
                      >
                        Precio Fijo
                      </button>
                      <button
                        type="button"
                        onClick={() => setBatchPricingType("percentage")}
                        className={cn(
                          "px-2.5 py-1 rounded-md text-[11px] font-bold transition-all",
                          batchPricingType === "percentage" ? "bg-white text-brand-600 shadow-sm" : "text-slate-500"
                        )}
                      >
                        Porcentaje (%)
                      </button>
                    </div>
                  </div>

                  {batchPricingType === "fixed" ? (
                    <div className="space-y-1">
                      <label className="text-[11px] text-slate-500">Establecer el mismo precio a todos los seleccionados:</label>
                      <div className="relative max-w-xs">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">$</span>
                        <input
                          type="text"
                          required
                          placeholder="Ej: 89300"
                          value={batchFixedPrice}
                          onChange={(e) => setBatchFixedPrice(e.target.value)}
                          className="w-full pl-7 pr-3 py-1.5 text-xs font-bold bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500 text-slate-900"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="relative w-36">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">%</span>
                          <input
                            type="number"
                            step="0.5"
                            required
                            placeholder="10"
                            value={batchPercentage}
                            onChange={(e) => setBatchPercentage(e.target.value)}
                            className="w-full pl-7 pr-3 py-1.5 text-xs font-bold bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500 text-slate-900"
                          />
                        </div>
                        <div className="flex items-center gap-1">
                          {[5, 10, 15, 20].map(pct => (
                            <button
                              key={pct}
                              type="button"
                              onClick={() => setBatchPercentage(String(pct))}
                              className="px-2 py-1 text-[11px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md"
                            >
                              +{pct}%
                            </button>
                          ))}
                        </div>
                      </div>
                      <label className="flex items-center gap-1.5 text-[11px] text-slate-600 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={batchRoundHundreds}
                          onChange={(e) => setBatchRoundHundreds(e.target.checked)}
                          className="rounded text-brand-600 focus:ring-brand-500"
                        />
                        Redondear a centenas más cercana (ej: $89.284 → $89.300)
                      </label>
                    </div>
                  )}
                </div>

                {/* Effective Date & Notes */}
                <div className="p-3.5 bg-white rounded-xl border border-slate-200 space-y-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">Fecha de Vigencia</label>
                    <input
                      type="date"
                      required
                      value={effectiveDate}
                      onChange={(e) => setEffectiveDate(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs font-bold bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500 text-slate-900 cursor-pointer"
                    />
                    <div className="flex flex-wrap gap-1 pt-1">
                      <button
                        type="button"
                        onClick={() => setQuickDate(1)}
                        className="px-2 py-0.5 text-[10px] font-bold bg-slate-100 border border-slate-200 rounded hover:bg-slate-200 text-slate-700"
                      >
                        Mañana
                      </button>
                      <button
                        type="button"
                        onClick={() => setQuickDate(3)}
                        className="px-2 py-0.5 text-[10px] font-bold bg-slate-100 border border-slate-200 rounded hover:bg-slate-200 text-slate-700"
                      >
                        En 3 días
                      </button>
                      <button
                        type="button"
                        onClick={setFirstOfNextMonth}
                        className="px-2 py-0.5 text-[10px] font-bold bg-slate-100 border border-slate-200 rounded hover:bg-slate-200 text-slate-700"
                      >
                        1° próx. mes
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">Notas del Lote</label>
                    <input
                      type="text"
                      placeholder="Ej: Aumento oficial lista Equilibrio..."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500"
                    />
                  </div>
                </div>
              </div>

              {/* Preview table of batch items */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs font-bold text-slate-700">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleToggleSelectAllBatch}
                      className="flex items-center gap-1.5 text-brand-600 hover:text-brand-700 font-bold"
                    >
                      {selectedBatchProductIds.size === matchingBatchProducts.length && matchingBatchProducts.length > 0 ? (
                        <CheckSquare className="w-4 h-4" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                      <span>
                        {selectedBatchProductIds.size === matchingBatchProducts.length && matchingBatchProducts.length > 0
                          ? "Deseleccionar todos"
                          : "Seleccionar todos"}
                      </span>
                    </button>
                    <span className="text-slate-400">|</span>
                    <span>
                      {selectedBatchProductIds.size} de {matchingBatchProducts.length} productos seleccionados
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-500 font-normal">
                    Previsualización de precios a programar
                  </span>
                </div>

                <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 text-xs">
                  {matchingBatchProducts.length === 0 ? (
                    <div className="p-6 text-center text-slate-400">
                      No hay productos que coincidan con los filtros de marca, categoría o búsqueda.
                    </div>
                  ) : (
                    matchingBatchProducts.map(p => {
                      const isChecked = selectedBatchProductIds.has(p.id);
                      const computedPrice = calculateBatchNewPrice(p.price);
                      const diff = computedPrice - p.price;
                      const pct = p.price > 0 ? ((diff / p.price) * 100).toFixed(1) : "0";

                      return (
                        <div
                          key={p.id}
                          onClick={() => handleToggleBatchProduct(p.id)}
                          className={cn(
                            "p-2.5 px-3 flex items-center justify-between gap-3 cursor-pointer hover:bg-slate-50 transition-colors",
                            isChecked ? "bg-brand-50/20" : "opacity-60"
                          )}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {}} // handled by parent div
                              className="rounded text-brand-600 focus:ring-brand-500 cursor-pointer"
                            />
                            <div className="truncate">
                              <span className="font-bold text-slate-900">{p.name}</span>
                              <div className="flex items-center gap-2 text-[10px] text-slate-400">
                                {p.sku && <span className="font-mono">SKU: {p.sku}</span>}
                                {p.brand && <span>Marca: {p.brand}</span>}
                                {p.category && <span>Rubro: {p.category}</span>}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-4 shrink-0 text-right">
                            <div>
                              <div className="text-[10px] text-slate-400">Actual</div>
                              <div className="font-medium text-slate-600">{formatPrice(p.price)}</div>
                            </div>
                            <div>
                              <div className="text-[10px] text-brand-600 font-bold">Nuevo Programado</div>
                              <div className="font-black text-brand-700">
                                {computedPrice > 0 ? formatPrice(computedPrice) : "-"}
                              </div>
                            </div>
                            <div className="w-16">
                              {diff !== 0 && (
                                <span className={cn(
                                  "text-[10px] font-bold px-1.5 py-0.5 rounded",
                                  diff > 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
                                )}>
                                  {diff > 0 ? `+${pct}%` : `${pct}%`}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Submit bar */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                <span className="text-xs text-slate-500">
                  {selectedBatchProductIds.size} productos se programarán para el{" "}
                  <strong className="text-slate-800">{effectiveDate}</strong>.
                </span>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsFormOpen(false)}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-200/60"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || selectedBatchProductIds.size === 0}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 cursor-pointer shadow-sm shadow-brand-600/20"
                  >
                    {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CalendarClock className="w-3.5 h-3.5" />}
                    Programar Aumento de {selectedBatchProductIds.size} Productos
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Filter and Search Bar for the table */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200">
        <div className="flex items-center gap-1.5 w-full sm:w-auto">
          <button
            onClick={() => setStatusFilter("all")}
            className={cn(
              "px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer",
              statusFilter === "all" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
            )}
          >
            Todos ({scheduledItems.length})
          </button>
          <button
            onClick={() => setStatusFilter("pending")}
            className={cn(
              "px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5",
              statusFilter === "pending" ? "bg-amber-500 text-white" : "text-slate-600 hover:bg-slate-100"
            )}
          >
            <Clock className="w-3 h-3" />
            Pendientes ({pendingCount})
          </button>
          <button
            onClick={() => setStatusFilter("applied")}
            className={cn(
              "px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5",
              statusFilter === "applied" ? "bg-emerald-600 text-white" : "text-slate-600 hover:bg-slate-100"
            )}
          >
            <CheckCircle2 className="w-3 h-3" />
            Aplicados ({scheduledItems.filter(i => i.status === "applied").length})
          </button>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar en programados..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>
      </div>

      {/* Table of Scheduled Prices */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-brand-600" />
            <span className="text-xs">Cargando precios programados...</span>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="py-12 text-center text-slate-400">
            <CalendarClock className="w-8 h-8 mx-auto mb-2 text-slate-300" />
            <p className="text-xs font-medium">No se encontraron precios programados con los filtros seleccionados.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Producto</th>
                  <th className="px-4 py-3 text-right">Precio Actual</th>
                  <th className="px-4 py-3 text-right">Precio Programado</th>
                  <th className="px-4 py-3 text-center">Variación</th>
                  <th className="px-4 py-3">Fecha Vigencia</th>
                  <th className="px-4 py-3">Notas / Origen</th>
                  <th className="px-4 py-3 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredItems.map(item => {
                  const currentPrice = item.products?.price;
                  const diff = currentPrice ? item.price - currentPrice : 0;
                  const pctDiff = currentPrice && currentPrice > 0 ? ((diff / currentPrice) * 100).toFixed(1) : null;
                  const isTomorrow = item.effective_date === getTomorrowStr();

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* Estado */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        {item.status === "pending" ? (
                          <span className={cn(
                            "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black border",
                            isTomorrow 
                              ? "bg-amber-100 text-amber-900 border-amber-300" 
                              : "bg-blue-50 text-blue-800 border-blue-200"
                          )}>
                            <Clock className="w-3 h-3" />
                            {isTomorrow ? "Entra Mañana" : "Pendiente"}
                          </span>
                        ) : item.status === "applied" ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            Aplicado
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500">
                            Cancelado
                          </span>
                        )}
                      </td>

                      {/* Producto */}
                      <td className="px-4 py-3">
                        <div className="font-bold text-slate-900">{item.product_name}</div>
                        {item.sku && (
                          <div className="text-[10px] text-slate-400 font-mono">SKU: {item.sku}</div>
                        )}
                      </td>

                      {/* Precio Actual */}
                      <td className="px-4 py-3 text-right font-medium text-slate-500 whitespace-nowrap">
                        {currentPrice !== undefined ? formatPrice(currentPrice) : "-"}
                      </td>

                      {/* Precio Programado */}
                      <td className="px-4 py-3 text-right font-black text-slate-900 whitespace-nowrap">
                        <span className="text-brand-600 font-bold text-xs">{formatPrice(item.price)}</span>
                      </td>

                      {/* Variación */}
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        {diff > 0 ? (
                          <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                            +{pctDiff ? `${pctDiff}%` : formatPrice(diff)}
                          </span>
                        ) : diff < 0 ? (
                          <span className="text-[10px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">
                            {pctDiff ? `${pctDiff}%` : formatPrice(diff)}
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400">Sin cambio</span>
                        )}
                      </td>

                      {/* Fecha Vigencia */}
                      <td className="px-4 py-3 whitespace-nowrap font-bold text-slate-800">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          <span>{item.effective_date}</span>
                        </div>
                      </td>

                      {/* Notas */}
                      <td className="px-4 py-3 text-[11px] text-slate-500 max-w-xs truncate" title={item.notes || ""}>
                        {item.notes || "-"}
                      </td>

                      {/* Acciones */}
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        {item.status === "pending" && (
                          <button
                            onClick={() => handleCancel(item.id, item.product_name)}
                            disabled={cancellingId === item.id}
                            className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors cursor-pointer"
                            title="Cancelar programación"
                          >
                            {cancellingId === item.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

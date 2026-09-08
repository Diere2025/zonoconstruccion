"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { 
  Calendar, 
  User, 
  MapPin, 
  CreditCard, 
  Truck, 
  Package,
  Save, 
  Loader2, 
  Search, 
  Plus, 
  Trash2, 
  X, 
  Check, 
  PlusCircle, 
  UserPlus, 
  AlertTriangle,
  Clock,
  UploadCloud,
  FileText,
  Image as ImageIcon,
  Target,
  Phone,
  Edit,
  Eye,
  Globe,
  Edit2,
  ChevronDown,
  ChevronUp,
  Layers,
  Tag,
  Sparkles,
  Home,
  DollarSign,
  CheckCircle2,
  Percent,
  Download,
  Database,
  FileSpreadsheet,
  Copy
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { supabase } from "@/lib/supabase";
import { Product } from "@/types";
import VisualProductSelectorModal from "@/components/vendedores/VisualProductSelectorModal";
import { cn, formatPrice } from "@/lib/utils";
import { calculateBulkPrices } from "@/lib/erp/prices";
import { createBulkStockTransactions } from "@/lib/erp/stock";
import { evaluateDiscountSuggestions, DiscountSuggestion } from "@/lib/discountRules";
import { buildSheetOrderItems } from "@/lib/googleSheets";

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

interface AdvertisingSource {
  id: string;
  name: string;
  is_active: boolean;
}

interface OrderMedium {
  id: string;
  name: string;
  requires_phone_line: boolean;
  is_active: boolean;
}

interface PhoneLine {
  id: string;
  name: string;
  phone_number: string;
  seller_id?: string | null;
  is_active: boolean;
  seller_phone_lines?: { seller_id: string }[];
}

interface Kit {
  id: string;
  name: string;
  items: OrderItem[];
  detailText: string;
  category: string;
  isGlobal: boolean;
  sellerId: string;
}

interface CustomView {
  id: string;
  name: string;
  isDefault?: boolean;
  filters: {
    statusFilter: 'Pendientes' | 'En Revisión' | 'Entregados' | 'Anulados' | 'Todos';
    clientTypeFilter: 'todos' | 'minoristas' | 'mayoristas';
    selectedProducts: string[];
    orderSearchQuery: string;
    listType: 'mis_pedidos' | 'todos';
    dateFrom?: string;
    dateTo?: string;
  };
}

interface Client {
  id: string;
  business_name: string;
  tax_id: string;
  phone_primary: string;
  phone_secondary?: string;
  phone?: string;
  billing_address?: string;
  is_wholesale?: boolean;
}

interface Address {
  id: string;
  alias: string;
  full_address: string;
  locality_id: string;
  map_link?: string;
  delivery_notes?: string;
}

interface Locality {
  id: string;
  name: string;
  zone_id?: string;
  zones?: {
    name: string;
    delivery_schedule?: string;
    delivery_time_id?: string | null;
    delivery_times?: {
      name: string;
      description: string;
      delivery_days?: number[];
    } | null;
  };
}

interface DateInputProps {
  label: string;
  value: string; // YYYY-MM-DD format
  onChange: (val: string) => void;
  required?: boolean;
}

const DateInput: React.FC<DateInputProps> = ({ label, value, onChange, required = false }) => {
  const [typedValue, setTypedValue] = useState("");

  useEffect(() => {
    if (value) {
      const parts = value.split('-');
      if (parts.length === 3) {
        setTypedValue(`${parts[2]}/${parts[1]}/${parts[0]}`);
      } else {
        setTypedValue(value);
      }
    } else {
      setTypedValue("");
    }
  }, [value]);

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let input = e.target.value;
    input = input.replace(/[^0-9/]/g, '');

    // Auto slashes
    if (input.length === 2 && !input.includes('/')) {
      input += '/';
    } else if (input.length === 5 && input.split('/').length === 2) {
      input += '/';
    }

    if (input.length > 10) {
      input = input.substring(0, 10);
    }

    setTypedValue(input);

    const parts = input.split('/');
    if (parts.length === 3 && parts[0].length === 2 && parts[1].length === 2 && parts[2].length === 4) {
      const yyyy = parts[2];
      const mm = parts[1];
      const dd = parts[0];
      onChange(`${yyyy}-${mm}-${dd}`);
    }
  };

  const handleBlur = () => {
    const parts = typedValue.split('/');
    if (parts.length !== 3 || parts[0].length !== 2 || parts[1].length !== 2 || parts[2].length !== 4) {
      if (value) {
        const vParts = value.split('-');
        setTypedValue(`${vParts[2]}/${vParts[1]}/${vParts[0]}`);
      } else {
        setTypedValue("");
      }
    }
  };

  const hiddenInputRef = React.useRef<HTMLInputElement>(null);

  const handleCalendarClick = () => {
    if (hiddenInputRef.current) {
      try {
        if (typeof hiddenInputRef.current.showPicker === 'function') {
          hiddenInputRef.current.showPicker();
        } else {
          hiddenInputRef.current.click();
        }
      } catch (e) {
        hiddenInputRef.current.click();
      }
    }
  };

  return (
    <div className="space-y-1">
      <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</label>
      <div className="relative">
        <input
          type="text"
          required={required}
          value={typedValue}
          onChange={handleTextChange}
          onBlur={handleBlur}
          placeholder="dd/mm/yyyy"
          className="w-full pl-2.5 pr-8 py-1.5 rounded-lg border border-slate-200 bg-white font-bold text-xs focus:ring-2 focus:ring-brand-500/10 outline-none"
        />
        <button
          type="button"
          onClick={handleCalendarClick}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
        >
          <Calendar className="w-3.5 h-3.5" />
        </button>
        <input
          ref={hiddenInputRef}
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="absolute opacity-0 pointer-events-none w-0 h-0"
        />
      </div>
    </div>
  );
};

interface DeliveryTime {
  id: string;
  name: string;
  description: string;
  category: 'Regular' | 'Zonal' | 'Particular' | 'Express';
  delivery_days?: number[];
  is_active: boolean;
}

const calculateNextDeliveryDate = (
  scheduleText: string | null | undefined, 
  baseDateStr: string,
  deliveryDays?: number[] | null
): Date | null => {
  if (!baseDateStr) return null;
  
  let daysFound: number[] = [];
  
  if (deliveryDays && Array.isArray(deliveryDays) && deliveryDays.length > 0) {
    daysFound = deliveryDays;
  } else if (scheduleText) {
    const daysMap: { [key: string]: number } = {
      domingo: 0,
      lunes: 1,
      martes: 2,
      miércoles: 3,
      miercoles: 3,
      jueves: 4,
      viernes: 5,
      sábado: 6,
      sabado: 6
    };
    
    const lowercaseText = scheduleText.toLowerCase();
    for (const dayName in daysMap) {
      if (lowercaseText.includes(dayName) && !daysFound.includes(daysMap[dayName])) {
        daysFound.push(daysMap[dayName]);
      }
    }
  }

  if (daysFound.length === 0) return null;

  const baseDate = new Date(baseDateStr + 'T12:00:00');
  if (isNaN(baseDate.getTime())) return null;
  
  for (let i = 1; i <= 7; i++) {
    const checkDate = new Date(baseDate.getTime() + i * 24 * 60 * 60 * 1000);
    if (daysFound.includes(checkDate.getDay())) {
      return checkDate;
    }
  }
  return null;
};

const calculateNthBusinessDay = (baseDateStr: string, n: number): Date | null => {
  if (!baseDateStr) return null;
  const date = new Date(baseDateStr + 'T12:00:00');
  if (isNaN(date.getTime())) return null;
  
  let count = 0;
  while (count < n) {
    date.setDate(date.getDate() + 1);
    const day = date.getDay();
    if (day !== 0) { // Omitir domingo (0)
      count++;
    }
  }
  return date;
};

const isDateValidForFlete = (
  deliveryDateStr: string,
  fleteName: string,
  deliveryTimesList: any[],
  baseDateStr: string
): boolean => {
  if (!deliveryDateStr || !fleteName || !baseDateStr) return false;
  const selectedFlete = deliveryTimesList.find(dt => dt.name === fleteName);
  if (!selectedFlete) return false;

  const parts = deliveryDateStr.split('-');
  const selDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  const selDayOfWeek = selDate.getDay();

  if (selectedFlete.category === 'Zonal' || selectedFlete.category === 'Regular') {
    let allowedDays = selectedFlete.delivery_days || [];
    if (selectedFlete.category === 'Regular' && allowedDays.length === 0) {
      allowedDays = [1, 2, 3, 4, 5, 6];
    }
    return allowedDays.includes(selDayOfWeek);
  }

  if (selectedFlete.category === 'Express') {
    const baseDate = new Date(baseDateStr + 'T12:00:00');
    const tomorrowDate = new Date(baseDate.getTime() + 24 * 60 * 60 * 1000);
    const tomorrowYyyy = tomorrowDate.getFullYear();
    const tomorrowMm = String(tomorrowDate.getMonth() + 1).padStart(2, '0');
    const tomorrowDd = String(tomorrowDate.getDate()).padStart(2, '0');
    const tomorrowStr = `${tomorrowYyyy}-${tomorrowMm}-${tomorrowDd}`;

    const nextBusDate = calculateNthBusinessDay(baseDateStr, 1);
    let nextBusStr = "";
    if (nextBusDate) {
      const nextBusYyyy = nextBusDate.getFullYear();
      const nextBusMm = String(nextBusDate.getMonth() + 1).padStart(2, '0');
      const nextBusDd = String(nextBusDate.getDate()).padStart(2, '0');
      nextBusStr = `${nextBusYyyy}-${nextBusMm}-${nextBusDd}`;
    }

    return deliveryDateStr === tomorrowStr || deliveryDateStr === nextBusStr;
  }

  if (selectedFlete.category === 'Particular') {
    return true; // Día Particular is always valid
  }

  return true;
};

const normalizeText = (text: string) => {
  if (!text) return "";
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
};

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

export default function PedidosPage() {
  const formatDate = (dateStr: string) => {
    if (!dateStr) return "";
    try {
      const cleanStr = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
      const parts = cleanStr.split('-');
      if (parts.length === 3) {
        // parts = [yyyy, mm, dd]
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      return `${day}/${month}/${year}`;
    } catch {
      return dateStr;
    }
  };

  const getFreightColor = (type: string) => {
    if (!type) return 'bg-slate-200 border-slate-300';
    const matched = deliveryTimes.find(d => d.name === type);
    if (matched) {
      if (matched.category === 'Regular') return 'bg-white border-slate-400';
      if (matched.category === 'Zonal') return 'bg-blue-500 border-blue-600';
      if (matched.category === 'Particular') return 'bg-amber-400 border-amber-500';
      if (matched.category === 'Express') return 'bg-emerald-500 border-emerald-600';
    }
    const t = type.toLowerCase();
    if (t.includes('regular')) return 'bg-white border-slate-400';
    if (t.includes('zonal') || t.includes('plata') || t.includes('caba') || t.includes('lomas')) return 'bg-blue-500 border-blue-600';
    if (t.includes('particular')) return 'bg-amber-400 border-amber-500';
    if (t.includes('express')) return 'bg-emerald-500 border-emerald-600';
    return 'bg-slate-200 border-slate-300';
  };

  const getSellerBadgeStyle = (name?: string | null) => {
    if (!name) return { bg: "bg-slate-50", text: "text-slate-500", border: "border-slate-200", dot: "bg-slate-400" };
    const lower = name.toLowerCase().trim();
    if (lower.includes("ludmila")) {
      return { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200", dot: "bg-purple-500" };
    }
    if (lower.includes("facundo")) {
      return { bg: "bg-sky-50", text: "text-sky-700", border: "border-sky-200", dot: "bg-sky-500" };
    }
    if (lower.includes("jazmin") || lower.includes("jazmín")) {
      return { bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200", dot: "bg-rose-500" };
    }
    if (lower.includes("diego")) {
      return { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", dot: "bg-amber-500" };
    }
    if (lower.includes("lucas")) {
      return { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", dot: "bg-emerald-500" };
    }
    if (lower.includes("ezequiel")) {
      return { bg: "bg-indigo-50", text: "text-indigo-700", border: "border-indigo-200", dot: "bg-indigo-500" };
    }
    if (lower.includes("camila")) {
      return { bg: "bg-teal-50", text: "text-teal-700", border: "border-teal-200", dot: "bg-teal-500" };
    }
    if (lower.includes("matias") || lower.includes("matías")) {
      return { bg: "bg-cyan-50", text: "text-cyan-700", border: "border-cyan-200", dot: "bg-cyan-500" };
    }
    if (lower.includes("eriberto")) {
      return { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200", dot: "bg-blue-500" };
    }
    const PALETTE = [
      { bg: "bg-violet-50", text: "text-violet-700", border: "border-violet-200", dot: "bg-violet-500" },
      { bg: "bg-teal-50", text: "text-teal-700", border: "border-teal-200", dot: "bg-teal-500" },
      { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200", dot: "bg-orange-500" },
      { bg: "bg-pink-50", text: "text-pink-700", border: "border-pink-200", dot: "bg-pink-500" },
      { bg: "bg-lime-50", text: "text-lime-700", border: "border-lime-200", dot: "bg-lime-500" },
      { bg: "bg-fuchsia-50", text: "text-fuchsia-700", border: "border-fuchsia-200", dot: "bg-fuchsia-500" },
    ];
    let hash = 0;
    for (let i = 0; i < lower.length; i++) hash = (hash << 5) - hash + lower.charCodeAt(i);
    return PALETTE[Math.abs(hash) % PALETTE.length];
  };

  const normalizeSellerName = (name?: string | null): string => {
    if (!name) return '';
    const trimmed = name.trim();
    if (/^jazm[ií]n(\s+s[aá]nchez)?$/i.test(trimmed)) return 'Jazmin Sanchez';
    if (/^ludmila(\s+krenz)?$/i.test(trimmed)) return 'Ludmila Krenz';
    if (/^facundo(\s+paz)?$/i.test(trimmed)) return 'Facundo Paz';
    if (/^diego(\s+b[oó]veda)?$/i.test(trimmed)) return 'Diego Bóveda';
    return trimmed;
  };

  const isOrderWholesale = (order: any): boolean => {
    if (!order) return false;
    if (order.channel === 'mayorista') return true;
    const legacy = (order.legacy_code || '').toUpperCase().trim();
    if (legacy.startsWith('AQU') || legacy.startsWith('POW')) return true;
    if (legacy.startsWith('AQ-') && !legacy.startsWith('AQ-FP')) return true;
    if (order.clients) {
      if (Array.isArray(order.clients)) {
        return !!order.clients[0]?.is_wholesale;
      }
      return !!order.clients.is_wholesale;
    }
    return false;
  };

  const [activeTab, setActiveTab] = useState<'form' | 'list'>('list');
  const [statusFilter, setStatusFilter] = useState<'Pendientes' | 'En Revisión' | 'Entregados' | 'Anulados' | 'Todos'>('Pendientes');
  const [clientTypeFilter, setClientTypeFilter] = useState<'todos' | 'minoristas' | 'mayoristas'>('minoristas');
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [productSearchTerm, setProductSearchTerm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const isEditingRef = useRef(false);

  // Load from DB & Sheet Sync States
  const [showLoadFromDbModal, setShowLoadFromDbModal] = useState(false);
  const [loadFromDbSearch, setLoadFromDbSearch] = useState("");
  const [recentDbOrders, setRecentDbOrders] = useState<any[]>([]);
  const [loadingDbOrders, setLoadingDbOrders] = useState(false);
  const [syncingOrderId, setSyncingOrderId] = useState<string | null>(null);

  const [products, setProducts] = useState<Product[]>([]);

  // Filter products for the searchable dropdown using smart multi-word search on Name and SKU
  const filteredDropdownProducts = products
    .filter(p => {
      if (p.is_active === false || p.category === 'Interno' || p.name?.startsWith('[Interno]')) return false;
      if (p.sku?.startsWith('AUTO-') && products.some(other => other.id !== p.id && other.is_active !== false && other.category !== 'Interno' && !other.sku?.startsWith('AUTO-') && (other.sku === p.name || normalizeText(other.name) === normalizeText(p.name)))) return false;
      if (!productSearchTerm) return true;
      
      const searchWords = productSearchTerm.toLowerCase().split(/\s+/).filter(Boolean);
      if (searchWords.length === 0) return true;
      
      return searchWords.every(word => 
        p.name.toLowerCase().includes(word) || 
        (p.sku && p.sku.toLowerCase().includes(word))
      );
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const [searchTerm, setSearchTerm] = useState("");
  const [isVisualModalOpen, setIsVisualModalOpen] = useState(false);
  const [isOrderSummaryExpanded, setIsOrderSummaryExpanded] = useState(true);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [orderCategory, setOrderCategory] = useState<string>("auto");

  // Order Discount States (Global)
  const [orderDiscountType, setOrderDiscountType] = useState<'percentage' | 'fixed'>('percentage');
  const [orderDiscountValue, setOrderDiscountValue] = useState<number>(0);

  // Item Discounts Accordion State in Page Summary
  const [openItemDiscountIds, setOpenItemDiscountIds] = useState<Record<string, boolean>>({});
  const toggleItemDiscount = (id: string) => {
    setOpenItemDiscountIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const detectedCategory = useMemo(() => {
    if (orderItems.length === 0) return "OTRO";
    
    let termotanqueCount = 0;
    let tanquesCount = 0;
    let biofortCount = 0;
    let instalacionBiofortCount = 0;
    let mepCount = 0;
    let rolloMembranaCount = 0;
    let latexCount = 0;
    let baseCount = 0;
    let escalerasCount = 0;
    let colombraroCount = 0;
    let herramientasCount = 0;
    let otrosCount = 0;
    
    orderItems.forEach(item => {
      const nameLower = (item.name || "").toLowerCase();
      const skuLower = (item.sku || "").toLowerCase();
      const full = `${nameLower} ${skuLower}`;

      if (full.includes("instalaci") || full.includes("mano de obra")) {
        instalacionBiofortCount += item.quantity;
      } else if (full.includes("termotanque") || full.includes("termo")) {
        termotanqueCount += item.quantity;
      } else if (full.includes("biodigestor") || full.includes("septic") || full.includes("séptic") || full.includes("desengrasadora") || full.includes("lodos") || full.includes("biofort")) {
        biofortCount += item.quantity;
      } else if (full.includes("base hierro") || (full.includes("base") && !full.includes("tanque") && !full.includes("revestimiento"))) {
        baseCount += item.quantity;
      } else if (full.includes("aquafort") || full.includes("tanque") || full.includes("flotante") || full.includes("flotador") || full.includes("bicapa") || full.includes("tricapa") || full.includes("cuatricapa") || full.includes("cisterna")) {
        tanquesCount += item.quantity;
      } else if (full.includes("rollo") || full.includes("asfalt") || full.includes("aluflex") || full.includes("megaflex") || full.includes("membrana en rollo")) {
        rolloMembranaCount += item.quantity;
      } else if (full.includes("látex") || full.includes("latex") || full.includes("bianca") || full.includes("andina")) {
        latexCount += item.quantity;
      } else if (full.includes("meps") || full.includes("mep") || full.includes("equilibrio") || full.includes("revestimiento") || full.includes("membrana")) {
        mepCount += item.quantity;
      } else if (full.includes("escalera")) {
        escalerasCount += item.quantity;
      } else if (full.includes("colombraro")) {
        colombraroCount += item.quantity;
      } else if (full.includes("kld") || full.includes("caterpillar") || full.includes("herramienta") || full.includes("morsa") || full.includes("taladro") || full.includes("amoladora")) {
        herramientasCount += item.quantity;
      } else {
        otrosCount += item.quantity;
      }
    });
    
    const counts = [
      { cat: "TANQUES", count: tanquesCount },
      { cat: "TERMOTANQUES", count: termotanqueCount },
      { cat: "BIODIGESTOR", count: biofortCount },
      { cat: "INSTALACIÓN BIOFORT", count: instalacionBiofortCount },
      { cat: "BASE", count: baseCount },
      { cat: "LATEX", count: latexCount },
      { cat: "ROLLO MEMBRANA", count: rolloMembranaCount },
      { cat: "MEP", count: mepCount },
      { cat: "ESCALERAS", count: escalerasCount },
      { cat: "COLOMBRARO", count: colombraroCount },
      { cat: "HERRAMIENTAS ELÉCTRICAS", count: herramientasCount },
      { cat: "OTRO", count: otrosCount }
    ];
    
    counts.sort((a, b) => b.count - a.count);
    return counts[0].count > 0 ? counts[0].cat : "OTRO";
  }, [orderItems]);

  const [usageCounts, setUsageCounts] = useState<Record<string, number>>({});
  const [role, setRole] = useState<'seller' | 'admin'>('seller');
  const [sellerType, setSellerType] = useState<'minorista' | 'mayorista'>('minorista');
  const [listType, setListType] = useState<'mis_pedidos' | 'todos'>('mis_pedidos');
  const [sellerFilter, setSellerFilter] = useState<string>('todos');
  const [sellersList, setSellersList] = useState<{ id: string; full_name: string; email: string; role?: string }[]>([]);
  const [currentSeller, setCurrentSeller] = useState<{ id: string; full_name: string; email: string; role?: string } | null>(null);
  const [selectedSellerId, setSelectedSellerId] = useState<string>("");
  const [orders, setOrders] = useState<any[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [orderSearchQuery, setOrderSearchQuery] = useState("");
  const [sortField, setSortField] = useState<'order_date' | 'seller'>('order_date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const handleSort = (field: 'order_date' | 'seller') => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Custom Views & URL Filter Sync States
  const [customViews, setCustomViews] = useState<CustomView[]>([]);
  const [showCustomViewsDropdown, setShowCustomViewsDropdown] = useState(false);
  const [showSaveViewModal, setShowSaveViewModal] = useState(false);
  const [newViewName, setNewViewName] = useState("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [showDateDropdown, setShowDateDropdown] = useState<boolean>(false);
  const isInitialMount = useRef(true);

  // Load custom views from localStorage and parse URL query params on initial mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("zc_pedidos_custom_views");
        if (saved) {
          setCustomViews(JSON.parse(saved));
        }
      } catch (e) {
        console.error("Error loading custom views from localStorage:", e);
      }

      const params = new URLSearchParams(window.location.search);
      const urlStatus = params.get("status");
      if (urlStatus && ['Pendientes', 'En Revisión', 'Entregados', 'Anulados', 'Todos'].includes(urlStatus)) {
        setStatusFilter(urlStatus as any);
      }
      const urlClientType = params.get("client_type");
      if (urlClientType && ['todos', 'minoristas', 'mayoristas'].includes(urlClientType)) {
        setClientTypeFilter(urlClientType as any);
      }
      const urlProducts = params.get("products");
      if (urlProducts) {
        const pIds = urlProducts.split(',').map(s => s.trim()).filter(Boolean);
        setSelectedProducts(pIds);
      }
      const urlSearch = params.get("search");
      if (urlSearch !== null) {
        setOrderSearchQuery(urlSearch);
      }
      const urlListType = params.get("list_type");
      if (urlListType && ['mis_pedidos', 'todos'].includes(urlListType)) {
        setListType(urlListType as any);
      }
      const urlDateFrom = params.get("date_from");
      if (urlDateFrom) {
        setDateFrom(urlDateFrom);
      }
      const urlDateTo = params.get("date_to");
      if (urlDateTo) {
        setDateTo(urlDateTo);
      }
    }
  }, []);

  // Update browser URL query string smoothly whenever active filters change
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);

    if (statusFilter !== 'Pendientes') {
      params.set("status", statusFilter);
    } else {
      params.delete("status");
    }

    if (clientTypeFilter !== 'todos') {
      params.set("client_type", clientTypeFilter);
    } else {
      params.delete("client_type");
    }

    if (selectedProducts.length > 0) {
      params.set("products", selectedProducts.join(","));
    } else {
      params.delete("products");
    }

    if (orderSearchQuery.trim()) {
      params.set("search", orderSearchQuery.trim());
    } else {
      params.delete("search");
    }

    if (listType !== 'mis_pedidos') {
      params.set("list_type", listType);
    } else {
      params.delete("list_type");
    }

    if (dateFrom) {
      params.set("date_from", dateFrom);
    } else {
      params.delete("date_from");
    }

    if (dateTo) {
      params.set("date_to", dateTo);
    } else {
      params.delete("date_to");
    }

    const newQueryString = params.toString();
    const newPath = newQueryString 
      ? `${window.location.pathname}?${newQueryString}` 
      : window.location.pathname;

    window.history.replaceState(null, "", newPath);
  }, [statusFilter, clientTypeFilter, selectedProducts, orderSearchQuery, listType, dateFrom, dateTo]);

  // Support browser back/forward buttons (popstate)
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      setStatusFilter((params.get("status") as any) || 'Pendientes');
      setClientTypeFilter((params.get("client_type") as any) || 'minoristas');
      setSelectedProducts(params.get("products") ? params.get("products")!.split(',').filter(Boolean) : []);
      setOrderSearchQuery(params.get("search") || '');
      setListType((params.get("list_type") as any) || 'mis_pedidos');
      setDateFrom(params.get("date_from") || '');
      setDateTo(params.get("date_to") || '');
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const saveCustomView = (name: string) => {
    if (!name.trim()) return;
    const newView: CustomView = {
      id: 'view_' + Date.now(),
      name: name.trim(),
      filters: {
        statusFilter,
        clientTypeFilter,
        selectedProducts,
        orderSearchQuery,
        listType,
        dateFrom,
        dateTo
      }
    };
    const updatedViews = [...customViews, newView];
    setCustomViews(updatedViews);
    try {
      localStorage.setItem("zc_pedidos_custom_views", JSON.stringify(updatedViews));
    } catch (e) {
      console.error("Error saving custom view to localStorage:", e);
    }
    setNewViewName("");
    setShowSaveViewModal(false);
  };

  const deleteCustomView = (id: string) => {
    const updatedViews = customViews.filter(v => v.id !== id);
    setCustomViews(updatedViews);
    try {
      localStorage.setItem("zc_pedidos_custom_views", JSON.stringify(updatedViews));
    } catch (e) {
      console.error("Error deleting custom view from localStorage:", e);
    }
  };

  const applyCustomView = (view: CustomView) => {
    setStatusFilter(view.filters.statusFilter);
    setClientTypeFilter(view.filters.clientTypeFilter);
    setSelectedProducts(view.filters.selectedProducts || []);
    setOrderSearchQuery(view.filters.orderSearchQuery || "");
    if (view.filters.listType) {
      setListType(view.filters.listType);
    }
    setDateFrom(view.filters.dateFrom || "");
    setDateTo(view.filters.dateTo || "");
    setShowCustomViewsDropdown(false);
  };

  const resetAllFilters = () => {
    setStatusFilter('Pendientes');
    setClientTypeFilter('todos');
    setSelectedProducts([]);
    setOrderSearchQuery("");
    setListType('mis_pedidos');
    setDateFrom("");
    setDateTo("");
    setShowCustomViewsDropdown(false);
  };

  const currentActiveViewName = useMemo(() => {
    const matched = customViews.find(v => 
      v.filters.statusFilter === statusFilter &&
      v.filters.clientTypeFilter === clientTypeFilter &&
      JSON.stringify((v.filters.selectedProducts || []).slice().sort()) === JSON.stringify(selectedProducts.slice().sort()) &&
      v.filters.orderSearchQuery === orderSearchQuery &&
      (v.filters.listType || 'mis_pedidos') === listType &&
      (v.filters.dateFrom || "") === dateFrom &&
      (v.filters.dateTo || "") === dateTo
    );
    return matched ? matched.name : null;
  }, [customViews, statusFilter, clientTypeFilter, selectedProducts, orderSearchQuery, listType, dateFrom, dateTo]);

  const hasActiveCustomFilters = useMemo(() => {
    return statusFilter !== 'Pendientes' || 
           clientTypeFilter !== 'todos' || 
           selectedProducts.length > 0 || 
           orderSearchQuery.trim() !== '' ||
           listType !== 'mis_pedidos' ||
           dateFrom !== '' ||
           dateTo !== '';
  }, [statusFilter, clientTypeFilter, selectedProducts, orderSearchQuery, listType, dateFrom, dateTo]);

  // Kits & Payment States
  const [kits, setKits] = useState<Kit[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [paymentState, setPaymentState] = useState<'unpaid' | 'partial' | 'paid'>('unpaid');
  const [depositAmountInput, setDepositAmountInput] = useState<number>(0);
  const [paymentTiming, setPaymentTiming] = useState<'contra_entrega' | 'partial' | 'paid'>('contra_entrega');
  const [customDepositAmount, setCustomDepositAmount] = useState<number>(0);

  // Dynamic payments list
  interface PaymentBreakdownItem {
    id: string;
    payment_method_id: string;
    amount: number;
    card_installments?: number;
    card_surcharge?: number;
    receipt_url?: string;
    notes?: string;
    created_at?: string;
  }
  const [paymentsList, setPaymentsList] = useState<PaymentBreakdownItem[]>([
    {
      id: Math.random().toString(36).substring(2, 9),
      payment_method_id: "a3a890a8-b677-4b7b-8ffb-d36c2e7b5ad3", // default cash/transfer ID
      amount: 0,
      receipt_url: "",
      notes: ""
    }
  ]);

  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>("");
  const [adminSellerFilter, setAdminSellerFilter] = useState<string>("mis_kits");
  const [selectedKitId, setSelectedKitId] = useState<string>("");

  const [showEditNameModal, setShowEditNameModal] = useState(false);
  const [editKitId, setEditKitId] = useState("");
  const [editKitNameValue, setEditKitNameValue] = useState("");

  // DB Entity lists
  const [clients, setClients] = useState<Client[]>([]);
  const [localities, setLocalities] = useState<Locality[]>([]);
  const [clientAddresses, setClientAddresses] = useState<Address[]>([]);
  const [deliveryTimes, setDeliveryTimes] = useState<DeliveryTime[]>([]);

  // New Client Form State
  const [newClientName, setNewClientName] = useState("");
  const [newClientTaxId, setNewClientTaxId] = useState("");
  const [showTaxIdField, setShowTaxIdField] = useState(false);
  const [newClientPhones, setNewClientPhones] = useState<string[]>(["", ""]);
  const newClientPhone = newClientPhones[0] || "";
  const setNewClientPhone = (phoneStr: string) => {
    const phones = (phoneStr || "").split(",").map(p => p.trim()).filter(Boolean);
    if (phones.length === 0) {
      setNewClientPhones(["", ""]);
    } else if (phones.length === 1) {
      setNewClientPhones([phones[0], ""]);
    } else {
      setNewClientPhones(phones);
    }
  };
  const cleanPhoneForSaving = (phone: string): string => {
    const digits = phone.replace(/\D/g, '');
    if (digits.startsWith('549') && digits.length >= 10) {
      return digits.substring(3);
    }
    if (digits.startsWith('54') && digits.length >= 9) {
      return digits.substring(2);
    }
    return digits;
  };

  // Client Selection Toggle
  const [selectedClientId, setSelectedClientId] = useState("");
  const isNewClient = !selectedClientId;
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [clientSearchQuery, setClientSearchQuery] = useState("");
  const [debouncedClientSearch, setDebouncedClientSearch] = useState("");
  const [debouncedOrderSearch, setDebouncedOrderSearch] = useState("");
  const [showClientDropdown, setShowClientDropdown] = useState(false);

  // Debounce client search
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedClientSearch(newClientPhone || clientSearchQuery);
    }, 400);
    return () => clearTimeout(handler);
  }, [clientSearchQuery, newClientPhone]);

  // Debounce order search
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedOrderSearch(orderSearchQuery);
    }, 400);
    return () => clearTimeout(handler);
  }, [orderSearchQuery]);

  // Server-side client search
  useEffect(() => {
    if (!debouncedClientSearch.trim()) return;
    async function searchClients() {
      try {
        const q = debouncedClientSearch.trim();
        const digits = q.replace(/\D/g, '');
        let cleanQ = digits;
        if (digits.startsWith('549') && digits.length >= 10) {
          cleanQ = digits.substring(3);
        } else if (digits.startsWith('54') && digits.length >= 9) {
          cleanQ = digits.substring(2);
        }

        let queryFilter = `business_name.ilike.%${q}%,phone_primary.ilike.%${q}%,phone_secondary.ilike.%${q}%`;
        if (cleanQ && cleanQ !== q) {
          queryFilter += `,phone_primary.ilike.%${cleanQ}%,phone_secondary.ilike.%${cleanQ}%`;
        }

        const { data, error } = await supabase
          .from("v_client_balances_and_stats")
          .select("id, business_name, tax_id, phone_primary, phone_secondary, billing_address, is_wholesale")
          .or(queryFilter)
          .limit(50);
        if (error) throw error;
        if (data) {
          setClients(prev => {
            const mappedResults: Client[] = data.map(item => ({
              id: item.id,
              business_name: item.business_name,
              tax_id: item.tax_id || "",
              phone_primary: item.phone_primary,
              phone_secondary: item.phone_secondary || undefined,
              billing_address: item.billing_address || undefined,
              is_wholesale: item.is_wholesale
            }));
            const merged = [...mappedResults];
            prev.forEach(c => {
              if (!merged.some(m => m.id === c.id)) {
                merged.push(c);
              }
            });
            return merged;
          });
        }
      } catch (err) {
        console.error("Error searching clients:", err);
      }
    }
    searchClients();
  }, [debouncedClientSearch]);

  // Form State
  const [entregaInicial, setEntregaInicial] = useState("");
  const [entregaMaxima, setEntregaMaxima] = useState("");
  const [fechaPedido, setFechaPedido] = useState(() => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  });
  const [whaticketLink, setWhaticketLink] = useState("");

  const [advertisingSources, setAdvertisingSources] = useState<AdvertisingSource[]>([]);
  const [orderMediums, setOrderMediums] = useState<OrderMedium[]>([]);
  const [phoneLines, setPhoneLines] = useState<PhoneLine[]>([]);
  const [topAdvertisingSources, setTopAdvertisingSources] = useState<AdvertisingSource[]>([]);
  const [topOrderMediums, setTopOrderMediums] = useState<OrderMedium[]>([]);
  const [topPhoneLines, setTopPhoneLines] = useState<PhoneLine[]>([]);
  const [isOrganic, setIsOrganic] = useState(false);
  
  const [legacyCode, setLegacyCode] = useState("");
  const [selectedAdvertisingSourceId, setSelectedAdvertisingSourceId] = useState("");
  const [selectedOrderMediumId, setSelectedOrderMediumId] = useState("");
  const [orderMediumSearchQuery, setOrderMediumSearchQuery] = useState("");
  const [showOrderMediumDropdown, setShowOrderMediumDropdown] = useState(false);

  // Default Order Medium to Whaticket
  useEffect(() => {
    if (orderMediums.length > 0 && !selectedOrderMediumId) {
      const whaticketMedium = orderMediums.find(m => m.name.toLowerCase() === 'whaticket');
      if (whaticketMedium) {
        setSelectedOrderMediumId(whaticketMedium.id);
      }
    }
  }, [orderMediums, selectedOrderMediumId]);

  // Default Advertising Source to Publicidad Meta
  useEffect(() => {
    if (advertisingSources.length > 0 && !selectedAdvertisingSourceId) {
      const metaAdv = advertisingSources.find(a => a.name.toLowerCase() === 'publicidad meta');
      if (metaAdv) {
        setSelectedAdvertisingSourceId(metaAdv.id);
      }
    }
  }, [advertisingSources, selectedAdvertisingSourceId]);

  useEffect(() => {
    const matched = orderMediums.find(m => m.id === selectedOrderMediumId);
    if (matched) {
      setOrderMediumSearchQuery(matched.name);
    } else {
      setOrderMediumSearchQuery("");
    }
  }, [selectedOrderMediumId, orderMediums]);

  const [selectedPhoneLineId, setSelectedPhoneLineId] = useState("");
  const [deliveryDetail, setDeliveryDetail] = useState("");

  const [orderStatus, setOrderStatus] = useState<string>("Pendiente");
  const [holdReason, setHoldReason] = useState<string>("Falta Stock");
  const [holdProductId, setHoldProductId] = useState<string>("");
  
  // Modals / Dropdown Search States
  const [showLineManagerModal, setShowLineManagerModal] = useState(false);
  const [advertisingSearchQuery, setAdvertisingSearchQuery] = useState("");
  const [showAdvertisingDropdown, setShowAdvertisingDropdown] = useState(false);
  
  // Form Line Creation States
  const [newLineName, setNewLineName] = useState("");
  const [newLineNumber, setNewLineNumber] = useState("");
  const [savingLine, setSavingLine] = useState(false);

  const formatTaxIdLabel = (taxId?: string) => {
    if (!taxId) return "";
    const digits = taxId.replace(/\D/g, "");
    if (digits.length <= 8) {
      return `DNI: ${taxId}`;
    } else {
      return `CUIT: ${taxId}`;
    }
  };

  // Delivery details (shares fields whether new or existing client)
  const [cliente, setCliente] = useState(""); // Display name
  const [localidadId, setLocalidadId] = useState("");
  const [localitySearch, setLocalitySearch] = useState("");
  const [isLocalityDropdownOpen, setIsLocalityDropdownOpen] = useState(false);

  // Sincronizar campo de búsqueda al seleccionar localidad
  useEffect(() => {
    const selected = localities.find(l => l.id === localidadId);
    if (selected) {
      setLocalitySearch(selected.name);
    } else {
      setLocalitySearch("");
    }
  }, [localidadId, localities]);

  const [direccion, setDireccion] = useState("");
  const [aclaraciones, setAclaraciones] = useState("");
  const [linkMaps, setLinkMaps] = useState("");
  
  const [flete, setFlete] = useState("");

  // Helper to extract coordinates from Google Maps link
  const parseCoordinates = (link: string) => {
    if (!link) return null;
    let match = link.match(/q=(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (!match) {
      match = link.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    }
    if (match) {
      return {
        lat: parseFloat(match[1]),
        lng: parseFloat(match[2])
      };
    }
    return null;
  };

  // Obtener la fecha sugerida de entrega inicial basada en la agenda del flete seleccionado
  const suggestedDeliveryDate = React.useMemo(() => {
    if (!flete || !fechaPedido) return null;
    const selectedFlete = deliveryTimes.find(dt => dt.name === flete);
    if (!selectedFlete) return null;
    
    let days = selectedFlete.delivery_days || [];
    if (selectedFlete.category === 'Regular') {
      days = [1, 2, 3, 4, 5, 6]; // Lunes a Sábados
    }
    
    const schedule = selectedFlete.description;
    if (!schedule && days.length === 0) return null;
    
    const nextDate = calculateNextDeliveryDate(schedule, fechaPedido, days);
    if (!nextDate) return null;
    
    const yyyy = nextDate.getFullYear();
    const mm = String(nextDate.getMonth() + 1).padStart(2, '0');
    const dd = String(nextDate.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }, [flete, deliveryTimes, fechaPedido]);

  // Obtener la fecha sugerida de entrega máxima basada en la agenda del flete seleccionado
  const suggestedDeliveryDateMax = React.useMemo(() => {
    if (!flete || !fechaPedido) return null;
    const selectedFlete = deliveryTimes.find(dt => dt.name === flete);
    if (!selectedFlete) return null;
    
    if (selectedFlete.category === 'Regular') {
      const nextDateMax = calculateNthBusinessDay(fechaPedido, 4);
      if (!nextDateMax) return null;
      const yyyy = nextDateMax.getFullYear();
      const mm = String(nextDateMax.getMonth() + 1).padStart(2, '0');
      const dd = String(nextDateMax.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    }
    
    return suggestedDeliveryDate;
  }, [flete, deliveryTimes, fechaPedido, suggestedDeliveryDate]);

  // Seleccionar automáticamente el tipo de entrega al cambiar de localidad (localidad -> Zona -> Tipo Entrega)
  useEffect(() => {
    if (!localidadId) return;
    const selectedLocality = localities.find(l => l.id === localidadId);
    if (!selectedLocality) return;
    
    if (selectedLocality.zones && selectedLocality.zones.delivery_times) {
      setFlete(selectedLocality.zones.delivery_times.name);
    }
  }, [localidadId, localities]);

  // Sugerir y establecer automáticamente las fechas de entrega según el flete seleccionado y la fecha del pedido
  useEffect(() => {
    if (!flete) return;
    const selectedFlete = deliveryTimes.find(dt => dt.name === flete);
    if (!selectedFlete) return;
    
    // Si la fecha actual ya es válida para este flete, no la sobrescribimos
    if (entregaInicial && isDateValidForFlete(entregaInicial, flete, deliveryTimes, fechaPedido)) {
      return;
    }
    
    let days = selectedFlete.delivery_days || [];
    if (selectedFlete.category === 'Regular') {
      days = [1, 2, 3, 4, 5, 6]; // Lunes a Sábados
    }
    
    const nextDate = calculateNextDeliveryDate(selectedFlete.description, fechaPedido, days);
    if (nextDate) {
      const yyyy = nextDate.getFullYear();
      const mm = String(nextDate.getMonth() + 1).padStart(2, '0');
      const dd = String(nextDate.getDate()).padStart(2, '0');
      const dateStr = `${yyyy}-${mm}-${dd}`;
      setEntregaInicial(dateStr);
      
      if (selectedFlete.category === 'Regular') {
        const nextDateMax = calculateNthBusinessDay(fechaPedido, 4);
        if (nextDateMax) {
          const yyyyMax = nextDateMax.getFullYear();
          const mmMax = String(nextDateMax.getMonth() + 1).padStart(2, '0');
          const ddMax = String(nextDateMax.getDate()).padStart(2, '0');
          setEntregaMaxima(`${yyyyMax}-${mmMax}-${ddMax}`);
        } else {
          setEntregaMaxima(dateStr);
        }
      } else {
        setEntregaMaxima(dateStr);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flete, fechaPedido, deliveryTimes]);

  // Si la fecha seleccionada no es compatible con el flete actual, cambiar automáticamente a "Día Particular"
  useEffect(() => {
    if (!entregaInicial || !flete || deliveryTimes.length === 0 || !fechaPedido) return;

    const selectedFlete = deliveryTimes.find(dt => dt.name === flete);
    if (!selectedFlete) return;

    // Si ya es Día Particular (Particular), no hace falta cambiar
    if (selectedFlete.category === 'Particular') return;

    const isValid = isDateValidForFlete(entregaInicial, flete, deliveryTimes, fechaPedido);
    if (!isValid) {
      const particularOption = deliveryTimes.find(dt => dt.category === 'Particular');
      if (particularOption) {
        setFlete(particularOption.name);
      }
    }
  }, [entregaInicial, flete, deliveryTimes, fechaPedido]);

  const [paymentType, setPaymentType] = useState<'efectivo' | 'tarjeta'>('efectivo');
  const [cardInstallments, setCardInstallments] = useState<number>(1);
  const [cardSurcharge, setCardSurcharge] = useState<number>(0);
  const [dbPaymentMethods, setDbPaymentMethods] = useState<any[]>([]);
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState<string>("");

  const activePaymentMethods = useMemo(() => {
    const seen = new Set<string>();
    return (dbPaymentMethods || [])
      .filter(pm => pm.is_active !== false)
      .filter(pm => {
        const key = (pm.name || '').trim().toLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }, [dbPaymentMethods]);
  const [isFreeShipping, setIsFreeShipping] = useState(true);
  const [shippingCost, setShippingCost] = useState<number>(0);
  const [includeIVA, setIncludeIVA] = useState(false);
  const [depositReceiptUrl, setDepositReceiptUrl] = useState("");
  const [uploadingReceipt, setUploadingReceipt] = useState(false);

  const handleReceiptUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingReceipt(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `deposit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${fileExt}`;
      const filePath = `receipts/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from('product-images')
        .getPublicUrl(filePath);

      setDepositReceiptUrl(publicUrlData.publicUrl);
    } catch (err: any) {
      console.error("Error al subir el comprobante:", err);
      alert("Error al subir el comprobante: " + err.message);
    } finally {
      setUploadingReceipt(false);
    }
  };

  const handlePaymentReceiptUpload = async (id: string, file: File) => {
    setUploadingReceipt(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `payment_${id}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${fileExt}`;
      const filePath = `receipts/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from('product-images')
        .getPublicUrl(filePath);

      setPaymentsList(prev => prev.map(p => p.id === id ? { ...p, receipt_url: publicUrlData.publicUrl } : p));
    } catch (err: any) {
      console.error("Error al subir el comprobante del pago:", err);
      alert("Error al subir el comprobante: " + err.message);
    } finally {
      setUploadingReceipt(false);
    }
  };

  const selectedPaymentMethod = (() => {
    const primaryPmId = paymentsList[0]?.payment_method_id || selectedPaymentMethodId;
    const matched = dbPaymentMethods.find(pm => pm.id === primaryPmId);
    if (matched) {
      const isCard = matched.id !== "a3a890a8-b677-4b7b-8ffb-d36c2e7b5ad3" && 
                     ((matched.surcharge_percentage || 0) > 0 || 
                      (matched.name && (matched.name.toLowerCase().includes("tarjeta") || matched.name.toLowerCase().includes("cuota") || matched.name.toLowerCase().includes("link"))));
      const surcharge = isCard 
        ? (paymentsList[0]?.card_surcharge !== undefined ? paymentsList[0].card_surcharge : (matched.surcharge_percentage || 0))
        : 0;
      const installments = isCard
        ? (paymentsList[0]?.card_installments !== undefined ? paymentsList[0].card_installments : (matched.installments || 1))
        : 1;
      return {
        id: matched.id,
        name: matched.name,
        surcharge_percentage: surcharge,
        installments
      };
    }
    return {
      id: "a3a890a8-b677-4b7b-8ffb-d36c2e7b5ad3",
      name: "Efectivo / Transferencia",
      surcharge_percentage: 0,
      installments: 1
    };
  })();

  // Load preloaded budget if it exists
  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = sessionStorage.getItem("preloaded_budget");
      if (stored) {
        try {
          const data = JSON.parse(stored);
          if (data.items && Array.isArray(data.items)) {
            setOrderItems(data.items);
          }
          if (data.paymentType) setPaymentType(data.paymentType);
          if (data.cardInstallments) setCardInstallments(data.cardInstallments);
          if (data.cardSurcharge) setCardSurcharge(data.cardSurcharge);
          
          sessionStorage.removeItem("preloaded_budget");
          setActiveTab('form');
          
          alert("¡Presupuesto precargado con éxito! Podés completar la entrega y flete para guardar el pedido.");
        } catch (e) {
          console.error("Error parsing preloaded budget", e);
        }
      }
    }
  }, []);

  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [showPostponementModal, setShowPostponementModal] = useState(false);
  const [originalDeliveryDate, setOriginalDeliveryDate] = useState("");
  const [postponementReasonType, setPostponementReasonType] = useState<'cliente' | 'empresa'>('cliente');
  const [postponementMotive, setPostponementMotive] = useState("");
  const [hasDeclaredPostponementReason, setHasDeclaredPostponementReason] = useState(false);

  // Helper to generate next sequential legacy code for a seller
  const generateNextLegacyCode = async (userId: string) => {
    if (!userId) return;
    try {
      // 1. Intentar consultar el próximo código disponible en la planilla del vendedor
      try {
        const sheetRes = await fetch(`/api/vendedores/create-sheet-order?sellerId=${userId}`);
        if (sheetRes.ok) {
          const sheetData = await sheetRes.json();
          if (sheetData.synced && sheetData.code) {
            setLegacyCode(sheetData.code);
            return;
          }
        }
      } catch (sheetErr) {
        console.warn("Could not fetch next code from sheet, falling back to DB:", sheetErr);
      }

      const { data: seller } = await supabase
        .from('sellers')
        .select('full_name, email')
        .eq('id', userId)
        .maybeSingle();

      let prefix = "ZC";
      if (seller) {
        const cleanName = (seller.full_name || "").toLowerCase().trim();
        if (cleanName.includes("jazmin") || cleanName.includes("jazmín")) prefix = "JS";
        else if (cleanName.includes("diego")) prefix = "DB";
        else if (cleanName.includes("ludmila")) prefix = "LK";
        else if (cleanName.includes("belen") || cleanName.includes("belén")) prefix = "BR";
        else if (cleanName.includes("mariano")) prefix = "MS";
        else if (cleanName.includes("pablo")) prefix = "PJ";
        else if (cleanName.includes("facundo")) prefix = "AQ-FP";
      }

      const { data: ordersData } = await supabase
        .from('orders')
        .select('legacy_code')
        .ilike('legacy_code', `${prefix}%`);

      let maxNum = 1000;
      let needsPadding = false;
      let paddingLength = 0;

      if (ordersData && ordersData.length > 0) {
        ordersData.forEach(item => {
          if (item.legacy_code) {
            const parts = item.legacy_code.split(/[\/,]/).map((c: string) => c.trim().toUpperCase());
            parts.forEach((part: string) => {
              if (part.startsWith(prefix.toUpperCase())) {
                const numStr = part.slice(prefix.length);
                const num = parseInt(numStr, 10);
                if (!isNaN(num)) {
                  if (num > maxNum) {
                    maxNum = num;
                    if (numStr.startsWith("0") && numStr.length > 1) {
                      needsPadding = true;
                      paddingLength = numStr.length;
                    } else {
                      needsPadding = false;
                    }
                  }
                }
              }
            });
          }
        });
      }

      let nextNum = maxNum + 1;
      let nextNumStr = String(nextNum);
      if (needsPadding && paddingLength > 0) {
        nextNumStr = nextNumStr.padStart(paddingLength, '0');
      }

      let candidateCode = `${prefix}${nextNumStr}`;
      // Verificar que el código candidato no exista ya en la base de datos
      let attempts = 0;
      while (attempts < 50) {
        const { data: codeExists } = await supabase
          .from('orders')
          .select('id')
          .eq('legacy_code', candidateCode)
          .maybeSingle();
        if (!codeExists) break;
        nextNum++;
        nextNumStr = String(nextNum);
        if (needsPadding && paddingLength > 0) {
          nextNumStr = nextNumStr.padStart(paddingLength, '0');
        }
        candidateCode = `${prefix}${nextNumStr}`;
        attempts++;
      }

      setLegacyCode(candidateCode);
    } catch (err) {
      console.error("Error generating legacy code:", err);
      setLegacyCode(`ZC${Date.now().toString().slice(-6)}`);
    }
  };

  // Load Initial Data
  useEffect(() => {
    async function loadInitialData() {
      try {
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) return;
        const userId = userData.user.id;
        setCurrentUserId(userId);
        setSelectedSellerId(userId);

        const PEDIDOS_CACHE_VER = "zc_pedidos_v14_sellers_and_pricing";
        const cachedUserId = sessionStorage.getItem("cached_pedidos_user_id");
        if (sessionStorage.getItem("cached_pedidos_ver") !== PEDIDOS_CACHE_VER || (cachedUserId && cachedUserId !== userId)) {
          sessionStorage.clear();
          sessionStorage.setItem("cached_pedidos_ver", PEDIDOS_CACHE_VER);
          sessionStorage.setItem("cached_pedidos_user_id", userId);
        }

        // Intentar cargar desde caché para velocidad instantánea
        const cachedProducts = sessionStorage.getItem("cached_pedidos_products");
        const cachedClients = sessionStorage.getItem("cached_pedidos_clients");
        const cachedLocalities = sessionStorage.getItem("cached_pedidos_localities");
        const cachedDt = sessionStorage.getItem("cached_pedidos_dt");
        const cachedType = sessionStorage.getItem("cached_pedidos_seller_type");
        const cachedRole = sessionStorage.getItem("cached_pedidos_role");
        const cachedKits = sessionStorage.getItem("cached_pedidos_kits");
        const cachedAdv = sessionStorage.getItem("cached_pedidos_adv");
        const cachedMediums = sessionStorage.getItem("cached_pedidos_mediums");
        const cachedLines = sessionStorage.getItem("cached_pedidos_lines");
        const cachedOrganic = sessionStorage.getItem("cached_pedidos_organic");
        const cachedPayMethods = sessionStorage.getItem("cached_pedidos_payment_methods");
        const cachedSellers = sessionStorage.getItem("cached_pedidos_sellers");
        const cachedCurrentSeller = sessionStorage.getItem("cached_pedidos_current_seller");

        if (cachedProducts && cachedClients && cachedLocalities && cachedDt && cachedType && cachedAdv && cachedMediums && cachedLines && cachedOrganic && cachedPayMethods) {
          setSellerType(cachedType as any);
          if (cachedRole) {
            setRole(cachedRole as any);
            setListType(cachedRole === 'admin' ? 'todos' : 'mis_pedidos');
          }
          if (cachedSellers) {
            try { setSellersList(JSON.parse(cachedSellers)); } catch (e) {}
          }
          if (cachedCurrentSeller) {
            try { setCurrentSeller(JSON.parse(cachedCurrentSeller)); } catch (e) {}
          }
          const parsedCache = JSON.parse(cachedProducts);
          setProducts(Array.isArray(parsedCache) ? parsedCache.filter((p: any) => p && p.is_active !== false) : []);
          setClients(JSON.parse(cachedClients));
          setLocalities(JSON.parse(cachedLocalities));
          setDeliveryTimes(JSON.parse(cachedDt));
          if (cachedKits) setKits(JSON.parse(cachedKits));
          setAdvertisingSources(JSON.parse(cachedAdv));
          setOrderMediums(JSON.parse(cachedMediums));
          setPhoneLines(JSON.parse(cachedLines));
          setIsOrganic(cachedOrganic === 'true');
          setDbPaymentMethods(JSON.parse(cachedPayMethods));
        }

        const cacheExists = !!(cachedProducts && cachedClients && cachedLocalities && cachedDt && cachedType && cachedAdv && cachedMediums && cachedLines && cachedOrganic && cachedPayMethods);
        if (cacheExists) {
          // Asegurar que sellersList y currentSeller estén disponibles
          if (!cachedSellers || !cachedCurrentSeller) {
            const [sellersRes, curSellerRes] = await Promise.all([
              supabase.from('sellers').select('id, full_name, email, role').eq('is_active', true).order('full_name'),
              supabase.from('sellers').select('id, full_name, email, role, seller_type, is_organic').eq('id', userId).maybeSingle()
            ]);
            if (sellersRes.data) {
              setSellersList(sellersRes.data);
              sessionStorage.setItem("cached_pedidos_sellers", JSON.stringify(sellersRes.data));
            }
            if (curSellerRes.data) {
              setCurrentSeller(curSellerRes.data);
              sessionStorage.setItem("cached_pedidos_current_seller", JSON.stringify(curSellerRes.data));
            }
          }

          // Si el caché de metadatos ya existe, evitamos la sobrecarga de consultas y transferencia a la base de datos
          const recentOrdersRes = await supabase
            .from("orders")
            .select("advertising_source_id, order_medium_id, received_phone_line_id")
            .order("created_at", { ascending: false })
            .limit(100);

          const recentOrders = recentOrdersRes.data || [];
          const parsedAdv = JSON.parse(cachedAdv);
          const parsedMediums = JSON.parse(cachedMediums);
          const parsedLines = JSON.parse(cachedLines);

          // 1. Procedencia Publicitaria
          const advCounts: Record<string, number> = {};
          recentOrders.forEach((o: any) => {
            if (o.advertising_source_id) {
              advCounts[o.advertising_source_id] = (advCounts[o.advertising_source_id] || 0) + 1;
            }
          });
          const topAdvIds = Object.keys(advCounts).sort((a, b) => advCounts[b] - advCounts[a]).slice(0, 3);
          const topAdvs = topAdvIds
            .map(id => parsedAdv.find((x: any) => x.id === id))
            .filter(Boolean) as AdvertisingSource[];
          setTopAdvertisingSources(topAdvs);

          // 2. Medio de Recepción
          const medCounts: Record<string, number> = {};
          recentOrders.forEach((o: any) => {
            if (o.order_medium_id) {
              medCounts[o.order_medium_id] = (medCounts[o.order_medium_id] || 0) + 1;
            }
          });
          const topMedIds = Object.keys(medCounts).sort((a, b) => medCounts[b] - medCounts[a]).slice(0, 3);
          const topMeds = topMedIds
            .map(id => parsedMediums.find((x: any) => x.id === id))
            .filter(Boolean) as OrderMedium[];
          setTopOrderMediums(topMeds);

          // 3. Línea Telefónica
          const lineCounts: Record<string, number> = {};
          recentOrders.forEach((o: any) => {
            if (o.received_phone_line_id) {
              lineCounts[o.received_phone_line_id] = (lineCounts[o.received_phone_line_id] || 0) + 1;
            }
          });
          const topLineIds = Object.keys(lineCounts).sort((a, b) => lineCounts[b] - lineCounts[a]).slice(0, 3);
          const topLines = topLineIds
            .map(id => parsedLines.find((x: any) => x.id === id))
            .filter(Boolean) as PhoneLine[];
          setTopPhoneLines(topLines);

          await generateNextLegacyCode(userId);
          return;
        }

        // Cargar desde la API en el backend
        const res = await fetch(`/api/vendedores/pedidos-init?userId=${userId}`);
        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        
        const payload = await res.json();
        
        if (payload.sellers) {
          setSellersList(payload.sellers);
          sessionStorage.setItem("cached_pedidos_sellers", JSON.stringify(payload.sellers));
        }
        if (payload.currentSeller) {
          setCurrentSeller(payload.currentSeller);
          sessionStorage.setItem("cached_pedidos_current_seller", JSON.stringify(payload.currentSeller));
        }
        
        setSellerType(payload.sellerType);
        sessionStorage.setItem("cached_pedidos_seller_type", payload.sellerType);
        
        setIsOrganic(payload.isOrganic);
        sessionStorage.setItem("cached_pedidos_organic", String(payload.isOrganic));

        setRole(payload.role);
        sessionStorage.setItem("cached_pedidos_role", payload.role);
        setListType(payload.role === 'admin' ? 'todos' : 'mis_pedidos');

        if (payload.advertisingSources) {
          setAdvertisingSources(payload.advertisingSources);
          sessionStorage.setItem("cached_pedidos_adv", JSON.stringify(payload.advertisingSources));
        }
        if (payload.orderMediums) {
          setOrderMediums(payload.orderMediums);
          sessionStorage.setItem("cached_pedidos_mediums", JSON.stringify(payload.orderMediums));
        }
        if (payload.phoneLines) {
          setPhoneLines(payload.phoneLines);
          sessionStorage.setItem("cached_pedidos_lines", JSON.stringify(payload.phoneLines));
        }
        if (payload.paymentMethods) {
          setDbPaymentMethods(payload.paymentMethods);
          sessionStorage.setItem("cached_pedidos_payment_methods", JSON.stringify(payload.paymentMethods));
        }

        const recentOrders = payload.recentOrders || [];

        // 1. Procedencia Publicitaria
        const advCounts: Record<string, number> = {};
        recentOrders.forEach((o: any) => {
          if (o.advertising_source_id) {
            advCounts[o.advertising_source_id] = (advCounts[o.advertising_source_id] || 0) + 1;
          }
        });
        const topAdvIds = Object.keys(advCounts).sort((a, b) => advCounts[b] - advCounts[a]).slice(0, 3);
        const topAdvs = topAdvIds
          .map(id => (payload.advertisingSources || []).find((x: any) => x.id === id))
          .filter(Boolean) as AdvertisingSource[];
        setTopAdvertisingSources(topAdvs);

        // 2. Medio de Recepción
        const medCounts: Record<string, number> = {};
        recentOrders.forEach((o: any) => {
          if (o.order_medium_id) {
            medCounts[o.order_medium_id] = (medCounts[o.order_medium_id] || 0) + 1;
          }
        });
        const topMedIds = Object.keys(medCounts).sort((a, b) => medCounts[b] - medCounts[a]).slice(0, 3);
        const topMeds = topMedIds
          .map(id => (payload.orderMediums || []).find((x: any) => x.id === id))
          .filter(Boolean) as OrderMedium[];
        setTopOrderMediums(topMeds);

        // 3. Línea Telefónica
        const lineCounts: Record<string, number> = {};
        recentOrders.forEach((o: any) => {
          if (o.received_phone_line_id) {
            lineCounts[o.received_phone_line_id] = (lineCounts[o.received_phone_line_id] || 0) + 1;
          }
        });
        const topLineIds = Object.keys(lineCounts).sort((a, b) => lineCounts[b] - lineCounts[a]).slice(0, 3);
        const topLines = topLineIds
          .map(id => (payload.phoneLines || []).find((x: any) => x.id === id))
          .filter(Boolean) as PhoneLine[];
        setTopPhoneLines(topLines);

        if (payload.clients) {
          setClients(payload.clients);
          sessionStorage.setItem("cached_pedidos_clients", JSON.stringify(payload.clients));
        }

        if (payload.localities) {
          setLocalities(payload.localities);
          sessionStorage.setItem("cached_pedidos_localities", JSON.stringify(payload.localities));
        }

        if (payload.deliveryTimes) {
          setDeliveryTimes(payload.deliveryTimes);
          sessionStorage.setItem("cached_pedidos_dt", JSON.stringify(payload.deliveryTimes));
        }

        if (payload.products) {
          setProducts(payload.products);
          sessionStorage.setItem("cached_pedidos_products", JSON.stringify(payload.products));
        }

        if (payload.kits) {
          setKits(payload.kits);
          sessionStorage.setItem("cached_pedidos_kits", JSON.stringify(payload.kits));
        }

        // Autogenerar código de pedido al inicio
        await generateNextLegacyCode(userId);

        // Pre-cargar pedido automáticamente si viene desde el módulo de Conversaciones
        if (typeof window !== "undefined") {
          const params = new URLSearchParams(window.location.search);
          const cName = params.get("client_name");
          if (cName) {
            setActiveTab("form");
            setSelectedClientId("");
            setNewClientName(cName);
            const cPhone = params.get("client_phone");
            if (cPhone) {
              setNewClientPhone(cPhone);
            }
            const cAddress = params.get("address");
            if (cAddress) {
              setDireccion(cAddress);
            }
            const cLoc = params.get("locality");
            if (cLoc && payload.localities) {
              const matchedLoc = payload.localities.find((l: any) =>
                l.name.toLowerCase().trim() === cLoc.toLowerCase().trim() ||
                cLoc.toLowerCase().includes(l.name.toLowerCase()) ||
                l.name.toLowerCase().includes(cLoc.toLowerCase())
              );
              if (matchedLoc) {
                setLocalidadId(matchedLoc.id);
              }
            }
            const cNotes = params.get("notes");
            if (cNotes) {
              setAclaraciones(cNotes);
            }
            const cWhaticket = params.get("whaticket");
            if (cWhaticket) {
              setWhaticketLink(cWhaticket);
            }
            const cItems = params.get("items");
            if (cItems && payload.products) {
              try {
                const parsed = JSON.parse(cItems);
                const itemsToAdd = parsed.map((pi: any) => {
                  const p = payload.products.find((prod: any) => prod.id === pi.productId || prod.name.toLowerCase() === (pi.name || "").toLowerCase());
                  if (p) {
                    return {
                      ...p,
                      quantity: pi.quantity || 1,
                      customPrice: pi.price !== undefined ? pi.price : p.price
                    };
                  }
                  return null;
                }).filter(Boolean);
                if (itemsToAdd.length > 0) {
                  setOrderItems(itemsToAdd);
                }
              } catch (e) {
                console.error("Error pre-populating order items:", e);
              }
            }
          }
        }
      } catch (err) {
        console.error("Error loading form dependencies:", err);
      }
    }

    loadInitialData();

    // Cargar uso frecuente
    try {
      const counts = JSON.parse(localStorage.getItem('product_usage_counts') || '{}');
      setUsageCounts(counts);
    } catch(e) {}
  }, []);

  // Pre-select default payment method once loaded
  useEffect(() => {
    if (dbPaymentMethods.length > 0 && !selectedPaymentMethodId) {
      const defaultPm = dbPaymentMethods.find(pm => pm.is_default);
      if (defaultPm) {
        setSelectedPaymentMethodId(defaultPm.id);
        setCardSurcharge(defaultPm.surcharge_percentage);
        setCardInstallments(defaultPm.installments);
      }
    }
  }, [dbPaymentMethods, selectedPaymentMethodId]);

  const fetchPhoneLines = async () => {
    try {
      const { data, error } = await supabase
        .from('phone_lines')
        .select('*, seller_phone_lines(seller_id)')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      if (data) {
        setPhoneLines(data);
        sessionStorage.setItem("cached_pedidos_lines", JSON.stringify(data));
      }
    } catch (err) {
      console.error("Error fetching phone lines:", err);
    }
  };

  // Close client search and advertising dropdowns on outside clicks
  useEffect(() => {
    const handleClose = () => {
      setShowClientDropdown(false);
      setShowAdvertisingDropdown(false);
    };
    window.addEventListener("click", handleClose);
    return () => window.removeEventListener("click", handleClose);
  }, []);

  // Pre-select client from URL parameters if available
  useEffect(() => {
    if (clients.length > 0 && typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const queryClientId = params.get("client_id");
      if (queryClientId) {
        const clientExists = clients.some(c => c.id === queryClientId);
        if (clientExists) {
          setSelectedClientId(queryClientId);
        }
      }
    }
  }, [clients]);

  // Fetch client addresses when client selection changes
  useEffect(() => {
    async function fetchAddresses() {
      if (!selectedClientId) {
        setClientAddresses([]);
        return;
      }

      if (isEditingRef.current) {
        // En modo edición de pedido, cargamos las direcciones del cliente para el dropdown,
        // pero NO pisamos los datos del formulario ya establecidos del pedido.
        const { data } = await supabase
          .from("addresses")
          .select("id, alias, full_address, locality_id, map_link, delivery_notes")
          .eq("client_id", selectedClientId);
        if (data) {
          setClientAddresses(data);
        }
        return;
      }

      // Autofill client name and details
      const c = clients.find(cl => cl.id === selectedClientId);
      if (c) {
        setCliente(c.business_name);
        setNewClientName(c.business_name);
        setNewClientTaxId(c.tax_id || "");
        setShowTaxIdField(!!c.tax_id);
        const phones = (c.phone_primary || c.phone || "").split(",").map(p => p.trim()).filter(Boolean);
        if (phones.length === 0) {
          setNewClientPhones(["", ""]);
        } else if (phones.length === 1) {
          setNewClientPhones([phones[0], ""]);
        } else {
          setNewClientPhones(phones);
        }
      }

      // Fetch most recent whaticket_link for this client if it exists
      supabase
        .from('orders')
        .select('whaticket_link')
        .eq('client_id', selectedClientId)
        .not('whaticket_link', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .then(({ data: ordData }) => {
          if (ordData && ordData.length > 0 && ordData[0].whaticket_link) {
            setWhaticketLink(ordData[0].whaticket_link);
          }
        });

      const { data } = await supabase
        .from("addresses")
        .select("id, alias, full_address, locality_id, map_link, delivery_notes")
        .eq("client_id", selectedClientId);
      
      if (data) {
        setClientAddresses(data);
        // Auto-select principal, default or queried address
        if (data.length > 0) {
          let selectedAddress = data[0];
          if (typeof window !== "undefined") {
            const params = new URLSearchParams(window.location.search);
            const queryAddressId = params.get("address_id");
            if (queryAddressId) {
              const matched = data.find(a => a.id === queryAddressId);
              if (matched) {
                selectedAddress = matched;
              }
            }
          }
          setSelectedAddressId(selectedAddress.id);
          setDireccion(selectedAddress.full_address);
          setLocalidadId(selectedAddress.locality_id);
          const loc = localities.find(l => l.id === selectedAddress.locality_id);
          if (loc) {
            setLocalitySearch(loc.name);
          } else {
            setLocalitySearch("");
          }
          setLinkMaps(selectedAddress.map_link || "");
          setAclaraciones(selectedAddress.delivery_notes || "");
        } else {
          setSelectedAddressId("nueva_direccion");
          setDireccion("");
          setLocalidadId("");
          setLocalitySearch("");
          setLinkMaps("");
          setAclaraciones("");
        }
      }
    }
    fetchAddresses();
  }, [selectedClientId, clients, localities]);

  // Handle Address change
  const handleAddressChange = (addressId: string) => {
    setSelectedAddressId(addressId);
    if (addressId === "nueva_direccion") {
      setDireccion("");
      setLocalidadId("");
      setLocalitySearch("");
      setLinkMaps("");
      setAclaraciones("");
      return;
    }
    const addr = clientAddresses.find(a => a.id === addressId);
    if (addr) {
      setDireccion(addr.full_address);
      setLocalidadId(addr.locality_id);
      const loc = localities.find(l => l.id === addr.locality_id);
      if (loc) {
        setLocalitySearch(loc.name);
      } else {
        setLocalitySearch("");
      }
      setLinkMaps(addr.map_link || "");
      setAclaraciones(addr.delivery_notes || "");
    }
  };

  const frequentProducts = React.useMemo(() => {
    if (products.length === 0) return [];
    const sortedIds = Object.keys(usageCounts).sort((a, b) => usageCounts[b] - usageCounts[a]);
    return sortedIds
      .map(id => products.find(p => p.id === id))
      .filter(p => p && p.is_active !== false && p.category !== 'Interno' && !p.parent_id && !EXCLUDED_IDS.includes(p.id)) // Exclude child variants and dynamic variants from favorites list
      .slice(0, 10) as Product[];
  }, [products, usageCounts]);

  // Match products selected in filter
  const expandedSelectedProductIds = React.useMemo(() => {
    if (selectedProducts.length === 0) return new Set<string>();
    
    const matchedIds = new Set<string>();
    
    selectedProducts.forEach(selectedId => {
      matchedIds.add(selectedId);
      
      const activeProduct = products.find(p => p.id === selectedId);
      if (!activeProduct) return;
      
      const pId = activeProduct.id;
      const pParentId = activeProduct.parent_id;
      const pVariant = activeProduct.variant_type || '';
      
      products.forEach(x => {
        if (x.id === pId) return;
        
        // Case 1: Selected product is a parent (pParentId is null)
        if (!pParentId) {
          if (x.parent_id === pId && (x.variant_type || '').toLowerCase() === 'ciego') {
            matchedIds.add(x.id);
          }
        }
        // Case 2: Selected product is a child variant (pParentId is not null)
        else {
          if (x.parent_id === pParentId) {
            const xVar = (x.variant_type || '').toLowerCase();
            const pVar = pVariant.toLowerCase();
            if (pVar && xVar.includes('ciego') && xVar.includes(pVar)) {
              matchedIds.add(x.id);
            }
          }
        }
      });
    });
    
    return matchedIds;
  }, [selectedProducts, products]);

  // Fetch orders list
  useEffect(() => {
    async function fetchOrders() {
      if (activeTab === 'list') {
        setLoadingOrders(true);
        try {
          const { data: userData } = await supabase.auth.getUser();
          if (!userData.user) return;
          
          let query = supabase
            .from('orders')
            .select(
              selectedProducts.length > 0
                ? '*, zones(name), sellers(full_name), clients(is_wholesale), order_items!inner(product_id, product_name)'
                : '*, zones(name), sellers(full_name), clients(is_wholesale), order_items(product_id, product_name)'
            )
            .order('order_date', { ascending: false })
            .order('created_at', { ascending: false });
            
          const facundoIds = ['3820a0fe-bb0a-4a84-ad85-79e49868cad7', '54b9ce55-7354-4b39-9886-314aa79f6aa6'];
          const ludmilaIds = ['54b2d319-8f6f-47ff-b794-b7731978410a', '8207801b-b6cb-48cc-af0f-d2f9f2c98032'];
          const effectiveUserSellerIds = facundoIds.includes(userData.user.id)
            ? facundoIds
            : (ludmilaIds.includes(userData.user.id) ? ludmilaIds : [userData.user.id]);

          if (listType === 'mis_pedidos' || role !== 'admin') {
            if (clientTypeFilter !== 'mayoristas') {
              query = query.in('seller_id', effectiveUserSellerIds);
            }
          }

          // Apply client type filter at query level
          if (clientTypeFilter === 'mayoristas') {
            query = query.or('channel.eq.mayorista,legacy_code.ilike.AQ%,legacy_code.ilike.POW%');
          } else if (clientTypeFilter === 'minoristas') {
            query = query.neq('channel', 'mayorista').not('legacy_code', 'ilike', 'AQU%').not('legacy_code', 'ilike', 'POW%');
          }
          
          // Apply status filter
          if (statusFilter === 'Pendientes') {
            query = query.not('status', 'in', '("Entregado","Cancelado","En Revisión")');
          } else if (statusFilter === 'En Revisión') {
            query = query.eq('status', 'En Revisión');
          } else if (statusFilter === 'Entregados') {
            query = query.eq('status', 'Entregado');
          } else if (statusFilter === 'Anulados') {
            query = query.eq('status', 'Cancelado');
          }
          
          if (debouncedOrderSearch.trim()) {
            const q = debouncedOrderSearch.trim();
            query = query.or(`customer_name.ilike.%${q}%,status.ilike.%${q}%,locality.ilike.%${q}%,freight_type.ilike.%${q}%,legacy_code.ilike.%${q}%`);
          }
          
          // Filter by product if active using inner join and OR filter on foreign table
          if (selectedProducts.length > 0) {
            const idsToQuery = Array.from(expandedSelectedProductIds);
            if (idsToQuery.length > 0) {
              const conditions = [`product_id.in.(${idsToQuery.join(',')})`];
              
              selectedProducts.forEach(id => {
                const prod = products.find(p => p.id === id);
                if (prod) {
                  const cleanName = prod.name.replace(/[(),]/g, '').trim();
                  if (cleanName) {
                    conditions.push(`and(product_id.is.null,product_name.ilike.%${cleanName}%)`);
                  }
                  if (prod.sku) {
                    const cleanSku = prod.sku.replace(/[(),]/g, '').trim();
                    if (cleanSku) {
                      conditions.push(`and(product_id.is.null,product_name.ilike.%${cleanSku}%)`);
                    }
                  }
                }
              });
              
              query = query.or(conditions.join(','), { foreignTable: 'order_items' });
            }
          }

          // Apply date range filter
          if (dateFrom) {
            query = query.gte('order_date', dateFrom);
          }
          if (dateTo) {
            query = query.lte('order_date', dateTo);
          }
          
          // Limit to 500 for active states and wholesale history to display comprehensive history
          if (statusFilter === 'Pendientes' || statusFilter === 'En Revisión' || clientTypeFilter === 'mayoristas') {
            query = query.limit(500);
          } else {
            query = query.limit(100);
          }
          
          const { data, error } = await query;
          if (error) {
            console.error("Error fetching orders:", error);
          } else if (data) {
            setOrders(data);
          }
        } catch (err) {
          console.error("Error in fetchOrders:", err);
        } finally {
          setLoadingOrders(false);
        }
      }
    }
    fetchOrders();
  }, [activeTab, listType, role, debouncedOrderSearch, statusFilter, selectedProducts, expandedSelectedProductIds, products, clientTypeFilter, dateFrom, dateTo]);

  // Fetch recent orders for the "Cargar desde BD" modal
  const fetchOrdersForModal = async () => {
    setLoadingDbOrders(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;

      let q = supabase
        .from('orders')
        .select('*, order_items(product_name, quantity, unit_price), sellers(full_name)')
        .order('created_at', { ascending: false })
        .limit(40);

      if (role !== 'admin') {
        const facundoIds = ['3820a0fe-bb0a-4a84-ad85-79e49868cad7', '54b9ce55-7354-4b39-9886-314aa79f6aa6'];
        const ludmilaIds = ['54b2d319-8f6f-47ff-b794-b7731978410a', '8207801b-b6cb-48cc-af0f-d2f9f2c98032'];
        const effectiveUserSellerIds = facundoIds.includes(userData.user.id)
          ? facundoIds
          : (ludmilaIds.includes(userData.user.id) ? ludmilaIds : [userData.user.id]);
        q = q.in('seller_id', effectiveUserSellerIds);
      }

      const { data, error } = await q;
      if (error) throw error;
      setRecentDbOrders(data || []);
    } catch (e) {
      console.error('Error fetching orders for modal:', e);
    } finally {
      setLoadingDbOrders(false);
    }
  };

  // Generic loader: can be used for editing (isClone=false) or cloning/re-creating (isClone=true)
  const handleLoadOrderIntoForm = async (order: any, isClone: boolean = false) => {
    isEditingRef.current = true;
    try {
      setSubmitting(true);
      
      // 1. Fetch order items
      const { data: itemsData, error: itemsError } = await supabase
        .from('order_items')
        .select('*')
        .eq('order_id', order.id);
        
      if (itemsError) throw itemsError;
      
      // 2. Map order items to OrderItem state
      const mappedItems: OrderItem[] = (itemsData || []).map(item => {
        const prod = products.find(p => p.id === item.product_id);
        const basePrice = prod?.price || item.unit_price;
        const discountType = (item.discount_percentage && item.discount_percentage > 0) ? 'percentage' : undefined;
        const discountValue = (item.discount_percentage && item.discount_percentage > 0) ? item.discount_percentage : undefined;
        return {
          id: item.product_id,
          sku: prod?.sku || "",
          name: item.product_name,
          price: basePrice,
          customPrice: item.unit_price,
          quantity: item.quantity,
          category: prod?.category || "",
          stock_current: prod?.stock_current !== undefined ? prod?.stock_current : 999,
          description: prod?.description || "",
          image_url: prod?.image_url || "",
          basePrice: basePrice,
          discountType: discountType,
          discountValue: discountValue
        } as OrderItem;
      });
      
      setOrderItems(mappedItems);
      
      // 3. Set client states
      if (order.client_id) {
        setSelectedClientId(order.client_id);
        let c = clients.find(cl => cl.id === order.client_id);
        if (!c) {
          // If the client isn't loaded in the initial top 50, fetch them on demand
          const { data: clientData } = await supabase
            .from("v_client_balances_and_stats")
            .select("id, business_name, tax_id, phone_primary, phone_secondary, billing_address, is_wholesale")
            .eq("id", order.client_id)
            .single();
          if (clientData) {
            const fetchedClient: Client = {
              id: clientData.id,
              business_name: clientData.business_name,
              tax_id: clientData.tax_id || "",
              phone_primary: clientData.phone_primary,
              phone_secondary: clientData.phone_secondary || undefined,
              billing_address: clientData.billing_address || undefined,
              is_wholesale: clientData.is_wholesale
            };
            c = fetchedClient;
            setClients(prev => {
              if (!prev.some(m => m.id === fetchedClient.id)) {
                return [...prev, fetchedClient];
              }
              return prev;
            });
          }
        }
        if (c) {
          setCliente(c.business_name);
          setNewClientName(c.business_name);
          setNewClientTaxId(c.tax_id || "");
          setShowTaxIdField(!!c.tax_id);
          const phones = (c.phone_primary || c.phone || "").split(",").map(p => p.trim()).filter(Boolean);
          if (phones.length === 0) {
            setNewClientPhones(["", ""]);
          } else if (phones.length === 1) {
            setNewClientPhones([phones[0], ""]);
          } else {
            setNewClientPhones(phones);
          }
        }
      } else {
        setSelectedClientId("");
        setCliente(order.customer_name || "");
        setNewClientName(order.customer_name || "");
        setNewClientTaxId("");
        setShowTaxIdField(false);
        setNewClientPhones(["", ""]);
      }
      
      // 4. Set address and shipping details
      if (order.shipping_address_id) {
        setSelectedAddressId(order.shipping_address_id);
      } else {
        setSelectedAddressId("nueva_direccion");
      }
      
      setDireccion(order.address || "");
      setLinkMaps(order.google_maps_link || "");
      setAclaraciones(order.delivery_notes || "");
      
      let locId = "";
      if (order.shipping_address_snapshot && order.shipping_address_snapshot.locality_id) {
        locId = order.shipping_address_snapshot.locality_id;
      } else if (order.locality) {
        const foundLoc = localities.find(l => l.name.toLowerCase() === order.locality.toLowerCase());
        if (foundLoc) locId = foundLoc.id;
      }
      
      if (locId) {
        setLocalidadId(locId);
        const loc = localities.find(l => l.id === locId);
        if (loc) {
          setLocalitySearch(loc.name);
        }
      } else {
        setLocalidadId("");
        setLocalitySearch("");
      }
      
      setFlete(order.freight_type || "");
      const initDelDateStr = order.initial_delivery_date ? order.initial_delivery_date.split('T')[0] : "";
      setEntregaInicial(initDelDateStr);
      setOriginalDeliveryDate(initDelDateStr);
      setEntregaMaxima(order.max_delivery_date ? order.max_delivery_date.split('T')[0] : "");
      
      if (isClone) {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        setFechaPedido(`${yyyy}-${mm}-${dd}`);
      } else {
        setFechaPedido(order.order_date ? order.order_date.split('T')[0] : (order.created_at ? order.created_at.split('T')[0] : ''));
      }
      setWhaticketLink(order.whaticket_link || "");
      
      // 5. Set payment details
      const totalsObj = order.totals || {};
      const orderPmId = order.payment_method_id;
      const pm = dbPaymentMethods.find(p => p.id === orderPmId);
      const hasSurchargeInTotals = (totalsObj.payment_surcharges > 0 || totalsObj.payment_surcharges_percentage > 0);
      const isCardOrSurcharge = pm 
        ? (pm.id !== "a3a890a8-b677-4b7b-8ffb-d36c2e7b5ad3" && (pm.surcharge_percentage > 0 || pm.name.toLowerCase().includes("tarjeta") || pm.name.toLowerCase().includes("cuota") || pm.name.toLowerCase().includes("link")))
        : hasSurchargeInTotals;

      if (isCardOrSurcharge) {
        setPaymentType('tarjeta');
        setSelectedPaymentMethodId(orderPmId || "e885c35b-1175-4702-8692-75d1f8f3c7b3");
        const installments = totalsObj.installments !== undefined ? totalsObj.installments : (pm?.installments || 1);
        const surchargeVal = totalsObj.payment_surcharges_percentage !== undefined 
          ? totalsObj.payment_surcharges_percentage 
          : (totalsObj.payment_surcharges !== undefined && order.total_amount ? Math.round((totalsObj.payment_surcharges / (order.total_amount - totalsObj.payment_surcharges)) * 100) : (pm?.surcharge_percentage || 0));
        setCardInstallments(installments);
        setCardSurcharge(surchargeVal);
      } else {
        setPaymentType('efectivo');
        setSelectedPaymentMethodId(orderPmId || "a3a890a8-b677-4b7b-8ffb-d36c2e7b5ad3");
      }
      
      const hasFreightCost = totalsObj.freight > 0;
      setIsFreeShipping(!hasFreightCost);
      setShippingCost(totalsObj.freight || 0);
      setIncludeIVA(totalsObj.tax > 0);
      
      if (totalsObj.order_discount_type) {
        setOrderDiscountType(totalsObj.order_discount_type);
      } else {
        setOrderDiscountType('fixed');
      }
      if (totalsObj.order_discount_value !== undefined) {
        setOrderDiscountValue(totalsObj.order_discount_value);
      } else if (totalsObj.order_discount_amount !== undefined) {
        setOrderDiscountValue(totalsObj.order_discount_amount);
      } else {
        setOrderDiscountValue(0);
      }
      
      const payStatus = order.payment_status;
      if (payStatus === 'Abonado') {
        setPaymentTiming('paid');
        setPaymentState('paid');
        setCustomDepositAmount(order.total_amount || 0);
        setDepositAmountInput(0);
      } else if (payStatus === 'Seniado') {
        setPaymentTiming('partial');
        setPaymentState('partial');
        setCustomDepositAmount(totalsObj.deposit_amount || 0);
        setDepositAmountInput(totalsObj.deposit_amount || 0);
      } else {
        setPaymentTiming('contra_entrega');
        setPaymentState('unpaid');
        setCustomDepositAmount(0);
        setDepositAmountInput(0);
      }
      
      setDepositReceiptUrl(totalsObj.deposit_receipt_url || "");

      // Load payments breakdown if available, else load fallback
      if (totalsObj.payments_breakdown && Array.isArray(totalsObj.payments_breakdown)) {
        setPaymentsList(totalsObj.payments_breakdown);
      } else {
        const fallbackPmId = orderPmId || "a3a890a8-b677-4b7b-8ffb-d36c2e7b5ad3";
        let paymentAmount = 0;
        if (payStatus === 'Abonado') {
          paymentAmount = order.total_amount || 0;
        } else if (payStatus === 'Seniado') {
          paymentAmount = totalsObj.deposit_amount || 0;
        }

        let baseAmount = paymentAmount;
        let surchargePercentage = 0;
        if (isCardOrSurcharge) {
          const pmObj = dbPaymentMethods.find(p => p.id === fallbackPmId);
          surchargePercentage = pmObj?.surcharge_percentage || 0;
          if (surchargePercentage > 0) {
            baseAmount = paymentAmount / (1 + surchargePercentage / 100);
          }
        }

        setPaymentsList([
          {
            id: Math.random().toString(36).substring(2, 9),
            payment_method_id: fallbackPmId,
            amount: Number(baseAmount.toFixed(2)),
            card_installments: isCardOrSurcharge ? (totalsObj.installments || pm?.installments || 1) : undefined,
            card_surcharge: isCardOrSurcharge ? surchargePercentage : undefined,
            receipt_url: totalsObj.deposit_receipt_url || "",
            notes: payStatus === 'Seniado' ? "Seña inicial" : (payStatus === 'Abonado' ? "Pago completo" : ""),
            created_at: isClone ? new Date().toISOString() : order.created_at
          }
        ]);
      }
      
      // 6. Origen y Recepción
      if (isClone) {
        setEditingOrderId(null);
        setSelectedSellerId(currentUserId);
        if (currentUserId) {
          generateNextLegacyCode(currentUserId);
        } else {
          setLegacyCode("");
        }
      } else {
        setEditingOrderId(order.id);
        if (order.seller_id) {
          setSelectedSellerId(order.seller_id);
        }
        setLegacyCode(order.legacy_code || "");
      }
      
      setSelectedAdvertisingSourceId(order.advertising_source_id || "");
      setSelectedOrderMediumId(order.order_medium_id || "");
      if (order.received_phone_line_id) {
        setSelectedPhoneLineId(order.received_phone_line_id);
      } else {
        const medium = orderMediums.find(m => m.id === order.order_medium_id);
        if (medium && medium.requires_phone_line) {
          setSelectedPhoneLineId("otro");
        } else {
          setSelectedPhoneLineId("");
        }
      }
      setDeliveryDetail(order.delivery_detail || "");
      
      setOrderStatus(order.status || "Pendiente");
      setHoldReason(order.hold_reason || "");
      setHoldProductId(order.hold_product_id || "");
      setOrderCategory(order.category || "auto");
      
      setActiveTab('form');
      setShowLoadFromDbModal(false);
      
      if (isClone) {
        alert("¡Datos del pedido cargados en el formulario! Podés revisar o modificar los datos y confirmar para crearlo como un nuevo pedido.");
      }
    } catch (err: any) {
      console.error("Error loading order:", err);
      alert("Error al cargar el pedido: " + err.message);
    } finally {
      setSubmitting(false);
      setTimeout(() => {
        isEditingRef.current = false;
      }, 600);
    }
  };

  const handleEditOrder = (order: any) => handleLoadOrderIntoForm(order, false);
  const handleCloneOrder = (order: any) => handleLoadOrderIntoForm(order, true);

  // Reintentar o sincronizar un pedido existente en BD directamente a la Planilla de Google
  const handleSyncExistingOrderToSheet = async (order: any) => {
    try {
      setSyncingOrderId(order.id);

      // Fetch items if not attached
      let items = order.order_items || [];
      if (!items || items.length === 0 || !items[0].unit_price) {
        const { data: itms } = await supabase
          .from('order_items')
          .select('*')
          .eq('order_id', order.id);
        if (itms) items = itms;
      }

      const sellerId = order.seller_id || currentUserId;
      const selectedPayMethodName = dbPaymentMethods.find(m => m.id === order.payment_method_id)?.name || 'Efectivo';
      const totalsObj = order.totals || {};

      let clientPhone = '';
      let clientPhone2 = '';
      if (order.client_id) {
        let c = clients.find(cl => cl.id === order.client_id);
        if (!c) {
          const { data: cData } = await supabase
            .from("clients")
            .select("phone_primary, phone_secondary")
            .eq("id", order.client_id)
            .maybeSingle();
          if (cData) {
            clientPhone = cData.phone_primary || '';
            clientPhone2 = cData.phone_secondary || '';
          }
        } else {
          clientPhone = c.phone_primary || '';
          clientPhone2 = c.phone_secondary || '';
        }
      }

      let sellerFullName = sellersList.find(s => s.id === sellerId)?.full_name || order.sellers?.full_name;
      if (!sellerFullName) {
        const { data: sRow } = await supabase.from('sellers').select('full_name').eq('id', sellerId).maybeSingle();
        sellerFullName = sRow?.full_name || 'Vendedor';
      }
      const advName = advertisingSources.find(a => a.id === order.advertising_source_id)?.name || 'Publicidad Meta';
      const mediumName = orderMediums.find(m => m.id === order.order_medium_id)?.name || 'WhatsApp';

      const sheetOrderPayload = {
        deliveryDate: order.initial_delivery_date ? order.initial_delivery_date.split('T')[0] : '',
        orderDate: order.order_date ? order.order_date.split('T')[0] : (order.created_at ? order.created_at.split('T')[0] : ''),
        maxDeliveryDate: order.max_delivery_date ? order.max_delivery_date.split('T')[0] : '',
        clientName: order.customer_name || '',
        phonePrimary: clientPhone,
        phoneSecondary: clientPhone2,
        whaticketLink: order.whaticket_link || '',
        source: order.channel === 'mayorista' ? 'Mayorista' : advName,
        deliveryNotes: [
          order.delivery_notes, 
          order.delivery_detail, 
          totalsObj.payment_timing === 'contra_entrega' 
            ? `Cobrar al entregar: ${formatPrice(order.total_amount || 0)} (${selectedPayMethodName})` 
            : (totalsObj.payment_timing === 'partial' 
                ? `Seña: ${formatPrice(totalsObj.deposit_amount || 0)} - Saldo al entregar: ${formatPrice(totalsObj.pending_balance || 0)}` 
                : '')
        ].filter(Boolean).map((s: string) => s.trim()).join(' / '),
        medium: mediumName,
        sellerName: normalizeSellerName(sellerFullName),
        status: order.status === 'En Espera' ? 'En Espera' : '🔸 Validado',
        locality: order.locality || '',
        address: order.address || '',
        mapsLink: order.google_maps_link || '',
        category: order.category || 'General',
        paymentMethod: selectedPayMethodName,
        identification: '',
        paymentStatus: totalsObj.payment_timing === 'paid' ? 'Abonado' : (totalsObj.payment_timing === 'partial' ? 'Señado' : 'No Abonado'),
        depositOrPaidAmount: totalsObj.deposit_amount || (totalsObj.payment_timing === 'paid' ? order.total_amount : 0),
        freightType: order.freight_type || '⚪ Flete Regular',
        freightCost: totalsObj.freight || 0,
        items: buildSheetOrderItems(items, totalsObj.order_discount_amount || 0, products)
      };

      const sheetRes = await fetch('/api/vendedores/create-sheet-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sellerId,
          order: sheetOrderPayload
        })
      });

      if (!sheetRes.ok) {
        const errData = await sheetRes.json().catch(() => ({}));
        throw new Error(errData.error || errData.message || 'Error al conectar con la planilla');
      }

      const sheetData = await sheetRes.json();
      if (!sheetData.synced || !sheetData.code) {
        throw new Error(sheetData.message || 'La planilla no devolvió un código válido');
      }

      // Actualizar en base de datos
      const { error: updErr } = await supabase
        .from('orders')
        .update({ legacy_code: sheetData.code })
        .eq('id', order.id);

      if (updErr) {
        console.warn('Error updating legacy_code in DB:', updErr);
      }

      // Actualizar estado local
      setOrders(prev => prev.map(o => o.id === order.id ? { ...o, legacy_code: sheetData.code } : o));

      alert(`¡Pedido sincronizado con la planilla con éxito!\nCódigo asignado: ${sheetData.code}`);
    } catch (err: any) {
      console.error('Error syncing order to sheet:', err);
      alert(`No se pudo sincronizar el pedido a la planilla: ${err.message}`);
    } finally {
      setSyncingOrderId(null);
    }
  };


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
    const directChildren = allProducts.filter(prod => prod.parent_id === p.id && prod.is_active !== false);
    if (directChildren.length > 0) return directChildren;

    // Fallback for (CIEGO) variants if parent_id was not set
    const ciegoFallback = allProducts.filter(prod =>
      prod.id !== p.id &&
      prod.is_active !== false &&
      (prod.name?.trim().toLowerCase() === `${p.name?.trim().toLowerCase()} (ciego)` ||
       prod.name?.trim().toLowerCase() === `${p.name?.trim().toLowerCase()} ciego`)
    ).map(prod => ({ ...prod, variant_type: prod.variant_type || "CIEGO" }));

    return ciegoFallback;
  };

  const searchTerms = normalizeText(searchTerm).split(/\s+/).filter(Boolean);
  const filteredProducts = products.filter(p => {
    if (p.is_active === false) return false;
    if (p.category === 'Interno' || p.name?.startsWith('[Interno]')) return false;
    if (p.sku?.startsWith('AUTO-') && products.some(other => other.id !== p.id && other.is_active !== false && other.category !== 'Interno' && !other.sku?.startsWith('AUTO-') && (other.sku === p.name || normalizeText(other.name) === normalizeText(p.name)))) return false;
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
    const childrenText = childVariants.map(child => `${child.name} ${child.sku || ''} ${child.variant_type || ''}`).join(' ');

    const searchableText = normalizeText(`${p.name} ${p.sku || ''} ${extraSearchable} ${childrenText}`);
    return searchTerms.every(term => searchableText.includes(term));
  }).slice(0, 10);

  const addItems = (productsToAdd: Product[]) => {
    if (!productsToAdd || productsToAdd.length === 0) return;

    setOrderItems(prev => {
      const current = [...prev];
      for (const product of productsToAdd) {
        const qtyToAdd = (product as any).quantity || 1;
        const targetCustomPrice = (product as any).customPrice !== undefined ? (product as any).customPrice : product.price;
        const isDiscontinued = (product as any).is_discontinued || false;
        const currentStock = (product as any).stock_current !== undefined ? (product as any).stock_current : 999;
        const bundleParentId = (product as any).bundleParentId;
        const isIncludedInKit = (product as any).isIncludedInKit;
        const baseQuantity = (product as any).baseQuantity;

        const existingIndex = current.findIndex(i => 
          i.id === product.id && 
          i.bundleParentId === bundleParentId && 
          Boolean(i.isIncludedInKit) === Boolean(isIncludedInKit)
        );
        const currentQtyInCart = existingIndex >= 0 ? current[existingIndex].quantity : 0;

        if (isDiscontinued && currentQtyInCart + qtyToAdd > currentStock) {
          alert(`No se puede agregar "${product.name}". Está DESCONTINUADO y no hay stock disponible (Stock: ${currentStock}).`);
          continue;
        }

        const effectiveBase = (product as any).basePrice !== undefined 
          ? (product as any).basePrice 
          : product.price;
        const discountType = (product as any).discountType !== undefined 
          ? (product as any).discountType 
          : (targetCustomPrice < effectiveBase ? 'percentage' : undefined);
        const discountValue = (product as any).discountValue !== undefined 
          ? (product as any).discountValue 
          : (discountType === 'percentage' && effectiveBase > 0 
              ? Math.round(((effectiveBase - targetCustomPrice) / effectiveBase) * 100) 
              : undefined);

        if (existingIndex >= 0) {
          current[existingIndex] = {
            ...current[existingIndex],
            quantity: current[existingIndex].quantity + qtyToAdd,
            customPrice: (product as any).customPrice !== undefined ? targetCustomPrice : current[existingIndex].customPrice,
            basePrice: effectiveBase,
            discountType: discountType || current[existingIndex].discountType,
            discountValue: discountValue !== undefined ? discountValue : current[existingIndex].discountValue,
            bundleParentId: bundleParentId || current[existingIndex].bundleParentId,
            isIncludedInKit: isIncludedInKit !== undefined ? isIncludedInKit : current[existingIndex].isIncludedInKit,
            baseQuantity: baseQuantity || current[existingIndex].baseQuantity
          };
        } else {
          current.push({ 
            ...product, 
            quantity: qtyToAdd, 
            customPrice: targetCustomPrice,
            basePrice: effectiveBase,
            discountType: discountType,
            discountValue: discountValue,
            bundleParentId,
            isIncludedInKit,
            baseQuantity: baseQuantity || qtyToAdd
          });
        }
      }
      return current;
    });

    setSearchTerm("");

    // Guardar uso en localStorage
    try {
      const counts = { ...usageCounts };
      for (const product of productsToAdd) {
        counts[product.id] = (counts[product.id] || 0) + 1;
      }
      localStorage.setItem('product_usage_counts', JSON.stringify(counts));
      setUsageCounts(counts);
    } catch (e) {}
  };

  const addItem = (product: Product) => {
    addItems([product]);
  };

  const removeItem = (id: string) => {
    setOrderItems(prev => prev.filter(i => i.id !== id));
  };

  const addKitToOrder = (kit: Kit) => {
    let newItems = [...orderItems];
    const warnings: string[] = [];

    kit.items.forEach(kitItem => {
      const existingIdx = newItems.findIndex(i => i.id === kitItem.id);
      const currentQtyInCart = existingIdx > -1 ? newItems[existingIdx].quantity : 0;
      
      const isDiscontinued = (kitItem as any).is_discontinued || false;
      const currentStock = (kitItem as any).stock_current !== undefined ? (kitItem as any).stock_current : 999;
      
      let qtyToAdd = kitItem.quantity;
      if (isDiscontinued) {
        const maxAllowed = Math.max(0, currentStock - currentQtyInCart);
        if (maxAllowed < qtyToAdd) {
          qtyToAdd = maxAllowed;
          if (maxAllowed === 0) {
            warnings.push(`"${kitItem.name}" (Descontinuado - Stock: ${currentStock}, En carrito: ${currentQtyInCart}). No se agregaron unidades.`);
          } else {
            warnings.push(`"${kitItem.name}" (Descontinuado - Stock: ${currentStock}, En carrito: ${currentQtyInCart}). Se agregaron solo ${maxAllowed} de ${kitItem.quantity} unidades.`);
          }
        }
      }

      if (qtyToAdd > 0) {
        if (existingIdx > -1) {
          newItems[existingIdx] = {
            ...newItems[existingIdx],
            quantity: newItems[existingIdx].quantity + qtyToAdd,
            customPrice: kitItem.customPrice
          };
        } else {
          newItems.push({
            ...kitItem,
            quantity: qtyToAdd,
            customPrice: kitItem.customPrice
          });
        }
      }
    });

    setOrderItems(newItems);

    if (kit.detailText) {
      setAclaraciones(prev => {
        const separator = prev ? "\n" : "";
        return `${prev}${separator}[Kit: ${kit.name}] ${kit.detailText}`;
      });
    }

    if (warnings.length > 0) {
      alert(`⚠️ Advertencias al agregar Kit "${kit.name}":\n\n` + warnings.join("\n"));
    }
  };

  const deleteKit = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("¿Eliminar este kit?")) {
      const { error } = await supabase.from('kits').delete().eq('id', id);
      if (!error) {
        setKits(kits.filter(k => k.id !== id));
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
        setKits(kits.map(k => k.id === id ? { ...k, isGlobal: true } : k));
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
      setKits(kits.map(k => k.id === editKitId ? { ...k, name: editKitNameValue } : k));
      setShowEditNameModal(false);
      setEditKitId("");
      setEditKitNameValue("");
    } else {
      alert("Error al actualizar el nombre.");
    }
  };

  const updateQuantity = (id: string, qty: number) => {
    if (qty < 1) return;
    const item = orderItems.find(i => i.id === id);
    if (!item) return;

    const isDiscontinued = (item as any).is_discontinued || false;
    const currentStock = (item as any).stock_current !== undefined ? (item as any).stock_current : 999;

    if (isDiscontinued && qty > currentStock) {
      alert(`No es posible agregar más unidades. El producto está descontinuado y el stock máximo disponible es ${currentStock}.`);
      return;
    }

    setOrderItems(prev => prev.map(i => i.id === id ? { ...i, quantity: qty } : i));
  };

  const updateCustomPrice = (id: string, price: number) => {
    setOrderItems(prev => prev.map(i => i.id === id ? { ...i, customPrice: price } : i));
  };

  const updateItemDiscount = (id: string, discountType: 'percentage' | 'fixed', discountValue: number) => {
    setOrderItems(prev => prev.map(i => {
      if (i.id !== id) return i;
      const base = i.basePrice !== undefined ? i.basePrice : (i.price || i.customPrice || 0);
      const val = Math.max(0, discountValue || 0);
      let newPrice = base;
      if (val > 0) {
        if (discountType === 'percentage') {
          const disc = Math.round(base * (Math.min(100, val) / 100));
          newPrice = Math.max(0, base - disc);
        } else {
          newPrice = Math.max(0, base - val);
        }
      }
      return {
        ...i,
        basePrice: base,
        discountType: val > 0 ? discountType : undefined,
        discountValue: val > 0 ? val : undefined,
        customPrice: newPrice
      };
    }));
  };

  const updateMultipleItemDiscounts = (
    itemDiscounts: Array<{ id: string; discountType: 'percentage' | 'fixed'; discountValue: number }>,
    itemIdsToRemove?: string[]
  ) => {
    setOrderItems(prev => {
      let filtered = prev;
      if (itemIdsToRemove && itemIdsToRemove.length > 0) {
        filtered = filtered.filter(i => !itemIdsToRemove.includes(i.id));
      }
      return filtered.map(i => {
        const match = itemDiscounts.find(d => d.id === i.id);
        if (!match) return i;
        const base = i.basePrice !== undefined ? i.basePrice : (i.price || i.customPrice || 0);
        const val = Math.max(0, match.discountValue || 0);
        let newPrice = base;
        if (val > 0) {
          if (match.discountType === 'percentage') {
            const disc = Math.round(base * (Math.min(100, val) / 100));
            newPrice = Math.max(0, base - disc);
          } else {
            newPrice = Math.max(0, base - val);
          }
        }
        return {
          ...i,
          basePrice: base,
          discountType: val > 0 ? match.discountType : undefined,
          discountValue: val > 0 ? val : undefined,
          customPrice: newPrice
        };
      });
    });
  };

  const [expandedKits, setExpandedKits] = useState<Record<string, boolean>>({});

  const toggleKitExpand = (kitId: string) => {
    setExpandedKits(prev => ({ ...prev, [kitId]: !prev[kitId] }));
  };

  const handleUpdateKitQuantity = (kitId: string, newQty: number, includedItems: OrderItem[]) => {
    if (newQty < 1) {
      handleRemoveKit(kitId, includedItems);
      return;
    }
    const currentKit = orderItems.find(i => i.id === kitId);
    if (!currentKit) return;
    const oldQty = currentKit.quantity || 1;
    const incIds = new Set(includedItems.map(i => i.id));

    setOrderItems(prev => prev.map(item => {
      if (item.id === kitId) {
        return { ...item, quantity: newQty };
      }
      if (incIds.has(item.id) && item.bundleParentId === kitId) {
        const baseQty = item.baseQuantity || Math.round(item.quantity / oldQty) || 1;
        return { ...item, quantity: baseQty * newQty };
      }
      return item;
    }));
  };

  const handleRemoveKit = (kitId: string, includedItems: OrderItem[]) => {
    const idsToRemove = new Set([kitId, ...includedItems.map(i => i.id)]);
    setOrderItems(prev => prev.filter(item => {
      if (idsToRemove.has(item.id)) return false;
      if (item.bundleParentId === kitId) return false;
      return true;
    }));
  };

  const { discountItems, standardItems, totalOrderCount } = useMemo(() => {
    const isDisc = (i: OrderItem) => {
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

  const itemsGrossSubtotal = orderItems.reduce((acc, item) => {
    const name = (item.name || "").toLowerCase();
    const sku = (item.sku || "").toLowerCase();
    const isDisc = name.includes("descuento") || sku.includes("descuento") || name.includes("bonificaci") || sku.includes("bonificaci");
    const itemVal = isDisc ? -Math.abs(item.customPrice) : item.customPrice;
    return acc + itemVal * item.quantity;
  }, 0);

  const orderDiscountAmount = useMemo(() => {
    if (!orderDiscountValue || orderDiscountValue <= 0) return 0;
    if (orderDiscountType === 'percentage') {
      return Math.round(itemsGrossSubtotal * (Math.min(100, orderDiscountValue) / 100));
    }
    return Math.min(itemsGrossSubtotal, Math.max(0, orderDiscountValue));
  }, [itemsGrossSubtotal, orderDiscountType, orderDiscountValue]);

  const subtotal = Math.max(0, itemsGrossSubtotal - orderDiscountAmount);
  const shippingAmount = isFreeShipping ? 0 : shippingCost;

  const orderBaseAmount = Math.max(0, subtotal + shippingAmount);

  // Evaluar sugerencias automáticas de bonificaciones por cantidad (ej: MEP x2, x3, x6, x12)
  const discountSuggestions = useMemo(() => {
    return evaluateDiscountSuggestions(orderItems, products);
  }, [orderItems, products]);

  const handleApplyDiscountSuggestion = (sug: DiscountSuggestion) => {
    setOrderItems(prev => {
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
        const newDiscountItem: OrderItem = {
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

  // Calculate surcharges and totals dynamically per payment item (Proportional Surcharges)
  const paymentsWithSurcharges = paymentsList.map(p => {
    const pm = dbPaymentMethods.find(m => m.id === p.payment_method_id) || { id: "", name: "", surcharge_percentage: 0, installments: 1 };
    
    // If it's a card method (excluding the default cash/transfer ID and checking for card-like names or surcharge)
    const isCard = pm.id && pm.id !== "a3a890a8-b677-4b7b-8ffb-d36c2e7b5ad3" && 
                   ((pm.surcharge_percentage || 0) > 0 || 
                    (pm.name && (pm.name.toLowerCase().includes("tarjeta") || pm.name.toLowerCase().includes("cuota") || pm.name.toLowerCase().includes("link"))));
    
    const surchargePct = isCard 
      ? (p.card_surcharge !== undefined ? p.card_surcharge : pm.surcharge_percentage) 
      : 0;
    
    const installments = isCard
      ? (p.card_installments !== undefined ? p.card_installments : (pm.installments || 1))
      : 1;

    // Determine the base amount for this payment item:
    // If single payment item, it covers the entire orderBaseAmount
    let baseAmount = p.amount;
    if (paymentsList.length === 1) {
      baseAmount = (p.amount && p.amount > 0) ? p.amount : orderBaseAmount;
    } else if (!p.amount || p.amount === 0) {
      const otherAllocated = paymentsList
        .filter(other => other.id !== p.id)
        .reduce((sum, other) => sum + (other.amount || 0), 0);
      baseAmount = Math.max(0, orderBaseAmount - otherAllocated);
    }

    const surchargeVal = baseAmount * (surchargePct / 100);
    const totalAmount = baseAmount + surchargeVal;
    
    return {
      ...p,
      baseAmount,
      isCard,
      surchargePercentage: surchargePct,
      surchargeValue: surchargeVal,
      installments,
      totalAmount
    };
  });

  const totalSurcharges = paymentsWithSurcharges.reduce((acc, p) => acc + p.surchargeValue, 0);
  const subtotalWithSurchargeAndShipping = subtotal + totalSurcharges + shippingAmount;
  const ivaAmount = includeIVA ? subtotalWithSurchargeAndShipping * 0.21 : 0;
  const total = subtotalWithSurchargeAndShipping + ivaAmount;
  const surcharge = totalSurcharges; // Alias to match other variables in page.tsx

  // Derived payment status and balances based on paymentTiming
  let totalPaid = 0;
  let depositAmount = 0;
  let hasDeposit = false;
  let pendingBalance = total;

  if (paymentTiming === 'paid') {
    totalPaid = total;
    depositAmount = total;
    hasDeposit = true;
    pendingBalance = 0;
  } else if (paymentTiming === 'partial') {
    totalPaid = customDepositAmount;
    depositAmount = customDepositAmount;
    hasDeposit = customDepositAmount > 0;
    pendingBalance = Math.max(0, total - customDepositAmount);
  } else {
    // 'contra_entrega' (paga en domicilio al recibir)
    totalPaid = 0;
    depositAmount = 0;
    hasDeposit = false;
    pendingBalance = total;
  }

  // Auto-sync paymentState and depositAmountInput with paymentTiming
  useEffect(() => {
    if (paymentTiming === 'paid') {
      setPaymentState('paid');
      setDepositAmountInput(total);
    } else if (paymentTiming === 'partial') {
      setPaymentState((customDepositAmount >= total && total > 0) ? 'paid' : (customDepositAmount > 0 ? 'partial' : 'unpaid'));
      setDepositAmountInput(customDepositAmount);
    } else {
      setPaymentState('unpaid');
      setDepositAmountInput(0);
    }
  }, [paymentTiming, customDepositAmount, total]);

  const filteredClients = clientSearchQuery.trim()
    ? clients.filter(c => 
        (c.business_name && normalizeText(c.business_name).includes(normalizeText(clientSearchQuery))) ||
        (c.phone_primary && c.phone_primary.includes(clientSearchQuery.trim())) ||
        (c.phone_secondary && c.phone_secondary.includes(clientSearchQuery.trim())) ||
        (c.phone && c.phone.includes(clientSearchQuery.trim()))
      )
    : [];

  const sortedOrders = [...orders].sort((a, b) => {
    if (sortField === 'order_date') {
      const dateA = new Date(a.order_date || a.created_at || 0).getTime();
      const dateB = new Date(b.order_date || b.created_at || 0).getTime();
      return sortDirection === 'asc' ? dateA - dateB : dateB - dateA;
    } else if (sortField === 'seller') {
      const sellerA = normalizeText(a.sellers?.full_name || a.totals?.seller || "");
      const sellerB = normalizeText(b.sellers?.full_name || b.totals?.seller || "");
      if (sellerA < sellerB) return sortDirection === 'asc' ? -1 : 1;
      if (sellerA > sellerB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    }
    return 0;
  });



  const filteredOrders = sortedOrders.filter(p => {
    const isWholesale = isOrderWholesale(p);
    if (clientTypeFilter === 'minoristas' && isWholesale) return false;
    if (clientTypeFilter === 'mayoristas' && !isWholesale) return false;
    
    if (selectedProducts.length > 0) {
      const items = p.order_items || [];
      const hasAnyProduct = items.some((item: any) => {
        if (item.product_id && expandedSelectedProductIds.has(item.product_id)) {
          return true;
        }
        
        // Fallback for null/unlinked product_ids using smart text-matching
        const itemNormName = normalizeText(item.product_name || "");
        if (!itemNormName) return false;

        return Array.from(expandedSelectedProductIds).some(id => {
          const prod = products.find(p => p.id === id);
          if (!prod) return false;
          
          const prodNormName = normalizeText(prod.name || "");
          const prodNormSku = normalizeText(prod.sku || "");
          
          if (prodNormSku && (itemNormName === prodNormSku || itemNormName.includes(prodNormSku) || prodNormSku.includes(itemNormName))) {
            return true;
          }
          if (prodNormName && (itemNormName === prodNormName || itemNormName.includes(prodNormName) || prodNormName.includes(itemNormName))) {
            return true;
          }
          
          const cleanString = (str: string) => {
            return str
              .replace(/para tanque/g, "")
              .replace(/de hierro/g, "hierro")
              .replace(/[\(\)\-\[\]]/g, "")
              .replace(/cms?/g, "")
              .replace(/\s+/g, " ")
              .trim();
          };
          
          const cleanItem = cleanString(itemNormName);
          const cleanSku = cleanString(prodNormSku);
          const cleanName = cleanString(prodNormName);
          
          if (cleanItem && cleanSku && (cleanItem === cleanSku || cleanItem.includes(cleanSku) || cleanSku.includes(cleanItem))) {
            return true;
          }
          if (cleanItem && cleanName && (cleanItem === cleanName || cleanItem.includes(cleanName) || cleanName.includes(cleanItem))) {
            return true;
          }
          
          return false;
        });
      });
      if (!hasAnyProduct) return false;
    }
    
    return true;
  });

  const matchingExistingClient = newClientPhone
    ? clients.find(c => {
        const targetClean = newClientPhone.replace(/\D/g, '');
        let targetCleanNoPrefix = targetClean;
        if (targetClean.startsWith('549') && targetClean.length >= 10) {
          targetCleanNoPrefix = targetClean.substring(3);
        } else if (targetClean.startsWith('54') && targetClean.length >= 9) {
          targetCleanNoPrefix = targetClean.substring(2);
        }
        
        if (!targetCleanNoPrefix || targetCleanNoPrefix.length < 6) return false;
        
        const numbers = [
          ...(c.phone_primary ? c.phone_primary.split(/[\s,;]+/) : []),
          ...(c.phone_secondary ? c.phone_secondary.split(/[\s,;]+/) : []),
          ...(c.phone ? c.phone.split(/[\s,;]+/) : [])
        ].map(num => {
          const cleanNum = num.replace(/\D/g, '');
          if (cleanNum.startsWith('549') && cleanNum.length >= 10) {
            return cleanNum.substring(3);
          }
          if (cleanNum.startsWith('54') && cleanNum.length >= 9) {
            return cleanNum.substring(2);
          }
          return cleanNum;
        }).filter(Boolean);
        
        return numbers.some(num => {
          if (num === targetCleanNoPrefix) return true;
          if (targetCleanNoPrefix.length >= 8 && num.length >= 8) {
            return num.includes(targetCleanNoPrefix) || targetCleanNoPrefix.includes(num);
          }
          return false;
        });
      })
    : null;

  const handleInitialSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (orderItems.length === 0) {
      alert("Debes agregar al menos un producto al pedido.");
      return;
    }
    if (isNewClient && !newClientName) {
      alert("Completá el nombre del nuevo cliente.");
      return;
    }
    if (!isNewClient && !selectedClientId) {
      alert("Seleccioná un cliente existente o registrá uno nuevo.");
      return;
    }
    if (!localidadId) {
      alert("Seleccioná la localidad de entrega.");
      return;
    }
    if (!flete) {
      alert("Seleccioná el tipo de entrega.");
      return;
    }
    setShowSummaryModal(true);
  };

  const confirmAndSubmit = async () => {
    const isPostponed = editingOrderId && originalDeliveryDate && (new Date(entregaInicial) > new Date(originalDeliveryDate));
    if (isPostponed && !hasDeclaredPostponementReason) {
      setShowSummaryModal(false);
      setShowPostponementModal(true);
      return;
    }

    setShowSummaryModal(false);
    setSubmitting(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("No user authenticated");
      const loggedInUserId = userData.user.id;
      const seller_id = (role === 'admin' && selectedSellerId) ? selectedSellerId : loggedInUserId;

      let finalClientId = selectedClientId;
      let finalAddressId = selectedAddressId;
      let addressSnapshot: any = null;

      // 1. Si es nuevo cliente, registrar primero en base de datos
      if (isNewClient) {
        const { data: newClient, error: clientErr } = await supabase
          .from("clients")
          .insert({
            business_name: newClientName,
            tax_id: newClientTaxId || null,
            phone_primary: newClientPhones.map(cleanPhoneForSaving).filter(Boolean).join(", ")
          })
          .select()
          .single();

        if (clientErr) throw clientErr;
        finalClientId = newClient.id;

        // Registrar dirección para este nuevo cliente
        const { data: newAddr, error: addrErr } = await supabase
          .from("addresses")
          .insert({
            client_id: finalClientId,
            alias: "Principal",
            full_address: direccion,
            locality_id: localidadId,
            map_link: linkMaps || null,
            delivery_notes: aclaraciones || null,
            is_default: true
          })
          .select()
          .single();

        if (addrErr) throw addrErr;
        finalAddressId = newAddr.id;
        addressSnapshot = {
          full_address: newAddr.full_address,
          locality_id: newAddr.locality_id,
          map_link: newAddr.map_link,
          delivery_notes: newAddr.delivery_notes
        };
      } else if (selectedAddressId === "nueva_direccion") {
        // Registrar dirección manual para el cliente existente
        const { data: newAddr, error: addrErr } = await supabase
          .from("addresses")
          .insert({
            client_id: finalClientId,
            alias: `Manual - ${new Date().toLocaleDateString('es-AR')}`,
            full_address: direccion,
            locality_id: localidadId,
            map_link: linkMaps || null,
            delivery_notes: aclaraciones || null,
            is_default: false
          })
          .select()
          .single();

        if (addrErr) throw addrErr;
        finalAddressId = newAddr.id;
        addressSnapshot = {
          full_address: newAddr.full_address,
          locality_id: newAddr.locality_id,
          map_link: newAddr.map_link,
          delivery_notes: newAddr.delivery_notes
        };
      } else {
        // Obtener snapshot de dirección existente
        const selectedAddr = clientAddresses.find(a => a.id === selectedAddressId);
        if (selectedAddr) {
          addressSnapshot = {
            full_address: selectedAddr.full_address,
            locality_id: selectedAddr.locality_id,
            map_link: selectedAddr.map_link,
            delivery_notes: selectedAddr.delivery_notes
          };
        }
      }

      // Obtener nombre de localidad para retro-compatibilidad
      const locName = localities.find(l => l.id === localidadId)?.name || "";

      // 2. Crear o Actualizar Pedido de Venta
      let orderData: any = null;
      let finalLegacyCode: string | null = null;
      let sheetSyncSuccess = false;
      let sheetAttempted = false;
      let sheetSyncError = '';

      if (editingOrderId) {
        // Obtener ítems anteriores para poder revertir stock
        const { data: oldItems, error: oldItemsErr } = await supabase
          .from('order_items')
          .select('product_id, quantity')
          .eq('order_id', editingOrderId);

        if (oldItemsErr) throw oldItemsErr;

        // Validar código duplicado al editar
        if (legacyCode) {
          const { data: dupOrder } = await supabase
            .from('orders')
            .select('id, customer_name, legacy_code')
            .eq('legacy_code', legacyCode.trim().toUpperCase())
            .neq('id', editingOrderId)
            .maybeSingle();

          if (dupOrder) {
            throw new Error(`El código de pedido "${legacyCode}" ya existe en el pedido de "${dupOrder.customer_name}". No se puede duplicar.`);
          }
        }

        // Actualizar Pedido
        const { data: updatedOrder, error: orderError } = await supabase
          .from('orders')
          .update({
            client_id: finalClientId || null,
            shipping_address_id: finalAddressId || null,
            shipping_address_snapshot: addressSnapshot,
            initial_delivery_date: entregaInicial,
            max_delivery_date: entregaMaxima,
            order_date: new Date(fechaPedido + 'T12:00:00').toISOString(),
            customer_name: isNewClient ? newClientName : cliente,
            locality: locName,
            address: direccion,
            google_maps_link: linkMaps,
            delivery_notes: aclaraciones || null,
            whaticket_link: whaticketLink || null,
            payment_method_id: paymentsList[0]?.payment_method_id || 'a3a890a8-b677-4b7b-8ffb-d36c2e7b5ad3',
            freight_type: flete,
            total_amount: total,
            totals: {
              items_subtotal: itemsGrossSubtotal,
              order_discount_type: orderDiscountType,
              order_discount_value: orderDiscountValue,
              order_discount_amount: orderDiscountAmount,
              subtotal,
              freight: shippingAmount,
              tax: ivaAmount,
              payment_surcharges: surcharge,
              total,
              has_deposit: hasDeposit,
              deposit_amount: hasDeposit ? depositAmount : 0,
              deposit_receipt_url: paymentsList.find(p => p.receipt_url)?.receipt_url || "",
              pending_balance: pendingBalance,
              payments_breakdown: paymentsWithSurcharges.map(p => ({
                id: p.id,
                payment_method_id: p.payment_method_id,
                amount: p.baseAmount,
                surcharge: p.surchargeValue,
                total: p.totalAmount,
                card_installments: p.installments,
                card_surcharge: p.surchargePercentage,
                receipt_url: p.receipt_url,
                notes: p.notes
              })),
              payment_timing: paymentTiming
            },
            payment_status: paymentTiming === 'paid' ? 'Abonado' : (paymentTiming === 'partial' ? 'Seniado' : 'Pendiente'),
            logistics_zone_id: localities.find(l => l.id === localidadId)?.zone_id || null,
            advertising_source_id: selectedAdvertisingSourceId || null,
            order_medium_id: selectedOrderMediumId || null,
            received_phone_line_id: (selectedPhoneLineId && selectedPhoneLineId !== 'otro') ? selectedPhoneLineId : null,
            delivery_detail: deliveryDetail || null,
            legacy_code: legacyCode || null,
            status: orderStatus,
            hold_reason: orderStatus === 'En Espera' ? holdReason : null,
            hold_product_id: orderStatus === 'En Espera' && holdProductId ? holdProductId : null,
            category: orderCategory === 'auto' ? detectedCategory : orderCategory
          })
          .eq('id', editingOrderId)
          .select()
          .single();

        if (orderError) throw orderError;
        orderData = updatedOrder;

        // Actualizar fecha de entrega en entregas asociadas
        await supabase
          .from('deliveries')
          .update({ delivery_date: entregaInicial })
          .eq('order_id', editingOrderId);

        if (isPostponed) {
          const { data: delData } = await supabase
            .from('deliveries')
            .select('id')
            .eq('order_id', editingOrderId)
            .maybeSingle();

          if (delData) {
            await supabase
              .from('delivery_postponements')
              .insert({
                delivery_id: delData.id,
                original_date: originalDeliveryDate,
                new_date: entregaInicial,
                reason_type: postponementReasonType,
                motive: postponementMotive || null,
                created_by_id: loggedInUserId,
                created_by_name: currentSeller?.full_name || userData.user.user_metadata?.full_name || "Vendedor"
              });
          }
        }

        // Cancelar reservas antiguas
        if (oldItems && oldItems.length > 0) {
          try {
            const cancelTxs = oldItems.map(item => ({
              productId: item.product_id,
              quantity: item.quantity,
              type: 'Cancelacion Pedido' as const,
              referenceId: editingOrderId,
              userId: seller_id
            }));
            await createBulkStockTransactions(supabase, cancelTxs);
          } catch (stockErr) {
            console.error("Error cancelando reservas antiguas:", stockErr);
          }
        }

        // Borrar ítems antiguos
        const { error: deleteItemsErr } = await supabase
          .from('order_items')
          .delete()
          .eq('order_id', editingOrderId);

        if (deleteItemsErr) throw deleteItemsErr;

      } else {
        // Sincronizar a Google Sheets si el vendedor tiene planilla configurada
        try {
          const selectedPayMethodName = dbPaymentMethods.find(m => m.id === paymentsList[0]?.payment_method_id)?.name || 'Efectivo';
          const clientPhone = isNewClient 
            ? (newClientPhones.map(cleanPhoneForSaving).filter(Boolean)[0] || '')
            : (clients.find(c => c.id === selectedClientId)?.phone_primary || '');
          const clientPhone2 = isNewClient
            ? (newClientPhones.map(cleanPhoneForSaving).filter(Boolean)[1] || '')
            : '';
          let sellerFullName = sellersList.find(s => s.id === seller_id)?.full_name;
          if (!sellerFullName) {
            const { data: sRow } = await supabase
              .from('sellers')
              .select('full_name')
              .eq('id', seller_id)
              .maybeSingle();
            sellerFullName = sRow?.full_name;
          }
          if (!sellerFullName) {
            sellerFullName = (seller_id === loggedInUserId ? (currentSeller?.full_name || userData.user.user_metadata?.full_name) : '') || 'Vendedor';
          }
          const advName = advertisingSources.find(a => a.id === selectedAdvertisingSourceId)?.name || 'Publicidad Meta';
          const mediumName = orderMediums.find(m => m.id === selectedOrderMediumId)?.name || 'WhatsApp';

          const sheetOrderPayload = {
            deliveryDate: entregaInicial,
            orderDate: fechaPedido,
            maxDeliveryDate: entregaMaxima,
            clientName: isNewClient ? newClientName : (cliente || ''),
            phonePrimary: clientPhone,
            phoneSecondary: clientPhone2,
            whaticketLink: whaticketLink || '',
            source: sellerType === 'mayorista' ? 'Mayorista' : (advName || 'Publicidad Meta'),
            deliveryNotes: [
              aclaraciones, 
              deliveryDetail, 
              paymentTiming === 'contra_entrega' 
                ? `Cobrar al entregar: ${formatPrice(total)} (${selectedPayMethodName})` 
                : (paymentTiming === 'partial' 
                    ? `Seña: ${formatPrice(customDepositAmount)} - Saldo al entregar: ${formatPrice(pendingBalance)}` 
                    : '')
            ].filter(Boolean).map((s: string) => s.trim()).join(' / '),
            medium: mediumName,
            sellerName: normalizeSellerName(sellerFullName),
            status: orderStatus === 'En Espera' ? 'En Espera' : '🔸 Validado',
            locality: locName,
            address: direccion,
            mapsLink: linkMaps || '',
            category: orderCategory === 'auto' ? detectedCategory : orderCategory,
            paymentMethod: selectedPayMethodName,
            identification: newClientTaxId || '',
            paymentStatus: paymentTiming === 'paid' ? 'Abonado' : (paymentTiming === 'partial' ? 'Señado' : 'No Abonado'),
            depositOrPaidAmount: hasDeposit ? depositAmount : (paymentTiming === 'paid' ? total : 0),
            freightType: flete || '⚪ Flete Regular',
            freightCost: shippingAmount || 0,
            items: buildSheetOrderItems(orderItems, orderDiscountAmount, products)
          };

          const sheetRes = await fetch('/api/vendedores/create-sheet-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sellerId: seller_id,
              order: sheetOrderPayload
            })
          });

          if (sheetRes.ok) {
            const sheetData = await sheetRes.json();
            if (sheetData.synced) {
              sheetAttempted = true;
              if (sheetData.code) {
                finalLegacyCode = sheetData.code;
                sheetSyncSuccess = true;
              }
            }
          } else {
            sheetAttempted = true;
            const errData = await sheetRes.json().catch(() => ({}));
            sheetSyncError = errData.error || errData.message || `Error (${sheetRes.status}) al sincronizar con la planilla`;
            console.warn('Google Sheet sync returned non-ok:', sheetRes.status, errData);
          }
        } catch (sheetErr: any) {
          sheetAttempted = true;
          sheetSyncError = sheetErr?.message || 'Error de red al conectar con la planilla';
          console.error('Error synchronizing order to Google Sheet:', sheetErr);
        }

        // VALIDACIÓN ANTI-DUPLICADOS: Verificar que el código asignado no exista en el sistema
        const codeToCheck = finalLegacyCode || legacyCode;
        if (codeToCheck) {
          const { data: dupOrder } = await supabase
            .from('orders')
            .select('id, customer_name, legacy_code')
            .eq('legacy_code', codeToCheck.trim().toUpperCase())
            .maybeSingle();

          if (dupOrder) {
            throw new Error(`El código de pedido "${codeToCheck}" ya existe en el sistema (asignado a "${dupOrder.customer_name}"). No se puede cargar un pedido con código duplicado.`);
          }
        }

        // Insertar Nuevo Pedido
        const { data: newOrder, error: orderError } = await supabase
          .from('orders')
          .insert({
            seller_id,
            client_id: finalClientId || null,
            shipping_address_id: finalAddressId || null,
            shipping_address_snapshot: addressSnapshot,
            initial_delivery_date: entregaInicial,
            max_delivery_date: entregaMaxima,
            order_date: new Date(fechaPedido + 'T12:00:00').toISOString(),
            created_at: new Date(fechaPedido + 'T12:00:00').toISOString(),
            customer_name: isNewClient ? newClientName : cliente,
            locality: locName, // Retro-compatibilidad
            address: direccion,
            google_maps_link: linkMaps,
            delivery_notes: aclaraciones || null,
            whaticket_link: whaticketLink || null,
            payment_method_id: paymentsList[0]?.payment_method_id || 'a3a890a8-b677-4b7b-8ffb-d36c2e7b5ad3',
            freight_type: flete,
            total_amount: total,
            status: orderStatus,
            totals: {
              items_subtotal: itemsGrossSubtotal,
              order_discount_type: orderDiscountType,
              order_discount_value: orderDiscountValue,
              order_discount_amount: orderDiscountAmount,
              subtotal,
              freight: shippingAmount,
              tax: ivaAmount,
              payment_surcharges: surcharge,
              total,
              has_deposit: hasDeposit,
              deposit_amount: hasDeposit ? depositAmount : 0,
              deposit_receipt_url: paymentsList.find(p => p.receipt_url)?.receipt_url || "",
              pending_balance: pendingBalance,
              payments_breakdown: paymentsWithSurcharges.map(p => ({
                id: p.id,
                payment_method_id: p.payment_method_id,
                amount: p.baseAmount,
                surcharge: p.surchargeValue,
                total: p.totalAmount,
                card_installments: p.installments,
                card_surcharge: p.surchargePercentage,
                receipt_url: p.receipt_url,
                notes: p.notes
              })),
              payment_timing: paymentTiming
            },
            channel: sellerType === 'mayorista' ? 'mayorista' : 'vendedor_externo',
            payment_status: paymentTiming === 'paid' ? 'Abonado' : (paymentTiming === 'partial' ? 'Seniado' : 'Pendiente'),
            logistics_zone_id: localities.find(l => l.id === localidadId)?.zone_id || null,
            advertising_source_id: selectedAdvertisingSourceId || null,
            order_medium_id: selectedOrderMediumId || null,
            received_phone_line_id: (selectedPhoneLineId && selectedPhoneLineId !== 'otro') ? selectedPhoneLineId : null,
            delivery_detail: deliveryDetail || null,
            legacy_code: finalLegacyCode || null,
            hold_reason: orderStatus === 'En Espera' ? holdReason : null,
            hold_product_id: orderStatus === 'En Espera' && holdProductId ? holdProductId : null,
            category: orderCategory === 'auto' ? detectedCategory : orderCategory
          })
          .select()
          .single();

        if (orderError) throw orderError;
        orderData = newOrder;
      }

      // 3. Crear nuevos ítems del Pedido
      const itemsToInsert = orderItems.map(item => ({
        order_id: orderData.id,
        product_id: item.id,
        product_name: item.name,
        quantity: item.quantity,
        unit_price: item.customPrice,
        historical_unit_cost: (item as any).cost || 0, // Costo dinámico guardado
        discount_percentage: item.discountType === 'percentage' ? (item.discountValue || 0) : 0
      }));

      const { error: itemsError } = await supabase.from('order_items').insert(itemsToInsert);
      if (itemsError) throw itemsError;

      // 4. Registrar Reservas en el Inventario para descontar Stock Disponible (stock_current)
      try {
        const stockTxs = orderItems.map(item => ({
          productId: item.id,
          quantity: item.quantity,
          type: 'Reserva Pedido' as const,
          referenceId: orderData.id,
          userId: seller_id
        }));
        
        await createBulkStockTransactions(supabase, stockTxs);
      } catch (stockErr) {
        console.error("Error registrando transacciones de stock:", stockErr);
      }

      if (editingOrderId) {
        alert("Pedido actualizado con éxito. Las reservas de stock han sido actualizadas.");
        setEditingOrderId(null);
      } else {
        if (sheetSyncSuccess && finalLegacyCode) {
          alert(`¡Pedido ${finalLegacyCode} guardado y registrado en la planilla con éxito!`);
        } else if (sheetAttempted && !sheetSyncSuccess) {
          alert(`⚠️ ATENCIÓN: El pedido se guardó en el sistema, pero NO se pudo registrar en la planilla de Google.\n\nMotivo: ${sheetSyncError || 'Error de permisos o conexión'}\n\nPodrás sincronizarlo manualmente desde la lista de pedidos con el botón "A Planilla" una vez verificado el acceso.`);
        } else {
          alert("Pedido cargado con éxito en el sistema. Se ha reservado el stock de los productos.");
        }
      }
      
      // Reset form
      setOriginalDeliveryDate("");
      setHasDeclaredPostponementReason(false);
      setPostponementMotive("");
      setPostponementReasonType('cliente');
      setEntregaInicial("");
      setEntregaMaxima("");
      setFechaPedido(() => {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
      });
      setCliente("");
      setDireccion("");
      setAclaraciones("");
      setLinkMaps("");
      setFlete("");
      setPaymentType('efectivo');
      const defaultPm = dbPaymentMethods.find(pm => pm.is_default);
      if (defaultPm) {
        setSelectedPaymentMethodId(defaultPm.id);
        setCardSurcharge(defaultPm.surcharge_percentage);
        setCardInstallments(defaultPm.installments);
      } else {
        setSelectedPaymentMethodId("");
        setCardInstallments(6);
        setCardSurcharge(34);
      }
      setIsFreeShipping(true);
      setShippingCost(0);
      setIncludeIVA(false);
      setPaymentTiming('contra_entrega');
      setCustomDepositAmount(0);
      setPaymentState('unpaid');
      setDepositAmountInput(0);
      setDepositReceiptUrl("");
      setPaymentsList([
        {
          id: Math.random().toString(36).substring(2, 9),
          payment_method_id: "a3a890a8-b677-4b7b-8ffb-d36c2e7b5ad3",
          amount: 0,
          receipt_url: "",
          notes: ""
        }
      ]);
      setSelectedClientId("");
      setSelectedAddressId("");
      setClientSearchQuery("");
      setNewClientName("");
      setNewClientTaxId("");
      setShowTaxIdField(false);
      setNewClientPhone("");
      setWhaticketLink("");
      setLocalidadId("");
      setOrderItems([]);
      setOrderDiscountType('fixed');
      setOrderDiscountValue(0);
      setOrderCategory("auto");
      
      generateNextLegacyCode(seller_id);
      setSelectedAdvertisingSourceId("");
      setSelectedOrderMediumId("");
      setSelectedPhoneLineId("");
      setDeliveryDetail("");
      setAdvertisingSearchQuery("");
      setShowAdvertisingDropdown(false);
      setNewLineName("");
      setNewLineNumber("");
      setOrderStatus("Pendiente");
      setHoldReason("");
      setHoldProductId("");
      
      setActiveTab('list');
    } catch (error: any) {
      console.error(error);
      alert(`Error al cargar el pedido: ${error?.message || error?.details || JSON.stringify(error)}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-lg font-black text-slate-900 tracking-tight">Carga de Pedidos</h1>
            <p className="text-[11px] text-slate-400 font-semibold">
              Ventas orgánicas (minoristas y mayoristas) con reserva automática de stock.
              {sellerType === 'mayorista' && <span className="ml-2 bg-emerald-100 text-emerald-800 text-[10px] px-2 py-0.5 rounded-full font-bold">Modo Mayorista</span>}
            </p>
          </div>
          
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => { fetchOrdersForModal(); setShowLoadFromDbModal(true); }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/80 rounded-xl text-xs font-bold transition-all shadow-2xs hover:shadow-xs active:scale-95 cursor-pointer"
              title="Cargar datos de un pedido existente en la base de datos (reintentar o duplicar)"
            >
              <Database className="w-3.5 h-3.5 text-indigo-600" />
              <span>Cargar desde BD</span>
            </button>

            <div className="flex bg-slate-200/50 p-0.5 rounded-xl">
              <button 
                onClick={() => setActiveTab('form')}
                className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-all ${activeTab === 'form' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                {editingOrderId ? "✏️ Editar Pedido" : "Nuevo Pedido"}
              </button>
              <button 
                onClick={() => { setActiveTab('list'); setListType('mis_pedidos'); }}
                className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-all ${activeTab === 'list' && listType === 'mis_pedidos' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Mis Pedidos
              </button>
              {role === 'admin' && (
                <button 
                  onClick={() => { setActiveTab('list'); setListType('todos'); }}
                  className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-all ${activeTab === 'list' && listType === 'todos' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  Todos los Pedidos
                </button>
              )}
            </div>
          </div>
        </div>

      {activeTab === 'form' ? (
        <form onSubmit={handleInitialSubmit} className="bg-white p-5 rounded-xl border border-slate-200/60 shadow-sm relative">
          
          {editingOrderId && (
            <div className="mb-5 bg-amber-50 border border-amber-200/60 rounded-xl p-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 text-xs text-amber-800 animate-in fade-in slide-in-from-top-1">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4.5 h-4.5 text-amber-500 shrink-0 animate-pulse" />
                <div>
                  <span className="font-black text-amber-900 uppercase">Modo Edición Activado</span>
                  <p className="text-[10px] text-amber-700 font-bold mt-0.5">Estás modificando un pedido existente. Al guardar se actualizarán los datos del pedido y del stock reservado.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingOrderId(null);
                  setOriginalDeliveryDate("");
                  setHasDeclaredPostponementReason(false);
                  setPostponementMotive("");
                  setPostponementReasonType('cliente');
                  setEntregaInicial("");
                  setEntregaMaxima("");
                  setFechaPedido(() => {
                    const today = new Date();
                    const yyyy = today.getFullYear();
                    const mm = String(today.getMonth() + 1).padStart(2, '0');
                    const dd = String(today.getDate()).padStart(2, '0');
                    return `${yyyy}-${mm}-${dd}`;
                  });
                  setCliente("");
                  setDireccion("");
                  setAclaraciones("");
                  setLinkMaps("");
                  setFlete("");
                  setPaymentType('efectivo');
                  setCardInstallments(6);
                  setCardSurcharge(34);
                  setIsFreeShipping(true);
                  setShippingCost(0);
                  setIncludeIVA(false);
                  setPaymentTiming('contra_entrega');
                  setCustomDepositAmount(0);
                  setPaymentState('unpaid');
                  setDepositAmountInput(0);
                  setDepositReceiptUrl("");
                  setPaymentsList([
                    {
                      id: Math.random().toString(36).substring(2, 9),
                      payment_method_id: "a3a890a8-b677-4b7b-8ffb-d36c2e7b5ad3",
                      amount: 0,
                      receipt_url: "",
                      notes: ""
                    }
                  ]);
                  setSelectedClientId("");
                  setSelectedAddressId("");
                  setClientSearchQuery("");
                  setNewClientName("");
                  setNewClientTaxId("");
                  setShowTaxIdField(false);
                  setNewClientPhone("");
                  setWhaticketLink("");
                  setLocalidadId("");
                  setOrderItems([]);
                  setOrderDiscountType('fixed');
                  setOrderDiscountValue(0);
                  setOrderCategory("auto");
                  setSelectedSellerId(currentUserId);
                  generateNextLegacyCode(currentUserId);
                  setSelectedAdvertisingSourceId("");
                  setSelectedOrderMediumId("");
                  setSelectedPhoneLineId("");
                  setDeliveryDetail("");
                  setOrderStatus("Pendiente");
                  setHoldReason("");
                  setHoldProductId("");
                  setActiveTab('list');
                }}
                className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-amber-200 text-amber-800 font-black rounded-lg text-[10px] shadow-sm transition-all uppercase tracking-wider shrink-0"
              >
                Cancelar Edición
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            
            {/* 1. Datos del Cliente */}
            <div className="space-y-4 md:col-span-2 lg:col-span-1 bg-slate-50/90 p-4 rounded-xl border border-slate-200/95">
              <div className="flex justify-between items-center mb-1">
                <h3 className="flex items-center gap-1.5 font-black text-slate-800 text-xs uppercase tracking-wider">
                  <User className="w-4 h-4 text-brand-500" /> Cuenta del Cliente
                </h3>
              </div>

              {/* Búsqueda inteligente por nombre, teléfono o CUIT */}
              <div className="space-y-3" onClick={(e) => e.stopPropagation()}>
                {selectedClientId ? (
                  <>
                    <div className="bg-brand-50 border border-brand-100 rounded-lg p-2.5 flex items-center justify-between gap-3 text-xs animate-in fade-in slide-in-from-top-1">
                      <div>
                        <span className="font-black text-brand-700">Cliente Existente Seleccionado</span>
                        <p className="text-[10px] text-slate-500 font-bold leading-tight mt-0.5">La información de CUIT y Teléfono ha sido precargada.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedClientId("");
                          setCliente("");
                          setNewClientName("");
                          setNewClientTaxId("");
                          setShowTaxIdField(false);
                          setNewClientPhone("");
                          setClientSearchQuery("");
                          setClientAddresses([]);
                          setSelectedAddressId("");
                          setDireccion("");
                          setAclaraciones("");
                          setLocalidadId("");
                          setLinkMaps("");
                        }}
                        className="px-2 py-1 bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 font-bold rounded text-[9px] shadow-sm transition-all"
                      >
                        Cambiar / Limpiar
                      </button>
                    </div>

                    <div className="p-2.5 bg-brand-50/20 border border-brand-100/50 rounded-xl flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-1">
                      <div className="text-[9px] font-black text-brand-600 uppercase tracking-wider">Dirección de Entrega:</div>
                      <div className="flex-1 max-w-[300px]">
                        <select
                          value={selectedAddressId}
                          onChange={e => handleAddressChange(e.target.value)}
                          className="w-full px-2 py-1 rounded-lg border border-slate-200 bg-white font-bold text-[10px] outline-none cursor-pointer"
                        >
                          {clientAddresses.map(a => (
                            <option key={a.id} value={a.id}>{a.alias} - {a.full_address}</option>
                          ))}
                          <option value="nueva_direccion">+ Cargar otra dirección (Manual)</option>
                        </select>
                      </div>
                    </div>
                  </>
                ) : null}
              </div>

              {/* Campos de Información del Cliente */}
              {isNewClient ? (
                <div className="space-y-3 border-t border-slate-100 pt-3 animate-in fade-in duration-200">
                  <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-1 gap-3">
                    
                    {/* Teléfono Celular - Primero */}
                    <div className="space-y-1">
                      <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Teléfono Celular *</label>
                      <div className="space-y-1.5">
                        {newClientPhones.map((phone, index) => (
                          <div key={index} className="flex gap-1.5 items-center">
                            <input 
                              type="text" 
                              required={index === 0} 
                              value={phone} 
                              onChange={e => {
                                const updated = [...newClientPhones];
                                updated[index] = e.target.value;
                                setNewClientPhones(updated);
                              }} 
                              placeholder={index === 0 ? "Ej. 1155443322 (Principal)" : `Ej. 1155443322 (Celular ${index + 1})`} 
                              className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-bold text-xs outline-none focus:ring-2 focus:ring-brand-500/10" 
                            />
                            {index > 1 && (
                              <button
                                type="button"
                                onClick={() => {
                                  const updated = newClientPhones.filter((_, i) => i !== index);
                                  setNewClientPhones(updated);
                                }}
                                className="p-1.5 bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 rounded-lg text-xs transition-all active:scale-95 flex-shrink-0 animate-in zoom-in-95"
                                title="Eliminar teléfono"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        ))}
                        <div className="flex gap-2 flex-wrap pt-1">
                          <button
                            type="button"
                            onClick={() => setNewClientPhones([...newClientPhones, ""])}
                            className="px-2.5 py-1 bg-brand-50 hover:bg-brand-100 border border-brand-200 text-brand-700 font-bold rounded-lg text-[9px] whitespace-nowrap transition-all duration-200 active:scale-95 flex items-center gap-1 w-fit cursor-pointer"
                          >
                            <Plus className="w-3 h-3" /> Agregar Teléfono
                          </button>
                          {!showTaxIdField && (
                            <button
                              type="button"
                              onClick={() => setShowTaxIdField(true)}
                              className="px-2.5 py-1 bg-brand-50 hover:bg-brand-100 border border-brand-200 text-brand-700 font-bold rounded-lg text-[9px] whitespace-nowrap transition-all duration-200 active:scale-95 flex items-center gap-1 w-fit cursor-pointer"
                            >
                              <Plus className="w-3 h-3" /> Agregar CUIT / DNI
                            </button>
                          )}
                        </div>
                      </div>
                      
                      {matchingExistingClient && (
                        <div className="mt-1.5 p-2 bg-amber-50 border border-amber-200 rounded-lg flex flex-col gap-1.5 animate-in fade-in slide-in-from-top-1 text-[10px]">
                          <div className="flex items-center gap-1.5 text-amber-800 font-medium">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                            <span>Celular ya registrado a nombre de <strong>{matchingExistingClient.business_name}</strong>.</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedClientId(matchingExistingClient.id);
                              setCliente(matchingExistingClient.business_name);
                              setNewClientName(matchingExistingClient.business_name);
                              setNewClientTaxId(matchingExistingClient.tax_id || "");
                              setShowTaxIdField(!!matchingExistingClient.tax_id);
                              setNewClientPhone(matchingExistingClient.phone_primary || matchingExistingClient.phone || "");
                            }}
                            className="w-full py-1 bg-amber-600 hover:bg-amber-700 text-white rounded font-bold transition-all text-[9px] text-center shadow-sm"
                          >
                            Cargar Datos de {matchingExistingClient.business_name}
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Nombre / Razón Social - Segundo */}
                    <div className="space-y-1">
                      <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Nombre / Razón Social *</label>
                      <input 
                        type="text" 
                        required={isNewClient} 
                        value={newClientName} 
                        onChange={e => setNewClientName(e.target.value)} 
                        placeholder="Ej. Juan Pérez" 
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-bold text-xs outline-none focus:ring-2 focus:ring-brand-500/10" 
                      />
                    </div>

                    {/* CUIT / DNI - Tercero (Opcional) */}
                    {showTaxIdField && (
                      <div className="space-y-1 relative animate-in zoom-in-95 duration-150">
                        <div className="flex justify-between items-center">
                          <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">
                            {newClientTaxId.replace(/\D/g, "").length <= 8 ? "DNI" : "CUIT"}
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              setNewClientTaxId("");
                              setShowTaxIdField(false);
                            }}
                            className="text-[9px] font-black text-red-500 hover:text-red-700 uppercase tracking-widest cursor-pointer"
                          >
                            Quitar DNI
                          </button>
                        </div>
                        <input 
                          type="text" 
                          value={newClientTaxId} 
                          onChange={e => setNewClientTaxId(e.target.value)} 
                          placeholder="Ej. 30712345678" 
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-bold text-xs outline-none focus:ring-2 focus:ring-brand-500/10" 
                        />
                      </div>
                    )}

                  </div>
                </div>
              ) : (
                <div className="space-y-2.5 border-t border-slate-100 pt-3 animate-in fade-in duration-200">
                  <div className="bg-brand-50/20 border border-brand-100/50 rounded-xl p-3 space-y-2 text-xs">
                    <div className="flex justify-between items-center py-1 border-b border-brand-100/10">
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Razón Social</span>
                      <span className="font-extrabold text-slate-800">{newClientName}</span>
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-brand-100/10">
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                        {newClientTaxId.replace(/\D/g, "").length <= 8 ? "DNI" : "CUIT"}
                      </span>
                      <span className="font-extrabold text-slate-800">{newClientTaxId || "—"}</span>
                    </div>
                    <div className="flex justify-between items-start py-1">
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Teléfonos</span>
                      <div className="text-right">
                        {newClientPhones.map((phone, idx) => (
                          <p key={idx} className="font-extrabold text-slate-800 leading-tight">{phone}</p>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

            </div>

            {/* Ubicación de Entrega */}
            <div className="space-y-4 bg-slate-50/90 p-4 rounded-xl border border-slate-200/95">
              <h3 className="flex items-center gap-1.5 font-black text-slate-800 border-b border-slate-200/60 pb-1.5 text-xs uppercase tracking-wider">
                <MapPin className="w-4 h-4 text-brand-500" /> Destino de Reparto
              </h3>
              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1 relative">
                    <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Localidad *</label>
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Buscar localidad..."
                        value={localitySearch}
                        onChange={e => {
                          setLocalitySearch(e.target.value);
                          setIsLocalityDropdownOpen(true);
                        }}
                        onFocus={() => {
                          setIsLocalityDropdownOpen(true);
                          setLocalitySearch("");
                        }}
                        onBlur={() => {
                          setTimeout(() => {
                            setIsLocalityDropdownOpen(false);
                            const selected = localities.find(l => l.id === localidadId);
                            if (selected) {
                              setLocalitySearch(selected.name);
                            } else {
                              setLocalitySearch("");
                            }
                          }, 200);
                        }}
                        className="w-full pl-2.5 pr-8 py-1.5 rounded-lg border border-slate-200 bg-white font-bold text-xs outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 transition-all cursor-pointer"
                        required={!localidadId}
                      />
                      <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                      
                      {isLocalityDropdownOpen && (
                        <div className="absolute left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg z-50 py-1">
                          {localities.filter(l => 
                            l.name.toLowerCase().includes(localitySearch.toLowerCase())
                          ).length === 0 ? (
                            <p className="text-[10px] text-slate-400 font-bold p-2 text-center">No se encontraron localidades</p>
                          ) : (
                            localities
                              .filter(l => 
                                l.name.toLowerCase().includes(localitySearch.toLowerCase())
                              )
                              .map(l => (
                                <button
                                  key={l.id}
                                  type="button"
                                  onMouseDown={() => {
                                    setLocalidadId(l.id);
                                    setLocalitySearch(l.name);
                                    setIsLocalityDropdownOpen(false);
                                  }}
                                  className={`w-full px-2.5 py-1.5 text-left text-[10px] font-bold transition-all block ${
                                    localidadId === l.id 
                                      ? 'bg-brand-50 text-brand-700 font-black' 
                                      : 'text-slate-700 hover:bg-slate-50'
                                  }`}
                                >
                                  {l.name}
                                </button>
                              ))
                          )}
                        </div>
                      )}
                    </div>
                    <input type="hidden" required value={localidadId} onChange={() => {}} />
                    {(() => {
                      const selectedLocality = localities.find(l => l.id === localidadId);
                      if (selectedLocality && selectedLocality.zones) {
                        return (
                          <div className="mt-1.5 flex items-center gap-1.5 bg-brand-50 border border-brand-100 rounded px-2 py-1 text-[9px] text-brand-700 font-bold w-fit animate-in fade-in slide-in-from-top-1">
                            <MapPin className="w-3 h-3 text-brand-500 shrink-0" />
                            <span>
                              Zona: <span className="text-brand-900 font-black">{selectedLocality.zones.name}</span>
                              {(() => {
                                const deliveryTime = selectedLocality.zones.delivery_times;
                                const schedule = deliveryTime 
                                  ? `${deliveryTime.name} (${deliveryTime.description})` 
                                  : selectedLocality.zones.delivery_schedule;
                                if (!schedule) return null;
                                return (
                                  <>
                                    {" • Reparto: "}
                                    <span className="text-brand-900 font-black">{schedule}</span>
                                  </>
                                );
                              })()}
                            </span>
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Dirección Exacta *</label>
                    <input 
                      type="text" 
                      required 
                      value={direccion} 
                      onChange={e => setDireccion(e.target.value)} 
                      placeholder="Ej. Mitre 540" 
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-bold text-xs outline-none focus:ring-2 focus:ring-brand-500/10 focus:border-brand-500 transition-all" 
                    />
                  </div>

                  <div className="space-y-1 md:col-span-2">
                    <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Enlace de Ubicación (Google Maps)</label>
                    <div className="flex gap-1.5">
                      <input 
                        type="url" 
                        value={linkMaps} 
                        onChange={e => setLinkMaps(e.target.value)} 
                        placeholder="" 
                        className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-bold text-xs outline-none focus:ring-2 focus:ring-brand-500/10 focus:border-brand-500 transition-all" 
                      />
                      <button
                        type="button"
                        onClick={() => {
                          window.open("https://www.google.com.ar/maps", "_blank");
                        }}
                        className="px-3 bg-brand-50 hover:bg-brand-100 border border-brand-200 text-brand-700 font-bold rounded-lg text-xs whitespace-nowrap transition-all duration-200 active:scale-95 flex items-center justify-center gap-1 shrink-0 cursor-pointer"
                        title="Abrir Google Maps en pestaña nueva"
                      >
                        <MapPin className="w-3.5 h-3.5 text-brand-500" /> Buscar en Mapa
                      </button>
                    </div>
                    {linkMaps && (
                      <p className="text-[8px] font-bold mt-1">
                        {linkMaps.includes("maps.app.goo.gl") || linkMaps.includes("google.com/maps") ? (
                          <span className="text-emerald-600">✓ Enlace de Google Maps vinculado con éxito.</span>
                        ) : (
                          <span className="text-amber-600">⚠️ Enlace registrado. Asegúrate de que sea un enlace válido de Google Maps.</span>
                        )}
                      </p>
                    )}
                  </div>

                  <div className="space-y-1 md:col-span-2">
                    <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Aclaraciones de Dirección (Opcional)</label>
                    <input 
                      type="text" 
                      value={aclaraciones} 
                      onChange={e => setAclaraciones(e.target.value)} 
                      placeholder="Ej. Rejas verdes, casa pintada verde, portón negro, timbre roto" 
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-bold text-xs outline-none focus:ring-2 focus:ring-brand-500/10 focus:border-brand-500 transition-all" 
                    />
                  </div>

                  <div className="space-y-1 md:col-span-2">
                    <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Detalle de Entrega para Fletero (Opcional)</label>
                    <textarea 
                      value={deliveryDetail} 
                      onChange={e => setDeliveryDetail(e.target.value)} 
                      placeholder="Ej. Entregar después de las 14hs, llamar 30 min antes de llegar, dejar en obra de al lado" 
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-bold text-xs outline-none focus:ring-2 focus:ring-brand-500/10 focus:border-brand-500 transition-all resize-y h-16" 
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Fechas de Pedido y Entrega */}
            <div className="space-y-4 bg-slate-50/90 p-4 rounded-xl border border-slate-200/95 flex flex-col justify-between">
              <div>
                <h3 className="flex items-center gap-1.5 font-black text-slate-800 border-b border-slate-200/60 pb-1.5 mb-3 text-xs uppercase tracking-wider">
                  <Calendar className="w-4 h-4 text-brand-500" /> Fechas y Plazos
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <DateInput 
                    label="Fecha del Pedido *"
                    value={fechaPedido}
                    onChange={setFechaPedido}
                    required
                  />
                  <DateInput 
                    label="Entrega Inicial *"
                    value={entregaInicial}
                    onChange={setEntregaInicial}
                    required
                  />
                  <DateInput 
                    label="Entrega Máxima *"
                    value={entregaMaxima}
                    onChange={setEntregaMaxima}
                    required
                  />
                </div>
                {suggestedDeliveryDate && (
                  <div className="mt-2 text-[10px] font-black text-amber-800 bg-amber-50 border border-amber-200/50 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5 w-fit animate-in fade-in slide-in-from-top-1 shadow-sm">
                    <span>💡 Próximo reparto programado:</span>
                    <button 
                      type="button"
                      onClick={() => {
                        setEntregaInicial(suggestedDeliveryDate);
                        setEntregaMaxima(suggestedDeliveryDateMax || suggestedDeliveryDate);
                      }}
                      className="underline text-amber-950 hover:text-black font-black font-sans tracking-wide"
                      title="Aplicar fecha sugerida"
                    >
                      {(() => {
                        const partsInit = suggestedDeliveryDate.split('-');
                        const initStr = `${partsInit[2]}/${partsInit[1]}/${partsInit[0]}`;
                        if (suggestedDeliveryDateMax && suggestedDeliveryDateMax !== suggestedDeliveryDate) {
                          const partsMax = suggestedDeliveryDateMax.split('-');
                          const maxStr = `${partsMax[2]}/${partsMax[1]}/${partsMax[0]}`;
                          return `${initStr} al ${maxStr}`;
                        }
                        return initStr;
                      })()}
                    </button>
                    <span className="text-amber-600/80 font-bold">(Hacé click para aplicar)</span>
                  </div>
                )}

                {(() => {
                  if (!entregaInicial) return null;
                  const parts = entregaInicial.split('-');
                  const selDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
                  if (selDate.getDay() === 0) {
                    return (
                      <div className="mt-2 text-[10px] font-black text-rose-800 bg-rose-50 border border-rose-200/50 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5 w-fit animate-in fade-in slide-in-from-top-1 shadow-sm">
                        <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                        <span>Atención: Has seleccionado un día Domingo. No es habitual realizar entregas los domingos.</span>
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>

              {/* Tipo de Entrega */}
              <div className="space-y-3 pt-3 border-t border-slate-200/60 mt-3">
                <h3 className="flex items-center gap-1.5 font-black text-slate-800 text-xs uppercase tracking-wider">
                  <Clock className="w-4 h-4 text-brand-500" /> Tipo de Entrega
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  {deliveryTimes.length === 0 ? (
                    <p className="text-[10px] text-slate-400 font-bold py-2 col-span-2 text-center">Cargando opciones...</p>
                  ) : (
                    (() => {
                      const regularOption = deliveryTimes.find(d => d.category === 'Regular');
                      const expressOption = deliveryTimes.find(d => d.category === 'Express');
                      const particularOption = deliveryTimes.find(d => d.category === 'Particular');
                      const zonalOptions = deliveryTimes.filter(d => d.category === 'Zonal').sort((a, b) => a.name.localeCompare(b.name));
                      const isZonalActive = !!(flete && deliveryTimes.find(d => d.name === flete)?.category === 'Zonal');

                      return (
                        <>
                          {/* 1. Botón Regular */}
                          {regularOption ? (
                            <button
                              key={regularOption.id}
                              type="button"
                              onClick={() => setFlete(regularOption.name)}
                              className={`flex items-center justify-between p-2.5 rounded-xl border text-left transition-all duration-200 cursor-pointer h-[50px] select-none ${
                                flete === regularOption.name
                                  ? 'border-brand-600 bg-brand-50/80 ring-2 ring-brand-600/40 shadow-sm scale-[1.01]'
                                  : 'border-slate-200 hover:border-slate-300 bg-white'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span className={`w-2.5 h-2.5 rounded-full border ${getFreightColor(regularOption.name)} flex-shrink-0`} />
                                <div className="min-w-0">
                                  <p className={`font-bold text-[10px] leading-tight ${flete === regularOption.name ? 'text-brand-900 font-extrabold' : 'text-slate-800'}`}>{regularOption.name}</p>
                                  <p className={`text-[8px] leading-tight truncate ${flete === regularOption.name ? 'text-brand-700/80 font-bold' : 'text-slate-400'}`}>{regularOption.description}</p>
                                </div>
                              </div>
                              {flete === regularOption.name && (
                                <div className="w-3.5 h-3.5 rounded-full bg-brand-600 flex items-center justify-center text-white shrink-0 ml-1">
                                  <Check className="w-2 h-2 stroke-[3.5]" />
                                </div>
                              )}
                            </button>
                          ) : (
                            <div className="flex items-center justify-center p-2.5 rounded-xl border border-dashed border-slate-200 h-[50px]">
                              <p className="text-[10px] text-slate-400 font-bold">Regular</p>
                            </div>
                          )}

                          {/* 2. Botón Express */}
                          {expressOption ? (
                            <button
                              key={expressOption.id}
                              type="button"
                              onClick={() => setFlete(expressOption.name)}
                              className={`flex items-center justify-between p-2.5 rounded-xl border text-left transition-all duration-200 cursor-pointer h-[50px] select-none ${
                                flete === expressOption.name
                                  ? 'border-brand-600 bg-brand-50/80 ring-2 ring-brand-600/40 shadow-sm scale-[1.01]'
                                  : 'border-slate-200 hover:border-slate-300 bg-white'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span className={`w-2.5 h-2.5 rounded-full border ${getFreightColor(expressOption.name)} flex-shrink-0`} />
                                <div className="min-w-0">
                                  <p className={`font-bold text-[10px] leading-tight ${flete === expressOption.name ? 'text-brand-900 font-extrabold' : 'text-slate-800'}`}>{expressOption.name}</p>
                                  <p className={`text-[8px] leading-tight truncate ${flete === expressOption.name ? 'text-brand-700/80 font-bold' : 'text-slate-400'}`}>{expressOption.description}</p>
                                </div>
                              </div>
                              {flete === expressOption.name && (
                                <div className="w-3.5 h-3.5 rounded-full bg-brand-600 flex items-center justify-center text-white shrink-0 ml-1">
                                  <Check className="w-2 h-2 stroke-[3.5]" />
                                </div>
                              )}
                            </button>
                          ) : (
                            <div className="flex items-center justify-center p-2.5 rounded-xl border border-dashed border-slate-200 h-[50px]">
                              <p className="text-[10px] text-slate-400 font-bold">Express</p>
                            </div>
                          )}

                          {/* 3. Botón Particular */}
                          {particularOption ? (
                            <button
                              key={particularOption.id}
                              type="button"
                              onClick={() => setFlete(particularOption.name)}
                              className={`flex items-center justify-between p-2.5 rounded-xl border text-left transition-all duration-200 cursor-pointer h-[50px] select-none ${
                                flete === particularOption.name
                                  ? 'border-brand-600 bg-brand-50/80 ring-2 ring-brand-600/40 shadow-sm scale-[1.01]'
                                  : 'border-slate-200 hover:border-slate-300 bg-white'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span className={`w-2.5 h-2.5 rounded-full border ${getFreightColor(particularOption.name)} flex-shrink-0`} />
                                <div className="min-w-0">
                                  <p className={`font-bold text-[10px] leading-tight ${flete === particularOption.name ? 'text-brand-900 font-extrabold' : 'text-slate-800'}`}>{particularOption.name}</p>
                                  <p className={`text-[8px] leading-tight truncate ${flete === particularOption.name ? 'text-brand-700/80 font-bold' : 'text-slate-400'}`}>{particularOption.description}</p>
                                </div>
                              </div>
                              {flete === particularOption.name && (
                                <div className="w-3.5 h-3.5 rounded-full bg-brand-600 flex items-center justify-center text-white shrink-0 ml-1">
                                  <Check className="w-2 h-2 stroke-[3.5]" />
                                </div>
                              )}
                            </button>
                          ) : (
                            <div className="flex items-center justify-center p-2.5 rounded-xl border border-dashed border-slate-200 h-[50px]">
                              <p className="text-[10px] text-slate-400 font-bold">Particular</p>
                            </div>
                          )}

                          {/* 4. Selector Zonal */}
                          <div
                            className={`relative flex items-center rounded-xl border transition-all duration-200 h-[50px] ${
                              isZonalActive
                                ? 'border-brand-600 bg-brand-50/80 ring-2 ring-brand-600/40 shadow-sm scale-[1.01]'
                                : 'border-slate-200 hover:border-slate-300 bg-white'
                            }`}
                          >
                            <span className="absolute left-2.5 w-2.5 h-2.5 rounded-full border bg-blue-500 border-blue-600 flex-shrink-0 pointer-events-none" />
                            <select
                              value={isZonalActive ? flete : ""}
                              onChange={e => setFlete(e.target.value)}
                              className={`w-full h-full bg-transparent pl-7 pr-8 font-bold text-[10px] outline-none cursor-pointer appearance-none ${
                                isZonalActive
                                  ? 'text-brand-900 font-extrabold'
                                  : 'text-slate-500 hover:text-slate-600'
                              }`}
                            >
                              <option value="">Zonal</option>
                              {zonalOptions.map(opt => (
                                <option key={opt.id} value={opt.name} className="text-slate-800 bg-white font-bold text-[10px]">
                                  {opt.name} {opt.description ? ` (${opt.description})` : ''}
                                </option>
                              ))}
                            </select>
                            {isZonalActive ? (
                              <div className="absolute right-2.5 w-3.5 h-3.5 rounded-full bg-brand-600 flex items-center justify-center text-white shrink-0 pointer-events-none">
                                <Check className="w-2 h-2 stroke-[3.5]" />
                              </div>
                            ) : (
                              <div className="absolute right-2.5 pointer-events-none text-slate-400">
                                <ChevronDown className="w-3.5 h-3.5" />
                              </div>
                            )}
                          </div>
                        </>
                      );
                    })()
                  )}
                </div>
                <input type="hidden" required value={flete} onChange={() => {}} />
              </div>
            </div>


            {/* Estado del Pedido (Solo en modo edición) */}
            {editingOrderId !== null && (
              <div className="space-y-4 md:col-span-2 lg:col-span-3 bg-slate-50/90 p-4 rounded-xl border border-slate-200/95 animate-in fade-in duration-200">
                <h3 className="flex items-center gap-1.5 font-black text-slate-800 border-b border-slate-200/60 pb-1.5 mb-3 text-xs uppercase tracking-wider">
                  ⚙️ Estado del Pedido
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase tracking-wider text-slate-400 font-bold">Estado del Pedido</label>
                    <select
                      value={orderStatus}
                      onChange={e => {
                        const val = e.target.value;
                        setOrderStatus(val);
                        if (val !== 'En Espera') {
                          setHoldReason("");
                          setHoldProductId("");
                        }
                      }}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-bold text-xs outline-none focus:ring-2 focus:ring-brand-500/10 focus:border-brand-500 transition-all cursor-pointer text-slate-800"
                    >
                      <option value="Pendiente">Pendiente</option>
                      <option value="En Espera">En Espera</option>
                      <option value="En Revisión">En Revisión</option>
                      <option value="Entregado">Entregado</option>
                      <option value="Cancelado">Cancelado</option>
                    </select>
                  </div>

                  {orderStatus === 'En Espera' && (
                    <>
                      <div className="space-y-1 animate-in fade-in duration-200">
                        <label className="text-[9px] font-black uppercase tracking-wider text-slate-400 font-bold">Motivo de Espera *</label>
                        <input
                          type="text"
                          required
                          value={holdReason}
                          onChange={e => setHoldReason(e.target.value)}
                          placeholder="Ej: Falta stock, postergado por el cliente"
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-bold text-xs outline-none focus:ring-2 focus:ring-brand-500/10 focus:border-brand-500 transition-all"
                        />
                      </div>
                      <div className="space-y-1 animate-in fade-in duration-200">
                        <label className="text-[9px] font-black uppercase tracking-wider text-slate-400 font-bold">Producto Faltante (Opcional)</label>
                        <select
                          value={holdProductId}
                          onChange={e => setHoldProductId(e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-bold text-xs outline-none focus:ring-2 focus:ring-brand-500/10 focus:border-brand-500 transition-all cursor-pointer text-slate-800"
                        >
                          <option value="">Ninguno / No especifica</option>
                          {products.map(p => (
                            <option key={p.id} value={p.id}>{p.name} {p.sku ? `(${p.sku})` : ''}</option>
                          ))}
                        </select>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Origen y Canal de Venta */}
            <div className="space-y-4 md:col-span-2 lg:col-span-3 bg-slate-50/90 p-4 rounded-xl border border-slate-200/95">
              <h3 className="flex items-center gap-1.5 font-black text-slate-800 border-b border-slate-200/60 pb-1.5 mb-3 text-xs uppercase tracking-wider">
                <Target className="w-4 h-4 text-brand-500" /> Origen y Canal de Venta
              </h3>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 items-start">
                {/* Código de Pedido Legacy */}
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Código de Pedido (Anterior)</label>
                  <input
                    type="text"
                    value={legacyCode}
                    readOnly
                    placeholder="Generando..."
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-100 text-slate-500 font-bold text-xs outline-none cursor-not-allowed select-all h-[34px]"
                  />
                </div>

                {/* Vendedor Asignado */}
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">
                    {role === 'admin' ? '👤 Vendedor Asignado' : '👤 Vendedor'}
                  </label>
                  {role === 'admin' && sellersList.length > 0 ? (
                    <select
                      value={selectedSellerId || currentUserId}
                      onChange={(e) => {
                        const newId = e.target.value;
                        setSelectedSellerId(newId);
                        generateNextLegacyCode(newId);
                      }}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-800 font-bold text-xs outline-none focus:ring-2 focus:ring-brand-500/10 focus:border-brand-500 transition-all cursor-pointer h-[34px]"
                    >
                      {sellersList.map((s) => (
                        <option key={s.id} value={s.id}>
                          👤 {s.full_name || s.email}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={currentSeller?.full_name || sellersList.find(s => s.id === (selectedSellerId || currentUserId))?.full_name || "Vendedor"}
                      readOnly
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-100 text-slate-700 font-bold text-xs outline-none cursor-not-allowed select-all h-[34px]"
                    />
                  )}
                </div>

                {/* Procedencia (Publicidad Meta por defecto) */}
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">
                    📢 Procedencia
                  </label>
                  <select
                    value={selectedAdvertisingSourceId}
                    onChange={(e) => setSelectedAdvertisingSourceId(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-800 font-bold text-xs outline-none focus:ring-2 focus:ring-brand-500/10 focus:border-brand-500 transition-all cursor-pointer h-[34px]"
                  >
                    {advertisingSources.filter(a => a.is_active !== false).map((source) => (
                      <option key={source.id} value={source.id}>
                        {source.name}
                      </option>
                    ))}
                  </select>
                  {/* Atajos rápidos de procedencia */}
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    {['Publicidad Meta', 'Cliente', 'Estados de WB', 'Recomendado', 'Otro'].map(name => {
                      const src = advertisingSources.find(a => a.name.toLowerCase() === name.toLowerCase());
                      const isSelected = src ? selectedAdvertisingSourceId === src.id : false;
                      return (
                        <button
                          key={name}
                          type="button"
                          onClick={() => {
                            if (src) setSelectedAdvertisingSourceId(src.id);
                          }}
                          className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-brand-600 text-white shadow-2xs'
                              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          {name}
                        </button>
                      );
                    })}
                  </div>
                </div>



                {/* Medio de Recepción Combobox */}
                <div className="space-y-1 relative" onClick={e => e.stopPropagation()}>
                  <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Medio de Recepción</label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Buscar medio de recepción..."
                      value={orderMediumSearchQuery}
                      onChange={e => {
                        setOrderMediumSearchQuery(e.target.value);
                        setShowOrderMediumDropdown(true);
                      }}
                      onFocus={() => {
                        setShowOrderMediumDropdown(true);
                        setOrderMediumSearchQuery("");
                      }}
                      onBlur={() => {
                        setTimeout(() => {
                          setShowOrderMediumDropdown(false);
                          const matched = orderMediums.find(m => m.id === selectedOrderMediumId);
                          if (matched) {
                            setOrderMediumSearchQuery(matched.name);
                          } else {
                            setOrderMediumSearchQuery("");
                          }
                        }, 200);
                      }}
                      className="w-full pl-2.5 pr-8 py-1.5 rounded-lg border border-slate-200 bg-white font-bold text-xs outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 transition-all cursor-pointer text-slate-800"
                    />
                    <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                    
                    {showOrderMediumDropdown && (
                      <div className="absolute left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg z-50 py-1">
                        {orderMediums.filter(med =>
                          med.name.toLowerCase().includes(orderMediumSearchQuery.toLowerCase())
                        ).length === 0 ? (
                          <p className="text-[10px] text-slate-400 font-bold p-2 text-center">No se encontraron medios</p>
                        ) : (
                          orderMediums
                            .filter(med =>
                              med.name.toLowerCase().includes(orderMediumSearchQuery.toLowerCase())
                            )
                            .map(med => (
                              <button
                                key={med.id}
                                type="button"
                                onMouseDown={() => {
                                  setSelectedOrderMediumId(med.id);
                                  setOrderMediumSearchQuery(med.name);
                                  setSelectedPhoneLineId("");
                                  setShowOrderMediumDropdown(false);
                                }}
                                className={`w-full px-2.5 py-1.5 text-left text-[10px] font-bold transition-all block ${
                                  selectedOrderMediumId === med.id
                                    ? 'bg-brand-50 text-brand-700 font-black'
                                    : 'text-slate-700 hover:bg-slate-50'
                                }`}
                              >
                                {med.name}
                              </button>
                            ))
                        )}
                      </div>
                    )}
                  </div>
                  {topOrderMediums.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {topOrderMediums.map(med => (
                        <button
                          key={med.id}
                          type="button"
                          onClick={() => {
                            setSelectedOrderMediumId(med.id);
                            setOrderMediumSearchQuery(med.name);
                            setSelectedPhoneLineId(""); // Reset phone line
                          }}
                          className={`px-2 py-0.5 rounded-md border text-[9.5px] font-extrabold transition-all duration-150 active:scale-95 cursor-pointer ${
                            selectedOrderMediumId === med.id
                              ? 'bg-brand-600 text-white border-brand-600 shadow-sm'
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-slate-800'
                          }`}
                        >
                          {med.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Línea Telefónica / Link de Whaticket (Estable) */}
                <div className="space-y-1 animate-in fade-in duration-200 relative">
                  {(() => {
                    const selectedMedium = orderMediums.find(m => m.id === selectedOrderMediumId);
                    
                    if (!selectedMedium) {
                      return (
                        <>
                          <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Detalle de Recepción</label>
                          <input 
                            key="medium-unselected"
                            type="text" 
                            disabled 
                            value=""
                            readOnly
                            placeholder="Seleccione medio..." 
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-400 font-bold text-xs outline-none cursor-not-allowed" 
                          />
                        </>
                      );
                    }
                    
                    if (!selectedMedium.requires_phone_line) {
                      if (selectedMedium.name.toLowerCase() === 'whaticket') {
                        return (
                          <>
                            <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">
                              Link de Whaticket
                            </label>
                            <input 
                              key="medium-whaticket"
                              type="url" 
                              value={whaticketLink || ""} 
                              onChange={e => setWhaticketLink(e.target.value)} 
                              placeholder="Pegar enlace de conversación..." 
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-bold text-xs outline-none focus:ring-2 focus:ring-brand-500/10 focus:border-brand-500 transition-all cursor-pointer text-slate-800" 
                            />
                          </>
                        );
                      }
                      return (
                        <>
                          <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Detalle de Recepción</label>
                          <input 
                            key="medium-no-data"
                            type="text" 
                            disabled 
                            value=""
                            readOnly
                            placeholder="No requiere datos" 
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-400 font-bold text-xs outline-none cursor-not-allowed" 
                          />
                        </>
                      );
                    }
                    
                    const effectiveSellerId = (role === 'admin' && selectedSellerId) ? selectedSellerId : currentUserId;
                    const facundoIds = ['3820a0fe-bb0a-4a84-ad85-79e49868cad7', '54b9ce55-7354-4b39-9886-314aa79f6aa6'];
                    const ludmilaIds = ['54b2d319-8f6f-47ff-b794-b7731978410a', '8207801b-b6cb-48cc-af0f-d2f9f2c98032'];
                    const targetSellerIds = facundoIds.includes(effectiveSellerId)
                      ? facundoIds
                      : (ludmilaIds.includes(effectiveSellerId) ? ludmilaIds : [effectiveSellerId]);

                    const filteredLines = phoneLines.filter(line => {
                      if (role === 'admin') return true;
                      const associatedSellerIds = (line.seller_phone_lines || []).map((spl: any) => spl.seller_id);
                      const isMine = associatedSellerIds.some(id => targetSellerIds.includes(id)) || (line.seller_id && targetSellerIds.includes(line.seller_id));
                      const isUnassigned = associatedSellerIds.length === 0 && !line.seller_id;
                      return isMine || isUnassigned;
                    });

                    return (
                      <>
                        <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Línea Telefónica</label>
                        {isOrganic && (
                          <button
                            type="button"
                            onClick={() => setShowLineManagerModal(true)}
                            className="absolute right-0 top-0 text-[9px] font-bold text-brand-600 hover:text-brand-700 underline flex items-center gap-0.5 cursor-pointer"
                          >
                            ⚙️ Administrar
                          </button>
                        )}
                        <select
                          value={selectedPhoneLineId}
                          onChange={e => setSelectedPhoneLineId(e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-bold text-xs outline-none focus:ring-2 focus:ring-brand-500/10 focus:border-brand-500 transition-all cursor-pointer text-slate-800"
                          required
                        >
                          <option value="">Seleccionar línea...</option>
                          {filteredLines.map(line => (
                            <option key={line.id} value={line.id}>{line.name} ({line.phone_number})</option>
                          ))}
                          <option value="otro">Otro</option>
                        </select>
                        {topPhoneLines.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {topPhoneLines
                              .filter(line => filteredLines.some(fl => fl.id === line.id))
                              .map(line => (
                                <button
                                  key={line.id}
                                  type="button"
                                  onClick={() => setSelectedPhoneLineId(line.id)}
                                  className={`px-2 py-0.5 rounded-md border text-[9.5px] font-extrabold transition-all duration-150 active:scale-95 cursor-pointer ${
                                    selectedPhoneLineId === line.id
                                      ? 'bg-brand-600 text-white border-brand-600 shadow-sm'
                                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-slate-800'
                                  }`}
                                >
                                  {line.name}
                                </button>
                              ))}
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>

                {/* Categoría del Pedido para Atribución de Marketing */}
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Categoría del Pedido</label>
                  <select
                    value={orderCategory}
                    onChange={e => setOrderCategory(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-bold text-xs outline-none focus:ring-2 focus:ring-brand-500/10 focus:border-brand-500 transition-all cursor-pointer text-slate-800"
                  >
                    <option value="auto">Auto-detectar ({detectedCategory})</option>
                    <option value="TANQUES">TANQUES</option>
                    <option value="TERMOTANQUES">TERMOTANQUES</option>
                    <option value="BIODIGESTOR">BIODIGESTOR</option>
                    <option value="BASE">BASE</option>
                    <option value="LATEX">LATEX</option>
                    <option value="ROLLO MEMBRANA">ROLLO MEMBRANA</option>
                    <option value="MEP">MEP</option>
                    <option value="ESCALERAS">ESCALERAS</option>
                    <option value="COLOMBRARO">COLOMBRARO</option>
                    <option value="HERRAMIENTAS ELÉCTRICAS">HERRAMIENTAS ELÉCTRICAS</option>
                    <option value="INSTALACIÓN BIOFORT">INSTALACIÓN BIOFORT</option>
                    <option value="OTRO">OTRO</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Sección Inferior de Dos Columnas Invertidas (Izquierda: Ítems y Flete | Derecha: Pagos y Totales) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:col-span-2 lg:col-span-3 pt-4 border-t border-slate-200/60">
              
              {/* Columna Izquierda: Detalle de Ítems, Flete e IVA */}
              <div className="space-y-4 bg-slate-50/90 p-4 rounded-xl border border-slate-200/95 h-fit">
                
                {/* TARJETA: DETALLE DE LO SOLICITADO */}
                <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <div className="flex items-center gap-2">
                      <h3 className="flex items-center gap-1.5 font-black text-slate-800 text-xs uppercase tracking-wider">
                        <Package className="w-4 h-4 text-brand-500" /> Detalle de lo Solicitado
                      </h3>
                      {totalOrderCount > 0 && (
                        <span className="text-[10px] font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full border border-slate-200 shadow-2xs">
                          {totalOrderCount} {totalOrderCount === 1 ? 'artículo' : 'artículos'}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setIsVisualModalOpen(true)}
                        className="px-2.5 py-1 bg-brand-50 hover:bg-brand-100 text-brand-700 rounded-lg text-[10.5px] font-black uppercase tracking-wider flex items-center gap-1 transition-colors border border-brand-200/60 cursor-pointer"
                        title="Abrir modal para agregar o modificar productos"
                      >
                        <Edit2 className="w-3 h-3" /> Modificar
                      </button>

                      {orderItems.length > 0 && (
                        <>
                          <button
                            type="button"
                            onClick={() => setIsOrderSummaryExpanded(!isOrderSummaryExpanded)}
                            className="px-2 py-1 text-slate-400 hover:text-slate-600 rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center gap-0.5 transition-colors cursor-pointer"
                            title={isOrderSummaryExpanded ? "Ocultar detalle" : "Mostrar detalle"}
                          >
                            {isOrderSummaryExpanded ? "Ocultar" : "Ver"}
                            {isOrderSummaryExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>

                          <button 
                            type="button"
                            onClick={() => {
                              if (confirm("¿Vaciar todos los artículos del pedido?")) {
                                setOrderItems([]);
                              }
                            }}
                            className="p-1 text-slate-300 hover:text-red-500 transition-colors cursor-pointer"
                            title="Vaciar pedido"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Estado vacío con botón para abrir modal */}
                  {orderItems.length === 0 ? (
                    <div 
                      onClick={() => setIsVisualModalOpen(true)}
                      className="p-6 border-2 border-dashed border-slate-300 hover:border-brand-500 bg-slate-50/50 hover:bg-brand-50/20 rounded-xl text-center cursor-pointer transition-all space-y-2.5 group"
                    >
                      <div className="w-11 h-11 rounded-full bg-white border border-slate-200 text-brand-600 flex items-center justify-center mx-auto group-hover:scale-110 transition-transform shadow-2xs">
                        <Package className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="font-black text-slate-800 text-xs uppercase tracking-wide">No seleccionaste productos aún</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">Abrí el selector para armar el pedido con kits y productos</p>
                      </div>
                      <button 
                        type="button" 
                        onClick={(e) => { e.stopPropagation(); setIsVisualModalOpen(true); }}
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-black transition-all shadow-sm cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" /> Seleccionar Productos y Kits
                      </button>
                    </div>
                  ) : isOrderSummaryExpanded ? (
                    /* Lista de productos seleccionados cuando está expandida (diseño compacto sin redundancia) */
                    <div className="flex flex-col gap-1.5 max-h-[380px] overflow-y-auto pr-1">
                      {/* BANNER DE SUGERENCIAS AUTOMÁTICAS DE BONIFICACIÓN (MEP x2, x3, x6, x12, etc.) */}
                      {discountSuggestions.length > 0 && (
                        <div className="space-y-1.5 mb-1">
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
                                {item.basePrice && item.basePrice > item.customPrice && (
                                  <span className="text-[10px] text-slate-400 line-through shrink-0">
                                    {formatPrice(item.basePrice)}
                                  </span>
                                )}
                              </div>

                              {/* Controles en línea compacta: [-] {qty} [+] | $ {precio} | %/$ | 🗑️ */}
                              <div className="flex items-center gap-1.5 shrink-0">
                                {/* Stepper compacto */}
                                <div className="flex items-center bg-slate-100 border border-slate-200 rounded-md overflow-hidden h-6.5">
                                  <button 
                                    type="button" 
                                    onClick={() => updateQuantity(item.id, item.quantity - 1)} 
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
                                    onClick={() => updateQuantity(item.id, item.quantity + 1)} 
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
                                    onChange={(e) => updateCustomPrice(item.id, Number(e.target.value))}
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
                                <button 
                                  type="button"
                                  onClick={() => removeItem(item.id)}
                                  className="text-slate-300 hover:text-red-500 p-1 rounded hover:bg-red-50 transition-colors cursor-pointer"
                                  title="Sacar del pedido"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>

                            {/* Sub-fila expandida para configurar descuento de este producto */}
                            {openItemDiscountIds[item.id] && (
                              <div className="bg-amber-50/70 border border-amber-200/90 rounded-md px-2 py-1.5 flex items-center justify-between gap-2 text-xs animate-in fade-in duration-150">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] font-bold text-amber-900">Desc. producto:</span>
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
                                </div>

                                <div className="flex items-center gap-2">
                                  <span className="text-[10.5px] text-amber-800 font-bold">
                                    {item.discountType === 'percentage'
                                      ? `(-${formatPrice(Math.round(((item.basePrice || item.price) * (item.discountValue || 0)) / 100))}/u)`
                                      : `(-${formatPrice(item.discountValue || 0)}/u)`}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      updateItemDiscount(item.id, 'percentage', 0);
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
                                onClick={() => updateQuantity(item.id, item.quantity - 1)} 
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
                                onClick={() => updateQuantity(item.id, item.quantity + 1)} 
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
                                onChange={(e) => updateCustomPrice(item.id, -Math.abs(Number(e.target.value)))}
                                className="w-16 text-xs font-bold text-right outline-none bg-transparent text-amber-900"
                                title="Monto del descuento unitario (editable)"
                              />
                            </div>

                            <span className="font-black text-xs text-amber-700 bg-amber-100/60 px-1.5 py-0.5 rounded border border-amber-200/60 min-w-[3.5rem] text-right">
                              -{formatPrice(Math.abs(item.customPrice * item.quantity))}
                            </span>

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
                    </div>
                  ) : (
                    /* Vista colapsada cuando isOrderSummaryExpanded es falso */
                    <div 
                      onClick={() => setIsOrderSummaryExpanded(true)}
                      className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between cursor-pointer hover:bg-slate-100 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-black">
                          📦
                        </span>
                        <div>
                          <p className="font-black text-xs text-slate-800">
                            {totalOrderCount} {totalOrderCount === 1 ? 'producto en pedido' : 'productos en pedido'}
                          </p>
                          <p className="text-[10.5px] text-emerald-600 font-extrabold">Subtotal: {formatPrice(subtotal)}</p>
                        </div>
                      </div>
                      <span className="text-[10px] font-extrabold uppercase text-slate-500 hover:text-slate-700 flex items-center gap-0.5">
                        Ver Detalle <ChevronDown className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  )}

                  {/* Footer de la tarjeta con subtotal y link a modal */}
                  {orderItems.length > 0 && isOrderSummaryExpanded && (
                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                      <button
                        type="button"
                        onClick={() => setIsVisualModalOpen(true)}
                        className="text-brand-600 hover:underline font-bold text-[11px] flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3 h-3" /> Agregar más productos
                      </button>
                      <div className="text-right">
                        <span className="text-[10px] font-bold text-slate-400 mr-1.5 uppercase">
                          {orderDiscountAmount > 0 ? "Subtotal Neto:" : "Subtotal Artículos:"}
                        </span>
                        <span className="font-black text-sm text-slate-900">{formatPrice(subtotal)}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Descuento al Total del Pedido, Flete e IVA */}
                <div className="space-y-2.5 pt-3 border-t border-slate-200/60">
                  
                  {/* Bloque Descuento al Total del Pedido */}
                  <div className="flex flex-col gap-2 p-2.5 bg-white rounded-xl border border-slate-200">
                    <div className="flex items-center justify-between">
                      <span className="text-[9.5px] font-black text-slate-700 uppercase tracking-wide flex items-center gap-1">
                        <Tag className="w-3.5 h-3.5 text-amber-600" /> Descuento al Total del Pedido
                      </span>
                      {orderDiscountAmount > 0 && (
                        <span className="text-[10.5px] font-black text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
                          -{formatPrice(orderDiscountAmount)}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      {/* Switch % / $ */}
                      <div className="flex items-center bg-slate-100 border border-slate-200 rounded-lg overflow-hidden text-xs shrink-0">
                        <button
                          type="button"
                          onClick={() => setOrderDiscountType('percentage')}
                          className={`px-2.5 py-1.5 font-black cursor-pointer transition-colors ${
                            orderDiscountType === 'percentage' ? 'bg-amber-500 text-white' : 'text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          %
                        </button>
                        <button
                          type="button"
                          onClick={() => setOrderDiscountType('fixed')}
                          className={`px-2.5 py-1.5 font-black cursor-pointer transition-colors ${
                            orderDiscountType === 'fixed' ? 'bg-amber-500 text-white' : 'text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          $
                        </button>
                      </div>

                      {/* Input numérico */}
                      <div className="relative flex-1">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">
                          {orderDiscountType === 'percentage' ? '%' : '$'}
                        </span>
                        <input
                          type="number"
                          value={orderDiscountValue === 0 ? "" : orderDiscountValue}
                          onChange={(e) => setOrderDiscountValue(Math.max(0, Number(e.target.value)))}
                          placeholder={orderDiscountType === 'percentage' ? "Ej: 10 para 10%" : "Ej: 15000"}
                          className="w-full pl-6 pr-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:ring-2 focus:ring-brand-500/10 focus:border-brand-500"
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

                    {/* Botones rápidos */}
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
                              : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-amber-50 hover:border-amber-300'
                          }`}
                        >
                          {pct}%
                        </button>
                      ))}
                    </div>

                    <p className="text-[9.5px] text-slate-400 font-medium italic pt-0.5">
                      💡 En planilla se registra como <strong>Descuento Compra Mayorista</strong> y los artículos van a precio de lista.
                    </p>
                  </div>
                  
                  {/* Costo de Envío / Flete */}
                  <div className="flex flex-col gap-1.5 p-2.5 bg-white rounded-xl border border-slate-200">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-black text-slate-600 uppercase tracking-wide">Costo de Flete</span>
                      <label className="flex items-center gap-1.5 cursor-pointer select-none">
                        <input 
                          type="checkbox" 
                          checked={isFreeShipping} 
                          onChange={(e) => {
                            setIsFreeShipping(e.target.checked);
                            if (e.target.checked) setShippingCost(0);
                          }}
                          className="w-3.5 h-3.5 rounded text-brand-600 focus:ring-brand-500/10 cursor-pointer"
                        />
                        <span className="text-[9px] font-bold text-slate-500">Envío Gratis</span>
                      </label>
                    </div>
                    {!isFreeShipping && (
                      <div className="relative animate-in fade-in duration-200">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">$</span>
                        <input 
                          type="number" 
                          value={shippingCost === 0 ? "" : shippingCost} 
                          onChange={(e) => setShippingCost(Math.max(0, Number(e.target.value)))} 
                          placeholder="Ingrese el costo de flete..."
                          className="w-full pl-5 pr-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:ring-2 focus:ring-brand-500/10 focus:border-brand-500"
                        />
                      </div>
                    )}
                  </div>

                  {/* Factura con IVA 21% */}
                  <label className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-slate-200 cursor-pointer select-none">
                    <span className="text-[9px] font-black text-slate-600 uppercase tracking-wide">Factura con IVA (+21%)</span>
                    <input 
                      type="checkbox" 
                      checked={includeIVA} 
                      onChange={(e) => setIncludeIVA(e.target.checked)} 
                      className="w-3.5 h-3.5 rounded text-brand-600 focus:ring-brand-500/10 cursor-pointer"
                    />
                  </label>
                </div>
              </div>

              {/* Columna Derecha: Detalle de Pagos, Financiación, Totales y Confirmación */}
              <div className="space-y-4 bg-slate-50/90 p-4 rounded-xl border border-slate-200/95 h-fit">

                {/* Métodos de Pago / Financiación */}
                <div className="flex items-center justify-between border-b border-slate-200/60 pb-1.5 mb-3">
                  <h3 className="flex items-center gap-1.5 font-black text-slate-800 text-xs uppercase tracking-wider">
                    <CreditCard className="w-4 h-4 text-brand-500" /> Detalle de Pagos y Financiación
                  </h3>
                  <button
                    type="button"
                    onClick={() => {
                      setPaymentsList(prev => [
                        ...prev,
                        {
                          id: Math.random().toString(36).substring(2, 9),
                          payment_method_id: "a3a890a8-b677-4b7b-8ffb-d36c2e7b5ad3",
                          amount: 0,
                          receipt_url: "",
                          notes: ""
                        }
                      ]);
                    }}
                    className="text-[9px] font-black text-brand-600 hover:text-brand-700 transition-colors flex items-center gap-1 uppercase tracking-wider cursor-pointer"
                  >
                    <Plus className="w-3 h-3" /> Agregar Pago
                  </button>
                </div>

                {/* Selector de Condición de Cobro */}
                <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-2.5 shadow-sm">
                  <div className="flex items-center justify-between flex-wrap gap-1.5">
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider">
                      ¿Cuándo / Cómo abona el cliente?
                    </span>
                    {paymentTiming === 'contra_entrega' && (
                      <span className="text-[10px] font-black text-red-600 bg-red-50 px-2 py-0.5 rounded-full border border-red-100 flex items-center gap-1">
                        ❌ A Cobrar en Domicilio (Pendiente)
                      </span>
                    )}
                    {paymentTiming === 'partial' && (
                      <span className="text-[10px] font-black text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100 flex items-center gap-1">
                        💵 Con Seña Previa (Señado)
                      </span>
                    )}
                    {paymentTiming === 'paid' && (
                      <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100 flex items-center gap-1">
                        ✅ Ya Abonado (100% Pagado)
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setPaymentTiming('contra_entrega');
                        setCustomDepositAmount(0);
                      }}
                      className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                        paymentTiming === 'contra_entrega'
                          ? 'bg-red-50/70 border-red-300 ring-2 ring-red-500/20 shadow-sm'
                          : 'bg-slate-50/60 border-slate-200 hover:bg-slate-100/80 text-slate-600'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <Home className={`w-3.5 h-3.5 ${paymentTiming === 'contra_entrega' ? 'text-red-600' : 'text-slate-400'}`} />
                        <span className={`text-xs font-black ${paymentTiming === 'contra_entrega' ? 'text-red-700' : 'text-slate-700'}`}>
                          En Domicilio
                        </span>
                      </div>
                      <p className="text-[9px] font-bold text-slate-400">Paga al recibir (100% impago)</p>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setPaymentTiming('partial');
                      }}
                      className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                        paymentTiming === 'partial'
                          ? 'bg-amber-50/70 border-amber-300 ring-2 ring-amber-500/20 shadow-sm'
                          : 'bg-slate-50/60 border-slate-200 hover:bg-slate-100/80 text-slate-600'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <DollarSign className={`w-3.5 h-3.5 ${paymentTiming === 'partial' ? 'text-amber-600' : 'text-slate-400'}`} />
                        <span className={`text-xs font-black ${paymentTiming === 'partial' ? 'text-amber-700' : 'text-slate-700'}`}>
                          Con Seña Previa
                        </span>
                      </div>
                      <p className="text-[9px] font-bold text-slate-400">Seña hoy + saldo en entrega</p>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setPaymentTiming('paid');
                        setCustomDepositAmount(total);
                      }}
                      className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                        paymentTiming === 'paid'
                          ? 'bg-emerald-50/70 border-emerald-300 ring-2 ring-emerald-500/20 shadow-sm'
                          : 'bg-slate-50/60 border-slate-200 hover:bg-slate-100/80 text-slate-600'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <CheckCircle2 className={`w-3.5 h-3.5 ${paymentTiming === 'paid' ? 'text-emerald-600' : 'text-slate-400'}`} />
                        <span className={`text-xs font-black ${paymentTiming === 'paid' ? 'text-emerald-700' : 'text-slate-700'}`}>
                          Ya Abonado
                        </span>
                      </div>
                      <p className="text-[9px] font-bold text-slate-400">100% abonado antes de enviar</p>
                    </button>
                  </div>

                  {paymentTiming === 'partial' && (
                    <div className="p-2.5 bg-amber-50/60 rounded-lg border border-amber-200/90 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 animate-in fade-in duration-200">
                      <div>
                        <span className="text-[10px] font-black text-amber-900 uppercase tracking-wider block">
                          Monto de Seña Cobrada Hoy:
                        </span>
                        <span className="text-[9px] font-bold text-amber-700">
                          Saldo restante a cobrar al entregar: <strong className="font-black">{formatPrice(pendingBalance)}</strong>
                        </span>
                      </div>
                      <div className="relative w-full sm:w-44">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">$</span>
                        <input
                          type="number"
                          value={customDepositAmount === 0 ? "" : customDepositAmount}
                          onChange={(e) => setCustomDepositAmount(Math.max(0, Number(e.target.value)))}
                          placeholder="Monto de seña..."
                          className="w-full pl-6 pr-2.5 py-1.5 border border-amber-300 rounded-lg text-xs font-black text-amber-900 outline-none focus:ring-2 focus:ring-amber-500/20 bg-white"
                        />
                      </div>
                    </div>
                  )}

                  {paymentTiming === 'contra_entrega' && (
                    <div className="p-2 bg-slate-100/80 rounded-lg border border-slate-200 text-[10px] font-bold text-slate-700 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1">
                      <span>El cliente abonará al fletero / repartidor al recibir el pedido.</span>
                      <span className="font-black text-red-600 whitespace-nowrap">
                        A cobrar en destino: {formatPrice(total)}
                      </span>
                    </div>
                  )}
                </div>

                <div className="space-y-3.5">
                  {paymentsWithSurcharges.map((p, idx) => (
                    <div key={p.id} className="p-3 bg-white rounded-xl border border-slate-200 space-y-2.5 relative group animate-in fade-in duration-200">
                      {paymentsList.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            setPaymentsList(prev => prev.filter(item => item.id !== p.id));
                          }}
                          className="absolute top-2 right-2 text-slate-400 hover:text-red-500 p-1.5 rounded-lg transition-colors cursor-pointer"
                          title="Eliminar este pago"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}

                      <div className="flex items-center gap-1.5">
                        <span className="bg-slate-100 text-slate-600 text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full">
                          Pago #{idx + 1}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {/* Selector de Medio de Pago */}
                        <div className="flex flex-col gap-1">
                          <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider">Medio de Pago</span>
                          <select
                            value={p.payment_method_id}
                            onChange={(e) => {
                              const val = e.target.value;
                              const pm = dbPaymentMethods.find(m => m.id === val);
                              setPaymentsList(prev => prev.map(item => {
                                if (item.id === p.id) {
                                  return {
                                    ...item,
                                    payment_method_id: val,
                                    card_surcharge: pm ? pm.surcharge_percentage : 0,
                                    card_installments: pm ? pm.installments : 1
                                  };
                                }
                                return item;
                              }));
                            }}
                            className="w-full px-2.5 py-1.5 text-xs font-bold border border-slate-200 rounded-lg outline-none bg-slate-50 text-slate-700 focus:ring-2 focus:ring-brand-500/10 focus:border-brand-500"
                          >
                            {activePaymentMethods.map(pm => (
                              <option key={pm.id} value={pm.id}>
                                {pm.name} {pm.surcharge_percentage > 0 ? `(+${pm.surcharge_percentage}% Recargo)` : ''}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Monto Base */}
                        <div className="flex flex-col gap-1">
                          <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider">
                            {paymentsList.length > 1 ? "Monto Base Asignado" : "Importe Base del Pedido"}
                          </span>
                          <div className="relative">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">$</span>
                            <input
                              type="number"
                              value={p.amount === 0 ? "" : p.amount}
                              onChange={(e) => {
                                const val = Math.max(0, Number(e.target.value));
                                setPaymentsList(prev => prev.map(item => item.id === p.id ? { ...item, amount: val } : item));
                              }}
                              placeholder={paymentsList.length === 1 ? `${p.baseAmount} (Total base)` : "Monto a abonar..."}
                              className="w-full pl-5 pr-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:ring-2 focus:ring-brand-500/10 focus:border-brand-500 bg-slate-50"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Configuración de Tarjeta Específica si corresponde */}
                      {p.isCard && (
                        <div className="bg-brand-50/50 p-2.5 rounded-lg border border-brand-100 flex flex-col sm:flex-row gap-3 items-center justify-between">
                          <div className="flex items-center gap-3 w-full sm:w-auto">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider whitespace-nowrap">Recargo %</span>
                              <input
                                type="number"
                                value={p.card_surcharge}
                                onChange={(e) => {
                                  const val = Number(e.target.value);
                                  setPaymentsList(prev => prev.map(item => item.id === p.id ? { ...item, card_surcharge: val } : item));
                                }}
                                className="w-12 px-1 py-0.5 text-[10px] font-bold border border-slate-200 rounded text-center outline-none bg-white text-slate-700"
                              />
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider whitespace-nowrap">Cuotas</span>
                              <input
                                type="number"
                                value={p.card_installments}
                                onChange={(e) => {
                                  const val = Number(e.target.value);
                                  setPaymentsList(prev => prev.map(item => item.id === p.id ? { ...item, card_installments: val } : item));
                                }}
                                className="w-12 px-1 py-0.5 text-[10px] font-bold border border-slate-200 rounded text-center outline-none bg-white text-slate-700"
                              />
                            </div>
                            {p.surchargeValue > 0 && (
                              <div className="text-[10px] font-extrabold text-red-600 whitespace-nowrap">
                                +{formatPrice(p.surchargeValue)}
                              </div>
                            )}
                          </div>
                          <div className="text-[10px] font-extrabold text-brand-700 whitespace-nowrap text-right">
                            Cobrar en terminal: <span className="text-xs font-black">{formatPrice(p.totalAmount)}</span>
                            {p.installments > 1 && (
                              <span className="block text-[9px] font-bold text-slate-500">
                                {p.installments} cuotas de {formatPrice(p.totalAmount / p.installments)}
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Comprobante de pago y notas */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-slate-100">
                        {/* Notas */}
                        <div className="flex flex-col gap-1">
                          <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider">Notas de Pago</span>
                          <input
                            type="text"
                            value={p.notes || ""}
                            onChange={(e) => {
                              const val = e.target.value;
                              setPaymentsList(prev => prev.map(item => item.id === p.id ? { ...item, notes: val } : item));
                            }}
                            placeholder="Ej: Seña inicial o Comentario..."
                            className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-[10px] font-bold outline-none focus:ring-2 focus:ring-brand-500/10 focus:border-brand-500"
                          />
                        </div>

                        {/* Comprobante */}
                        <div className="flex flex-col gap-1">
                          <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider">Comprobante de Pago</span>
                          <div className="flex items-center gap-2">
                            <label className="flex-1 flex items-center justify-center gap-1 py-1 border border-dashed border-slate-300 rounded-lg cursor-pointer bg-slate-50 hover:bg-slate-100 transition-colors text-slate-600">
                              <UploadCloud className="w-3.5 h-3.5 text-slate-400" />
                              <span className="text-[9px] font-extrabold">{uploadingReceipt ? "Subiendo..." : "Subir archivo"}</span>
                              <input
                                type="file"
                                accept="image/*,application/pdf"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) handlePaymentReceiptUpload(p.id, file);
                                }}
                                className="hidden"
                                disabled={uploadingReceipt}
                              />
                            </label>
                            {p.receipt_url && (
                              <a
                                href={p.receipt_url}
                                target="_blank"
                                rel="noreferrer"
                                className="p-1.5 bg-brand-50 text-brand-600 hover:bg-brand-100 rounded-lg transition-colors border border-brand-100 shrink-0"
                                title="Ver comprobante"
                              >
                                <FileText className="w-3.5 h-3.5" />
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Resumen de Pagos Registrados */}
                <div className="flex flex-col gap-2.5 p-2.5 bg-white rounded-xl border border-slate-200">
                  <span className="text-[9px] font-black text-slate-600 uppercase tracking-wide">Estado de Pago del Pedido</span>
                  <div className="flex items-center gap-2">
                    {paymentTiming === 'paid' ? (
                      <span className="px-2 py-1 rounded bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
                        <Check className="w-3 h-3 stroke-[3]" /> Completado (Abonado)
                      </span>
                    ) : paymentTiming === 'partial' ? (
                      <span className="px-2 py-1 rounded bg-amber-100 text-amber-800 text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
                        💵 Parcial (Señado)
                      </span>
                    ) : (
                      <span className="px-2 py-1 rounded bg-red-100 text-red-800 text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
                        ❌ A Cobrar en Domicilio (Pendiente)
                      </span>
                    )}
                  </div>
                  
                  <div className="pt-2 border-t border-slate-100 space-y-1.5">
                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-wide block">Desglose de Transacciones</span>
                    <div className="space-y-1 max-h-36 overflow-y-auto pr-0.5">
                      {paymentsWithSurcharges.map((p, idx) => {
                        const pm = dbPaymentMethods.find(m => m.id === p.payment_method_id);
                        return (
                          <div key={p.id} className="flex items-center justify-between text-[10px] text-slate-600 font-bold bg-slate-50 p-1.5 rounded border border-slate-100">
                            <span className="truncate max-w-[120px]">{pm?.name || "Efectivo/Transferencia"}</span>
                            <div className="flex items-center gap-1.5">
                              <span>{formatPrice(p.totalAmount)}</span>
                              {p.receipt_url && (
                                <a href={p.receipt_url} target="_blank" rel="noreferrer" className="text-brand-600 hover:text-brand-700">
                                  <FileText className="w-3 h-3" />
                                </a>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Vista de Totales */}
                <div className="bg-white p-3 rounded-xl border border-slate-200/60 space-y-2 mt-4">
                  <div className="flex justify-between text-xs font-bold text-slate-600">
                    <span>Subtotal Artículos</span>
                    <span>{formatPrice(itemsGrossSubtotal)}</span>
                  </div>
                  {orderDiscountAmount > 0 && (
                    <div className="flex justify-between text-xs font-black text-amber-600 bg-amber-50/70 p-1.5 rounded-lg border border-amber-200/70">
                      <span>Descuento Pedido ({orderDiscountType === 'percentage' ? `${orderDiscountValue}%` : 'Monto Fijo'})</span>
                      <span>-{formatPrice(orderDiscountAmount)}</span>
                    </div>
                  )}
                  {orderDiscountAmount > 0 && (
                    <div className="flex justify-between text-xs font-bold text-slate-700">
                      <span>Subtotal Neto</span>
                      <span>{formatPrice(subtotal)}</span>
                    </div>
                  )}
                  {totalSurcharges > 0 && (
                    <div className="flex justify-between text-xs font-bold text-red-600">
                      <span>Recargo Financiero</span>
                      <span>+{formatPrice(totalSurcharges)}</span>
                    </div>
                  )}
                  {shippingAmount > 0 && (
                    <div className="flex justify-between text-xs font-bold text-slate-600">
                      <span>Costo de Envío (Flete)</span>
                      <span>+{formatPrice(shippingAmount)}</span>
                    </div>
                  )}
                  {ivaAmount > 0 && (
                    <div className="flex justify-between text-xs font-bold text-slate-600">
                      <span>IVA (21%)</span>
                      <span>+{formatPrice(ivaAmount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-base font-black text-slate-900 pt-2 border-t border-slate-200">
                    <span>Total de Pedido</span>
                    <span>{formatPrice(total)}</span>
                  </div>

                  {paymentTiming === 'partial' && (
                    <>
                      <div className="flex justify-between text-xs font-bold text-emerald-600 pt-2 border-t border-slate-100">
                        <span>Seña Recibida Hoy</span>
                        <span>-{formatPrice(customDepositAmount)}</span>
                      </div>
                      <div className="flex justify-between text-sm font-black text-amber-700 pt-1">
                        <span>Saldo a Cobrar en Domicilio</span>
                        <span>{formatPrice(pendingBalance)}</span>
                      </div>
                    </>
                  )}

                  {paymentTiming === 'contra_entrega' && (
                    <div className="flex justify-between text-sm font-black text-red-600 pt-2 border-t border-slate-100">
                      <span>A Cobrar en Domicilio</span>
                      <span>{formatPrice(total)}</span>
                    </div>
                  )}

                  {paymentTiming === 'paid' && (
                    <div className="flex justify-between text-xs font-bold text-emerald-600 pt-2 border-t border-slate-100">
                      <span>Total Abonado</span>
                      <span>{formatPrice(total)} (Sin saldo pendiente)</span>
                    </div>
                  )}
                </div>

                {/* Botón de Confirmación y Resumen */}
                <div className="mt-4 pt-3 border-t border-slate-200/60">
                  <Button 
                    type="submit" 
                    disabled={submitting || orderItems.length === 0} 
                    className="w-full py-2.5 rounded-xl text-xs font-black flex items-center justify-center gap-1.5"
                  >
                    <Save className="w-4 h-4" /> Ver Resumen y Reservar Stock
                  </Button>
                </div>
              </div>

            </div>

          </div>
        </form>
      ) : (
        // List Tab
        <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden min-h-[400px]">
          <div className="p-3 bg-slate-50/50 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex flex-1 flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-wrap">
              <div className="relative flex-1 max-w-sm">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400">
                  <Search className="w-4 h-4" />
                </span>
                <input
                  type="text"
                  placeholder="Buscar pedido..."
                  value={orderSearchQuery}
                  onChange={(e) => setOrderSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-8 py-1.5 rounded-lg border border-slate-200 bg-white font-medium text-xs focus:ring-2 focus:ring-brand-500/10 outline-none"
                />
                {orderSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setOrderSearchQuery("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Filtro de Estado */}
              <div className="flex bg-slate-200/60 p-0.5 rounded-xl border border-slate-300/30 self-start sm:self-auto shrink-0 flex-wrap">
                {(['Pendientes', 'En Revisión', 'Entregados', 'Anulados', 'Todos'] as const).map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setStatusFilter(filter)}
                    className={`px-3 py-1.5 rounded-lg font-black text-[10px] uppercase tracking-wider transition-all cursor-pointer ${
                      statusFilter === filter
                        ? "bg-white text-brand-600 shadow-sm"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    {filter}
                  </button>
                ))}
              </div>

              {/* Filtro de Tipo de Cliente / Canal */}
              <div className="flex bg-slate-200/60 p-0.5 rounded-xl border border-slate-300/30 self-start sm:self-auto shrink-0">
                {([
                  { id: 'minoristas', label: 'Minoristas (B2C)' },
                  { id: 'mayoristas', label: 'Mayoristas (B2B) 👑' },
                  { id: 'todos', label: 'Todos los Canales' }
                ] as const).map((filter) => (
                  <button
                    key={filter.id}
                    type="button"
                    onClick={() => setClientTypeFilter(filter.id)}
                    className={`px-3 py-1.5 rounded-lg font-black text-[10px] uppercase tracking-wider transition-all cursor-pointer ${
                      clientTypeFilter === filter.id
                        ? "bg-white text-violet-700 shadow-sm"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>

              {/* Filtro de Vendedor */}
              {(role === 'admin' || sellersList.length > 0) && (
                <div className="relative shrink-0 w-full sm:w-48">
                  <select
                    value={sellerFilter}
                    onChange={(e) => setSellerFilter(e.target.value)}
                    className={`w-full px-3 py-1 rounded-xl border font-bold text-[10px] uppercase tracking-wider outline-none cursor-pointer transition-all h-[28px] ${
                      sellerFilter !== 'todos'
                        ? "bg-indigo-50 border-indigo-200 text-indigo-700 shadow-sm"
                        : "bg-white border-slate-200 text-slate-600 hover:text-slate-800"
                    }`}
                  >
                    <option value="todos">👤 Todos los Vendedores</option>
                    {sellersList.map((s) => (
                      <option key={s.id} value={s.id}>
                        👤 {s.full_name || s.email}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Filtro de Producto (Buscador Multi-selección) */}
              <div className="relative shrink-0 w-full sm:w-60">
                <button
                  type="button"
                  onClick={() => setShowProductDropdown(prev => !prev)}
                  className={`w-full px-3 py-1.5 rounded-xl border font-bold text-[10px] uppercase tracking-wider focus:ring-2 focus:ring-brand-500/10 outline-none cursor-pointer transition-all flex items-center justify-between gap-1.5 h-[28px] ${
                    selectedProducts.length > 0
                      ? "bg-brand-50 border-brand-200 text-brand-700"
                      : "bg-white border-slate-200 text-slate-600 hover:text-slate-800"
                  }`}
                >
                  <span className="truncate flex items-center gap-1">
                    📦 {selectedProducts.length === 0 
                      ? "Filtrar por Producto" 
                      : `Productos (${selectedProducts.length})`
                    }
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                </button>

                {showProductDropdown && (
                  <>
                    {/* Backdrop to close when clicking outside */}
                    <div 
                      className="fixed inset-0 z-40" 
                      onClick={() => {
                        setShowProductDropdown(false);
                        setProductSearchTerm("");
                      }} 
                    />
                    
                    {/* Popover */}
                    <div className="absolute left-0 mt-1 w-72 bg-white rounded-xl border border-slate-200 shadow-lg z-50 overflow-hidden flex flex-col max-h-[300px]">
                      {/* Search Bar inside popover */}
                      <div className="p-2 border-b border-slate-100 flex items-center gap-1.5 bg-slate-50/50">
                        <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <input
                          type="text"
                          placeholder="Buscar producto..."
                          value={productSearchTerm}
                          onChange={(e) => setProductSearchTerm(e.target.value)}
                          className="w-full bg-transparent text-xs outline-none border-none p-0.5 placeholder-slate-400 font-medium text-slate-700"
                          autoFocus
                        />
                        {productSearchTerm && (
                          <button
                            type="button"
                            onClick={() => setProductSearchTerm("")}
                            className="text-slate-400 hover:text-slate-600"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>

                      {/* Options List */}
                      <div className="overflow-y-auto py-1 max-h-[200px] divide-y divide-slate-50">
                        {filteredDropdownProducts.map(p => {
                          const isSelected = selectedProducts.includes(p.id);
                          return (
                            <label
                              key={p.id}
                              className="flex items-start gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer select-none transition-colors"
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => {
                                  if (isSelected) {
                                    setSelectedProducts(prev => prev.filter(id => id !== p.id));
                                  } else {
                                    setSelectedProducts(prev => [...prev, p.id]);
                                  }
                                }}
                                className="w-3.5 h-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-500/10 cursor-pointer mt-0.5"
                              />
                              <div className="flex flex-col min-w-0">
                                <span className={`text-[11px] font-semibold leading-tight break-words ${isSelected ? 'text-brand-700' : 'text-slate-600'}`}>
                                  {p.sku || p.name}
                                </span>
                              </div>
                            </label>
                          );
                        })}
                        
                        {filteredDropdownProducts.length === 0 && (
                          <div className="p-3 text-center text-slate-400 text-xs font-medium">
                            No se encontraron productos
                          </div>
                        )}
                      </div>

                      {/* Actions footer */}
                      {selectedProducts.length > 0 && (
                        <div className="p-1.5 border-t border-slate-100 flex items-center justify-end bg-slate-50/50">
                          <button
                            type="button"
                            onClick={() => setSelectedProducts([])}
                            className="px-2 py-1 text-[10px] font-bold text-red-600 hover:text-red-700 hover:bg-red-50 rounded uppercase tracking-wider transition-colors cursor-pointer"
                          >
                            Limpiar Selección
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Dropdown Vistas Personalizadas */}
              <div className="relative shrink-0 w-full sm:w-52">
                <button
                  type="button"
                  onClick={() => setShowCustomViewsDropdown(prev => !prev)}
                  className={`w-full px-3 py-1.5 rounded-xl border font-bold text-[10px] uppercase tracking-wider focus:ring-2 focus:ring-brand-500/10 outline-none cursor-pointer transition-all flex items-center justify-between gap-1.5 h-[28px] ${
                    currentActiveViewName
                      ? "bg-violet-50 border-violet-200 text-violet-700"
                      : hasActiveCustomFilters
                      ? "bg-amber-50 border-amber-200 text-amber-700"
                      : "bg-white border-slate-200 text-slate-600 hover:text-slate-800"
                  }`}
                >
                  <span className="truncate flex items-center gap-1.5">
                    <Eye className="w-3.5 h-3.5 text-violet-500 shrink-0" />
                    {currentActiveViewName || "Vistas Personalizadas"}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                </button>

                {showCustomViewsDropdown && (
                  <>
                    <div 
                      className="fixed inset-0 z-40" 
                      onClick={() => setShowCustomViewsDropdown(false)} 
                    />
                    <div className="absolute right-0 sm:left-0 mt-1 w-64 bg-white rounded-xl border border-slate-200 shadow-lg z-50 overflow-hidden flex flex-col">
                      <div className="p-2 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">
                          Vistas Guardadas
                        </span>
                        {hasActiveCustomFilters && (
                          <button
                            type="button"
                            onClick={resetAllFilters}
                            className="text-[9px] font-bold text-slate-400 hover:text-slate-600 uppercase cursor-pointer"
                          >
                            Restablecer
                          </button>
                        )}
                      </div>

                      <div className="max-h-[220px] overflow-y-auto divide-y divide-slate-50">
                        {customViews.length === 0 ? (
                          <div className="p-3 text-center text-slate-400 text-xs font-medium">
                            No tienes vistas guardadas.
                          </div>
                        ) : (
                          customViews.map(view => {
                            const isActive = currentActiveViewName === view.name;
                            return (
                              <div
                                key={view.id}
                                className={`flex items-center justify-between px-3 py-2 text-xs transition-colors hover:bg-slate-50 ${
                                  isActive ? "bg-violet-50/60 font-bold text-violet-700" : "text-slate-700"
                                }`}
                              >
                                <button
                                  type="button"
                                  onClick={() => applyCustomView(view)}
                                  className="flex-1 text-left truncate font-medium flex items-center gap-1.5 cursor-pointer"
                                >
                                  {isActive && <Check className="w-3.5 h-3.5 text-violet-600 shrink-0" />}
                                  <span className="truncate">{view.name}</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    deleteCustomView(view.id);
                                  }}
                                  className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors cursor-pointer"
                                  title="Eliminar vista"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            );
                          })
                        )}
                      </div>

                      <div className="p-2 border-t border-slate-100 bg-slate-50/50">
                        <button
                          type="button"
                          onClick={() => {
                            setShowCustomViewsDropdown(false);
                            setShowSaveViewModal(true);
                          }}
                          className="w-full py-1.5 bg-violet-600 hover:bg-violet-700 text-white font-bold text-[10px] uppercase tracking-wider rounded-lg transition-colors flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" /> Guardar Vista Actual
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Filtro por Fecha (Rango) */}
              <div className="relative shrink-0 w-full sm:w-48">
                <button
                  type="button"
                  onClick={() => setShowDateDropdown(prev => !prev)}
                  className={`w-full px-3 py-1.5 rounded-xl border font-bold text-[10px] uppercase tracking-wider focus:ring-2 focus:ring-brand-500/10 outline-none cursor-pointer transition-all flex items-center justify-between gap-1.5 h-[28px] ${
                    dateFrom || dateTo
                      ? "bg-blue-50 border-blue-200 text-blue-700"
                      : "bg-white border-slate-200 text-slate-600 hover:text-slate-800"
                  }`}
                >
                  <span className="truncate flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    {dateFrom && dateTo
                      ? `${formatDate(dateFrom)} - ${formatDate(dateTo)}`
                      : dateFrom
                      ? `Desde ${formatDate(dateFrom)}`
                      : dateTo
                      ? `Hasta ${formatDate(dateTo)}`
                      : "Filtrar por Fecha"
                    }
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                </button>

                {showDateDropdown && (
                  <>
                    <div 
                      className="fixed inset-0 z-40" 
                      onClick={() => setShowDateDropdown(false)} 
                    />
                    <div className="absolute right-0 sm:left-0 mt-1 w-64 bg-white rounded-xl border border-slate-200 shadow-lg z-50 p-3 flex flex-col gap-2.5">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                        <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">
                          Rango de Fechas
                        </span>
                        {(dateFrom || dateTo) && (
                          <button
                            type="button"
                            onClick={() => {
                              setDateFrom("");
                              setDateTo("");
                            }}
                            className="text-[9px] font-bold text-red-600 hover:text-red-700 uppercase cursor-pointer"
                          >
                            Limpiar
                          </button>
                        )}
                      </div>

                      {/* Presets rápidos */}
                      <div className="grid grid-cols-2 gap-1 text-[10px] font-bold">
                        <button
                          type="button"
                          onClick={() => {
                            const today = new Date().toISOString().split('T')[0];
                            setDateFrom(today);
                            setDateTo(today);
                          }}
                          className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors cursor-pointer text-center"
                        >
                          Hoy
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
                            setDateFrom(yesterday);
                            setDateTo(yesterday);
                          }}
                          className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors cursor-pointer text-center"
                        >
                          Ayer
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const today = new Date().toISOString().split('T')[0];
                            const last7 = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
                            setDateFrom(last7);
                            setDateTo(today);
                          }}
                          className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors cursor-pointer text-center"
                        >
                          Últimos 7 días
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const now = new Date();
                            const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
                            const today = now.toISOString().split('T')[0];
                            setDateFrom(firstDay);
                            setDateTo(today);
                          }}
                          className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors cursor-pointer text-center"
                        >
                          Este mes
                        </button>
                      </div>

                      {/* Inputs manuales */}
                      <div className="space-y-1.5 pt-1 border-t border-slate-100">
                        <div className="flex flex-col gap-0.5">
                          <label className="text-[9px] font-black uppercase text-slate-400">Desde</label>
                          <input
                            type="date"
                            value={dateFrom}
                            onChange={(e) => setDateFrom(e.target.value)}
                            className="w-full px-2 py-1 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 outline-none focus:ring-1 focus:ring-brand-500"
                          />
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <label className="text-[9px] font-black uppercase text-slate-400">Hasta</label>
                          <input
                            type="date"
                            value={dateTo}
                            onChange={(e) => setDateTo(e.target.value)}
                            className="w-full px-2 py-1 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 outline-none focus:ring-1 focus:ring-brand-500"
                          />
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  setEditingOrderId(null);
                  setOriginalDeliveryDate("");
                  setHasDeclaredPostponementReason(false);
                  setPostponementMotive("");
                  setPostponementReasonType('cliente');
                  setOrderItems([]);
                  setOrderDiscountType('fixed');
                  setOrderDiscountValue(0);
                  setOrderCategory("auto");
                  const effectiveSeller = (role === 'admin' && selectedSellerId) ? selectedSellerId : currentUserId;
                  if (effectiveSeller) {
                    generateNextLegacyCode(effectiveSeller);
                  }
                  setActiveTab('form');
                }}
                className="px-3.5 py-1.5 bg-brand-600 hover:bg-brand-700 text-white font-black rounded-lg text-xs shadow-sm transition-all flex items-center gap-1.5 shrink-0 cursor-pointer self-start sm:self-auto"
              >
                <Plus className="w-3.5 h-3.5" /> Nuevo Pedido
              </button>
            </div>
            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider hidden sm:block shrink-0">
              Mostrando {filteredOrders.length} de {orders.length} pedidos
            </div>
          </div>

          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200/80">
                  <th 
                    onClick={() => handleSort('order_date')}
                    className="px-3.5 py-2.5 text-[9px] font-black uppercase tracking-wider text-slate-400 cursor-pointer hover:bg-slate-100 select-none transition-colors whitespace-nowrap w-24"
                  >
                    <div className="flex items-center gap-1">
                      <span>Fecha</span>
                      {sortField === 'order_date' && (
                        <span className="text-[8px] text-brand-600 font-bold">{sortDirection === 'asc' ? '▲' : '▼'}</span>
                      )}
                    </div>
                  </th>
                  <th className="px-3.5 py-2.5 text-[9px] font-black uppercase tracking-wider text-slate-400 min-w-[200px]">Cliente</th>
                  <th 
                    onClick={() => handleSort('seller')}
                    className="px-3.5 py-2.5 text-[9px] font-black uppercase tracking-wider text-slate-400 cursor-pointer hover:bg-slate-100 select-none transition-colors whitespace-nowrap w-36"
                  >
                    <div className="flex items-center gap-1">
                      <span>Vendedor</span>
                      {sortField === 'seller' && (
                        <span className="text-[8px] text-brand-600 font-bold">{sortDirection === 'asc' ? '▲' : '▼'}</span>
                      )}
                    </div>
                  </th>
                  <th className="px-3.5 py-2.5 text-[9px] font-black uppercase tracking-wider text-slate-400 min-w-[180px]">Localidad & Zona</th>
                  <th className="px-3.5 py-2.5 text-[9px] font-black uppercase tracking-wider text-slate-400 text-center w-28 whitespace-nowrap">Estado</th>
                  <th className="px-3.5 py-2.5 text-[9px] font-black uppercase tracking-wider text-slate-400 text-right w-28 whitespace-nowrap">Total</th>
                  <th className="px-3 py-2.5 text-[9px] font-black uppercase tracking-wider text-slate-400 text-center w-20 whitespace-nowrap">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100/90 text-slate-700">
                {loadingOrders ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-slate-500 font-medium">
                      <div className="flex flex-col items-center justify-center gap-3">
                        <Loader2 className="w-8 h-8 text-brand-600 animate-spin" />
                        <span className="text-xs font-bold">Cargando listado de pedidos...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredOrders.length > 0 ? filteredOrders.map((p, i) => (
                  <tr key={p.id || i} className="hover:bg-blue-50/20 transition-colors group">
                    {/* Fecha */}
                    <td className="px-3.5 py-2 text-xs font-extrabold text-slate-700 whitespace-nowrap">
                      {formatDate(p.order_date || p.created_at)}
                    </td>

                    {/* Cliente */}
                    <td className="px-3.5 py-2">
                      <div className="font-bold text-slate-900 text-xs flex items-center gap-1.5 flex-wrap">
                        <span className="hover:text-brand-600 transition-colors cursor-default">{p.customer_name}</span>
                        {isOrderWholesale(p) && (
                          <span className="inline-flex items-center px-1.5 py-0.25 bg-purple-50 border border-purple-200 text-purple-700 rounded text-[7.5px] font-black uppercase tracking-wider shrink-0 shadow-2xs" title="Cliente Mayorista / Recurrente">
                            👑 Mayorista
                          </span>
                        )}
                        {p.legacy_code && (
                          <span className="inline-flex items-center px-1.5 py-0.25 bg-slate-100 border border-slate-200 text-slate-500 rounded text-[7.5px] font-black uppercase tracking-wider shrink-0 font-mono" title="Código de pedido anterior">
                            {p.legacy_code}
                          </span>
                        )}
                        {p.whaticket_link && (
                          <a 
                            href={p.whaticket_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.25 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 rounded text-[7.5px] font-black uppercase tracking-wider transition-all duration-150 shrink-0 hover:scale-105 active:scale-95"
                            title="Abrir conversación de Whaticket"
                            onClick={(e) => e.stopPropagation()}
                          >
                            Whaticket ↗
                          </a>
                        )}
                      </div>
                    </td>

                    {/* Vendedor con Color Específico */}
                    <td className="px-3.5 py-2 whitespace-nowrap">
                      {(() => {
                        const sellerName = p.sellers?.full_name || p.totals?.seller || "Desconocido";
                        const style = getSellerBadgeStyle(sellerName);
                        return (
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10.5px] font-bold border ${style.bg} ${style.text} ${style.border} shadow-2xs`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${style.dot} shrink-0`} />
                            <span className="truncate max-w-[120px]">{sellerName}</span>
                          </span>
                        );
                      })()}
                    </td>

                    {/* Localidad & Zona Compacta */}
                    <td className="px-3.5 py-2">
                      <div className="flex items-center gap-1.5 flex-wrap leading-tight">
                        <span className="text-xs font-bold text-slate-700">{p.locality || "Sin Localidad"}</span>
                        {(() => {
                          const zoneName = p.zones ? (Array.isArray(p.zones) ? p.zones[0]?.name : p.zones.name) : null;
                          if (zoneName) {
                            return (
                              <span className="text-[8px] font-black text-brand-600 bg-brand-50 border border-brand-200/70 px-1.5 py-0.25 rounded uppercase tracking-wider shrink-0">
                                {zoneName}
                              </span>
                            );
                          }
                          return null;
                        })()}
                      </div>
                      {p.freight_type && (
                        <div className="flex items-center gap-1 text-[8.5px] text-slate-400 font-bold mt-0.5 leading-none">
                          <span className={`w-1.5 h-1.5 rounded-full border ${getFreightColor(p.freight_type)} shrink-0`} />
                          <span>Entrega {p.freight_type}</span>
                        </div>
                      )}
                    </td>

                    {/* Estado */}
                    <td className="px-3.5 py-2 text-center whitespace-nowrap">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-[8.5px] font-black uppercase tracking-wider shadow-2xs ${
                        p.status === 'Entregado' ? 'text-emerald-700 bg-emerald-50 border border-emerald-200' : 
                        p.status === 'Entregando' ? 'text-amber-700 bg-amber-50 border border-amber-200' :
                        p.status === 'Pendiente' ? 'text-orange-700 bg-orange-50 border border-orange-200' : 
                        p.status === 'En Espera' ? 'text-amber-700 bg-amber-50 border border-amber-200 font-extrabold animate-pulse' : 
                        p.status === 'En Revisión' ? 'text-rose-700 bg-rose-50 border border-rose-200 font-black animate-pulse' :
                        'text-blue-700 bg-blue-50 border border-blue-200'
                      }`}>
                        {p.status}
                      </span>
                    </td>

                    {/* Total */}
                    <td className="px-3.5 py-2 text-xs font-black text-slate-900 text-right whitespace-nowrap font-mono">
                      {formatPrice(p.total_amount)}
                    </td>

                    {/* Acciones (Solo Íconos) */}
                    <td className="px-3 py-2 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleEditOrder(p)}
                          className="p-1.5 bg-slate-50 hover:bg-brand-600 text-slate-500 hover:text-white rounded-lg border border-slate-200 hover:border-brand-600 transition-all duration-150 active:scale-90 shadow-2xs cursor-pointer"
                          title="Editar Pedido"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCloneOrder(p)}
                          className="p-1.5 bg-slate-50 hover:bg-blue-600 text-slate-500 hover:text-white rounded-lg border border-slate-200 hover:border-blue-600 transition-all duration-150 active:scale-90 shadow-2xs cursor-pointer"
                          title="Duplicar / Cargar como Nuevo Pedido"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSyncExistingOrderToSheet(p)}
                          disabled={syncingOrderId === p.id}
                          className={`p-1.5 bg-slate-50 hover:bg-emerald-600 text-slate-500 hover:text-white rounded-lg border border-slate-200 hover:border-emerald-600 transition-all duration-150 active:scale-90 shadow-2xs cursor-pointer ${
                            syncingOrderId === p.id ? 'opacity-50 cursor-not-allowed' : ''
                          }`}
                          title={p.legacy_code ? `Re-enviar a Planilla (Código actual: ${p.legacy_code})` : "Sincronizar a Planilla Google Sheets"}
                        >
                          <FileSpreadsheet className={`w-3.5 h-3.5 ${syncingOrderId === p.id ? 'animate-spin text-emerald-600' : ''}`} />
                        </button>
                        {role === 'admin' && (
                          <button
                            type="button"
                            onClick={async () => {
                              if (!confirm(`¿Estás seguro de que deseas eliminar permanentemente el pedido de "${p.customer_name}"? Esta acción no se puede deshacer.`)) return;

                              let deleteClient = false;
                              if (p.client_id) {
                                try {
                                  const { data: otherOrders } = await supabase
                                    .from('orders')
                                    .select('id')
                                    .eq('client_id', p.client_id)
                                    .neq('id', p.id)
                                    .limit(1);

                                  if (!otherOrders || otherOrders.length === 0) {
                                    deleteClient = confirm(
                                      `El cliente "${p.customer_name}" no tiene ningún otro pedido registrado en el sistema.\n\n¿Deseas eliminar también al cliente y sus datos asociados?`
                                    );
                                  }
                                } catch (chkErr) {
                                  console.warn("Error al consultar pedidos del cliente:", chkErr);
                                }
                              }

                              try {
                                const res = await fetch('/api/vendedores/delete-order', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({
                                    orderId: p.id,
                                    deleteClient
                                  })
                                });

                                const resData = await res.json();
                                if (!res.ok || !resData.success) {
                                  throw new Error(resData.error || 'Error al eliminar pedido');
                                }

                                setOrders(prev => prev.filter(o => o.id !== p.id));
                                if (resData.clientWasDeleted && p.client_id) {
                                  setClients(prev => prev.filter(c => c.id !== p.client_id));
                                }

                                alert(
                                  resData.clientWasDeleted
                                    ? `Pedido y cliente "${p.customer_name}" eliminados con éxito.`
                                    : `Pedido de "${p.customer_name}" eliminado con éxito.`
                                );
                              } catch (err: any) {
                                alert(`Error al eliminar pedido: ${err.message || err.details || 'Error desconocido'}`);
                              }
                            }}
                            className="p-1.5 bg-slate-50 hover:bg-red-600 text-slate-400 hover:text-white rounded-lg border border-slate-200 hover:border-red-600 transition-all duration-150 active:scale-90 shadow-2xs cursor-pointer"
                            title="Eliminar Pedido"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-400 font-bold text-xs">No se encontraron pedidos.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Summary Modal */}
      {showSummaryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-3xl">
              <div>
                <h2 className="text-xl font-black text-slate-900">Resumen y Reserva de Stock</h2>
                <p className="text-sm font-medium text-slate-500">Confirmá que los datos de entrega y cobro sean correctos.</p>
              </div>
              <button onClick={() => setShowSummaryModal(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-500">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-6 flex-1">
               {/* Resumen Cliente y Envío */}
               <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Cliente</p>
                    <p className="font-bold text-slate-900">{cliente || newClientName}</p>
                    <p className="text-slate-600 mt-1">{direccion}</p>
                    {aclaraciones && (
                      <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200/60 rounded px-1.5 py-0.5 mt-1.5 font-bold w-fit">
                        💡 Aclaración: {aclaraciones}
                      </p>
                    )}
                  </div>
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Fechas del Pedido / Entrega</p>
                     <p className="font-bold text-slate-900 text-xs">Fecha Pedido: {formatDate(fechaPedido)}</p>
                     <p className="font-bold text-slate-900 text-xs">Entrega: {formatDate(entregaInicial)} a {formatDate(entregaMaxima)}</p>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Tipo de Entrega</p>
                    <p className="font-bold text-slate-900 flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full border ${getFreightColor(flete)}`} />
                      <span>{flete}</span>
                    </p>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Cobro</p>
                    <p className="font-bold text-slate-900">{selectedPaymentMethod?.name}</p>
                  </div>
                  
                  {/* Origen y Recepción en Resumen */}
                  {(legacyCode || selectedAdvertisingSourceId || selectedOrderMediumId || deliveryDetail) && (
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 col-span-2">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Origen y Recepción</p>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        {legacyCode && (
                          <p className="font-bold text-slate-700">
                            Código Anterior: <span className="font-black text-slate-900">{legacyCode}</span>
                          </p>
                        )}
                        {selectedAdvertisingSourceId && (
                          <p className="font-bold text-slate-700">
                            Procedencia: <span className="font-black text-slate-900">
                              {advertisingSources.find(s => s.id === selectedAdvertisingSourceId)?.name}
                            </span>
                          </p>
                        )}
                        {selectedOrderMediumId && (
                          <p className="font-bold text-slate-700">
                            Medio: <span className="font-black text-slate-900">
                              {orderMediums.find(m => m.id === selectedOrderMediumId)?.name}
                              {(() => {
                                if (selectedPhoneLineId === 'otro') return " (Otro)";
                                const line = phoneLines.find(l => l.id === selectedPhoneLineId);
                                return line ? ` (${line.name} - ${line.phone_number})` : "";
                              })()}
                            </span>
                          </p>
                        )}
                        {deliveryDetail && (
                          <p className="font-bold text-slate-700 col-span-2">
                            Detalle de Entrega: <span className="font-medium text-slate-900">{deliveryDetail}</span>
                          </p>
                        )}
                      </div>
                    </div>
                  )}
               </div>

               {/* Resumen Productos */}
               <div>
                  <h3 className="font-black text-slate-900 mb-3 border-b border-slate-100 pb-2">Artículos a Reservar ({orderItems.length})</h3>
                  <div className="space-y-3">
                    {orderItems.map((item, idx) => {
                      const rawSku = (item.sku || "").trim();
                      const isAutoSku = rawSku.toUpperCase().startsWith("AUTO-") || rawSku.toUpperCase().startsWith("AUTO_");
                      const displayName = (rawSku && !isAutoSku) ? rawSku : item.name;
                      return (
                        <div key={`${item.id}-${idx}`} className="flex justify-between items-center text-sm">
                          <div className="flex items-center gap-2">
                             <span className="font-black text-slate-400">{item.quantity}x</span>
                             <span className="font-bold text-slate-700">{displayName}</span>
                          </div>
                          <span className="font-bold text-slate-900">{formatPrice(item.customPrice * item.quantity)}</span>
                        </div>
                      );
                    })}
                  </div>
               </div>

               {/* Resumen Totales */}
               <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-2">
                 <div className="flex justify-between text-sm font-bold text-slate-600">
                   <span>Subtotal Artículos</span>
                   <span>{formatPrice(itemsGrossSubtotal)}</span>
                 </div>
                 {orderDiscountAmount > 0 && (
                   <div className="flex justify-between text-sm font-black text-amber-600 bg-amber-50 p-1.5 rounded-lg border border-amber-200">
                     <span>Descuento Pedido ({orderDiscountType === 'percentage' ? `${orderDiscountValue}%` : 'Monto Fijo'})</span>
                     <span>-{formatPrice(orderDiscountAmount)}</span>
                   </div>
                 )}
                 {orderDiscountAmount > 0 && (
                   <div className="flex justify-between text-sm font-bold text-slate-700">
                     <span>Subtotal Neto</span>
                     <span>{formatPrice(subtotal)}</span>
                   </div>
                 )}
                 {surcharge > 0 && (
                   <div className="flex justify-between text-sm font-bold text-red-500">
                     <span>Recargo Financiero ({selectedPaymentMethod?.surcharge_percentage}%)</span>
                     <span>+{formatPrice(surcharge)}</span>
                   </div>
                 )}
                 {shippingAmount > 0 && (
                   <div className="flex justify-between text-sm font-bold text-slate-600">
                     <span>Costo de Envío (Flete)</span>
                     <span>+{formatPrice(shippingAmount)}</span>
                   </div>
                 )}
                 {ivaAmount > 0 && (
                   <div className="flex justify-between text-sm font-bold text-slate-600">
                     <span>IVA (21%)</span>
                     <span>+{formatPrice(ivaAmount)}</span>
                   </div>
                 )}
                 <div className="flex justify-between text-xl font-black text-slate-900 pt-2 border-t border-slate-200">
                   <span>Total de Venta</span>
                   <span>{formatPrice(total)}</span>
                 </div>
                 {hasDeposit && (
                   <>
                     <div className="flex justify-between text-sm font-bold text-emerald-600 pt-2 border-t border-slate-200">
                       <span>Seña Recibida</span>
                       <span>-{formatPrice(depositAmount)}</span>
                     </div>
                     {depositReceiptUrl && (
                       <div className="flex justify-end text-[10px] text-brand-600 font-bold underline">
                         <a href={depositReceiptUrl} target="_blank" rel="noopener noreferrer">
                           Ver Comprobante de Seña
                         </a>
                       </div>
                     )}
                     <div className="flex justify-between text-base font-black text-brand-700 pt-1">
                       <span>Saldo Pendiente</span>
                       <span>{formatPrice(pendingBalance)}</span>
                     </div>
                   </>
                 )}
               </div>
            </div>

            <div className="p-6 border-t border-slate-100 bg-white rounded-b-3xl flex justify-end gap-3">
               <button 
                 onClick={() => setShowSummaryModal(false)}
                 className="px-6 py-3 rounded-xl font-bold text-slate-600 hover:bg-slate-100 transition-colors"
               >
                 Volver
               </button>
               <Button onClick={confirmAndSubmit} disabled={submitting} className="px-8 py-3 rounded-xl font-black flex items-center gap-2">
                 {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
                 {submitting ? "Confirmando y Reservando..." : "Enviar a Preparación"}
               </Button>
            </div>
          </div>
        </div>
      )}

      {/* Postponement Reason Modal */}
      {showPostponementModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md flex flex-col animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-3xl">
              <div>
                <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider">Reprogramación de Entrega</h2>
                <p className="text-[10px] font-bold text-slate-500 mt-0.5">Por favor, registra el motivo por el cual se pospone la fecha.</p>
              </div>
              <button 
                onClick={() => {
                  setShowPostponementModal(false);
                  setHasDeclaredPostponementReason(false);
                }} 
                className="p-1.5 hover:bg-slate-200 rounded-full transition-colors text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <span className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">Clasificación del Retraso</span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPostponementReasonType('cliente')}
                    className={`py-3 px-4 rounded-xl border text-xs font-black uppercase tracking-wider transition-all flex flex-col items-center gap-1 cursor-pointer ${
                      postponementReasonType === 'cliente'
                        ? 'border-brand-500 bg-brand-50/50 text-brand-700 shadow-sm'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    👤 Temas del Cliente
                    <span className="text-[9px] font-bold text-slate-400 lowercase italic normal-case">no está, reprogramó él, etc.</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPostponementReasonType('empresa')}
                    className={`py-3 px-4 rounded-xl border text-xs font-black uppercase tracking-wider transition-all flex flex-col items-center gap-1 cursor-pointer ${
                      postponementReasonType === 'empresa'
                        ? 'border-brand-500 bg-brand-50/50 text-brand-700 shadow-sm'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    🚚 Temas de Empresa / Logística
                    <span className="text-[9px] font-bold text-slate-400 lowercase italic normal-case">falta stock, camión lleno, etc.</span>
                  </button>
                </div>
              </div>

              <div>
                <span className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">Detalle / Observación</span>
                <textarea
                  value={postponementMotive}
                  onChange={(e) => setPostponementMotive(e.target.value)}
                  placeholder="Ej: El cliente no tenía fondos y pidió pasar el lunes..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none h-24 bg-white"
                />
              </div>
            </div>

            <div className="p-6 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-2 rounded-b-3xl">
              <button
                type="button"
                onClick={() => {
                  setShowPostponementModal(false);
                  setHasDeclaredPostponementReason(false);
                }}
                className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!postponementMotive.trim()) {
                    alert("Por favor, ingresá una observación para el retraso.");
                    return;
                  }
                  setShowPostponementModal(false);
                  setHasDeclaredPostponementReason(true);
                  setTimeout(() => {
                    confirmAndSubmit();
                  }, 50);
                }}
                className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-xl text-xs shadow-md shadow-brand-500/10 transition-all cursor-pointer"
              >
                Confirmar Reprogramación
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Phone Line Manager Modal (Organic Sellers) */}
      {showLineManagerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/55 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border border-slate-200/85 shadow-2xl max-w-md w-full p-6 space-y-5 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="flex items-center gap-2 font-black text-slate-800 text-xs uppercase tracking-wider">
                <Phone className="w-5 h-5 text-brand-500" />
                Mis Líneas de Recepción
              </h3>
              <button 
                type="button" 
                onClick={() => {
                  setShowLineManagerModal(false);
                  setNewLineName("");
                  setNewLineNumber("");
                }}
                className="text-slate-400 hover:text-slate-600 transition-colors p-1 hover:bg-slate-50 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* List of existing lines */}
            <div className="space-y-2">
              <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Líneas Registradas</p>
              <div className="max-h-36 overflow-y-auto border border-slate-100 rounded-xl divide-y divide-slate-100 bg-slate-50/50">
                {phoneLines.filter(line => line.seller_id === currentUserId).length === 0 ? (
                  <p className="text-[10px] text-slate-400 font-bold p-3 text-center">No tenés líneas registradas.</p>
                ) : (
                  phoneLines
                    .filter(line => line.seller_id === currentUserId)
                    .map(line => (
                      <div key={line.id} className="flex items-center justify-between p-2.5 text-xs font-bold text-slate-700">
                        <div>
                          <p className="font-extrabold text-slate-800">{line.name}</p>
                          <p className="text-[10px] text-slate-400 font-semibold">{line.phone_number}</p>
                        </div>
                        <button
                          type="button"
                          onClick={async () => {
                            if (!confirm(`¿Eliminar la línea "${line.name}"?`)) return;
                            try {
                              const { error } = await supabase
                                .from('phone_lines')
                                .delete()
                                .eq('id', line.id);
                              if (error) throw error;
                              await fetchPhoneLines();
                            } catch (err: any) {
                              alert(`Error al eliminar: ${err.message || err.details}`);
                            }
                          }}
                          className="p-1.5 bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 rounded-lg text-xs transition-all active:scale-95 flex-shrink-0"
                          title="Eliminar línea"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                )}
              </div>
            </div>

            {/* Add new line form */}
            <div className="border-t border-slate-100 pt-4 space-y-3">
              <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Agregar Nueva Línea</p>
              
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[8px] font-black uppercase tracking-wider text-slate-400">Etiqueta/Nombre</label>
                  <input
                    type="text"
                    value={newLineName}
                    onChange={e => setNewLineName(e.target.value)}
                    placeholder="Ej. Línea 1"
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-bold text-xs outline-none focus:ring-2 focus:ring-brand-500/10 focus:border-brand-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[8px] font-black uppercase tracking-wider text-slate-400">Número de Teléfono</label>
                  <input
                    type="text"
                    value={newLineNumber}
                    onChange={e => setNewLineNumber(e.target.value)}
                    placeholder="Ej. 11 5544 3322"
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-bold text-xs outline-none focus:ring-2 focus:ring-brand-500/10 focus:border-brand-500"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={async () => {
                  if (!newLineName.trim() || !newLineNumber.trim()) {
                    alert("Completá el nombre y el número.");
                    return;
                  }
                  setSavingLine(true);
                  try {
                    const { data, error } = await supabase
                      .from('phone_lines')
                      .insert({
                        name: newLineName.trim(),
                        phone_number: newLineNumber.trim(),
                        seller_id: currentUserId
                      })
                      .select()
                      .single();
                    if (error) throw error;
                    
                    setNewLineName("");
                    setNewLineNumber("");
                    await fetchPhoneLines();
                  } catch (err: any) {
                    alert(`Error al guardar: ${err.message || err.details}`);
                  } finally {
                    setSavingLine(false);
                  }
                }}
                disabled={savingLine || !newLineName.trim() || !newLineNumber.trim()}
                className="w-full py-2 bg-brand-600 hover:bg-brand-700 disabled:bg-slate-100 disabled:text-slate-400 text-white font-bold rounded-xl text-xs transition-all active:scale-98 shadow-md shadow-brand-500/10 flex items-center justify-center gap-1"
              >
                {savingLine ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                {savingLine ? "Guardando..." : "Agregar Línea"}
              </button>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setShowLineManagerModal(false);
                  setNewLineName("");
                  setNewLineNumber("");
                }}
                className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 font-bold rounded-xl text-xs transition-all active:scale-98"
              >
                Cerrar
              </button>
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

      {/* Modal Guardar Vista Personalizada */}
      {showSaveViewModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-black text-sm text-slate-800 flex items-center gap-2">
                <Save className="w-4 h-4 text-violet-600" />
                Guardar Vista Personalizada
              </h3>
              <button
                type="button"
                onClick={() => {
                  setShowSaveViewModal(false);
                  setNewViewName("");
                }}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-500 mb-3">
              Asigna un nombre a esta combinación de filtros activa para acceder a ella rápidamente en cualquier momento.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">
                  Nombre de la vista
                </label>
                <input
                  type="text"
                  placeholder="Ej: Mayoristas Pendientes"
                  value={newViewName}
                  onChange={(e) => setNewViewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      saveCustomView(newViewName);
                    }
                  }}
                  autoFocus
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 outline-none"
                />
              </div>

              <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 text-[10px] text-slate-500 space-y-1">
                <div className="font-bold text-slate-700 mb-1 uppercase tracking-wider">Filtros incluidos:</div>
                <div>• Estado: <span className="font-semibold text-slate-800">{statusFilter}</span></div>
                <div>• Cliente: <span className="font-semibold text-slate-800">{clientTypeFilter}</span></div>
                {selectedProducts.length > 0 && (
                  <div>• Productos: <span className="font-semibold text-slate-800">{selectedProducts.length} seleccionados</span></div>
                )}
                {orderSearchQuery && (
                  <div>• Búsqueda: <span className="font-semibold text-slate-800">"{orderSearchQuery}"</span></div>
                )}
                {(dateFrom || dateTo) && (
                  <div>• Fechas: <span className="font-semibold text-slate-800">{dateFrom ? formatDate(dateFrom) : 'Inicio'} a {dateTo ? formatDate(dateTo) : 'Hoy'}</span></div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setShowSaveViewModal(false);
                    setNewViewName("");
                  }}
                  className="text-xs font-bold text-slate-500 cursor-pointer"
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  onClick={() => saveCustomView(newViewName)}
                  disabled={!newViewName.trim()}
                  className="bg-violet-600 hover:bg-violet-700 text-white font-bold text-xs px-4 py-2 rounded-xl cursor-pointer"
                >
                  Guardar Vista
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CARGAR DESDE PEDIDO EN BD */}
      {showLoadFromDbModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-100 flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="p-4 border-b border-slate-100 flex items-center justify-between shrink-0 bg-slate-50/50 rounded-t-2xl">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-2xs">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-sm">Cargar Pedido desde Base de Datos</h3>
                  <p className="text-[11px] text-slate-400 font-medium">Reutiliza, reintenta o sincroniza un pedido existente registrado en el sistema.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowLoadFromDbModal(false)}
                className="p-1.5 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Search filter */}
            <div className="p-3 border-b border-slate-100 shrink-0 bg-white">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Buscar por cliente, código anterior, localidad..."
                  value={loadFromDbSearch}
                  onChange={(e) => setLoadFromDbSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                />
              </div>
            </div>

            {/* List */}
            <div className="p-4 overflow-y-auto flex-1 divide-y divide-slate-100 space-y-3">
              {loadingDbOrders ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2">
                  <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
                  <span className="text-xs font-semibold">Cargando pedidos de la base de datos...</span>
                </div>
              ) : recentDbOrders.filter(o => {
                  if (!loadFromDbSearch.trim()) return true;
                  const q = loadFromDbSearch.toLowerCase();
                  return (
                    (o.customer_name && o.customer_name.toLowerCase().includes(q)) ||
                    (o.legacy_code && o.legacy_code.toLowerCase().includes(q)) ||
                    (o.locality && o.locality.toLowerCase().includes(q)) ||
                    (o.sellers?.full_name && o.sellers.full_name.toLowerCase().includes(q))
                  );
                }).length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-xs font-semibold">
                  No se encontraron pedidos en la base de datos.
                </div>
              ) : (
                recentDbOrders
                  .filter(o => {
                    if (!loadFromDbSearch.trim()) return true;
                    const q = loadFromDbSearch.toLowerCase();
                    return (
                      (o.customer_name && o.customer_name.toLowerCase().includes(q)) ||
                      (o.legacy_code && o.legacy_code.toLowerCase().includes(q)) ||
                      (o.locality && o.locality.toLowerCase().includes(q)) ||
                      (o.sellers?.full_name && o.sellers.full_name.toLowerCase().includes(q))
                    );
                  })
                  .map(order => {
                    const itemsSummary = (order.order_items || [])
                      .map((it: any) => `${it.quantity}x ${it.product_name}`)
                      .join(', ');

                    return (
                      <div key={order.id} className="pt-3 first:pt-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white hover:bg-slate-50/80 p-3 rounded-xl border border-slate-100 transition-colors">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="font-extrabold text-xs text-slate-900">{order.customer_name}</span>
                            {order.legacy_code ? (
                              <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[9px] font-mono font-bold">
                                {order.legacy_code}
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-200/60 rounded text-[9px] font-bold">
                                Sin código planilla
                              </span>
                            )}
                            <span className="text-[10px] text-slate-400 font-semibold">
                              {formatDate(order.order_date || order.created_at)}
                            </span>
                          </div>

                          <div className="text-[11px] text-slate-500 truncate mb-1">
                            {order.locality ? `${order.locality} • ` : ''} Total: <span className="font-bold text-slate-800">{formatPrice(order.total_amount)}</span>
                            {order.sellers?.full_name && ` • Vendedor: ${order.sellers.full_name}`}
                          </div>

                          {itemsSummary && (
                            <p className="text-[10px] text-slate-400 line-clamp-1 italic">
                              {itemsSummary}
                            </p>
                          )}
                        </div>

                        {/* Actions for this order */}
                        <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                          {/* Sync to Sheet */}
                          <button
                            type="button"
                            disabled={syncingOrderId === order.id}
                            onClick={() => handleSyncExistingOrderToSheet(order)}
                            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                              order.legacy_code 
                                ? 'bg-slate-50 hover:bg-emerald-50 text-slate-600 hover:text-emerald-700 border-slate-200 hover:border-emerald-300' 
                                : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-300'
                            }`}
                            title="Sincronizar directamente a la planilla de Google"
                          >
                            <FileSpreadsheet className={`w-3.5 h-3.5 ${syncingOrderId === order.id ? 'animate-spin text-emerald-600' : 'text-emerald-600'}`} />
                            <span className="text-[11px]">{order.legacy_code ? 'Re-sincronizar' : 'A Planilla'}</span>
                          </button>

                          {/* Clone into form */}
                          <button
                            type="button"
                            onClick={() => handleCloneOrder(order)}
                            className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200/80 rounded-lg text-xs font-bold transition-all cursor-pointer"
                            title="Cargar datos en el formulario como un nuevo pedido (no sobreescribe el original)"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            <span className="text-[11px]">Cargar en Formulario</span>
                          </button>

                          {/* Edit in form */}
                          <button
                            type="button"
                            onClick={() => handleEditOrder(order)}
                            className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-lg text-xs font-bold transition-all cursor-pointer"
                            title="Editar este pedido existente"
                          >
                            <Edit className="w-3.5 h-3.5 text-slate-600" />
                            <span className="text-[11px]">Editar</span>
                          </button>
                        </div>
                      </div>
                    );
                  })
              )}
            </div>

            {/* Footer */}
            <div className="p-3 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl flex justify-between items-center text-xs">
              <span className="text-[11px] text-slate-400 font-medium">
                Se muestran los pedidos más recientes de la base de datos.
              </span>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowLoadFromDbModal(false)}
                className="text-xs font-bold text-slate-500 cursor-pointer"
              >
                Cerrar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL SELECTOR VISUAL DE PRODUCTOS */}
      <VisualProductSelectorModal
        isOpen={isVisualModalOpen}
        onClose={() => setIsVisualModalOpen(false)}
        products={products}
        orderItems={orderItems}
        onAddProduct={addItem}
        onAddProducts={addItems}
        onUpdateQuantity={updateQuantity}
        onUpdateCustomPrice={updateCustomPrice}
        onRemoveItem={removeItem}
        onUpdateKitQuantity={handleUpdateKitQuantity}
        onRemoveKit={handleRemoveKit}
        onClearOrderItems={() => setOrderItems([])}
        isAdmin={role === 'admin'}
        orderDiscountType={orderDiscountType}
        orderDiscountValue={orderDiscountValue}
        onUpdateOrderDiscount={(type, value) => {
          setOrderDiscountType(type);
          setOrderDiscountValue(value);
        }}
        onUpdateItemDiscount={updateItemDiscount}
        onApplyDiscountSuggestion={handleApplyDiscountSuggestion}
      />
    </div>
  );
}

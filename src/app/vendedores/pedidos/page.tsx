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
  ArrowLeft,
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
  FileSpreadsheet,
  Copy,
  History,
  MessageSquare,
  CheckCheck,
  Database,
  XCircle,
  RotateCcw,
  Ban,
  Printer,
  ExternalLink,
  Building2
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { supabase } from "@/lib/supabase";
import { Product, OrderDiscountItem } from "@/types";
import VisualProductSelectorModal, { QuantityInput } from "@/components/vendedores/VisualProductSelectorModal";
import ImportWhatsAppBudgetModal from "@/components/vendedores/ImportWhatsAppBudgetModal";
import PrintableOrderModal, { PrintableOrderData } from "@/components/vendedores/PrintableOrderModal";
import ViewOrderModal from "@/components/vendedores/ViewOrderModal";
import WholesaleClientModal, { WholesaleClientOption } from "@/components/vendedores/WholesaleClientModal";
import AddLocalityModal, { ZoneOption } from "@/components/vendedores/AddLocalityModal";
import { cn, formatPrice, cleanDeliveryNotes } from "@/lib/utils";
import { calculateBulkPrices } from "@/lib/erp/prices";
import { createBulkStockTransactions } from "@/lib/erp/stock";
import { evaluateDiscountSuggestions, DiscountSuggestion } from "@/lib/discountRules";
import { buildSheetOrderItems, normalizeProductNameForSheet } from "@/lib/googleSheets";
import { getWholesaleCatalogKind } from "@/lib/visualSelectorConfig";
import { calculateCascadingDiscounts } from "@/lib/orderDiscounts";

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

interface WholesaleCatalogItem {
  id?: string;
  name: string;
  category?: string;
  priceList?: number;
  price_list?: number;
}

const WHOLESALE_ADVERTISING_SOURCES = [
  "Cliente",
  "Página web",
  "Reenviado de Minorista",
  "Recomendado",
  "Otro"
];

const RETAIL_ADVERTISING_SOURCES = [
  "Mayorista",
  "Meta - Tanques Aquafort",
  "Meta - Termotanques Universal",
  "Meta - Termotanques Cooper",
  "Meta - Biodigestores Biofort",
  "Meta - MEPS / Equilibrio",
  "Orgánico / Cliente Habitual / Recomendado"
];

const ALLOWED_ADVERTISING_SOURCES = [
  ...WHOLESALE_ADVERTISING_SOURCES,
  ...RETAIL_ADVERTISING_SOURCES
];

const DEFAULT_ADVERTISING_SOURCES: AdvertisingSource[] = [
  { id: "a4df04ca-29aa-4328-b2ec-a35a53a5caeb", name: "Meta - Tanques Aquafort", is_active: true },
  { id: "afb44df7-4252-4a06-8581-6d2002fb67be", name: "Meta - Termotanques Universal", is_active: true },
  { id: "6a07b438-0b85-48d8-ad80-a8e567683f66", name: "Meta - Termotanques Cooper", is_active: true },
  { id: "2e43372c-ab9b-4fb9-904a-bb14f67f25f7", name: "Meta - Biodigestores Biofort", is_active: true },
  { id: "f29edda0-a7d6-4731-b865-cd9b335f755b", name: "Meta - MEPS / Equilibrio", is_active: true },
  { id: "71b1f7f7-0bc5-4ed4-9ebd-5b9383f00571", name: "Orgánico / Cliente Habitual / Recomendado", is_active: true }
];

const ALLOWED_ORDER_MEDIUMS = [
  "Whaticket",
  "WhatsApp",
  "Llamado",
  "Otro"
];

const WHOLESALE_ORDER_MEDIUMS = [
  "WhatsApp",
  "Llamado",
  "Otro"
];

const FACUNDO_SELLER_IDS = [
  '3820a0fe-bb0a-4a84-ad85-79e49868cad7',
  '54b9ce55-7354-4b39-9886-314aa79f6aa6'
];

const FACUNDO_RETAIL_SOURCE = 'Orgánico / Cliente Habitual / Recomendado';

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
    statusFilter?: 'Pendientes' | 'En Revisión' | 'Entregados' | 'Anulados' | 'Todos';
    selectedStatuses?: string[];
    clientTypeFilter?: 'todos' | 'minoristas' | 'mayoristas';
    selectedChannels?: ('minoristas' | 'mayoristas')[];
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
  default_discount_label?: string | null;
  default_discount_coef?: number | null;
  internal_code?: string | null;
  notes?: string | null;
}

interface Address {
  id: string;
  alias: string;
  full_address: string | null;
  locality_id: string | null;
  map_link?: string | null;
  delivery_notes?: string | null;
  is_default?: boolean | null;
  created_at?: string | null;
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
  label?: string;
  value: string; // YYYY-MM-DD format
  onChange: (val: string) => void;
  required?: boolean;
  className?: string;
}

const DateInput: React.FC<DateInputProps> = ({ label, value, onChange, required = false, className }) => {
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
    const isDeleting = (e.nativeEvent as any)?.inputType?.startsWith('delete');
    let input = e.target.value;
    input = input.replace(/[^0-9/]/g, '');

    // Auto slashes (only when adding characters)
    if (!isDeleting) {
      if (input.length === 2 && !input.includes('/')) {
        input += '/';
      } else if (input.length === 5 && input.split('/').length === 2) {
        input += '/';
      }
    }

    if (input.length > 10) {
      input = input.substring(0, 10);
    }

    setTypedValue(input);

    if (!input.trim()) {
      onChange('');
      return;
    }

    const parts = input.split('/');
    if (parts.length === 3 && parts[0].length === 2 && parts[1].length === 2 && parts[2].length === 4) {
      const dd = parts[0];
      const mm = parts[1];
      const yyyy = parts[2];
      const dNum = parseInt(dd, 10);
      const mNum = parseInt(mm, 10);
      const yNum = parseInt(yyyy, 10);
      if (mNum >= 1 && mNum <= 12 && dNum >= 1 && dNum <= 31 && yNum >= 1900 && yNum <= 2100) {
        onChange(`${yyyy}-${mm}-${dd}`);
      }
    }
  };

  const handleBlur = () => {
    if (!typedValue.trim()) {
      onChange('');
      setTypedValue("");
      return;
    }
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
    <div className={label ? "space-y-1" : ""}>
      {label && <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</label>}
      <div className="relative">
        <input
          type="text"
          required={required}
          value={typedValue}
          onChange={handleTextChange}
          onBlur={handleBlur}
          placeholder="dd/mm/yyyy"
          className={className || "w-full pl-2.5 pr-8 py-1.5 rounded-lg border border-slate-200 bg-white font-bold text-xs focus:ring-2 focus:ring-brand-500/10 outline-none text-slate-800"}
        />
        <button
          type="button"
          onClick={handleCalendarClick}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
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

const calculateNthWeekday = (baseDateStr: string, n: number): Date | null => {
  if (!baseDateStr) return null;
  const date = new Date(baseDateStr + 'T12:00:00');
  if (isNaN(date.getTime())) return null;
  let count = 0;
  while (count < n) {
    date.setDate(date.getDate() + 1);
    const day = date.getDay();
    if (day !== 0 && day !== 6) count++;
  }
  return date;
};

const formatDateInput = (date: Date | null): string => {
  if (!date) return '';
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const getCurrentMonthRange = () => {
  const now = new Date();
  const firstDay = formatDateInput(new Date(now.getFullYear(), now.getMonth(), 1));
  const today = formatDateInput(now);
  return { firstDay, today };
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
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>(['Pendientes']);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [selectedChannels, setSelectedChannels] = useState<('minoristas' | 'mayoristas')[]>(['minoristas']);
  const [showChannelDropdown, setShowChannelDropdown] = useState(false);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [productSearchTerm, setProductSearchTerm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sourceQuoteId, setSourceQuoteId] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const editingOrderIdRef = useRef<string | null>(null);
  const isEditingRef = useRef(false);

  // View & Print Order Modals State
  const [isViewOrderModalOpen, setIsViewOrderModalOpen] = useState(false);
  const [selectedOrderForView, setSelectedOrderForView] = useState<PrintableOrderData | null>(null);
  const [isPrintOrderModalOpen, setIsPrintOrderModalOpen] = useState(false);
  const [selectedOrderForPrint, setSelectedOrderForPrint] = useState<PrintableOrderData | null>(null);

  // Load from DB & Sheet Sync States
  const [showLoadFromDbModal, setShowLoadFromDbModal] = useState(false);
  const [loadFromDbSearch, setLoadFromDbSearch] = useState("");
  const [recentDbOrders, setRecentDbOrders] = useState<any[]>([]);
  const [loadingDbOrders, setLoadingDbOrders] = useState(false);
  const [syncingOrderId, setSyncingOrderId] = useState<string | null>(null);

  const [products, setProducts] = useState<Product[]>([]);
  const [allProducts, setAllProducts] = useState<Product[]>([]);

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
  const [isImportWhatsAppOpen, setIsImportWhatsAppOpen] = useState(false);
  const [isOrderSummaryExpanded, setIsOrderSummaryExpanded] = useState(true);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [orderCategory, setOrderCategory] = useState<string>("auto");
  const [commercialBrand, setCommercialBrand] = useState<'zono' | 'aquafort'>('zono');

  // Order Discount States (Global)
  const [orderDiscountType, setOrderDiscountType] = useState<'percentage' | 'fixed'>('percentage');
  const [orderDiscountValue, setOrderDiscountValue] = useState<number>(0);
  const [orderDiscounts, setOrderDiscounts] = useState<OrderDiscountItem[]>([]);

  const isWholesaleContext = selectedChannels.length === 1 && selectedChannels[0] === 'mayoristas';
  const isWholesaleForm = activeTab === 'form' && isWholesaleContext;

  // Item Discounts Accordion State in Page Summary
  const [openItemDiscountIds, setOpenItemDiscountIds] = useState<Record<string, boolean>>({});
  const toggleItemDiscount = (id: string) => {
    setOpenItemDiscountIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const detectedCategory = useMemo(() => {
    if (orderItems.length === 0) return "OTRO";

    // A complete BioFort installation contains many $0 accessories. Its category
    // must be defined by the installation item, not by the most numerous accessory.
    const hasBiofortInstallation = orderItems.some(item => {
      const full = `${item.name || ""} ${item.sku || ""} ${item.category || ""}`.toLowerCase();
      const isInstallation = full.includes("instalaci") || full.includes("mano de obra");
      const isBiofort = full.includes("biofort") || full.includes("biodigestor") || full.includes("séptic") || full.includes("septic");
      return isInstallation && isBiofort;
    });
    if (hasBiofortInstallation) return "INSTALACIÓN BIOFORT";
    
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
  const [sellersList, setSellersList] = useState<{ id: string; full_name: string; email: string; role?: string; roles?: string[] }[]>([]);
  const [currentSeller, setCurrentSeller] = useState<{ id: string; full_name: string; email: string; role?: string; roles?: string[] } | null>(null);
  const [selectedSellerId, setSelectedSellerId] = useState<string>("");
  const [orders, setOrders] = useState<any[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  useEffect(() => {
    const refresh = () => setRefreshTrigger(value => value + 1);
    window.addEventListener('order-sync-finished', refresh);
    return () => window.removeEventListener('order-sync-finished', refresh);
  }, []);
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
  const [dateFrom, setDateFrom] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.has("date_from")) return params.get("date_from") || "";
      if (params.has("date_to")) return "";
      return getCurrentMonthRange().firstDay;
    }
    return getCurrentMonthRange().firstDay;
  });
  const [dateTo, setDateTo] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.has("date_to")) return params.get("date_to") || "";
      if (params.has("date_from")) return "";
      return getCurrentMonthRange().today;
    }
    return getCurrentMonthRange().today;
  });
  const [showDateDropdown, setShowDateDropdown] = useState<boolean>(false);
  const isInitialMount = useRef(true);

  const isRestrictedSeller = useMemo(() => {
    if (role === 'admin') return false;
    const emailLower = (currentSeller?.email || "").toLowerCase();
    const nameLower = (currentSeller?.full_name || "").toLowerCase();
    const isExplicitAdmin = currentSeller?.role === 'admin' || (Array.isArray(currentSeller?.roles) && currentSeller.roles.includes('admin'));
    if (isExplicitAdmin) return false;
    return (
      emailLower.includes("jazmin") || 
      emailLower.includes("jazmín") || 
      nameLower.includes("jazmin") || 
      nameLower.includes("jazmín") || 
      emailLower.includes("ludmila") ||
      emailLower.includes("ludmilakrenz") ||
      nameLower.includes("ludmila")
    );
  }, [currentSeller, role]);

  useEffect(() => {
    if (isRestrictedSeller) {
      setSelectedChannels(['minoristas']);
    }
  }, [isRestrictedSeller]);

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
      const urlTab = params.get("tab");
      if (urlTab === 'form' || urlTab === 'nuevo') {
        setActiveTab('form');
      } else {
        setActiveTab('list');
      }
      const urlStatus = params.get("status");
      if (urlStatus) {
        if (urlStatus === 'Todos') {
          setSelectedStatuses(['Pendientes', 'En Revisión', 'Entregados', 'Anulados']);
        } else {
          const parsedStatuses = urlStatus.split(',').map(s => s.trim()).filter(s => ['Pendientes', 'En Revisión', 'Entregados', 'Anulados'].includes(s));
          if (parsedStatuses.length > 0) {
            setSelectedStatuses(parsedStatuses);
          }
        }
      }
      const urlClientType = params.get("client_type");
      if (urlClientType) {
        if (urlClientType === 'todos') {
          setSelectedChannels(['minoristas', 'mayoristas']);
        } else {
          const parsedChannels = urlClientType.split(',').map(s => s.trim()).filter(s => ['minoristas', 'mayoristas'].includes(s)) as ('minoristas' | 'mayoristas')[];
          if (parsedChannels.length > 0) {
            setSelectedChannels(parsedChannels);
          }
        }
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
      if (!params.has("date_from") && !params.has("date_to")) {
        const { firstDay, today } = getCurrentMonthRange();
        setDateFrom(firstDay);
        setDateTo(today);
      }
    }
  }, []);

  // Recuperar el desglose en formularios abiertos antes de que la precarga
  // empezara a transmitir los descuentos por separado.
  useEffect(() => {
    if (!sourceQuoteId || orderDiscounts.length > 0 || orderDiscountType !== 'fixed' || orderDiscountValue <= 0) return;
    let cancelled = false;
    supabase.from('sales_quotes').select('commercial_conditions').eq('id', sourceQuoteId).maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        const conditions = data?.commercial_conditions || {};
        const savedDiscounts = conditions.orderDiscounts;
        if (Array.isArray(savedDiscounts) && savedDiscounts.length > 0 &&
          Number(conditions.orderDiscountAmount) === orderDiscountValue) {
          setOrderDiscounts(savedDiscounts);
          setOrderDiscountValue(0);
        }
      });
    return () => { cancelled = true; };
  }, [sourceQuoteId, orderDiscounts.length, orderDiscountType, orderDiscountValue]);

  // Update browser URL query string smoothly whenever active filters change
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);

    if (activeTab === 'form') {
      params.set("tab", "form");
    } else {
      params.delete("tab");
    }

    if (selectedStatuses.length === 1 && selectedStatuses[0] === 'Pendientes') {
      params.delete("status");
    } else if (selectedStatuses.length === 4 || selectedStatuses.length === 0) {
      params.set("status", "Todos");
    } else {
      params.set("status", selectedStatuses.join(","));
    }

    if (selectedChannels.length === 1 && selectedChannels[0] === 'minoristas') {
      params.delete("client_type");
    } else if (selectedChannels.length === 2 || selectedChannels.length === 0) {
      params.set("client_type", "todos");
    } else {
      params.set("client_type", selectedChannels.join(","));
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
  }, [activeTab, selectedStatuses, selectedChannels, selectedProducts, orderSearchQuery, listType, dateFrom, dateTo]);

  // Support browser back/forward buttons (popstate) and sidebar navigation (zono_nav_pedidos)
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const urlTab = params.get("tab");
      if (urlTab === 'form' || urlTab === 'nuevo') {
        setActiveTab('form');
      } else {
        setActiveTab('list');
      }

      const urlStatus = params.get("status");
      if (urlStatus === 'Todos') {
        setSelectedStatuses(['Pendientes', 'En Revisión', 'Entregados', 'Anulados']);
      } else if (urlStatus) {
        const parsed = urlStatus.split(',').map(s => s.trim()).filter(s => ['Pendientes', 'En Revisión', 'Entregados', 'Anulados'].includes(s));
        setSelectedStatuses(parsed.length > 0 ? parsed : ['Pendientes']);
      } else {
        setSelectedStatuses(['Pendientes']);
      }

      const urlClientType = params.get("client_type");
      if (urlClientType === 'todos') {
        setSelectedChannels(['minoristas', 'mayoristas']);
      } else if (urlClientType) {
        const parsed = urlClientType.split(',').map(s => s.trim()).filter(s => ['minoristas', 'mayoristas'].includes(s)) as ('minoristas' | 'mayoristas')[];
        setSelectedChannels(parsed.length > 0 ? parsed : ['minoristas']);
      } else {
        setSelectedChannels(['minoristas']);
      }

      setSelectedProducts(params.get("products") ? params.get("products")!.split(',').filter(Boolean) : []);
      setOrderSearchQuery(params.get("search") || '');
      setListType((params.get("list_type") as any) || 'mis_pedidos');
      if (params.has("date_from") || params.has("date_to")) {
        setDateFrom(params.get("date_from") || '');
        setDateTo(params.get("date_to") || '');
      } else {
        const { firstDay, today } = getCurrentMonthRange();
        setDateFrom(firstDay);
        setDateTo(today);
      }
    };

    const handleCustomNav = (e: any) => {
      const url = e?.detail?.href;
      if (!url) return;
      const search = url.includes('?') ? url.split('?')[1] : '';
      const params = new URLSearchParams(search);
      const urlTab = params.get("tab");
      if (urlTab === 'form' || urlTab === 'nuevo') {
        setActiveTab('form');
      } else if (urlTab === 'list') {
        setActiveTab('list');
      }
      const urlClientType = params.get("client_type");
      if (urlClientType === 'todos') {
        setSelectedChannels(['minoristas', 'mayoristas']);
      } else if (urlClientType) {
        const parsed = urlClientType.split(',').map((s: string) => s.trim()).filter((s: string) => ['minoristas', 'mayoristas'].includes(s)) as ('minoristas' | 'mayoristas')[];
        if (parsed.length > 0) setSelectedChannels(parsed);
      }
      if (params.has("date_from") || params.has("date_to")) {
        setDateFrom(params.get("date_from") || '');
        setDateTo(params.get("date_to") || '');
      } else {
        const { firstDay, today } = getCurrentMonthRange();
        setDateFrom(firstDay);
        setDateTo(today);
      }
    };

    window.addEventListener("popstate", handlePopState);
    window.addEventListener("zono_nav_pedidos", handleCustomNav);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("zono_nav_pedidos", handleCustomNav);
    };
  }, []);

  const saveCustomView = (name: string) => {
    if (!name.trim()) return;
    const newView: CustomView = {
      id: 'view_' + Date.now(),
      name: name.trim(),
      filters: {
        selectedStatuses,
        selectedChannels,
        statusFilter: selectedStatuses.length === 1 ? (selectedStatuses[0] as any) : (selectedStatuses.length === 4 || selectedStatuses.length === 0 ? 'Todos' : 'Pendientes'),
        clientTypeFilter: selectedChannels.length === 1 ? selectedChannels[0] : 'todos',
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
    if (view.filters.selectedStatuses && view.filters.selectedStatuses.length > 0) {
      setSelectedStatuses(view.filters.selectedStatuses);
    } else if (view.filters.statusFilter) {
      if (view.filters.statusFilter === 'Todos') {
        setSelectedStatuses(['Pendientes', 'En Revisión', 'Entregados', 'Anulados']);
      } else {
        setSelectedStatuses([view.filters.statusFilter]);
      }
    } else {
      setSelectedStatuses(['Pendientes']);
    }

    if (view.filters.selectedChannels && view.filters.selectedChannels.length > 0) {
      setSelectedChannels(view.filters.selectedChannels);
    } else if (view.filters.clientTypeFilter) {
      if (view.filters.clientTypeFilter === 'todos') {
        setSelectedChannels(['minoristas', 'mayoristas']);
      } else {
        setSelectedChannels([view.filters.clientTypeFilter]);
      }
    } else {
      setSelectedChannels(['minoristas']);
    }

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
    setSelectedStatuses(['Pendientes']);
    setSelectedChannels(['minoristas', 'mayoristas']);
    setSelectedProducts([]);
    setOrderSearchQuery("");
    setListType('mis_pedidos');
    const { firstDay, today } = getCurrentMonthRange();
    setDateFrom(firstDay);
    setDateTo(today);
    setShowCustomViewsDropdown(false);
  };

  const currentActiveViewName = useMemo(() => {
    const matched = customViews.find(v => {
      const vStatuses = v.filters.selectedStatuses || (v.filters.statusFilter === 'Todos' ? ['Pendientes', 'En Revisión', 'Entregados', 'Anulados'] : [v.filters.statusFilter || 'Pendientes']);
      const vChannels = v.filters.selectedChannels || (v.filters.clientTypeFilter === 'todos' ? ['minoristas', 'mayoristas'] : [v.filters.clientTypeFilter || 'minoristas']);
      return JSON.stringify(vStatuses.slice().sort()) === JSON.stringify(selectedStatuses.slice().sort()) &&
        JSON.stringify(vChannels.slice().sort()) === JSON.stringify(selectedChannels.slice().sort()) &&
        JSON.stringify((v.filters.selectedProducts || []).slice().sort()) === JSON.stringify(selectedProducts.slice().sort()) &&
        v.filters.orderSearchQuery === orderSearchQuery &&
        (v.filters.listType || 'mis_pedidos') === listType &&
        (v.filters.dateFrom || "") === dateFrom &&
        (v.filters.dateTo || "") === dateTo;
    });
    return matched ? matched.name : null;
  }, [customViews, selectedStatuses, selectedChannels, selectedProducts, orderSearchQuery, listType, dateFrom, dateTo]);

  const hasActiveCustomFilters = useMemo(() => {
    const isDefaultStatus = selectedStatuses.length === 1 && selectedStatuses[0] === 'Pendientes';
    const isDefaultChannel = selectedChannels.length === 2 || selectedChannels.length === 0;
    const { firstDay, today } = getCurrentMonthRange();
    const isDefaultDate = (dateFrom === firstDay && dateTo === today);
    return !isDefaultStatus ||
           !isDefaultChannel ||
           selectedProducts.length > 0 || 
           orderSearchQuery.trim() !== '' ||
           listType !== 'mis_pedidos' ||
           !isDefaultDate;
  }, [selectedStatuses, selectedChannels, selectedProducts, orderSearchQuery, listType, dateFrom, dateTo]);

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
    telegram_sent?: boolean;
    telegram_message_id?: number;
    telegram_chat_id?: string;
    created_at?: string;
    has_iva?: boolean;
    iva_mode?: 'included' | 'added';
    iva_amount?: number;
    taxable_base?: number;
  }
  const [paymentsList, setPaymentsList] = useState<PaymentBreakdownItem[]>([
    {
      id: Math.random().toString(36).substring(2, 9),
      payment_method_id: "a3a890a8-b677-4b7b-8ffb-d36c2e7b5ad3", // default cash/transfer ID
      amount: 0,
      card_surcharge: 0,
      card_installments: 1,
      receipt_url: "",
      notes: "",
      telegram_sent: false,
      has_iva: false,
      iva_mode: 'included'
    }
  ]);
  const [uploadingReceiptId, setUploadingReceiptId] = useState<string | null>(null);
  const receiptUploadInProgress = useRef(false);

  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>("");
  const [adminSellerFilter, setAdminSellerFilter] = useState<string>("mis_kits");
  const [selectedKitId, setSelectedKitId] = useState<string>("");

  const [showEditNameModal, setShowEditNameModal] = useState(false);
  const [editKitId, setEditKitId] = useState("");
  const [editKitNameValue, setEditKitNameValue] = useState("");

  // DB Entity lists
  const [clients, setClients] = useState<Client[]>([]);
  const [localities, setLocalities] = useState<Locality[]>([]);
  const [zones, setZones] = useState<ZoneOption[]>([]);
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
  const [appliedWholesaleDiscountLabel, setAppliedWholesaleDiscountLabel] = useState("");
  const isNewClient = !selectedClientId;
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [clientSearchQuery, setClientSearchQuery] = useState("");
  const [debouncedClientSearch, setDebouncedClientSearch] = useState("");
  const [debouncedOrderSearch, setDebouncedOrderSearch] = useState("");
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const [showWholesaleClientModal, setShowWholesaleClientModal] = useState(false);

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

  const [advertisingSources, setAdvertisingSources] = useState<AdvertisingSource[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const cached = localStorage.getItem("cached_pedidos_adv") || sessionStorage.getItem("cached_pedidos_adv");
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const clean = parsed.filter((a: any) => a && a.is_active !== false && ALLOWED_ADVERTISING_SOURCES.includes(a.name));
            if (clean.length > 0) return clean;
          }
        }
      } catch (e) {}
    }
    return DEFAULT_ADVERTISING_SOURCES;
  });
  const isFacundoSelectedSeller = FACUNDO_SELLER_IDS.includes(selectedSellerId || currentUserId);
  const filteredAdvertisingSources = useMemo(() => {
    const contextSources = isWholesaleContext
      ? WHOLESALE_ADVERTISING_SOURCES
      : (isFacundoSelectedSeller ? [FACUNDO_RETAIL_SOURCE] : RETAIL_ADVERTISING_SOURCES);
    return advertisingSources
      .filter(a => a && a.is_active !== false && contextSources.includes(a.name))
      .sort((a, b) => {
        const idxA = contextSources.indexOf(a.name);
        const idxB = contextSources.indexOf(b.name);
        return (idxA !== -1 ? idxA : 999) - (idxB !== -1 ? idxB : 999);
      });
  }, [advertisingSources, isWholesaleContext, isFacundoSelectedSeller]);
  const [orderMediums, setOrderMediums] = useState<OrderMedium[]>([
    { id: "e9654dad-9352-4f31-8f01-b12c57289993", name: "Whaticket", requires_phone_line: false, is_active: true },
    { id: "8111f489-b970-40f8-9754-4636df1ab7ed", name: "WhatsApp", requires_phone_line: true, is_active: true },
    { id: "8f4782f2-64a7-484f-b775-2fd5df380309", name: "Llamado", requires_phone_line: true, is_active: true },
    { id: "7c7aa19c-802d-462e-856c-e0bd92023938", name: "Otro", requires_phone_line: false, is_active: true }
  ]);
  const filteredOrderMediums = useMemo(() => {
    return orderMediums
      .filter(m => m && m.is_active !== false && ALLOWED_ORDER_MEDIUMS.includes(m.name))
      .filter(m => !isWholesaleContext || WHOLESALE_ORDER_MEDIUMS.includes(m.name))
      .sort((a, b) => {
        const displayOrder = isWholesaleContext ? WHOLESALE_ORDER_MEDIUMS : ALLOWED_ORDER_MEDIUMS;
        const idxA = displayOrder.indexOf(a.name);
        const idxB = displayOrder.indexOf(b.name);
        return (idxA !== -1 ? idxA : 999) - (idxB !== -1 ? idxB : 999);
      });
  }, [orderMediums, isWholesaleContext]);

  const [phoneLines, setPhoneLines] = useState<PhoneLine[]>([]);
  const [topAdvertisingSources, setTopAdvertisingSources] = useState<AdvertisingSource[]>([]);
  const [topOrderMediums, setTopOrderMediums] = useState<OrderMedium[]>([]);
  const [topPhoneLines, setTopPhoneLines] = useState<PhoneLine[]>([]);
  const [isOrganic, setIsOrganic] = useState(false);
  
  const [legacyCode, setLegacyCode] = useState("");
  const [selectedAdvertisingSourceId, setSelectedAdvertisingSourceId] = useState("");
  const [advertisingSourceDetail, setAdvertisingSourceDetail] = useState("");
  const [selectedOrderMediumId, setSelectedOrderMediumId] = useState("e9654dad-9352-4f31-8f01-b12c57289993");
  const [selectedPhoneLineId, setSelectedPhoneLineId] = useState("");
  const selectedOrderMedium = filteredOrderMediums.find(m => m.id === selectedOrderMediumId)
    || orderMediums.find(m => m.id === selectedOrderMediumId);
  const requiresWhaticketLink = selectedOrderMedium?.name.toLowerCase() === 'whaticket';
  const isWhaticketLinkMissing = requiresWhaticketLink && !whaticketLink.trim();

  const assignableSellers = useMemo(() => {
    return sellersList.filter(s => {
      // 1. Si está asignado en el pedido actual, mantenerlo siempre
      if (selectedSellerId && s.id === selectedSellerId) return true;

      // 2. Si el usuario es vendedor (rol seller/vendedor o lo tiene en roles)
      const isSeller = s.role === 'seller' || s.role === 'vendedor' || (Array.isArray(s.roles) && (s.roles.includes('seller') || s.roles.includes('vendedor')));
      if (isSeller) return true;

      // 3. Los administradores sí pueden verse a sí mismos como vendedores aunque no lo sean
      const isCurrentAdmin = role === 'admin' || currentSeller?.role === 'admin' || (Array.isArray(currentSeller?.roles) && currentSeller.roles.includes('admin'));
      if (isCurrentAdmin && s.id === currentUserId) return true;

      return false;
    });
  }, [sellersList, selectedSellerId, role, currentSeller, currentUserId]);

  // Default Order Medium to Whaticket
  useEffect(() => {
    if (filteredOrderMediums.length > 0 && !selectedOrderMediumId) {
      const whaticketMedium = filteredOrderMediums.find(m => m.name.toLowerCase() === 'whaticket');
      if (whaticketMedium) {
        setSelectedOrderMediumId(whaticketMedium.id);
      }
    }
  }, [filteredOrderMediums, selectedOrderMediumId]);

  // A wholesale order must be built with the published wholesale price list,
  // while retaining the real product IDs needed by stock and order_items.
  useEffect(() => {
    let cancelled = false;

    const getTokens = (name: string) => normalizeText(name)
      .replace(/\btric\b/g, 'tricapa')
      .replace(/\bcuatr\b/g, 'cuatricapa')
      .replace(/\bbic\b/g, 'bicapa')
      .replace(/\bsept\b/g, 'septica')
      .replace(/\bbio\b/g, 'biodigestor')
      .replace(/\bdeseng\b/g, 'desengrasadora')
      .replace(/(\d{2,4})\s*l(?:ts|itros?)?\b/g, '$1l')
      .split(/[^a-z0-9]+/)
      .filter(token => token.length > 1 && !['aquafort', 'biofort', 'tanque', 'de', 'el', 'la'].includes(token));

    async function loadWholesaleCatalog() {
      if (!isWholesaleContext) {
        setProducts(allProducts);
        return;
      }
      if (allProducts.length === 0) return;

      try {
        const response = await fetch('/api/vendedores/wholesale-catalog?listNumber=12');
        const data: { success?: boolean; products?: WholesaleCatalogItem[] } = await response.json();
        if (!data.success || !Array.isArray(data.products)) throw new Error('No se pudo obtener la lista mayorista');

        // Reservar primero las coincidencias exactas. Sin esta pasada previa,
        // una fila genérica como "BioFort - Inspección" podía apropiarse por
        // similitud del producto "WP Kit cámara de inspección CII" y dejar afuera
        // su fila exacta (con otro precio) cuando se procesaba después.
        const exactProductByWholesaleIndex = new Map<number, Product>();
        const reservedExactProductIds = new Set<string>();
        const wholesaleTankCatalog = data.products.filter(wholesale => getWholesaleCatalogKind(wholesale));

        wholesaleTankCatalog.forEach((wholesale, index) => {
          const wholesaleName = normalizeText(wholesale.name || '').trim();
          if (!wholesaleName) return;
          const exactProduct = allProducts.find((product) => {
            if (reservedExactProductIds.has(product.id)) return false;
            return normalizeText(product.name || '').trim() === wholesaleName
              || normalizeText(product.sku || '').trim() === wholesaleName;
          });
          if (exactProduct) {
            exactProductByWholesaleIndex.set(index, exactProduct);
            reservedExactProductIds.add(exactProduct.id);
          }
        });

        const usedProductIds = new Set<string>();
        const matchedProducts = wholesaleTankCatalog.flatMap((wholesale, wholesaleIndex) => {
          const wholesaleTokens = getTokens(wholesale.name || '');
          const wholesaleText = wholesaleTokens.join(' ');
          const wholesaleCapacity = wholesaleTokens.find((token: string) => /^\d{2,4}l$/.test(token));
          const exactProduct = allProducts.find(product => product.id === wholesale.id && !usedProductIds.has(product.id))
            || exactProductByWholesaleIndex.get(wholesaleIndex);
          let bestProduct: Product | null = exactProduct || null;
          let bestScore = exactProduct ? 1 : 0;

          for (const product of allProducts) {
            if (usedProductIds.has(product.id)) continue;
            if (reservedExactProductIds.has(product.id) && product.id !== exactProduct?.id) continue;
            const productTokens = getTokens(`${product.name || ''} ${product.sku || ''}`);
            const productText = productTokens.join(' ');
            const isCiego = (product.variant_type || '').toLowerCase() === 'ciego' || productText.includes('ciego');
            if (isCiego) continue;

            // La forma y el color son parte de la identidad del tanque. Sin esta
            // validación un 1000 L estándar podía consumir el producto Chato (o
            // una variante Ciego) porque compartían capacidad, familia y color.
            const exclusiveMarkers = ['chato', 'slim', 'gris', 'beige', 'celeste'];
            if (exclusiveMarkers.some(marker => wholesaleText.includes(marker) !== productText.includes(marker))) continue;

            const familyMarkers = ['tricapa', 'cuatricapa', 'bicapa', 'cisterna', 'biodigestor', 'septica', 'desengrasadora', 'autolimpiable'];
            const wholesaleFamily = familyMarkers.find(marker => wholesaleText.includes(marker));
            const productFamily = familyMarkers.find(marker => productText.includes(marker));
            if (wholesaleFamily && productFamily !== wholesaleFamily) continue;

            const productCapacity = productTokens.find(token => /^\d{2,4}l$/.test(token));
            if (wholesaleCapacity && productCapacity && wholesaleCapacity !== productCapacity) continue;
            const overlap = wholesaleTokens.filter((token: string) => productTokens.includes(token)).length;
            const score = overlap / Math.max(wholesaleTokens.length, 1);
            if (score >= 0.6 && score > bestScore) {
              bestProduct = product;
              bestScore = score;
            }
          }

          if (!bestProduct) return [];
          usedProductIds.add(bestProduct.id);
          const listPrice = Number(wholesale.priceList || wholesale.price_list || 0);
          return [{
            ...bestProduct,
            category: wholesale.category || bestProduct.category,
            price: listPrice,
            wholesale_list_price: listPrice
          }];
        });

        // Mantener disponibles las variantes ciegas dentro del selector B2B.
        // Heredan el precio de Lista 12 de su tanque estándar.
        const wholesaleByProductId = new Map(matchedProducts.map(product => [product.id, product]));
        const ciegoVariants = allProducts.flatMap(product => {
          if (!product.parent_id || (product.variant_type || '').toLowerCase() !== 'ciego') return [];
          const parent = wholesaleByProductId.get(product.parent_id);
          if (!parent) return [];
          return [{
            ...product,
            price: parent.price,
            wholesale_list_price: parent.wholesale_list_price
          }];
        });

        if (!cancelled) setProducts([...matchedProducts, ...ciegoVariants]);
      } catch (error) {
        console.error('Error loading wholesale catalog:', error);
        if (!cancelled) setProducts([]);
      }
    }

    loadWholesaleCatalog();
    return () => { cancelled = true; };
  }, [allProducts, isWholesaleContext]);

  // Los pedidos B2B ingresan por WhatsApp sin asociar una línea telefónica.
  // La procedencia comercial se elige explícitamente en cada pedido.
  useEffect(() => {
    if (!isWholesaleForm || editingOrderId) return;
    const whatsappMedium = orderMediums.find(medium => medium.name.toLowerCase() === 'whatsapp');
    if (whatsappMedium) setSelectedOrderMediumId(whatsappMedium.id);
    setSelectedPhoneLineId("");
  }, [editingOrderId, isWholesaleForm, orderMediums]);

  // Facundo comparte una única secuencia AQ-FP. La procedencia de planilla es
  // la que distingue inequívocamente sus pedidos minoristas de los mayoristas.
  useEffect(() => {
    if (isWholesaleContext || !isFacundoSelectedSeller || editingOrderId) return;
    const organicSource = advertisingSources.find(source => source.name === FACUNDO_RETAIL_SOURCE);
    if (organicSource) {
      setSelectedAdvertisingSourceId(organicSource.id);
      setAdvertisingSourceDetail("");
    }
  }, [advertisingSources, editingOrderId, isFacundoSelectedSeller, isWholesaleContext]);

  useEffect(() => {
    if (editingOrderId) return;
    setCommercialBrand(isWholesaleContext || isFacundoSelectedSeller ? 'aquafort' : 'zono');
  }, [editingOrderId, isFacundoSelectedSeller, isWholesaleContext]);
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

  // New Locality Modal State
  const [isAddLocalityModalOpen, setIsAddLocalityModalOpen] = useState(false);
  const [initialLocalityModalName, setInitialLocalityModalName] = useState("");

  const handleOpenAddLocalityModal = async (initialName?: string) => {
    setInitialLocalityModalName(initialName !== undefined ? initialName : localitySearch);
    setIsLocalityDropdownOpen(false);
    setIsAddLocalityModalOpen(true);

    if (zones.length === 0) {
      try {
        const { data, error } = await supabase
          .from('zones')
          .select('id, name, delivery_schedule, delivery_time_id, delivery_times(name, description, delivery_days), is_active, color')
          .eq('is_active', true)
          .order('name');
        if (!error && data) {
          const mappedZones: ZoneOption[] = (data || []).map((z: any) => ({
            id: z.id,
            name: z.name,
            delivery_schedule: z.delivery_schedule,
            delivery_time_id: z.delivery_time_id,
            delivery_times: Array.isArray(z.delivery_times) ? z.delivery_times[0] : z.delivery_times,
            is_active: z.is_active,
            color: z.color
          }));
          setZones(mappedZones);
          try {
            sessionStorage.setItem("cached_pedidos_zones", JSON.stringify(mappedZones));
          } catch (e) {}
        }
      } catch (err) {
        console.error("Error al cargar zonas:", err);
      }
    }
  };

  const handleLocalityCreated = (newLoc: any) => {
    setLocalities(prev => {
      const exists = prev.some(l => l.id === newLoc.id);
      const updated = exists
        ? prev.map(l => l.id === newLoc.id ? newLoc : l)
        : [...prev, newLoc].sort((a, b) => a.name.localeCompare(b.name));
      try {
        sessionStorage.setItem("cached_pedidos_localities", JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });

    setLocalidadId(newLoc.id);
    setLocalitySearch(newLoc.name);

    if (newLoc.zones?.delivery_times?.name) {
      setFlete(newLoc.zones.delivery_times.name);
    }
  };

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
    if (isWholesaleForm) return formatDateInput(calculateNthWeekday(fechaPedido, 1)) || null;
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
  }, [flete, deliveryTimes, fechaPedido, isWholesaleForm]);

  // Obtener la fecha sugerida de entrega máxima basada en la agenda del flete seleccionado
  const suggestedDeliveryDateMax = React.useMemo(() => {
    if (isWholesaleForm) return formatDateInput(calculateNthWeekday(fechaPedido, 7)) || null;
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
  }, [flete, deliveryTimes, fechaPedido, suggestedDeliveryDate, isWholesaleForm]);

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
    if (isWholesaleForm && !editingOrderId) {
      setEntregaInicial(formatDateInput(calculateNthWeekday(fechaPedido, 1)));
      setEntregaMaxima(formatDateInput(calculateNthWeekday(fechaPedido, 7)));
      return;
    }
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
  }, [flete, fechaPedido, deliveryTimes, editingOrderId, isWholesaleForm]);

  // Si la fecha seleccionada no es compatible con el flete actual, cambiar automáticamente a "Día Particular"
  useEffect(() => {
    if (isWholesaleForm) return;
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
  }, [entregaInicial, flete, deliveryTimes, fechaPedido, isWholesaleForm]);

  const [paymentType, setPaymentType] = useState<'efectivo' | 'tarjeta'>('efectivo');
  const [cardInstallments, setCardInstallments] = useState<number>(1);
  const [cardSurcharge, setCardSurcharge] = useState<number>(0);
  const [dbPaymentMethods, setDbPaymentMethods] = useState<any[]>([]);
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState<string>("a3a890a8-b677-4b7b-8ffb-d36c2e7b5ad3");

  const activePaymentMethods = useMemo(() => {
    const seen = new Set<string>();
    // Excluir opciones individuales de Payway para agruparlas bajo la opción principal "Payway"
    const nonPaywayList = (dbPaymentMethods || [])
      .filter(pm => pm.is_active !== false)
      .filter(pm => !(pm.name || '').toLowerCase().includes('payway'))
      .filter(pm => {
        const key = (pm.name || '').trim().toLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });

    const hasPayway = (dbPaymentMethods || []).some(pm => (pm.name || '').toLowerCase().includes('payway'));
    if (hasPayway) {
      nonPaywayList.push({
        id: 'payway_group',
        name: 'Payway',
        surcharge_percentage: 0,
        installments: 1
      });
    }

    return nonPaywayList.sort((a, b) => {
      const isCashA = a.id === "a3a890a8-b677-4b7b-8ffb-d36c2e7b5ad3" || (a.name || "").toLowerCase().includes("efectivo");
      const isCashB = b.id === "a3a890a8-b677-4b7b-8ffb-d36c2e7b5ad3" || (b.name || "").toLowerCase().includes("efectivo");
      if (isCashA && !isCashB) return -1;
      if (!isCashA && isCashB) return 1;
      return (a.name || "").localeCompare(b.name || "", undefined, { numeric: true });
    });
  }, [dbPaymentMethods]);

  const getPaywayMethodByInstallments = (inst: number) => {
    return (
      (dbPaymentMethods || []).find(m => (m.name || '').toLowerCase().includes('payway') && m.installments === inst) ||
      (dbPaymentMethods || []).find(m => (m.name || '').toLowerCase().includes('payway'))
    );
  };

  const isPaywayPaymentMethod = (methodId: string) => {
    if (methodId === 'payway_group') return true;
    const pm = (dbPaymentMethods || []).find(m => m.id === methodId);
    return !!(pm && (pm.name || '').toLowerCase().includes('payway'));
  };
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
    if (receiptUploadInProgress.current) return;
    receiptUploadInProgress.current = true;
    setUploadingReceipt(true);
    setUploadingReceiptId(id);
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

      setPaymentsList(prev => {
        const next = prev.map(p => {
          if (p.id === id) {
            let assignedAmount = p.amount;
            if (!assignedAmount || assignedAmount === 0) {
              if (prev.length === 1) {
                if (customDepositAmount > 0) {
                  assignedAmount = customDepositAmount;
                } else if (paymentTiming === 'paid' && total > 0) {
                  assignedAmount = total;
                }
              } else {
                assignedAmount = 0;
              }
            }
            return {
              ...p,
              receipt_url: publicUrlData.publicUrl,
              amount: assignedAmount,
              telegram_sent: false
            };
          }
          return p;
        });

        const totalAllocated = next.reduce((sum, item) => sum + (item.amount || 0), 0);
        if (totalAllocated > 0) {
          if (totalAllocated >= total && total > 0) {
            setPaymentTiming('paid');
            setCustomDepositAmount(total);
          } else {
            setPaymentTiming('partial');
            setCustomDepositAmount(totalAllocated);
          }
        } else if (paymentTiming === 'contra_entrega') {
          setPaymentTiming('partial');
        }

        return next;
      });
    } catch (err: any) {
      console.error("Error al subir el comprobante del pago:", err);
      alert("Error al subir el comprobante: " + err.message);
    } finally {
      receiptUploadInProgress.current = false;
      setUploadingReceipt(false);
      setUploadingReceiptId(null);
    }
  };

  const handleRemovePaymentReceipt = (id: string) => {
    setPaymentsList(prev => prev.map(p => p.id === id ? { ...p, receipt_url: "", telegram_sent: false } : p));
  };

  const handlePaymentAmountChange = (id: string, newAmount: number) => {
    setPaymentsList(prev => {
      const next = prev.map(item => item.id === id ? { ...item, amount: newAmount } : item);
      const totalAllocated = next.reduce((sum, item) => sum + (item.amount || 0), 0);

      if (totalAllocated === 0) {
        if (!next.some(item => Boolean(item.receipt_url))) {
          setPaymentTiming('contra_entrega');
        }
        setCustomDepositAmount(0);
      } else if (totalAllocated >= total && total > 0) {
        setPaymentTiming('paid');
        setCustomDepositAmount(total);
      } else {
        setPaymentTiming('partial');
        setCustomDepositAmount(totalAllocated);
      }
      return next;
    });
  };

  const selectedPaymentMethod = (() => {
    const primaryPmId = paymentsList[0]?.payment_method_id || selectedPaymentMethodId;
    const matched = dbPaymentMethods.find(pm => pm.id === primaryPmId);
    if (matched) {
      const isCard = matched.id !== "a3a890a8-b677-4b7b-8ffb-d36c2e7b5ad3" && 
                     ((matched.surcharge_percentage || 0) > 0 || 
                      (matched.name && (matched.name.toLowerCase().includes("tarjeta") || matched.name.toLowerCase().includes("cuota") || matched.name.toLowerCase().includes("link") || matched.name.toLowerCase().includes("payway"))));
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
          if (data.quoteId) setSourceQuoteId(data.quoteId);
          if (data.clientId) setSelectedClientId(data.clientId);
          if (data.customerName) setCliente(data.customerName);
          if (data.customerPhone) setNewClientPhone(data.customerPhone);
          if (data.notes) setAclaraciones(data.notes);
          if (data.paymentType) setPaymentType(data.paymentType);
          if (data.cardInstallments) setCardInstallments(data.cardInstallments);
          if (data.cardSurcharge) setCardSurcharge(data.cardSurcharge);
          if (data.orderDiscountType) setOrderDiscountType(data.orderDiscountType);
          if (data.orderDiscountValue !== undefined) setOrderDiscountValue(data.orderDiscountValue);
          if (Array.isArray(data.orderDiscounts) && data.orderDiscounts.length > 0) {
            setOrderDiscounts(data.orderDiscounts);
            setOrderDiscountValue(0);
          }
          
          sessionStorage.removeItem("preloaded_budget");
          setActiveTab('form');
          
          alert(`${data.quoteNumber ? `Presupuesto ${data.quoteNumber}` : 'Presupuesto'} precargado con éxito. Completá entrega, procedencia y pago; Logística se activa recién al guardar el pedido.`);
        } catch (e) {
          console.error("Error parsing preloaded budget", e);
        }
      }
    }
  }, []);

  const [orderSaveNotice, setOrderSaveNotice] = useState('');
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [showRequiredOrderFieldsModal, setShowRequiredOrderFieldsModal] = useState(false);
  const [resumeOrderReviewAfterRequiredFields, setResumeOrderReviewAfterRequiredFields] = useState(false);
  const [showWhaticketLinkFieldInModal, setShowWhaticketLinkFieldInModal] = useState(false);
  const [showPostponementModal, setShowPostponementModal] = useState(false);
  const [originalDeliveryDate, setOriginalDeliveryDate] = useState("");
  const [postponementReasonType, setPostponementReasonType] = useState<'cliente' | 'empresa'>('cliente');
  const [postponementMotive, setPostponementMotive] = useState("");
  const [hasDeclaredPostponementReason, setHasDeclaredPostponementReason] = useState(false);

  // Order Modification & History States
  interface OrderSnapshot {
    id: string;
    legacy_code?: string;
    customer_name: string;
    locality: string;
    address: string;
    google_maps_link?: string;
    delivery_notes?: string;
    delivery_detail?: string;
    whaticket_link?: string;
    initial_delivery_date?: string;
    max_delivery_date?: string;
    order_date?: string;
    seller_id?: string;
    status?: string;
    total_amount?: number;
    payment_method_id?: string;
    payment_status?: string;
    freight_type?: string;
    items: Array<{
      product_id?: string;
      name?: string;
      sku?: string;
      quantity: number;
      price: number;
    }>;
    totals?: any;
  }

  const [originalOrderSnapshot, setOriginalOrderSnapshot] = useState<OrderSnapshot | null>(null);
  const [showEditConfirmModal, setShowEditConfirmModal] = useState(false);
  const [logisticsObservation, setLogisticsObservation] = useState("");
  const [editChangesSummary, setEditChangesSummary] = useState<string[]>([]);
  const [showModificationSuccessModal, setShowModificationSuccessModal] = useState(false);
  const [generatedModificationMessage, setGeneratedModificationMessage] = useState("");
  const [copiedModificationMessage, setCopiedModificationMessage] = useState(false);

  const [showOrderHistoryModal, setShowOrderHistoryModal] = useState(false);
  const [selectedOrderForHistory, setSelectedOrderForHistory] = useState<any>(null);
  const [orderHistoryRecords, setOrderHistoryRecords] = useState<any[]>([]);
  const [loadingOrderHistory, setLoadingOrderHistory] = useState(false);

  // Estados para anulación de pedidos
  const [cancelingOrder, setCancelingOrder] = useState<any>(null);
  const [showCancelOrderModal, setShowCancelOrderModal] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelReasonError, setCancelReasonError] = useState<string | null>(null);
  const [isSubmittingCancel, setIsSubmittingCancel] = useState(false);
  const [reactivatingOrderId, setReactivatingOrderId] = useState<string | null>(null);
  const [showCancelSuccessModal, setShowCancelSuccessModal] = useState(false);
  const [generatedCancelMessage, setGeneratedCancelMessage] = useState("");
  const [copiedCancelMessage, setCopiedCancelMessage] = useState(false);
  const [notifiedLogistics, setNotifiedLogistics] = useState(false);
  const [isLogisticallyRelevant, setIsLogisticallyRelevant] = useState(false);
  const [notifiedCancelTelegram, setNotifiedCancelTelegram] = useState(false);

  const formatDateDisplay = (d?: string | null) => {
    if (!d) return "Sin fecha";
    const clean = d.split('T')[0];
    const parts = clean.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return clean;
  };

  const computeOrderDiff = (
    original: OrderSnapshot | null,
    current: {
      customer_name: string;
      locality: string;
      direccion: string;
      initial_delivery_date: string;
      total: number;
      items: OrderItem[];
      flete: string;
      payment_method_name: string;
      payment_status: string;
      delivery_notes: string;
    }
  ): string[] => {
    if (!original) return ["Se modificaron los datos del pedido."];
    const diffs: string[] = [];

    // 1. Fecha de entrega
    const origDate = original.initial_delivery_date ? original.initial_delivery_date.split('T')[0] : '';
    const newDate = current.initial_delivery_date ? current.initial_delivery_date.split('T')[0] : '';
    if (origDate && newDate && origDate !== newDate) {
      diffs.push(`📅 Fecha de Entrega: cambiada de ${formatDateDisplay(origDate)} a ${formatDateDisplay(newDate)}`);
    }

    // 2. Productos
    const origItems = original.items || [];
    const newItems = current.items || [];

    const origMap = new Map<string, { name: string; qty: number; price: number }>();
    origItems.forEach(it => {
      const key = it.product_id || it.name || '';
      const existing = origMap.get(key);
      if (existing) {
        existing.qty += it.quantity;
      } else {
        origMap.set(key, { name: it.name || 'Producto', qty: it.quantity, price: it.price || 0 });
      }
    });

    const newMap = new Map<string, { name: string; qty: number; price: number }>();
    newItems.forEach(it => {
      const key = it.id || it.name;
      const existing = newMap.get(key);
      const pr = it.customPrice !== undefined ? it.customPrice : (it.price || 0);
      if (existing) {
        existing.qty += it.quantity;
      } else {
        newMap.set(key, { name: it.name, qty: it.quantity, price: pr });
      }
    });

    newMap.forEach((val, key) => {
      const orig = origMap.get(key);
      if (!orig) {
        diffs.push(`➕ Producto agregado: ${val.qty}x ${val.name} (${formatPrice(val.price)})`);
      } else if (orig.qty !== val.qty) {
        diffs.push(`📦 Cantidad cambiada: ${val.name} (de ${orig.qty} a ${val.qty})`);
      } else if (Math.abs(orig.price - val.price) > 1) {
        diffs.push(`💲 Precio cambiado: ${val.name} (de ${formatPrice(orig.price)} a ${formatPrice(val.price)})`);
      }
    });

    origMap.forEach((val, key) => {
      if (!newMap.has(key)) {
        diffs.push(`➖ Producto quitado: ${val.qty}x ${val.name}`);
      }
    });

    // 3. Cliente
    if (original.customer_name && current.customer_name && original.customer_name.trim().toLowerCase() !== current.customer_name.trim().toLowerCase()) {
      diffs.push(`👤 Cliente: cambiado de "${original.customer_name}" a "${current.customer_name}"`);
    }

    // 4. Dirección y localidad
    if (original.locality && current.locality && original.locality.trim().toLowerCase() !== current.locality.trim().toLowerCase()) {
      diffs.push(`📍 Localidad: cambiada de "${original.locality}" a "${current.locality}"`);
    }
    if (original.address && current.direccion && original.address.trim().toLowerCase() !== current.direccion.trim().toLowerCase()) {
      diffs.push(`🏠 Dirección: cambiada de "${original.address}" a "${current.direccion}"`);
    }

    // 5. Monto total
    if (original.total_amount !== undefined && Math.abs(original.total_amount - current.total) > 1) {
      diffs.push(`💰 Monto Total: de ${formatPrice(original.total_amount)} a ${formatPrice(current.total)}`);
    }

    // 6. Flete
    if (original.freight_type && current.flete && original.freight_type !== current.flete) {
      diffs.push(`🚚 Flete: de "${original.freight_type}" a "${current.flete}"`);
    }

    // 7. Estado de Pago
    const normalizePayStatus = (s?: string) => {
      if (!s) return 'Contra Entrega';
      const clean = s.trim().toLowerCase();
      if (clean === 'abonado' || clean === 'pagado') return 'Abonado';
      if (clean === 'seniado' || clean === 'señado' || clean === 'parcial') return 'Señado';
      if (clean === 'pendiente' || clean === 'contra entrega' || clean === 'contra_entrega' || clean === 'no abonado') return 'Contra Entrega';
      return s;
    };

    const origPayStatus = normalizePayStatus(original.payment_status);
    const currPayStatus = normalizePayStatus(current.payment_status);
    if (origPayStatus !== currPayStatus) {
      diffs.push(`💳 Estado de Pago: de "${origPayStatus}" a "${currPayStatus}"`);
    }

    // 8. Aclaraciones
    const origNotes = (original.delivery_notes || '').trim();
    const newNotes = (current.delivery_notes || '').trim();
    if (origNotes !== newNotes && newNotes) {
      diffs.push(`📝 Detalle Entrega: "${newNotes}"`);
    }

    if (diffs.length === 0) {
      diffs.push("ℹ️ Actualización general de información del pedido.");
    }

    return diffs;
  };

  const isLogisticallyRelevantChange = (diffs: string[], observation?: string): boolean => {
    if (observation && observation.trim()) return true;
    const logisticalKeywords = [
      '📅 Fecha de Entrega',
      '➕ Producto agregado',
      '➖ Producto quitado',
      '📦 Cantidad cambiada',
      '🏠 Dirección',
      '📍 Localidad',
      '🚚 Flete',
      '💳 Estado de Pago',
      '💰 Monto Total',
      '📝 Detalle Entrega'
    ];
    return diffs.some(d => logisticalKeywords.some(kw => d.startsWith(kw)));
  };

  const buildCopyableModificationMessage = (params: {
    legacyCode: string;
    sellerName?: string;
    changes: string[];
    logisticsObservation?: string;
    operationalSync?: {
      central?: { success: boolean; sheetName?: string; message?: string };
      deliveriesCurrent?: { success: boolean; sheetName?: string; message?: string };
    };
  }): string => {
    const lines: string[] = [];
    const sellerTag = params.sellerName ? ` (${params.sellerName})` : '';
    lines.push(`📝 **PEDIDO MODIFICADO: ${params.legacyCode}${sellerTag}**`);
    lines.push(``);
    lines.push(`🔄 **CAMBIOS REALIZADOS:**`);
    params.changes.forEach(c => lines.push(`• ${c}`));
    if (params.logisticsObservation && params.logisticsObservation.trim()) {
      lines.push(``);
      lines.push(`💬 **Observación para Logística:** ${params.logisticsObservation.trim()}`);
    }

    if (params.operationalSync) {
      const central = params.operationalSync.central;
      const deliveries = params.operationalSync.deliveriesCurrent;
      lines.push(``);
      lines.push(`📊 **SINCRONIZACIÓN DE PLANILLAS:**`);
      lines.push(central?.success
        ? `✅ Cambio en Central${central.sheetName ? ` (${central.sheetName})` : ''}`
        : `❌ Cambio en Central: ${central?.message || 'No se pudo sincronizar'}`);
      lines.push(deliveries?.success
        ? `✅ Cambio en Entregas Actual (${deliveries.sheetName || 'Hoja no informada'})`
        : `❌ Cambio en Entregas Actual: ${deliveries?.message || 'No se pudo sincronizar'}`);
    }

    return lines.join('\n');
  };

  const buildCopyableCancelMessage = (params: {
    legacyCode: string;
    sellerName?: string;
    reason: string;
  }): string => {
    const lines: string[] = [];
    const sellerTag = params.sellerName ? ` (${params.sellerName})` : '';
    lines.push(`🚨 **PEDIDO ANULADO: ${params.legacyCode}${sellerTag}**`);
    lines.push(`❌ **Motivo de Anulación:** ${params.reason.trim()}`);

    return lines.join('\n');
  };

  const copyRichMessageToClipboard = async (text: string): Promise<boolean> => {
    try {
      const html = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
        .replace(/\n/g, '<br/>');

      if (navigator?.clipboard && typeof ClipboardItem !== 'undefined') {
        const textBlob = new Blob([text], { type: 'text/plain' });
        const htmlBlob = new Blob([html], { type: 'text/html' });
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/plain': textBlob,
            'text/html': htmlBlob
          })
        ]);
        return true;
      } else if (navigator?.clipboard) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (e) {
      console.warn("Clipboard write rich text fallback:", e);
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (err) {
        console.error("All clipboard write attempts failed:", err);
        return false;
      }
    }
    return false;
  };

  const handleOpenCancelModal = (order: any) => {
    setCancelingOrder(order);
    setCancelReason("");
    setCancelReasonError(null);
    setShowCancelOrderModal(true);
  };

  const handleConfirmCancelOrder = async () => {
    if (!cancelingOrder) return;
    const trimmedReason = cancelReason.trim();
    if (!trimmedReason) {
      setCancelReasonError("El motivo de anulación es obligatorio.");
      return;
    }

    try {
      setIsSubmittingCancel(true);
      setCancelReasonError(null);

      const { data: userData } = await supabase.auth.getUser();
      const currentUserId = userData?.user?.id;
      let sellerFullName = cancelingOrder.sellers?.full_name || sellersList.find(s => s.id === cancelingOrder.seller_id)?.full_name;
      if (!sellerFullName) {
        sellerFullName = (cancelingOrder.seller_id === currentUserId ? (currentSeller?.full_name || userData?.user?.user_metadata?.full_name) : '') || 'Vendedor';
      }

      // 1. Actualizar estado del pedido a 'Cancelado'
      const { error: updateOrderErr } = await supabase
        .from('orders')
        .update({
          status: 'Cancelado',
          cancel_reason: trimmedReason
        })
        .eq('id', cancelingOrder.id);

      if (updateOrderErr) throw updateOrderErr;

      // 2. Liberar reserva de inventario para los ítems del pedido
      try {
        const { data: orderItems } = await supabase
          .from('order_items')
          .select('product_id, quantity')
          .eq('order_id', cancelingOrder.id);

        if (orderItems && orderItems.length > 0) {
          const cancelTxs = orderItems
            .filter(item => item.product_id)
            .map(item => ({
              productId: item.product_id,
              quantity: item.quantity,
              type: 'Cancelacion Pedido' as const,
              referenceId: cancelingOrder.id,
              userId: cancelingOrder.seller_id || currentUserId
            }));

          if (cancelTxs.length > 0) {
            await createBulkStockTransactions(supabase, cancelTxs);
          }
        }
      } catch (stockErr) {
        console.error("Error liberando reservas al anular:", stockErr);
      }

      // 3. Registrar en order_history
      try {
        await supabase.from('order_history').insert({
          order_id: cancelingOrder.id,
          changed_by_id: currentUserId,
          changed_by_name: sellerFullName,
          change_reason: `Anulación: ${trimmedReason}`,
          original_data: cancelingOrder,
          modified_data: {
            status: 'Cancelado',
            cancel_reason: trimmedReason
          },
          changed_at: new Date().toISOString()
        });
      } catch (histErr) {
        console.error("Error registrando anulación en order_history:", histErr);
      }

      setOrderSaveNotice('Pedido anulado en el ERP. Central, Entregas Actual y la planilla de la vendedora se actualizan en segundo plano. El resultado aparecerá en la bandeja.');
      window.dispatchEvent(new Event('order-sync-updated'));
      setOrders(prev =>
        prev.map(o => o.id === cancelingOrder.id ? { ...o, status: 'Cancelado' } : o)
      );

      setShowCancelOrderModal(false);
    } catch (err: any) {
      console.error("Error al anular pedido:", err);
      alert(`Error al anular el pedido: ${err.message || 'Error desconocido'}`);
    } finally {
      setIsSubmittingCancel(false);
    }
  };

  const handleReactivateOrder = async (order: { id: string; legacy_code?: string | null }) => {
    if (!window.confirm(`¿Reactivar el pedido ${order.legacy_code || ''}? Se volverá a reservar el stock y se actualizarán las planillas.`)) return;
    try {
      setReactivatingOrderId(order.id);
      const { error } = await supabase.rpc('reactivate_order', { p_order_id: order.id });
      if (error) throw error;
      setOrders(prev => prev.map(item => item.id === order.id
        ? { ...item, status: 'Pendiente', cancel_reason: null } : item));
      setOrderSaveNotice('Pedido reactivado en el ERP. Central, Entregas Actual y Cancelados se sincronizan en segundo plano; el resultado aparecerá en la bandeja.');
      window.dispatchEvent(new Event('order-sync-updated'));
      setRefreshTrigger(prev => prev + 1);
    } catch (error: any) {
      alert(`No se pudo reactivar el pedido: ${error.message || 'Error desconocido'}`);
    } finally {
      setReactivatingOrderId(null);
    }
  };

  const handleOpenOrderHistory = async (order: any) => {
    setSelectedOrderForHistory(order);
    setShowOrderHistoryModal(true);
    setLoadingOrderHistory(true);
    try {
      const { data, error } = await supabase
        .from('order_history')
        .select('*')
        .eq('order_id', order.id)
        .order('changed_at', { ascending: false });

      if (error) throw error;
      setOrderHistoryRecords(data || []);
    } catch (err: any) {
      console.error('Error fetching order history:', err);
      alert('Error al consultar historial de modificaciones: ' + (err.message || err));
    } finally {
      setLoadingOrderHistory(false);
    }
  };

  // Helper to generate next sequential legacy code for a seller
  const generateNextLegacyCode = async (userId: string) => {
    if (!userId) return;
    if (editingOrderIdRef.current || editingOrderId) {
      console.log('[generateNextLegacyCode] Omitido: el formulario está en modo edición');
      return;
    }
    if (isWholesaleContext) {
      setLegacyCode('');
      return;
    }
    try {
      // Los pedidos minoristas conservan el código de la planilla del vendedor.
      try {
        const sheetRes = await fetch(`/api/vendedores/create-sheet-order?sellerId=${userId}`);
        if (sheetRes.ok) {
          const sheetData = await sheetRes.json();
          if (editingOrderIdRef.current || editingOrderId) return;
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

      if (editingOrderIdRef.current || editingOrderId) return;
      setLegacyCode(candidateCode);
    } catch (err) {
      console.error("Error generating legacy code:", err);
      if (!editingOrderIdRef.current && !editingOrderId) {
        setLegacyCode(`ZC${Date.now().toString().slice(-6)}`);
      }
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

        const PEDIDOS_CACHE_VER = "zc_pedidos_v23_wholesale_sources";
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
          const validCachedProducts = Array.isArray(parsedCache) ? parsedCache.filter((p: any) => p && p.is_active !== false) : [];
          setAllProducts(validCachedProducts);
          setProducts(validCachedProducts);
          setClients(JSON.parse(cachedClients));
          setLocalities(JSON.parse(cachedLocalities));
          const cachedZones = sessionStorage.getItem("cached_pedidos_zones");
          if (cachedZones) {
            try { setZones(JSON.parse(cachedZones)); } catch (e) {}
          }
          setDeliveryTimes(JSON.parse(cachedDt));
          if (cachedKits) setKits(JSON.parse(cachedKits));
          try {
            const parsedAdv = JSON.parse(cachedAdv);
            const cleanAdv = Array.isArray(parsedAdv)
              ? parsedAdv.filter((a: any) => a && a.is_active !== false && ALLOWED_ADVERTISING_SOURCES.includes(a.name))
              : [];
            if (cleanAdv.length > 0) {
              setAdvertisingSources(cleanAdv);
            }
          } catch (e) {
            // Mantener DEFAULT_ADVERTISING_SOURCES
          }
          try {
            const parsedMed = JSON.parse(cachedMediums);
            const cleanMed = Array.isArray(parsedMed)
              ? parsedMed.filter((m: any) => m && m.is_active !== false && ALLOWED_ORDER_MEDIUMS.includes(m.name))
              : [];
            setOrderMediums(cleanMed);
          } catch (e) {
            setOrderMediums([]);
          }
          setPhoneLines(JSON.parse(cachedLines));
          setIsOrganic(cachedOrganic === 'true');
          setDbPaymentMethods(JSON.parse(cachedPayMethods));
        }

        const cacheExists = !!(cachedProducts && cachedClients && cachedLocalities && cachedDt && cachedType && cachedAdv && cachedMediums && cachedLines && cachedOrganic && cachedPayMethods);
        if (cacheExists) {
          // Asegurar que sellersList y currentSeller estén disponibles
          if (!cachedSellers || !cachedCurrentSeller) {
            const [sellersRes, curSellerRes] = await Promise.all([
              supabase.from('sellers').select('id, full_name, email, role, roles').eq('is_active', true).order('full_name'),
              supabase.from('sellers').select('id, full_name, email, role, roles, seller_type, is_organic').eq('id', userId).maybeSingle()
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

          // Refrescar SIEMPRE metadatos editables para que nuevas procedencias,
          // medios y recargos no queden ocultos por una sesión anterior.
          try {
            const [freshAdvRes, freshMediumsRes, freshPmsRes] = await Promise.all([
              supabase.from('advertising_sources').select('*').eq('is_active', true).order('name'),
              supabase.from('order_mediums').select('*').eq('is_active', true).order('name'),
              supabase.from('payment_methods').select('*').eq('is_active', true).order('name')
            ]);
            const freshAdv = (freshAdvRes.data || []).filter((a: any) => ALLOWED_ADVERTISING_SOURCES.includes(a.name));
            if (!freshAdvRes.error && freshAdv.length > 0) {
              setAdvertisingSources(freshAdv);
              sessionStorage.setItem("cached_pedidos_adv", JSON.stringify(freshAdv));
              try { localStorage.setItem("cached_pedidos_adv", JSON.stringify(freshAdv)); } catch (e) {}
            }
            const freshMediums = (freshMediumsRes.data || []).filter((m: any) => ALLOWED_ORDER_MEDIUMS.includes(m.name));
            if (!freshMediumsRes.error && freshMediums.length > 0) {
              setOrderMediums(freshMediums);
              sessionStorage.setItem("cached_pedidos_mediums", JSON.stringify(freshMediums));
            }
            const freshPms = freshPmsRes.data;
            const pmsErr = freshPmsRes.error;
            if (!pmsErr && freshPms && freshPms.length > 0) {
              setDbPaymentMethods(freshPms);
              sessionStorage.setItem("cached_pedidos_payment_methods", JSON.stringify(freshPms));
            }
          } catch (e) {}

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
        if (!res.ok) {
          const errorPayload = await res.json().catch(() => null);
          const apiMessage = errorPayload?.error || errorPayload?.message;
          throw new Error(apiMessage ? `HTTP ${res.status}: ${apiMessage}` : `HTTP error ${res.status}`);
        }
        
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
          const cleanAdv = (payload.advertisingSources || []).filter((a: any) => a && a.is_active !== false && ALLOWED_ADVERTISING_SOURCES.includes(a.name));
          if (cleanAdv.length > 0) {
            setAdvertisingSources(cleanAdv);
            sessionStorage.setItem("cached_pedidos_adv", JSON.stringify(cleanAdv));
            try {
              localStorage.setItem("cached_pedidos_adv", JSON.stringify(cleanAdv));
            } catch (e) {}
          }
        }
        if (payload.orderMediums) {
          const cleanMed = (payload.orderMediums || []).filter((m: any) => m && m.is_active !== false && ALLOWED_ORDER_MEDIUMS.includes(m.name));
          setOrderMediums(cleanMed);
          sessionStorage.setItem("cached_pedidos_mediums", JSON.stringify(cleanMed));
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

        if (payload.zones) {
          setZones(payload.zones);
          sessionStorage.setItem("cached_pedidos_zones", JSON.stringify(payload.zones));
        }

        if (payload.deliveryTimes) {
          setDeliveryTimes(payload.deliveryTimes);
          sessionStorage.setItem("cached_pedidos_dt", JSON.stringify(payload.deliveryTimes));
        }

        if (payload.products) {
          setAllProducts(payload.products);
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
    if (dbPaymentMethods.length > 0 && !editingOrderId) {
      const defaultPm = dbPaymentMethods.find(pm => 
        pm.id === "a3a890a8-b677-4b7b-8ffb-d36c2e7b5ad3" || 
        (pm.name && pm.name.toLowerCase().includes("efectivo"))
      ) || dbPaymentMethods.find(pm => pm.is_default) || dbPaymentMethods[0];

      if (defaultPm) {
        if (!selectedPaymentMethodId || selectedPaymentMethodId === "a3a890a8-b677-4b7b-8ffb-d36c2e7b5ad3") {
          setSelectedPaymentMethodId(defaultPm.id);
          setCardSurcharge(defaultPm.surcharge_percentage || 0);
          setCardInstallments(defaultPm.installments || 1);
        }
        setPaymentsList(prev => {
          if (
            prev.length === 1 &&
            (!prev[0].amount || prev[0].amount === 0) &&
            (prev[0].payment_method_id === "a3a890a8-b677-4b7b-8ffb-d36c2e7b5ad3" || !prev[0].payment_method_id)
          ) {
            return [{
              ...prev[0],
              payment_method_id: defaultPm.id,
              card_surcharge: defaultPm.surcharge_percentage || 0,
              card_installments: defaultPm.installments || 1
            }];
          }
          return prev;
        });
      }
    }
  }, [dbPaymentMethods, editingOrderId]);

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
        setAppliedWholesaleDiscountLabel("");
        return;
      }

      if (isEditingRef.current) {
        // En modo edición de pedido, cargamos las direcciones del cliente para el dropdown,
        // pero NO pisamos los datos del formulario ya establecidos del pedido.
        const { data } = await supabase
          .from("addresses")
          .select("id, alias, full_address, locality_id, map_link, delivery_notes, is_default, created_at")
          .eq("client_id", selectedClientId)
          .order("is_default", { ascending: false })
          .order("created_at", { ascending: false });
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

      if (isWholesaleContext && !sourceQuoteId) {
        const { data: wholesaleClient } = await supabase
          .from('clients')
          .select('default_discount_coef, default_discount_label')
          .eq('id', selectedClientId)
          .maybeSingle();
        const coefficient = Number(wholesaleClient?.default_discount_coef);
        if (Number.isFinite(coefficient) && coefficient >= 0 && coefficient < 1) {
          const discountPct = Math.round((1 - coefficient) * 10000) / 100;
          setOrderDiscountType('percentage');
          setOrderDiscountValue(discountPct);
          setAppliedWholesaleDiscountLabel(wholesaleClient?.default_discount_label || `Descuento mayorista ${discountPct}%`);
        } else {
          setAppliedWholesaleDiscountLabel("");
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
        .select("id, alias, full_address, locality_id, map_link, delivery_notes, is_default, created_at")
        .eq("client_id", selectedClientId)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: false });
      
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
          setDireccion(selectedAddress.full_address ?? "");
          setLocalidadId(selectedAddress.locality_id ?? "");
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
          setDireccion(c?.billing_address || "");
          setLocalidadId("");
          setLocalitySearch("");
          setLinkMaps("");
          setAclaraciones("");
        }
      }
    }
    fetchAddresses();
  }, [selectedClientId, clients, isWholesaleContext, localities, sourceQuoteId]);

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
      setDireccion(addr.full_address ?? "");
      setLocalidadId(addr.locality_id ?? "");
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
    let isCancelled = false;
    async function fetchOrders() {
      if (activeTab === 'list') {
        setLoadingOrders(true);
        try {
          const { data: sessionData } = await supabase.auth.getSession();
          let currentUid = sessionData?.session?.user?.id || currentUserId;
          if (!currentUid) {
            const { data: userData } = await supabase.auth.getUser();
            currentUid = userData?.user?.id || '';
          }
          if (!currentUid || isCancelled) return;
          
          let query = supabase
            .from('orders')
            .select(
              selectedProducts.length > 0
                ? '*, zones(name), sellers(full_name), clients(is_wholesale), order_items!inner(product_id, product_name)'
                : '*, zones(name), sellers(full_name), clients(is_wholesale)'
            )
            .order('order_date', { ascending: false })
            .order('created_at', { ascending: false });
            
          const facundoIds = ['3820a0fe-bb0a-4a84-ad85-79e49868cad7', '54b9ce55-7354-4b39-9886-314aa79f6aa6'];
          const ludmilaIds = ['54b2d319-8f6f-47ff-b794-b7731978410a', '8207801b-b6cb-48cc-af0f-d2f9f2c98032'];
          const effectiveUserSellerIds = facundoIds.includes(currentUid)
            ? facundoIds
            : (ludmilaIds.includes(currentUid) ? ludmilaIds : [currentUid]);

          const isOnlyWholesale = selectedChannels.length === 1 && selectedChannels[0] === 'mayoristas';
          if (listType === 'mis_pedidos' || role !== 'admin') {
            if (!isOnlyWholesale) {
              query = query.in('seller_id', effectiveUserSellerIds);
            }
          }

          // When an administrator chooses a seller in the list filter, constrain
          // the database query itself instead of only changing the select label.
          if (sellerFilter !== 'todos') {
            query = query.eq('seller_id', sellerFilter);
          }

          // Apply client type filter at query level
          const hasMinoristas = selectedChannels.includes('minoristas');
          const hasMayoristas = selectedChannels.includes('mayoristas');
          if (hasMayoristas && !hasMinoristas) {
            query = query.eq('channel', 'mayorista');
          } else if (hasMinoristas && !hasMayoristas) {
            query = query.neq('channel', 'mayorista');
          }
          
          // Apply status filter
          const hasPending = selectedStatuses.includes('Pendientes');
          const hasReview = selectedStatuses.includes('En Revisión');
          const hasDelivered = selectedStatuses.includes('Entregados');
          const hasCancelled = selectedStatuses.includes('Anulados');
          const statusCount = [hasPending, hasReview, hasDelivered, hasCancelled].filter(Boolean).length;

          if (statusCount > 0 && statusCount < 4) {
            const targetStatuses: string[] = [];
            if (hasPending) targetStatuses.push('Pendiente', 'Entregando', 'En Espera', 'Modificado');
            if (hasReview) targetStatuses.push('En Revisión');
            if (hasDelivered) targetStatuses.push('Entregado');
            if (hasCancelled) targetStatuses.push('Cancelado', 'Anulado');

            if (targetStatuses.length === 1) {
              query = query.eq('status', targetStatuses[0]);
            } else if (targetStatuses.length > 1) {
              query = query.in('status', targetStatuses);
            }
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
          const isExtendedLimit = hasPending || hasReview || hasMayoristas || statusCount === 0 || statusCount === 4;
          if (isExtendedLimit) {
            query = query.limit(500);
          } else {
            query = query.limit(100);
          }
          
          const { data, error } = await query;
          if (isCancelled) return;
          if (error) {
            console.error("Error fetching orders:", error.message || error.details || JSON.stringify(error) || error);
            setOrdersError(error.message || "Error al cargar pedidos");
          } else if (data) {
            setOrdersError(null);
            setOrders(data);
          }
        } catch (err: any) {
          if (isCancelled) return;
          console.error("Error in fetchOrders:", err);
          setOrdersError(err?.message || "Error al cargar pedidos");
        } finally {
          if (!isCancelled) {
            setLoadingOrders(false);
          }
        }
      }
    }
    fetchOrders();
    return () => {
      isCancelled = true;
    };
  }, [activeTab, listType, role, sellerFilter, debouncedOrderSearch, selectedStatuses, selectedProducts, expandedSelectedProductIds, products, selectedChannels, dateFrom, dateTo, refreshTrigger]);

  // Fetch recent orders for the "Cargar desde BD" modal
  const fetchOrdersForModal = async () => {
    setLoadingDbOrders(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      let currentUid = sessionData?.session?.user?.id || currentUserId;
      if (!currentUid) {
        const { data: userData } = await supabase.auth.getUser();
        currentUid = userData?.user?.id || '';
      }
      if (!currentUid) return;

      let q = supabase
        .from('orders')
        .select('*, order_items(product_name, quantity, unit_price), sellers(full_name)')
        .order('created_at', { ascending: false })
        .limit(40);

      if (role !== 'admin') {
        const facundoIds = ['3820a0fe-bb0a-4a84-ad85-79e49868cad7', '54b9ce55-7354-4b39-9886-314aa79f6aa6'];
        const ludmilaIds = ['54b2d319-8f6f-47ff-b794-b7731978410a', '8207801b-b6cb-48cc-af0f-d2f9f2c98032'];
        const effectiveUserSellerIds = facundoIds.includes(currentUid)
          ? facundoIds
          : (ludmilaIds.includes(currentUid) ? ludmilaIds : [currentUid]);
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
    if (!isClone && (order.status === 'Cancelado' || order.status === 'Anulado')) {
      setOrderSaveNotice('Reactivá el pedido desde la lista antes de editarlo.');
      return;
    }
    if (!isClone && order.totals?.integration_payload) {
      const { data: job, error } = await supabase.from('order_sync_jobs').select('status').eq('order_id',order.id)
        .in('status', ['awaiting_items','pending','processing']).limit(1).maybeSingle();
      if (error || (job && ['awaiting_items','pending','processing'].includes(job.status))) {
        setOrderSaveNotice('Este pedido todavía se está sincronizando. Podés cargar otro mientras termina; su estado está en la bandeja.');
        return;
      }
    }
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
      const orderHasKit = (itemsData || []).some(it => {
        const n = (it.product_name || "").toLowerCase();
        return n.includes("kit instalaci") || n.includes("kit de instalaci") || n.startsWith("kit ");
      });

      const mappedItems: OrderItem[] = (itemsData || []).map(item => {
        const prod = products.find(p => p.id === item.product_id);
        const isIncludedZero = item.unit_price === 0;
        const basePrice = isIncludedZero ? 0 : (prod?.price || item.unit_price);
        const discountType = (item.discount_percentage && item.discount_percentage > 0 && !isIncludedZero) ? 'percentage' : undefined;
        const discountValue = (item.discount_percentage && item.discount_percentage > 0 && !isIncludedZero) ? item.discount_percentage : undefined;
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
          discountValue: discountValue,
          isIncludedInKit: isIncludedZero ? true : undefined
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
      setAclaraciones(cleanDeliveryNotes(order.delivery_notes));
      
      let locId = "";
      if (order.shipping_address_snapshot && order.shipping_address_snapshot.locality_id) {
        locId = order.shipping_address_snapshot.locality_id;
      }
      
      if (!locId && order.locality) {
        // 1. Coincidencia exacta insensible a mayúsculas
        let foundLoc = localities.find(l => l.name.toLowerCase() === order.locality.toLowerCase());
        
        // 2. Coincidencia normalizada (sin paréntesis ni tildes, ej: "Caballito" matchea con "Caballito (CABA)")
        if (!foundLoc) {
          const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s*\(.*?\)/g, "").trim();
          const targetNorm = norm(order.locality);
          foundLoc = localities.find(l => norm(l.name) === targetNorm);
        }
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
      const hasPartialIvaInPayments = totalsObj.payments_breakdown?.some((p: any) => Boolean(p.has_iva));
      setIncludeIVA(totalsObj.tax > 0 && !hasPartialIvaInPayments);
      
      if (totalsObj.order_discount_type) {
        setOrderDiscountType(totalsObj.order_discount_type);
      } else {
        setOrderDiscountType('percentage');
      }
      if (totalsObj.order_discount_value !== undefined) {
        setOrderDiscountValue(totalsObj.order_discount_value);
      } else if (totalsObj.order_discount_amount !== undefined) {
        setOrderDiscountValue(totalsObj.order_discount_amount);
      } else {
        setOrderDiscountValue(0);
      }
      if (Array.isArray(totalsObj.order_discounts) && totalsObj.order_discounts.length > 0) {
        setOrderDiscounts(totalsObj.order_discounts);
        setOrderDiscountValue(0);
      } else {
        setOrderDiscounts([]);
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
        editingOrderIdRef.current = null;
        setEditingOrderId(null);
        setOriginalOrderSnapshot(null);
        setSelectedSellerId(currentUserId);
        if (currentUserId) {
          generateNextLegacyCode(currentUserId);
        } else {
          setLegacyCode("");
        }
      } else {
        editingOrderIdRef.current = order.id;
        setEditingOrderId(order.id);
        if (order.seller_id) {
          setSelectedSellerId(order.seller_id);
        }
        setLegacyCode(order.legacy_code || "");
        setOriginalOrderSnapshot({
          id: order.id,
          legacy_code: order.legacy_code || "",
          customer_name: order.customer_name || "",
          locality: order.locality || "",
          address: order.address || "",
          google_maps_link: order.google_maps_link || "",
          delivery_notes: cleanDeliveryNotes(order.delivery_notes),
          delivery_detail: cleanDeliveryNotes(order.delivery_detail),
          whaticket_link: order.whaticket_link || "",
          initial_delivery_date: order.initial_delivery_date ? order.initial_delivery_date.split('T')[0] : "",
          max_delivery_date: order.max_delivery_date ? order.max_delivery_date.split('T')[0] : "",
          order_date: order.order_date ? order.order_date.split('T')[0] : "",
          seller_id: order.seller_id,
          status: order.status,
          total_amount: order.total_amount,
          payment_method_id: order.payment_method_id,
          payment_status: order.payment_status,
          freight_type: order.freight_type,
          items: mappedItems.map(it => ({
            product_id: it.id,
            name: it.name,
            sku: it.sku,
            quantity: it.quantity,
            price: it.customPrice !== undefined ? it.customPrice : it.price
          })),
          totals: order.totals
        });
      }
      
      setSelectedAdvertisingSourceId(order.advertising_source_id || "");
      setAdvertisingSourceDetail(order.advertising_source_detail || "");
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
      setDeliveryDetail(cleanDeliveryNotes(order.delivery_detail));
      
      setOrderStatus(order.status || "Pendiente");
      setHoldReason(order.hold_reason || "");
      setHoldProductId(order.hold_product_id || "");
      setOrderCategory(order.category || "auto");
      setCommercialBrand(
        order.commercial_brand === 'aquafort' || order.commercial_brand === 'zono'
          ? order.commercial_brand
          : (order.channel === 'mayorista' ? 'aquafort' : 'zono')
      );
      
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

  const resetAllFormFields = () => {
    editingOrderIdRef.current = null;
    setEditingOrderId(null);
    setSourceQuoteId(null);
    setOriginalDeliveryDate("");
    setHasDeclaredPostponementReason(false);
    setPostponementMotive("");
    setPostponementReasonType('cliente');
    const resetOrderDate = formatDateInput(new Date());
    setEntregaInicial(isWholesaleContext ? formatDateInput(calculateNthWeekday(resetOrderDate, 1)) : "");
    setEntregaMaxima(isWholesaleContext ? formatDateInput(calculateNthWeekday(resetOrderDate, 7)) : "");
    setFechaPedido(resetOrderDate);
    setCliente("");
    setDireccion("");
    setAclaraciones("");
    setLinkMaps("");
    setFlete("");
    const defaultPm = dbPaymentMethods.find(pm => 
      pm.id === "a3a890a8-b677-4b7b-8ffb-d36c2e7b5ad3" || 
      (pm.name && pm.name.toLowerCase().includes("efectivo"))
    ) || dbPaymentMethods.find(pm => pm.is_default) || dbPaymentMethods[0];
    setPaymentType('efectivo');
    setCardInstallments(defaultPm ? (defaultPm.installments || 1) : 1);
    setCardSurcharge(defaultPm ? (defaultPm.surcharge_percentage || 0) : 0);
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
        payment_method_id: defaultPm ? defaultPm.id : "a3a890a8-b677-4b7b-8ffb-d36c2e7b5ad3",
        amount: 0,
        card_surcharge: defaultPm ? (defaultPm.surcharge_percentage || 0) : 0,
        card_installments: defaultPm ? (defaultPm.installments || 1) : 1,
        receipt_url: "",
        notes: "",
        has_iva: false,
        iva_mode: 'included'
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
    setOrderDiscountType('percentage');
    setOrderDiscountValue(0);
    setOrderDiscounts([]);
    setOrderCategory("auto");
    setCommercialBrand(isWholesaleContext || FACUNDO_SELLER_IDS.includes(currentUserId) ? 'aquafort' : 'zono');
    setSelectedSellerId(currentUserId);
    if (currentUserId) {
      generateNextLegacyCode(currentUserId);
    }
    setSelectedAdvertisingSourceId("");
    setAdvertisingSourceDetail("");
    setSelectedOrderMediumId(
      isWholesaleContext ? (orderMediums.find(medium => medium.name.toLowerCase() === 'whatsapp')?.id || '') : ''
    );
    setSelectedPhoneLineId("");
    setDeliveryDetail("");
    setOrderStatus("Pendiente");
    setHoldReason("");
    setHoldProductId("");
  };

  const handleCancelOrExitForm = () => {
    const isDirty = Boolean(editingOrderId || orderItems.length > 0 || cliente.trim() || direccion.trim());
    if (isDirty) {
      const confirmMsg = editingOrderId
        ? "¿Deseás cancelar la edición de este pedido y volver al listado? Se descartarán los cambios no guardados."
        : "¿Deseás cancelar y salir al listado de pedidos? Se descartarán los datos ingresados.";
      if (!window.confirm(confirmMsg)) {
        return;
      }
    }
    resetAllFormFields();
    setActiveTab('list');
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      params.delete("tab");
      const newPath = params.toString() ? `${window.location.pathname}?${params.toString()}` : window.location.pathname;
      window.history.replaceState(null, "", newPath);
    }
  };

  const handleStartNewOrder = () => {
    if (editingOrderId || orderItems.length > 0 || cliente.trim() || direccion.trim()) {
      if (!window.confirm("¿Deseás iniciar una nueva carga de pedido en blanco? Se descartarán los datos ingresados actualmente.")) {
        return;
      }
    }
    resetAllFormFields();
    setActiveTab('form');
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      params.set("tab", "form");
      window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
    }
  };


  // Helper para convertir cualquier objeto de pedido (de la tabla o del form) a PrintableOrderData
  const formatOrderForPrintable = async (rawOrder: any): Promise<PrintableOrderData> => {
    // 1. Obtener los ítems si faltan datos de precios o cantidades
    let items = rawOrder.order_items || [];
    if (!items || items.length === 0 || (!items[0].unit_price && !items[0].customPrice)) {
      try {
        const { data: itms } = await supabase
          .from('order_items')
          .select('*')
          .eq('order_id', rawOrder.id);
        if (itms && itms.length > 0) items = itms;
      } catch (err) {
        console.warn("Error cargando items del pedido para comprobante:", err);
      }
    }

    // 2. Datos del cliente (teléfonos si no vienen en la consulta)
    let clientPhone = rawOrder.client_phone || "";
    let clientPhone2 = rawOrder.client_phone_secondary || "";
    if (!clientPhone && rawOrder.client_id) {
      const c = clients.find(cl => cl.id === rawOrder.client_id);
      if (c) {
        clientPhone = c.phone_primary || "";
        clientPhone2 = c.phone_secondary || "";
      } else {
        try {
          const { data: cData } = await supabase
            .from("clients")
            .select("phone_primary, phone_secondary")
            .eq("id", rawOrder.client_id)
            .maybeSingle();
          if (cData) {
            clientPhone = cData.phone_primary || "";
            clientPhone2 = cData.phone_secondary || "";
          }
        } catch (err) {
          console.warn("Error al buscar teléfono del cliente:", err);
        }
      }
    }

    // 3. Vendedor
    let sellerName = rawOrder.sellers?.full_name || rawOrder.totals?.seller;
    if (!sellerName && rawOrder.seller_id) {
      const s = sellersList.find(sl => sl.id === rawOrder.seller_id);
      sellerName = s?.full_name || "Vendedor";
    }

    // 4. Nombre de Método de pago y totales
    const pm = dbPaymentMethods.find(m => m.id === rawOrder.payment_method_id);
    const pmName = pm?.name || "Efectivo / Transferencia";
    const totalsObj = rawOrder.totals || {};

    const zoneName = rawOrder.zones 
      ? (Array.isArray(rawOrder.zones) ? rawOrder.zones[0]?.name : rawOrder.zones.name) 
      : undefined;

    const advName = advertisingSources.find(a => a.id === rawOrder.advertising_source_id)?.name;
    const medName = orderMediums.find(m => m.id === rawOrder.order_medium_id)?.name;

    return {
      id: rawOrder.id,
      legacy_code: rawOrder.legacy_code || "",
      created_at: rawOrder.created_at,
      order_date: rawOrder.order_date || rawOrder.created_at,
      customer_name: rawOrder.customer_name || "Cliente",
      client_phone: clientPhone,
      client_phone_secondary: clientPhone2,
      address: rawOrder.address || "",
      locality: rawOrder.locality || "",
      zone_name: zoneName,
      google_maps_link: rawOrder.google_maps_link || "",
      whaticket_link: rawOrder.whaticket_link || "",
      seller_name: sellerName,
      status: rawOrder.status || "Pendiente",
      channel: rawOrder.channel || "",
      commercial_brand: rawOrder.commercial_brand || (rawOrder.channel === 'mayorista' ? 'aquafort' : 'zono'),
      advertising_source_name: advName,
      order_medium_name: medName,
      freight_type: rawOrder.freight_type || "Flete Regular",
      initial_delivery_date: rawOrder.initial_delivery_date || "",
      max_delivery_date: rawOrder.max_delivery_date || "",
      delivery_notes: cleanDeliveryNotes(rawOrder.delivery_notes) || "",
      delivery_detail: cleanDeliveryNotes(rawOrder.delivery_detail) || "",
      payment_method_name: pmName,
      payment_status: rawOrder.payment_status || "Impago",
      total_amount: rawOrder.total_amount || totalsObj.total || 0,
      subtotal: totalsObj.subtotal,
      order_discount_type: totalsObj.order_discount_type,
      order_discount_value: totalsObj.order_discount_value,
      order_discount_amount: totalsObj.order_discount_amount,
      order_discounts: totalsObj.order_discounts,
      freight_cost: totalsObj.freight,
      surcharges: totalsObj.payment_surcharges,
      tax: totalsObj.tax,
      deposit_amount: totalsObj.deposit_amount,
      deposit_receipt_url: totalsObj.deposit_receipt_url,
      pending_balance: totalsObj.pending_balance,
      order_items: (items || []).map((it: any) => {
        let sku = it.sku || "";
        if ((!sku || sku.startsWith("AUTO-")) && it.product_id) {
          const prod = products.find(p => p.id === it.product_id);
          if (prod?.sku && !prod.sku.startsWith("AUTO-")) sku = prod.sku;
        }
        if (!sku && it.product_name) {
          const prod = products.find(p => p.name === it.product_name || p.sku === it.product_name);
          if (prod?.sku && !prod.sku.startsWith("AUTO-")) sku = prod.sku;
        }
        return {
          id: it.id,
          product_id: it.product_id,
          product_name: it.product_name || it.name,
          name: it.product_name || it.name,
          sku: sku,
          quantity: it.quantity || 1,
          unit_price: it.unit_price !== undefined ? it.unit_price : it.customPrice,
          customPrice: it.customPrice !== undefined ? it.customPrice : it.unit_price
        };
      })
    };
  };

  // Abrir modal de solo lectura
  const handleOpenViewOrder = async (order: any) => {
    try {
      const formatted = await formatOrderForPrintable(order);
      setSelectedOrderForView(formatted);
      setIsViewOrderModalOpen(true);
    } catch (err) {
      console.error("Error al abrir visualización del pedido:", err);
      alert("Error al cargar los datos del pedido.");
    }
  };

  // Abrir modal de comprobante imprimible
  const handleOpenPrintOrder = async (order: any) => {
    try {
      const formatted = await formatOrderForPrintable(order);
      setSelectedOrderForPrint(formatted);
      setIsPrintOrderModalOpen(true);
    } catch (err) {
      console.error("Error al abrir comprobante del pedido:", err);
      alert("Error al cargar los datos para el comprobante.");
    }
  };

  // Generar comprobante del pedido actual que se está cargando/editando en el formulario
  const handleOpenCurrentFormPrintable = async () => {
    if (orderItems.length === 0) {
      alert("Agregá al menos un producto al pedido para generar el comprobante.");
      return;
    }

    const sellerObj = sellersList.find(s => s.id === selectedSellerId);
    const locObj = localities.find(l => l.id === localidadId);
    const pmObj = dbPaymentMethods.find(p => p.id === selectedPaymentMethodId);

    const currentFormData: PrintableOrderData = {
      id: editingOrderId || "NUEVO",
      legacy_code: legacyCode || "",
      created_at: new Date().toISOString(),
      order_date: fechaPedido || new Date().toISOString().split('T')[0],
      customer_name: cliente || newClientName || "Cliente",
      client_phone: newClientPhones[0] || "",
      client_phone_secondary: newClientPhones[1] || "",
      address: direccion || "",
      locality: locObj?.name || "",
      zone_name: locObj?.zones?.name || "",
      google_maps_link: linkMaps || "",
      whaticket_link: whaticketLink || "",
      seller_name: sellerObj?.full_name || "Equipo Zono",
      status: orderStatus || "Pendiente",
      channel: isWholesaleContext ? 'mayorista' : 'minorista',
      commercial_brand: commercialBrand,
      advertising_source_name: advertisingSources.find(a => a.id === selectedAdvertisingSourceId)?.name,
      order_medium_name: orderMediums.find(m => m.id === selectedOrderMediumId)?.name,
      freight_type: flete || "Flete Regular",
      initial_delivery_date: entregaInicial || "",
      max_delivery_date: entregaMaxima || "",
      delivery_notes: cleanDeliveryNotes(aclaraciones) || "",
      delivery_detail: cleanDeliveryNotes(deliveryDetail) || "",
      payment_method_name: pmObj?.name || "Efectivo / Transferencia",
      payment_status: paymentTiming === 'paid' ? 'Abonado' : (paymentTiming === 'partial' ? 'Seniado' : 'Impago'),
      total_amount: total,
      subtotal: subtotal,
      order_discount_type: orderDiscountType,
      order_discount_value: orderDiscountValue,
      order_discount_amount: orderDiscountAmount,
      order_discounts: orderDiscounts,
      freight_cost: shippingAmount,
      surcharges: totalSurcharges,
      tax: ivaAmount,
      deposit_amount: paymentTiming === 'partial' ? customDepositAmount : (paymentTiming === 'paid' ? total : 0),
      deposit_receipt_url: depositReceiptUrl || "",
      pending_balance: pendingBalance,
      order_items: orderItems.map(it => {
        let sku = it.sku || "";
        if ((!sku || sku.startsWith("AUTO-")) && it.id) {
          const prod = products.find(p => p.id === it.id);
          if (prod?.sku && !prod.sku.startsWith("AUTO-")) sku = prod.sku;
        }
        if (!sku && it.name) {
          const prod = products.find(p => p.name === it.name || p.sku === it.name);
          if (prod?.sku && !prod.sku.startsWith("AUTO-")) sku = prod.sku;
        }
        return {
          id: it.id,
          product_id: it.id,
          product_name: it.name,
          name: it.name,
          sku: sku,
          quantity: it.quantity,
          unit_price: it.customPrice,
          customPrice: it.customPrice
        };
      })
    };

    setSelectedOrderForPrint(currentFormData);
    setIsPrintOrderModalOpen(true);
  };

  // Reintentar o sincronizar un pedido existente en BD directamente a la Planilla de Google
  const handleSyncExistingOrderToSheet = async (order: any) => {
    if (order.channel === 'mayorista') {
      setOrderSaveNotice('Los pedidos mayoristas se gestionan en el ERP y no se sincronizan con planillas.');
      return;
    }
    if (order.totals?.integration_payload) {
      setOrderSaveNotice('Este pedido tiene una sincronización registrada en la bandeja. Revisá allí el resultado antes de repetir una carga en planillas.');
      return;
    }
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
      const advName = advertisingSources.find(a => a.id === order.advertising_source_id)?.name ||
        (order.channel === 'mayorista' ? 'Cliente' : 'Publicidad Meta');
      const detailedSheetSource = advName === 'Otro' && order.advertising_source_detail?.trim()
        ? `Otro: ${order.advertising_source_detail.trim()}`
        : advName;
      const sheetSource = order.channel === 'mayorista'
        ? 'Mayorista'
        : (FACUNDO_SELLER_IDS.includes(sellerId) ? FACUNDO_RETAIL_SOURCE : detailedSheetSource);
      const mediumName = orderMediums.find(m => m.id === order.order_medium_id)?.name || 'WhatsApp';

      const sheetOrderPayload = {
        deliveryDate: order.initial_delivery_date ? order.initial_delivery_date.split('T')[0] : '',
        orderDate: order.order_date ? order.order_date.split('T')[0] : (order.created_at ? order.created_at.split('T')[0] : ''),
        maxDeliveryDate: order.max_delivery_date ? order.max_delivery_date.split('T')[0] : '',
        clientName: order.customer_name || '',
        phonePrimary: clientPhone,
        phoneSecondary: clientPhone2,
        whaticketLink: order.whaticket_link || '',
        source: sheetSource,
        deliveryNotes: [
          order.delivery_notes, 
          order.delivery_detail
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
          order: sheetOrderPayload,
          // Re-sincronizar un pedido histórico no debe crear filas operativas nuevas.
          syncOperational: false
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

  const handleApplyWhatsAppBudget = (budgetData: {
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
  }, mode: 'replace' | 'append') => {
    if (mode === 'replace') {
      setOrderItems(budgetData.items);
    } else {
      setOrderItems(prev => [...prev, ...budgetData.items]);
    }

    if (budgetData.orderDiscountType) setOrderDiscountType(budgetData.orderDiscountType);
    if (budgetData.orderDiscountValue !== undefined) setOrderDiscountValue(budgetData.orderDiscountValue);

    if (budgetData.paymentType) setPaymentType(budgetData.paymentType);
    if (budgetData.cardInstallments) setCardInstallments(budgetData.cardInstallments);
    if (budgetData.cardSurcharge !== undefined) setCardSurcharge(budgetData.cardSurcharge);

    if (budgetData.shippingCost !== undefined) setShippingCost(budgetData.shippingCost);

    if (budgetData.aclaraciones) {
      setAclaraciones(prev => prev ? `${prev}\n${budgetData.aclaraciones}` : budgetData.aclaraciones!);
    }

    setIsOrderSummaryExpanded(true);
    alert("¡Presupuesto de WhatsApp importado con éxito al pedido!");
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
    setOrderItems(prev => prev.map(i => {
      if (i.id !== id) return i;
      if (price === 0) {
        return {
          ...i,
          customPrice: 0,
          basePrice: 0,
          isIncludedInKit: true,
          discountType: undefined,
          discountValue: undefined
        };
      }
      return { ...i, customPrice: price };
    }));
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

  const effectiveOrderDiscounts = useMemo<OrderDiscountItem[]>(() =>
    orderDiscounts.length > 0 ? orderDiscounts : orderDiscountValue > 0
      ? [{ id: 'single-order-discount', description: appliedWholesaleDiscountLabel || 'Descuento del pedido', type: orderDiscountType, value: orderDiscountValue }]
      : [],
  [orderDiscounts, orderDiscountType, orderDiscountValue, appliedWholesaleDiscountLabel]);

  const orderDiscountBreakdown = useMemo(() =>
    calculateCascadingDiscounts(itemsGrossSubtotal, effectiveOrderDiscounts),
  [effectiveOrderDiscounts, itemsGrossSubtotal]);

  const orderDiscountAmount = orderDiscountBreakdown.reduce((sum, discount) => sum + discount.amount, 0);
  const persistedOrderDiscountType = orderDiscounts.length > 0 ? 'fixed' : orderDiscountType;
  const persistedOrderDiscountValue = orderDiscounts.length > 0 ? orderDiscountAmount : orderDiscountValue;
  const updateOrderDiscounts = (discounts: OrderDiscountItem[]) => {
    setOrderDiscounts(discounts);
    setOrderDiscountValue(0);
  };

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
                    (pm.name && (pm.name.toLowerCase().includes("tarjeta") || pm.name.toLowerCase().includes("cuota") || pm.name.toLowerCase().includes("link") || pm.name.toLowerCase().includes("payway"))));
    
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
    
    // IVA específico por pago (Facturación parcial con IVA)
    const hasIva = Boolean(p.has_iva);
    const ivaMode = p.iva_mode || 'included';
    let ivaValue = 0;
    let taxableBase = baseAmount;

    if (hasIva && !includeIVA) {
      if (ivaMode === 'added') {
        ivaValue = Math.round(baseAmount * 0.21);
        taxableBase = baseAmount;
      } else {
        // 'included': el monto abonado ya tiene el 21% de IVA incorporado
        taxableBase = Math.round(baseAmount / 1.21);
        ivaValue = Math.round(baseAmount - taxableBase);
      }
    }

    return {
      ...p,
      baseAmount,
      isCard,
      surchargePercentage: surchargePct,
      surchargeValue: surchargeVal,
      installments,
      totalAmount,
      has_iva: hasIva,
      iva_mode: ivaMode,
      ivaValue,
      taxableBase
    };
  });

  const totalSurcharges = paymentsWithSurcharges.reduce((acc, p) => acc + p.surchargeValue, 0);
  const subtotalWithSurchargeAndShipping = subtotal + totalSurcharges + shippingAmount;
  const partialIvaAmount = paymentsWithSurcharges.reduce((acc, p) => acc + (p.has_iva ? (p.ivaValue || 0) : 0), 0);
  const ivaAmount = includeIVA ? (subtotalWithSurchargeAndShipping * 0.21) : partialIvaAmount;
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
    ? clients.filter(c => {
        if (isWholesaleContext && c.is_wholesale !== true) return false;
        return (
          (c.business_name && normalizeText(c.business_name).includes(normalizeText(clientSearchQuery))) ||
          (c.phone_primary && c.phone_primary.includes(clientSearchQuery.trim())) ||
          (c.phone_secondary && c.phone_secondary.includes(clientSearchQuery.trim())) ||
          (c.phone && c.phone.includes(clientSearchQuery.trim()))
        );
      })
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
    const hasMinoristas = selectedChannels.includes('minoristas');
    const hasMayoristas = selectedChannels.includes('mayoristas');

    if (hasMinoristas && !hasMayoristas && isWholesale) return false;
    if (hasMayoristas && !hasMinoristas && !isWholesale) return false;

    const hasPending = selectedStatuses.includes('Pendientes');
    const hasReview = selectedStatuses.includes('En Revisión');
    const hasDelivered = selectedStatuses.includes('Entregados');
    const hasCancelled = selectedStatuses.includes('Anulados');
    const statusCount = [hasPending, hasReview, hasDelivered, hasCancelled].filter(Boolean).length;

    if (statusCount > 0 && statusCount < 4) {
      const isCancelled = p.status === 'Cancelado' || p.status === 'Anulado';
      const isDelivered = p.status === 'Entregado';
      const isReview = p.status === 'En Revisión';
      const isPending = !isCancelled && !isDelivered && !isReview;

      let match = false;
      if (hasPending && isPending) match = true;
      if (hasReview && isReview) match = true;
      if (hasDelivered && isDelivered) match = true;
      if (hasCancelled && isCancelled) match = true;
      if (!match) return false;
    }
    
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
        
        if (isWholesaleContext && !c.is_wholesale) return false;
        return numbers.some(num => {
          if (num === targetCleanNoPrefix) return true;
          if (targetCleanNoPrefix.length >= 8 && num.length >= 8) {
            return num.includes(targetCleanNoPrefix) || targetCleanNoPrefix.includes(num);
          }
          return false;
        });
      })
    : null;

  const openOrderReview = () => {
    if (editingOrderId) {
      const locName = localities.find(l => l.id === localidadId)?.name || "";
      const selectedPayMethodName = dbPaymentMethods.find(m => m.id === paymentsList[0]?.payment_method_id)?.name || 'Efectivo';
      const payStatusName = paymentTiming === 'paid' ? 'Abonado' : (paymentTiming === 'partial' ? 'Señado' : 'Contra Entrega');
      const diffs = computeOrderDiff(originalOrderSnapshot, {
        customer_name: isNewClient ? newClientName : cliente,
        locality: locName,
        direccion: direccion,
        initial_delivery_date: entregaInicial,
        total: total,
        items: orderItems,
        flete: flete,
        payment_method_name: selectedPayMethodName,
        payment_status: payStatusName,
        delivery_notes: aclaraciones
      });
      setEditChangesSummary(diffs);
      setShowEditConfirmModal(true);
      return;
    }

    setShowSummaryModal(true);
  };

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
    if (!selectedAdvertisingSourceId || isWhaticketLinkMissing) {
      setResumeOrderReviewAfterRequiredFields(true);
      setShowWhaticketLinkFieldInModal(isWhaticketLinkMissing);
      setShowRequiredOrderFieldsModal(true);
      return;
    }

    openOrderReview();
  };

  const confirmAndSubmit = async () => {
    // El estado de React tarda un render en actualizarse. Esta referencia evita
    // que un doble clic ejecute dos altas con el mismo código.
    if (submittingRef.current) return;
    if (!selectedAdvertisingSourceId || isWhaticketLinkMissing) {
      setResumeOrderReviewAfterRequiredFields(false);
      setShowWhaticketLinkFieldInModal(isWhaticketLinkMissing);
      setShowRequiredOrderFieldsModal(true);
      return;
    }
    if (
      isWholesaleContext &&
      advertisingSources.find(source => source.id === selectedAdvertisingSourceId)?.name === 'Otro' &&
      !advertisingSourceDetail.trim()
    ) {
      alert("Especificá la procedencia del pedido mayorista.");
      return;
    }
    const isPostponed = editingOrderId && originalDeliveryDate && (new Date(entregaInicial) > new Date(originalDeliveryDate));
    if (isPostponed && !hasDeclaredPostponementReason) {
      setShowSummaryModal(false);
      setShowEditConfirmModal(false);
      setShowPostponementModal(true);
      return;
    }

    setShowSummaryModal(false);
    setShowEditConfirmModal(false);
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("No user authenticated");
      const loggedInUserId = userData.user.id;
      const seller_id = selectedSellerId || loggedInUserId;

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
            phone_primary: newClientPhones.map(cleanPhoneForSaving).filter(Boolean).join(", "),
            is_wholesale: isWholesaleContext,
            client_type: isWholesaleContext ? 'Mayorista' : undefined
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
      let integrationPayload: Record<string, unknown> | undefined;
      let itemsPersistedByAssignedOrderApi = false;
      // Código legacy definitivo: si la orden original ya tenía un código legacy asignado,
      // PRESERVARLO estrictamente para no crear duplicados ni desfasar planillas operativas.
      const effectiveLegacyCode = editingOrderId
        ? ((originalOrderSnapshot?.legacy_code || legacyCode || '').trim().toUpperCase() || null)
        : null;

      if (editingOrderId) {

        // Obtener ítems anteriores para poder revertir stock
        const { data: oldItems, error: oldItemsErr } = await supabase
          .from('order_items')
          .select('product_id, quantity')
          .eq('order_id', editingOrderId);

        if (oldItemsErr) throw oldItemsErr;

        // Validar código duplicado al editar
        if (effectiveLegacyCode) {
          const { data: dupOrder } = await supabase
            .from('orders')
            .select('id, customer_name, legacy_code')
            .eq('legacy_code', effectiveLegacyCode)
            .neq('id', editingOrderId)
            .maybeSingle();

          if (dupOrder) {
            throw new Error(`El código de pedido "${effectiveLegacyCode}" ya existe en el pedido de "${dupOrder.customer_name}". No se puede duplicar.`);
          }
        }

        // Actualizar Pedido
        const { data: updatedOrder, error: orderError } = await supabase
          .from('orders')
          .update({
            ...(role === 'admin' ? { seller_id } : {}),
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
            delivery_notes: [
              aclaraciones,
              logisticsObservation ? `⚠️ OBS. LOGÍSTICA: ${logisticsObservation.trim()}` : ''
            ].filter(Boolean).map((s: string) => s.trim()).join(' / ') || null,
            whaticket_link: whaticketLink || null,
            payment_method_id: paymentsList[0]?.payment_method_id || 'a3a890a8-b677-4b7b-8ffb-d36c2e7b5ad3',
            freight_type: flete,
            total_amount: total,
            order_discount_type: orderDiscountAmount > 0 ? persistedOrderDiscountType : null,
            order_discount_value: orderDiscountAmount > 0 ? persistedOrderDiscountValue : 0,
            order_discount_amount: orderDiscountAmount,
            totals: {
              items_subtotal: itemsGrossSubtotal,
              order_discount_type: persistedOrderDiscountType,
              order_discount_value: persistedOrderDiscountValue,
              order_discount_amount: orderDiscountAmount,
              order_discounts: orderDiscounts,
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
                notes: p.notes,
                telegram_sent: p.telegram_sent || false,
                telegram_message_id: p.telegram_message_id,
                telegram_chat_id: p.telegram_chat_id,
                has_iva: p.has_iva || false,
                iva_mode: p.iva_mode || 'included',
                iva_amount: p.ivaValue || 0,
                taxable_base: p.taxableBase || p.baseAmount
              })),
              payment_timing: paymentTiming
            },
            payment_status: paymentTiming === 'paid' ? 'Abonado' : (paymentTiming === 'partial' ? 'Seniado' : 'Pendiente'),
            logistics_zone_id: localities.find(l => l.id === localidadId)?.zone_id || null,
            advertising_source_id: selectedAdvertisingSourceId || null,
            advertising_source_detail: advertisingSourceDetail.trim() || null,
            order_medium_id: selectedOrderMediumId || null,
            received_phone_line_id: isWholesaleContext ? null : ((selectedPhoneLineId && selectedPhoneLineId !== 'otro') ? selectedPhoneLineId : null),
            delivery_detail: deliveryDetail || null,
            legacy_code: effectiveLegacyCode,
            // Modificado es una marca de planilla, no un estado operativo del ERP.
            // Si el pedido ya avanzó (Confirmado/Entregando/etc.), conservar ese estado.
            status: originalOrderSnapshot?.status === 'Modificado'
              ? 'Pendiente'
              : (originalOrderSnapshot?.status || 'Pendiente'),
            hold_reason: orderStatus === 'En Espera' ? holdReason : null,
            hold_product_id: orderStatus === 'En Espera' && holdProductId ? holdProductId : null,
            category: orderCategory === 'auto' ? detectedCategory : orderCategory,
            commercial_brand: commercialBrand
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

        // Persistir el trabajo junto al pedido; el servidor lo procesa luego.
        {
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
          const advName = advertisingSources.find(a => a.id === selectedAdvertisingSourceId)?.name ||
            (isWholesaleContext ? 'Cliente' : 'Publicidad Meta');
          const detailedSheetSource = advName === 'Otro' && advertisingSourceDetail.trim()
            ? `Otro: ${advertisingSourceDetail.trim()}`
            : advName;
          const sheetSource = isWholesaleContext
            ? 'Mayorista'
            : (FACUNDO_SELLER_IDS.includes(seller_id) ? FACUNDO_RETAIL_SOURCE : detailedSheetSource);
          const mediumName = orderMediums.find(m => m.id === selectedOrderMediumId)?.name || 'WhatsApp';

          const sheetOrderPayload = {
            deliveryDate: entregaInicial,
            orderDate: fechaPedido,
            maxDeliveryDate: entregaMaxima,
            clientName: isNewClient ? newClientName : (cliente || ''),
            phonePrimary: clientPhone,
            phoneSecondary: clientPhone2,
            whaticketLink: whaticketLink || '',
            source: sheetSource,
            deliveryNotes: [
              aclaraciones, 
              deliveryDetail,
              (!includeIVA && partialIvaAmount > 0)
                ? `[Factura con IVA: ${paymentsWithSurcharges.filter(p => p.has_iva).map(p => `${dbPaymentMethods.find(m => m.id === p.payment_method_id)?.name || 'Pago'} $${p.amount.toLocaleString('es-AR')} (IVA $${(p.ivaValue || 0).toLocaleString('es-AR')})`).join(', ')}]`
                : ''
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

          integrationPayload = {
            order: sheetOrderPayload,
            receipts: {
              type: 'receipt',
              customerName: (isNewClient ? newClientName : cliente) || '',
              taxId: isNewClient ? newClientTaxId : (clients.find(c => c.id === selectedClientId)?.tax_id || ''),
              sellerName: sellerFullName,
              status: paymentTiming === 'paid' ? 'Abonado' : (paymentTiming === 'partial' ? 'Señado' : 'Pendiente'),
              pendingBalance,
              receipts: paymentsList.filter(p => p.receipt_url && !p.telegram_sent).map(p => {
                const matched = paymentsWithSurcharges.find(item => item.id === p.id);
                const ivaDesc = (!includeIVA && matched?.has_iva && matched?.ivaValue)
                  ? `[Factura IVA incl.: Base $${(matched.taxableBase || 0).toLocaleString('es-AR')} + IVA $${matched.ivaValue.toLocaleString('es-AR')}]`
                  : '';
                return {
                  url: p.receipt_url,
                  amount: p.amount > 0 ? p.amount : (paymentsList.length === 1 ? (paymentTiming === 'paid' ? total : customDepositAmount) : 0),
                  notes: [p.notes, ivaDesc].filter(Boolean).join(' ')
                };
              })
            }
          };
        }


        // Insertar Nuevo Pedido. Si quien carga eligió otra vendedora, el alta
        // pasa por un endpoint autenticado y acotado en lugar de ampliar RLS.
        const newOrderPayload = {
          seller_id,
          created_by_id: loggedInUserId,
          quote_id: sourceQuoteId,
          client_id: finalClientId || null,
          shipping_address_id: finalAddressId || null,
          shipping_address_snapshot: addressSnapshot,
          initial_delivery_date: entregaInicial,
          max_delivery_date: entregaMaxima,
          order_date: new Date(fechaPedido + 'T12:00:00').toISOString(),
          created_at: new Date(fechaPedido + 'T12:00:00').toISOString(),
          customer_name: isNewClient ? newClientName : cliente,
          locality: locName,
          address: direccion,
          google_maps_link: linkMaps,
          delivery_notes: aclaraciones || null,
          whaticket_link: whaticketLink || null,
          payment_method_id: paymentsList[0]?.payment_method_id || 'a3a890a8-b677-4b7b-8ffb-d36c2e7b5ad3',
          freight_type: flete,
          total_amount: total,
          order_discount_type: orderDiscountAmount > 0 ? persistedOrderDiscountType : null,
          order_discount_value: orderDiscountAmount > 0 ? persistedOrderDiscountValue : 0,
          order_discount_amount: orderDiscountAmount,
          status: orderStatus,
          totals: {
            integration_payload: integrationPayload,
            items_subtotal: itemsGrossSubtotal,
            order_discount_type: persistedOrderDiscountType,
            order_discount_value: persistedOrderDiscountValue,
            order_discount_amount: orderDiscountAmount,
            order_discounts: orderDiscounts,
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
              notes: p.notes,
              telegram_sent: p.telegram_sent || false,
              telegram_message_id: p.telegram_message_id,
              telegram_chat_id: p.telegram_chat_id,
              has_iva: p.has_iva || false,
              iva_mode: p.iva_mode || 'included',
              iva_amount: p.ivaValue || 0,
              taxable_base: p.taxableBase || p.baseAmount
            })),
            payment_timing: paymentTiming
          },
          channel: isWholesaleContext ? 'mayorista' : 'vendedor_externo',
          commercial_brand: commercialBrand,
          payment_status: paymentTiming === 'paid' ? 'Abonado' : (paymentTiming === 'partial' ? 'Seniado' : 'Pendiente'),
          logistics_zone_id: localities.find(l => l.id === localidadId)?.zone_id || null,
          advertising_source_id: selectedAdvertisingSourceId || null,
          advertising_source_detail: advertisingSourceDetail.trim() || null,
          order_medium_id: selectedOrderMediumId || null,
          received_phone_line_id: isWholesaleContext ? null : ((selectedPhoneLineId && selectedPhoneLineId !== 'otro') ? selectedPhoneLineId : null),
          delivery_detail: deliveryDetail || null,
          legacy_code: finalLegacyCode || null,
          hold_reason: orderStatus === 'En Espera' ? holdReason : null,
          hold_product_id: orderStatus === 'En Espera' && holdProductId ? holdProductId : null,
          category: orderCategory === 'auto' ? detectedCategory : orderCategory
        };

        if (seller_id !== loggedInUserId) {
          const { data: sessionData } = await supabase.auth.getSession();
          const accessToken = sessionData.session?.access_token;
          if (!accessToken) throw new Error('La sesión venció. Volvé a ingresar antes de cargar el pedido.');
          const assignedOrderResponse = await fetch('/api/vendedores/create-assigned-order', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${accessToken}`
            },
            body: JSON.stringify({
              order: newOrderPayload,
              items: orderItems.map(item => ({
                product_id: item.id,
                product_name: normalizeProductNameForSheet(item.name, item.sku) || item.name,
                quantity: item.quantity,
                unit_price: item.customPrice,
                historical_unit_cost: (item as any).cost || 0,
                discount_percentage: item.discountType === 'percentage' ? (item.discountValue || 0) : 0
              }))
            })
          });
          const assignedOrderPayload = await assignedOrderResponse.json().catch(() => ({}));
          if (!assignedOrderResponse.ok || !assignedOrderPayload.order) {
            throw new Error(assignedOrderPayload.error || 'No se pudo registrar el pedido para la vendedora seleccionada.');
          }
          orderData = assignedOrderPayload.order;
          itemsPersistedByAssignedOrderApi = true;
        } else {
          const { data: newOrder, error: orderError } = await supabase
            .from('orders')
            .insert(newOrderPayload)
            .select()
            .single();
          if (orderError) throw orderError;
          orderData = newOrder;
        }
      }

      // La dirección elegida en el último pedido pasa a ser la predeterminada
      // del cliente, sin eliminar las demás sucursales o domicilios guardados.
      if (finalClientId && finalAddressId && finalAddressId !== "nueva_direccion") {
        const { error: clearDefaultError } = await supabase
          .from("addresses")
          .update({ is_default: false })
          .eq("client_id", finalClientId);
        if (clearDefaultError) throw clearDefaultError;

        const { error: setDefaultError } = await supabase
          .from("addresses")
          .update({ is_default: true })
          .eq("id", finalAddressId)
          .eq("client_id", finalClientId);
        if (setDefaultError) throw setDefaultError;
      }

      // 3. Crear nuevos ítems del Pedido
      const itemsToInsert = orderItems.map(item => ({
        order_id: orderData.id,
        product_id: item.id,
        product_name: normalizeProductNameForSheet(item.name, item.sku) || item.name,
        quantity: item.quantity,
        unit_price: item.customPrice,
        historical_unit_cost: (item as any).cost || 0, // Costo dinámico guardado
        discount_percentage: item.discountType === 'percentage' ? (item.discountValue || 0) : 0
      }));

      if (!itemsPersistedByAssignedOrderApi) {
        const { error: itemsError } = await supabase.from('order_items').insert(itemsToInsert);
        if (itemsError) throw itemsError;
      }

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

      if (!editingOrderId && sourceQuoteId && orderData?.id) {
        const { error: quoteStatusError } = await supabase
          .from('sales_quotes')
          .update({ status: 'converted', converted_order_id: orderData.id })
          .eq('id', sourceQuoteId);
        if (quoteStatusError) {
          console.warn('El pedido se creó, pero no se pudo marcar el presupuesto como convertido:', quoteStatusError);
        }
      }

      if (editingOrderId) {
        // 1. Guardar historial de modificación en order_history
        try {
          let sellerFullName = sellersList.find(s => s.id === seller_id)?.full_name;
          if (!sellerFullName) {
            sellerFullName = (seller_id === loggedInUserId ? (currentSeller?.full_name || userData.user.user_metadata?.full_name) : '') || 'Vendedor';
          }

          const modifiedSnapshot = {
            id: editingOrderId,
            legacy_code: effectiveLegacyCode || orderData.legacy_code || legacyCode,
            customer_name: isNewClient ? newClientName : cliente,
            locality: locName,
            address: direccion,
            google_maps_link: linkMaps,
            delivery_notes: [
              aclaraciones,
              logisticsObservation ? `⚠️ OBS. LOGÍSTICA: ${logisticsObservation.trim()}` : ''
            ].filter(Boolean).join(' / '),
            delivery_detail: deliveryDetail,
            whaticket_link: whaticketLink,
            initial_delivery_date: entregaInicial,
            max_delivery_date: entregaMaxima,
            order_date: fechaPedido,
            seller_id: seller_id,
            status: orderData.status,
            total_amount: total,
            payment_method_id: paymentsList[0]?.payment_method_id,
            payment_status: paymentTiming === 'paid' ? 'Abonado' : (paymentTiming === 'partial' ? 'Seniado' : 'Pendiente'),
            freight_type: flete,
            items: orderItems.map(it => ({
              product_id: it.id,
              name: it.name,
              sku: it.sku,
              quantity: it.quantity,
              price: it.customPrice !== undefined ? it.customPrice : it.price
            })),
            totals: { total, freight: shippingAmount, subtotal }
          };

          await supabase.from('order_history').insert({
            order_id: editingOrderId,
            changed_by_id: userData.user.id,
            changed_by_name: sellerFullName,
            change_reason: logisticsObservation.trim() || 'Modificación de pedido',
            original_data: originalOrderSnapshot,
            modified_data: modifiedSnapshot,
            changed_at: new Date().toISOString()
          });
        } catch (histErr) {
          console.error("Error guardando en order_history:", histErr);
        }

        // 2. Sincronizar actualización con la planilla de Google Sheets
        let operationalSync: {
          central?: { success: boolean; sheetName?: string; message?: string };
          deliveriesCurrent?: { success: boolean; sheetName?: string; message?: string };
        } | undefined;
        let operationalSyncSkipped = isWholesaleContext;
        if (!isWholesaleContext) try {
          const clientPhone = isNewClient 
            ? (newClientPhones.map(cleanPhoneForSaving).filter(Boolean)[0] || '')
            : (clients.find(c => c.id === selectedClientId)?.phone_primary || '');
          const clientPhone2 = isNewClient
            ? (newClientPhones.map(cleanPhoneForSaving).filter(Boolean)[1] || '')
            : '';
          let sellerFullName = sellersList.find(s => s.id === seller_id)?.full_name;
          if (!sellerFullName) {
            sellerFullName = (seller_id === loggedInUserId ? (currentSeller?.full_name || userData.user.user_metadata?.full_name) : '') || 'Vendedor';
          }
          const advName = advertisingSources.find(a => a.id === selectedAdvertisingSourceId)?.name ||
            (isWholesaleContext ? 'Cliente' : 'Publicidad Meta');
          const detailedSheetSource = advName === 'Otro' && advertisingSourceDetail.trim()
            ? `Otro: ${advertisingSourceDetail.trim()}`
            : advName;
          const sheetSource = isWholesaleContext
            ? 'Mayorista'
            : (FACUNDO_SELLER_IDS.includes(seller_id) ? FACUNDO_RETAIL_SOURCE : detailedSheetSource);
          const mediumName = orderMediums.find(m => m.id === selectedOrderMediumId)?.name || 'WhatsApp';
          const selectedPayMethodName = dbPaymentMethods.find(m => m.id === paymentsList[0]?.payment_method_id)?.name || 'Efectivo';

          const sheetOrderPayload = {
            deliveryDate: entregaInicial,
            orderDate: fechaPedido,
            maxDeliveryDate: entregaMaxima,
            clientName: isNewClient ? newClientName : (cliente || ''),
            phonePrimary: clientPhone,
            phoneSecondary: clientPhone2,
            whaticketLink: whaticketLink || '',
            source: sheetSource,
            deliveryNotes: [
              aclaraciones, 
              deliveryDetail,
              (!includeIVA && partialIvaAmount > 0)
                ? `[Factura con IVA: ${paymentsWithSurcharges.filter(p => p.has_iva).map(p => `${dbPaymentMethods.find(m => m.id === p.payment_method_id)?.name || 'Pago'} ${p.amount.toLocaleString('es-AR')} (IVA ${(p.ivaValue || 0).toLocaleString('es-AR')})`).join(', ')}]`
                : ''
            ].filter(Boolean).map((s: string) => s.trim()).join(' / '),
            medium: mediumName,
            sellerName: normalizeSellerName(sellerFullName),
            status: 'Modificado',
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

          const sheetUpdateRes = await fetch('/api/vendedores/update-sheet-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              // El código permanece en la planilla que lo originó. Si cambia
              // la atribución comercial, sólo cambia el nombre de vendedor.
              sellerId: originalOrderSnapshot?.seller_id || seller_id,
              legacyCode: effectiveLegacyCode || orderData.legacy_code || legacyCode || '',
              order: sheetOrderPayload,
              logisticsObservation: logisticsObservation.trim()
            })
          });

          if (sheetUpdateRes.ok) {
            const sheetData = await sheetUpdateRes.json();
            if (sheetData.synced) {
              console.log(`Planilla actualizada en fila ${sheetData.rowNumber}`);
            }
            operationalSync = sheetData.operationalSync;
            operationalSyncSkipped = sheetData.operationalSyncSkipped === true;
          } else {
            const errData = await sheetUpdateRes.json().catch(() => ({}));
            console.warn('Error syncing update to sheet:', errData);
          }
        } catch (sUpdErr) {
          console.error('Error in sheet update:', sUpdErr);
        }

        // 3. Construir mensaje formateado para copiar y pegar (listo para WhatsApp o bot de Telegram)
        let sellerFullName = sellersList.find(s => s.id === seller_id)?.full_name;
        if (!sellerFullName) {
          sellerFullName = (seller_id === loggedInUserId ? (currentSeller?.full_name || userData.user.user_metadata?.full_name) : '') || 'Vendedor';
        }
        const selectedPayMethodName = dbPaymentMethods.find(m => m.id === paymentsList[0]?.payment_method_id)?.name || 'Efectivo';
        const payStatusName = paymentTiming === 'paid' ? 'Abonado' : (paymentTiming === 'partial' ? `Señado (${formatPrice(depositAmount)})` : 'Contra Entrega');
        const clientPhone = isNewClient 
            ? (newClientPhones.map(cleanPhoneForSaving).filter(Boolean)[0] || '')
            : (clients.find(c => c.id === selectedClientId)?.phone_primary || '');

        const copyMsg = buildCopyableModificationMessage({
          legacyCode: effectiveLegacyCode || orderData.legacy_code || legacyCode || 'S/C',
          sellerName: sellerFullName,
          changes: editChangesSummary,
          logisticsObservation: logisticsObservation.trim(),
          operationalSync
        });

        // Enviar automáticamente a Telegram SOLO si hay cambios que afectan a Logística
        const hasOperationalSyncFailure = !!operationalSync &&
          (!operationalSync.central?.success || !operationalSync.deliveriesCurrent?.success);
        const shouldNotifyLogistics = isWholesaleContext
          ? isLogisticallyRelevantChange(editChangesSummary, logisticsObservation)
          : !operationalSyncSkipped && (isLogisticallyRelevantChange(editChangesSummary, logisticsObservation) || hasOperationalSyncFailure);
        setIsLogisticallyRelevant(shouldNotifyLogistics);

        let telegramSuccess = false;
        if (shouldNotifyLogistics) {
          try {
            const tgRes = await fetch('/api/vendedores/telegram-notify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                type: 'modification',
                message: copyMsg,
                legacyCode: effectiveLegacyCode || orderData.legacy_code || legacyCode || ''
              })
            });
            const tgData = await tgRes.json().catch(() => ({}));
            telegramSuccess = !!(tgRes.ok && tgData.ok);
          } catch (err) {
            console.warn('Error sending automatic Telegram alert:', err);
          }
        }

        setNotifiedLogistics(telegramSuccess);
        setGeneratedModificationMessage(copyMsg);
        setCopiedModificationMessage(false);
        setShowModificationSuccessModal(true);

        // Actualizar estado local
        setOrders(prev => prev.map(o => o.id === orderData.id ? { ...o, ...orderData } : o));
      } else {
        setOrderSaveNotice(isWholesaleContext
          ? 'Pedido mayorista guardado en el ERP. Los avisos de Telegram se procesan en segundo plano. Podés cargar el siguiente pedido.'
          : 'Pedido guardado. Las planillas y Telegram se procesan en segundo plano. Podés cargar el siguiente pedido.');
        window.dispatchEvent(new Event('order-sync-updated'));
      }

      // En altas nuevas los comprobantes viajan en la cola persistente.
      if (editingOrderId) try {
        const orderCodeForTelegram = effectiveLegacyCode || finalLegacyCode || legacyCode || orderData?.legacy_code || '';
        const clientNameForTelegram = (isNewClient ? newClientName : cliente) || '';
        const clientTaxIdForTelegram = isNewClient ? newClientTaxId : (clients.find(c => c.id === selectedClientId)?.tax_id || '');
        const paymentStatusLabel = paymentTiming === 'paid' ? 'Abonado' : (paymentTiming === 'partial' ? 'Señado' : 'Pendiente');

        const unsentReceipts = paymentsList.filter(p => Boolean(p.receipt_url) && !p.telegram_sent);
        if (unsentReceipts.length > 0) {
          try {
            const receiptsPayload = unsentReceipts.map(r => ({
              url: r.receipt_url!,
              amount: r.amount > 0 ? r.amount : (paymentsList.length === 1 ? (paymentTiming === 'paid' ? total : customDepositAmount) : 0),
              notes: r.notes || ''
            }));

            const tgRes = await fetch('/api/vendedores/telegram-notify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                type: 'receipt',
                legacyCode: orderCodeForTelegram,
                customerName: clientNameForTelegram,
                taxId: clientTaxIdForTelegram,
                sellerName: sellersList.find(seller => seller.id === seller_id)?.full_name || currentSeller?.full_name || '',
                status: paymentStatusLabel,
                receipts: receiptsPayload,
                pendingBalance: pendingBalance
              })
            });
            const tgData = await tgRes.json();
            if (tgData.ok) {
              const messageIds: number[] = Array.isArray(tgData.messageIds)
                ? tgData.messageIds
                : (tgData.messageId ? [tgData.messageId] : []);
              unsentReceipts.forEach((receipt, index) => {
                receipt.telegram_sent = true;
                receipt.telegram_message_id = messageIds[index] || messageIds[0];
                receipt.telegram_chat_id = tgData.chatId ? String(tgData.chatId) : undefined;
              });

              if (orderData?.id) {
                const updatedBreakdown = paymentsWithSurcharges.map(payment => {
                  const persistedPayment = paymentsList.find(item => item.id === payment.id) || payment;
                  return {
                    id: payment.id,
                    payment_method_id: payment.payment_method_id,
                    amount: payment.baseAmount,
                    surcharge: payment.surchargeValue,
                    total: payment.totalAmount,
                    card_installments: payment.installments,
                    card_surcharge: payment.surchargePercentage,
                    receipt_url: payment.receipt_url,
                    notes: payment.notes,
                    telegram_sent: persistedPayment.telegram_sent || false,
                    telegram_message_id: persistedPayment.telegram_message_id,
                    telegram_chat_id: persistedPayment.telegram_chat_id
                  };
                });

                await supabase
                  .from('orders')
                  .update({
                    totals: {
                      ...orderData.totals,
                      payments_breakdown: updatedBreakdown
                    }
                  })
                  .eq('id', orderData.id);
              }
            }
          } catch (tgErr) {
            console.warn('[Telegram Dispatch] Error enviando comprobantes a Telegram:', tgErr);
          }
        }
      } catch (receiptErr) {
        console.warn('[handleSaveOrder] Error procesando comprobantes de Telegram:', receiptErr);
      }
      
      // Reset form
      setOriginalDeliveryDate("");
      setHasDeclaredPostponementReason(false);
      setPostponementMotive("");
      setPostponementReasonType('cliente');
      const nextOrderDate = formatDateInput(new Date());
      setEntregaInicial(isWholesaleContext ? formatDateInput(calculateNthWeekday(nextOrderDate, 1)) : "");
      setEntregaMaxima(isWholesaleContext ? formatDateInput(calculateNthWeekday(nextOrderDate, 7)) : "");
      setFechaPedido(nextOrderDate);
      setCliente("");
      setDireccion("");
      setAclaraciones("");
      setLinkMaps("");
      setFlete("");
      setPaymentType('efectivo');
      const defaultPm = dbPaymentMethods.find(pm => 
        pm.id === "a3a890a8-b677-4b7b-8ffb-d36c2e7b5ad3" || 
        (pm.name && pm.name.toLowerCase().includes("efectivo"))
      ) || dbPaymentMethods.find(pm => pm.is_default) || dbPaymentMethods[0];
      if (defaultPm) {
        setSelectedPaymentMethodId(defaultPm.id);
        setCardSurcharge(defaultPm.surcharge_percentage || 0);
        setCardInstallments(defaultPm.installments || 1);
      } else {
        setSelectedPaymentMethodId("a3a890a8-b677-4b7b-8ffb-d36c2e7b5ad3");
        setCardInstallments(1);
        setCardSurcharge(0);
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
          payment_method_id: defaultPm ? defaultPm.id : "a3a890a8-b677-4b7b-8ffb-d36c2e7b5ad3",
          amount: 0,
          card_surcharge: defaultPm ? (defaultPm.surcharge_percentage || 0) : 0,
          card_installments: defaultPm ? (defaultPm.installments || 1) : 1,
          receipt_url: "",
          notes: "",
          has_iva: false,
          iva_mode: 'included'
        }
      ]);
      setSelectedClientId("");
      setSourceQuoteId(null);
      setSelectedAddressId("");
      setClientSearchQuery("");
      setNewClientName("");
      setNewClientTaxId("");
      setShowTaxIdField(false);
      setNewClientPhone("");
      setWhaticketLink("");
      setLocalidadId("");
      setOrderItems([]);
      setOrderDiscountType('percentage');
      setOrderDiscountValue(0);
      setOrderDiscounts([]);
      setOrderCategory("auto");
      setCommercialBrand(isWholesaleContext || FACUNDO_SELLER_IDS.includes(seller_id) ? 'aquafort' : 'zono');
      
      editingOrderIdRef.current = null;
      generateNextLegacyCode(seller_id);
      setSelectedAdvertisingSourceId("");
      setAdvertisingSourceDetail("");
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
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {orderSaveNotice && (
        <div role="status" className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <span>{orderSaveNotice}</span>
          <button type="button" aria-label="Cerrar aviso" onClick={() => setOrderSaveNotice('')}><X className="h-4 w-4" /></button>
        </div>
      )}
      {activeTab === 'form' ? (
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-3.5 px-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleCancelOrExitForm}
              className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 rounded-xl transition-all cursor-pointer shadow-2xs group shrink-0"
              title="Volver al listado de pedidos"
            >
              <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-black text-slate-900 tracking-tight">
                  {editingOrderId ? "Modificar Pedido" : (isWholesaleContext ? "Carga de Pedido Mayorista" : "Carga de Nuevo Pedido")}
                </h1>
                {editingOrderId && (
                  <span className="bg-amber-100 text-amber-800 text-[10px] px-2 py-0.5 rounded-full font-bold border border-amber-200">
                    Modo Edición
                  </span>
                )}
                {isWholesaleContext && (
                  <span className="bg-emerald-100 text-emerald-800 text-[10px] px-2 py-0.5 rounded-full font-bold">
                    Modo Mayorista
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 font-medium">
                {editingOrderId 
                  ? "Modificá los datos del pedido y actualizá la reserva de stock."
                  : isWholesaleContext
                    ? "Pedido comercial de AquaFort: usá los productos y precios de la lista mayorista."
                    : "Ingresá los datos del cliente, productos y logística con reserva automática de stock."}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleCancelOrExitForm}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200/80 rounded-xl text-xs font-bold transition-all shadow-2xs hover:shadow-xs active:scale-95 cursor-pointer"
              title="Cancelar y volver al listado de pedidos"
            >
              <X className="w-3.5 h-3.5 text-rose-600" />
              <span>Cancelar y Salir</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-lg font-black text-slate-900 tracking-tight">
              {selectedChannels.length === 1 && selectedChannels[0] === 'mayoristas' ? 'Pedidos Mayoristas' : 'Pedidos Minoristas'}
            </h1>
            <p className="text-[11px] text-slate-400 font-semibold">
              Listado y seguimiento de pedidos, estados de entrega y cobranzas.
              {isWholesaleContext && <span className="ml-2 bg-emerald-100 text-emerald-800 text-[10px] px-2 py-0.5 rounded-full font-bold">Modo Mayorista</span>}
            </p>
          </div>
          
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleStartNewOrder}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all active:scale-95 cursor-pointer"
              title="Iniciar la carga de un nuevo pedido"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>+ Nuevo Pedido</span>
            </button>

            <div className="flex bg-slate-200/50 p-0.5 rounded-xl">
              <button 
                onClick={() => setListType('mis_pedidos')}
                className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-all ${listType === 'mis_pedidos' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Mis Pedidos
              </button>
              {role === 'admin' && (
                <button 
                  onClick={() => setListType('todos')}
                  className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-all ${listType === 'todos' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  Todos los Pedidos
                </button>
              )}
            </div>
          </div>
        </div>
      )}

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
                onClick={handleCancelOrExitForm}
                className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-amber-200 text-amber-800 font-black rounded-lg text-[10px] shadow-sm transition-all uppercase tracking-wider shrink-0 cursor-pointer"
              >
                Cancelar Edición
              </button>

              <button
                type="button"
                onClick={handleOpenCurrentFormPrintable}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-lg text-[10px] shadow-sm transition-all uppercase tracking-wider shrink-0 flex items-center gap-1 cursor-pointer"
                title="Generar e imprimir comprobante de este pedido"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Ver / Imprimir Comprobante</span>
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            
            {/* Origen y Canal de Venta (Mostrado en primer lugar) */}
            <div className="space-y-4 md:col-span-2 lg:col-span-3 bg-slate-50/90 p-4 rounded-xl border border-slate-200/95">
              <h3 className="flex items-center gap-1.5 font-black text-slate-800 border-b border-slate-200/60 pb-1.5 mb-3 text-xs uppercase tracking-wider">
                <Target className="w-4 h-4 text-brand-500" /> Origen y Canal de Venta
              </h3>
              
              {/* Fila Superior: Códigos y Datos Generales */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-start pb-3 border-b border-slate-200/70">
                {/* Código de Pedido Legacy */}
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">{editingOrderId ? 'Código de Pedido' : isWholesaleContext ? 'Código asignado al guardar en ERP' : 'Código estimado (se confirma al sincronizar)'}</label>
                  <input
                    type="text"
                    value={legacyCode}
                    readOnly
                    placeholder={isWholesaleContext ? 'Automático' : 'Generando...'}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-100 text-slate-500 font-bold text-xs outline-none cursor-not-allowed select-all h-[34px]"
                  />
                </div>

                {/* Vendedor Asignado */}
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">
                    👤 Vendedor Asignado
                  </label>
                  {assignableSellers.length > 0 ? (
                    <select
                      value={selectedSellerId || currentUserId}
                      disabled={Boolean(editingOrderId) && role !== 'admin'}
                      onChange={(e) => {
                        const newId = e.target.value;
                        setSelectedSellerId(newId);
                        if (!editingOrderIdRef.current && !editingOrderId) {
                          generateNextLegacyCode(newId);
                        }
                      }}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-800 font-bold text-xs outline-none focus:ring-2 focus:ring-brand-500/10 focus:border-brand-500 transition-all cursor-pointer disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 h-[34px]"
                    >
                      {assignableSellers.map((s) => (
                        <option key={s.id} value={s.id}>
                          👤 {s.full_name || s.email}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={currentSeller?.full_name || assignableSellers.find(s => s.id === (selectedSellerId || currentUserId))?.full_name || "Vendedor"}
                      readOnly
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-100 text-slate-700 font-bold text-xs outline-none cursor-not-allowed select-all h-[34px]"
                    />
                  )}
                  <p className="text-[9px] font-medium text-slate-400">
                    La venta se atribuye a esta persona; quien realiza la carga queda registrado por separado.
                  </p>
                </div>

                {/* Categoría del Pedido para Atribución de Marketing */}
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Categoría del Pedido</label>
                  <select
                    value={orderCategory}
                    onChange={e => setOrderCategory(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-bold text-xs outline-none focus:ring-2 focus:ring-brand-500/10 focus:border-brand-500 transition-all cursor-pointer text-slate-800 h-[34px]"
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

                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Marca del comprobante</label>
                  <select
                    value={commercialBrand}
                    onChange={event => setCommercialBrand(event.target.value as 'zono' | 'aquafort')}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-bold text-xs outline-none focus:ring-2 focus:ring-brand-500/10 focus:border-brand-500 transition-all cursor-pointer text-slate-800 h-[34px]"
                  >
                    <option value="aquafort">AquaFort</option>
                    <option value="zono">Zono Construcción</option>
                  </select>
                </div>
              </div>

              {/* Fila Principal: Procedencia y Medio de Recepción en Fichas de Selección Única */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start pt-1">
                {/* Columna Izquierda: Procedencia */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-600 flex items-center gap-1">
                      📢 Procedencia <span className="text-rose-600 font-black">* (Obligatorio)</span>
                    </label>
                    {!selectedAdvertisingSourceId ? (
                      <span className="text-[9.5px] font-extrabold text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-200 animate-pulse">
                        Requerido
                      </span>
                    ) : (
                      <span className="text-[9.5px] font-extrabold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        Seleccionado
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5 items-start">
                    {filteredAdvertisingSources.map((source) => {
                      const isSelected = selectedAdvertisingSourceId === source.id;
                      return (
                        <button
                          key={source.id}
                          type="button"
                          onClick={() => {
                            setSelectedAdvertisingSourceId(source.id);
                            if (source.name !== 'Otro') setAdvertisingSourceDetail("");
                          }}
                          className={cn(
                            "w-full sm:w-auto px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer text-left border shadow-2xs",
                            isSelected
                              ? "bg-brand-600 text-white border-brand-600 ring-2 ring-brand-500/20 shadow-sm"
                              : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:border-slate-300"
                          )}
                        >
                          {source.name}
                        </button>
                      );
                    })}
                  </div>
                  {isWholesaleContext && advertisingSources.find(source => source.id === selectedAdvertisingSourceId)?.name === 'Otro' && (
                    <input
                      type="text"
                      value={advertisingSourceDetail}
                      onChange={event => setAdvertisingSourceDetail(event.target.value)}
                      placeholder="Especificá la procedencia..."
                      className="w-full max-w-md px-3 py-2 rounded-lg border border-slate-200 bg-white font-bold text-xs outline-none focus:ring-2 focus:ring-brand-500/10 focus:border-brand-500"
                    />
                  )}
                </div>

                {/* Columna Derecha: Medio de Recepción y Detalle */}
                <div className="space-y-3">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-600 flex items-center gap-1">
                      💬 Medio de Recepción
                    </label>
                    <div className="flex flex-wrap gap-2 items-center">
                      {filteredOrderMediums.map((med) => {
                        const isSelected = selectedOrderMediumId === med.id;
                        return (
                          <button
                            key={med.id}
                            type="button"
                            onClick={() => {
                              setSelectedOrderMediumId(med.id);
                              setSelectedPhoneLineId("");
                            }}
                            className={cn(
                              "px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border shadow-2xs",
                              isSelected
                                ? "bg-brand-600 text-white border-brand-600 ring-2 ring-brand-500/20 shadow-sm"
                                : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:border-slate-300"
                            )}
                          >
                            {med.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Detalle Dependiente del Medio: Link de Whaticket o Línea Telefónica */}
                  <div className="pt-2 border-t border-slate-200/60">
                    {(() => {
                      const selectedMedium = filteredOrderMediums.find(m => m.id === selectedOrderMediumId) || orderMediums.find(m => m.id === selectedOrderMediumId);
                      
                      if (!selectedMedium) {
                        return (
                          <div className="space-y-1">
                            <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Detalle de Recepción</label>
                            <input 
                              key="medium-unselected"
                              type="text" 
                              disabled 
                              value=""
                              readOnly
                              placeholder="Seleccione medio de recepción..." 
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-400 font-bold text-xs outline-none cursor-not-allowed h-[34px]" 
                            />
                          </div>
                        );
                      }
                      
                      if (selectedMedium.name.toLowerCase() === 'whaticket') {
                        return (
                          <div className="space-y-1 animate-in fade-in duration-150">
                            <label className="text-[9.5px] font-black uppercase tracking-wider text-slate-500 flex items-center justify-between">
                              <span>🔗 Link de Whaticket</span>
                              <span className="text-[9px] text-slate-400 font-normal">Pegar link de la conversación</span>
                            </label>
                            <input 
                              key="medium-whaticket"
                              type="url" 
                              value={whaticketLink || ""} 
                              onChange={e => setWhaticketLink(e.target.value)} 
                              placeholder="https://whaticket... o pegar enlace de conversación" 
                              className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white font-bold text-xs outline-none focus:ring-2 focus:ring-brand-500/10 focus:border-brand-500 transition-all text-slate-800 h-[36px]" 
                            />
                          </div>
                        );
                      }

                      if (isWholesaleContext && ['whatsapp', 'llamado'].includes(selectedMedium.name.toLowerCase())) {
                        return (
                          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[10px] font-bold text-emerald-700">
                            {selectedMedium.name} general · sin especificar línea telefónica
                          </div>
                        );
                      }

                      if (selectedMedium.requires_phone_line || ['whatsapp', 'llamado'].includes(selectedMedium.name.toLowerCase())) {
                        const effectiveSellerId = selectedSellerId || currentUserId;
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
                          <div className="space-y-1 animate-in fade-in duration-150 relative">
                            <div className="flex items-center justify-between">
                              <label className="text-[9.5px] font-black uppercase tracking-wider text-slate-500">📞 Línea Telefónica</label>
                              {isOrganic && (
                                <button
                                  type="button"
                                  onClick={() => setShowLineManagerModal(true)}
                                  className="text-[9px] font-bold text-brand-600 hover:text-brand-700 underline flex items-center gap-0.5 cursor-pointer"
                                >
                                  ⚙️ Administrar
                                </button>
                              )}
                            </div>
                            <select
                              value={selectedPhoneLineId}
                              onChange={e => setSelectedPhoneLineId(e.target.value)}
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-bold text-xs outline-none focus:ring-2 focus:ring-brand-500/10 focus:border-brand-500 transition-all cursor-pointer text-slate-800 h-[36px]"
                              required
                            >
                              <option value="">-- Seleccionar línea telefónica --</option>
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
                          </div>
                        );
                      }

                      // Caso 'Otro'
                      return (
                        <div className="space-y-1 animate-in fade-in duration-150">
                          <label className="text-[9.5px] font-black uppercase tracking-wider text-slate-500">
                            📝 Detalle de Recepción (Opcional)
                          </label>
                          <input 
                            key="medium-otro-detail"
                            type="text" 
                            value={deliveryDetail || ""} 
                            onChange={e => setDeliveryDetail(e.target.value)} 
                            placeholder="Detalle adicional sobre cómo ingresó el contacto..." 
                            className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white font-bold text-xs outline-none focus:ring-2 focus:ring-brand-500/10 focus:border-brand-500 transition-all text-slate-800 h-[36px]" 
                          />
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>

            {/* 1. Datos del Cliente */}
            <div className="space-y-4 md:col-span-2 lg:col-span-1 bg-slate-50/90 p-4 rounded-xl border border-slate-200/95">
              <div className="flex justify-between items-center mb-1">
                <h3 className="flex items-center gap-1.5 font-black text-slate-800 text-xs uppercase tracking-wider">
                  <User className="w-4 h-4 text-brand-500" /> Cuenta del Cliente
                </h3>
                {isWholesaleContext && (
                  <button
                    type="button"
                    onClick={() => setShowWholesaleClientModal(true)}
                    className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[9px] font-black text-emerald-700 transition hover:bg-emerald-100"
                  >
                    <Search className="h-3 w-3" /> {selectedClientId ? "Cambiar mayorista" : "Buscar / crear"}
                  </button>
                )}
              </div>

              {/* Búsqueda inteligente por nombre, teléfono o CUIT */}
              <div className="space-y-3" onClick={(e) => e.stopPropagation()}>
                {selectedClientId ? (
                  <>
                    <div className="bg-brand-50 border border-brand-100 rounded-lg p-2.5 flex items-center justify-between gap-3 text-xs animate-in fade-in slide-in-from-top-1">
                      <div>
                        <span className="font-black text-brand-700">Cliente Existente Seleccionado</span>
                        <p className="text-[10px] text-slate-500 font-bold leading-tight mt-0.5">La información de CUIT y Teléfono ha sido precargada.</p>
                        {isWholesaleContext && appliedWholesaleDiscountLabel && (
                          <p className="text-[10px] text-emerald-700 font-black leading-tight mt-1">{appliedWholesaleDiscountLabel} aplicado al pedido.</p>
                        )}
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
                isWholesaleContext ? (
                  <div className="space-y-3 border-t border-slate-100 pt-3 animate-in fade-in duration-200">
                    <button
                      type="button"
                      onClick={() => setShowWholesaleClientModal(true)}
                      className="group w-full rounded-2xl border-2 border-dashed border-emerald-200 bg-emerald-50/60 p-5 text-center transition hover:border-emerald-400 hover:bg-emerald-50"
                    >
                      <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-md shadow-emerald-600/20 transition group-hover:scale-105">
                        <Building2 className="h-5 w-5" />
                      </div>
                      <p className="text-xs font-black text-slate-800">Seleccionar cliente mayorista</p>
                      <p className="mt-1 text-[10px] font-semibold text-slate-500">Buscá por razón social, CUIT, teléfono o código; también podés crear uno nuevo.</p>
                    </button>
                    <p className="text-center text-[9px] font-bold text-slate-400">El descuento habitual del cliente se aplicará automáticamente al pedido.</p>
                  </div>
                ) : (
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
                )
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
                    <div className="flex items-center justify-between">
                      <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Localidad *</label>
                      <button
                        type="button"
                        onClick={() => handleOpenAddLocalityModal(localitySearch)}
                        className="inline-flex items-center gap-1 text-[10px] font-bold text-brand-600 hover:text-brand-700 hover:underline transition-colors cursor-pointer"
                        title="Agregar nueva localidad con zona"
                      >
                        <Plus className="w-3 h-3 stroke-[2.5]" />
                        <span>Nueva Localidad</span>
                      </button>
                    </div>
                    <div className="flex gap-1.5">
                      <div className="relative flex-1">
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
                            }, 250);
                          }}
                          className="w-full pl-2.5 pr-8 py-1.5 rounded-lg border border-slate-200 bg-white font-bold text-xs outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 transition-all cursor-pointer"
                          required={!localidadId}
                        />
                        <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                        
                        {isLocalityDropdownOpen && (
                          <div className="absolute left-0 right-0 mt-1 max-h-56 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg z-50 py-1">
                            {(() => {
                              const filtered = localities.filter(l => 
                                l.name.toLowerCase().includes(localitySearch.toLowerCase())
                              );
                              if (filtered.length === 0) {
                                return (
                                  <div className="p-3 text-center space-y-2">
                                    <p className="text-[11px] text-slate-400 font-bold">No se encontró &ldquo;{localitySearch}&rdquo;</p>
                                    <button
                                      type="button"
                                      onMouseDown={(e) => {
                                        e.preventDefault();
                                        handleOpenAddLocalityModal(localitySearch);
                                      }}
                                      className="w-full inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-brand-50 hover:bg-brand-100 text-brand-700 text-xs font-bold rounded-lg border border-brand-200 transition-colors cursor-pointer"
                                    >
                                      <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                                      <span>Agregar &ldquo;{localitySearch.trim() || 'nueva localidad'}&rdquo;</span>
                                    </button>
                                  </div>
                                );
                              }

                              return (
                                <>
                                  {filtered.map(l => (
                                    <button
                                      key={l.id}
                                      type="button"
                                      onMouseDown={() => {
                                        setLocalidadId(l.id);
                                        setLocalitySearch(l.name);
                                        setIsLocalityDropdownOpen(false);
                                      }}
                                      className={`w-full px-2.5 py-1.5 text-left text-[10px] font-bold transition-all flex items-center justify-between ${
                                        localidadId === l.id 
                                          ? 'bg-brand-50 text-brand-700 font-black' 
                                          : 'text-slate-700 hover:bg-slate-50'
                                      }`}
                                    >
                                      <span>{l.name}</span>
                                      {l.zones?.name && (
                                        <span className="text-[9px] font-semibold text-slate-400">
                                          {l.zones.name}
                                        </span>
                                      )}
                                    </button>
                                  ))}
                                  <div className="border-t border-slate-100 mt-1 pt-1 px-1">
                                    <button
                                      type="button"
                                      onMouseDown={(e) => {
                                        e.preventDefault();
                                        handleOpenAddLocalityModal(localitySearch);
                                      }}
                                      className="w-full inline-flex items-center gap-1.5 px-2 py-1.5 text-left text-[10px] font-bold text-brand-600 hover:bg-brand-50 rounded transition-colors cursor-pointer"
                                    >
                                      <Plus className="w-3 h-3 stroke-[2.5]" />
                                      <span>+ Agregar nueva localidad...</span>
                                    </button>
                                  </div>
                                </>
                              );
                            })()}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleOpenAddLocalityModal(localitySearch)}
                        className="px-2.5 py-1.5 bg-brand-50 hover:bg-brand-100 border border-brand-200 text-brand-700 font-bold rounded-lg text-xs transition-all duration-200 active:scale-95 flex items-center justify-center gap-1 shrink-0 cursor-pointer shadow-xs"
                        title="Agregar nueva localidad con zona"
                      >
                        <Plus className="w-4 h-4 text-brand-600 stroke-[2.5]" />
                        <span className="hidden sm:inline text-[11px]">Agregar</span>
                      </button>
                    </div>
                    <input type="hidden" required value={localidadId ?? ""} onChange={() => {}} />
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
                    <span>{isWholesaleContext ? '💡 Plazo mayorista (7 días hábiles):' : '💡 Próximo reparto programado:'}</span>
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
                      disabled={originalOrderSnapshot?.status === 'Cancelado' || originalOrderSnapshot?.status === 'Anulado'}
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
                    {(originalOrderSnapshot?.status === 'Cancelado' || originalOrderSnapshot?.status === 'Anulado') &&
                      <p className="text-xs text-amber-700">Para cambiar este estado, usá «Reactivar pedido» en la lista.</p>}
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
                        onClick={() => setIsImportWhatsAppOpen(true)}
                        className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-lg text-[10.5px] font-black uppercase tracking-wider flex items-center gap-1 transition-colors border border-emerald-200/80 cursor-pointer shadow-2xs"
                        title="Pegar e importar presupuesto desde mensaje de WhatsApp"
                      >
                        <Download className="w-3 h-3 text-emerald-600" /> Pegar WhatsApp
                      </button>

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
                        <p className="text-[11px] text-slate-400 mt-0.5">Abrí el selector para armar el pedido con kits o pegá un presupuesto de WhatsApp</p>
                      </div>
                      <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                        <button 
                          type="button" 
                          onClick={(e) => { e.stopPropagation(); setIsVisualModalOpen(true); }}
                          className="inline-flex items-center gap-1.5 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-black transition-all shadow-sm cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" /> Seleccionar Productos y Kits
                        </button>
                        <button 
                          type="button" 
                          onClick={(e) => { e.stopPropagation(); setIsImportWhatsAppOpen(true); }}
                          className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black transition-all shadow-sm cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" /> Pegar Presupuesto WhatsApp
                        </button>
                      </div>
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
                                  <QuantityInput value={item.quantity} onChange={quantity => updateQuantity(item.id, quantity)} />
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
                              <QuantityInput value={item.quantity} onChange={quantity => updateQuantity(item.id, quantity)} />
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
                  {isWholesaleContext ? (
                  <div className="flex flex-col gap-2 p-2.5 bg-white rounded-xl border border-slate-200">
                    <div className="flex items-center justify-between">
                      <span className="text-[9.5px] font-black text-slate-700 uppercase tracking-wide flex items-center gap-1"><Tag className="w-3.5 h-3.5 text-amber-600" /> Descuentos del pedido</span>
                      {orderDiscountAmount > 0 && <span className="text-[10.5px] font-black text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">-{formatPrice(orderDiscountAmount)}</span>}
                    </div>
                    {orderDiscountBreakdown.map(discount => (
                      <div key={discount.id} className="rounded-lg border border-amber-200 bg-amber-50/40 p-2 space-y-1.5">
                        <div className="flex gap-1.5">
                          <input aria-label="Descripción del descuento" value={discount.description} onChange={event => updateOrderDiscounts(effectiveOrderDiscounts.map(item => item.id === discount.id ? { ...item, description: event.target.value } : item))} className="min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-bold" />
                          <button type="button" aria-label="Quitar descuento" onClick={() => updateOrderDiscounts(effectiveOrderDiscounts.filter(item => item.id !== discount.id))} className="px-1.5 text-slate-400 hover:text-red-600"><X className="w-3.5 h-3.5" /></button>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="flex overflow-hidden rounded-md border border-slate-200 bg-slate-100 text-xs">
                            {(['percentage', 'fixed'] as const).map(type => <button key={type} type="button" onClick={() => updateOrderDiscounts(effectiveOrderDiscounts.map(item => item.id === discount.id ? { ...item, type } : item))} className={`px-2 py-1 font-black ${discount.type === type ? 'bg-amber-500 text-white' : 'text-slate-600'}`}>{type === 'percentage' ? '%' : '$'}</button>)}
                          </div>
                          <input aria-label={`Valor de ${discount.description}`} type="number" min="0" value={discount.value || ''} onChange={event => updateOrderDiscounts(effectiveOrderDiscounts.map(item => item.id === discount.id ? { ...item, value: Math.max(0, Number(event.target.value)) } : item))} className="min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-bold" />
                          <span className="min-w-20 text-right text-xs font-black text-amber-700">-{formatPrice(discount.amount)}</span>
                        </div>
                      </div>
                    ))}
                    <button type="button" onClick={() => updateOrderDiscounts([...effectiveOrderDiscounts, { id: crypto.randomUUID(), description: 'Otro descuento', type: 'percentage', value: 0 }])} className="rounded-lg border border-dashed border-amber-300 py-1.5 text-[10px] font-bold text-amber-700 hover:bg-amber-50">+ Agregar otro descuento</button>
                    <p className="text-[9.5px] text-slate-400 font-medium italic">En planilla se registra el total como monto fijo en Descuento Compra Mayorista.</p>
                  </div>
                  ) : (
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
                  )}
                  
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
                  <div className="bg-white rounded-xl border border-slate-200 p-2.5 space-y-1.5 shadow-2xs">
                    <label className="flex items-center justify-between cursor-pointer select-none">
                      <div className="flex flex-col">
                        <span className="text-[9px] font-black text-slate-600 uppercase tracking-wide">Factura con IVA (+21% Total)</span>
                        <span className="text-[8px] font-semibold text-slate-400">Aplica 21% sobre el total del pedido</span>
                      </div>
                      <input 
                        type="checkbox" 
                        checked={includeIVA} 
                        onChange={(e) => setIncludeIVA(e.target.checked)} 
                        className="w-3.5 h-3.5 rounded text-brand-600 focus:ring-brand-500/10 cursor-pointer"
                      />
                    </label>
                    {!includeIVA && partialIvaAmount > 0 && (
                      <div className="pt-1.5 border-t border-slate-100 flex items-center justify-between text-[9px]">
                        <span className="font-bold text-blue-600 flex items-center gap-1">
                          <FileText className="w-3 h-3" /> Factura parcial en comprobantes
                        </span>
                        <span className="font-black text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">
                          +{formatPrice(partialIvaAmount)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Columna Derecha: Detalle de Pagos, Financiación, Totales y Confirmación */}
              <div className="space-y-4 bg-slate-50/90 p-4 rounded-xl border border-slate-200/95 h-fit">

                {/* Métodos de Pago / Financiación */}
                <div className="flex items-center justify-between border-b border-slate-200/60 pb-1.5 mb-3">
                  <h3 className="flex items-center gap-1.5 font-black text-slate-800 text-xs uppercase tracking-wider">
                    <CreditCard className="w-4 h-4 text-brand-500" /> Detalle de Pagos y Comprobantes
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
                          card_surcharge: 0,
                          card_installments: 1,
                          receipt_url: "",
                          notes: "",
                          telegram_sent: false,
                          has_iva: false,
                          iva_mode: 'included'
                        }
                      ]);
                    }}
                    className="text-[9px] font-black text-brand-600 hover:text-brand-700 bg-brand-50 hover:bg-brand-100/80 px-2.5 py-1 rounded-lg border border-brand-200 transition-colors flex items-center gap-1 uppercase tracking-wider cursor-pointer"
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
                        if (paymentsList.length === 1 && !paymentsList[0].receipt_url) {
                          setPaymentsList(prev => prev.map(item => ({ ...item, amount: 0 })));
                        }
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
                        if (paymentsList.length === 1) {
                          setPaymentsList(prev => prev.map(item => ({ ...item, amount: total })));
                        }
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
                          onChange={(e) => {
                            const val = Math.max(0, Number(e.target.value));
                            setCustomDepositAmount(val);
                            if (paymentsList.length === 1) {
                              setPaymentsList(prev => prev.map(p => ({ ...p, amount: val })));
                            }
                          }}
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
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="bg-slate-100 text-slate-700 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md">
                            {paymentsList.length > 1 ? `Comprobante / Pago #${idx + 1}` : 'Pago / Comprobante'}
                          </span>
                          {p.receipt_url ? (
                            <span className="text-[9px] font-extrabold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
                              <Check className="w-3 h-3 text-emerald-600 stroke-[3]" /> Comprobante adjunto
                            </span>
                          ) : (
                            <span className="text-[9px] font-medium text-slate-400">
                              Sin archivo adjunto
                            </span>
                          )}
                        </div>

                        {paymentsList.length > 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              const remaining = paymentsList.filter(item => item.id !== p.id);
                              setPaymentsList(remaining);
                              const totalAllocated = remaining.reduce((sum, item) => sum + (item.amount || 0), 0);
                              if (totalAllocated === 0) {
                                if (!remaining.some(item => Boolean(item.receipt_url))) setPaymentTiming('contra_entrega');
                                setCustomDepositAmount(0);
                              } else if (totalAllocated >= total && total > 0) {
                                setPaymentTiming('paid');
                                setCustomDepositAmount(total);
                              } else {
                                setPaymentTiming('partial');
                                setCustomDepositAmount(totalAllocated);
                              }
                            }}
                            className="text-slate-400 hover:text-red-500 p-1.5 rounded-lg transition-colors cursor-pointer"
                            title="Eliminar este pago"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {/* Selector de Medio de Pago */}
                        <div className="flex flex-col gap-1">
                          <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider">Medio de Pago</span>
                          <select
                            value={isPaywayPaymentMethod(p.payment_method_id) ? 'payway_group' : p.payment_method_id}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === 'payway_group') {
                                const targetPm = getPaywayMethodByInstallments(1);
                                setPaymentsList(prev => prev.map(item => {
                                  if (item.id === p.id) {
                                    return {
                                      ...item,
                                      payment_method_id: targetPm ? targetPm.id : val,
                                      card_surcharge: targetPm ? targetPm.surcharge_percentage : 13.5,
                                      card_installments: targetPm ? targetPm.installments : 1
                                    };
                                  }
                                  return item;
                                }));
                              } else {
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
                              }
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

                        {/* Monto del Comprobante / Pago */}
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center justify-between">
                            <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider">
                              {p.receipt_url ? "Monto del Comprobante" : "Monto a Abonar"}
                            </span>
                            {total > 0 && p.amount === 0 && (
                              <button
                                type="button"
                                onClick={() => handlePaymentAmountChange(p.id, total)}
                                className="text-[9px] font-bold text-brand-600 hover:underline cursor-pointer"
                              >
                                Cubre Total
                              </button>
                            )}
                          </div>
                          <div className="relative">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">$</span>
                            <input
                              type="number"
                              value={p.amount === 0 ? "" : p.amount}
                              onChange={(e) => handlePaymentAmountChange(p.id, Math.max(0, Number(e.target.value)))}
                              placeholder={paymentsList.length === 1 && paymentTiming === 'paid' ? `${p.baseAmount}` : "Monto..."}
                              className="w-full pl-5 pr-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:ring-2 focus:ring-brand-500/10 focus:border-brand-500 bg-slate-50"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Sub-selector de Planes de Cuotas Payway */}
                      {isPaywayPaymentMethod(p.payment_method_id) && (
                        <div className="bg-blue-50/70 p-2.5 rounded-lg border border-blue-200/80 flex flex-col gap-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[8.5px] font-black text-blue-900 uppercase tracking-wider">
                              💳 Planes de Cuotas Payway
                            </span>
                            <span className="text-[8px] font-bold text-blue-600">
                              Seleccioná el plan de cuotas y recargo
                            </span>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                            {[
                              { inst: 1, sur: 13.5, label: "1 cuota", tag: "+13,5%" },
                              { inst: 3, sur: 32.0, label: "3 cuotas", tag: "+32%" },
                              { inst: 6, sur: 43.2, label: "6 cuotas", tag: "+43,2%" },
                              { inst: 12, sur: 61.4, label: "12 cuotas", tag: "+61,4%" },
                            ].map((plan) => {
                              const isSelected = (p.card_installments === plan.inst && p.card_surcharge === plan.sur) || (!p.card_installments && plan.inst === 1);
                              return (
                                <button
                                  key={plan.inst}
                                  type="button"
                                  onClick={() => {
                                    const targetPm = getPaywayMethodByInstallments(plan.inst);
                                    setPaymentsList(prev => prev.map(item => {
                                      if (item.id === p.id) {
                                        return {
                                          ...item,
                                          payment_method_id: targetPm ? targetPm.id : item.payment_method_id,
                                          card_surcharge: plan.sur,
                                          card_installments: plan.inst
                                        };
                                      }
                                      return item;
                                    }));
                                  }}
                                  className={`px-2 py-1.5 rounded-lg border text-center transition-all cursor-pointer ${
                                    isSelected
                                      ? "bg-blue-600 border-blue-600 text-white shadow-sm font-black ring-2 ring-blue-300"
                                      : "bg-white border-blue-200 text-slate-700 hover:bg-blue-100/60 font-bold"
                                  }`}
                                >
                                  <div className="text-[11px] leading-tight">{plan.label}</div>
                                  <div className={`text-[9.5px] leading-tight mt-0.5 ${isSelected ? "text-blue-100" : "text-blue-600"}`}>
                                    {plan.tag}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

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
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPaymentsList(prev => prev.map(item => item.id === p.id ? { ...item, card_surcharge: 42 } : item));
                                  }}
                                  className={`px-1.5 py-0.5 text-[9px] font-bold rounded border transition-colors cursor-pointer ${p.card_surcharge === 42 ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                                  title="Aplicar recargo 42% (Cuota Simple)"
                                >
                                  42%
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPaymentsList(prev => prev.map(item => item.id === p.id ? { ...item, card_surcharge: 51, card_installments: 1 } : item));
                                  }}
                                  className={`px-1.5 py-0.5 text-[9px] font-bold rounded border transition-colors cursor-pointer ${p.card_surcharge === 51 ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                                  title="Aplicar recargo 51% (Tarjeta Naranja)"
                                >
                                  51%
                                </button>
                              </div>
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
                      {/* Opción de Facturación con IVA (21%) para este pago */}
                      {!includeIVA && (
                        <div className={`p-2.5 rounded-xl border transition-all ${
                          p.has_iva 
                            ? 'bg-blue-50/70 border-blue-200 text-blue-900 shadow-2xs' 
                            : 'bg-slate-50/50 border-slate-200/80 hover:bg-slate-50 text-slate-600'
                        }`}>
                          <div className="flex items-center justify-between gap-2">
                            <label className="flex items-center gap-2 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={Boolean(p.has_iva)}
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  setPaymentsList(prev => prev.map(item => item.id === p.id ? {
                                    ...item,
                                    has_iva: checked,
                                    iva_mode: item.iva_mode || 'included'
                                  } : item));
                                }}
                                className="w-3.5 h-3.5 rounded text-blue-600 focus:ring-blue-500/20 cursor-pointer"
                              />
                              <span className="text-[10px] font-black uppercase tracking-wider text-slate-700 flex items-center gap-1">
                                <FileText className="w-3.5 h-3.5 text-blue-500" />
                                Factura con IVA (21%) en este pago
                              </span>
                            </label>

                            {p.has_iva && p.ivaValue > 0 && (
                              <span className="text-[10px] font-black text-blue-700 bg-blue-100/80 px-2 py-0.5 rounded-full border border-blue-200 whitespace-nowrap">
                                IVA: +{formatPrice(p.ivaValue)}
                              </span>
                            )}
                          </div>

                          {p.has_iva && (
                            <div className="mt-2 pt-2 border-t border-blue-200/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2 animate-in fade-in duration-150">
                              <div className="flex items-center gap-3">
                                <label className="flex items-center gap-1.5 cursor-pointer text-[9px] font-bold text-slate-700 select-none">
                                  <input
                                    type="radio"
                                    name={`iva_mode_${p.id}`}
                                    checked={p.iva_mode !== 'added'}
                                    onChange={() => {
                                      setPaymentsList(prev => prev.map(item => item.id === p.id ? { ...item, iva_mode: 'included' } : item));
                                    }}
                                    className="w-3 h-3 text-blue-600 focus:ring-blue-500/20 cursor-pointer"
                                  />
                                  <span>Monto ya incluye IVA (desglosar 21%)</span>
                                </label>
                                <label className="flex items-center gap-1.5 cursor-pointer text-[9px] font-bold text-slate-700 select-none">
                                  <input
                                    type="radio"
                                    name={`iva_mode_${p.id}`}
                                    checked={p.iva_mode === 'added'}
                                    onChange={() => {
                                      setPaymentsList(prev => prev.map(item => item.id === p.id ? { ...item, iva_mode: 'added' } : item));
                                    }}
                                    className="w-3 h-3 text-blue-600 focus:ring-blue-500/20 cursor-pointer"
                                  />
                                  <span>Sumar +21% sobre este monto</span>
                                </label>
                              </div>

                              <div className="text-[9px] font-extrabold text-blue-800 bg-white/90 px-2 py-0.5 rounded-md border border-blue-200/80 whitespace-nowrap">
                                Base: <span className="font-black">{formatPrice(p.taxableBase)}</span> • IVA 21%: <span className="font-black">{formatPrice(p.ivaValue)}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Comprobante de pago y notas */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-slate-100">
                        {/* Comprobante */}
                        <div className="flex flex-col gap-1">
                          <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider">Comprobante (Foto / PDF)</span>
                          {p.receipt_url ? (
                            <div className="flex items-center gap-2 p-1.5 bg-slate-50 border border-slate-200 rounded-lg">
                              {p.receipt_url.toLowerCase().includes('.pdf') ? (
                                <FileText className="w-5 h-5 text-rose-500 shrink-0" />
                              ) : (
                                <img src={p.receipt_url} alt="Comprobante" className="w-6 h-6 object-cover rounded border border-slate-200 shrink-0" />
                              )}
                              <div className="flex-1 min-w-0">
                                <a
                                  href={p.receipt_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-[10px] font-bold text-brand-600 hover:text-brand-800 hover:underline flex items-center gap-1 truncate"
                                  title="Abrir comprobante"
                                >
                                  <ExternalLink className="w-3 h-3 inline" /> Ver archivo
                                </a>
                                <span className="text-[8px] font-semibold text-emerald-600 block">
                                  {p.telegram_sent ? "✓ Enviado a Telegram" : "✓ Se enviará a Telegram al guardar"}
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleRemovePaymentReceipt(p.id)}
                                className="p-1 text-slate-400 hover:text-red-500 rounded transition-colors cursor-pointer"
                                title="Quitar comprobante"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex flex-col gap-1.5">
                              <div
                                role="group"
                                tabIndex={uploadingReceiptId ? -1 : 0}
                                aria-label="Pegar imagen del comprobante de este pago"
                                aria-disabled={Boolean(uploadingReceiptId)}
                                onClick={(e) => e.currentTarget.focus()}
                                onPaste={(e) => {
                                  const image = Array.from(e.clipboardData.items)
                                    .find(item => item.kind === "file" && item.type.startsWith("image/"))
                                    ?.getAsFile();
                                  if (!image) return;
                                  e.preventDefault();
                                  if (receiptUploadInProgress.current) return;
                                  void handlePaymentReceiptUpload(p.id, image);
                                }}
                                className="px-3 py-2 border border-dashed border-brand-300 rounded-lg bg-brand-50/50 text-center text-brand-700 cursor-text outline-none focus:ring-2 focus:ring-brand-500 focus:bg-brand-100/60"
                              >
                                <span className="block text-[10px] font-extrabold">Pegá una imagen con Ctrl+V (o ⌘V)</span>
                                <span className="block text-[9px]">Copiá la imagen en WhatsApp y hacé clic acá para pegarla.</span>
                              </div>
                              <label className="flex items-center justify-center gap-1.5 py-1.5 px-3 border border-dashed border-brand-300 bg-brand-50/50 hover:bg-brand-100/60 rounded-lg cursor-pointer transition-colors text-brand-700">
                                {uploadingReceiptId === p.id ? (
                                  <Loader2 className="w-3.5 h-3.5 text-brand-600 animate-spin" />
                                ) : (
                                  <UploadCloud className="w-3.5 h-3.5 text-brand-500" />
                                )}
                                <span className="text-[10px] font-extrabold">
                                  {uploadingReceiptId === p.id ? "Subiendo archivo..." : "Subir comprobante"}
                                </span>
                                <input
                                  type="file"
                                  accept="image/*,application/pdf"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) handlePaymentReceiptUpload(p.id, file);
                                    e.target.value = "";
                                  }}
                                  className="hidden"
                                  disabled={Boolean(uploadingReceiptId)}
                                />
                              </label>
                            </div>
                          )}
                        </div>

                        {/* Notas / Observación */}
                        <div className="flex flex-col gap-1">
                          <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider">Nota / Observación (Opcional)</span>
                          <input
                            type="text"
                            value={p.notes || ""}
                            onChange={(e) => {
                              const val = e.target.value;
                              setPaymentsList(prev => prev.map(item => item.id === p.id ? { ...item, notes: val } : item));
                            }}
                            placeholder="Ej: Seña, primer pago..."
                            className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-[10px] font-bold outline-none focus:ring-2 focus:ring-brand-500/10 focus:border-brand-500 bg-slate-50"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Botón para agregar otro comprobante / pago */}
                <button
                  type="button"
                  onClick={() => {
                    setPaymentsList(prev => [
                      ...prev,
                      {
                        id: Math.random().toString(36).substring(2, 9),
                        payment_method_id: "a3a890a8-b677-4b7b-8ffb-d36c2e7b5ad3",
                        amount: 0,
                        card_surcharge: 0,
                        card_installments: 1,
                        receipt_url: "",
                        notes: "",
                        telegram_sent: false,
                        has_iva: false,
                        iva_mode: 'included'
                      }
                    ]);
                  }}
                  className="w-full py-2 border-2 border-dashed border-slate-200 hover:border-brand-300 hover:bg-brand-50/50 rounded-xl text-slate-500 hover:text-brand-700 text-xs font-black flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Agregar otro comprobante o medio de pago
                </button>

                {/* Resumen de Cobro del Pedido */}
                <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-black text-slate-600 uppercase tracking-wide">
                      Resumen de Cobro y Descuento
                    </span>
                    {paymentTiming === 'paid' ? (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
                        <Check className="w-3 h-3 stroke-[3]" /> Completado (Abonado)
                      </span>
                    ) : paymentTiming === 'partial' ? (
                      <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
                        💵 Parcial (Señado)
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-800 text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
                        ❌ A Cobrar en Domicilio (Pendiente)
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100 text-xs">
                    <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                      <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider block">
                        Total Pagado / Comprobantes:
                      </span>
                      <span className={`text-xs font-black ${totalPaid > 0 ? 'text-emerald-700' : 'text-slate-600'}`}>
                        {formatPrice(totalPaid)}
                      </span>
                    </div>

                    <div className={`p-2 rounded-lg border ${pendingBalance > 0 ? 'bg-amber-50/60 border-amber-200' : 'bg-emerald-50/60 border-emerald-200'}`}>
                      <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider block">
                        Saldo a Cobrar en Entrega:
                      </span>
                      <span className={`text-xs font-black ${pendingBalance > 0 ? 'text-amber-800' : 'text-emerald-700'}`}>
                        {formatPrice(pendingBalance)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Vista de Totales */}
                <div className="bg-white p-3 rounded-xl border border-slate-200/60 space-y-2 mt-4">
                  <div className="flex justify-between text-xs font-bold text-slate-600">
                    <span>Subtotal Artículos</span>
                    <span>{formatPrice(itemsGrossSubtotal)}</span>
                  </div>
                  {orderDiscountBreakdown.filter(discount => discount.amount > 0).map(discount => (
                    <div key={discount.id} className="flex justify-between text-xs font-black text-amber-600 bg-amber-50/70 p-1.5 rounded-lg border border-amber-200/70">
                      <span>{discount.description} ({discount.type === 'percentage' ? `${discount.value}%` : 'Monto Fijo'})</span>
                      <span>-{formatPrice(discount.amount)}</span>
                    </div>
                  ))}
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
                      <span>{includeIVA ? "IVA Total (21%)" : "IVA Factura Parcial (21%)"}</span>
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
                <div className="mt-4 pt-3 border-t border-slate-200/60 space-y-2">
                  <Button 
                    type="submit" 
                    disabled={submitting || orderItems.length === 0} 
                    className="w-full py-2.5 rounded-xl text-xs font-black flex items-center justify-center gap-1.5"
                  >
                    <Save className="w-4 h-4" /> Ver Resumen y Reservar Stock
                  </Button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleCancelOrExitForm}
                      className="flex-1 py-2 bg-slate-100 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 text-slate-600 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer border border-slate-200 shadow-2xs"
                      title="Cancelar y volver al listado de pedidos"
                    >
                      <X className="w-3.5 h-3.5 text-rose-500" />
                      <span>Cancelar y Salir</span>
                    </button>

                    {orderItems.length > 0 && (
                      <button
                        type="button"
                        onClick={handleOpenCurrentFormPrintable}
                        className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer border border-slate-200"
                        title="Ver o imprimir comprobante de este pedido"
                      >
                        <Printer className="w-3.5 h-3.5 text-slate-500" />
                        <span>Comprobante</span>
                      </button>
                    )}
                  </div>
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

              {/* Filtro de Estado (Menú Multi-selección) */}
              <div className="relative shrink-0 w-full sm:w-44">
                <button
                  type="button"
                  onClick={() => {
                    setShowStatusDropdown(prev => !prev);
                    setShowChannelDropdown(false);
                    setShowProductDropdown(false);
                    setShowCustomViewsDropdown(false);
                  }}
                  className={`w-full px-3 py-1.5 rounded-xl border font-bold text-[10px] uppercase tracking-wider focus:ring-2 focus:ring-brand-500/10 outline-none cursor-pointer transition-all flex items-center justify-between gap-1.5 h-[28px] ${
                    selectedStatuses.length > 0 && selectedStatuses.length < 4
                      ? "bg-brand-50 border-brand-200 text-brand-700 shadow-xs"
                      : "bg-white border-slate-200 text-slate-600 hover:text-slate-800"
                  }`}
                >
                  <span className="truncate flex items-center gap-1.5">
                    <span className="inline-block w-2 h-2 rounded-full bg-brand-500 shrink-0" />
                    {selectedStatuses.length === 0 || selectedStatuses.length === 4
                      ? "Todos los Estados"
                      : selectedStatuses.length === 1
                      ? selectedStatuses[0]
                      : `Estados (${selectedStatuses.length})`}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                </button>

                {showStatusDropdown && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setShowStatusDropdown(false)}
                    />
                    <div className="absolute left-0 mt-1 w-56 bg-white rounded-xl border border-slate-200 shadow-lg z-50 overflow-hidden flex flex-col">
                      <div className="px-3 py-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                        <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Estados</span>
                        <div className="flex items-center gap-2 text-[10px] font-bold">
                          <button
                            type="button"
                            onClick={() => setSelectedStatuses(['Pendientes', 'En Revisión', 'Entregados', 'Anulados'])}
                            className="text-brand-600 hover:text-brand-700 cursor-pointer"
                          >
                            Todos
                          </button>
                          <span className="text-slate-300">|</span>
                          <button
                            type="button"
                            onClick={() => setSelectedStatuses([])}
                            className="text-slate-400 hover:text-slate-600 cursor-pointer"
                          >
                            Limpiar
                          </button>
                        </div>
                      </div>

                      <div className="py-1 divide-y divide-slate-50">
                        {[
                          { id: 'Pendientes', label: 'Pendientes', dot: 'bg-amber-500' },
                          { id: 'En Revisión', label: 'En Revisión', dot: 'bg-blue-500' },
                          { id: 'Entregados', label: 'Entregados', dot: 'bg-emerald-500' },
                          { id: 'Anulados', label: 'Anulados', dot: 'bg-rose-500' }
                        ].map((item) => {
                          const isSelected = selectedStatuses.includes(item.id);
                          return (
                            <label
                              key={item.id}
                              className="flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 cursor-pointer select-none transition-colors"
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => {
                                  if (isSelected) {
                                    setSelectedStatuses(prev => prev.filter(s => s !== item.id));
                                  } else {
                                    setSelectedStatuses(prev => [...prev, item.id]);
                                  }
                                }}
                                className="w-3.5 h-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-500/10 cursor-pointer"
                              />
                              <span className={`w-2 h-2 rounded-full ${item.dot} shrink-0`} />
                              <span className={`text-xs font-semibold ${isSelected ? 'text-slate-900 font-bold' : 'text-slate-600'}`}>
                                {item.label}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Filtro de Tipo de Cliente / Canal (Menú Multi-selección) - Oculto para vendedoras minoristas restringidas */}
              {!isRestrictedSeller && (
                <div className="relative shrink-0 w-full sm:w-48">
                  <button
                    type="button"
                    onClick={() => {
                      setShowChannelDropdown(prev => !prev);
                      setShowStatusDropdown(false);
                      setShowProductDropdown(false);
                      setShowCustomViewsDropdown(false);
                    }}
                    className={`w-full px-3 py-1.5 rounded-xl border font-bold text-[10px] uppercase tracking-wider focus:ring-2 focus:ring-violet-500/10 outline-none cursor-pointer transition-all flex items-center justify-between gap-1.5 h-[28px] ${
                      selectedChannels.length === 1
                        ? "bg-violet-50 border-violet-200 text-violet-700 shadow-xs"
                        : "bg-white border-slate-200 text-slate-600 hover:text-slate-800"
                    }`}
                  >
                    <span className="truncate flex items-center gap-1.5">
                      <span>🛍️</span>
                      {selectedChannels.length === 0 || selectedChannels.length === 2
                        ? "Todos los Canales"
                        : selectedChannels.includes('minoristas')
                        ? "Minoristas (B2C)"
                        : "Mayoristas (B2B) 👑"}
                    </span>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  </button>

                  {showChannelDropdown && (
                    <>
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => setShowChannelDropdown(false)}
                      />
                      <div className="absolute left-0 mt-1 w-56 bg-white rounded-xl border border-slate-200 shadow-lg z-50 overflow-hidden flex flex-col">
                        <div className="px-3 py-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                          <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Canales</span>
                          <div className="flex items-center gap-2 text-[10px] font-bold">
                            <button
                              type="button"
                              onClick={() => setSelectedChannels(['minoristas', 'mayoristas'])}
                              className="text-violet-600 hover:text-violet-700 cursor-pointer"
                            >
                              Todos
                            </button>
                            <span className="text-slate-300">|</span>
                            <button
                              type="button"
                              onClick={() => setSelectedChannels([])}
                              className="text-slate-400 hover:text-slate-600 cursor-pointer"
                            >
                              Limpiar
                            </button>
                          </div>
                        </div>

                        <div className="py-1 divide-y divide-slate-50">
                          {[
                            { id: 'minoristas' as const, label: 'Minoristas (B2C)' },
                            { id: 'mayoristas' as const, label: 'Mayoristas (B2B) 👑' }
                          ].map((item) => {
                            const isSelected = selectedChannels.includes(item.id);
                            return (
                              <label
                                key={item.id}
                                className="flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 cursor-pointer select-none transition-colors"
                              >
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => {
                                    if (isSelected) {
                                      setSelectedChannels(prev => prev.filter(c => c !== item.id));
                                    } else {
                                      setSelectedChannels(prev => [...prev, item.id]);
                                    }
                                  }}
                                  className="w-3.5 h-3.5 rounded border-slate-300 text-violet-600 focus:ring-violet-500/10 cursor-pointer"
                                />
                                <span className={`text-xs font-semibold ${isSelected ? 'text-slate-900 font-bold' : 'text-slate-600'}`}>
                                  {item.label}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Filtro de Vendedor */}
              {(role === 'admin' || assignableSellers.length > 0) && (
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
                    {assignableSellers.map((s) => (
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
                            const today = formatDateInput(new Date());
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
                            const d = new Date();
                            d.setDate(d.getDate() - 1);
                            const yesterday = formatDateInput(d);
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
                            const today = formatDateInput(new Date());
                            const d = new Date();
                            d.setDate(d.getDate() - 7);
                            const last7 = formatDateInput(d);
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
                            const { firstDay, today } = getCurrentMonthRange();
                            setDateFrom(firstDay);
                            setDateTo(today);
                          }}
                          className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors cursor-pointer text-center"
                        >
                          Este mes
                        </button>
                      </div>

                      {/* Inputs manuales */}
                      <div className="space-y-2 pt-1 border-t border-slate-100">
                        <DateInput
                          label="Desde"
                          value={dateFrom}
                          onChange={setDateFrom}
                        />
                        <DateInput
                          label="Hasta"
                          value={dateTo}
                          onChange={setDateTo}
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>

              <button
                type="button"
                onClick={handleStartNewOrder}
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
                  <th className="px-3 py-2.5 text-[9px] font-black uppercase tracking-wider text-slate-400 text-center min-w-[140px] whitespace-nowrap">Acciones</th>
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
                        <button
                          type="button"
                          onClick={() => handleOpenViewOrder(p)}
                          className="hover:text-brand-600 hover:underline transition-colors cursor-pointer text-left font-black"
                          title="Clic para ver detalle completo del pedido (modo lectura)"
                        >
                          {p.customer_name}
                        </button>
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
                        p.status === 'Cancelado' ? 'text-rose-700 bg-rose-50 border border-rose-300 font-black' :
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
                        {/* Ver Detalle del Pedido (Lectura sin edición) */}
                        <button
                          type="button"
                          onClick={() => handleOpenViewOrder(p)}
                          className="p-1.5 bg-slate-50 hover:bg-slate-800 text-slate-600 hover:text-white rounded-lg border border-slate-200 hover:border-slate-800 transition-all duration-150 active:scale-90 shadow-2xs cursor-pointer"
                          title="Ver Detalle del Pedido (Modo Lectura)"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>

                        {/* Imprimir / Comprobante de Pedido */}
                        <button
                          type="button"
                          onClick={() => handleOpenPrintOrder(p)}
                          className="p-1.5 bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white rounded-lg border border-emerald-200 hover:border-emerald-600 transition-all duration-150 active:scale-90 shadow-2xs cursor-pointer"
                          title="Imprimir / Exportar Comprobante de Pedido (PDF e Imagen)"
                        >
                          <Printer className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleEditOrder(p)}
                          disabled={p.status === 'Cancelado' || p.status === 'Anulado'}
                          className="p-1.5 bg-slate-50 hover:bg-brand-600 text-slate-500 hover:text-white rounded-lg border border-slate-200 hover:border-brand-600 transition-all duration-150 active:scale-90 shadow-2xs cursor-pointer"
                          title="Editar Pedido"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenOrderHistory(p)}
                          className="p-1.5 bg-slate-50 hover:bg-purple-600 text-slate-500 hover:text-white rounded-lg border border-slate-200 hover:border-purple-600 transition-all duration-150 active:scale-90 shadow-2xs cursor-pointer"
                          title="Ver Historial de Modificaciones"
                        >
                          <History className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCloneOrder(p)}
                          className="p-1.5 bg-slate-50 hover:bg-blue-600 text-slate-500 hover:text-white rounded-lg border border-slate-200 hover:border-blue-600 transition-all duration-150 active:scale-90 shadow-2xs cursor-pointer"
                          title="Duplicar / Cargar como Nuevo Pedido"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        {p.channel !== 'mayorista' && <button
                          type="button"
                          onClick={() => handleSyncExistingOrderToSheet(p)}
                          disabled={syncingOrderId === p.id || p.status === 'Cancelado' || p.status === 'Anulado'}
                          className={`p-1.5 bg-slate-50 hover:bg-emerald-600 text-slate-500 hover:text-white rounded-lg border border-slate-200 hover:border-emerald-600 transition-all duration-150 active:scale-90 shadow-2xs cursor-pointer ${
                            syncingOrderId === p.id ? 'opacity-50 cursor-not-allowed' : ''
                          }`}
                          title={p.legacy_code ? `Re-enviar a Planilla (Código actual: ${p.legacy_code})` : "Sincronizar a Planilla Google Sheets"}
                        >
                          <FileSpreadsheet className={`w-3.5 h-3.5 ${syncingOrderId === p.id ? 'animate-spin text-emerald-600' : ''}`} />
                        </button>}
                        <button
                          type="button"
                          onClick={() => handleOpenCancelModal(p)}
                          disabled={p.status === 'Cancelado'}
                          className={`p-1.5 bg-slate-50 hover:bg-rose-600 text-slate-500 hover:text-white rounded-lg border border-slate-200 hover:border-rose-600 transition-all duration-150 active:scale-90 shadow-2xs cursor-pointer ${
                            p.status === 'Cancelado' ? 'opacity-30 cursor-not-allowed hover:bg-slate-50 hover:text-slate-500 hover:border-slate-200' : ''
                          }`}
                          title={p.status === 'Cancelado' ? "Pedido ya anulado" : "Anular Pedido"}
                        >
                          <XCircle className="w-3.5 h-3.5" />
                        </button>
                        {(p.status === 'Cancelado' || p.status === 'Anulado') && (
                          <button type="button" onClick={() => handleReactivateOrder(p)}
                            disabled={reactivatingOrderId === p.id}
                            className="p-1.5 bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white rounded-lg border border-emerald-200 disabled:opacity-50"
                            title="Reactivar pedido">
                            {reactivatingOrderId === p.id
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              : <RotateCcw className="w-3.5 h-3.5" />}
                          </button>
                        )}
                        {role === 'admin' && (
                          <button
                            type="button"
                            onClick={async () => {
                              const code = String(p.legacy_code || '').trim().toUpperCase();
                              if (!code) {
                                alert('Este pedido todavía no tiene código de planilla y no puede revertirse de forma segura.');
                                return;
                              }
                              const confirmationCode = prompt(
                                `Esta acción es sólo para pedidos de prueba.\n\nSe eliminará ${code} del ERP, se liberará el stock, se limpiarán sus filas en todas las planillas y se borrarán sus avisos registrados de Telegram. El cliente NO será eliminado.\n\nEscribí ${code} para confirmar:`
                              );
                              if (confirmationCode?.trim().toUpperCase() !== code) return;

                              try {
                                const { data: { session } } = await supabase.auth.getSession();
                                if (!session?.access_token) throw new Error('La sesión venció. Volvé a ingresar al ERP.');
                                const res = await fetch('/api/vendedores/delete-order', {
                                  method: 'POST',
                                  headers: {
                                    'Content-Type': 'application/json',
                                    'Authorization': `Bearer ${session.access_token}`
                                  },
                                  body: JSON.stringify({
                                    orderId: p.id,
                                    confirmationCode: code
                                  })
                                });

                                const resData = await res.json();
                                if (!res.ok || !resData.success) {
                                  throw new Error(resData.error || 'Error al eliminar pedido');
                                }

                                setOrders(prev => prev.filter(o => o.id !== p.id));
                                const telegramWarning = resData.telegramDeletion?.failures?.length
                                  ? `\n\nAviso: ${resData.telegramDeletion.failures.length} mensaje(s) de Telegram no pudieron borrarse.`
                                  : '';
                                alert(`Pedido de prueba ${code} eliminado del ERP y de las planillas. El cliente se conservó.${telegramWarning}`);
                              } catch (err: any) {
                                alert(`Error al eliminar el pedido de prueba: ${err.message || err.details || 'Error desconocido'}`);
                              }
                            }}
                            className="p-1.5 bg-slate-50 hover:bg-red-600 text-slate-400 hover:text-white rounded-lg border border-slate-200 hover:border-red-600 transition-all duration-150 active:scale-90 shadow-2xs cursor-pointer"
                            title="Eliminar pedido de prueba (sólo administradores)"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )) : ordersError ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-red-500 font-medium text-xs">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <span>Hubo un problema al cargar los pedidos: {ordersError}</span>
                        <button
                          onClick={() => {
                            setOrdersError(null);
                            setRefreshTrigger(prev => prev + 1);
                          }}
                          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
                        >
                          Reintentar
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-400 font-bold text-xs">No se encontraron pedidos.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Datos obligatorios antes de confirmar */}
      {showRequiredOrderFieldsModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-lg overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 bg-gradient-to-r from-brand-50 via-white to-slate-50 p-5">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-brand-700">Dato obligatorio</p>
                <h2 className="mt-1 text-lg font-black text-slate-900">
                  {!selectedAdvertisingSourceId && isWhaticketLinkMissing
                    ? 'Completá los datos del pedido'
                    : !selectedAdvertisingSourceId
                      ? 'Seleccioná la procedencia'
                      : 'Pegá el link de Whaticket'}
                </h2>
                <p className="mt-1 text-sm font-medium text-slate-500">Completalos acá y continuá con el pedido sin perder los datos cargados.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowRequiredOrderFieldsModal(false)}
                className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-900"
                aria-label="Cerrar datos obligatorios"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-5">
              {!selectedAdvertisingSourceId && (
                <div className={isWhaticketLinkMissing ? 'mb-5' : ''}>
                  <label className="mb-3 flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-slate-600">
                    📢 Procedencia <span className="text-rose-600">*</span>
                  </label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {filteredAdvertisingSources.map((source) => {
                      const isSelected = selectedAdvertisingSourceId === source.id;
                      return (
                        <button
                          key={source.id}
                          type="button"
                          onClick={() => setSelectedAdvertisingSourceId(source.id)}
                          className={cn(
                            "min-h-12 rounded-xl border px-3 py-2 text-left text-xs font-bold transition-all",
                            isSelected
                              ? "border-brand-600 bg-brand-600 text-white ring-2 ring-brand-500/20 shadow-sm"
                              : "border-slate-200 bg-white text-slate-700 hover:border-brand-300 hover:bg-brand-50"
                          )}
                        >
                          {source.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {showWhaticketLinkFieldInModal && (
                <div className="space-y-2">
                  <label className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-slate-600">
                    🔗 Link de Whaticket <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="url"
                    value={whaticketLink}
                    onChange={(event) => setWhaticketLink(event.target.value)}
                    placeholder="https://whaticket... o pegar enlace de conversación"
                    autoFocus={!!selectedAdvertisingSourceId}
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 outline-none transition-all placeholder:font-medium placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10"
                  />
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-slate-100 bg-slate-50 p-5">
              <button
                type="button"
                onClick={() => setShowRequiredOrderFieldsModal(false)}
                className="rounded-xl px-4 py-2.5 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-200"
              >
                Volver
              </button>
              <Button
                type="button"
                disabled={!selectedAdvertisingSourceId || isWhaticketLinkMissing}
                onClick={() => {
                  const shouldResumeSubmission = showSummaryModal || showEditConfirmModal;
                  setShowRequiredOrderFieldsModal(false);
                  if (shouldResumeSubmission) {
                    void confirmAndSubmit();
                  } else if (resumeOrderReviewAfterRequiredFields) {
                    setResumeOrderReviewAfterRequiredFields(false);
                    openOrderReview();
                  }
                }}
                className="rounded-xl px-5 py-2.5 text-sm font-black"
              >
                Continuar con el pedido
              </Button>
            </div>
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
                              {advertisingSourceDetail.trim() ? `: ${advertisingSourceDetail.trim()}` : ''}
                            </span>
                          </p>
                        )}
                        {selectedOrderMediumId && (
                          <p className="font-bold text-slate-700">
                            Medio: <span className="font-black text-slate-900">
                              {orderMediums.find(m => m.id === selectedOrderMediumId)?.name}
                              {!isWholesaleContext && (() => {
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
                 {orderDiscountBreakdown.filter(discount => discount.amount > 0).map(discount => (
                   <div key={discount.id} className="flex justify-between text-sm font-black text-amber-600 bg-amber-50 p-1.5 rounded-lg border border-amber-200">
                     <span>{discount.description} ({discount.type === 'percentage' ? `${discount.value}%` : 'Monto Fijo'})</span>
                     <span>-{formatPrice(discount.amount)}</span>
                   </div>
                 ))}
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
                     <span>{includeIVA ? "IVA Total (21%)" : "IVA Factura Parcial (21%)"}</span>
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

      {/* Modal 1: Confirmar Modificación de Pedido */}
      {showEditConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200 border border-slate-100 overflow-hidden">
            {/* Header */}
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-gradient-to-r from-purple-50 via-indigo-50 to-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-purple-600 text-white rounded-xl shadow-sm">
                  <Edit2 className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
                    Confirmar Modificación
                    {legacyCode && (
                      <span className="text-xs font-mono bg-purple-100 text-purple-800 px-2 py-0.5 rounded-md border border-purple-200">
                        {legacyCode}
                      </span>
                    )}
                  </h2>
                  <p className="text-xs font-medium text-slate-500">
                    {isNewClient ? newClientName : cliente} • {localities.find(l => l.id === localidadId)?.name || 'Sin localidad'}
                  </p>
                </div>
              </div>
              <button 
                type="button" 
                onClick={() => setShowEditConfirmModal(false)}
                className="p-1.5 hover:bg-slate-200 rounded-full transition-colors text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              {/* Resumen de cambios detectados */}
              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80">
                <h3 className="text-xs font-black text-slate-700 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                  Cambios Detectados
                </h3>
                <div className="space-y-1.5 text-xs text-slate-700">
                  {editChangesSummary.map((diff, idx) => (
                    <div key={idx} className="flex items-start gap-2 bg-white p-2 rounded-lg border border-slate-100 shadow-2xs font-medium">
                      <span>{diff}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Campo para Observación de Logística (Opcional) */}
              <div className="bg-amber-50/70 rounded-2xl p-4 border border-amber-200/80 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5 text-amber-600" />
                    Observación para el Equipo Logístico
                  </label>
                  <span className="text-[10px] font-bold text-amber-700 bg-amber-100/70 px-2 py-0.5 rounded-full">
                    Opcional
                  </span>
                </div>
                <p className="text-[11px] text-amber-800 font-medium">
                  Cualquier indicación que deba tener en cuenta el equipo de logística sobre este cambio (horario, acceso, motivo, etc.):
                </p>
                <textarea
                  value={logisticsObservation}
                  onChange={e => setLogisticsObservation(e.target.value)}
                  placeholder="Ej: El cliente solicitó entregar por la tarde, cambió modelo de tanque..."
                  rows={3}
                  className="w-full text-xs p-3 rounded-xl border border-amber-200 bg-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 outline-none transition-all placeholder:text-slate-400"
                />
              </div>

              {/* Aviso sobre planilla y Telegram */}
              <div className="space-y-2">
                <div className="p-3 bg-purple-50/60 rounded-xl border border-purple-100 flex items-center gap-2 text-[11px] text-purple-800">
                  <FileSpreadsheet className="w-4 h-4 text-purple-600 shrink-0" />
                  <span>
                    Al confirmar, el pedido se actualizará en el sistema, <strong>impactará en la planilla de Google</strong> y se guardará el historial de cambios. Si su estado es <strong>"No está"</strong>, sólo se actualizará esa planilla.
                  </span>
                </div>

                {isLogisticallyRelevantChange(editChangesSummary, logisticsObservation) ? (
                  <div className="p-2.5 bg-emerald-50 rounded-xl border border-emerald-200 flex items-center gap-2 text-[11px] text-emerald-800 font-medium">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>🚚 <strong>Afecta a Logística:</strong> Se notificará automáticamente al grupo de Telegram.</span>
                  </div>
                ) : (
                  <div className="p-2.5 bg-slate-100 rounded-xl border border-slate-200 flex items-center gap-2 text-[11px] text-slate-600 font-medium">
                    <span className="text-xs">ℹ️</span>
                    <span><strong>Cambio administrativo:</strong> Se actualizará en el sistema y planilla sin enviar alerta a Logística.</span>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowEditConfirmModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
              >
                Volver
              </button>
              <Button
                type="button"
                onClick={confirmAndSubmit}
                disabled={submitting}
                className="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white font-black text-xs rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {submitting ? "Guardando y Sincronizando..." : "Confirmar Modificación"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 2: Éxito de Modificación y Mensaje Copiable para WhatsApp / Telegram */}
      {showModificationSuccessModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200 border border-slate-100 overflow-hidden">
            {/* Header */}
            <div className="p-5 border-b border-emerald-100 flex justify-between items-center bg-gradient-to-r from-emerald-50 via-teal-50 to-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-600 text-white rounded-xl shadow-sm">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-black text-slate-900">
                    ¡Pedido Modificado con Éxito!
                  </h2>
                  <p className="text-xs font-medium text-emerald-700 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse" />
                    ERP: Pendiente. Planilla: aviso de modificación para Logística.
                  </p>
                </div>
              </div>
              <button 
                type="button" 
                onClick={() => {
                  setShowModificationSuccessModal(false);
                  editingOrderIdRef.current = null;
                  setEditingOrderId(null);
                  setOriginalOrderSnapshot(null);
                  setActiveTab('list');
                }}
                className="p-1.5 hover:bg-slate-200 rounded-full transition-colors text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <Copy className="w-3.5 h-3.5 text-slate-500" />
                    Mensaje de Modificación
                  </span>
                  {isLogisticallyRelevant ? (
                    notifiedLogistics ? (
                      <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100/90 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1 shadow-2xs">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        Enviado a Telegram
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold text-amber-800 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-full flex items-center gap-1 shadow-2xs">
                        <AlertTriangle className="w-3 h-3 text-amber-600" />
                        No enviado a Telegram (Copiar abajo)
                      </span>
                    )
                  ) : (
                    <span className="text-[10px] font-bold text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                      ℹ️ Sin alerta a Logística (Cambio administrativo)
                    </span>
                  )}
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-3.5 text-xs font-mono text-slate-800 whitespace-pre-wrap select-all max-h-64 overflow-y-auto leading-relaxed">
                  {generatedModificationMessage}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row justify-between items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowModificationSuccessModal(false);
                  editingOrderIdRef.current = null;
                  setEditingOrderId(null);
                  setOriginalOrderSnapshot(null);
                  setActiveTab('list');
                }}
                className="w-full sm:w-auto px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
              >
                Cerrar y Ver Pedidos
              </button>

              <button
                type="button"
                onClick={async () => {
                  const ok = await copyRichMessageToClipboard(generatedModificationMessage);
                  if (ok) {
                    setCopiedModificationMessage(true);
                    setTimeout(() => setCopiedModificationMessage(false), 2500);
                  }
                }}
                className="w-full sm:w-auto px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-xs flex items-center justify-center gap-2 transition-all shadow-md active:scale-95 cursor-pointer"
              >
                {copiedModificationMessage ? <CheckCheck className="w-4 h-4 text-emerald-200" /> : <Copy className="w-4 h-4" />}
                {copiedModificationMessage ? "¡Mensaje Copiado al Portapapeles!" : "Copiar Mensaje para Telegram / WhatsApp"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 3: Historial de Modificaciones del Pedido */}
      {showOrderHistoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200 border border-slate-100 overflow-hidden">
            {/* Header */}
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-purple-600 text-white rounded-xl shadow-sm">
                  <History className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
                    Historial de Modificaciones
                    {selectedOrderForHistory?.legacy_code && (
                      <span className="text-xs font-mono bg-purple-100 text-purple-800 px-2 py-0.5 rounded-md border border-purple-200">
                        {selectedOrderForHistory.legacy_code}
                      </span>
                    )}
                  </h2>
                  <p className="text-xs font-medium text-slate-500">
                    Cliente: {selectedOrderForHistory?.customer_name}
                  </p>
                </div>
              </div>
              <button 
                type="button" 
                onClick={() => setShowOrderHistoryModal(false)}
                className="p-1.5 hover:bg-slate-200 rounded-full transition-colors text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              {loadingOrderHistory ? (
                <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-400">
                  <Loader2 className="w-6 h-6 animate-spin text-purple-600" />
                  <span className="text-xs font-bold">Cargando historial de cambios...</span>
                </div>
              ) : orderHistoryRecords.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs font-bold">
                  No hay modificaciones registradas para este pedido.
                </div>
              ) : (
                <div className="space-y-4">
                  {orderHistoryRecords.map((record, index) => {
                    const diffs = computeOrderDiff(record.original_data, {
                      customer_name: record.modified_data?.customer_name || '',
                      locality: record.modified_data?.locality || '',
                      direccion: record.modified_data?.address || '',
                      initial_delivery_date: record.modified_data?.initial_delivery_date || '',
                      total: record.modified_data?.total_amount || 0,
                      items: (record.modified_data?.items || []).map((it: any) => ({
                        id: it.product_id,
                        name: it.name,
                        sku: it.sku,
                        quantity: it.quantity,
                        price: it.price,
                        customPrice: it.price
                      })),
                      flete: record.modified_data?.freight_type || '',
                      payment_method_name: '',
                      payment_status: record.modified_data?.payment_status || '',
                      delivery_notes: record.modified_data?.delivery_notes || ''
                    });

                    return (
                      <div key={record.id || index} className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/60 pb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-slate-800">
                              👤 {record.changed_by_name || 'Vendedor'}
                            </span>
                          </div>
                          <span className="text-[10px] font-bold text-slate-500 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                            {new Date(record.changed_at).toLocaleString('es-AR')}
                          </span>
                        </div>

                        {record.change_reason && (
                          <div className="bg-amber-50 border border-amber-200/60 rounded-xl p-2.5 text-xs text-amber-900">
                            <span className="font-bold">💬 Observación: </span>
                            <span>{record.change_reason}</span>
                          </div>
                        )}

                        <div className="space-y-1">
                          <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                            Detalle de Cambios:
                          </span>
                          <div className="space-y-1 text-xs text-slate-700">
                            {diffs.map((d, dIdx) => (
                              <div key={dIdx} className="bg-white p-2 rounded-lg border border-slate-100 text-xs font-medium">
                                {d}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex justify-end">
              <button
                type="button"
                onClick={() => setShowOrderHistoryModal(false)}
                className="px-5 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 4: Confirmar Anulación de Pedido con Motivo Obligatorio */}
      {showCancelOrderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg flex flex-col animate-in zoom-in-95 duration-200 border border-slate-100 overflow-hidden">
            {/* Header */}
            <div className="p-5 border-b border-rose-100 flex justify-between items-center bg-gradient-to-r from-rose-50 via-red-50 to-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-rose-600 text-white rounded-xl shadow-sm">
                  <XCircle className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
                    Anular Pedido
                    {cancelingOrder?.legacy_code && (
                      <span className="text-xs font-mono bg-rose-100 text-rose-800 px-2 py-0.5 rounded-md border border-rose-200">
                        {cancelingOrder.legacy_code}
                      </span>
                    )}
                  </h2>
                  <p className="text-xs font-medium text-rose-700">
                    Esta acción cambiará el estado a "Cancelado" y liberará el stock reservado.
                  </p>
                </div>
              </div>
              <button 
                type="button" 
                onClick={() => {
                  if (!isSubmittingCancel) {
                    setShowCancelOrderModal(false);
                    setCancelReason("");
                    setCancelReasonError(null);
                  }
                }}
                disabled={isSubmittingCancel}
                className="p-1.5 hover:bg-slate-200 rounded-full transition-colors text-slate-400 hover:text-slate-600 cursor-pointer disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4 flex-1">
              {/* Resumen del pedido */}
              <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-200/80 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Cliente</span>
                  <span className="font-black text-slate-800">{cancelingOrder?.customer_name || 'Sin nombre'}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Monto Total</span>
                  <span className="font-mono font-black text-slate-900">{formatPrice(cancelingOrder?.total_amount || 0)}</span>
                </div>
                {cancelingOrder?.locality && (
                  <div className="col-span-2">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Ubicación</span>
                    <span className="font-medium text-slate-700">{cancelingOrder.locality} {cancelingOrder.address ? `- ${cancelingOrder.address}` : ''}</span>
                  </div>
                )}
              </div>

              {/* Motivo Obligatorio */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5 text-rose-500" />
                    Motivo de Anulación <span className="text-rose-600 font-black">* (Obligatorio)</span>
                  </label>
                  <span className="text-[10px] font-bold text-rose-600 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full">
                    Requerido
                  </span>
                </div>
                <textarea
                  value={cancelReason}
                  onChange={(e) => {
                    setCancelReason(e.target.value);
                    if (cancelReasonError && e.target.value.trim()) {
                      setCancelReasonError(null);
                    }
                  }}
                  disabled={isSubmittingCancel}
                  placeholder="Especifique el motivo por el cual se anula el pedido (ej.: El cliente canceló la compra, error en la carga, no responde al coordinar flete, etc.)..."
                  rows={3}
                  className={`w-full text-xs p-3 rounded-xl border transition-all focus:outline-none focus:ring-2 resize-none ${
                    cancelReasonError
                      ? 'border-rose-400 focus:ring-rose-200 bg-rose-50/20'
                      : 'border-slate-200 focus:border-rose-500 focus:ring-rose-100 bg-white'
                  }`}
                />
                {cancelReasonError && (
                  <p className="text-[11px] font-bold text-rose-600 flex items-center gap-1 mt-1">
                    <AlertTriangle className="w-3 h-3" />
                    {cancelReasonError}
                  </p>
                )}
              </div>

              {/* Advertencia */}
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200/80 text-[11px] text-amber-900 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p>
                  Al confirmar, se actualizará el estado a <strong>"Cancelado"</strong> en el ERP, se liberará el stock reservado y en la planilla de Google Sheets pasará a <strong>"❌ Anulado"</strong>.
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex justify-between items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowCancelOrderModal(false);
                  setCancelReason("");
                  setCancelReasonError(null);
                }}
                disabled={isSubmittingCancel}
                className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
              >
                Volver
              </button>

              <Button
                type="button"
                onClick={handleConfirmCancelOrder}
                disabled={isSubmittingCancel || !cancelReason.trim()}
                className="px-6 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-black text-xs flex items-center gap-2 transition-all shadow-md active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmittingCancel ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ban className="w-4 h-4" />}
                {isSubmittingCancel ? "Anulando Pedido..." : "Confirmar Anulación"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 5: Éxito de Anulación y Mensaje Copiable */}
      {showCancelSuccessModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200 border border-slate-100 overflow-hidden">
            {/* Header */}
            <div className="p-5 border-b border-rose-100 flex justify-between items-center bg-gradient-to-r from-rose-50 via-red-50 to-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-rose-600 text-white rounded-xl shadow-sm">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-black text-slate-900">
                    ¡Pedido Anulado con Éxito!
                  </h2>
                  <p className="text-xs font-medium text-rose-700 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-rose-500 inline-block animate-pulse" />
                    Impactado en Planilla (❌ Anulado), Stock Liberado e Historial
                  </p>
                </div>
              </div>
              <button 
                type="button" 
                onClick={() => {
                  setShowCancelSuccessModal(false);
                  setCancelingOrder(null);
                }}
                className="p-1.5 hover:bg-slate-200 rounded-full transition-colors text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <Copy className="w-3.5 h-3.5 text-slate-500" />
                    Aviso de Anulación
                  </span>
                  {notifiedCancelTelegram ? (
                    <span className="text-[10px] font-bold text-rose-800 bg-rose-100/90 border border-rose-200 px-2 py-0.5 rounded-full flex items-center gap-1 shadow-2xs">
                      <CheckCircle2 className="w-3 h-3 text-rose-600" />
                      Enviado a Telegram
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold text-amber-800 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-full flex items-center gap-1 shadow-2xs">
                      <AlertTriangle className="w-3 h-3 text-amber-600" />
                      No enviado a Telegram (Copiar abajo)
                    </span>
                  )}
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-3.5 text-xs font-mono text-slate-800 whitespace-pre-wrap select-all max-h-64 overflow-y-auto leading-relaxed">
                  {generatedCancelMessage}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row justify-between items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowCancelSuccessModal(false);
                  setCancelingOrder(null);
                }}
                className="w-full sm:w-auto px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
              >
                Cerrar
              </button>

              <button
                type="button"
                onClick={async () => {
                  const ok = await copyRichMessageToClipboard(generatedCancelMessage);
                  if (ok) {
                    setCopiedCancelMessage(true);
                    setTimeout(() => setCopiedCancelMessage(false), 2500);
                  }
                }}
                className="w-full sm:w-auto px-6 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-black text-xs flex items-center justify-center gap-2 transition-all shadow-md active:scale-95 cursor-pointer"
              >
                {copiedCancelMessage ? <CheckCheck className="w-4 h-4 text-rose-200" /> : <Copy className="w-4 h-4" />}
                {copiedCancelMessage ? "¡Aviso Copiado al Portapapeles!" : "Copiar Aviso para Telegram / WhatsApp"}
              </button>
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
                <div>• Estado: <span className="font-semibold text-slate-800">{selectedStatuses.length === 0 || selectedStatuses.length === 4 ? "Todos los Estados" : selectedStatuses.join(", ")}</span></div>
                <div>• Cliente: <span className="font-semibold text-slate-800">{selectedChannels.length === 0 || selectedChannels.length === 2 ? "Todos los Canales" : (selectedChannels.includes('minoristas') ? 'Minoristas' : 'Mayoristas')}</span></div>
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
                          {order.channel !== 'mayorista' && <button
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
                          </button>}

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

      {/* MODAL DE BÚSQUEDA Y ALTA DE CLIENTES MAYORISTAS */}
      <WholesaleClientModal
        open={showWholesaleClientModal}
        selectedClientId={selectedClientId}
        onClose={() => setShowWholesaleClientModal(false)}
        onSelect={(wholesaleClient: WholesaleClientOption) => {
          const client: Client = {
            id: wholesaleClient.id,
            business_name: wholesaleClient.business_name,
            tax_id: wholesaleClient.tax_id || "",
            phone_primary: wholesaleClient.phone_primary,
            phone_secondary: wholesaleClient.phone_secondary || undefined,
            billing_address: wholesaleClient.billing_address || undefined,
            is_wholesale: true,
            internal_code: wholesaleClient.internal_code,
            default_discount_label: wholesaleClient.default_discount_label,
            default_discount_coef: wholesaleClient.default_discount_coef,
            notes: wholesaleClient.notes
          };
          setClients(previous => [client, ...previous.filter(item => item.id !== client.id)]);
          setSelectedClientId(client.id);
          setClientSearchQuery("");
        }}
      />

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
        isWholesaleContext={isWholesaleContext}
        orderDiscountType={orderDiscountType}
        orderDiscountValue={orderDiscountValue}
        orderDiscounts={isWholesaleContext ? effectiveOrderDiscounts : undefined}
        onUpdateOrderDiscounts={isWholesaleContext ? updateOrderDiscounts : undefined}
        onUpdateOrderDiscount={(type, value) => {
          setOrderDiscountType(type);
          setOrderDiscountValue(value);
        }}
        onUpdateItemDiscount={updateItemDiscount}
        onApplyDiscountSuggestion={handleApplyDiscountSuggestion}
      />

      {/* MODAL IMPORTADOR DE PRESUPUESTO DESDE WHATSAPP */}
      <ImportWhatsAppBudgetModal
        isOpen={isImportWhatsAppOpen}
        onClose={() => setIsImportWhatsAppOpen(false)}
        products={products}
        currentItemsCount={orderItems.length}
        onApplyBudget={handleApplyWhatsAppBudget}
      />

      {/* MODAL DE VISTA DE PEDIDO (LECTURA SIN EDICIÓN) */}
      <ViewOrderModal
        isOpen={isViewOrderModalOpen}
        onClose={() => {
          setIsViewOrderModalOpen(false);
          setSelectedOrderForView(null);
        }}
        order={selectedOrderForView}
        onEdit={(ord) => {
          setIsViewOrderModalOpen(false);
          handleEditOrder(ord);
        }}
        onPrint={(ord) => {
          setIsViewOrderModalOpen(false);
          setSelectedOrderForPrint(ord);
          setIsPrintOrderModalOpen(true);
        }}
      />

      {/* MODAL DE IMPRESIÓN / COMPROBANTE DE PEDIDO (PDF, IMAGEN, COPIAR) */}
      <PrintableOrderModal
        isOpen={isPrintOrderModalOpen}
        onClose={() => {
          setIsPrintOrderModalOpen(false);
          setSelectedOrderForPrint(null);
        }}
        order={selectedOrderForPrint}
        onEdit={(ord) => {
          setIsPrintOrderModalOpen(false);
          handleEditOrder(ord);
        }}
      />

      {/* MODAL PARA AGREGAR NUEVA LOCALIDAD Y ASIGNAR ZONA */}
      <AddLocalityModal
        isOpen={isAddLocalityModalOpen}
        onClose={() => setIsAddLocalityModalOpen(false)}
        zones={zones}
        initialName={initialLocalityModalName}
        onLocalityCreated={handleLocalityCreated}
      />
    </div>
  );
}

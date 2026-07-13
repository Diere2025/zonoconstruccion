"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { 
  Target, 
  Settings, 
  DollarSign, 
  Search, 
  Download, 
  RefreshCw, 
  Play, 
  Pause, 
  Loader2, 
  ChevronDown, 
  Trash2, 
  Save, 
  Plus, 
  AlertCircle, 
  CheckCircle2, 
  Layers,
  ChevronRight,
  TrendingUp,
  BarChart3,
  Megaphone,
  UserCheck,
  Star
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { supabase } from "@/lib/supabase";

// Default Meta Access Token from user's Apps Script
const DEFAULT_TOKEN = "EAAYycxBZBEnYBRkUA2XVjuJoxKx50rx6AgCxhFcQpPa5HRDGKWLJ5Q08HrQoGYo4e0sLZBzk1VVnS9MlYy9ZAe4exZBFQlCYE3my9JDfVQShtR19UDb4okDpf1Cra3mRLOVXvWJp7Oip9pcOYzXprJMwZAGm04XaLtD2irwyZAPpA0tiSnYzHCO6EuTAZDZD";

interface AdAccount {
  id: string;
  account_id: string;
  name: string;
  currency: string;
}

interface CampaignDetails {
  id: string;
  name: string;
  effective_status?: string;
  status?: string;
  daily_budget?: number;
}

interface AdsetDetails {
  id: string;
  campaign_id?: string;
  name: string;
  effective_status?: string;
  status?: string;
  daily_budget?: number;
}

interface MetaInsightResponseRow {
  campaign_id?: string;
  campaign_name?: string;
  adset_id?: string;
  adset_name?: string;
  ad_id?: string;
  ad_name?: string;
  account_name?: string;
  impressions?: string | number;
  clicks?: string | number;
  spend?: string | number;
  cpc?: string | number;
  ctr?: string | number;
  cpm?: string | number;
  frequency?: string | number;
  reach?: string | number;
  actions?: { action_type: string; value: string }[];
  cost_per_action_type?: { action_type: string; value: string }[];
  date_start?: string;
  date_stop?: string;
}

interface MetaInsightRow {
  // Original Meta fields
  campaign_id: string;
  campaign_name: string;
  adset_id?: string;
  adset_name?: string;
  ad_id?: string;
  ad_name?: string;
  account_name: string;
  impressions: number;
  clicks: number;
  spend: number;
  cpc: number;
  ctr: number;
  cpm: number;
  frequency: number;
  reach: number;
  actions: { action_type: string; value: string }[];
  cost_per_action_type: { action_type: string; value: string }[];
  
  // Resolved campaign details
  status: string;
  daily_budget: number;
  
  // Custom parsed fields
  oferta: string;
  linea: string;
  producto: string;
  category: string;
  
  // Daily tracking fields
  date_start?: string;
  date_stop?: string;
  rate?: number;
}

interface NamedConfig {
  name: string;
  selectedAccounts: string[];
  datePreset: string;
  dateStart: string;
  dateEnd: string;
  level: string;
  actionType: string;
  exchangeRate: number;
}

interface MultiSelectOption {
  id: string;
  name: string;
  detail?: string;
}

interface SearchableMultiSelectProps {
  label: string;
  options: MultiSelectOption[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
}

function SearchableMultiSelect({
  label,
  options,
  selectedValues,
  onChange,
  placeholder = "Seleccionar..."
}: SearchableMultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredOptions = useMemo(() => {
    return options.filter(opt => 
      opt.name.toLowerCase().includes(search.toLowerCase()) || 
      (opt.detail && opt.detail.toLowerCase().includes(search.toLowerCase()))
    );
  }, [options, search]);

  const toggleOption = (id: string) => {
    if (selectedValues.includes(id)) {
      onChange(selectedValues.filter(val => val !== id));
    } else {
      onChange([...selectedValues, id]);
    }
  };

  const selectedOptions = useMemo(() => {
    return options.filter(opt => selectedValues.includes(opt.id));
  }, [options, selectedValues]);

  return (
    <div className="flex flex-col gap-1.5 relative w-full" ref={containerRef}>
      {label && <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</label>}
      
      {/* Trigger Button */}
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full min-h-[44px] px-4 py-2 border border-slate-200 focus-within:ring-4 focus-within:ring-blue-500/10 rounded-2xl bg-white flex flex-wrap gap-1.5 items-center cursor-pointer justify-between"
      >
        <div className="flex flex-wrap gap-1.5 items-center max-w-[90%]">
          {selectedOptions.length === 0 ? (
            <span className="text-xs font-bold text-slate-400">{placeholder}</span>
          ) : (
            selectedOptions.map(opt => (
              <span 
                key={opt.id} 
                className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-[10px] font-extrabold px-2.5 py-0.5 rounded-lg border border-blue-100"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleOption(opt.id);
                }}
              >
                {opt.name}
                <span className="hover:text-red-500 font-bold ml-0.5">×</span>
              </span>
            ))
          )}
        </div>
        <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
      </div>

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="absolute top-[100%] left-0 w-full bg-white border border-slate-200 rounded-2xl shadow-xl z-50 mt-1.5 p-3 flex flex-col gap-2 max-h-60 animate-in fade-in duration-150">
          {/* Search Input */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 bg-slate-50 focus:outline-none"
            />
          </div>

          {/* Options List */}
          <div className="overflow-y-auto flex-1 space-y-0.5 pr-1">
            {filteredOptions.map(opt => {
              const isSelected = selectedValues.includes(opt.id);
              return (
                <div
                  key={opt.id}
                  onClick={() => toggleOption(opt.id)}
                  className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold cursor-pointer transition-colors ${
                    isSelected ? "bg-blue-50/50 text-blue-700" : "hover:bg-slate-50 text-slate-700"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      readOnly
                      className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500/10 cursor-pointer accent-blue-600"
                    />
                    <span>{opt.name}</span>
                  </div>
                  {opt.detail && <span className="text-[10px] text-slate-400 font-semibold">{opt.detail}</span>}
                </div>
              );
            })}
            {filteredOptions.length === 0 && (
              <div className="text-center text-slate-400 py-4 text-xs font-bold">
                No hay resultados
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface ExchangeRateRow {
  fechaStr: string;
  compra: number;
  venta: number;
}

interface ExchangeRateResult {
  rate: number;
  date: string;
  isMatched: boolean;
  allRows: ExchangeRateRow[];
}

async function fetchExchangeRateFromSheet(targetDateStr?: string): Promise<ExchangeRateResult | null> {
  try {
    const res = await fetch("https://docs.google.com/spreadsheets/d/1cK9U1Jjr6ocs1OZPsoQ-sRQgvjfA2pwkhb9DafKXsPY/export?format=csv&sheet=USD", { cache: "no-store" });
    if (!res.ok) throw new Error("Network response was not ok");
    const text = await res.text();
    const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
    
    if (lines.length <= 1) return null;
    
    const parseCsvRow = (line: string) => {
      let parts = line.replace(/"/g, "").split(",");
      if (parts.length < 3) {
        parts = line.replace(/"/g, "").split(";");
      }
      return parts;
    };

    const rows = lines.slice(1).map(line => {
      const parts = parseCsvRow(line);
      if (parts.length < 3) return null;
      
      const fechaStr = parts[0].trim();
      const compraVal = parts[1].trim().replace(",", ".");
      const ventaVal = parts[2].trim().replace(",", ".");
      
      const compra = parseFloat(compraVal) || 0;
      const venta = parseFloat(ventaVal) || 0;
      
      return { fechaStr, compra, venta };
    }).filter((r): r is { fechaStr: string; compra: number; venta: number } => r !== null);
    
    if (rows.length === 0) return null;
    
    if (targetDateStr) {
      const parts = targetDateStr.split("-");
      if (parts.length === 3) {
        const [y, m, d] = parts;
        const formattedTargetD1 = `${parseInt(d)}/${parseInt(m)}/${y}`; // e.g. "6/6/2026"
        const formattedTargetD2 = `${d.padStart(2, "0")}/${m.padStart(2, "0")}/${y}`; // e.g. "06/06/2026"
        
        const match = rows.find(r => r.fechaStr === formattedTargetD1 || r.fechaStr === formattedTargetD2);
        if (match) {
          return { rate: match.venta, date: match.fechaStr, isMatched: true, allRows: rows };
        }
      }
    }
    
    // Fallback to latest
    const latest = rows[rows.length - 1];
    return { rate: latest.venta, date: latest.fechaStr, isMatched: false, allRows: rows };
} catch (e) {
    console.warn("Error fetching exchange rate:", e);
    return null;
  }
}

export default function MetaAdsPage() {
  // Configurations & Token
  const [token, setToken] = useState("");
  const [showTokenSettings, setShowTokenSettings] = useState(false);
  const [exchangeRate, setExchangeRate] = useState(1560.0);
  const [rateRows, setRateRows] = useState<ExchangeRateRow[]>([]);
  const [useHistoricalRates, setUseHistoricalRates] = useState(true);

  // View tabs & progression state
  const [activeTab, setActiveTab] = useState<"general" | "progreso" | "roas">("general");
  const [chartFocusCampaign, setChartFocusCampaign] = useState<string>("all");
  const [chartMetric, setChartMetric] = useState<"spend_ars" | "spend_usd" | "conversions" | "cpr_ars" | "cpr_usd">("spend_ars");
  const [activeHoverIndex, setActiveHoverIndex] = useState<number | null>(null);

  // Exchange Rate Sheet Sync States
  const [isRateLoading, setIsRateLoading] = useState(false);
  const [rateSyncStatus, setRateSyncStatus] = useState("");

  // Searchable multi-select filters
  const [selectedOfertas, setSelectedOfertas] = useState<string[]>([]);
  const [selectedLineas, setSelectedLineas] = useState<string[]>([]);
  
  // Query Options & Fields
  const [adAccounts, setAdAccounts] = useState<AdAccount[]>([]);
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [level, setLevel] = useState("campaign");
  const [datePreset, setDatePreset] = useState("yesterday");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [actionType, setActionType] = useState("onsite_conversion.messaging_conversation_started_7d");
  
  // Loading & Error States
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [loadStatus, setLoadStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Raw Data
  const [rawData, setRawData] = useState<MetaInsightRow[]>([]);
  const [orders, setOrders] = useState<{
    id: string;
    total_amount: number;
    order_date: string;
    category: string | null;
    status: string;
  }[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [defaultConfigName, setDefaultConfigName] = useState<string>("");
  const [availableActionTypes, setAvailableActionTypes] = useState<string[]>([
    "onsite_conversion.messaging_conversation_started_7d"
  ]);

  // Saved configs list
  const [savedConfigs, setSavedConfigs] = useState<Record<string, NamedConfig>>({});
  const [newConfigName, setNewConfigName] = useState("");

  // Filters & Grouping States
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [groupBy, setGroupBy] = useState<"none" | "oferta" | "linea">("none");
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  // 1. Initial Load of Token and Saved Configs
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedToken = localStorage.getItem("meta_ads_token") || DEFAULT_TOKEN;
      setToken(savedToken);
      
      const savedRate = localStorage.getItem("meta_ads_exchange_rate");
      if (savedRate) setExchangeRate(Number(savedRate));
      
      const defaultName = localStorage.getItem("meta_ads_default_config_name");
      if (defaultName) setDefaultConfigName(defaultName);
      
      let appliedDefault = false;
      const configs = localStorage.getItem("meta_ads_configs");
      if (configs) {
        try {
          const parsed = JSON.parse(configs);
          setSavedConfigs(parsed);
          
          if (defaultName && parsed[defaultName]) {
            const cfg = parsed[defaultName];
            setSelectedAccounts(cfg.selectedAccounts || []);
            setDatePreset(cfg.datePreset || "custom");
            if (cfg.datePreset === "custom") {
              setDateStart(cfg.dateStart);
              setDateEnd(cfg.dateEnd);
            } else {
              const dates = calculateDatesFromPreset(cfg.datePreset);
              setDateStart(dates.start);
              setDateEnd(dates.end);
            }
            setLevel(cfg.level || "campaign");
            setActionType(cfg.actionType || "onsite_conversion.messaging_conversation_started_7d");
            setExchangeRate(cfg.exchangeRate || 1560.0);
            appliedDefault = true;
          }
        } catch (e) {
          console.error("Error loading configs", e);
        }
      }
      
      if (!appliedDefault) {
        // Calculate dates on start based on default preset
        const dates = calculateDatesFromPreset("yesterday");
        setDateStart(dates.start);
        setDateEnd(dates.end);
      }
    }
  }, []);

  // 2. Fetch Ad Accounts when token is ready
  useEffect(() => {
    if (token) {
      fetchAdAccounts(token);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Fetch dates based on preset
  useEffect(() => {
    if (datePreset !== "custom") {
      const dates = calculateDatesFromPreset(datePreset);
      setDateStart(dates.start);
      setDateEnd(dates.end);
    }
  }, [datePreset]);

  // Sync exchange rate function
  const syncExchangeRate = async (dateStr?: string) => {
    setIsRateLoading(true);
    setRateSyncStatus("Sincronizando cotización...");
    try {
      const result = await fetchExchangeRateFromSheet(dateStr || dateEnd);
      if (result) {
        setExchangeRate(result.rate);
        setRateRows(result.allRows || []);
        setRateSyncStatus(
          `Planilla: $${result.rate} ARS/USD (${result.date})${
            result.isMatched ? "" : " [último]"
          }`
        );
      } else {
        setRateSyncStatus("No se pudo obtener. Usando valor manual.");
      }
    } catch (e) {
      console.warn(e);
      setRateSyncStatus("Error de red. Usando valor manual.");
    } finally {
      setIsRateLoading(false);
    }
  };

  // Callback to resolve exchange rate for a given date
  const getRateForDate = useCallback((dateStr?: string) => {
    if (!dateStr || rateRows.length === 0) return exchangeRate;
    
    // dateStr is YYYY-MM-DD
    const parts = dateStr.split("-");
    if (parts.length === 3) {
      const [y, m, d] = parts;
      const formattedTargetD1 = `${parseInt(d)}/${parseInt(m)}/${y}`; // e.g. "3/6/2026"
      const formattedTargetD2 = `${d.padStart(2, "0")}/${m.padStart(2, "0")}/${y}`; // e.g. "03/06/2026"
      
      const match = rateRows.find(r => r.fechaStr === formattedTargetD1 || r.fechaStr === formattedTargetD2);
      if (match) {
        return match.venta;
      }
    }
    return exchangeRate;
  }, [rateRows, exchangeRate]);

  // Sync rate on dateEnd change
  useEffect(() => {
    if (dateEnd) {
      syncExchangeRate(dateEnd);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateEnd]);

  // Fetch accounts function
  const fetchAdAccounts = async (accessToken: string) => {
    if (!accessToken) return;
    setLoadingAccounts(true);
    setError(null);
    try {
      const url = `https://graph.facebook.com/v19.0/me/adaccounts?fields=name,account_id,currency&limit=50&access_token=${accessToken}`;
      const res = await fetch(url);
      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson?.error?.message || "Error al conectar con Meta.");
      }
      const json = await res.json();
      if (json.data) {
        setAdAccounts(json.data);
        // Default select the first account if none selected
        if (selectedAccounts.length === 0 && json.data.length > 0) {
          setSelectedAccounts([json.data[0].id]);
        }
      }
    } catch (err: unknown) {
      console.error(err);
      const errMsg = err instanceof Error ? err.message : String(err);
      setError("No se pudieron cargar las cuentas de anuncios: " + errMsg);
    } finally {
      setLoadingAccounts(false);
    }
  };

  const handleSaveToken = () => {
    if (typeof window !== "undefined") {
      localStorage.setItem("meta_ads_token", token);
      localStorage.setItem("meta_ads_exchange_rate", exchangeRate.toString());
      fetchAdAccounts(token);
      setSuccess("Token de acceso y cotización guardados correctamente.");
      setShowTokenSettings(false);
      setTimeout(() => setSuccess(null), 3000);
    }
  };

  const calculateDatesFromPreset = (preset: string): { start: string; end: string } => {
    const getFormattedDate = (d: Date) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    };

    const today = new Date();
    let start = new Date();
    let end = new Date();

    switch (preset) {
      case "today":
        break;
      case "yesterday":
        start.setDate(today.getDate() - 1);
        end.setDate(today.getDate() - 1);
        break;
      case "last_3":
        start.setDate(today.getDate() - 3);
        end.setDate(today.getDate() - 1);
        break;
      case "last_7":
        start.setDate(today.getDate() - 7);
        end.setDate(today.getDate() - 1);
        break;
      case "last_14":
        start.setDate(today.getDate() - 14);
        end.setDate(today.getDate() - 1);
        break;
      case "last_28":
        start.setDate(today.getDate() - 28);
        end.setDate(today.getDate() - 1);
        break;
      case "last_30":
        start.setDate(today.getDate() - 30);
        end.setDate(today.getDate() - 1);
        break;
      case "this_month":
        start = new Date(today.getFullYear(), today.getMonth(), 1);
        break;
      case "last_month":
        start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        end = new Date(today.getFullYear(), today.getMonth(), 0);
        break;
      case "this_quarter":
        const q = Math.floor(today.getMonth() / 3);
        start = new Date(today.getFullYear(), q * 3, 1);
        break;
      case "maximum":
        start = new Date(2010, 0, 1);
        break;
      default:
        break;
    }
    return {
      start: getFormattedDate(start),
      end: getFormattedDate(end),
    };
  };

  // Parser helper
  const parseCampaignName = (name: string) => {
    const parentRegex = /\(([^)]+)\)/;
    const bracketRegex = /\[([^\]]+)\]/;
    
    const parentMatch = name.match(parentRegex);
    const bracketMatch = name.match(bracketRegex);
    
    const oferta = parentMatch ? parentMatch[1].trim() : "";
    const linea = bracketMatch ? bracketMatch[1].trim() : "";
    
    let category = "Otros";
    const nameLower = name.toLowerCase();
    if (nameLower.includes("termotanque") || nameLower.includes("termo")) {
      category = "Termotanques";
    } else if (nameLower.includes("aquafort") || nameLower.includes("tanque") || nameLower.includes("aquatank") || nameLower.includes("base") || nameLower.includes("flotante") || nameLower.includes("flotador")) {
      category = "Tanques de Agua";
    } else if (nameLower.includes("biofort") || nameLower.includes("biodigestor")) {
      category = "Biodigestores";
    } else if (nameLower.includes("meps") || nameLower.includes("equilibrio") || nameLower.includes("membrana")) {
      category = "MEPS";
    } else if (nameLower.includes("escalera") || nameLower.includes("gl16")) {
      category = "Escaleras";
    } else if (nameLower.includes("látex") || nameLower.includes("latex") || nameLower.includes("pintura")) {
      category = "Pinturas";
    }
    
    let producto = "";
    if (oferta) {
      const lowerOferta = oferta.toLowerCase();
      if (lowerOferta.includes("meps") || lowerOferta.includes("equilibrio") || lowerOferta.includes("membrana")) {
        producto = "Membrana";
      } else if (lowerOferta.includes("biofort") || lowerOferta.includes("combo") || lowerOferta.includes("residual")) {
        producto = "Residuales";
      } else if (lowerOferta.includes("termotanque") || lowerOferta.includes("termo")) {
        producto = "Termotanques";
      } else if (lowerOferta.includes("tanque") || lowerOferta.includes("aquafort")) {
        producto = "Tanques Aquafort";
      } else if (lowerOferta.includes("escalera") || lowerOferta.includes("gl16")) {
        producto = "Escaleras";
      } else if (lowerOferta.includes("látex") || lowerOferta.includes("latex") || lowerOferta.includes("pintura")) {
        producto = "Pinturas";
      } else {
        producto = oferta; // Default fallback
      }
    }
    
    return { oferta, linea, producto, category };
  };

  // Fetch Meta Campaign data in parallel
  const handleFetchData = async () => {
    if (selectedAccounts.length === 0) {
      setError("Debes seleccionar al menos una cuenta de anuncios.");
      return;
    }
    if (!token) {
      setError("Token de acceso de Meta ausente.");
      return;
    }
    
    setLoadingData(true);
    setError(null);
    setRawData([]);
    
    const results: MetaInsightRow[] = [];
    const detectedActionTypes = new Set<string>();

    try {
      const since = dateStart;
      const until = dateEnd;
      const timeRange = JSON.stringify({ since, until });

      // Query orders from Supabase for the same range
      setLoadingOrders(true);
      try {
        const { data: ordersData, error: ordersError } = await supabase
          .from("orders")
          .select("id, total_amount, order_date, category, status")
          .gte("order_date", `${since}T00:00:00`)
          .lte("order_date", `${until}T23:59:59`)
          .neq("status", "Cancelado");

        if (ordersError) {
          console.error("Error querying orders:", ordersError);
        } else {
          setOrders(ordersData || []);
        }
      } catch (err) {
        console.error("Error querying orders:", err);
      } finally {
        setLoadingOrders(false);
      }

      // Loop accounts
      for (let i = 0; i < selectedAccounts.length; i++) {
        const accId = selectedAccounts[i];
        const cleanAccId = accId.replace("act_", "");
        const accountObj = adAccounts.find(a => a.id === accId);
        const accountName = accountObj ? accountObj.name : cleanAccId;
        
        setLoadStatus(`Cargando insights de la cuenta: ${accountName}...`);
        
        // Fetch Insights
        let fields = "campaign_id,campaign_name,impressions,clicks,spend,cpc,ctr,cpm,frequency,reach,actions,cost_per_action_type,date_start,date_stop";
        if (level === "adset") {
          fields = "adset_id,adset_name,campaign_id,campaign_name,impressions,clicks,spend,cpc,ctr,cpm,frequency,reach,actions,cost_per_action_type,date_start,date_stop";
        } else if (level === "ad") {
          fields = "ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,impressions,clicks,spend,cpc,ctr,cpm,frequency,reach,actions,cost_per_action_type,date_start,date_stop";
        } else if (level === "account") {
          fields = "account_id,account_name,impressions,clicks,spend,cpc,ctr,cpm,frequency,reach,actions,cost_per_action_type,date_start,date_stop";
        }

        const insightsUrl = `https://graph.facebook.com/v19.0/act_${cleanAccId}/insights?level=${level}&fields=${fields}&time_range=${encodeURIComponent(timeRange)}&time_increment=1&limit=1000&access_token=${token}`;
        
        const insightsRes = await fetch(insightsUrl);
        if (!insightsRes.ok) {
          const errJson = await insightsRes.json();
          throw new Error(`[Account ${accountName}]: ${errJson?.error?.message || "Error trayendo insights"}`);
        }
        
        const insightsJson = await insightsRes.json();
        const insightsData = (insightsJson.data || []) as MetaInsightResponseRow[];
        
        if (insightsData.length === 0) {
          continue; // No data for this account
        }

        // Parallel Fetch of Campaign properties for budget & status
        setLoadStatus(`Cargando campañas de la cuenta: ${accountName}...`);
        const campaignsUrl = `https://graph.facebook.com/v19.0/act_${cleanAccId}/campaigns?fields=id,name,effective_status,status,daily_budget,budget_remaining,bid_strategy,objective&limit=1000&access_token=${token}`;
        const campaignsRes = await fetch(campaignsUrl);
        const campaignMap: Record<string, CampaignDetails> = {};
        if (campaignsRes.ok) {
          const campaignsJson = await campaignsRes.json();
          const campaignsData = (campaignsJson.data || []) as CampaignDetails[];
          campaignsData.forEach((c) => {
            campaignMap[c.id] = c;
          });
        }

        // Parallel Fetch of Adsets properties for budget
        setLoadStatus(`Cargando adsets de la cuenta: ${accountName}...`);
        const adsetsUrl = `https://graph.facebook.com/v19.0/act_${cleanAccId}/adsets?fields=id,campaign_id,name,effective_status,status,daily_budget,budget_remaining&limit=1000&access_token=${token}`;
        const adsetsRes = await fetch(adsetsUrl);
        const adsetMap: Record<string, AdsetDetails> = {};
        const campaignAdsetsMap: Record<string, AdsetDetails[]> = {}; // campaignId -> adsets[]
        if (adsetsRes.ok) {
          const adsetsJson = await adsetsRes.json();
          const adsetsData = (adsetsJson.data || []) as AdsetDetails[];
          adsetsData.forEach((a) => {
            adsetMap[a.id] = a;
            if (a.campaign_id) {
              if (!campaignAdsetsMap[a.campaign_id]) {
                campaignAdsetsMap[a.campaign_id] = [];
              }
              campaignAdsetsMap[a.campaign_id].push(a);
            }
          });
        }

        // Process each insights row
        setLoadStatus(`Procesando y parseando filas de ${accountName}...`);
        insightsData.forEach((row) => {
          // Identify actions types for dropdown
          if (row.actions) {
            row.actions.forEach((act) => {
              detectedActionTypes.add(act.action_type);
            });
          }

          // Resolve campaign and status
          let status = "ACTIVE";
          let dailyBudget = 0;
          const campId = row.campaign_id;
          const adsetId = row.adset_id;
          
          if (level === "campaign" && campId) {
            const campObj = campaignMap[campId];
            if (campObj) {
              status = campObj.effective_status || campObj.status || "ACTIVE";
              dailyBudget = Number(campObj.daily_budget) || 0;
              
              // If daily budget is empty, sum active adsets budgets (ABO)
              if (dailyBudget === 0 && campaignAdsetsMap[campId]) {
                const activeAdsets = campaignAdsetsMap[campId].filter(
                  a => a.effective_status === "ACTIVE" || a.status === "ACTIVE"
                );
                dailyBudget = activeAdsets.reduce((sum, a) => sum + (Number(a.daily_budget) || 0), 0);
              }
            }
          } else if (level === "adset" && adsetId) {
            const adsetObj = adsetMap[adsetId];
            if (adsetObj) {
              status = adsetObj.effective_status || adsetObj.status || "ACTIVE";
              dailyBudget = Number(adsetObj.daily_budget) || 0;
            }
          } else if (level === "ad") {
            // Ads don't have budget, resolve from adset
            if (adsetId && adsetMap[adsetId]) {
              dailyBudget = Number(adsetMap[adsetId].daily_budget) || 0;
            }
            // For status, just fallback to active or active state
            status = "ACTIVE";
          }
          
          // Divides budgets by 100 since Meta API returns it in cents for USD/ARS
          dailyBudget = dailyBudget / 100;

          // Parse campaign name
          const nameToParse = row.campaign_name || row.adset_name || row.ad_name || "";
          const parsed = parseCampaignName(nameToParse);

          // Resolve daily historical rate
          const rowRate = getRateForDate(row.date_start);

          results.push({
            campaign_id: row.campaign_id || cleanAccId,
            campaign_name: nameToParse,
            adset_id: row.adset_id,
            adset_name: row.adset_name,
            ad_id: row.ad_id,
            ad_name: row.ad_name,
            account_name: accountName,
            impressions: Number(row.impressions) || 0,
            clicks: Number(row.clicks) || 0,
            spend: Number(row.spend) || 0,
            cpc: Number(row.cpc) || 0,
            ctr: Number(row.ctr) || 0,
            cpm: Number(row.cpm) || 0,
            frequency: Number(row.frequency) || 0,
            reach: Number(row.reach) || 0,
            actions: row.actions || [],
            cost_per_action_type: row.cost_per_action_type || [],
            status,
            daily_budget: dailyBudget,
            oferta: parsed.oferta,
            linea: parsed.linea,
            producto: parsed.producto,
            category: parsed.category,
            date_start: row.date_start,
            date_stop: row.date_stop,
            rate: rowRate
          });
        });
      }

      setRawData(results);
      if (detectedActionTypes.size > 0) {
        setAvailableActionTypes(Array.from(detectedActionTypes).sort());
      }
      setSuccess(`Carga finalizada con éxito. Se importaron ${results.length} filas.`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: unknown) {
      console.error(err);
      const errMsg = err instanceof Error ? err.message : String(err);
      setError("Error consultando Meta Ads: " + errMsg);
    } finally {
      setLoadingData(false);
      setLoadStatus("");
    }
  };

  // 3. Save Named Configuration
  const handleSaveNamedConfig = () => {
    if (!newConfigName.trim()) return;
    const cleanName = newConfigName.trim();
    
    const configToSave: NamedConfig = {
      name: cleanName,
      selectedAccounts,
      datePreset,
      dateStart,
      dateEnd,
      level,
      actionType,
      exchangeRate
    };

    const updated = { ...savedConfigs, [cleanName]: configToSave };
    setSavedConfigs(updated);
    if (typeof window !== "undefined") {
      localStorage.setItem("meta_ads_configs", JSON.stringify(updated));
    }
    setNewConfigName("");
    setSuccess(`Configuración "${cleanName}" guardada.`);
    setTimeout(() => setSuccess(null), 2000);
  };

  // Apply named config
  const handleApplyConfig = (cfg: NamedConfig) => {
    setSelectedAccounts(cfg.selectedAccounts || []);
    setDatePreset(cfg.datePreset || "custom");
    if (cfg.datePreset === "custom") {
      setDateStart(cfg.dateStart);
      setDateEnd(cfg.dateEnd);
    }
    setLevel(cfg.level || "campaign");
    setActionType(cfg.actionType || "onsite_conversion.messaging_conversation_started_7d");
    setExchangeRate(cfg.exchangeRate || 1560.0);
    setSuccess(`Configuración "${cfg.name}" aplicada.`);
    setTimeout(() => setSuccess(null), 2000);
  };

  // Toggle default preset config
  const handleToggleDefaultConfig = (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    let newDefault = "";
    if (defaultConfigName === name) {
      newDefault = "";
      if (typeof window !== "undefined") {
        localStorage.removeItem("meta_ads_default_config_name");
      }
      setSuccess("Preset por defecto removido.");
    } else {
      newDefault = name;
      if (typeof window !== "undefined") {
        localStorage.setItem("meta_ads_default_config_name", name);
      }
      setSuccess(`"${name}" establecido como preset por defecto.`);
    }
    setDefaultConfigName(newDefault);
    setTimeout(() => setSuccess(null), 2000);
  };

  // Delete config
  const handleDeleteConfig = (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = { ...savedConfigs };
    delete updated[name];
    setSavedConfigs(updated);
    if (typeof window !== "undefined") {
      localStorage.setItem("meta_ads_configs", JSON.stringify(updated));
      if (defaultConfigName === name) {
        localStorage.removeItem("meta_ads_default_config_name");
        setDefaultConfigName("");
      }
    }
  };

  // Extract action value helper
  const getActionValue = (row: MetaInsightRow, type: string): number => {
    const act = row.actions.find(a => a.action_type === type);
    return act ? Number(act.value) || 0 : 0;
  };

  // Option lists for Searchable Multi-select
  const adAccountOptions = useMemo(() => {
    return adAccounts.map((acc) => ({
      id: acc.id,
      name: acc.name,
      detail: acc.currency
    }));
  }, [adAccounts]);

  const uniqueOfertas = useMemo(() => {
    const set = new Set<string>();
    rawData.forEach(r => {
      if (r.oferta) set.add(r.oferta);
    });
    return Array.from(set).sort().map(o => ({ id: o, name: o }));
  }, [rawData]);

  const uniqueLineas = useMemo(() => {
    const set = new Set<string>();
    rawData.forEach(r => {
      if (r.linea) set.add(r.linea);
    });
    return Array.from(set).sort().map(l => ({ id: l, name: l }));
  }, [rawData]);

  // 4. Data Processing - Searching, Filtering & Calculations
  const processedRows = useMemo(() => {
    return rawData.filter(row => {
      // 1. Search filter
      const matchSearch = 
        row.campaign_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        row.oferta.toLowerCase().includes(searchTerm.toLowerCase()) ||
        row.linea.toLowerCase().includes(searchTerm.toLowerCase());
      
      if (!matchSearch) return false;
      
      // 2. Status filter
      if (statusFilter !== "all") {
        const isActive = row.status === "ACTIVE" || row.status === "active";
        if (statusFilter === "active" && !isActive) return false;
        if (statusFilter === "paused" && isActive) return false;
      }
      
      // 3. Oferta Comercial filter
      if (selectedOfertas.length > 0) {
        if (!selectedOfertas.includes(row.oferta)) return false;
      }
      
      // 4. Línea filter
      if (selectedLineas.length > 0) {
        if (!selectedLineas.includes(row.linea)) return false;
      }
      
      return true;
    });
  }, [rawData, searchTerm, statusFilter, selectedOfertas, selectedLineas]);

  // 5. Aggregate KPIs
  const kpis = useMemo(() => {
    let totalSpendUsd = 0;
    let totalSpendArs = 0;
    let totalConversions = 0;
    let totalImpressions = 0;
    let totalClicks = 0;
    let totalReach = 0;

    processedRows.forEach(row => {
      totalSpendUsd += row.spend;
      const rowRate = useHistoricalRates && row.rate ? row.rate : exchangeRate;
      totalSpendArs += row.spend * rowRate;
      totalConversions += getActionValue(row, actionType);
      totalImpressions += row.impressions;
      totalClicks += row.clicks;
      totalReach += row.reach;
    });

    const cprUsd = totalConversions > 0 ? totalSpendUsd / totalConversions : 0;
    const cprArs = totalConversions > 0 ? totalSpendArs / totalConversions : 0;
    const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) : 0;
    const cpc = totalClicks > 0 ? totalSpendUsd / totalClicks : 0;

    return {
      spendUsd: totalSpendUsd,
      spendArs: totalSpendArs,
      conversions: totalConversions,
      cprUsd,
      cprArs,
      impressions: totalImpressions,
      clicks: totalClicks,
      ctr,
      cpc,
      reach: totalReach
    };
  }, [processedRows, actionType, exchangeRate, useHistoricalRates]);

  // ROAS & category sales attribution logic
  const roasData = useMemo(() => {
    const categoriesList = ["Tanques de Agua", "Biodigestores", "MEPS", "Escaleras", "Pinturas", "Termotanques", "Otros"];
    
    const map: Record<string, { spendArs: number; spendUsd: number; orderCount: number; revenue: number }> = {};
    categoriesList.forEach(cat => {
      map[cat] = { spendArs: 0, spendUsd: 0, orderCount: 0, revenue: 0 };
    });
    
    // Sum up ad spend from processedRows
    processedRows.forEach(row => {
      const cat = row.category || "Otros";
      const rowRate = useHistoricalRates && row.rate ? row.rate : exchangeRate;
      
      if (!map[cat]) {
        map[cat] = { spendArs: 0, spendUsd: 0, orderCount: 0, revenue: 0 };
      }
      map[cat].spendUsd += row.spend;
      map[cat].spendArs += row.spend * rowRate;
    });
    
    // Sum up sales revenue and orders count from orders state
    orders.forEach(ord => {
      const cat = ord.category || "Otros";
      if (!map[cat]) {
        map[cat] = { spendArs: 0, spendUsd: 0, orderCount: 0, revenue: 0 };
      }
      map[cat].orderCount += 1;
      map[cat].revenue += Number(ord.total_amount) || 0;
    });
    
    // Generate final array with calculations
    const rows = categoriesList.map(category => {
      const stats = map[category];
      const roas = stats.spendArs > 0 ? stats.revenue / stats.spendArs : 0;
      const roasPercent = stats.spendArs > 0 ? (stats.revenue / stats.spendArs) * 100 : 0;
      const costAdsPercent = stats.revenue > 0 ? (stats.spendArs / stats.revenue) * 100 : 0;
      const cpa = stats.orderCount > 0 ? stats.spendArs / stats.orderCount : 0;
      
      // Determine recommendation
      let recommendation = "";
      let recColor = "";
      
      if (stats.spendArs === 0) {
        recommendation = "Sin inversión en este periodo.";
        recColor = "text-slate-400 bg-slate-50 border-slate-100";
      } else if (stats.revenue === 0) {
        recommendation = "Inversión sin retornos. Alerta: Revisa segmentación, creativos o embudo de ventas.";
        recColor = "text-red-600 bg-red-50 border-red-100";
      } else if (roas >= 8.0) {
        recommendation = "Excelente retorno. Oportunidad de escala: Incrementar presupuesto un 20%-30%.";
        recColor = "text-emerald-700 bg-emerald-50 border-emerald-100";
      } else if (roas >= 4.0) {
        recommendation = "Retorno saludable. Mantener inversión actual y optimizar creativos secundarios.";
        recColor = "text-blue-700 bg-blue-50 border-blue-100";
      } else if (roas >= 1.5) {
        recommendation = "Retorno marginal. El retorno cubre la publicidad pero deja poco margen. Evaluar costo/precio.";
        recColor = "text-amber-700 bg-amber-50 border-amber-100";
      } else {
        recommendation = "Inversión ineficiente. Pausar anuncios de bajo rendimiento y reasignar a categorías rentables.";
        recColor = "text-red-700 bg-red-50 border-red-100";
      }
      
      return {
        category,
        ...stats,
        roas,
        roasPercent,
        costAdsPercent,
        cpa,
        recommendation,
        recColor
      };
    });
    
    // Calculate totals
    const totalSpendArs = rows.reduce((sum, r) => sum + r.spendArs, 0);
    const totalSpendUsd = rows.reduce((sum, r) => sum + r.spendUsd, 0);
    const totalOrderCount = rows.reduce((sum, r) => sum + r.orderCount, 0);
    const totalRevenue = rows.reduce((sum, r) => sum + r.revenue, 0);
    const totalRoas = totalSpendArs > 0 ? totalRevenue / totalSpendArs : 0;
    const totalRoasPercent = totalSpendArs > 0 ? (totalRevenue / totalSpendArs) * 100 : 0;
    const totalCostAdsPercent = totalRevenue > 0 ? (totalSpendArs / totalRevenue) * 100 : 0;
    const totalCpa = totalOrderCount > 0 ? totalSpendArs / totalOrderCount : 0;
    
    return {
      rows,
      totals: {
        spendArs: totalSpendArs,
        spendUsd: totalSpendUsd,
        orderCount: totalOrderCount,
        revenue: totalRevenue,
        roas: totalRoas,
        roasPercent: totalRoasPercent,
        costAdsPercent: totalCostAdsPercent,
        cpa: totalCpa
      }
    };
  }, [processedRows, orders, exchangeRate, useHistoricalRates]);

  // 5a. Projections checking & calculations
  const isTodayQuery = useMemo(() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const todayStr = `${year}-${month}-${day}`;
    return datePreset === "today" || (dateStart === todayStr && dateEnd === todayStr);
  }, [datePreset, dateStart, dateEnd]);

  const [elapsedFraction, setElapsedFraction] = useState(0.5);

  useEffect(() => {
    const now = new Date();
    const elapsedHours = now.getHours() + now.getMinutes() / 60;
    setElapsedFraction(Math.max(0.001, elapsedHours / 24));
  }, [rawData]);

  // 5b. Client-side aggregation to combine daily rows into totals per campaign
  const aggregatedRows = useMemo(() => {
    const groups: Record<string, MetaInsightRow> = {};

    processedRows.forEach((row) => {
      let key = row.campaign_id;
      if (level === "adset") {
        key = row.adset_id || row.campaign_id;
      } else if (level === "ad") {
        key = row.ad_id || row.campaign_id;
      } else if (level === "account") {
        key = row.account_name;
      }

      if (!groups[key]) {
        groups[key] = {
          ...row,
          impressions: 0,
          clicks: 0,
          spend: 0,
          reach: 0,
          actions: [],
          cost_per_action_type: []
        };
      }

      const grp = groups[key];
      grp.impressions += row.impressions;
      grp.clicks += row.clicks;
      grp.spend += row.spend;
      grp.reach += row.reach;

      // Combine actions
      row.actions.forEach((act) => {
        const existing = grp.actions.find(a => a.action_type === act.action_type);
        if (existing) {
          existing.value = (Number(existing.value) + Number(act.value)).toString();
        } else {
          grp.actions.push({ ...act });
        }
      });
    });

    // Recompute ratios and return array
    return Object.values(groups).map((row) => {
      const ctr = row.impressions > 0 ? row.clicks / row.impressions : 0;
      const cpc = row.clicks > 0 ? row.spend / row.clicks : 0;
      const cpm = row.impressions > 0 ? (row.spend / row.impressions) * 1000 : 0;
      
      return {
        ...row,
        ctr,
        cpc,
        cpm
      };
    });
  }, [processedRows, level]);

  const totalConversionsProjectedBudget = useMemo(() => {
    let sum = 0;
    aggregatedRows.forEach(row => {
      const isRowActive = row.status === "ACTIVE" || row.status === "active";
      const conv = getActionValue(row, actionType);
      if (isRowActive && row.daily_budget > 0) {
        if (row.spend > 0) {
          sum += (row.daily_budget * conv) / row.spend;
        } else {
          sum += conv;
        }
      } else {
        sum += conv;
      }
    });
    return sum;
  }, [aggregatedRows, actionType]);

  const totalDailyBudget = useMemo(() => {
    let sumUsd = 0;
    let sumArs = 0;
    aggregatedRows.forEach(row => {
      const isRowActive = row.status === "ACTIVE" || row.status === "active";
      if (isRowActive) {
        sumUsd += row.daily_budget;
        const rowRate = useHistoricalRates && row.rate ? row.rate : exchangeRate;
        sumArs += row.daily_budget * rowRate;
      }
    });
    return { usd: sumUsd, ars: sumArs };
  }, [aggregatedRows, exchangeRate, useHistoricalRates]);

  // 6. Grouping Logic
  const groupedData = useMemo(() => {
    if (groupBy === "none") return [];

    const groups: Record<string, {
      name: string;
      rows: MetaInsightRow[];
      spendUsd: number;
      conversions: number;
      impressions: number;
      clicks: number;
      dailyBudget: number;
    }> = {};

    aggregatedRows.forEach(row => {
      const key = groupBy === "oferta" ? (row.oferta || "Sin Oferta Comercial") : (row.linea || "Sin Línea");
      
      if (!groups[key]) {
        groups[key] = {
          name: key,
          rows: [],
          spendUsd: 0,
          conversions: 0,
          impressions: 0,
          clicks: 0,
          dailyBudget: 0
        };
      }

      const grp = groups[key];
      grp.rows.push(row);
      grp.spendUsd += row.spend;
      grp.conversions += getActionValue(row, actionType);
      grp.impressions += row.impressions;
      grp.clicks += row.clicks;
      grp.dailyBudget += row.daily_budget;
    });

    return Object.values(groups).sort((a, b) => b.spendUsd - a.spendUsd);
  }, [aggregatedRows, groupBy, actionType]);

  const toggleGroup = (groupName: string) => {
    setExpandedGroups(prev => ({
      ...prev,
      [groupName]: !prev[groupName]
    }));
  };

  // 6b. Charting calculations
  const uniqueCampaignsInFiltered = useMemo(() => {
    const map: Record<string, string> = {};
    processedRows.forEach(r => {
      const name = level === "adset" ? (r.adset_name || r.campaign_name) : 
                   level === "ad" ? (r.ad_name || r.campaign_name) : r.campaign_name;
      const id = level === "adset" ? (r.adset_id || r.campaign_id) :
                 level === "ad" ? (r.ad_id || r.campaign_id) : r.campaign_id;
      map[id] = name;
    });
    return Object.entries(map).map(([id, name]) => ({ id, name }));
  }, [processedRows, level]);

  const chartRows = useMemo(() => {
    if (chartFocusCampaign === "all") return processedRows;
    
    // Match appropriate level ID
    return processedRows.filter(r => {
      const id = level === "adset" ? (r.adset_id || r.campaign_id) :
                 level === "ad" ? (r.ad_id || r.campaign_id) : r.campaign_id;
      return id === chartFocusCampaign;
    });
  }, [processedRows, chartFocusCampaign, level]);

  const dailyChartData = useMemo(() => {
    const dateMap: Record<string, {
      dateStr: string;
      spendUsd: number;
      spendArs: number;
      conversions: number;
      impressions: number;
      clicks: number;
    }> = {};

    chartRows.forEach((row) => {
      const date = row.date_start || "S/D";
      if (!dateMap[date]) {
        dateMap[date] = {
          dateStr: date,
          spendUsd: 0,
          spendArs: 0,
          conversions: 0,
          impressions: 0,
          clicks: 0
        };
      }
      const dayData = dateMap[date];
      const rowRate = useHistoricalRates && row.rate ? row.rate : exchangeRate;
      dayData.spendUsd += row.spend;
      dayData.spendArs += row.spend * rowRate;
      dayData.conversions += getActionValue(row, actionType);
      dayData.impressions += row.impressions;
      dayData.clicks += row.clicks;
    });

    return Object.values(dateMap).sort((a, b) => a.dateStr.localeCompare(b.dateStr));
  }, [chartRows, actionType, exchangeRate, useHistoricalRates]);

  // 7. CSV Export
  const handleExportCSV = () => {
    const isProgreso = activeTab === "progreso";
    const rowsToExport = isProgreso ? processedRows : aggregatedRows;

    if (rowsToExport.length === 0) return;

    const headersList = [
      ...(isProgreso ? ["Fecha"] : []),
      "Estado",
      "Cuenta",
      "Nombre de Campaña",
      "ID Campaña",
      "Oferta Comercial",
      "Línea",
      "Producto",
      "Conversiones",
      ...(isTodayQuery && !isProgreso ? ["Proy. Ritmo Conversiones", "Proy. Presupuesto Conversiones"] : []),
      "CPR USD",
      "CPR ARS",
      "CTR %",
      "CPM USD",
      "Impresiones",
      "Clicks",
      "Gasto USD",
      ...(isTodayQuery && !isProgreso ? ["Proy. Ritmo Gasto USD", "Proy. Ritmo Gasto ARS"] : []),
      "Gasto Final ARS",
      "Presupuesto Diario USD",
      "Presupuesto Real ARS"
    ];

    const csvRows = [headersList.join(";")];

    rowsToExport.forEach(row => {
      const conv = getActionValue(row, actionType);
      const rowRate = useHistoricalRates && row.rate ? row.rate : exchangeRate;
      const cprU = conv > 0 ? (row.spend / conv).toFixed(2) : "0.00";
      const cprA = conv > 0 ? ((row.spend * rowRate) / conv).toFixed(2) : "0.00";
      const spendArs = (row.spend * rowRate).toFixed(2);
      const budgetArs = (row.daily_budget * rowRate).toFixed(2);

      // Projections for this row:
      const rowSpendProjected = row.spend / elapsedFraction;
      const rowSpendProjectedArs = (row.spend * rowRate) / elapsedFraction;
      const rowConversionsProjected = conv / elapsedFraction;
      
      const isRowActive = row.status === "ACTIVE" || row.status === "active";
      let rowConversionsBudgetProjected: number | "N/D" = conv;
      if (isRowActive && row.daily_budget > 0) {
        if (row.spend > 0) {
          rowConversionsBudgetProjected = (row.daily_budget * conv) / row.spend;
        } else if (conv === 0) {
          rowConversionsBudgetProjected = 0;
        } else {
          rowConversionsBudgetProjected = "N/D";
        }
      }

      const fieldsValues = [
        ...(isProgreso ? [row.date_start || "S/D"] : []),
        row.status,
        row.account_name,
        `"${row.campaign_name.replace(/"/g, '""')}"`,
        row.campaign_id,
        `"${row.oferta}"`,
        `"${row.linea}"`,
        `"${row.producto}"`,
        conv,
        ...(isTodayQuery && !isProgreso ? [
          Math.round(rowConversionsProjected),
          typeof rowConversionsBudgetProjected === "number" ? Math.round(rowConversionsBudgetProjected) : rowConversionsBudgetProjected
        ] : []),
        cprU,
        cprA,
        (row.ctr * 100).toFixed(2) + "%",
        row.cpm.toFixed(2),
        row.impressions,
        row.clicks,
        row.spend.toFixed(2),
        ...(isTodayQuery && !isProgreso ? [
          rowSpendProjected.toFixed(2),
          rowSpendProjectedArs.toFixed(2)
        ] : []),
        spendArs,
        row.daily_budget.toFixed(2),
        budgetArs
      ];

      csvRows.push(fieldsValues.join(";"));
    });

    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + encodeURIComponent(csvRows.join("\n"));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", csvContent);
    downloadAnchor.setAttribute("download", `meta_ads_${isProgreso ? "progreso_" : ""}${dateStart}_al_${dateEnd}.csv`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    document.body.removeChild(downloadAnchor);
  };

  return (
    <div className="space-y-6 pb-20">
      
      {/* Top Banners */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-100 text-rose-800 rounded-2xl flex items-center gap-3 animate-in fade-in duration-300">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          <span className="text-sm font-bold">{error}</span>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-50 border border-emerald-100 text-emerald-800 rounded-2xl flex items-center gap-3 animate-in fade-in duration-300">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span className="text-sm font-bold">{success}</span>
        </div>
      )}

      {/* Main Settings Card */}
      <div className="bg-white p-6 sm:p-8 rounded-[2rem] border border-slate-100 shadow-xl space-y-6">
        
        {/* Header Section */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-100 pb-6">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-500/20">
                <Target className="w-5 h-5" />
              </div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tighter">Meta Ads Manager</h1>
            </div>
            <p className="text-slate-500 text-sm font-medium mt-1">Monitorea y analiza tus campañas publicitarias y costos convertidos a ARS</p>
          </div>
          
          <div className="flex flex-wrap gap-2 w-full md:w-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowTokenSettings(!showTokenSettings)}
              className="flex items-center gap-2 border-slate-200 text-slate-700 bg-slate-50 hover:bg-slate-100"
            >
              <Settings className={`w-4 h-4 text-slate-500 ${showTokenSettings ? "rotate-90" : ""} transition-transform`} />
              Configurar Token
            </Button>
            
            <Button
              variant="primary"
              size="sm"
              onClick={handleFetchData}
              disabled={loadingData}
              className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700 shadow-md shadow-blue-600/10"
            >
              {loadingData ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Consultando...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  Consultar Meta Ads
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Access Token settings block */}
        {showTokenSettings && (
          <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200 shadow-inner grid grid-cols-1 md:grid-cols-3 gap-4 animate-in slide-in-from-top-4 duration-300">
            <div className="md:col-span-2 flex flex-col gap-1.5">
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Token de Acceso (Meta Graph API)</label>
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Ingresa tu token de Meta Ads..."
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-4 focus:ring-blue-500/10 font-bold bg-white text-slate-700 text-xs outline-none"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Cotización del Dólar (ARS)</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={exchangeRate}
                  onChange={(e) => setExchangeRate(Number(e.target.value))}
                  placeholder="Ej. 1560"
                  className="flex-1 px-4 py-3 rounded-xl border border-slate-200 focus:ring-4 focus:ring-blue-500/10 font-black bg-white text-slate-700 text-sm outline-none"
                />
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => syncExchangeRate()} 
                  disabled={isRateLoading}
                  className="px-3 bg-white text-slate-600 border-slate-200 hover:bg-slate-50 rounded-xl shrink-0 h-auto"
                  title="Sincronizar desde planilla compartida"
                >
                  {isRateLoading ? <Loader2 className="w-4 h-4 animate-spin text-blue-500" /> : <RefreshCw className="w-4 h-4 text-slate-500" />}
                </Button>
                <Button variant="success" size="sm" onClick={handleSaveToken} className="px-4 shrink-0 rounded-xl h-auto" title="Guardar">
                  <Save className="w-4 h-4" />
                </Button>
              </div>
              <div className="flex items-center gap-1.5 mt-1">
                <input
                  type="checkbox"
                  id="chkHistoricalRate"
                  checked={useHistoricalRates}
                  onChange={(e) => setUseHistoricalRates(e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500/10 cursor-pointer accent-blue-600"
                />
                <label htmlFor="chkHistoricalRate" className="text-[10px] font-bold text-slate-500 uppercase cursor-pointer select-none">
                  Usar cotización histórica diaria
                </label>
              </div>
              {rateSyncStatus && (
                <span className="text-[9px] font-black uppercase text-blue-600 leading-tight block mt-0.5">{rateSyncStatus}</span>
              )}
            </div>
          </div>
        )}

        {/* Active Configurations Tag list */}
        {Object.keys(savedConfigs).length > 0 && (
          <div className="flex flex-wrap items-center gap-2 py-1">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mr-2">Presets Guardados:</span>
            {Object.values(savedConfigs).map((cfg) => {
              const isDefault = defaultConfigName === cfg.name;
              return (
                <div
                  key={cfg.name}
                  onClick={() => handleApplyConfig(cfg)}
                  className={`group flex items-center gap-2 px-3.5 py-1.5 rounded-full border transition-all active:scale-95 cursor-pointer text-xs font-bold ${
                    isDefault 
                      ? "border-amber-300 bg-amber-50/70 text-amber-800 shadow-sm"
                      : "border-slate-200 hover:border-blue-400 bg-slate-50 hover:bg-blue-50 text-slate-600 hover:text-blue-700"
                  }`}
                  title={isDefault ? "Preset por defecto (cargado al abrir la página)" : "Hacer preset por defecto"}
                >
                  <Star 
                    onClick={(e) => handleToggleDefaultConfig(cfg.name, e)}
                    className={`w-3.5 h-3.5 transition-all active:scale-90 ${
                      isDefault 
                        ? "text-amber-500 fill-amber-500 hover:opacity-80" 
                        : "text-slate-400 hover:text-amber-500 hover:fill-amber-400 opacity-60 group-hover:opacity-100"
                    }`}
                  />
                  <span>{cfg.name}</span>
                  <Trash2
                    onClick={(e) => handleDeleteConfig(cfg.name, e)}
                    className={`w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-500 ${
                      isDefault ? "text-amber-600" : "text-slate-400"
                    }`}
                  />
                </div>
              );
            })}
          </div>
        )}

        {/* Parameters Form Block */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {/* Ad Accounts select */}
          <div className="flex flex-col gap-1.5 justify-end">
            {loadingAccounts ? (
              <div className="h-[44px] border border-slate-100 bg-slate-50/50 rounded-2xl flex items-center px-4">
                <Loader2 className="w-4 h-4 animate-spin text-blue-500 mr-2" />
                <span className="text-xs font-bold text-slate-400">Cargando cuentas...</span>
              </div>
            ) : (
              <SearchableMultiSelect
                label="Cuentas de Anuncios"
                options={adAccountOptions}
                selectedValues={selectedAccounts}
                onChange={setSelectedAccounts}
                placeholder="Elegir cuentas..."
              />
            )}
            <span className="text-[9px] text-slate-400 font-medium leading-none">Selecciona una o más cuentas de anuncios</span>
          </div>

          {/* Date range selection */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Frecuencia / Rango de Fechas</label>
            <select
              value={datePreset}
              onChange={(e) => setDatePreset(e.target.value)}
              className="w-full px-4 py-3.5 border border-slate-200 focus:ring-4 focus:ring-blue-500/10 rounded-2xl bg-white font-bold text-xs text-slate-700 outline-none"
            >
              <option value="today">Hoy (Relativo)</option>
              <option value="yesterday">Ayer (Relativo)</option>
              <option value="last_3">Últimos 3 días (Relativo)</option>
              <option value="last_7">Últimos 7 días (Relativo)</option>
              <option value="last_14">Últimos 14 días (Relativo)</option>
              <option value="last_28">Últimos 28 días (Relativo)</option>
              <option value="last_30">Últimos 30 días (Relativo)</option>
              <option value="this_month">Este mes</option>
              <option value="last_month">Mes anterior</option>
              <option value="this_quarter">Este trimestre</option>
              <option value="maximum">Rango Histórico Completo</option>
              <option value="custom">Rango Personalizado</option>
            </select>

            {datePreset === "custom" && (
              <div className="grid grid-cols-2 gap-2 mt-2 animate-in fade-in duration-200">
                <input
                  type="date"
                  value={dateStart}
                  onChange={(e) => setDateStart(e.target.value)}
                  className="px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none"
                />
                <input
                  type="date"
                  value={dateEnd}
                  onChange={(e) => setDateEnd(e.target.value)}
                  className="px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none"
                />
              </div>
            )}
          </div>

          {/* Level selection */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Nivel de Desglose</label>
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              className="w-full px-4 py-3.5 border border-slate-200 focus:ring-4 focus:ring-blue-500/10 rounded-2xl bg-white font-bold text-xs text-slate-700 outline-none"
            >
              <option value="campaign">Campañas</option>
              <option value="adset">Conjunto de Anuncios (Ad Set)</option>
              <option value="ad">Anuncios (Ad)</option>
              <option value="account">Cuenta de Anuncios completa</option>
            </select>
          </div>

          {/* Action / conversion objective type selection */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Conversión / Resultado a visualizar</label>
            <select
              value={actionType}
              onChange={(e) => setActionType(e.target.value)}
              className="w-full px-4 py-3.5 border border-slate-200 focus:ring-4 focus:ring-blue-500/10 rounded-2xl bg-white font-bold text-xs text-slate-700 outline-none overflow-ellipsis"
            >
              <option value="onsite_conversion.messaging_conversation_started_7d">Conversaciones iniciadas 7d</option>
              <option value="onsite_conversion.messaging_first_reply">Primeras respuestas (mensajes)</option>
              <option value="lead">Leads (Clientes potenciales)</option>
              <option value="purchase">Compras</option>
              <option value="link_click">Clics en el enlace</option>
              {availableActionTypes
                .filter(t => ![
                  "onsite_conversion.messaging_first_reply",
                  "onsite_conversion.messaging_conversation_started_7d",
                  "lead", "purchase", "link_click"
                ].includes(t))
                .map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
            </select>
          </div>
        </div>

        {/* Load logs when processing */}
        {loadStatus && (
          <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-xl text-blue-800 text-xs font-bold animate-pulse">
            <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
            <span>{loadStatus}</span>
          </div>
        )}

        {/* Named configuration block */}
        <div className="border-t border-slate-100 pt-5 flex flex-col sm:flex-row gap-3 items-end">
          <div className="flex-1 flex flex-col gap-1 w-full">
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Guardar esta configuración actual</label>
            <input
              type="text"
              value={newConfigName}
              onChange={(e) => setNewConfigName(e.target.value)}
              placeholder="Ej. MSG Hoy, TD Ayer..."
              className="w-full px-4 py-3 border border-slate-200 rounded-2xl bg-white font-bold text-xs text-slate-700 outline-none"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSaveNamedConfig}
            className="flex items-center gap-1.5 h-12 rounded-2xl w-full sm:w-auto shrink-0 border-slate-200 hover:bg-slate-50 text-slate-700 font-bold"
          >
            <Plus className="w-4 h-4 text-slate-500" />
            Guardar Configuración
          </Button>
        </div>
      </div>

      {/* KPI summary cards block */}
      {processedRows.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          
          {/* Card 1: Inversión */}
          <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-md relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-3 bg-indigo-50/50 rounded-bl-3xl">
              <TrendingUp className="w-5 h-5 text-indigo-500" />
            </div>
            <span className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Inversión Total</span>
            <div className="mt-2 space-y-1">
              <span className="block text-2xl font-black text-slate-900 tracking-tighter">
                ${kpis.spendArs.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                <span className="text-xs font-bold text-slate-400 ml-1">ARS</span>
              </span>
              <span className="block text-xs font-bold text-slate-500">
                US${kpis.spendUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* Card 2: Conversiones */}
          <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-md relative overflow-hidden">
            <div className="absolute top-0 right-0 p-3 bg-blue-50/50 rounded-bl-3xl">
              <Megaphone className="w-5 h-5 text-blue-500" />
            </div>
            <span className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Resultados</span>
            <div className="mt-2 space-y-1">
              <span className="block text-2xl font-black text-slate-900 tracking-tighter">
                {kpis.conversions.toLocaleString()}
              </span>
              <span className="block text-xs font-bold text-slate-500 truncate" title={actionType}>
                {actionType.split('.').pop()?.replace(/_/g, ' ')}
              </span>
            </div>
          </div>

          {/* Card 3: CPR */}
          <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-md relative overflow-hidden">
            <div className="absolute top-0 right-0 p-3 bg-emerald-50/50 rounded-bl-3xl">
              <DollarSign className="w-5 h-5 text-emerald-500" />
            </div>
            <span className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Costo por Resultado (CPR)</span>
            <div className="mt-2 space-y-1">
              <span className="block text-2xl font-black text-slate-900 tracking-tighter">
                ${kpis.cprArs.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                <span className="text-xs font-bold text-slate-400 ml-1">ARS</span>
              </span>
              <span className="block text-xs font-bold text-slate-500">
                US${kpis.cprUsd.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Card 4: CPM / CTR */}
          <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-md relative overflow-hidden">
            <div className="absolute top-0 right-0 p-3 bg-violet-50/50 rounded-bl-3xl">
              <BarChart3 className="w-5 h-5 text-violet-500" />
            </div>
            <span className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">CPM Promedio & CTR</span>
            <div className="mt-2 space-y-1">
              <span className="block text-2xl font-black text-slate-900 tracking-tighter">
                {(kpis.ctr * 100).toFixed(2)}%
                <span className="text-xs font-bold text-slate-400 ml-1">CTR</span>
              </span>
              <span className="block text-xs font-bold text-slate-500">
                US${kpis.spendUsd > 0 && kpis.impressions > 0 ? ((kpis.spendUsd / kpis.impressions) * 1000).toFixed(2) : "0.00"} CPM
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Today's Projections Block */}
      {isTodayQuery && processedRows.length > 0 && (
        <div className="bg-gradient-to-br from-blue-50/40 via-indigo-50/30 to-slate-50/40 p-6 rounded-[2.5rem] border border-blue-100/60 shadow-lg space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-blue-100/50 pb-3">
            <div>
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-pulse" />
                Proyecciones al Cierre de Hoy
              </h3>
              <p className="text-[10px] font-bold text-slate-500 mt-0.5">
                Estimación de resultados y gastos al finalizar el día (23:59hs) basándose en el comportamiento actual.
              </p>
            </div>
            <div className="flex flex-col sm:items-end shrink-0">
              <span className="text-[10px] font-black uppercase text-blue-700 bg-blue-100/60 px-3 py-1 rounded-full border border-blue-200">
                Progreso del Día: {(elapsedFraction * 100).toFixed(1)}%
              </span>
              <span className="text-[9px] font-semibold text-slate-400 mt-1">
                Hora local: {new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          </div>

          {elapsedFraction < 0.33 && (
            <div className="p-3 bg-amber-50 border border-amber-100 text-amber-800 text-[10px] font-bold rounded-2xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
              <span>Aviso: Al ser temprano en el día (antes de las 08:00 AM), las proyecciones por ritmo pueden presentar alta volatilidad.</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            
            {/* Ritmo Card 1: Mensajes por Ritmo */}
            <div className="bg-white p-5 rounded-3xl border border-blue-50 shadow-sm relative overflow-hidden group">
              <span className="block text-[9px] font-black text-blue-600 uppercase tracking-widest">Mensajes Proyectados (Por Ritmo)</span>
              <div className="mt-2 space-y-1">
                <span className="block text-2xl font-black text-slate-900 tracking-tighter">
                  {Math.round(kpis.conversions / elapsedFraction).toLocaleString()}
                  <span className="text-xs font-bold text-slate-400 ml-1.5">mensajes</span>
                </span>
                <span className="block text-xs font-semibold text-slate-500">
                  Extrapolación horaria. Hoy real: <span className="font-extrabold text-slate-700">{kpis.conversions}</span> msgs.
                </span>
              </div>
            </div>

            {/* Ritmo Card 2: Gasto por Ritmo */}
            <div className="bg-white p-5 rounded-3xl border border-blue-50 shadow-sm relative overflow-hidden">
              <span className="block text-[9px] font-black text-blue-600 uppercase tracking-widest">Gasto Proyectado (Por Ritmo)</span>
              <div className="mt-2 space-y-1">
                <span className="block text-2xl font-black text-slate-900 tracking-tighter">
                  ${Math.round(kpis.spendArs / elapsedFraction).toLocaleString("es-AR")}
                  <span className="text-xs font-bold text-slate-400 ml-1.5">ARS</span>
                </span>
                <span className="block text-xs font-semibold text-slate-500">
                  US${(kpis.spendUsd / elapsedFraction).toFixed(2)} (Presupuesto total activo: ${Math.round(totalDailyBudget.ars).toLocaleString("es-AR")} ARS / US$${Math.round(totalDailyBudget.usd)})
                </span>
              </div>
            </div>

            {/* Ritmo Card 3: Proyección por Presupuesto */}
            <div className="bg-white p-5 rounded-3xl border border-indigo-50 shadow-sm relative overflow-hidden">
              <span className="block text-[9px] font-black text-indigo-600 uppercase tracking-widest">Mensajes Proyectados (Por Presupuesto)</span>
              <div className="mt-2 space-y-1">
                <span className="block text-2xl font-black text-indigo-700 tracking-tighter">
                  {Math.round(totalConversionsProjectedBudget).toLocaleString()}
                  <span className="text-xs font-bold text-indigo-400 ml-1.5">mensajes</span>
                </span>
                <span className="block text-xs font-semibold text-slate-500">
                  Si se consume el presupuesto diario de ${Math.round(totalDailyBudget.ars).toLocaleString("es-AR")} ARS (US$${Math.round(totalDailyBudget.usd)}) al CPR actual.
                </span>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Main Table and Visualizer */}
      {rawData.length > 0 && (
        <div className="bg-white rounded-[2rem] border border-slate-100 shadow-xl overflow-hidden">
          
          {/* Table Toolbar */}
          <div className="p-6 border-b border-slate-100 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-slate-50/30">
            <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
              
              {/* Search Campaign */}
              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Buscar campaña..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/10 rounded-xl text-xs font-bold text-slate-700 bg-white"
                />
              </div>

              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2.5 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none bg-white"
              >
                <option value="all">Todos los Estados</option>
                <option value="active">Solo Activos</option>
                <option value="paused">Solo Pausados</option>
              </select>

              {/* Group By Option */}
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider mr-1">Agrupar por:</span>
                <select
                  value={groupBy}
                  onChange={(e) => {
                    setGroupBy(e.target.value as "none" | "oferta" | "linea");
                    setExpandedGroups({});
                  }}
                  className="px-3 py-2.5 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none bg-white mr-2"
                >
                  <option value="none">Sin Agrupar</option>
                  <option value="oferta">Oferta Comercial</option>
                  <option value="linea">Línea</option>
                </select>
              </div>

              {/* Oferta Comercial Filter */}
              {uniqueOfertas.length > 0 && (
                <div className="w-full sm:w-52 shrink-0 z-40">
                  <SearchableMultiSelect
                    label=""
                    options={uniqueOfertas}
                    selectedValues={selectedOfertas}
                    onChange={setSelectedOfertas}
                    placeholder="Filtro Oferta..."
                  />
                </div>
              )}

              {/* Líneas Filter */}
              {uniqueLineas.length > 0 && (
                <div className="w-full sm:w-52 shrink-0 z-40">
                  <SearchableMultiSelect
                    label=""
                    options={uniqueLineas}
                    selectedValues={selectedLineas}
                    onChange={setSelectedLineas}
                    placeholder="Filtro Línea..."
                  />
                </div>
              )}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCSV}
              disabled={processedRows.length === 0}
              className="flex items-center gap-2 border-slate-200 text-slate-700 bg-white hover:bg-slate-50 font-bold shrink-0 self-end lg:self-auto"
            >
              <Download className="w-4 h-4 text-slate-500" />
              Exportar CSV
            </Button>
          </div>

          {/* Tab Selector */}
          <div className="flex border-b border-slate-200 mb-6 bg-slate-50/50 p-1 rounded-2xl w-fit">
            <button
              onClick={() => setActiveTab("general")}
              className={`px-6 py-2.5 text-xs font-black uppercase tracking-wider rounded-xl transition-all ${
                activeTab === "general"
                  ? "bg-white text-blue-600 shadow-sm font-extrabold border border-slate-100"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Rendimiento General
            </button>
            <button
              onClick={() => setActiveTab("progreso")}
              className={`px-6 py-2.5 text-xs font-black uppercase tracking-wider rounded-xl transition-all ${
                activeTab === "progreso"
                  ? "bg-white text-blue-600 shadow-sm font-extrabold border border-slate-100"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Progreso Diario
            </button>
            <button
              onClick={() => setActiveTab("roas")}
              className={`px-6 py-2.5 text-xs font-black uppercase tracking-wider rounded-xl transition-all ${
                activeTab === "roas"
                  ? "bg-white text-blue-600 shadow-sm font-extrabold border border-slate-100"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Retorno de Ventas (ROAS)
            </button>
          </div>

          {activeTab === "general" && (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse table-auto text-xs min-w-[1000px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-black uppercase text-slate-400 tracking-wider">
                    <th className="px-5 py-3 w-28">Estado</th>
                    <th className="px-4 py-3 w-36">Cuenta</th>
                    <th className="px-4 py-3 min-w-[200px]">Detalle del Anuncio</th>
                    <th className="px-4 py-3">Oferta Comercial</th>
                    <th className="px-4 py-3">Línea</th>
                    <th className="px-4 py-3">Producto</th>
                    <th className="px-4 py-3 text-center w-24">Conversiones</th>
                    {isTodayQuery && (
                      <>
                        <th className="px-4 py-3 text-center w-28 text-blue-700 bg-blue-50/50">Proy. Ritmo (Msg)</th>
                        <th className="px-4 py-3 text-center w-28 text-indigo-700 bg-indigo-50/50">Proy. Presup (Msg)</th>
                      </>
                    )}
                    <th className="px-4 py-3 text-center w-32">CPR (USD/ARS)</th>
                    <th className="px-4 py-3 text-center w-20">CTR</th>
                    <th className="px-4 py-3 text-center w-24 font-medium text-slate-400">CPM</th>
                    <th className="px-4 py-3 text-right w-32">Gasto (USD/ARS)</th>
                    {isTodayQuery && (
                      <th className="px-4 py-3 text-right w-32 text-blue-700 bg-blue-50/50">Proy. Ritmo (Gasto)</th>
                    )}
                    <th className="px-4 py-3 text-right w-36">Presupuesto (USD/ARS)</th>
                  </tr>
                </thead>

                {/* VIEW 1: FLAT LIST */}
                {groupBy === "none" && (
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                    {aggregatedRows.map((row, idx) => {
                      const conv = getActionValue(row, actionType);
                      const rowRate = useHistoricalRates && row.rate ? row.rate : exchangeRate;
                      const cprU = conv > 0 ? row.spend / conv : 0;
                      const cprA = conv > 0 ? (row.spend * rowRate) / conv : 0;
                      const spendA = row.spend * rowRate;
                      const budgetA = row.daily_budget * rowRate;
                      const isRowActive = row.status === "ACTIVE" || row.status === "active";

                      // Projections
                      const rowSpendProjected = row.spend / elapsedFraction;
                      const rowSpendProjectedArs = spendA / elapsedFraction;
                      const rowConversionsProjected = conv / elapsedFraction;
                      
                      let rowConversionsBudgetProjected: number | "N/D" = conv;
                      if (isRowActive && row.daily_budget > 0) {
                        if (row.spend > 0) {
                          rowConversionsBudgetProjected = (row.daily_budget * conv) / row.spend;
                        } else if (conv === 0) {
                          rowConversionsBudgetProjected = 0;
                        } else {
                          rowConversionsBudgetProjected = "N/D";
                        }
                      }

                      return (
                        <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-5 py-3.5">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider ${
                              isRowActive 
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-100" 
                                : "bg-slate-100 text-slate-500 border border-slate-200"
                            }`}>
                              {isRowActive ? <Play className="w-2.5 h-2.5 fill-current" /> : <Pause className="w-2.5 h-2.5 fill-current" />}
                              {row.status}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 text-slate-400 font-bold truncate max-w-[140px]" title={row.account_name}>
                            {row.account_name}
                          </td>
                          <td className="px-4 py-3.5 font-bold text-slate-900 group">
                            <div className="flex flex-col">
                              <span className="truncate max-w-[300px]" title={row.campaign_name}>
                                {row.campaign_name}
                              </span>
                              <span className="text-[9px] font-semibold text-slate-400 mt-0.5">ID: {row.campaign_id}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3.5 text-slate-600 font-semibold">{row.oferta || "-"}</td>
                          <td className="px-4 py-3.5 text-slate-600 font-semibold">{row.linea || "-"}</td>
                          <td className="px-4 py-3.5">
                            {row.producto ? (
                              <span className="inline-block bg-slate-100 text-slate-700 text-[10px] font-bold px-2 py-0.5 rounded-lg border">
                                {row.producto}
                              </span>
                            ) : "-"}
                          </td>
                          <td className="px-4 py-3.5 text-center font-extrabold text-slate-900">{conv.toLocaleString()}</td>
                          {isTodayQuery && (
                            <>
                              <td className="px-4 py-3.5 text-center font-extrabold text-blue-700 bg-blue-50/20">
                                {conv > 0 ? Math.round(rowConversionsProjected).toLocaleString() : "0"}
                              </td>
                              <td className="px-4 py-3.5 text-center font-extrabold text-indigo-700 bg-indigo-50/20">
                                {typeof rowConversionsBudgetProjected === "number" 
                                  ? Math.round(rowConversionsBudgetProjected).toLocaleString() 
                                  : rowConversionsBudgetProjected}
                              </td>
                            </>
                          )}
                          <td className="px-4 py-3.5 text-center">
                            <div className="flex flex-col">
                              <span className="font-extrabold text-slate-900">${cprA.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                              <span className="text-[10px] text-slate-400 font-bold">US${cprU.toFixed(2)}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3.5 text-center font-bold text-slate-800">{(row.ctr * 100).toFixed(2)}%</td>
                          <td className="px-4 py-3.5 text-center text-slate-400 font-semibold">US${row.cpm.toFixed(2)}</td>
                          <td className="px-4 py-3.5 text-right">
                            <div className="flex flex-col items-end">
                              <span className="font-extrabold text-slate-900">${spendA.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                              <span className="text-[10px] text-slate-400 font-bold">US${row.spend.toFixed(2)}</span>
                            </div>
                          </td>
                          {isTodayQuery && (
                            <td className="px-4 py-3.5 text-right bg-blue-50/20">
                              <div className="flex flex-col items-end">
                                <span className="font-extrabold text-blue-700">${rowSpendProjectedArs.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                                <span className="text-[10px] text-blue-400 font-bold">US${rowSpendProjected.toFixed(2)}</span>
                              </div>
                            </td>
                          )}
                          <td className="px-4 py-3.5 text-right">
                            <div className="flex flex-col items-end">
                              <span className="font-extrabold text-slate-900">
                                {budgetA > 0 ? `$${budgetA.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : "CBO / S/D"}
                              </span>
                              <span className="text-[10px] text-slate-400 font-bold">
                                {row.daily_budget > 0 ? `US$${row.daily_budget.toFixed(0)}` : "-"}
                              </span>
                              {isTodayQuery && isRowActive && row.daily_budget > 0 && (
                                <div className="w-24 mt-1.5">
                                  <div className="flex justify-between text-[8px] text-slate-400 font-bold mb-0.5">
                                    <span>Consumido</span>
                                    <span>{Math.min(100, Math.round((row.spend / row.daily_budget) * 100))}%</span>
                                  </div>
                                  <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                    <div 
                                      className={`h-full rounded-full ${
                                        (row.spend / row.daily_budget) > 1.0 ? "bg-red-500" : "bg-emerald-500"
                                      }`}
                                      style={{ width: `${Math.min(100, (row.spend / row.daily_budget) * 100)}%` }}
                                    />
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {aggregatedRows.length === 0 && (
                      <tr>
                        <td colSpan={isTodayQuery ? 15 : 12} className="px-5 py-8 text-center text-slate-400 font-bold">
                          No se encontraron registros que coincidan con la búsqueda.
                        </td>
                      </tr>
                    )}
                  </tbody>
                )}

                {/* VIEW 2: GROUPED LIST */}
                {groupBy !== "none" && (
                  <tbody className="font-medium text-slate-700">
                    {groupedData.map((group, grpIdx) => {
                      const isExpanded = expandedGroups[group.name] ?? false;
                      const groupCprUsd = group.conversions > 0 ? group.spendUsd / group.conversions : 0;
                      const groupCprArs = groupCprUsd * exchangeRate;
                      const groupSpendArs = group.spendUsd * exchangeRate;
                      const groupBudgetArs = group.dailyBudget * exchangeRate;
                      
                      // Summarize group ctr
                      const groupCtr = group.impressions > 0 ? group.clicks / group.impressions : 0;
                      const groupCpm = group.impressions > 0 ? (group.spendUsd / group.impressions) * 1000 : 0;

                      // Projections for group
                      let groupSpendProjectedUsd = 0;
                      let groupSpendProjectedArs = 0;
                      let groupConversionsProjectedRitmo = 0;
                      let groupConversionsProjectedBudget = 0;

                      group.rows.forEach(row => {
                        const rowRate = useHistoricalRates && row.rate ? row.rate : exchangeRate;
                        const conv = getActionValue(row, actionType);
                        const isRowActive = row.status === "ACTIVE" || row.status === "active";
                        
                        groupSpendProjectedUsd += row.spend / elapsedFraction;
                        groupSpendProjectedArs += (row.spend * rowRate) / elapsedFraction;
                        groupConversionsProjectedRitmo += conv / elapsedFraction;
                        
                        if (isRowActive && row.daily_budget > 0) {
                          if (row.spend > 0) {
                            groupConversionsProjectedBudget += (row.daily_budget * conv) / row.spend;
                          } else {
                            groupConversionsProjectedBudget += conv;
                          }
                        } else {
                          groupConversionsProjectedBudget += conv;
                        }
                      });

                      return (
                        <React.Fragment key={grpIdx}>
                          
                          {/* Group Header Row */}
                          <tr 
                            onClick={() => toggleGroup(group.name)}
                            className="bg-slate-100/70 hover:bg-slate-100 border-y border-slate-200/60 font-bold cursor-pointer transition-colors"
                          >
                            <td colSpan={6} className="px-5 py-4">
                              <div className="flex items-center gap-2">
                                {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
                                <Layers className="w-3.5 h-3.5 text-blue-500" />
                                <span className="text-slate-800 text-sm font-black tracking-tight">{group.name}</span>
                                <span className="text-[10px] bg-slate-200 text-slate-600 font-bold px-2 py-0.5 rounded-full ml-2">
                                  {group.rows.length} {group.rows.length === 1 ? "registro" : "registros"}
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-4 text-center font-extrabold text-blue-700 text-sm">
                              {group.conversions.toLocaleString()}
                            </td>
                            {isTodayQuery && (
                              <>
                                <td className="px-4 py-4 text-center font-extrabold text-blue-600 bg-blue-50/20 text-sm">
                                  {Math.round(groupConversionsProjectedRitmo).toLocaleString()}
                                </td>
                                <td className="px-4 py-4 text-center font-extrabold text-indigo-600 bg-indigo-50/20 text-sm">
                                  {Math.round(groupConversionsProjectedBudget).toLocaleString()}
                                </td>
                              </>
                            )}
                            <td className="px-4 py-4 text-center">
                              <div className="flex flex-col">
                                <span className="font-extrabold text-blue-700 text-sm">${groupCprArs.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                                <span className="text-[9px] text-slate-400 font-bold">US${groupCprUsd.toFixed(2)}</span>
                              </div>
                            </td>
                            <td className="px-4 py-4 text-center font-extrabold text-slate-800">
                              {(groupCtr * 100).toFixed(2)}%
                            </td>
                            <td className="px-4 py-4 text-center text-slate-400 font-semibold">
                              US${groupCpm.toFixed(2)}
                            </td>
                            <td className="px-4 py-4 text-right">
                              <div className="flex flex-col items-end">
                                <span className="font-extrabold text-slate-900 text-sm">${groupSpendArs.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                                <span className="text-[9px] text-slate-400 font-bold">US${group.spendUsd.toFixed(2)}</span>
                              </div>
                            </td>
                            {isTodayQuery && (
                              <td className="px-4 py-4 text-right bg-blue-50/20">
                                <div className="flex flex-col items-end text-sm">
                                  <span className="font-extrabold text-blue-600">${groupSpendProjectedArs.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                                  <span className="text-[9px] text-blue-400 font-bold">US${groupSpendProjectedUsd.toFixed(2)}</span>
                                </div>
                              </td>
                            )}
                            <td className="px-4 py-4 text-right">
                              <div className="flex flex-col items-end">
                                <span className="font-extrabold text-slate-900">${groupBudgetArs.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                                <span className="text-[9px] text-slate-400 font-bold">US${group.dailyBudget.toFixed(0)}</span>
                              </div>
                            </td>
                          </tr>

                          {/* Grouped Rows */}
                          {isExpanded && group.rows.map((row, rowIdx) => {
                            const conv = getActionValue(row, actionType);
                            const rowRate = useHistoricalRates && row.rate ? row.rate : exchangeRate;
                            const cprU = conv > 0 ? row.spend / conv : 0;
                            const cprA = conv > 0 ? (row.spend * rowRate) / conv : 0;
                            const spendA = row.spend * rowRate;
                            const budgetA = row.daily_budget * rowRate;
                            const isRowActive = row.status === "ACTIVE" || row.status === "active";

                            // Projections
                            const rowSpendProjected = row.spend / elapsedFraction;
                            const rowSpendProjectedArs = spendA / elapsedFraction;
                            const rowConversionsProjected = conv / elapsedFraction;
                            
                            let rowConversionsBudgetProjected: number | "N/D" = conv;
                            if (isRowActive && row.daily_budget > 0) {
                              if (row.spend > 0) {
                                rowConversionsBudgetProjected = (row.daily_budget * conv) / row.spend;
                              } else if (conv === 0) {
                                rowConversionsBudgetProjected = 0;
                              } else {
                                rowConversionsBudgetProjected = "N/D";
                              }
                            }

                            return (
                              <tr key={`${grpIdx}-${rowIdx}`} className="bg-white/40 hover:bg-slate-50/40 border-b border-slate-100/50 transition-colors animate-in slide-in-from-top-1 duration-200">
                                <td className="px-8 py-3.5">
                                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider ${
                                    isRowActive 
                                      ? "bg-emerald-50 text-emerald-600 border border-emerald-100" 
                                      : "bg-slate-100 text-slate-400 border border-slate-200"
                                  }`}>
                                    {row.status}
                                  </span>
                                </td>
                                <td className="px-4 py-3.5 text-slate-400 font-semibold truncate max-w-[130px]" title={row.account_name}>
                                  {row.account_name}
                                </td>
                                <td className="px-4 py-3.5 pl-6 font-semibold text-slate-800">
                                  <div className="flex flex-col">
                                    <span className="truncate max-w-[280px]" title={row.campaign_name}>
                                      {row.campaign_name}
                                    </span>
                                    <span className="text-[8px] font-semibold text-slate-400 mt-0.5">ID: {row.campaign_id}</span>
                                  </div>
                                </td>
                                <td className="px-4 py-3.5 text-slate-500 font-semibold">{row.oferta || "-"}</td>
                                <td className="px-4 py-3.5 text-slate-500 font-semibold">{row.linea || "-"}</td>
                                <td className="px-4 py-3.5">
                                  {row.producto ? (
                                    <span className="inline-block bg-slate-50 text-slate-600 text-[9px] px-1.5 py-0.5 rounded-md border">
                                      {row.producto}
                                    </span>
                                  ) : "-"}
                                </td>
                                <td className="px-4 py-3.5 text-center text-slate-700">{conv.toLocaleString()}</td>
                                {isTodayQuery && (
                                  <>
                                    <td className="px-4 py-3.5 text-center text-blue-600 font-bold bg-blue-50/10">
                                      {conv > 0 ? Math.round(rowConversionsProjected).toLocaleString() : "0"}
                                    </td>
                                    <td className="px-4 py-3.5 text-center text-indigo-600 font-bold bg-indigo-50/10">
                                      {typeof rowConversionsBudgetProjected === "number"
                                        ? Math.round(rowConversionsBudgetProjected).toLocaleString()
                                        : rowConversionsBudgetProjected}
                                    </td>
                                  </>
                                )}
                                <td className="px-4 py-3.5 text-center">
                                  <div className="flex flex-col">
                                    <span className="font-semibold text-slate-700">${cprA.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                                    <span className="text-[9px] text-slate-400">US${cprU.toFixed(2)}</span>
                                  </div>
                                </td>
                                <td className="px-4 py-3.5 text-center text-slate-500">{(row.ctr * 100).toFixed(2)}%</td>
                                <td className="px-4 py-3.5 text-center text-slate-400 font-medium">US${row.cpm.toFixed(2)}</td>
                                <td className="px-4 py-3.5 text-right">
                                  <div className="flex flex-col items-end">
                                    <span className="font-semibold text-slate-700">${spendA.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                                    <span className="text-[9px] text-slate-400">US${row.spend.toFixed(2)}</span>
                                  </div>
                                </td>
                                {isTodayQuery && (
                                  <td className="px-4 py-3.5 text-right bg-blue-50/10">
                                    <div className="flex flex-col items-end">
                                      <span className="font-semibold text-blue-600">${rowSpendProjectedArs.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                                      <span className="text-[9px] text-blue-400">US${rowSpendProjected.toFixed(2)}</span>
                                    </div>
                                  </td>
                                )}
                                <td className="px-4 py-3.5 text-right">
                                  <div className="flex flex-col items-end">
                                    <span className="font-semibold text-slate-700">
                                      {budgetA > 0 ? `$${budgetA.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : "CBO / ABO"}
                                    </span>
                                    <span className="text-[9px] text-slate-400">
                                      {row.daily_budget > 0 ? `US$${row.daily_budget.toFixed(0)}` : "-"}
                                    </span>
                                    {isTodayQuery && isRowActive && row.daily_budget > 0 && (
                                      <div className="w-20 mt-1">
                                        <div className="flex justify-between text-[7px] text-slate-400 mb-0.5">
                                          <span>Consumo</span>
                                          <span>{Math.min(100, Math.round((row.spend / row.daily_budget) * 100))}%</span>
                                        </div>
                                        <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden">
                                          <div 
                                            className={`h-full rounded-full ${(row.spend / row.daily_budget) > 1.0 ? "bg-red-500" : "bg-emerald-500"}`}
                                            style={{ width: `${Math.min(100, (row.spend / row.daily_budget) * 100)}%` }}
                                          />
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}

                        </React.Fragment>
                      );
                    })}
                    {groupedData.length === 0 && (
                      <tr>
                        <td colSpan={isTodayQuery ? 15 : 12} className="px-5 py-8 text-center text-slate-400 font-bold">
                          No se encontraron registros agrupables.
                        </td>
                      </tr>
                    )}
                  </tbody>
                )}
              </table>
            </div>
          )}

          {activeTab === "progreso" && (
            <div className="space-y-6">
              {/* Focus Controls */}
              <div className="flex flex-col md:flex-row gap-4 justify-between bg-slate-50 p-5 rounded-[2rem] border border-slate-100">
                <div className="flex flex-wrap gap-4 items-center">
                  <div className="flex flex-col gap-1 w-full sm:w-auto">
                    <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Filtrar por Campaña</label>
                    <select
                      value={chartFocusCampaign}
                      onChange={(e) => setChartFocusCampaign(e.target.value)}
                      className="px-4 py-2.5 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 bg-white focus:outline-none min-w-[200px]"
                    >
                      <option value="all">Todas combinadas</option>
                      {uniqueCampaignsInFiltered.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col gap-1 w-full sm:w-auto">
                    <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Métrica del Gráfico</label>
                    <select
                      value={chartMetric}
                      onChange={(e) => setChartMetric(e.target.value as typeof chartMetric)}
                      className="px-4 py-2.5 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 bg-white focus:outline-none min-w-[180px]"
                    >
                      <option value="spend_ars">Inversión (ARS)</option>
                      <option value="spend_usd">Inversión (USD)</option>
                      <option value="conversions">Conversiones (Resultados)</option>
                      <option value="cpr_ars">Costo por Resultado (ARS)</option>
                      <option value="cpr_usd">Costo por Resultado (USD)</option>
                    </select>
                  </div>
                </div>

                <div className="flex flex-col justify-center text-left md:text-right shrink-0">
                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block">Días de Reporte</span>
                  <span className="text-sm font-black text-slate-700">{dailyChartData.length} días activos</span>
                </div>
              </div>

              {/* SVG Line Chart */}
              {dailyChartData.length > 0 ? (() => {
                const chartWidth = 800;
                const chartHeight = 280;
                const paddingLeft = 70;
                const paddingRight = 40;
                const paddingTop = 25;
                const paddingBottom = 40;

                const actualWidth = chartWidth - paddingLeft - paddingRight;
                const actualHeight = chartHeight - paddingTop - paddingBottom;

                const chartPoints = dailyChartData.map((d) => {
                  let val = 0;
                  if (chartMetric === "spend_ars") val = d.spendArs;
                  else if (chartMetric === "spend_usd") val = d.spendUsd;
                  else if (chartMetric === "conversions") val = d.conversions;
                  else if (chartMetric === "cpr_ars") val = d.conversions > 0 ? d.spendArs / d.conversions : 0;
                  else if (chartMetric === "cpr_usd") val = d.conversions > 0 ? d.spendUsd / d.conversions : 0;
                  return { date: d.dateStr, val };
                });

                const maxVal = Math.max(...chartPoints.map(p => p.val), 0) || 1;

                const svgPoints = chartPoints.map((p, idx) => {
                  const x = paddingLeft + (chartPoints.length > 1 ? (idx / (chartPoints.length - 1)) * actualWidth : actualWidth / 2);
                  const y = paddingTop + actualHeight - (p.val / maxVal) * actualHeight;
                  return { x, y, date: p.date, val: p.val };
                });

                const pointsStr = svgPoints.map(p => `${p.x},${p.y}`).join(" ");
                const areaPointsStr = svgPoints.length > 0 
                  ? `${svgPoints[0].x},${paddingTop + actualHeight} ${pointsStr} ${svgPoints[svgPoints.length - 1].x},${paddingTop + actualHeight}`
                  : "";

                const gridValues = [maxVal, maxVal * 0.75, maxVal * 0.5, maxVal * 0.25, 0];

                const formatChartVal = (val: number) => {
                  if (chartMetric.endsWith("ars")) {
                    return `$${Math.round(val).toLocaleString("es-AR")}`;
                  }
                  if (chartMetric.endsWith("usd")) {
                    return `US$${val.toFixed(2)}`;
                  }
                  return Math.round(val).toLocaleString();
                };

                const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
                  if (dailyChartData.length <= 1) return;
                  const svg = e.currentTarget;
                  const rect = svg.getBoundingClientRect();
                  const x = e.clientX - rect.left;
                  
                  const leftPadding = 70;
                  const rightPadding = 40;
                  const chartW = svg.clientWidth - leftPadding - rightPadding;
                  
                  const rawIndex = ((x - leftPadding) / chartW) * (dailyChartData.length - 1);
                  const index = Math.max(0, Math.min(dailyChartData.length - 1, Math.round(rawIndex)));
                  setActiveHoverIndex(index);
                };

                const handleMouseLeave = () => {
                  setActiveHoverIndex(null);
                };

                return (
                  <div className="relative bg-white p-6 border border-slate-200/60 rounded-[2rem] shadow-sm">
                    <svg 
                      viewBox={`0 0 ${chartWidth} ${chartHeight}`} 
                      className="w-full h-auto overflow-visible select-none"
                      onMouseMove={handleMouseMove}
                      onMouseLeave={handleMouseLeave}
                    >
                      <defs>
                        <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={chartMetric === "conversions" ? "#10b981" : chartMetric.startsWith("cpr") ? "#ef4444" : "#3b82f6"} stopOpacity="0.2" />
                          <stop offset="100%" stopColor={chartMetric === "conversions" ? "#10b981" : chartMetric.startsWith("cpr") ? "#ef4444" : "#3b82f6"} stopOpacity="0.0" />
                        </linearGradient>
                      </defs>

                      {/* Grid Lines */}
                      {gridValues.map((gVal, idx) => {
                        const yPos = paddingTop + actualHeight - (gVal / maxVal) * actualHeight;
                        return (
                          <g key={idx} className="opacity-40">
                            <line 
                              x1={paddingLeft} 
                              y1={yPos} 
                              x2={chartWidth - paddingRight} 
                              y2={yPos} 
                              stroke="#cbd5e1" 
                              strokeDasharray="4,4" 
                              strokeWidth={1} 
                            />
                            <text 
                              x={paddingLeft - 10} 
                              y={yPos + 3} 
                              textAnchor="end" 
                              className="text-[9px] fill-slate-400 font-extrabold"
                            >
                              {formatChartVal(gVal)}
                            </text>
                          </g>
                        );
                      })}

                      {/* X Axis Labels */}
                      {svgPoints.map((p, idx) => {
                        const step = Math.ceil(svgPoints.length / 8) || 1;
                        if (idx % step !== 0 && idx !== svgPoints.length - 1) return null;

                        const parts = p.date.split("-");
                        const formattedDate = parts.length === 3 ? `${parts[2]}/${parts[1]}` : p.date;

                        return (
                          <text 
                            key={idx} 
                            x={p.x} 
                            y={paddingTop + actualHeight + 20} 
                            textAnchor="middle" 
                            className="text-[9px] fill-slate-400 font-extrabold"
                          >
                            {formattedDate}
                          </text>
                        );
                      })}

                      {/* Area path */}
                      {svgPoints.length > 0 && (
                        <polygon 
                          points={areaPointsStr} 
                          fill="url(#chartGradient)" 
                        />
                      )}

                      {/* Line path */}
                      {svgPoints.length > 0 && (
                        <polyline 
                          fill="none" 
                          stroke={chartMetric === "conversions" ? "#10b981" : chartMetric.startsWith("cpr") ? "#ef4444" : "#3b82f6"} 
                          strokeWidth={2.5} 
                          points={pointsStr} 
                        />
                      )}

                      {/* Point dots */}
                      {svgPoints.map((p, idx) => {
                        const isHovered = activeHoverIndex === idx;
                        return (
                          <circle 
                            key={idx} 
                            cx={p.x} 
                            cy={p.y} 
                            r={isHovered ? 5.5 : 3} 
                            fill={chartMetric === "conversions" ? "#10b981" : chartMetric.startsWith("cpr") ? "#ef4444" : "#3b82f6"} 
                            stroke="white" 
                            strokeWidth={1.5}
                          />
                        );
                      })}

                      {/* Hover Guide Line */}
                      {activeHoverIndex !== null && svgPoints[activeHoverIndex] && (
                        <line 
                          x1={svgPoints[activeHoverIndex].x} 
                          y1={paddingTop} 
                          x2={svgPoints[activeHoverIndex].x} 
                          y2={paddingTop + actualHeight} 
                          stroke="#94a3b8" 
                          strokeDasharray="2,2" 
                          strokeWidth={1.5} 
                        />
                      )}
                    </svg>

                    {/* Tooltip HTML card */}
                    {activeHoverIndex !== null && svgPoints[activeHoverIndex] && (
                      <div 
                        className="absolute bg-slate-900/95 text-white p-3.5 rounded-2xl shadow-xl z-30 border border-slate-700/50 pointer-events-none text-xs font-bold flex flex-col gap-1 w-52"
                        style={{
                          top: `${Math.max(10, Math.min(chartHeight - 160, svgPoints[activeHoverIndex].y - 80))}px`,
                          left: `${svgPoints[activeHoverIndex].x + 20}px`,
                          transform: svgPoints[activeHoverIndex].x > chartWidth - 240 ? 'translateX(-110%)' : 'none',
                          transition: 'all 0.08s ease-out'
                        }}
                      >
                        <span className="text-[10px] text-slate-400 font-extrabold uppercase border-b border-slate-700/50 pb-1 mb-1 block">
                          {(() => {
                            const parts = svgPoints[activeHoverIndex].date.split("-");
                            return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : svgPoints[activeHoverIndex].date;
                          })()}
                        </span>
                        <div className="flex justify-between">
                          <span className="text-slate-400 font-semibold">Gasto (ARS):</span>
                          <span className="font-extrabold text-blue-400">${Math.round(dailyChartData[activeHoverIndex].spendArs).toLocaleString("es-AR")}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400 font-semibold">Gasto (USD):</span>
                          <span className="font-extrabold text-blue-400">US${dailyChartData[activeHoverIndex].spendUsd.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400 font-semibold">Resultados:</span>
                          <span className="font-extrabold text-emerald-400">{dailyChartData[activeHoverIndex].conversions}</span>
                        </div>
                        <div className="flex justify-between border-t border-slate-700/50 mt-1 pt-1">
                          <span className="text-slate-400 font-semibold">CPR (ARS):</span>
                          <span className="font-extrabold text-rose-400">
                            ${(dailyChartData[activeHoverIndex].conversions > 0 
                              ? dailyChartData[activeHoverIndex].spendArs / dailyChartData[activeHoverIndex].conversions 
                              : 0).toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400 font-semibold">CPR (USD):</span>
                          <span className="font-extrabold text-rose-400">
                            US${(dailyChartData[activeHoverIndex].conversions > 0 
                              ? dailyChartData[activeHoverIndex].spendUsd / dailyChartData[activeHoverIndex].conversions 
                              : 0).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })() : (
                <div className="h-60 border border-dashed border-slate-200 rounded-3xl flex flex-col items-center justify-center text-slate-400 font-bold">
                  <TrendingUp className="w-8 h-8 text-slate-300 mb-2" />
                  <span>No hay datos históricos para graficar en este periodo</span>
                </div>
              )}

              {/* Daily progress table list */}
              <div className="overflow-x-auto border border-slate-200/60 rounded-3xl bg-white">
                <table className="w-full text-left border-collapse table-auto text-xs min-w-[800px]">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-black uppercase text-slate-400 tracking-wider">
                      <th className="px-5 py-3 w-28">Fecha</th>
                      <th className="px-4 py-3 min-w-[200px]">Detalle del Anuncio</th>
                      <th className="px-4 py-3">Oferta Comercial</th>
                      <th className="px-4 py-3">Línea</th>
                      <th className="px-4 py-3 text-center w-24">Conversiones</th>
                      <th className="px-4 py-3 text-center w-32">CPR (USD/ARS)</th>
                      <th className="px-4 py-3 text-center w-20">CTR</th>
                      <th className="px-4 py-3 text-right w-32">Gasto (USD/ARS)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                    {chartRows.slice().sort((a, b) => (b.date_start || "").localeCompare(a.date_start || "")).map((row, idx) => {
                      const conv = getActionValue(row, actionType);
                      const rowRate = useHistoricalRates && row.rate ? row.rate : exchangeRate;
                      const cprU = conv > 0 ? row.spend / conv : 0;
                      const cprA = conv > 0 ? (row.spend * rowRate) / conv : 0;
                      const spendA = row.spend * rowRate;
                      const dateFormatted = (() => {
                        const parts = (row.date_start || "").split("-");
                        return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : row.date_start;
                      })();

                      return (
                        <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-5 py-3.5 font-bold text-slate-900">
                            {dateFormatted}
                          </td>
                          <td className="px-4 py-3.5 font-bold text-slate-950 truncate max-w-[240px]" title={row.campaign_name}>
                            {row.campaign_name}
                          </td>
                          <td className="px-4 py-3.5 text-slate-500 font-semibold">{row.oferta || "-"}</td>
                          <td className="px-4 py-3.5 text-slate-500 font-semibold">{row.linea || "-"}</td>
                          <td className="px-4 py-3.5 text-center font-extrabold text-slate-900">{conv.toLocaleString()}</td>
                          <td className="px-4 py-3.5 text-center">
                            <div className="flex flex-col">
                              <span className="font-extrabold text-slate-900">${cprA.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                              <span className="text-[10px] text-slate-400 font-bold">US${cprU.toFixed(2)}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3.5 text-center font-bold text-slate-800">{(row.ctr * 100).toFixed(2)}%</td>
                          <td className="px-4 py-3.5 text-right">
                            <div className="flex flex-col items-end">
                              <span className="font-extrabold text-slate-900">${spendA.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                              <span className="text-[10px] text-slate-400 font-bold">US${row.spend.toFixed(2)}</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {chartRows.length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-5 py-8 text-center text-slate-400 font-bold">
                          No hay datos para mostrar en este periodo.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === "roas" && (
            <div className="space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
                <div className="bg-white p-5 rounded-[2rem] border border-slate-100 shadow-sm space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Total Invertido Ads</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-xl font-black text-slate-800">${Math.round(roasData.totals.spendArs).toLocaleString("es-AR")}</span>
                    <span className="text-xs text-slate-400 font-bold">USD {Math.round(roasData.totals.spendUsd).toLocaleString("en-US")}</span>
                  </div>
                </div>
                
                <div className="bg-white p-5 rounded-[2rem] border border-slate-100 shadow-sm space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Facturación Total (Ventas)</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-xl font-black text-emerald-600">${Math.round(roasData.totals.revenue).toLocaleString("es-AR")}</span>
                  </div>
                </div>

                <div className="bg-white p-5 rounded-[2rem] border border-slate-100 shadow-sm space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">ROAS Promedio</span>
                  <div className="flex items-baseline gap-2">
                    <span className={`text-xl font-black ${roasData.totals.roas >= 4.0 ? "text-emerald-600" : roasData.totals.roas >= 1.5 ? "text-amber-500" : "text-red-500"}`}>
                      {roasData.totals.roas.toFixed(2)}x
                    </span>
                    <span className="text-xs text-slate-400 font-bold">({roasData.totals.roasPercent.toFixed(0)}%)</span>
                  </div>
                </div>

                <div className="bg-white p-5 rounded-[2rem] border border-slate-100 shadow-sm space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Costo Ads % / Pedidos</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-xl font-black text-slate-800">{roasData.totals.costAdsPercent.toFixed(1)}%</span>
                    <span className="text-xs text-slate-400 font-bold">({roasData.totals.orderCount} ped.)</span>
                  </div>
                </div>
              </div>

              {/* Table */}
              <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden">
                <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-black text-slate-800 uppercase tracking-wide">Desglose de ROAS por Categoría</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">Cruce de Gasto publicitario y Pedidos aprobados (excluye Cancelados)</p>
                  </div>
                  {loadingOrders && (
                    <div className="flex items-center gap-1.5 text-xs text-slate-400 font-bold">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />
                      Cargando pedidos...
                    </div>
                  )}
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse table-auto text-xs min-w-[900px]">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-black uppercase text-slate-400 tracking-wider">
                        <th className="px-6 py-3.5">Categoría</th>
                        <th className="px-4 py-3.5 text-right">Inversión Ads</th>
                        <th className="px-4 py-3.5 text-center">Pedidos</th>
                        <th className="px-4 py-3.5 text-right">CPA</th>
                        <th className="px-4 py-3.5 text-right">Facturación</th>
                        <th className="px-4 py-3.5 text-center">ROAS</th>
                        <th className="px-4 py-3.5 text-center">Costo Ads %</th>
                        <th className="px-6 py-3.5">Recomendación e Insights</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-bold text-slate-700">
                      {roasData.rows.map((row) => (
                        <tr key={row.category} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-4 font-black text-slate-900">{row.category}</td>
                          <td className="px-4 py-4 text-right">
                            <div>${Math.round(row.spendArs).toLocaleString("es-AR")}</div>
                            <div className="text-[10px] text-slate-400 font-semibold">USD {Math.round(row.spendUsd).toLocaleString("en-US")}</div>
                          </td>
                          <td className="px-4 py-4 text-center text-slate-800">{row.orderCount}</td>
                          <td className="px-4 py-4 text-right text-slate-600">
                            {row.orderCount > 0 ? `$${Math.round(row.cpa).toLocaleString("es-AR")}` : "-"}
                          </td>
                          <td className="px-4 py-4 text-right text-emerald-600 font-black">
                            ${Math.round(row.revenue).toLocaleString("es-AR")}
                          </td>
                          <td className="px-4 py-4 text-center">
                            {row.spendArs > 0 ? (
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-lg border text-[10px] font-extrabold ${
                                row.roas >= 4.0 
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-100" 
                                  : row.roas >= 1.5 
                                    ? "bg-amber-50 text-amber-700 border-amber-100" 
                                    : "bg-red-50 text-red-700 border-red-100"
                              }`}>
                                {row.roas.toFixed(2)}x
                              </span>
                            ) : (
                              <span className="text-slate-400 font-semibold">-</span>
                            )}
                          </td>
                          <td className="px-4 py-4 text-center text-slate-800">
                            {row.revenue > 0 ? `${row.costAdsPercent.toFixed(1)}%` : "-"}
                          </td>
                          <td className="px-6 py-4">
                            <span className={`inline-block px-3 py-1.5 rounded-xl border text-[10px] font-bold ${row.recColor}`}>
                              {row.recommendation}
                            </span>
                          </td>
                        </tr>
                      ))}
                      
                      {/* Totals Row */}
                      <tr className="bg-slate-50 font-black text-slate-900 border-t border-slate-200">
                        <td className="px-6 py-4 uppercase tracking-wider text-[10px]">Total General</td>
                        <td className="px-4 py-4 text-right">
                          <div>${Math.round(roasData.totals.spendArs).toLocaleString("es-AR")}</div>
                          <div className="text-[10px] text-slate-400 font-extrabold">USD {Math.round(roasData.totals.spendUsd).toLocaleString("en-US")}</div>
                        </td>
                        <td className="px-4 py-4 text-center">{roasData.totals.orderCount}</td>
                        <td className="px-4 py-4 text-right">
                          {roasData.totals.orderCount > 0 ? `$${Math.round(roasData.totals.cpa).toLocaleString("es-AR")}` : "-"}
                        </td>
                        <td className="px-4 py-4 text-right text-emerald-600 font-extrabold">
                          ${Math.round(roasData.totals.revenue).toLocaleString("es-AR")}
                        </td>
                        <td className="px-4 py-4 text-center">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-lg border text-[10px] font-extrabold ${
                            roasData.totals.roas >= 4.0 
                              ? "bg-emerald-50 text-emerald-700 border-emerald-100" 
                              : roasData.totals.roas >= 1.5 
                                ? "bg-amber-50 text-amber-700 border-amber-100" 
                                : "bg-red-50 text-red-700 border-red-100"
                          }`}>
                            {roasData.totals.roas.toFixed(2)}x
                          </span>
                        </td>
                        <td className="px-4 py-4 text-center">
                          {roasData.totals.costAdsPercent.toFixed(1)}%
                        </td>
                        <td className="px-6 py-4 text-slate-400 font-semibold">-</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Footer information bar */}
          <div className="p-5 border-t border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row justify-between items-center text-[10px] font-black text-slate-400 uppercase tracking-widest gap-2">
            <span>
              Mostrando {processedRows.length} de {rawData.length} registros cargados
            </span>
            <span className="flex items-center gap-1.5">
              <UserCheck className="w-3.5 h-3.5 text-slate-400" />
              Sincronizado vía Meta Graph API v19.0
            </span>
          </div>

        </div>
      )}

      {/* Empty State visual block */}
      {rawData.length === 0 && !loadingData && (
        <div className="bg-white p-12 sm:p-20 rounded-[2.5rem] border border-slate-100 shadow-xl text-center space-y-6 max-w-xl mx-auto mt-6">
          <div className="w-20 h-20 bg-blue-50 text-blue-500 rounded-[2rem] flex items-center justify-center mx-auto animate-bounce-slow">
            <Megaphone className="w-10 h-10" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-black text-slate-800 tracking-tighter">Sin datos cargados</h2>
            <p className="text-slate-400 text-sm font-medium leading-relaxed max-w-sm mx-auto">
              Configura tu Token de acceso de Meta Ads, selecciona tus cuentas comerciales de anuncios y presiona <strong>Consultar Meta Ads</strong> para descargar reportes en tiempo real.
            </p>
          </div>
          <Button
            variant="primary"
            onClick={handleFetchData}
            className="w-full py-6 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold rounded-2xl max-w-xs mx-auto"
          >
            Comenzar Consulta
          </Button>
        </div>
      )}

    </div>
  );
}

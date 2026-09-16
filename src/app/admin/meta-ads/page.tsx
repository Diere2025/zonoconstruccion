"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { 
  Megaphone, 
  RefreshCw, 
  TrendingUp, 
  DollarSign, 
  MessageSquare, 
  Target, 
  BarChart3, 
  Calendar, 
  Search, 
  Filter, 
  Layers, 
  PhoneCall, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  ArrowUpRight, 
  Activity, 
  PieChart, 
  Sparkles,
  ExternalLink,
  Loader2,
  LineChart,
  SlidersHorizontal,
  ArrowDownRight,
  Zap,
  Award,
  Clock,
  Gauge,
  Calculator,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ShieldAlert,
  BellRing,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Eye,
  X,
  Image as ImageIcon,
  Info
} from "lucide-react";
import { formatPrice } from "@/lib/utils";

import MetaReview from '@/components/admin/MetaReview';
import { diagnose, readHistoryResponse, readLiveResponse, type Periods } from '@/lib/meta-ads-review';

interface LiveAd {
  periods?: Periods;
  id: string;
  name: string;
  status: string;
  effectiveStatus: string;
  adsetId?: string;
  adsetName?: string;
  thumbnailUrl?: string | null;
  imageUrl?: string | null;
  title?: string | null;
  body?: string | null;
  spendUsd: number;
  spendArs: number;
  messages: number;
  costPerActionUsd: number;
  cprArs: number;
  frequency: number;
  impressions: number;
  ctr?: number;
  cpm?: number;
  alerts: string[];
}

interface LiveCampaign {
  periods?: Periods;
  status: string;
  accountName: string;
  campaignName: string;
  campaignId: string;
  messages: number;
  costPerActionUsd: number;
  spendUsd: number;
  dailyBudgetUsd: number;
  commercialOffer: string;
  product: string;
  phoneLine: string;
  spendArs: number;
  cprArs: number;
  budgetArs: number;
  ctr: string;
  cpm: string;
  frequency: number;
  budgetConsumedPercent: number;
  ads?: LiveAd[];
}

interface SmartRuleAlert {
  id: string;
  type: 'danger' | 'warning' | 'success';
  category: 'high_cpr' | 'high_frequency' | 'zero_leads' | 'scale_opportunity';
  campaignId: string;
  campaignName: string;
  commercialOffer: string;
  phoneLine: string;
  badgeText: string;
  title: string;
  metricLabel: string;
  metricValue: string;
  threshold: string;
  description: string;
  actionText: string;
}

interface HistoryRecord {
  date: string;
  dateObj: string;
  isoDate: string;
  account: string;
  campaign: string;
  category: string;
  phoneLine: string;
  messages: number;
  comments: number;
  reactions: number;
  ctr: string;
  cprUsd: number;
  spendUsd: number;
  reach: number;
  impressions: number;
  frequency: number;
  cpm: string;
  feePercent: string;
  exchangeRate: number;
  spendArs: number;
  feeArs: number;
  totalInvestmentArs: number;
  cprArs: number;
}

interface DailyTimelineItem {
  isoDate: string;
  dateStr: string;
  totalInvestmentArs: number;
  spendUsd: number;
  messages: number;
  cprArs: number;
  impressions: number;
  reach: number;
  erpRevenue: number;
  erpOrdersCount: number;
  roas: number;
  categories: Record<string, { totalInvestmentArs: number; messages: number }>;
}

interface CategorySummaryItem {
  name: string;
  totalInvestment: number;
  messages: number;
  spendUsd: number;
  cprArs: number;
}

function DateInput({
  value,
  onChange,
  className
}: {
  value: string;
  onChange: (val: string) => void;
  className?: string;
}) {
  const [typedValue, setTypedValue] = useState("");
  const nativePickerRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (value) {
      const parts = value.split("-");
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
    input = input.replace(/[^0-9/]/g, "");

    if (input.length === 2 && !input.includes("/")) {
      input += "/";
    } else if (input.length === 5 && input.split("/").length === 2) {
      input += "/";
    }

    if (input.length > 10) {
      input = input.substring(0, 10);
    }

    setTypedValue(input);

    const parts = input.split("/");
    if (parts.length === 3 && parts[0].length === 2 && parts[1].length === 2 && parts[2].length === 4) {
      const yyyy = parts[2];
      const mm = parts[1];
      const dd = parts[0];
      onChange(`${yyyy}-${mm}-${dd}`);
    }
  };

  const handleBlur = () => {
    const parts = typedValue.split("/");
    if (parts.length !== 3 || parts[0].length !== 2 || parts[1].length !== 2 || parts[2].length !== 4) {
      if (value) {
        const vParts = value.split("-");
        setTypedValue(`${vParts[2]}/${vParts[1]}/${vParts[0]}`);
      } else {
        setTypedValue("");
      }
    }
  };

  return (
    <div className="relative flex items-center">
      <input
        type="text"
        placeholder="DD/MM/AAAA"
        value={typedValue}
        onChange={handleTextChange}
        onBlur={handleBlur}
        className={`w-32 py-1.5 pl-3 pr-8 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 text-center focus:outline-none focus:ring-2 focus:ring-indigo-500 ${className || ''}`}
      />
      <button
        type="button"
        onClick={() => nativePickerRef.current?.showPicker?.()}
        className="absolute right-2 text-slate-400 hover:text-slate-600 cursor-pointer"
        tabIndex={-1}
      >
        <Calendar className="w-3.5 h-3.5" />
      </button>
      <input
        type="date"
        ref={nativePickerRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="sr-only"
        tabIndex={-1}
      />
    </div>
  );
}

export default function MetaAdsPage() {
  const [activeTab, setActiveTab] = useState<'live' | 'charts' | 'history'>('live');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>("");

  // Live Data State
  const [liveSummary, setLiveSummary] = useState<any>(null);
  const [rawLiveCampaigns, setLiveCampaigns] = useState<LiveCampaign[]>([]);
  const [liveSearchQuery, setLiveSearchQuery] = useState("");
  const [liveLineFilter, setLiveLineFilter] = useState("all");
  const [liveStatusFilter, setLiveStatusFilter] = useState<string>("all");
  const [liveSortField, setLiveSortField] = useState<'cpr' | 'spend' | 'messages' | 'budget' | 'consumption'>('cpr');
  const [liveSortOrder, setLiveSortOrder] = useState<'asc' | 'desc'>('desc');
  const [liveAlertFilter, setLiveAlertFilter] = useState<'all' | 'with_alerts'>('all');
  const [showAlertCards, setShowAlertCards] = useState<boolean>(true);

  // Live Meta Direct API & Ad Breakdown State
  const [liveIsCached, setLiveIsCached] = useState<boolean>(false);
  const [liveCacheAge, setLiveCacheAge] = useState<number>(0);
  const [expandedCampaigns, setExpandedCampaigns] = useState<Set<string>>(new Set());
  const [reviewDetailsOpen, setReviewDetailsOpen] = useState(false);
  const [previewAd, setPreviewAd] = useState<LiveAd | null>(null);

  const [liveData, setLiveData] = useState<any>(null);
  const [targets, setTargets] = useState<Record<string, number>>({});
  const [clock, setClock] = useState(Date.now());
  useEffect(() => {
    try { const saved=JSON.parse(localStorage.getItem('meta-ads-targets')||'{}'); if(saved && typeof saved==='object') setTargets(Object.fromEntries(Object.entries(saved).filter(([,v])=>typeof v==='number'&&Number.isFinite(v)&&v>0)) as Record<string,number>); } catch {}
    const timer=setInterval(()=>setClock(Date.now()),30000); return ()=>clearInterval(timer);
  }, []);
  const setTarget=(key:string,value:number)=>setTargets(prev=>{const next={...prev,[key]:value};try{localStorage.setItem('meta-ads-targets',JSON.stringify(next));}catch{}return next;});
  const liveFresh = !!liveData?.updatedAt && liveData.source==='meta_api_direct' && !liveData.stale && !liveData.apiError && !liveData.error && clock-Date.parse(liveData.updatedAt)<180000;
  const liveCampaigns = useMemo(()=>rawLiveCampaigns.map(c=>({...c,ads:c.ads?.map(a=>({...a,alerts:a.periods?[diagnose(a.periods,targets[c.commercialOffer]||3.5,a.effectiveStatus==='ACTIVE',liveFresh).label]:['Datos insuficientes']}))})),[rawLiveCampaigns,targets,liveFresh]);

  useEffect(() => {
    setPreviewAd(previous => previous ? liveCampaigns.flatMap(c => c.ads || []).find(a => a.id === previous.id) || null : null);
  }, [liveCampaigns]);

  const toggleCampaignExpand = (campId: string) => {
    setExpandedCampaigns(prev => {
      const next = new Set(prev);
      if (next.has(campId)) {
        next.delete(campId);
      } else {
        next.add(campId);
      }
      return next;
    });
  };

  const expandAllCampaigns = () => {
    setExpandedCampaigns(new Set(liveCampaigns.map(c => c.campaignId)));
    setReviewDetailsOpen(true);
  };

  const collapseAllCampaigns = () => {
    setExpandedCampaigns(new Set());
    setReviewDetailsOpen(false);
  };

  // Live Pacing & Forecasting State
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  const [simulatedBudgetInput, setSimulatedBudgetInput] = useState<string>("");
  const [isSimulatingBudget, setIsSimulatingBudget] = useState<boolean>(false);

  // Auto-refresh clock every 30s to keep pacing exact
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // Real-time Pacing & Forecasting Engine
  const livePacingMetrics = useMemo(() => {
    if (!liveSummary) return null;

    const totalMessages = liveSummary.totalMessages || 0;
    const totalSpendArs = liveSummary.totalSpendArs || 0;
    const realBudgetArs = liveSummary.totalBudgetArs || 0;

    // Check if custom simulation budget is active
    const parsedSimulatedBudget = parseFloat(simulatedBudgetInput.replace(/[^0-9]/g, ''));
    const activeBudgetArs = (isSimulatingBudget && !isNaN(parsedSimulatedBudget) && parsedSimulatedBudget > 0)
      ? parsedSimulatedBudget 
      : realBudgetArs;

    const avgCprArs = liveSummary.avgCprArs || (totalMessages > 0 ? totalSpendArs / totalMessages : 0);

    // Get time in Argentina timezone
    let currentHour = currentTime.getHours();
    let currentMinute = currentTime.getMinutes();
    let currentSecond = currentTime.getSeconds();

    try {
      const formatter = new Intl.DateTimeFormat('es-AR', {
        timeZone: 'America/Argentina/Buenos_Aires',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
        hour12: false
      });
      const parts = formatter.formatToParts(currentTime);
      const h = parts.find(p => p.type === 'hour')?.value;
      const m = parts.find(p => p.type === 'minute')?.value;
      const s = parts.find(p => p.type === 'second')?.value;
      if (h) currentHour = parseInt(h, 10);
      if (m) currentMinute = parseInt(m, 10);
      if (s) currentSecond = parseInt(s, 10);
    } catch (e) {
      // fallback to local time
    }

    const elapsedHours = currentHour + (currentMinute / 60) + (currentSecond / 3600);
    // Clamp fraction to at least 1 hour (0.0416) and max 1.0
    const elapsedDayFraction = Math.max(0.0416, Math.min(1, elapsedHours / 24));
    const elapsedDayPercent = Math.round(elapsedDayFraction * 100);

    // 1. Budget ideal/ficticio a la hora actual (Expected spend up to current hour)
    const expectedSpendToNow = activeBudgetArs * elapsedDayFraction;

    // 2. Velocidad de Pacing (Pacing Speed)
    // Example: 100k budget, 50k spent at 12:00 (50% day) -> 50k / 50k = 1.00x
    // Example: 100k budget, 100k spent at 12:00 (50% day) -> 100k / 50k = 2.00x
    const pacingSpeed = expectedSpendToNow > 0 ? (totalSpendArs / expectedSpendToNow) : 1;

    // 3. Proyección al final del día por Ritmo Horario Real (Pacing):
    const projectedSpendByPace = totalSpendArs / elapsedDayFraction;
    const projectedMessagesByPace = Math.round(totalMessages / elapsedDayFraction);

    // 4. Proyección al final del día según Presupuesto Total Asignado (Meta 100%):
    const projectedMessagesByBudget = avgCprArs > 0 ? Math.round(activeBudgetArs / avgCprArs) : 0;
    const projectedSpendByBudget = activeBudgetArs;

    // 5. Diferencia entre gasto real y esperado a esta hora:
    const spendDiff = totalSpendArs - expectedSpendToNow;

    // 6. Estado y etiqueta de velocidad:
    let speedBadge = {
      label: 'Velocidad Normal (x1)',
      shortLabel: 'En Ritmo',
      color: 'text-emerald-700',
      bg: 'bg-emerald-50',
      border: 'border-emerald-200',
      badgeColor: 'bg-emerald-500',
      icon: '✅',
      description: 'La cuenta consume el presupuesto en proporción equilibrada con las horas del día.'
    };

    if (pacingSpeed >= 1.40) {
      speedBadge = {
        label: 'Muy Acelerado (x2+)',
        shortLabel: 'Muy Rápido',
        color: 'text-rose-700',
        bg: 'bg-rose-50',
        border: 'border-rose-200',
        badgeColor: 'bg-rose-500',
        icon: '🔥',
        description: 'La inversión va a más del 140% de lo programado. Si continúa así, se consumirá antes del final del día.'
      };
    } else if (pacingSpeed >= 1.15) {
      speedBadge = {
        label: 'Acelerado',
        shortLabel: 'Rápido',
        color: 'text-amber-700',
        bg: 'bg-amber-50',
        border: 'border-amber-200',
        badgeColor: 'bg-amber-500',
        icon: '⚡',
        description: 'La inversión va más rápido de lo esperado para este horario.'
      };
    } else if (pacingSpeed >= 0.85) {
      speedBadge = {
        label: 'Ritmo Óptimo (x1)',
        shortLabel: 'En Ritmo',
        color: 'text-emerald-700',
        bg: 'bg-emerald-50',
        border: 'border-emerald-200',
        badgeColor: 'bg-emerald-500',
        icon: '✅',
        description: 'La cuenta consume el presupuesto de forma proporcional a las horas transcurridas.'
      };
    } else if (pacingSpeed >= 0.60) {
      speedBadge = {
        label: 'Ritmo Lento',
        shortLabel: 'Lento',
        color: 'text-blue-700',
        bg: 'bg-blue-50',
        border: 'border-blue-200',
        badgeColor: 'bg-blue-500',
        icon: '❄️',
        description: 'La cuenta está gastando más lento de lo programado. Al ritmo actual no llegará a agotar el presupuesto.'
      };
    } else {
      speedBadge = {
        label: 'Muy Lento / Frena',
        shortLabel: 'Muy Lento',
        color: 'text-indigo-700',
        bg: 'bg-indigo-50',
        border: 'border-indigo-200',
        badgeColor: 'bg-indigo-500',
        icon: '⏳',
        description: 'El gasto está significativamente rezagado respecto a las horas del día.'
      };
    }

    const timeFormatted = `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')} hs`;

    return {
      activeBudgetArs,
      isSimulating: isSimulatingBudget && activeBudgetArs !== realBudgetArs,
      realBudgetArs,
      elapsedHours,
      elapsedDayFraction,
      elapsedDayPercent,
      timeFormatted,
      expectedSpendToNow,
      pacingSpeed,
      projectedSpendByPace,
      projectedMessagesByPace,
      projectedMessagesByBudget,
      projectedSpendByBudget,
      spendDiff,
      speedBadge
    };
  }, [liveSummary, currentTime, simulatedBudgetInput, isSimulatingBudget]);

  // History & Charts Data State - Synchronously initialized to current month
  const [presetPeriod, setPresetPeriod] = useState<string>("this_month");
  const [dateFrom, setDateFrom] = useState<string>(() => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    return `${yyyy}-${mm}-01`;
  });
  const [dateTo, setDateTo] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [historySummary, setHistorySummary] = useState<any>(null);
  const [historyRecords, setHistoryRecords] = useState<HistoryRecord[]>([]);
  const [dailyTimeline, setDailyTimeline] = useState<DailyTimelineItem[]>([]);
  const [categoriesSummary, setCategoriesSummary] = useState<CategorySummaryItem[]>([]);
  const [historySearchQuery, setHistorySearchQuery] = useState("");
  const [historyCategoryFilter, setHistoryCategoryFilter] = useState("all");

  // Chart Interactive Metric Selector
  const [chartMetric, setChartMetric] = useState<'messages' | 'investment' | 'cpr' | 'revenue' | 'roas'>('messages');
  const [hoveredDay, setHoveredDay] = useState<DailyTimelineItem | null>(null);

  // Fetch History Data with explicit parameters
  const loadHistoryData = useCallback(async (from?: string, to?: string) => {
    try {
      const activeFrom = from !== undefined ? from : dateFrom;
      const activeTo = to !== undefined ? to : dateTo;

      let url = '/api/admin/meta-ads-sheet?tab=history';
      if (activeFrom) url += `&dateFrom=${activeFrom}`;
      if (activeTo) url += `&dateTo=${activeTo}`;

      const res = await fetch(url);
      const data = await readHistoryResponse(res);
      setHistorySummary(data.summary || null);
      setHistoryRecords(data.records || []);
      setDailyTimeline(data.dailyTimeline || []);
      setCategoriesSummary(data.categories || []);
    } catch (err: any) {
      console.warn('Histórico de Meta Ads no disponible:', err.message);
    }
  }, [dateFrom, dateTo]);

  // Helper date preset updater
  const handlePresetChange = (preset: string) => {
    setPresetPeriod(preset);
    const today = new Date();
    const endStr = today.toISOString().split('T')[0];

    let start = '';
    let end = endStr;

    if (preset === 'today') {
      start = endStr;
      end = endStr;
    } else if (preset === '7d') {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      start = d.toISOString().split('T')[0];
    } else if (preset === '30d') {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      start = d.toISOString().split('T')[0];
    } else if (preset === 'this_month') {
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      start = `${yyyy}-${mm}-01`;
    } else if (preset === 'last_month') {
      const d1 = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const d2 = new Date(today.getFullYear(), today.getMonth(), 0);
      const yyyy = d1.getFullYear();
      const mm = String(d1.getMonth() + 1).padStart(2, '0');
      const lastDay = String(d2.getDate()).padStart(2, '0');
      start = `${yyyy}-${mm}-01`;
      end = `${yyyy}-${mm}-${lastDay}`;
    }

    setDateFrom(start);
    setDateTo(end);
    loadHistoryData(start, end);
  };

  // Fetch Live Data (Meta API Directa con Cache & Fallback)
  const loadLiveData = async (force = false) => {
    try {
      const url = force ? '/api/admin/meta-ads-live?force=true' : '/api/admin/meta-ads-live';
      const res = await fetch(url);
      const data = await readLiveResponse(res);
      setLiveData(data);
      setClock(Date.now());
      setLiveSummary(data.summary || null);
      setLiveCampaigns(data.campaigns || []);
      setLiveIsCached(!!data.isCached);
      setLiveCacheAge(data.cacheAgeSeconds || 0);
      setLastUpdated(data.updatedAt ? new Date(data.updatedAt).toLocaleString('es-AR') : 'No disponible');
    } catch (err: any) {
      setLiveData((prev:any)=>({...prev, stale:true, error:err.message}));
      setLiveIsCached(false);
      console.warn('Meta API no disponible; se muestra el estado de conexión:', err.message);
      try {
        const fallbackRes = await fetch('/api/admin/meta-ads-sheet?tab=live');
        if (fallbackRes.ok) {
          const fbData = await fallbackRes.json();
          setLiveData({source:'sheet',stale:true,error:err.message+' La fecha original de la planilla no está verificada.'});
          setLiveSummary(fbData.summary || null);
          setLiveCampaigns(fbData.campaigns || []);
          setLiveIsCached(false);
          setLiveCacheAge(0);
        }
      } catch (fbErr) {
        console.warn('Planilla de respaldo no disponible');
      }
    }
  };

  // Initial load
  useEffect(() => {
    const loadAll = async () => {
      setLoading(true);
      await Promise.all([loadLiveData(), loadHistoryData(dateFrom, dateTo)]);
      setLoading(false);
    };
    loadAll();
  }, [loadHistoryData, dateFrom, dateTo]);

  const handleRefresh = async () => {
    setRefreshing(true);
    if (activeTab === 'live') {
      await loadLiveData(true);
    } else {
      await loadHistoryData(dateFrom, dateTo);
    }
    setRefreshing(false);
  };

  // One diagnosis engine drives cards, campaign rows and ad rows.
  const smartRuleAlerts = useMemo(() => liveCampaigns.flatMap(c => {
    if(!c.periods || !liveFresh) return [];
    const entries=[{id:c.campaignId,name:c.campaignName,p:c.periods,active:c.status==='ACTIVE'},...(c.ads||[]).filter(a=>a.periods).map(a=>({id:a.id,name:a.name,p:a.periods!,active:a.effectiveStatus==='ACTIVE'}))];
    return entries.flatMap(e=>{const d=diagnose(e.p,targets[c.commercialOffer]||3.5,e.active,liveFresh);if(d.severity==='neutral')return [];
      return [{id:e.id,type:d.severity,category:'high_cpr' as const,campaignId:c.campaignId,campaignName:c.campaignName,commercialOffer:e.name,phoneLine:c.phoneLine,badgeText:d.label,title:d.label,metricLabel:d.evidence,metricValue:e.p.today.messages+' conversaciones',threshold:'Objetivo US$ '+(targets[c.commercialOffer]||3.5).toFixed(2),description:d.reason,actionText:d.action,score:d.score}];
    });
  }).sort((a,b)=>b.score-a.score),[liveCampaigns,liveFresh,targets]);

  // Map campaign ID to its alerts
  const campaignAlertsMap = useMemo(() => {
    const map: Record<string, SmartRuleAlert[]> = {};
    smartRuleAlerts.forEach(a => {
      if (!map[a.campaignId]) map[a.campaignId] = [];
      map[a.campaignId].push(a);
    });
    return map;
  }, [smartRuleAlerts]);

  const dangerAlertsCount = useMemo(() => smartRuleAlerts.filter(a => a.type === 'danger').length, [smartRuleAlerts]);
  const warningAlertsCount = useMemo(() => smartRuleAlerts.filter(a => a.type === 'warning').length, [smartRuleAlerts]);
  const successAlertsCount = useMemo(() => smartRuleAlerts.filter(a => a.type === 'success').length, [smartRuleAlerts]);
  const campaignsWithAlertsCount = useMemo(() => Object.keys(campaignAlertsMap).length, [campaignAlertsMap]);

  // Filtered & Sorted Live Campaigns
  const filteredLiveCampaigns = useMemo(() => {
    const list = liveCampaigns.filter(c => {
      const matchesSearch = !liveSearchQuery || 
        c.campaignName.toLowerCase().includes(liveSearchQuery.toLowerCase()) ||
        c.commercialOffer.toLowerCase().includes(liveSearchQuery.toLowerCase()) ||
        c.product.toLowerCase().includes(liveSearchQuery.toLowerCase());

      const matchesLine = liveLineFilter === 'all' || c.phoneLine === liveLineFilter;

      const isActiva = c.status.toUpperCase() === 'ACTIVE' || c.status.toUpperCase() === 'ACTIVA' || c.status.toUpperCase() === 'ON';
      const isPausada = c.status.toUpperCase() === 'PAUSED' || c.status.toUpperCase() === 'PAUSADA' || c.status.toUpperCase() === 'OFF';

      const matchesStatus = liveStatusFilter === 'all' || 
        (liveStatusFilter === 'active' && isActiva) ||
        (liveStatusFilter === 'paused' && isPausada);

      const hasAlert = (campaignAlertsMap[c.campaignId] || []).length > 0;
      const matchesAlert = liveAlertFilter === 'all' || (liveAlertFilter === 'with_alerts' && hasAlert);

      return matchesSearch && matchesLine && matchesStatus && matchesAlert;
    });

    return [...list].sort((a, b) => {
      let comparison = 0;
      if (liveSortField === 'cpr') {
        // Campañas con CPR 0 (sin mensajes o sin gasto) al final
        if (a.cprArs === 0 && b.cprArs > 0) return 1;
        if (b.cprArs === 0 && a.cprArs > 0) return -1;
        comparison = (b.cprArs || 0) - (a.cprArs || 0); // De más caro a más barato
      } else if (liveSortField === 'spend') {
        comparison = (b.spendArs || 0) - (a.spendArs || 0);
      } else if (liveSortField === 'messages') {
        comparison = (b.messages || 0) - (a.messages || 0);
      } else if (liveSortField === 'budget') {
        comparison = (b.budgetArs || 0) - (a.budgetArs || 0);
      } else if (liveSortField === 'consumption') {
        comparison = (b.budgetConsumedPercent || 0) - (a.budgetConsumedPercent || 0);
      }

      return liveSortOrder === 'desc' ? comparison : -comparison;
    });
  }, [liveCampaigns, liveSearchQuery, liveLineFilter, liveStatusFilter, liveSortField, liveSortOrder]);

  const handleLiveSort = (field: 'cpr' | 'spend' | 'messages' | 'budget' | 'consumption') => {
    if (liveSortField === field) {
      setLiveSortOrder(prev => prev === 'desc' ? 'asc' : 'desc');
    } else {
      setLiveSortField(field);
      setLiveSortOrder('desc');
    }
  };

  // Filtered History Records
  const filteredHistoryRecords = useMemo(() => {
    return historyRecords.filter(r => {
      const matchesSearch = !historySearchQuery || 
        r.campaign.toLowerCase().includes(historySearchQuery.toLowerCase()) ||
        r.account.toLowerCase().includes(historySearchQuery.toLowerCase());

      const matchesCat = historyCategoryFilter === 'all' || r.category === historyCategoryFilter;

      return matchesSearch && matchesCat;
    });
  }, [historyRecords, historySearchQuery, historyCategoryFilter]);

  // Filtered Daily Timeline according to Category filter
  const filteredTimeline = useMemo(() => {
    if (historyCategoryFilter === 'all') return dailyTimeline;

    return dailyTimeline.map(d => {
      const catData = d.categories[historyCategoryFilter] || { totalInvestmentArs: 0, messages: 0 };
      const cpr = catData.messages > 0 ? Math.round(catData.totalInvestmentArs / catData.messages) : 0;

      return {
        ...d,
        totalInvestmentArs: catData.totalInvestmentArs,
        messages: catData.messages,
        cprArs: cpr
      };
    });
  }, [dailyTimeline, historyCategoryFilter]);

  // Chart max value for scaling
  const chartMaxVal = useMemo(() => {
    if (filteredTimeline.length === 0) return 100;
    const values = filteredTimeline.map(d => {
      if (chartMetric === 'messages') return d.messages;
      if (chartMetric === 'investment') return d.totalInvestmentArs;
      if (chartMetric === 'cpr') return d.cprArs;
      if (chartMetric === 'revenue') return d.erpRevenue;
      if (chartMetric === 'roas') return d.roas;
      return 0;
    });
    const max = Math.max(...values);
    return max > 0 ? max : 100;
  }, [filteredTimeline, chartMetric]);

  // Distinct phone lines for filter
  const distinctLiveLines = useMemo(() => {
    const lines = new Set<string>();
    liveCampaigns.forEach(c => {
      if (c.phoneLine) lines.add(c.phoneLine);
    });
    return Array.from(lines);
  }, [liveCampaigns]);

  // Distinct categories for history filter
  const distinctCategories = useMemo(() => {
    const cats = new Set<string>();
    historyRecords.forEach(r => {
      if (r.category) cats.add(r.category);
    });
    return Array.from(cats);
  }, [historyRecords]);

  return (
    <div className="space-y-6 pb-12 w-full max-w-full min-w-0">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-2xl">
              <Megaphone className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-black text-slate-900 tracking-tight">
                  Meta Ads Performance
                </h1>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  Conectado a AdsAutomático Pro2.0
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium">
                Monitoreo en tiempo real de pauta, generación de leads a Whaticket y relación entre ventas totales e inversión.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {activeTab === 'live' && liveIsCached && liveFresh && (
            <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[10.5px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200" title="Datos en memoria para no saturar la API">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Cache saludable ({liveCacheAge}s)
            </span>
          )}
          {lastUpdated && (
            <span className="text-[11px] font-semibold text-slate-400">
              Última sincronización: <span className="text-slate-600 font-mono font-bold">{lastUpdated}</span>
            </span>
          )}
          <button
            onClick={handleRefresh}
            disabled={refreshing || loading}
            className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl text-xs font-black flex items-center gap-2 shadow-md shadow-slate-900/10 transition-all cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Consultando...' : activeTab === 'live' ? 'Actualizar Meta Ads' : 'Sincronizar Planilla'}
          </button>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTab('live')}
          className={`px-5 py-2.5 rounded-2xl font-black text-xs transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'live'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Activity className="w-4 h-4" />
          ⚡ En Vivo Hoy (Meta API Directa)
        </button>
        <button
          onClick={() => setActiveTab('charts')}
          className={`px-5 py-2.5 rounded-2xl font-black text-xs transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'charts'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          📊 Gráficos & Evolución Diaria
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`px-5 py-2.5 rounded-2xl font-black text-xs transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'history'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Layers className="w-4 h-4" />
          📋 Histórico & Rentabilidad (CálculoParaEERR)
        </button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center p-16 space-y-3 bg-white rounded-3xl border border-slate-100">
          <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
          <p className="text-xs text-slate-500 font-bold">Cargando métricas publicitarias...</p>
        </div>
      ) : (
        <>
          {/* ========================================================================= */}
          {/* TAB 1: GRÁFICOS & EVOLUCIÓN DIARIA */}
          {/* ========================================================================= */}
          {activeTab === 'charts' && (
            <div className="space-y-6">
              {/* Range Filters Bar */}
              <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-2">
                  {[
                    { id: 'this_month', label: 'Este Mes' },
                    { id: 'last_month', label: 'Mes Anterior' },
                    { id: '30d', label: 'Últimos 30 días' },
                    { id: '7d', label: 'Últimos 7 días' },
                    { id: 'today', label: 'Hoy' }
                  ].map(p => (
                    <button
                      key={p.id}
                      onClick={() => handlePresetChange(p.id)}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        presetPeriod === p.id 
                          ? 'bg-slate-900 text-white shadow-sm' 
                          : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {/* Category Filter */}
                  {distinctCategories.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      <SlidersHorizontal className="w-4 h-4 text-slate-400" />
                      <select
                        value={historyCategoryFilter}
                        onChange={e => setHistoryCategoryFilter(e.target.value)}
                        className="py-1.5 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none"
                      >
                        <option value="all">Todos los Productos</option>
                        {distinctCategories.map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Date Pickers */}
                  <div className="flex items-center gap-2">
                    <DateInput
                      value={dateFrom}
                      onChange={val => {
                        setPresetPeriod('custom');
                        setDateFrom(val);
                        loadHistoryData(val, dateTo);
                      }}
                    />
                    <span className="text-slate-400 font-bold text-xs">a</span>
                    <DateInput
                      value={dateTo}
                      onChange={val => {
                        setPresetPeriod('custom');
                        setDateTo(val);
                        loadHistoryData(dateFrom, val);
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* KPI Executive Highlights */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 1. Leads en el Período */}
                <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                      💬 Leads Generados
                    </span>
                    <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                      <MessageSquare className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="text-2xl font-black text-slate-900 tracking-tight">
                    {historySummary?.totalMessages?.toLocaleString('es-AR') || 0}
                  </div>
                  <p className="text-[11px] text-slate-500 font-semibold">
                    Conversaciones ingresadas a Whaticket
                  </p>
                </div>

                {/* 2. Inversión Publicitaria Total */}
                <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                      💰 Inversión Publicitaria
                    </span>
                    <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                      <DollarSign className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="text-2xl font-black text-slate-900 tracking-tight">
                    {formatPrice(historySummary?.totalInvestmentArs || 0)}
                  </div>
                  <p className="text-[11px] text-slate-500 font-semibold font-mono">
                    US$ {(historySummary?.totalSpendUsd || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </p>
                </div>

                {/* 3. CPR Promedio Ponderado */}
                <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                      🎯 CPR Promedio Total
                    </span>
                    <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
                      <Target className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="text-2xl font-black text-amber-600 tracking-tight">
                    {formatPrice(historySummary?.avgCprArs || 0)} <span className="text-xs font-bold text-slate-400">/ lead</span>
                  </div>
                  <p className="text-[11px] text-slate-500 font-semibold">
                    Costo promedio por conversación
                  </p>
                </div>

                {/* 4. ROAS Comercial Real */}
                <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                      Ventas totales / inversión
                    </span>
                    <div className="p-2 bg-purple-50 text-purple-600 rounded-xl">
                      <Sparkles className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="text-2xl font-black text-indigo-600 tracking-tight">
                    {historySummary?.roas || 0}x <span className="block text-xs font-normal text-slate-500">Incluye todas las ventas ERP; no atribuye ventas a los anuncios.</span>
                  </div>
                  <p className="text-[11px] text-slate-500 font-semibold">
                    Facturación: {formatPrice(historySummary?.erpRevenueArs || 0)} ({historySummary?.erpOrdersCount || 0} pedidos)
                  </p>
                </div>
              </div>

              {/* Interactive Daily Timeline Chart */}
              <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
                  <div className="space-y-0.5">
                    <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                      <LineChart className="w-5 h-5 text-indigo-600" />
                      Evolución y Progreso Diario
                    </h3>
                    <p className="text-xs text-slate-500 font-semibold">
                      Comportamiento diario de la pauta y generación de resultados en el período seleccionado.
                    </p>
                  </div>

                  {/* Metric Toggle Tabs */}
                  <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1 rounded-2xl">
                    {[
                      { id: 'messages', label: '💬 Leads / Mensajes' },
                      { id: 'investment', label: '💰 Inversión ($)' },
                      { id: 'cpr', label: '🎯 CPR ($/lead)' },
                      { id: 'revenue', label: '🏷️ Facturación ERP' },
                      { id: 'roas', label: 'Ventas / inversión diaria' }
                    ].map(m => (
                      <button
                        key={m.id}
                        onClick={() => setChartMetric(m.id as any)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          chartMetric === m.id
                            ? 'bg-white text-indigo-600 shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* SVG Visual Bar Chart */}
                {filteredTimeline.length === 0 ? (
                  <div className="p-12 text-center text-slate-400 font-bold text-xs">
                    No hay datos registrados en el rango de fechas seleccionado.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Hover Inspector Card */}
                    <div className="h-14 bg-slate-50 rounded-2xl p-3 border border-slate-100 flex items-center justify-between">
                      {hoveredDay ? (
                        <div className="flex flex-wrap items-center gap-5 text-xs w-full animate-in fade-in duration-100">
                          <div>
                            <span className="text-[10px] uppercase font-bold text-slate-400">Fecha:</span>{' '}
                            <span className="font-black text-slate-900">
                              {['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][new Date(`${hoveredDay.isoDate}T12:00:00`).getDay()]} {hoveredDay.dateStr}
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] uppercase font-bold text-slate-400">Leads:</span>{' '}
                            <span className="font-black text-emerald-600">{hoveredDay.messages}</span>
                          </div>
                          <div>
                            <span className="text-[10px] uppercase font-bold text-slate-400">Inversión:</span>{' '}
                            <span className="font-black text-slate-900">{formatPrice(hoveredDay.totalInvestmentArs)}</span>
                          </div>
                          <div>
                            <span className="text-[10px] uppercase font-bold text-slate-400">CPR:</span>{' '}
                            <span className="font-black text-amber-600">{formatPrice(hoveredDay.cprArs)}</span>
                          </div>
                          <div>
                            <span className="text-[10px] uppercase font-bold text-slate-400">Ventas ERP:</span>{' '}
                            <span className="font-black text-indigo-600">{formatPrice(hoveredDay.erpRevenue)} ({hoveredDay.erpOrdersCount} pedidos)</span>
                          </div>
                          <div>
                            <span className="text-[10px] uppercase font-bold text-slate-400">Ventas / inversión:</span>{' '}
                            <span className="font-black text-purple-600">{hoveredDay.roas}x</span>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between w-full">
                          <span className="text-xs font-semibold text-slate-400 flex items-center gap-2">
                            <Activity className="w-4 h-4 text-slate-400" />
                            Pasá el cursor sobre cualquier barra para ver el detalle completo de ese día
                          </span>
                          <div className="hidden sm:flex items-center gap-4 text-[11px] font-bold text-slate-500">
                            <div className="flex items-center gap-1.5">
                              <span className="w-3 h-3 rounded-md bg-sky-100 border border-sky-300"></span>
                              <span>Sábados</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="w-3 h-3 rounded-md bg-rose-100 border border-rose-300"></span>
                              <span>Domingos</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Bars Container */}
                    <div className="flex items-end gap-1.5 h-56 pt-4 px-2 overflow-x-auto">
                      {filteredTimeline.map((d, idx) => {
                        let barValue = 0;
                        let barLabel = '';
                        let barColor = 'bg-indigo-600';

                        if (chartMetric === 'messages') {
                          barValue = d.messages;
                          barLabel = `${d.messages}`;
                          barColor = 'bg-emerald-500 hover:bg-emerald-600';
                        } else if (chartMetric === 'investment') {
                          barValue = d.totalInvestmentArs;
                          barLabel = formatPrice(d.totalInvestmentArs);
                          barColor = 'bg-indigo-600 hover:bg-indigo-700';
                        } else if (chartMetric === 'cpr') {
                          barValue = d.cprArs;
                          barLabel = formatPrice(d.cprArs);
                          barColor = d.cprArs > 4500 ? 'bg-rose-500 hover:bg-rose-600' : d.cprArs > 2500 ? 'bg-amber-500 hover:bg-amber-600' : 'bg-emerald-500 hover:bg-emerald-600';
                        } else if (chartMetric === 'revenue') {
                          barValue = d.erpRevenue;
                          barLabel = formatPrice(d.erpRevenue);
                          barColor = 'bg-blue-600 hover:bg-blue-700';
                        } else if (chartMetric === 'roas') {
                          barValue = d.roas;
                          barLabel = `${d.roas}x`;
                          barColor = 'bg-purple-600 hover:bg-purple-700';
                        }

                        const heightPercent = chartMaxVal > 0 ? Math.max(6, Math.round((barValue / chartMaxVal) * 100)) : 6;

                        const dateObj = new Date(`${d.isoDate}T12:00:00`);
                        const dayOfWeek = dateObj.getDay(); // 0 = Sunday, 6 = Saturday
                        const isSunday = dayOfWeek === 0;
                        const isSaturday = dayOfWeek === 6;

                        return (
                          <div
                            key={idx}
                            onMouseEnter={() => setHoveredDay(d)}
                            onMouseLeave={() => setHoveredDay(null)}
                            className={`flex-1 min-w-[30px] max-w-[48px] p-1 rounded-2xl flex flex-col items-center justify-end group cursor-pointer transition-all ${
                              isSunday
                                ? 'bg-rose-50/90 border border-rose-200/70'
                                : isSaturday
                                ? 'bg-sky-50/90 border border-sky-200/70'
                                : 'hover:bg-slate-50 border border-transparent'
                            }`}
                          >
                            <div className="h-4 flex items-center justify-center">
                              <span className={`text-[9px] font-black transition-colors ${
                                isSunday ? 'text-rose-600' : isSaturday ? 'text-sky-600' : 'text-slate-400 group-hover:text-slate-900'
                              }`}>
                                {chartMetric === 'messages' ? barValue : chartMetric === 'roas' ? `${barValue}x` : ''}
                              </span>
                            </div>
                            <div className={`w-full rounded-t-xl rounded-b-none flex items-end h-36 overflow-hidden relative my-1 ${
                              isSunday ? 'bg-rose-100/50' : isSaturday ? 'bg-sky-100/50' : 'bg-slate-100'
                            }`}>
                              <div
                                className={`w-full rounded-t-xl rounded-b-none transition-all duration-300 ${barColor}`}
                                style={{ height: `${heightPercent}%` }}
                              />
                            </div>
                            <div className="h-4 flex items-center justify-center">
                              <span className={`text-[9px] font-bold whitespace-nowrap ${
                                isSunday ? 'text-rose-600 font-black' : isSaturday ? 'text-sky-600 font-black' : 'text-slate-500 group-hover:text-indigo-600'
                              }`}>
                                {d.dateStr.slice(0, 5)}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* CPR & Performance Comparison by Product Category */}
              <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
                  <div className="space-y-0.5">
                    <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                      <Target className="w-5 h-5 text-indigo-600" />
                      CPR Promedio & Rendimiento por Tipo de Producto
                    </h3>
                    <p className="text-xs text-slate-500 font-semibold">
                      Comparativa de costo por lead y volumen de mensajes generados por cada línea de producto.
                    </p>
                  </div>
                  <span className="text-xs font-bold text-slate-400">
                    {categoriesSummary.length} categorías activas
                  </span>
                </div>

                {/* Category Cards Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {categoriesSummary.map(cat => {
                    const isLowCpr = false;
                    const isHighCpr = false; // Category totals do not share a single commercial target.
                    const messageShare = historySummary?.totalMessages > 0 
                      ? Math.round((cat.messages / historySummary.totalMessages) * 100) 
                      : 0;

                    return (
                      <div
                        key={cat.name}
                        onClick={() => setHistoryCategoryFilter(historyCategoryFilter === cat.name ? 'all' : cat.name)}
                        className={`p-5 rounded-3xl border transition-all cursor-pointer space-y-3 ${
                          historyCategoryFilter === cat.name
                            ? 'bg-indigo-50/70 border-indigo-300 shadow-md ring-2 ring-indigo-500/20'
                            : 'bg-white border-slate-100 hover:border-slate-300 shadow-sm'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="font-black text-slate-900 text-sm">{cat.name}</div>
                          <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black ${
                            isLowCpr ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                            isHighCpr ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                            'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}>
                            CPR {formatPrice(cat.cprArs)}
                          </span>
                        </div>

                        <div className="space-y-1">
                          <div className="text-xl font-black text-indigo-600">
                            {formatPrice(cat.totalInvestment)}
                          </div>
                          <div className="flex items-center justify-between text-xs font-bold text-slate-500">
                            <span>{cat.messages.toLocaleString('es-AR')} leads</span>
                            <span className="font-mono">US$ {Math.round(cat.spendUsd)}</span>
                          </div>
                        </div>

                        {/* Share Bar */}
                        <div className="space-y-1 pt-1 border-t border-slate-100">
                          <div className="flex justify-between text-[10px] font-bold text-slate-400">
                            <span>Participación de Leads</span>
                            <span className="text-slate-700">{messageShare}%</span>
                          </div>
                          <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                            <div
                              className="bg-indigo-600 h-full rounded-full"
                              style={{ width: `${messageShare}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Efficiency Ranking Table */}
                <div className="border border-slate-100 rounded-2xl overflow-hidden mt-6">
                  <div className="bg-slate-50 p-3.5 border-b border-slate-100 flex items-center justify-between">
                    <span className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                      <Award className="w-4 h-4 text-amber-500" />
                      Ranking de Eficiencia Publicitaria (Menor Costo por Lead)
                    </span>
                  </div>
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-white border-b text-slate-400 font-bold uppercase text-[9px]">
                        <th className="p-3">#</th>
                        <th className="p-3">Producto / Categoría</th>
                        <th className="p-3 text-right">CPR Promedio</th>
                        <th className="p-3 text-right">Inversión Pauta</th>
                        <th className="p-3 text-right">Leads Totales</th>
                        <th className="p-3 text-center">Estado Eficiencia</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-bold text-slate-700">
                      {[...categoriesSummary]
                        .filter(c => c.messages > 0)
                        .sort((a, b) => a.cprArs - b.cprArs)
                        .map((cat, rank) => {
                          const isLowCpr = false;
                          const isHighCpr = false; // Category totals do not share a single commercial target.

                          return (
                            <tr key={cat.name} className="hover:bg-slate-50/50">
                              <td className="p-3 font-mono text-slate-400">#{rank + 1}</td>
                              <td className="p-3 font-black text-slate-900">{cat.name}</td>
                              <td className="p-3 text-right font-mono font-black text-indigo-600">
                                {formatPrice(cat.cprArs)}
                              </td>
                              <td className="p-3 text-right font-mono text-slate-700">
                                {formatPrice(cat.totalInvestment)}
                              </td>
                              <td className="p-3 text-right font-black text-emerald-600">
                                {cat.messages.toLocaleString('es-AR')}
                              </td>
                              <td className="p-3 text-center">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black ${
                                  isLowCpr ? 'bg-emerald-50 text-emerald-700' :
                                  isHighCpr ? 'bg-rose-50 text-rose-700' :
                                  'bg-amber-50 text-amber-700'
                                }`}>
                                  Costo agregado · revisar por oferta
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 2: EN VIVO HOY */}
          {/* ========================================================================= */}
          {activeTab === 'live' && (
            <div className="space-y-6">
              <MetaReview campaigns={liveCampaigns} data={liveData} targets={targets} setTarget={setTarget} fresh={liveFresh} detailsOpen={reviewDetailsOpen} onDetailsOpenChange={setReviewDetailsOpen} />
              {/* Executive Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 1. Leads Hoy */}
                <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm space-y-3 relative overflow-hidden flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                        💬 Leads / Mensajes Hoy
                      </span>
                      <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                        <MessageSquare className="w-4 h-4" />
                      </div>
                    </div>
                    <div className="text-2xl font-black text-slate-900 tracking-tight">
                      {liveSummary?.totalMessages || 0} <span className="text-xs font-bold text-slate-400">conversaciones</span>
                    </div>
                    <p className="text-[11px] text-slate-500 font-semibold">
                      Entrantes por Whaticket en {liveSummary?.activeCampaignsCount || 0} campañas activas
                    </p>
                  </div>

                  {livePacingMetrics && (
                    <div className="mt-4 pt-3 border-t border-slate-100 space-y-2 text-[11px]">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 font-medium flex items-center gap-1">
                          <span className="text-indigo-600 font-black">🎯</span> Proy. según Budget:
                        </span>
                        <span className="font-black text-slate-900 font-mono">
                          ~{livePacingMetrics.projectedMessagesByBudget} msgs
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 font-medium flex items-center gap-1">
                          <span className="text-emerald-600 font-black">⏱️</span> Proy. al Ritmo Actual:
                        </span>
                        <span className="font-black text-emerald-700 font-mono bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200/70">
                          ~{livePacingMetrics.projectedMessagesByPace} msgs
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. Inversión Hoy */}
                <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm space-y-3 relative overflow-hidden flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                        💸 Inversión Publicitaria Hoy
                      </span>
                      <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                        <DollarSign className="w-4 h-4" />
                      </div>
                    </div>
                    <div className="text-2xl font-black text-slate-900 tracking-tight">
                      {formatPrice(liveSummary?.totalSpendArs || 0)}
                    </div>
                    <p className="text-[11px] text-slate-500 font-semibold font-mono">
                      US$ {(liveSummary?.totalSpendUsd || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                    </p>
                  </div>

                  {livePacingMetrics && (
                    <div className="mt-4 pt-3 border-t border-slate-100 space-y-2 text-[11px]">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 font-medium flex items-center gap-1">
                          <span className="text-indigo-600 font-black">⏱️</span> Proy. Gasto Fin de Día:
                        </span>
                        <span className="font-black text-indigo-700 font-mono bg-indigo-50 px-2 py-0.5 rounded-lg border border-indigo-200/70">
                          {formatPrice(livePacingMetrics.projectedSpendByPace)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 font-medium flex items-center gap-1">
                          <span>🎯</span> Budget Asignado:
                        </span>
                        <span className="font-bold text-slate-700 font-mono">
                          {formatPrice(livePacingMetrics.activeBudgetArs)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* 3. CPR Promedio */}
                <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm space-y-3 relative overflow-hidden flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                        🎯 CPR Promedio Hoy
                      </span>
                      <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
                        <Target className="w-4 h-4" />
                      </div>
                    </div>
                    <div className="text-2xl font-black text-slate-900 tracking-tight">
                      {formatPrice(liveSummary?.avgCprArs || 0)} <span className="text-xs font-bold text-slate-400">/ lead</span>
                    </div>
                    <p className="text-[11px] text-slate-500 font-semibold">
                      Costo promedio ponderado por mensaje
                    </p>
                  </div>

                  {livePacingMetrics && (
                    <div className="mt-4 pt-3 border-t border-slate-100 space-y-2 text-[11px]">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 font-medium flex items-center gap-1">
                          <span>⚡</span> Rendimiento:
                        </span>
                        <span className="font-bold text-slate-900 font-mono">
                          ~{liveSummary?.avgCprArs > 0 ? Math.round(100000 / liveSummary.avgCprArs) : 0} leads / $100k
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 font-medium flex items-center gap-1">
                          <span>📊</span> Estado costo:
                        </span>
                        <span className={`font-black font-mono text-[10px] px-2 py-0.5 rounded-lg border ${
                          liveSummary?.avgCprArs > 3500 
                            ? 'bg-amber-50 text-amber-700 border-amber-200/70' 
                            : 'bg-emerald-50 text-emerald-700 border-emerald-200/70'
                        }`}>
                          {liveSummary?.avgCprArs > 3500 ? '⚠️ Costo elevado' : '✅ Costo competitivo'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* 4. Pacing Presupuesto */}
                <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm space-y-3 relative overflow-hidden flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                        📊 Presupuesto & Ritmo
                      </span>
                      <div className="p-2 bg-purple-50 text-purple-600 rounded-xl">
                        <Activity className="w-4 h-4" />
                      </div>
                    </div>

                    <div className="flex items-baseline justify-between">
                      <div className="text-2xl font-black text-slate-900 tracking-tight">
                        {liveSummary?.pacingPercent || 0}% <span className="text-xs font-bold text-slate-400">consumido</span>
                      </div>
                      {livePacingMetrics && (
                        <div className={`px-2 py-0.5 rounded-lg text-xs font-black font-mono flex items-center gap-1 border ${livePacingMetrics.speedBadge.bg} ${livePacingMetrics.speedBadge.color} ${livePacingMetrics.speedBadge.border}`}>
                          <span>{livePacingMetrics.speedBadge.icon}</span>
                          <span>{livePacingMetrics.pacingSpeed.toFixed(2)}x</span>
                        </div>
                      )}
                    </div>

                    <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden mt-2">
                      <div 
                        className="bg-indigo-600 h-full rounded-full transition-all"
                        style={{ width: `${Math.min(100, liveSummary?.pacingPercent || 0)}%` }}
                      />
                    </div>
                  </div>

                  {livePacingMetrics && (
                    <div className="mt-4 pt-3 border-t border-slate-100 space-y-2 text-[11px]">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 font-medium">
                          Velocidad:
                        </span>
                        <span className={`font-black ${livePacingMetrics.speedBadge.color}`}>
                          {livePacingMetrics.speedBadge.label}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 font-medium">
                          Budget ideal a las {livePacingMetrics.timeFormatted}:
                        </span>
                        <span className="font-bold text-slate-700 font-mono">
                          {formatPrice(livePacingMetrics.expectedSpendToNow)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Real-time Pacing & Forecasting Hero Panel */}
              {livePacingMetrics && (
                <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-6 relative overflow-hidden">
                  {/* Header & Speed Pill */}
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-slate-100">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="p-2 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100">
                          <Gauge className="w-5 h-5" />
                        </span>
                        <h3 className="text-base sm:text-lg font-black tracking-tight text-slate-900 flex items-center gap-2">
                          Monitor de Ritmo de Gasto y Proyecciones de Cierre
                        </h3>
                        <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                          En Vivo
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 font-medium">
                        Cálculo dinámico basado en la hora actual ({livePacingMetrics.timeFormatted}), el avance del día ({livePacingMetrics.elapsedDayPercent}%) y la velocidad de consumo de Meta.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5">
                      {/* Speed Indicator Pill */}
                      <div className={`px-3 py-1.5 rounded-2xl border flex items-center gap-2.5 font-mono ${livePacingMetrics.speedBadge.bg} ${livePacingMetrics.speedBadge.color} ${livePacingMetrics.speedBadge.border}`}>
                        <span className="text-base">{livePacingMetrics.speedBadge.icon}</span>
                        <div className="leading-tight">
                          <div className="text-[9px] uppercase font-bold text-slate-400">Velocidad Actual</div>
                          <div className="text-sm font-black">{livePacingMetrics.pacingSpeed.toFixed(2)}x ({livePacingMetrics.speedBadge.shortLabel})</div>
                        </div>
                      </div>

                      {/* Simulation Button */}
                      <button
                        type="button"
                        onClick={() => setIsSimulatingBudget(!isSimulatingBudget)}
                        className={`px-3 py-2 rounded-2xl text-xs font-bold border transition-all cursor-pointer flex items-center gap-1.5 ${
                          isSimulatingBudget
                            ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 hover:text-slate-900'
                        }`}
                      >
                        <SlidersHorizontal className="w-3.5 h-3.5" />
                        <span>{isSimulatingBudget ? 'Simulando Budget' : 'Simular Budget'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Budget Simulation Drawer */}
                  {isSimulatingBudget && (
                    <div className="bg-indigo-50/70 p-4 rounded-2xl border border-indigo-100 flex flex-col sm:flex-row items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2">
                      <div className="flex items-center gap-2 text-xs text-indigo-900 font-medium">
                        <Calculator className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                        <span>Ingresá un presupuesto diario ficticio para proyectar el cierre:</span>
                      </div>
                      <div className="flex items-center gap-2 w-full sm:w-auto">
                        <input
                          type="number"
                          placeholder={`Ej: ${liveSummary?.totalBudgetArs || 1000000}`}
                          value={simulatedBudgetInput}
                          onChange={(e) => setSimulatedBudgetInput(e.target.value)}
                          className="w-44 px-3 py-1.5 bg-white border border-indigo-200 rounded-xl text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                        <button
                          onClick={() => {
                            setSimulatedBudgetInput("");
                            setIsSimulatingBudget(false);
                          }}
                          className="text-xs text-indigo-600 hover:text-indigo-800 px-2 py-1 font-bold cursor-pointer"
                        >
                          Restablecer
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Two Side-by-Side Projection Models */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Model A: Por Ritmo Horario Real */}
                    <div className="bg-slate-50/80 border border-slate-100 p-5 rounded-2xl space-y-4 hover:border-slate-200 transition-all">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="p-2 rounded-xl bg-blue-50 text-blue-600 border border-blue-100">
                            <Clock className="w-4 h-4" />
                          </div>
                          <div>
                            <h4 className="text-sm font-black text-slate-900">Proyección por Ritmo Horario</h4>
                            <p className="text-[10px] text-slate-500 font-semibold">Gasto y mensajes si Meta mantiene la velocidad de hoy</p>
                          </div>
                        </div>
                        <span className="text-[10px] font-black font-mono px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200">
                          Ritmo {livePacingMetrics.pacingSpeed.toFixed(2)}x
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-3 pt-1">
                        <div className="bg-white p-3.5 rounded-xl border border-slate-100 shadow-2xs">
                          <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Gasto Proyectado Cierre</span>
                          <div className="text-lg font-black text-slate-900 mt-1 font-mono">
                            {formatPrice(livePacingMetrics.projectedSpendByPace)}
                          </div>
                          <p className="text-[10px] text-slate-400 mt-0.5 font-medium">
                            Consumirá {Math.round(livePacingMetrics.projectedSpendByPace / (livePacingMetrics.activeBudgetArs || 1) * 100)}% del budget
                          </p>
                        </div>

                        <div className="bg-white p-3.5 rounded-xl border border-slate-100 shadow-2xs">
                          <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Mensajes Proyectados</span>
                          <div className="text-lg font-black text-emerald-600 mt-1 font-mono">
                            ~{livePacingMetrics.projectedMessagesByPace} <span className="text-xs font-bold text-slate-400">msgs</span>
                          </div>
                          <p className="text-[10px] text-slate-400 mt-0.5 font-medium">
                            +{Math.max(0, livePacingMetrics.projectedMessagesByPace - (liveSummary?.totalMessages || 0))} restantes hoy
                          </p>
                        </div>
                      </div>

                      <p className="text-[11px] text-slate-500 leading-relaxed font-medium">
                        A las <strong className="text-slate-800">{livePacingMetrics.timeFormatted}</strong> ({livePacingMetrics.elapsedDayPercent}% del día transcurrido), el budget ideal esperado era <strong className="text-slate-800">{formatPrice(livePacingMetrics.expectedSpendToNow)}</strong>. Al ir gastando <strong className="text-slate-800">{formatPrice(liveSummary?.totalSpendArs || 0)}</strong>, la velocidad de consumo es <strong className={livePacingMetrics.speedBadge.color}>{livePacingMetrics.pacingSpeed.toFixed(2)}x</strong> ({livePacingMetrics.speedBadge.label.toLowerCase()}).
                      </p>
                    </div>

                    {/* Model B: Por Budget Total Asignado */}
                    <div className="bg-slate-50/80 border border-slate-100 p-5 rounded-2xl space-y-4 hover:border-slate-200 transition-all">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="p-2 rounded-xl bg-purple-50 text-purple-600 border border-purple-100">
                            <Target className="w-4 h-4" />
                          </div>
                          <div>
                            <h4 className="text-sm font-black text-slate-900">Proyección por Budget Asignado</h4>
                            <p className="text-[10px] text-slate-500 font-semibold">Mensajes estimados si Meta consume el 100% del límite diario</p>
                          </div>
                        </div>
                        <span className="text-[10px] font-black font-mono px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-200">
                          Meta 100%
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-3 pt-1">
                        <div className="bg-white p-3.5 rounded-xl border border-slate-100 shadow-2xs">
                          <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Presupuesto Objetivo</span>
                          <div className="text-lg font-black text-slate-900 mt-1 font-mono">
                            {formatPrice(livePacingMetrics.activeBudgetArs)}
                          </div>
                          <p className="text-[10px] text-slate-400 mt-0.5 font-medium">
                            Faltan ejecutar {formatPrice(Math.max(0, livePacingMetrics.activeBudgetArs - (liveSummary?.totalSpendArs || 0)))}
                          </p>
                        </div>

                        <div className="bg-white p-3.5 rounded-xl border border-slate-100 shadow-2xs">
                          <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Mensajes a Meta</span>
                          <div className="text-lg font-black text-indigo-600 mt-1 font-mono">
                            ~{livePacingMetrics.projectedMessagesByBudget} <span className="text-xs font-bold text-slate-400">msgs</span>
                          </div>
                          <p className="text-[10px] text-slate-400 mt-0.5 font-medium">
                            Al CPR actual de {formatPrice(liveSummary?.avgCprArs || 0)}/lead
                          </p>
                        </div>
                      </div>

                      <p className="text-[11px] text-slate-500 leading-relaxed font-medium">
                        Si Meta consume el 100% del presupuesto asignado para hoy ({formatPrice(livePacingMetrics.activeBudgetArs)}), generaría aproximadamente <strong className="text-indigo-700">~{livePacingMetrics.projectedMessagesByBudget} mensajes</strong> manteniendo el CPR promedio actual.
                      </p>
                    </div>
                  </div>
                </div>
              )}


              {/* Centro de Alertas & Diagnóstico de Reglas */}
              {smartRuleAlerts.length > 0 && (
                <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm space-y-4">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-xs">
                        <BellRing className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-black text-slate-900 tracking-tight">
                            Centro de Alertas & Diagnóstico de Reglas
                          </h3>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-100 text-indigo-700">
                            {smartRuleAlerts.length} {smartRuleAlerts.length === 1 ? 'aviso' : 'avisos'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 font-medium">
                          Monitoreo en tiempo real de anomalías de costo, saturación de audiencia y oportunidades de escalamiento.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
                      <div className="flex items-center gap-1.5 text-xs font-bold">
                        {dangerAlertsCount > 0 && (
                          <span className="px-2.5 py-1 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 text-[11px] font-black">
                            🚨 {dangerAlertsCount} Crítica{dangerAlertsCount > 1 ? 's' : ''}
                          </span>
                        )}
                        {warningAlertsCount > 0 && (
                          <span className="px-2.5 py-1 rounded-xl bg-amber-50 text-amber-700 border border-amber-200 text-[11px] font-black">
                            ⚠️ {warningAlertsCount} Advertencia{warningAlertsCount > 1 ? 's' : ''}
                          </span>
                        )}
                        {successAlertsCount > 0 && (
                          <span className="px-2.5 py-1 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-black">
                            {successAlertsCount} Candidatas a evaluar
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => setShowAlertCards(!showAlertCards)}
                        className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-500 transition-colors cursor-pointer"
                        title={showAlertCards ? 'Minimizar avisos' : 'Expandir avisos'}
                      >
                        {showAlertCards ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Cards Grid */}
                  {showAlertCards && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
                      {smartRuleAlerts.map(alert => {
                        const isDanger = alert.type === 'danger';
                        const isWarning = alert.type === 'warning';

                        const bgClass = isDanger ? 'bg-rose-50/50 border-rose-200/80 hover:bg-rose-50' :
                          isWarning ? 'bg-amber-50/50 border-amber-200/80 hover:bg-amber-50' :
                          'bg-emerald-50/50 border-emerald-200/80 hover:bg-emerald-50';

                        const badgeClass = isDanger ? 'bg-rose-100 text-rose-800 border-rose-200' :
                          isWarning ? 'bg-amber-100 text-amber-800 border-amber-200' :
                          'bg-emerald-100 text-emerald-800 border-emerald-200';

                        return (
                          <div 
                            key={alert.id}
                            className={`p-3.5 rounded-2xl border transition-all shadow-xs flex flex-col justify-between gap-2.5 ${bgClass}`}
                          >
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between gap-2">
                                <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black border ${badgeClass}`}>
                                  {alert.badgeText}
                                </span>
                                {alert.phoneLine && (
                                  <span className="text-[10px] font-bold text-slate-500 flex items-center gap-1">
                                    <PhoneCall className="w-3 h-3" />
                                    Línea {alert.phoneLine}
                                  </span>
                                )}
                              </div>

                              <div>
                                <h4 className="text-xs font-black text-slate-900 line-clamp-1" title={alert.campaignName}>
                                  {alert.commercialOffer || alert.campaignName}
                                </h4>
                                <p className="text-[11px] text-slate-600 leading-snug mt-1 font-medium">
                                  {alert.description}
                                </p>
                              </div>
                            </div>

                            <div className="pt-2 border-t border-slate-200/60 space-y-1.5">
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="font-bold text-slate-500">{alert.metricLabel}:</span>
                                <span className="font-black text-slate-900 font-mono">{alert.metricValue}</span>
                              </div>
                              <div className="text-[10.5px] font-semibold text-slate-600 bg-white/80 p-2 rounded-xl border border-slate-200/60">
                                💡 <strong className="text-slate-800">Sugerencia:</strong> {alert.actionText}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Filters Bar */}
              <div className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm space-y-3">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  {/* Search and Line selector */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 flex-1 min-w-0">
                    <div className="relative flex-1 min-w-0">
                      <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Buscar por campaña, oferta o producto..."
                        value={liveSearchQuery}
                        onChange={e => setLiveSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>

                    {distinctLiveLines.length > 0 && (
                      <div className="flex items-center gap-2 shrink-0">
                        <PhoneCall className="w-4 h-4 text-slate-400 shrink-0" />
                        <select
                          value={liveLineFilter}
                          onChange={e => setLiveLineFilter(e.target.value)}
                          className="py-2 px-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-700 focus:outline-none w-full sm:w-auto"
                        >
                          <option value="all">Todas las Líneas</option>
                          {distinctLiveLines.map(line => (
                            <option key={line} value={line}>Línea {line}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  {/* Status & Alert Filters */}
                  <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-2xl border border-slate-200 text-xs overflow-x-auto no-scrollbar shrink-0 max-w-full">
                    <button
                      type="button"
                      onClick={() => { setLiveStatusFilter('all'); setLiveAlertFilter('all'); }}
                      className={`px-3 py-1 rounded-xl font-bold transition-all cursor-pointer shrink-0 whitespace-nowrap ${
                        liveStatusFilter === 'all' && liveAlertFilter === 'all'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      Todas ({liveCampaigns.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setLiveStatusFilter('active')}
                      className={`px-3 py-1 rounded-xl font-bold transition-all cursor-pointer flex items-center gap-1 shrink-0 whitespace-nowrap ${
                        liveStatusFilter === 'active' && liveAlertFilter === 'all'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'text-emerald-700 hover:bg-emerald-50'
                      }`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                      Activas ({liveSummary?.activeCampaignsCount || liveCampaigns.filter(c => c.status === 'ACTIVE').length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setLiveStatusFilter('paused')}
                      className={`px-3 py-1 rounded-xl font-bold transition-all cursor-pointer flex items-center gap-1 shrink-0 whitespace-nowrap ${
                        liveStatusFilter === 'paused' && liveAlertFilter === 'all'
                          ? 'bg-amber-600 text-white shadow-xs'
                          : 'text-amber-700 hover:bg-amber-50'
                      }`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                      Pausadas ({liveSummary?.pausedCampaignsCount || liveCampaigns.filter(c => c.status === 'PAUSED').length})
                    </button>
                    {campaignsWithAlertsCount > 0 && (
                      <button
                        type="button"
                        onClick={() => setLiveAlertFilter(liveAlertFilter === 'all' ? 'with_alerts' : 'all')}
                        className={`px-3 py-1 rounded-xl font-bold transition-all cursor-pointer flex items-center gap-1 shrink-0 whitespace-nowrap ${
                          liveAlertFilter === 'with_alerts'
                            ? 'bg-rose-600 text-white shadow-xs'
                            : 'text-rose-700 hover:bg-rose-50'
                        }`}
                      >
                        <ShieldAlert className="w-3.5 h-3.5" />
                        Con Alertas ({campaignsWithAlertsCount})
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-2xl border border-slate-200 text-xs">
                      <button
                        type="button"
                        onClick={expandAllCampaigns}
                        className="px-2.5 py-1 rounded-xl font-bold text-[10.5px] text-slate-600 hover:text-indigo-600 hover:bg-white transition-all cursor-pointer"
                        title="Expandir anuncios de todas las campañas"
                      >
                        Desplegar Anuncios
                      </button>
                      <button
                        type="button"
                        onClick={collapseAllCampaigns}
                        className="px-2.5 py-1 rounded-xl font-bold text-[10.5px] text-slate-600 hover:text-indigo-600 hover:bg-white transition-all cursor-pointer"
                        title="Contraer anuncios de todas las campañas"
                      >
                        Contraer
                      </button>
                    </div>

                    <span className="text-xs font-bold text-slate-500">
                      {filteredLiveCampaigns.length} de {liveCampaigns.length} campañas
                    </span>
                  </div>

                  {liveSortField === 'cpr' && (
                    <button
                      type="button"
                      onClick={() => handleLiveSort('cpr')}
                      className="text-[10.5px] font-black px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1 cursor-pointer hover:bg-rose-100 transition-colors"
                      title="Tocar para ordenar por CPR"
                    >
                      {liveSortOrder === 'desc' ? '🔴 Más caro a más barato' : '🟢 Más barato a más caro'}
                    </button>
                  )}
                </div>
              </div>

              {/* Live Campaigns Table */}
              <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden w-full max-w-full">
                <div className="overflow-x-auto w-full">
                  <table className="w-full min-w-[950px] text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-black uppercase tracking-wider text-[9px] select-none">
                        <th className="p-4">Estado</th>
                        <th className="p-4">Campaña / Oferta</th>
                        <th className="p-4 text-center">Línea WhatsApp</th>
                        <th 
                          className={`p-4 text-right cursor-pointer hover:bg-slate-100 transition-colors ${liveSortField === 'messages' ? 'text-indigo-600 font-black bg-indigo-50/40' : ''}`}
                          onClick={() => handleLiveSort('messages')}
                          title="Ordenar por Mensajes"
                        >
                          <div className="inline-flex items-center gap-1 justify-end">
                            <span>Mensajes Hoy</span>
                            {liveSortField === 'messages' ? (
                              liveSortOrder === 'desc' ? <ArrowDown className="w-3 h-3 text-indigo-600" /> : <ArrowUp className="w-3 h-3 text-indigo-600" />
                            ) : (
                              <ArrowUpDown className="w-2.5 h-2.5 opacity-30" />
                            )}
                          </div>
                        </th>
                        <th className="p-4 text-right">Gasto Hoy (USD)</th>
                        <th 
                          className={`p-4 text-right cursor-pointer hover:bg-slate-100 transition-colors ${liveSortField === 'spend' ? 'text-indigo-600 font-black bg-indigo-50/40' : ''}`}
                          onClick={() => handleLiveSort('spend')}
                          title="Ordenar por Gasto en ARS"
                        >
                          <div className="inline-flex items-center gap-1 justify-end">
                            <span>Gasto Hoy (ARS)</span>
                            {liveSortField === 'spend' ? (
                              liveSortOrder === 'desc' ? <ArrowDown className="w-3 h-3 text-indigo-600" /> : <ArrowUp className="w-3 h-3 text-indigo-600" />
                            ) : (
                              <ArrowUpDown className="w-2.5 h-2.5 opacity-30" />
                            )}
                          </div>
                        </th>
                        <th 
                          className={`p-4 text-right cursor-pointer hover:bg-rose-50/50 transition-colors ${liveSortField === 'cpr' ? 'text-rose-600 font-black bg-rose-50/60' : ''}`}
                          onClick={() => handleLiveSort('cpr')}
                          title="Ordenar por CPR (Costo por Mensaje). Actualmente: Más caro a más barato"
                        >
                          <div className="inline-flex items-center gap-1.5 justify-end">
                            <span>CPR Hoy (ARS)</span>
                            {liveSortField === 'cpr' ? (
                              liveSortOrder === 'desc' ? (
                                <span className="inline-flex items-center gap-0.5 text-rose-600 font-black" title="De más caro a más barato">
                                  <ArrowDown className="w-3.5 h-3.5" />
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-0.5 text-emerald-600 font-black" title="De más barato a más caro">
                                  <ArrowUp className="w-3.5 h-3.5" />
                                </span>
                              )
                            ) : (
                              <ArrowUpDown className="w-2.5 h-2.5 opacity-30" />
                            )}
                          </div>
                        </th>
                        <th 
                          className={`p-4 text-right cursor-pointer hover:bg-slate-100 transition-colors ${liveSortField === 'budget' ? 'text-indigo-600 font-black bg-indigo-50/40' : ''}`}
                          onClick={() => handleLiveSort('budget')}
                          title="Ordenar por Presupuesto Diario"
                        >
                          <div className="inline-flex items-center gap-1 justify-end">
                            <span>Presupuesto Diario</span>
                            {liveSortField === 'budget' ? (
                              liveSortOrder === 'desc' ? <ArrowDown className="w-3 h-3 text-indigo-600" /> : <ArrowUp className="w-3 h-3 text-indigo-600" />
                            ) : (
                              <ArrowUpDown className="w-2.5 h-2.5 opacity-30" />
                            )}
                          </div>
                        </th>
                        <th 
                          className={`p-4 text-center cursor-pointer hover:bg-slate-100 transition-colors ${liveSortField === 'consumption' ? 'text-indigo-600 font-black bg-indigo-50/40' : ''}`}
                          onClick={() => handleLiveSort('consumption')}
                          title="Ordenar por % Consumo"
                        >
                          <div className="inline-flex items-center gap-1 justify-center">
                            <span>% Consumo</span>
                            {liveSortField === 'consumption' ? (
                              liveSortOrder === 'desc' ? <ArrowDown className="w-3 h-3 text-indigo-600" /> : <ArrowUp className="w-3 h-3 text-indigo-600" />
                            ) : (
                              <ArrowUpDown className="w-2.5 h-2.5 opacity-30" />
                            )}
                          </div>
                        </th>
                        <th className="p-4 text-center">Diagnóstico / Reglas</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-bold text-slate-700">
                      {filteredLiveCampaigns.length === 0 ? (
                        <tr>
                          <td colSpan={10} className="p-8 text-center text-slate-400">
                            No se encontraron campañas para los filtros seleccionados.
                          </td>
                        </tr>
                      ) : (
                        filteredLiveCampaigns.map((c, idx) => {
                          const isHighCpr = liveFresh && c.messages > 0 && c.costPerActionUsd > (targets[c.commercialOffer]||3.5);
                          const isLowCpr = liveFresh && c.messages >= 5 && c.costPerActionUsd <= (targets[c.commercialOffer]||3.5);
                          const isActiva = c.status.toUpperCase() === 'ACTIVE' || c.status.toUpperCase() === 'ACTIVA' || c.status.toUpperCase() === 'ON';

                          const isExpanded = expandedCampaigns.has(c.campaignId);
                          // Filtrar anuncios: mostrar solo activos o pausados que tuvieron consumo hoy
                          const visibleAds = (c.ads || []).filter(ad => {
                            const isAdActive = ad.effectiveStatus === 'ACTIVE' || ad.status === 'ACTIVE';
                            return isAdActive || ad.spendUsd > 0;
                          });

                          return (
                            <React.Fragment key={c.campaignId || idx}>
                              <tr className="hover:bg-slate-50/50 transition-colors">
                                <td className="p-4">
                                  {isActiva ? (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
                                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                      ACTIVA
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-50 text-amber-700 border border-amber-200">
                                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                                      PAUSADA
                                    </span>
                                  )}
                                </td>
                                <td className="p-4">
                                  <div className="flex items-center gap-2">
                                    {visibleAds.length > 0 && (
                                      <button
                                        type="button"
                                        onClick={() => toggleCampaignExpand(c.campaignId)}
                                        className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-indigo-600 transition-colors cursor-pointer shrink-0"
                                        title={isExpanded ? "Contraer anuncios" : `Ver ${visibleAds.length} anuncios`}
                                      >
                                        {isExpanded ? (
                                          <ChevronDown className="w-4 h-4 text-indigo-600" />
                                        ) : (
                                          <ChevronRight className="w-4 h-4" />
                                        )}
                                      </button>
                                    )}
                                    <div className="space-y-0.5 max-w-md">
                                      <div className="font-bold text-slate-900 text-xs truncate" title={c.campaignName}>
                                        {c.campaignName}
                                      </div>
                                      <div className="flex items-center gap-2">
                                        {c.commercialOffer && (
                                          <span className="text-[11px] text-indigo-600 font-bold">
                                            {c.commercialOffer}
                                          </span>
                                        )}
                                        {visibleAds.length > 0 && (
                                          <button
                                            type="button"
                                            onClick={() => toggleCampaignExpand(c.campaignId)}
                                            className="text-[10px] text-slate-400 hover:text-indigo-600 font-bold underline cursor-pointer"
                                          >
                                            {visibleAds.length} {visibleAds.length === 1 ? 'anuncio' : 'anuncios'} {isExpanded ? '(ocultar)' : '(ver)'}
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </td>
                                <td className="p-4 text-center">
                                  {c.phoneLine ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-xl text-[10px] font-black bg-slate-100 text-slate-700">
                                      <PhoneCall className="w-3 h-3 text-slate-500" />
                                      {c.phoneLine}
                                    </span>
                                  ) : (
                                    <span className="text-slate-400">-</span>
                                  )}
                                </td>
                                <td className="p-4 text-right">
                                  <div className="font-black text-indigo-600 text-sm">
                                    {c.messages}
                                  </div>
                                  {livePacingMetrics && isActiva && (
                                    <div className="text-[10px] text-slate-400 font-semibold font-mono whitespace-nowrap mt-0.5">
                                      Proy: ~{Math.round(c.messages / livePacingMetrics.elapsedDayFraction)} msgs
                                    </div>
                                  )}
                                </td>
                                <td className="p-4 text-right font-mono text-slate-600">
                                  US$ {c.spendUsd.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                                </td>
                                <td className="p-4 text-right font-mono text-slate-900 font-bold">
                                  {formatPrice(c.spendArs)}
                                </td>
                                <td className="p-4 text-right">
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-mono font-black ${
                                    isLowCpr ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                                    isHighCpr ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                                    'bg-amber-50 text-amber-700 border border-amber-200'
                                  }`}>
                                    {formatPrice(c.cprArs)}
                                  </span>
                                </td>
                                <td className="p-4 text-right font-mono text-slate-600">
                                  {formatPrice(c.budgetArs)}
                                </td>
                                <td className="p-4 text-center">
                                  <div className="flex flex-col items-center gap-1">
                                    <div className="flex items-center justify-center gap-2">
                                      <div className="w-12 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                        <div 
                                          className={`h-full rounded-full ${
                                            c.budgetConsumedPercent > 90 ? 'bg-rose-500' :
                                            c.budgetConsumedPercent > 60 ? 'bg-indigo-500' : 'bg-emerald-500'
                                          }`}
                                          style={{ width: `${Math.min(100, c.budgetConsumedPercent)}%` }}
                                        />
                                      </div>
                                      <span className="text-[11px] font-black text-slate-700 font-mono">
                                        {c.budgetConsumedPercent}%
                                      </span>
                                    </div>
                                    {livePacingMetrics && c.budgetArs > 0 && isActiva && (() => {
                                      const campExpected = c.budgetArs * livePacingMetrics.elapsedDayFraction;
                                      const campSpeed = campExpected > 0 ? (c.spendArs / campExpected) : 1;
                                      return (
                                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black font-mono border ${
                                          campSpeed >= 1.3 ? 'bg-rose-50 text-rose-700 border-rose-200' :
                                          campSpeed >= 1.15 ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                          campSpeed >= 0.85 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                          'bg-blue-50 text-blue-700 border-blue-200'
                                        }`}>
                                          {campSpeed.toFixed(1)}x {campSpeed >= 1.15 ? 'rápido' : campSpeed < 0.85 ? 'lento' : 'ritmo'}
                                        </span>
                                      );
                                    })()}
                                  </div>
                                </td>
                                <td className="p-4 text-center">
                                  {(() => {
                                    const alerts = campaignAlertsMap[c.campaignId] || [];
                                    if (alerts.length === 0) {
                                      if (!liveFresh) return <span className="text-amber-700 text-xs">Datos no vigentes</span>;
                                      if (c.messages === 0) {
                                        if (c.spendUsd >= 5) {
                                          return (
                                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200">
                                              ⏳ Sin mensajes
                                            </span>
                                          );
                                        } else if (c.spendUsd > 0) {
                                          return (
                                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-medium text-slate-600 bg-slate-100 border border-slate-200">
                                              🔍 En exploración
                                            </span>
                                          );
                                        }
                                        return <span className="text-slate-400 font-mono text-[11px]">-</span>;
                                      }
                                      return (
                                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold text-slate-500 bg-slate-50 border border-slate-200">
                                          {c.periods ? diagnose(c.periods, targets[c.commercialOffer]||3.5, c.status==='ACTIVE', liveFresh).label : 'Datos insuficientes'}
                                        </span>
                                      );
                                    }
                                    return (
                                      <div className="flex flex-col items-center gap-1">
                                        {alerts.map(a => (
                                          <span 
                                            key={a.id} 
                                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-black border ${
                                              a.type === 'danger' ? 'bg-rose-50 text-rose-700 border-rose-200 shadow-xs' :
                                              a.type === 'warning' ? 'bg-amber-50 text-amber-700 border-amber-200 shadow-xs' :
                                              'bg-emerald-50 text-emerald-700 border-emerald-200 shadow-xs'
                                            }`}
                                            title={`${a.description} -> ${a.actionText}`}
                                          >
                                            {a.badgeText}
                                          </span>
                                        ))}
                                      </div>
                                    );
                                  })()}
                                </td>
                              </tr>

                              {/* Sub-tabla de Anuncios Expandible */}
                              {isExpanded && visibleAds.length > 0 && (
                                <tr className="bg-slate-50/70 border-b border-slate-200/80">
                                  <td colSpan={10} className="p-3 pl-6 sm:pl-10">
                                    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
                                      <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                          <span className="text-[11px] font-black text-slate-900 uppercase tracking-wider">
                                            Anuncios en {c.commercialOffer || c.campaignName}
                                          </span>
                                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-50 text-indigo-700 border border-indigo-200">
                                            {visibleAds.length} {visibleAds.length === 1 ? 'anuncio' : 'anuncios'}
                                          </span>
                                        </div>
                                        <span className="text-[10px] font-medium text-slate-400">
                                          Solo anuncios activos o con consumo hoy
                                        </span>
                                      </div>

                                      <div className="overflow-x-auto">
                                        <table className="w-full text-left border-collapse text-xs">
                                          <thead>
                                            <tr className="bg-slate-50/60 border-b border-slate-200 text-slate-400 font-black uppercase tracking-wider text-[8.5px]">
                                              <th className="py-2.5 px-3 w-14 text-center">Visual</th>
                                              <th className="py-2.5 px-3">Nombre del Anuncio</th>
                                              <th className="py-2.5 px-3 text-center">Estado</th>
                                              <th className="py-2.5 px-3 text-right">Msgs</th>
                                              <th className="py-2.5 px-3 text-right">Gasto USD</th>
                                              <th className="py-2.5 px-3 text-right">Gasto ARS</th>
                                              <th className="py-2.5 px-3 text-right">CPR Hoy</th>
                                              <th className="py-2.5 px-3 text-center">Frecuencia</th>
                                              <th className="py-2.5 px-3 text-center">Diagnóstico / Alertas</th>
                                            </tr>
                                          </thead>
                                          <tbody className="divide-y divide-slate-100 font-bold text-slate-700">
                                            {visibleAds.map(ad => {
                                              const isAdActive = ad.effectiveStatus === 'ACTIVE' || ad.status === 'ACTIVE';
                                              const isAdHighCpr = liveFresh && ad.messages > 0 && ad.costPerActionUsd > (targets[c.commercialOffer]||3.5);
                                              const isAdLowCpr = ad.costPerActionUsd > 0 && ad.costPerActionUsd <= 2.00;

                                              return (
                                                <tr key={ad.id} className="hover:bg-slate-50/70 transition-colors">
                                                  <td className="py-2.5 px-3 text-center">
                                                    <div 
                                                      onClick={() => setPreviewAd(ad)}
                                                      className="group relative w-10 h-10 rounded-xl overflow-hidden bg-slate-100 border border-slate-200 mx-auto cursor-pointer shadow-2xs hover:ring-2 hover:ring-indigo-500 transition-all"
                                                      title="Clic para previsualizar creativo"
                                                    >
                                                      {ad.thumbnailUrl ? (
                                                        <img 
                                                          src={ad.thumbnailUrl} 
                                                          alt={ad.name} 
                                                          className="w-full h-full object-cover group-hover:scale-110 transition-transform" 
                                                        />
                                                      ) : (
                                                        <div className="w-full h-full flex items-center justify-center text-slate-300">
                                                          <ImageIcon className="w-4 h-4" />
                                                        </div>
                                                      )}
                                                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white">
                                                        <Eye className="w-3.5 h-3.5" />
                                                      </div>
                                                    </div>
                                                  </td>
                                                  <td className="py-2.5 px-3">
                                                    <div className="space-y-0.5 max-w-xs sm:max-w-md">
                                                      <div className="font-bold text-slate-900 text-xs truncate" title={ad.name}>
                                                        {ad.name}
                                                      </div>
                                                      <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                                                        {ad.adsetName && <span>{ad.adsetName}</span>}
                                                        {ad.title && (
                                                          <>
                                                            <span>•</span>
                                                            <span className="text-slate-600 font-semibold truncate max-w-[200px]">{ad.title}</span>
                                                          </>
                                                        )}
                                                      </div>
                                                    </div>
                                                  </td>
                                                  <td className="py-2.5 px-3 text-center">
                                                    {isAdActive ? (
                                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9.5px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                                        ACTIVO
                                                      </span>
                                                    ) : (
                                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9.5px] font-black bg-amber-50 text-amber-800 border border-amber-200" title="Pausado hoy tras consumir presupuesto">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                                                        PAUSADO HOY
                                                      </span>
                                                    )}
                                                  </td>
                                                  <td className="py-2.5 px-3 text-right font-black text-indigo-600">
                                                    {ad.messages}
                                                  </td>
                                                  <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                                                    US$ {ad.spendUsd.toFixed(2)}
                                                  </td>
                                                  <td className="py-2.5 px-3 text-right font-mono text-slate-900">
                                                    {formatPrice(ad.spendArs)}
                                                  </td>
                                                  <td className="py-2.5 px-3 text-right">
                                                    {ad.messages > 0 ? (
                                                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10.5px] font-mono font-black ${
                                                        isAdLowCpr ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                                                        isAdHighCpr ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                                                        'bg-amber-50 text-amber-700 border border-amber-200'
                                                      }`}>
                                                        US$ {ad.costPerActionUsd.toFixed(2)}
                                                      </span>
                                                    ) : (
                                                      <span className="text-slate-400 font-mono text-[11px]">-</span>
                                                    )}
                                                  </td>
                                                  <td className="py-2.5 px-3 text-center font-mono text-slate-600 text-[11px]">
                                                    {ad.frequency > 0 ? `${ad.frequency.toFixed(2)}x` : '-'}
                                                  </td>
                                                  <td className="py-2.5 px-3 text-center">
                                                    {ad.alerts && ad.alerts.length > 0 ? (
                                                      <div className="flex flex-col items-center gap-1">
                                                        {ad.alerts.map((al, alIdx) => (
                                                          <span 
                                                            key={alIdx} 
                                                            className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[9.5px] font-black border ${
                                                              al.includes('persistente')
                                                                ? 'bg-rose-50 text-rose-700 border-rose-200' 
                                                                : /elevad|costoso|Gasto sin/.test(al)
                                                                ? 'bg-amber-50 text-amber-700 border-amber-200'
                                                                : al.includes('Candidata') ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-600 border-slate-200'
                                                            }`}
                                                          >
                                                            {al}
                                                          </span>
                                                        ))}
                                                      </div>
                                                    ) : isAdHighCpr ? (
                                                      <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[9.5px] font-black bg-rose-50 text-rose-700 border border-rose-200">
                                                        🚨 CPR Alto (US$ {ad.costPerActionUsd.toFixed(2)})
                                                      </span>
                                                    ) : ad.messages === 0 ? (
                                                      ad.spendUsd >= 3 ? (
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[9.5px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                                          ⏳ Sin mensajes
                                                        </span>
                                                      ) : ad.spendUsd > 0 ? (
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[9.5px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                                                          🔍 En exploración
                                                        </span>
                                                      ) : (
                                                        <span className="text-slate-400 font-mono text-[11px]">-</span>
                                                      )
                                                    ) : (
                                                      <span className="text-[10px] text-slate-400 font-bold">
                                                        Datos insuficientes
                                                      </span>
                                                    )}
                                                  </td>
                                                </tr>
                                              );
                                            })}
                                          </tbody>
                                        </table>
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 3: HISTÓRICO & TABLA REGISTROS */}
          {/* ========================================================================= */}
          {activeTab === 'history' && (
            <div className="space-y-6">
              {/* Range Filters Bar */}
              <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-2">
                  {[
                    { id: 'this_month', label: 'Este Mes' },
                    { id: 'last_month', label: 'Mes Anterior' },
                    { id: '30d', label: 'Últimos 30 días' },
                    { id: '7d', label: 'Últimos 7 días' },
                    { id: 'today', label: 'Hoy' }
                  ].map(p => (
                    <button
                      key={p.id}
                      onClick={() => handlePresetChange(p.id)}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        presetPeriod === p.id 
                          ? 'bg-slate-900 text-white shadow-sm' 
                          : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <DateInput
                    value={dateFrom}
                    onChange={val => {
                      setPresetPeriod('custom');
                      setDateFrom(val);
                      loadHistoryData(val, dateTo);
                    }}
                  />
                  <span className="text-slate-400 font-bold text-xs">a</span>
                  <DateInput
                    value={dateTo}
                    onChange={val => {
                      setPresetPeriod('custom');
                      setDateTo(val);
                      loadHistoryData(dateFrom, val);
                    }}
                  />
                </div>
              </div>

              {/* Financial & Commercial ROAS Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 1. Inversion Total */}
                <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                      💰 Inversión en Pauta Total
                    </span>
                    <div className="p-2 bg-rose-50 text-rose-600 rounded-xl">
                      <DollarSign className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="text-2xl font-black text-slate-900 tracking-tight">
                    {formatPrice(historySummary?.totalInvestmentArs || 0)}
                  </div>
                  <p className="text-[11px] text-slate-500 font-semibold font-mono">
                    Pauta: {formatPrice(historySummary?.totalSpendArs || 0)} | Fee: {formatPrice(historySummary?.totalFeeArs || 0)}
                  </p>
                </div>

                {/* 2. Facturacion ERP */}
                <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                      🏷️ Facturación ERP (Período)
                    </span>
                    <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                      <TrendingUp className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="text-2xl font-black text-emerald-600 tracking-tight">
                    {formatPrice(historySummary?.erpRevenueArs || 0)}
                  </div>
                  <p className="text-[11px] text-slate-500 font-semibold">
                    {historySummary?.erpOrdersCount || 0} pedidos confirmados en el ERP
                  </p>
                </div>

                {/* 3. ROAS Global */}
                <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                      Ventas totales / inversión
                    </span>
                    <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                      <Sparkles className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="text-2xl font-black text-indigo-600 tracking-tight">
                    {historySummary?.roas || 0}x <span className="block text-xs font-normal text-slate-500">Incluye todas las ventas ERP; no atribuye ventas a los anuncios.</span>
                  </div>
                  <p className="text-[11px] text-slate-500 font-semibold">
                    Retorno sobre cada $1 invertido en publicidad
                  </p>
                </div>

                {/* 4. CAC & Conversion */}
                <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                      👥 Costo de Adquisición (CAC)
                    </span>
                    <div className="p-2 bg-purple-50 text-purple-600 rounded-xl">
                      <Target className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="text-2xl font-black text-slate-900 tracking-tight">
                    {formatPrice(historySummary?.cac || 0)} <span className="text-xs font-bold text-slate-400">/ cliente</span>
                  </div>
                  <p className="text-[11px] text-slate-500 font-semibold">
                    Conversión: {historySummary?.conversionRate || 0}% de leads cerrados
                  </p>
                </div>
              </div>

              {/* Search & Filter History */}
              <div className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3 w-full sm:w-auto">
                  <div className="relative flex-1 sm:w-80">
                    <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Buscar por campaña o cuenta..."
                      value={historySearchQuery}
                      onChange={e => setHistorySearchQuery(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  {distinctCategories.length > 0 && (
                    <select
                      value={historyCategoryFilter}
                      onChange={e => setHistoryCategoryFilter(e.target.value)}
                      className="py-2 px-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-700 focus:outline-none"
                    >
                      <option value="all">Todas las Categorías</option>
                      {distinctCategories.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  )}
                </div>

                <span className="text-xs font-bold text-slate-500">
                  {filteredHistoryRecords.length} registros en el período
                </span>
              </div>

              {/* History Table */}
              <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-slate-50 sticky top-0 border-b border-slate-200">
                      <tr className="text-slate-400 font-black uppercase tracking-wider text-[9px]">
                        <th className="p-3.5">Fecha</th>
                        <th className="p-3.5">Campaña</th>
                        <th className="p-3.5 text-center">Categoría</th>
                        <th className="p-3.5 text-right">Mensajes</th>
                        <th className="p-3.5 text-right">Gasto USD</th>
                        <th className="p-3.5 text-right">Total Publi ARS</th>
                        <th className="p-3.5 text-right">Fee ARS</th>
                        <th className="p-3.5 text-right">Inversión Total</th>
                        <th className="p-3.5 text-right">CPR (ARS)</th>
                        <th className="p-3.5 text-right">Alcance</th>
                        <th className="p-3.5 text-right">Impresiones</th>
                        <th className="p-3.5 text-center">CTR</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-bold text-slate-700">
                      {filteredHistoryRecords.length === 0 ? (
                        <tr>
                          <td colSpan={12} className="p-8 text-center text-slate-400 font-bold">
                            No se encontraron registros para el rango de fechas seleccionado.
                          </td>
                        </tr>
                      ) : (
                        filteredHistoryRecords.map((r, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                            <td className="p-3.5 text-slate-900 font-mono text-[11px] whitespace-nowrap">
                              {r.date}
                            </td>
                            <td className="p-3.5">
                              <div className="font-bold text-slate-900 text-xs max-w-sm truncate" title={r.campaign}>
                                {r.campaign}
                              </div>
                            </td>
                            <td className="p-3.5 text-center">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-bold bg-slate-100 text-slate-700">
                                {r.category}
                              </span>
                            </td>
                            <td className="p-3.5 text-right font-black text-indigo-600">
                              {r.messages}
                            </td>
                            <td className="p-3.5 text-right font-mono text-slate-600">
                              US$ {r.spendUsd.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="p-3.5 text-right font-mono text-slate-700">
                              {formatPrice(r.spendArs)}
                            </td>
                            <td className="p-3.5 text-right font-mono text-slate-400">
                              {formatPrice(r.feeArs)}
                            </td>
                            <td className="p-3.5 text-right font-mono text-slate-900 font-bold">
                              {formatPrice(r.totalInvestmentArs)}
                            </td>
                            <td className="p-3.5 text-right font-mono text-indigo-600 font-bold">
                              {formatPrice(r.cprArs)}
                            </td>
                            <td className="p-3.5 text-right font-mono text-slate-500">
                              {r.reach.toLocaleString('es-AR')}
                            </td>
                            <td className="p-3.5 text-right font-mono text-slate-500">
                              {r.impressions.toLocaleString('es-AR')}
                            </td>
                            <td className="p-3.5 text-center font-mono text-slate-600">
                              {r.ctr}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Modal de Previsualización de Creativo */}
      {previewAd && (
        <div 
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setPreviewAd(null)}
        >
          <div 
            className="bg-white rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-[10px] font-black uppercase tracking-wider text-indigo-600">
                  Previsualización de Anuncio
                </span>
                <h3 className="text-sm font-black text-slate-900 line-clamp-1">
                  {previewAd.name}
                </h3>
              </div>
              <button
                onClick={() => setPreviewAd(null)}
                className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[85vh] overflow-y-auto">
              {/* Image Preview */}
              <div className="relative w-full aspect-square max-h-80 rounded-2xl overflow-hidden bg-slate-900 border border-slate-200 flex items-center justify-center">
                {previewAd.thumbnailUrl || previewAd.imageUrl ? (
                  <img 
                    src={previewAd.imageUrl || previewAd.thumbnailUrl || ''} 
                    alt={previewAd.name} 
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="text-slate-400 text-xs font-bold flex flex-col items-center gap-1">
                    <ImageIcon className="w-8 h-8 opacity-40" />
                    <span>Sin imagen disponible</span>
                  </div>
                )}
              </div>

              {/* Text content */}
              {(previewAd.title || previewAd.body) && (
                <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-2 text-xs">
                  {previewAd.title && (
                    <div className="font-black text-slate-900 text-sm">
                      {previewAd.title}
                    </div>
                  )}
                  {previewAd.body && (
                    <p className="text-slate-600 whitespace-pre-line text-[11px] leading-relaxed font-medium">
                      {previewAd.body}
                    </p>
                  )}
                </div>
              )}

              {/* Performance snapshot */}
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="bg-slate-50 p-2.5 rounded-2xl border border-slate-100">
                  <span className="text-[10px] font-bold text-slate-400 block">Mensajes Hoy</span>
                  <strong className="text-indigo-600 text-base font-black">{previewAd.messages}</strong>
                </div>
                <div className="bg-slate-50 p-2.5 rounded-2xl border border-slate-100">
                  <span className="text-[10px] font-bold text-slate-400 block">Gasto Hoy</span>
                  <strong className="text-slate-900 text-sm font-mono font-bold">US$ {previewAd.spendUsd.toFixed(2)}</strong>
                  <span className="text-[9.5px] text-slate-400 block font-mono">{formatPrice(previewAd.spendArs)}</span>
                </div>
                <div className="bg-slate-50 p-2.5 rounded-2xl border border-slate-100">
                  <span className="text-[10px] font-bold text-slate-400 block">CPR Hoy</span>
                  <strong className="text-emerald-600 text-sm font-mono font-bold">
                    {previewAd.messages > 0 ? `US$ ${previewAd.costPerActionUsd.toFixed(2)}` : '-'}
                  </strong>
                  <span className="text-[9.5px] text-slate-400 block font-mono">
                    {previewAd.messages > 0 ? formatPrice(previewAd.cprArs) : '-'}
                  </span>
                </div>
              </div>

              {!liveFresh && <p className="text-amber-700 text-sm">Datos no vigentes. Actualizar antes de decidir.</p>}
              {liveFresh && previewAd.alerts && previewAd.alerts.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  {previewAd.alerts.map((al, alIdx) => (
                    <span 
                      key={alIdx} 
                      className={`px-2.5 py-1 rounded-xl text-xs font-black border ${
                        al.includes('persistente')
                          ? 'bg-rose-50 text-rose-700 border-rose-200' 
                          : /elevad|costoso|Gasto sin/.test(al)
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : al.includes('Candidata') ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-600 border-slate-200'
                      }`}
                    >
                      {al}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

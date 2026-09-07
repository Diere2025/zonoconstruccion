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
  Calculator
} from "lucide-react";
import { formatPrice } from "@/lib/utils";

interface LiveCampaign {
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
  const [activeTab, setActiveTab] = useState<'live' | 'charts' | 'history'>('charts');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>("");

  // Live Data State
  const [liveSummary, setLiveSummary] = useState<any>(null);
  const [liveCampaigns, setLiveCampaigns] = useState<LiveCampaign[]>([]);
  const [liveSearchQuery, setLiveSearchQuery] = useState("");
  const [liveLineFilter, setLiveLineFilter] = useState("all");
  const [liveStatusFilter, setLiveStatusFilter] = useState<string>("all");

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
      if (!res.ok) throw new Error('Error al cargar histórico');
      const data = await res.json();
      setHistorySummary(data.summary || null);
      setHistoryRecords(data.records || []);
      setDailyTimeline(data.dailyTimeline || []);
      setCategoriesSummary(data.categories || []);
    } catch (err: any) {
      console.error(err);
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

  // Fetch Live Data
  const loadLiveData = async () => {
    try {
      const res = await fetch('/api/admin/meta-ads-sheet?tab=live');
      if (!res.ok) throw new Error('Error al cargar datos en vivo');
      const data = await res.json();
      setLiveSummary(data.summary || null);
      setLiveCampaigns(data.campaigns || []);
      setLastUpdated(new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    } catch (err: any) {
      console.error(err);
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
      await loadLiveData();
    } else {
      await loadHistoryData(dateFrom, dateTo);
    }
    setRefreshing(false);
  };

  // Filtered Live Campaigns
  const filteredLiveCampaigns = useMemo(() => {
    return liveCampaigns.filter(c => {
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

      return matchesSearch && matchesLine && matchesStatus;
    });
  }, [liveCampaigns, liveSearchQuery, liveLineFilter, liveStatusFilter]);

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
    <div className="space-y-6 pb-12">
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
                Monitoreo en tiempo real de pauta, generación de leads a Whaticket y retorno comercial (ROAS).
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
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
            {refreshing ? 'Sincronizando...' : 'Sincronizar Planilla'}
          </button>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-2">
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
          onClick={() => setActiveTab('live')}
          className={`px-5 py-2.5 rounded-2xl font-black text-xs transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'live'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Activity className="w-4 h-4" />
          ⚡ En Vivo Hoy (MSG-Hoy)
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
                      🚀 Retorno ROAS (Ventas ERP)
                    </span>
                    <div className="p-2 bg-purple-50 text-purple-600 rounded-xl">
                      <Sparkles className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="text-2xl font-black text-indigo-600 tracking-tight">
                    {historySummary?.roas || 0}x
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
                      { id: 'roas', label: '🚀 ROAS Diario' }
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
                            <span className="text-[10px] uppercase font-bold text-slate-400">ROAS:</span>{' '}
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
                    const isLowCpr = cat.cprArs > 0 && cat.cprArs <= 2500;
                    const isHighCpr = cat.cprArs > 4500;
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
                          const isLowCpr = cat.cprArs <= 2500;
                          const isHighCpr = cat.cprArs > 4500;

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
                                  {isLowCpr ? '🔥 Muy Eficiente' : isHighCpr ? '⚠️ Alto Costo' : '⚖️ Moderado'}
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

              {/* Filters Bar */}
              <div className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3 w-full sm:w-auto">
                  <div className="relative flex-1 sm:w-80">
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
                    <div className="flex items-center gap-2">
                      <PhoneCall className="w-4 h-4 text-slate-400" />
                      <select
                        value={liveLineFilter}
                        onChange={e => setLiveLineFilter(e.target.value)}
                        className="py-2 px-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-700 focus:outline-none"
                      >
                        <option value="all">Todas las Líneas</option>
                        {distinctLiveLines.map(line => (
                          <option key={line} value={line}>Línea {line}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Status Filter */}
                  <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-2xl border border-slate-200 text-xs">
                    <button
                      type="button"
                      onClick={() => setLiveStatusFilter('all')}
                      className={`px-3 py-1 rounded-xl font-bold transition-all cursor-pointer ${
                        liveStatusFilter === 'all'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      Todas ({liveCampaigns.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setLiveStatusFilter('active')}
                      className={`px-3 py-1 rounded-xl font-bold transition-all cursor-pointer flex items-center gap-1 ${
                        liveStatusFilter === 'active'
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
                      className={`px-3 py-1 rounded-xl font-bold transition-all cursor-pointer flex items-center gap-1 ${
                        liveStatusFilter === 'paused'
                          ? 'bg-amber-600 text-white shadow-xs'
                          : 'text-amber-700 hover:bg-amber-50'
                      }`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                      Pausadas ({liveSummary?.pausedCampaignsCount || liveCampaigns.filter(c => c.status === 'PAUSED').length})
                    </button>
                  </div>
                </div>

                <span className="text-xs font-bold text-slate-500">
                  Mostrando {filteredLiveCampaigns.length} de {liveCampaigns.length} campañas
                </span>
              </div>

              {/* Live Campaigns Table */}
              <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-black uppercase tracking-wider text-[9px]">
                        <th className="p-4">Estado</th>
                        <th className="p-4">Campaña / Oferta</th>
                        <th className="p-4 text-center">Línea WhatsApp</th>
                        <th className="p-4 text-right">Mensajes Hoy</th>
                        <th className="p-4 text-right">Gasto Hoy (USD)</th>
                        <th className="p-4 text-right">Gasto Hoy (ARS)</th>
                        <th className="p-4 text-right">CPR Hoy (ARS)</th>
                        <th className="p-4 text-right">Presupuesto Diario</th>
                        <th className="p-4 text-center">% Consumo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-bold text-slate-700">
                      {filteredLiveCampaigns.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="p-8 text-center text-slate-400">
                            No se encontraron campañas para los filtros seleccionados.
                          </td>
                        </tr>
                      ) : (
                        filteredLiveCampaigns.map((c, idx) => {
                          const isHighCpr = c.cprArs > 4500;
                          const isLowCpr = c.cprArs > 0 && c.cprArs <= 2500;
                          const isActiva = c.status.toUpperCase() === 'ACTIVE' || c.status.toUpperCase() === 'ACTIVA' || c.status.toUpperCase() === 'ON';

                          return (
                            <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
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
                                <div className="space-y-0.5 max-w-md">
                                  <div className="font-bold text-slate-900 text-xs truncate" title={c.campaignName}>
                                    {c.campaignName}
                                  </div>
                                  {c.commercialOffer && (
                                    <div className="text-[11px] text-indigo-600 font-bold">
                                      {c.commercialOffer}
                                    </div>
                                  )}
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
                            </tr>
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
                      🚀 ROAS Comercial Real
                    </span>
                    <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                      <Sparkles className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="text-2xl font-black text-indigo-600 tracking-tight">
                    {historySummary?.roas || 0}x
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
    </div>
  );
}

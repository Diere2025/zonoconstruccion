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
  Loader2
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
  const [activeTab, setActiveTab] = useState<'live' | 'history'>('live');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>("");

  // Live Data State
  const [liveSummary, setLiveSummary] = useState<any>(null);
  const [liveCampaigns, setLiveCampaigns] = useState<LiveCampaign[]>([]);
  const [liveSearchQuery, setLiveSearchQuery] = useState("");
  const [liveLineFilter, setLiveLineFilter] = useState("all");

  // History Data State - Synchronously initialized to current month
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
  const [historySearchQuery, setHistorySearchQuery] = useState("");
  const [historyCategoryFilter, setHistoryCategoryFilter] = useState("all");

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

      return matchesSearch && matchesLine;
    });
  }, [liveCampaigns, liveSearchQuery, liveLineFilter]);

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

  // Category breakdown for history
  const categoryBreakdown = useMemo(() => {
    const map: Record<string, { name: string; investment: number; messages: number; spendUsd: number }> = {};
    historyRecords.forEach(r => {
      const cat = r.category || 'Otros';
      if (!map[cat]) map[cat] = { name: cat, investment: 0, messages: 0, spendUsd: 0 };
      map[cat].investment += r.totalInvestmentArs;
      map[cat].messages += r.messages;
      map[cat].spendUsd += r.spendUsd;
    });
    return Object.values(map).sort((a, b) => b.investment - a.investment);
  }, [historyRecords]);

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
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
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
          <BarChart3 className="w-4 h-4" />
          📈 Histórico & Rentabilidad (CálculoParaEERR)
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
          {/* TAB 1: EN VIVO HOY */}
          {/* ========================================================================= */}
          {activeTab === 'live' && (
            <div className="space-y-6">
              {/* Executive Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 1. Leads Hoy */}
                <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm space-y-2 relative overflow-hidden">
                  <div className="flex items-center justify-between">
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

                {/* 2. Inversión Hoy */}
                <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm space-y-2 relative overflow-hidden">
                  <div className="flex items-center justify-between">
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

                {/* 3. CPR Promedio */}
                <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm space-y-2 relative overflow-hidden">
                  <div className="flex items-center justify-between">
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

                {/* 4. Pacing Presupuesto */}
                <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm space-y-2 relative overflow-hidden">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                      📊 Presupuesto del Día
                    </span>
                    <div className="p-2 bg-purple-50 text-purple-600 rounded-xl">
                      <Activity className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="text-2xl font-black text-slate-900 tracking-tight">
                    {liveSummary?.pacingPercent || 0}% <span className="text-xs font-bold text-slate-400">consumido</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                    <div 
                      className="bg-indigo-600 h-full rounded-full transition-all"
                      style={{ width: `${Math.min(100, liveSummary?.pacingPercent || 0)}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-slate-400 font-semibold">
                    Límite diario: {formatPrice(liveSummary?.totalBudgetArs || 0)}
                  </p>
                </div>
              </div>

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
                </div>

                <span className="text-xs font-bold text-slate-500">
                  {filteredLiveCampaigns.length} campañas activas
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
                            No se encontraron campañas activas para los filtros seleccionados.
                          </td>
                        </tr>
                      ) : (
                        filteredLiveCampaigns.map((c, idx) => {
                          const isHighCpr = c.cprArs > 4500;
                          const isLowCpr = c.cprArs > 0 && c.cprArs <= 2500;

                          return (
                            <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                              <td className="p-4">
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                  ACTIVA
                                </span>
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
                              <td className="p-4 text-right font-black text-indigo-600 text-sm">
                                {c.messages}
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
          {/* TAB 2: HISTÓRICO Y RENTABILIDAD */}
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

              {/* Category Breakdown Cards */}
              <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-4">
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <PieChart className="w-4 h-4 text-indigo-600" />
                  Distribución de Inversión por Línea de Producto
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                  {categoryBreakdown.map(cat => (
                    <div key={cat.name} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-1">
                      <div className="text-xs font-black text-slate-800">{cat.name}</div>
                      <div className="text-base font-black text-indigo-600">{formatPrice(cat.investment)}</div>
                      <div className="text-[11px] text-slate-500 font-semibold flex justify-between pt-1 border-t border-slate-200">
                        <span>{cat.messages} mensajes</span>
                        <span>US$ {Math.round(cat.spendUsd)}</span>
                      </div>
                    </div>
                  ))}
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

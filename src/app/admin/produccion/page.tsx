"use client";

import React, { useState, useEffect, useMemo } from "react";
import { 
  Factory, 
  Wrench, 
  Calendar, 
  User, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  RefreshCw, 
  Download, 
  ExternalLink, 
  Search, 
  Filter, 
  X, 
  TrendingUp, 
  Loader2, 
  Sparkles, 
  Layers, 
  Award,
  BarChart3,
  Flame,
  AlertCircle
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ProductionItem, AssemblyItem } from "@/app/api/admin/produccion-data/route";

export default function ProduccionPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastSync, setLastSync] = useState<string>("");
  const [fabricacionData, setFabricacionData] = useState<ProductionItem[]>([]);
  const [ensamblajeData, setEnsamblajeData] = useState<AssemblyItem[]>([]);
  const [operatorsList, setOperatorsList] = useState<string[]>([]);

  // Navigation tabs
  const [activeTab, setActiveTab] = useState<'fabricacion' | 'ensamblaje' | 'operarios' | 'incidencias'>('fabricacion');

  // Filters
  const [datePreset, setDatePreset] = useState<'today' | 'yesterday' | 'last7' | 'thisMonth' | 'lastMonth' | 'all' | 'custom'>('thisMonth');
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedOperator, setSelectedOperator] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [selectedQuality, setSelectedQuality] = useState("all");
  const [selectedMachine, setSelectedMachine] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Operator distinctive badges
  const getOperatorStyle = (name?: string | null) => {
    if (!name || name === "Sin Asignar") return { bg: "bg-slate-100", text: "text-slate-600", border: "border-slate-200", dot: "bg-slate-400" };
    const lower = name.toLowerCase().trim();
    if (lower.includes("rodrigo")) return { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200", dot: "bg-blue-500" };
    if (lower.includes("leonardo") || lower.includes("leo")) return { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200", dot: "bg-purple-500" };
    if (lower.includes("julio")) return { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", dot: "bg-emerald-500" };
    if (lower.includes("samuel")) return { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", dot: "bg-amber-500" };
    if (lower.includes("gabriel")) return { bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200", dot: "bg-rose-500" };
    if (lower.includes("matias") || lower.includes("matías")) return { bg: "bg-cyan-50", text: "text-cyan-700", border: "border-cyan-200", dot: "bg-cyan-500" };
    if (lower.includes("pablo")) return { bg: "bg-indigo-50", text: "text-indigo-700", border: "border-indigo-200", dot: "bg-indigo-500" };
    if (lower.includes("antonio")) return { bg: "bg-teal-50", text: "text-teal-700", border: "border-teal-200", dot: "bg-teal-500" };
    if (lower.includes("leandro")) return { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200", dot: "bg-orange-500" };
    return { bg: "bg-violet-50", text: "text-violet-700", border: "border-violet-200", dot: "bg-violet-500" };
  };

  // Initialize date range to This Month
  useEffect(() => {
    applyDatePreset('thisMonth');
  }, []);

  const applyDatePreset = (preset: 'today' | 'yesterday' | 'last7' | 'thisMonth' | 'lastMonth' | 'all' | 'custom') => {
    setDatePreset(preset);
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    if (preset === 'today') {
      setDateFrom(todayStr);
      setDateTo(todayStr);
    } else if (preset === 'yesterday') {
      const y = new Date(Date.now() - 86400000).toISOString().split('T')[0];
      setDateFrom(y);
      setDateTo(y);
    } else if (preset === 'last7') {
      const d7 = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
      setDateFrom(d7);
      setDateTo(todayStr);
    } else if (preset === 'thisMonth') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      setDateFrom(firstDay);
      setDateTo(todayStr);
    } else if (preset === 'lastMonth') {
      const firstDayPrev = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];
      const lastDayPrev = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0];
      setDateFrom(firstDayPrev);
      setDateTo(lastDayPrev);
    } else if (preset === 'all') {
      setDateFrom("");
      setDateTo("");
    }
  };

  const fetchData = async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const res = await fetch('/api/admin/produccion-data', { cache: 'no-store' });
      const json = await res.json();
      if (json.success && json.data) {
        setFabricacionData(json.data.fabricacion || []);
        setEnsamblajeData(json.data.ensamblaje || []);
        setOperatorsList(json.data.operators || []);
        setLastSync(new Date(json.data.lastSync).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      } else {
        alert("Error al cargar datos: " + (json.error || "Desconocido"));
      }
    } catch (e: any) {
      console.error("Fetch error:", e);
      alert("Error de conexión: " + e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Filtered Fabricación Items
  const filteredFabricacion = useMemo(() => {
    return fabricacionData.filter(item => {
      // Date filter
      if (dateFrom && item.fecha < dateFrom) return false;
      if (dateTo && item.fecha > dateTo) return false;

      // Operator filter
      if (selectedOperator !== "all" && item.operario !== selectedOperator && item.operarioSecundario !== selectedOperator) {
        return false;
      }

      // Status filter
      if (selectedStatus !== "all") {
        if (selectedStatus === "Fabricado" && item.estado !== "Fabricado") return false;
        if (selectedStatus === "Planificado" && item.estado !== "Planificado") return false;
        if (selectedStatus === "Cancelado" && item.estado !== "Cancelado") return false;
      }

      // Quality filter
      if (selectedQuality !== "all") {
        if (item.calidad.toLowerCase() !== selectedQuality.toLowerCase()) return false;
      }

      // Machine filter
      if (selectedMachine !== "all") {
        if (item.tipoMaquina.toUpperCase() !== selectedMachine.toUpperCase()) return false;
      }

      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const match = item.producto.toLowerCase().includes(q) ||
          item.operario.toLowerCase().includes(q) ||
          item.observaciones.toLowerCase().includes(q);
        if (!match) return false;
      }

      return true;
    });
  }, [fabricacionData, dateFrom, dateTo, selectedOperator, selectedStatus, selectedQuality, selectedMachine, searchQuery]);

  // Filtered Ensamblaje Items
  const filteredEnsamblaje = useMemo(() => {
    return ensamblajeData.filter(item => {
      // Date filter
      if (dateFrom && item.fecha < dateFrom) return false;
      if (dateTo && item.fecha > dateTo) return false;

      // Operator filter
      if (selectedOperator !== "all" && item.operario !== selectedOperator) {
        return false;
      }

      // Status filter
      if (selectedStatus !== "all") {
        if (selectedStatus === "Fabricado" && item.estado !== "Ensamblado") return false;
        if (selectedStatus === "Planificado" && item.estado !== "Planificado") return false;
        if (selectedStatus === "Cancelado" && item.estado !== "Cancelado") return false;
      }

      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const match = item.producto.toLowerCase().includes(q) ||
          item.operario.toLowerCase().includes(q);
        if (!match) return false;
      }

      return true;
    });
  }, [ensamblajeData, dateFrom, dateTo, selectedOperator, selectedStatus, searchQuery]);

  // Combined KPIs
  const stats = useMemo(() => {
    let totalFabricado = 0;
    let totalPlanificadoFab = 0;
    let totalDePrimera = 0;
    let totalSegunda = 0;
    let totalRoturas = 0;

    filteredFabricacion.forEach(item => {
      if (item.estado === "Fabricado") {
        totalFabricado += item.cantidad;
        const q = item.calidad.toLowerCase();
        if (q.includes("primera")) totalDePrimera += item.cantidad;
        else if (q.includes("segunda")) totalSegunda += item.cantidad;
        else if (q.includes("roto") || q.includes("inutilizable") || q.includes("descarte")) totalRoturas += item.cantidad;
        else totalDePrimera += item.cantidad;
      } else if (item.estado === "Planificado") {
        totalPlanificadoFab += item.cantidad;
      }
    });

    let totalEnsamblado = 0;
    let totalPlanificadoEns = 0;

    filteredEnsamblaje.forEach(item => {
      if (item.estado === "Ensamblado") totalEnsamblado += item.cantidad;
      else if (item.estado === "Planificado") totalPlanificadoEns += item.cantidad;
    });

    const qualityRate = totalFabricado > 0 ? ((totalDePrimera / totalFabricado) * 100).toFixed(1) : "100";

    return {
      totalFabricado,
      totalEnsamblado,
      totalPlanificado: totalPlanificadoFab + totalPlanificadoEns,
      totalDePrimera,
      totalSegunda,
      totalRoturas,
      qualityRate
    };
  }, [filteredFabricacion, filteredEnsamblaje]);

  // Operator Productivity Breakdown
  const operatorMetrics = useMemo(() => {
    const map: Record<string, {
      name: string;
      totalFabricado: number;
      dePrimera: number;
      segundaORoto: number;
      totalEnsamblado: number;
      diasActivo: Set<string>;
      productos: Record<string, number>;
    }> = {};

    filteredFabricacion.forEach(item => {
      if (item.estado !== "Fabricado" || !item.operario || item.operario === "Sin Asignar") return;
      if (!map[item.operario]) {
        map[item.operario] = {
          name: item.operario,
          totalFabricado: 0,
          dePrimera: 0,
          segundaORoto: 0,
          totalEnsamblado: 0,
          diasActivo: new Set(),
          productos: {}
        };
      }
      map[item.operario].totalFabricado += item.cantidad;
      map[item.operario].diasActivo.add(item.fecha);

      const q = item.calidad.toLowerCase();
      if (q.includes("segunda") || q.includes("roto") || q.includes("inutilizable")) {
        map[item.operario].segundaORoto += item.cantidad;
      } else {
        map[item.operario].dePrimera += item.cantidad;
      }

      map[item.operario].productos[item.producto] = (map[item.operario].productos[item.producto] || 0) + item.cantidad;
    });

    filteredEnsamblaje.forEach(item => {
      if (item.estado !== "Ensamblado" || !item.operario || item.operario === "Sin Asignar") return;
      if (!map[item.operario]) {
        map[item.operario] = {
          name: item.operario,
          totalFabricado: 0,
          dePrimera: 0,
          segundaORoto: 0,
          totalEnsamblado: 0,
          diasActivo: new Set(),
          productos: {}
        };
      }
      map[item.operario].totalEnsamblado += item.cantidad;
      map[item.operario].diasActivo.add(item.fecha);
    });

    return Object.values(map).sort((a, b) => (b.totalFabricado + b.totalEnsamblado) - (a.totalFabricado + a.totalEnsamblado));
  }, [filteredFabricacion, filteredEnsamblaje]);

  // Top Products Breakdown
  const topProducts = useMemo(() => {
    const countMap: Record<string, number> = {};
    filteredFabricacion.forEach(item => {
      if (item.estado === "Fabricado") {
        countMap[item.producto] = (countMap[item.producto] || 0) + item.cantidad;
      }
    });
    return Object.entries(countMap)
      .map(([producto, total]) => ({ producto, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }, [filteredFabricacion]);

  // Export CSV
  const handleExportCSV = () => {
    let csvContent = "";
    if (activeTab === 'fabricacion' || activeTab === 'incidencias') {
      csvContent += "Fecha,Producto,Cantidad,Turno,Tipo Máquina,Operario,Operario Secundario,Calidad,Estado,Observaciones\n";
      filteredFabricacion.forEach(row => {
        csvContent += `"${row.fechaFormatted}","${row.producto}",${row.cantidad},"${row.turno}","${row.tipoMaquina}","${row.operario}","${row.operarioSecundario || ''}","${row.calidad}","${row.estado}","${(row.observaciones || '').replace(/"/g, '""')}"\n`;
      });
    } else if (activeTab === 'ensamblaje') {
      csvContent += "Fecha,Producto,Cantidad,Operario,Turno,Estado\n";
      filteredEnsamblaje.forEach(row => {
        csvContent += `"${row.fechaFormatted}","${row.producto}",${row.cantidad},"${row.operario}","${row.turno}","${row.estado}"\n`;
      });
    } else {
      csvContent += "Operario,Total Fabricado,De Primera,Segunda / Rotos,% Calidad,Total Ensamblado,Días Activos\n";
      operatorMetrics.forEach(op => {
        const rate = op.totalFabricado > 0 ? ((op.dePrimera / op.totalFabricado) * 100).toFixed(1) + "%" : "100%";
        csvContent += `"${op.name}",${op.totalFabricado},${op.dePrimera},${op.segundaORoto},"${rate}",${op.totalEnsamblado},${op.diasActivo.size}\n`;
      });
    }

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reporte_${activeTab}_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center text-brand-600">
              <Factory className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                Control y Rendimiento de Producción
                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  En Vivo
                </span>
              </h1>
              <p className="text-xs text-slate-400 font-semibold mt-0.5">
                Seguimiento integral de rotomoldeo, ensamblaje, calidad y métricas de operarios.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {lastSync && (
            <span className="text-[10px] font-bold text-slate-400 hidden sm:inline-block">
              Última sincronización: {lastSync}
            </span>
          )}

          <Button
            onClick={() => fetchData(true)}
            disabled={loading || refreshing}
            className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-black transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            {refreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Sincronizar Planilla
          </Button>

          <Button
            onClick={handleExportCSV}
            className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" /> Exportar CSV
          </Button>

          <a
            href="https://docs.google.com/spreadsheets/d/1z_yqAdxYn0aESDIARhL_Y9KyYSidQ2tp7Ezkqde0IE0/"
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 bg-slate-50 hover:bg-slate-100 text-slate-500 hover:text-slate-800 rounded-xl border border-slate-200 transition-colors shadow-2xs"
            title="Abrir Planilla de Producción en Google Sheets"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        {/* Total Fabricado */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Total Fabricado</span>
            <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
              <Factory className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-slate-900 tracking-tight">
              {stats.totalFabricado.toLocaleString('es-AR')} <span className="text-xs font-semibold text-slate-400">u.</span>
            </div>
            <p className="text-[10px] text-blue-600 font-bold mt-0.5">Piezas rotomoldeadas</p>
          </div>
        </div>

        {/* Total Ensamblado */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Total Ensamblado</span>
            <div className="p-1.5 bg-purple-50 text-purple-600 rounded-lg">
              <Wrench className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-slate-900 tracking-tight">
              {stats.totalEnsamblado.toLocaleString('es-AR')} <span className="text-xs font-semibold text-slate-400">u.</span>
            </div>
            <p className="text-[10px] text-purple-600 font-bold mt-0.5">Productos armados</p>
          </div>
        </div>

        {/* Total Planificado */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Planificado Futuro</span>
            <div className="p-1.5 bg-amber-50 text-amber-600 rounded-lg">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-slate-900 tracking-tight">
              {stats.totalPlanificado.toLocaleString('es-AR')} <span className="text-xs font-semibold text-slate-400">u.</span>
            </div>
            <p className="text-[10px] text-amber-600 font-bold mt-0.5">En cola de trabajo</p>
          </div>
        </div>

        {/* Tasa Calidad de Primera */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Calidad de Primera</span>
            <div className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg">
              <Award className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-emerald-700 tracking-tight">
              {stats.qualityRate}%
            </div>
            <p className="text-[10px] text-emerald-600 font-bold mt-0.5">{stats.totalDePrimera} u. óptimas</p>
          </div>
        </div>

        {/* Roturas / Segunda */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Descartes / Segunda</span>
            <div className="p-1.5 bg-rose-50 text-rose-600 rounded-lg">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-rose-600 tracking-tight">
              {stats.totalRoturas + stats.totalSegunda} <span className="text-xs font-semibold text-slate-400">u.</span>
            </div>
            <p className="text-[10px] text-rose-500 font-bold mt-0.5">{stats.totalRoturas} rotos · {stats.totalSegunda} segunda</p>
          </div>
        </div>
      </div>

      {/* Main Filter & Navigation Panel */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 space-y-4">
        {/* Navigation Tabs */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-100 pb-3">
          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200/60 overflow-x-auto max-w-full">
            <button
              onClick={() => setActiveTab('fabricacion')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'fabricacion' ? 'bg-white text-brand-600 shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Factory className="w-3.5 h-3.5" /> Fabricación ({filteredFabricacion.length})
            </button>
            <button
              onClick={() => setActiveTab('ensamblaje')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'ensamblaje' ? 'bg-white text-purple-700 shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Wrench className="w-3.5 h-3.5" /> Ensamblaje ({filteredEnsamblaje.length})
            </button>
            <button
              onClick={() => setActiveTab('operarios')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'operarios' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" /> Rendimiento de Operarios ({operatorMetrics.length})
            </button>
            <button
              onClick={() => setActiveTab('incidencias')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'incidencias' ? 'bg-white text-amber-700 shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <AlertCircle className="w-3.5 h-3.5" /> Incidencias / Observaciones ({filteredFabricacion.filter(f => f.observaciones).length})
            </button>
          </div>

          {/* Quick Date Presets */}
          <div className="flex bg-slate-100 p-0.5 rounded-xl text-[10px] font-bold text-slate-600 flex-wrap">
            <button
              onClick={() => applyDatePreset('today')}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${datePreset === 'today' ? 'bg-white text-slate-900 shadow-2xs' : 'hover:text-slate-900'}`}
            >
              Hoy
            </button>
            <button
              onClick={() => applyDatePreset('yesterday')}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${datePreset === 'yesterday' ? 'bg-white text-slate-900 shadow-2xs' : 'hover:text-slate-900'}`}
            >
              Ayer
            </button>
            <button
              onClick={() => applyDatePreset('last7')}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${datePreset === 'last7' ? 'bg-white text-slate-900 shadow-2xs' : 'hover:text-slate-900'}`}
            >
              Últimos 7d
            </button>
            <button
              onClick={() => applyDatePreset('thisMonth')}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${datePreset === 'thisMonth' ? 'bg-white text-slate-900 shadow-2xs' : 'hover:text-slate-900'}`}
            >
              Este Mes
            </button>
            <button
              onClick={() => applyDatePreset('lastMonth')}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${datePreset === 'lastMonth' ? 'bg-white text-slate-900 shadow-2xs' : 'hover:text-slate-900'}`}
            >
              Mes Anterior
            </button>
            <button
              onClick={() => applyDatePreset('all')}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${datePreset === 'all' ? 'bg-white text-slate-900 shadow-2xs' : 'hover:text-slate-900'}`}
            >
              Histórico
            </button>
          </div>
        </div>

        {/* Filter Controls Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 pt-1">
          {/* Search bar */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar producto o detalle..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-7 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-brand-500/10 focus:border-brand-500"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Operator Filter */}
          <div>
            <select
              value={selectedOperator}
              onChange={e => setSelectedOperator(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-brand-500/10 focus:border-brand-500 cursor-pointer"
            >
              <option value="all">👤 Todos los Operarios</option>
              {operatorsList.map(op => (
                <option key={op} value={op}>
                  {op}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={selectedStatus}
              onChange={e => setSelectedStatus(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-brand-500/10 focus:border-brand-500 cursor-pointer"
            >
              <option value="all">⚙️ Estado: Todos</option>
              <option value="Fabricado">✅ Fabricado / Ensamblado</option>
              <option value="Planificado">📅 Planificado (Futuro)</option>
              <option value="Cancelado">❌ Cancelado</option>
            </select>
          </div>

          {/* Quality Filter (Fabricacion) */}
          <div>
            <select
              value={selectedQuality}
              onChange={e => setSelectedQuality(e.target.value)}
              disabled={activeTab === 'ensamblaje'}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-brand-500/10 focus:border-brand-500 cursor-pointer disabled:opacity-50"
            >
              <option value="all">⭐ Calidad: Todas</option>
              <option value="De primera">De primera (Excelente)</option>
              <option value="De segunda">De segunda</option>
              <option value="Roto o Inutilizable">Roto o Inutilizable</option>
            </select>
          </div>

          {/* Custom Date Inputs */}
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={dateFrom}
              onChange={e => { setDateFrom(e.target.value); setDatePreset('custom'); }}
              className="w-1/2 px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-bold text-slate-700 outline-none"
              title="Fecha Desde"
            />
            <span className="text-slate-400 font-bold text-xs">-</span>
            <input
              type="date"
              value={dateTo}
              onChange={e => { setDateTo(e.target.value); setDatePreset('custom'); }}
              className="w-1/2 px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-bold text-slate-700 outline-none"
              title="Fecha Hasta"
            />
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-16 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 text-brand-600 animate-spin" />
          <span className="text-xs font-bold text-slate-500">Cargando datos de producción desde Google Sheets...</span>
        </div>
      ) : activeTab === 'fabricacion' ? (
        /* TAB 1: FABRICACIÓN */
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="p-3.5 bg-slate-50/70 border-b border-slate-200/80 flex items-center justify-between">
            <div className="text-xs font-black text-slate-800">
              Registros de Rotomoldeo y Fabricación ({filteredFabricacion.length})
            </div>
            <div className="text-[10px] font-extrabold text-slate-400 uppercase">
              Total unidades: {filteredFabricacion.reduce((acc, i) => acc + i.cantidad, 0)} u.
            </div>
          </div>

          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[9px] font-black uppercase text-slate-400 tracking-wider">
                  <th className="px-3.5 py-2.5 w-24">Fecha</th>
                  <th className="px-3.5 py-2.5 min-w-[200px]">Producto</th>
                  <th className="px-3.5 py-2.5 w-16 text-center">Cant</th>
                  <th className="px-3.5 py-2.5 w-24 text-center">Máquina</th>
                  <th className="px-3.5 py-2.5 w-36">Operario</th>
                  <th className="px-3.5 py-2.5 w-28 text-center">Calidad</th>
                  <th className="px-3.5 py-2.5 w-24 text-center">Estado</th>
                  <th className="px-3.5 py-2.5 min-w-[180px]">Observaciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredFabricacion.length > 0 ? filteredFabricacion.map((item) => {
                  const opStyle = getOperatorStyle(item.operario);
                  const isPrimera = item.calidad.toLowerCase().includes("primera");
                  const isRoto = item.calidad.toLowerCase().includes("roto") || item.calidad.toLowerCase().includes("inutilizable");

                  return (
                    <tr key={item.id} className="hover:bg-blue-50/20 transition-colors">
                      {/* Fecha */}
                      <td className="px-3.5 py-2 font-extrabold text-slate-800 whitespace-nowrap">
                        {item.fechaFormatted}
                      </td>

                      {/* Producto */}
                      <td className="px-3.5 py-2 font-bold text-slate-900">
                        {item.producto}
                      </td>

                      {/* Cantidad */}
                      <td className="px-3.5 py-2 text-center font-black text-slate-900 font-mono">
                        <span className="inline-block px-2 py-0.5 rounded-md bg-slate-100">
                          {item.cantidad}
                        </span>
                      </td>

                      {/* Máquina */}
                      <td className="px-3.5 py-2 text-center whitespace-nowrap">
                        <span className={`inline-block px-2 py-0.5 rounded-md text-[9px] font-black uppercase ${
                          item.tipoMaquina.toUpperCase() === 'DOBLE' 
                            ? 'bg-blue-50 text-blue-700 border border-blue-200/60' 
                            : 'bg-amber-50 text-amber-700 border border-amber-200/60'
                        }`}>
                          {item.tipoMaquina || 'SIMPLE'}
                        </span>
                      </td>

                      {/* Operario */}
                      <td className="px-3.5 py-2 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold border ${opStyle.bg} ${opStyle.text} ${opStyle.border}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${opStyle.dot} shrink-0`} />
                          <span className="truncate max-w-[120px]">{item.operario}</span>
                        </span>
                      </td>

                      {/* Calidad */}
                      <td className="px-3.5 py-2 text-center whitespace-nowrap">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[8.5px] font-black uppercase ${
                          isPrimera 
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                            : isRoto
                            ? 'bg-rose-50 text-rose-700 border border-rose-200'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}>
                          {item.calidad}
                        </span>
                      </td>

                      {/* Estado */}
                      <td className="px-3.5 py-2 text-center whitespace-nowrap">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[8.5px] font-black uppercase ${
                          item.estado === 'Fabricado' 
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                            : item.estado === 'Planificado'
                            ? 'bg-amber-50 text-amber-700 border border-amber-200 font-extrabold'
                            : 'bg-red-50 text-red-700 border border-red-200'
                        }`}>
                          {item.estado}
                        </span>
                      </td>

                      {/* Observaciones */}
                      <td className="px-3.5 py-2 text-[11px]">
                        {item.observaciones ? (
                          <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50/80 border border-amber-200/80 text-amber-900 font-bold">
                            <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
                            <span>{item.observaciones}</span>
                          </div>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                    </tr>
                  );
                }) : (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-slate-400 font-bold">
                      No se encontraron registros de fabricación para los filtros seleccionados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : activeTab === 'ensamblaje' ? (
        /* TAB 2: ENSAMBLAJE */
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="p-3.5 bg-slate-50/70 border-b border-slate-200/80 flex items-center justify-between">
            <div className="text-xs font-black text-slate-800">
              Registros de Armado y Ensamblaje ({filteredEnsamblaje.length})
            </div>
            <div className="text-[10px] font-extrabold text-slate-400 uppercase">
              Total unidades: {filteredEnsamblaje.reduce((acc, i) => acc + i.cantidad, 0)} u.
            </div>
          </div>

          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[9px] font-black uppercase text-slate-400 tracking-wider">
                  <th className="px-3.5 py-2.5 w-24">Fecha</th>
                  <th className="px-3.5 py-2.5 min-w-[200px]">Producto Ensamblado</th>
                  <th className="px-3.5 py-2.5 w-20 text-center">Cant</th>
                  <th className="px-3.5 py-2.5 w-40">Responsable</th>
                  <th className="px-3.5 py-2.5 w-28 text-center">Turno</th>
                  <th className="px-3.5 py-2.5 w-28 text-center">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredEnsamblaje.length > 0 ? filteredEnsamblaje.map((item) => {
                  const opStyle = getOperatorStyle(item.operario);

                  return (
                    <tr key={item.id} className="hover:bg-purple-50/20 transition-colors">
                      {/* Fecha */}
                      <td className="px-3.5 py-2 font-extrabold text-slate-800 whitespace-nowrap">
                        {item.fechaFormatted}
                      </td>

                      {/* Producto */}
                      <td className="px-3.5 py-2 font-bold text-slate-900">
                        {item.producto}
                      </td>

                      {/* Cantidad */}
                      <td className="px-3.5 py-2 text-center font-black text-slate-900 font-mono">
                        <span className="inline-block px-2 py-0.5 rounded-md bg-purple-50 text-purple-800 border border-purple-200/50">
                          {item.cantidad}
                        </span>
                      </td>

                      {/* Responsable */}
                      <td className="px-3.5 py-2 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold border ${opStyle.bg} ${opStyle.text} ${opStyle.border}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${opStyle.dot} shrink-0`} />
                          <span className="truncate max-w-[140px]">{item.operario}</span>
                        </span>
                      </td>

                      {/* Turno */}
                      <td className="px-3.5 py-2 text-center text-slate-500 font-semibold whitespace-nowrap">
                        {item.turno || '1. Mañana'}
                      </td>

                      {/* Estado */}
                      <td className="px-3.5 py-2 text-center whitespace-nowrap">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[8.5px] font-black uppercase ${
                          item.estado === 'Ensamblado' 
                            ? 'bg-purple-50 text-purple-700 border border-purple-200' 
                            : item.estado === 'Planificado'
                            ? 'bg-amber-50 text-amber-700 border border-amber-200 font-extrabold'
                            : 'bg-red-50 text-red-700 border border-red-200'
                        }`}>
                          {item.estado}
                        </span>
                      </td>
                    </tr>
                  );
                }) : (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-slate-400 font-bold">
                      No se encontraron registros de ensamblaje para los filtros seleccionados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : activeTab === 'operarios' ? (
        /* TAB 3: PRODUCTIVIDAD POR OPERARIO & ESTADÍSTICAS */
        <div className="space-y-6">
          {/* Operator Ranking Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {operatorMetrics.map((op, idx) => {
              const opStyle = getOperatorStyle(op.name);
              const totalProd = op.totalFabricado + op.totalEnsamblado;
              const qualityRate = op.totalFabricado > 0 ? ((op.dePrimera / op.totalFabricado) * 100).toFixed(0) : "100";

              return (
                <div key={op.name} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-xs ${opStyle.bg} ${opStyle.text} border ${opStyle.border}`}>
                        #{idx + 1}
                      </div>
                      <div>
                        <h3 className="font-extrabold text-slate-900 text-sm">{op.name}</h3>
                        <p className="text-[10px] text-slate-400 font-bold">{op.diasActivo.size} días con actividad</p>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-lg font-black text-slate-900">{totalProd}</span>
                      <span className="text-[10px] font-bold text-slate-400 block">u. producidas</span>
                    </div>
                  </div>

                  {/* Progress / Volume Breakdown */}
                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 text-center">
                    <div className="p-2 rounded-xl bg-blue-50/50 border border-blue-100/60">
                      <span className="text-[9px] font-black uppercase text-blue-600 block">Fabricado</span>
                      <span className="text-sm font-black text-blue-900">{op.totalFabricado} u.</span>
                    </div>
                    <div className="p-2 rounded-xl bg-purple-50/50 border border-purple-100/60">
                      <span className="text-[9px] font-black uppercase text-purple-600 block">Ensamblado</span>
                      <span className="text-sm font-black text-purple-900">{op.totalEnsamblado} u.</span>
                    </div>
                    <div className="p-2 rounded-xl bg-emerald-50/50 border border-emerald-100/60">
                      <span className="text-[9px] font-black uppercase text-emerald-600 block">1ra Calidad</span>
                      <span className="text-sm font-black text-emerald-900">{qualityRate}%</span>
                    </div>
                  </div>

                  {/* Quality Bar */}
                  {op.totalFabricado > 0 && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-[9px] font-extrabold text-slate-400 uppercase">
                        <span>Calidad Efectiva</span>
                        <span className="text-emerald-700">{op.dePrimera} de primera · {op.segundaORoto} defectos</span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-rose-100 overflow-hidden flex">
                        <div 
                          className="h-full bg-emerald-500 rounded-full transition-all duration-500" 
                          style={{ width: `${qualityRate}%` }} 
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Top 10 Products Breakdown */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <h3 className="text-sm font-black text-slate-900 mb-3 flex items-center gap-2">
              <Layers className="w-4 h-4 text-brand-600" />
              Top 10 Productos Más Fabricados en el Período
            </h3>

            <div className="space-y-2.5">
              {topProducts.map((p, pIdx) => {
                const maxVal = topProducts[0]?.total || 1;
                const pct = ((p.total / maxVal) * 100).toFixed(0);

                return (
                  <div key={p.producto} className="space-y-1">
                    <div className="flex justify-between text-xs font-bold text-slate-700">
                      <span>{pIdx + 1}. {p.producto}</span>
                      <span className="font-mono font-black text-slate-900">{p.total} u.</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div 
                        className="h-full bg-brand-600 rounded-full transition-all duration-500" 
                        style={{ width: `${pct}%` }} 
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        /* TAB 4: INCIDENCIAS & OBSERVACIONES */
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="p-3.5 bg-slate-50/70 border-b border-slate-200/80 flex items-center justify-between">
            <div className="text-xs font-black text-slate-800">
              Registro Cronológico de Observaciones e Incidencias Técnicas
            </div>
            <div className="text-[10px] font-extrabold text-slate-400 uppercase">
              {filteredFabricacion.filter(f => f.observaciones).length} registros con novedades
            </div>
          </div>

          <div className="divide-y divide-slate-100">
            {filteredFabricacion.filter(f => f.observaciones).length > 0 ? (
              filteredFabricacion.filter(f => f.observaciones).map((item) => {
                const opStyle = getOperatorStyle(item.operario);

                return (
                  <div key={item.id} className="p-4 hover:bg-amber-50/20 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-extrabold text-slate-900">{item.fechaFormatted}</span>
                        <span className="text-slate-300">•</span>
                        <span className="font-bold text-slate-700">{item.producto} ({item.cantidad} u.)</span>
                        <span className="text-slate-300">•</span>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${opStyle.bg} ${opStyle.text} ${opStyle.border}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${opStyle.dot}`} />
                          {item.operario}
                        </span>
                      </div>
                      <div className="inline-flex items-start gap-1.5 p-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-950 font-semibold text-xs leading-relaxed">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <span>{item.observaciones}</span>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="inline-block px-2 py-0.5 rounded-md text-[9px] font-black uppercase bg-slate-100 text-slate-600">
                        {item.tipoMaquina} · {item.turno}
                      </span>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="p-12 text-center text-slate-400 font-bold text-xs">
                No se registraron incidencias u observaciones para el período y filtros seleccionados.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

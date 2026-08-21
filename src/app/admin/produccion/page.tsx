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
  AlertCircle,
  Trophy,
  ChevronRight,
  Droplet,
  PieChart,
  SlidersHorizontal,
  ChevronDown
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ProductionItem, AssemblyItem } from "@/app/api/admin/produccion-data/route";

// Helper to extract litraje
const extractLitraje = (productName: string): { label: string; litros: number } => {
  if (!productName) return { label: 'Otros', litros: 0 };
  const lower = productName.toLowerCase();
  const match = productName.match(/(\d+)\s*(L|litros|lts|l)\b/i);
  if (match) {
    const num = parseInt(match[1], 10);
    return { label: `${num}L`, litros: num };
  }
  if (lower.includes('cono') || lower.includes('tapa') || lower.includes('accesorio') || lower.includes('brida')) {
    return { label: 'Accesorios', litros: 0 };
  }
  if (lower.includes('camara') || lower.includes('cámara') || lower.includes('desengrasadora')) {
    return { label: 'Cámaras', litros: 0 };
  }
  return { label: 'Otros', litros: 0 };
};

export default function ProduccionPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastSync, setLastSync] = useState<string>("");
  const [fabricacionData, setFabricacionData] = useState<ProductionItem[]>([]);
  const [ensamblajeData, setEnsamblajeData] = useState<AssemblyItem[]>([]);
  const [operatorsList, setOperatorsList] = useState<string[]>([]);

  // Navigation tabs
  const [activeTab, setActiveTab] = useState<'operarios' | 'fabricacion' | 'ensamblaje' | 'incidencias'>('operarios');

  // Filters
  const [datePreset, setDatePreset] = useState<'today' | 'yesterday' | 'last7' | 'thisMonth' | 'lastMonth' | 'all' | 'custom'>('thisMonth');
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedOperator, setSelectedOperator] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [selectedQuality, setSelectedQuality] = useState("all");
  const [selectedMachine, setSelectedMachine] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Modal / Selected operator detail
  const [selectedOperatorDetail, setSelectedOperatorDetail] = useState<string | null>(null);

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

  // Combined Global KPIs
  const stats = useMemo(() => {
    let totalFabricado = 0;
    let totalPlanificadoFab = 0;
    let totalDePrimera = 0;
    let totalSegunda = 0;
    let totalRoturas = 0;
    let totalLitrosEquivalentes = 0;

    filteredFabricacion.forEach(item => {
      if (item.estado === "Fabricado") {
        totalFabricado += item.cantidad;
        const lit = extractLitraje(item.producto);
        totalLitrosEquivalentes += lit.litros * item.cantidad;

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
      qualityRate,
      totalLitrosEquivalentes
    };
  }, [filteredFabricacion, filteredEnsamblaje]);

  // Enriched Operator Productivity Breakdown
  const operatorMetrics = useMemo(() => {
    const map: Record<string, {
      name: string;
      totalProducido: number;
      totalFabricado: number;
      dePrimera: number;
      segunda: number;
      rotos: number;
      totalEnsamblado: number;
      diasActivo: Set<string>;
      diasFabricacion: Set<string>;
      diasEnsamblaje: Set<string>;
      promedioDiario: number;
      promedioFabricacionDiaria: number;
      promedioEnsamblajeDiario: number;
      litrajes: Record<string, number>;
      totalLitrosEquivalentes: number;
      maquinas: { doble: number; simple: number };
      productos: Record<string, number>;
      observaciones: string[];
      topLitraje: string;
      qualityRate: string;
    }> = {};

    filteredFabricacion.forEach(item => {
      if (item.estado !== "Fabricado" || !item.operario || item.operario === "Sin Asignar") return;
      if (!map[item.operario]) {
        map[item.operario] = {
          name: item.operario,
          totalProducido: 0,
          totalFabricado: 0,
          dePrimera: 0,
          segunda: 0,
          rotos: 0,
          totalEnsamblado: 0,
          diasActivo: new Set(),
          diasFabricacion: new Set(),
          diasEnsamblaje: new Set(),
          promedioDiario: 0,
          promedioFabricacionDiaria: 0,
          promedioEnsamblajeDiario: 0,
          litrajes: {},
          totalLitrosEquivalentes: 0,
          maquinas: { doble: 0, simple: 0 },
          productos: {},
          observaciones: [],
          topLitraje: '-',
          qualityRate: '100'
        };
      }

      const op = map[item.operario];
      op.totalFabricado += item.cantidad;
      op.diasActivo.add(item.fecha);
      op.diasFabricacion.add(item.fecha);

      // Litraje breakdown
      const lit = extractLitraje(item.producto);
      op.litrajes[lit.label] = (op.litrajes[lit.label] || 0) + item.cantidad;
      op.totalLitrosEquivalentes += lit.litros * item.cantidad;

      // Quality
      const q = item.calidad.toLowerCase();
      if (q.includes("segunda")) {
        op.segunda += item.cantidad;
      } else if (q.includes("roto") || q.includes("inutilizable") || q.includes("descarte")) {
        op.rotos += item.cantidad;
      } else {
        op.dePrimera += item.cantidad;
      }

      // Machine
      if (item.tipoMaquina?.toUpperCase() === 'DOBLE') op.maquinas.doble += item.cantidad;
      else op.maquinas.simple += item.cantidad;

      // Product
      op.productos[item.producto] = (op.productos[item.producto] || 0) + item.cantidad;

      // Observations
      if (item.observaciones) {
        op.observaciones.push(`${item.fechaFormatted}: ${item.producto} (${item.cantidad}u) - ${item.observaciones}`);
      }
    });

    filteredEnsamblaje.forEach(item => {
      if (item.estado !== "Ensamblado" || !item.operario || item.operario === "Sin Asignar") return;
      if (!map[item.operario]) {
        map[item.operario] = {
          name: item.operario,
          totalProducido: 0,
          totalFabricado: 0,
          dePrimera: 0,
          segunda: 0,
          rotos: 0,
          totalEnsamblado: 0,
          diasActivo: new Set(),
          diasFabricacion: new Set(),
          diasEnsamblaje: new Set(),
          promedioDiario: 0,
          promedioFabricacionDiaria: 0,
          promedioEnsamblajeDiario: 0,
          litrajes: {},
          totalLitrosEquivalentes: 0,
          maquinas: { doble: 0, simple: 0 },
          productos: {},
          observaciones: [],
          topLitraje: '-',
          qualityRate: '100'
        };
      }
      const op = map[item.operario];
      op.totalEnsamblado += item.cantidad;
      op.diasActivo.add(item.fecha);
      op.diasEnsamblaje.add(item.fecha);
      op.productos[`[Ensamblaje] ${item.producto}`] = (op.productos[`[Ensamblaje] ${item.producto}`] || 0) + item.cantidad;
    });

    // Compute derived metrics
    return Object.values(map).map(op => {
      op.totalProducido = op.totalFabricado + op.totalEnsamblado;
      const totalDays = op.diasActivo.size || 1;
      const fabDays = op.diasFabricacion.size || 1;
      const ensDays = op.diasEnsamblaje.size || 1;

      op.promedioDiario = parseFloat((op.totalProducido / totalDays).toFixed(1));
      op.promedioFabricacionDiaria = parseFloat((op.totalFabricado / fabDays).toFixed(1));
      op.promedioEnsamblajeDiario = parseFloat((op.totalEnsamblado / ensDays).toFixed(1));
      op.qualityRate = op.totalFabricado > 0 ? ((op.dePrimera / op.totalFabricado) * 100).toFixed(1) : "100";

      // Find top litraje
      let topLit = "-";
      let maxLitCount = 0;
      Object.entries(op.litrajes).forEach(([litName, count]) => {
        if (count > maxLitCount && litName !== 'Accesorios' && litName !== 'Otros') {
          maxLitCount = count;
          topLit = litName;
        }
      });
      op.topLitraje = topLit;

      return op;
    }).sort((a, b) => b.totalProducido - a.totalProducido);
  }, [filteredFabricacion, filteredEnsamblaje]);

  // Global Litraje Breakdown across all factory
  const factoryLitrajeBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    let totalTanks = 0;

    filteredFabricacion.forEach(item => {
      if (item.estado === "Fabricado") {
        const lit = extractLitraje(item.producto);
        map[lit.label] = (map[lit.label] || 0) + item.cantidad;
        totalTanks += item.cantidad;
      }
    });

    return Object.entries(map)
      .map(([litraje, cantidad]) => ({
        litraje,
        cantidad,
        pct: totalTanks > 0 ? ((cantidad / totalTanks) * 100).toFixed(1) : "0"
      }))
      .sort((a, b) => b.cantidad - a.cantidad);
  }, [filteredFabricacion]);

  // Selected operator object for detailed modal
  const selectedOperatorObject = useMemo(() => {
    if (!selectedOperatorDetail) return null;
    return operatorMetrics.find(op => op.name === selectedOperatorDetail) || null;
  }, [selectedOperatorDetail, operatorMetrics]);

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
      csvContent += "Ranking,Operario,Total Producido,Fabricado (Rotomoldeo),Ensamblado,Días Trabajados,Promedio Diario (u/día),Litraje Principal,% Calidad 1ra,Segunda,Rotos,Litros Transformados\n";
      operatorMetrics.forEach((op, idx) => {
        csvContent += `${idx + 1},"${op.name}",${op.totalProducido},${op.totalFabricado},${op.totalEnsamblado},${op.diasActivo.size},${op.promedioDiario},"${op.topLitraje}","${op.qualityRate}%",${op.segunda},${op.rotos},${op.totalLitrosEquivalentes}\n`;
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
                Métricas avanzadas por operario, litrajes fabricados, rotomoldeo, ensamblaje y calidad.
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
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
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
            <p className="text-[10px] text-blue-600 font-bold mt-0.5">Rotomoldeados</p>
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
            <p className="text-[10px] text-purple-600 font-bold mt-0.5">Tanques armados</p>
          </div>
        </div>

        {/* Litros Transformados */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Volumen Litros</span>
            <div className="p-1.5 bg-cyan-50 text-cyan-600 rounded-lg">
              <Droplet className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-cyan-700 tracking-tight">
              {(stats.totalLitrosEquivalentes / 1000).toLocaleString('es-AR', { maximumFractionDigits: 0 })}k <span className="text-xs font-semibold text-slate-400">L</span>
            </div>
            <p className="text-[10px] text-cyan-600 font-bold mt-0.5">{stats.totalLitrosEquivalentes.toLocaleString('es-AR')} L totales</p>
          </div>
        </div>

        {/* Total Planificado */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Planificado</span>
            <div className="p-1.5 bg-amber-50 text-amber-600 rounded-lg">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-slate-900 tracking-tight">
              {stats.totalPlanificado.toLocaleString('es-AR')} <span className="text-xs font-semibold text-slate-400">u.</span>
            </div>
            <p className="text-[10px] text-amber-600 font-bold mt-0.5">En cola futura</p>
          </div>
        </div>

        {/* Tasa Calidad de Primera */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Calidad de 1ra</span>
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
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Descartes / Rotos</span>
            <div className="p-1.5 bg-rose-50 text-rose-600 rounded-lg">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-rose-600 tracking-tight">
              {stats.totalRoturas + stats.totalSegunda} <span className="text-xs font-semibold text-slate-400">u.</span>
            </div>
            <p className="text-[10px] text-rose-500 font-bold mt-0.5">{stats.totalRoturas} rotos · {stats.totalSegunda} 2da</p>
          </div>
        </div>
      </div>

      {/* Main Filter & Navigation Panel */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 space-y-4">
        {/* Navigation Tabs */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-100 pb-3">
          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200/60 overflow-x-auto max-w-full">
            <button
              onClick={() => setActiveTab('operarios')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'operarios' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Trophy className="w-3.5 h-3.5 text-amber-500" /> Rendimiento de Operarios ({operatorMetrics.length})
            </button>
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
      ) : activeTab === 'operarios' ? (
        /* TAB: RENDIMIENTO ENRIQUECIDO DE OPERARIOS & LITRAJES */
        <div className="space-y-6">
          {/* PODIUM & HIGHLIGHTS */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* 🥇 #1 OPERARIO LÍDER */}
            {operatorMetrics[0] && (
              <div className="relative overflow-hidden bg-gradient-to-br from-amber-500/10 via-amber-50 to-white p-5 rounded-2xl border-2 border-amber-300 shadow-sm flex flex-col justify-between">
                <div className="absolute top-0 right-0 transform translate-x-3 -translate-y-3 opacity-10 pointer-events-none">
                  <Trophy className="w-32 h-32 text-amber-600" />
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500 text-white font-black text-[10px] uppercase tracking-wider shadow-xs">
                      🥇 Líder del Período
                    </span>
                    <span className="text-xs font-black text-amber-700">
                      {operatorMetrics[0].diasActivo.size} días activos
                    </span>
                  </div>

                  <div className="mt-3.5">
                    <h3 className="text-lg font-black text-slate-900">{operatorMetrics[0].name}</h3>
                    <p className="text-xs text-amber-800 font-bold mt-0.5">
                      Especialidad: {operatorMetrics[0].topLitraje} · {operatorMetrics[0].qualityRate}% Calidad 1ra
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-amber-200/60 text-center">
                  <div className="bg-white/80 p-2 rounded-xl border border-amber-200/50">
                    <span className="text-[9px] font-black uppercase text-slate-400 block">Fabricación</span>
                    <span className="text-base font-black text-blue-900">{operatorMetrics[0].totalFabricado} u.</span>
                    <span className="text-[9px] text-blue-700 font-bold block">{operatorMetrics[0].promedioFabricacionDiaria} u/d</span>
                  </div>
                  <div className="bg-white/80 p-2 rounded-xl border border-amber-200/50">
                    <span className="text-[9px] font-black uppercase text-slate-400 block">Ensamblaje</span>
                    <span className="text-base font-black text-purple-900">{operatorMetrics[0].totalEnsamblado} u.</span>
                    <span className="text-[9px] text-purple-700 font-bold block">{operatorMetrics[0].totalEnsamblado > 0 ? `${operatorMetrics[0].promedioEnsamblajeDiario} u/d` : '-'}</span>
                  </div>
                  <div className="bg-white/80 p-2 rounded-xl border border-amber-200/50">
                    <span className="text-[9px] font-black uppercase text-slate-400 block">Prom. Global</span>
                    <span className="text-base font-black text-amber-700">{operatorMetrics[0].promedioDiario} <span className="text-[10px]">u/d</span></span>
                    <span className="text-[9px] text-amber-800 font-bold block">{operatorMetrics[0].totalProducido} u. tot</span>
                  </div>
                </div>
              </div>
            )}

            {/* 🥈 #2 SEGUNDO PUESTO */}
            {operatorMetrics[1] && (
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-200 text-slate-700 font-black text-[10px] uppercase tracking-wider">
                      🥈 2° Puesto
                    </span>
                    <span className="text-xs font-bold text-slate-500">
                      {operatorMetrics[1].diasActivo.size} días activos
                    </span>
                  </div>

                  <div className="mt-3.5">
                    <h3 className="text-base font-black text-slate-900">{operatorMetrics[1].name}</h3>
                    <p className="text-xs text-slate-500 font-bold mt-0.5">
                      Top Litraje: {operatorMetrics[1].topLitraje} · {operatorMetrics[1].qualityRate}% Calidad 1ra
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-slate-100 text-center">
                  <div className="bg-slate-50 p-2 rounded-xl border border-slate-100">
                    <span className="text-[9px] font-black uppercase text-slate-400 block">Fabricación</span>
                    <span className="text-sm font-black text-blue-900">{operatorMetrics[1].totalFabricado} u.</span>
                    <span className="text-[9px] text-blue-700 font-bold block">{operatorMetrics[1].promedioFabricacionDiaria} u/d</span>
                  </div>
                  <div className="bg-slate-50 p-2 rounded-xl border border-slate-100">
                    <span className="text-[9px] font-black uppercase text-slate-400 block">Ensamblaje</span>
                    <span className="text-sm font-black text-purple-900">{operatorMetrics[1].totalEnsamblado} u.</span>
                    <span className="text-[9px] text-purple-700 font-bold block">{operatorMetrics[1].totalEnsamblado > 0 ? `${operatorMetrics[1].promedioEnsamblajeDiario} u/d` : '-'}</span>
                  </div>
                  <div className="bg-slate-50 p-2 rounded-xl border border-slate-100">
                    <span className="text-[9px] font-black uppercase text-slate-400 block">Prom. Global</span>
                    <span className="text-sm font-black text-slate-800">{operatorMetrics[1].promedioDiario} u/d</span>
                    <span className="text-[9px] text-slate-500 font-bold block">{operatorMetrics[1].totalProducido} u. tot</span>
                  </div>
                </div>
              </div>
            )}

            {/* 🥉 #3 TERCER PUESTO */}
            {operatorMetrics[2] && (
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 font-black text-[10px] uppercase tracking-wider">
                      🥉 3° Puesto
                    </span>
                    <span className="text-xs font-bold text-slate-500">
                      {operatorMetrics[2].diasActivo.size} días activos
                    </span>
                  </div>

                  <div className="mt-3.5">
                    <h3 className="text-base font-black text-slate-900">{operatorMetrics[2].name}</h3>
                    <p className="text-xs text-slate-500 font-bold mt-0.5">
                      Top Litraje: {operatorMetrics[2].topLitraje} · {operatorMetrics[2].qualityRate}% Calidad 1ra
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-slate-100 text-center">
                  <div className="bg-slate-50 p-2 rounded-xl border border-slate-100">
                    <span className="text-[9px] font-black uppercase text-slate-400 block">Fabricación</span>
                    <span className="text-sm font-black text-blue-900">{operatorMetrics[2].totalFabricado} u.</span>
                    <span className="text-[9px] text-blue-700 font-bold block">{operatorMetrics[2].promedioFabricacionDiaria} u/d</span>
                  </div>
                  <div className="bg-slate-50 p-2 rounded-xl border border-slate-100">
                    <span className="text-[9px] font-black uppercase text-slate-400 block">Ensamblaje</span>
                    <span className="text-sm font-black text-purple-900">{operatorMetrics[2].totalEnsamblado} u.</span>
                    <span className="text-[9px] text-purple-700 font-bold block">{operatorMetrics[2].totalEnsamblado > 0 ? `${operatorMetrics[2].promedioEnsamblajeDiario} u/d` : '-'}</span>
                  </div>
                  <div className="bg-slate-50 p-2 rounded-xl border border-slate-100">
                    <span className="text-[9px] font-black uppercase text-slate-400 block">Prom. Global</span>
                    <span className="text-sm font-black text-slate-800">{operatorMetrics[2].promedioDiario} u/d</span>
                    <span className="text-[9px] text-slate-500 font-bold block">{operatorMetrics[2].totalProducido} u. tot</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* GLOBAL LITRAJE BREAKDOWN CHIPS */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-2">
                <PieChart className="w-4 h-4 text-cyan-600" />
                Desglose de Producción de Fábrica por Litraje / Capacidad
              </h3>
              <span className="text-[10px] font-bold text-slate-400">
                {stats.totalFabricado} tanques rotomoldeados en el período
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 pt-1">
              {factoryLitrajeBreakdown.map((item) => (
                <div key={item.litraje} className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl flex flex-col justify-between">
                  <span className="text-[10px] font-black text-slate-500 uppercase">{item.litraje}</span>
                  <div className="mt-1 flex items-baseline justify-between">
                    <span className="text-lg font-black text-slate-900 font-mono">{item.cantidad} <span className="text-[10px] font-semibold text-slate-400">u.</span></span>
                    <span className="text-[10px] font-extrabold text-cyan-600">{item.pct}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* FULL OPERATOR COMPARISON TABLE */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="p-3.5 bg-slate-50/70 border-b border-slate-200/80 flex items-center justify-between">
              <div className="text-xs font-black text-slate-800">
                Tabla Comparativa y Productividad Detallada por Operario ({operatorMetrics.length})
              </div>
              <div className="text-[10px] font-extrabold text-slate-400 uppercase">
                Haz clic en cualquier fila para ver el detalle completo
              </div>
            </div>

            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[9px] font-black uppercase text-slate-400 tracking-wider">
                    <th className="px-3.5 py-2.5 w-12 text-center">Pos</th>
                    <th className="px-3.5 py-2.5 min-w-[160px]">Operario</th>
                    <th className="px-3.5 py-2.5 w-24 text-center">Total Prod</th>
                    <th className="px-3.5 py-2.5 w-24 text-center">Fabricado</th>
                    <th className="px-3.5 py-2.5 w-24 text-center">Ensamblado</th>
                    <th className="px-3.5 py-2.5 w-24 text-center">Días Activo</th>
                    <th className="px-3.5 py-2.5 w-28 text-center">Prom. Diario</th>
                    <th className="px-3.5 py-2.5 min-w-[200px]">Desglose por Litraje</th>
                    <th className="px-3.5 py-2.5 w-28 text-center">Calidad 1ra</th>
                    <th className="px-3.5 py-2.5 w-20 text-center">Fallas</th>
                    <th className="px-3.5 py-2.5 w-16 text-center">Detalle</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {operatorMetrics.map((op, idx) => {
                    const opStyle = getOperatorStyle(op.name);

                    return (
                      <tr 
                        key={op.name} 
                        onClick={() => setSelectedOperatorDetail(op.name)}
                        className="hover:bg-blue-50/30 transition-colors cursor-pointer group"
                      >
                        {/* Posición */}
                        <td className="px-3.5 py-2.5 text-center font-black">
                          {idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `#${idx + 1}`}
                        </td>

                        {/* Operario */}
                        <td className="px-3.5 py-2.5 font-bold text-slate-900 whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${opStyle.bg} ${opStyle.text} ${opStyle.border}`}>
                            <span className={`w-2 h-2 rounded-full ${opStyle.dot}`} />
                            {op.name}
                          </span>
                        </td>

                        {/* Total Producido */}
                        <td className="px-3.5 py-2.5 text-center font-mono font-black text-slate-900 text-sm">
                          {op.totalProducido} <span className="text-[10px] font-semibold text-slate-400">u.</span>
                        </td>

                        {/* Fabricado */}
                        <td className="px-3.5 py-2.5 text-center font-bold text-blue-700">
                          {op.totalFabricado} u.
                        </td>

                        {/* Ensamblado */}
                        <td className="px-3.5 py-2.5 text-center font-bold text-purple-700">
                          {op.totalEnsamblado} u.
                        </td>

                        {/* Días Activo */}
                        <td className="px-3.5 py-2.5 text-center text-slate-600 font-extrabold">
                          {op.diasActivo.size} d.
                        </td>

                        {/* Promedio Diario */}
                        <td className="px-3.5 py-2.5 text-center whitespace-nowrap">
                          <span className="inline-block px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200/60 font-black font-mono">
                            {op.promedioDiario} <span className="text-[9px] font-bold">u/día</span>
                          </span>
                        </td>

                        {/* Desglose por Litraje */}
                        <td className="px-3.5 py-2.5">
                          <div className="flex flex-wrap gap-1">
                            {Object.entries(op.litrajes).map(([lit, count]) => (
                              <span 
                                key={lit} 
                                className="inline-flex items-center px-1.5 py-0.5 rounded bg-slate-100 text-[10px] font-extrabold text-slate-700"
                              >
                                {lit}: <strong className="ml-1 text-slate-900">{count}</strong>
                              </span>
                            ))}
                          </div>
                        </td>

                        {/* Calidad 1ra */}
                        <td className="px-3.5 py-2.5 text-center whitespace-nowrap">
                          <div className="flex flex-col items-center">
                            <span className="font-black text-emerald-700 text-xs">{op.qualityRate}%</span>
                            <div className="w-16 h-1.5 rounded-full bg-slate-100 overflow-hidden mt-0.5">
                              <div className="h-full bg-emerald-500" style={{ width: `${op.qualityRate}%` }} />
                            </div>
                          </div>
                        </td>

                        {/* Fallas / Roturas */}
                        <td className="px-3.5 py-2.5 text-center font-bold text-rose-600 font-mono">
                          {op.segunda + op.rotos > 0 ? (
                            <span className="inline-block px-1.5 py-0.5 rounded bg-rose-50 border border-rose-200 text-rose-700 text-[10px]">
                              {op.segunda + op.rotos}
                            </span>
                          ) : (
                            <span className="text-slate-300">0</span>
                          )}
                        </td>

                        {/* Botón Ver Detalle */}
                        <td className="px-3.5 py-2.5 text-center">
                          <button className="p-1 rounded-lg text-slate-400 group-hover:text-brand-600 group-hover:bg-brand-50 transition-colors">
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : activeTab === 'fabricacion' ? (
        /* TAB: FABRICACIÓN */
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
        /* TAB: ENSAMBLAJE */
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
      ) : (
        /* TAB: INCIDENCIAS & OBSERVACIONES */
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

      {/* MODAL DETALLE DE OPERARIO */}
      {selectedOperatorObject && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto custom-scrollbar p-6 space-y-5 animate-in fade-in zoom-in duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-black text-sm border ${getOperatorStyle(selectedOperatorObject.name).bg} ${getOperatorStyle(selectedOperatorObject.name).text} ${getOperatorStyle(selectedOperatorObject.name).border}`}>
                  <User className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-black text-slate-900">{selectedOperatorObject.name}</h2>
                  <p className="text-xs text-slate-400 font-bold">Perfil de Producción y Rendimiento Individual</p>
                </div>
              </div>

              <button
                onClick={() => setSelectedOperatorDetail(null)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Metrics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center">
              <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-2xl">
                <span className="text-[9px] font-black uppercase text-slate-400 block">Total Producido</span>
                <span className="text-xl font-black text-slate-900">{selectedOperatorObject.totalProducido} u.</span>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-2xl">
                <span className="text-[9px] font-black uppercase text-slate-400 block">Días Activo</span>
                <span className="text-xl font-black text-slate-900">{selectedOperatorObject.diasActivo.size} d.</span>
              </div>
              <div className="p-3 bg-amber-50 border border-amber-200/80 rounded-2xl">
                <span className="text-[9px] font-black uppercase text-amber-700 block">Promedio Diario</span>
                <span className="text-xl font-black text-amber-900">{selectedOperatorObject.promedioDiario} <span className="text-xs">u/d</span></span>
              </div>
              <div className="p-3 bg-emerald-50 border border-emerald-200/80 rounded-2xl">
                <span className="text-[9px] font-black uppercase text-emerald-700 block">% Calidad 1ra</span>
                <span className="text-xl font-black text-emerald-900">{selectedOperatorObject.qualityRate}%</span>
              </div>
            </div>

            {/* Desglose de Litrajes del Operario */}
            <div className="space-y-2">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <Droplet className="w-3.5 h-3.5 text-cyan-600" /> Tanques por Capacidad / Litraje
              </h4>
              <div className="flex flex-wrap gap-2">
                {Object.entries(selectedOperatorObject.litrajes).map(([lit, count]) => (
                  <div key={lit} className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl flex items-center gap-2">
                    <span className="text-xs font-black text-slate-600">{lit}:</span>
                    <span className="text-xs font-black text-slate-900">{count} u.</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Productos Fabricados Detallados */}
            <div className="space-y-2">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-brand-600" /> Detalle de Productos Producidos
              </h4>
              <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                {Object.entries(selectedOperatorObject.productos)
                  .sort((a, b) => b[1] - a[1])
                  .map(([prodName, cant]) => (
                    <div key={prodName} className="flex justify-between items-center p-2 rounded-xl bg-slate-50 border border-slate-100 text-xs">
                      <span className="font-bold text-slate-800">{prodName}</span>
                      <span className="font-mono font-black text-slate-900">{cant} u.</span>
                    </div>
                  ))}
              </div>
            </div>

            {/* Incidencias del Operario */}
            {selectedOperatorObject.observaciones.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-black uppercase tracking-wider text-amber-800 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" /> Novedades e Incidencias en Turno
                </h4>
                <div className="space-y-1.5 max-h-36 overflow-y-auto custom-scrollbar pr-1">
                  {selectedOperatorObject.observaciones.map((obs, oIdx) => (
                    <div key={oIdx} className="p-2 rounded-xl bg-amber-50 border border-amber-200/80 text-[11px] font-bold text-amber-950">
                      {obs}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="pt-2 border-t border-slate-100 flex justify-end">
              <Button
                onClick={() => setSelectedOperatorDetail(null)}
                className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold"
              >
                Cerrar Detalle
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

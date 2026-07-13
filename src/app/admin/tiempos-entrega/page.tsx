"use client";

import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { 
  Clock, 
  Plus, 
  Trash2, 
  Save, 
  Edit3, 
  Loader2, 
  CheckCircle2, 
  AlertCircle,
  BarChart3,
  Truck,
  TrendingUp,
  Search,
  Download,
  AlertTriangle,
  User,
  MapPin,
  RefreshCw,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/Button";

interface DeliveryTime {
  id: string;
  name: string;
  description: string;
  category: 'Regular' | 'Zonal' | 'Particular' | 'Express';
  delivery_days?: number[];
  is_active: boolean;
  created_at?: string;
}

interface DeliveryStatsItem {
  id: string;
  order_id: string | null;
  delivery_date: string;
  real_delivery_date: string;
  run_number: number;
  delivery_order: number;
  status: 'pendiente_ruteo' | 'ruteado' | 'en_recorrido' | 'entregado' | 'fallido';
  notes: string | null;
  logistics_contact: string | null;
  predominant_zone: string | null;
  companion: string | null;
  driver_hours: string | null;
  companion_hours: string | null;
  failure_reason: string | null;
  orders: {
    legacy_code: string | null;
    customer_name: string | null;
    total_amount: number | null;
  } | null;
  carriers: {
    name: string;
  } | null;
  deviation?: number;
}

export default function DeliveryTimesAdminPage() {
  const [activeTab, setActiveTab] = useState<'stats' | 'rules'>('stats');
  
  // =========================================================================
  // Configuración de Reglas CRUD (Código Existente)
  // =========================================================================
  const [loadingRules, setLoadingRules] = useState(true);
  const [submittingRule, setSubmittingRule] = useState(false);
  const [deliveryTimes, setDeliveryTimes] = useState<DeliveryTime[]>([]);
  
  // Form states
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<'Regular' | 'Zonal' | 'Particular' | 'Express'>('Regular');
  const [deliveryDays, setDeliveryDays] = useState<number[]>([]);
  const [isActive, setIsActive] = useState(true);

  // Status message
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  useEffect(() => {
    loadDeliveryTimes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadDeliveryTimes = async () => {
    const cached = sessionStorage.getItem("cached_delivery_times");
    if (cached) {
      setDeliveryTimes(JSON.parse(cached));
      setLoadingRules(false);
    } else {
      setLoadingRules(true);
    }

    try {
      const { data, error } = await supabase
        .from('delivery_times')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (data) {
        setDeliveryTimes(data);
        sessionStorage.setItem("cached_delivery_times", JSON.stringify(data));
      }
    } catch (err) {
      console.error(err);
      const errMsg = err instanceof Error ? err.message : String(err);
      showStatus('error', `Error al cargar los tipos de entrega: ${errMsg || "Verificá la tabla."}`);
    } finally {
      setLoadingRules(false);
    }
  };

  const showStatus = (type: 'success' | 'error', text: string) => {
    setStatusMsg({ type, text });
    setTimeout(() => setStatusMsg(null), 4000);
  };

  const handleResetForm = () => {
    setEditingId(null);
    setName("");
    setDescription("");
    setCategory('Regular');
    setDeliveryDays([]);
    setIsActive(true);
  };

  const handleEdit = (item: DeliveryTime) => {
    setEditingId(item.id);
    setName(item.name);
    setDescription(item.description);
    setCategory(item.category);
    setDeliveryDays(item.delivery_days || []);
    setIsActive(item.is_active);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !description.trim()) {
      showStatus('error', "Por favor completá todos los campos obligatorios.");
      return;
    }

    setSubmittingRule(true);
    try {
      if (editingId) {
        const { error } = await supabase
          .from('delivery_times')
          .update({
            name: name.trim(),
            description: description.trim(),
            category,
            delivery_days: deliveryDays,
            is_active: isActive
          })
          .eq('id', editingId);

        if (error) throw error;
        showStatus('success', "Opción actualizada correctamente.");
      } else {
        const { error } = await supabase
          .from('delivery_times')
          .insert({
            name: name.trim(),
            description: description.trim(),
            category,
            delivery_days: deliveryDays,
            is_active: isActive
          });

        if (error) throw error;
        showStatus('success', "Nueva opción agregada correctamente.");
      }

      handleResetForm();
      loadDeliveryTimes();
    } catch (err) {
      console.error(err);
      const errMsg = err instanceof Error ? err.message : "Error al guardar el tipo de entrega.";
      showStatus('error', errMsg);
    } finally {
      setSubmittingRule(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`¿Estás seguro de que querés eliminar "${name}"?`)) return;

    try {
      const { error } = await supabase
        .from('delivery_times')
        .delete()
        .eq('id', id);

      if (error) throw error;
      showStatus('success', "Opción eliminada correctamente.");
      loadDeliveryTimes();
    } catch (err) {
      console.error(err);
      showStatus('error', "No se pudo eliminar la opción. Asegurate de que no esté en uso.");
    }
  };

  const getCategoryBadge = (cat: string) => {
    switch (cat) {
      case 'Regular':
        return <span className="bg-slate-100 text-slate-700 border border-slate-300 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider">Regular ⚪</span>;
      case 'Zonal':
        return <span className="bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider">Zonal 🔵</span>;
      case 'Particular':
        return <span className="bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider">Día Particular 🟡</span>;
      case 'Express':
        return <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider">Express 🟢</span>;
      default:
        return <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full text-[9px] font-black">{cat}</span>;
    }
  };

  // =========================================================================
  // Estadísticas Logísticas (Nueva Funcionalidad)
  // =========================================================================
  
  // Date Helpers
  const getTodayDate = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getRelativeDate = (daysAgo: number) => {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getStartOfMonth = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}-01`;
  };

  // State for stats
  const [statsLoading, setStatsLoading] = useState(true);
  const [startDate, setStartDate] = useState(getRelativeDate(30));
  const [endDate, setEndDate] = useState(getTodayDate());
  const [presetRange, setPresetRange] = useState("30dias");
  const [selectedCarrierId, setSelectedCarrierId] = useState("all");
  const [selectedZone, setSelectedZone] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  const [deliveries, setDeliveries] = useState<DeliveryStatsItem[]>([]);
  const [carriersList, setCarriersList] = useState<Array<{ id: string; name: string }>>([]);

  // Load carriers on mount
  useEffect(() => {
    async function loadCarriers() {
      const { data } = await supabase
        .from('carriers')
        .select('id, name')
        .order('name');
      if (data) setCarriersList(data);
    }
    loadCarriers();
  }, []);

  // Fetch delivery history when date range changes
  useEffect(() => {
    if (activeTab === 'stats') {
      loadStatsData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate, activeTab]);

  const loadStatsData = async () => {
    setStatsLoading(true);
    try {
      // Pedimos entregas que tengan fecha real de entrega dentro del rango seleccionado
      const { data, error } = await supabase
        .from('deliveries')
        .select(`
          id,
          order_id,
          delivery_date,
          real_delivery_date,
          run_number,
          delivery_order,
          status,
          notes,
          logistics_contact,
          predominant_zone,
          companion,
          driver_hours,
          companion_hours,
          failure_reason,
          orders(legacy_code, customer_name, total_amount),
          carriers(name)
        `)
        .not('real_delivery_date', 'is', null)
        .gte('real_delivery_date', startDate)
        .lte('real_delivery_date', endDate)
        .order('real_delivery_date', { ascending: false });

      if (error) throw error;
      if (data) {
        // Mapear desviación de fechas
        const mapped: DeliveryStatsItem[] = (data as unknown[]).map(dItem => {
          const d = dItem as DeliveryStatsItem;
          let deviation = 0;
          if (d.delivery_date && d.real_delivery_date) {
            const planned = new Date(d.delivery_date).getTime();
            const real = new Date(d.real_delivery_date).getTime();
            deviation = Math.round((real - planned) / (1000 * 60 * 60 * 24));
          }
          return {
            ...d,
            deviation
          };
        });
        setDeliveries(mapped);
      }
    } catch (err) {
      console.error("Error loading delivery stats data:", err);
    } finally {
      setStatsLoading(false);
    }
  };

  const handlePresetChange = (preset: string) => {
    setPresetRange(preset);
    if (preset === "personalizado") return;

    let start = getTodayDate();
    let end = getTodayDate();

    switch (preset) {
      case "hoy":
        start = getTodayDate();
        end = getTodayDate();
        break;
      case "ayer":
        start = getRelativeDate(1);
        end = getRelativeDate(1);
        break;
      case "7dias":
        start = getRelativeDate(7);
        end = getTodayDate();
        break;
      case "30dias":
        start = getRelativeDate(30);
        end = getTodayDate();
        break;
      case "mes":
        start = getStartOfMonth();
        end = getTodayDate();
        break;
      case "todos":
        start = "2020-01-01";
        end = "2030-12-31";
        break;
    }

    setStartDate(start);
    setEndDate(end);
    setCurrentPage(1);
  };

  // Dinamic zones computed from data
  const zonesList = useMemo(() => {
    const zonesSet = new Set<string>();
    deliveries.forEach(d => {
      if (d.predominant_zone) {
        zonesSet.add(d.predominant_zone.trim());
      }
    });
    return Array.from(zonesSet).sort();
  }, [deliveries]);

  // Filtered deliveries for metrics & detailed logs
  const filteredDeliveries = useMemo(() => {
    return deliveries.filter(d => {
      // 1. Carrier Filter
      if (selectedCarrierId !== "all" && d.carriers?.name !== selectedCarrierId) {
        const carrierObj = carriersList.find(c => c.id === selectedCarrierId);
        if (!carrierObj || d.carriers?.name !== carrierObj.name) return false;
      }
      
      // 2. Zone Filter
      if (selectedZone !== "all" && d.predominant_zone !== selectedZone) {
        return false;
      }

      // 3. Status Filter
      if (selectedStatus !== "all" && d.status !== selectedStatus) {
        return false;
      }

      // 4. Search Filter
      if (searchTerm.trim() !== "") {
        const search = searchTerm.toLowerCase();
        const code = d.orders?.legacy_code?.toLowerCase() || "";
        const customer = d.orders?.customer_name?.toLowerCase() || "";
        const carrier = d.carriers?.name?.toLowerCase() || "";
        const zone = d.predominant_zone?.toLowerCase() || "";
        const companion = d.companion?.toLowerCase() || "";
        const reason = d.failure_reason?.toLowerCase() || "";

        if (!code.includes(search) && 
            !customer.includes(search) && 
            !carrier.includes(search) && 
            !zone.includes(search) &&
            !companion.includes(search) &&
            !reason.includes(search)) {
          return false;
        }
      }

      return true;
    });
  }, [deliveries, selectedCarrierId, selectedZone, selectedStatus, searchTerm, carriersList]);

  // Statistics Computations
  const computedStats = useMemo(() => {
    const total = filteredDeliveries.length;
    const delivered = filteredDeliveries.filter(d => d.status === 'entregado').length;
    const failed = filteredDeliveries.filter(d => d.status === 'fallido').length;
    const effectiveness = total > 0 ? (delivered / total) * 100 : 0;
    
    // Average delay (deviation)
    const deviationSum = filteredDeliveries.reduce((acc, d) => acc + (d.deviation || 0), 0);
    const avgDeviation = total > 0 ? deviationSum / total : 0;

    // On-Time count (deviation <= 0)
    const onTime = filteredDeliveries.filter(d => (d.deviation || 0) <= 0).length;
    const onTimeRate = total > 0 ? (onTime / total) * 100 : 0;

    // Deviation Distribution
    let early = 0;
    let onTimeExact = 0;
    let delay1to2 = 0;
    let delay3to5 = 0;
    let delay6plus = 0;

    filteredDeliveries.forEach(d => {
      const dev = d.deviation || 0;
      if (dev < 0) early++;
      else if (dev === 0) onTimeExact++;
      else if (dev >= 1 && dev <= 2) delay1to2++;
      else if (dev >= 3 && dev <= 5) delay3to5++;
      else if (dev >= 6) delay6plus++;
    });

    // Carriers breakdown
    const carriersMap: Record<string, { total: number; success: number; deviationSum: number; onTime: number }> = {};
    filteredDeliveries.forEach(d => {
      const cName = d.carriers?.name || "Desconocido";
      if (!carriersMap[cName]) {
        carriersMap[cName] = { total: 0, success: 0, deviationSum: 0, onTime: 0 };
      }
      carriersMap[cName].total++;
      if (d.status === 'entregado') carriersMap[cName].success++;
      carriersMap[cName].deviationSum += d.deviation || 0;
      if ((d.deviation || 0) <= 0) carriersMap[cName].onTime++;
    });

    const carriersBreakdown = Object.entries(carriersMap).map(([name, data]) => ({
      name,
      total: data.total,
      successRate: (data.success / data.total) * 100,
      avgDeviation: data.deviationSum / data.total,
      onTimeRate: (data.onTime / data.total) * 100
    })).sort((a, b) => b.total - a.total);

    // Zones breakdown
    const zonesMap: Record<string, { total: number; success: number; deviationSum: number; onTime: number }> = {};
    filteredDeliveries.forEach(d => {
      const zName = d.predominant_zone || "Sin Zona";
      if (!zonesMap[zName]) {
        zonesMap[zName] = { total: 0, success: 0, deviationSum: 0, onTime: 0 };
      }
      zonesMap[zName].total++;
      if (d.status === 'entregado') zonesMap[zName].success++;
      zonesMap[zName].deviationSum += d.deviation || 0;
      if ((d.deviation || 0) <= 0) zonesMap[zName].onTime++;
    });

    const zonesBreakdown = Object.entries(zonesMap).map(([name, data]) => ({
      name,
      total: data.total,
      successRate: (data.success / data.total) * 100,
      avgDeviation: data.deviationSum / data.total,
      onTimeRate: (data.onTime / data.total) * 100
    })).sort((a, b) => b.total - a.total);

    // Failure Reasons breakdown
    const reasonsMap: Record<string, number> = {};
    filteredDeliveries.forEach(d => {
      if (d.status === 'fallido' && d.failure_reason) {
        const cleanReason = d.failure_reason.trim();
        if (cleanReason) {
          reasonsMap[cleanReason] = (reasonsMap[cleanReason] || 0) + 1;
        }
      }
    });

    const failureReasons = Object.entries(reasonsMap)
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    return {
      total,
      delivered,
      failed,
      effectiveness,
      avgDeviation,
      onTimeRate,
      distribution: {
        early,
        onTimeExact,
        delay1to2,
        delay3to5,
        delay6plus
      },
      carriersBreakdown,
      zonesBreakdown,
      failureReasons
    };
  }, [filteredDeliveries]);

  // Paginated deliveries list
  const paginatedDeliveries = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredDeliveries.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredDeliveries, currentPage]);

  const totalPages = Math.ceil(filteredDeliveries.length / itemsPerPage);

  // CSV Exporter
  const handleExportCSV = () => {
    if (filteredDeliveries.length === 0) {
      alert("No hay registros filtrados para exportar.");
      return;
    }

    const escapeCSV = (val: string | number | null | undefined) => {
      if (val === null || val === undefined) return '""';
      let str = String(val);
      str = str.replace(/"/g, '""'); // Escapar comillas
      if (str.includes(',') || str.includes('\n') || str.includes('\r') || str.includes('"')) {
        return `"${str}"`;
      }
      return str;
    };

    let csvContent = "\ufeff"; // BOM para Excel UTF-8
    csvContent += "Código Pedido,Cliente,Monto,Transportista,Zona,Contacto Logística,Fecha Prometida,Fecha Real,Desvío (Días),Estado,Motivo Falla / Notas,Acompañante\n";

    filteredDeliveries.forEach(d => {
      const code = d.orders?.legacy_code || "";
      const customer = d.orders?.customer_name || "";
      const amount = d.orders?.total_amount || 0;
      const carrier = d.carriers?.name || "Desconocido";
      const zone = d.predominant_zone || "";
      const contact = d.logistics_contact || "";
      const plannedDate = d.delivery_date || "";
      const realDate = d.real_delivery_date || "";
      const deviation = d.deviation || 0;
      const status = d.status === 'entregado' ? 'Entregado' : 'Fallido';
      const detail = d.failure_reason || d.notes || "";
      const companion = d.companion || "";

      csvContent += `${escapeCSV(code)},${escapeCSV(customer)},${amount},${escapeCSV(carrier)},${escapeCSV(zone)},${escapeCSV(contact)},${escapeCSV(plannedDate)},${escapeCSV(realDate)},${deviation},${escapeCSV(status)},${escapeCSV(detail)},${escapeCSV(companion)}\n`;
    });

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `historial_entregas_logistica_${startDate}_a_${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getDeviationBadge = (dev: number) => {
    if (dev < 0) {
      return <span className="bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded font-black text-[10px]" title="Entrega anticipada">{dev} días 🔵</span>;
    }
    if (dev === 0) {
      return <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded font-black text-[10px]">A tiempo 🟢</span>;
    }
    if (dev >= 1 && dev <= 2) {
      return <span className="bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded font-black text-[10px]">{dev} días de desvío 🟡</span>;
    }
    if (dev >= 3 && dev <= 5) {
      return <span className="bg-orange-50 text-orange-700 border border-orange-200 px-2 py-0.5 rounded font-black text-[10px]">{dev} días de desvío 🟠</span>;
    }
    return <span className="bg-red-50 text-red-700 border border-red-200 px-2 py-0.5 rounded font-black text-[10px]">{dev} días de desvío 🔴</span>;
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Title block */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2 uppercase">
            <Truck className="w-5 h-5 text-brand-600 animate-pulse" /> Tiempos de Entrega y Logística
          </h1>
          <p className="text-xs text-slate-500 font-bold mt-1">
            Analizá los desvíos reales de las entregas y administrá los plazos y reglas de reparto comprometidos.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 shrink-0">
          <button
            onClick={() => setActiveTab('stats')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${
              activeTab === 'stats'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" /> Estadísticas Reales
          </button>
          <button
            onClick={() => setActiveTab('rules')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${
              activeTab === 'rules'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Clock className="w-3.5 h-3.5" /> Configuración de Reglas
          </button>
        </div>
      </div>

      {statusMsg && activeTab === 'rules' && (
        <div className={`p-4 rounded-xl border flex items-center gap-2.5 animate-in fade-in slide-in-from-top-2 text-xs font-bold ${
          statusMsg.type === 'success' 
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
            : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          {statusMsg.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />}
          <span>{statusMsg.text}</span>
        </div>
      )}

      {/* =========================================================================
          VISTA 1: ANALÍTICA Y ESTADÍSTICAS LOGÍSTICAS
          ========================================================================= */}
      {activeTab === 'stats' && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-200">
          
          {/* Barra de Filtros */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/60 shadow-sm space-y-4">
            <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-end justify-between">
              
              {/* Controles de Rango de Fechas */}
              <div className="flex flex-wrap items-end gap-3 flex-1">
                <div className="space-y-1">
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">Rango por Defecto</label>
                  <div className="flex bg-slate-50 rounded-xl border border-slate-200 p-0.5">
                    {[
                      { id: 'hoy', label: 'Hoy' },
                      { id: '7dias', label: '7D' },
                      { id: '30dias', label: '30D' },
                      { id: 'mes', label: 'Este Mes' },
                      { id: 'todos', label: 'Todo' }
                    ].map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => handlePresetChange(p.id)}
                        className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                          presetRange === p.id 
                            ? 'bg-white text-slate-900 border border-slate-200 shadow-sm' 
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">Desde</label>
                  <input 
                    type="date"
                    value={startDate}
                    onChange={e => { setStartDate(e.target.value); setPresetRange("personalizado"); setCurrentPage(1); }}
                    className="px-3 py-1.5 rounded-xl border border-slate-200 font-bold text-xs bg-slate-50 text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500/10"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">Hasta</label>
                  <input 
                    type="date"
                    value={endDate}
                    onChange={e => { setEndDate(e.target.value); setPresetRange("personalizado"); setCurrentPage(1); }}
                    className="px-3 py-1.5 rounded-xl border border-slate-200 font-bold text-xs bg-slate-50 text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500/10"
                  />
                </div>

                {/* Refrescar */}
                <button
                  onClick={loadStatsData}
                  className="p-2 border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-400 hover:text-slate-600 transition-colors shrink-0"
                  title="Recargar datos"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>

              {/* Selector de CSV */}
              <div className="flex gap-2">
                <Button
                  onClick={handleExportCSV}
                  className="flex items-center gap-1.5 px-4 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 font-black text-xs uppercase tracking-wider rounded-xl shadow-sm"
                >
                  <Download className="w-4 h-4 text-slate-400" /> Exportar CSV
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 pt-3 border-t border-slate-100">
              {/* Buscador */}
              <div className="space-y-1">
                <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none">Buscar entrega</label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Pedido, cliente, chofer..."
                    value={searchTerm}
                    onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                    className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 font-bold text-xs bg-slate-50 text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500/10 placeholder-slate-400"
                  />
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                </div>
              </div>

              {/* Chofer */}
              <div className="space-y-1">
                <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none">Transportista</label>
                <select
                  value={selectedCarrierId}
                  onChange={e => { setSelectedCarrierId(e.target.value); setCurrentPage(1); }}
                  className="w-full px-3 py-1.5 rounded-xl border border-slate-200 font-bold text-xs bg-slate-50 text-slate-700 focus:outline-none cursor-pointer"
                >
                  <option value="all">Todos los Fleteros</option>
                  {carriersList.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* Zona */}
              <div className="space-y-1">
                <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none">Zona Predominante</label>
                <select
                  value={selectedZone}
                  onChange={e => { setSelectedZone(e.target.value); setCurrentPage(1); }}
                  className="w-full px-3 py-1.5 rounded-xl border border-slate-200 font-bold text-xs bg-slate-50 text-slate-700 focus:outline-none cursor-pointer"
                >
                  <option value="all">Todas las Zonas</option>
                  {zonesList.map(z => (
                    <option key={z} value={z}>{z}</option>
                  ))}
                </select>
              </div>

              {/* Estado */}
              <div className="space-y-1">
                <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none">Estado de la Entrega</label>
                <select
                  value={selectedStatus}
                  onChange={e => { setSelectedStatus(e.target.value); setCurrentPage(1); }}
                  className="w-full px-3 py-1.5 rounded-xl border border-slate-200 font-bold text-xs bg-slate-50 text-slate-700 focus:outline-none cursor-pointer"
                >
                  <option value="all">Todos los Estados</option>
                  <option value="entregado">Entregado 🟢</option>
                  <option value="fallido">Postergado / Fallido 🔴</option>
                </select>
              </div>
            </div>
          </div>

          {statsLoading ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3 bg-white border border-slate-200/60 shadow-sm rounded-2xl">
              <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
              <span className="text-xs font-black uppercase tracking-wider">Cargando Historial y Estadísticas...</span>
            </div>
          ) : filteredDeliveries.length === 0 ? (
            <div className="bg-white p-12 text-center text-slate-400 font-bold text-xs rounded-2xl border border-slate-200/60 shadow-sm">
              No se encontraron registros de entrega para el rango y filtros seleccionados.
            </div>
          ) : (
            <>
              {/* Tarjetas KPI */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Total Entregas */}
                <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm flex justify-between items-start">
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Entregas Evaluadas</p>
                    <h3 className="text-2xl font-black text-slate-900 leading-none">{computedStats.total}</h3>
                    <p className="text-[10px] text-slate-500 font-bold pt-1 flex items-center gap-1">
                      <span className="text-emerald-500">{computedStats.delivered} exitosas</span> • <span>{computedStats.failed} fallidas</span>
                    </p>
                  </div>
                  <div className="p-2 bg-slate-50 border border-slate-100 rounded-xl">
                    <Truck className="w-5 h-5 text-slate-400" />
                  </div>
                </div>

                {/* Efectividad Logística */}
                <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm flex justify-between items-start">
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Efectividad Logística</p>
                    <h3 className={`text-2xl font-black leading-none ${
                      computedStats.effectiveness >= 90 ? 'text-emerald-600' :
                      computedStats.effectiveness >= 75 ? 'text-amber-600' : 'text-red-600'
                    }`}>
                      {computedStats.effectiveness.toFixed(1)}%
                    </h3>
                    <p className="text-[10px] text-slate-500 font-bold pt-1">
                      Entregas realizadas sobre total despachado
                    </p>
                  </div>
                  <div className="p-2 bg-slate-50 border border-slate-100 rounded-xl">
                    <CheckCircle2 className="w-5 h-5 text-slate-400" />
                  </div>
                </div>

                {/* Desvío Promedio */}
                <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm flex justify-between items-start">
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Desvío Promedio</p>
                    <h3 className={`text-2xl font-black leading-none ${
                      computedStats.avgDeviation <= 1 ? 'text-emerald-600' :
                      computedStats.avgDeviation <= 3 ? 'text-amber-600' : 'text-red-600'
                    }`}>
                      {computedStats.avgDeviation > 0 ? `+${computedStats.avgDeviation.toFixed(1)}` : computedStats.avgDeviation.toFixed(1)} días
                    </h3>
                    <p className="text-[10px] text-slate-500 font-bold pt-1">
                      Diferencia vs fecha comprometida
                    </p>
                  </div>
                  <div className="p-2 bg-slate-50 border border-slate-100 rounded-xl">
                    <Clock className="w-5 h-5 text-slate-400" />
                  </div>
                </div>

                {/* Entregas A Tiempo % */}
                <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm flex justify-between items-start">
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Entregas A Tiempo</p>
                    <h3 className={`text-2xl font-black leading-none ${
                      computedStats.onTimeRate >= 80 ? 'text-emerald-600' :
                      computedStats.onTimeRate >= 60 ? 'text-amber-600' : 'text-red-600'
                    }`}>
                      {computedStats.onTimeRate.toFixed(1)}%
                    </h3>
                    <p className="text-[10px] text-slate-500 font-bold pt-1">
                      Pedidos entregados sin demoras
                    </p>
                  </div>
                  <div className="p-2 bg-slate-50 border border-slate-100 rounded-xl">
                    <TrendingUp className="w-5 h-5 text-slate-400" />
                  </div>
                </div>
              </div>

              {/* Distribución y Falla */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Visualización de Distribución */}
                <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm space-y-4 lg:col-span-2">
                  <h3 className="font-black text-slate-800 text-xs uppercase tracking-wider pb-2 border-b border-slate-100 flex items-center gap-1.5">
                    <BarChart3 className="w-4 h-4 text-brand-600" /> Distribución de Tiempos y Retrasos
                  </h3>
                  
                  <div className="space-y-4 pt-2">
                    {/* Anticipadas */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs font-bold">
                        <span className="text-slate-600">Entregas Anticipadas (Antes de fecha)</span>
                        <span className="text-blue-700">{computedStats.distribution.early} ({((computedStats.distribution.early / computedStats.total) * 100).toFixed(1)}%)</span>
                      </div>
                      <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                        <div 
                          className="bg-gradient-to-r from-blue-500 to-blue-600 h-full transition-all duration-500"
                          style={{ width: `${(computedStats.distribution.early / computedStats.total) * 100}%` }}
                        />
                      </div>
                    </div>

                    {/* Exactas / A Tiempo */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs font-bold">
                        <span className="text-slate-600">Entregado el Día Exacto Comprometido</span>
                        <span className="text-emerald-700">{computedStats.distribution.onTimeExact} ({((computedStats.distribution.onTimeExact / computedStats.total) * 100).toFixed(1)}%)</span>
                      </div>
                      <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                        <div 
                          className="bg-gradient-to-r from-emerald-500 to-emerald-600 h-full transition-all duration-500"
                          style={{ width: `${(computedStats.distribution.onTimeExact / computedStats.total) * 100}%` }}
                        />
                      </div>
                    </div>

                    {/* Demora Leve */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs font-bold">
                        <span className="text-slate-600">Demora Leve (1 a 2 días de desvío)</span>
                        <span className="text-amber-700">{computedStats.distribution.delay1to2} ({((computedStats.distribution.delay1to2 / computedStats.total) * 100).toFixed(1)}%)</span>
                      </div>
                      <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                        <div 
                          className="bg-gradient-to-r from-amber-400 to-amber-500 h-full transition-all duration-500"
                          style={{ width: `${(computedStats.distribution.delay1to2 / computedStats.total) * 100}%` }}
                        />
                      </div>
                    </div>

                    {/* Demora Media */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs font-bold">
                        <span className="text-slate-600">Demora Moderada (3 a 5 días de desvío)</span>
                        <span className="text-orange-700">{computedStats.distribution.delay3to5} ({((computedStats.distribution.delay3to5 / computedStats.total) * 100).toFixed(1)}%)</span>
                      </div>
                      <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                        <div 
                          className="bg-gradient-to-r from-orange-400 to-orange-500 h-full transition-all duration-500"
                          style={{ width: `${(computedStats.distribution.delay3to5 / computedStats.total) * 100}%` }}
                        />
                      </div>
                    </div>

                    {/* Demora Crítica */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs font-bold">
                        <span className="text-slate-600">Demora Crítica (6 o más días de desvío)</span>
                        <span className="text-red-700">{computedStats.distribution.delay6plus} ({((computedStats.distribution.delay6plus / computedStats.total) * 100).toFixed(1)}%)</span>
                      </div>
                      <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                        <div 
                          className="bg-gradient-to-r from-red-500 to-red-600 h-full transition-all duration-500"
                          style={{ width: `${(computedStats.distribution.delay6plus / computedStats.total) * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Motivos de Falla */}
                <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm space-y-4">
                  <h3 className="font-black text-slate-800 text-xs uppercase tracking-wider pb-2 border-b border-slate-100 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-red-500" /> Principales Motivos de Falla
                  </h3>
                  
                  {computedStats.failureReasons.length === 0 ? (
                    <div className="text-center py-12 text-slate-400 text-xs font-bold">
                      No se registraron fallas o postergaciones en este período.
                    </div>
                  ) : (
                    <div className="space-y-3 pt-2">
                      {computedStats.failureReasons.map((fr, idx) => (
                        <div key={idx} className="flex justify-between items-start gap-3 bg-slate-50/60 border border-slate-100 p-2.5 rounded-xl text-xs font-semibold text-slate-700">
                          <span className="truncate flex-1" title={fr.reason}>{fr.reason}</span>
                          <span className="bg-red-50 text-red-700 border border-red-100 px-2 py-0.5 rounded-full text-[10px] font-black">{fr.count}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Desgloses por Transportista y por Zona */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* Desglose Transportista */}
                <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm space-y-4">
                  <h3 className="font-black text-slate-800 text-xs uppercase tracking-wider pb-2 border-b border-slate-100 flex items-center gap-1.5">
                    <User className="w-4 h-4 text-brand-600" /> Rendimiento por Transportista
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-100 text-slate-400 font-black uppercase tracking-wider text-[9px]">
                          <th className="py-2 px-1">Chofer</th>
                          <th className="py-2 px-1 text-center">Viajes</th>
                          <th className="py-2 px-1 text-center">Tasa Éxito</th>
                          <th className="py-2 px-1 text-center">Desvío Promedio</th>
                          <th className="py-2 px-1 text-center">A Tiempo</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {computedStats.carriersBreakdown.map(c => (
                          <tr key={c.name} className="hover:bg-slate-50/50 transition-colors font-semibold text-slate-700">
                            <td className="py-2 px-1 text-slate-900 font-bold">{c.name}</td>
                            <td className="py-2 px-1 text-center font-bold text-slate-500">{c.total}</td>
                            <td className="py-2 px-1 text-center">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-black ${
                                c.successRate >= 90 ? 'text-emerald-700 bg-emerald-50' :
                                c.successRate >= 75 ? 'text-amber-700 bg-amber-50' : 'text-red-700 bg-red-50'
                              }`}>{c.successRate.toFixed(1)}%</span>
                            </td>
                            <td className="py-2 px-1 text-center">
                              <span className={c.avgDeviation > 2 ? 'text-red-600 font-bold' : c.avgDeviation > 0.5 ? 'text-amber-600' : 'text-emerald-600'}>
                                {c.avgDeviation > 0 ? `+${c.avgDeviation.toFixed(1)}` : c.avgDeviation.toFixed(1)} d
                              </span>
                            </td>
                            <td className="py-2 px-1 text-center text-[11px] font-bold text-slate-500">{c.onTimeRate.toFixed(1)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Desglose por Zona */}
                <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm space-y-4">
                  <h3 className="font-black text-slate-800 text-xs uppercase tracking-wider pb-2 border-b border-slate-100 flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-brand-600" /> Rendimiento por Zona Predominante
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-100 text-slate-400 font-black uppercase tracking-wider text-[9px]">
                          <th className="py-2 px-1">Zona</th>
                          <th className="py-2 px-1 text-center">Viajes</th>
                          <th className="py-2 px-1 text-center">Tasa Éxito</th>
                          <th className="py-2 px-1 text-center">Desvío Promedio</th>
                          <th className="py-2 px-1 text-center">A Tiempo</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {computedStats.zonesBreakdown.slice(0, 10).map(z => (
                          <tr key={z.name} className="hover:bg-slate-50/50 transition-colors font-semibold text-slate-700">
                            <td className="py-2 px-1 text-slate-900 font-bold">{z.name}</td>
                            <td className="py-2 px-1 text-center font-bold text-slate-500">{z.total}</td>
                            <td className="py-2 px-1 text-center">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-black ${
                                z.successRate >= 90 ? 'text-emerald-700 bg-emerald-50' :
                                z.successRate >= 75 ? 'text-amber-700 bg-amber-50' : 'text-red-700 bg-red-50'
                              }`}>{z.successRate.toFixed(1)}%</span>
                            </td>
                            <td className="py-2 px-1 text-center">
                              <span className={z.avgDeviation > 2 ? 'text-red-600 font-bold' : z.avgDeviation > 0.5 ? 'text-amber-600' : 'text-emerald-600'}>
                                {z.avgDeviation > 0 ? `+${z.avgDeviation.toFixed(1)}` : z.avgDeviation.toFixed(1)} d
                              </span>
                            </td>
                            <td className="py-2 px-1 text-center text-[11px] font-bold text-slate-500">{z.onTimeRate.toFixed(1)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Registro Detallado */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm space-y-4">
                <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                  <h3 className="font-black text-slate-800 text-xs uppercase tracking-wider">
                    Registro Histórico de Recorridos ({filteredDeliveries.length} registros)
                  </h3>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-400 font-black uppercase tracking-wider text-[9px]">
                        <th className="py-2 px-2">Pedido</th>
                        <th className="py-2 px-2">Cliente</th>
                        <th className="py-2 px-2">Transportista</th>
                        <th className="py-2 px-2">Zona</th>
                        <th className="py-2 px-2">Fecha Prometida</th>
                        <th className="py-2 px-2">Fecha Real</th>
                        <th className="py-2 px-2 text-center">Desvío</th>
                        <th className="py-2 px-2 text-center">Estado</th>
                        <th className="py-2 px-2">Detalles / Falla</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {paginatedDeliveries.map(d => (
                        <tr key={d.id} className="hover:bg-slate-50/50 transition-colors font-semibold text-slate-700">
                          <td className="py-2.5 px-2 font-black text-brand-600">{d.orders?.legacy_code || "N/A"}</td>
                          <td className="py-2.5 px-2 text-slate-900 font-bold">{d.orders?.customer_name || "N/A"}</td>
                          <td className="py-2.5 px-2 font-bold text-slate-800">{d.carriers?.name || "Desconocido"}</td>
                          <td className="py-2.5 px-2 text-slate-500 font-bold">{d.predominant_zone || "N/A"}</td>
                          <td className="py-2.5 px-2 text-slate-400">{d.delivery_date ? new Date(d.delivery_date).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : "N/A"}</td>
                          <td className="py-2.5 px-2 text-slate-800">{new Date(d.real_delivery_date).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</td>
                          <td className="py-2.5 px-2 text-center">{getDeviationBadge(d.deviation || 0)}</td>
                          <td className="py-2.5 px-2 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                              d.status === 'entregado'
                                ? 'text-emerald-700 bg-emerald-50 border border-emerald-100'
                                : 'text-red-700 bg-red-50 border border-red-100'
                            }`}>
                              {d.status === 'entregado' ? 'Entregado' : 'Fallido'}
                            </span>
                          </td>
                          <td className="py-2.5 px-2 text-slate-500 max-w-[200px] truncate" title={d.failure_reason || d.notes || ""}>
                            {d.failure_reason || d.notes || "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Paginación */}
                {totalPages > 1 && (
                  <div className="flex justify-between items-center pt-4 border-t border-slate-100 text-xs font-bold text-slate-500">
                    <div>
                      Mostrando {Math.min(filteredDeliveries.length, (currentPage - 1) * itemsPerPage + 1)} a {Math.min(filteredDeliveries.length, currentPage * itemsPerPage)} de {filteredDeliveries.length} registros
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                        disabled={currentPage === 1}
                        className="p-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-40 cursor-pointer"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <span className="flex items-center px-3 border border-slate-200 rounded-lg bg-slate-50">
                        Página {currentPage} de {totalPages}
                      </span>
                      <button
                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                        disabled={currentPage === totalPages}
                        className="p-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-40 cursor-pointer"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* =========================================================================
          VISTA 2: CONFIGURACIÓN DE REGLAS ABM (Código Existente)
          ========================================================================= */}
      {activeTab === 'rules' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-2 duration-200">
          {/* Formulario */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm space-y-4 h-fit">
            <h3 className="font-black text-slate-800 text-xs uppercase tracking-wider pb-2 border-b border-slate-100">
              {editingId ? "Editar Opción" : "Nueva Opción de Entrega"}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Nombre / Rótulo *</label>
                <input 
                  type="text"
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Ej. Regular 1 o Zonal La Plata"
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-bold text-xs outline-none focus:ring-2 focus:ring-brand-500/10"
                />
                <p className="text-[9px] text-slate-400 font-medium">Nombre de la opción (ej: Zonal La Plata, Regular 1).</p>
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Descripción / Detalles *</label>
                <input 
                  type="text"
                  required
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Ej. 1 a 3 días hábiles o Sábados"
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-bold text-xs outline-none focus:ring-2 focus:ring-brand-500/10"
                />
                <p className="text-[9px] text-slate-400 font-medium">Rango de días o días de visita programados.</p>
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Categoría (Flete Color) *</label>
                <select
                  value={category}
                  onChange={e => setCategory(e.target.value as 'Regular' | 'Zonal' | 'Particular' | 'Express')}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-bold text-xs outline-none"
                >
                  <option value="Regular">Regular (Gris/Blanco ⚪)</option>
                  <option value="Zonal">Zonal (Azul 🔵)</option>
                  <option value="Particular">Particular (Amarillo 🟡)</option>
                  <option value="Express">Express (Verde 🟢)</option>
                </select>
                <p className="text-[9px] text-slate-400 font-medium">Define el color del ícono identificador.</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Días de Reparto (Sugerencia Automática)</label>
                <div className="flex flex-wrap gap-1">
                  {[
                    { value: 1, label: 'Lun' },
                    { value: 2, label: 'Mar' },
                    { value: 3, label: 'Mié' },
                    { value: 4, label: 'Jue' },
                    { value: 5, label: 'Vie' },
                    { value: 6, label: 'Sáb' },
                    { value: 0, label: 'Dom' }
                  ].map(d => {
                    const isSelected = deliveryDays.includes(d.value);
                    return (
                      <button
                        key={d.value}
                        type="button"
                        onClick={() => {
                          if (isSelected) {
                            setDeliveryDays(deliveryDays.filter(val => val !== d.value));
                          } else {
                            setDeliveryDays([...deliveryDays, d.value].sort());
                          }
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                          isSelected 
                            ? 'bg-brand-600 border-brand-600 text-white shadow-sm shadow-brand-600/20' 
                            : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        {d.label}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[9px] text-slate-400 font-medium">Días en los que se sugiere la entrega al vendedor.</p>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input 
                  type="checkbox"
                  id="is_active"
                  checked={isActive}
                  onChange={e => setIsActive(e.target.checked)}
                  className="w-3.5 h-3.5 rounded text-brand-600 border-slate-300 focus:ring-brand-500/10 cursor-pointer"
                />
                <label htmlFor="is_active" className="text-[10px] font-black uppercase tracking-wider text-slate-600 cursor-pointer select-none">
                  Opción Activa (Visible)
                </label>
              </div>

              <div className="flex gap-2 pt-2 border-t border-slate-100">
                <Button 
                  type="submit" 
                  disabled={submittingRule} 
                  className="flex-1 py-2 text-xs font-black uppercase tracking-wider bg-brand-600 hover:bg-brand-700 text-white rounded-lg flex items-center justify-center gap-1.5 shadow-sm"
                >
                  {submittingRule ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : editingId ? (
                    <>
                      <Save className="w-3.5 h-3.5" /> Guardar
                    </>
                  ) : (
                    <>
                      <Plus className="w-3.5 h-3.5" /> Agregar
                    </>
                  )}
                </Button>
                {editingId && (
                  <Button 
                    type="button" 
                    onClick={handleResetForm}
                    className="py-2 px-3 text-xs font-black bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg border border-slate-200"
                  >
                    Cancelar
                  </Button>
                )}
              </div>
            </form>
          </div>

          {/* Tabla / Lista */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm lg:col-span-2 space-y-4">
            <h3 className="font-black text-slate-800 text-xs uppercase tracking-wider pb-2 border-b border-slate-100">
              Listado de Opciones
            </h3>

            {loadingRules ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2">
                <Loader2 className="w-6 h-6 animate-spin text-brand-500" />
                <span className="text-xs font-bold">Cargando opciones...</span>
              </div>
            ) : deliveryTimes.length === 0 ? (
              <div className="text-center py-12 text-slate-400 font-bold text-xs">
                No hay tipos de entrega creados. ¡Agregá el primero!
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 text-slate-400 font-black uppercase tracking-wider text-[9px]">
                      <th className="py-2.5 px-3">Nombre</th>
                      <th className="py-2.5 px-3">Descripción</th>
                      <th className="py-2.5 px-3">Categoría</th>
                      <th className="py-2.5 px-3">Estado</th>
                      <th className="py-2.5 px-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {deliveryTimes.map(item => (
                      <tr 
                        key={item.id} 
                        className={`hover:bg-slate-50/50 transition-colors ${!item.is_active ? 'opacity-60 bg-slate-50/20' : ''} ${editingId === item.id ? 'bg-brand-50/30' : ''}`}
                      >
                        <td className="py-2.5 px-3">
                          <div className="font-bold text-slate-900">{item.name}</div>
                          {item.delivery_days && item.delivery_days.length > 0 && (
                            <div className="flex gap-0.5 mt-1 flex-wrap">
                              {item.delivery_days.map(d => {
                                const names = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
                                return (
                                  <span key={d} className="px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200/60 text-emerald-800 text-[8px] font-black uppercase tracking-wider">
                                    {names[d]}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-medium text-slate-600">{item.description}</td>
                        <td className="py-2.5 px-3">{getCategoryBadge(item.category)}</td>
                        <td className="py-2.5 px-3">
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                            item.is_active 
                              ? 'text-emerald-700 bg-emerald-50 border border-emerald-100' 
                              : 'text-slate-500 bg-slate-100 border border-slate-200'
                          }`}>
                            {item.is_active ? 'Activa' : 'Inactiva'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right space-x-1.5">
                          <button
                            type="button"
                            onClick={() => handleEdit(item)}
                            className="p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-slate-700 transition-colors"
                            title="Editar"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(item.id, item.name)}
                            className="p-1 hover:bg-red-50 rounded text-slate-400 hover:text-red-600 transition-colors"
                            title="Eliminar"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

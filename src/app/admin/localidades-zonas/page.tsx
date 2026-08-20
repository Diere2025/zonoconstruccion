"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { 
  MapPin, 
  Plus, 
  Trash2, 
  Save, 
  X, 
  Edit3, 
  Loader2, 
  CheckCircle2, 
  AlertCircle,
  Map,
  Search,
  Building2,
  RefreshCw
} from "lucide-react";
import { Button } from "@/components/ui/Button";

export const getZoneClassForValue = (val?: string | null) => {
  switch (val) {
    case 'emerald': return 'bg-emerald-600 text-white border-emerald-700';
    case 'blue': return 'bg-blue-600 text-white border-blue-700';
    case 'slate': return 'bg-slate-500 text-white border-slate-600';
    case 'amber': return 'bg-amber-500 text-white border-amber-600';
    case 'indigo': return 'bg-indigo-600 text-white border-indigo-700';
    case 'rose': return 'bg-rose-600 text-white border-rose-700';
    case 'purple': return 'bg-purple-600 text-white border-purple-700';
    case 'orange': return 'bg-orange-500 text-white border-orange-600';
    case 'cyan': return 'bg-cyan-600 text-white border-cyan-700';
    case 'slate-light': return 'bg-slate-200 text-slate-700 border-slate-300';
    default: return 'bg-slate-200 text-slate-700 border-slate-300';
  }
};

export const ZONE_COLORS = [
  { name: 'Esmeralda (Verde)', value: 'emerald' },
  { name: 'Azul', value: 'blue' },
  { name: 'Gris', value: 'slate' },
  { name: 'Ámbar (Amarillo)', value: 'amber' },
  { name: 'Índigo', value: 'indigo' },
  { name: 'Rojo', value: 'rose' },
  { name: 'Púrpura', value: 'purple' },
  { name: 'Naranja', value: 'orange' },
  { name: 'Cian', value: 'cyan' },
  { name: 'Gris Claro (Neutro)', value: 'slate-light' }
];

interface Zone {
  id: string;
  name: string;
  delivery_schedule: string;
  delivery_time_id?: string | null;
  delivery_times?: {
    name: string;
    description: string;
    delivery_days?: number[] | null;
  } | null;
  is_active: boolean;
  color?: string | null;
  created_at?: string;
}

interface Locality {
  id: string;
  name: string;
  zone_id: string;
  is_active: boolean;
  zones?: {
    name: string;
  } | null;
  created_at?: string;
}

export default function LocalidadesZonasAdminPage() {
  const [activeTab, setActiveTab] = useState<'zones' | 'localities'>('zones');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [zones, setZones] = useState<Zone[]>([]);
  const [localities, setLocalities] = useState<Locality[]>([]);
  
  // Search and Filter states
  const [zoneSearch, setZoneSearch] = useState("");
  const [localitySearch, setLocalitySearch] = useState("");
  const [selectedZoneFilter, setSelectedZoneFilter] = useState("");

  // Zone Form states
  const [editingZoneId, setEditingZoneId] = useState<string | null>(null);
  const [zoneName, setZoneName] = useState("");
  const [zoneSchedule, setZoneSchedule] = useState("");
  const [zoneDeliveryTimeId, setZoneDeliveryTimeId] = useState("");
  const [zoneActive, setZoneActive] = useState(true);
  const [zoneColor, setZoneColor] = useState("");

  // Delivery times state
  const [deliveryTimes, setDeliveryTimes] = useState<any[]>([]);

  // Locality Form states
  const [editingLocalityId, setEditingLocalityId] = useState<string | null>(null);
  const [localityName, setLocalityName] = useState("");
  const [localityZoneId, setLocalityZoneId] = useState("");
  const [localityActive, setLocalityActive] = useState(true);

  // Status message
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // Google Sheet sync states
  const [syncing, setSyncing] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [syncData, setSyncData] = useState<{
    newLocalities: { name: string; zone: string }[];
    mismatchedZones: { name: string; csvZone: string; dbZone: string; localityId: string; newZoneId: string }[];
    nameUpdates: { dbName: string; csvName: string; localityId: string }[];
    onlyInDb: { id: string; name: string; zone: string }[];
    unmappedZones: string[];
  } | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    console.log("loadData: Iniciando carga...");
    // Intentar cargar desde caché para visualización instantánea
    const cachedDt = sessionStorage.getItem("cached_delivery_times");
    const cachedZones = sessionStorage.getItem("cached_zones");
    const cachedLocalities = sessionStorage.getItem("cached_localities");
    
    if (cachedDt && cachedZones && cachedLocalities) {
      setDeliveryTimes(JSON.parse(cachedDt));
      setZones(JSON.parse(cachedZones));
      setLocalities(JSON.parse(cachedLocalities));
      setLoading(false);
    } else {
      setLoading(true);
    }

    try {
      console.log("loadData: Solicitando datos en paralelo...");
      const [dtRes, zonesRes, localitiesRes] = await Promise.all([
        supabase
          .from('delivery_times')
          .select('id, name, description')
          .eq('is_active', true)
          .order('name'),
        supabase
          .from('zones')
          .select('*, delivery_times(name, description, delivery_days)')
          .order('name', { ascending: true }),
        supabase
          .from('localities')
          .select('*, zones(name)')
          .order('name', { ascending: true })
      ]);

      if (dtRes.error) console.error("Error loading delivery times:", dtRes.error);
      if (zonesRes.error) throw zonesRes.error;
      if (localitiesRes.error) throw localitiesRes.error;

      const dtData = dtRes.data || [];
      const zonesData = zonesRes.data || [];
      const localitiesData = localitiesRes.data || [];

      setDeliveryTimes(dtData);
      setZones(zonesData);
      setLocalities(localitiesData);

      // Guardar en caché
      sessionStorage.setItem("cached_delivery_times", JSON.stringify(dtData));
      sessionStorage.setItem("cached_zones", JSON.stringify(zonesData));
      sessionStorage.setItem("cached_localities", JSON.stringify(localitiesData));
    } catch (err: any) {
      console.error("loadData: Error capturado:", err);
      showStatus('error', `Error al cargar datos: ${err.message || "Asegurate de haber ejecutado las migraciones SQL."}`);
    } finally {
      console.log("loadData: Finalizando carga, setLoading(false)");
      setLoading(false);
    }
  };

  const handleStartSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/admin/sync-localities');
      const data = await res.json();
      if (data.error) {
        showStatus('error', data.error);
        return;
      }
      setSyncData(data);
      setShowSyncModal(true);
    } catch (err: any) {
      console.error(err);
      showStatus('error', "Error al obtener diferencias de la planilla.");
    } finally {
      setSyncing(false);
    }
  };

  const handleApplySync = async () => {
    if (!syncData) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/sync-localities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newLocalities: syncData.newLocalities,
          mismatchedZones: syncData.mismatchedZones,
          nameUpdates: syncData.nameUpdates
        })
      });
      const data = await res.json();
      if (data.error) {
        showStatus('error', data.error);
        return;
      }
      showStatus('success', "¡Sincronización finalizada correctamente!");
      setShowSyncModal(false);
      setSyncData(null);
      await loadData();
    } catch (err: any) {
      console.error(err);
      showStatus('error', "Error al aplicar la sincronización.");
    } finally {
      setSubmitting(false);
    }
  };

  const showStatus = (type: 'success' | 'error', text: string) => {
    setStatusMsg({ type, text });
    setTimeout(() => setStatusMsg(null), 4000);
  };

  const handleResetZoneForm = () => {
    setEditingZoneId(null);
    setZoneName("");
    setZoneSchedule("");
    setZoneDeliveryTimeId("");
    setZoneActive(true);
    setZoneColor("");
  };

  const handleResetLocalityForm = () => {
    setEditingLocalityId(null);
    setLocalityName("");
    setLocalityZoneId("");
    setLocalityActive(true);
  };

  const handleEditZone = (zone: Zone) => {
    setEditingZoneId(zone.id);
    setZoneName(zone.name);
    setZoneSchedule(zone.delivery_schedule || "");
    setZoneDeliveryTimeId(zone.delivery_time_id || "");
    setZoneActive(zone.is_active);
    setZoneColor(zone.color || "");
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleEditLocality = (locality: Locality) => {
    setEditingLocalityId(locality.id);
    setLocalityName(locality.name);
    setLocalityZoneId(locality.zone_id);
    setLocalityActive(locality.is_active);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleZoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!zoneName.trim()) {
      showStatus('error', "El nombre de la zona es obligatorio.");
      return;
    }

    setSubmitting(true);
    try {
      if (editingZoneId) {
        const { error } = await supabase
          .from('zones')
          .update({
            name: zoneName.trim(),
            delivery_schedule: zoneSchedule.trim(),
            delivery_time_id: zoneDeliveryTimeId || null,
            is_active: zoneActive,
            color: zoneColor || null
          })
          .eq('id', editingZoneId);

        if (error) throw error;
        showStatus('success', "Zona actualizada correctamente.");
      } else {
        const { error } = await supabase
          .from('zones')
          .insert([{
            name: zoneName.trim(),
            delivery_schedule: zoneSchedule.trim(),
            delivery_time_id: zoneDeliveryTimeId || null,
            is_active: zoneActive,
            color: zoneColor || null
          }]);

        if (error) throw error;
        showStatus('success', "Zona creada correctamente.");
      }
      handleResetZoneForm();
      await loadData();
    } catch (err: any) {
      console.error(err);
      showStatus('error', err.message || "Error al guardar la zona.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleLocalitySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!localityName.trim() || !localityZoneId) {
      showStatus('error', "El nombre y la zona son obligatorios.");
      return;
    }

    setSubmitting(true);
    try {
      if (editingLocalityId) {
        const { error } = await supabase
          .from('localities')
          .update({
            name: localityName.trim(),
            zone_id: localityZoneId,
            is_active: localityActive
          })
          .eq('id', editingLocalityId);

        if (error) throw error;
        showStatus('success', "Localidad actualizada correctamente.");
      } else {
        const { error } = await supabase
          .from('localities')
          .insert([{
            name: localityName.trim(),
            zone_id: localityZoneId,
            is_active: localityActive
          }]);

        if (error) throw error;
        showStatus('success', "Localidad creada correctamente.");
      }
      handleResetLocalityForm();
      await loadData();
    } catch (err: any) {
      console.error(err);
      showStatus('error', err.message || "Error al guardar la localidad.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteZone = async (id: string) => {
    if (!confirm("¿Estás seguro de eliminar esta zona? Se eliminarán todas las localidades asociadas.")) return;
    try {
      const { error } = await supabase.from('zones').delete().eq('id', id);
      if (error) throw error;
      showStatus('success', "Zona eliminada correctamente.");
      await loadData();
    } catch (err: any) {
      console.error(err);
      showStatus('error', `No se pudo eliminar la zona: ${err.message || "Verificá si tiene relaciones pendientes."}`);
    }
  };

  const handleDeleteLocality = async (id: string) => {
    if (!confirm("¿Estás seguro de eliminar esta localidad?")) return;
    try {
      const { error } = await supabase.from('localities').delete().eq('id', id);
      if (error) throw error;
      showStatus('success', "Localidad eliminada correctamente.");
      await loadData();
    } catch (err: any) {
      console.error(err);
      showStatus('error', "Error al eliminar la localidad.");
    }
  };

  // Filter lists
  const filteredZones = zones.filter(z => 
    z.name.toLowerCase().includes(zoneSearch.toLowerCase()) ||
    (z.delivery_schedule || "").toLowerCase().includes(zoneSearch.toLowerCase()) ||
    (z.delivery_times?.name || "").toLowerCase().includes(zoneSearch.toLowerCase()) ||
    (z.delivery_times?.description || "").toLowerCase().includes(zoneSearch.toLowerCase())
  );

  const filteredLocalities = localities.filter(l => {
    const matchesSearch = l.name.toLowerCase().includes(localitySearch.toLowerCase());
    const matchesZone = selectedZoneFilter === "" || l.zone_id === selectedZoneFilter;
    return matchesSearch && matchesZone;
  });

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Encabezado */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-brand-50 flex items-center justify-center text-brand-600">
            <Map className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Zonas y Localidades</h1>
            <p className="text-slate-500 text-sm font-medium">Gestioná el mapa de distribución logística</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3 self-stretch sm:self-auto shrink-0">
          {/* Sync Button */}
          <button
            onClick={handleStartSync}
            disabled={syncing}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 bg-brand-50 hover:bg-brand-100 text-brand-700 font-bold rounded-2xl text-xs transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            {syncing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            Sincronizar Planilla
          </button>

          {/* Tabs */}
          <div className="flex bg-slate-100 p-1.5 rounded-2xl gap-1 w-full sm:w-auto">
            <button
              onClick={() => setActiveTab('zones')}
              className={`flex-1 sm:flex-none px-5 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                activeTab === 'zones' 
                  ? 'bg-white text-brand-600 shadow-sm' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Zonas de Reparto ({zones.length})
            </button>
            <button
              onClick={() => setActiveTab('localities')}
              className={`flex-1 sm:flex-none px-5 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                activeTab === 'localities' 
                  ? 'bg-white text-brand-600 shadow-sm' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Localidades ({localities.length})
            </button>
          </div>
        </div>
      </div>

      {/* Alert Status */}
      {statusMsg && (
        <div className={`p-4 rounded-2xl flex items-center gap-3 border font-medium text-sm animate-in fade-in slide-in-from-top-4 duration-350 ${
          statusMsg.type === 'success' 
            ? 'bg-emerald-50 text-emerald-800 border-emerald-100' 
            : 'bg-red-50 text-red-800 border-red-100'
        }`}>
          {statusMsg.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" /> : <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />}
          <span>{statusMsg.text}</span>
        </div>
      )}

      {/* Grid principal */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Formulario Izquierda (1/3) */}
        <div className="lg:col-span-1">
          {activeTab === 'zones' ? (
            <div className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-5 sticky top-6">
              <div className="flex items-center gap-3 border-b border-slate-50 pb-4">
                <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center">
                  <MapPin className="w-4 h-4" />
                </div>
                <h2 className="text-sm font-black uppercase tracking-wider text-slate-800">
                  {editingZoneId ? "Editar Zona" : "Nueva Zona"}
                </h2>
              </div>

              <form onSubmit={handleZoneSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Nombre de la Zona *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: Zona Norte, CABA"
                    className="w-full px-4 py-3 rounded-xl border border-slate-100 focus:ring-4 focus:ring-brand-500/10 bg-slate-50 text-sm font-bold text-slate-800"
                    value={zoneName}
                    onChange={(e) => setZoneName(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Tipo de Entrega</label>
                  <select
                    className="w-full px-4 py-3 rounded-xl border border-slate-100 focus:ring-4 focus:ring-brand-500/10 bg-slate-50 text-sm font-bold text-slate-800"
                    value={zoneDeliveryTimeId}
                    onChange={(e) => setZoneDeliveryTimeId(e.target.value)}
                  >
                    <option value="">Ninguno / Sin tipo de entrega...</option>
                    {deliveryTimes.map(dt => (
                      <option key={dt.id} value={dt.id}>
                        {dt.name} ({dt.description})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Cronograma Manual (Opcional)</label>
                  <input
                    type="text"
                    placeholder="Ej: Martes y Jueves"
                    className="w-full px-4 py-3 rounded-xl border border-slate-100 focus:ring-4 focus:ring-brand-500/10 bg-slate-50 text-sm font-bold text-slate-800"
                    value={zoneSchedule}
                    onChange={(e) => setZoneSchedule(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Color de Etiqueta</label>
                    {zoneColor && (
                      <span className={`inline-flex px-1.5 py-0.5 rounded text-[8px] font-black uppercase border ${getZoneClassForValue(zoneColor)}`}>
                        Vista Previa
                      </span>
                    )}
                  </div>
                  <select
                    className="w-full px-4 py-3 rounded-xl border border-slate-100 focus:ring-4 focus:ring-brand-500/10 bg-slate-50 text-sm font-bold text-slate-800"
                    value={zoneColor}
                    onChange={(e) => setZoneColor(e.target.value)}
                  >
                    <option value="">Por defecto (Autodetectado)</option>
                    {ZONE_COLORS.map(c => (
                      <option key={c.value} value={c.value}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center justify-between bg-slate-50 p-4 rounded-xl">
                  <span className="text-xs font-bold text-slate-600">Estado de la Zona</span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="sr-only peer" 
                      checked={zoneActive}
                      onChange={(e) => setZoneActive(e.target.checked)}
                    />
                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-600"></div>
                  </label>
                </div>

                <div className="flex gap-2 pt-2">
                  {editingZoneId && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleResetZoneForm}
                      className="flex-1 py-3 text-xs font-bold rounded-xl"
                    >
                      <X className="w-3.5 h-3.5 mr-1" /> Cancelar
                    </Button>
                  )}
                  <Button
                    type="submit"
                    disabled={submitting}
                    className="flex-1 py-3 text-xs font-bold rounded-xl"
                  >
                    {submitting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Save className="w-3.5 h-3.5 mr-1" /> 
                        {editingZoneId ? "Actualizar" : "Guardar Zona"}
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </div>
          ) : (
            <div className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-5 sticky top-6">
              <div className="flex items-center gap-3 border-b border-slate-50 pb-4">
                <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center">
                  <Building2 className="w-4 h-4" />
                </div>
                <h2 className="text-sm font-black uppercase tracking-wider text-slate-800">
                  {editingLocalityId ? "Editar Localidad" : "Nueva Localidad"}
                </h2>
              </div>

              <form onSubmit={handleLocalitySubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Nombre de la Localidad *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: Gonnet, San Isidro"
                    className="w-full px-4 py-3 rounded-xl border border-slate-100 focus:ring-4 focus:ring-brand-500/10 bg-slate-50 text-sm font-bold text-slate-800"
                    value={localityName}
                    onChange={(e) => setLocalityName(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Zona Asignada *</label>
                  <select
                    required
                    className="w-full px-4 py-3 rounded-xl border border-slate-100 focus:ring-4 focus:ring-brand-500/10 bg-slate-50 text-sm font-bold text-slate-800"
                    value={localityZoneId}
                    onChange={(e) => setLocalityZoneId(e.target.value)}
                  >
                    <option value="">Seleccionar zona...</option>
                    {zones.filter(z => z.is_active).map(z => (
                      <option key={z.id} value={z.id}>{z.name}</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center justify-between bg-slate-50 p-4 rounded-xl">
                  <span className="text-xs font-bold text-slate-600">Estado de Localidad</span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="sr-only peer" 
                      checked={localityActive}
                      onChange={(e) => setLocalityActive(e.target.checked)}
                    />
                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-600"></div>
                  </label>
                </div>

                <div className="flex gap-2 pt-2">
                  {editingLocalityId && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleResetLocalityForm}
                      className="flex-1 py-3 text-xs font-bold rounded-xl"
                    >
                      <X className="w-3.5 h-3.5 mr-1" /> Cancelar
                    </Button>
                  )}
                  <Button
                    type="submit"
                    disabled={submitting}
                    className="flex-1 py-3 text-xs font-bold rounded-xl"
                  >
                    {submitting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Save className="w-3.5 h-3.5 mr-1" /> 
                        {editingLocalityId ? "Actualizar" : "Guardar Localidad"}
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </div>
          )}
        </div>

        {/* Listado / Tabla Derecha (2/3) */}
        <div className="lg:col-span-2 space-y-4">
          
          {/* Barra de Filtros */}
          <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
              <input
                type="text"
                placeholder={activeTab === 'zones' ? "Buscar zonas por nombre o cronograma..." : "Buscar localidades..."}
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-100 bg-slate-50 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500/10"
                value={activeTab === 'zones' ? zoneSearch : localitySearch}
                onChange={(e) => activeTab === 'zones' ? setZoneSearch(e.target.value) : setLocalitySearch(e.target.value)}
              />
            </div>
            
            {activeTab === 'localities' && (
              <select
                className="px-4 py-2.5 rounded-xl border border-slate-100 bg-slate-50 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500/10 min-w-[150px]"
                value={selectedZoneFilter}
                onChange={(e) => setSelectedZoneFilter(e.target.value)}
              >
                <option value="">Todas las Zonas</option>
                {zones.map(z => (
                  <option key={z.id} value={z.id}>{z.name}</option>
                ))}
              </select>
            )}
          </div>

          {/* Listado */}
          <div className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
                <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
                <span className="text-xs font-bold">Cargando datos del mapa...</span>
              </div>
            ) : activeTab === 'zones' ? (
              filteredZones.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-xs font-bold">
                  No se encontraron zonas que coincidan con la búsqueda.
                </div>
              ) : (
                <div className="divide-y divide-slate-50">
                  {filteredZones.map(zone => (
                    <div key={zone.id} className="py-4 first:pt-0 last:pb-0 flex items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-black text-sm text-slate-800">{zone.name}</span>
                          {zone.color && (
                            <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase border ${getZoneClassForValue(zone.color)}`}>
                              {zone.color}
                            </span>
                          )}
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                            zone.is_active 
                              ? 'bg-emerald-50 text-emerald-700' 
                              : 'bg-slate-100 text-slate-500'
                          }`}>
                            {zone.is_active ? "Activo" : "Inactivo"}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 font-medium mt-1 space-y-0.5">
                          <div>
                            Tipo de Entrega: <span className="font-bold text-slate-700">
                              {zone.delivery_times 
                                ? `${zone.delivery_times.name} (${zone.delivery_times.description})`
                                : "Ninguno"}
                            </span>
                          </div>
                          {zone.delivery_schedule && (
                            <div>
                              Cronograma Manual: <span className="font-bold text-slate-700">{zone.delivery_schedule}</span>
                            </div>
                          )}
                          {zone.delivery_times?.delivery_days && zone.delivery_times.delivery_days.length > 0 && (
                            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                              <span className="text-[10px] text-slate-500 font-medium">Días de Reparto:</span>
                              <div className="flex gap-0.5">
                                {zone.delivery_times.delivery_days.map(d => {
                                  const names = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
                                  return (
                                    <span key={d} className="px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200/60 text-emerald-800 text-[8px] font-black uppercase tracking-wider">
                                      {names[d]}
                                    </span>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleEditZone(zone)}
                          className="p-2 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-all"
                          title="Editar"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteZone(zone.id)}
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                          title="Eliminar"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : (
              filteredLocalities.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-xs font-bold">
                  No se encontraron localidades.
                </div>
              ) : (
                <div className="divide-y divide-slate-50">
                  {filteredLocalities.map(locality => (
                    <div key={locality.id} className="py-4 first:pt-0 last:pb-0 flex items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-black text-sm text-slate-800">{locality.name}</span>
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                            locality.is_active 
                              ? 'bg-emerald-50 text-emerald-700' 
                              : 'bg-slate-100 text-slate-500'
                          }`}>
                            {locality.is_active ? "Activo" : "Inactivo"}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 font-medium mt-1">
                          Zona asignada: <span className="font-bold text-slate-700">{locality.zones?.name || "Sin zona"}</span>
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleEditLocality(locality)}
                          className="p-2 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-all"
                          title="Editar"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteLocality(locality.id)}
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                          title="Eliminar"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}
          </div>
        </div>

      </div>

      {/* Modal de Sincronización */}
      {showSyncModal && syncData && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-md z-[200] flex items-center justify-center p-6 animate-in fade-in duration-200">
          <div className="bg-white rounded-[2rem] w-full max-w-2xl shadow-3xl border border-white/20 p-8 flex flex-col max-h-[85vh] scale-in-center">
            <div className="flex justify-between items-center mb-5 shrink-0">
              <div>
                <h3 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
                  <Map className="w-5 h-5 text-brand-600" /> Sincronización de Planilla
                </h3>
                <p className="text-xs text-slate-400 font-bold mt-1">
                  Comparación entre Google Sheets y la Base de Datos
                </p>
              </div>
              <button 
                onClick={() => setShowSyncModal(false)} 
                className="p-2 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
                disabled={submitting}
              >
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-6 pr-2 min-h-0 text-xs text-slate-700">
              
              {/* Nuevas Zonas que se crearán */}
              {syncData.unmappedZones && syncData.unmappedZones.length > 0 && (
                <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl space-y-2">
                  <span className="font-extrabold text-amber-800 text-xs uppercase tracking-wider block">⚠️ Nuevas Zonas a Crear ({syncData.unmappedZones.length})</span>
                  <p className="text-[10px] text-amber-600 font-bold leading-relaxed">
                    Las siguientes zonas no existen en la base de datos y se crearán automáticamente:
                  </p>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {syncData.unmappedZones.map((z, idx) => (
                      <span key={idx} className="px-2.5 py-1 bg-amber-100 text-amber-800 rounded-lg font-black text-[9px] uppercase">{z}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Localidades Nuevas */}
              <div className="space-y-2.5">
                <span className="font-black text-slate-800 text-xs uppercase tracking-wider block">
                  🆕 Localidades a Agregar ({syncData.newLocalities.length})
                </span>
                {syncData.newLocalities.length === 0 ? (
                  <p className="text-[11px] text-slate-400 font-bold italic">Ninguna localidad nueva a agregar.</p>
                ) : (
                  <div className="border border-slate-100 rounded-2xl divide-y divide-slate-100 max-h-40 overflow-y-auto bg-slate-50/20">
                    {syncData.newLocalities.map((loc, idx) => (
                      <div key={idx} className="flex justify-between items-center px-4 py-2.5 font-bold">
                        <span className="text-slate-800">{loc.name}</span>
                        <span className="px-2 py-0.5 bg-brand-50 text-brand-700 text-[10px] rounded-lg font-black uppercase">{loc.zone}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Localidades a Renombrar */}
              <div className="space-y-2.5">
                <span className="font-black text-slate-800 text-xs uppercase tracking-wider block">
                  📝 Nombres a Corregir ({syncData.nameUpdates.length})
                </span>
                {syncData.nameUpdates.length === 0 ? (
                  <p className="text-[11px] text-slate-400 font-bold italic">Ninguna corrección de nombre detectada.</p>
                ) : (
                  <div className="border border-slate-100 rounded-2xl divide-y divide-slate-100 max-h-40 overflow-y-auto bg-slate-50/20">
                    {syncData.nameUpdates.map((upd, idx) => (
                      <div key={idx} className="flex justify-between items-center px-4 py-2.5 font-bold text-slate-600">
                        <span className="line-through text-slate-400">{upd.dbName}</span>
                        <div className="flex items-center gap-2 font-black text-[10px] uppercase">
                          <span>➡️</span>
                          <span className="px-2 py-0.5 bg-brand-50 text-brand-700 rounded-lg">{upd.csvName}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Zonas a Actualizar */}
              <div className="space-y-2.5">
                <span className="font-black text-slate-800 text-xs uppercase tracking-wider block">
                  🔄 Cambios de Zona ({syncData.mismatchedZones.length})
                </span>
                {syncData.mismatchedZones.length === 0 ? (
                  <p className="text-[11px] text-slate-400 font-bold italic">Ningún cambio de zona detectado.</p>
                ) : (
                  <div className="border border-slate-100 rounded-2xl divide-y divide-slate-100 max-h-40 overflow-y-auto bg-slate-50/20">
                    {syncData.mismatchedZones.map((upd, idx) => (
                      <div key={idx} className="flex justify-between items-center px-4 py-2.5 font-bold text-slate-600">
                        <span>{upd.name}</span>
                        <div className="flex items-center gap-2 font-black text-[10px] uppercase">
                          <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded">{upd.dbZone || "Sin Zona"}</span>
                          <span>➡️</span>
                          <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-lg">{upd.csvZone}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Localidades sólo en DB (Inactivas o eliminadas de la planilla) */}
              <div className="space-y-2.5">
                <span className="font-black text-slate-400 text-xs uppercase tracking-wider block">
                  ℹ️ Localidades en Sistema no Listadas ({syncData.onlyInDb.length})
                </span>
                {syncData.onlyInDb.length === 0 ? (
                  <p className="text-[11px] text-slate-400 font-bold italic">Todas las localidades del sistema están en la planilla.</p>
                ) : (
                  <div className="border border-slate-100 rounded-2xl divide-y divide-slate-100 max-h-40 overflow-y-auto bg-slate-50/10">
                    {syncData.onlyInDb.map((loc, idx) => (
                      <div key={idx} className="flex justify-between items-center px-4 py-2 text-slate-400 font-bold">
                        <span>{loc.name}</span>
                        <span className="text-[10px]">{loc.zone}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>

            <div className="flex gap-3 justify-end pt-5 border-t border-slate-100 shrink-0">
              <button
                type="button"
                onClick={() => setShowSyncModal(false)}
                className="px-4 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-600 font-black rounded-2xl text-xs uppercase tracking-wider transition-all cursor-pointer"
                disabled={submitting}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleApplySync}
                className="px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-black rounded-2xl text-xs uppercase tracking-wider transition-all flex items-center gap-2 shadow-lg shadow-brand-600/20 disabled:opacity-50 cursor-pointer"
                disabled={submitting || (syncData.newLocalities.length === 0 && syncData.mismatchedZones.length === 0 && syncData.nameUpdates.length === 0)}
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                Aplicar Sincronización
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/Button";
import { 
  Loader2, 
  RefreshCw, 
  X, 
  CheckCircle2, 
  Clock, 
  Database, 
  FileSpreadsheet, 
  ShieldCheck, 
  AlertCircle,
  TrendingUp,
  Package,
  Layers,
  ArrowRight,
  Server,
  Smartphone,
  History,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";

interface ImportJobRecord {
  id: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  started_at: string;
  completed_at?: string;
  duration_seconds?: number;
  created_by?: string;
  selected_sheets?: string[];
  config?: any;
  stats?: {
    imported: number;
    updated: number;
    items: number;
    sheetsCompleted: number;
    totalSheets: number;
  };
  current_step?: string;
  progress_percent?: number;
  summary?: string;
  logs?: string[];
  error_message?: string;
}

export default function ImportarPedidosPage() {
  // Import Options
  const [skipENC, setSkipENC] = useState(true);
  const [skipCAMB, setSkipCAMB] = useState(false);
  const [importJazmin, setImportJazmin] = useState(false);
  const [importDiego, setImportDiego] = useState(false);
  const [importLudmila, setImportLudmila] = useState(false);
  const [importFacundo, setImportFacundo] = useState(false);
  const [importCentral, setImportCentral] = useState(true);
  const [importAquafort, setImportAquafort] = useState(true);
  const [syncPaymentMethods, setSyncPaymentMethods] = useState(false);

  // Server Job State
  const [currentJob, setCurrentJob] = useState<ImportJobRecord | null>(null);
  const [recentJobs, setRecentJobs] = useState<ImportJobRecord[]>([]);
  const [isStartingJob, setIsStartingJob] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [currentUserEmail, setCurrentUserEmail] = useState("admin");

  const pollIntervalRef = useRef<any>(null);

  // Get current user email for audit
  useEffect(() => {
    async function getEmail() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.email) setCurrentUserEmail(user.email);
    }
    getEmail();
  }, []);

  // Fetch Current Job Status and Recent Jobs from Server
  const fetchJobStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/import-job", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      if (data.success) {
        setCurrentJob(data.currentJob || (data.recentJobs && data.recentJobs.length > 0 ? data.recentJobs[0] : null));
        setRecentJobs(data.recentJobs || []);
      }
    } catch (e) {
      console.warn("Error checking job status:", e);
    }
  }, []);

  // Initial Load and Polling Controller
  useEffect(() => {
    fetchJobStatus();
  }, [fetchJobStatus]);

  useEffect(() => {
    const isRunning = currentJob?.status === "running";

    if (isRunning) {
      // Poll every 3 seconds while a job is running
      if (!pollIntervalRef.current) {
        pollIntervalRef.current = setInterval(() => {
          fetchJobStatus();
        }, 3000);
      }
    } else {
      // Clear interval when idle
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    }

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [currentJob?.status, fetchJobStatus]);

  // Trigger New Background Job on Server
  const handleStartBackgroundJob = async () => {
    try {
      setIsStartingJob(true);

      const defaultJazminSellerId = "13430e05-b61a-4a3f-9fc3-152d377c4b0c";
      const defaultDiegoSellerId = "381df0d1-183f-4ccb-aaf2-8147c76159a9";
      const defaultLudmilaSellerId = "8207801b-b6cb-48cc-af0f-d2f9f2c98032";
      const defaultFacundoSellerId = "54b9ce55-7354-4b39-9886-314aa79f6aa6";

      const selectedSheets = [
        {
          name: "Jazmín Sánchez",
          url: "https://docs.google.com/spreadsheets/d/16DPcJEdrTMYvNSaUKQo9ODKClqe1VHLlKOX6O_sELRw/gviz/tq?tqx=out:csv&gid=1414092286",
          defaultSellerId: defaultJazminSellerId,
          defaultChannel: "web_organica",
          isCentralSheet: false,
          isAquafortSheet: false,
          enabled: importJazmin
        },
        {
          name: "Diego Bóveda",
          url: "https://docs.google.com/spreadsheets/d/1ccs1yPtwSSUf6dcA5XpxhpvPaWmHfJ0zsCfyJvEBvtg/gviz/tq?tqx=out:csv&gid=1414092286",
          defaultSellerId: defaultDiegoSellerId,
          defaultChannel: "mostrador_minorista",
          isCentralSheet: false,
          isAquafortSheet: false,
          enabled: importDiego
        },
        {
          name: "Ludmila Krenz",
          url: "https://docs.google.com/spreadsheets/d/1tp10RNH7z5VpWL9eVmofpOVrB2HzEpfbSEc1ngKO9_8/gviz/tq?tqx=out:csv&gid=1414092286",
          defaultSellerId: defaultLudmilaSellerId,
          defaultChannel: "mostrador_minorista",
          isCentralSheet: false,
          isAquafortSheet: false,
          enabled: importLudmila
        },
        {
          name: "Facundo Paz",
          url: "https://docs.google.com/spreadsheets/d/1c0iswWt2GAv8NhXfNgIlaOul9wanpZHaeMFeN2Pr0ns/gviz/tq?tqx=out:csv",
          defaultSellerId: defaultFacundoSellerId,
          defaultChannel: "mostrador_minorista",
          isCentralSheet: false,
          isAquafortSheet: false,
          enabled: importFacundo
        },
        {
          name: "Central/Ruteo",
          url: "https://docs.google.com/spreadsheets/d/1nz545_xNUgdI2LMAGIDCjh6Qs8-vUDHdynzj7jU2wm0/gviz/tq?tqx=out:csv&gid=786380854",
          defaultSellerId: defaultDiegoSellerId,
          defaultChannel: "mostrador_minorista",
          isCentralSheet: true,
          isAquafortSheet: false,
          enabled: importCentral
        },
        {
          name: "Pedidos Mayoristas (AQU/POW/AQ-)",
          url: "https://docs.google.com/spreadsheets/d/1nz545_xNUgdI2LMAGIDCjh6Qs8-vUDHdynzj7jU2wm0/gviz/tq?tqx=out:csv&gid=786380854",
          defaultSellerId: defaultDiegoSellerId,
          defaultChannel: "mayorista",
          isCentralSheet: true,
          isAquafortSheet: true,
          enabled: importAquafort
        }
      ].filter(s => s.enabled);

      if (selectedSheets.length === 0) {
        alert("Por favor seleccioná al menos una planilla para sincronizar.");
        setIsStartingJob(false);
        return;
      }

      const res = await fetch("/api/admin/import-job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sheets: selectedSheets,
          skipENC,
          skipCAMB,
          syncPaymentMethods,
          userEmail: currentUserEmail
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Error al iniciar trabajo en el servidor");
      }

      // Immediate refresh to attach to running job
      await fetchJobStatus();

    } catch (err: any) {
      alert(`No se pudo iniciar: ${err.message}`);
    } finally {
      setIsStartingJob(false);
    }
  };

  // Cancel Running Job
  const handleCancelJob = async () => {
    if (!currentJob?.id) return;
    try {
      setIsCancelling(true);
      await fetch("/api/admin/import-job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel", jobId: currentJob.id })
      });
      await fetchJobStatus();
    } catch (e: any) {
      alert(`Error al cancelar: ${e.message}`);
    } finally {
      setIsCancelling(false);
    }
  };

  const isJobRunning = currentJob?.status === "running";
  const stats = currentJob?.stats || { imported: 0, updated: 0, items: 0, sheetsCompleted: 0, totalSheets: 0 };
  const progressPercent = currentJob?.progress_percent || (currentJob?.status === "completed" ? 100 : 0);

  const formatDateTime = (dateStr?: string) => {
    if (!dateStr) return "-";
    const d = new Date(dateStr);
    return d.toLocaleString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-16">
      {/* Header */}
      <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-brand-50 text-brand-600 rounded-2xl">
              <Server className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-black text-slate-900 tracking-tight">
                  Sincronización en Segundo Plano
                </h1>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  100% Servidor Autónomo
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium">
                Sincronizá planillas en el servidor. Podés cerrar el navegador o apagar el celular en cualquier momento.
              </p>
            </div>
          </div>
        </div>

        {/* Refresh Status Button */}
        <button
          onClick={fetchJobStatus}
          className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 self-start md:self-auto cursor-pointer shadow-sm"
        >
          <RefreshCw className={cn("w-4 h-4", isJobRunning && "animate-spin text-brand-600")} />
          <span>Actualizar Estado</span>
        </button>
      </div>

      {/* Autonomous Notice Alert Banner */}
      <div className="p-4 bg-gradient-to-r from-brand-50 via-indigo-50 to-blue-50 border border-brand-200/80 rounded-3xl flex items-start gap-3.5 text-xs text-slate-800 shadow-sm">
        <Smartphone className="w-5 h-5 text-brand-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <span className="font-black text-slate-900 block">
            📱 Modo Autónomo sin dependencia de conexión móvil
          </span>
          <p className="text-slate-600 leading-relaxed">
            Al tocar el botón, la orden se envía al servidor en 100ms. <strong>Podés cerrar la app o bloquear tu celular inmediatamente</strong>. El servidor descarga las planillas, deduplica pedidos y guarda el informe de auditoría automáticamente.
          </p>
        </div>
      </div>

      {/* Sheets & Configuration Selection Card */}
      <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-6">
        <div className="flex items-center justify-between border-b pb-4">
          <div className="space-y-0.5">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Layers className="w-4 h-4 text-brand-600" />
              Selección de Planillas a Sincronizar
            </h3>
            <p className="text-xs text-slate-500 font-semibold">
              Elegí las planillas de Google Sheets que el servidor descargará.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Central Sheets */}
          <div className="space-y-3 p-4 bg-slate-50/70 rounded-2xl border border-slate-100">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
              Planilla Central & Logística
            </span>

            <label className={cn("flex items-center justify-between p-3.5 rounded-xl border bg-white cursor-pointer transition-all shadow-sm", importCentral ? "border-brand-300 ring-2 ring-brand-500/10" : "border-slate-200 opacity-60")}>
              <div className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={importCentral}
                  onChange={(e) => setImportCentral(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500/10 cursor-pointer accent-brand-600"
                />
                <div>
                  <span className="text-xs font-bold text-slate-900 block">Planilla Central / Ruteo</span>
                  <span className="text-[10px] text-slate-500 font-semibold">Pedidos minoristas y entregas</span>
                </div>
              </div>
            </label>

            <label className={cn("flex items-center justify-between p-3.5 rounded-xl border bg-white cursor-pointer transition-all shadow-sm", importAquafort ? "border-brand-300 ring-2 ring-brand-500/10" : "border-slate-200 opacity-60")}>
              <div className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={importAquafort}
                  onChange={(e) => setImportAquafort(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500/10 cursor-pointer accent-brand-600"
                />
                <div>
                  <span className="text-xs font-bold text-slate-900 block">Pedidos Mayoristas</span>
                  <span className="text-[10px] text-slate-500 font-semibold">Prefijos AQU / POW / AQ-</span>
                </div>
              </div>
            </label>
          </div>

          {/* Sellers Sheets */}
          <div className="space-y-3 p-4 bg-slate-50/70 rounded-2xl border border-slate-100">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
              Planillas de Vendedores Individuales
            </span>

            <div className="grid grid-cols-2 gap-2">
              <label className={cn("flex items-center gap-2 p-3 rounded-xl border bg-white cursor-pointer transition-all text-xs font-bold", importJazmin ? "border-brand-300 text-slate-900 shadow-sm" : "border-slate-200 text-slate-500 opacity-60")}>
                <input
                  type="checkbox"
                  checked={importJazmin}
                  onChange={(e) => setImportJazmin(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 accent-brand-600"
                />
                <span>Jazmín Sánchez</span>
              </label>

              <label className={cn("flex items-center gap-2 p-3 rounded-xl border bg-white cursor-pointer transition-all text-xs font-bold", importDiego ? "border-brand-300 text-slate-900 shadow-sm" : "border-slate-200 text-slate-500 opacity-60")}>
                <input
                  type="checkbox"
                  checked={importDiego}
                  onChange={(e) => setImportDiego(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 accent-brand-600"
                />
                <span>Diego Bóveda</span>
              </label>

              <label className={cn("flex items-center gap-2 p-3 rounded-xl border bg-white cursor-pointer transition-all text-xs font-bold", importLudmila ? "border-brand-300 text-slate-900 shadow-sm" : "border-slate-200 text-slate-500 opacity-60")}>
                <input
                  type="checkbox"
                  checked={importLudmila}
                  onChange={(e) => setImportLudmila(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 accent-brand-600"
                />
                <span>Ludmila Krenz</span>
              </label>

              <label className={cn("flex items-center gap-2 p-3 rounded-xl border bg-white cursor-pointer transition-all text-xs font-bold", importFacundo ? "border-brand-300 text-slate-900 shadow-sm" : "border-slate-200 text-slate-500 opacity-60")}>
                <input
                  type="checkbox"
                  checked={importFacundo}
                  onChange={(e) => setImportFacundo(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 accent-brand-600"
                />
                <span>Facundo Paz</span>
              </label>
            </div>
          </div>
        </div>

        {/* Configurations */}
        <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl flex flex-wrap items-center justify-between gap-4 text-xs font-bold text-slate-600">
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={skipENC}
                onChange={(e) => setSkipENC(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 accent-brand-600"
              />
              <span>Omitir ENC</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={skipCAMB}
                onChange={(e) => setSkipCAMB(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 accent-brand-600"
              />
              <span>Omitir CAMB</span>
            </label>
          </div>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={syncPaymentMethods}
              onChange={(e) => setSyncPaymentMethods(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 accent-brand-600"
            />
            <span>Sincronizar Medios de Pago y Recargos</span>
          </label>
        </div>

        {/* Action Button & Controls */}
        <div className="space-y-4 pt-2">
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              onClick={handleStartBackgroundJob}
              disabled={isJobRunning || isStartingJob}
              className="flex-1 py-6 text-base font-black rounded-2xl shadow-xl shadow-brand-600/10 bg-brand-600 hover:bg-brand-700 text-white flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isStartingJob ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Enviando orden al servidor...
                </>
              ) : isJobRunning ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Sincronización en curso en el servidor...
                </>
              ) : (
                <>
                  <Server className="w-5 h-5" />
                  Iniciar Sincronización en Segundo Plano (Servidor)
                </>
              )}
            </Button>

            {isJobRunning && (
              <button
                onClick={handleCancelJob}
                disabled={isCancelling}
                className="px-6 py-4 bg-red-600 hover:bg-red-700 text-white rounded-2xl font-black uppercase tracking-widest text-xs transition-all flex items-center justify-center gap-2 shadow-xl shadow-red-600/20 shrink-0 cursor-pointer disabled:opacity-50"
              >
                <X className="w-4 h-4" />
                {isCancelling ? "Cancelando..." : "Detener Servidor"}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Live Server Progress Card (Visible when running or latest finished) */}
      {currentJob && (
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-5 animate-in fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                {isJobRunning ? (
                  <Loader2 className="w-4 h-4 text-brand-600 animate-spin" />
                ) : currentJob.status === "completed" ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                ) : currentJob.status === "cancelled" ? (
                  <AlertCircle className="w-4 h-4 text-amber-500" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-500" />
                )}
                <span className="text-xs font-black text-slate-900 uppercase tracking-wider">
                  {isJobRunning
                    ? (currentJob.current_step || "Procesando en Servidor...")
                    : currentJob.status === "completed"
                    ? "Última Sincronización Completada con Éxito"
                    : currentJob.status === "cancelled"
                    ? "Última Sincronización Cancelada"
                    : "Última Sincronización con Error"}
                </span>
              </div>
              <span className="text-[11px] font-bold text-slate-400">
                Iniciado: {formatDateTime(currentJob.started_at)} {currentJob.created_by && `(por ${currentJob.created_by})`}
              </span>
            </div>

            {/* Status / Duration Badge */}
            <div className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-2xl text-xs font-mono font-black shadow-sm self-start sm:self-auto">
              <Clock className="w-3.5 h-3.5 text-brand-400" />
              <span>
                {isJobRunning
                  ? "En ejecución..."
                  : `Duración: ${currentJob.duration_seconds || 0}s`}
              </span>
            </div>
          </div>

          {/* Progress Bar (When running or recently finished) */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-[11px] font-black text-slate-500">
              <span>{isJobRunning ? "Progreso en Servidor" : "Resultado"}</span>
              <span className="text-brand-600 font-mono">{progressPercent}%</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden p-0.5 border border-slate-200/50">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-500 shadow-sm",
                  currentJob.status === "failed"
                    ? "bg-red-500"
                    : "bg-gradient-to-r from-brand-600 to-indigo-600"
                )}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* Metrics Stats Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 space-y-1">
              <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">📥 Nuevos Creados</span>
              <div className="text-xl font-black text-emerald-600 font-mono">{stats.imported || 0}</div>
            </div>
            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 space-y-1">
              <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">🔄 Actualizados</span>
              <div className="text-xl font-black text-indigo-600 font-mono">{stats.updated || 0}</div>
            </div>
            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 space-y-1">
              <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">📄 Planillas</span>
              <div className="text-xl font-black text-slate-900 font-mono">
                {stats.sheetsCompleted || 0}/{stats.totalSheets || 0}
              </div>
            </div>
            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 space-y-1">
              <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">⏱️ Tiempo Total</span>
              <div className="text-xl font-black text-slate-700 font-mono">{currentJob.duration_seconds || 0}s</div>
            </div>
          </div>

          {/* Error Message if Failed */}
          {currentJob.error_message && (
            <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-2xl text-xs font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
              <span>{currentJob.error_message}</span>
            </div>
          )}

          {/* Logs Terminal */}
          {currentJob.logs && currentJob.logs.length > 0 && (
            <div className="space-y-2 pt-2">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                Registro del Servidor ({currentJob.logs.length} eventos):
              </span>
              <div className="bg-slate-950 text-emerald-400 font-mono text-[11px] p-4 rounded-2xl max-h-56 overflow-y-auto space-y-1.5 shadow-inner leading-relaxed border border-slate-800">
                {currentJob.logs.map((log, lIdx) => (
                  <div key={lIdx}>{log}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* History of Past Sync Jobs */}
      {recentJobs.length > 0 && (
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-4">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="w-full flex items-center justify-between text-left cursor-pointer group"
          >
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-slate-400 group-hover:text-brand-600 transition-colors" />
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 group-hover:text-slate-900 transition-colors">
                Historial de Sincronizaciones Anteriores ({recentJobs.length})
              </h4>
            </div>
            <div className="flex items-center gap-1 text-xs font-bold text-slate-400 group-hover:text-slate-600">
              <span>{showHistory ? "Ocultar" : "Ver historial"}</span>
              {showHistory ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>
          </button>

          {showHistory && (
            <div className="overflow-x-auto border border-slate-100 rounded-2xl animate-in fade-in">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 text-[10px] font-black uppercase tracking-wider border-b border-slate-100">
                    <th className="py-3 px-4">Fecha y Hora</th>
                    <th className="py-3 px-3">Estado</th>
                    <th className="py-3 px-3">Duración</th>
                    <th className="py-3 px-3">Usuario</th>
                    <th className="py-3 px-3 text-right">Nuevos</th>
                    <th className="py-3 px-3 text-right">Actualizados</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recentJobs.map((job) => (
                    <tr key={job.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3 px-4 font-medium text-slate-900">
                        {formatDateTime(job.started_at)}
                      </td>
                      <td className="py-3 px-3">
                        <span className={cn(
                          "px-2 py-0.5 rounded-full text-[10px] font-black",
                          job.status === "completed" ? "bg-emerald-50 text-emerald-700" :
                          job.status === "running" ? "bg-brand-50 text-brand-700" :
                          job.status === "cancelled" ? "bg-amber-50 text-amber-700" :
                          "bg-red-50 text-red-700"
                        )}>
                          {job.status === "completed" ? "Completado" :
                           job.status === "running" ? "En curso" :
                           job.status === "cancelled" ? "Cancelado" : "Error"}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-500">
                        {job.duration_seconds ? `${job.duration_seconds}s` : "-"}
                      </td>
                      <td className="py-3 px-3 text-slate-500">
                        {job.created_by || "admin"}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-emerald-600">
                        {job.stats?.imported || 0}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-indigo-600">
                        {job.stats?.updated || 0}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

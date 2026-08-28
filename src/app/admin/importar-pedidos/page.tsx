"use client";

import React, { useState, useRef, useEffect } from "react";
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
  ArrowRight
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";

export default function ImportarPedidosPage() {
  // Import Orders Selection State
  const [importingOrders, setImportingOrders] = useState(false);
  const [skipENC, setSkipENC] = useState(true);
  const [skipCAMB, setSkipCAMB] = useState(false);
  const [importJazmin, setImportJazmin] = useState(false);
  const [importDiego, setImportDiego] = useState(false);
  const [importLudmila, setImportLudmila] = useState(false);
  const [importFacundo, setImportFacundo] = useState(false);
  const [importCentral, setImportCentral] = useState(true);
  const [importAquafort, setImportAquafort] = useState(true);
  const [syncPaymentMethods, setSyncPaymentMethods] = useState(false);
  const [useClaimsSheet, setUseClaimsSheet] = useState(true);
  const [claimsSheetUrl, setClaimsSheetUrl] = useState("https://docs.google.com/spreadsheets/d/1PzbotWVO-iLqV0rPvH2ZlXKkMGYPTIkmBd1owU45OCo/gviz/tq?tqx=out:csv&gid=1414092286");
  const [showRules, setShowRules] = useState(false);
  
  // Real-Time Progress & Time Tracking
  const [progressPercent, setProgressPercent] = useState(0);
  const [currentStepText, setCurrentStepText] = useState("");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [stats, setStats] = useState({
    imported: 0,
    updated: 0,
    items: 0,
    sheetsCompleted: 0,
    totalSheets: 0
  });

  const [importOrdersLogs, setImportOrdersLogs] = useState<string[]>([]);
  const [importOrdersSummary, setImportOrdersSummary] = useState<string | null>(null);
  const cancelImportRef = useRef(false);
  const timerRef = useRef<any>(null);

  // Clean timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const sanitizeErrorMessage = (err: any): string => {
    if (!err) return "Error desconocido";
    const message = typeof err === "string" ? err : err?.message || String(err);
    if (message.includes("<!DOCTYPE") || message.includes("<html") || message.includes("Cloudflare")) {
      return "Error de conexión con la base de datos Supabase (Cloudflare / Tiempo de espera agotado). Por favor reintenta en unos instantes.";
    }
    return message;
  };

  const normalizeText = (text: any): string => {
    if (!text) return "";
    return text
      .toString()
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  };

  const parseSpanishNumber = (val: any): number => {
    if (!val) return 0;
    let clean = val.toString().trim().replace(/[^0-9.,-]/g, '');
    if (!clean) return 0;
    
    const hasComma = clean.includes(',');
    const hasDot = clean.includes('.');
    
    if (hasComma && hasDot) {
      clean = clean.replace(/\./g, '').replace(/,/g, '.');
    } else if (hasComma) {
      clean = clean.replace(/,/g, '.');
    } else if (hasDot) {
      clean = clean.replace(/\./g, '');
    }
    
    const parsed = parseFloat(clean);
    return isNaN(parsed) ? 0 : parsed;
  };

  const parseCSV = (csvText: string) => {
    const result: string[][] = [];
    let currentWord = '';
    let inQuotes = false;
    let currentRow: string[] = [];
    
    const text = csvText.replace(/\r\n/g, '\n');
    const firstLine = text.split('\n')[0] || '';
    const delimiter = firstLine.includes(';') ? ';' : ',';
    
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i + 1];

      if (inQuotes) {
        if (char === '"' && nextChar === '"') {
          currentWord += '"';
          i++;
        } else if (char === '"') {
          inQuotes = false;
        } else {
          currentWord += char;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === delimiter) {
          currentRow.push(currentWord.trim());
          currentWord = '';
        } else if (char === '\n') {
          currentRow.push(currentWord.trim());
          if (currentRow.length > 1 || currentRow[0] !== '') {
            result.push(currentRow);
          }
          currentRow = [];
          currentWord = '';
        } else {
          currentWord += char;
        }
      }
    }
    
    currentRow.push(currentWord.trim());
    if (currentRow.length > 1 || currentRow[0] !== '') {
      result.push(currentRow);
    }
    
    return result;
  };

  const mergeContiguousSheetRows = (rows: string[][]): string[][] => {
    if (rows.length <= 1) return rows;
    const merged: string[][] = [rows[0]];
    
    for (let i = 1; i < rows.length; i++) {
      const currentRow = [...rows[i]];
      const prevRow = merged[merged.length - 1];
      
      const code1 = (prevRow[1] || "").trim().toUpperCase();
      const code2 = (currentRow[1] || "").trim().toUpperCase();
      
      const match1 = code1.match(/^([A-Z]+)(\d+)$/);
      const match2 = code2.match(/^([A-Z]+)(\d+)$/);
      
      let isConsecutive = false;
      if (match1 && match2 && match1[1] === match2[1]) {
        const num1 = parseInt(match1[2], 10);
        const num2 = parseInt(match2[2], 10);
        if (Math.abs(num1 - num2) === 1) {
          isConsecutive = true;
        }
      }
      
      const client1 = normalizeText(prevRow[5] || "");
      const client2 = normalizeText(currentRow[5] || "");
      const sameClient = client1 === client2 && client1 !== "";
      
      const date1 = (prevRow[3] || "").trim();
      const date2 = (currentRow[3] || "").trim();
      const sameDate = date1 === date2 && date1 !== "";
      
      const addr1 = normalizeText(prevRow[18] || "");
      const addr2 = normalizeText(currentRow[18] || "");
      const sameAddr = addr1 === addr2 && addr1 !== "";
      
      if (isConsecutive && sameClient && sameDate && sameAddr) {
        prevRow[1] = `${prevRow[1].trim()} / ${currentRow[1].trim()}`;
        
        const subtotal1 = parseSpanishNumber(prevRow[28]);
        const subtotal2 = parseSpanishNumber(currentRow[28]);
        prevRow[28] = (subtotal1 + subtotal2).toString();
        
        const freight1 = parseSpanishNumber(prevRow[27]);
        const freight2 = parseSpanishNumber(currentRow[27]);
        prevRow[27] = (freight1 + freight2).toString();

        const surcharge1 = parseSpanishNumber(prevRow[25]);
        const surcharge2 = parseSpanishNumber(currentRow[25]);
        prevRow[25] = (surcharge1 + surcharge2).toString();

        const abonado1 = parseSpanishNumber(prevRow[24]);
        const abonado2 = parseSpanishNumber(currentRow[24]);
        prevRow[24] = (abonado1 + abonado2).toString();

        const pending1 = parseSpanishNumber(prevRow[29]);
        const pending2 = parseSpanishNumber(currentRow[29]);
        prevRow[29] = (pending1 + pending2).toString();

        // Concatenate products
        let emptyIdx = 30;
        while ((prevRow[emptyIdx] || "").trim() !== "" && (prevRow[emptyIdx] || "").trim() !== "0") {
          emptyIdx += 4;
        }

        for (let pIdx = 30; pIdx < currentRow.length; pIdx += 4) {
          const prodName = (currentRow[pIdx] || "").trim();
          const prodQty = (currentRow[pIdx+1] || "").trim();
          const prodPrice = (currentRow[pIdx+2] || "").trim();
          const prodSubt = (currentRow[pIdx+3] || "").trim();

          if (prodName && prodName !== "0" && prodName.toLowerCase() !== "descuento") {
            prevRow[emptyIdx] = prodName;
            prevRow[emptyIdx+1] = prodQty;
            prevRow[emptyIdx+2] = prodPrice;
            prevRow[emptyIdx+3] = prodSubt;
            emptyIdx += 4;
          }
        }
      } else {
        merged.push(currentRow);
      }
    }
    return merged;
  };

  // Main Import Process with Live Progress
  const handleImportOrders = async () => {
    setImportingOrders(true);
    setImportOrdersLogs([]);
    setImportOrdersSummary(null);
    setProgressPercent(5);
    setCurrentStepText("Iniciando conexión...");
    setElapsedSeconds(0);
    cancelImportRef.current = false;
    
    setStats({
      imported: 0,
      updated: 0,
      items: 0,
      sheetsCompleted: 0,
      totalSheets: 0
    });

    const startTime = Date.now();
    timerRef.current = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    const addLog = (msg: string) => {
      setImportOrdersLogs(prev => [...prev, `[${new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}] ${msg}`]);
    };

    try {
      addLog("🚀 Iniciando importación y sincronización de planillas...");

      // 1. Sincronizar Medios de Pago
      if (syncPaymentMethods) {
        setCurrentStepText("Sincronizando medios de pago...");
        setProgressPercent(10);
        try {
          const pmRes = await fetch("https://docs.google.com/spreadsheets/d/1nz545_xNUgdI2LMAGIDCjh6Qs8-vUDHdynzj7jU2wm0/gviz/tq?tqx=out:csv&gid=1294713859", { cache: 'no-store' });
          if (pmRes.ok) {
            const pmCsv = await pmRes.text();
            const pmRows = parseCSV(pmCsv);
            const { data: currentPms } = await supabase.from('payment_methods').select('*');
            const existingPms = currentPms || [];
            
            for (const row of pmRows) {
              if (row.length < 2) continue;
              const name = row[0].trim();
              const surchargeStr = row[1].trim();
              if (!name) continue;
              const floatVal = parseFloat(surchargeStr.replace(',', '.'));
              if (isNaN(floatVal)) continue;
              const surchargePercentage = Math.round(floatVal * 100);
              let installments = name.toLowerCase().includes("cuota simple") ? 6 : (name.match(/(\d+)\s*cuota/i) ? parseInt(name.match(/(\d+)\s*cuota/i)![1], 10) : 1);
              
              const existing = existingPms.find(pm => pm.name.toLowerCase() === name.toLowerCase());
              if (existing) {
                if (existing.surcharge_percentage !== surchargePercentage || existing.installments !== installments) {
                  await supabase.from('payment_methods').update({ surcharge_percentage: surchargePercentage, installments }).eq('id', existing.id);
                }
              } else {
                await supabase.from('payment_methods').insert({ name, surcharge_percentage: surchargePercentage, installments, is_active: true, is_default: false });
              }
            }
            addLog("💳 Medios de pago y recargos sincronizados.");
          }
        } catch (errPm: any) {
          addLog(`⚠️ Medios de pago: ${errPm.message}`);
        }
      }

      // 2. Cargar Datos Maestros y Pedidos Existentes
      setCurrentStepText("Cargando catálogo y pedidos existentes...");
      setProgressPercent(18);
      
      let masterPayload: any = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const res = await fetch("/api/admin/import-master-data");
          if (res.ok) {
            masterPayload = await res.json();
            break;
          }
        } catch (e) {
          if (attempt < 3) await new Promise((r) => setTimeout(r, 1500));
        }
      }

      if (!masterPayload) {
        throw new Error("No se pudieron cargar los datos maestros de la base de datos.");
      }

      const serverOrders = masterPayload.orders || [];
      addLog(`📥 Datos maestros cargados: ${masterPayload.products?.length || 0} productos y ${serverOrders.length} pedidos existentes en DB.`);

      const defaultJazminSellerId = "13430e05-b61a-4a3f-9fc3-152d377c4b0c";
      const defaultDiegoSellerId = "381df0d1-183f-4ccb-aaf2-8147c76159a9";
      const defaultLudmilaSellerId = "8207801b-b6cb-48cc-af0f-d2f9f2c98032";
      const defaultFacundoSellerId = "54b9ce55-7354-4b39-9886-314aa79f6aa6";

      const sheets = [
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

      if (sheets.length === 0) {
        addLog("⚠️ No se seleccionó ninguna planilla. Operación cancelada.");
        setImportOrdersSummary("Por favor seleccioná al menos una planilla para importar.");
        setImportingOrders(false);
        if (timerRef.current) clearInterval(timerRef.current);
        return;
      }

      setStats(prev => ({ ...prev, totalSheets: sheets.length }));

      let totalImported = 0;
      let totalUpdated = 0;
      let totalItemsImported = 0;
      let sheetsDone = 0;

      for (let sIdx = 0; sIdx < sheets.length; sIdx++) {
        if (cancelImportRef.current) break;

        const sheet = sheets[sIdx];
        const stepBase = 20 + Math.round((sIdx / sheets.length) * 60);
        setProgressPercent(stepBase);
        setCurrentStepText(`Planilla ${sIdx + 1}/${sheets.length}: ${sheet.name}...`);

        addLog(`📄 Descargando planilla de ${sheet.name}...`);
        const response = await fetch(sheet.url, { cache: 'no-store' });
        if (!response.ok) {
          throw new Error(`Error al descargar ${sheet.name} (HTTP ${response.status})`);
        }
        const csvText = await response.text();
        const rawRows = parseCSV(csvText);
        const rows = mergeContiguousSheetRows(rawRows);

        const targetRows = rows.filter((row, idx) => {
          if (idx === 0) return false;
          const orderCode = (row[1] || "").trim();
          if (!orderCode) return false;

          if (sheet.isCentralSheet) {
            const isWholesaleCode = orderCode.toUpperCase().startsWith("AQU") || orderCode.toUpperCase().startsWith("POW") || orderCode.toUpperCase().startsWith("AQ-");
            let matchesWholesale = sheet.isAquafortSheet ? isWholesaleCode : !isWholesaleCode;
            if (!matchesWholesale) return false;

            const status = (row[0] || "").trim().toLowerCase();
            const isCompleted = status === "entregado" || status === "cancelado" || status === "anulado" || status === "pasado";
            if (isCompleted) {
              const parts = orderCode.split(/[/,]/).map(c => c.trim().toUpperCase());
              const hasActiveDbOrder = parts.some(part => {
                const dbOrd = serverOrders.find((o: any) => (o.legacy_code || "").toUpperCase().includes(part));
                return dbOrd && ['Pendiente', 'Confirmado', 'Entregando'].includes(dbOrd.status);
              });
              if (!hasActiveDbOrder) return false;
            }
            return true;
          } else {
            const estado = (row[0] || "").trim().toLowerCase();
            if (estado === "no esta" || estado === "no está") return true;
            const parts = orderCode.split(/[\/,]/).map(c => c.trim().toUpperCase());
            const hasActiveDbOrder = parts.some(part => {
              const dbOrd = serverOrders.find((o: any) => (o.legacy_code || "").toUpperCase().includes(part));
              return dbOrd && ['Pendiente', 'Confirmado', 'Entregando'].includes(dbOrd.status);
            });
            return hasActiveDbOrder;
          }
        });

        if (targetRows.length > 0) {
          const startProc = Date.now();
          const importRes = await fetch("/api/admin/import-sheet", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sheetName: sheet.name,
              rows: targetRows,
              skipENC,
              skipCAMB,
              syncPaymentMethods,
              defaultSellerId: sheet.defaultSellerId,
              defaultChannel: sheet.defaultChannel,
              isCentralSheet: sheet.isCentralSheet
            })
          });

          if (!importRes.ok) {
            const errText = await importRes.text().catch(() => "");
            throw new Error(sanitizeErrorMessage(errText));
          }

          const importData = await importRes.json();
          totalImported += importData.totalImported || 0;
          totalUpdated += importData.totalUpdated || 0;
          totalItemsImported += importData.totalItemsImported || 0;

          const duration = ((Date.now() - startProc) / 1000).toFixed(1);
          addLog(`✅ ${sheet.name}: ${importData.totalImported || 0} nuevos creados, ${importData.totalUpdated || 0} actualizados (${duration}s).`);
        } else {
          addLog(`ℹ️ ${sheet.name}: Sin pedidos nuevos para procesar.`);
        }

        sheetsDone++;
        setStats({
          imported: totalImported,
          updated: totalUpdated,
          items: totalItemsImported,
          sheetsCompleted: sheetsDone,
          totalSheets: sheets.length
        });
      }

      // 3. Sincronización de Entregas de Logística
      if (!cancelImportRef.current) {
        setProgressPercent(88);
        setCurrentStepText("Sincronizando entregas con Logística...");
        addLog("🚚 Sincronizando remitos y entregados de Logística...");
        
        try {
          const logiRes = await fetch("/api/admin/audit-deliveries", { method: "POST" });
          if (logiRes.ok) {
            const logiData = await logiRes.json();
            addLog(`✅ Logística: ${logiData.message || 'Sincronización completada'}`);
          }
        } catch (syncErr: any) {
          addLog(`⚠️ Logística: ${syncErr.message}`);
        }
      }

      setProgressPercent(100);
      setCurrentStepText("¡Proceso completado!");
      
      const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
      setImportOrdersSummary(`Importación finalizada con éxito en ${totalTime}s. Se crearon ${totalImported} pedidos nuevos, ${totalUpdated} actualizados y ${totalItemsImported} artículos procesados.`);
      addLog(`🏁 ¡PROCESO COMPLETADO EN ${totalTime}s! (Nuevos: ${totalImported} | Actualizados: ${totalUpdated})`);

    } catch (err: any) {
      console.error("Error importando pedidos:", err);
      const cleanMsg = sanitizeErrorMessage(err);
      addLog(`❌ Error: ${cleanMsg}`);
      setImportOrdersSummary(`Error: ${cleanMsg}`);
    } finally {
      if (timerRef.current) clearInterval(timerRef.current);
      setImportingOrders(false);
    }
  };

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-brand-50 text-brand-600 rounded-2xl">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-black text-slate-900 tracking-tight">
                  Importación de Pedidos
                </h1>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  Deduplicación Automática Activa
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium">
                Sincronizá planillas de vendedores y central sin duplicar órdenes ni sobrescribir entregados.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Progress & Live Time Card (Visible when importing or done) */}
      {(importingOrders || stats.sheetsCompleted > 0) && (
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-5 animate-in fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                {importingOrders ? (
                  <Loader2 className="w-4 h-4 text-brand-600 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                )}
                <span className="text-xs font-black text-slate-900 uppercase tracking-wider">
                  {currentStepText || (importingOrders ? "Procesando..." : "Completado")}
                </span>
              </div>
              <span className="text-[11px] font-bold text-slate-400">
                Planillas completadas: {stats.sheetsCompleted} de {stats.totalSheets}
              </span>
            </div>

            {/* Timer Badge */}
            <div className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-2xl text-xs font-mono font-black shadow-sm self-start sm:self-auto">
              <Clock className="w-3.5 h-3.5 text-brand-400" />
              <span>Tiempo: {formatTimer(elapsedSeconds)}</span>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-[11px] font-black text-slate-500">
              <span>Progreso Global</span>
              <span className="text-brand-600 font-mono">{progressPercent}%</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden p-0.5 border border-slate-200/50">
              <div
                className="bg-gradient-to-r from-brand-600 to-indigo-600 h-full rounded-full transition-all duration-300 shadow-sm"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* Live Metric Stats Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 space-y-1">
              <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">📥 Nuevos Creados</span>
              <div className="text-xl font-black text-emerald-600 font-mono">{stats.imported}</div>
            </div>
            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 space-y-1">
              <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">🔄 Actualizados</span>
              <div className="text-xl font-black text-indigo-600 font-mono">{stats.updated}</div>
            </div>
            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 space-y-1">
              <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">📦 Artículos</span>
              <div className="text-xl font-black text-slate-900 font-mono">{stats.items}</div>
            </div>
            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 space-y-1">
              <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">⏱️ Tiempo Total</span>
              <div className="text-xl font-black text-slate-700 font-mono">{elapsedSeconds}s</div>
            </div>
          </div>
        </div>
      )}

      {/* Sheets Selection Grid */}
      <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-6">
        <div className="flex items-center justify-between border-b pb-4">
          <div className="space-y-0.5">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Layers className="w-4 h-4 text-brand-600" />
              Planillas a Sincronizar
            </h3>
            <p className="text-xs text-slate-500 font-semibold">
              Elegí las planillas de Google Sheets que querés descargar y procesar.
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

        {/* Configuration Row */}
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
              onClick={handleImportOrders}
              disabled={importingOrders}
              className="flex-1 py-6 text-base font-black rounded-2xl shadow-xl shadow-brand-600/10 bg-brand-600 hover:bg-brand-700 text-white flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {importingOrders ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Procesando Planillas en Vivo...
                </>
              ) : (
                <>
                  <RefreshCw className="w-5 h-5" />
                  Iniciar Importación Segura
                </>
              )}
            </Button>

            {importingOrders && (
              <button
                onClick={() => {
                  cancelImportRef.current = true;
                  setImportOrdersLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ⏳ Solicitando detención...`]);
                }}
                className="px-6 py-4 bg-red-600 hover:bg-red-700 text-white rounded-2xl font-black uppercase tracking-widest text-xs transition-all flex items-center justify-center gap-2 shadow-xl shadow-red-600/20 shrink-0 cursor-pointer"
              >
                <X className="w-4 h-4" />
                Detener
              </button>
            )}
          </div>

          {importOrdersSummary && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs font-bold flex items-center gap-2.5 shadow-sm animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              {importOrdersSummary}
            </div>
          )}

          {/* Clean Terminal Console Logs */}
          {importOrdersLogs.length > 0 && (
            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                  Consola de Registro Simplificada ({importOrdersLogs.length} eventos):
                </span>
                <button
                  onClick={() => setImportOrdersLogs([])}
                  className="text-[10px] font-bold text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  Limpiar consola
                </button>
              </div>
              <div className="bg-slate-950 text-emerald-400 font-mono text-[11px] p-4 rounded-2xl max-h-56 overflow-y-auto space-y-1.5 shadow-inner leading-relaxed border border-slate-800">
                {importOrdersLogs.map((log, lIdx) => (
                  <div key={lIdx} className="font-mono">
                    {log}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

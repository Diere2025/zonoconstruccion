"use client";

import React, { useState, useRef } from "react";
import { Button } from "@/components/ui/Button";
import { Loader2, RefreshCw, X, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";

const withTimeout = <T,>(promise: Promise<T>, ms: number, errorMessage = "Timeout"): Promise<T> => {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(errorMessage)), ms);
    promise
      .then((res) => {
        clearTimeout(timer);
        resolve(res);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
};

const withTimeoutAndRetry = async <T,>(
  fn: () => Promise<T>,
  ms: number,
  retries = 2,
  errorMessage = "Timeout"
): Promise<T> => {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      let timer: any;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(errorMessage)), ms);
      });

      const result = await Promise.race([
        fn().then((res) => {
          clearTimeout(timer);
          return res;
        }),
        timeoutPromise
      ]);

      return result;
    } catch (err: any) {
      if (attempt < retries) {
        console.warn(`[Supabase] Attempt ${attempt + 1} failed or timed out: ${err.message || err}. Retrying in 1s...`);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } else {
        throw err;
      }
    }
  }
  throw new Error(errorMessage);
};

export default function ImportarPedidosPage() {
  // Import Orders State
  const [importingOrders, setImportingOrders] = useState(false);
  const [importOrdersLogs, setImportOrdersLogs] = useState<string[]>([]);
  const [importOrdersSummary, setImportOrdersSummary] = useState<string | null>(null);
  const [skipENC, setSkipENC] = useState(true);
  const [skipCAMB, setSkipCAMB] = useState(false);
  const [importJazmin, setImportJazmin] = useState(false);
  const [importDiego, setImportDiego] = useState(false);
  const [importLudmila, setImportLudmila] = useState(false);
  const [importCentral, setImportCentral] = useState(true);
  const [importAquafort, setImportAquafort] = useState(true);
  const [syncPaymentMethods, setSyncPaymentMethods] = useState(false);
  const [useClaimsSheet, setUseClaimsSheet] = useState(true);
  const [claimsSheetUrl, setClaimsSheetUrl] = useState("https://docs.google.com/spreadsheets/d/1PzbotWVO-iLqV0rPvH2ZlXKkMGYPTIkmBd1owU45OCo/gviz/tq?tqx=out:csv&gid=1414092286");
  const [showRules, setShowRules] = useState(false);
  const cancelImportRef = useRef(false);

  // Helper normalizers/parsers for import
  const normalizeText = (text: any): string => {
    if (!text) return "";
    return text
      .toString()
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  };

  const normalizeLocalityFuzzy = (text: any): string => {
    if (!text) return "";
    return text
      .toString()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/gi, "")
      .toLowerCase();
  };

  const cleanPhone = (phone: any): string => {
    if (!phone) return "";
    return phone.toString().replace(/\D/g, "");
  };

  const cleanProductName = (name: any): string => {
    if (!name) return "";
    let clean = name.toString().toLowerCase().trim();
    clean = clean.replace(/^\[interno\]\s*(-\s*)?/, "");
    clean = clean.replace(/\s*-\s*aquafort/g, "");
    clean = clean.replace(/\s*-\s*biofort/g, "");
    clean = clean.replace(/\s*-\s*rotoplas/g, "");
    clean = clean.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    clean = clean.replace(/[^a-z0-9]/g, "");
    return clean;
  };

  const parseDate = (dateStr: string): Date => {
    if (!dateStr) return new Date();
    const parts = dateStr.trim().split('/');
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const year = parseInt(parts[2], 10);
      return new Date(year, month, day);
    }
    const parsed = new Date(dateStr);
    return isNaN(parsed.getTime()) ? new Date() : parsed;
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

  // Import Orders from Google Sheets Logic
  const handleImportOrders = async () => {
    setImportingOrders(true);
    setImportOrdersLogs([]);
    setImportOrdersSummary(null);
    cancelImportRef.current = false;
    
    const addLog = (msg: string) => {
      setImportOrdersLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
    };

    try {
      addLog("Iniciando importación de pedidos...");
      
      if (syncPaymentMethods) {
        addLog("Sincronizando medios de pago y recargos desde la planilla...");
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
              
              let installments = 1;
              if (name.toLowerCase().includes("cuota simple")) {
                installments = 6;
              } else {
                const cuotaMatch = name.match(/(\d+)\s*cuota/i);
                if (cuotaMatch) {
                  installments = parseInt(cuotaMatch[1], 10);
                }
              }
              
              const existing = existingPms.find(pm => pm.name.toLowerCase() === name.toLowerCase());
              if (existing) {
                if (existing.surcharge_percentage !== surchargePercentage || existing.installments !== installments) {
                  await supabase
                    .from('payment_methods')
                    .update({ surcharge_percentage: surchargePercentage, installments })
                    .eq('id', existing.id);
                }
              } else {
                await supabase
                  .from('payment_methods')
                  .insert({ name, surcharge_percentage: surchargePercentage, installments, is_active: true, is_default: false });
              }
            }
            addLog("✅ Medios de pago y recargos sincronizados con éxito.");
          } else {
            addLog("⚠ No se pudo descargar la planilla de recargos (se usarán los valores existentes en DB).");
          }
        } catch (errPm: any) {
          addLog(`⚠ Error al sincronizar medios de pago: ${errPm.message}`);
        }
      } else {
        addLog("Sincronización de medios de pago y recargos omitida (se usarán los valores actuales de la base de datos).");
      }

      addLog("Cargando datos maestros de la base de datos...");
      
      let dbProducts: any[] | null = null;
      let dbSellers: any[] | null = null;
      let dbLocalities: any[] | null = null;
      let dbAdvSources: any[] | null = null;
      let dbOrderMediums: any[] | null = null;
      let dbPaymentMethods: any[] | null = null;
      let dbPhoneLines: any[] | null = null;
      let masterPayload: any = null;

      try {
        addLog("  -> Cargando productos, vendedores, localidades, orígenes, medios de pedido, métodos de pago y líneas telefónicas...");
        console.log("[ImportarPedidos] Iniciando carga de datos maestros vía API Next.js server-side");
        
        const start = Date.now();
        const res = await fetch("/api/admin/import-master-data");
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `HTTP error ${res.status}`);
        }
        
        masterPayload = await res.json();
        dbProducts = masterPayload.products;
        dbSellers = masterPayload.sellers;
        dbLocalities = masterPayload.localities;
        dbAdvSources = masterPayload.advertising_sources;
        dbOrderMediums = masterPayload.order_mediums;
        dbPaymentMethods = masterPayload.payment_methods;
        dbPhoneLines = masterPayload.phone_lines;

        addLog(`  ✅ Productos cargados: ${dbProducts?.length || 0}`);
        addLog(`  ✅ Vendedores cargados: ${dbSellers?.length || 0}`);
        addLog(`  ✅ Localidades cargadas: ${dbLocalities?.length || 0}`);
        addLog(`  ✅ Orígenes cargados: ${dbAdvSources?.length || 0}`);
        addLog(`  ✅ Medios cargados: ${dbOrderMediums?.length || 0}`);
        addLog(`  ✅ Métodos de pago cargados: ${dbPaymentMethods?.length || 0}`);
        addLog(`  ✅ Líneas telefónicas cargadas: ${dbPhoneLines?.length || 0} (${Date.now() - start}ms)`);
      } catch (err: any) {
        console.error("[ImportarPedidos] Error crítico cargando datos maestros:", err);
        addLog(`❌ Error en carga de datos maestros: ${err.message || String(err)}`);
        throw err;
      }

      addLog("Obteniendo códigos y estados de pedidos existentes...");
      const existingOrdersMap = new Map<string, { id: string; status: string; delivery_detail?: string; whaticket_link?: string; order_medium_id?: string }>();
      
      const serverOrders = masterPayload?.orders || [];
      serverOrders.forEach((o: any) => {
        const rawCode = (o.legacy_code || "").trim();
        if (rawCode) {
          const parts = rawCode.split(/[\/,]/).map((c: string) => c.trim().toUpperCase());
          parts.forEach((code: string) => {
            if (code) {
              existingOrdersMap.set(code, { 
                id: o.id, 
                status: o.status || "", 
                delivery_detail: o.delivery_detail || "",
                whaticket_link: o.whaticket_link || "",
                order_medium_id: o.order_medium_id || ""
              });
            }
          });
        }
      });
      addLog(`Pedidos históricos existentes en DB: ${existingOrdersMap.size}`);

      const findExistingOrder = (orderCode: string) => {
        const code = orderCode.trim().toUpperCase();
        const incomingParts = code.split(/[\/,]/).map(p => p.trim()).filter(Boolean);
        
        for (const part of incomingParts) {
          if (existingOrdersMap.has(part)) {
            return existingOrdersMap.get(part);
          }
        }
        
        for (const [key, val] of existingOrdersMap.entries()) {
          const parts = key.split(/[\/,]/).map(p => p.trim().toUpperCase());
          for (const part of incomingParts) {
            if (parts.includes(part)) {
              return val;
            }
          }
        }
        return null;
      };

      // Download and parse claims sheet for linking returns/exchanges
      let claimsMap = new Map<string, string[]>();
      if (useClaimsSheet && !skipCAMB) {
        addLog("Descargando planilla general de reclamos para vinculación de cambios...");
        try {
          const claimsRes = await fetch(claimsSheetUrl, { cache: 'no-store' });
          if (claimsRes.ok) {
            const claimsCsv = await claimsRes.text();
            const claimsRows = parseCSV(claimsCsv);
            addLog(`  ✅ Planilla de reclamos descargada. ${claimsRows.length} filas leídas.`);
            
            for (let i = 1; i < claimsRows.length; i++) {
              const crow = claimsRows[i];
              const claimCode = (crow[0] || "").trim().toUpperCase();
              const orderCodeRef = (crow[3] || "").trim().toUpperCase();
              
              if (claimCode) {
                claimsMap.set(claimCode, crow);
              }
              if (orderCodeRef) {
                claimsMap.set(orderCodeRef, crow);
              }
            }
            addLog(`  ✅ Mapeados ${claimsMap.size} códigos de reclamo/pedido desde la planilla.`);
          } else {
            addLog("⚠ No se pudo descargar la planilla de reclamos (se usarán datos heurísticos locales).");
          }
        } catch (errClaims: any) {
          addLog(`⚠ Error al descargar/procesar planilla de reclamos: ${errClaims.message}`);
        }
      }

      const sellersMap = new Map();
      dbSellers?.forEach(r => sellersMap.set(normalizeText(r.full_name), { id: r.id, is_organic: r.is_organic, full_name: r.full_name }));

      const localitiesMap = new Map();
      dbLocalities?.forEach(r => localitiesMap.set(normalizeLocalityFuzzy(r.name), r.id));

      const advSourcesMap = new Map();
      dbAdvSources?.forEach(r => advSourcesMap.set(normalizeText(r.name), r.id));

      const orderMediumsMap = new Map();
      dbOrderMediums?.forEach(r => orderMediumsMap.set(normalizeText(r.name), r.id));

      const payMethodsMap = new Map();
      dbPaymentMethods?.forEach(r => payMethodsMap.set(normalizeText(r.name), r));

      const phoneLinesMap = new Map();
      dbPhoneLines?.forEach(r => phoneLinesMap.set(r.phone_number, r.id));

      const defaultJazminSellerId = "13430e05-b61a-4a3f-9fc3-152d377c4b0c";
      const defaultDiegoSellerId = "381df0d1-183f-4ccb-aaf2-8147c76159a9";
      const defaultLudmilaSellerId = "8207801b-b6cb-48cc-af0f-d2f9f2c98032";

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
          name: "Central/Ruteo",
          url: "https://docs.google.com/spreadsheets/d/1nz545_xNUgdI2LMAGIDCjh6Qs8-vUDHdynzj7jU2wm0/gviz/tq?tqx=out:csv&gid=786380854",
          defaultSellerId: defaultDiegoSellerId,
          defaultChannel: "mostrador_minorista",
          isCentralSheet: true,
          isAquafortSheet: false,
          enabled: importCentral
        },
        {
          name: "Pedidos Mayoristas (AQU/AQ-DB)",
          url: "https://docs.google.com/spreadsheets/d/1nz545_xNUgdI2LMAGIDCjh6Qs8-vUDHdynzj7jU2wm0/gviz/tq?tqx=out:csv&gid=786380854",
          defaultSellerId: defaultDiegoSellerId,
          defaultChannel: "mayorista",
          isCentralSheet: true,
          isAquafortSheet: true,
          enabled: importAquafort
        }
      ].filter(s => s.enabled);

      if (sheets.length === 0) {
        addLog("⚠ No se seleccionó ninguna planilla para importar. Proceso cancelado.");
        setImportOrdersSummary("Por favor, selecciona al menos una planilla para realizar la importación.");
        setImportingOrders(false);
        return;
      }

      let totalNoEstaRows = 0;
      let totalImported = 0;
      let totalItemsImported = 0;
      let totalUpdated = 0;

      for (const sheet of sheets) {
        addLog(`Descargando planilla de ${sheet.name}...`);
        const response = await fetch(sheet.url, { cache: 'no-store' });
        if (!response.ok) {
          throw new Error(`Error al descargar planilla de ${sheet.name} (Status ${response.status})`);
        }
        const csvText = await response.text();
        const rawRows = parseCSV(csvText);
        const rows = mergeContiguousSheetRows(rawRows);
        addLog(`Planilla de ${sheet.name}: ${rawRows.length} filas leídas (${rows.length} después de unificar contiguos).`);

        const targetRows = rows.filter((row, idx) => {
          if (idx === 0) return false;
          const orderCode = (row[1] || "").trim();
          if (!orderCode) return false;

          if (sheet.isCentralSheet) {
            const isWholesaleCode = orderCode.toUpperCase().startsWith("AQU") || orderCode.toUpperCase().startsWith("POW") || orderCode.toUpperCase().startsWith("AQ-DB");
            if (sheet.isAquafortSheet) {
              return isWholesaleCode;
            } else {
              return !isWholesaleCode;
            }
          } else {
            const estado = (row[0] || "").trim().toLowerCase();
            if (estado === "no esta" || estado === "no está") {
              return true;
            }
            // Include active existing orders to sync modifications
            const parts = orderCode.split(/[\/,]/).map(c => c.trim().toUpperCase());
            const hasActiveDbOrder = parts.some(part => {
              const dbOrd = existingOrdersMap.get(part);
              return dbOrd && ['Pendiente', 'Confirmado', 'Entregando'].includes(dbOrd.status);
            });
            return hasActiveDbOrder;
          }
        });

        addLog(`Filas candidatas a importar encontradas para ${sheet.name}: ${targetRows.length}`);
        if (!sheet.isCentralSheet) {
          totalNoEstaRows += targetRows.length;
        }

        if (targetRows.length > 0) {
          addLog(`Enviando ${targetRows.length} pedidos de ${sheet.name} al servidor para procesamiento...`);
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
            const errData = await importRes.json().catch(() => ({}));
            throw new Error(errData.error || `HTTP error ${importRes.status}`);
          }

          const importData = await importRes.json();
          if (importData.logs && importData.logs.length > 0) {
            importData.logs.forEach((srvLog: string) => {
              addLog(srvLog);
            });
          }

          totalImported += importData.totalImported || 0;
          totalUpdated += importData.totalUpdated || 0;
          totalItemsImported += importData.totalItemsImported || 0;

          addLog(`✅ Procesamiento de ${sheet.name} completado en ${((Date.now() - startProc)/1000).toFixed(1)}s.`);
        }
        if (cancelImportRef.current) {
          break;
        }
      }

      if (cancelImportRef.current) {
        setImportOrdersSummary(`Importación cancelada por el usuario. Se importaron ${totalImported} pedidos y se actualizaron ${totalUpdated}.`);
        addLog("🔴 PROCESO DETENIDO POR EL USUARIO.");
      } else {
        setImportOrdersSummary(`Importación finalizada con éxito. Se importaron ${totalImported} pedidos con un total de ${totalItemsImported} artículos y se actualizaron ${totalUpdated} pedidos.`);
        addLog(`¡IMPORTACIÓN DE PEDIDOS COMPLETADA!`);
        addLog(`Pedidos importados: ${totalImported}`);
        addLog(`Pedidos actualizados: ${totalUpdated}`);
        addLog(`Artículos de pedidos creados: ${totalItemsImported}`);
        
        // Auto-run logistics delivered sync (which also triggers stock recalculation)
        addLog("🚚 Sincronizando pedidos entregados con la planilla de Logística...");
        try {
          const logiRes = await fetch("/api/admin/audit-deliveries", { method: "POST" });
          if (logiRes.ok) {
            const logiData = await logiRes.json();
            addLog(`✅ Sincronización de logística completada. ${logiData.message}`);
          } else {
            addLog("⚠️ Advertencia: No se pudieron actualizar los entregados de logística. Ejecutando sincronización de stock de respaldo...");
            // Fallback to basic stock sync
            const syncRes = await fetch("/api/admin/sync-stock", { method: "POST" });
            if (syncRes.ok) {
              const syncData = await syncRes.json();
              addLog(`✅ Stock de respaldo sincronizado. Se actualizaron ${syncData.updatedCount} productos.`);
            }
          }
        } catch (syncErr: any) {
          addLog(`⚠️ Advertencia: Error de red durante la sincronización: ${syncErr.message}`);
        }
      }
    } catch (err: any) {
      console.error("Error importing orders:", err);
      addLog(`ERROR CRÍTICO: ${err.message}`);
      alert("Error al importar pedidos: " + err.message);
    } finally {
      setImportingOrders(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="bg-white p-6 rounded-[2rem] shadow-xl border border-slate-100 space-y-4">
        {/* Cabecera */}
        <div className="flex justify-between items-start border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-xl font-black text-slate-900 tracking-tight">Importador de Pedidos</h2>
            <p className="text-[10px] font-semibold text-slate-400">
              Sincroniza y procesa pedidos faltantes desde planillas operativas y de vendedores.
            </p>
          </div>
          
          <button 
            type="button" 
            onClick={() => setShowRules(!showRules)}
            className="text-[10px] font-bold text-slate-500 hover:text-slate-700 bg-slate-100 px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition-all"
          >
            {showRules ? "Ocultar Reglas ℹ️" : "Ver Reglas ℹ️"}
          </button>
        </div>

        {/* Collapsible Rules */}
        {showRules && (
          <div className="bg-blue-50/40 border border-blue-100/50 p-4 rounded-xl text-[11px] text-blue-800 space-y-1 font-semibold">
            <span className="block font-black text-[10px] uppercase tracking-wider mb-1 text-blue-900">Reglas del Proceso:</span>
            <ul className="list-disc pl-4 space-y-0.5">
              <li>En planillas de Jazmín/Diego, filtra por estado "No está" adicionalmente.</li>
              <li>Filtra y omite los prefijos de pedido (ENC, CAMB) de acuerdo con los selectores configurados arriba.</li>
              <li>Compara contra los registros existentes en la base de datos (columna `legacy_code`) para evitar duplicaciones.</li>
              <li>Busca y vincula clientes preexistentes por teléfono; si no los halla, crea el cliente e inserta sus direcciones de entrega correspondientes.</li>
              <li>Convierte los importes numéricos corrigiendo el error de divisiones o saltos por miles (notación decimal es-AR).</li>
              <li>Asocia los artículos al catálogo. Si el producto no existe, se guardará como huérfano para posterior regularización.</li>
            </ul>
          </div>
        )}

        {/* Grid of sheets to sync */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          
          {/* Left Column: Main Operations & Postventa */}
          <div className="space-y-3">
            <span className="block font-black text-slate-500 text-[9px] uppercase tracking-wider">Planillas Operativas</span>
            
            <div className="space-y-2.5">
              {/* Central */}
              <label className={cn("flex items-center justify-between p-3 rounded-xl border border-slate-100 hover:bg-slate-50/50 cursor-pointer transition-all", !importCentral && "opacity-50")}>
                <div className="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={importCentral}
                    onChange={(e) => setImportCentral(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500/10 cursor-pointer accent-brand-600"
                  />
                  <div>
                    <span className="text-xs font-bold text-slate-800">Planilla Central / Ruteo</span>
                    <span className="ml-2 bg-brand-50 text-brand-600 text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md">Principal</span>
                  </div>
                </div>
                <a
                  href="https://docs.google.com/spreadsheets/d/1nz545_xNUgdI2LMAGIDCjh6Qs8-vUDHdynzj7jU2wm0/edit?gid=786380854"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-slate-400 hover:text-slate-600 p-1 font-bold text-xs"
                  title="Abrir Planilla Original"
                  onClick={(e) => e.stopPropagation()}
                >
                  ↗
                </a>
              </label>

              {/* Mayoristas */}
              <label className={cn("flex items-center justify-between p-3 rounded-xl border border-slate-100 hover:bg-slate-50/50 cursor-pointer transition-all", !importAquafort && "opacity-50")}>
                <div className="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={importAquafort}
                    onChange={(e) => setImportAquafort(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500/10 cursor-pointer accent-emerald-600"
                  />
                  <div>
                    <span className="text-xs font-bold text-slate-800">Pedidos Mayoristas</span>
                    <span className="ml-2 bg-emerald-50 text-emerald-600 text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md">AQU/AQ-DB</span>
                  </div>
                </div>
                <a
                  href="https://docs.google.com/spreadsheets/d/1nz545_xNUgdI2LMAGIDCjh6Qs8-vUDHdynzj7jU2wm0/edit?gid=786380854"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-slate-400 hover:text-slate-600 p-1 font-bold text-xs"
                  title="Abrir Planilla Original"
                  onClick={(e) => e.stopPropagation()}
                >
                  ↗
                </a>
              </label>

              {/* Reclamos */}
              {!skipCAMB && (
                <div className={cn("p-3 rounded-xl border border-slate-100 hover:bg-slate-50/50 transition-all space-y-2", !useClaimsSheet && "opacity-50")}>
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={useClaimsSheet}
                        onChange={(e) => setUseClaimsSheet(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500/10 cursor-pointer accent-amber-600"
                      />
                      <div>
                        <span className="text-xs font-bold text-slate-800">Planilla de Reclamos</span>
                        <span className="ml-2 bg-amber-50 text-amber-600 text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md">Postventa</span>
                      </div>
                    </label>
                    <a
                      href="https://docs.google.com/spreadsheets/d/1PzbotWVO-iLqV0rPvH2ZlXKkMGYPTIkmBd1owU45OCo/edit?gid=1414092286"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-slate-400 hover:text-slate-600 p-1 font-bold text-xs"
                      title="Abrir Planilla Original"
                    >
                      ↗
                    </a>
                  </div>
                </div>
              )}
            </div>

          </div>

          {/* Right Column: Sellers (Jazmín, Diego, Ludmila) */}
          <div className="space-y-3">
            <span className="block font-black text-slate-500 text-[9px] uppercase tracking-wider">Planillas de Vendedores</span>
            
            <div className="space-y-2.5">
              {/* Jazmin */}
              <label className={cn("flex items-center justify-between p-3 rounded-xl border border-slate-100 hover:bg-slate-50/50 cursor-pointer transition-all", !importJazmin && "opacity-50")}>
                <div className="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={importJazmin}
                    onChange={(e) => setImportJazmin(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500/10 cursor-pointer accent-brand-600"
                  />
                  <span className="text-xs font-bold text-slate-800">Jazmín Sánchez</span>
                </div>
                <a
                  href="https://docs.google.com/spreadsheets/d/16DPcJEdrTMYvNSaUKQo9ODKClqe1VHLlKOX6O_sELRw/edit?gid=1414092286"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-slate-400 hover:text-slate-600 p-1 font-bold text-xs"
                  title="Abrir Planilla Original"
                  onClick={(e) => e.stopPropagation()}
                >
                  ↗
                </a>
              </label>

              {/* Diego */}
              <label className={cn("flex items-center justify-between p-3 rounded-xl border border-slate-100 hover:bg-slate-50/50 cursor-pointer transition-all", !importDiego && "opacity-50")}>
                <div className="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={importDiego}
                    onChange={(e) => setImportDiego(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500/10 cursor-pointer accent-brand-600"
                  />
                  <span className="text-xs font-bold text-slate-800">Diego Bóveda</span>
                </div>
                <a
                  href="https://docs.google.com/spreadsheets/d/1ccs1yPtwSSUf6dcA5XpxhpvPaWmHfJ0zsCfyJvEBvtg/edit?gid=1414092286"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-slate-400 hover:text-slate-600 p-1 font-bold text-xs"
                  title="Abrir Planilla Original"
                  onClick={(e) => e.stopPropagation()}
                >
                  ↗
                </a>
              </label>

              {/* Ludmila */}
              <label className={cn("flex items-center justify-between p-3 rounded-xl border border-slate-100 hover:bg-slate-50/50 cursor-pointer transition-all", !importLudmila && "opacity-50")}>
                <div className="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={importLudmila}
                    onChange={(e) => setImportLudmila(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500/10 cursor-pointer accent-brand-600"
                  />
                  <span className="text-xs font-bold text-slate-800">Ludmila Krenz</span>
                </div>
                <a
                  href="https://docs.google.com/spreadsheets/d/1tp10RNH7z5VpWL9eVmofpOVrB2HzEpfbSEc1ngKO9_8/edit?gid=1414092286"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-slate-400 hover:text-slate-600 p-1 font-bold text-xs"
                  title="Abrir Planilla Original"
                  onClick={(e) => e.stopPropagation()}
                >
                  ↗
                </a>
              </label>
            </div>

          </div>

        </div>

        {/* Configuration Row */}
        <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Filters */}
          <div className="space-y-2">
            <span className="block font-black text-slate-500 text-[8px] uppercase tracking-wider">Filtros de Prefijo</span>
            <div className="flex gap-4 text-xs font-bold text-slate-600">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={skipENC}
                  onChange={(e) => setSkipENC(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500/10 cursor-pointer accent-brand-600"
                />
                <span>Omitir ENC</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={skipCAMB}
                  onChange={(e) => setSkipCAMB(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500/10 cursor-pointer accent-brand-600"
                />
                <span>Omitir CAMB</span>
              </label>
            </div>
          </div>

          {/* Sync pay methods */}
          <div className="space-y-1 md:border-l md:border-slate-200 md:pl-4">
            <span className="block font-black text-slate-500 text-[8px] uppercase tracking-wider">Configuración Adicional</span>
            <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-bold text-slate-600">
              <input
                type="checkbox"
                checked={syncPaymentMethods}
                onChange={(e) => setSyncPaymentMethods(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500/10 cursor-pointer accent-brand-600"
              />
              <span>Sincronizar Medios de Pago y Recargos</span>
            </label>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              onClick={handleImportOrders}
              disabled={importingOrders}
              className="flex-1 py-6 text-base font-black rounded-2xl shadow-xl shadow-brand-600/10 bg-brand-600 hover:bg-brand-700 text-white flex items-center justify-center gap-2"
            >
              {importingOrders ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Procesando Planillas y Pedidos...
                </>
              ) : (
                <>
                  <RefreshCw className="w-5 h-5" />
                  Iniciar Importación de Pedidos Faltantes
                </>
              )}
            </Button>

            {importingOrders && (
              <button
                onClick={() => {
                  cancelImportRef.current = true;
                  setImportOrdersLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ⏳ Solicitando detención del proceso...`]);
                }}
                className="px-6 py-4 bg-red-600 hover:bg-red-700 text-white rounded-2xl font-black uppercase tracking-widest text-xs transition-all flex items-center justify-center gap-2 shadow-xl shadow-red-600/20 shrink-0"
              >
                <X className="w-4 h-4" />
                Detener
              </button>
            )}
          </div>

          {importOrdersSummary && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              {importOrdersSummary}
            </div>
          )}

          {importOrdersLogs.length > 0 && (
            <div className="space-y-2">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Consola de Progreso:</span>
              <div className="bg-slate-950 text-emerald-400 font-mono text-[10px] p-4 rounded-xl max-h-64 overflow-y-auto space-y-1 shadow-inner leading-relaxed border border-slate-800">
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

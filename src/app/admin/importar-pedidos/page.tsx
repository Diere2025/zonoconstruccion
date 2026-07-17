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

      try {
        addLog("  -> Cargando productos, vendedores, localidades, orígenes, medios de pedido, métodos de pago y líneas telefónicas...");
        console.log("[ImportarPedidos] Iniciando carga de datos maestros en paralelo con logs en vivo");
        
        const loadProducts = async () => {
          const start = Date.now();
          const data = await withTimeoutAndRetry(async () => {
            const { data, error } = await supabase.from('products').select('id, name, sku, price');
            if (error) throw error;
            return data;
          }, 45000, 2, "Tiempo de espera agotado al cargar productos (45s)");
          addLog(`  ✅ Productos cargados: ${data?.length || 0} (${Date.now() - start}ms)`);
          return data;
        };

        const loadSellers = async () => {
          const start = Date.now();
          const data = await withTimeoutAndRetry(async () => {
            const { data, error } = await supabase.from('sellers').select('id, full_name, is_organic');
            if (error) throw error;
            return data;
          }, 45000, 2, "Tiempo de espera agotado al cargar vendedores (45s)");
          addLog(`  ✅ Vendedores cargados: ${data?.length || 0} (${Date.now() - start}ms)`);
          return data;
        };

        const loadLocalities = async () => {
          const start = Date.now();
          const data = await withTimeoutAndRetry(async () => {
            const { data, error } = await supabase.from('localities').select('id, name, zone_id');
            if (error) throw error;
            return data;
          }, 45000, 2, "Tiempo de espera agotado al cargar localidades (45s)");
          addLog(`  ✅ Localidades cargadas: ${data?.length || 0} (${Date.now() - start}ms)`);
          return data;
        };

        const loadAdvSources = async () => {
          const start = Date.now();
          const data = await withTimeoutAndRetry(async () => {
            const { data, error } = await supabase.from('advertising_sources').select('id, name');
            if (error) throw error;
            return data;
          }, 45000, 2, "Tiempo de espera agotado al cargar orígenes (45s)");
          addLog(`  ✅ Orígenes cargados: ${data?.length || 0} (${Date.now() - start}ms)`);
          return data;
        };

        const loadOrderMediums = async () => {
          const start = Date.now();
          const data = await withTimeoutAndRetry(async () => {
            const { data, error } = await supabase.from('order_mediums').select('id, name');
            if (error) throw error;
            return data;
          }, 45000, 2, "Tiempo de espera agotado al cargar medios (45s)");
          addLog(`  ✅ Medios cargados: ${data?.length || 0} (${Date.now() - start}ms)`);
          return data;
        };

        const loadPaymentMethods = async () => {
          const start = Date.now();
          const data = await withTimeoutAndRetry(async () => {
            const { data, error } = await supabase.from('payment_methods').select('id, name, surcharge_percentage, installments');
            if (error) throw error;
            return data;
          }, 45000, 2, "Tiempo de espera agotado al cargar métodos de pago (45s)");
          addLog(`  ✅ Métodos de pago cargados: ${data?.length || 0} (${Date.now() - start}ms)`);
          return data;
        };

        const loadPhoneLines = async () => {
          const start = Date.now();
          const data = await withTimeoutAndRetry(async () => {
            const { data, error } = await supabase.from('phone_lines').select('id, phone_number');
            if (error) throw error;
            return data;
          }, 45000, 2, "Tiempo de espera agotado al cargar líneas telefónicas (45s)");
          addLog(`  ✅ Líneas telefónicas cargadas: ${data?.length || 0} (${Date.now() - start}ms)`);
          return data;
        };

        const [
          productsRes,
          sellersRes,
          localitiesRes,
          advSourcesRes,
          orderMediumsRes,
          paymentMethodsRes,
          phoneLinesRes
        ] = await Promise.all([
          loadProducts(),
          loadSellers(),
          loadLocalities(),
          loadAdvSources(),
          loadOrderMediums(),
          loadPaymentMethods(),
          loadPhoneLines()
        ]);

        dbProducts = productsRes;
        dbSellers = sellersRes;
        dbLocalities = localitiesRes;
        dbAdvSources = advSourcesRes;
        dbOrderMediums = orderMediumsRes;
        dbPaymentMethods = paymentMethodsRes;
        dbPhoneLines = phoneLinesRes;
      } catch (err: any) {
        console.error("[ImportarPedidos] Error crítico cargando datos maestros:", err);
        addLog(`❌ Error en carga de datos maestros: ${err.message || String(err)}`);
        throw err;
      }

      addLog("Obteniendo códigos y estados de pedidos existentes...");
      const existingOrdersMap = new Map<string, { id: string; status: string; delivery_detail?: string; whaticket_link?: string; order_medium_id?: string }>();
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;
      
      while (hasMore) {
        if (cancelImportRef.current) {
          addLog("🔴 Proceso cancelado durante la carga de códigos inicial.");
          throw new Error("Importación cancelada por el usuario.");
        }
        const { data, error } = await supabase
          .from('orders')
          .select('id, legacy_code, status, delivery_detail, whaticket_link, order_medium_id')
          .not('legacy_code', 'is', null)
          .order('id')
          .range(page * pageSize, (page + 1) * pageSize - 1);

          
        if (error) throw error;
        if (data && data.length > 0) {
          data.forEach(o => {
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
          page++;
          if (data.length < pageSize) {
            hasMore = false;
          }
        } else {
          hasMore = false;
        }
      }
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

        for (const row of targetRows) {
          if (cancelImportRef.current) {
            addLog("🔴 Importación cancelada por el usuario.");
            break;
          }
          const orderCode = (row[1] || "").trim();
          if (!orderCode) continue;

          if (skipENC && orderCode.toUpperCase().startsWith("ENC")) continue;
          if (skipCAMB && orderCode.toUpperCase().startsWith("CAMB")) continue;

          const rawWhaticketLink = (row[8] || "").trim();
          const rawMedium = (row[11] || "").trim();
          const normRawMedium = normalizeText(rawMedium);
          
          // Resolve medium
          let resolvedMediumName = "Otro";
          if (rawWhaticketLink && (rawWhaticketLink.toLowerCase().includes("whaticket") || rawWhaticketLink.startsWith("http"))) {
            resolvedMediumName = "Whaticket";
          } else if (normRawMedium.includes("whatsapp business api")) {
            resolvedMediumName = "Whaticket";
          } else if (normRawMedium.includes("whaticket linea 3690") || normRawMedium.includes("whaticket linea 3881")) {
            resolvedMediumName = "WhatsApp";
          } else if (normRawMedium.includes("whatsapp") || normRawMedium.includes("wp")) {
            resolvedMediumName = "WhatsApp";
          } else if (normRawMedium.includes("llamado") || normRawMedium.includes("llamada")) {
            resolvedMediumName = "Llamado";
          } else if (normRawMedium.includes("messenger")) {
            resolvedMediumName = "Messenger FB";
          } else if (normRawMedium.includes("whaticket")) {
            resolvedMediumName = "Whaticket";
          } else if (normRawMedium.includes("cliente agendado") && normRawMedium.includes("sin publicidad")) {
            resolvedMediumName = "WhatsApp";
          } else if (normRawMedium.includes("cliente agendado") && normRawMedium.includes("recupero")) {
            resolvedMediumName = "WhatsApp";
          } else if (normRawMedium.includes("redireccionado")) {
            resolvedMediumName = "Transferido";
          } else if (normRawMedium.includes("facebook pagina")) {
            resolvedMediumName = "Messenger FB";
          } else if (normRawMedium.includes("zc api")) {
            resolvedMediumName = "Whaticket";
          }
          
          const orderMediumId = orderMediumsMap.get(normalizeText(resolvedMediumName)) || null;

          let didDbWrite = false;
          try {
            await withTimeout((async () => {
              const dbOrder = findExistingOrder(orderCode);
              if (dbOrder) {
            const activeStatuses = ['Pendiente', 'Confirmado', 'Entregando'];
            if (activeStatuses.includes(dbOrder.status)) {
              const rawStatusVal = (row[0] || "").trim();
              const normStatus = normalizeText(rawStatusVal);
              
              let newStatus = dbOrder.status;
              if (normStatus === 'entregado' || normStatus === 'pasado') newStatus = 'Entregado';
              else if (normStatus === 'cancelado' || normStatus === 'anulado') newStatus = 'Cancelado';
              else if (normStatus === 'entregando') newStatus = 'Entregando';
              else if (normStatus === 'pendiente') newStatus = 'Pendiente';
              
              // Sync Whaticket/Medium for existing active orders
              const dbWhaticket = dbOrder.whaticket_link || "";
              const dbMediumId = dbOrder.order_medium_id || "";
              
              let needsMetadataUpdate = false;
              const updatePayload: any = {};
              
              if (rawWhaticketLink && rawWhaticketLink !== dbWhaticket) {
                updatePayload.whaticket_link = rawWhaticketLink;
                needsMetadataUpdate = true;
                dbOrder.whaticket_link = rawWhaticketLink;
              }
              if (orderMediumId && orderMediumId !== dbMediumId) {
                updatePayload.order_medium_id = orderMediumId;
                needsMetadataUpdate = true;
                dbOrder.order_medium_id = orderMediumId;
              }
              
              if (newStatus !== dbOrder.status || needsMetadataUpdate) {
                const fieldsToUpdate: any = { ...updatePayload };
                if (newStatus !== dbOrder.status) {
                  fieldsToUpdate.status = newStatus;
                  addLog(`🔄 Sincronizando pedido ${orderCode}: cambiando estado de '${dbOrder.status}' a '${newStatus}'...`);
                }
                if (needsMetadataUpdate) {
                  addLog(`🔄 Sincronizando Whaticket/Medio para pedido ${orderCode}...`);
                }
                didDbWrite = true;
                
                const { error: errUpdate } = await supabase
                  .from('orders')
                  .update(fieldsToUpdate)
                  .eq('id', dbOrder.id);
                  
                if (errUpdate) {
                  addLog(`❌ Error al actualizar estado del pedido ${orderCode}: ${errUpdate.message}`);
                } else {
                  if (newStatus === 'Entregado' && orderCode.toUpperCase().startsWith("CAMB")) {
                    const { data: matchedClaims } = await supabase
                      .from('returns_exchanges')
                      .select('id')
                      .or(`notes.ilike.%${orderCode}%,problem_explanation.ilike.%${orderCode}%,reason.ilike.%${orderCode}%`);
                      
                    if (matchedClaims && matchedClaims.length > 0) {
                      for (const c of matchedClaims) {
                        await supabase
                          .from('returns_exchanges')
                          .update({ status: 'Completado' })
                          .eq('id', c.id);
                        addLog(`  ✅ Reclamo asociado ${c.id.substring(0,8)} actualizado a 'Completado' debido a entrega de ${orderCode}.`);
                      }
                    }
                  }
                  let deliveryStatus = 'pendiente_ruteo';
                  if (newStatus === 'Entregado') {
                    deliveryStatus = 'entregado';
                  } else if (newStatus === 'Cancelado') {
                    deliveryStatus = 'fallido';
                  }
                  
                  const updatePayload: any = { status: deliveryStatus };
                  if (newStatus === 'Entregado') {
                    const rawEntDate = (row[2] || "").trim();
                    const initDelDate = parseDate(rawEntDate);
                    updatePayload.delivery_date = initDelDate.toISOString();
                  }
                  
                  const { error: errDelUpdate } = await supabase
                    .from('deliveries')
                    .update(updatePayload)
                    .eq('order_id', dbOrder.id);
                    
                  if (errDelUpdate) {
                    addLog(`❌ Error al actualizar entrega del pedido ${orderCode}: ${errDelUpdate.message}`);
                  } else {
                    addLog(`✅ Pedido ${orderCode} y entrega actualizados a '${newStatus}'.`);
                    totalUpdated++;
                    dbOrder.status = newStatus;
                  }
                }
              }
            }

            // Sincronizar medio de pago y recargo si el medio de pago en la planilla tiene recargo
            const rawPayMethod = (row[21] || "").trim();
            const pmObj = payMethodsMap.get(normalizeText(rawPayMethod)) || null;
            const pmId = pmObj ? pmObj.id : null;
            const hasSurcharge = pmObj ? (pmObj.surcharge_percentage > 0) : false;

            if (syncPaymentMethods && hasSurcharge) {
              addLog(`💳 Sincronizando medio de pago con recargo para pedido ${orderCode}: ${rawPayMethod}...`);
              didDbWrite = true;
              const rawSubtotal = parseSpanishNumber(row[28]);
              const rawFreight = parseSpanishNumber(row[27]);
              const rawSurcharge = parseSpanishNumber(row[25]);
              const rawAbonado = parseSpanishNumber(row[24]);
              const rawPending = parseSpanishNumber(row[29]);
              const calculatedTotal = rawSubtotal + rawFreight + rawSurcharge;
              
              const totalsJson = {
                subtotal: rawSubtotal,
                freight: rawFreight,
                payment_surcharges: rawSurcharge,
                deposit_amount: rawAbonado,
                pending_balance: rawPending
              };

              const { error: errUpdatePay } = await supabase
                .from('orders')
                .update({
                  payment_method_id: pmId,
                  total_amount: calculatedTotal,
                  totals: totalsJson
                })
                .eq('id', dbOrder.id);

              if (errUpdatePay) {
                addLog(`❌ Error al actualizar recargo/medio de pago del pedido ${orderCode}: ${errUpdatePay.message}`);
              } else {
                addLog(`✅ Surtotal/Recargo de pedido ${orderCode} actualizado a ${calculatedTotal} (${rawPayMethod}).`);
                totalUpdated++;
              }
            }

            // Check if delivery detail changed and update it
            const rawDeliveryDetail = (row[10] || "").trim();
            const currentDetail = dbOrder.delivery_detail || "";
            if (rawDeliveryDetail && rawDeliveryDetail !== currentDetail) {
              addLog(`  📝 El detalle de entrega del pedido ${orderCode} cambió. Actualizando en base de datos...`);
              didDbWrite = true;
              const { error: errDetail } = await supabase
                .from('orders')
                .update({ delivery_detail: rawDeliveryDetail })
                .eq('id', dbOrder.id);
                
              if (errDetail) {
                addLog(`  ❌ Error al actualizar detalle de entrega: ${errDetail.message}`);
              } else {
                dbOrder.delivery_detail = rawDeliveryDetail;
                addLog(`  ✅ Detalle de entrega actualizado.`);
              }
            }

            // If it is a CAMB or REC order, re-run claim linking and dummy order cleanup (only if the order is still active/pending)
            const isActiveOrder = ['Pendiente', 'Confirmado', 'Entregando'].includes(dbOrder.status);
            if (isActiveOrder && (orderCode.toUpperCase().startsWith("CAMB") || orderCode.toUpperCase().startsWith("REC"))) {
              didDbWrite = true;
              const detailMatch = rawDeliveryDetail.match(/^\d+\s*-\s*([A-Z0-9]+)\s*-\s*/i);
              let referencedCode = detailMatch ? detailMatch[1].toUpperCase() : null;
              
              if (!referencedCode) {
                const recMatch = rawDeliveryDetail.match(/REC\d+/i);
                if (recMatch) {
                  referencedCode = recMatch[0].toUpperCase();
                }
              }
              
              if (!referencedCode) {
                const codeMatch = rawDeliveryDetail.match(/[A-Z]{2,4}\d+/i);
                if (codeMatch) {
                  const matchedStr = codeMatch[0].toUpperCase();
                  if (!matchedStr.startsWith("CAMB") && !matchedStr.startsWith("REC")) {
                    referencedCode = matchedStr;
                  }
                }
              }

              let claimsSheetRow = null;
              if (referencedCode) {
                claimsSheetRow = claimsMap.get(referencedCode);
              }
              if (!claimsSheetRow) {
                claimsSheetRow = claimsMap.get(orderCode.toUpperCase());
              }

              const searchCode = referencedCode || orderCode;

              // Check if returns_exchanges already has this reference
              const { data: matchedClaims } = await supabase
                .from('returns_exchanges')
                .select('id, order_id')
                .or(`notes.ilike.%${searchCode}%,problem_explanation.ilike.%${searchCode}%,reason.ilike.%${searchCode}%`);

              if (matchedClaims && matchedClaims.length > 0) {
                for (const claim of matchedClaims) {
                  const { data: currentOrderData } = await supabase
                    .from('orders')
                    .select('id, legacy_code')
                    .eq('id', claim.order_id)
                    .single();

                  const currentLegacyCode = currentOrderData?.legacy_code || "";

                  // If it is linked to a placeholder or wrong type order, try to resolve a better link
                  if (currentLegacyCode.startsWith("ORIG-CAMB") || currentLegacyCode.startsWith("ORIG-REC") || currentLegacyCode === orderCode || currentLegacyCode.startsWith("ORIG-")) {
                    let originalOrderCodeToSearch = null;
                    if (claimsSheetRow) {
                      originalOrderCodeToSearch = (claimsSheetRow[3] || "").trim().toUpperCase();
                      if (originalOrderCodeToSearch.startsWith("CAMB") || originalOrderCodeToSearch.startsWith("ENC")) {
                        originalOrderCodeToSearch = null;
                      }
                    }

                    if (!originalOrderCodeToSearch && referencedCode && !referencedCode.startsWith("REC") && !referencedCode.startsWith("CAMB")) {
                      originalOrderCodeToSearch = referencedCode;
                    }

                    if (originalOrderCodeToSearch) {
                      // Check if real order exists in DB
                      const { data: origOrder } = await supabase
                        .from('orders')
                        .select('id')
                        .eq('legacy_code', originalOrderCodeToSearch)
                        .limit(1);

                      let targetOrderId = null;
                      if (origOrder && origOrder.length > 0) {
                        targetOrderId = origOrder[0].id;
                        addLog(`  🔄 Re-vinculando reclamo ${claim.id.substring(0,8)} a pedido REAL: ${originalOrderCodeToSearch}`);
                      } else {
                        // Create/get a better dummy order
                        const dummyCode = originalOrderCodeToSearch.startsWith("ORIG-")
                          ? originalOrderCodeToSearch
                          : `ORIG-${originalOrderCodeToSearch}`;

                        const { data: existingDummy } = await supabase
                          .from('orders')
                          .select('id')
                          .eq('legacy_code', dummyCode)
                          .limit(1);

                        if (existingDummy && existingDummy.length > 0) {
                          targetOrderId = existingDummy[0].id;
                        } else {
                          const rawClientName = (row[5] || "").trim() || "Cliente Sin Nombre";
                          const rawLocality = (row[17] || "").trim();
                          const rawAddress = (row[18] || "").trim();
                          const rawMapsLink = (row[19] || "").trim();

                          addLog(`  🔄 Re-creando pedido base temporal ${dummyCode}...`);
                          const { data: dummyOrder } = await supabase
                            .from('orders')
                            .insert({
                              customer_name: rawClientName,
                              locality: rawLocality,
                              address: rawAddress,
                              google_maps_link: rawMapsLink,
                              freight_type: 'Regular',
                              status: 'Entregado',
                              total_amount: 0,
                              order_date: new Date().toISOString(),
                              initial_delivery_date: new Date().toISOString(),
                              max_delivery_date: new Date().toISOString(),
                              payment_status: 'Abonado',
                              channel: sheet.defaultChannel || 'web_organica',
                              legacy_code: dummyCode
                            })
                            .select('id')
                            .single();

                          if (dummyOrder) {
                            targetOrderId = dummyOrder.id;
                            await supabase
                              .from('deliveries')
                              .update({ status: 'entregado' })
                              .eq('order_id', dummyOrder.id);
                          }
                        }
                      }

                      if (targetOrderId && targetOrderId !== claim.order_id) {
                        const oldOrderId = claim.order_id;

                        // Update claim in DB
                        await supabase
                          .from('returns_exchanges')
                          .update({ order_id: targetOrderId })
                          .eq('id', claim.id);

                        addLog(`  ✅ Reclamo re-vinculado con éxito.`);

                        // Clean up old dummy order if it starts with ORIG-
                        if (currentLegacyCode.startsWith("ORIG-")) {
                          await supabase
                            .from('orders')
                            .delete()
                            .eq('id', oldOrderId);
                          addLog(`  🗑 Eliminado pedido temporal obsoleto: ${currentLegacyCode}`);
                        }
                      }
                    }
                  }
                }
              }
            }

            // Sync items for existing active orders (to handle late product modifications in the spreadsheet)
            if (['Pendiente', 'Confirmado', 'Entregando'].includes(dbOrder.status)) {
              const { data: dbItems } = await supabase
                .from('order_items')
                .select('id, product_name, quantity, unit_price, product_id')
                .eq('order_id', dbOrder.id);

              const sheetItems = [];
              for (let pIdx = 30; pIdx < row.length; pIdx += 4) {
                const prodName = (row[pIdx] || "").trim();
                const prodQtyRaw = (row[pIdx + 1] || "").trim();
                const prodPriceRaw = (row[pIdx + 2] || "").trim();

                if (!prodName || prodName === "0" || prodName.toLowerCase() === "descuento") {
                  continue;
                }

                const qty = parseInt(prodQtyRaw.replace(/[^0-9.-]/g, ''), 10) || 0;
                const unitPrice = parseSpanishNumber(prodPriceRaw);
                
                if (qty <= 0) continue;

                const csvCleanName = cleanProductName(prodName);
                const matchedProd = dbProducts?.find(p => 
                  cleanProductName(p.name) === csvCleanName || 
                  (p.sku && cleanProductName(p.sku) === csvCleanName)
                );
                const productId = matchedProd ? matchedProd.id : null;

                sheetItems.push({
                  order_id: dbOrder.id,
                  product_id: productId,
                  product_name: prodName,
                  quantity: qty,
                  unit_price: unitPrice,
                  discount_percentage: 0,
                  historical_unit_cost: 0
                });
              }

              let itemsChanged = false;
              if (!dbItems || dbItems.length !== sheetItems.length) {
                itemsChanged = true;
              } else {
                for (const sItem of sheetItems) {
                  const sClean = cleanProductName(sItem.product_name);
                  const hasMatch = dbItems.some(dbi => 
                    cleanProductName(dbi.product_name) === sClean && 
                    dbi.quantity === sItem.quantity && 
                    dbi.product_id === sItem.product_id && 
                    Math.abs(dbi.unit_price - sItem.unit_price) <= 5.0
                  );
                  if (!hasMatch) {
                    itemsChanged = true;
                    break;
                  }
                }
              }

              if (itemsChanged) {
                addLog(`  🔄 Sincronizando artículos modificados para pedido ${orderCode}...`);
                
                // Recalculate category
                let termotanqueCount = 0;
                let tanquesCount = 0;
                let biofortCount = 0;
                let mepsCount = 0;
                let escalerasCount = 0;
                let pinturasCount = 0;
                let otrosCount = 0;

                for (let pIdx = 30; pIdx < row.length; pIdx += 4) {
                  const prodName = (row[pIdx] || "").trim();
                  const prodQtyRaw = (row[pIdx + 1] || "").trim();
                  if (!prodName || prodName === "0" || prodName.toLowerCase() === "descuento") {
                    continue;
                  }
                  const qty = parseInt(prodQtyRaw.replace(/[^0-9.-]/g, ''), 10) || 0;
                  if (qty <= 0) continue;

                  const nameLower = prodName.toLowerCase();
                  if (nameLower.includes("termotanque") || nameLower.includes("termo")) {
                    termotanqueCount += qty;
                  } else if (nameLower.includes("aquafort") || nameLower.includes("tanque") || nameLower.includes("base") || nameLower.includes("flotante") || nameLower.includes("flotador")) {
                    tanquesCount += qty;
                  } else if (nameLower.includes("biofort") || nameLower.includes("biodigestor") || nameLower.includes("septic") || nameLower.includes("séptic") || nameLower.includes("desengrasadora") || nameLower.includes("inspeccion") || nameLower.includes("inspección") || nameLower.includes("lodos") || nameLower.includes("wp") || nameLower.includes("aerosol") || nameLower.includes("lubricante")) {
                    biofortCount += qty;
                  } else if (nameLower.includes("meps") || nameLower.includes("equilibrio") || nameLower.includes("membrana")) {
                    mepsCount += qty;
                  } else if (nameLower.includes("escalera")) {
                    escalerasCount += qty;
                  } else if (nameLower.includes("látex") || nameLower.includes("latex") || nameLower.includes("pintura")) {
                    pinturasCount += qty;
                  } else {
                    otrosCount += qty;
                  }
                }

                let deducedCategory = "Otros";
                const counts = [
                  { cat: "Termotanques", count: termotanqueCount },
                  { cat: "Tanques de Agua", count: tanquesCount },
                  { cat: "Biodigestores", count: biofortCount },
                  { cat: "MEPS", count: mepsCount },
                  { cat: "Escaleras", count: escalerasCount },
                  { cat: "Pinturas", count: pinturasCount }
                ];
                counts.sort((a, b) => b.count - a.count);
                if (counts[0].count > 0) {
                  deducedCategory = counts[0].cat;
                }

                // Update order totals
                const rawSubtotal = parseSpanishNumber(row[28]);
                const rawFreight = parseSpanishNumber(row[27]);
                const rawSurcharge = parseSpanishNumber(row[25]);
                const rawAbonado = parseSpanishNumber(row[24]);
                const rawPending = parseSpanishNumber(row[29]);
                const calculatedTotal = rawSubtotal + rawFreight + rawSurcharge;

                const totalsJson = {
                  subtotal: rawSubtotal,
                  freight: rawFreight,
                  payment_surcharges: rawSurcharge,
                  deposit_amount: rawAbonado,
                  pending_balance: rawPending
                };

                const { error: errOrdUpdate } = await supabase
                  .from('orders')
                  .update({
                    totals: totalsJson,
                    total_amount: calculatedTotal,
                    category: deducedCategory
                  })
                  .eq('id', dbOrder.id);

                if (errOrdUpdate) {
                  addLog(`  ❌ Error al actualizar montos del pedido ${orderCode}: ${errOrdUpdate.message}`);
                }

                await supabase
                  .from('order_items')
                  .delete()
                  .eq('order_id', dbOrder.id);

                if (sheetItems.length > 0) {
                  const { error: errInsItems } = await supabase
                    .from('order_items')
                    .insert(sheetItems);
                  if (errInsItems) {
                    addLog(`  ❌ Error al re-insertar artículos: ${errInsItems.message}`);
                  } else {
                    addLog(`  ✅ Artículos re-sincronizados con éxito (${sheetItems.length} items).`);
                    totalItemsImported += sheetItems.length;
                    totalUpdated++;
                    didDbWrite = true;
                  }
                }
              }
            }

            return;
          }

          didDbWrite = true;
          addLog(`Procesando pedido ${orderCode}...`);
          const rawStatus = (row[0] || "Pendiente").trim();
          const rawSolDate = (row[3] || "").trim();
          const rawEntDate = (row[2] || "").trim();
          const rawLimDate = (row[4] || "").trim();
          const rawClientName = (row[5] || "").trim() || "Cliente Sin Nombre";
          const rawPhone1 = cleanPhone(row[6]);
          const rawPhone2 = cleanPhone(row[7]);
          const rawEmail = null;
          const rawAdvSource = (row[9] || "").trim();
          const rawDeliveryDetail = (row[10] || "").trim();
          const rawMedium = (row[11] || "").trim();
          const rawSellerName = (row[12] || "").trim();
          const rawLocality = (row[17] || "").trim();
          const rawAddress = (row[18] || "").trim() || "Dirección Sin Especificar";
          const rawMapsLink = (row[19] || "").trim();
          const rawPayMethod = (row[21] || "").trim();
          const rawTaxId = (row[22] || "").trim();
          
          const rawSubtotal = parseSpanishNumber(row[28]);
          const rawFreight = parseSpanishNumber(row[27]);
          const rawSurcharge = parseSpanishNumber(row[25]);
          const rawAbonado = parseSpanishNumber(row[24]);
          const rawPending = parseSpanishNumber(row[29]);

          let sellerId = sheet.defaultSellerId;
          const normSeller = normalizeText(rawSellerName);
          if (sellersMap.has(normSeller)) {
            sellerId = sellersMap.get(normSeller).id;
          }

          const advSourceId = advSourcesMap.get(normalizeText(rawAdvSource)) || null;
          
          const paymentMethodObj = payMethodsMap.get(normalizeText(rawPayMethod)) || null;
          const paymentMethodId = paymentMethodObj ? paymentMethodObj.id : null;
          
          let localityId = null;
          if (rawLocality) {
            const normLoc = normalizeLocalityFuzzy(rawLocality);
            if (localitiesMap.has(normLoc)) {
              localityId = localitiesMap.get(normLoc);
            } else {
              addLog(`Creando localidad inexistente: "${rawLocality}"`);
              const { data: newLoc, error: errNl } = await supabase
                .from('localities')
                .insert({ name: rawLocality, zone_id: null })
                .select('id')
                .single();
              
              if (errNl) {
                addLog(`Advertencia al crear localidad ${rawLocality}: ${errNl.message}`);
              } else if (newLoc) {
                localityId = newLoc.id;
                localitiesMap.set(normLoc, localityId);
                if (dbLocalities) {
                  dbLocalities.push({ id: newLoc.id, name: rawLocality, zone_id: null });
                }
              }
            }
          }

          const matchedLocObj = dbLocalities?.find(l => l.id === localityId);
          const logisticsZoneId = matchedLocObj ? matchedLocObj.zone_id : null;

          // Auto-detect phone line from the medium digits matching registered phone numbers
          let phoneLineId = null;
          const digitsMatch = rawMedium.match(/\d+/);
          if (digitsMatch) {
            const digits = digitsMatch[0];
            const matchedLine = dbPhoneLines?.find(line => line.phone_number.endsWith(digits));
            if (matchedLine) {
              phoneLineId = matchedLine.id;
            }
          }

          let clientId = null;
          let shippingAddressId = null;

          const phonesToQuery = [];
          if (rawPhone1) phonesToQuery.push(rawPhone1);
          if (rawPhone2) phonesToQuery.push(rawPhone2);

          let existingClient = null;
          if (phonesToQuery.length > 0) {
            addLog(`  🔍 Buscando cliente por teléfono (${phonesToQuery.join(', ')})...`);
            const { data: clientsFound } = await supabase
              .from('clients')
              .select('id, business_name, phone_primary, phone_secondary, is_wholesale')
              .or(`phone_primary.in.(${phonesToQuery.join(',')}),phone_secondary.in.(${phonesToQuery.join(',')})`);
            if (clientsFound && clientsFound.length > 0) {
              existingClient = clientsFound[0];
            }
          }

          if (existingClient) {
            addLog(`  ✅ Encontrado cliente existente: "${existingClient.business_name}"`);
            clientId = existingClient.id;
            
            // Mark existing client as wholesale if this is an AQU, POW or AQ-DB wholesale order
            const isWholesaleCode = orderCode.toUpperCase().startsWith("AQU") || orderCode.toUpperCase().startsWith("POW") || orderCode.toUpperCase().startsWith("AQ-DB");
            if (isWholesaleCode && !existingClient.is_wholesale) {
              addLog(`  ✍ Actualizando cliente existente como mayorista...`);
              await supabase
                .from('clients')
                .update({ is_wholesale: true })
                .eq('id', clientId);
              existingClient.is_wholesale = true;
            }

            addLog(`  🔍 Buscando direcciones registradas para el cliente...`);
            const { data: clientAddresses } = await supabase
              .from('addresses')
              .select('id, full_address, locality_id')
              .eq('client_id', clientId);
            
            const normRawAddress = normalizeText(rawAddress);
            const matchedAddr = clientAddresses?.find(addr => 
              addr.locality_id === localityId && normalizeText(addr.full_address) === normRawAddress
            );

            if (matchedAddr) {
              shippingAddressId = matchedAddr.id;
            } else {
              addLog(`  ✍ Dirección nueva para cliente existente. Registrando dirección: "${rawAddress}"...`);
              const addrIndex = (clientAddresses?.length || 0) + 1;
              const { data: newAddr, error: errNa } = await supabase
                .from('addresses')
                .insert({
                  client_id: clientId,
                  alias: `Dirección ${addrIndex}`,
                  full_address: rawAddress,
                  locality_id: localityId,
                  map_link: rawMapsLink,
                  is_default: false
                })
                .select('id')
                .single();
              if (errNa) throw errNa;
              shippingAddressId = newAddr.id;
            }
          } else {
            addLog(`  🆕 Cliente no encontrado. Creando nuevo cliente: "${rawClientName}"...`);
            const { data: newClient, error: errNc } = await supabase
              .from('clients')
              .insert({
                business_name: rawClientName,
                phone_primary: rawPhone1 || rawPhone2 || "Sin teléfono",
                phone_secondary: rawPhone2 || null,
                email: rawEmail || null,
                tax_id: rawTaxId || null,
                credit_limit: 0,
                is_wholesale: orderCode.toUpperCase().startsWith("AQU") || orderCode.toUpperCase().startsWith("POW") || orderCode.toUpperCase().startsWith("AQ-DB")
              })
              .select('id')
              .single();
            if (errNc) throw errNc;
            clientId = newClient.id;

            addLog(`  ✍ Registrando dirección principal: "${rawAddress}"...`);
            const { data: newAddr, error: errNa } = await supabase
              .from('addresses')
              .insert({
                client_id: clientId,
                alias: 'Principal',
                full_address: rawAddress,
                locality_id: localityId,
                map_link: rawMapsLink,
                is_default: true
              })
              .select('id')
              .single();
            if (errNa) throw errNa;
            shippingAddressId = newAddr.id;
          }

          let channel = sheet.defaultChannel;
          const sellerObj = dbSellers?.find(s => s.id === sellerId);
          if (sellerObj) {
            if (sellerObj.is_organic) {
              channel = "web_organica";
            } else if (sellerObj.full_name === "Diego Bóveda") {
              channel = "mostrador_minorista";
            } else {
              channel = "web_organica";
            }
          }

          if (rawDeliveryDetail.toUpperCase().includes("MAYORISTA")) {
            channel = "mayorista";
          }

          const orderDate = parseDate(rawSolDate);
          const initDelDate = parseDate(rawEntDate);
          const maxDelDate = rawLimDate ? parseDate(rawLimDate) : initDelDate;

          let paymentStatus = 'Pendiente';
          if (rawPending <= 0) {
            paymentStatus = 'Abonado';
          } else if (rawAbonado > 0) {
            paymentStatus = 'Seniado';
          }

          const calculatedTotal = rawSubtotal + rawFreight + rawSurcharge;
          const totalsJson = {
            subtotal: rawSubtotal,
            freight: rawFreight,
            payment_surcharges: rawSurcharge,
            deposit_amount: rawAbonado,
            pending_balance: rawPending
          };

          // Deduce order category from products in the CSV row before inserting
          let termotanqueCount = 0;
          let tanquesCount = 0;
          let biofortCount = 0;
          let mepsCount = 0;
          let escalerasCount = 0;
          let pinturasCount = 0;
          let otrosCount = 0;

          for (let pIdx = 30; pIdx < row.length; pIdx += 4) {
            const prodName = (row[pIdx] || "").trim();
            const prodQtyRaw = (row[pIdx + 1] || "").trim();
            if (!prodName || prodName === "0" || prodName.toLowerCase() === "descuento") {
              continue;
            }
            const qty = parseInt(prodQtyRaw.replace(/[^0-9.-]/g, ''), 10) || 0;
            if (qty <= 0) continue;

            const nameLower = prodName.toLowerCase();
            if (nameLower.includes("termotanque") || nameLower.includes("termo")) {
              termotanqueCount += qty;
            } else if (nameLower.includes("aquafort") || nameLower.includes("tanque") || nameLower.includes("base") || nameLower.includes("flotante") || nameLower.includes("flotador")) {
              tanquesCount += qty;
            } else if (nameLower.includes("biofort") || nameLower.includes("biodigestor") || nameLower.includes("septic") || nameLower.includes("séptic") || nameLower.includes("desengrasadora") || nameLower.includes("inspeccion") || nameLower.includes("inspección") || nameLower.includes("lodos") || nameLower.includes("wp") || nameLower.includes("aerosol") || nameLower.includes("lubricante")) {
              biofortCount += qty;
            } else if (nameLower.includes("meps") || nameLower.includes("equilibrio") || nameLower.includes("membrana")) {
              mepsCount += qty;
            } else if (nameLower.includes("escalera")) {
              escalerasCount += qty;
            } else if (nameLower.includes("látex") || nameLower.includes("latex") || nameLower.includes("pintura")) {
              pinturasCount += qty;
            } else {
              otrosCount += qty;
            }
          }

          let deducedCategory = "Otros";
          const counts = [
            { cat: "Termotanques", count: termotanqueCount },
            { cat: "Tanques de Agua", count: tanquesCount },
            { cat: "Biodigestores", count: biofortCount },
            { cat: "MEPS", count: mepsCount },
            { cat: "Escaleras", count: escalerasCount },
            { cat: "Pinturas", count: pinturasCount }
          ];
          counts.sort((a, b) => b.count - a.count);
          if (counts[0].count > 0) {
            deducedCategory = counts[0].cat;
          }

          let dbOrderStatus = 'Pendiente';
          const normStatus = normalizeText(rawStatus);
          if (normStatus === 'entregado' || normStatus === 'pasado') dbOrderStatus = 'Entregado';
          else if (normStatus === 'cancelado' || normStatus === 'anulado') dbOrderStatus = 'Cancelado';
          else if (normStatus === 'entregando') dbOrderStatus = 'Entregando';
          else if (normStatus === 'pendiente') dbOrderStatus = 'Pendiente';

          addLog(`  ✍ Creando pedido en la base de datos (${orderCode})...`);
          const { data: newOrder, error: errOrder } = await supabase
            .from('orders')
            .insert({
              seller_id: sellerId,
              client_id: clientId,
              shipping_address_id: shippingAddressId,
              logistics_zone_id: logisticsZoneId,
              customer_name: rawClientName,
              locality: rawLocality,
              address: rawAddress,
              google_maps_link: rawMapsLink,
              payment_method_id: paymentMethodId,
              freight_type: 'Regular',
              status: dbOrderStatus,
              total_amount: calculatedTotal,
              order_date: orderDate.toISOString(),
              initial_delivery_date: initDelDate.toISOString(),
              max_delivery_date: maxDelDate.toISOString(),
              payment_status: paymentStatus,
              channel: channel,
              advertising_source_id: advSourceId,
              order_medium_id: orderMediumId,
              received_phone_line_id: phoneLineId,
              delivery_detail: rawDeliveryDetail,
              legacy_code: orderCode,
              whaticket_link: rawWhaticketLink || null,
              totals: totalsJson,
              category: deducedCategory
            })
            .select('id')
            .single();

          if (errOrder) throw errOrder;
          const orderId = newOrder.id;
          totalImported++;

          // Relink existing claims that were associated with a dummy order for this code
          // Skip if the order is a claim/change code (since it represents a replacement, not the original)
          if (!orderCode.toUpperCase().startsWith("CAMB") && !orderCode.toUpperCase().startsWith("REC")) {
            const potentialDummyCode = `ORIG-${orderCode}`;
            const { data: matchedDummyOrders } = await supabase
              .from('orders')
              .select('id')
              .eq('legacy_code', potentialDummyCode);
              
            if (matchedDummyOrders && matchedDummyOrders.length > 0) {
              for (const dummyOrd of matchedDummyOrders) {
                addLog(`  🔄 Encontrado pedido base temporal (${potentialDummyCode}). Relacionando reclamos al pedido real y eliminando temporal...`);
                
                // Relink claims
                const { error: errRelink } = await supabase
                  .from('returns_exchanges')
                  .update({ order_id: orderId })
                  .eq('order_id', dummyOrd.id);
                  
                if (errRelink) {
                  addLog(`  ❌ Error al re-vincular reclamos: ${errRelink.message}`);
                } else {
                  // Delete dummy order
                  const { error: errDelDummy } = await supabase
                    .from('orders')
                    .delete()
                    .eq('id', dummyOrd.id);
                    
                  if (errDelDummy) {
                    addLog(`  ❌ Error al eliminar pedido temporal: ${errDelDummy.message}`);
                  } else {
                    addLog(`  ✅ Pedido temporal eliminado con éxito y reclamos re-vinculados.`);
                  }
                }
              }
            }
          }

          if (dbOrderStatus === 'Entregado') {
            await supabase
              .from('deliveries')
              .update({ status: 'entregado', delivery_date: initDelDate.toISOString() })
              .eq('order_id', orderId);
              
            if (orderCode.toUpperCase().startsWith("CAMB")) {
              const { data: matchedClaims } = await supabase
                .from('returns_exchanges')
                .select('id')
                .or(`notes.ilike.%${orderCode}%,problem_explanation.ilike.%${orderCode}%,reason.ilike.%${orderCode}%`);
                
              if (matchedClaims && matchedClaims.length > 0) {
                for (const c of matchedClaims) {
                  await supabase
                    .from('returns_exchanges')
                    .update({ status: 'Completado' })
                    .eq('id', c.id);
                  addLog(`  ✅ Reclamo asociado ${c.id.substring(0,8)} actualizado a 'Completado' debido a entrega de ${orderCode}.`);
                }
              }
            }
          } else if (dbOrderStatus === 'Cancelado') {
            await supabase
              .from('deliveries')
              .update({ status: 'fallido' })
              .eq('order_id', orderId);
              
            if (orderCode.toUpperCase().startsWith("CAMB")) {
              const { data: matchedClaims } = await supabase
                .from('returns_exchanges')
                .select('id')
                .or(`notes.ilike.%${orderCode}%,problem_explanation.ilike.%${orderCode}%,reason.ilike.%${orderCode}%`);
                
              if (matchedClaims && matchedClaims.length > 0) {
                for (const c of matchedClaims) {
                  await supabase
                    .from('returns_exchanges')
                    .update({ status: 'Rechazado' })
                    .eq('id', c.id);
                  addLog(`  ❌ Reclamo asociado ${c.id.substring(0,8)} actualizado a 'Rechazado' debido a cancelación de ${orderCode}.`);
                }
              }
            }
          }

          const importedExchangeItems = [];
          const orderItemsToInsert = [];

          for (let pIdx = 30; pIdx < row.length; pIdx += 4) {
            const prodName = (row[pIdx] || "").trim();
            const prodQtyRaw = (row[pIdx + 1] || "").trim();
            const prodPriceRaw = (row[pIdx + 2] || "").trim();

            if (!prodName || prodName === "0" || prodName.toLowerCase() === "descuento") {
              continue;
            }

            const qty = parseInt(prodQtyRaw.replace(/[^0-9.-]/g, ''), 10) || 0;
            const unitPrice = parseSpanishNumber(prodPriceRaw);
            
            if (qty <= 0) continue;

            const csvCleanName = cleanProductName(prodName);
            const matchedProd = dbProducts?.find(p => 
              cleanProductName(p.name) === csvCleanName || 
              (p.sku && cleanProductName(p.sku) === csvCleanName)
            );
            const productId = matchedProd ? matchedProd.id : null;

            orderItemsToInsert.push({
              order_id: orderId,
              product_id: productId,
              product_name: prodName,
              quantity: qty,
              unit_price: unitPrice,
              discount_percentage: 0,
              historical_unit_cost: 0
            });

            if (productId) {
              importedExchangeItems.push({
                product_id: productId,
                quantity: qty,
                unit_price: unitPrice
              });
            }
          }

          if (orderItemsToInsert.length > 0) {
            addLog(`  ✍ Insertando ${orderItemsToInsert.length} artículo(s) del pedido...`);
            const { error: errOi } = await supabase
              .from('order_items')
              .insert(orderItemsToInsert);

            if (errOi) throw errOi;
            totalItemsImported += orderItemsToInsert.length;
          }

          // If the order starts with CAMB, run the post-sales claim linking logic
          if (orderCode.toUpperCase().startsWith("CAMB")) {
            addLog(`  🔍 Procesando reclamo/cambio intermedio para ${orderCode}...`);
            
            // Extract claim or original order code from rawDeliveryDetail
            const detailMatch = rawDeliveryDetail.match(/^\d+\s*-\s*([A-Z0-9]+)\s*-\s*/i);
            let referencedCode = detailMatch ? detailMatch[1].toUpperCase() : null;
            
            if (!referencedCode) {
              const recMatch = rawDeliveryDetail.match(/REC\d+/i);
              if (recMatch) {
                referencedCode = recMatch[0].toUpperCase();
              }
            }
            
            if (!referencedCode) {
              const codeMatch = rawDeliveryDetail.match(/[A-Z]{2,4}\d+/i);
              if (codeMatch) {
                const matchedStr = codeMatch[0].toUpperCase();
                if (!matchedStr.startsWith("CAMB") && !matchedStr.startsWith("REC")) {
                  referencedCode = matchedStr;
                }
              }
            }
            
            // Try to find the claim in our downloaded claims spreadsheet map
            let claimsSheetRow = null;
            if (referencedCode) {
              claimsSheetRow = claimsMap.get(referencedCode);
            }
            if (!claimsSheetRow) {
              // Fallback: search by CAMB code itself
              claimsSheetRow = claimsMap.get(orderCode.toUpperCase());
            }

            const searchCode = referencedCode || orderCode;
            
            // Check if returns_exchanges already has this reference
            const { data: existingClaims } = await supabase
              .from('returns_exchanges')
              .select('id')
              .or(`notes.ilike.%${searchCode}%,problem_explanation.ilike.%${searchCode}%,reason.ilike.%${searchCode}%`);
              
            if (existingClaims && existingClaims.length > 0) {
              addLog(`  ✅ Ya existe un reclamo/cambio asociado en la base de datos (ID: ${existingClaims[0].id}).`);
            } else {
              // Find or create original order
              let originalOrderId = null;
              let originalOrderCodeToSearch = null;
              
              if (claimsSheetRow) {
                originalOrderCodeToSearch = (claimsSheetRow[3] || "").trim().toUpperCase();
                // If it is a CAMB order code, it's not the original order
                if (originalOrderCodeToSearch.startsWith("CAMB") || originalOrderCodeToSearch.startsWith("ENC")) {
                  originalOrderCodeToSearch = null;
                }
              }
              
              if (!originalOrderCodeToSearch && referencedCode && !referencedCode.startsWith("REC") && !referencedCode.startsWith("CAMB")) {
                originalOrderCodeToSearch = referencedCode;
              }
              
              if (originalOrderCodeToSearch) {
                const { data: origOrder } = await supabase
                  .from('orders')
                  .select('id')
                  .eq('legacy_code', originalOrderCodeToSearch)
                  .limit(1);
                if (origOrder && origOrder.length > 0) {
                  originalOrderId = origOrder[0].id;
                }
              }
              
              // If not found, try to search for the client's most recent order
              if (!originalOrderId && clientId) {
                const { data: clientOrders } = await supabase
                  .from('orders')
                  .select('id')
                  .eq('client_id', clientId)
                  .not('legacy_code', 'ilike', 'CAMB%')
                  .not('legacy_code', 'ilike', 'ENC%')
                  .order('order_date', { ascending: false })
                  .limit(1);
                if (clientOrders && clientOrders.length > 0) {
                  originalOrderId = clientOrders[0].id;
                }
              }
              
              // Create dummy original order if still not found
              if (!originalOrderId) {
                addLog(`  ⚠ No se encontró el pedido original para vincular el reclamo. Creando pedido base...`);
                const dummyCode = originalOrderCodeToSearch 
                  ? (originalOrderCodeToSearch.startsWith("ORIG-") ? originalOrderCodeToSearch : `ORIG-${originalOrderCodeToSearch}`)
                  : (referencedCode && referencedCode.startsWith("REC") ? `ORIG-${referencedCode}` : `ORIG-${orderCode}`);
                const { data: dummyOrder, error: dummyErr } = await supabase
                    .from('orders')
                    .insert({
                      seller_id: sellerId,
                      client_id: clientId,
                      shipping_address_id: shippingAddressId,
                      logistics_zone_id: logisticsZoneId,
                      customer_name: rawClientName,
                      locality: rawLocality,
                      address: rawAddress,
                      google_maps_link: rawMapsLink,
                      payment_method_id: paymentMethodId,
                      freight_type: 'Regular',
                      status: 'Entregado',
                      total_amount: calculatedTotal,
                      order_date: orderDate.toISOString(),
                      initial_delivery_date: initDelDate.toISOString(),
                      max_delivery_date: maxDelDate.toISOString(),
                      payment_status: paymentStatus,
                      channel: channel,
                      legacy_code: dummyCode,
                      totals: totalsJson,
                      category: deducedCategory
                    })
                    .select('id')
                    .single();
                    
                 if (dummyErr) {
                   addLog(`  ❌ Error al crear el pedido base: ${dummyErr.message}`);
                 } else if (dummyOrder) {
                  originalOrderId = dummyOrder.id;
                  await supabase
                    .from('deliveries')
                    .update({ status: 'entregado' })
                    .eq('order_id', dummyOrder.id);
                  addLog(`  ✅ Pedido base creado con éxito.`);
                }
              }
              
              // Create the returns_exchanges claim
              if (originalOrderId) {
                let claimType = 'cambio';
                let claimStatus = 'Abierto';
                if (dbOrderStatus === 'Entregado') {
                  claimStatus = 'Resuelto';
                } else if (dbOrderStatus === 'Cancelado') {
                  claimStatus = 'Rechazado';
                }
                
                if (claimsSheetRow) {
                  const prof = (claimsSheetRow[11] || "").toLowerCase();
                  if (prof.includes("devolucion") || prof.includes("devuelve")) {
                    claimType = 'devolucion';
                  }
                  
                  const statusStr = (claimsSheetRow[18] || "").toLowerCase();
                  if (statusStr.includes("resuelto") || statusStr.includes("pasado")) {
                    claimStatus = 'Resuelto';
                  } else if (statusStr.includes("cancelado") || statusStr.includes("anulado") || statusStr.includes("rechazado")) {
                    claimStatus = 'Rechazado';
                  } else if (statusStr.trim() !== '') {
                    claimStatus = 'Abierto';
                  }
                }
                
                const claimCodeToUse = claimsSheetRow ? (claimsSheetRow[0] || referencedCode || orderCode) : (referencedCode || orderCode);
                const claimDetail = claimsSheetRow ? (claimsSheetRow[12] || rawDeliveryDetail) : rawDeliveryDetail;
                const claimReason = claimsSheetRow ? (claimsSheetRow[12] || `Importado de planilla de cambios: ${searchCode}`) : `Importado de planilla de cambios: ${searchCode}`;
                
                const claimNotes = claimsSheetRow 
                  ? `Código de Reclamo: ${claimsSheetRow[0] || searchCode}. Creado automáticamente durante importación. Mensaje original: ${claimsSheetRow[1] || ""}`
                  : `Código de Reclamo: ${searchCode}. Creado automáticamente durante importación de pedido de cambio ${orderCode}.`;
                
                let claimCreatedAt = orderDate.toISOString();
                if (claimsSheetRow && claimsSheetRow[2]) {
                  const parsedClaimDate = parseDate(claimsSheetRow[2]);
                  claimCreatedAt = parsedClaimDate.toISOString();
                }
                
                let claimSellerId = sellerId;
                if (claimsSheetRow && claimsSheetRow[14]) {
                  const claimSellerNorm = normalizeText(claimsSheetRow[14]);
                  if (sellersMap.has(claimSellerNorm)) {
                    claimSellerId = sellersMap.get(claimSellerNorm).id;
                  }
                }
                
                addLog(`  🚀 Creando reclamo intermedio (tipo: ${claimType}, código: ${claimCodeToUse}, estado: ${claimStatus})...`);
                const { data: newClaim, error: claimErr } = await supabase
                  .from('returns_exchanges')
                  .insert({
                    order_id: originalOrderId,
                    type: claimType,
                    status: claimStatus,
                    reason: claimReason,
                    problem_explanation: claimDetail,
                    notes: claimNotes,
                    refund_amount: 0,
                    exchange_amount: calculatedTotal,
                    difference_amount: 0,
                    created_by: claimSellerId,
                    created_at: claimCreatedAt
                  })
                  .select('id')
                  .single();
                  
                if (claimErr) {
                  addLog(`  ❌ Error al crear reclamo intermedio: ${claimErr.message}`);
                } else if (newClaim) {
                  addLog(`  ✅ Reclamo intermedio creado con éxito (ID: ${newClaim.id}).`);
                  
                  // 1. Insert return items
                  let matchedReturnProd = null;
                  let matchedReturnQty = 1;
                  
                  // Try parsing from rawDeliveryDetail first
                  let parsedReturnName = null;
                  const cleanDetail = rawDeliveryDetail.replace(/['"]/g, '').trim();
                  const retirarMatch = cleanDetail.match(/retirar\s+([^-\(]+)/i);
                  const devuelveMatch = cleanDetail.match(/devuelve\s+(\d+)?\s*([^-\(]+)/i);
                  
                  if (retirarMatch) {
                    parsedReturnName = retirarMatch[1].trim();
                    const qtyMatch = cleanDetail.match(/^(\d+)\s*-\s*/);
                    if (qtyMatch) {
                      matchedReturnQty = parseInt(qtyMatch[1], 10) || 1;
                    }
                  } else if (devuelveMatch) {
                    parsedReturnName = devuelveMatch[2].trim();
                    if (devuelveMatch[1]) {
                      matchedReturnQty = parseInt(devuelveMatch[1], 10) || 1;
                    }
                  }
                  
                  // Fallback: try parsing from claimsSheetRow[12] (Detalle reclamo)
                  if (!parsedReturnName && claimsSheetRow) {
                    const claimDetailText = (claimsSheetRow[12] || "").replace(/['"]/g, '').trim();
                    const claimRetirarMatch = claimDetailText.match(/retirar\s+([^-\(]+)/i);
                    const claimDevuelveMatch = claimDetailText.match(/devuelve\s+(\d+)?\s*([^-\(]+)/i);
                    
                    if (claimRetirarMatch) {
                      parsedReturnName = claimRetirarMatch[1].trim();
                    } else if (claimDevuelveMatch) {
                      parsedReturnName = claimDevuelveMatch[2].trim();
                      if (claimDevuelveMatch[1]) {
                        matchedReturnQty = parseInt(claimDevuelveMatch[1], 10) || 1;
                      }
                    }
                  }
                  
                  if (parsedReturnName) {
                    const cleanReturnProd = cleanProductName(parsedReturnName);
                    matchedReturnProd = dbProducts?.find(p => 
                      cleanProductName(p.name).includes(cleanReturnProd) || 
                      cleanReturnProd.includes(cleanProductName(p.name)) ||
                      (p.sku && (cleanProductName(p.sku).includes(cleanReturnProd) || cleanReturnProd.includes(cleanProductName(p.sku))))
                    );
                  }
                  
                  // Secondary Fallback: look at products listed in the claims sheet row (taking the first product)
                  if (!matchedReturnProd && claimsSheetRow) {
                    const p1Name = (claimsSheetRow[32] || "").trim();
                    const p1QtyRaw = (claimsSheetRow[33] || "").trim();
                    if (p1Name && p1Name !== "0" && p1Name.toLowerCase() !== "descuento") {
                      const cleanP1 = cleanProductName(p1Name);
                      matchedReturnProd = dbProducts?.find(p => 
                        cleanProductName(p.name) === cleanP1 || 
                        (p.sku && cleanProductName(p.sku) === cleanP1)
                      );
                      matchedReturnQty = parseInt(p1QtyRaw, 10) || 1;
                    }
                  }
                  
                  if (matchedReturnProd) {
                    const { error: retErr } = await supabase
                      .from('return_items')
                      .insert({
                        return_id: newClaim.id,
                        product_id: matchedReturnProd.id,
                        quantity: matchedReturnQty,
                        unit_price: matchedReturnProd.price || 0,
                        restock_action: 'descarte_defectuoso'
                      });
                    if (retErr) {
                      addLog(`  ❌ Error al asociar ítem de devolución: ${retErr.message}`);
                    } else {
                      addLog(`  📦 Ítem de devolución asociado: ${matchedReturnProd.name} (Cant: ${matchedReturnQty})`);
                    }
                  }
                  
                  // 2. Insert exchange items
                  if (importedExchangeItems.length > 0) {
                    const exchangeItemsToInsert = importedExchangeItems.map(item => ({
                      return_id: newClaim.id,
                      product_id: item.product_id,
                      quantity: item.quantity,
                      unit_price: item.unit_price
                    }));
                    const { error: excErr } = await supabase
                      .from('exchange_items')
                      .insert(exchangeItemsToInsert);
                    if (excErr) {
                      addLog(`  ❌ Error al asociar ítems de cambio: ${excErr.message}`);
                    } else {
                      addLog(`  📦 Asociados ${importedExchangeItems.length} ítems entregados a cambio.`);
                    }
                  }
                }
              }
            }
          }
          
              const parts = orderCode.split(/[\/,]/).map((c: string) => c.trim().toUpperCase());
              parts.forEach((code: string) => {
                if (code) {
                  existingOrdersMap.set(code, { id: orderId, status: dbOrderStatus });
                }
              });
              addLog(`Pedido ${orderCode} importado con éxito.`);
            })(), 20000, "Tiempo de espera agotado en operaciones de base de datos (20s)");
          } catch (err) {
            console.warn(`Error al procesar pedido ${orderCode}:`, err);
            const message = err instanceof Error ? err.message : String(err);
            addLog(`❌ Error crítico al procesar pedido ${orderCode}: ${message}`);
          }

          // Breather delay to prevent Supabase connection limit exhaustion / rate-limiting (429)
          if (didDbWrite) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
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
                {useClaimsSheet && (
                  <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-wider whitespace-nowrap">CSV:</label>
                    <input
                      type="text"
                      value={claimsSheetUrl}
                      onChange={(e) => setClaimsSheetUrl(e.target.value)}
                      className="flex-1 px-2.5 py-1 text-[10px] border border-slate-200 rounded-md focus:outline-none focus:border-amber-400 font-mono text-slate-600 bg-slate-50"
                      title="CSV Endpoint URL"
                    />
                  </div>
                )}
              </div>
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

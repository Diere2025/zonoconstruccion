// content.js - DOM Processor for Mercado Pago Web
console.log("[Zono MP Monitor] Content script initialized on", window.location.href);

// Config defaults
let config = {
  webhookUrl: "https://zono-erp.pages.dev/api/mp-webhook",
  secretToken: "mpchecker_secret_key_123",
  accountName: "diegozono.mp",
  pollInterval: 15,
  autoRefresh: true
};

let secondsUntilRefresh = config.pollInterval;
let isInitialized = false;

// Load saved config
chrome.storage.local.get(["webhookUrl", "secretToken", "accountName", "pollInterval", "autoRefresh"], (res) => {
  if (res.webhookUrl) config.webhookUrl = res.webhookUrl;
  if (res.secretToken) config.secretToken = res.secretToken;
  if (res.accountName) config.accountName = res.accountName;
  if (res.pollInterval) {
    config.pollInterval = Math.max(8, Number(res.pollInterval));
    secondsUntilRefresh = config.pollInterval;
  }
  if (res.autoRefresh !== undefined) config.autoRefresh = res.autoRefresh;
  console.log("[Zono MP Monitor] Active config:", config);
  createFloatingStatusWidget();
  startMonitoring();
});

let toastContainer = null;
function createFloatingStatusWidget() {
  if (document.getElementById("zono-mp-widget") || !document.body) return;
  
  const widget = document.createElement("div");
  widget.id = "zono-mp-widget";
  widget.style.cssText = "position: fixed; bottom: 20px; right: 20px; z-index: 2147483647; background: #001538; color: white; padding: 12px 18px; border-radius: 14px; box-shadow: 0 6px 25px rgba(0,0,0,0.5); font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif; font-size: 13px; display: flex; align-items: center; gap: 12px; border: 2px solid #0069ff; user-select: none;";
  widget.innerHTML = `
    <span style="width: 10px; height: 10px; border-radius: 50%; background: #10b981; display: inline-block; box-shadow: 0 0 10px #10b981;"></span>
    <div>
      <div style="font-weight: 800; font-size: 12px; letter-spacing: 0.5px; color: #38bdf8;">ZONO ERP AUTO-SYNC</div>
      <div style="font-size: 11px; color: #94a3b8;" id="zono-mp-status-text">Actualizando en <b id="zono-countdown" style="color: #34d399;">${config.pollInterval}s</b> (${config.accountName})</div>
    </div>
    <button id="zono-force-refresh" title="Presionar Actualizar listado ahora" style="background: #0069ff; color: white; border: none; border-radius: 8px; padding: 5px 10px; font-size: 11px; font-weight: 700; cursor: pointer; margin-left: 6px;">Actualizar ya</button>
    <button id="zono-manual-sync-history" title="Importar pagos visibles en pantalla manualmente" style="background: #1e293b; color: #38bdf8; border: 1px solid #3b82f6; border-radius: 8px; padding: 5px 8px; font-size: 10px; font-weight: 700; cursor: pointer;">📥 Sincronizar visibles</button>
  `;
  document.body.appendChild(widget);

  document.getElementById("zono-force-refresh")?.addEventListener("click", () => {
    triggerActualizarListado();
    secondsUntilRefresh = config.pollInterval;
  });

  document.getElementById("zono-manual-sync-history")?.addEventListener("click", () => {
    manualSyncVisibleActivities();
  });

  if (!toastContainer) {
    toastContainer = document.createElement("div");
    toastContainer.id = "zono-mp-toasts";
    toastContainer.style.cssText = "position: fixed; bottom: 85px; right: 20px; z-index: 2147483647; display: flex; flex-direction: column-reverse; gap: 8px; pointer-events: none; max-height: 400px; overflow: hidden;";
    document.body.appendChild(toastContainer);
  }
}

function ensureWidget() {
  if (!document.body) return;
  if (!document.getElementById("zono-mp-widget")) {
    createFloatingStatusWidget();
  }
}
setInterval(ensureWidget, 2000);

function showToast(message, type = "success") {
  if (!toastContainer) return;
  const toast = document.createElement("div");
  toast.style.cssText = `background: ${type === "success" ? "#059669" : "#dc2626"}; color: white; padding: 10px 16px; border-radius: 10px; font-size: 12px; font-weight: 700; box-shadow: 0 4px 15px rgba(0,0,0,0.25); pointer-events: auto;`;
  toast.innerText = message;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 5000);
}

const knownTxIds = new Set();

function isOutgoingMovement(rawText) {
  const lower = (rawText || "").toLowerCase();
  return (
    lower.includes("-\x20$") ||
    lower.includes("-$") ||
    lower.includes("compra") ||
    lower.includes("recarga") ||
    lower.includes("recargas") ||
    lower.includes("pagaste") ||
    lower.includes("pago de servicio") ||
    lower.includes("factura") ||
    lower.includes("debito") ||
    lower.includes("débito") ||
    lower.includes("transferencia enviada") ||
    lower.includes("enviaste") ||
    lower.includes("retiro") ||
    lower.includes("extraccion") ||
    lower.includes("extracción")
  );
}

async function reportPayment(payment, isManualAction = false) {
  if (isOutgoingMovement(`${payment.title} ${payment.payerName} ${payment.rawText}`)) {
    return;
  }

  if (knownTxIds.has(payment.id) && !isManualAction) {
    return;
  }

  knownTxIds.add(payment.id);
  console.log("[Zono MP Monitor] Transmitiendo cobro entrante:", payment);

  const payload = {
    id: payment.id,
    external_id: payment.id,
    title: payment.title || "Transferencia recibida",
    text: `Recibiste $ ${payment.amount} De ${payment.payerName} desde su cuenta de Mercado Pago.`,
    bigText: payment.rawText || `Recibiste $ ${payment.amount} De ${payment.payerName}`,
    account: config.accountName,
    token: config.secretToken,
    received_at: payment.receivedAt,
    date: payment.receivedAt,
    time: payment.time
  };

  const url = new URL(config.webhookUrl);
  url.searchParams.set("account", config.accountName);
  url.searchParams.set("token", config.secretToken);

  chrome.runtime.sendMessage({
    action: "REPORT_PAYMENT",
    url: url.toString(),
    token: config.secretToken,
    payload: payload,
    paymentSummary: {
      amount: payment.amount,
      payerName: payment.payerName,
      time: payment.time,
      sentAt: payment.receivedAt || new Date().toISOString()
    }
  }, (response) => {
    if (chrome.runtime.lastError) {
      console.error("[Zono MP Monitor] Runtime error:", chrome.runtime.lastError);
      return;
    }

    if (response && response.data?.isDuplicate) {
      console.log("[Zono MP Monitor] Cobro ya estaba en el ERP (omitido):", payment);
      return;
    }

    if (response && (response.ok || response.data?.success)) {
      showToast(`✅ Cobro de $${payment.amount} (${payment.payerName}) ingresado al ERP!`, "success");
    } else {
      console.error("[Zono MP Monitor] Webhook error:", response);
    }
  });
}

// Helper to extract the date section for a given row element
function getRowDate(rowElement) {
  const months = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"
  ];
  const monthsRegex = months.join("|");

  const now = new Date();
  const getArgDate = (d) => d.toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
  const todayStr = getArgDate(now);
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayStr = getArgDate(yesterday);

  // Scan for date header elements in the document
  const candidates = Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6, span, p, div, time, [role='heading']"));
  const headers = [];

  for (const el of candidates) {
    if (el.children.length > 2) continue;
    const txt = (el.innerText || el.textContent || "").replace(/\u00a0/g, " ").trim();
    if (!txt || txt.length > 40) continue;

    const lower = txt.toLowerCase();
    // Exclude if it contains currency, amount, or action words
    if (lower.includes("$") || lower.includes("aprobado") || lower.includes("transferencia") || lower.includes("disponible") || lower.includes("filtr") || lower.includes("buscar") || lower.includes("tu dinero") || lower.includes("actividad")) {
      continue;
    }

    const isToday = lower === "hoy";
    const isYesterday = lower === "ayer" || lower === "antier" || lower === "anteayer";
    const dateMatch = lower.match(new RegExp(`(?:(\\d{1,2})\\s+de\\s+(${monthsRegex})(?:\\s+de\\s+(\\d{4}))?)`));
    const weekdayMatch = lower.match(/^(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)$/);

    if (isToday || isYesterday || dateMatch || weekdayMatch) {
      headers.push({
        el,
        text: txt,
        isToday,
        isYesterday,
        dateMatch,
        weekdayMatch: !!weekdayMatch,
        weekdayStr: weekdayMatch ? lower : null
      });
    }
  }

  // Find the header that immediately precedes this rowElement in document order
  let matchedHeader = null;
  for (const h of headers) {
    try {
      const pos = h.el.compareDocumentPosition(rowElement);
      // Node.DOCUMENT_POSITION_FOLLOWING = 4 means rowElement follows h.el
      if (pos & Node.DOCUMENT_POSITION_FOLLOWING) {
        matchedHeader = h;
      }
    } catch (e) {
      // Ignore comparison errors
    }
  }

  if (!matchedHeader || matchedHeader.isToday) {
    return {
      dateStr: todayStr,
      sectionLabel: "Hoy",
      isToday: true
    };
  }

  if (matchedHeader.isYesterday) {
    return {
      dateStr: yesterdayStr,
      sectionLabel: "Ayer",
      isToday: false
    };
  }

  if (matchedHeader.dateMatch) {
    const day = parseInt(matchedHeader.dateMatch[1], 10);
    const mIdx = months.indexOf(matchedHeader.dateMatch[2]);
    const year = matchedHeader.dateMatch[3] ? parseInt(matchedHeader.dateMatch[3], 10) : now.getFullYear();
    if (mIdx !== -1 && !isNaN(day)) {
      const pad = (n) => String(n).padStart(2, "0");
      const dStr = `${year}-${pad(mIdx + 1)}-${pad(day)}`;
      return {
        dateStr: dStr,
        sectionLabel: matchedHeader.text,
        isToday: dStr === todayStr
      };
    }
  }

  if (matchedHeader.weekdayMatch && matchedHeader.weekdayStr) {
    const daysMap = { domingo: 0, lunes: 1, martes: 2, miercoles: 3, "miércoles": 3, jueves: 4, viernes: 5, sabado: 6, "sábado": 6 };
    const dayNum = daysMap[matchedHeader.weekdayStr];
    if (dayNum !== undefined) {
      const currentDayNum = now.getDay();
      let diff = currentDayNum - dayNum;
      if (diff <= 0) diff += 7;
      const targetDate = new Date(now.getTime() - diff * 24 * 3600 * 1000);
      const dStr = getArgDate(targetDate);
      return {
        dateStr: dStr,
        sectionLabel: matchedHeader.text,
        isToday: dStr === todayStr
      };
    }
  }

  return {
    dateStr: todayStr,
    sectionLabel: "Hoy",
    isToday: true
  };
}

// Helper to extract clean activity item from a DOM row
function parseDOMRow(row) {
  const text = (row.innerText || "").replace(/\u00a0/g, " ").trim();
  if (!text || isOutgoingMovement(text)) return null;

  const lower = text.toLowerCase();
  const isIncoming = lower.includes("transferencia recibida") || lower.includes("recibiste") || lower.includes("+ $") || lower.includes("+$") || text.includes("+");

  if (!isIncoming) return null;

  const amountMatch = text.match(/\+\s*\$\s*([\d\.,]+)/) || text.match(/\$\s*([\d\.,]+)/);
  if (!amountMatch) return null;

  const cleanAmount = parseFloat(amountMatch[1].replace(/\./g, "").replace(",", "."));
  if (isNaN(cleanAmount) || cleanAmount <= 0) return null;

  // Extract unique activity ID if an anchor with numeric ID is present
  const anchor = row.tagName === 'A' ? row : row.querySelector("a[href*='/activit'], a[href*='/movement']");
  const href = anchor ? (anchor.getAttribute("href") || "") : (row.getAttribute("href") || "");
  const idMatch = href.match(/\/(?:activit(?:y|ies)|movement)\/([a-zA-Z0-9_-]+)/);
  const rawId = idMatch ? idMatch[1] : null;
  const isGenericWord = ['detail', 'details', 'item', 'items', 'activity', 'activities', 'movement', 'movements'].includes((rawId || '').toLowerCase());
  const uniqueId = (rawId && !isGenericWord && /\d{4,}/.test(rawId)) ? rawId : null;

  // Detect date section for this row (Hoy, Ayer, or specific date)
  const dateInfo = getRowDate(row);

  // Extract time from the row text reliably with regex
  const timeMatch = text.match(/\b(\d{1,2}:\d{2})\b/);
  const timeStr = timeMatch ? timeMatch[1] : "";

  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  let payer = "Cliente";
  for (const l of lines) {
    const lLower = l.toLowerCase();
    const isTime = /\b\d{1,2}:\d{2}\b/.test(l);
    const isAmount = l.includes("$");
    const isKeyword = lLower.includes("aprobado") || lLower.includes("transferencia") || lLower.includes("recibiste") || lLower.includes("hoy") || lLower.includes("ayer") || lLower.includes("dinero disponible") || lLower.includes("en tu cuenta") || lLower.includes("compra");

    if (!isTime && !isAmount && !isKeyword && l.length >= 3 && l.length <= 60) {
      payer = l;
      break;
    }
  }

  // Construct exact ISO timestamp in Argentina timezone (UTC-3) for the row's real date
  let receivedAt = `${dateInfo.dateStr}T12:00:00-03:00`;
  if (timeStr) {
    const [hh, mm] = timeStr.split(":");
    receivedAt = `${dateInfo.dateStr}T${hh.padStart(2, "0")}:${mm.padStart(2, "0")}:00-03:00`;
  }

  // Deterministic ID including date so transactions at same time on different days NEVER collide
  const dateNum = dateInfo.dateStr.replace(/-/g, "");
  const cleanPayer = payer.toLowerCase().replace(/[^a-z0-9]/g, "_").slice(0, 20);
  const txId = uniqueId || `mp_dom_${cleanAmount}_${cleanPayer}_${dateNum}_${timeStr.replace(":", "")}`;

  return {
    id: txId,
    title: "Transferencia recibida",
    payerName: payer,
    amount: cleanAmount,
    time: timeStr,
    receivedAt: receivedAt,
    date: dateInfo.dateStr,
    isToday: dateInfo.isToday,
    sectionLabel: dateInfo.sectionLabel,
    rawText: text
  };
}

// 2. DOM Scraper - Strictly scans ONLY top visible activities on screen (NO scrolling, NO pagination)
function getVisibleRows() {
  const timeRegex = /\b\d{1,2}:\d{2}\b/;
  const rows = [];
  const seenSignatures = new Set();

  // Strategy: Find leaf labels of "Transferencia recibida" or "Recibiste" and traverse up to the row container
  const allNodes = Array.from(document.body.querySelectorAll("*"));
  const transferLabels = allNodes.filter(el => {
    if (el.children.length > 2) return false;
    const txt = (el.innerText || el.textContent || "").replace(/\u00a0/g, " ").trim().toLowerCase();
    return txt === "transferencia recibida" || txt === "transferencia";
  });

  for (const label of transferLabels) {
    let parent = label.parentElement;
    let foundContainer = null;
    let depth = 0;

    // Walk up until we find the container having time and $ amount
    while (parent && parent !== document.body && depth < 10) {
      const pText = (parent.innerText || "").replace(/\u00a0/g, " ").trim();
      if (pText.includes("$") && timeRegex.test(pText) && pText.length < 400) {
        foundContainer = parent;
        break;
      }
      parent = parent.parentElement;
      depth++;
    }

    if (foundContainer) {
      const pText = (foundContainer.innerText || "").replace(/\u00a0/g, " ").trim();
      const timeMatch = pText.match(/\b(\d{1,2}:\d{2})\b/);
      const amountMatch = pText.match(/\+\s*\$\s*([\d\.,]+)/) || pText.match(/\$\s*([\d\.,]+)/);
      if (timeMatch && amountMatch) {
        const dateInfo = getRowDate(foundContainer);
        const sig = `${dateInfo.dateStr}_${amountMatch[1]}_${timeMatch[1]}`;
        if (!seenSignatures.has(sig)) {
          seenSignatures.add(sig);
          rows.push(foundContainer);
        }
      }
    }
  }

  // Fallback: If above didn't find rows, search for any element containing both $ and time
  if (rows.length === 0) {
    for (const el of allNodes) {
      const t = (el.innerText || "").replace(/\u00a0/g, " ").trim();
      if (t.includes("$") && timeRegex.test(t) && t.length >= 20 && t.length <= 350) {
        const lower = t.toLowerCase();
        if (lower.includes("transferencia") || lower.includes("aprobado") || lower.includes("recibiste")) {
          const timeMatch = t.match(/\b(\d{1,2}:\d{2})\b/);
          const amountMatch = t.match(/\+\s*\$\s*([\d\.,]+)/) || t.match(/\$\s*([\d\.,]+)/);
          if (timeMatch && amountMatch) {
            const dateInfo = getRowDate(el);
            const sig = `${dateInfo.dateStr}_${amountMatch[1]}_${timeMatch[1]}`;
            if (!seenSignatures.has(sig)) {
              seenSignatures.add(sig);
              rows.push(el);
            }
          }
        }
      }
    }
  }

  console.log(`[Zono MP Monitor] Filas de transferencias detectadas: ${rows.length}`);
  return rows.slice(0, 15);
}

function scanDOMActivities() {
  const topRows = getVisibleRows();
  topRows.forEach(row => {
    const parsed = parseDOMRow(row);
    // In AUTO mode, only process rows that belong to "Hoy" (never auto-process yesterday or past days)
    if (parsed && parsed.isToday) {
      reportPayment(parsed, false);
    }
  });
}

// Manual Action: user clicks "Sincronizar visibles"
function manualSyncVisibleActivities() {
  const topRows = getVisibleRows();
  let count = 0;

  topRows.forEach(row => {
    const parsed = parseDOMRow(row);
    if (parsed) {
      reportPayment(parsed, true);
      count++;
    }
  });

  if (count === 0) {
    showToast(`⚠️ Se encontraron ${topRows.length} filas pero 0 cobros entrantes`, "error");
  } else {
    showToast(`📥 Sincronización: ${count} cobros enviados al ERP!`, "success");
  }
}

function triggerActualizarListado() {
  const buttons = Array.from(document.querySelectorAll("button, a, [role='button']"));
  const refreshBtn = buttons.find(b => {
    const txt = (b.innerText || b.textContent || "").trim().toLowerCase();
    return txt.includes("actualizar listado") || txt === "actualizar";
  });

  if (refreshBtn) {
    console.log("[Zono MP Monitor] Auto-click en 'Actualizar listado'...");
    refreshBtn.click();
    setTimeout(scanDOMActivities, 1500);
    return true;
  } else {
    scanDOMActivities();
    return false;
  }
}

function startMonitoring() {
  let lastRefreshTime = Date.now();

  function checkRefresh() {
    if (!config.autoRefresh) return;

    const now = Date.now();
    const elapsedSeconds = (now - lastRefreshTime) / 1000;
    const remaining = Math.max(0, Math.ceil(config.pollInterval - elapsedSeconds));

    const countdownEl = document.getElementById("zono-countdown");
    if (countdownEl) {
      countdownEl.innerText = `${remaining}s`;
    }

    if (elapsedSeconds >= config.pollInterval) {
      lastRefreshTime = now;
      if (window.location.href.includes("mercadopago.com.ar/activities") || window.location.href.includes("mercadopago.com.ar/home")) {
        triggerActualizarListado();
      }
    }
  }

  // First scan after 1.5 seconds
  setTimeout(() => {
    scanDOMActivities();
    isInitialized = true;
    console.log("[Zono MP Monitor] Monitor activado.");
    showToast(`🟢 Monitor iniciado: monitoreando cobros entrantes`, "success");
  }, 1500);

  // Fast interval scan
  setInterval(scanDOMActivities, 3000);
  setInterval(checkRefresh, 1000);

  // Listen to background service worker wakeup pulse (bypasses browser tab throttling!)
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === "TRIGGER_POLL") {
      checkRefresh();
      scanDOMActivities();
    }
  });

  // Instant refresh when user switches to or focuses the tab
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      checkRefresh();
      scanDOMActivities();
    }
  });

  window.addEventListener("focus", () => {
    checkRefresh();
    scanDOMActivities();
  });

  // DOM MutationObserver to detect when Mercado Pago injects new activities immediately
  try {
    const observer = new MutationObserver(() => {
      scanDOMActivities();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  } catch (e) {
    console.warn("[Zono MP Monitor] Observer error:", e);
  }
}

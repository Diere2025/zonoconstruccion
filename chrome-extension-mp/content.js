// content.js - DOM Processor for Mercado Pago Web
console.log("[Zono MP Monitor] Content script initialized on", window.location.href);

// Config defaults
let config = {
  webhookUrl: "https://zono-erp.pages.dev/api/mp-webhook",
  secretToken: "mpchecker_secret_key_123",
  accountName: "pagoszono.26",
  // Office hours / schedule configuration
  workInterval: 60,              // Segundos en horario laboral (60s = 1 minuto)
  offInterval: 600,              // Segundos fuera de horario laboral (600s = 10 minutos)
  workStart: "06:00",            // Hora inicio oficina (06:00 am)
  workEnd: "21:00",              // Hora fin oficina (21:00 hs)
  workDays: [1, 2, 3, 4, 5, 6],  // 1=Lunes a 6=Sábado
  autoRefresh: true
};

let isConnectedToErp = true;

function isWorkHours() {
  try {
    const now = new Date();
    // Format in Argentina timezone
    const argTimeStr = now.toLocaleTimeString("en-GB", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", minute: "2-digit" });
    const [hh, mm] = argTimeStr.split(":").map(Number);
    const currentMinutes = hh * 60 + mm;

    const argDate = new Date(now.toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
    const dayOfWeek = argDate.getDay(); // 0 = Domingo, 1 = Lunes, ..., 6 = Sábado

    const days = config.workDays || [1, 2, 3, 4, 5, 6];
    if (!days.includes(dayOfWeek)) {
      return false;
    }

    const [startH, startM] = (config.workStart || "06:00").split(":").map(Number);
    const [endH, endM] = (config.workEnd || "21:00").split(":").map(Number);
    const startMin = startH * 60 + startM;
    const endMin = endH * 60 + endM;

    return currentMinutes >= startMin && currentMinutes <= endMin;
  } catch (e) {
    return true;
  }
}

function getActiveInterval() {
  return isWorkHours()
    ? Math.max(8, Number(config.workInterval) || 60)
    : Math.max(30, Number(config.offInterval) || 600);
}

function formatCountdown(sec) {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s > 0 ? s + 's' : ''}`;
}

let isInitialized = false;

// Load saved config
chrome.storage.local.get(
  ["webhookUrl", "secretToken", "accountName", "workInterval", "offInterval", "workStart", "workEnd", "workDays", "autoRefresh", "pollInterval"],
  (res) => {
    if (res.webhookUrl) config.webhookUrl = res.webhookUrl;
    if (res.secretToken) config.secretToken = res.secretToken;
    if (res.accountName) config.accountName = res.accountName;
    if (res.workInterval) config.workInterval = Math.max(8, Number(res.workInterval));
    else if (res.pollInterval) config.workInterval = Math.max(8, Number(res.pollInterval));
    if (res.offInterval) config.offInterval = Math.max(30, Number(res.offInterval));
    if (res.workStart) config.workStart = res.workStart;
    if (res.workEnd) config.workEnd = res.workEnd;
    if (res.workDays) config.workDays = res.workDays;
    if (res.autoRefresh !== undefined) config.autoRefresh = res.autoRefresh;

    console.log("[Zono MP Monitor] Active config:", config);
    createFloatingStatusWidget();
    startMonitoring();
  }
);

let toastContainer = null;
function createFloatingStatusWidget() {
  if (document.getElementById("zono-mp-widget") || !document.body) return;
  
  const inOffice = isWorkHours();
  const widget = document.createElement("div");
  widget.id = "zono-mp-widget";
  widget.style.cssText = "position: fixed; bottom: 20px; right: 20px; z-index: 2147483647; background: #001538; color: white; padding: 12px 18px; border-radius: 14px; box-shadow: 0 6px 25px rgba(0,0,0,0.5); font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif; font-size: 13px; display: flex; align-items: center; gap: 12px; border: 2px solid " + (isConnectedToErp ? "#0069ff" : "#ef4444") + "; user-select: none;";
  widget.innerHTML = `
    <span id="zono-status-dot" style="width: 10px; height: 10px; border-radius: 50%; background: ${isConnectedToErp ? '#10b981' : '#ef4444'}; display: inline-block; box-shadow: 0 0 10px ${isConnectedToErp ? '#10b981' : '#ef4444'};"></span>
    <div>
      <div style="display: flex; align-items: center; gap: 6px;">
        <span style="font-weight: 800; font-size: 12px; letter-spacing: 0.5px; color: #38bdf8;">ZONO ERP AUTO-SYNC</span>
        <span id="zono-clock" style="font-size: 10px; font-weight: 700; color: #cbd5e1; background: #0f172a; border: 1px solid #334155; padding: 1px 6px; border-radius: 4px;" title="Hora detectada por la extensión (Argentina)">🕒 --:--:--</span>
        <span id="zono-schedule-badge" style="font-size: 9px; font-weight: 700; padding: 1px 6px; border-radius: 4px; background: ${inOffice ? '#064e3b' : '#312e81'}; color: ${inOffice ? '#34d399' : '#a5b4fc'}; border: 1px solid ${inOffice ? '#059669' : '#4338ca'};">
          ${inOffice ? '🟢 OFICINA (' + config.workStart + '-' + config.workEnd + ')' : '🌙 FUERA DE HORARIO'}
        </span>
      </div>
      <div style="font-size: 11px; color: #94a3b8; display: flex; align-items: center; gap: 6px; margin-top: 2px;" id="zono-mp-status-text">
        <span>Próximo refresco: <b id="zono-countdown" style="color: #34d399;">${formatCountdown(getActiveInterval())}</b></span>
        <select id="zono-quick-account" style="background: #0f172a; color: #38bdf8; border: 1px solid #334155; border-radius: 6px; font-size: 11px; font-weight: 700; padding: 2px 6px; outline: none; cursor: pointer;">
          <option value="pagoszono.26" ${config.accountName === "pagoszono.26" ? "selected" : ""}>pagoszono.26</option>
          <option value="diegozono.mp" ${config.accountName === "diegozono.mp" ? "selected" : ""}>diegozono.mp</option>
        </select>
      </div>
    </div>
    <button id="zono-force-refresh" title="Presionar Actualizar listado ahora" style="background: #0069ff; color: white; border: none; border-radius: 8px; padding: 6px 11px; font-size: 11px; font-weight: 700; cursor: pointer; margin-left: 4px;">Actualizar ya</button>
    <button id="zono-manual-sync-history" title="Importar pagos visibles en pantalla manualmente" style="background: #1e293b; color: #38bdf8; border: 1px solid #3b82f6; border-radius: 8px; padding: 6px 9px; font-size: 10px; font-weight: 700; cursor: pointer;">📥 Sincronizar visibles</button>
  `;
  document.body.appendChild(widget);

  document.getElementById("zono-quick-account")?.addEventListener("change", (e) => {
    const newAcc = e.target.value;
    config.accountName = newAcc;
    chrome.storage.local.set({ accountName: newAcc }, () => {
      showToast(`Cuenta configurada: ${newAcc}`, "success");
      sendHeartbeat();
    });
  });

  document.getElementById("zono-force-refresh")?.addEventListener("click", () => {
    triggerActualizarListado();
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

  // Extract row text to check if row time is in the future relative to current Argentina time
  const rowText = (rowElement.innerText || "").replace(/\u00a0/g, " ").trim();
  const timeMatch = rowText.match(/\b(\d{1,2}:\d{2})\b/);
  const timeStr = timeMatch ? timeMatch[1] : "";

  let isFutureTime = false;
  if (timeStr) {
    try {
      const argTimeStr = now.toLocaleTimeString("en-GB", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", minute: "2-digit" });
      const [nowH, nowM] = argTimeStr.split(":").map(Number);
      const [txH, txM] = timeStr.split(":").map(Number);
      const nowMinutes = nowH * 60 + nowM;
      const txMinutes = txH * 60 + txM;
      // If the transaction time is more than 5 minutes ahead of current Argentina clock, it CANNOT be today!
      if (txMinutes > nowMinutes + 5) {
        isFutureTime = true;
      }
    } catch (e) {
      console.warn("[Zono MP Monitor] Error checking time comparison:", e);
    }
  }

  // Scan for date header elements in the document
  const candidates = Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6, span, p, div, time, [role='heading']"));
  const headers = [];

  for (const el of candidates) {
    // Skip if inside navigation, search bars, or filter dropdowns
    if (el.closest("nav, header, aside, [role='navigation'], [role='combobox'], [data-testid*='filter'], .andes-dropdown, .andes-filter, .andes-tab")) {
      continue;
    }
    if (el.children.length > 3) continue;
    const txt = (el.innerText || el.textContent || "").replace(/\u00a0/g, " ").trim();
    if (!txt || txt.length > 40) continue;

    const lower = txt.toLowerCase();
    // Exclude if it contains currency, amount, or action words
    if (lower.includes("$") || lower.includes("aprobado") || lower.includes("transferencia") || lower.includes("disponible") || lower.includes("filtr") || lower.includes("buscar") || lower.includes("tu dinero") || lower.includes("actividad") || lower.includes("resumen")) {
      continue;
    }

    const isToday = lower === "hoy" || lower.startsWith("hoy ") || lower.startsWith("hoy·") || lower.startsWith("hoy,") || lower.startsWith("hoy -");
    const isYesterday = lower === "ayer" || lower.startsWith("ayer ") || lower.startsWith("ayer·") || lower.startsWith("ayer,") || lower.startsWith("ayer -") || lower.includes("ayer") || lower === "antier" || lower === "anteayer";
    const dateMatch = lower.match(new RegExp(`(?:(\\d{1,2})\\s+de\\s+(${monthsRegex})(?:\\s+de\\s+(\\d{4}))?)`));
    const weekdayMatch = lower.match(/(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)/);

    if (isToday || isYesterday || dateMatch || weekdayMatch) {
      headers.push({
        el,
        text: txt,
        isToday,
        isYesterday,
        dateMatch,
        weekdayMatch: !isToday && !isYesterday && !dateMatch && !!weekdayMatch,
        weekdayStr: weekdayMatch ? weekdayMatch[0] : null
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

  // Safeguard: If the row's time is in the future, it cannot be from today
  if (isFutureTime) {
    return {
      dateStr: yesterdayStr,
      sectionLabel: "Ayer",
      isToday: false
    };
  }

  if (matchedHeader) {
    if (matchedHeader.isToday) {
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
// 2. DOM Scraper - Strictly scans ONLY top visible activities on screen (NO scrolling, NO pagination)
function getVisibleRows() {
  if (!isActivitiesPage()) return [];

  const timeRegex = /\b\d{1,2}:\d{2}\b/;
  const rows = [];
  const seenSignatures = new Set();

  const container = document.querySelector("main, [role='main'], [data-testid*='activities']") || document.body;
  const candidates = Array.from(container.querySelectorAll("a, li, tr, [role='listitem'], div"));

  for (const el of candidates) {
    if (el.children.length > 6) continue;
    const txt = (el.textContent || "").toLowerCase();
    if (txt.includes("transferencia recibida") || txt.includes("recibiste")) {
      let parent = el;
      let depth = 0;
      while (parent && parent !== container && depth < 6) {
        const pText = (parent.innerText || "").replace(/\u00a0/g, " ").trim();
        if (pText.includes("$") && timeRegex.test(pText) && pText.length < 350) {
          const timeMatch = pText.match(/\b(\d{1,2}:\d{2})\b/);
          const amountMatch = pText.match(/\+\s*\$\s*([\d\.,]+)/) || pText.match(/\$\s*([\d\.,]+)/);
          if (timeMatch && amountMatch) {
            const dateInfo = getRowDate(parent);
            const sig = `${dateInfo.dateStr}_${amountMatch[1]}_${timeMatch[1]}`;
            if (!seenSignatures.has(sig)) {
              seenSignatures.add(sig);
              rows.push(parent);
            }
          }
          break;
        }
        parent = parent.parentElement;
        depth++;
      }
    }
  }

  return rows.slice(0, 15);
}

function scanDOMActivities() {
  if (!isActivitiesPage()) return;
  const err = detectMercadoPagoError();
  if (err.hasError) return;

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

// Audio alert beep with browser autoplay policy handling
let audioCtx = null;
function initAudioOnUserGesture() {
  if (audioCtx) return;
  try {
    const AudioClass = window.AudioContext || window.webkitAudioContext;
    if (AudioClass) {
      audioCtx = new AudioClass();
    }
  } catch (e) {}
}
window.addEventListener("click", initAudioOnUserGesture, { once: true });
window.addEventListener("keydown", initAudioOnUserGesture, { once: true });

function playAlertBeep() {
  try {
    if (!audioCtx) {
      const AudioClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioClass) return;
      audioCtx = new AudioClass();
    }
    if (audioCtx.state === "suspended") {
      audioCtx.resume().catch(() => {});
    }
    if (audioCtx.state !== "running") return;

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(880, audioCtx.currentTime);
    osc.frequency.setValueAtTime(587.33, audioCtx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.25, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.4);
  } catch (e) {}
}

// 1. Check if the tab is on the principal activities page
function isActivitiesPage() {
  const path = window.location.pathname.toLowerCase();
  return path.startsWith("/activities") || path.startsWith("/movement");
}

// 2. Check if Mercado Pago crashed or is displaying an error screen (ultra-fast selector check)
function detectMercadoPagoError() {
  const headings = document.querySelectorAll("h1, h2, h3, h4, [role='heading'], .ui-empty-state");
  for (let i = 0; i < headings.length; i++) {
    const txt = (headings[i].textContent || "").toLowerCase();
    if (
      txt.includes("no fue posible cargar") ||
      txt.includes("ya estamos trabajando en ello") ||
      txt.includes("intenta de nuevo en unos minutos") ||
      txt.includes("algo salió mal")
    ) {
      const retryBtn = Array.from(document.querySelectorAll("button, a")).find(b => {
        const t = (b.textContent || "").trim().toLowerCase();
        return t === "reintentar" || t === "volver a intentar" || t === "intentar de nuevo";
      });
      return {
        hasError: true,
        retryBtn: retryBtn || null,
        message: "No fue posible cargar la información"
      };
    }
  }

  return { hasError: false };
}

let isWrongPageActive = false;
let wrongPageSeconds = 0;
let wrongPageAlertSent = false;

function handleWrongPage() {
  wrongPageSeconds++;
  setConnectionStatus(false);

  // If outside /activities for 8 seconds, send alert and show redirect button
  if (wrongPageSeconds >= 8) {
    if (!wrongPageAlertSent) {
      wrongPageAlertSent = true;
      playAlertBeep();
      sendPageAlert(
        "WRONG_PAGE",
        `La ventana se encuentra fuera de Actividades (en: "${window.location.pathname}"). El monitor no puede registrar cobros aquí.`,
        "⚠️ ALERTA: Monitor MP fuera de Actividades"
      );
    }

    if (!isWrongPageActive) {
      isWrongPageActive = true;
      const widget = document.getElementById("zono-mp-widget");
      if (widget) {
        widget.style.borderColor = "#ef4444";
        widget.style.background = "#450a0a";
      }
      const statusText = document.getElementById("zono-mp-status-text");
      if (statusText) {
        statusText.innerHTML = `
          <div style="color: #fca5a5; font-size: 11px; font-weight: 800; margin-top: 2px;">
            ⚠️ Fuera de Actividades (${window.location.pathname})
          </div>
          <button id="zono-redirect-btn" style="background: #0069ff; color: white; border: none; border-radius: 4px; padding: 2px 7px; font-size: 10px; font-weight: bold; cursor: pointer; margin-top: 2px;">Ir a Actividades</button>
        `;
        document.getElementById("zono-redirect-btn")?.addEventListener("click", () => {
          window.location.href = "https://www.mercadopago.com.ar/activities";
        });
      }
    }
  }
}

let errorAlertSent = false;
let isReloadingDueToError = false;

function handleMercadoPagoError(errCheck) {
  setConnectionStatus(false);

  const widget = document.getElementById("zono-mp-widget");
  const statusText = document.getElementById("zono-mp-status-text");
  if (widget) {
    widget.style.borderColor = "#ef4444";
    widget.style.background = "#450a0a";
  }
  if (statusText) {
    statusText.innerHTML = `
      <div style="color: #fca5a5; font-size: 11px; font-weight: 800; margin-top: 2px;">
        🔴 ERROR MERCADO PAGO: No cargó la información
      </div>
      <div style="font-size: 11px; color: #fecaca; margin-top: 2px;">
        Refrescando la hoja completa en 3 segundos...
      </div>
    `;
  }

  if (errCheck?.retryBtn) {
    try {
      errCheck.retryBtn.click();
    } catch (e) {}
  }

  if (!errorAlertSent) {
    errorAlertSent = true;
    playAlertBeep();
    sendPageAlert(
      "PAGE_CRASH",
      "Mercado Pago se colgó con el mensaje: 'No fue posible cargar la información'. Refrescando hoja completa...",
      "🚨 ALERTA: Mercado Pago no cargó la información"
    );
  }

  if (!isReloadingDueToError) {
    isReloadingDueToError = true;
    setTimeout(() => {
      console.log("[Zono MP Monitor] Recargando hoja completa por pantalla de error...");
      window.location.reload();
    }, 3000);
  }
}

function sendPageAlert(errorType, message, alertTitle) {
  const now = new Date();
  const clientTime = now.toLocaleTimeString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });

  const payload = {
    type: "ALERT_PAGE_ERROR",
    account: config.accountName,
    errorType: errorType,
    message: message,
    url: window.location.href,
    clientTime: clientTime,
    timestamp: now.toISOString()
  };

  const url = new URL(config.webhookUrl);
  url.searchParams.set("account", config.accountName);
  url.searchParams.set("token", config.secretToken);

  chrome.runtime.sendMessage({
    action: "SEND_ALERT",
    url: url.toString(),
    token: config.secretToken,
    payload: payload,
    alertTitle: alertTitle,
    alertMessage: message
  }, (res) => {
    console.log("[Zono MP Monitor] Respuesta de alerta en ERP:", res);
  });
}

let consecutiveFailedRefreshes = 0;

function triggerActualizarListado() {
  if (!isActivitiesPage()) {
    handleWrongPage();
    return false;
  }

  const errCheck = detectMercadoPagoError();
  if (errCheck.hasError) {
    handleMercadoPagoError(errCheck);
    return false;
  }

  const buttons = Array.from(document.querySelectorAll("button, a, [role='button']"));
  const refreshBtn = buttons.find(b => {
    const txt = (b.innerText || b.textContent || "").trim().toLowerCase();
    return txt.includes("actualizar listado") || txt === "actualizar";
  });

  if (refreshBtn) {
    consecutiveFailedRefreshes = 0;
    console.log("[Zono MP Monitor] Auto-click en 'Actualizar listado'...");
    refreshBtn.click();
    setTimeout(scanDOMActivities, 1500);
    return true;
  } else {
    // Check if rows are present
    const rows = getVisibleRows();
    if (rows.length > 0) {
      consecutiveFailedRefreshes = 0;
      scanDOMActivities();
      return true;
    }

    consecutiveFailedRefreshes++;
    console.warn(`[Zono MP Monitor] Sin botón de refresco ni filas visibles (intento fallido ${consecutiveFailedRefreshes})`);

    // If for 2 consecutive cycles nothing is found, reload entire page
    if (consecutiveFailedRefreshes >= 2) {
      console.log("[Zono MP Monitor] Refrescando hoja completa por desincronización...");
      showToast("🔄 Refrescando hoja completa...", "success");
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } else {
      scanDOMActivities();
    }
    return false;
  }
}

function setConnectionStatus(isOnline) {
  isConnectedToErp = isOnline;
  const dot = document.getElementById("zono-status-dot");
  const widget = document.getElementById("zono-mp-widget");
  if (dot) {
    dot.style.background = isOnline ? "#10b981" : "#ef4444";
    dot.style.boxShadow = isOnline ? "0 0 10px #10b981" : "0 0 10px #ef4444";
  }
  if (widget) {
    widget.style.borderColor = isOnline ? "#0069ff" : "#ef4444";
    if (isOnline) {
      widget.style.background = "#001538";
    }
  }
}

function sendHeartbeat() {
  // 1. DO NOT send heartbeat if not on activities page!
  if (!isActivitiesPage()) {
    console.warn("[Zono MP Monitor] No se envía heartbeat: fuera de /activities");
    handleWrongPage();
    return;
  }

  // 2. DO NOT send heartbeat if Mercado Pago crashed!
  const errCheck = detectMercadoPagoError();
  if (errCheck.hasError) {
    console.warn("[Zono MP Monitor] No se envía heartbeat: pantalla de error activa");
    handleMercadoPagoError(errCheck);
    return;
  }

  // Healthy heartbeat
  const inOffice = isWorkHours();
  const interval = getActiveInterval();
  const now = new Date();
  const clientTime = now.toLocaleTimeString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });

  const payload = {
    type: "HEARTBEAT",
    account: config.accountName,
    isWorkHours: inOffice,
    currentInterval: interval,
    version: "1.3.0",
    clientTime: clientTime,
    url: window.location.href,
    timestamp: now.toISOString()
  };

  const url = new URL(config.webhookUrl);
  url.searchParams.set("account", config.accountName);
  url.searchParams.set("token", config.secretToken);

  chrome.runtime.sendMessage({
    action: "SEND_HEARTBEAT",
    url: url.toString(),
    token: config.secretToken,
    payload: payload
  }, (response) => {
    if (chrome.runtime.lastError || !response || !response.ok) {
      console.warn("[Zono MP Monitor] Fallo de heartbeat:", chrome.runtime.lastError || response);
      setConnectionStatus(false);
    } else {
      setConnectionStatus(true);
    }
  });
}

// Periodic full page reload every 25 minutes during office hours to prevent SPA memory leak and session freeze
const PAGE_LOAD_TIME = Date.now();
const FULL_RELOAD_INTERVAL_MS = 25 * 60 * 1000;

function startMonitoring() {
  let lastRefreshTime = Date.now();

  function checkRefresh() {
    const now = new Date();
    const clientTime = now.toLocaleTimeString("es-AR", {
      timeZone: "America/Argentina/Buenos_Aires",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    });

    const clockEl = document.getElementById("zono-clock");
    if (clockEl) {
      clockEl.innerText = `🕒 ${clientTime} hs`;
    }

    // 1. Immediate Page Validity Check
    if (!isActivitiesPage()) {
      handleWrongPage();
      return;
    }

    // If on activities and healthy, reset wrong-page state if it was set
    if (isWrongPageActive) {
      isWrongPageActive = false;
      wrongPageSeconds = 0;
      wrongPageAlertSent = false;
      const widget = document.getElementById("zono-mp-widget");
      if (widget) {
        widget.style.borderColor = "#0069ff";
        widget.style.background = "#001538";
      }
      const statusText = document.getElementById("zono-mp-status-text");
      if (statusText) {
        statusText.innerHTML = `
          <span>Próximo refresco: <b id="zono-countdown" style="color: #34d399;">${formatCountdown(getActiveInterval())}</b></span>
          <select id="zono-quick-account" style="background: #0f172a; color: #38bdf8; border: 1px solid #334155; border-radius: 6px; font-size: 11px; font-weight: 700; padding: 2px 6px; outline: none; cursor: pointer;">
            <option value="pagoszono.26" ${config.accountName === "pagoszono.26" ? "selected" : ""}>pagoszono.26</option>
            <option value="diegozono.mp" ${config.accountName === "diegozono.mp" ? "selected" : ""}>diegozono.mp</option>
          </select>
        `;
        document.getElementById("zono-quick-account")?.addEventListener("change", (e) => {
          const newAcc = e.target.value;
          config.accountName = newAcc;
          chrome.storage.local.set({ accountName: newAcc }, () => {
            showToast(`Cuenta configurada: ${newAcc}`, "success");
            sendHeartbeat();
          });
        });
      }
    }

    // 2. Immediate Error Screen Check
    const errCheck = detectMercadoPagoError();
    if (errCheck.hasError) {
      handleMercadoPagoError(errCheck);
      return;
    }

    // 3. Periodic preventive full reload
    if (isWorkHours() && Date.now() - PAGE_LOAD_TIME >= FULL_RELOAD_INTERVAL_MS) {
      console.log("[Zono MP Monitor] Recarga preventiva periódica (25 min)...");
      window.location.reload();
      return;
    }

    if (!config.autoRefresh) return;

    const inOffice = isWorkHours();
    const currentInterval = getActiveInterval();
    const nowMs = now.getTime();
    const elapsedSeconds = (nowMs - lastRefreshTime) / 1000;
    const remaining = Math.max(0, Math.ceil(currentInterval - elapsedSeconds));

    const countdownEl = document.getElementById("zono-countdown");
    if (countdownEl) {
      countdownEl.innerText = formatCountdown(remaining);
    }

    const badgeEl = document.getElementById("zono-schedule-badge");
    if (badgeEl) {
      badgeEl.innerText = inOffice ? `🟢 OFICINA (${config.workStart}-${config.workEnd})` : "🌙 FUERA DE HORARIO";
      badgeEl.style.background = inOffice ? "#064e3b" : "#312e81";
      badgeEl.style.color = inOffice ? "#34d399" : "#a5b4fc";
      badgeEl.style.borderColor = inOffice ? "#059669" : "#4338ca";
    }

    if (elapsedSeconds >= currentInterval) {
      lastRefreshTime = nowMs;
      triggerActualizarListado();
      sendHeartbeat();
    }
  }

  // First scan after 1.5 seconds
  setTimeout(() => {
    if (isActivitiesPage() && !detectMercadoPagoError().hasError) {
      scanDOMActivities();
      sendHeartbeat();
      isInitialized = true;
      console.log("[Zono MP Monitor] Monitor activado en /activities.");
      showToast(`🟢 Monitor iniciado: monitoreando cobros entrantes`, "success");
    } else {
      checkRefresh();
    }
  }, 1500);

  // Fast interval scan for visible items
  setInterval(scanDOMActivities, 3000);
  setInterval(checkRefresh, 1000);

  // Dynamic heartbeat keeper: every 45s during office hours, every 5 min outside office
  let lastHbTimestamp = Date.now();
  setInterval(() => {
    const inOffice = isWorkHours();
    const intervalMs = inOffice ? 45000 : 300000;
    if (Date.now() - lastHbTimestamp >= intervalMs) {
      lastHbTimestamp = Date.now();
      sendHeartbeat();
    }
  }, 10000);

  // Listen to background service worker wakeup pulse
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
      sendHeartbeat();
    }
  });

  window.addEventListener("focus", () => {
    checkRefresh();
    scanDOMActivities();
    sendHeartbeat();
  });
}

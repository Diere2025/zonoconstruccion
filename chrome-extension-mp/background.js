// background.js - Service worker with full CORS bypass
chrome.runtime.onInstalled.addListener(() => {
  console.log("[Zono MP Monitor] Extension installed successfully");
  setupAlarms();
});

chrome.runtime.onStartup.addListener(() => {
  setupAlarms();
});

function isActivitiesTab(tab) {
  try {
    const url = new URL(tab?.url || "");
    return url.hostname === "mercadopago.com.ar" || url.hostname.endsWith(".mercadopago.com.ar")
      ? url.pathname.startsWith("/activities")
      : false;
  } catch {
    return false;
  }
}

const WRONG_PAGE_ALARM = "WRONG_PAGE_CHECK";
let wrongPageTimer;

function scheduleWrongPageCheck() {
  clearTimeout(wrongPageTimer);
  wrongPageTimer = setTimeout(checkMonitorPage, 8000);
  // Service workers may sleep before a timer fires. The alarm is a durable fallback.
  chrome.alarms.create(WRONG_PAGE_ALARM, { delayInMinutes: 0.5 });
}

function clearWrongPageCheck() {
  clearTimeout(wrongPageTimer);
  chrome.alarms.clear(WRONG_PAGE_ALARM);
  chrome.storage.local.remove("wrongPageAlertedTabId");
}

async function checkMonitorPage() {
  const { monitorTabId, wrongPageAlertedTabId, webhookUrl, secretToken, accountName } =
    await chrome.storage.local.get(["monitorTabId", "wrongPageAlertedTabId", "webhookUrl", "secretToken", "accountName"]);
  if (!monitorTabId || wrongPageAlertedTabId === monitorTabId) return;
  const tab = await new Promise(resolve => chrome.tabs.get(monitorTabId, found =>
    resolve(chrome.runtime.lastError ? null : found)));
  if (tab && (isActivitiesTab(tab) || tab.status === "loading")) return;

  const token = secretToken || "mpchecker_secret_key_123";
  const url = new URL(webhookUrl || "https://zono-erp.pages.dev/api/mp-webhook");
  const account = accountName || "pagoszono.26";
  url.searchParams.set("account", account);
  url.searchParams.set("token", token);
  const payload = {
    type: "ALERT_PAGE_ERROR",
    errorType: "WRONG_PAGE",
    account,
    message: tab
      ? "La pestaña monitor salió de Actividades. El monitor no puede registrar cobros aquí."
      : "La pestaña monitor se cerró. El monitor no puede registrar cobros hasta que se abra Actividades.",
    url: tab?.url || "",
    timestamp: new Date().toISOString()
  };
  try {
    const response = await fetch(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-webhook-token": token },
      body: JSON.stringify(payload)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.success !== true) throw new Error(result.error || `HTTP ${response.status}`);
    await chrome.storage.local.set({ wrongPageAlertedTabId: monitorTabId });
    chrome.notifications.create("ZONO_PAGE_ALERT_" + Date.now(), {
      type: "basic",
      iconUrl: chrome.runtime.getURL("icon.png"),
      title: "⚠️ ALERTA: Monitor MP fuera de Actividades",
      message: payload.message,
      priority: 2
    });
  } catch (error) {
    console.warn("[Zono MP Monitor] No se pudo enviar la alerta de navegación:", error);
    chrome.alarms.create(WRONG_PAGE_ALARM, { delayInMinutes: 0.5 });
  }
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!changeInfo.url && changeInfo.status !== "complete") return;
  chrome.storage.local.get(["monitorTabId"], ({ monitorTabId }) => {
    if (tabId !== monitorTabId) return;
    if (isActivitiesTab(tab)) clearWrongPageCheck();
    else scheduleWrongPageCheck();
  });
});

function saveMonitorTab(nextTabId, previousTabId, sendResponse) {
  chrome.storage.local.set({ monitorTabId: nextTabId }, () => {
    clearWrongPageCheck();
    if (previousTabId && previousTabId !== nextTabId) {
      chrome.tabs.sendMessage(previousTabId, { action: "MONITOR_STATE", active: false }).catch(() => {});
    }
    chrome.tabs.sendMessage(nextTabId, { action: "MONITOR_STATE", active: true }).catch(() => {});
    sendResponse?.({ ok: true, active: true, recovered: !previousTabId || previousTabId !== nextTabId });
  });
}

// Only one tab per Chrome profile is allowed to monitor Mercado Pago. Other
// Mercado Pago tabs are intentionally passive so normal browsing never emits
// false outage alerts.
function pingAllTabs() {
  chrome.storage.local.get(["monitorTabId"], ({ monitorTabId }) => {
    if (!monitorTabId) return;
    chrome.tabs.sendMessage(monitorTabId, { action: "TRIGGER_POLL" }).catch(() => {
      // A content script is temporarily unreachable while Chrome updates the
      // extension or reloads a page. Keep the selection if the tab still
      // exists; otherwise the next /activities tab will recover it.
      chrome.tabs.get(monitorTabId, () => {
        if (chrome.runtime.lastError) chrome.storage.local.remove("monitorTabId");
      });
    });
  });
}

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.local.get(["monitorTabId"], ({ monitorTabId }) => {
    if (monitorTabId === tabId) scheduleWrongPageCheck();
  });
});

function setupAlarms() {
  chrome.alarms.create("POLL_PULSE", { periodInMinutes: 0.25 });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "POLL_PULSE") {
    pingAllTabs();
  }
  if (alarm.name === WRONG_PAGE_ALARM) checkMonitorPage();
});

// Periodic ping while service worker is active
setInterval(pingAllTabs, 10000);

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "GET_MONITOR_STATE") {
    chrome.storage.local.get(["monitorTabId"], ({ monitorTabId }) => {
      const senderTabId = sender.tab?.id;
      if (!senderTabId || !isActivitiesTab(sender.tab)) {
        sendResponse({ active: false });
        return;
      }
      if (monitorTabId === senderTabId) {
        sendResponse({ active: true });
        return;
      }
      if (!monitorTabId) {
        saveMonitorTab(senderTabId, null, sendResponse);
        return;
      }

      // Tab ids are not durable across a full Chrome/session restore. If the
      // stored id disappeared, let the first restored Activities tab reclaim
      // monitoring without requiring a manual click.
      chrome.tabs.get(monitorTabId, (storedTab) => {
        let isMercadoPago = false;
        try { isMercadoPago = new URL(storedTab?.url || "").hostname.endsWith("mercadopago.com.ar"); } catch {}
        if (chrome.runtime.lastError || !storedTab || !isMercadoPago) {
          saveMonitorTab(senderTabId, monitorTabId, sendResponse);
          return;
        }
        sendResponse({ active: false });
      });
    });
    return true;
  }

  if (request.action === "CLAIM_MONITOR_TAB") {
    const nextTabId = sender.tab?.id;
    if (!nextTabId) {
      sendResponse({ ok: false });
      return;
    }
    chrome.storage.local.get(["monitorTabId"], ({ monitorTabId: previousTabId }) => {
      saveMonitorTab(nextTabId, previousTabId, sendResponse);
    });
    return true;
  }

  if (request.action === "WATCH_WRONG_PAGE") {
    chrome.storage.local.get(["monitorTabId"], ({ monitorTabId }) => {
      if (sender.tab?.id === monitorTabId) scheduleWrongPageCheck();
    });
    sendResponse({ ok: true });
    return;
  }

  if (request.action === "REPORT_PAYMENT") {
    const { url, payload, token, paymentSummary } = request;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "x-webhook-token": token
      },
      body: JSON.stringify(payload)
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        
        if (paymentSummary && res.ok && data.success === true) {
          chrome.storage.local.get(["history"], (items) => {
            const history = items.history || [];
            // Check if already in local history
            const exists = history.some(h => h.amount === paymentSummary.amount && h.payerName === paymentSummary.payerName && Math.abs(new Date(h.sentAt).getTime() - new Date(paymentSummary.sentAt).getTime()) < 60000);
            if (!exists) {
              history.unshift(paymentSummary);
              chrome.storage.local.set({ history: history.slice(0, 15) });
            }
          });
        }

        sendResponse({ ok: res.ok, status: res.status, data });
      })
      .catch((err) => {
        sendResponse({ ok: false, error: err.message });
      })
      .finally(() => clearTimeout(timeout));

    return true; // keep channel open for async sendResponse
  }

  if (request.action === "SEND_ALERT") {
    const { url, payload, token, alertTitle, alertMessage } = request;

    try {
      chrome.notifications.create("ZONO_PAGE_ALERT_" + Date.now(), {
        type: "basic",
        iconUrl: chrome.runtime.getURL("icon.png"),
        title: alertTitle || "⚠️ ALERTA: Monitor Mercado Pago",
        message: alertMessage || "Se detectó una falla en la pestaña de Mercado Pago.",
        priority: 2
      });
    } catch (notifErr) {}

    fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-webhook-token": token
      },
      body: JSON.stringify(payload)
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        sendResponse({ ok: res.ok, status: res.status, data });
      })
      .catch((err) => {
        console.warn("[Zono MP Monitor] Error sending alert to webhook:", err);
        sendResponse({ ok: false, error: err.message });
      });

    return true;
  }

  if (request.action === "SEND_HEARTBEAT") {
    const { url, payload, token } = request;

    fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-webhook-token": token
      },
      body: JSON.stringify(payload)
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        sendResponse({ ok: res.ok, status: res.status, data });
      })
      .catch((err) => {
        console.warn("[Zono MP Monitor] Heartbeat failed:", err);
        try {
          chrome.notifications.create("ZONO_OFFLINE_ALERT", {
            type: "basic",
            iconUrl: chrome.runtime.getURL("icon.png"),
            title: "⚠️ Alerta: Monitor Mercado Pago Desconectado",
            message: "No se pudo conectar con el ERP Zono (" + (err.message || "Error de red") + "). Verifique su conexión a Internet.",
            priority: 2
          });
        } catch (notifErr) {}
        sendResponse({ ok: false, error: err.message });
      });

    return true;
  }
});

// background.js - Service worker with full CORS bypass
chrome.runtime.onInstalled.addListener(() => {
  console.log("[Zono MP Monitor] Extension installed successfully");
  setupAlarms();
});

// Only one tab per Chrome profile is allowed to monitor Mercado Pago. Other
// Mercado Pago tabs are intentionally passive so normal browsing never emits
// false outage alerts.
function pingAllTabs() {
  chrome.storage.local.get(["monitorTabId"], ({ monitorTabId }) => {
    if (!monitorTabId) return;
    chrome.tabs.sendMessage(monitorTabId, { action: "TRIGGER_POLL" }).catch(() => {
      chrome.storage.local.remove("monitorTabId");
    });
  });
}

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.local.get(["monitorTabId"], ({ monitorTabId }) => {
    if (monitorTabId === tabId) chrome.storage.local.remove("monitorTabId");
  });
});

function setupAlarms() {
  chrome.alarms.create("POLL_PULSE", { periodInMinutes: 0.25 });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "POLL_PULSE") {
    pingAllTabs();
  }
});

// Periodic ping while service worker is active
setInterval(pingAllTabs, 10000);

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "GET_MONITOR_STATE") {
    chrome.storage.local.get(["monitorTabId"], ({ monitorTabId }) => {
      sendResponse({ active: Boolean(sender.tab?.id && monitorTabId === sender.tab.id) });
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
      chrome.storage.local.set({ monitorTabId: nextTabId }, () => {
        if (previousTabId && previousTabId !== nextTabId) {
          chrome.tabs.sendMessage(previousTabId, { action: "MONITOR_STATE", active: false }).catch(() => {});
        }
        chrome.tabs.sendMessage(nextTabId, { action: "MONITOR_STATE", active: true }).catch(() => {});
        sendResponse({ ok: true, active: true });
      });
    });
    return true;
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

// background.js - Service worker with full CORS bypass
chrome.runtime.onInstalled.addListener(() => {
  console.log("[Zono MP Monitor] Extension installed successfully");
  setupAlarms();
});

// Broadcast poll pulse to all Mercado Pago tabs every 10-12 seconds
function pingAllTabs() {
  chrome.tabs.query({ url: "*://*.mercadopago.com.ar/*" }, (tabs) => {
    if (chrome.runtime.lastError || !tabs) return;
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, { action: "TRIGGER_POLL" }).catch(() => {});
    });
  });
}

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
  if (request.action === "REPORT_PAYMENT") {
    const { url, payload, token, paymentSummary } = request;

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
        
        if (paymentSummary && (res.ok || data.success)) {
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
      });

    return true; // keep channel open for async sendResponse
  }
});

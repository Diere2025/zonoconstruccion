// popup.js
document.addEventListener("DOMContentLoaded", () => {
  const accountNameEl = document.getElementById("accountName");
  const webhookUrlEl = document.getElementById("webhookUrl");
  const secretTokenEl = document.getElementById("secretToken");
  const workStartEl = document.getElementById("workStart");
  const workEndEl = document.getElementById("workEnd");
  const workIntervalEl = document.getElementById("workInterval");
  const offIntervalEl = document.getElementById("offInterval");
  const btnSave = document.getElementById("btnSave");
  const btnTest = document.getElementById("btnTest");
  const btnClearHistory = document.getElementById("btnClearHistory");
  const historyList = document.getElementById("historyList");
  const connBadge = document.getElementById("connBadge");
  const connDot = document.getElementById("connDot");
  const connText = document.getElementById("connText");
  const popupClock = document.getElementById("popupClock");
  const dayButtons = document.querySelectorAll(".day-btn");

  function updateClock() {
    if (popupClock) {
      const now = new Date();
      popupClock.innerText = `🕒 ${now.toLocaleTimeString("es-AR", {
        timeZone: "America/Argentina/Buenos_Aires",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
      })} hs`;
    }
  }
  updateClock();
  setInterval(updateClock, 1000);

  let selectedDays = [1, 2, 3, 4, 5, 6];

  // Day toggle logic
  dayButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const d = Number(btn.dataset.day);
      if (selectedDays.includes(d)) {
        selectedDays = selectedDays.filter((x) => x !== d);
        btn.classList.remove("active");
      } else {
        selectedDays.push(d);
        btn.classList.add("active");
      }
    });
  });

  function updateDaysUI(days) {
    selectedDays = days;
    dayButtons.forEach((btn) => {
      const d = Number(btn.dataset.day);
      if (selectedDays.includes(d)) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    });
  }

  btnClearHistory?.addEventListener("click", () => {
    chrome.storage.local.set({ history: [] }, () => {
      renderHistory([]);
    });
  });

  // Load saved settings
  chrome.storage.local.get(
    [
      "accountName",
      "webhookUrl",
      "secretToken",
      "workInterval",
      "offInterval",
      "workStart",
      "workEnd",
      "workDays",
      "history"
    ],
    (res) => {
      if (res.accountName) accountNameEl.value = res.accountName;
      if (res.webhookUrl) webhookUrlEl.value = res.webhookUrl;
      if (res.secretToken) secretTokenEl.value = res.secretToken;
      if (res.workStart) workStartEl.value = res.workStart;
      else workStartEl.value = "06:00";
      if (res.workEnd) workEndEl.value = res.workEnd;
      else workEndEl.value = "21:00";
      if (res.workInterval) workIntervalEl.value = String(res.workInterval);
      else workIntervalEl.value = "45";
      if (res.offInterval) offIntervalEl.value = String(res.offInterval);
      else offIntervalEl.value = "600";
      if (Array.isArray(res.workDays)) {
        updateDaysUI(res.workDays);
      }

      renderHistory(res.history || []);
      checkLiveConnection();
    }
  );

  async function checkLiveConnection() {
    try {
      const url = new URL(webhookUrlEl.value.trim());
      url.searchParams.set("account", accountNameEl.value);
      url.searchParams.set("token", secretTokenEl.value.trim());

      const res = await fetch(url.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-webhook-token": secretTokenEl.value.trim()
        },
        body: JSON.stringify({
          type: "HEARTBEAT",
          account: accountNameEl.value,
          version: "1.2.0"
        })
      });

      if (res.ok) {
        connBadge.style.background = "#064e3b";
        connBadge.style.borderColor = "#059669";
        connDot.style.background = "#10b981";
        connText.innerText = "ONLINE";
      } else {
        connBadge.style.background = "#450a0a";
        connBadge.style.borderColor = "#dc2626";
        connDot.style.background = "#ef4444";
        connText.innerText = "ERROR " + res.status;
      }
    } catch (e) {
      connBadge.style.background = "#450a0a";
      connBadge.style.borderColor = "#dc2626";
      connDot.style.background = "#ef4444";
      connText.innerText = "OFFLINE";
    }
  }

  btnSave.addEventListener("click", () => {
    const config = {
      accountName: accountNameEl.value,
      webhookUrl: webhookUrlEl.value.trim(),
      secretToken: secretTokenEl.value.trim(),
      workStart: workStartEl.value || "07:30",
      workEnd: workEndEl.value || "18:30",
      workDays: selectedDays,
      workInterval: Number(workIntervalEl.value) || 20,
      offInterval: Number(offIntervalEl.value) || 300
    };

    chrome.storage.local.set(config, () => {
      btnSave.innerText = "¡Guardado!";
      btnSave.style.background = "#059669";
      checkLiveConnection();
      setTimeout(() => {
        btnSave.innerText = "Guardar configuración";
        btnSave.style.background = "#0069ff";
      }, 1500);
    });
  });

  btnTest.addEventListener("click", async () => {
    btnTest.innerText = "Enviando prueba...";
    try {
      const url = new URL(webhookUrlEl.value.trim());
      url.searchParams.set("account", accountNameEl.value);
      url.searchParams.set("token", secretTokenEl.value.trim());

      const payload = {
        title: "Transferencia recibida",
        text: `Recibiste $ 100 De Prueba Extensión Chrome Zono desde su cuenta de Mercado Pago.`,
        bigText: "Recibiste $ 100 De Prueba Extensión Chrome Zono",
        account: accountNameEl.value,
        token: secretTokenEl.value.trim()
      };

      const res = await fetch(url.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-webhook-token": secretTokenEl.value.trim()
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (data.success || res.ok) {
        btnTest.innerText = "✅ ¡Prueba exitosa!";
        checkLiveConnection();
        setTimeout(() => (btnTest.innerText = "Enviar prueba ($100 a Zono)"), 2000);
      } else {
        alert("Error del servidor: " + (data.error || data.message || "Rechazado"));
        btnTest.innerText = "Enviar prueba ($100 a Zono)";
      }
    } catch (e) {
      alert("Error al conectar: " + e.message);
      btnTest.innerText = "Enviar prueba ($100 a Zono)";
    }
  });

  function renderHistory(items) {
    if (!items || items.length === 0) {
      historyList.innerHTML = `<div style="color: #64748b; font-size: 11px; text-align: center; padding: 6px;">Aún no se detectaron cobros</div>`;
      return;
    }

    historyList.innerHTML = items
      .slice(0, 5)
      .map(
        (it) => `
      <div class="history-item">
        <div style="display: flex; justify-content: space-between;">
          <span class="history-amount">$ ${Number(it.amount || 0).toLocaleString("es-AR")}</span>
          <span class="history-time">${it.sentAt ? new Date(it.sentAt).toLocaleTimeString() : ""}</span>
        </div>
        <div class="history-payer">${it.payerName || "Cliente"}</div>
      </div>
    `
      )
      .join("");
  }
});

// popup.js
document.addEventListener("DOMContentLoaded", () => {
  const accountNameEl = document.getElementById("accountName");
  const webhookUrlEl = document.getElementById("webhookUrl");
  const secretTokenEl = document.getElementById("secretToken");
  const pollIntervalEl = document.getElementById("pollInterval");
  const btnSave = document.getElementById("btnSave");
  const btnTest = document.getElementById("btnTest");
  const btnClearHistory = document.getElementById("btnClearHistory");
  const historyList = document.getElementById("historyList");

  btnClearHistory?.addEventListener("click", () => {
    chrome.storage.local.set({ history: [] }, () => {
      renderHistory([]);
    });
  });

  // Load saved settings
  chrome.storage.local.get(
    ["accountName", "webhookUrl", "secretToken", "pollInterval", "history"],
    (res) => {
      if (res.accountName) accountNameEl.value = res.accountName;
      if (res.webhookUrl) webhookUrlEl.value = res.webhookUrl;
      if (res.secretToken) secretTokenEl.value = res.secretToken;
      if (res.pollInterval) pollIntervalEl.value = res.pollInterval;

      renderHistory(res.history || []);
    }
  );

  btnSave.addEventListener("click", () => {
    const config = {
      accountName: accountNameEl.value,
      webhookUrl: webhookUrlEl.value.trim(),
      secretToken: secretTokenEl.value.trim(),
      pollInterval: Number(pollIntervalEl.value) || 30
    };

    chrome.storage.local.set(config, () => {
      btnSave.innerText = "¡Guardado!";
      btnSave.style.background = "#059669";
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
      historyList.innerHTML = `<div style="color: #64748b; font-size: 11px; text-align: center; padding: 8px;">Aún no se detectaron cobros</div>`;
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

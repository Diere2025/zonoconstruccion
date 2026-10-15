// A reloaded extension leaves the previous content scripts alive in open pages.
// Stop their work and reload only monitoring pages to load the current scripts.
(function () {
  let invalidated = false, recoveryStarted = false;
  function alive() {
    if (!invalidated) {
      try {
        if (chrome.runtime.id && chrome.runtime.getManifest()) return true;
      } catch (_) { /* The old extension context is no longer usable. */ }
      invalidated = true;
    }
    const path = location.pathname.replace(/\/$/, '');
    const monitorPage = path === '/activities' ||
      /^(?:\/banking\/movements(?:\/[1-9]\d*)?|\/balance\/reports\/movements)$/.test(path) ||
      path === '/savings/movements/000101a7-1f12-4102-9d9e-871da7f7b326';
    if (monitorPage && !recoveryStarted) {
      recoveryStarted = true;
      location.reload();
    }
    return false;
  }
  globalThis.ZonoExtensionContext = { alive };
  setInterval(alive, 1000);
})();

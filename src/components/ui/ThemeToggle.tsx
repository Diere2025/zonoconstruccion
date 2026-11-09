"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

const storageKey = "zono-theme";
const eventName = "zono-theme-change";
function subscribe(update: () => void) {
  const sync = (event: StorageEvent) => {
    if (event.key !== storageKey && event.key !== null) return;
    document.documentElement.classList.toggle("dark", event.newValue === "dark");
    update();
  };
  window.addEventListener(eventName, update);
  window.addEventListener("storage", sync);
  return () => {
    window.removeEventListener(eventName, update);
    window.removeEventListener("storage", sync);
  };
}

export function ThemeToggle() {
  const dark = useSyncExternalStore(subscribe, () => document.documentElement.classList.contains("dark"), () => false);
  function toggle() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    try { localStorage.setItem(storageKey, next ? "dark" : "light"); } catch { /* Allow switching without browser storage. */ }
    window.dispatchEvent(new Event(eventName));
  }
  return (
    <button type="button" onClick={toggle} aria-label="Modo oscuro" aria-pressed={dark}
      title={dark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      className="no-print inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500">
      {dark ? <Sun size={20} aria-hidden="true" /> : <Moon size={20} aria-hidden="true" />}
      <span className="hidden xl:inline">{dark ? "Modo claro" : "Modo oscuro"}</span>
    </button>
  );
}

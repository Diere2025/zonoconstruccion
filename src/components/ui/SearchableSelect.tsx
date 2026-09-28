"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";

interface Props {
  id?: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  required?: boolean;
  placeholder?: string;
}

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es").trim();

/** Search selects an existing record; typed text cannot be submitted as a record id. */
export default function SearchableSelect({ id, label, value, options, onChange, required = false, placeholder = "Seleccionar…" }: Props) {
  const generatedId = useId();
  const inputId = id || generatedId;
  const listId = `${inputId}-options`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const selected = options.find(option => option.value === value);
  const filtered = useMemo(() => {
    const words = normalize(query).split(/\s+/).filter(Boolean);
    return options.filter(option => words.every(word => normalize(option.label).includes(word)));
  }, [options, query]);
  const highlightedIndex = Math.min(activeIndex, filtered.length - 1);
  useEffect(() => {
    inputRef.current?.setCustomValidity(required && !selected ? "Seleccioná un proveedor de la lista." : "");
  }, [required, selected]);
  useEffect(() => {
    if (open && highlightedIndex >= 0) document.getElementById(`${listId}-${highlightedIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [open, highlightedIndex, listId]);

  const choose = (nextValue: string) => {
    onChange(nextValue);
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
  };
  const showOptions = () => { setOpen(true); setQuery(""); setActiveIndex(0); };

  return (
    <div className="relative min-w-0">
      <label htmlFor={inputId} className="mb-1 block text-xs font-semibold text-slate-500">{label}{required && <span className="text-slate-400"> *</span>}</label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          ref={inputRef} id={inputId} role="combobox" aria-autocomplete="list" aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-activedescendant={open && highlightedIndex >= 0 ? `${listId}-${highlightedIndex}` : undefined}
          autoComplete="off" aria-required={required} required={required && !selected}
          placeholder={open ? "Escribí para filtrar proveedores…" : placeholder}
          value={open ? query : selected?.label || ""}
          onFocus={showOptions}
          onBlur={() => setOpen(false)}
          onChange={event => {
            setQuery(event.target.value); setActiveIndex(0); setOpen(true);
            if (value) onChange("");
          }}
          onKeyDown={event => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              if (!open) showOptions();
              else setActiveIndex(index => Math.max(0, Math.min(filtered.length - 1, index + (event.key === "ArrowDown" ? 1 : -1))));
            } else if (event.key === "Enter" && open) {
              event.preventDefault();
              if (filtered[highlightedIndex]) choose(filtered[highlightedIndex].value);
            } else if (event.key === "Escape") {
              event.preventDefault(); event.stopPropagation(); setOpen(false);
            }
          }}
          className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-16 text-sm font-medium text-slate-800 outline-none placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10"
        />
        {value && <button type="button" aria-label="Limpiar proveedor" onMouseDown={event => event.preventDefault()} onClick={() => choose("")} className="absolute right-8 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600"><X className="h-3.5 w-3.5" /></button>}
        <button type="button" aria-label={open ? "Cerrar proveedores" : "Mostrar proveedores"} onMouseDown={event => event.preventDefault()} onClick={() => { if (open) setOpen(false); else { inputRef.current?.focus(); showOptions(); } }} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600"><ChevronDown className="h-4 w-4" /></button>
      </div>
      {open && <div id={listId} role="listbox" aria-label="Proveedores" className="absolute left-0 right-0 top-full z-30 mt-1 max-h-48 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
        {filtered.length ? filtered.map((option, index) => <button
          key={option.value} id={`${listId}-${index}`} type="button" role="option" tabIndex={-1}
          aria-selected={option.value === value} onMouseDown={event => event.preventDefault()} onClick={() => choose(option.value)}
          className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm ${index === highlightedIndex ? "bg-brand-50 text-brand-800" : "text-slate-700 hover:bg-slate-50"}`}
        ><span className="min-w-0 break-words">{option.label}</span>{option.value === value && <Check className="h-4 w-4 shrink-0 text-brand-600" />}</button>) : <p className="px-3 py-3 text-xs text-slate-500">No se encontraron proveedores.</p>}
      </div>}
    </div>
  );
}

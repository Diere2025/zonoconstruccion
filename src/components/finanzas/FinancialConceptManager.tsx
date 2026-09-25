"use client";

import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabase";
import {
  financialConceptKey,
  normalizeFinancialText,
  parseFinancialConceptRows,
  type FinancialConcept,
  type FinancialConceptInput
} from "@/lib/financialConcepts";

const emptyConcept: FinancialConceptInput = {
  concept: "", category: "", sub_category: "", movement_type: "Egreso", efe_category: ""
};

type Props = {
  concepts: FinancialConcept[];
  onClose: () => void;
  onChanged: () => Promise<void>;
};

export default function FinancialConceptManager({ concepts, onClose, onChanged }: Props) {
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<FinancialConceptInput>(emptyConcept);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  const filtered = useMemo(() => {
    const query = normalizeFinancialText(search);
    return concepts.filter(item => (showInactive || item.is_active) && (
      !query || [item.concept, item.category, item.sub_category, item.efe_category]
        .some(value => normalizeFinancialText(value).includes(query))
    )).slice(0, 100);
  }, [concepts, search, showInactive]);

  const edit = (item: FinancialConcept) => {
    setEditingId(item.id);
    setDraft({
      concept: item.concept,
      category: item.category,
      sub_category: item.sub_category,
      movement_type: item.movement_type,
      efe_category: item.efe_category
    });
    setMessage("");
  };

  const save = async () => {
    const value = {
      concept: draft.concept.trim(),
      category: draft.category.trim(),
      sub_category: draft.sub_category.trim(),
      movement_type: draft.movement_type,
      efe_category: draft.efe_category.trim()
    };
    if (!value.concept || !value.category) {
      setMessage("Completá concepto y categoría.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const result = editingId
        ? await supabase.from('financial_concepts').update({ ...value, updated_at: new Date().toISOString() }).eq('id', editingId).select('id').single()
        : await supabase.from('financial_concepts').insert(value).select('id').single();
      if (result.error) throw result.error;
      await onChanged();
      setEditingId(null);
      setDraft(emptyConcept);
      setMessage(editingId ? "Concepto actualizado." : "Concepto agregado.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo guardar el concepto.");
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (item: FinancialConcept) => {
    setBusy(true);
    setMessage("");
    try {
      const { error } = await supabase.from('financial_concepts')
        .update({ is_active: !item.is_active, updated_at: new Date().toISOString() })
        .eq('id', item.id).select('id').single();
      if (error) throw error;
      await onChanged();
      setMessage(item.is_active ? "Concepto desactivado." : "Concepto activado.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo cambiar el estado.");
    } finally {
      setBusy(false);
    }
  };

  const importFile = async (file: File) => {
    setBusy(true);
    setMessage("");
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames.find(name => name.toLowerCase() === 'bdcols') || workbook.SheetNames[0]];
      if (!sheet) throw new Error('El archivo no contiene hojas.');
      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
      const { items, invalidRows } = parseFinancialConceptRows(rows);
      if (invalidRows.length) throw new Error(`Hay ${invalidRows.length} filas con categoría o tipo inválido (primera: ${invalidRows[0]}). Corregilas y volvé a importar.`);
      const existing = new Set(concepts.map(financialConceptKey));
      const newItems = items.filter(item => {
        const key = financialConceptKey(item);
        if (existing.has(key)) return false;
        existing.add(key);
        return true;
      });
      for (let index = 0; index < newItems.length; index += 200) {
        const { error } = await supabase.from('financial_concepts').insert(newItems.slice(index, index + 200));
        if (error) throw error;
      }
      await onChanged();
      setMessage(`Importación terminada: ${newItems.length} conceptos agregados, ${items.length - newItems.length} ya existentes.`);
    } catch (error) {
      await onChanged();
      setMessage(error instanceof Error ? error.message : "No se pudo importar el archivo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col gap-4 overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-black text-slate-900">Base de conceptos</h2>
            <p className="text-xs text-slate-500">{concepts.filter(item => item.is_active).length} activos · {concepts.length} en total</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-sm font-bold text-slate-500 hover:bg-slate-100">Cerrar</button>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          <section className="space-y-3 rounded-2xl border border-slate-200 p-4">
            <h3 className="text-xs font-black uppercase text-slate-700">{editingId ? 'Editar concepto' : 'Agregar concepto'}</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-xs font-bold text-slate-600 sm:col-span-2">Concepto *
                <input value={draft.concept} onChange={event => setDraft({ ...draft, concept: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" />
              </label>
              <label className="text-xs font-bold text-slate-600">Categoría *
                <input value={draft.category} onChange={event => setDraft({ ...draft, category: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" />
              </label>
              <label className="text-xs font-bold text-slate-600">Subcategoría
                <input value={draft.sub_category} onChange={event => setDraft({ ...draft, sub_category: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" />
              </label>
              <label className="text-xs font-bold text-slate-600">Tipo de movimiento
                <select value={draft.movement_type} onChange={event => setDraft({ ...draft, movement_type: event.target.value as FinancialConceptInput['movement_type'] })} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <option>Ingreso</option><option>Egreso</option><option>Mov. Financiero</option>
                </select>
              </label>
              <label className="text-xs font-bold text-slate-600">EFE
                <input value={draft.efe_category} onChange={event => setDraft({ ...draft, efe_category: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" />
              </label>
            </div>
            <div className="flex gap-2">
              <button type="button" disabled={busy} onClick={save} className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-black text-white disabled:opacity-50">{editingId ? 'Guardar cambios' : 'Agregar'}</button>
              {editingId && <button type="button" onClick={() => { setEditingId(null); setDraft(emptyConcept); }} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-bold">Cancelar edición</button>}
            </div>
          </section>

          <section className="space-y-3 rounded-2xl border border-slate-200 p-4">
            <h3 className="text-xs font-black uppercase text-slate-700">Importar conceptos</h3>
            <p className="text-xs text-slate-500">Acepta CSV o Excel con las columnas Concepto, Cuenta/Categoría y Tipo Mov. Si existe la hoja BdCols, se usa esa hoja. Las filas idénticas se omiten.</p>
            <input type="file" accept=".csv,.xlsx,.xls" disabled={busy} onChange={async event => {
              const file = event.target.files?.[0];
              if (file) await importFile(file);
              event.target.value = '';
            }} className="block w-full text-xs text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:font-bold" />
            {message && <p role="status" className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">{message}</p>}
          </section>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar conceptos, categorías o EFE" className="min-w-64 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-xs" />
          <label className="flex items-center gap-2 text-xs font-bold text-slate-600"><input type="checkbox" checked={showInactive} onChange={event => setShowInactive(event.target.checked)} /> Ver inactivos</label>
        </div>
        <div className="min-h-0 overflow-y-auto rounded-xl border border-slate-200">
          {filtered.map(item => (
            <div key={item.id} className="flex items-center justify-between gap-3 border-b border-slate-100 px-3 py-2 last:border-0">
              <div className="min-w-0">
                <p className="truncate text-xs font-bold text-slate-800">{item.concept}{!item.is_active && <span className="ml-2 text-rose-500">Inactivo</span>}</p>
                <p className="truncate text-[10px] text-slate-500">{item.category} · {item.sub_category} · {item.movement_type}{item.efe_category && ` · EFE: ${item.efe_category}`}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button type="button" onClick={() => edit(item)} className="text-xs font-bold text-brand-700 hover:underline">Editar</button>
                <button type="button" disabled={busy} onClick={() => toggleActive(item)} className="text-xs font-bold text-slate-500 hover:underline disabled:opacity-50">{item.is_active ? 'Desactivar' : 'Activar'}</button>
              </div>
            </div>
          ))}
          {!filtered.length && <p className="p-4 text-xs text-slate-500">No hay conceptos para mostrar.</p>}
        </div>
        {filtered.length === 100 && <p className="text-[10px] text-slate-500">Se muestran los primeros 100 resultados. Escribí para acotar la búsqueda.</p>}
      </div>
    </div>
  );
}

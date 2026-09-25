"use client";

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowLeft, ArrowUp, ChevronDown, Plus, Printer, Save, Settings2, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { DEFAULT_PRINT_CATEGORIES, isCategorizationProduct, resolveWarehouseCategory, warehouseProductKey } from '@/lib/warehouseCategoryConfig';

interface CategoryResponse {
  categories: string[];
  assignments: Record<string, string>;
  classificationVersion: number;
  products?: string[];
  canEdit: boolean;
  error?: string;
}

function searchKey(value: string): string {
  return warehouseProductKey(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export default function PrintingCategoriesPage() {
  const [categories, setCategories] = useState<string[]>(DEFAULT_PRINT_CATEGORIES);
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [categoryDrafts, setCategoryDrafts] = useState<Record<string, string>>({});
  const [openCategoryKey, setOpenCategoryKey] = useState<string | null>(null);
  const [categoryOptionsAbove, setCategoryOptionsAbove] = useState(false);
  const [highlightedCategory, setHighlightedCategory] = useState(0);
  const [products, setProducts] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [activeTab, setActiveTab] = useState<'products' | 'categories'>('products');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) throw new Error('Iniciá sesión para configurar la impresión.');
        const response = await fetch('/api/logistica/nota-pedido-config?section=warehouse-categories&products=1', {
          headers: { Authorization: `Bearer ${session.access_token}` }, cache: 'no-store'
        });
        const data = await response.json() as CategoryResponse;
        if (!response.ok) throw new Error(data.error || 'No se pudieron cargar las categorías.');
        if (cancelled) return;
        setCanEdit(data.canEdit);
        setCategories(data.categories);
        const names = (data.products || []).filter(isCategorizationProduct);
        setProducts(names);
        setAssignments(Object.fromEntries(names.map(name => {
          const key = warehouseProductKey(name);
          return [key, resolveWarehouseCategory(name, data)];
        })));
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'No se pudieron cargar las categorías.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const names = products;
  const visibleNames = useMemo(() => names.filter(name =>
    searchKey(name).includes(searchKey(search)) && (!categoryFilter || assignments[warehouseProductKey(name)] === categoryFilter)
  ), [names, search, categoryFilter, assignments]);
  const counts = useMemo(() => Object.values(assignments).reduce((result, category) => {
    result[category] = (result[category] || 0) + 1;
    return result;
  }, {} as Record<string, number>), [assignments]);
  const categoryColumnWidth = useMemo(() => Math.max(180, ...categories.map(category => category.length * 8 + 48)), [categories]);

  const addCategory = () => {
    const name = newCategory.trim();
    if (!name || name.length > 80) return setError('Escribí un nombre de hasta 80 caracteres.');
    if (categories.some(category => category.toLocaleLowerCase('es') === name.toLocaleLowerCase('es'))) return setError('Esa categoría ya existe.');
    setCategories(current => [...current.filter(category => category !== 'Sin categoría'), name, 'Sin categoría']);
    setNewCategory('');
    setError('');
  };
  const renameCategory = (index: number, name: string) => {
    const original = categories[index];
    setCategories(current => current.map((category, position) => position === index ? name : category));
    setAssignments(current => Object.fromEntries(Object.entries(current).map(([product, category]) => [product, category === original ? name : category])));
    setCategoryFilter(current => current === original ? name : current);
    setCategoryDrafts({});
  };
  const deleteCategory = (name: string) => {
    setCategories(current => current.filter(category => category !== name));
    setAssignments(current => Object.fromEntries(Object.entries(current).map(([product, category]) => [product, category === name ? 'Sin categoría' : category])));
    setCategoryFilter(current => current === name ? '' : current);
    setCategoryDrafts({});
  };
  const commitCategory = (productKey: string, value: string) => {
    setOpenCategoryKey(null);
    const match = categories.find(category => searchKey(category) === searchKey(value));
    if (!match) {
      setError(`«${value.trim()}» no es una categoría existente. Seleccioná una de las sugerencias.`);
      return;
    }
    setAssignments(current => ({ ...current, [productKey]: match }));
    setCategoryDrafts(current => { const next = { ...current }; delete next[productKey]; return next; });
    setError('');
  };
  const moveCategory = (index: number, direction: number) => {
    const target = index + direction;
    if (target < 0 || target >= categories.length) return;
    setCategories(current => { const next = [...current]; [next[index], next[target]] = [next[target], next[index]]; return next; });
  };
  const save = async () => {
    setError(''); setMessage('');
    const clean = categories.map(category => category.trim());
    if (clean.some(category => !category || category.length > 80) || new Set(clean.map(category => category.toLocaleLowerCase('es'))).size !== clean.length) {
      setError('Revisá los nombres de las categorías: no pueden estar vacíos ni repetidos.'); return;
    }
    const normalizedAssignments = Object.fromEntries(Object.entries(assignments).map(([name, category]) => [name, category.trim()]));
    for (const [product, draft] of Object.entries(categoryDrafts)) {
      const match = clean.find(category => searchKey(category) === searchKey(draft));
      if (!match) { setError(`«${draft.trim()}» no es una categoría existente. Revisá el producto antes de guardar.`); return; }
      normalizedAssignments[product] = match;
    }
    if (Object.values(normalizedAssignments).some(category => !clean.includes(category))) {
      setError('Hay productos asignados a una categoría que ya no existe.'); return;
    }
    try {
      setSaving(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Iniciá sesión para guardar.');
      const response = await fetch('/api/logistica/nota-pedido-config?section=warehouse-categories', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ categories: clean, assignments: normalizedAssignments, classificationVersion: 1 })
      });
      const data = await response.json() as CategoryResponse;
      if (!response.ok) throw new Error(data.error || 'No se pudieron guardar los cambios.');
      setCategories(data.categories);
      setAssignments(data.assignments);
      setCategoryDrafts({});
      setMessage('Categorías guardadas. Las próximas impresiones usarán esta configuración.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'No se pudieron guardar los cambios.');
    } finally { setSaving(false); }
  };

  const saveButton = <button type="button" onClick={save} disabled={saving} className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-black text-white disabled:opacity-50"><Save className="h-4 w-4" />{saving ? 'Guardando…' : 'Guardar configuración'}</button>;

  return <div className="mx-auto max-w-[1250px] space-y-5 p-4 sm:p-6 lg:p-8">
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white"><Settings2 className="h-5 w-5" /></span><div><h1 className="text-xl font-black text-slate-900">Categorías de impresión</h1><p className="text-xs text-slate-500">Configuración · Logística y Distribución</p></div></div>
      <Link href="/vendedores/ruteo/comprobantes" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700"><ArrowLeft className="h-4 w-4" /> Volver a impresión logística</Link>
    </header>
    <p className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900"><Printer className="mr-2 inline h-4 w-4" />Estas categorías se usan únicamente para <b>Separar mercadería</b> y <b>Separar mercadería total</b>. No modifican las categorías del catálogo ni los productos.</p>
    {loading ? <p className="rounded-2xl bg-white p-6 text-sm text-slate-600">Cargando productos y categorías…</p> : !canEdit ? <p className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">{error || 'Solo administración y logística pueden editar esta configuración.'}</p> : <>
      <div role="tablist" aria-label="Configuración de categorías de impresión" className="flex gap-2 border-b border-slate-200">
        <button type="button" role="tab" aria-selected={activeTab === 'products'} onClick={() => setActiveTab('products')} className={`rounded-t-xl px-5 py-3 text-sm font-bold ${activeTab === 'products' ? 'border border-b-white border-slate-200 bg-white text-blue-700' : 'text-slate-500 hover:text-slate-800'}`}>Asignación de productos</button>
        <button type="button" role="tab" aria-selected={activeTab === 'categories'} onClick={() => setActiveTab('categories')} className={`rounded-t-xl px-5 py-3 text-sm font-bold ${activeTab === 'categories' ? 'border border-b-white border-slate-200 bg-white text-blue-700' : 'text-slate-500 hover:text-slate-800'}`}>Crear y ordenar categorías</button>
      </div>
      {(error || message) && <div aria-live="polite" className={`rounded-xl border px-4 py-3 text-xs font-semibold ${error ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{error || message}</div>}
      {activeTab === 'categories' && <section role="tabpanel" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-base font-black text-slate-900">Grupos de impresión</h2><p className="mt-1 text-xs text-slate-500">El orden de esta lista será el orden de las secciones en la hoja impresa. «Sin categoría» recibe los productos sin grupo.</p></div>{saveButton}</div>
        <div className="mt-4 space-y-2">{categories.map((category, index) => <div key={index} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2">
          <span className="w-6 text-center text-xs font-black text-slate-400">{index + 1}</span><input aria-label={`Nombre de categoría ${index + 1}`} value={category} disabled={category === 'Sin categoría'} onChange={event => renameCategory(index, event.target.value)} className="min-w-40 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 disabled:bg-slate-100" />
          <span className="w-28 text-right text-xs text-slate-500">{counts[category] || 0} productos</span>
          <button type="button" aria-label={`Subir ${category}`} disabled={index === 0} onClick={() => moveCategory(index, -1)} className="rounded-lg p-2 text-slate-600 disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button><button type="button" aria-label={`Bajar ${category}`} disabled={index === categories.length - 1} onClick={() => moveCategory(index, 1)} className="rounded-lg p-2 text-slate-600 disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button><button type="button" aria-label={`Eliminar ${category}`} disabled={category === 'Sin categoría'} onClick={() => deleteCategory(category)} className="rounded-lg p-2 text-rose-600 disabled:opacity-30"><Trash2 className="h-4 w-4" /></button>
        </div>)}</div>
        <div className="mt-4 flex gap-2"><input aria-label="Nueva categoría" placeholder="Nueva categoría" value={newCategory} onChange={event => setNewCategory(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') addCategory(); }} className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm" /><button type="button" onClick={addCategory} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-xs font-bold"><Plus className="h-4 w-4" /> Agregar</button></div>
      </section>}
      {activeTab === 'products' && <section role="tabpanel" className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-base font-black text-slate-900">Asignación de productos</h2><p className="mt-1 text-xs text-slate-500">Se muestran los SKU vigentes, tal como aparecen al pegarlos en la grilla. Podés cambiar su categoría y guardar.</p></div>{saveButton}</div>
        <div className="mt-4 flex flex-wrap gap-2">
          <input aria-label="Buscar producto" list="printing-product-suggestions" placeholder="Buscar o seleccionar producto…" value={search} onChange={event => setSearch(event.target.value)} className="min-w-52 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          <datalist id="printing-product-suggestions">{names.map(name => <option key={warehouseProductKey(name)} value={name} />)}</datalist>
          <select aria-label="Filtrar por categoría" value={categoryFilter} onChange={event => setCategoryFilter(event.target.value)} className="w-64 max-w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"><option value="">Todas las categorías</option>{categories.map(category => <option key={category} value={category}>{category}</option>)}</select>
          {(search || categoryFilter) && <button type="button" onClick={() => { setSearch(''); setCategoryFilter(''); }} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600">Limpiar filtros</button>}
        </div>
        <p className="mt-3 text-[11px] text-slate-500">{visibleNames.length} de {names.length} productos</p>
        <div data-category-scroll className="mt-2 max-h-[560px] overflow-auto rounded-xl border border-slate-200">
          <div className="sticky top-0 grid min-w-[520px] gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-black uppercase tracking-wide text-slate-600" style={{ gridTemplateColumns: `${categoryColumnWidth}px minmax(0, 1fr)` }}><span>Categoría</span><span>Producto</span></div>
          {visibleNames.map((name, index) => {
            const key = warehouseProductKey(name);
            const draft = categoryDrafts[key];
            const options = categories.filter(category => draft === undefined || searchKey(category).includes(searchKey(draft)));
            const showOptions = openCategoryKey === key;
            const openOptions = (input: HTMLInputElement) => {
              const bounds = input.getBoundingClientRect();
              const scrollBounds = input.closest('[data-category-scroll]')?.getBoundingClientRect();
              setCategoryOptionsAbove(Math.min(window.innerHeight, scrollBounds?.bottom ?? window.innerHeight) - bounds.bottom < 180);
              setHighlightedCategory(0);
              setOpenCategoryKey(key);
            };
            return <div key={key} className="grid min-w-[520px] items-center gap-3 border-b border-slate-100 px-3 py-2 text-sm last:border-b-0" style={{ gridTemplateColumns: `${categoryColumnWidth}px minmax(0, 1fr)` }}>
              <div className="relative">
                <input role="combobox" aria-autocomplete="list" aria-expanded={showOptions} aria-controls={`printing-category-options-${index}`} aria-label={`Categoría de ${name}`} value={draft ?? assignments[key] ?? 'Sin categoría'} onFocus={event => { event.currentTarget.select(); openOptions(event.currentTarget); }} onClick={event => { event.currentTarget.select(); openOptions(event.currentTarget); }} onChange={event => { setCategoryDrafts(current => ({ ...current, [key]: event.target.value })); setHighlightedCategory(0); setOpenCategoryKey(key); }} onBlur={event => { setOpenCategoryKey(current => current === key ? null : current); if (categoryDrafts[key] !== undefined) commitCategory(key, event.target.value); }} onKeyDown={event => {
                  if (event.key === 'ArrowDown') { event.preventDefault(); setOpenCategoryKey(key); setHighlightedCategory(current => Math.min(current + 1, options.length - 1)); }
                  if (event.key === 'ArrowUp') { event.preventDefault(); setHighlightedCategory(current => Math.max(current - 1, 0)); }
                  if (event.key === 'Enter' && showOptions && options.length) { event.preventDefault(); commitCategory(key, options[highlightedCategory] || options[0]); }
                  if (event.key === 'Escape') { setOpenCategoryKey(null); setCategoryDrafts(current => { const next = { ...current }; delete next[key]; return next; }); }
                }} className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 pr-7 text-xs font-semibold" />
                <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
                {showOptions && <div id={`printing-category-options-${index}`} role="listbox" className={`absolute left-0 right-0 z-[60] max-h-44 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl ${categoryOptionsAbove ? 'bottom-full mb-1' : 'top-full mt-1'}`}>
                  {options.map((category, optionIndex) => <button key={category} type="button" role="option" aria-selected={assignments[key] === category} tabIndex={-1} onMouseDown={event => event.preventDefault()} onClick={() => commitCategory(key, category)} className={`block w-full rounded-lg px-2 py-2 text-left text-xs ${optionIndex === highlightedCategory ? 'bg-blue-50 text-blue-900' : 'text-slate-800 hover:bg-slate-50'}`}>{category}</button>)}
                  {options.length === 0 && <p className="px-2 py-2 text-xs text-slate-500">No hay categorías coincidentes.</p>}
                </div>}
              </div>
              <span className="font-medium text-slate-800">{name}</span>
            </div>;
          })}
          {visibleNames.length === 0 && <p className="p-4 text-sm text-slate-500">No hay productos que coincidan con los filtros.</p>}
        </div>
      </section>}
    </>}
  </div>;
}

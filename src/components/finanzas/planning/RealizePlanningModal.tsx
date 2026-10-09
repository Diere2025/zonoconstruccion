'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { CalendarDays, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { createAuthenticatedRequester } from '@/lib/authenticatedRequest';
import { validDate, type Fund, type Item } from '@/lib/paymentPlanning/model';

const api = createAuthenticatedRequester(supabase);
type Account = { id: string; name: string; type: string; currency: string; is_active: boolean };
type Concept = { id: string; concept: string; category: string; sub_category: string; movement_type: 'Ingreso' | 'Egreso' | 'Mov. Financiero'; efe_category: string; is_active: boolean };
type Options = { accounts: Account[]; concepts: Concept[] };
type Props = {
  item: Item; sourceFund: Fund; funds: Fund[]; initialAmount: string; initialDate: string;
  working: boolean; error: string; onClose: () => void;
  heading?: string; initialNotes?: string; onBack?: () => void;
  movementOnly?: boolean;
  onSave: (action: string, payload: Record<string, unknown>) => Promise<boolean>;
};

const dateNumber = (value: string) => `${value.slice(8,10)}/${value.slice(5,7)}/${value.slice(0,4)}`;
const parseDateNumber = (value: string) => {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!match) return null;
  const iso = `${match[3]}-${match[2]}-${match[1]}`;
  return validDate(iso) ? iso : null;
};
const defaultAccount = (accounts: Account[], fund: Fund) => {
  const compatible = accounts.filter(account => account.is_active && account.currency === fund.currency);
  if (fund.kind === 'cash') return (compatible.find(account => account.name === 'Caja Efectivo Pesos')
    || compatible.find(account => account.type === 'efectivo') || compatible[0])?.id || '';
  if (fund.kind === 'personal') return (compatible.find(account => account.name === 'Cuenta MP3') || compatible[0])?.id || '';
  return (compatible.find(account => account.type !== 'efectivo' && !/^Cuenta MP[345]$/i.test(account.name)) || compatible[0])?.id || '';
};

export default function RealizePlanningModal({ item, sourceFund, funds, initialAmount, initialDate,
  working, error, onClose, onSave, heading, initialNotes = '', onBack, movementOnly = false }: Props) {
  const [amount, setAmount] = useState(initialAmount);
  const [date, setDate] = useState(initialDate);
  const [dateDraft, setDateDraft] = useState(() => dateNumber(initialDate));
  const [fundId, setFundId] = useState(item.fund_id);
  const [notes, setNotes] = useState(initialNotes);
  const [withMovement, setWithMovement] = useState(movementOnly);
  const [options, setOptions] = useState<Options | null>(null);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [accountId, setAccountId] = useState('');
  const [conceptId, setConceptId] = useState('');
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState(item.title);
  const [localError, setLocalError] = useState('');

  const loadMovementOptions = useCallback(async () => {
    setLocalError('');
    setLoadingOptions(true);
    try {
      const loaded = await api('/api/admin/payment-planning?action=movement_options') as Options;
      setOptions(loaded);
      setAccountId(defaultAccount(loaded.accounts, sourceFund));
      const exact = loaded.concepts.filter(concept => concept.is_active &&
        (concept.movement_type === 'Mov. Financiero' || concept.movement_type === (item.kind === 'expense' ? 'Egreso' : 'Ingreso')) &&
        concept.concept.localeCompare(item.title, 'es', { sensitivity: 'base' }) === 0);
      if (exact.length === 1) setConceptId(exact[0].id);
    } catch (cause) { setLocalError(cause instanceof Error ? cause.message : 'No se pudieron cargar las cajas y conceptos.'); }
    finally { setLoadingOptions(false); }
  }, [sourceFund,item.kind,item.title]);
  useEffect(() => {
    if (!movementOnly) return;
    const timer = setTimeout(() => { void loadMovementOptions(); },0);
    return () => clearTimeout(timer);
  }, [movementOnly,loadMovementOptions]);
  const enableMovement = async (checked: boolean) => {
    setWithMovement(checked);
    if (checked && !options) await loadMovementOptions();
  };
  const compatibleAccounts = (options?.accounts || []).filter(account => account.is_active && account.currency === sourceFund.currency);
  const compatibleConcepts = (options?.concepts || []).filter(concept => concept.is_active &&
    (concept.movement_type === 'Mov. Financiero' || concept.movement_type === (item.kind === 'expense' ? 'Egreso' : 'Ingreso')));
  const selectedConcept = compatibleConcepts.find(concept => concept.id === conceptId);
  const filteredConcepts = compatibleConcepts.filter(concept => !search ||
    `${concept.concept} ${concept.category} ${concept.sub_category}`.toLocaleLowerCase('es').includes(search.toLocaleLowerCase('es')));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const chosenDate = parseDateNumber(dateDraft);
    if (!chosenDate) { setLocalError('Ingresá una fecha válida con formato dd/mm/aaaa.'); return; }
    if (Number(amount) <= 0 || !Number.isFinite(Number(amount))) { setLocalError('Ingresá un importe positivo.'); return; }
    if (withMovement && (!accountId || !conceptId || detail.trim().length < 2)) {
      setLocalError('Elegí una caja y un concepto de Movimientos, y completá el detalle.'); return;
    }
    const ok = await onSave(withMovement ? 'realize_with_movement' : 'realize', withMovement
      ? { item_id: item.id, amount, effective_date: chosenDate, financial_account_id: accountId,
          financial_concept_id: conceptId, movement_detail: detail.trim(), notes }
      : { item_id: item.id, amount, effective_date: chosenDate, fund_id: fundId, notes });
    if (ok) onClose();
  };

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-3" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <form data-shortcut-submit onSubmit={submit} className="max-h-[94vh] w-full max-w-md space-y-3 overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
      <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">{heading || 'Registrar realización'}</h2><button type="button" aria-label="Cerrar" onClick={onClose}><X size={19}/></button></div>
      <p className="text-xs text-slate-500">{item.title} · {item.kind === 'expense' ? 'Pago' : 'Ingreso'}</p>
      {(localError || error) && <p role="alert" className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{localError || error}</p>}
      <label className="block text-sm font-medium">Importe<input required type="number" min="0.01" step="0.01" value={amount} onChange={event => setAmount(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"/></label>
      <label className="block text-sm font-medium">Fecha
        <span className="mt-1 flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
          <input type="text" aria-label="Fecha de realización, día mes año" inputMode="numeric" placeholder="dd/mm/aaaa" value={dateDraft} onChange={event=>setDateDraft(event.target.value)} onBlur={() => { const parsed=parseDateNumber(dateDraft); if (parsed) setDate(parsed); }} className="w-28 bg-transparent tabular-nums outline-none"/>
          <span className="relative flex h-5 w-5 items-center justify-center text-slate-500"><CalendarDays size={16} aria-hidden="true"/><input type="date" aria-label="Elegir fecha de realización" value={date} onChange={event=>{if(event.target.value){setDate(event.target.value);setDateDraft(dateNumber(event.target.value));}}} className="absolute inset-0 h-full w-full cursor-pointer opacity-0"/></span>
        </span>
      </label>
      {movementOnly ? <p className="rounded-lg bg-teal-50 p-2 text-xs text-teal-900">El Movimiento quedará vinculado a esta tarjeta. Los importes ya realizados se concilian sin volver a descontarlos.</p> : <label className="flex items-center gap-2 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm font-medium text-teal-900"><input type="checkbox" checked={withMovement} onChange={event=>void enableMovement(event.target.checked)}/> Generar también un Movimiento</label>}
      {withMovement ? <div className="space-y-3 rounded-xl border border-slate-200 p-3">
        <p className="text-xs text-slate-600">Tipo en Movimientos: <strong>{item.kind === 'expense' ? 'Egreso (Salida)' : 'Ingreso (Entrada)'}</strong></p>
        {loadingOptions ? <p className="text-xs text-slate-500">Cargando cajas y conceptos…</p> : <>
          <label className="block text-sm font-medium">Caja de Movimientos<select required value={accountId} onChange={event=>setAccountId(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"><option value="">Seleccioná una caja</option>{compatibleAccounts.map(account=><option key={account.id} value={account.id}>{account.name} ({account.currency})</option>)}</select></label>
          <label className="block text-sm font-medium">Buscar tipo o concepto<input type="search" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Concepto, categoría o subcategoría" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"/></label>
          <label className="block text-sm font-medium">Concepto de Movimientos<select required value={conceptId} onChange={event=>setConceptId(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"><option value="">Seleccioná un concepto</option>{selectedConcept && !filteredConcepts.some(concept=>concept.id===selectedConcept.id) && <option value={selectedConcept.id}>{selectedConcept.concept} · {selectedConcept.category}</option>}{filteredConcepts.map(concept=><option key={concept.id} value={concept.id}>{concept.concept} · {concept.category}{concept.sub_category ? ` · ${concept.sub_category}` : ''} · {concept.movement_type}</option>)}</select></label>
          {selectedConcept && <p className="text-xs text-slate-500">{selectedConcept.category}{selectedConcept.sub_category ? ` › ${selectedConcept.sub_category}` : ''}{selectedConcept.efe_category ? ` · EFE: ${selectedConcept.efe_category}` : ''}</p>}
          {selectedConcept && ['Proveedores','Sueldos'].includes(selectedConcept.category) && <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">Se creará el Movimiento. La imputación a compras, cuenta corriente o legajo se completa en el módulo correspondiente.</p>}
          <label className="block text-sm font-medium">Detalle del Movimiento<input required minLength={2} value={detail} onChange={event=>setDetail(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"/></label>
        </>}
        <p className="text-xs text-slate-500">El Movimiento y la realización se guardan juntos. La caja elegida determina el fondo donde se registra el importe realizado.</p>
      </div> : <label className="block text-sm font-medium">Fondo de planificación<select value={fundId} onChange={event=>setFundId(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2">{funds.filter(fund=>fund.currency===sourceFund.currency).map(fund=><option key={fund.id} value={fund.id}>{fund.name}</option>)}</select></label>}
      <label className="block text-sm font-medium">Nota<input value={notes} onChange={event=>setNotes(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"/></label>
      <div className="flex justify-end gap-2 pt-2"><button type="button" onClick={onBack || onClose} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">{onBack ? 'Volver' : 'Cerrar'}</button><button disabled={working || (withMovement && (loadingOptions || !options))} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{working?'Guardando…':withMovement?'Guardar y generar Movimiento':'Guardar'}</button></div>
    </form>
  </div>;
}

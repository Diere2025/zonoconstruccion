'use client';

import { useEffect, useRef, useState } from 'react';
import { displayDate, type buildReport } from '@/lib/eerrNative/model';
import { exchangeStatuses, initialExchangeReview, validateExchangeReview, type ExchangeReview, type ExchangeStatus } from '@/lib/eerrNative/exchanges';

type Exchange = ReturnType<typeof buildReport>['exchanges'][number];
const money = new Intl.NumberFormat('es-AR', {style: 'currency', currency: 'ARS', maximumFractionDigits: 0});
const field = 'block w-full rounded border border-slate-300 bg-white px-2 py-1.5';

export default function NativeEerrExchanges({ exchanges, canReview, onSave }: {
  exchanges: Exchange[];
  canReview: boolean;
  onSave: (id: string, review: ExchangeReview) => Promise<void>;
}) {
  const [selected, setSelected] = useState<Exchange | null>(null);
  const [draft, setDraft] = useState(initialExchangeReview);
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const statusField = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (selected) statusField.current?.focus();
  }, [selected]);

  function edit(exchange: Exchange) {
    const review = exchange.review ?? initialExchangeReview;
    setSelected(exchange);
    setDraft(review);
    setAmount(review.recognized_amount === null ? '' : String(review.recognized_amount));
    setError('');
  }

  const supplierReview = draft.status.startsWith('supplier_');
  const recognized = draft.status === 'supplier_partial' || draft.status === 'supplier_recognized';

  async function save() {
    if (!selected || saving) return;
    setError('');
    try {
      const review = validateExchangeReview({
        ...draft,
        recognized_amount: recognized && amount !== '' ? Number(amount) : null,
      });
      setSaving(true);
      await onSave(selected.id, review);
      setSelected(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la revisión.');
    } finally {
      setSaving(false);
    }
  }

  return <div className="space-y-3">
    <h2 className="font-semibold">Seguimiento de cambios</h2>
    <p className="text-sm text-slate-600">El costo de reposición identificado se incluye en el CMV. Registrá acá el reclamo, el reconocimiento o el destino del producto devuelto.</p>
    {!canReview && <p role="status" className="text-sm text-amber-800">El seguimiento todavía no está habilitado para guardar.</p>}
    {exchanges.length === 0 ? <p className="text-sm">No hay cambios entregados en el período.</p> : (
      <div className="overflow-auto">
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b">
            <th className="p-2">Fecha</th><th>Cambio y reposición</th><th>Costo incluido</th><th>Seguimiento</th><th><span className="sr-only">Acciones</span></th>
          </tr></thead>
          <tbody>{[...exchanges].sort((a,b) => b.day.localeCompare(a.day) || a.code.localeCompare(b.code)).map(exchange => (
            <tr key={exchange.id} className="border-b align-top">
              <td className="whitespace-nowrap p-2">{displayDate(exchange.day)}</td>
              <td className="min-w-36 p-2">
                <strong>{exchange.code}</strong>
                {exchange.products.map(({name,quantity},i) => <span key={i} className="block text-xs text-slate-600">{quantity} × {name}</span>)}
              </td>
              <td className="whitespace-nowrap p-2">
                {money.format(exchange.cost)}
                {exchange.costIncomplete && <span className="block text-xs text-amber-800">Costo incompleto</span>}
              </td>
              <td className="min-w-44 p-2">
                {exchangeStatuses[exchange.review?.status ?? 'pending']}
                {exchange.review?.supplier && <span className="block text-xs">{exchange.review.supplier}</span>}
                {exchange.review?.recognized_amount != null && <span className="block text-xs">Reconocido {money.format(exchange.review.recognized_amount)}</span>}
                {exchange.review?.note && <span className="block whitespace-pre-wrap break-words text-xs text-slate-600">{exchange.review.note}</span>}
              </td>
              <td className="p-2"><button type="button" disabled={!canReview || saving} onClick={() => edit(exchange)} className="text-indigo-700 underline disabled:opacity-40">Revisar<span className="sr-only"> {exchange.code}</span></button></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    )}
    {selected && <form onSubmit={event => {event.preventDefault(); void save();}} className="space-y-2 rounded-lg border border-slate-200 p-3">
      <h3 className="font-semibold">Revisión de {selected.code}</h3>
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
      <fieldset disabled={saving || !canReview} className="grid gap-3 text-sm sm:grid-cols-2">
        <label>Estado
          <select ref={statusField} className={field} value={draft.status} onChange={event => setDraft({...draft,status:event.target.value as ExchangeStatus})}>
            {Object.entries(exchangeStatuses).map(([value,label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        {supplierReview && <label>Proveedor<input className={field} required maxLength={160} value={draft.supplier} onChange={event => setDraft({...draft,supplier:event.target.value})}/></label>}
        {recognized && <label>Importe reconocido en ARS (opcional)<input className={field} type="number" min="0.01" max="1000000000000" step="0.01" value={amount} onChange={event => setAmount(event.target.value)}/><span className="text-xs text-slate-600">Se guarda como referencia de seguimiento.</span></label>}
        <label className="sm:col-span-2">Detalle o referencia del comprobante
          <textarea className={field} rows={3} required={draft.status !== 'pending'} maxLength={1500} placeholder={supplierReview ? 'Por ejemplo, reposición del proveedor o número de nota de crédito' : 'Indicá el producto devuelto, la falla y qué se hizo con él'} value={draft.note} onChange={event => setDraft({...draft,note:event.target.value})}/>
        </label>
        <div className="flex gap-3 sm:col-span-2">
          <button className="rounded bg-indigo-700 px-3 py-2 text-white" type="submit">{saving ? 'Guardando…' : 'Guardar seguimiento'}</button>
          <button className="underline" type="button" onClick={() => setSelected(null)}>Cancelar</button>
        </div>
      </fieldset>
    </form>}
  </div>;
}

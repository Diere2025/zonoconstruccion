'use client';

import {useEffect,useRef,useState,type FormEvent} from 'react';
import ErpDateInput from '@/components/ui/ErpDateInput';
import ErpTimeInput from '@/components/ui/ErpTimeInput';
import {supabase} from '@/lib/supabase';
import {createAuthenticatedRequester} from '@/lib/authenticatedRequest';
import {displayDateField} from '@/lib/dates/dateFields';
import {movementKinds,tracksOriginalAmount,wallets,type Entry,type MovementKind,type Reconciliation,type Wallet} from '@/lib/cryptoReconciliation';

const api = createAuthenticatedRequester(supabase);
const endpoint = '/api/admin/crypto-reconciliation';
const input = 'w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm';
const button = 'rounded border border-slate-300 bg-white px-3 py-2 text-sm disabled:opacity-50';
const currency = (wallet:Wallet) => wallet === 'ads' ? 'USD' : 'USDT';

function errorMessage(error:unknown) {
  return error instanceof Error && !(error instanceof SyntaxError)
    ? error.message : 'No se pudo completar la operación. Volvé a intentar.';
}

function formatAmount(value:string, unit:string) {
  const [whole,fraction] = value.split('.');
  const decimals = fraction?.replace(/0+$/,'') || '';
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g,'.')+(decimals ? ','+decimals : '')+' '+unit;
}

function AmountField({name,label,required=true}:{name:string;label:string;required?:boolean}) {
  return <label className="space-y-1 text-sm">{label}
    <input className={input} name={name} inputMode="decimal" required={required} maxLength={21}/>
  </label>;
}

function MovementAmount({entry}:{entry:Entry}) {
  const {kind,wallet,amount,credited,bank_amount,transfer_fee,original_amount,original_currency} = entry;
  return <>
    <div>{Number(amount) === 0 && tracksOriginalAmount(kind) ? 'Débito en USDT pendiente' : formatAmount(amount,currency(wallet))}{credited && <> → {formatAmount(credited,kind === 'transfer' ? 'USDT' : 'USD')}</>}</div>
    {transfer_fee && Number(transfer_fee) > 0 && <div className="text-slate-600">Comisión incluida {formatAmount(transfer_fee,'USDT')}</div>}
    {bank_amount && <div className="text-slate-600">{formatAmount(bank_amount,'ARS')} · {new Intl.NumberFormat('es-AR',{maximumFractionDigits:2}).format(Number(bank_amount)/Number(amount))} ARS/USDT</div>}
    {original_amount && original_currency && <div className="text-slate-600">Cargo original {formatAmount(original_amount,original_currency)}</div>}
  </>;
}

export default function BinanceReconciliationPage() {
  const [kind,setKind] = useState<MovementKind>('p2p');
  const [wallet,setWallet] = useState<Wallet>('binance');
  const [day,setDay] = useState('');
  const [time,setTime] = useState('');
  const [page,setPage] = useState(0);
  const [revision,reload] = useState(0);
  const [data,setData] = useState<Reconciliation|null>(null);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [readError,setReadError] = useState('');
  const [notice,setNotice] = useState('');
  const [voidEntry,setVoidEntry] = useState<Entry|null>(null);
  const attempt = useRef<{payload:string;id:string}|null>(null);
  const writing = useRef(false);
  const availableWallets = movementKinds[kind].wallets;

  useEffect(() => {
    let active = true;
    api(endpoint+'?page='+page).then((result:Reconciliation) => {
      if (active) setData(result);
    }).catch(error => {
      if (active) setReadError(errorMessage(error));
    });
    return () => { active = false; };
  },[page,revision]);

  function refresh(target:number) {
    setReadError('');
    setData(null);
    setPage(target);
    reload(value => value+1);
  }

  async function mutate(event:FormEvent<HTMLFormElement>, entryToVoid?:Entry) {
    event.preventDefault();
    if (writing.current) return;
    const form = event.currentTarget;
    const fields = Object.fromEntries(new FormData(form));
    const entry = {...fields,kind,wallet,day,time};
    const payload = JSON.stringify(entry);
    if (!entryToVoid && attempt.current?.payload !== payload) attempt.current = {payload,id:crypto.randomUUID()};
    const body = entryToVoid
      ? {action:'void',id:entryToVoid.id,reason:fields.reason}
      : {action:'save',id:attempt.current?.id,entry};
    writing.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api(endpoint,{method:'POST',body:JSON.stringify(body)});
      if (entryToVoid) setVoidEntry(null);
      else {
        attempt.current = null;
        form.reset();
        setDay('');
        setTime('');
      }
      setNotice(entryToVoid ? 'Movimiento anulado.' : 'Movimiento registrado.');
      refresh(entryToVoid ? page : 0);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      writing.current = false;
      setBusy(false);
    }
  }

  return <main className="mx-auto max-w-6xl space-y-5 px-4 py-6">
    <header>
      <h1 className="text-2xl font-bold">Binance y Redot</h1>
      <p className="mt-1 text-sm text-slate-600">Conciliá los pagos en pesos con las compras P2P, las transferencias, la publicidad y los servicios del exterior.</p>
    </header>
    <p className="rounded border border-blue-200 bg-blue-50 p-3 text-sm">Vinculá la compra con su pago en pesos y registrá cada transferencia o consumo. El EERR toma el costo de los fondos consumidos según su destino.</p>
    {readError && <p role="alert" className="text-sm text-red-700">{readError} <button type="button" className="underline" onClick={() => refresh(page)}>Reintentar</button></p>}
    {data && <div className="grid gap-3 sm:grid-cols-3">
      {(Object.keys(wallets) as Wallet[]).map(key => {
        const balance = data.balances?.[key];
        return <div key={key} className="rounded-lg border bg-white p-4">
          <div className="text-sm font-medium">{wallets[key]}</div>
          <strong className="text-xl">{formatAmount(balance?.amount ?? '0',currency(key))}</strong>
          <div className="text-xs text-slate-600">{balance?.hasOpening ? 'Saldo según movimientos registrados' : 'Movimientos netos · falta cargar saldo inicial'}</div>
          {Number(balance?.amount) < 0 && <div className="text-xs text-amber-800">Revisá si falta registrar un ingreso o el saldo inicial.</div>}
        </div>;
      })}
    </div>}
    {!readError && <section className="rounded-lg border bg-white p-4">
      <h2 className="mb-3 font-semibold">Registrar movimiento</h2>
      <form onSubmit={event => void mutate(event)}>
        <fieldset disabled={busy || Boolean(voidEntry)} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="space-y-1 text-sm">Tipo de movimiento
            <select aria-label="Tipo de movimiento" className={input} value={kind} onChange={event => {
              const next = event.target.value as MovementKind;
              setKind(next);
              setWallet(movementKinds[next].wallets[0]);
            }}>
              {Object.entries(movementKinds).map(([key,item]) => <option key={key} value={key}>{item.label}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm">Cuenta
            <select aria-label="Cuenta" className={input} value={wallet} onChange={event => setWallet(event.target.value as Wallet)}>
              {availableWallets.map(key => <option key={key} value={key}>{wallets[key]}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm">Fecha
            <ErpDateInput aria-label="Fecha del movimiento" className={input} value={day} onChange={event => setDay(event.target.value)} required/>
          </label>
          <label className="space-y-1 text-sm">Hora (si está confirmada)
            <ErpTimeInput label="Hora del movimiento" className={input} value={time} onChange={setTime}/>
          </label>
          <label className="space-y-1 text-sm">{kind === 'p2p' ? 'ID de orden Binance P2P' : kind === 'transfer' ? 'ID o hash de la transferencia' : 'Referencia del movimiento'}
            <input className={input} name="reference" required maxLength={200}/>
          </label>
          <AmountField key={kind} name="amount" required={!tracksOriginalAmount(kind)} label={kind === 'p2p' ? 'USDT recibidos en Binance' : ['transfer','ad_funding'].includes(kind) ? 'USDT debitados de la cuenta' : tracksOriginalAmount(kind) ? 'Débito en USDT (si está confirmado)' : 'Importe en '+currency(wallet)}/>
          {kind === 'transfer' && <AmountField name="credited" label="USDT acreditados en Redot"/>}
          {kind === 'ad_funding' && <>
            <AmountField name="credited" label="USD totales acreditados en publicidad"/>
            <AmountField name="paid_credit" label="USD de la carga (si el total incluye un reintegro)" required={false}/>
          </>}
          {kind === 'p2p' && <>
            <label className="space-y-1 text-sm">Código del egreso del ERP
              <input className={input} name="bank_code" placeholder="PAG-…" required maxLength={40}/>
            </label>
            <AmountField name="bank_amount" label="Importe del pago en ARS"/>
          </>}
          {tracksOriginalAmount(kind) && <>
            <AmountField name="original_amount" label="Importe original del cargo (opcional)" required={false}/>
            <label className="space-y-1 text-sm">Moneda original (opcional)
              <input className={input} name="original_currency" placeholder="USD" maxLength={3}/>
            </label>
          </>}
          <label className="space-y-1 text-sm sm:col-span-2">Proveedor, comprobante o detalle
            <input className={input} name="detail" maxLength={1000}/>
          </label>
          <div className="self-end">
            <button className="rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={!data}>{busy ? 'Guardando…' : 'Guardar movimiento'}</button>
          </div>
        </fieldset>
      </form>
    </section>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {notice && <p role="status" className="text-sm text-emerald-800">{notice}</p>}
    {voidEntry && <form className="space-y-3 rounded-lg border border-red-200 bg-white p-4" onSubmit={event => void mutate(event,voidEntry)}>
      <h2 className="font-semibold">Anular {voidEntry.reference}</h2>
      <label className="block text-sm">Motivo de anulación<input className={input} name="reason" minLength={3} maxLength={1000} required disabled={busy}/></label>
      <div className="flex gap-2">
        <button className={button+' text-red-700'} disabled={busy}>Confirmar anulación</button>
        <button className={button} type="button" disabled={busy} onClick={() => {setVoidEntry(null);setError('');}}>Volver</button>
      </div>
    </form>}
    <section className="space-y-3">
      <h2 className="font-semibold">Historial de conciliación</h2>
      {data?.entries.length ? <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50"><tr>{['Fecha','Movimiento','Referencia','Importes','Estado'].map(label => <th key={label} className="p-3">{label}</th>)}</tr></thead>
          <tbody>{data.entries.slice(0,50).map(entry => <tr key={entry.id} className="border-t align-top">
            <td className="whitespace-nowrap p-3">{displayDateField(entry.day)}</td>
            <td className="p-3">{movementKinds[entry.kind].label}<div className="text-slate-600">{wallets[entry.wallet]}</div></td>
            <td className="break-words p-3">{entry.reference}{entry.detail && <div className="text-slate-600">{entry.detail}</div>}
              {entry.bank_code && <div className="text-slate-600">{entry.bank_transaction_id ? <a className="text-blue-700 underline" href={'/admin/finanzas?tab=flow&transaction='+entry.bank_transaction_id}>{entry.bank_code}</a> : entry.bank_code}{entry.bank_account && ' · '+entry.bank_account}</div>}
            </td>
            <td className="whitespace-nowrap p-3"><MovementAmount entry={entry}/></td>
            <td className="p-3">{entry.void_reason ? <span>Anulado · {entry.void_reason}</span> : <>
              <div>{entry.bank_matches === false ? <span className="text-amber-800">Revisar egreso vinculado</span> : entry.bank_matches ? 'Egreso vinculado' : 'Registrado'}</div>
              <button type="button" className="mt-1 text-red-700 underline disabled:opacity-50" disabled={busy || Boolean(voidEntry)} onClick={() => {setVoidEntry(entry);setNotice('');setError('');}}>Anular</button>
            </>}</td>
          </tr>)}</tbody>
        </table>
      </div> : <p className="text-sm text-slate-600">{data ? 'Todavía no hay movimientos registrados.' : readError ? 'Historial no disponible.' : 'Cargando historial…'}</p>}
      {data && (page > 0 || data.entries.length > 50) && <div className="flex gap-2">
        <button type="button" className={button} disabled={page === 0 || busy || Boolean(voidEntry)} onClick={() => refresh(page-1)}>Anterior</button>
        <button type="button" className={button} disabled={data.entries.length <= 50 || busy || Boolean(voidEntry)} onClick={() => refresh(page+1)}>Siguiente</button>
      </div>}
    </section>
  </main>;
}

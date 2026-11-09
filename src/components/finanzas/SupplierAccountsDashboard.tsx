'use client';

import {displayReportDate} from '@/components/ui/ReportDateRangePicker';
import {hasSupplierBalance,supplierBalanceStatus,supplierBalanceTotals,visibleSuppliers,type SupplierAccountSummary,type SupplierVisibility} from '@/lib/supplierAccounts/report';

export const supplierMoney=(amount:number|string,currency:string)=>`${currency==='USD'?'US$':'$'} ${Number(amount).toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2})}`;

export default function SupplierAccountsDashboard({suppliers,to,showHidden,months,busy,onSelect,onMonthsChange,onVisibilityChange}:{
  suppliers:SupplierAccountSummary[]; to:string; showHidden:boolean; months:number; busy:boolean;
  onSelect:(supplierId:string)=>void; onMonthsChange:(months:number)=>void;
  onVisibilityChange:(supplierId:string,visibility:SupplierVisibility)=>void;
}){
  const configured=suppliers.filter(supplier=>hasSupplierBalance(supplier,to)).length;
  const listed=visibleSuppliers(suppliers,showHidden);
  return <div className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div><h4 className="font-semibold">Estado general</h4>
        <p className="text-sm text-slate-500">{to?'Saldos al '+displayReportDate(to):'Saldos vigentes'}</p></div>
      <p className="text-sm text-slate-600">Totales de todos los proveedores · {configured} de {suppliers.length} con saldo calculable</p>
    </div>
    <div className="grid gap-3 sm:grid-cols-2">
      {supplierBalanceTotals(suppliers,to).map(total=><section key={total.currency} className="rounded-xl border bg-slate-50 p-4">
        <p className="text-xs font-semibold text-slate-600">{total.currency} · Saldo neto</p>
        <p className={`mt-1 text-xl font-bold ${total.net>0?'text-rose-700':'text-emerald-700'}`}>{supplierMoney(total.net,total.currency)}</p>
        <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-700">
          <div><dt>Deuda total</dt><dd className="font-semibold">{supplierMoney(total.debt,total.currency)}</dd></div>
          <div><dt>Saldo a favor total</dt><dd className="font-semibold">{supplierMoney(total.credit,total.currency)}</dd></div>
        </dl>
      </section>)}
    </div>
    <form key={months} className="flex flex-wrap items-end gap-3 rounded-lg border p-3" onSubmit={event=>{
      event.preventDefault();
      onMonthsChange(Number(new FormData(event.currentTarget).get('months')));
    }}>
      <label className="text-sm">Meses de actividad para cuentas con saldo cero
        <input name="months" type="number" min="1" max="120" step="1" required defaultValue={months} disabled={busy}
          className="ml-2 w-20 rounded-lg border px-2 py-1.5"/>
      </label>
      <button type="submit" disabled={busy} className="rounded-lg border px-3 py-1.5 text-sm disabled:opacity-50">Guardar plazo</button>
      <p className="w-full text-xs text-slate-500">La regla automática usa el saldo en ARS y USD y la fecha del último movimiento.</p>
    </form>
    <p className="text-sm text-slate-600">{listed.length} de {suppliers.length} proveedores en el listado</p>
    <div className="overflow-auto rounded-xl border"><table className="w-full text-left text-sm">
      <thead className="bg-slate-50"><tr>{['Proveedor','Inicio de cuenta','Estado en ARS','Estado en USD','Último movimiento','Visibilidad'].map(label=><th key={label} scope="col" className="px-3 py-2">{label}</th>)}</tr></thead>
      <tbody className="divide-y">{listed.map(supplier=>{
        const known=hasSupplierBalance(supplier,to);
        return <tr key={supplier.id}>
          <td className="px-3 py-2"><button type="button" onClick={()=>onSelect(supplier.id)} className="text-left font-semibold text-brand-700 underline">{supplier.name}</button></td>
          <td className="whitespace-nowrap px-3 py-2">{supplier.start_date?displayReportDate(supplier.start_date):'Sin apertura'}</td>
          {(['ARS','USD'] as const).map(currency=>{
            const balance=Number(currency==='ARS'?supplier.balance_ars:supplier.balance_usd);
            return <td key={currency} className="whitespace-nowrap px-3 py-2">
              {known?<span className={balance>0?'text-rose-700':balance<0?'text-emerald-700':'text-slate-600'}>{supplierBalanceStatus(balance)} · {supplierMoney(Math.abs(balance),currency)}</span>
                :<span className="text-slate-500">{supplier.start_date?'Sin saldo al corte':'Sin apertura'}</span>}
            </td>;
          })}
          <td className="whitespace-nowrap px-3 py-2">{supplier.last_movement?displayReportDate(supplier.last_movement):'Sin movimientos'}</td>
          <td className="px-3 py-2">
            <select aria-label={'Visibilidad de '+supplier.name} value={supplier.visibility||'automatic'} disabled={busy}
              onChange={event=>onVisibilityChange(supplier.id,event.target.value as SupplierVisibility)}
              className="rounded-lg border px-2 py-1.5 text-xs">
              <option value="automatic">Automática</option><option value="visible">Siempre visible</option><option value="hidden">Oculto</option>
            </select>
            {supplier.visible===false&&<p className="mt-1 text-xs text-slate-500">Fuera del listado habitual</p>}
          </td>
        </tr>;
      })}</tbody>
    </table>{!listed.length&&<p className="p-4 text-sm text-slate-500">No hay proveedores para esta selección.</p>}</div>
  </div>;
}

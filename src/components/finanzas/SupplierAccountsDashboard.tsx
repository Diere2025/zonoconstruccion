'use client';

import ReportDateRangePicker,{displayReportDate} from '@/components/ui/ReportDateRangePicker';
import {defaultSupplierDashboardView,hasSupplierBalance,listSupplierDashboard,supplierBalanceStatus,supplierBalanceTotals,supplierDashboardColumns,
  type SupplierAccountSummary,type SupplierDashboardView,type SupplierVisibility} from '@/lib/supplierAccounts/report';

export const supplierMoney=(amount:number|string,currency:string)=>`${currency==='USD'?'US$':'$'} ${Number(amount).toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const field='h-10 rounded border border-slate-300 bg-white px-2 text-sm';
const balanceOptions=['Debemos','A favor','Al día','Sin saldo calculable'];

export default function SupplierAccountsDashboard({suppliers,to,view,onViewChange,months,busy,onSelect,onMonthsChange,onVisibilityChange}:{
  suppliers:SupplierAccountSummary[]; to:string; view:SupplierDashboardView; onViewChange:(view:SupplierDashboardView)=>void; months:number; busy:boolean;
  onSelect:(supplierId:string)=>void; onMonthsChange:(months:number)=>void;
  onVisibilityChange:(supplierId:string,visibility:SupplierVisibility)=>void;
}){
  const configured=suppliers.filter(supplier=>hasSupplierBalance(supplier,to)).length;
  const listed=listSupplierDashboard(suppliers,to,false,view);
  const hiddenCount=suppliers.filter(supplier=>supplier.visible===false).length;
  const groupCount=view.tab==='hidden'?hiddenCount:suppliers.length-hiddenCount;
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
    <div role="tablist" aria-label="Visibilidad de proveedores" className="flex gap-1 border-b">
      {([['visible','Visibles',suppliers.length-hiddenCount],['hidden','Ocultos',hiddenCount]] as const).map(([tab,label,count])=>
        <button key={tab} id={'supplier-dashboard-tab-'+tab} type="button" role="tab" aria-selected={view.tab===tab} tabIndex={view.tab===tab?0:-1}
          aria-controls="supplier-dashboard-list" onClick={()=>onViewChange({...view,tab})}
          onKeyDown={event=>{
            if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
            event.preventDefault();
            const next=event.key==='Home'?'visible':event.key==='End'?'hidden':tab==='visible'?'hidden':'visible';
            onViewChange({...view,tab:next});
            document.getElementById('supplier-dashboard-tab-'+next)?.focus();
          }}
          className={`border-b-2 px-3 py-2 text-sm ${view.tab===tab?'border-brand-600 font-semibold text-brand-700':'border-transparent'}`}>{label} ({count})</button>)}
    </div>
    <div role="tabpanel" id="supplier-dashboard-list" aria-labelledby={'supplier-dashboard-tab-'+view.tab} className="space-y-3">
    <div className="flex flex-wrap items-end gap-3 rounded-lg border p-3">
      <label className="flex flex-col gap-1 text-xs font-medium">Filtrar por nombre
        <input className={field} type="search" value={view.name} maxLength={200} onChange={event=>onViewChange({...view,name:event.target.value})}/>
      </label>
      {([['ars','ARS'],['usd','USD']] as const).map(([key,currency])=><label key={key} className="flex flex-col gap-1 text-xs font-medium">Estado en {currency}
        <select aria-label={'Filtrar estado en '+currency} className={field} value={view[key]} onChange={event=>onViewChange({...view,[key]:event.target.value})}>
          <option value="">Todos</option>{balanceOptions.map(status=><option key={status}>{status}</option>)}
        </select>
      </label>)}
      <label className="flex flex-col gap-1 text-xs font-medium">Filtrar por visibilidad
        <select aria-label="Filtrar por visibilidad" className={field} value={view.visibility} onChange={event=>onViewChange({...view,visibility:event.target.value})}>
          <option value="">Todas</option><option value="automatic">Automática</option>
          <option value="visible">Siempre visible</option><option value="hidden">Oculto</option>
        </select>
      </label>
      <div className="space-y-1">
        <p className="text-xs font-medium">Inicio de cuenta</p>
        <ReportDateRangePicker hideLabel emptyLabel="Cualquier inicio" from={view.startFrom} to={view.startTo}
          onChange={(startFrom,startTo)=>onViewChange({...view,startFrom,startTo})}/>
      </div>
      <div className="space-y-1">
        <p className="text-xs font-medium">Último movimiento</p>
        <ReportDateRangePicker hideLabel align="end" emptyLabel="Cualquier movimiento" from={view.movementFrom} to={view.movementTo}
          onChange={(movementFrom,movementTo)=>onViewChange({...view,movementFrom,movementTo})}/>
      </div>
      <button type="button" className="h-10 px-2 text-sm text-brand-700 underline"
        onClick={()=>onViewChange({...defaultSupplierDashboardView,tab:view.tab,sort:view.sort,direction:view.direction})}>Limpiar filtros del listado</button>
    </div>
    <p aria-live="polite" className="text-sm text-slate-600">{listed.length} de {groupCount} proveedores en el listado</p>
    <div className="overflow-auto rounded-xl border"><table className="w-full text-left text-sm">
      <thead className="bg-slate-50"><tr>{supplierDashboardColumns.map(([key,label])=>{
        const active=view.sort===key;
        return <th key={key} scope="col" className="whitespace-nowrap px-3 py-2"
          aria-sort={active?(view.direction==='asc'?'ascending':'descending'):undefined}>
          <button type="button" className="text-left hover:underline" onClick={()=>{
            const alphabetical=key==='name'||key==='visibility';
            onViewChange({...view,sort:key,direction:active?(view.direction==='asc'?'desc':'asc'):(alphabetical?'asc':'desc')});
          }}>{label} <span aria-hidden="true" className={active?'text-brand-700':'text-slate-400'}>{active?(view.direction==='asc'?'↑':'↓'):'↕'}</span></button>
        </th>;
      })}</tr></thead>
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
    </div>
  </div>;
}

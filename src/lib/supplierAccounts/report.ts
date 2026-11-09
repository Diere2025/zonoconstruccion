import type { AccountStart, LedgerEntry } from '../supplierAccount';

export type SupplierVisibility = 'automatic'|'visible'|'hidden';
export type SupplierAccountSummary = {
  id:string; name:string; start_date:string|null; balance_ars:number|string; balance_usd:number|string;
  last_movement?:string|null; visibility?:SupplierVisibility; visible?:boolean;
};
export type SupplierStatement = {
  start:AccountStart|null; rows:LedgerEntry[]; balance_ars:number; balance_usd:number;
  previous_balance_ars:number; previous_balance_usd:number; total:number; page:number; pageSize:number;
};
export type ReportCell = string | number;
export type SupplierAccountReport = { title:string; context:string; notes:ReportCell[][]; headers:string[]; rows:ReportCell[][] };
export type SupplierReportFilters = { supplier?:string; from:string; to:string; currency:string; view:string; query:string; showHidden?:boolean };

export const visibleSuppliers=(suppliers:SupplierAccountSummary[],showHidden=false)=>
  showHidden?suppliers:suppliers.filter(supplier=>supplier.visible!==false);
const dateLabel=(day:string)=>day.split('-').reverse().join('/');
export const supplierEntryNote=(row:LedgerEntry)=>row.source==='payment'&&row.notes?.trim().toLowerCase().startsWith('vinculado por')
  ? '' : row.notes||'';
export const hasSupplierBalance=(supplier:SupplierAccountSummary,to:string)=>!!supplier.start_date&&(!to||supplier.start_date<=to);
export const supplierBalanceStatus=(balance:number)=>balance>0?'Debemos':balance<0?'A favor':'Al día';
const amount=(balance:number|string)=>Math.round(Number(balance)*100);
export function supplierBalanceTotals(suppliers:SupplierAccountSummary[],to:string) {
  return (['ARS','USD'] as const).map(currency=>{
    const field=currency==='ARS'?'balance_ars':'balance_usd';
    let debt=0,credit=0;
    for(const supplier of suppliers){
      if(!hasSupplierBalance(supplier,to))continue;
      const value=amount(supplier[field]);
      if(value>0)debt+=value;
      else credit-=value;
    }
    return {currency,debt:debt/100,credit:credit/100,net:(debt-credit)/100};
  });
}

export function buildSupplierAccountReport(data:Partial<SupplierStatement> & {suppliers?:SupplierAccountSummary[]},filters:SupplierReportFilters):SupplierAccountReport {
  const period=[filters.from&&'Desde '+dateLabel(filters.from),filters.to&&'Hasta '+dateLabel(filters.to)].filter(Boolean).join(' · ')||'Todo el período';
  if(data.suppliers){
    const listed=visibleSuppliers(data.suppliers,filters.showHidden);
    return {
      title:'Cuentas corrientes de proveedores',context:filters.to?'Saldos al '+dateLabel(filters.to):'Saldos vigentes',
      notes:[['Totales de todos los proveedores'],['Moneda','Deuda total','A favor total','Saldo neto'],...supplierBalanceTotals(data.suppliers,filters.to)
        .map(total=>[total.currency,total.debt,total.credit,total.net])],
      headers:['Proveedor','Inicio de cuenta','Estado ARS','Saldo ARS','Estado USD','Saldo USD','Último movimiento','Visibilidad'],
      rows:listed.map(supplier=>{
        const ars=Number(supplier.balance_ars),usd=Number(supplier.balance_usd);
        const known=hasSupplierBalance(supplier,filters.to);
        const unavailable=supplier.start_date?'Sin saldo al corte':'Sin apertura';
        return [supplier.name,supplier.start_date?dateLabel(supplier.start_date):'',
          known?supplierBalanceStatus(ars):unavailable,known?ars:'',
          known?supplierBalanceStatus(usd):unavailable,known?usd:'',
          supplier.last_movement?dateLabel(supplier.last_movement):'',
          supplier.visibility==='visible'?'Siempre visible':supplier.visibility==='hidden'?'Oculto':
            supplier.visible===false?'Automática · Oculto':'Automática'];
      }),
    };
  }
  const usd=filters.currency==='USD';
  const current=filters.view==='current';
  const closing=(usd?data.balance_usd:data.balance_ars)??0;
  const prior=(usd?data.previous_balance_usd:data.previous_balance_ars)??0;
  const rows:ReportCell[][]=(data.rows||[]).map(row=>[
    dateLabel(row.entry_date),row.kind,row.reference,row.amount>0?row.amount:'',row.amount<0?-row.amount:'',
    row.balance??'',(row.applications||[]).map(ref=>ref.kind+' · '+ref.code).join(', '),
    row.voided?'Anulado':row.included?'Incluido':'Fuera del saldo',supplierEntryNote(row),row.reconciliation_note,
  ]);
  const start=data.start;
  if(current&&start&&!filters.query&&(!filters.from||start.start_date>=filters.from)&&(!filters.to||start.start_date<=filters.to)){
    rows.push([dateLabel(start.start_date),'Saldo inicial','','','',Number(usd?start.opening_usd:start.opening_ars),'','','','']);
  }
  return {
    title:'CC Proveedores · '+(filters.supplier||'Proveedor'),
    context:[current?'Extracto vigente':'Historial para conciliar',filters.currency,period,filters.query&&'Búsqueda: '+filters.query].filter(Boolean).join(' · '),
    notes:[...(filters.from?[['Saldo anterior al período',prior]]:[]),['Saldo '+(filters.to?'al '+dateLabel(filters.to):'vigente'),closing]],
    headers:['Fecha','Tipo','Código','Cargo','Crédito','Saldo','Aplicaciones','Conciliación','Observaciones','Motivo de conciliación'],
    rows,
  };
}

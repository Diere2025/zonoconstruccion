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
export type SupplierReportFilters = { supplier?:string; from:string; to:string; currency:string; view:string; query:string; showHidden?:boolean; dashboard?:SupplierDashboardView };
export const supplierDashboardColumns = [
  ['name','Proveedor'],['start_date','Inicio de cuenta'],['balance_ars','Estado en ARS'],
  ['balance_usd','Estado en USD'],['last_movement','Último movimiento'],['visibility','Visibilidad'],
] as const;
export type SupplierDashboardColumn = typeof supplierDashboardColumns[number][0];
export const defaultSupplierDashboardView = {
  name:'', ars:'', usd:'', startFrom:'', startTo:'', movementFrom:'', movementTo:'', visibility:'',
  sort:'name' as SupplierDashboardColumn, direction:'asc' as 'asc'|'desc', tab:'visible' as 'visible'|'hidden',
};
export type SupplierDashboardView = typeof defaultSupplierDashboardView;

export function supplierDashboardViewFromParams(params:URLSearchParams):SupplierDashboardView {
  const sort=params.get('dashboard.sort');
  return {
    name:params.get('dashboard.name')?.slice(0,200)||'',
    ars:params.get('dashboard.ars')||'', usd:params.get('dashboard.usd')||'',
    startFrom:params.get('dashboard.startFrom')||'', startTo:params.get('dashboard.startTo')||'',
    movementFrom:params.get('dashboard.movementFrom')||'', movementTo:params.get('dashboard.movementTo')||'',
    visibility:params.get('dashboard.visibility')||'',
    sort:supplierDashboardColumns.find(([key])=>key===sort)?.[0]||'name',
    direction:params.get('dashboard.direction')==='desc'?'desc':'asc',
    tab:params.get('dashboard.tab')==='hidden'?'hidden':'visible',
  };
}

export const visibleSuppliers=(suppliers:SupplierAccountSummary[],showHidden=false)=>
  showHidden?suppliers:suppliers.filter(supplier=>supplier.visible!==false);
const dateLabel=(day:string)=>day.split('-').reverse().join('/');
export const supplierEntryNote=(row:LedgerEntry)=>row.source==='payment'&&row.notes?.trim().toLowerCase().startsWith('vinculado por')
  ? '' : row.notes||'';
export const hasSupplierBalance=(supplier:SupplierAccountSummary,to:string)=>!!supplier.start_date&&(!to||supplier.start_date<=to);
export const supplierBalanceStatus=(balance:number)=>balance>0?'Debemos':balance<0?'A favor':'Al día';
const compareNames=new Intl.Collator('es-AR',{sensitivity:'base',numeric:true});
const normalizeName=(name:string)=>name.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu,'');
const within=(date:string|null|undefined,from:string,to:string)=>!from&&!to||!!date&&(!from||date>=from)&&(!to||date<=to);
const visibilityLabel={automatic:'Automática',visible:'Siempre visible',hidden:'Oculto'};
const accountStatus=(supplier:SupplierAccountSummary,to:string,field:'balance_ars'|'balance_usd')=>
  hasSupplierBalance(supplier,to)?supplierBalanceStatus(Number(supplier[field])):'Sin saldo calculable';

export function listSupplierDashboard(suppliers:SupplierAccountSummary[],to:string,showHidden=false,view=defaultSupplierDashboardView) {
  const name=normalizeName(view.name.trim());
  const group=view.tab==='hidden'?suppliers.filter(supplier=>supplier.visible===false):visibleSuppliers(suppliers,showHidden);
  const listed=group.filter(supplier=>
    (!name||normalizeName(supplier.name).includes(name))&&
    within(supplier.start_date,view.startFrom,view.startTo)&&
    within(supplier.last_movement,view.movementFrom,view.movementTo)&&
    (!view.ars||accountStatus(supplier,to,'balance_ars')===view.ars)&&
    (!view.usd||accountStatus(supplier,to,'balance_usd')===view.usd)&&
    (!view.visibility||(supplier.visibility||'automatic')===view.visibility));
  const value=(supplier:SupplierAccountSummary)=>{
    switch(view.sort){
      case 'balance_ars': case 'balance_usd':
        return hasSupplierBalance(supplier,to)?Number(supplier[view.sort]):null;
      case 'visibility': return visibilityLabel[supplier.visibility||'automatic'];
      default: return supplier[view.sort]||null;
    }
  };
  return listed.sort((a,b)=>{
    const first=value(a),second=value(b);
    if(first===null&&second!==null)return 1;
    if(first!==null&&second===null)return -1;
    const order=typeof first==='number'&&typeof second==='number'?first-second:compareNames.compare(String(first??''),String(second??''));
    return order*(view.direction==='desc'?-1:1)||compareNames.compare(a.name,b.name);
  });
}
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
    const listed=listSupplierDashboard(data.suppliers,filters.to,filters.showHidden,filters.dashboard);
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

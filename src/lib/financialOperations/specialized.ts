import {OperationError,isUuid,moneyValue} from './validation';
import type {OperationType} from './types';
export const specialTypes=['custody_fund','currency_exchange','financing','partner_equity','asset_trade','cash_count'] as const;
export type SpecialType=typeof specialTypes[number];
export const isSpecialType=(type:OperationType|string):type is SpecialType=>(specialTypes as readonly string[]).includes(type);
export type SpecialInput={operation_type:SpecialType;action:string;effective_date:string;account_id:string;payment_method_id:string;amount:string;concept:string;notes?:string;destination_account_id?:string;destination_amount?:string;fee?:string;fee_account_id?:string;counterparty?:string;reference?:string;asset_name?:string;purpose?:string;resource_id?:string;cutoff?:string;counted?:string;confirm?:boolean;personal_paid?:boolean;document_not_registered?:boolean;voucher_ids?:string[]};
export type Account={id:string;name:string;currency:string;is_active:boolean};
export type Fund={id:string;custodian:string;purpose:string;account_id:string;currency:string;balance:string;pending:string;version:number;status:string};
export type Loan={id:string;counterparty:string;reference:string;currency:string;side:'borrower'|'lender';capital:string;version:number};
export type Count={id:string;account_id:string;cutoff:string;expected:string;counted:string;fingerprint:string;status:string;version:number};
export type Resources={accounts:Account[];funds:Fund[];loans:Loan[];counts:Count[]};
export type SpecialLine={account_id:string;direction:'ingreso'|'egreso';amount:string;category:string;line:string};
export type SpecialPlan={lines:SpecialLine[];fund?:{id?:string;version?:number;create?:{custodian:string;purpose:string;account_id:string;currency:string};balance_delta:string;pending_delta:string;close?:boolean};loan?:{id?:string;version?:number;create?:{counterparty:string;reference:string;currency:string;side:string};capital_delta:string};count?:{id?:string;version?:number;account_id:string;cutoff:string;expected:string;counted:string;fingerprint:string;status:string;opening?:boolean}};
export function decimal(cents:number){return (cents/100).toFixed(2);}
function nonnegative(v:unknown){if(/^(?:0)(?:\.0{1,2})?$/.test(String(v)))return 0;return moneyValue(v);}
export function buildSpecialPlan(p:SpecialInput,r:Resources,cut?:{balance:string;fingerprint:string;has_history:boolean}):SpecialPlan{
 if(!isSpecialType(p.operation_type))throw new OperationError('Tipo específico inválido.');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(p.effective_date)||new Date(p.effective_date).toISOString().slice(0,10)!==p.effective_date)throw new OperationError('Fecha inválida.');
 if(!isUuid(p.payment_method_id)||!isUuid(p.account_id))throw new OperationError('Elegí cuenta y medio de pago.');
 if(typeof p.concept!=='string'||p.concept.trim().length<2||p.concept.length>240)throw new OperationError('Indicá el detalle.');
 for(const name of ['notes','counterparty','reference','purpose','asset_name'] as const)if(p[name]!==undefined&&(typeof p[name]!=='string'||p[name]!.length>(name==='notes'?4000:240)))throw new OperationError('Texto fuera de rango.');
 if(p.resource_id&&!isUuid(p.resource_id))throw new OperationError('Referencia inválida.');
 if(p.voucher_ids&&(!Array.isArray(p.voucher_ids)||p.voucher_ids.length>20||p.voucher_ids.some(id=>!isUuid(id))))throw new OperationError('Comprobantes inválidos.');
 const account=(id:string|undefined)=>{const a=r.accounts.find(a=>a.id===id&&a.is_active);if(!a)throw new OperationError('Cuenta no disponible.');return a;};
 const a=account(p.account_id),plan:SpecialPlan={lines:[]};
 const line=(id:string,direction:'ingreso'|'egreso',cents:number,category:string,name:string)=>{if(cents>0)plan.lines.push({account_id:id,direction,amount:decimal(cents),category,line:name});};
 const identified=()=>{if(!p.counterparty?.trim()||!p.reference?.trim())throw new OperationError('Identificá contraparte y referencia.');};
 if(p.operation_type==='currency_exchange'){
  if(p.action!=='exchange')throw new OperationError('Acción de cambio inválida.');
  const dest=account(p.destination_account_id),amount=moneyValue(p.amount),received=moneyValue(p.destination_amount);
  if(a.currency===dest.currency||a.id===dest.id)throw new OperationError('El cambio requiere dos monedas distintas.');
  line(a.id,'egreso',amount,'Cambio de moneda','source');line(dest.id,'ingreso',received,'Cambio de moneda','destination');
  const fee=nonnegative(p.fee||'0');if(fee)line(account(p.fee_account_id).id,'egreso',fee,'Comisiones','fee');
 }else if(p.operation_type==='partner_equity'){
  identified();if(!['contribution','withdrawal'].includes(p.action))throw new OperationError('Elegí aporte o retiro.');
  line(a.id,p.action==='contribution'?'ingreso':'egreso',moneyValue(p.amount),'Socios','main');
 }else if(p.operation_type==='asset_trade'){
  identified();if(!['purchase','sale'].includes(p.action))throw new OperationError('Elegí compra o venta.');
  if(!p.asset_name?.trim())throw new OperationError('Identificá el bien.');
  if(p.action==='purchase'&&p.document_not_registered!==true)throw new OperationError('Si el documento ya existe, usá Pago a proveedor para evitar duplicarlo.');
  line(a.id,p.action==='sale'?'ingreso':'egreso',moneyValue(p.amount),'Bienes','main');
 }else if(p.operation_type==='financing'){
  const capital=moneyValue(p.amount),fee=nonnegative(p.fee||'0');
  if(['receive','lend'].includes(p.action)){
   identified();const borrower=p.action==='receive';
   plan.loan={create:{counterparty:p.counterparty!,reference:p.reference!,currency:a.currency,side:borrower?'borrower':'lender'},capital_delta:decimal(capital)};
   line(a.id,borrower?'ingreso':'egreso',capital,'Financiación · capital','capital');
   if(fee)line(a.id,'egreso',fee,'Financiación · costos','cost');
  }else{
   const loan=r.loans.find(x=>x.id===p.resource_id);if(!loan||loan.currency!==a.currency)throw new OperationError('Elegí una financiación de la misma moneda.');
   if(!['repay','collect'].includes(p.action)||(loan.side==='borrower')!==(p.action==='repay'))throw new OperationError('Acción incompatible con la financiación.');
   if(capital>nonnegative(loan.capital))throw new OperationError('El capital supera el saldo pendiente.');
   plan.loan={id:loan.id,version:loan.version,capital_delta:decimal(-capital)};
   const direction=p.action==='repay'?'egreso':'ingreso';line(a.id,direction,capital,'Financiación · capital','capital');line(a.id,direction,fee,'Financiación · intereses','interest');
  }
 }else if(p.operation_type==='custody_fund'){
  if(p.action==='deliver'){
   const dest=account(p.destination_account_id);identified();
   if(a.id===dest.id||a.currency!==dest.currency)throw new OperationError('Elegí una cuenta de custodia distinta y de la misma moneda.');
   if(r.funds.some(f=>f.account_id===dest.id&&f.status==='open'))throw new OperationError('Esa cuenta ya tiene un fondo abierto.');
   if(!p.purpose?.trim())throw new OperationError('Indicá la finalidad del fondo.');
   const amount=moneyValue(p.amount);plan.fund={create:{custodian:p.counterparty!,purpose:p.purpose!,account_id:dest.id,currency:dest.currency},balance_delta:decimal(amount),pending_delta:'0.00'};
   line(a.id,'egreso',amount,'Movimiento de cuentas','source');line(dest.id,'ingreso',amount,'Movimiento de cuentas','custody');
  }else{
   const f=r.funds.find(x=>x.id===p.resource_id&&x.status==='open');if(!f)throw new OperationError('Elegí un fondo abierto.');
   if(a.currency!==f.currency)throw new OperationError('La moneda debe coincidir con el fondo.');
   const balance=nonnegative(f.balance),pending=nonnegative(f.pending);plan.fund={id:f.id,version:f.version,balance_delta:'0.00',pending_delta:'0.00'};
   if(p.action==='expense'){
    if(!p.reference?.trim()||!p.voucher_ids?.length)throw new OperationError('Identificá el gasto y adjuntá su comprobante.');
    const amount=moneyValue(p.amount),paid=Math.min(amount,balance),claim=amount-paid;
    if(claim&&p.personal_paid!==true)throw new OperationError('Confirmá el importe pagado por la persona que debe reintegrarse.');
    line(f.account_id,'egreso',paid,'Gastos rendidos','expense');plan.fund.balance_delta=decimal(-paid);plan.fund.pending_delta=decimal(claim);
   }else if(p.action==='return'){
    if(a.id===f.account_id)throw new OperationError('Elegí la cuenta que recibe la devolución.');
    const amount=moneyValue(p.amount);if(amount>balance)throw new OperationError('La devolución supera el saldo en custodia.');
    line(f.account_id,'egreso',amount,'Movimiento de cuentas','custody');line(a.id,'ingreso',amount,'Movimiento de cuentas','return');plan.fund.balance_delta=decimal(-amount);
   }else if(p.action==='reimburse'){
    if(a.id===f.account_id)throw new OperationError('El reintegro se paga desde una cuenta disponible.');
    const amount=moneyValue(p.amount);if(amount>pending)throw new OperationError('El reintegro supera la obligación pendiente.');
    line(a.id,'egreso',amount,'Reintegro de gastos','reimbursement');plan.fund.pending_delta=decimal(-amount);
   }else if(p.action==='close'){
    if(balance||pending)throw new OperationError('El fondo solo se cierra con saldo y reintegros pendientes en cero.');plan.fund.close=true;
   }else throw new OperationError('Acción de fondo inválida.');
  }
 }else if(p.operation_type==='cash_count'){
  if(['record','opening'].includes(p.action)){
   if(!cut||!p.cutoff||!Number.isFinite(Date.parse(p.cutoff))||Date.parse(p.cutoff)>Date.now())throw new OperationError('Consultá el saldo al corte antes de confirmar.');
   if(p.action==='opening'&&cut.has_history)throw new OperationError('Una cuenta con movimientos no admite una nueva apertura.');
   const counted=nonnegative(p.counted||'0'),expected=Math.round(Number(cut.balance)*100);
   plan.count={account_id:a.id,cutoff:p.cutoff,expected:decimal(expected),counted:decimal(counted),fingerprint:cut.fingerprint,status:p.action==='opening'?'adjusted':'recorded',opening:p.action==='opening'};
   if(p.action==='opening'){if(!p.confirm)throw new OperationError('Confirmá la apertura.');line(a.id,'ingreso',counted,'Saldo inicial','opening');}
  }else if(p.action==='adjust'){
   const c=r.counts.find(c=>c.id===p.resource_id&&c.status==='recorded');if(!c||c.account_id!==a.id||!cut)throw new OperationError('Elegí un arqueo pendiente de esta cuenta.');
   if(c.fingerprint!==cut.fingerprint)throw new OperationError('Los movimientos al corte cambiaron: registrá un nuevo arqueo.');
   if(!p.confirm||!p.notes?.trim())throw new OperationError('Confirmá el ajuste e indicá el motivo.');
   const delta=Math.round((Number(c.counted)-Number(c.expected))*100);plan.count={...c,status:'adjusted'};line(a.id,delta>=0?'ingreso':'egreso',Math.abs(delta),'Ajuste de arqueo','adjustment');
  }else throw new OperationError('Acción de arqueo inválida.');
 }
 if(p.operation_type!=='custody_fund'&&plan.lines.some(line=>r.funds.some(f=>f.status==='open'&&f.account_id===line.account_id)))throw new OperationError('La cuenta está bajo custodia: operala desde su fondo.');
 return plan;
}

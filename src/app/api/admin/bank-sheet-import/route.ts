import { NextResponse } from 'next/server';
import { fetchSpreadsheetCsv } from '@/lib/googleSheets';
import { planningContext, allRows, PlanningError } from '@/lib/paymentPlanning/server';
import { validDate, nextDate } from '@/lib/paymentPlanning/model';
import { BANK_SHEET_ID, BANK_SHEET_TAB, bankAccounts, parseBankSheet, classifyBankRows, type BankAccount } from '@/lib/bankSheetImport';
export const runtime='edge';
export const dynamic='force-dynamic';
const hash=async(text:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),byte=>byte.toString(16).padStart(2,'0')).join('');
async function preview(request:Request,from:string,to:string,accountId:string){
  if(!validDate(from)||!validDate(to)||from>to||Date.parse(to)-Date.parse(from)>93*86400000)throw new PlanningError('Elegí un período de hasta 93 días.');
  const {db,actor}=await planningContext(request);
  const accounts=bankAccounts(await allRows<BankAccount>(db.from('financial_accounts').select('id,name,currency,type,is_active').order('name').order('id')));
  if(accountId&&!accounts.some(row=>row.id===accountId))throw new PlanningError('Cuenta bancaria inválida.');
  if(!accounts.length)throw new PlanningError('No hay cuentas bancarias configuradas.');
  const csv=await fetchSpreadsheetCsv(BANK_SHEET_ID,{sheet:BANK_SHEET_TAB});
  const parsed=parseBankSheet(csv,accounts,from,to,accountId);
  const existing=await allRows<{bank_import_key:string|null;financial_account_id:string;created_at:string;type:string;amount:number|string;concept:string|null}>(db.from('cash_transactions')
    .select('bank_import_key,financial_account_id,created_at,type,amount,concept').in('financial_account_id',accounts.map(row=>row.id))
    .gte('created_at',`${from}T00:00:00-03:00`).lt('created_at',`${nextDate(to)}T00:00:00-03:00`).order('id'));
  const keyed=await Promise.all(parsed.rows.map(async row=>({...row,key:`bank-sheet:${await hash(`${BANK_SHEET_ID}:${BANK_SHEET_TAB}:${row.key}`)}`})));
  return {db,actor,result:{...parsed,rows:classifyBankRows(keyed,existing),accounts,from,to,hash:await hash(JSON.stringify([csv,from,to,accountId]))}};
}
function failure(error:unknown){
  const code=(error as {code?:string})?.code;
  const message=['42703','PGRST202'].includes(code||'')?'Falta habilitar la migración de importación bancaria.':error instanceof Error?error.message:(error as {message?:string})?.message||'No se pudo importar.';
  return NextResponse.json({error:message},{status:error instanceof PlanningError?error.status:400});
}
export async function GET(request:Request){
  try{
    const url=new URL(request.url);
    if(url.searchParams.get('action')==='accounts'){
      const {db}=await planningContext(request);
      const accounts=bankAccounts(await allRows<BankAccount>(db.from('financial_accounts').select('id,name,currency,type,is_active').order('name').order('id')));
      return NextResponse.json({accounts},{headers:{'Cache-Control':'no-store'}});
    }
    const {result}=await preview(request,url.searchParams.get('from')||'',url.searchParams.get('to')||'',url.searchParams.get('account')||'');
    return NextResponse.json(result,{headers:{'Cache-Control':'no-store'}});
  }catch(error){return failure(error);}
}
export async function POST(request:Request){
  try{
    const body=await request.json();
    if(!body||!Array.isArray(body.keys)||!body.keys.length||body.keys.length>1000||body.keys.some((key:unknown)=>typeof key!=='string'))throw new PlanningError('Seleccioná entre 1 y 1000 movimientos.');
    const {db,actor,result}=await preview(request,body.from,body.to,body.account||'');
    if(result.hash!==body.hash)throw new PlanningError('La planilla cambió. Volvé a cargar la vista previa.',409);
    const keys=new Set(body.keys);const rows=result.rows.filter(row=>keys.has(row.key)&&row.status==='new');
    if(body.keys.some((key:string)=>!result.rows.some(row=>row.key===key)))throw new PlanningError('La selección no corresponde a esta vista previa.');
    const omitted=keys.size-rows.length;
    if(!rows.length)return NextResponse.json({inserted:0,skipped:omitted});
    const {data,error}=await db.rpc('import_bank_movements',{p_actor:actor,p_rows:rows});if(error)throw error;
    return NextResponse.json({inserted:data.inserted,skipped:data.skipped+omitted});
  }catch(error){return failure(error);}
}

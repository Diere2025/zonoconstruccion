import { validDate, cents } from './paymentPlanning/model';

export const BANK_SHEET_ID = '18oydLaQldev9pY7fA_jvN9YQONfDRVjrMD-ps7F6izc';
export const BANK_SHEET_TAB = 'Finanzas - Finanzas';
const aliases: Record<string,string> = {
  'Cuenta.MP1':'Cuenta MP1','Cuenta.MP2':'Cuenta MP2','Cuenta.MP3':'Cuenta MP3','Cuenta.MP4':'Cuenta MP4','Cuenta.MP5':'Cuenta MP5','Cuenta.MPCaro':'Cuenta MP3',
  'Cuenta.Galicia':'Cuenta Galicia','Galicia.Mas':'Galicia.Mas','Cuenta.GaliciaMas':'Galicia.Mas','Visa.Galicia':'Visa.Galicia','Cuenta.VisaGalicia':'Visa.Galicia',
  'Cuenta.Santander':'Cuenta Santander','Cuenta.ICBC':'Cuenta ICBC','Inversiones':'Inversiones'
};
export type BankAccount = {id:string;name:string;currency:string;type:string;is_active:boolean};
export type BankRow = {key:string;sheetRow:number;date:string;accountId:string;accountName:string;type:'ingreso'|'egreso';amount:number;concept:string;category:string;subCategory:string;businessUnit:string;efeCategory:string;status:'new'|'imported'|'review';reason?:string};
export type BankPreview = {hash:string;rows:BankRow[];accounts:BankAccount[];issues:{sheetRow:number;reason:string}[];excludedCash:number;from:string;to:string};
export const bankAccounts = (accounts:BankAccount[]) => accounts.filter(row=>row.type!=='efectivo' && row.currency==='ARS' && Object.values(aliases).includes(row.name));
export function parseBankCsv(content:string):string[][] {
  const rows:string[][]=[]; let row:string[]=[],cell='',quoted=false;
  for(let i=0;i<content.length;i++){
    const char=content[i];
    if(char==='"') {if(quoted && content[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
    else if(!quoted && char===','){row.push(cell);cell='';}
    else if(!quoted && (char==='\n'||char==='\r')){if(char==='\r'&&content[i+1]==='\n')i++;row.push(cell);rows.push(row);row=[];cell='';}
    else cell+=char;
  }
  if(quoted)throw Error('El archivo tiene comillas sin cerrar.');
  if(cell || row.length){row.push(cell);rows.push(row);}
  return rows;
}
const dateFrom=(value:string)=>{
  const match=/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s.*)?$/.exec(value.trim());
  const date=match?`${match[3]}-${match[2].padStart(2,'0')}-${match[1].padStart(2,'0')}`:value.trim().slice(0,10);
  return validDate(date)?date:null;
};
const amountFrom=(value:string)=>{
  const clean=value.replace(/[$\s]/g,'').replace(/\./g,'').replace(',','.');
  if(!/^\d+(?:\.\d{1,2})?$/.test(clean))return null;
  const amount=Number(clean);return Number.isFinite(amount)&&amount>0?amount:null;
};
export const normalizeBankConcept=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
export function parseBankSheet(csv:string,accounts:BankAccount[],from:string,to:string,accountId='') {
  const rows:BankRow[]=[],issues:{sheetRow:number;reason:string}[]=[];let excludedCash=0;
  const occurrences=new Map<string,number>();
  const source=parseBankCsv(csv);
  if(normalizeBankConcept(source[0]?.[1]||'')!=='fecha' || normalizeBankConcept(source[0]?.[6]||'')!=='monto' || normalizeBankConcept(source[0]?.[7]||'')!=='cuenta')throw Error('Cambió el formato de Finanzas - Finanzas. Revisá las columnas antes de importar.');
  for(const [index,raw] of source.entries()){
    if(!index || raw.every(value=>!value.trim()))continue;
    const account=raw[7]?.trim()||'';
    if(/^Caja\./i.test(account)){excludedCash++;continue;}
    const name=aliases[account];if(!name)continue;
    const date=dateFrom(raw[1]||'');
    if(!date){issues.push({sheetRow:index+1,reason:'Fecha inválida'});continue;}
    if(date<from || date>to)continue;
    const box=bankAccounts(accounts).find(row=>row.name===name);
    if(!box || !box.is_active){issues.push({sheetRow:index+1,reason:`Cuenta no disponible: ${name}`});continue;}
    if(accountId && box.id!==accountId)continue;
    const amount=amountFrom(raw[6]||'');
    const sourceKind=(raw[5]||'').trim().toLowerCase();
    const kind=sourceKind==='gasto'?'egreso':sourceKind;
    if(amount===null || !['ingreso','egreso'].includes(kind)) {issues.push({sheetRow:index+1,reason:'Importe o tipo inválido'});continue;}
    const concept=(raw[2]||'').trim();
    if(!concept || /saldo inicial|saldo de apertura/i.test(`${concept} ${raw[0]||''}`)){issues.push({sheetRow:index+1,reason:'Saldo inicial o detalle vacío: revisar por separado'});continue;}
    const identity=JSON.stringify([box.id,date,kind,cents(amount),normalizeBankConcept(concept)]);
    const ordinal=(occurrences.get(identity)||0)+1;occurrences.set(identity,ordinal);
    rows.push({key:`${identity}:${ordinal}`,sheetRow:index+1,date,accountId:box.id,accountName:box.name,type:kind as BankRow['type'],amount,concept,
      category:(raw[3]||'Otro').trim(),subCategory:(raw[0]||'').trim(),businessUnit:'ZONO',efeCategory:source[0]?.[12]==='EFE'?(raw[12]||'').trim():'',status:'new'});
  }
  return {rows,issues,excludedCash};
}
export function classifyBankRows(rows:BankRow[],existing:{bank_import_key?:string|null;financial_account_id:string|null;created_at:string;type:string;amount:string|number;concept?:string|null}[]) {
  const imported=new Set(existing.flatMap(row=>row.bank_import_key?[row.bank_import_key]:[]));
  const signature=(account:string,date:string,type:string,amount:number|string)=>`${account}:${date}:${type}:${cents(amount)}`;
  const sourceKeys=new Set(rows.map(row=>row.key));
  const matches=new Set<string>(),exact=new Map<string,number>();
  for(const row of existing){
    const sign=signature(row.financial_account_id||'',new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(row.created_at)),row.type,row.amount);
    matches.add(sign);
    if(row.concept && !(row.bank_import_key && sourceKeys.has(row.bank_import_key))){const full=`${sign}:${normalizeBankConcept(row.concept)}`;exact.set(full,(exact.get(full)||0)+1);}
  }
  const sourceSeen=new Set<string>();
  return rows.map(row=>{
    const sign=signature(row.accountId,row.date,row.type,row.amount);
    const full=`${sign}:${normalizeBankConcept(row.concept||'')}`,remaining=exact.get(full)||0;
    const status:BankRow['status']=imported.has(row.key)||remaining>0?'imported':matches.has(sign)||sourceSeen.has(sign)?'review':'new';
    if(!imported.has(row.key)&&remaining>0)exact.set(full,remaining-1);
    sourceSeen.add(sign);
    return {...row,status,reason:status==='review'?'Coincide en cuenta, fecha, tipo e importe; revisar antes de importar':undefined};
  });
}

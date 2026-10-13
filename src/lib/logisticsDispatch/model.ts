export type Row = string[];
export type Dispatch = {code:string;date:string;carrierName:string;data:Record<string,unknown>};
export type Attempt = {code:string;orderCode:string;date:string;status:string;executed:boolean;sourceRows:number[]};
export type AttemptEvent = {row:number;date:string;status:string;carrierName:string;sourceCode:string;resolvedCode:string;method:string};
export type LinkIssue = {key:string;kind:string;code:string;reference:string;message:string};
export type SettlementSource = {code:string;dispatchCode:string;date:string;row:number;data:Record<string,unknown>};
export type MovementSource = {code:string;date:string;type:string;amount:number;concept:string;account:string;row:number;source:string;category?:string};
export const SOURCE_IDS = {logistics:'1TYeIyGbDleed1bTJyhuaxcM97KMbNbL--1OswOppROg',settlements:'1NEXHZbDJhXCHpsZEyKq3k3rq_O_foLDtct-hvsFeifI',follow:'18z0oPnM58Nplybdomqwc-9XVmqdmB6BzBLKzo_2iJRY',cash:'12OEQtYGyjFLTgnr0I4b8oXnH2qymv6rrQuby9_-ssRY'};
export function sheetDate(value:unknown):string {
 const m=String(value||'').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
 if(!m)return '';const iso=m[3]+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0');
 const date=new Date(iso+'T12:00:00Z');return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===iso?iso:'';
}
export function normalized(value:unknown):string{return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();}
export function sheetAmount(value:unknown):number|null {
 const x=String(value??'').replace(/[$\s.]/g,'').replace(',','.');if(!/^-?\d+(\.\d+)?$/.test(x))return null;const n=Number(x);return Number.isFinite(n)?n:null;
}
export function normalizeAccount(value:unknown):string {return normalized(value).replace(/^(cuenta|caja)[.\s]+/,'').replace(/[.\s_-]/g,'');}
export function movementFingerprint(x:{date:string;type:string;amount:number|string;concept:string;account:string}):string{
 return JSON.stringify([x.date,x.type,Math.round(Number(x.amount)*100),normalized(x.concept),normalizeAccount(x.account)]);
}
export function buildDispatchSource(sources:{logistics:Row[];summary:Row[];follow:Row[];settlements:Row[];cash:Row[]},from:string,to:string){
 const confirmedPickups=new Set(['JS25242','CAMB1510','JS25691','JS25692']);
 const dispatches=new Map<string,Dispatch>(),attempts=new Map<string,Attempt>(),issues:LinkIssue[]=[],settlements:SettlementSource[]=[],movements:MovementSource[]=[];
 const issue=(kind:string,code:string,reference:string,message:string)=>issues.push({key:[kind,code,reference].join('|'),kind,code,reference,message});
 const within=(d:string)=>Boolean(d&&d>=from&&d<=to),validCode=(c:string)=>/^LOG_REC_\d+[A-Z]?$/.test(c);
 const add=(code:string,date:string,carrierName:string,data:Record<string,unknown>,priority=false)=>{
  if(!validCode(code)||!within(date))return;
  const prior=dispatches.get(code);if(prior&&prior.date!==date){issue('date_conflict',code,'','El mismo código tiene distintas fechas en las fuentes.');return;}
  dispatches.set(code,{code,date,carrierName:priority?carrierName:prior?.carrierName||carrierName,data:{...prior?.data,...data}});
 };
 sources.summary.forEach((r,i)=>add(String(r[0]||'').trim(),sheetDate(r[1]),r[3]||'',{summaryRow:i+2,zone:r[2]||''}));
 sources.follow.forEach((r,i)=>add(String(r[1]||'').trim(),sheetDate(r[0]),r[2]||'',{followRow:i+2,vehicle:r[4]||'',companion:r[3]||'',plannedOrders:sheetAmount(r[17]),actualKm:sheetAmount(r[25]),baseKm:sheetAmount(r[24]),extraKm:sheetAmount(r[26]),actualHours:r[22]||'',expectedHours:r[19]||'',extraHours:r[23]||''},true));
 // Delivery dates come from the dispatch sources. A postponed order may retain its old LOG code after rescheduling.
 const statusKind=(value:string)=>{const text=normalized(value);return /\bentregado\b/.test(text)?'delivered':/\bpostergado\b/.test(text)?'postponed':/\b(anulado|cancelado)\b/.test(text)?'cancelled':text;};
 const carrierKey=(value:string)=>normalized(value).replace(/\([^)]*\)/g,'').replace(/[^a-z0-9 ]/g,' ').split(/\s+/).filter(Boolean).sort().join(' ');
 const records:Array<{code:string;orderCode:string;date:string;status:string;name:string;row:number}>=[];
 // Keep authoritative dates outside the selected month: a typo in Entregados must not create a phantom dispatch.
 const knownDates=new Map<string,Set<string>>();for(const [codeValue,dateValue] of [...sources.summary.map(r=>[r[0],r[1]]),...sources.follow.map(r=>[r[1],r[0]])]){const code=String(codeValue||'').trim().toUpperCase(),date=sheetDate(dateValue);if(validCode(code)&&date){const dates=knownDates.get(code)||new Set<string>();dates.add(date);knownDates.set(code,dates);}}
 let carrier='';
 sources.logistics.forEach((r,i)=>{
  const date=sheetDate(r[1]),orderCode=String(r[0]||'').trim().toUpperCase();if(!date){if(orderCode)carrier=String(r[0]);return;}if(!orderCode)return;
  if(confirmedPickups.has(orderCode))return;
  const confirmedCode=date==='2026-09-21'&&['AQ-FP00027','AQ-FP00028'].includes(orderCode)?'LOG_REC_05391':'';
  const code=confirmedCode||String(r[92]||'').trim().toUpperCase(),name=r[79]||carrier;
  if(!validCode(code)){if(within(date))issue('order_without_dispatch','',orderCode+'@'+date,'Pedido sin código de delivery en Entregados.');return;}
  if(!dispatches.has(code)&&knownDates.has(code)){
   if(within(date)){const dates=[...knownDates.get(code)!].map(d=>d.split('-').reverse().join('/')).join(', ');issue('attempt_date_outside_dispatch',code,orderCode,'La fecha del pedido '+date.split('-').reverse().join('/')+' no coincide con la salida registrada ('+dates+'), fuera del período. No se crea una salida nueva.');}return;
  }
  if(!dispatches.has(code)&&within(date))add(code,date,name,{});
  if(dispatches.has(code))records.push({code,orderCode,date,status:String(r[15]||''),name,row:i+3});
 });
 const remember=(code:string,orderCode:string,event:AttemptEvent)=>{
  const dispatch=dispatches.get(code)!;const histories=(dispatch.data.attemptHistory||{}) as Record<string,AttemptEvent[]>;
  dispatch.data.attemptHistory={...histories,[orderCode]:[...(histories[orderCode]||[]),event]};
 };
 const displayDate=(date:string)=>date.split('-').reverse().join('/');
 for(const record of records){
  const {orderCode,date,status,name,row}=record,original=dispatches.get(record.code)!;let code=record.code,method='source_code';
  const kind=statusKind(status);
  if(date!==original.date&&kind==='delivered'){
   const postponed=records.some(r=>r.code===code&&r.orderCode===orderCode&&r.date<date&&statusKind(r.status)==='postponed');
   const candidates=postponed&&carrierKey(name)?[...dispatches.values()].filter(d=>d.date===date&&carrierKey(d.carrierName)===carrierKey(name)):[];
   if(candidates.length===1){code=candidates[0].code;method='rescheduled_unique_date_carrier';}
   else{
    const event={row,date,status,carrierName:name,sourceCode:record.code,resolvedCode:'',method:'unresolved_delivery'};
    original.data.unresolvedDeliveries=[...((original.data.unresolvedDeliveries||[]) as AttemptEvent[]),{...event,orderCode}];
    issue('attempt_dispatch_unresolved',record.code,orderCode,'La entrega del '+displayDate(date)+' conserva el código de una salida del '+displayDate(original.date)+'. Revisar el delivery de la entrega posterior.');continue;
   }
  }else if(date!==original.date&&kind!=='postponed'&&kind!=='cancelled'){
   issue('date_conflict',record.code,orderCode,'La fecha del pedido difiere de la salida y su estado no permite identificar una postergación.');continue;
  }
  const dispatch=dispatches.get(code)!,event={row,date,status,carrierName:name,sourceCode:record.code,resolvedCode:code,method};
  remember(code,orderCode,event);
  const key=code+'|'+orderCode,prior=attempts.get(key);
  // Owner-confirmed exception: Salcedo's vehicle broke down and never departed.
  const executed=!(code==='LOG_REC_05344'&&dispatch.date==='2026-09-07'&&normalized(name).includes('salcedo'));
  let outcome=status;
  if(prior){
   const previous=statusKind(prior.status);
   if(prior.executed!==executed||previous!==kind&&![previous,kind].every(k=>['postponed','delivered'].includes(k))||previous===kind&&previous==='delivered'&&normalized(prior.status)!==normalized(status))issue('attempt_conflict',code,orderCode,'Hay resultados incompatibles para el mismo pedido y salida; revisar el historial.');
   if(previous==='delivered'||kind!=='delivered')outcome=prior.status;
  }
  attempts.set(key,{code,orderCode,date:dispatch.date,status:outcome,executed:prior?.executed??executed,sourceRows:[...(prior?.sourceRows||[]),row]});
 }
 sources.settlements.forEach((r,i)=>{
  const date=sheetDate(r[2]);if(!within(date)||!r[1])return;
  const code=String(r[1]).trim().toUpperCase(),dispatchCode=String(r[46]||'').trim().toUpperCase();
  if(!dispatchCode){if(code!=='REND07051'&&sheetAmount(r[5])!==null)issue('settlement_without_dispatch','',code,'Rendición sin código de delivery.');return;}
  if(!validCode(dispatchCode)){issue('invalid_dispatch',dispatchCode,code,'Código de delivery inválido.');return;}
  if(!dispatches.has(dispatchCode))add(dispatchCode,date,r[3]||'',{settlementOnly:true});
  if(dispatches.get(dispatchCode)?.date!==date){issue('settlement_date_conflict',dispatchCode,code,'La fecha de la rendición difiere de la salida.');return;}
  const expenses=[{expense_type:'toll',amount:sheetAmount(r[7])||0,reference:'Peajes de planilla'},{expense_type:'extraordinary',amount:sheetAmount(r[17])||0,reference:'Otros gastos de planilla'}].filter(x=>x.amount>0);
  const tickets=r.slice(24,34).map((value,index)=>({amount:sheetAmount(value)||0,reference:'Ticket '+(index+1),payment_type:'POINT',sort_order:index})).filter(x=>x.amount>0);
  settlements.push({code,dispatchCode,date,row:i+2,data:{carrier_name:r[3]||'',route_detail:r[4]||null,status:/^(true|verdadero|si|sí|x)$/i.test(String(r[0]||''))?'confirmed':'draft',change_fund:sheetAmount(r[6])||0,shortage_recovered:sheetAmount(r[36])||0,deliveries_total:sheetAmount(r[5])||0,electronic_total:sheetAmount(r[23])||0,tolls_total:sheetAmount(r[7])||0,extraordinary_total:sheetAmount(r[17])||0,expected_cash:sheetAmount(r[34])||0,counted_cash:sheetAmount(r[35])||0,difference:sheetAmount(r[37])||0,expenses,tickets}});
 });
 sources.cash.forEach((r,i)=>{
  const date=sheetDate(r[1]),code=String(r[0]||'').trim().toUpperCase();if(!within(date)||!(/^(?:LOG_REC_\d+[A-Z]?|REND\d+)$/.test(code)))return;
  const amount=sheetAmount(r[4]),type=normalized(r[3])==='ingreso'?'ingreso':normalized(r[3])==='gasto'?'egreso':'';
  if(amount===null||amount<=0||!type)return;
  movements.push({code,date,type,amount,concept:r[2]||'',account:r[14]||'',row:i+2,source:SOURCE_IDS.cash,category:String(r[6]||'').trim()});
 });
 const notDeparted=dispatches.get('LOG_REC_05398');if(notDeparted){notDeparted.data={...notDeparted.data,notDeparted:true,departureNote:'Salida prevista para el 24/09/2026 que no se realizó; postergada por confirmación del usuario.'};}
 return {from,to,dispatches:[...dispatches.values()].sort((a,b)=>a.code.localeCompare(b.code)),attempts:[...attempts.values()],settlements,movements,issues};
}
export function matchMovements(source:MovementSource[],ledger:Array<{id:string;date:string;type:string;amount:number|string;concept:string;account:string;financial_account_id:string;is_imported:boolean;reversal_of_transaction_id?:string|null}>,dispatchBySettlement:Map<string,string>){
 const sources=new Map<string,MovementSource[]>(),actual=new Map<string,typeof ledger>(),links:Array<{code:string;transactionId:string;settlementCode:string|null;date:string;type:string;amount:number;concept:string;accountId:string;sourceRow:number}>=[],issues:LinkIssue[]=[];
 for(const row of source){const key=movementFingerprint(row);sources.set(key,[...(sources.get(key)||[]),row]);}
 const reversed=new Set(ledger.flatMap(row=>row.reversal_of_transaction_id?[row.reversal_of_transaction_id]:[]));
 for(const row of ledger){if(!row.is_imported||row.reversal_of_transaction_id||reversed.has(row.id))continue;const key=movementFingerprint(row);actual.set(key,[...(actual.get(key)||[]),row]);}
 for(const [fingerprint,rows] of sources){
  const candidates=actual.get(fingerprint)||[];
  for(const row of rows){const code=row.code.startsWith('LOG_REC_')?row.code:dispatchBySettlement.get(row.code);if(!code)continue;
   if(rows.length!==1||candidates.length!==1){issues.push({key:'movement|'+row.source+'|'+row.row,kind:'movement_unmatched',code,reference:row.code,message:candidates.length?'Varios movimientos coinciden en cuenta, fecha, concepto e importe.':'No se encontró el movimiento importado en el ERP.'});continue;}
   const candidate=candidates[0];links.push({code,transactionId:candidate.id,settlementCode:row.code.startsWith('REND')?row.code:null,date:row.date,type:row.type,amount:row.amount,concept:candidate.concept,accountId:candidate.financial_account_id,sourceRow:row.row});
  }
 }
 return {links,issues};
}

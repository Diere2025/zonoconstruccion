import {freightAccountMethod} from './accountPaymentMethod';
import {applySettlementTerms,validateSettlementTerms,validatePaymentAllocation} from './settlementAccounting';
import {validateNovelty,validateNoveltyDeductions,noveltyBalances,planOwner} from './novelties';
import {validateDispatchPlan, validateDispatchActual, estimateDispatchFee, rateSnapshot, tariffApplies, planningNumber} from './planning';
import {validDate} from '@/lib/paymentPlanning/model';
import {approveLiquidation, type Liquidation} from './liquidation';
import {carrierIdentityKey} from '@/lib/carrierIdentity';
import {correctPlanningView} from './planningCorrections';
import {paymentTask,type PaymentTask} from './paymentTasks';
import {tariffDisplayName} from './planningPresentation';
import {dispatchPaymentState} from './planningPayments';
type Row = Record<string, any>;
type State = {novelties?:Row[];paymentRequests?:Row[];settlementTerms?:Row[]; paymentAllocations?:Row[]; tasks?:PaymentTask[]; reconciledPayments?: Row[]; carriers?: Row[]; plans: Row[]; tariffs: Row[]; liquidations: Liquidation[]};
/** Rebuild from stored allocations on every read and before every attempted payment. */
function withLocalAllocations(p:Row,allocations:Row[]){
 const current=p.paymentState||dispatchPaymentState(p,[]),affected=new Set(allocations.map(a=>a.transaction.id));
 const links=(current.payments||[]).filter((t:Row)=>!affected.has(t.id)).map((t:Row)=>({transaction_id:t.id,purpose:'freight_fee',cash_transactions:{...t,type:'egreso',currency:'ARS',created_at:t.date,movement_code:t.code,category:'Servicio de Flete'}}));
 for(const a of allocations){const part=a.allocations.find((v:Row)=>v.dispatch_id===p.dispatch_id);if(part)links.push({transaction_id:a.transaction.id,purpose:'freight_fee',allocated_amount:part.amount,cash_transactions:a.transaction} as any);}
 if(!allocations.length)return {...p,paymentState:current};
 const state=dispatchPaymentState(p,links,new Set(),current.expectedAmount),local=links.filter((l:Row)=>l.cash_transactions?.source_local);
 return {...p,paymentState:{...state,reversedPaymentCount:current.reversedPaymentCount||0,unsupportedCurrencyCount:current.unsupportedCurrencyCount||0,...(current.unsupportedCurrencyCount?{state:'needs_review',liquidated:false}:{}),...(local.length?{basis:'local_review'}:{}),payments:state.payments.map((tx:Row)=>local.some((l:Row)=>l.cash_transactions.id===tx.id)?{...tx,href:''}:tx)}};
}
const mergeTasks=(tasks:PaymentTask[],task:PaymentTask)=>{const previous=tasks.find(t=>t.dispatchId===task.dispatchId);return [...tasks.filter(t=>t.dispatchId!==task.dispatchId),{...task,...(previous?{id:previous.id,createdAt:previous.createdAt}:{})}];};
/** Development review only. No writes are forwarded to shared Sheets, treasury or Supabase. */
export function localPlanningRequester(remote: (url: string, options?: RequestInit) => Promise<any>) {
 let seed: Row | null = null;
 let rows: Row[] = [];
 let tariffPreview: Row[] = [];
 let allocationPayment:Row|null=null;
 const storageKey = () => 'erp-logistics-review-v1:' + seed?.actor;
 const read = (): State => JSON.parse(localStorage.getItem(storageKey()) || '{"plans":[],"tariffs":[],"liquidations":[]}');
 const persist = (state: State) => localStorage.setItem(storageKey(), JSON.stringify(state));
 return async (url: string, options?: RequestInit) => {
  if (process.env.NODE_ENV !== 'development') return remote(url, options);
  if ((options?.method || 'GET') === 'GET') {
   const result = correctPlanningView(await remote(url, options));
   if (url.includes('action=tariff-preview')) tariffPreview = result.rows || [];
   if(url.includes('action=allocation-payment')){const stored=read().paymentAllocations?.find(a=>a.transaction.id===result.transaction.id);allocationPayment=stored||result;return allocationPayment;}
   if (!result.plans) return result;
   seed = result;
   const state = read();
   seed!.carriers = [...result.carriers,...(state.carriers||[])];
   // Stage the explicitly approved rate; old dispatch snapshots stay intact.
   const weis = result.carriers.find((c: Row) => carrierIdentityKey(c.name) === carrierIdentityKey('Diego Weis'));
   const old = result.tariffs.filter((t: Row) => t.carrier_id === weis?.id && t.effective_from <= '2026-09-01').sort((a: Row,b: Row) => b.effective_from.localeCompare(a.effective_from))[0];
   if (weis && old && !state.tariffs.some(t => t.source_key === 'local-weis-september-2026')) {
    state.tariffs.push({...old,id:crypto.randomUUID(),label:'Diego Weis · 09/2026',effective_from:'2026-09-01',effective_to:null,source_key:'local-weis-september-2026',terms:{...old.terms,baseDay:100000,includedKm:50,extraKm:1700},local:true});
    persist(state);
   }
   const params = new URL(url, window.location.origin).searchParams;
   rows = [...result.plans.filter((p: Row) => !state.plans.some(x => x.dispatch_id === p.dispatch_id)), ...state.plans.filter(p => params.get('scope')==='settlements'||p.planned.deliveryDate >= params.get('from')! && p.planned.deliveryDate <= params.get('to')!)];
   const corrected = correctPlanningView({...result,carriers:seed!.carriers,plans:rows,tariffs:[...state.tariffs,...result.tariffs]});
   rows = corrected.plans.map((p:Row)=>{
    const fee=state.liquidations.find(f=>f.dispatchId===p.dispatch_id);
    // A local edit must never hide a real payment returned by the server.
    const authoritative=result.plans.find((r:Row)=>r.dispatch_id===p.dispatch_id)?.paymentState||p.paymentState;
    if(!p.local)return {...p,paymentState:authoritative||dispatchPaymentState(p,[])};
    const links=(authoritative?.payments||[]).map((t:Row)=>({transaction_id:t.id,purpose:'freight_fee',cash_transactions:{...t,type:'egreso',currency:'ARS',created_at:t.date,movement_code:t.code,category:'Servicio de Flete'}}));
    if(fee?.payment)links.push({transaction_id:fee.payment.id,purpose:'freight_fee',cash_transactions:{id:fee.payment.id,type:'egreso',amount:fee.payment.amount,currency:'ARS',category:'Servicio de Flete',created_at:fee.payment.date+'T12:00:00-03:00',movement_code:fee.payment.id,concept:'Pago de prueba',financial_accounts:{name:fee.payment.account}}} as any);
    const paymentState=dispatchPaymentState(p,links,new Set(),authoritative?.expectedAmount??fee?.total??null);
    return {...p,paymentState:{...paymentState,reversedPaymentCount:authoritative?.reversedPaymentCount||0,unsupportedCurrencyCount:authoritative?.unsupportedCurrencyCount||0,...(authoritative?.unsupportedCurrencyCount?{state:'needs_review',liquidated:false}:{}),...(fee?.payment?{basis:'local_review'}:{}),payments:paymentState.payments.map((tx:Row)=>tx.id===fee?.payment?.id?{...tx,href:''}:tx)}};
   });
   const allocations=state.paymentAllocations||[];
   rows=rows.map(p=>withLocalAllocations(p,allocations));
   // A published acceptance supersedes an older local copy of the same financial terms.
   let adopted=false;
   state.settlementTerms=(state.settlementTerms||[]).map(t=>{const shared=result.plans.find((p:Row)=>p.dispatch_id===t.dispatch_id)?.settlementTerms;
    if(shared?.difference_acceptance&&Number(shared.version)>=Number(t.version)&&Number(shared.gross_amount)===Number(t.gross_amount)&&Number(shared.net_amount)===Number(t.net_amount)&&JSON.stringify(shared.deductions)===JSON.stringify(t.deductions)&&JSON.stringify(shared.extra_snapshot)===JSON.stringify(t.extra_snapshot)){adopted=true;return shared;}return t;});
   if(adopted)persist(state);
   const combinedTerms=[...result.plans.filter((p:Row)=>p.settlementTerms&&!state.settlementTerms?.some(t=>t.dispatch_id===p.dispatch_id)).map((p:Row)=>p.settlementTerms),...(state.settlementTerms||[])];
   rows=applySettlementTerms(rows,combinedTerms,state.liquidations); corrected.plans=rows; seed!.carriers = corrected.carriers;
   corrected.novelties=noveltyBalances([...(result.novelties||[]),...(state.novelties||[])],combinedTerms);
   return {...corrected,liquidations:state.liquidations.map(f=>{const term=state.settlementTerms?.find(t=>t.dispatch_id===f.dispatchId);return term?{...f,total:Number(term.net_amount),deductions:term.deductions,status:rows.find(p=>p.dispatch_id===f.dispatchId)?.paymentState?.liquidated?'paid':'ready'}:f;}),tasks:state.tasks||[],taskPlans:state.plans,localReview:true};
  }
  if (!seed?.actor) throw new Error('Actualizá la sesión antes de guardar.');
  const body = JSON.parse(String(options?.body || '{}')), state = read();
  if(body.action==='reopen-dispatch')throw new Error('La reapertura con registro de auditoría se realiza desde el ERP publicado.');
  if(['preview-correction','correct-dispatch'].includes(body.action)){
   if(!seed.canWrite)throw new Error('Sin permiso para corregir recorridos.');
   const current=rows.find(r=>r.dispatch_id===body.dispatchId),carrier=seed.carriers.find((c:Row)=>c.id===body.carrierId);
   if(!current||current.version!==body.version)throw new Error('El recorrido cambió. Volvé a consultar el impacto.');
   if(!validDate(body.deliveryDate)||!carrier||String(body.reason||'').trim().length<10)throw new Error('Completá fecha, fletero y motivo.');
   const header=Array.isArray(current.logistics_dispatches)?current.logistics_dispatches[0]:current.logistics_dispatches;
   const payments=current.paymentState?.payments||[],settlements=current.renditions||[],blockers=[];
   if(settlements.some((s:Row)=>s.status!=='draft'))blockers.push('Hay rendiciones confirmadas. Tesorería debe reabrirlas antes de corregir el recorrido.');
   if(current.status==='cancelled')blockers.push('El LOG está cancelado.');
   if(current.planned.carrierId!==body.carrierId&&(state.liquidations.some(f=>f.dispatchId===body.dispatchId)||current.settlementTerms?.status==='paid'))blockers.push('Revisar la liquidación aprobada antes de cambiar el fletero.');
   const token=JSON.stringify([current.version,body.deliveryDate,body.carrierId,body.driverName,body.reason,body.acknowledgePayments]);
   const preview={token,sourceToken:'local',beforeDate:current.planned.deliveryDate,deliveryDate:body.deliveryDate,beforeCarrier:header.carrier_name,carrierName:carrier.name,counts:{deliveries:0,orders:0,routes:0,settlements:settlements.length,payments:payments.length},sourceRows:0,related:{orders:[],settlements,payments},warnings:['Revisión local: la corrección se guarda solamente en este navegador.'],blockers};
   if(body.action==='preview-correction')return preview;
   if(body.token!==token||blockers.length)throw new Error(blockers[0]||'Volvé a consultar el impacto.');
   if(payments.length&&!body.acknowledgePayments)throw new Error('Confirmá la revisión de los pagos vinculados.');
   const corrected={...current,version:current.version+1,carrier_id:carrier.id,planned:{...current.planned,deliveryDate:body.deliveryDate,carrierId:carrier.id,driverName:body.driverName,tariffId:null},tariff_snapshot:null,logistics_dispatches:{...header,delivery_date:body.deliveryDate,carrier_name:carrier.name},renditions:settlements.map((s:Row)=>({...s,settlement_date:body.deliveryDate,carrier_name:carrier.name}))};
   state.plans=[...state.plans.filter(p=>p.dispatch_id!==body.dispatchId),corrected];persist(state);return {saved:true};
  }
  if(body.action==='stage-freight-history'){
   if(!seed.canLiquidate)throw new Error('Sin permiso de Tesorería.');let staged=0;
   for(const draft of seed.historicalDrafts||[]){
    if(!draft.eligibleForLocalStaging)continue;
    const row=rows.find(r=>(Array.isArray(r.logistics_dispatches)?r.logistics_dispatches[0]:r.logistics_dispatches)?.code===draft.code);
    if(!row||row.status!=='completed'||row.settlementTerms||row.actual?.extras?.length||Number(row.paymentState?.paidAmount)!==Number(draft.paid))continue;
    const deductions=draft.novelties.map((n:Row)=>{state.novelties=state.novelties||[];if(!state.novelties.some(x=>x.id===n.id)&&!(seed!.novelties||[]).some((x:Row)=>x.id===n.id))state.novelties.push({id:n.id,carrier_id:row.carrier_id,company_key:null,origin_date:n.date,source_dispatch_id:null,kind:'shortage',label:'Faltante de rendición',reference:'Laura · Novedades · fila '+n.row,amount:n.discount,status:'approved'});return {noveltyId:n.id,kind:'offset',label:'Faltante de rendición',reference:'Laura · Novedades · fila '+n.row,amount:n.discount};});
    validateNoveltyDeductions(row,deductions,[...(seed.novelties||[]),...(state.novelties||[])],state.settlementTerms||[]);
    state.settlementTerms=[...(state.settlementTerms||[]),{dispatch_id:row.dispatch_id,gross_amount:draft.gross,net_amount:draft.net,extra_snapshot:[],deductions,evidence:'Revisión del chat y de Novedades de Laura; pago real verificado por importe. Diferencia menor a $100 conservada.',version:1}];staged++;
   }
   persist(state);return {staged,ledgerWrites:0};
  }
  if(body.action==='save-freight-novelty'){
   if(!seed.canLiquidate)throw new Error('Sin permiso de Tesorería.');const novelty=validateNovelty(body);if(novelty.source_dispatch_id){const p=rows.find(p=>p.dispatch_id===novelty.source_dispatch_id);if(!p||(novelty.carrier_id?novelty.carrier_id!==p.carrier_id:planOwner(p)!=='company:'+novelty.company_key))throw new Error('El LOG de origen no corresponde al responsable seleccionado.');}
   const old=state.novelties?.find(n=>n.id===body.id);if(old){if(JSON.stringify(novelty)!==JSON.stringify(Object.fromEntries(Object.keys(novelty).map(k=>[k,old[k]]))))throw new Error('Solicitud reutilizada con otros datos.');return old;}
   const saved={...novelty,id:body.id,status:'approved',created_by:seed.actor};state.novelties=[...(state.novelties||[]),saved];persist(state);return saved;
  }
  if(body.action==='pay-freight-services'){
   if(!seed.canLiquidate)throw new Error('Sin permiso de Tesorería.');
   const previous=state.paymentRequests?.find(p=>p.key===body.requestKey);if(previous){if(previous.input!==JSON.stringify(body))throw new Error('Solicitud reutilizada con otros datos.');return previous.result;}
   const amount=Number(body.payload?.amount),parts=validatePaymentAllocation(body,amount);if(!validDate(body.payload?.effective_date))throw new Error('Fecha inválida.');
   freightAccountMethod(body.payload?.account_id,seed.freightAccounts||[],seed.freightPaymentMethods||[]);
   const freshTerms=[...rows.filter(p=>p.settlementTerms&&!state.settlementTerms?.some(t=>t.dispatch_id===p.dispatch_id)).map(p=>p.settlementTerms),...(state.settlementTerms||[])];
   const freshRows=applySettlementTerms(rows.map(p=>withLocalAllocations(p,state.paymentAllocations||[])),freshTerms,state.liquidations);
   let owner:string|undefined;const allocations=parts.map(part=>{const row=freshRows.find(r=>(Array.isArray(r.logistics_dispatches)?r.logistics_dispatches[0]:r.logistics_dispatches)?.code===part.code),input=body.allocations.find((a:Row)=>a.code===part.code);if(!row||row.status!=='completed'||row.paymentState?.liquidated||row.extrasNeedReview||!row.settlementTerms||row.settlementTerms.version!==input.termsVersion||part.amount-(row.paymentState?.remainingAmount??0)>=100)throw new Error('Revisá el saldo confirmado y la versión de cada LOG.');const current=planOwner(row);if(owner&&owner!==current)throw new Error('El pago conjunto debe corresponder al mismo responsable.');owner=current;return {dispatch_id:row.dispatch_id,amount:part.amount,reason:part.reason,logistics_dispatches:{code:part.code}};});
   const transaction={source_local:true,id:crypto.randomUUID(),movement_code:'LOCAL_PAG_'+String((state.paymentRequests?.length||0)+1).padStart(5,'0'),type:'egreso',currency:'ARS',category:'Servicio de Flete',amount,concept:body.payload.concept,created_at:body.payload.effective_date+'T12:00:00-03:00',financial_accounts:{name:seed.freightAccounts.find((a:Row)=>a.id===body.payload.account_id).name}};
   state.paymentAllocations=[...(state.paymentAllocations||[]),{transaction,allocations}];const result={movement_code:transaction.movement_code,transaction_ids:[transaction.id],local:true};state.paymentRequests=[...(state.paymentRequests||[]),{key:body.requestKey,input:JSON.stringify(body),result}];persist(state);return result;
  }
  if(body.action==='accept-freight-difference'){
   if(!seed.canLiquidate)throw new Error('Sin permiso de Tesorería.');
   const terms=[...rows.filter(p=>p.settlementTerms&&!state.settlementTerms?.some(t=>t.dispatch_id===p.dispatch_id)).map(p=>p.settlementTerms),...(state.settlementTerms||[])];
   const current=applySettlementTerms(rows.map(p=>withLocalAllocations(p,state.paymentAllocations||[])),terms,state.liquidations).find(p=>p.dispatch_id===body.dispatchId);
   const term=current?.settlementTerms,paid=Number(current?.paymentState?.paidAmount||0),delta=Math.round((paid-Number(term?.net_amount))*100)/100,reason=String(body.reason||'').trim();
   if(!term||term.version!==body.termsVersion||paid!==Number(body.paidAmount))throw new Error('El saldo cambió. Actualizá.');
   if(current.status!=='completed'||current.extrasNeedReview||!paid||!delta||Math.abs(delta)>500||!reason||reason.length>500)throw new Error('Confirmá el servicio y un pago con diferencia de hasta $500.');
   const next={...term,version:term.version+1,difference_acceptance:{version:term.version+1,paidAmount:paid,netAmount:Number(term.net_amount),difference:delta,reason,actor:seed.actor,acceptedAt:new Date().toISOString()}};
   state.settlementTerms=[...(state.settlementTerms||[]).filter(t=>t.dispatch_id!==body.dispatchId),next];persist(state);return next;
  }
  if(body.action==='save-settlement-terms'){if(!seed.canLiquidate)throw new Error('Sin permiso de Tesorería.');const terms=validateSettlementTerms(body);validateNoveltyDeductions(rows.find(r=>r.dispatch_id===body.dispatchId)||{},terms.deductions,[...(seed.novelties||[]),...(state.novelties||[])],state.settlementTerms||[]);const previous=(state.settlementTerms||[]).find(t=>t.dispatch_id===body.dispatchId);if((previous?.version||0)!==(body.termsVersion||0))throw new Error('El saldo cambió. Actualizá.');if(!rows.some(p=>p.dispatch_id===body.dispatchId&&p.status==='completed'))throw new Error('Confirmá una salida cerrada.');state.settlementTerms=[...(state.settlementTerms||[]).filter(t=>t.dispatch_id!==body.dispatchId),{dispatch_id:body.dispatchId,gross_amount:terms.grossAmount,net_amount:terms.netAmount,extra_snapshot:body.extraSnapshot||[],deductions:terms.deductions,evidence:terms.evidence,version:(previous?.version||0)+1}];persist(state);return {saved:true};}
  if(body.action==='allocate-freight-payment'){if(!seed.canLiquidate)throw new Error('Sin permiso de Tesorería.');if(!allocationPayment||allocationPayment.transaction.id!==body.transactionId)throw new Error('Consultá primero el movimiento.');const parts=validatePaymentAllocation(body,Number(allocationPayment.transaction.amount));const allocations=parts.map((part:Row)=>{const p=rows.find(r=>(Array.isArray(r.logistics_dispatches)?r.logistics_dispatches[0]:r.logistics_dispatches)?.code===part.code);if(!p)throw new Error('Seleccioná un período que incluya todos los LOG del desglose local.');return {dispatch_id:p.dispatch_id,amount:part.amount,reason:part.reason,logistics_dispatches:{code:part.code}};});state.paymentAllocations=[...(state.paymentAllocations||[]).filter(a=>a.transaction.id!==body.transactionId),{transaction:allocationPayment.transaction,allocations}];persist(state);return {saved:true};}
  if(body.action==='refund-freight-payment')throw new Error('La vista local no registra ingresos reales. El reintegro se confirma desde el ERP publicado.');
  if(body.action==='reconcile-payment-links')throw new Error('La vinculación de pagos se realiza desde Movimientos del ERP.');
  if (body.action === 'pay-liquidation') {
   if (!seed.canLiquidate) throw new Error('El pago corresponde a Tesorería o Administración.');
   const fee = state.liquidations.find(f => f.dispatchId === body.dispatchId);
   if (!fee || fee.status !== 'ready' || fee.version !== body.version) throw new Error('La liquidación cambió o ya está pagada. Actualizá.');
   if (!validDate(body.date) || !body.account?.trim() || !['Transferencia','Efectivo'].includes(body.method)) throw new Error('Completá fecha, cuenta y medio de pago.');
   const settlement=(state.settlementTerms||[]).find(t=>t.dispatch_id===fee.dispatchId),paymentAmount=settlement?Number(settlement.net_amount):fee.total;
   if(paymentAmount<=0)throw new Error('El servicio está compensado; no corresponde registrar otro pago.');
   fee.status = 'paid'; fee.version++;
   fee.payment = {id:'LOCAL-PAG-'+crypto.randomUUID().slice(0,8).toUpperCase(),date:body.date,account:body.account.trim(),method:body.method.trim(),amount:paymentAmount};
   for(const task of state.tasks||[])if(task.dispatchId===fee.dispatchId&&task.status==='pending'){task.status='completed';task.completedAt=new Date().toISOString();task.movementId=fee.payment.id;}
   persist(state); return {payment:fee.payment};
  }
  if (!seed.canWrite) throw new Error('No tenés permiso para modificar logística.');
  if(body.action==='save-dispatch-extras'){const old=rows.find(p=>p.dispatch_id===body.dispatchId);if(!old||old.version!==body.version)throw new Error('La salida cambió. Actualizá.');if(old.status==='cancelled')throw new Error('La salida no salió.');const actual=validateDispatchActual({...old.actual,extras:body.extras},false,old.planned.loads.map((l:Row)=>l.runNumber));state.plans=[...state.plans.filter(p=>p.dispatch_id!==old.dispatch_id),{...old,version:old.version+1,actual}];persist(state);return {saved:true};}
  if (body.action === 'import-tariffs') {
   if (!seed.admin) throw new Error('Solo administradores pueden gestionar tarifas.');
   const selected = new Set(body.rows || []), rates = tariffPreview.filter(r=>selected.has(r.sourceRow));
   if (!rates.length || rates.length !== selected.size || rates.some(r=>!r.importable)) throw new Error('Revisá las tarifas seleccionadas.');
   for (const rate of rates) {
    const sourceKey = JSON.stringify([rate.sourceRow,rate.effectiveFrom,rate.terms]);
    if (state.tariffs.some(t=>t.source_key===sourceKey)) continue;
    state.tariffs.push({id:crypto.randomUUID(),label:rate.label,carrier_id:rate.carrierId,company_key:rate.companyKey,zone_variant:rate.zoneVariant,effective_from:rate.effectiveFrom,effective_to:null,terms:rate.terms,active:true,source_key:sourceKey,local:true});
   }
   persist(state); return {imported:rates.length};
  }
  if (body.action === 'approve-liquidation') {
   const row = state.plans.find(p => p.dispatch_id === body.dispatchId);
   if (!row || row.planned.historicalImport) throw new Error('El historial importado no se vuelve a liquidar. Usá una salida de prueba.');
   if (row.version !== body.version) throw new Error('La salida cambió. Actualizá.');
   const fee = approveLiquidation(row, body, state.liquidations.find(f => f.dispatchId === row.dispatch_id));
   state.liquidations.push(fee);state.tasks=mergeTasks(state.tasks||[],paymentTask(row,fee,seed.paymentRecipient));persist(state); return {liquidation:fee,task:state.tasks[state.tasks.length-1]};
  }
  if (body.action === 'save-tariff') {
   if (!seed.admin) throw new Error('Solo administradores pueden gestionar tarifas.');
   if (!validDate(body.effectiveFrom) || body.effectiveTo && (!validDate(body.effectiveTo) || body.effectiveTo < body.effectiveFrom)) throw new Error('Revisá descripción y vigencia.');
   const company = ['gyv','gavaplast'].includes(body.companyKey);
   if (company && body.carrierId || !company && !seed.carriers.some((c: Row)=>c.id===body.carrierId) || !['regular','la_plata','lp_zarate'].includes(body.zoneVariant)) throw new Error('Revisá el fletero, empresa y zona.');
   const terms = Object.fromEntries(['baseDay','hour','extraHour','extraKm','companion','includedKm','bonus'].map(key=>[key,planningNumber(body.terms?.[key],100000000)]));
   terms.includedMinutes = planningNumber(body.terms?.includedMinutes,2880); terms.includesTolls = body.terms?.includesTolls ?? null;
   if(body.supersedesTariffId&&!seed.tariffs.some((t:Row)=>t.id===body.supersedesTariffId)&&!state.tariffs.some(t=>t.id===body.supersedesTariffId))throw new Error('La tarifa cambió. Actualizá.');
   if(body.supersedesTariffId&&[...state.tariffs,...seed.tariffs].some(t=>t.supersedes_tariff_id===body.supersedesTariffId))throw new Error('Esta tarifa ya tiene otra versión. Editá la más reciente.');
   const row = {id:crypto.randomUUID(),label:tariffDisplayName({carrier_id:body.carrierId,company_key:body.companyKey,effective_from:body.effectiveFrom},seed.carriers),supersedes_tariff_id:body.supersedesTariffId||null,carrier_id:body.carrierId,company_key:body.companyKey,zone_variant:body.zoneVariant,effective_from:body.effectiveFrom,effective_to:body.effectiveTo||null,terms,active:true,local:true};
   state.tariffs.push(row); persist(state); return {id:row.id};
  }
  if (body.action !== 'save') throw new Error('Esta operación todavía no está disponible en la revisión local.');
  const replay = state.plans.find(p => p.request_key === body.requestKey && !body.dispatchId);
  if (replay) return {dispatchId:replay.dispatch_id};
  const old = rows.find(p => p.dispatch_id === body.dispatchId);
  if (body.dispatchId && (!old || old.version !== body.version)) throw new Error('Otra persona modificó la salida. Actualizá.');
  if (old && ['completed','cancelled'].includes(old.status)) throw new Error('La salida ya está cerrada.');
  if(body.otherCarrier){
   const name=String(body.otherCarrier).trim(); if(!name||name.length>200)throw new Error('Indicá el nombre del fletero.');
   const matches=seed.carriers.filter((c:Row)=>carrierIdentityKey(c.name)===carrierIdentityKey(name));
   if(matches.length>1)throw new Error('El nombre corresponde a varias identidades. Revisá el catálogo.');
   const carrier=matches[0]||{id:crypto.randomUUID(),name,is_active:true,local:true};
   if(!matches.length){state.carriers=[...(state.carriers||[]),carrier];seed.carriers=[...seed.carriers,carrier];}
   body.planned.carrierId=carrier.id;
  }
  const planned = validateDispatchPlan(body.planned), actual = validateDispatchActual(body.actual,body.status === 'completed',planned.loads.map(l=>l.runNumber));
  if (!['planned','in_progress','completed','cancelled'].includes(body.status)) throw new Error('Estado inválido.');
  if (body.status === 'cancelled' && !planned.notes) throw new Error('Indicá por qué no salió.');
  if (old && (old.planned.carrierId !== planned.carrierId || old.planned.deliveryDate !== planned.deliveryDate)) throw new Error('Fecha y fletero del LOG no se cambian.');
  const carrier = seed.carriers.find((c: Row) => c.id === planned.carrierId);
  if (!carrier) throw new Error('Seleccioná un fletero activo.');
  const rate = [...state.tariffs,...seed.tariffs].find(t => t.id === planned.tariffId);
  if (planned.tariffId && !rate && old?.tariff_snapshot?.id !== planned.tariffId) throw new Error('La tarifa ya no está disponible.');
  const hasZone=planned.loads.some(l=>l.zone.trim());const area = planned.loads.some(l=>/la\s+plata|z[aá]rate/i.test(l.zone))?'lp_zarate':'regular';
  if (rate && !tariffApplies(rate,carrier,planned.deliveryDate,hasZone?area:rate.zone_variant) && !(area==='lp_zarate' && tariffApplies(rate,carrier,planned.deliveryDate,'la_plata'))) throw new Error('La tarifa no corresponde a la fecha o zona.');
  const snapshot = old?.tariff_snapshot?.id === planned.tariffId ? old.tariff_snapshot : rate ? rateSnapshot(rate) : null;
  const id = old?.dispatch_id || crypto.randomUUID();
  const row = {dispatch_id:id,carrier_id:carrier.id,version:(old?.version||0)+1,request_key:body.requestKey,status:body.status,paymentState:old?.paymentState,planned,actual,tariff_snapshot:snapshot,estimate:estimateDispatchFee(planned,snapshot),local:true,logistics_dispatches:old?.logistics_dispatches || {code:body.sourceCode||'LOCAL_LOG_'+String(state.plans.length+1).padStart(5,'0'),carrier_name:carrier.name,delivery_date:planned.deliveryDate}};
  state.plans = [...state.plans.filter(p=>p.dispatch_id!==id),row];
  if(body.sendToAdministration&&body.status==='completed'&&!Number(old?.paymentState?.paidAmount)&&!state.liquidations.some(f=>f.dispatchId===id)){try{const fee=approveLiquidation(row,{basis:planned.agreedAmount!==null?'agreed':'calculated',base:planned.agreedAmount,additions:[],notes:actual.notes},state.liquidations.find(f=>f.dispatchId===id));state.liquidations.push(fee);state.tasks=mergeTasks(state.tasks||[],paymentTask(row,fee,seed.paymentRecipient));}catch(e:any){if(!/datos tarifarios pendientes|importe positivo/.test(e.message))throw e;}}
  if(row.status==='completed'&&!state.tasks?.some(t=>t.dispatchId===id)){state.tasks=[...(state.tasks||[]),{id:crypto.randomUUID(),dispatchId:id,assigneeId:seed.paymentRecipient?.id||null,assigneeName:seed.paymentRecipient?.name||'Administración',title:'Revisar y pagar flete · '+row.logistics_dispatches.code,summary:'Salida cerrada: confirmar importe y novedades en Liquidaciones de fletes.',amount:null,status:'pending',createdAt:new Date().toISOString()}];}
  persist(state);
  return {dispatchId:id,version:row.version};
 };
}

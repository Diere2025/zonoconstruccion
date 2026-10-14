import {validateDispatchPlan, validateDispatchActual, estimateDispatchFee, rateSnapshot, tariffApplies, planningNumber} from './planning';
import {validDate} from '@/lib/paymentPlanning/model';
import {approveLiquidation, type Liquidation} from './liquidation';
import {carrierIdentityKey} from '@/lib/carrierIdentity';
import {correctPlanningView} from './planningCorrections';
import {paymentTask,type PaymentTask} from './paymentTasks';
import {tariffDisplayName} from './planningPresentation';
import {dispatchPaymentState,reconcilePaymentStates} from './planningPayments';
type Row = Record<string, any>;
type State = {tasks?:PaymentTask[]; reconciledPayments?: Row[]; carriers?: Row[]; plans: Row[]; tariffs: Row[]; liquidations: Liquidation[]};
/** Development review only. No writes are forwarded to shared Sheets, treasury or Supabase. */
export function localPlanningRequester(remote: (url: string, options?: RequestInit) => Promise<any>) {
 let seed: Row | null = null;
 let rows: Row[] = [];
 let tariffPreview: Row[] = [];
 let paymentPreview:Row[]=[];
 const storageKey = () => 'erp-logistics-review-v1:' + seed?.actor;
 const read = (): State => JSON.parse(localStorage.getItem(storageKey()) || '{"plans":[],"tariffs":[],"liquidations":[]}');
 const persist = (state: State) => localStorage.setItem(storageKey(), JSON.stringify(state));
 return async (url: string, options?: RequestInit) => {
  if (process.env.NODE_ENV !== 'development') return remote(url, options);
  if ((options?.method || 'GET') === 'GET') {
   const result = correctPlanningView(await remote(url, options));
   if (url.includes('action=payment-source-preview'))paymentPreview=result.rows||[];
   if (url.includes('action=tariff-preview')) tariffPreview = result.rows || [];
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
   rows = [...result.plans.filter((p: Row) => !state.plans.some(x => x.dispatch_id === p.dispatch_id)), ...state.plans.filter(p => p.planned.deliveryDate >= params.get('from')! && p.planned.deliveryDate <= params.get('to')!)];
   const corrected = correctPlanningView({...result,carriers:seed!.carriers,plans:rows,tariffs:[...state.tariffs,...result.tariffs]});
   rows = corrected.plans.map((p:Row)=>{
    p=reconcilePaymentStates([p],state.reconciledPayments||[])[0];
    const fee=state.liquidations.find(f=>f.dispatchId===p.dispatch_id);
    if(!p.local || !fee)return p;
    const simulated=fee.payment?[{cash_transactions:{id:fee.payment.id,type:'egreso',amount:fee.payment.amount,currency:'ARS',category:'Servicio de Flete',created_at:fee.payment.date+'T12:00:00-03:00',movement_code:fee.payment.id,concept:'Pago de prueba',financial_accounts:{name:fee.payment.account}}}]:[];
    const paymentState=dispatchPaymentState(p,simulated,new Set(),fee.total);
    return {...p,paymentState:{...paymentState,basis:'local_review',payments:paymentState.payments.map((tx:Row)=>({...tx,href:''}))}};
   }); corrected.plans=rows; seed!.carriers = corrected.carriers;
   return {...corrected,liquidations:state.liquidations,tasks:state.tasks||[],taskPlans:state.plans,localReview:true};
  }
  if (!seed?.actor) throw new Error('Actualizá la sesión antes de guardar.');
  const body = JSON.parse(String(options?.body || '{}')), state = read();
  if(body.action==='reconcile-payment-links'){
   if(!seed.canWrite&&!seed.canLiquidate)throw new Error('No tenés permiso para revisar vínculos.');
   if(!paymentPreview.length)throw new Error('Consultá primero los movimientos de Caja.');
   const selected=new Set(body.transactionIds||[]),chosen=paymentPreview.filter(r=>selected.has(r.transactionId));
   if(chosen.length!==selected.size)throw new Error('La selección cambió. Volvé a consultar.');
   state.reconciledPayments=[...(state.reconciledPayments||[]).filter(r=>!selected.has(r.transactionId)),...chosen];persist(state);return {linked:chosen.length};
  }
  if (body.action === 'pay-liquidation') {
   if (!seed.canLiquidate) throw new Error('El pago corresponde a Tesorería o Administración.');
   const fee = state.liquidations.find(f => f.dispatchId === body.dispatchId);
   if (!fee || fee.status !== 'ready' || fee.version !== body.version) throw new Error('La liquidación cambió o ya está pagada. Actualizá.');
   if (!validDate(body.date) || !body.account?.trim() || !['Transferencia','Efectivo'].includes(body.method)) throw new Error('Completá fecha, cuenta y medio de pago.');
   fee.status = 'paid'; fee.version++;
   fee.payment = {id:'LOCAL-PAG-'+crypto.randomUUID().slice(0,8).toUpperCase(),date:body.date,account:body.account.trim(),method:body.method.trim(),amount:fee.total};
   for(const task of state.tasks||[])if(task.dispatchId===fee.dispatchId&&task.status==='pending'){task.status='completed';task.completedAt=new Date().toISOString();task.movementId=fee.payment.id;}
   persist(state); return {payment:fee.payment};
  }
  if (!seed.canWrite) throw new Error('No tenés permiso para modificar logística.');
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
   state.liquidations.push(fee);state.tasks=[...(state.tasks||[]),paymentTask(row,fee,seed.paymentRecipient)];persist(state); return {liquidation:fee,task:state.tasks[state.tasks.length-1]};
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
  if(body.sendToAdministration){const fee=approveLiquidation(row,{basis:planned.agreedAmount!==null?'agreed':'calculated',base:planned.agreedAmount,additions:[],notes:actual.notes},state.liquidations.find(f=>f.dispatchId===id));state.liquidations.push(fee);state.tasks=[...(state.tasks||[]),paymentTask(row,fee,seed.paymentRecipient)];}
  persist(state);
  return {dispatchId:id,version:row.version};
 };
}

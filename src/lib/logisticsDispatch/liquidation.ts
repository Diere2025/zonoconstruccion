import {estimateDispatchFee, validateDispatchExtras, type DispatchPlan} from './planning';
export type FeeAddition = {label: string; amount: number; reference?: string; extraId?:string; kind?:string; orderCode?:string; runNumber?:number|null};
export type Liquidation = {dispatchId: string; version: number; status: 'ready' | 'paid'; basis: 'agreed' | 'calculated'; base: number; additions: FeeAddition[]; total: number; deductions?: {label:string;amount:number;kind:string;reference:string}[]; notes: string; approvedAt: string; payment?: {id: string; date: string; account: string; method: string; amount: number}};
const round = (n: number) => Math.round(n * 100) / 100;
export function actualFee(plan: DispatchPlan, actualKm: number | null, terms: any) {
 // One fee per paid LOG, using total ACTUAL km, not the sum of forecast km.
 return estimateDispatchFee({...plan, loads: [{runNumber: 1, zone: '', routeUrl: '', plannedKm: actualKm, plannedOrders: null}]}, terms);
}
export function approveLiquidation(row: any, input: any, previous?: Liquidation): Liquidation {
 if (row.status !== 'completed') throw new Error('Cerrá la ejecución antes de aprobar el pago.');
 if (previous) throw new Error('Esta salida ya tiene una liquidación aprobada.');
 if(row.paymentSourcePending?.length)throw new Error('Ya figura un pago en Caja para este LOG. Revisá el vínculo o su importación antes de generar otra tarea.');
 if(Number(row.paymentState?.paidAmount)>0)throw new Error('Ya hay pagos de este LOG. Revisá los movimientos antes de generar una nueva tarea.');
 const calculated = actualFee(row.planned, row.actual?.km ?? null, row.tariff_snapshot);
 const agreed = input.basis === 'agreed';
 const base = agreed ? Number(input.base) : calculated.amount;
 if (!agreed && (base === null || calculated.review.some((r: string) => !r.startsWith('Peajes')))) throw new Error('Hay datos tarifarios pendientes. Confirmá un importe acordado.');
 if (!Number.isFinite(base) || base! <= 0 || base! > 100000000) throw new Error('Confirmá un importe positivo.');
 const additions = [...validateDispatchExtras(row.actual?.extras,(row.planned.loads||[]).map((l:any)=>l.runNumber)).map((e:any)=>({...e,extraId:e.id})),...(input.additions||[]).map((a:any)=>({label:a.label,amount:a.amount,reference:a.reference}))].map((a: any) => ({label: String(a.label || '').trim(), amount: round(Number(a.amount)), reference: String(a.reference || '').trim(),...(a.extraId?{extraId:a.extraId,kind:a.kind,orderCode:a.orderCode,runNumber:a.runNumber}:{})}));
 if (additions.length > 20 || additions.some((a: FeeAddition) => !a.label || !Number.isFinite(a.amount) || a.amount <= 0)) throw new Error('Cada adicional necesita un motivo y un importe positivo.');
 const total = round(base! + additions.reduce((n: number, a: FeeAddition) => n + a.amount, 0));
 if (total > 100000000) throw new Error('El importe excede el máximo permitido.');
 return {dispatchId: row.dispatch_id, version: 1, status: 'ready', basis: agreed ? 'agreed' : 'calculated', base: round(base!), additions, total, notes: String(input.notes || '').trim(), approvedAt: new Date().toISOString()};
}
export function closureMessage(row: any, fee: Liquidation) {
 const plan = row.planned, header = Array.isArray(row.logistics_dispatches) ? row.logistics_dispatches[0] : row.logistics_dispatches;
 const [y,m,d] = plan.deliveryDate.split('-');
 const money = (n: number) => new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS'}).format(n);
 const terms = row.tariff_snapshot;
 return [
  `LIQUIDACIÓN DE FLETE · ${header?.code || row.code}`,
  `${d}/${m}/${y} · ${header?.carrier_name || row.carrierName}`,
  `Chofer: ${plan.driverName||header?.carrier_name||row.carrierName} · Vehículo: ${plan.vehicle} · Acompañante: ${plan.companion || 'Sin acompañante'}`,
  ...plan.loads.map((r: any) => {const actual = row.actual.loads?.find((a: any) => a.runNumber === r.runNumber); return `R${r.runNumber} · ${r.zone || 'Zona a confirmar'}${r.plannedKm !== null && r.plannedKm !== undefined ? ` · ${r.plannedKm} km previstos` : ''}${actual?.departure && actual?.arrival ? ` · ${actual.departure}–${actual.arrival}${actual.arrivalNextDay ? ' (regreso al día siguiente)' : ''}` : ''}`;}),
  `Km reales del LOG: ${row.actual.km ?? 'A confirmar'}`,
  ...(fee.basis === 'calculated' && terms ? [`Base: ${money(terms.baseDay)} · ${terms.includedKm ?? '—'} km incluidos`, `Km excedentes: ${Math.max(0, row.actual.km - terms.includedKm).toFixed(1)} × ${money(terms.extraKm || 0)}`, `Acompañante: ${plan.companion&&!/sin acompa/i.test(plan.companion)?money(terms.companion):'Sin acompañante · sin adicional'}`] : ['Importe acordado por viaje']),
  `Subtotal: ${money(fee.base)}`,
  ...fee.additions.map(a => `Adicional · ${a.label}${a.reference ? ' ('+a.reference+')' : ''}${a.orderCode?' · '+a.orderCode:''}${a.runNumber?' · R'+a.runNumber:''}: ${money(a.amount)}`),
  ...(fee.deductions||[]).map(d=>`${d.kind==='offset'?'Compensación / cuota':'Descuento de flete'} · ${d.label} (${d.reference}): −${money(d.amount)}`),
  `TOTAL ${fee.status === 'paid' ? 'PAGADO' : 'A PAGAR'}: ${money(fee.total)}`,
  fee.status === 'paid' ? `Pago: ${fee.payment?.id}` : 'Estado: aprobado por logística · pendiente de pago',
  ...(fee.notes ? [`Observaciones: ${fee.notes}`] : [])
 ].join('\n');
}

import {planningRows} from './planningServer';
type Row=Record<string,any>;
export async function planningSharedTasks(db:any,plans:Row[],recipient:Row|null){
 const records:Row[]=[];
 for(let i=0;i<plans.length;i+=150)records.push(...await planningRows(db.from('logistics_dispatch_liquidations').select('*,support_tickets(title,status,assignee_id,description,created_at)').in('dispatch_id',plans.slice(i,i+150).map(p=>p.dispatch_id)).order('dispatch_id')));
 const adjusted=plans.map(p=>{const approved=records.find(r=>r.dispatch_id===p.dispatch_id),state=p.paymentState;if(!approved||!state)return p;const partial=state.paidAmount!==null&&Math.round(state.paidAmount*100)<Math.round(Number(approved.total)*100);return {...p,paymentState:{...state,expectedAmount:Number(approved.total),remainingAmount:Math.max(0,Number(approved.total)-(state.paidAmount||0)),state:state.state==='needs_review'?state.state:partial?'partial':state.state,liquidated:!partial&&state.liquidated}};});
 const liquidations=records.map(r=>({...r.fee,dispatchId:r.dispatch_id,status:adjusted.find(p=>p.dispatch_id===r.dispatch_id)?.paymentState?.liquidated?'paid':'ready',supportTicketId:r.support_ticket_id}));
 const tasks=records.map(r=>{const t=Array.isArray(r.support_tickets)?r.support_tickets[0]:r.support_tickets;return {id:r.support_ticket_id,dispatchId:r.dispatch_id,assigneeId:t?.assignee_id||recipient?.id,assigneeName:recipient?.name||'Administración',title:t?.title||'Revisar pago de flete',summary:t?.description||'',amount:Number(r.total),status:t?.status==='closed'?'completed':'pending',paymentRecorded:adjusted.find(p=>p.dispatch_id===r.dispatch_id)?.paymentState?.liquidated===true,createdAt:t?.created_at||r.approved_at,href:'/incidencias/'+r.support_ticket_id};});
 return {plans:adjusted,liquidations,tasks};
}

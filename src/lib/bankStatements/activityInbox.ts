import type {FinancialConcept} from '@/lib/financialConcepts';
import type {InboxActivity,InboxCapture} from './inbox';
import {normalizedStatementText,suggestStatementConcept,type StatementRule} from './model';
// Older captures used the counterparty as description. Keep the originals in storage.
export function distinctActivities(rows:InboxActivity[]):InboxActivity[]{
 const groups=new Map<string,InboxActivity[]>();
 for(const row of rows){const key=JSON.stringify([row.mp_account_id||'',row.occurred_at,Number(row.amount),normalizedStatementText(row.name)]);groups.set(key,[...(groups.get(key)||[]),row]);}
 const hidden=new Set<string>();
 for(const group of groups.values()){
  const old=group.filter(r=>normalizedStatementText(r.description)===normalizedStatementText(r.name));
  const typed=group.filter(r=>normalizedStatementText(r.description)!==normalizedStatementText(r.name));
  if(old.length!==1||typed.length!==1)continue;
  const a=old[0],b=typed[0];
  if((a.review_version||1)>1||a.cash_transaction_id||a.linked_capture_id||a.proposed_concept_id)continue;
  if(a.operation_id&&b.operation_id&&a.operation_id!==b.operation_id)continue;
  hidden.add(a.id);
 }
 return rows.filter(r=>!hidden.has(r.id));
}
export function activityConcept(row:InboxActivity,captures:InboxCapture[],concepts:FinancialConcept[],rules:StatementRule[],account:string):string|null{
 if((row.review_version||1)>1||row.proposed_concept_id)return row.proposed_concept_id||null;
 const linked=captures.find(c=>c.id===row.linked_capture_id);
 if(linked?.financial_concept_id)return linked.financial_concept_id;
 const descriptions=row.is_reserve?['Movimiento de cuentas']:[row.name,row.description];
 const choices=new Set(descriptions.map(description=>suggestStatementConcept({description,signed_amount:row.amount},concepts,rules,account)).filter((id):id is string=>!!id));
 return choices.size===1?[...choices][0]:null;
}

const day=(value:string)=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires'}).format(new Date(value));
export function matchInboxActivity(activities:InboxActivity[],captures:InboxCapture[]){
 const compatible=(a:InboxActivity,w:InboxCapture)=>!!a.is_reserve===(w.operation_kind==='reserve_transfer');
 const same=(a:InboxActivity,w:InboxCapture)=>compatible(a,w)&&Number(a.amount)===Number(w.amount)&&(a.operation_id?a.operation_id===w.operation_id&&day(a.occurred_at)===day(w.occurred_at):new Date(a.occurred_at).toISOString().slice(0,16)===new Date(w.occurred_at).toISOString().slice(0,16));
 return activities.map(a=>{const matches=captures.filter(w=>same(a,w));const match=matches.length===1&&activities.filter(x=>same(x,matches[0])).length===1?matches[0]:null;
 const operationRows=a.operation_id?captures.filter(w=>compatible(a,w)&&w.operation_id===a.operation_id&&day(a.occurred_at)===day(w.occurred_at)):[];
 const reason=match?null:operationRows.length===1&&Number(operationRows[0].amount)!==Number(a.amount)?'amount_mismatch':matches.length>1?'ambiguous':null;
 return {...a,operation_id:a.operation_id||match?.operation_id||null,linked_capture_id:match?.id||null,cash_transaction_id:a.cash_transaction_id||match?.cash_transaction_id||null,link_reason:reason,bank_amount:reason==='amount_mismatch'?operationRows[0].amount:null};});
}

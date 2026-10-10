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

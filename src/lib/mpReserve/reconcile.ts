export type ReserveRow={id:string;occurred_at:string;amount:string;kind:'deposit'|'withdrawal'|'yield';description:string};
export type ReserveBankRow={id:string;operation_id:string;occurred_at:string;amount:string;description:string;operation_kind:string|null;movement_code?:string|null};
const cents=(value:string)=>Math.round(Number(value)*100);
const day=(value:string)=>{const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(value));return ['year','month','day'].map(type=>parts.find(p=>p.type===type)?.value).join('-');};
export function reconcileReserve(rows:ReserveRow[],bank:ReserveBankRow[],reference={date:'2026-10-06',depositCents:50000000}){
 const ordered=[...rows].sort((a,b)=>a.occurred_at.localeCompare(b.occurred_at)||a.id.localeCompare(b.id));
 const anchors=ordered.filter(r=>r.kind==='deposit'&&day(r.occurred_at)===reference.date&&cents(r.amount)===reference.depositCents);
 const anchor=anchors.length===1?anchors[0]:null;
 const balances=new Map<string,number>();let anchorAmbiguous=false;
 if(anchor){const sameMinute=ordered.filter(r=>new Date(r.occurred_at).getTime()===new Date(anchor.occurred_at).getTime());anchorAmbiguous=sameMinute.length!==1;
  if(!anchorAmbiguous){const index=ordered.indexOf(anchor);let value=0;for(let i=index;i<ordered.length;i++){value+=cents(ordered[i].amount);balances.set(ordered[i].id,value);}value=0;for(let i=index-1;i>=0;i--){balances.set(ordered[i].id,value);value-=cents(ordered[i].amount);}}
 }
 const items=ordered.map(r=>{let candidates:ReserveBankRow[];
  if(r.kind==='yield')candidates=bank.filter(w=>/rendimiento|intereses/i.test(w.description)&&cents(w.amount)===cents(r.amount)&&new Date(w.occurred_at).getTime()===new Date(r.occurred_at).getTime());
  else candidates=bank.filter(w=>w.operation_kind==='reserve_transfer'&&cents(w.amount)===cents(r.amount)&&new Date(w.occurred_at).getTime()===new Date(r.occurred_at).getTime());
  const reciprocal=ordered.filter(x=>x.kind===r.kind&&cents(x.amount)===cents(r.amount)&&new Date(x.occurred_at).getTime()===new Date(r.occurred_at).getTime()).length===1;
  const matched=reciprocal&&candidates.length===1?candidates[0]:null;
  const opposite=matched&&r.kind!=='yield'?bank.filter(w=>w.operation_id===matched.operation_id&&w.operation_kind==='reserve_transfer'&&cents(w.amount)===-cents(r.amount)&&new Date(w.occurred_at).getTime()===new Date(r.occurred_at).getTime()):[];
  return {...r,reconstructed_balance_cents:balances.get(r.id)??null,bank_capture_id:matched?.id||null,bank_operation_id:matched?.operation_id||null,movement_code:matched?.movement_code||null,opposite_capture_id:opposite.length===1?opposite[0].id:null,status:!matched?'unmatched':r.kind==='yield'?'interest_already_in_bank':opposite.length===1?'transfer_pair':'incomplete_transfer'};
 });
 return {anchor_found:!!anchor&&!anchorAmbiguous,anchor_ambiguous:anchors.length>1||anchorAmbiguous,anchor:{date:reference.date,before_deposit_cents:reference.depositCents,balance_cents:0},coverage:'captured_rows_only',items,current_reconstructed_balance_cents:items.at(-1)?.reconstructed_balance_cents??null};
}

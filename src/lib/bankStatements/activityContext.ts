export type StatementActivityContext={name:string|null;type:string|null;kind:string|null;status:'matched'|'pending'|'ambiguous'};
export type ActivityReference={id:string;prepared_entry_id:string|null;statement_entry_id:string|null;counterparty_name:string|null;activity_type:string|null;operation_kind:string|null};
export function statementActivityContexts(rows:ActivityReference[]){
 const groups=new Map<string,Map<string,ActivityReference>>();
 for(const row of rows)for(const id of new Set([row.prepared_entry_id,row.statement_entry_id].filter((value):value is string=>!!value))){const group=groups.get(id)||new Map();group.set(row.id,row);groups.set(id,group);}
 return new Map<string,StatementActivityContext>([...groups].map(([id,group])=>{if(group.size!==1)return[id,{name:null,type:null,kind:null,status:'ambiguous'}];const row=[...group.values()][0];return[id,{name:row.counterparty_name,type:row.activity_type,kind:row.operation_kind,status:row.counterparty_name||row.activity_type?'matched':'pending'}];}));
}

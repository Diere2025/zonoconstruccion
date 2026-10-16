const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const {test}=require('node:test');const assert=require('node:assert/strict');
function setup(request) {
 const exports={},state=[],calls=[];
 const react={useRef:()=>({current:false}),useState:value=>{const index=state.length;state.push(value);return [value,next=>{state[index]=next}];}};
 const actions={actionCommand:(a,t)=>a==='start'?{command:t.assignee_id?'assign':'take',payload:t.assignee_id?{assignee_id:t.assignee_id,responsibility_kind:'person'}:{}}:{command:a,payload:{}},availableActions:()=>['start','return_new']};
 const imports={'react':react,'@/lib/support/actions':actions,'@/lib/support/client':{supportRequest:(...args)=>{calls.push(args);return request(...args)},commandBody:(payload,version,action)=>JSON.stringify({payload,version,action}),errorMessage:e=>e.message}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/components/support/useQuickTicketAction.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:name=>imports[name],window:{dispatchEvent:()=>{}},Event:class {}});
 return {hook:exports.useQuickTicketAction(),state,calls};
}
const ticket={id:'ticket',status:'new',version:5,assignee_id:'assigned'};
test('one click sends the existing version directly, ignores double clicks and updates from the server',async()=>{
 let complete;const env=setup(()=>new Promise(resolve=>{complete=resolve}));let saved;
 const first=env.hook.run(ticket,'start',{},value=>{saved=value},()=>assert.fail('Unexpected failure'));
 assert.equal(env.state[0],'ticket');assert.equal(env.calls.length,1);
 assert.equal(env.calls[0][0],'tickets/ticket/actions');
 assert.equal(JSON.parse(env.calls[0][1].body).version,5);
 assert.equal(JSON.parse(env.calls[0][1].body).payload.assignee_id,'assigned');
 await env.hook.run(ticket,'start',{},()=>assert.fail('Duplicate'),()=>{});
 assert.equal(env.calls.length,1);
 const updated={...ticket,status:'in_progress',version:6};complete({ticket:updated});await first;
 assert.equal(saved,updated);assert.equal(env.state[0],null);assert.equal(env.calls.length,1);
});
test('a conflict leaves local state unchanged and asks the caller to reload',async()=>{
 const env=setup(async()=>{throw Error('Estado actualizado por otra persona')});let refreshed=false;
 await env.hook.run(ticket,'start',{},()=>assert.fail('Must not update'),()=>{refreshed=true});
 assert.equal(refreshed,true);assert.equal(env.state[0],null);assert.match(env.state[1],/otra persona/);
});
test('impersonation never sends a state change',async()=>{
 const env=setup(()=>assert.fail('Unexpected request'));
 await env.hook.run(ticket,'start',{impersonating:true},()=>{},()=>{});
 assert.equal(env.calls.length,0);
});

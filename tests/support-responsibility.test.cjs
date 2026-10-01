const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');const {test}=require('node:test');const assert=require('node:assert/strict');
function load(file,imports={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:name=>imports[name],Date});return exports;}
const types=load('src/lib/support/types.ts');const responsibility=load('src/lib/support/responsibility.ts');const actions=load('src/lib/support/actions.ts',{'./types':types,'./shipping':load('src/lib/support/shipping.ts')});
test('team tickets display the responsible area while individual tickets display the person',()=>{
 const ticket={sector_id:'logistics',assignee_id:null};const sectors=[{id:'logistics',name:'Logística'}];
 assert.equal(types.responsibleLabel(ticket,sectors,id=>'Pablo'),'Equipo de Logística');
 assert.equal(types.responsibleLabel({...ticket,assignee_id:'pablo'},sectors,id=>'Pablo'),'Pablo');
 assert.equal(actions.nextActor({...ticket,status:'new'},id=>id),'El equipo del área responsable debe atender');
});
test('pending inbox includes personal tickets and teams belonging to the user',()=>{
 assert.equal(responsibility.pendingResponsibilityFilter({user_id:'pablo',is_admin:false,sector_ids:['logistics','purchasing']}),'assignee_id.eq.pablo,and(assignee_id.is.null,sector_id.in.(logistics,purchasing))');
 assert.equal(responsibility.pendingResponsibilityFilter({user_id:'admin',is_admin:true,sector_ids:[]}),'assignee_id.eq.admin,assignee_id.is.null');
 assert.equal(responsibility.pendingResponsibilityFilter({user_id:'user',is_admin:false,sector_ids:[]}),'assignee_id.eq.user');
});

test('management includes a manager’s own closed requests outside their assigned areas',()=>{
 assert.equal(responsibility.managementVisibilityFilter({user_id:'carolina',sector_ids:['administration','finance']}),'created_by.eq.carolina,sector_id.in.(administration,finance)');
 assert.equal(responsibility.managementVisibilityFilter({user_id:'carolina',sector_ids:[]}),'created_by.eq.carolina');
});
test('starting attention is offered for both team and individual incident responsibility',()=>{
 const me={user_id:'manager',is_admin:true,sector_ids:[]};const ticket={workflow:'incident',created_by:'owner',status:'new',sector_id:'logistics',assignee_id:null};
 assert.ok(actions.availableActions(me,ticket).includes('start'));
 assert.ok(actions.availableActions(me,{...ticket,assignee_id:'other-manager'}).includes('start'));
 assert.equal(actions.actionLabel('start',ticket),'Poner en atención');
});

test('starting attention takes team tickets and preserves an already assigned person',()=>{
 const ticket={workflow:'incident',status:'new',assignee_id:null};
 const team=actions.actionCommand('start',ticket);
 assert.equal(team.command,'take');assert.deepEqual(Object.keys(team.payload),[]);
 const assigned=actions.actionCommand('start',{...ticket,assignee_id:'other-manager'});
 assert.equal(assigned.command,'assign');
 assert.equal(assigned.payload.assignee_id,'other-manager');
 assert.equal(assigned.payload.responsibility_kind,'person');
 assert.equal(actions.actionCommand('withdraw',ticket).command,'withdraw');
});

test('only authorized managers can start new tickets; waiting cases offer resume attention',()=>{
 const me={user_id:'manager',is_admin:false,sector_ids:['logistics']};
 const ticket={workflow:'incident',created_by:'owner',status:'new',sector_id:'logistics',assignee_id:'manager'};
 assert.ok(actions.availableActions(me,ticket).includes('start'));
 assert.ok(!actions.availableActions({...me,user_id:'owner',sector_ids:[]},ticket).includes('start'));
 assert.ok(!actions.availableActions(me,{...ticket,sector_id:'it'}).includes('start'));
 for(const status of ['in_progress','waiting_requester','waiting_validation','closed','cancelled']) {
  const allowed=actions.availableActions(me,{...ticket,status});
  assert.ok(!allowed.includes('start'));
  assert.equal(allowed.includes('withdraw'),['waiting_requester','waiting_validation'].includes(status));
 }
});

const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
function load(file, imports={}) {const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:name=>imports[name],Intl,Date});return exports;}
const types=load('src/lib/support/types.ts');
const shipping=load('src/lib/support/shipping.ts');
const actions=load('src/lib/support/actions.ts',{'./types':types,'./shipping':shipping});
test('quote validity includes the last Buenos Aires day; UTC midnight does not expire it early',()=>{
    const quote={valid_until:'2026-09-30'};
    assert.equal(shipping.quoteExpired(quote,new Date('2026-10-01T02:59:59Z')),false);
    assert.equal(shipping.quoteExpired(quote,new Date('2026-10-01T03:00:00Z')),true);
});
test('requester chooses logistics quotes while incident confirmation retains its original wording',()=>{
    const ticket={id:'id',workflow:'shipping',created_by:'owner',sector_id:'logistics',status:'waiting_validation'};
    const me={user_id:'owner',is_admin:false,sector_ids:[]};
    assert.deepEqual(Array.from(actions.availableActions(me,ticket)),['validate','reject','cancel']);
    assert.equal(actions.actionLabel('validate',ticket),'Elegir opción y finalizar');
    assert.equal(actions.actionLabel('validate',{...ticket,workflow:'incident'}),'Funciona, cerrar');
    assert.equal(actions.nextActor(ticket,id=>id),'owner debe elegir una opción');
    assert.equal(shipping.ticketPath(ticket),'/solicitudes-logistica/id');
});
test('logistics managers can resolve without a carrier and request information without an error-testing action',()=>{
    const ticket={workflow:'shipping',created_by:'owner',sector_id:'logistics',status:'new'};
    const me={user_id:'manager',is_admin:false,sector_ids:['logistics']};
    const allowed=actions.availableActions(me,ticket);
    assert.ok(allowed.includes('request_validation'));assert.ok(allowed.includes('request_info'));assert.ok(allowed.includes('close_admin'));assert.ok(allowed.includes('cancel'));
    assert.equal(allowed.includes('request_action'),false);
    assert.equal(actions.actionLabel('request_validation',ticket),'Publicar cotización');
});

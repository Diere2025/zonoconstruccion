// Migration, seed, fixtures and writes are ALWAYS rolled back.
process.loadEnvFile('.env.local');const fs=require('fs'),assert=require('node:assert/strict'),{Client}=require('pg'),{randomUUID}=require('crypto');
const {readSeedSource,seedPeople}=require('./financial-people-seed.cjs');
(async()=>{const db=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:15000});await db.connect();try{
 await db.query('begin');await db.query("set local lock_timeout='5s';set local statement_timeout='60s'");
 const snapshot=async()=>(await db.query("select count(*)::int n,md5(string_agg(to_jsonb(t)::text,'|' order by id)) hash from cash_transactions t")).rows;
 const before=await snapshot(),sql=fs.readFileSync('database/db_migration_v139_financial_people.sql','utf8').replace(/^begin;/im,'').replace(/^commit;/im,'');await db.query(sql);await db.query(sql);
 const source=await readSeedSource(db),seed=await seedPeople(db,source);assert.equal((await seedPeople(db,source)).created,0);assert.deepEqual(await snapshot(),before);console.log('PASS repeatable schema and seed; existing ledger unchanged',JSON.stringify(seed));
 const actor=(await db.query('select id from auth.users where can_manage_financial_operations(id) limit 1')).rows[0].id;
 const data={full_name:'ROLLBACK PERSON '+randomUUID(),kinds:['employee'],cuit:'',role:'Prueba',base_salary:'0',is_active:true},key=randomUUID();
 const save=async(id,version,values,request=randomUUID())=>(await db.query('select manage_financial_person($1,$2,$3,$4,$5,$6) result',[actor,request,id,version,values,'Ensayo reversible'])).rows[0].result;
 const person=await save(null,null,data,key);assert.deepEqual(await save(null,null,data,key),person);assert.ok(person.employee_id);
 const inactive=await save(person.id,person.version,{...data,is_active:false});assert.equal((await db.query('select is_active from employees where id=$1',[person.employee_id])).rows[0].is_active,false);
 async function rejects(label,call,pattern){await db.query('savepoint expected_failure');await assert.rejects(call,pattern);await db.query('rollback to savepoint expected_failure');console.log('PASS',label);}
 await rejects('stale person version rejected',()=>save(person.id,person.version,data),/cambió/);
 const enabled=await save(inactive.id,inactive.version,data);assert.equal(enabled.is_active,true);
 await rejects('existing aliases cannot create duplicate people',()=>save(null,null,{...data,full_name:'OLIVERA, MATIAS'}),/existe/);
 await rejects('unauthorized actor rejected',()=>db.query('select manage_financial_person($1,$2,null,null,$3,$4)',[randomUUID(),randomUUID(),data,'Prueba']),e=>e.code==='42501');
 const account=(await db.query("insert into financial_accounts(name,type,currency) values('ROLLBACK PERSON ACCOUNT','efectivo','ARS') returning id")).rows[0].id;
 const pm=(await db.query("select id from payment_methods where name='Transferencia' order by id limit 1")).rows[0].id;
 const payload={operation_type:'payroll_payment',effective_date:'2026-10-01',account_id:account,payment_method_id:pm,direction:'egreso',amount:'100',concept:'Prueba reversible',category:'Sueldos',employee_id:enabled.employee_id,person_id:enabled.id,detail:{period:'2026-10',payroll_kind:'salary'},allocations:[],voucher_ids:[]};
 const pay=async(p)=>(await db.query("select mutate_financial_operation($1,$2,'save',$3,'{}','') result",[actor,randomUUID(),p])).rows[0].result;
 const operation=await pay(payload);assert.equal((await db.query('select person_id from financial_operations where id=$1',[operation.operation_id])).rows[0].person_id,enabled.id);
 const disabled=await save(enabled.id,enabled.version,{...data,is_active:false});
 await rejects('disabled person cannot be paid through an expense',()=>pay({...payload,operation_type:'operating_expense',employee_id:undefined,detail:{}}),/deshabilitada/);
 await rejects('free-text payroll cannot bypass the register',()=>pay({...payload,employee_id:undefined,person_id:undefined,detail:{period:'2026-10',payroll_kind:'temporary',beneficiary:'Sin registro'}}),/registrado/);
 console.log('PASS person identity persisted atomically with money; disabled employee and free-text bypass blocked');
 const off=await db.query('select id from financial_people where is_active=false');assert.ok(off.rows.length>0);console.log('PASS inactive history retained and manual enable/disable synchronized');
}finally{await db.query('rollback');await db.end();console.log('ROLLBACK complete; no people or movements from this rehearsal saved');}})().catch(e=>{console.error(e.code||e.message);process.exitCode=1});

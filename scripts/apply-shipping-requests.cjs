const fs = require('node:fs');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Client } = require('pg');
process.loadEnvFile('.env.local');
const db = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
let checks = 0;
const check = (actual, expected) => { assert.deepEqual(actual, expected); checks++; };
async function actor(id) { await db.query('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,true)", [id]); await db.query('set local role authenticated'); }
async function command(action, ticket, version, data = {}, key = randomUUID()) { return (await db.query('select public.support_command($1,$2,$3,$4,$5) as result', [action,ticket,key,version,data])).rows[0].result; }
async function denied(fn, pattern) { await db.query('savepoint denied'); try { await fn(); assert.fail('Operation unexpectedly allowed'); } catch (e) { assert.match(e.message,pattern); checks++; } finally { await db.query('rollback to savepoint denied'); } }
async function ticket(id) { return (await db.query('select * from public.support_tickets where id=$1',[id])).rows[0]; }
async function test() {
    const owner = randomUUID(), manager = randomUUID(), other = randomUUID(), admin = randomUUID();
    await db.query('savepoint synthetic');
    const sector = (await db.query('select id from public.support_sectors where shipping_enabled and active')).rows[0]?.id;
    assert.ok(sector,'Active shipping sector required');
    for (const id of [owner,manager,other,admin]) {
        await db.query('insert into auth.users(id,email) values($1,$2)',[id,`shipping-${id}@example.invalid`]);
        await db.query("insert into public.sellers(id,email,full_name,is_active) values($1,$2,'Ensayo envíos',true)",[id,`shipping-${id}@example.invalid`]);
        await db.query('insert into public.support_profiles(user_id,seller_id) values($1,$1)',[id]);
    }
    await db.query('insert into public.support_sector_members(sector_id,user_id) values($1,$2)',[sector,manager]);
    await db.query('insert into public.support_admins(user_id) values($1)',[admin]);
    const request = {locality:'Viedma',province:'Río Negro',postal_code:'8500',products:'1 biodigestor de 600 L',customer:'Cliente ficticio',reference:'PRES-ENSAYO',conditions:'Entrega en sucursal'};
    const future = new Date(Date.now()+7*86400000).toISOString().slice(0,10);
    const quotes = [{carrier:'Expreso A',cost:113000,customer_price:110000,payment:'origin',delivery:'5 días hábiles',valid_until:future,conditions:'Incluye seguro'}, {carrier:'Expreso B',cost:129000,customer_price:129000,payment:'destination',delivery:'4 días hábiles',valid_until:future,conditions:''}];
    await actor(owner);
    await denied(()=>command('create',null,null,{workflow:'shipping',shipping_request:{...request,products:''}}),/SHIPPING_REQUEST_INVALID/);
    await denied(()=>command('create',null,null,{workflow:'wrong'}),/SUPPORT_INVALID/);
    const key=randomUUID(), data={workflow:'shipping',shipping_request:request,sector_id:randomUUID(),type:'error'};
    const result=await command('create',null,null,data,key);
    check(await command('create',null,null,data,key),result);
    await denied(()=>command('create',null,null,{...data,shipping_request:{...request,locality:'Otro'}},key),/SUPPORT_CONFLICT/);
    let t=await ticket(result.id);check(t.workflow,'shipping');check(t.type,'request');check(t.sector_id,sector);check(t.shipping_request,request);
    await denied(()=>command('shipping_quote',t.id,t.version,{quotes}),/SUPPORT_FORBIDDEN/);
    await actor(other);check((await db.query('select id from public.support_tickets where id=$1',[t.id])).rowCount,0);
    check((await db.query('select id from public.support_messages where ticket_id=$1',[t.id])).rowCount,0);
    await denied(()=>command('take',t.id,t.version),/SUPPORT_NOT_FOUND/);
    await denied(()=>db.query('select public.support_command_core($1,$2,$3,$4,$5)',['take',t.id,randomUUID(),t.version,{}]),/permission denied/);
    await actor(manager);
    await denied(()=>command('request_validation',t.id,t.version,{body:'Bypass',solution:'Bypass'}),/SUPPORT_INVALID/);
    await denied(()=>command('classify',t.id,t.version,{type:'error',priority:'medium'}),/SUPPORT_INVALID/);
    for (const bad of [[],[{...quotes[0],cost:-1}],[{...quotes[0],customer_price:'100'}],[{...quotes[0],cost:1.001}],[{...quotes[0],payment:'unknown'}],[{...quotes[0],carrier:''}],[{...quotes[0],valid_until:'2020-01-01'}]])
        await denied(()=>command('shipping_quote',t.id,t.version,{quotes:bad}),/SHIPPING_QUOTE_(INVALID|EXPIRED)/);
    const qKey=randomUUID(), qData={quotes};
    const published=await command('shipping_quote',t.id,t.version,qData,qKey);
    check(await command('shipping_quote',t.id,t.version,qData,qKey),published);
    t=await ticket(t.id);check(t.status,'waiting_validation');check(t.shipping_quotes,quotes);check(t.assignee_id,manager);
    check((await db.query("select count(*)::int as n from public.support_events where ticket_id=$1 and kind='shipping_quote'",[t.id])).rows[0].n,1);
    await denied(()=>command('shipping_finish',t.id,t.version,{selected:0}),/SUPPORT_FORBIDDEN/);
    await actor(owner);
    await denied(()=>command('validate',t.id,t.version,{confirmed:true}),/SUPPORT_INVALID/);
    await denied(()=>command('shipping_finish',t.id,t.version,{selected:99}),/SHIPPING_QUOTE_INVALID/);
    await denied(()=>command('shipping_finish',t.id,t.version-1,{selected:0}),/SUPPORT_CONFLICT/);
    await command('shipping_requote',t.id,t.version,{body:'Consultar entrega a domicilio.'});
    t=await ticket(t.id);check(t.status,'in_progress');check(t.shipping_selected,null);
    await actor(manager);await command('request_info',t.id,t.version,{body:'Indicá dirección y acceso.'});
    t=await ticket(t.id);check(t.status,'waiting_requester');
    await actor(owner);await command('respond',t.id,t.version,{body:'Dirección ficticia, acceso para camión.'});
    t=await ticket(t.id);check(t.status,'in_progress');
    await actor(manager);await command('shipping_quote',t.id,t.version,{quotes});t=await ticket(t.id);
    await db.query('reset role');
    await db.query("update public.support_tickets set shipping_quotes=jsonb_set(shipping_quotes,'{0,valid_until}','\"2020-01-01\"') where id=$1",[t.id]);
    await actor(owner);await denied(()=>command('shipping_finish',t.id,t.version,{selected:0}),/SHIPPING_QUOTE_EXPIRED/);
    const finishKey=randomUUID();const finished=await command('shipping_finish',t.id,t.version,{selected:1},finishKey);
    check(await command('shipping_finish',t.id,t.version,{selected:1},finishKey),finished);
    t=await ticket(t.id);check(t.status,'closed');check(t.shipping_selected,1);
    await command('reopen',t.id,t.version,{body:'Cambió la cantidad.'});t=await ticket(t.id);check(t.shipping_selected,null);
    await command('cancel',t.id,t.version,{body:'Cliente desistió.'});t=await ticket(t.id);check(t.status,'cancelled');
    await actor(admin);
    await command('restore',t.id,t.version,{body:'Cliente retomó la consulta.'});t=await ticket(t.id);check(t.status,'new');
    await db.query('reset role');
    await db.query('update public.support_sector_members set active=false where sector_id=$1 and user_id=$2',[sector,manager]);
    await actor(manager);check((await db.query('select id from public.support_tickets where id=$1',[t.id])).rowCount,0);
    await actor(owner);
    const incident=await command('create',null,null,{title:'Incidencia de regresión',description:'Reporte de ensayo para verificar el circuito existente.',type:'error',sector_id:sector,responsibility_kind:'area'});
    await actor(admin);await command('request_validation',incident.id,1,{body:'Probá la solución.',solution:'Solución de ensayo.'});
    await actor(owner);await command('validate',incident.id,2,{confirmed:true});check((await ticket(incident.id)).status,'closed');
    await db.query('reset role');await db.query('rollback to savepoint synthetic');
}
(async()=>{
    await db.connect();await db.query('begin');
    try {
        await db.query("set local lock_timeout='5s'");
        const installed=(await db.query("select exists(select 1 from information_schema.columns where table_schema='public' and table_name='support_tickets' and column_name='workflow') as installed")).rows[0].installed;
        if (!installed) await db.query(fs.readFileSync('database/db_migration_v123_shipping_requests.sql','utf8'));
        await test();
        if (process.argv.includes('--apply')) {
            for (const [id,name] of [['1b64f354-e229-41c9-8c5f-ca294878f70f','Pablo Jara'],['381abc1a-6db1-49f4-983c-c1278f8b3a51','Matías Vega']]) {
                const verified=await db.query("select p.user_id from public.support_profiles p join public.sellers s on s.id=p.seller_id where p.user_id=$1 and s.full_name=$2 and s.is_active and public.support_user_active(p.user_id)",[id,name]);
                assert.equal(verified.rowCount,1,`Account mismatch: ${name}`);
                await db.query('insert into public.support_sector_members(sector_id,user_id,active) select id,$1,true from public.support_sectors where shipping_enabled and active on conflict(sector_id,user_id) do update set active=true',[id]);
            }
            await db.query("notify pgrst,'reload schema'");await db.query('commit');
        } else await db.query('rollback');
        console.log(JSON.stringify({checks,migration:process.argv.includes('--apply')?'v123 applied; Pablo Jara and Matías Vega enabled':'rolled back',syntheticData:'rolled back'}));
    } catch(e) {await db.query('rollback');throw e;} finally {await db.end();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});

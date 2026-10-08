const fs = require('node:fs');
const assert = require('node:assert/strict');
const {randomUUID} = require('node:crypto');
const {Client} = require('pg');
const {createClient} = require('@supabase/supabase-js');
process.loadEnvFile('.env.local');
const base=process.env.SUPPORT_TEST_URL || 'http://localhost:3000';
const db=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:10000});
const service=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const users=[], sessions={};let browser, checks=0;
async function api(who,route,options={}) {
    const response=await fetch(`${base}/api/support/${route}`,{...options,headers:{Authorization:`Bearer ${sessions[who].access_token}`,'Content-Type':'application/json',...options.headers}});
    const data=await response.json();return {status:response.status,data};
}
async function detail(who,id) { const r=await api(who,`tickets/${id}`);assert.equal(r.status,200,JSON.stringify(r.data));return r.data.ticket; }
async function mutate(who,id,action,payload) {
    const t=await detail(who,id);const r=await api(who,`tickets/${id}/actions`,{method:'POST',body:JSON.stringify({action,payload,expectedVersion:t.version,idempotencyKey:randomUUID()})});
    assert.equal(r.status,200,JSON.stringify(r.data));checks++;return detail(who,id);
}
async function cleanup() {
    const ids=users.map(u=>u.id);if(!ids.length)return;
    const files=await db.query('select path from public.support_attachments where created_by=any($1::uuid[])',[ids]);
    if(files.rows.length){const r=await service.storage.from('support-attachments').remove(files.rows.map(f=>f.path));if(r.error)throw r.error;}
    await db.query('begin');await db.query('select pg_advisory_xact_lock(106106)');
    try {
        for(const table of ['support_notifications','support_attachments','support_action_requests','support_events','support_messages','support_reads','support_operations'])
            await db.query(`delete from public.${table} where ticket_id in (select id from public.support_tickets where created_by=any($1::uuid[]))`,[ids]);
        await db.query('delete from public.support_notifications where user_id=any($1::uuid[])',[ids]);
        await db.query('delete from public.support_reads where user_id=any($1::uuid[])',[ids]);
        await db.query('delete from public.support_operations where user_id=any($1::uuid[])',[ids]);
        await db.query('delete from public.support_tickets where created_by=any($1::uuid[])',[ids]);
        for(const table of ['support_sector_members','support_admins','support_profiles']) await db.query(`delete from public.${table} where user_id=any($1::uuid[])`,[ids]);
        await db.query('delete from public.sellers where id=any($1::uuid[])',[ids]);await db.query('commit');
    } catch(e){await db.query('rollback');throw e;}
    for(const user of users){const r=await service.auth.admin.deleteUser(user.id);if(r.error)throw r.error;}
}
(async()=>{
    await db.connect();
    try {
        const sector=(await db.query('select id from public.support_sectors where shipping_enabled and active')).rows[0].id;
        for(const who of ['owner','manager','other']) {
            const email=`shipping-test-${who}-${randomUUID()}@example.invalid`,password=randomUUID()+randomUUID();
            const created=await service.auth.admin.createUser({email,password,email_confirm:true});if(created.error)throw created.error;
            const user=created.data.user;users.push(user);
            await db.query('insert into public.sellers(id,email,full_name,is_active,role) values($1,$2,$3,true,$4)',[user.id,email,`Ensayo envío ${who}`,who==='manager'?'logistica':'seller']);
            await db.query('insert into public.support_profiles(user_id,seller_id) values($1,$1)',[user.id]);
            if(who==='manager')await db.query('insert into public.support_sector_members(sector_id,user_id) values($1,$2)',[sector,user.id]);
            const auth=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
            const signed=await auth.auth.signInWithPassword({email,password});if(signed.error)throw signed.error;sessions[who]=signed.data.session;
        }
        const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');browser=await chromium.launch({channel:'chrome',headless:true});
        const key=`sb-${new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0]}-auth-token`;
        async function pageFor(who){const context=await browser.newContext({viewport:{width:1440,height:1000}});await context.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key,session:sessions[who]});return context.newPage();}
        const owner=await pageFor('owner'), manager=await pageFor('manager');const errors=[];
        for(const p of [owner,manager])p.on('pageerror',e=>errors.push(e.message));
        await owner.goto(`${base}/solicitudes-logistica/nueva`);
        await owner.locator('[name=locality]').fill('Viedma');await owner.locator('[name=province]').fill('Río Negro');await owner.locator('[name=postal_code]').fill('8500');
        await owner.locator('[name=products]').fill('1 biodigestor de 600 L');await owner.locator('[name=conditions]').fill('Entrega a sucursal');
        await owner.getByRole('button',{name:'Solicitar cotización',exact:true}).click();
        await owner.waitForURL(/\/solicitudes-logistica\/[0-9a-f-]{36}$/,{timeout:60000});
        const id=new URL(owner.url()).pathname.split('/').pop();let t=await detail('owner',id);assert.equal(t.workflow,'shipping');checks++;
        await owner.getByText('Solicitud de envío',{exact:true}).waitFor({timeout:60000});
        assert.equal((await api('other',`tickets/${id}`)).status,404);checks++;
        await manager.goto(`${base}/solicitudes-logistica`);
        await manager.getByText('Envío a Viedma · Río Negro',{exact:true}).waitFor({timeout:60000});
        await manager.getByText('Envío a Viedma · Río Negro',{exact:true}).click();
        await manager.getByRole('button',{name:'Publicar cotización',exact:true}).click();
        const dialog=manager.getByRole('dialog');await dialog.getByLabel('Transporte / expreso',{exact:true}).fill('Expreso de ensayo');
        await dialog.getByLabel('Costo transporte',{exact:true}).fill('113000');await dialog.getByLabel('Importe al cliente',{exact:true}).fill('110000');
        await dialog.getByLabel('Plazo estimado',{exact:true}).fill('5 días hábiles');await dialog.getByLabel('Vigente hasta',{exact:true}).fill(new Date(Date.now()+7*86400000).toISOString().slice(0,10));
        await dialog.getByRole('button',{name:'Publicar cotización',exact:true}).click();await dialog.waitFor({state:'hidden',timeout:60000});
        t=await detail('owner',id);assert.equal(t.status,'waiting_validation');assert.equal(t.shipping_quotes[0].customer_price,110000);checks++;
        const notices=await api('owner','notifications');assert.ok(notices.data.items.some(n=>n.ticket_id===id && n.kind==='shipping_quote' && n.workflow==='shipping'));checks++;
        await owner.reload();await owner.getByRole('button',{name:'Pedir recotización',exact:true}).click();
        await owner.getByRole('dialog').getByRole('textbox').fill('Consultar entrega a domicilio.');await owner.getByRole('dialog').getByRole('button',{name:'Pedir recotización',exact:true}).click();
        await owner.getByRole('dialog').waitFor({state:'hidden',timeout:60000});assert.equal((await detail('owner',id)).status,'in_progress');checks++;
        await mutate('manager',id,'shipping_quote',{quotes:t.shipping_quotes});
        await owner.reload();await owner.getByRole('button',{name:'Elegir opción y finalizar',exact:true}).click();
        await owner.getByRole('dialog').getByRole('radio').check();await owner.getByRole('dialog').getByRole('button',{name:'Elegir opción y finalizar',exact:true}).click();
        await owner.getByRole('dialog').waitFor({state:'hidden',timeout:60000});t=await detail('owner',id);assert.equal(t.status,'closed');assert.equal(t.shipping_selected,0);checks++;
        fs.mkdirSync('output/shipping-tests',{recursive:true});await owner.screenshot({path:'output/shipping-tests/finished-desktop.png',fullPage:true});
        await owner.setViewportSize({width:390,height:844});
        const closeMenu=owner.getByRole('button',{name:'Cerrar menú lateral',exact:true});
        if(await closeMenu.isVisible())await closeMenu.click();
        await owner.locator('#erp-sidebar[aria-hidden=true]').waitFor({timeout:10000});
        await owner.waitForFunction(()=>document.querySelector('#erp-sidebar').getBoundingClientRect().right<=0,{},{timeout:10000});
        await owner.getByText('Solicitud de envío',{exact:true}).waitFor({timeout:10000});
        await owner.screenshot({path:'output/shipping-tests/finished-mobile.png',fullPage:true});
        assert.ok(await owner.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));checks++;
        await owner.goto(`${base}/solicitudes-logistica`);await owner.getByRole('button',{name:'Finalizadas',exact:true}).click();
        await owner.getByText('Envío a Viedma · Río Negro',{exact:true}).waitFor({timeout:60000});checks++;
        await owner.goto(`${base}/incidencias/mis`);await owner.getByRole('button',{name:'Todas',exact:true}).click();
        await owner.getByRole('heading',{name:'No hay incidencias en esta vista',exact:true}).waitFor({timeout:60000});checks++;
        assert.equal(errors.length,0,errors.join('\n'));checks++;
        console.log(JSON.stringify({checks,result:'passed',creation:'browser',quotes:'browser',requote:'browser',selection:'browser',mobile:'390px; no overflow',privacy:'404 for unrelated user',notices:'shipping link',incidentInbox:'separate'}));
    } finally {if(browser)await browser.close();await cleanup();await db.end();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});

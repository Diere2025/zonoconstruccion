// Verify the administrator landing page using a temporary account; never changes imported tickets.
const assert = require('node:assert/strict');
const {randomUUID} = require('node:crypto');
const {Client} = require('pg');
const {createClient} = require('@supabase/supabase-js');
process.loadEnvFile('.env.local');
const base = process.env.SUPPORT_TEST_URL || 'http://localhost:3000';
const db = new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:10000});
const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
let browser;
let userId;
(async()=>{
  try {
    await db.connect();
    const password=randomUUID()+randomUUID();
    const email=`support-test-landing-${randomUUID()}@example.invalid`;
    const created=await service.auth.admin.createUser({email,password,email_confirm:true});
    if(created.error)throw new Error('Could not create temporary test account');
    userId=created.data.user.id;
    await db.query("insert into public.sellers(id,email,full_name,is_active,role) values($1,$2,'Administrador de ensayo',true,'seller')",[userId,email]);
    await db.query('insert into public.support_profiles(user_id,seller_id) values($1,$1)',[userId]);
    await db.query('insert into public.support_admins(user_id) values($1)',[userId]);
    const auth=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
    const signed=await auth.auth.signInWithPassword({email,password});
    if(signed.error)throw new Error('Temporary login failed');
    const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
    browser=await chromium.launch({channel:'chrome',headless:true});
    const context=await browser.newContext({viewport:{width:1440,height:900}});
    const key=`sb-${new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0]}-auth-token`;
    await context.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key,session:signed.data.session});
    const page=await context.newPage();
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`${base}/incidencias`);
    await page.getByRole('heading',{name:'Bandeja de gestión',exact:true}).waitFor({timeout:60000});
    await page.getByText('INC-000018',{exact:true}).waitFor({timeout:60000});
    assert.equal(await page.locator('tbody > tr').filter({has:page.getByText('Carolina Ibarra',{exact:true})}).count(),8);
    assert.ok(await page.locator('tbody > tr').nth(7).evaluate(row=>row.getBoundingClientRect().bottom<=innerHeight));
    await page.screenshot({path:'output/support-tests/carolina-table-desktop.png',fullPage:true});
    await page.getByRole('combobox',{name:'Estado',exact:true}).selectOption('closed');
    await page.waitForURL(/status=closed/);
    await page.getByText('INC-000023',{exact:true}).waitFor({timeout:60000});
    await page.getByText('INC-000023',{exact:true}).click();
    await page.getByRole('link',{name:'← Volver a la bandeja',exact:true}).waitFor({timeout:60000});
    await page.getByRole('link',{name:'← Volver a la bandeja',exact:true}).click();
    await page.waitForURL(/status=closed/);
    assert.equal(await page.getByRole('combobox',{name:'Estado',exact:true}).inputValue(),'closed');
    await page.getByRole('combobox',{name:'Estado',exact:true}).selectOption('');
    await page.getByText('INC-000018',{exact:true}).waitFor({timeout:60000});
    await page.getByRole('link',{name:'Mis solicitudes',exact:true}).click();
    await page.getByRole('heading',{name:'Mis solicitudes',exact:true}).waitFor({timeout:60000});
    await page.getByRole('heading',{name:'No hay incidencias en esta vista',exact:true}).waitFor({timeout:60000});
    assert.equal(await page.getByText('INC-000018',{exact:true}).count(),0);
    await page.getByRole('link',{name:'Gestión',exact:true}).click();
    await page.getByText('INC-000018',{exact:true}).waitFor({timeout:60000});
    await page.getByText('INC-000018',{exact:true}).click();
    await page.waitForURL(/\/incidencias\/[0-9a-f-]{36}(?:\?|$)/,{timeout:60000});
    await page.locator('dl > div').filter({has:page.getByText('Solicitante',{exact:true})}).getByText('Carolina Ibarra',{exact:true}).waitFor({timeout:60000});
    assert.equal(errors.length,0,errors.join('\n'));
    console.log(JSON.stringify({result:'passed',managerLanding:'management',carolinaIsRequester:true,personalViewSeparate:true}));
  } finally {
    if(browser)await browser.close();
    if(userId){
      await db.query('begin');
      await db.query('select pg_advisory_xact_lock(106106)');
      await db.query('delete from public.support_notifications where user_id=$1',[userId]);
      await db.query('delete from public.support_reads where user_id=$1',[userId]);
      await db.query('delete from public.support_operations where user_id=$1',[userId]);
      await db.query('delete from public.support_admins where user_id=$1',[userId]);
      await db.query('delete from public.support_profiles where user_id=$1',[userId]);
      await db.query('delete from public.sellers where id=$1',[userId]);
      await db.query('commit');
      const deleted=await service.auth.admin.deleteUser(userId);
      if(deleted.error)throw new Error('Temporary account cleanup failed');
    }
    await db.end();
  }
})().catch(async e=>{console.error(e.message);process.exitCode=1;await db.query('rollback').catch(()=>{});await db.end().catch(()=>{});});

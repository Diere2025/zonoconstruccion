// End-to-end API/browser/storage test. Creates only named synthetic accounts and
// removes their tickets, images, sectors, sessions and identities in finally.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Client } = require('pg');
const { createClient } = require('@supabase/supabase-js');
process.loadEnvFile('.env.local');
const base = process.env.SUPPORT_TEST_URL || 'http://localhost:3106';
const storage = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const db = new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:10000});
const users = [];const sectors = [];const tokens = {};const errors = [];let browser;let checks=0;
async function request(who,route,options={}) {
 const headers = new Headers(options.headers);headers.set('Authorization',`Bearer ${tokens[who].access_token}`);
 if(typeof options.body==='string')headers.set('Content-Type','application/json');
 const result=await fetch(`${base}/api/support/${route}`,{...options,headers});
 const data=result.headers.get('content-type')?.includes('application/json')?await result.json():new Uint8Array(await result.arrayBuffer());
 return {status:result.status,data,headers:result.headers};
}
const payload=(data,version,action,key=randomUUID())=>JSON.stringify({payload:data,expectedVersion:version,action,idempotencyKey:key});
async function mutation(who,id,action,data,version) {
 const result=await request(who,`tickets/${id}/actions`,{method:'POST',body:payload(data,version,action)});assert.equal(result.status,200,JSON.stringify(result.data));checks++;return result.data;
}
async function detail(who,id){const result=await request(who,`tickets/${id}`);assert.equal(result.status,200,JSON.stringify(result.data));return result.data.ticket;}
async function image(who,id,bytes,visibility='public') {
 const form=new FormData();form.set('file',new Blob([bytes],{type:'image/png'}),'captura-ensayo.png');form.set('idempotencyKey',randomUUID());form.set('ticket_id',id);form.set('visibility',visibility);
 const result=await request(who,'uploads',{method:'POST',body:form});assert.equal(result.status,201,JSON.stringify(result.data));checks++;return result.data.id;
}
async function cleanup() {
 if(!users.length)return;
 const ids=users.map(u=>u.id);
 const files=await db.query('select path from public.support_attachments where created_by=any($1::uuid[])',[ids]);
 if(files.rows.length){const deleted=await storage.storage.from('support-attachments').remove(files.rows.map(f=>f.path));if(deleted.error)throw new Error('test_storage_cleanup_failed');}
 await db.query('begin');
 await db.query('select pg_advisory_xact_lock(106106)');
 try {
  await db.query('delete from public.support_notifications where user_id=any($1::uuid[]) or ticket_id in (select id from public.support_tickets where created_by=any($1::uuid[]))',[ids]);
  await db.query('delete from public.support_attachments where created_by=any($1::uuid[])',[ids]);
  await db.query('delete from public.support_action_requests where ticket_id in (select id from public.support_tickets where created_by=any($1::uuid[]))',[ids]);
  await db.query('delete from public.support_events where actor_id=any($1::uuid[]) or ticket_id in (select id from public.support_tickets where created_by=any($1::uuid[]))',[ids]);
  await db.query('delete from public.support_messages where ticket_id in (select id from public.support_tickets where created_by=any($1::uuid[]))',[ids]);
  await db.query('delete from public.support_reads where user_id=any($1::uuid[]) or ticket_id in (select id from public.support_tickets where created_by=any($1::uuid[]))',[ids]);
  await db.query('delete from public.support_operations where user_id=any($1::uuid[]) or ticket_id in (select id from public.support_tickets where created_by=any($1::uuid[]))',[ids]);
  await db.query('delete from public.support_tickets where created_by=any($1::uuid[])',[ids]);
  await db.query('delete from public.support_sector_members where user_id=any($1::uuid[])',[ids]);
  await db.query('delete from public.support_admins where user_id=any($1::uuid[])',[ids]);
  await db.query('delete from public.support_sectors where id=any($1::uuid[])',[sectors]);
  await db.query('delete from public.support_profiles where user_id=any($1::uuid[])',[ids]);
  await db.query('delete from public.sellers where id=any($1::uuid[])',[ids]);
  await db.query('commit');
 }catch(e){await db.query('rollback');throw e;}
 for(const user of users){const removed=await storage.auth.admin.deleteUser(user.id);if(removed.error)throw new Error('test_identity_cleanup_failed');}
}
(async()=>{
 await db.connect();
 if(!(await db.query("select to_regclass('public.support_tickets') as table")).rows[0].table)throw new Error('Install v106 before the live test');
 const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
 browser=await chromium.launch({channel:'chrome',headless:true});
 fs.mkdirSync('output/support-tests',{recursive:true});
 const fixture=await browser.newPage({viewport:{width:1000,height:440}});
 await fixture.setContent('<html><body style="margin:0;padding:36px;background:#f8fafc;font-family:Arial;color:#0f172a"><h1>Rendición de prueba</h1><p>Captura de ensayo · datos ficticios</p><div style="padding:24px;border:1px solid #cbd5e1;border-radius:12px;background:white"><h2>Movimiento #DEMO-123</h2><p>Estado: pendiente de revisión</p><p>Resultado esperado: aparece la opción de eliminar.</p><button style="padding:12px 24px;background:#4f46e5;color:white;border:0;border-radius:8px">Confirmar</button></div></body></html>');
 const png=await fixture.screenshot();await fixture.close();
 const run=randomUUID().slice(0,8);
 for(const [who,name] of Object.entries({a:'Solicitante de ensayo',b:'Otro solicitante de ensayo',resolver:'Responsable de ensayo',admin:'Administrador de ensayo'})){
  const password=randomUUID()+randomUUID();const email=`support-test-${run}-${who}@example.invalid`;
  const created=await storage.auth.admin.createUser({email,password,email_confirm:true});if(created.error)throw new Error(`create_test_user_failed:${created.error.code}`);
  users.push({id:created.data.user.id,who});
  await db.query("insert into public.sellers(id,email,full_name,is_active,role) values($1,$2,$3,true,$4) on conflict(id) do update set full_name=excluded.full_name,is_active=true",[created.data.user.id,email,name,who==='resolver'?'logistica':'seller']);
  const client=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const signed=await client.auth.signInWithPassword({email,password});if(signed.error)throw new Error(`test_login_failed:${signed.error.code}`);tokens[who]=signed.data.session;
  const registered=await request(who,'me');assert.equal(registered.status,200,JSON.stringify(registered.data));checks++;
 }
 const sector=(await db.query('insert into public.support_sectors(name) values($1) returning id',[`Sector de ensayo ${run}`])).rows[0].id;sectors.push(sector);
 const otherSector=(await db.query('insert into public.support_sectors(name) values($1) returning id',[`Otro sector de ensayo ${run}`])).rows[0].id;sectors.push(otherSector);
 await db.query('insert into public.support_sector_members(sector_id,user_id) values($1,$2)',[sector,users.find(u=>u.who==='resolver').id]);
 await db.query('insert into public.support_admins(user_id) values($1)',[users.find(u=>u.who==='admin').id]);
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 const storageKey=`sb-${new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0]}-auth-token`;
 await context.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key:storageKey,session:tokens.a});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${base}/incidencias/nueva`);await page.getByRole('heading',{name:'Nueva incidencia'}).waitFor({timeout:60000});
 await page.getByRole('textbox',{name:'Título',exact:true}).fill('No puedo eliminar una rendición de prueba');
 await page.getByRole('textbox',{name:'Descripción',exact:true}).fill('Al entrar a la rendición no encuentro la opción de eliminar. Adjunto una captura para mostrar la pantalla.');
 await page.getByRole('combobox',{name:'Sector responsable'}).selectOption(sector);
 // Exercise image paste, independent of the operating system clipboard.
 await page.locator('textarea[name="description"]').evaluate((element,base64)=>{
   const data=new DataTransfer();const raw=atob(base64);const bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));data.items.add(new File([bytes],'captura-pegada.png',{type:'image/png'}));
   element.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));
 },png.toString('base64'));
 await page.getByAltText('Vista previa de captura-pegada.png').waitFor();checks++;
 await page.getByRole('button',{name:'Crear incidencia',exact:true}).click();await page.waitForURL(/\/incidencias\/[0-9a-f-]{36}$/,{timeout:60000});
 const id=page.url().split('/').pop();await page.getByRole('heading',{name:'No puedo eliminar una rendición de prueba',exact:true}).waitFor({timeout:60000});
 await page.getByAltText('captura-pegada.png',{exact:true}).waitFor({timeout:60000});
 await page.getByAltText('captura-pegada.png',{exact:true}).click();
 const viewer=page.getByRole('dialog',{name:'Visor de captura'});await viewer.waitFor();await viewer.getByAltText('captura-pegada.png',{exact:true}).waitFor({timeout:60000});
 await viewer.getByRole('button',{name:'Tamaño original',exact:true}).click();
 assert.ok(await viewer.getByAltText('captura-pegada.png',{exact:true}).evaluate(img=>img.naturalWidth>=1000));checks++;
 await viewer.getByRole('button',{name:'Cerrar visor',exact:true}).click();
 await page.screenshot({path:'output/support-tests/ticket-desktop.png',fullPage:true});
 let t=await detail('a',id);assert.equal(t.status,'new');checks++;
 const original=(await db.query("select key,request from public.support_operations where user_id=$1 and ticket_id=$2 and request->>'command'='create'",[users.find(u=>u.who==='a').id,id])).rows[0];
 const retried=await request('a','tickets',{method:'POST',body:payload(original.request.data,undefined,undefined,original.key)});assert.equal(retried.status,201);assert.equal(retried.data.id,id);checks++;
 assert.equal((await request('b','settings')).status,403);assert.equal((await request('resolver','settings')).status,403);assert.equal((await request('admin','settings')).status,200);checks++;
 for(const route of [`tickets/${id}`,`tickets/${id}/timeline`]){assert.equal((await request('b',route)).status,404);checks++;}
 assert.equal((await request('b','tickets')).data.items.length,0);checks++;
 const publicFile=(await db.query('select id from public.support_attachments where ticket_id=$1',[id])).rows[0].id;
 assert.equal((await request('a',`attachments/${publicFile}`)).status,200);checks++;
 assert.equal((await request('b',`attachments/${publicFile}`)).status,404);checks++;
 assert.ok((await request('a',`attachments/${publicFile}`)).headers.get('cache-control').includes('no-store'));checks++;
 await mutation('resolver',id,'take',{},t.version);t=await detail('resolver',id);
 assert.equal((await request('admin',`tickets/${id}/actions`,{method:'POST',body:payload({},1,'take')})).status,409);checks++;
 const internalFile=await image('resolver',id,png,'internal');
 const note=await request('resolver',`tickets/${id}/messages`,{method:'POST',body:payload({body:'Nota privada de diagnóstico.',visibility:'internal',attachments:[internalFile]},t.version)});assert.equal(note.status,200,JSON.stringify(note.data));checks++;
 assert.equal((await request('a',`attachments/${internalFile}`)).status,404);checks++;
 assert.ok(!(await request('a',`tickets/${id}/timeline`)).data.items.some(e=>e.visibility==='internal'));checks++;
 // Filter private messages before pagination, rather than filtering a downloaded page.
 for(let i=0;i<24;i++)for(const visibility of ['public','internal']){
  await db.query(`with m as (insert into public.support_messages(ticket_id,author_id,body,visibility) values($1,$2,$3,$4) returning id)
    insert into public.support_events(ticket_id,actor_id,kind,message_id,visibility) select $1,$2,'message',id,$4 from m`,[id,users.find(u=>u.who==='resolver').id,`${visibility==='internal'?'Nota privada':'Mensaje público'} de ensayo ${i}`,visibility]);
 }
 const conversation1=await request('a',`tickets/${id}/timeline?category=conversation&limit=20`);assert.equal(conversation1.status,200);assert.equal(conversation1.data.items.length,20);assert.ok(conversation1.data.next);assert.ok(conversation1.data.items.every(e=>e.visibility==='public'));checks++;
 const conversation2=await request('a',`tickets/${id}/timeline?category=conversation&limit=20&cursor=${encodeURIComponent(conversation1.data.next)}`);assert.equal(conversation2.status,200);assert.ok(conversation2.data.items.length>0);assert.ok(conversation2.data.items.every(e=>!conversation1.data.items.some(x=>x.id===e.id)));checks++;
 assert.equal((await request('a',`tickets/${id}/timeline?category=notes&limit=20`)).data.items.length,0);const notes=await request('resolver',`tickets/${id}/timeline?category=notes&limit=20`);assert.equal(notes.data.items.length,20);assert.ok(notes.data.items.every(e=>e.visibility==='internal'));checks++;
 const storageDirect=await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/authenticated/support-attachments/${users.find(u=>u.who==='resolver').id}/${internalFile}`,{headers:{apikey:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,Authorization:`Bearer ${tokens.a.access_token}`}});assert.notEqual(storageDirect.status,200);checks++;
 await mutation('resolver',id,'request_info',{body:'Indicá desde qué pantalla ingresaste y agregá la captura.'},t.version);t=await detail('a',id);
 await mutation('a',id,'respond',{body:'Ingresé a Tesorería y Finanzas, desde Rendiciones.'},t.version);t=await detail('resolver',id);
 await mutation('resolver',id,'request_validation',{body:'Abrí una rendición de prueba y comprobá que aparezca Eliminar.',solution:'Se corrigió la disponibilidad de la opción.'},t.version);t=await detail('a',id);
 await mutation('a',id,'reject',{body:'Todavía no aparece en una rendición nueva.'},t.version);t=await detail('resolver',id);
 await mutation('resolver',id,'request_validation',{body:'Volvé a ingresar y probá con una rendición nueva.',solution:'Se corrigió el permiso y se verificó la pantalla.'},t.version);
 await page.reload();await page.getByText('Te toca probar la solución',{exact:true}).waitFor({timeout:60000});
 await page.screenshot({path:'output/support-tests/validacion-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(350);await page.screenshot({path:'output/support-tests/validacion-mobile.png',fullPage:true});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);checks++;
 await page.getByRole('button',{name:'Funciona, cerrar',exact:true}).click();
 await page.getByRole('dialog',{name:'Funciona, cerrar',exact:true}).getByRole('button',{name:'Funciona, cerrar',exact:true}).click();
 await page.getByText('Cerrado',{exact:true}).first().waitFor({timeout:60000});t=await detail('a',id);assert.equal(t.closure_kind,'validated');checks++;
 const resolverContext=await browser.newContext({viewport:{width:1440,height:1000}});
 await resolverContext.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key:storageKey,session:tokens.resolver});
 const resolverPage=await resolverContext.newPage();resolverPage.on('pageerror',e=>errors.push(e.message));
 await resolverPage.goto(`${base}/incidencias/gestion`);await resolverPage.getByRole('heading',{name:'Bandeja de gestión'}).waitFor({timeout:60000});
 await resolverPage.getByText('No puedo eliminar una rendición de prueba',{exact:true}).waitFor({timeout:60000});
 await resolverPage.screenshot({path:'output/support-tests/gestion-desktop.png',fullPage:true});
 assert.ok(resolverPage.url().includes('/incidencias/gestion'));checks++;
 // Compact layout and the two principal administrator actions, on a synthetic ticket only.
 const adminContext=await browser.newContext({viewport:{width:1440,height:900}});
 await adminContext.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key:storageKey,session:tokens.admin});
 const adminPage=await adminContext.newPage();adminPage.on('pageerror',e=>errors.push(e.message));
 const closeCase=await request('a','tickets',{method:'POST',body:payload({sector_id:sector,title:'Ensayo de revisión y cierre directo',description:'Caso ficticio para verificar las acciones compactas.',type:'error'})});assert.equal(closeCase.status,201);checks++;
 await adminPage.goto(`${base}/incidencias/${closeCase.data.id}`);
 await adminPage.getByRole('button',{name:'Enviar a revisión',exact:true}).waitFor({timeout:60000});
 await adminPage.getByRole('button',{name:'Enviar a revisión',exact:true}).click();
 const reviewDialog=adminPage.getByRole('dialog');await reviewDialog.getByLabel('Qué se resolvió').fill('Se corrigió la falla del caso de ensayo.');await reviewDialog.getByLabel('Qué debe probar').fill('Probá el caso de ensayo y confirmá el resultado.');await reviewDialog.getByRole('button',{name:'Enviar a revisión',exact:true}).click();
 await adminPage.getByText('En revisión',{exact:true}).waitFor({timeout:60000});assert.equal((await detail('a',closeCase.data.id)).status,'waiting_validation');checks++;
 await adminPage.getByRole('button',{name:'Cerrar ahora',exact:true}).click();
 const closeDialog=adminPage.getByRole('dialog',{name:'Cerrar ahora',exact:true});await closeDialog.getByLabel('Motivo del cierre').fill('Cierre administrativo del ensayo, sin esperar al solicitante.');await closeDialog.getByRole('button',{name:'Cerrar ahora',exact:true}).click();
 await adminPage.getByText('Cerrado',{exact:true}).first().waitFor({timeout:60000});assert.equal((await detail('a',closeCase.data.id)).closure_kind,'administrative');assert.equal((await request('a',`tickets/${closeCase.data.id}`)).data.pending,null);checks++;
 await adminPage.goto(`${base}/incidencias`);await adminPage.getByRole('table').waitFor({timeout:60000});await adminPage.getByText('Ensayo de revisión y cierre directo',{exact:true}).waitFor({timeout:60000});
 const rows=adminPage.locator('tbody > tr');assert.ok(await rows.count()>=2);assert.ok(await rows.first().evaluate(row=>row.getBoundingClientRect().height<=64));checks++;
 await adminPage.screenshot({path:'output/support-tests/compact-table-desktop.png',fullPage:true});
 for(const width of [1280,768,390]){await adminPage.setViewportSize({width,height:900});await adminPage.waitForTimeout(150);assert.ok(await adminPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));checks++;}
 await adminPage.screenshot({path:'output/support-tests/compact-table-mobile.png',fullPage:true});
 await mutation('a',id,'reopen',{body:'Otra rendición presenta el mismo inconveniente.'},t.version);t=await detail('admin',id);
 await mutation('admin',id,'transfer',{body:'Transferencia de ensayo para verificar privacidad.',sector_id:otherSector},t.version);
 assert.equal((await request('resolver',`tickets/${id}`)).status,404);checks++;
 assert.equal((await request('resolver',`attachments/${internalFile}`)).status,404);checks++;
 assert.equal(errors.length,0,errors.join('\n'));checks++;
 console.log(JSON.stringify({result:'passed',checks,api:true,browser:true,clipboardPaste:true,privateStorage:true,mobile:true,screenshots:path.resolve('output/support-tests')}));
})().catch(e=>{console.error('Live support test failed:',e.code||'',e.message);process.exitCode=1;}).finally(async()=>{
 if(browser)await browser.close();
 try{await cleanup();console.log(JSON.stringify({testData:'removed'}));}catch(e){console.error('Test cleanup failed:',e.code||e.message);process.exitCode=1;}
 await db.end();
});

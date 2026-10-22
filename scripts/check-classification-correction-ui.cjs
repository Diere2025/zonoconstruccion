// Synthetic API fixtures; no requests reach the shared database.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
process.loadEnvFile('.env.local');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,host=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname;
const user={id:id(1),email:'fixture@example.invalid',role:'authenticated',aud:'authenticated',user_metadata:{},app_metadata:{}};
const session={access_token:'synthetic',refresh_token:'synthetic',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user};
const concepts=['Binance','Tarjetas'].map((concept,i)=>({id:id(i+3),concept,category:i?'Extracciones':'Publicidad',sub_category:'',efe_category:'',movement_type:'Egreso',is_active:true,source_row:null}));
const original={id:id(2),code:'PAG-0000013229',occurred_at:'2026-10-21T15:00:00Z',account_id:id(5),account:'MP5',type:'egreso',amount:'1000000',currency:'ARS',version:0,description:'Pago original VISA',counterparty:'Comercio original',operation_reference:'123456',suggested_concept_ids:[id(3)]};
let pending=true,movement={...original,concept_id:id(3),concept:'Binance',category:'Publicidad',notes:'Pago original',classification:null,token:'a'.repeat(32),editable:true,bank:[{description:'Pago original VISA',reference:'123456',occurred_at:original.occurred_at,captures:[{description:'Compra VISA',counterparty:'Comercio original',reference:'123456',payment_id:'654321'}]}],history:[]};
const writes=[];
const rules=[{id:id(8),description:'pablo javier mercado',display_name:'Pablo Javier Mercado · habitual',direction:'egreso',financial_concept_id:id(3),financial_account_id:null,version:4,association_group:'binance_p2p',alternative_concept_ids:[],merchant_alias:'Pablo'}];
movement.rules=rules;
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const context=await browser.newContext({locale:'en-US',timezoneId:'America/Argentina/Buenos_Aires',viewport:{width:1400,height:1000}});
 await context.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key:`sb-${host.split('.')[0]}-auth-token`,session});
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());let value=[];
  if(['127.0.0.1','localhost'].includes(url.hostname)&&!url.pathname.startsWith('/api/'))return route.continue();
  if(url.hostname===host){if(url.pathname.includes('/auth/v1/user'))value=user;else if(url.pathname.includes('/rest/v1/sellers'))value={id:user.id,full_name:'Prueba',role:'admin',roles:['admin'],seller_type:'ambos',can_sell_wholesale:true};}
  if(url.pathname==='/api/admin/financial-classification'){
   if(request.method()==='GET')value=url.searchParams.has('transaction')?{movement,concepts}:{rows:pending?[original]:[],concepts};
   else{const body=request.postDataJSON();writes.push(body);if(body.action){assert.equal(body.token,movement.token);const before={label:movement.concept,category:movement.category};const concept=concepts.find(c=>c.id===body.concept);movement={...movement,token:(body.action==='unclassify'?'b':'c').repeat(32),concept_id:concept?.id||null,concept:concept?.concept||'Sin clasificar',category:concept?.category||'Sin clasificar',history:[{id:writes.length,before,after:{label:concept?.concept||'Sin clasificar'},at:'2026-10-22T15:00:00Z'},...movement.history]};pending=!concept;}else pending=false;value={saved:true};}
  }
  if(url.pathname==='/api/admin/bank-statements'){
   if(request.method()==='GET')value={accounts:[],batches:[],rules,concepts};
   else{const body=request.postDataJSON();writes.push(body);assert.equal(body.description,'pablo javier mercado');assert.equal(body.version,4);assert.equal(body.group,'common');assert.equal(body.conceptId,id(4));Object.assign(rules[0],{association_group:body.group,financial_concept_id:body.conceptId,version:5});value={id:id(8)};}
  }
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(value)});
 });
 const page=await context.newPage();await page.goto((process.env.CLASSIFICATION_UI_URL||'http://127.0.0.1:3157')+'/admin/finanzas/clasificar');
 await page.getByRole('button',{name:'Binance',exact:true}).click();await page.getByRole('button',{name:'Revisar / deshacer clasificación'}).click();
 const dialog=page.getByRole('dialog');await dialog.getByText('Pago original VISA',{exact:true}).waitFor();assert.ok(await dialog.getByText(/21\/10\/2026, 12:00/).count());await dialog.getByText(/Pago: 654321/).waitFor();
 await dialog.getByRole('button',{name:'Volver a sin clasificar'}).click();await dialog.getByRole('status').filter({hasText:'volvió a Sin clasificar'}).waitFor();assert.equal(writes.at(-1).action,'unclassify');
 await dialog.getByRole('combobox',{name:'Nueva clasificación · Búsqueda rápida'}).fill('Tarjetas');await page.getByRole('option',{name:/Tarjetas/}).click();await dialog.getByRole('button',{name:'Guardar Nueva clasificación'}).click();await dialog.getByRole('status').filter({hasText:'Clasificación corregida'}).waitFor();assert.equal(writes.at(-1).action,'reclassify');assert.equal(writes.at(-1).concept,id(4));await dialog.getByText('Pago original VISA',{exact:true}).waitFor();await dialog.getByText('Antes: Sin clasificar',{exact:true}).waitFor();
 await dialog.getByRole('button',{name:/Modificar asociación de Pablo/}).click();await dialog.getByLabel('Uso de la asociación').selectOption('common');
 await dialog.getByRole('combobox',{name:'Concepto de la asociación',exact:true}).fill('Tarjetas');await page.getByRole('option',{name:/Tarjetas/}).click();await dialog.getByRole('button',{name:'Guardar cambios',exact:true}).click();await dialog.getByText('Asociación guardada para todas las cuentas.',{exact:true}).waitFor();assert.equal(writes.at(-1).description,'pablo javier mercado');
 fs.mkdirSync('output/classification-correction',{recursive:true});await page.screenshot({path:'output/classification-correction/desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'output/classification-correction/mobile.png',fullPage:true});assert.ok(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth));await dialog.getByRole('button',{name:'Cerrar'}).click();
 console.log('PASS: undo, original bank/payment data, English-browser dates, reset, reclassification, history, Binance association discovery/editing with original key/version and mobile layout; API requests mocked.');
 }finally{await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1});

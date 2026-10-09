// Browser checks with synthetic authentication and API responses. No real ERP records are written.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base=process.env.SHORTCUTS_TEST_URL || 'http://127.0.0.1:3000';
const assert=require('node:assert/strict');const fs=require('fs');const ts=require('typescript');
process.loadEnvFile('.env.local');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL || 'msedge'});try{
 const context=await browser.newContext();const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const host=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname;
 const user={id:'12345678-1234-4234-8234-123456789abc',email:'shortcut-test@example.invalid',role:'authenticated',aud:'authenticated',user_metadata:{},app_metadata:{}};
 const session={access_token:'synthetic-shortcut-test',refresh_token:'synthetic',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user};
 let saves=0, profileRole='admin';
 await context.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key:`sb-${host.split('.')[0]}-auth-token`,session});
 await context.route(`https://${host}/**`,async route=>{
 const req=route.request(),url=new URL(req.url());let body=[];
 if(url.pathname.includes('/auth/v1/user')){if(req.method()==='PUT'){Object.assign(user.user_metadata,req.postDataJSON().data);saves++;}body=user;}
 else if(url.pathname.includes('/rest/v1/sellers'))body={id:user.id,full_name:'Atajos prueba',email:user.email,role:profileRole,roles:[profileRole],seller_type:'ambos',can_sell_wholesale:true};
 await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
 });
 await context.route('**/api/**',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({active:false,notifications:[],unread:0})}));
 await page.goto(`${base}/admin`);
 await page.getByRole('button',{name:'Configurar mis atajos de teclado'}).click({timeout:90000});
 await page.getByRole('heading',{name:'Mis atajos de teclado'}).waitFor();
 assert.equal(await page.getByRole('textbox',{name:'Atajo para Cargar Movimiento',exact:true}).inputValue(),'Alt+M');
 const move=page.getByRole('textbox',{name:'Atajo para Cargar Movimiento',exact:true});await move.focus();await page.keyboard.press('Alt+m');assert.equal(await move.inputValue(),'Alt+M');
 const order=page.getByRole('textbox',{name:'Atajo para Cargar Pedido',exact:true});await order.focus();await page.keyboard.press('Alt+m');
 await page.getByRole('button',{name:'Guardar atajos',exact:true}).click();await page.getByRole('status').filter({hasText:'está repetido'}).waitFor();assert.equal(saves,0);
 await order.focus();await page.keyboard.press('Alt+p');await page.getByRole('button',{name:'Guardar atajos',exact:true}).click();await page.getByRole('status').filter({hasText:'Atajos guardados'}).waitFor();assert.equal(saves,1);
 await page.reload();await page.getByRole('button',{name:'Configurar mis atajos de teclado'}).click();assert.equal(await page.getByRole('textbox',{name:'Atajo para Cargar Movimiento',exact:true}).inputValue(),'Alt+M');
 await page.getByRole('button',{name:'Cerrar',exact:true}).click();
 await page.keyboard.press('Alt+c');await page.waitForURL('**/admin/cobros-mp',{waitUntil:'domcontentloaded'});
 profileRole='fletero';await page.goto(`${base}/admin`);await page.getByRole('button',{name:'Configurar mis atajos de teclado'}).click();
 assert.equal(await page.getByRole('textbox',{name:'Atajo para Cargar Movimiento',exact:true}).count(),0);
 assert.equal(await page.getByRole('textbox',{name:'Atajo para Estado de Resultados (EERR)',exact:true}).count(),0);
 assert.equal(await page.getByRole('textbox',{name:'Atajo para Meta Ads',exact:true}).count(),0);
 assert.equal(await page.getByRole('textbox',{name:'Atajo para Chequeo de Pagos',exact:true}).count(),1);
 assert.deepEqual(errors,[]);
 // Verify real DOM validity and overlay isolation without touching ERP data.
 const source=ts.transpileModule(fs.readFileSync('src/lib/keyboardShortcuts.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
 const result=await page.evaluate(source=>{
 const exports={};new Function('exports',source)(exports);
 document.body.innerHTML='<main><form data-shortcut-submit><input required name="amount"><button>Guardar</button></form></main>';
 const form=document.querySelector('form');let submits=0;form.addEventListener('submit',e=>{e.preventDefault();submits++;});
 exports.activateSubmitShortcut(exports.submitShortcutTarget(document));const invalid=submits;
 form.querySelector('input').value='100';exports.activateSubmitShortcut(exports.submitShortcutTarget(document));const valid=submits;
 const overlay=document.createElement('div');overlay.className='fixed inset-0';overlay.style.cssText='position:fixed;inset:0;z-index:100';document.body.append(overlay);const blocked=exports.submitShortcutTarget(document)===null;
 overlay.innerHTML='<form data-shortcut-submit><button disabled>Guardar</button></form>';const busy=exports.activateSubmitShortcut(exports.submitShortcutTarget(document));
 const native=document.createElement('dialog');native.innerHTML='<form data-shortcut-submit><button>Guardar modal</button></form>';document.body.append(native);native.showModal();const topLayer=exports.submitShortcutTarget(document)===native.querySelector('form');native.close();
 return {invalid,valid,blocked,busy,topLayer};
 },source);
 assert.deepEqual(result,{invalid:0,valid:1,blocked:true,busy:false,topLayer:true});console.log('PASS: configuración, duplicados, persistencia y aceptación con validación y aislamiento de modales.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

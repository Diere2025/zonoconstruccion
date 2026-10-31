// Isolated UI exercise: all financial endpoints are mocked.
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict'),esbuild=require('esbuild');
const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
(async()=>{
 const bundle=await esbuild.build({stdin:{contents:`import React from'react';import{createRoot}from'react-dom/client';import View from'./src/components/finanzas/SupplierPaymentApplications';createRoot(document.getElementById('root')).render(<View supplierId="supplier" onChanged={async()=>{window.changed=(window.changed||0)+1}}/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',define:{'process.env':'{}'},jsx:'automatic',plugins:[{name:'mock-session',setup(build){build.onResolve({filter:/^@\/lib\/supabase$/},()=>({path:'mock',namespace:'fixture'}));build.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`export const supabase={auth:{getSession:async()=>({data:{session:{access_token:'isolated-test'}}})}};`,loader:'js'}));}}]});
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/bundle.js'?'text/javascript':'text/html');res.end(req.url==='/bundle.js'?bundle.outputFiles[0].text:'<html><div id="root"></div><script src="/bundle.js"></script></html>');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
  browser=await chromium.launch({headless:true,channel:'msedge'});const page=await browser.newPage({locale:'en-US',timezoneId:'America/Los_Angeles',viewport:{width:600,height:900}}),posts=[],errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
  const payment={id:'payment',amount:'30',currency:'ARS',created_at:'2026-10-31T01:00:00Z',cash_transaction_id:null,signature:'a'.repeat(32),allocations:[],applied:0,included:true};
  const document={id:'document',invoice_number:'REM-1',total_amount:'100',paid_amount:'70',credit_applied_amount:'0',currency:'ARS',status:'Pendiente',document_type:'Remito',purchase_date:'2026-10-01',included:true};
  await page.route('**/api/admin/supplier-applications**',async route=>{
   if(route.request().method()==='POST'){const payload=route.request().postDataJSON();posts.push(payload);payment.allocations=payload.allocations;payment.applied=payload.allocations.reduce((n,a)=>n+Number(a.amount),0);document.credit_applied_amount=String(payment.applied);payment.signature='b'.repeat(32);await route.fulfill({json:{result:{available:30-payment.applied}}});}
   else await route.fulfill({json:{configured:true,payments:[],credits:[{...payment,kind:'credit',invoice_number:'NC-1'}],purchases:[document]}});
  });
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.getByRole('button',{name:'Aplicar crédito',exact:true}).click();
  assert.match(await page.getByRole('heading',{name:/Aplicar nota de crédito/}).innerText(),/30\/10\/2026/);
  await page.getByRole('checkbox').check();await page.getByLabel('Importe a aplicar REM-1',{exact:true}).fill('20');
  await page.getByLabel('Motivo de la aplicación',{exact:true}).fill('Aplicar anticipo al remito');
  await page.getByRole('button',{name:'Guardar aplicaciones',exact:true}).click();
  await page.getByRole('heading',{name:/Aplicar nota de crédito/}).waitFor({state:'hidden'});
  assert.equal(posts.length,1);assert.equal(posts[0].creditId,'payment');assert.equal(posts[0].paymentId,undefined);assert.equal(posts[0].allocations[0].amount,'20');assert.equal(posts[0].signature,'a'.repeat(32));
  await page.getByRole('button',{name:'Aplicar crédito',exact:true}).click();await page.getByRole('button',{name:'Liberar todas las aplicaciones',exact:true}).click();
  await page.getByLabel('Motivo de la aplicación',{exact:true}).fill('Dejar el pago a cuenta');await page.getByRole('button',{name:'Guardar aplicaciones',exact:true}).click();
  await page.getByRole('heading',{name:/Aplicar nota de crédito/}).waitFor({state:'hidden'});assert.equal(posts.length,2);assert.deepEqual(posts[1].allocations,[]);assert.deepEqual(errors,[]);
  console.log('Credit UI: partial application, release, separate credit payload and Buenos Aires dates: OK');
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});

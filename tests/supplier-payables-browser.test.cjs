// Real form with an isolated API fixture; no ERP data or writes.
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict'),esbuild=require('esbuild');
const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
(async()=>{
 const bundle=await esbuild.build({stdin:{contents:`import React from'react';import{createRoot}from'react-dom/client';import View from'./src/components/finanzas/SupplierPayables';createRoot(document.getElementById('root')).render(<View supplierId="${id(1)}" configured={true}/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',define:{'process.env':'{}'},jsx:'automatic',plugins:[{name:'mock-session',setup(build){build.onResolve({filter:/^@\/lib\/supabase$/},()=>({path:'mock',namespace:'fixture'}));build.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`export const supabase={auth:{getSession:async()=>({data:{session:{access_token:'isolated-test'}}})}};`,loader:'js'}));}}]});
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/bundle.js'?'text/javascript':'text/html');res.end(req.url==='/bundle.js'?bundle.outputFiles[0].text:'<html lang="es"><div id="root"></div><script src="/bundle.js"></script></html>');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
  browser=await chromium.launch({headless:true,channel:'msedge'});const page=await browser.newPage({locale:'en-US',timezoneId:'America/Los_Angeles',viewport:{width:650,height:1000}}),posts=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
  const base={purchase_id:id(3),reference:'F-1',document_type:'Factura',document_condition:'facturado',entry_date:'2026-10-02',currency:'ARS',amount:'60',document_total:'100',cash_applied:'0',credit_applied:'0',included:true,needs_allocation:false,installment_number:1};
  const billItem={...base,item_key:'bill',bill_id:id(2),due_date:'2026-10-15',pending_amount:'60'};
  const items=[billItem,{...base,item_key:'unbilled',bill_id:null,reference:'R-1',document_type:'Remito',document_condition:'por_remito',amount:'40',pending_amount:'40',due_date:null}];
  const zero={pending:0,overdue:0,dueToday:0,noDueDate:0,unassigned:0};
  let installments=[],signature='a'.repeat(32);
  await page.route('**/api/admin/supplier-payables**',async route=>{
   const request=route.request(),url=new URL(request.url());let value;
   if(request.method()==='POST'){const payload=request.postDataJSON();posts.push(payload);installments=payload.installments.map((i,n)=>({number:n+1,due_date:i.dueDate,amount:i.amount}));signature='b'.repeat(32);value={result:{}};}
   else if(url.searchParams.has('billId'))value={bill:{id:id(2),number:'F-1',document_type:'Factura',bill_date:'2026-10-02',due_date:'2026-10-15',currency:'ARS',declared_total:'60',status:'Conciliado'},signature,installments,events:[]};
   else value={items,totals:{ARS:{pending:100,overdue:60,dueToday:0,noDueDate:40,unassigned:0},USD:zero},inconsistencies:[]};
   await route.fulfill({json:value});
  });
  await page.goto('http://127.0.0.1:'+server.address().port);await page.getByRole('button',{name:'Programar vencimientos',exact:true}).click();
  assert.equal(await page.getByLabel('Fecha cuota 1',{exact:true}).inputValue(),'15/10/2026');
  await page.getByLabel('Importe cuota 1',{exact:true}).fill('30');await page.getByRole('button',{name:'Agregar cuota',exact:true}).click();
  await page.getByLabel('Fecha cuota 2',{exact:true}).fill('15/11/2026');await page.getByLabel('Importe cuota 2',{exact:true}).fill('30');await page.getByLabel('Motivo del cambio de vencimientos',{exact:true}).fill('Acuerdo con el proveedor');
  await page.getByRole('button',{name:'Guardar vencimientos',exact:true}).click();await page.getByRole('heading',{name:'Vencimientos de Factura F-1',exact:true}).waitFor({state:'hidden'});
  assert.equal(posts.length,1);assert.equal(posts[0].installments[1].dueDate,'2026-11-15');assert.equal(posts[0].installments.reduce((n,i)=>n+Number(i.amount),0),60);assert.equal(posts[0].signature,'a'.repeat(32));
  await page.getByRole('button',{name:'Programar vencimientos',exact:true}).click();await page.getByRole('button',{name:'Usar vencimiento original',exact:true}).click();await page.getByLabel('Motivo del cambio de vencimientos',{exact:true}).fill('Restaurar acuerdo original');await page.getByRole('button',{name:'Guardar vencimientos',exact:true}).click();
  await page.getByRole('heading',{name:'Vencimientos de Factura F-1',exact:true}).waitFor({state:'hidden'});assert.equal(posts.length,2);assert.deepEqual(posts[1].installments,[]);assert.deepEqual(errors,[]);
  console.log('Payables browser: en-US/Los Angeles dates, exact installments, ISO request, reason and restoring original due date: OK');
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});

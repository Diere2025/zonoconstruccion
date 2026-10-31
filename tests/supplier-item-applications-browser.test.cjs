// Actual component, isolated API only. Exercises both source types without ERP access.
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict'),esbuild=require('esbuild');
const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
(async()=>{for(const credit of [false,true]){
 const bundle=await esbuild.build({stdin:{contents:`import React,{useState}from'react';import{createRoot}from'react-dom/client';import View from'./src/components/finanzas/SupplierItemApplications';function Harness(){const[n,setN]=useState(0);return <View key={n} sourceId="${id(1)}" credit={${credit}} onClose={()=>{}} onSaved={async()=>setN(v=>v+1)}/>;}createRoot(document.getElementById('root')).render(<Harness/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',jsx:'automatic',plugins:[{name:'mock-session',setup(build){build.onResolve({filter:/^@\/lib\/supabase$/},()=>({path:'mock',namespace:'fixture'}));build.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`export const supabase={auth:{getSession:async()=>({data:{session:{access_token:'isolated-test'}}})}};`,loader:'js'}));}}]});
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/bundle.js'?'text/javascript':'text/html');res.end(req.url==='/bundle.js'?bundle.outputFiles[0].text:'<html lang="es"><div id="root"></div><script src="/bundle.js"></script></html>');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
  browser=await chromium.launch({headless:true,channel:'msedge'});const page=await browser.newPage({locale:'en-US',timezoneId:'America/Los_Angeles',viewport:{width:650,height:1000}}),posts=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
  const data={source:{id:id(1),kind:credit?'credit':'payment',reference:'ORIGEN-1',amount:100,currency:'ARS',included:true},signature:'a'.repeat(32),budgets:[{purchase_id:id(2),reference:'R-1',amount:70}],items:[1,2].map(n=>({item_key:'bill:'+id(3)+':'+id(2)+':'+n,purchase_id:id(2),reference:'F-1',document_type:'Factura',installment_number:n,due_date:n===1?'2026-10-30':'2026-11-30',included:true,available_for_source:50})),details:[],events:[]};
  await page.route('**/api/admin/supplier-item-applications**',async route=>{if(route.request().method()==='POST'){const body=route.request().postDataJSON();posts.push(body);data.details=body.items.map(i=>({item_key:i.itemKey,amount:Number(i.amount),valid:true}));data.signature=(posts.length===1?'b':'c').repeat(32);await route.fulfill({json:{result:{}}});}else await route.fulfill({json:data});});
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.getByRole('checkbox').nth(0).check();await page.getByLabel('Motivo de la distribución',{exact:true}).fill('Asignación verificada por cuota');
  await page.getByRole('button',{name:'Guardar distribución',exact:true}).click();assert.match(await page.getByRole('alert').innerText(),/exactamente/);assert.equal(posts.length,0);
  await page.getByRole('checkbox').nth(1).check();assert.equal(await page.getByLabel('Importe F-1 cuota 2',{exact:true}).inputValue(),'20.00');
  assert.match(await page.locator('body').innerText(),/30\/11\/2026/);
  await page.getByRole('button',{name:'Guardar distribución',exact:true}).click();await page.getByRole('button',{name:'Quitar distribución por cuotas',exact:true}).waitFor();
  assert.equal(posts.length,1);assert.equal(posts[0].items.reduce((n,i)=>n+Number(i.amount),0),70);assert.equal(posts[0][credit?'creditId':'paymentId'],id(1));assert.equal(posts[0][credit?'paymentId':'creditId'],null);
  await page.getByRole('button',{name:'Quitar distribución por cuotas',exact:true}).click();await page.getByLabel('Motivo de la distribución',{exact:true}).fill('Quitar detalle conservando aplicación al remito');await page.getByRole('button',{name:'Guardar distribución',exact:true}).click();
  await page.getByRole('checkbox').nth(0).waitFor();await page.waitForFunction(()=>document.querySelectorAll('input[type=checkbox]:checked').length===0);
  assert.equal(posts.length,2);assert.deepEqual(posts[1].items,[]);assert.equal(data.budgets[0].amount,70);assert.deepEqual(errors,[]);
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
}console.log('Item UI: payment and credit budgets, explicit per-quota distribution, validation, clearing detail only, and en-US dates: OK');})().catch(e=>{console.error(e);process.exitCode=1;});

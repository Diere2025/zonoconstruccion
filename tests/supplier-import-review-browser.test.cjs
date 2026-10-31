// Actual review component, mocked API only: never connects to the ERP.
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict'),esbuild=require('esbuild');
const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const supplier='00000000-0000-0000-0000-000000000001',batch='00000000-0000-0000-0000-000000000002';
const row={id:'00000000-0000-0000-0000-000000000003',version:1,source_row:2,component:'purchase',original_values:['Octubre','30/10/2026','Proveedor.Cuenta2','Mercadería recibida'],supplier_id:supplier,currency:null,effective_date:'2026-10-30',amount:'100.00',status:'pending_evidence',decision_reason:null,supplier_source_links:[]};
(async()=>{
 const bundle=await esbuild.build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import View from './src/components/finanzas/SupplierImportReview';createRoot(document.getElementById('root')).render(<View suppliers={[{id:'${supplier}',name:'Proveedor prueba'}]}/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',jsx:'automatic',plugins:[{name:'mock-session',setup(build){build.onResolve({filter:/^@\/lib\/supabase$/},()=>({path:'mock',namespace:'fixture'}));build.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`export const supabase={auth:{getSession:async()=>({data:{session:{access_token:'isolated-test'}}})}};`,loader:'js'}));}}]});
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/bundle.js'?'text/javascript':'text/html');res.end(req.url==='/bundle.js'?bundle.outputFiles[0].text:'<html lang="es"><div id="root"></div><script src="/bundle.js"></script></html>');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
  browser=await chromium.launch({headless:true,channel:'msedge'});const page=await browser.newPage({locale:'en-US',timezoneId:'America/Los_Angeles'}),posts=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/admin/**',async route=>{
   const req=route.request(),url=new URL(req.url());let body;
   if(req.method()==='POST'){const p=req.postDataJSON();posts.push(p);Object.assign(row,{version:2,status:p.status,decision_reason:p.reason,currency:p.currency});body={row};}
   else if(url.pathname.endsWith('supplier-aliases'))body={aliases:[]};
   else if(url.pathname.endsWith('supplier-accounts'))body={rows:[]};
   else if(url.searchParams.has('rowId'))body={events:[]};
   else if(url.searchParams.has('batchId'))body={rows:[row],count:1};
   else body={batches:[{id:batch,cutoff_date:'2026-10-30',created_at:'2026-10-30T15:00:00Z',status:'preview'}]};
   await route.fulfill({json:body});
  });
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.getByLabel('Captura',{exact:true}).selectOption(batch);
  await page.getByRole('button',{name:'Revisar',exact:true}).click();
  assert.equal(await page.getByLabel('Fecha',{exact:true}).inputValue(),'30/10/2026');
  await page.getByLabel('Moneda',{exact:true}).selectOption('ARS');
  await page.getByLabel('Decisión',{exact:true}).selectOption('excluded');
  await page.getByLabel('Motivo y evidencia',{exact:true}).fill('Duplicado según documento original');
  await page.getByRole('button',{name:'Guardar revisión',exact:true}).click();
  await page.getByRole('heading',{name:'Revisar fila 2',exact:true}).waitFor({state:'hidden'});
  assert.equal(posts.length,1);assert.equal(posts[0].effectiveDate,'2026-10-30');assert.equal(posts[0].version,1);assert.equal(posts[0].status,'excluded');assert.equal(posts[0].reason,'Duplicado según documento original');assert.deepEqual(errors,[]);
  console.log('Supplier review browser: real form, en-US/Los Angeles dates, explicit decision and ISO payload: OK');
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});

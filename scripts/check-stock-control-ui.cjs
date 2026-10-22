// Every external request and stock mutation is mocked; no shared stock is synchronized.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),fs=require('node:fs'),assert=require('node:assert/strict');process.loadEnvFile('.env.local');
const host=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname,user={id:'00000000-0000-4000-8000-000000000001',email:'fixture@example.invalid',role:'authenticated',aud:'authenticated',user_metadata:{},app_metadata:{}};
const session={access_token:'synthetic',refresh_token:'synthetic',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user};
const product=(id,sku,physical,reserved)=>({id,name:'Nombre anterior '+id,sku,dbPhysical:physical,dbReserved:reserved,dbCalculatedReserved:reserved,dbAvailable:physical-reserved});
const ladder=product('p1','Escalera 16',6,12),tank=product('p2','Tanque 500',5,10),float=product('p3','Flotante Eco',108,39),other=product('p4','Sin proveedor',2,0);
const matched=p=>({...p,productId:p.id,sheetPhysical:p.dbPhysical,sheetReserved:p.dbReserved,sheetAvailable:p.dbAvailable});
const supply=(id,name,quantity,code)=>({suppliers:id?[{id,name}]:[],pendingIncoming:quantity,pendingOrders:quantity?[{id:'oc-'+id,code,supplierId:id,supplierName:name,quantity}]:[]});
let context={p1:supply('garden','Garden',30,'OP000373'),p2:supply('aquafort','Aquafort',2,'OP000400'),p3:supply('equilibrio','Equilibrio',0),p4:supply(null,null,0)},syncs=0,failSync=false;
(async()=>{const browser=await chromium.launch({headless:true,channel:'chrome'});try{
 const ctx=await browser.newContext({locale:'en-US',timezoneId:'America/Argentina/Buenos_Aires',viewport:{width:1500,height:1100}});
 await ctx.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key:`sb-${host.split('.')[0]}-auth-token`,session});
 await ctx.route('**/*',async route=>{const request=route.request(),url=new URL(request.url());if(['127.0.0.1','localhost'].includes(url.hostname)&&!url.pathname.startsWith('/api/'))return route.continue();let value=[];
  if(url.hostname===host){if(url.pathname.includes('/auth/v1/user'))value=user;else if(url.pathname.includes('/rest/v1/sellers'))value={id:user.id,full_name:'Prueba',role:'admin',roles:['admin'],seller_type:'ambos',can_sell_wholesale:true};}
  if(url.pathname==='/api/admin/sync-stock'){
   if(request.method()==='POST'){syncs++;if(failSync){failSync=false;return route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:'Sincronización simulada fallida'})});}value={updatedCount:4};}
   else value={comparisonList:[matched(ladder),matched(float)],onlyInDb:[tank,other],unmatchedSheetProducts:[{name:'Sin coincidencia',sheetPhysical:3,sheetReserved:0}],purchaseContext:context,purchaseWarning:context?null:'No se pudieron cargar los proveedores y las OCs pendientes. Actualizá para reintentar.'};
  }
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(value)});
 });
 const page=await ctx.newPage();await page.goto((process.env.STOCK_UI_URL||'http://127.0.0.1:3159')+'/admin/stock');await page.getByRole('cell',{name:'Escalera 16',exact:true}).waitFor();
 const rows=()=>page.locator('table tbody tr'),skus=()=>rows().locator('td:first-child').allTextContents();
 assert.deepEqual((await skus()).map(s=>s.trim()),['Tanque 500','Flotante Eco','Escalera 16','Sin proveedor']);assert.equal(await page.getByText(/Nombre anterior/).count(),0);
 await page.getByRole('combobox',{name:'Proveedor',exact:true}).selectOption('garden');assert.equal(await rows().count(),1);const row=rows().first();assert.match(await row.innerText(),/30 por recibir/);assert.match(await row.innerText(),/24/);await row.locator('summary').click();await row.getByRole('link',{name:'OP000373',exact:true}).waitFor();
 await page.getByRole('button',{name:'Limpiar filtros'}).click();await page.getByRole('combobox',{name:'Situación de stock'}).selectOption('incoming');assert.equal(await rows().count(),2);
 await page.getByRole('combobox',{name:'Situación de stock'}).selectOption('uncovered');assert.deepEqual((await skus()).map(s=>s.trim()),['Tanque 500']);
 await page.getByRole('combobox',{name:'Situación de stock'}).selectOption('shortage');assert.equal(await rows().count(),2);await page.getByRole('button',{name:'Limpiar filtros'}).click();
 await page.getByRole('columnheader',{name:/Proveedor/}).getByRole('button').click();assert.equal((await skus())[0].trim(),'Escalera 16');
 await page.getByRole('columnheader',{name:/Pendiente de recibir/}).getByRole('button').click();await page.getByRole('columnheader',{name:/Pendiente de recibir/}).getByRole('button').click();assert.equal((await skus())[0].trim(),'Escalera 16');
 fs.mkdirSync('output/stock-control-release',{recursive:true});await page.screenshot({path:'output/stock-control-release/desktop.png',fullPage:true});await page.setViewportSize({width:390,height:844});await page.locator('#erp-sidebar[aria-hidden="true"]').waitFor({state:'attached'});await page.getByRole('combobox',{name:'Proveedor',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:'output/stock-control-release/mobile.png',fullPage:true,animations:'disabled'});
 await page.setViewportSize({width:1500,height:1100});page.on('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Sincronizar Todo',exact:true}).click();await page.getByText(/Sincronización finalizada con éxito/).waitFor();await page.getByRole('button',{name:'Sincronizar Todo',exact:true}).waitFor({state:'visible'});assert.equal(await page.getByRole('button',{name:'Sincronizar Todo',exact:true}).isEnabled(),true);
 failSync=true;await page.getByRole('button',{name:'Sincronizar Todo',exact:true}).click();await page.getByText('Sincronización simulada fallida',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Sincronizar Todo',exact:true}).isEnabled(),true);assert.equal(syncs,2);
 context=null;await page.getByRole('button',{name:'Actualizar',exact:true}).click();await page.getByRole('alert').filter({hasText:'No se pudieron cargar'}).waitFor();assert.equal(await page.getByRole('combobox',{name:'Proveedor',exact:true}).isEnabled(),false);await page.getByText('No disponible',{exact:true}).first().waitFor();
 console.log('PASS: supplier/default sorting, SKU-only rows, purchase-order balances/details, projected stock, shortage filters, numeric sorting, desktop/mobile, sync recovery and unavailable-data warning; all requests mocked.');
 }finally{await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1});

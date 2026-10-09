const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const source=fs.readFileSync('src/app/admin/compras/page.tsx','utf8');const start=source.indexOf('  const handleSelectOCInModal ='),end=source.indexOf('  const handleOpenReceptionForPO',start);
const ctx={exports:{},receptionPOIds:[],receptionItems:[],receptionSupplierId:'supplier',receptionOrderLoading:{current:false},purchaseOrders:[{id:'A',supplier_id:'supplier'},{id:'B',supplier_id:'supplier'},{id:'FOREIGN',supplier_id:'other'}],alert:()=>{},setModalOCSearchText:()=>{},setIsModalOCDropdownOpen:()=>{},setReceptionOrdersLoading:()=>{},supabase:{from:()=>({select(){return this;},eq:async(_,id)=>({data:[{id:id+'-line',product_id:'P',raw_product_name:'Producto',product:{sku:'SKU-1'},quantity_ordered:5,quantity_received:0,unit_cost:10}]})})}};
ctx.setReceptionPOIds=value=>ctx.receptionPOIds=typeof value==='function'?value(ctx.receptionPOIds):value;
ctx.setReceptionItems=value=>ctx.receptionItems=typeof value==='function'?value(ctx.receptionItems):value;
vm.runInNewContext(ts.transpileModule(source.slice(start,end)+';exports.select=handleSelectOCInModal;',{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,ctx);
(async()=>{
 await ctx.exports.select('A','OC-A');ctx.receptionItems[0].quantityReceivedNew=2;
 await ctx.exports.select('B','OC-B');assert.equal(ctx.receptionItems.length,2);assert.equal(ctx.receptionItems[0].quantityReceivedNew,2,'Adding a second OC preserves entered quantities');assert.equal(ctx.receptionItems[0].sku,ctx.receptionItems[1].sku);assert.notEqual(ctx.receptionItems[0].poItemId,ctx.receptionItems[1].poItemId,'Shared SKU remains separate per OC');
 await ctx.exports.select('FOREIGN','FOREIGN');assert.equal(ctx.receptionItems.length,2);
 await ctx.exports.select('B','OC-B');assert.equal(ctx.receptionItems.length,1);assert.equal(ctx.receptionItems[0].quantityReceivedNew,2);
 ctx.receptionItems.push({productId:'CUSTOM',poItemId:null});await ctx.exports.select('','');assert.equal(ctx.receptionPOIds.length,0);assert.equal(ctx.receptionItems.length,1);assert.equal(ctx.receptionItems[0].productId,'CUSTOM');
 console.log('Reception selection: add/remove OCs, preserved edits, shared SKU separation and supplier boundary: OK');
})().catch(e=>{console.error(e);process.exitCode=1;});

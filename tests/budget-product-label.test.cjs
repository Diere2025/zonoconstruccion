const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const name = 'Gamma - Bomba periferica Agua 1/2Hp (G2783AR)';
const quote = ts.createSourceFile('quote.tsx',fs.readFileSync('src/app/vendedores/presupuestos/page.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const print = ts.createSourceFile('print.tsx',fs.readFileSync('src/components/vendedores/PrintableBudgetModal.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
function find(ast,predicate) {
 let result;
 function visit(node) { if(predicate(node)) result=node; ts.forEachChild(node,visit); }
 visit(ast); assert.ok(result); return result;
}
const summary = find(quote,n=>ts.isVariableDeclaration(n)&&n.name.getText(quote)==='generateWhatsAppText').initializer.getText(quote);
const preview = find(quote,n=>ts.isJsxExpression(n)&&n.expression&&ts.isConditionalExpression(n.expression)&&n.expression.getText(quote).includes('item.sku')&&n.expression.getText(quote).includes('item.name')).expression.getText(quote);
const printed = find(print,n=>ts.isVariableDeclaration(n)&&n.name.getText(print)==='displaySku').initializer.getText(print);
for(const [surface,expression] of [['preview',preview],['PDF and image',printed]]) {
 test(`${surface} displays product names for automatic or missing SKUs and preserves commercial SKUs`,()=>{
  for(const sku of ['AUTO-SBVEKV',null,undefined,'',name,'COMMERCIAL-SKU']) {
   const result=vm.runInNewContext(expression,{item:{name,sku}});
   assert.equal(result,sku==='COMMERCIAL-SKU'?sku:name);
  }
 });
}
test('WhatsApp summary hides the imported code and keeps pump quantity, price and total',()=>{
 for(const sku of ['AUTO-SBVEKV',name]) {
  const context={quoteItems:[{name,sku,quantity:1,price:60000,customPrice:60000}],isDiscountItem:()=>false,
   formatPrice:n=>`$${new Intl.NumberFormat('es-AR').format(n)}`,hasAnyItemDiscount:false,totalItemDiscountAmount:0,
   itemsGrossSubtotal:60000,orderDiscountAmount:0,isFreeShipping:true,shippingCost:0,
   selectedPaymentMethod:{name:'Contado',installments:1,surcharge_percentage:0},surcharge:0,includeIVA:false,
   kitDetailText:'',total:60000,totalSavings:0};
  const result=vm.runInNewContext(`(${summary})()`,context);
  assert.ok(result.includes(`1x *${name}* a $60.000`));
  assert.ok(result.includes('*TOTAL A ABONAR:* $60.000'));
  assert.ok(!result.includes('AUTO-SBVEKV'));
 }
});

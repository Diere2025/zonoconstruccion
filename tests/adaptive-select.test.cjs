const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
function load(file,imports={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:name=>imports[name] || require(name),console});return exports;}
const search=load('src/components/ui/SearchableSelect.tsx').default;
const adaptive=load('src/components/ui/AdaptiveSelect.tsx',{'./SearchableSelect':{__esModule:true,default:search}}).default;
const options=count=>[React.createElement('option',{key:'empty',value:''},'Seleccionar'),...Array.from({length:count},(_,i)=>React.createElement('option',{key:i,value:String(i)},`Proveedor ${i}`))];
test('up to four choices remain native; five choices expose searchable combobox',()=>{
 const small=renderToStaticMarkup(React.createElement(adaptive,{'aria-label':'Proveedor',value:'',onChange:()=>{},children:options(4)}));
 assert.ok(small.includes('<select'));assert.ok(!small.includes('role="combobox"'));
 const large=renderToStaticMarkup(React.createElement(adaptive,{'aria-label':'Proveedor',value:'2',onChange:()=>{},children:options(5)}));
 assert.ok(large.includes('role="combobox"'));assert.ok(large.includes('value="Proveedor 2"'));assert.ok(large.includes('aria-label="Proveedor"'));
});
test('required long choices cannot treat the empty placeholder as a selected record',()=>{
 const tree=adaptive({required:true,value:'',children:options(5)});
 assert.equal(tree.props.options.some(o=>o.value===''),false);
 const html=renderToStaticMarkup(tree);assert.ok(html.includes('required=""'));assert.ok(html.includes('aria-required="true"'));
});
test('disabled searchable fields expose no enabled clear or toggle buttons',()=>{
 const html=renderToStaticMarkup(React.createElement(adaptive,{disabled:true,value:'2',children:options(5)}));
 assert.equal((html.match(/disabled=""/g) || []).length,3);
});
test('selecting an existing result preserves the original value callback contract',()=>{
 let received;
 const tree=adaptive({value:'1',children:options(5),onChange:event=>received=event.target.value});
 tree.props.onChange('3');assert.equal(received,'3');
});
test('clearing a filter with no empty option restores its first valid choice',()=>{
 let received;const tree=adaptive({value:'2',children:options(5).slice(1),onChange:event=>received=event.target.value});
 tree.props.onChange('');assert.equal(received,'0');
});

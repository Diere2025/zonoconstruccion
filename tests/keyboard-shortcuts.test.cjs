const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
function load(path, extras={}) { const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports,require,URLSearchParams,...extras});return exports; }
const shortcuts=load('src/lib/keyboardShortcuts.ts');
const nav=load('src/lib/erpNavigation.ts');
const visible=roles=>nav.visibleErpModules({roles,restrictedSeller:false,canUseWholesale:false});
test('defaults use alternatives to reserved function keys',()=>{
 const actions=shortcuts.shortcutActions(visible(['admin']));const bindings=shortcuts.resolveShortcuts(actions,{});
 for(const [id,key] of Object.entries(shortcuts.defaultShortcuts)) assert.equal(bindings[id],key);
 assert.ok(!Object.values(bindings).includes('F4'));
 assert.equal(actions.find(a=>a.id==='new-movement').href,'/admin/finanzas?shortcut=new-movement');
});
test('unauthorized saved shortcuts cannot acquire destinations after a role change',()=>{
 const actions=shortcuts.shortcutActions(visible(['fletero']));
 const bindings=shortcuts.resolveShortcuts(actions,shortcuts.defaultShortcuts);
 assert.equal(bindings['direccion-3'],undefined);assert.equal(bindings['new-movement'],undefined);
 assert.equal(bindings['tesoreria-1'],'Alt+C');
 for(const roles of [['seller'],['compras'],['administracion'],['instalador']]){
  const a=shortcuts.shortcutActions(visible(roles));const b=shortcuts.resolveShortcuts(a,{'direccion-2':'Alt+M'});
  assert.equal(b['direccion-2'],undefined);
 }
});
test('normalization accepts supported combinations and rejects typing/browser/AltGr commands',()=>{
 for(const [raw,key] of [['alt+m','Alt+M'],['shift+alt+p','Alt+Shift+P'],['CTRL+ENTER','Ctrl+Enter'],['f2','F2'],['F8','F8'],['Shift+F8','Shift+F8']])assert.equal(shortcuts.normalizeShortcut(raw),key);
 for(const raw of ['M','Shift+M','Ctrl+Alt+Q','Meta+P','Ctrl+W','Alt+F4','Ctrl+R','Ctrl+1','Ctrl+Shift+B','Ctrl+Shift+I','Ctrl+Ctrl+P','F13','Enter','Alt+Enter'])assert.equal(shortcuts.normalizeShortcut(raw),null,raw);
 assert.equal(shortcuts.keyboardShortcut({key:'p',altKey:true,ctrlKey:false,shiftKey:false,metaKey:false}),'Alt+P');
});
test('empty disables defaults; malformed metadata is ignored and duplicates resolve once',()=>{
 const actions=shortcuts.shortcutActions(visible(['admin']));
 const b=shortcuts.resolveShortcuts(actions,{'new-movement':'','minorista-2':'Alt+P','minorista-4':'Alt+P','direccion-2':42});
 assert.equal(b['new-movement'],'');assert.equal(b['minorista-2'],'Alt+P');assert.equal(b['minorista-4'],'');assert.equal(b['direccion-2'],'');
 assert.equal(shortcuts.resolveShortcuts(actions,null)['minorista-2'],'F2');
});
test('reserved function keys cannot be captured or restored from saved preferences',()=>{
 const actions=shortcuts.shortcutActions(visible(['admin']));
 for(const key of ['F1','F3','F4','F5','F6','F7','F9','F10','F11','F12']){
  for(const prefix of ['', 'Shift+', 'Ctrl+', 'Alt+'])assert.equal(shortcuts.normalizeShortcut(prefix+key),null,prefix+key);
  assert.equal(shortcuts.keyboardShortcut({key,ctrlKey:false,altKey:false,shiftKey:false,metaKey:false}),null);
  const bindings=shortcuts.resolveShortcuts(actions,{'new-movement':key,'minorista-2':'Alt+2'});
  assert.equal(bindings['new-movement'],'');assert.equal(bindings['minorista-2'],'Alt+2');
 }
});
class Element {
 constructor(options={}){Object.assign(this,{rects:[{}],hidden:false,disabled:false,clicks:0,children:[],z:0,...options});}
 getClientRects(){return this.rects;}
 closest(){return this.hidden?this:null;}
 matches(selector){return selector==='[data-shortcut-submit]'?!!this.marked:this.disabled;}
 getAttribute(name){return name==='aria-disabled'&&this.ariaDisabled?'true':null;}
 click(){this.clicks++;}
 querySelectorAll(){return this.children;}
}
class Form extends Element {requestSubmit(button){this.submitted=button;}}
const dom=load('src/lib/keyboardShortcuts.ts',{HTMLElement:Element,HTMLFormElement:Form,getComputedStyle:e=>({visibility:e.hidden?'hidden':'visible',zIndex:String(e.z)})});
test('accept shortcut submits through the normal form and respects disabled fieldsets and buttons',()=>{
 const button=new Element();const form=new Form({children:[button]});assert.equal(dom.activateSubmitShortcut(form),true);assert.equal(form.submitted,button);
 button.disabled=true;form.submitted=null;assert.equal(dom.activateSubmitShortcut(form),false);assert.equal(form.submitted,null);
 const busy=new Element({ariaDisabled:true});assert.equal(dom.activateSubmitShortcut(busy),false);assert.equal(busy.clicks,0);
});
test('active dialogs block background forms; ambiguous loads need focus',()=>{
 const target=new Form({marked:true});const main=new Element({children:[target]});
 const dialog=new Element({z:50});const doc={activeElement:null,querySelectorAll:()=>[dialog],querySelector:()=>main};
 assert.equal(dom.submitShortcutTarget(doc),null);
 dialog.children=[target];assert.equal(dom.submitShortcutTarget(doc),target);
 dialog.children.push(new Form({marked:true}));assert.equal(dom.submitShortcutTarget(doc),null);
 doc.activeElement={closest:()=>target};assert.equal(dom.submitShortcutTarget(doc),target);
});

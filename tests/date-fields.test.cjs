const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),ts=require('typescript');const m={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/dates/dateFields.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:m,Date});assert.equal(m.displayDateField('2026-10-12'),'12/10/2026');assert.equal(m.parseDateField('12/10/2026'),'2026-10-12');assert.equal(m.parseDateField('31/02/2026'),null);assert.equal(m.parseDateField('29/02/2024'),'2024-02-29');assert.equal(m.parseDateField('29/02/2026'),null);assert.equal(m.displayDateField('2026-10','month'),'10/2026');assert.equal(m.parseDateField('10/2026','month'),'2026-10');assert.equal(m.parseDateField('13/2026','month'),null);assert.equal(m.displayDateField('2026-10-12T19:35','datetime-local'),'12/10/2026 19:35');assert.equal(m.parseDateField('12/10/2026 19:35','datetime-local'),'2026-10-12T19:35');assert.equal(m.parseDateField('12/10/2026 24:00','datetime-local'),null);assert.equal(m.formatDateDigits('121020261935','datetime-local'),'12/10/2026 19:35');assert.equal(m.formatDateDigits('102026','month'),'10/2026');console.log('Date field tests passed: DD/MM/YYYY, MM/YYYY periods, 24h date-time, ISO callback values, leap years, invalid dates and input masks.');

assert.equal(m.displayErpInstant('2026-10-13T01:05:00Z'),'12/10/2026 22:05');
assert.equal(m.displayErpInstant('invalid'),'');

// Visible native date controls depend on the OS/browser locale. Allow only
// hidden native pickers paired with a formatted text field.
const path=require('node:path'), nativeDateFields=[];
function auditDateControls(dir){
 for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
  const file=path.join(dir,entry.name);
  if(entry.isDirectory()){auditDateControls(file);continue;}
  if(!file.endsWith('.tsx'))continue;
  const source=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  function visit(node){
   if((ts.isJsxSelfClosingElement(node)||ts.isJsxOpeningElement(node))&&node.tagName.getText(source)==='input'){
    const attr=node.attributes.properties.find(a=>ts.isJsxAttribute(a)&&a.name.getText(source)==='type');
    const kind=attr?.initializer&&ts.isStringLiteral(attr.initializer)?attr.initializer.text:'';
    if(['date','month','datetime-local'].includes(kind)&&!/opacity-0|sr-only|opacity:\s*0/.test(node.getText(source)))nativeDateFields.push(file);
   }
   ts.forEachChild(node,visit);
  }
  visit(source);
 }
}
auditDateControls('src');
assert.deepEqual(nativeDateFields,[], 'All visible date fields must guarantee the ERP date format');

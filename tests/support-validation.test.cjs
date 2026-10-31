const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/support/validation.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:exportsObject,Uint8Array,DataView});
const {inspectImage,operation,databaseError,SupportError}=exportsObject;
const {inspectAttachment}=exportsObject;
const typesExports = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/support/types.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:typesExports});

test('incident timestamps always use four-digit years, 24 hours and Buenos Aires calendar boundaries',()=>{
  assert.equal(typesExports.dateLabel('2026-10-31T15:08:10.721Z'),'31/10/2026 12:08');
  assert.equal(typesExports.dateLabel('2026-11-01T02:05:00Z'),'31/10/2026 23:05');
  assert.equal(typesExports.dateLabel('2026-11-01T03:00:00Z'),'01/11/2026 00:00');
  assert.equal(typesExports.dateLabel('invalid'),'Sin fecha');
});
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a/RsAAAAASUVORK5CYII=','base64');

test('private PDF attachment checks reject disguised, incomplete and oversized files',()=>{
  const valid=Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n');
  assert.deepEqual(JSON.parse(JSON.stringify(inspectAttachment(valid,'application/pdf'))),{mime:'application/pdf',width:null,height:null});
  assert.equal(inspectAttachment(png,'image/png').width,1);
  for(const bytes of [png,Buffer.from('<html>PDF</html>'),Buffer.from('%PDF-1.7\ntruncated')])assert.throws(()=>inspectAttachment(bytes,'application/pdf'),SupportError);
  assert.throws(()=>inspectAttachment(new Uint8Array(10*1024*1024+1),'application/pdf'),e=>e.status===413);
});
test('accepts original PNG screenshots and identifies dimensions',()=>{
  const result=inspectImage(png,'image/png');assert.equal(result.width,1);assert.equal(result.height,1);assert.equal(result.mime,'image/png');
});
test('rejects disguised HTML, SVG, invalid MIME and incomplete images',()=>{
  for(const [bytes,mime] of [[Buffer.from('<html>secret</html>'),'image/png'],[Buffer.from('<svg></svg>'),'image/svg+xml'],[png,'image/jpeg'],[png.subarray(0,33),'image/png']])assert.throws(()=>inspectImage(bytes,mime),SupportError);
});
test('rejects oversized images and decompression dimensions beyond limit',()=>{
  assert.throws(()=>inspectImage(new Uint8Array(10*1024*1024+1),'image/png'),e=>e.status===413);
  const huge=Buffer.from(png);huge.writeUInt32BE(100000,16);huge.writeUInt32BE(100000,20);assert.throws(()=>inspectImage(huge,'image/png'),SupportError);
});
test('validates version, idempotency key, message lengths and attachment IDs',()=>{
  const valid={idempotencyKey:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',expectedVersion:2,payload:{body:'Información adicional',attachments:[]}};
  assert.equal(operation(valid).version,2);
  for(const input of [{...valid,expectedVersion:-1},{...valid,idempotencyKey:'fake'},{...valid,payload:{attachments:['other-user-file']}},{...valid,payload:{solution:'a'.repeat(10001)}},{...valid,payload:{attachments:new Array(6).fill(valid.idempotencyKey)}}])assert.throws(()=>operation(input),SupportError);
});
test('returns useful conflicts while hiding database internals and secrets',()=>{
  assert.throws(()=>databaseError({message:'SUPPORT_CONFLICT',code:'P0001'}),e=>e.status===409);
  assert.throws(()=>databaseError({message:'secret SQL table name and database password',code:'XX000'}),e=>e.status===503&&!e.message.includes('password')&&!e.message.includes('table'));
});

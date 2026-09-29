const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/support/validation.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:exportsObject,Uint8Array,DataView});
const {inspectImage,operation,databaseError,SupportError}=exportsObject;
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a/RsAAAAASUVORK5CYII=','base64');
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

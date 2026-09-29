const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const lib = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/authErrorMessage.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText, { exports: lib });
test('service failures do not blame credentials', () => {
  for (const error of [{status:500},{status:503},{status:504},{name:'AuthRetryableFetchError',status:0}]) {
    assert.match(lib.loginErrorMessage(error), /servicio de acceso/);
    assert.doesNotMatch(lib.loginErrorMessage(error), /contraseña incorrect/);
  }
});
test('rate limits and rejected credentials have distinct feedback', () => {
  assert.match(lib.loginErrorMessage({status:429}), /demasiados intentos/);
  assert.match(lib.loginErrorMessage({status:400,code:'invalid_credentials'}), /contraseña incorrect/);
  assert.doesNotMatch(lib.loginErrorMessage({status:400,code:'email_not_confirmed'}), /contraseña incorrect/);
});

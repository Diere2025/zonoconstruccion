const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { webcrypto } = require('node:crypto');
const { TextEncoder, TextDecoder } = require('node:util');

const lib = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/impersonation.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText, { exports: lib, crypto: webcrypto, TextEncoder, TextDecoder, Uint8Array, String, JSON, Date, btoa, atob });

const ticket = {
  administratorId: 'admin-1', administratorEmail: 'admin@example.com', administratorName: 'Admin',
  targetId: 'user-1', targetEmail: 'user@example.com', targetName: 'Usuario', targetRole: 'seller',
  issuedAt: 1000, expiresAt: 5000
};

test('signs and verifies an unmodified impersonation ticket', async () => {
  const token = await lib.signImpersonationTicket(ticket, 'secret-key');
  const verified = await lib.verifyImpersonationTicket(token, 'secret-key', 2000);
  assert.equal(verified.targetId, 'user-1');
});

test('rejects tampered, wrongly signed and expired tickets', async () => {
  const token = await lib.signImpersonationTicket(ticket, 'secret-key');
  assert.equal(await lib.verifyImpersonationTicket(token + 'x', 'secret-key', 2000), null);
  assert.equal(await lib.verifyImpersonationTicket(token, 'other-key', 2000), null);
  assert.equal(await lib.verifyImpersonationTicket(token, 'secret-key', 6000), null);
});

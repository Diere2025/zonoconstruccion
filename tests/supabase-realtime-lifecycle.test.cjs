const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

// Exercise the page's real subscription effect with a minimal hook lifecycle.
const file = 'src/app/admin/cobros-mp/page.tsx';
const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let effect;
function visit(node) {
  if (ts.isCallExpression(node) && node.expression.getText(source) === 'useEffect' && node.getText(source).includes(".channel('mp_payments_realtime')")) effect = node.getText(source);
  ts.forEachChild(node, visit);
}
visit(source);
assert.ok(effect, 'MP subscription effect was not found');
test('payment statistics updates retain the channel and unmount removes it', () => {
  let dependencies;
  let cleanup;
  let opened = 0;
  let removed = 0;
  let payments = [];
  let stats = { totalCount: 0, totalAmount: 0 };
  const handlers = {};
  const channel = {
    on: (_, config, callback) => { handlers[`${config.table}:${config.event}`] = callback; return channel; },
    subscribe: callback => { callback('SUBSCRIBED'); return channel; }
  };
  const scope = {
    isRoleLoaded: true, currentUserRole: 'admin', stats,
    supabase: { channel: () => { opened++; return channel; }, removeChannel: () => { removed++; } },
    setPayments: update => { payments = update(payments); },
    setStats: update => { stats = update(stats); },
    setIsRealtimeActive: () => {}, playChime: () => {}, loadAccounts: () => {},
    useEffect: (callback, next) => {
      if (!dependencies || next.some((value, index) => value !== dependencies[index])) {
        cleanup?.(); cleanup = callback(); dependencies = next;
      }
    }
  };
  const script = new vm.Script(ts.transpileModule(effect, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText);
  const context = vm.createContext(scope);
  script.runInContext(context);
  handlers['mp_payments:INSERT']({ new: { id: 'first', amount: 10 } });
  assert.equal(stats.totalCount, 1);
  assert.equal(stats.totalAmount, 10);
  scope.stats = stats;
  script.runInContext(context);
  assert.equal(opened, 1, 'updating stats reconnected Realtime');
  assert.equal(removed, 0);
  handlers['mp_payments:UPDATE']({ new: { id: 'first', amount: 20 } });
  assert.equal(payments[0].amount, 20);
  cleanup();
  assert.equal(removed, 1);
});

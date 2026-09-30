const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { test } = require('node:test');
const assert = require('node:assert/strict');

// Exercise the actual notifications handler with the authenticated database client.
const source = fs.readFileSync('src/app/api/support/[...path]/route.ts', 'utf8');
const start = source.indexOf("    if (path[0] === 'notifications'");
const end = source.indexOf("    if (path[0] === 'settings'", start);
const js = ts.transpileModule(`async function handle(db) {
const path = ['notifications']; const isGet = true;
const json = value => value;
const databaseError = error => { if (error) throw error; };
${source.slice(start, end)}
}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const handler = vm.runInNewContext(js + ';handle');

function database(items, count, error = null) {
    const calls = [];
    return { calls, from(table) {
        assert.equal(table, 'support_notifications');
        const query = { select(fields, options) {
            calls.push(['select', fields, options]);
            this.counting = !!options?.head;
            return this;
        }, order(field, options) { calls.push(['order', field, options]); return this; },
        limit(value) { calls.push(['limit', value]); return this; },
        is(field, value) { calls.push(['is', field, value]); return this; },
        then(resolve) { return Promise.resolve(this.counting ? { count, error } : { data: items, error: null }).then(resolve); } };
        return query;
    } };
}

test('unread count includes notifications beyond the preview and prioritizes unread items', async () => {
    const db = database([{ id: 'notice', read_at: null, ticket: { workflow: 'incident', number: 12, title: 'No puedo cargar un pedido' } }], 57);
    const result = await handler(db);
    assert.equal(result.unread_count, 57);
    assert.equal(result.items[0].number, 12);
    assert.equal(result.items[0].title, 'No puedo cargar un pedido');
    const order = db.calls.find(call => call[0] === 'order');
    assert.equal(order[1], 'read_at');
    assert.equal(order[2].nullsFirst, true);
    assert.ok(db.calls.some(call => call[0] === 'select' && call[2]?.count === 'exact' && call[2]?.head));
    assert.ok(db.calls.some(call => call[0] === 'is' && call[1] === 'read_at' && call[2] === null));
});

test('shipping notifications retain their destination and array-shaped joins work', async () => {
    const result = await handler(database([{ ticket: [{ workflow: 'shipping', number: 13, title: 'Cotizacion' }] }], 0));
    assert.equal(result.items[0].workflow, 'shipping');
    assert.equal(result.items[0].number, 13);
    assert.equal(result.unread_count, 0);
});

test('count failures are reported instead of displaying a misleading zero', async () => {
    await assert.rejects(handler(database([], null, new Error('unavailable'))), /unavailable/);
});

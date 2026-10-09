const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { test } = require('node:test');
const assert = require('node:assert/strict');

// Drive the real component handlers, with deterministic hooks and delayed loading.
function component(path, exportName, imports, extra = '') {
    const values = []; let index = 0; const effects = []; const timers = [];
    const hooks = {
        useState(initial) { const slot = index++; if (!(slot in values)) values[slot] = typeof initial === 'function' ? initial() : initial; return [values[slot], next => { values[slot] = typeof next === 'function' ? next(values[slot]) : next; }]; },
        useRef(initial) { const slot = index++; return values[slot] ||= { current: initial }; },
        useCallback(fn) { return fn; },
        useEffect(fn) { effects.push(fn); },
    };
    const module = { exports: {} };
    const js = ts.transpileModule(fs.readFileSync(path, 'utf8') + extra, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    vm.runInNewContext(js, { module, exports: module.exports, require(name) { return name === 'react' ? hooks : imports[name] || require(name); }, crypto, FormData, window: { addEventListener() {}, removeEventListener() {} }, document: { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} }, setTimeout(fn) { timers.push(fn); }, clearTimeout() {}, setInterval() {}, clearInterval() {} });
    return { render(props) { index = 0; effects.length = 0; return module.exports[exportName](props); }, mount() { effects.forEach(fn => fn()); }, async tick() { for (const fn of timers.splice(0)) await fn(); } };
}
function elements(tree, predicate) {
    if (!tree || typeof tree !== 'object') return [];
    if (Array.isArray(tree)) return tree.flatMap(child => elements(child, predicate));
    return [...(predicate(tree) ? [tree] : []), ...elements(tree.props?.children, predicate)];
}
const flush = () => new Promise(resolve => setImmediate(resolve));
function bell(request) {
    return component('src/components/support/SupportNotifications.tsx', 'TestBell', {
        'next/navigation': { usePathname: () => '/admin/finanzas' },
        'next/link': { default: 'a' },
        '@/lib/supabase': {},
        '@/lib/support/client': { supportRequest: request, commandBody: data => JSON.stringify(data), errorMessage: String },
        '@/lib/support/eventLabels': { eventLabels: {} },
        '@/lib/support/eventContext': { administrativeEvents: [] },
        '@/lib/support/types': { code: String, dateLabel: String },
    }, '\nexport { NotificationBell as TestBell };');
}
function setupBell() {
    const notices = ['first', 'second', 'third'].map(id => ({ id, ticket_id: id, created_at: '2026-10-08T10:00:00Z', read_at: null, title: id }));
    const writes = []; let resolveInitial;
    const initial = new Promise(resolve => { resolveInitial = resolve; }); let first = true;
    const view = bell(async (_path, options) => {
        if (options?.method === 'PATCH') {
            const data = JSON.parse(options.body); writes.push(data); let updated = 0;
            for (const n of notices) if (!n.read_at && (data.before || data.ids.includes(n.id))) { n.read_at = 'read'; updated++; }
            return { updated };
        }
        if (first) { first = false; await initial; }
        return { items: notices.map(n => ({ ...n })), unread_count: notices.filter(n => !n.read_at).length };
    });
    view.render(); view.mount(); void view.tick();
    let tree = view.render();
    elements(tree, node => node.type === 'button')[0].props.onClick();
    tree = view.render(); view.mount();
    return { view, writes, resolveInitial, notices };
}
test('opening notifications during loading and viewing the list do not mark any notice read', async () => {
    const { view, writes, resolveInitial } = setupBell();
    assert.equal(writes.length, 0);
    resolveInitial(); await flush(); await view.tick();
    const tree = view.render(); view.mount(); await view.tick(); await flush();
    assert.equal(writes.length, 0);
    assert.equal(elements(tree, node => node.props?.['data-unread'] === true).length, 3);
});
test('opening one notice only marks that notice; explicit mark all reads the rest', async () => {
    const { view, writes, resolveInitial, notices } = setupBell();
    resolveInitial(); await flush();
    const tree = view.render();
    const all = elements(tree, node => node.type === 'button' && node.props.children === 'Marcar todos como leídos')[0];
    elements(tree, node => node.props?.['data-notice-id'] === 'second')[0].props.onClick();
    await flush();
    assert.deepEqual(writes, [{ ids: ['second'] }]);
    assert.deepEqual(notices.map(n => !!n.read_at), [false, true, false]);
    await all.props.onClick();
    assert.ok(writes[1].before);
    assert.deepEqual(notices.map(n => !!n.read_at), [true, true, true]);
});
function form(own, userId = 'diego') {
    const Picker = () => null;
    const view = component('src/components/support/TicketForm.tsx', 'TicketForm', {
        'next/navigation': { useRouter: () => ({ push() {} }) },
        '@/lib/support/client': {}, '@/lib/support/types': { priorities: {}, ticketTypes: {} },
        './SupportShell': { useSupport: () => ({ me: { user_id: userId } }) },
        './AttachmentEditor': { usePendingImages: () => ({ images: [] }) },
        './useUnsavedChanges': { useUnsavedChanges() {} }, './ResponsibilityPicker': { ResponsibilityPicker: Picker },
    });
    return { view, render: () => view.render({ own }), picker: tree => elements(tree, node => node.type === Picker)[0] };
}
const options = { sectors: [{ id: 'ti', name: 'TI / Sistemas', active: true }], people: [{ id: 'diego', name: 'Diego', active: true, sector_ids: ['ti'] }, { id: 'other', name: 'Otra persona', active: true, sector_ids: ['ti'] }] };
test('own incident prefills TI and the signed-in person and preserves subsequent edits', () => {
    const f = form(true);
    f.picker(f.render()).props.onLoaded(options);
    let picker = f.picker(f.render());
    assert.equal(picker.props.sector, 'ti'); assert.equal(picker.props.assignee, 'diego');
    picker.props.onChange('ti', 'other');
    f.picker(f.render()).props.onLoaded(options);
    assert.equal(f.picker(f.render()).props.assignee, 'other');
});
test('regular incident stays blank and own incident does not choose somebody else', () => {
    for (const f of [form(false), form(true, 'missing')]) {
        f.picker(f.render()).props.onLoaded(options);
        const picker = f.picker(f.render());
        assert.equal(picker.props.sector, ''); assert.equal(picker.props.assignee, '');
    }
});

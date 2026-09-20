const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function loadTS(relative, dependencies = {}, globals = {}) {
  const filename = path.resolve(__dirname, '..', relative);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module, exports: module.exports, console: { error() {} },
    require: (name) => dependencies[name] ?? require(name),
    ...globals,
  }, { filename });
  return module.exports;
}

function harness() {
  const requests = [];
  const location = { pathname: '/' };
  const mediaSendPlan = loadTS('src/utils/mediaSendPlan.ts');
  const api = {
    get(url, config) {
      if (url.includes('/ticket-notes/list')) return Promise.resolve({ data: [] });
      return new Promise((resolve, reject) => requests.push({ method: 'get', url, config, resolve: (data) => resolve({ data }), reject }));
    },
    put(url, data) {
      return new Promise((resolve, reject) => requests.push({ method: 'put', url, data, resolve: () => resolve({ data: {} }), reject }));
    },
  };
  const { useChatStore: store } = loadTS('src/store/chatStore.ts', {
    '../services/api': { api },
    '../services/socket': { joinTicketRoom() {}, leaveTicketRoom() {}, getSocket() {} },
    '../utils/mediaSendPlan': mediaSendPlan,
  }, { window: { location, history: { pushState(_state, _title, url) { location.pathname = url; } } } });
  return { store, requests };
}
const ticket = (id, status = 'open', queueId = 1) => ({
  id, status, queueId, unreadMessages: 2, contact: { id, name: `Contact ${id}`, number: `100${id}` },
  createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z',
});
const message = (id, ticketId, minute = 1) => ({
  id, ticketId, body: id, fromMe: false, createdAt: `2026-09-01T00:${String(minute).padStart(2, '0')}:00Z`,
});
const ids = (items) => Array.from(items, (item) => item.id);

test('switching chats ignores stale messages and unread updates', async () => {
  const { store, requests } = harness();
  const a = store.getState().selectTicket(ticket(1));
  const b = store.getState().selectTicket(ticket(2));
  assert.equal(requests.length, 2);
  requests[0].resolve({ messages: [message('A', 1)], hasMore: true });
  await a;
  assert.equal(store.getState().activeTicket.id, 2);
  assert.deepEqual(ids(store.getState().messages), []);
  assert.equal(store.getState().isLoadingMessages, true);
  requests[1].resolve({ messages: [message('B', 2)] });
  await b;
  assert.deepEqual(ids(store.getState().messages), ['B']);
  assert.equal(store.getState().isLoadingMessages, false);
});

test('A → B → A rejects the first A response, even with the same ticket ID', async () => {
  const { store, requests } = harness();
  const pending = [store.getState().selectTicket(ticket(1)), store.getState().selectTicket(ticket(2)), store.getState().selectTicket(ticket(1))];
  requests[2].resolve({ messages: [message('new A', 1)] });
  requests[1].resolve({ messages: [message('B', 2)] });
  requests[0].resolve({ messages: [message('old A', 1)] });
  await Promise.all(pending);
  assert.deepEqual(ids(store.getState().messages), ['new A']);
});

test('closing a chat invalidates pending messages and identifier lookup', async () => {
  const { store, requests } = harness();
  const lookup = store.getState().loadTicketByIdentifier('old-uuid');
  const messages = store.getState().selectTicket(ticket(2));
  await store.getState().selectTicket(null);
  requests[0].resolve(ticket(1));
  requests[1].resolve({ messages: [message('B', 2)] });
  await Promise.all([lookup, messages]);
  assert.equal(store.getState().activeTicket, null);
  assert.deepEqual(ids(store.getState().messages), []);
});

test('history pagination deduplicates overlaps and survives newest-page refresh', async () => {
  const { store, requests } = harness();
  let pending = store.getState().selectTicket(ticket(1));
  requests[0].resolve({ messages: [message('m3', 1, 3), message('m2', 1, 2)], hasMore: true });
  await pending;
  pending = store.getState().fetchMessages(1);
  assert.equal(requests[1].config.params.pageNumber, 2);
  await store.getState().fetchMessages(1);
  assert.equal(requests.length, 2, 'concurrent pagination is blocked');
  requests[1].resolve({ messages: [message('m1', 1, 1), message('m2', 1, 2)], hasMore: false });
  await pending;
  pending = store.getState().fetchMessages(1, true);
  requests[2].resolve({ messages: [message('m4', 1, 4), message('m3', 1, 3)], hasMore: true });
  await pending;
  assert.deepEqual(ids(store.getState().messages), ['m1', 'm2', 'm3', 'm4']);
  assert.equal(store.getState().messagesPage, 3);
  assert.equal(store.getState().hasMoreMessages, false);
});

test('failed history load preserves messages and cursor so the same page can be retried', async () => {
  const { store, requests } = harness();
  let pending = store.getState().selectTicket(ticket(1));
  requests[0].resolve({ messages: [message('m2', 1, 2)], hasMore: true });
  await pending;
  pending = store.getState().fetchMessages(1);
  requests[1].reject(new Error('offline'));
  await pending;
  assert.equal(store.getState().messagesPage, 2);
  assert.ok(store.getState().messagesError);
  assert.deepEqual(ids(store.getState().messages), ['m2']);
  pending = store.getState().fetchMessages(1);
  assert.equal(requests[2].config.params.pageNumber, 2);
  requests[2].resolve({ messages: [message('m1', 1)], hasMore: false });
  await pending;
  assert.equal(store.getState().messagesError, null);
});

test('search changes supersede requests, retaining only the latest response', async () => {
  const { store, requests } = harness();
  const first = store.getState().fetchTickets(true);
  store.getState().setSearchQuery('contact 2');
  assert.equal(requests.length, 2);
  assert.equal(requests[1].config.params.searchParam, 'contact 2');
  requests[1].resolve({ tickets: [ticket(2)], hasMore: false });
  await new Promise(setImmediate);
  requests[0].resolve({ tickets: [ticket(1)], hasMore: true });
  await first;
  assert.deepEqual(ids(store.getState().tickets), [2]);
  assert.equal(store.getState().hasMoreTickets, false);
});

test('stale filter failure cannot clear the latest loading flag', async () => {
  const { store, requests } = harness();
  const old = store.getState().fetchTickets(true);
  store.getState().setSelectedQueueIds([2, 3]);
  requests[0].reject(new Error('old request failed'));
  await old;
  assert.equal(store.getState().isLoadingTickets, true);
  assert.equal(requests[1].config.params.queueIds, '[2,3]');
  requests[1].resolve({ tickets: [ticket(3, 'open', 3)] });
  await new Promise(setImmediate);
  assert.deepEqual(ids(store.getState().tickets), [3]);
});

test('ticket pagination deduplicates overlaps and keeps the next page after a failed load', async () => {
  const { store, requests } = harness();
  let pending = store.getState().fetchTickets(true);
  requests[0].resolve({ tickets: [ticket(3), ticket(2)], hasMore: true });
  await pending;

  pending = store.getState().fetchTickets();
  assert.equal(requests[1].config.params.pageNumber, 2);
  requests[1].resolve({ tickets: [ticket(2), ticket(1)], hasMore: true });
  await pending;
  assert.deepEqual(ids(store.getState().tickets), [3, 2, 1]);

  pending = store.getState().fetchTickets();
  assert.equal(requests[2].config.params.pageNumber, 3);
  requests[2].reject(new Error('offline'));
  await pending;
  assert.equal(store.getState().pageNumber, 3);
  assert.ok(store.getState().ticketsError);
  assert.deepEqual(ids(store.getState().tickets), [3, 2, 1]);
});

test('socket updates retain every status in All and every selected department', () => {
  const { store } = harness();
  store.setState({ activeTab: 'all', selectedQueueId: 1, selectedQueueIds: [1, 2], tickets: [ticket(1)] });
  store.getState().handleSocketTicket({ action: 'update', ticket: ticket(1, 'closed', 2) });
  store.getState().handleSocketTicket({ action: 'update', ticket: ticket(2, 'pending', 2) });
  store.getState().handleSocketTicket({ action: 'update', ticket: ticket(3, 'open', 3) });
  assert.deepEqual(ids(store.getState().tickets), [2, 1]);
  assert.equal(store.getState().tickets[1].status, 'closed');
});

test('WhatsApp socket updates keep the connection status available to the alert indicator', () => {
  const { store } = harness();
  store.setState({ whatsapps: [{ id: 1, name: 'Ventas', status: 'CONNECTED' }] });
  store.getState().handleSocketWhatsapp({ action: 'update', whatsapp: { id: 1, status: 'DISCONNECTED' } });
  assert.equal(store.getState().whatsapps[0].status, 'DISCONNECTED');
});

test('ticket leaving the selected tab updates the open header but leaves the list', () => {
  const { store } = harness();
  store.setState({ tickets: [ticket(1)], activeTicket: ticket(1) });
  store.getState().handleSocketTicket({ action: 'update', ticket: ticket(1, 'closed') });
  assert.deepEqual(ids(store.getState().tickets), []);
  assert.equal(store.getState().activeTicket.status, 'closed');
});

test('changing status keeps the active ticket updated instead of clearing it', async () => {
  const { store, requests } = harness();
  store.setState({ activeTab: 'pending', tickets: [ticket(1, 'pending')], activeTicket: ticket(1, 'pending') });
  const pending = store.getState().updateTicketStatus(1, 'open');
  assert.equal(requests[0].method, 'put');
  assert.equal(requests[0].data.status, 'open');
  requests[0].resolve();
  await pending;
  assert.equal(store.getState().activeTicket.status, 'open');
  assert.deepEqual(ids(store.getState().tickets), []);
});

test('transferring a ticket updates its assignee only after the API succeeds', async () => {
  const { store, requests } = harness();
  const original = ticket(1);
  store.setState({
    tickets: [original],
    activeTicket: original,
    users: [{ id: 7, name: 'Agente', email: 'agente@example.com', profile: 'user', companyId: 1 }],
  });
  const pending = store.getState().updateTicketUser(1, 7);
  assert.equal(requests[0].method, 'put');
  assert.equal(requests[0].url, '/tickets/1');
  assert.equal(requests[0].data.userId, 7);
  assert.equal(store.getState().activeTicket.userId, undefined);
  requests[0].resolve();
  await pending;
  assert.equal(store.getState().activeTicket.userId, 7);
  assert.equal(store.getState().activeTicket.user.name, 'Agente');
});

test('scheduling accepts zero or one attachment, rejecting multiple without discarding them', () => {
  const { validateScheduledAttachments } = loadTS('src/utils/scheduledAttachments.ts');
  const files = [{ name: 'one.pdf' }, { name: 'two.pdf' }];
  assert.equal(validateScheduledAttachments([]), null);
  assert.equal(validateScheduledAttachments(files.slice(0, 1)), null);
  assert.match(validateScheduledAttachments(files), /un archivo por mensaje/);
  assert.equal(files.length, 2);
});

test('multiple attachments use the composed text only for the first WhatsApp message', () => {
  const { createMediaSendPlan } = loadTS('src/utils/mediaSendPlan.ts');
  const plan = createMediaSendPlan([{ name: 'uno.png' }, { name: 'dos.png' }], 'Oferta de la semana');
  assert.deepEqual(plan.map((step) => step.body), ['Oferta de la semana', '']);
});

test('fetchTicketsSilent merges new and existing tickets without setting isLoadingTickets', async () => {
  const { store, requests } = harness();
  store.setState({ tickets: [ticket(1)], isLoadingTickets: false });
  const pending = store.getState().fetchTicketsSilent();
  assert.equal(store.getState().isLoadingTickets, false);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].config.params.pageNumber, 1);
  requests[0].resolve({
    tickets: [
      { ...ticket(2), updatedAt: '2026-09-01T01:00:00Z' },
      { ...ticket(1), lastMessage: 'Hola!' }
    ]
  });
  await pending;
  assert.deepEqual(ids(store.getState().tickets), [2, 1]);
  assert.equal(store.getState().tickets.find(t => t.id === 1).lastMessage, 'Hola!');
  assert.equal(store.getState().isLoadingTickets, false);
});

test('handleSocketMessage adds ticket when socket payload contains ticket data', () => {
  const { store } = harness();
  store.setState({ tickets: [ticket(1)] });
  store.getState().handleSocketMessage({
    action: 'create',
    message: message('m1', 99),
    ticket: ticket(99),
  });
  assert.deepEqual(ids(store.getState().tickets), [99, 1]);
  assert.equal(store.getState().tickets[0].lastMessage, 'm1');
});

test('handleSocketTicket accepts ticketId in delete action without dropping non-closed active ticket', () => {
  const { store } = harness();
  const openTicket = ticket(1, 'open');
  store.setState({ tickets: [openTicket], activeTicket: openTicket });
  store.getState().handleSocketTicket({ action: 'delete', ticketId: 1 });
  assert.deepEqual(ids(store.getState().tickets), []);
  assert.equal(store.getState().activeTicket.id, 1);
});

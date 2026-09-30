const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
const source = fs.readFileSync('src/lib/paymentPlanning/model.ts', 'utf8');
const exportsValue = {};
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports: exportsValue });
const { cents, project, runningRealizationBalances } = exportsValue;
const fund = { id: 'cash', name: 'Efectivo', kind: 'cash', currency: 'ARS', scenario: 'intermedio', active: true };
const balance = { id: 'balance', fund_id: 'cash', effective_date: '2026-09-28', amount: '100.00', reserved_amount: '0.00', notes: '' };
const item = (id, kind, amount, scheduled_date = '2026-09-29') => ({ id, fund_id: 'cash', kind, title: id, amount, scheduled_date, due_date: null, status: 'active', priority: 'normal', notes: '', source: 'manual', version: 1 });
const base = { funds: [fund], balances: [balance], items: [], realizations: [], reservations: [], rates: [], from: '2026-09-28', to: '2026-10-01', today: '2026-09-29' };

test('money parsing preserves cents, zero, and rejects extra precision', () => {
  assert.equal(cents('0'), 0);
  assert.equal(cents('12,34'), 1234);
  assert.equal(cents('-2.50'), -250);
  assert.throws(() => cents('12.345'));
  assert.throws(() => cents(null));
});

test('opening, receipt, payment and partial realization are counted once', () => {
  const rows = project({ ...base, items: [item('receipt','income','80.00'),item('payment','expense','120.00')],
    realizations: [{ id:'r1',item_id:'payment',fund_id:'cash',amount:'40.00',effective_date:'2026-09-29',reversed_at:null }] });
  assert.equal(rows.find(row => row.date==='2026-09-29').closing, 60);
  assert.equal(rows.find(row => row.date==='2026-09-29').expense, 120);
});

test('a zero observed balance replaces the previous closing, not skips it', () => {
  const rows = project({ ...base, balances: [balance, { ...balance,id:'second',effective_date:'2026-09-30',amount:'0.00' }],
    items: [item('income','income','80.00')] });
  assert.equal(rows.find(row => row.date==='2026-09-29').closing, 180);
  assert.equal(rows.find(row => row.date==='2026-09-30').opening, 0);
});

test('scenario changes affect estimates, not explicit occurrences or Sunday', () => {
  const rate = { id:'rate',fund_id:'cash',title:'Rendiciones',valid_from:'2026-09-28',valid_until:null,weekdays:[1,2,3,4,5,6],optimistic:'60',intermediate:'40',pessimistic:'30',active:true };
  const withRate = project({ ...base, rates:[rate], items:[{...item('override','income','8.00','2026-09-29'),scenario_rule_id:'rate'}] });
  assert.equal(withRate.find(row=>row.date==='2026-09-29').income,8);
  const optimistic = project({ ...base, funds:[{...fund,scenario:'optimista'}], rates:[rate] });
  assert.equal(optimistic.find(row=>row.date==='2026-09-29').income,60);
  const sunday = project({ ...base, rates:[rate], from:'2026-10-04',to:'2026-10-04', balances:[{...balance,effective_date:'2026-10-04'}], items:[item('sunday','expense','20','2026-10-04')] });
  assert.equal(sunday[0].income,0);
  assert.equal(sunday[0].expense,20);
});

test('a reserve reduces free money without changing total', () => {
  const rows = project({ ...base, reservations:[{id:'reserve',fund_id:'cash',kind:'reserve',amount:'30',effective_date:'2026-09-29',target_item_id:null,reversed_at:null}] });
  const day = rows.find(row=>row.date==='2026-09-29');
  assert.equal(day.closing,100);
  assert.equal(day.reserved,30);
  assert.equal(day.free,70);
});

test('a payment covered by a reserve reduces total and consumes reserved money in projection', () => {
  const rows = project({ ...base, items:[item('salary','expense','20.00','2026-09-30')],
    reservations:[{id:'reserve',fund_id:'cash',kind:'reserve',amount:'30.00',effective_date:'2026-09-29',target_item_id:'salary',reversed_at:null}] });
  assert.equal(rows.find(row=>row.date==='2026-09-29').free,70);
  const paymentDay = rows.find(row=>row.date==='2026-09-30');
  assert.equal(paymentDay.closing,80);
  assert.equal(paymentDay.reserved,10);
  assert.equal(paymentDay.free,70);
});

test('transfer changes each fund while preserving consolidated money', () => {
  const other = {...fund,id:'personal',name:'Personales',kind:'personal'};
  const rows = project({ ...base, funds:[fund,other], balances:[balance,{...balance,id:'other',fund_id:'personal'}],
    transfers:[{id:'transfer',source_fund_id:'cash',destination_fund_id:'personal',amount:'30',effective_date:'2026-09-29',reversed_at:null}] });
  const day=rows.filter(row=>row.date==='2026-09-29');
  assert.equal(day.find(row=>row.fund_id==='cash').closing,70);
  assert.equal(day.find(row=>row.fund_id==='personal').closing,130);
  assert.equal(day.reduce((sum,row)=>sum+row.closing,0),200);
});

test('moving a planned payment changes its day and fund projections', () => {
  const other = {...fund,id:'personal',name:'Personales',kind:'personal'};
  const input = { ...base, funds:[fund,other], balances:[balance,{...balance,id:'other',fund_id:'personal'}] };
  const before = project({ ...input, items:[item('payment','expense','25.00','2026-09-29')] });
  const after = project({ ...input, items:[{...item('payment','expense','25.00','2026-09-30'),fund_id:'personal'}] });
  assert.equal(before.find(row=>row.date==='2026-09-29' && row.fund_id==='cash').free,75);
  assert.equal(after.find(row=>row.date==='2026-09-29' && row.fund_id==='cash').free,100);
  assert.equal(after.find(row=>row.date==='2026-09-30' && row.fund_id==='personal').free,75);
  assert.equal(after.filter(row=>row.date==='2026-09-30').reduce((sum,row)=>sum+row.free,0),175);
});

test('realized balances exclude pending payments and scenario income and follow payment order', () => {
  const items = [item('payment','expense','50.00'), item('receipt','income','30.00'), item('pending','expense','70.00')];
  const realizations = [
    {id:'r2',item_id:'receipt',fund_id:'cash',amount:'30.00',effective_date:'2026-09-29',reversed_at:null,created_at:'2026-09-29T11:00:00Z'},
    {id:'r1',item_id:'payment',fund_id:'cash',amount:'50.00',effective_date:'2026-09-29',reversed_at:null,created_at:'2026-09-29T10:00:00Z'},
    {id:'reversed',item_id:'pending',fund_id:'cash',amount:'10.00',effective_date:'2026-09-29',reversed_at:'2026-09-29T12:00:00Z'}
  ];
  const rate = {id:'rate',fund_id:'cash',title:'Estimate',valid_from:'2026-09-28',valid_until:null,weekdays:[1,2,3,4,5,6],optimistic:'60',intermediate:'40',pessimistic:'30',active:true};
  const rows = project({...base,items,realizations,rates:[rate],realizedOnly:true});
  assert.equal(rows.find(row=>row.date==='2026-09-29').free,80);
  const balances = runningRealizationBalances(rows,items,realizations,[]);
  assert.equal(balances.r1,50);
  assert.equal(balances.r2,80);
  assert.equal(balances.reversed,undefined);
});

test('a realized payment releases only its assigned consumed reserve in running balances', () => {
  const items = [item('salary','expense','20.00'),item('other','expense','10.00')];
  const realizations = [
    {id:'salary-r',item_id:'salary',fund_id:'cash',amount:'20.00',effective_date:'2026-09-29',reversed_at:null,created_at:'2026-09-29T10:00:00Z'},
    {id:'other-r',item_id:'other',fund_id:'cash',amount:'10.00',effective_date:'2026-09-29',reversed_at:null,created_at:'2026-09-29T11:00:00Z'}
  ];
  const reservations = [
    {id:'reserve',fund_id:'cash',kind:'reserve',amount:'30.00',effective_date:'2026-09-28',target_item_id:'salary',reversed_at:null},
    {id:'consume',fund_id:'cash',kind:'consume',amount:'20.00',effective_date:'2026-09-29',target_item_id:'salary',realization_id:'salary-r',reversed_at:null}
  ];
  const rows = project({...base,items,realizations,reservations,realizedOnly:true});
  const balances = runningRealizationBalances(rows,items,realizations,reservations);
  assert.equal(balances['salary-r'],70);
  assert.equal(balances['other-r'],60);
  assert.equal(rows.find(row=>row.date==='2026-09-29').free,60);
});

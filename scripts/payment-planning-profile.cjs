// Read-only summary of a saved private Google Sheets snapshot.
const fs = require('node:fs');
const path = require('node:path');
const source = process.argv[2];
if (!source) throw new Error('Indicá el archivo de captura.');
const snapshot = JSON.parse(fs.readFileSync(source, 'utf8'));
const rows = snapshot.ranges.find(range => range.range.startsWith('Actual!')).values;
const blocks = [
  { fund: 'cash', date: 1, title: 3, amount: 4, effect: 5, balance: 6 },
  { fund: 'personal', date: 9, title: 11, amount: 12, effect: 13, balance: 14 },
  { fund: 'company', date: 17, title: 19, amount: 20, effect: 21, balance: 22 }
];
const iso = value => typeof value === 'number' ? new Date(Date.UTC(1899,11,30) + Math.round(value) * 86400000).toISOString().slice(0,10) : '';
const normalized = text => String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const prepared = [];
for (let index=2; index<rows.length; index++) for (const block of blocks) {
  const row = rows[index] || [];
  const date = iso(row[block.date]);
  const title = String(row[block.title] || '').trim();
  const amount = row[block.amount];
  const effect = row[block.effect];
  if (!date || (!title && (typeof amount !== 'number' || amount === 0) && (typeof effect !== 'number' || effect === 0))) continue;
  const label = normalized(title);
  const type = /saldo inicial/.test(label) ? 'opening'
    : /ingresos estimados|rendiciones y ventas depo/.test(label) ? 'scenario'
    : /reserva de sueldos/.test(label) ? 'reserve'
    : /reingreso sueldos/.test(label) ? 'release'
    : /ajuste/.test(label) ? 'adjustment'
    : /reintegro|transferencia/.test(label) ? 'ambiguous'
    : !title ? 'missing_title'
    : typeof effect !== 'number' ? 'missing_effect'
    : effect > 0 ? 'income' : effect < 0 ? 'expense' : 'zero';
  prepared.push({ row: index+1, fund: block.fund, date, title, amount, effect, balance: row[block.balance], type });
}
const byDate = Object.groupBy(prepared.filter(row => row.date >= '2026-09-28' && row.date <= '2026-10-31'), row => row.date);
const days = Object.entries(byDate).sort(([a],[b]) => a.localeCompare(b)).map(([date, entries]) => ({
  date, byFund: Object.fromEntries(blocks.map(block => {
    const subset = entries.filter(row => row.fund === block.fund);
    return [block.fund, { rows: subset.length, types: Object.fromEntries(Object.entries(Object.groupBy(subset,row=>row.type)).map(([type,group])=>[type,group.length])), lastBalance: subset.at(-1)?.balance ?? null }];
  }))
}));
const report = { source: path.basename(source), capturedAt: snapshot.capturedAt, totalClassified: prepared.length, days,
  issues: prepared.filter(row => ['adjustment','ambiguous','missing_title','missing_effect'].includes(row.type) && row.date >= '2026-09-28' && row.date <= '2026-10-31').map(row => ({ row: row.row, fund: row.fund, date: row.date, type: row.type, amount: row.amount, effect: row.effect })) };
const out = path.join(path.dirname(source), 'profile.json');
fs.writeFileSync(out, JSON.stringify(report,null,2));
console.log(JSON.stringify({ source: report.source, capturedAt: report.capturedAt, totalClassified: report.totalClassified, days: days.length, issues: report.issues.length, issuesByType: Object.fromEntries(Object.entries(Object.groupBy(report.issues,row=>row.type)).map(([type,group])=>[type,group.length])), output: out }));

// Produce an installable release without restoring files deleted in the working tree.
const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..');
const base = path.join(root, '.codex-worktrees/extension-mp-1.7.0/chrome-extension-mp');
const dest = path.join(root, 'output/mp-extension-1.7.4');
fs.mkdirSync(dest, { recursive: true });
for (const name of fs.readdirSync(base)) {
  if (fs.statSync(path.join(base, name)).isFile()) fs.copyFileSync(path.join(base, name), path.join(dest, name));
}
fs.copyFileSync(path.join(root, 'output/mp-extension-1.7.0/popup.html'), path.join(dest, 'popup.html'));
for (const name of ['banking-health.js', 'banking-watchdog.js', 'WATCHDOG-MOVIMIENTOS.md'])
  fs.copyFileSync(path.join(root, 'chrome-extension-mp', name), path.join(dest, name));
// Do not ship the previous release's instructions pointing to another branch.
fs.copyFileSync(path.join(dest, 'WATCHDOG-MOVIMIENTOS.md'), path.join(dest, 'INSTALAR-EN-OTRA-PC.md'));
fs.appendFileSync(path.join(dest, 'background.js'), '\nimportScripts("banking-watchdog.js");\n');
const capturePath = path.join(dest, 'capture-refresh.js');
const capture = fs.readFileSync(capturePath, 'utf8');
if (!capture.includes('globalThis.ZonoCaptureRefresh={')) throw Error('Unsupported capture API');
fs.writeFileSync(capturePath, capture.replace('globalThis.ZonoCaptureRefresh={',
  'globalThis.ZonoCaptureRefresh={isBusy:()=>polling,'));
// Banking now has one refresh owner. The legacy Activity loop otherwise reloads
// error pages every three seconds and defeats the persisted watchdog budget.
const contentPath = path.join(dest, 'content.js');
const content = fs.readFileSync(contentPath, 'utf8');
const refreshGuard = /(function checkRefresh\(\) \{\r?\n\s*)if \(!isMonitorTab\) return;/;
if (!refreshGuard.test(content)) throw Error('Unsupported legacy refresh loop');
fs.writeFileSync(contentPath, content.replace(refreshGuard,
  '$1if (!isMonitorTab || isBankingPage()) return;'));
const manifest = JSON.parse(fs.readFileSync(path.join(dest, 'manifest.json'), 'utf8'));
manifest.version = '1.7.4';
manifest.content_scripts[0].js.push('banking-health.js');
fs.writeFileSync(path.join(dest, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
for (const name of [manifest.background.service_worker, manifest.action.default_popup,
  ...manifest.content_scripts.flatMap(item => item.js)]) {
  if (!fs.existsSync(path.join(dest, name))) throw Error('Missing release file: ' + name);
}
console.log(dest);

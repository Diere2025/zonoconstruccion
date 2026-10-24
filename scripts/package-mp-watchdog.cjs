// Produce an installable release without restoring files deleted in the working tree.
const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..');
const base = path.join(root, 'output/mp-extension-1.7.4');
const dest = path.join(root, 'output/mp-extension-1.7.5');
fs.mkdirSync(dest, { recursive: true });
for (const name of fs.readdirSync(base)) {
  if (fs.statSync(path.join(base, name)).isFile()) fs.copyFileSync(path.join(base, name), path.join(dest, name));
}
for (const name of ['banking-health.js', 'banking-watchdog.js', 'WATCHDOG-MOVIMIENTOS.md'])
  fs.copyFileSync(path.join(root, 'chrome-extension-mp', name), path.join(dest, name));
// Do not ship the previous release's instructions pointing to another branch.
fs.copyFileSync(path.join(dest, 'WATCHDOG-MOVIMIENTOS.md'), path.join(dest, 'INSTALAR-EN-OTRA-PC.md'));
const capturePath = path.join(dest, 'capture-refresh.js');
const capture = fs.readFileSync(capturePath, 'utf8');
const retryGuard = 'Date.now()-(failedAt.get(key)||0)<30000';
if (!capture.includes(retryGuard)) throw Error('Unsupported capture retry policy');
fs.writeFileSync(capturePath, capture.replace(retryGuard,
  "Date.now()-(failedAt.get(key)||0)<(lane==='banking'?300000:30000)"));
const manifest = JSON.parse(fs.readFileSync(path.join(dest, 'manifest.json'), 'utf8'));
manifest.version = '1.7.5';
fs.writeFileSync(path.join(dest, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
for (const name of [manifest.background.service_worker, manifest.action.default_popup,
  ...manifest.content_scripts.flatMap(item => item.js)]) {
  if (!fs.existsSync(path.join(dest, name))) throw Error('Missing release file: ' + name);
}
console.log(dest);

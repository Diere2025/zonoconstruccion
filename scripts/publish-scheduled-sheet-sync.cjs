const fs = require('node:fs'), cp = require('node:child_process');
const dir = 'output/scheduled-sheet-sync';
const credential = cp.execFileSync('git', ['credential', 'fill'], { input: 'protocol=https\nhost=github.com\n\n', encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
const token = credential.split(/\r?\n/).find(x => x.startsWith('password='))?.slice(9);
if (!token) throw Error('No hay sesión de GitHub.');
async function api(suffix, method = 'GET', body) {
  const response = await fetch('https://api.github.com/repos/Diere2025/zonoconstruccion' + suffix, { method, headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'User-Agent': 'Codex-scheduled-sheet-sync' }, body: body ? JSON.stringify(body) : undefined });
  const value = await response.json(); if (!response.ok) throw Error(`GitHub ${response.status}: ${value.message}`); return value;
}
async function main() {
  const action = process.argv[2], record = `${dir}/pr.json`;
  if (action === 'pr') {
    const sha = cp.execFileSync('git', ['-c', 'core.fsmonitor=false', '-C', `${dir}/build`, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const pr = await api('/pulls', 'POST', { head: 'codex/scheduled-sheet-sync', base: 'feature/erp-modular', title: 'Automatizar sincronización de planillas a las 07:00, 14:00 y 23:30', body: 'Agrega un ejecutor en Cloudflare que descarga y valida las fuentes, procesa vendedores y Central en orden, concilia logística y termina con stock físico y reservas. Registra el progreso y resultado de cada corrida, evita superponer sus propias ejecuciones y conserva las reglas de negocio existentes.\n\nLa API de importación mantiene la autenticación de administrador para uso manual. La automatización usa una credencial exclusiva, sin clave general de Supabase ni sesión administradora, y solo acepta fuentes, opciones y lotes autorizados durante una corrida real y su etapa correspondiente. La base guarda únicamente el hash de la credencial.\n\nValidación: 31 pruebas de autenticación, importaciones repetidas, alertas y coordinación; ensayos SQL con rollback de exclusión, deduplicación, vencimiento, recuperación, permisos y autorización por etapa. Vista previa real en el servidor: fuentes válidas y 341 productos de stock vinculados. Los disparadores se activan únicamente después de una vista previa y una primera corrida completas.' });
    if (pr.head.sha !== sha) throw Error('El PR no coincide con el commit comprobado.');
    const result = { number: pr.number, url: pr.html_url, sha }; fs.writeFileSync(record, JSON.stringify(result, null, 2)); console.log(JSON.stringify(result)); return;
  }
  const saved = JSON.parse(fs.readFileSync(record, 'utf8'));
  if (action === 'merge') {
    const pr = await api('/pulls/' + saved.number);
    if (pr.head.sha !== saved.sha || pr.base.ref !== 'feature/erp-modular' || pr.mergeable !== true) throw Error('Cambió el PR o todavía no es integrable.');
    const result = await api('/pulls/' + saved.number + '/merge', 'PUT', { sha: saved.sha, merge_method: 'squash', commit_title: 'feat(erp): sincronización programada de planillas' });
    if (!result.merged) throw Error('No se integró el PR.');
    fs.writeFileSync(`${dir}/merged.json`, JSON.stringify(result, null, 2)); console.log(JSON.stringify(result)); return;
  }
  if (action === 'status') {
    const merged = fs.existsSync(`${dir}/merged.json`) ? JSON.parse(fs.readFileSync(`${dir}/merged.json`)) : null;
    const sha = merged?.sha || saved.sha;
    const pr = await api('/pulls/' + saved.number), checks = await api('/commits/' + sha + '/check-runs?per_page=100'), status = await api('/commits/' + sha + '/status');
    console.log(JSON.stringify({ sha, merged: pr.merged, mergeable: pr.mergeable, checks: checks.check_runs.map(c => ({ name: c.name, status: c.status, conclusion: c.conclusion })), statuses: status.statuses.map(s => ({ context: s.context, state: s.state, url: s.target_url })) })); return;
  }
  throw Error('Modo inválido.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });

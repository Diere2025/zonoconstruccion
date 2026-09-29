// Dry-run by default. Imports the authorized source snapshot, never edits Sheets.
const fs = require('node:fs');
const crypto = require('node:crypto');
const vm = require('node:vm');
const ts = require('typescript');
const { Client } = require('pg');
const { createClient } = require('@supabase/supabase-js');
process.loadEnvFile('.env.local');
const sourceId = '18H-pW18IfljVS8M0ktND0utplFo360dRZgppj2XjThI';
const sheetId = 1388968269;
const adminId = '381df0d1-183f-4ccb-aaf2-8147c76159a9';
const apply = process.argv.includes('--apply');
const validation = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/support/validation.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText, { exports: validation, Uint8Array, DataView });
const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
const snapshot = JSON.parse(fs.readFileSync('output/support-import/source.json', 'utf8'));
const sheet = snapshot.sheets.find(s => s.properties.sheetId === sheetId);
if (snapshot.spreadsheetId !== sourceId || !sheet) throw new Error('Unexpected source');
const imageInventory = JSON.parse(fs.readFileSync('output/support-import/images.json', 'utf8'));
const titles = {
  '1': 'La rendición pierde datos al registrar movimientos de caja',
  '2': 'El sistema se tilda y requiere volver a abrirlo',
  '3': 'No se encuentra la opción para eliminar una rendición',
  '4': 'Los pedidos postergados y cancelados alteran la rendición',
  '5': 'Falta elegir fecha en las transferencias entre cuentas',
  '6': 'Los movimientos de Flujo General aparecen desordenados',
  '7': 'Confirmar la rendición revierte cambios y genera un faltante',
  '8': 'Actualizar movimientos cambia el rol de Administración a Vendedora'
};
const rows = sheet.data.flatMap(block => (block.rowData || []).map((r, index) => ({
  row: (block.startRow || 0) + index + 1,
  values: (r.values || []).map(c => c.formattedValue || '')
}))).filter(r => r.row > 1 && r.values[4]?.trim());
if (new Set(rows.map(r => r.values[0])).size !== rows.length) throw new Error('Duplicate legacy IDs');
const prepared = rows.map(r => {
  const [legacyId, date, module, type, description, priority, state, imageCell, observations = ''] = r.values;
  const kind = { bug: 'error', mejora: 'improvement', 'nueva funcion': 'feature' }[normalize(type)];
  const rank = { baja: 'low', media: 'medium', alta: 'high', critica: 'critical' }[normalize(priority)];
  const originalStatus = normalize(state);
  const pendingTest = originalStatus === 'finalizado' && normalize(observations) === 'probar';
  const needsInfo = originalStatus === 'pendiente' && normalize(observations).startsWith('necesito mas especificaciones');
  const status = pendingTest ? 'waiting_validation' : needsInfo ? 'waiting_requester' :
    ({ pendiente: 'new', finalizado: 'closed', cerrado: 'closed', cancelado: 'cancelled', 'en proceso': 'in_progress' })[originalStatus];
  const match = date?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const dateISO = match && `${match[3]}-${match[2]}-${match[1]}T03:00:00.000Z`;
  if (!kind || !rank || !status || !dateISO || !Number.isFinite(Date.parse(dateISO)) || !legacyId || !titles[legacyId]) throw new Error(`Row ${r.row} requires review`);
  const images = imageInventory.filter(i => i.sheet === sheet.properties.title && i.row === r.row && i.column === 8).map(i => {
    const bytes = new Uint8Array(fs.readFileSync(i.file));
    if (crypto.createHash('sha256').update(bytes).digest('hex') !== i.sha256) throw new Error('Image snapshot changed');
    return { ...i, ...validation.inspectImage(bytes, i.name.endsWith('.png') ? 'image/png' : 'image/jpeg') };
  });
  const hash = crypto.createHash('sha256').update(JSON.stringify({ values: r.values, images: images.map(i => i.sha256) })).digest('hex');
  return { ...r, legacyId, dateISO, module, kind, description, rank, originalStatus: state, observations, status, images, hash, title: titles[legacyId] };
});
if (prepared.reduce((n,r) => n+r.images.length,0) !== imageInventory.length) throw new Error('Unmatched image anchor');

async function run() {
  const db = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000, application_name: 'support-sheet-import' });
  const uploadedPaths = [];
  let storage;
  let committed = false;
  try {
    await db.connect();
    const owners = (await db.query(`select s.id,s.full_name,s.email,s.is_active,p.user_id,public.support_user_active(p.user_id) as active
      from public.sellers s left join public.support_profiles p on p.seller_id=s.id
      where lower(trim(s.full_name))=$1`, ['carolina ibarra'])).rows;
    if (owners.length !== 1 || !owners[0].active) throw new Error('Carolina Ibarra must match exactly one active linked account');
    const owner = owners[0];
    const admin = (await db.query('select public.support_user_admin($1) as active', [adminId])).rows[0];
    if (!admin.active) throw new Error('Verified import administrator is not active');
    const sector = (await db.query("select id from public.support_sectors where name='TI / Sistemas' and active")).rows[0];
    if (!sector) throw new Error('IT sector is not configured');
    const ledgerExists = (await db.query("select to_regclass('public.support_import_items') is not null as exists")).rows[0].exists;
    const prior = ledgerExists ? (await db.query('select legacy_id,source_hash,ticket_id from public.support_import_items where spreadsheet_id=$1 and sheet_id=$2', [sourceId,sheetId])).rows : [];
    const todo = prepared.filter(row => {
      const old = prior.find(item => item.legacy_id === row.legacyId);
      if (old && old.source_hash !== row.hash) throw new Error(`Source changed for already imported ID ${row.legacyId}; manual review required`);
      return !old;
    });
    const summary = { mode: apply ? 'apply' : 'preview', owner: { name: owner.full_name, user_id: owner.user_id },
      source: snapshot.properties.title, rows: prepared.length, newRows: todo.length, alreadyImported: prior.length,
      states: prepared.reduce((a,r) => ({ ...a, [r.status]: (a[r.status] || 0)+1 }), {}),
      images: prepared.reduce((n,r) => n+r.images.length,0), sector: 'TI / Sistemas', rowsPreview: prepared.map(r => ({ legacyId:r.legacyId,title:r.title,status:r.status,date:r.values[1],priority:r.rank,images:r.images.length })) };
    fs.writeFileSync('output/support-import/preview.json', JSON.stringify(summary, null, 2));
    console.log(JSON.stringify(summary));
    if (!apply || !todo.length) return;
    storage = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    // Commit DDL before any Storage request: the database's DDL hooks lock buckets/Auth.
    if (!ledgerExists) {
      await db.query('begin');
      await db.query('select pg_advisory_xact_lock(106106)');
      await db.query(fs.readFileSync('database/db_migration_v107_support_imports.sql','utf8'));
      await db.query('commit');
    }
    await db.query('begin');
    await db.query('select pg_advisory_xact_lock(106106)');
    const importedAt = new Date().toISOString();
    const results = [];
    for (const row of todo) {
      const concurrent = (await db.query('select source_hash from public.support_import_items where spreadsheet_id=$1 and sheet_id=$2 and legacy_id=$3', [sourceId,sheetId,row.legacyId])).rows[0];
      if (concurrent) { if (concurrent.source_hash !== row.hash) throw new Error('Concurrent source conflict'); continue; }
      const id = crypto.randomUUID();
      const originalMessageId = crypto.randomUUID();
      const solution = row.status === 'waiting_validation' ? 'La planilla indica Finalizado. Falta confirmar el resultado de la prueba.' : row.status === 'closed' ? 'Cierre administrativo histórico: la planilla indica Finalizado sin prueba pendiente. No consta validación del solicitante.' : '';
      const ticket = (await db.query(`insert into public.support_tickets(id,created_by,sector_id,title,description,module,type,suggested_priority,priority,status,assignee_id,solution,closed_by,closure_kind,closed_at,created_at,updated_at)
        values($1,$2,$3,$4,$5,$6,$7,$8,$8,$9,$10,$11,$12,$13,$14,$15,$16) returning id,number,status`,
        [id,owner.user_id,sector.id,row.title,row.description,row.module,row.kind,row.rank,row.status,adminId,solution,
          row.status==='closed'?adminId:null,row.status==='closed'?'administrative':null,row.status==='closed'?importedAt:null,row.dateISO,importedAt])).rows[0];
      await db.query(`insert into public.support_messages(id,ticket_id,author_id,body,visibility,created_at) values($1,$2,$3,$4,'public',$5)`,
        [originalMessageId,id,adminId,`Importado de planilla · ID original ${row.legacyId} · Fecha original ${row.values[1]} (sin hora registrada).\nIncidencia asignada a Carolina Ibarra según indicación del administrador.\nEstado original: ${row.originalStatus}.\n\n${row.description}`,importedAt]);
      await db.query(`insert into public.support_events(ticket_id,actor_id,kind,message_id,details,created_at) values($1,$2,'imported',$3,$4,$5)`,
        [id,adminId,originalMessageId,JSON.stringify({status:row.status,legacy_id:row.legacyId,source_url:`https://docs.google.com/spreadsheets/d/${sourceId}/edit#gid=${sheetId}`,source_date:row.values[1],closed_at_basis:row.status==='closed'?'import_timestamp_no_historical_close_date':null}),importedAt]);
      for (const image of row.images) {
        const attachmentId = crypto.randomUUID();
        const storagePath = `${owner.user_id}/${attachmentId}`;
        const bytes = fs.readFileSync(image.file);
        const result = await storage.storage.from('support-attachments').upload(storagePath,bytes,{contentType:image.mime,upsert:false});
        if (result.error) throw new Error(`Image upload failed for legacy ID ${row.legacyId}: ${result.error.statusCode || ''} ${result.error.message}`);
        uploadedPaths.push(storagePath);
        await db.query(`insert into public.support_attachments(id,ticket_id,message_id,created_by,visibility,path,name,mime,bytes,width,height,state,created_at) values($1,$2,$3,$4,'public',$5,$6,$7,$8,$9,$10,'linked',$11)`,
          [attachmentId,id,originalMessageId,adminId,storagePath,`Planilla-ID-${row.legacyId}-${image.name}`,image.mime,bytes.length,image.width,image.height,importedAt]);
      }
      if (row.observations) {
        const note = (await db.query(`insert into public.support_messages(ticket_id,author_id,body,visibility,created_at) values($1,$2,$3,'internal',$4) returning id`,
          [id,adminId,`Observación original de la columna «Obs de Diego», importada sin reinterpretar:\n${row.observations}`,importedAt])).rows[0];
        await db.query(`insert into public.support_events(ticket_id,actor_id,kind,message_id,visibility,created_at) values($1,$2,'imported',$3,'internal',$4)`,[id,adminId,note.id,importedAt]);
      }
      if (['waiting_requester','waiting_validation'].includes(row.status)) {
        const kind = row.status==='waiting_validation'?'validation':'information';
        const text = kind==='validation'?'Solicitud de prueba trasladada de la planilla: probá el caso informado y confirmá si funciona. Si sigue fallando, indicá qué ocurrió y adjuntá una captura.':'Solicitud de información trasladada de la planilla: indicá en qué pantalla se tilda el sistema, qué estabas haciendo y adjuntá capturas si es posible.';
        const message = (await db.query(`insert into public.support_messages(ticket_id,author_id,body,visibility,created_at) values($1,$2,$3,'public',$4) returning id`,[id,adminId,text,importedAt])).rows[0];
        await db.query(`insert into public.support_action_requests(ticket_id,kind,requested_by,recipient_id,message_id,created_at) values($1,$2,$3,$4,$5,$6)`,[id,kind,adminId,owner.user_id,message.id,importedAt]);
        await db.query(`insert into public.support_events(ticket_id,actor_id,kind,message_id,details,created_at) values($1,$2,$3,$4,$5,$6)`,[id,adminId,kind==='validation'?'request_validation':'request_info',message.id,JSON.stringify({status:row.status,imported:true}),importedAt]);
      }
      await db.query(`insert into public.support_import_items(spreadsheet_id,sheet_id,legacy_id,source_row,source_hash,source_data,ticket_id,imported_by,imported_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [sourceId,sheetId,row.legacyId,row.row,row.hash,JSON.stringify({values:row.values,images:row.images.map(i=>({name:i.name,sha256:i.sha256,bytes:i.bytes})),owner_basis:'User explicitly identified Carolina Ibarra',timestamp_basis:'Source date only; close/import timestamp is actual import time'}),id,adminId,importedAt]);
      results.push({...ticket,legacy_id:row.legacyId});
    }
    await db.query('commit'); committed = true;
    fs.writeFileSync('output/support-import/result.json',JSON.stringify({importedAt,owner:owner.full_name,results},null,2));
    console.log(JSON.stringify({imported:results.length,results,notifications:'historical import is silent'}));
  } catch (error) {
    if (!committed) {
      await db.query('rollback').catch(()=>{});
      if (uploadedPaths.length) {
        const removed = await storage.storage.from('support-attachments').remove(uploadedPaths);
        if (removed.error) console.error('Storage rollback requires review: see reserved imported paths');
      }
    }
    throw error;
  } finally { await db.end(); }
}
run().catch(e => { console.error(e.message); process.exitCode=1; });

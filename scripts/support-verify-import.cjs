// Read imported data and exercise recipient actions in a transaction rolled back.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const { Client } = require('pg');
const { createClient } = require('@supabase/supabase-js');
process.loadEnvFile('.env.local');
const sourceId = '18H-pW18IfljVS8M0ktND0utplFo360dRZgppj2XjThI';
const adminId = '381df0d1-183f-4ccb-aaf2-8147c76159a9';
const expectedImages = JSON.parse(fs.readFileSync('output/support-import/images.json','utf8'));
const db = new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:10000});
async function identity(id) {
  await db.query('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,true)",[id]);
  await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:id,role:'authenticated'})]);
  await db.query('set local role authenticated');
}
async function run() {
  try {
    await db.connect();
    await db.query('begin');
    const imported = (await db.query(`select i.legacy_id,t.id,t.number,t.created_by,t.assignee_id,t.status,t.version,t.closure_kind
      from public.support_import_items i join public.support_tickets t on t.id=i.ticket_id where i.spreadsheet_id=$1 and i.sheet_id=1388968269 order by i.legacy_id`,[sourceId])).rows;
    assert.equal(imported.length,8);
    const owner = imported[0].created_by;
    assert.ok(imported.every(t=>t.created_by===owner && t.assignee_id===adminId));
    assert.equal(imported.filter(t=>t.status==='waiting_validation').length,6);
    assert.equal(imported.filter(t=>t.status==='waiting_requester').length,1);
    assert.equal(imported.filter(t=>t.status==='closed' && t.closure_kind==='administrative').length,1);
    const ids = imported.map(t=>t.id);
    const files = (await db.query("select path,bytes,mime from public.support_attachments where ticket_id=any($1::uuid[]) and state='linked'",[ids])).rows;
    assert.equal(files.length,2);
    const storage = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
    for (const file of files) {
      const downloaded = await storage.storage.from('support-attachments').download(file.path);
      assert.equal(downloaded.error,null);
      const bytes = Buffer.from(await downloaded.data.arrayBuffer());
      assert.equal(bytes.length,file.bytes);
      const hash = crypto.createHash('sha256').update(bytes).digest('hex');
      assert.ok(expectedImages.some(i=>i.sha256===hash));
    }
    const unrelated = (await db.query(`select user_id from public.support_profiles where user_id<>$1 and user_id<>$2
      and public.support_user_active(user_id) and not public.support_user_manages(user_id,(select sector_id from public.support_tickets where id=$3)) limit 1`,[owner,adminId,ids[0]])).rows[0];
    assert.ok(unrelated);
    await identity(owner);
    assert.equal((await db.query('select count(*)::int as n from public.support_tickets where id=any($1::uuid[])',[ids])).rows[0].n,8);
    assert.equal((await db.query("select count(*)::int as n from public.support_messages where ticket_id=any($1::uuid[]) and visibility='internal'",[ids])).rows[0].n,0);
    assert.equal((await db.query('select count(*)::int as n from public.support_import_items')).rows[0].n,0);
    assert.equal((await db.query("select count(*)::int as n from public.support_action_requests where ticket_id=any($1::uuid[]) and state='open' and recipient_id=$2",[ids,owner])).rows[0].n,7);
    assert.equal((await db.query("select count(*)::int as n from public.support_attachments where ticket_id=any($1::uuid[])",[ids])).rows[0].n,2);
    assert.equal((await db.query("select count(*)::int as n from storage.objects where bucket_id='support-attachments' and name=any($1::text[])",[files.map(f=>f.path)])).rows[0].n,0);
    for (const [legacyId,action,payload,status] of [
      ['1','validate',{confirmed:true},'closed'],
      ['3','reject',{body:'Ensayo de verificación que será revertido: la prueba sigue fallando.'},'in_progress'],
      ['2','respond',{body:'Ensayo de verificación que será revertido: sucede al cargar movimientos.'},'in_progress']
    ]) {
      const t = imported.find(t=>t.legacy_id===legacyId);
      await db.query('select public.support_command($1,$2,$3,$4,$5)',[action,t.id,crypto.randomUUID(),t.version,JSON.stringify(payload)]);
      assert.equal((await db.query('select status from public.support_tickets where id=$1',[t.id])).rows[0].status,status);
    }
    await identity(adminId);
    assert.equal((await db.query('select count(*)::int as n from public.support_tickets where id=any($1::uuid[])',[ids])).rows[0].n,8);
    assert.equal((await db.query("select count(*)::int as n from public.support_messages where ticket_id=any($1::uuid[]) and visibility='internal'",[ids])).rows[0].n,7);
    assert.equal((await db.query('select count(*)::int as n from public.support_import_items where spreadsheet_id=$1',[sourceId])).rows[0].n,8);
    await identity(unrelated.user_id);
    assert.equal((await db.query('select count(*)::int as n from public.support_tickets where id=any($1::uuid[])',[ids])).rows[0].n,0);
    assert.equal((await db.query('select count(*)::int as n from public.support_attachments where ticket_id=any($1::uuid[])',[ids])).rows[0].n,0);
    console.log(JSON.stringify({result:'passed',tickets:8,originalImages:2,carolinaAccess:true,unrelatedUserBlocked:true,internalNotesPrivate:true,recipientCanValidateRejectAndRespond:true,testActions:'rolled back'}));
  } finally { await db.query('rollback').catch(()=>{}); await db.end(); }
}
run().catch(e=>{console.error('Import verification failed:',e.message);process.exitCode=1;});

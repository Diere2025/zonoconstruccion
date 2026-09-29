// Run periodically on a trusted host. Removes expired unpublished uploads only.
const {Client}=require('pg');const {createClient}=require('@supabase/supabase-js');
process.loadEnvFile('.env.local');
const db=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:10000});
(async()=>{
 await db.connect();
 const expired=await db.query("select id,path from public.support_attachments where state in ('reserved','ready') and expires_at<now() order by expires_at limit 200");
 if(!process.argv.includes('--apply')){console.log(JSON.stringify({expired:expired.rowCount,removed:0,dryRun:true}));return;}
 const storage=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
 let removed=0;
 for(const file of expired.rows){
   const result=await storage.storage.from('support-attachments').remove([file.path]);if(result.error)throw new Error('storage_cleanup_failed');
   const updated=await db.query("update public.support_attachments set state='rejected' where id=$1 and state<>'linked' and expires_at<now()",[file.id]);removed+=updated.rowCount;
 }
 console.log(JSON.stringify({expired:expired.rowCount,removed,dryRun:false}));
})().catch(e=>{console.error('Upload maintenance failed:',e.code||e.message);process.exitCode=1;}).finally(()=>db.end());

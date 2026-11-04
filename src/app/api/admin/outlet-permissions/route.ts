import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authenticateSystemAdministrator } from '@/lib/systemAdminAccess';
export const runtime='edge';
export const dynamic='force-dynamic';
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store',Vary:'Authorization'}});
async function authorize(request:Request){
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
 const auth=await authenticateSystemAdministrator(request,db);
 return {db,auth};
}
export async function GET(request:Request){try{
 const {db,auth}=await authorize(request);if(!auth.user)return json({error:auth.error},auth.status);
 const [people,grants]=await Promise.all([db.from('sellers').select('id,full_name,role,roles,is_active').is('archived_at',null).order('full_name'),db.from('outlet_managers').select('user_id,enabled')]);
 if(people.error||grants.error)return json({error:'No se pudieron cargar los permisos.'},503);
 return json({users:people.data.map(p=>({...p,inherited:p.role==='admin'||p.roles?.includes('admin'),enabled:grants.data.some(g=>g.user_id===p.id&&g.enabled)}))});
}catch{return json({error:'No se pudieron cargar los permisos.'},503);}}
export async function POST(request:Request){try{
 const {db,auth}=await authorize(request);if(!auth.user)return json({error:auth.error},auth.status);
 const body=await request.json();if(typeof body.userId!=='string'||typeof body.enabled!=='boolean')return json({error:'Revisá el usuario y el permiso.'},400);
 const person=await db.from('sellers').select('id,is_active,archived_at').eq('id',body.userId).maybeSingle();
 if(person.error||!person.data||person.data.archived_at||(body.enabled&&!person.data.is_active))return json({error:'Elegí un usuario activo.'},400);
 if(body.enabled){const account=await db.auth.admin.getUserById(person.data.id);if(account.error||!account.data.user)return json({error:'El usuario debe tener una cuenta de acceso vinculada.'},400);}
 const saved=await db.from('outlet_managers').upsert({user_id:person.data.id,enabled:body.enabled,granted_by:auth.user.id,granted_at:new Date().toISOString()});
 if(saved.error)return json({error:'No se pudo guardar el permiso.'},503);
 return json({enabled:body.enabled});
}catch{return json({error:'No se pudo guardar el permiso.'},503);}}

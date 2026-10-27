import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {authenticateSystemAdministrator} from '@/lib/systemAdminAccess';
import {reportImportAlerts} from '@/lib/importAlerts';
export const runtime='edge';
export async function POST(request:Request){
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
 const auth=await authenticateSystemAdministrator(request,db);if(!auth.user)return NextResponse.json({error:auth.error},{status:auth.status});
 try {const text=await request.text();if(text.length>60000)return NextResponse.json({error:'Reporte demasiado extenso.'},{status:413});const body=JSON.parse(text);
  if(!body.context||typeof body.context.source!=='string'||!Array.isArray(body.warnings)||body.warnings.length>50||body.warnings.some((w:unknown)=>typeof w!=='string'))return NextResponse.json({error:'Reporte inválido.'},{status:400});
  const result=await reportImportAlerts(db,auth.user.id,body.context,body.warnings);return NextResponse.json(result,{status:result.failed?503:200,headers:{'Cache-Control':'no-store'}});
 }catch{return NextResponse.json({error:'No se pudo registrar el aviso en Soporte TI. Conservá el registro de importación.'},{status:500});}
}

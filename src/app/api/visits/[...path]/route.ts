import { NextRequest } from 'next/server';
import { authorize, dbError, failure, json, storage } from '@/lib/visits/server';
import { integrationDb, processVisitJobs } from '@/lib/visits/integrations';
import { requireId, validateCommand, VisitsError } from '@/lib/visits/validation';
import { visitKitComponents } from '@/lib/visits/order';
export const runtime = 'edge';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ path: string[] }> };
export async function GET(request: NextRequest, context: Context) {
  try {
    const { db, me } = await authorize(request);
    const { path } = await context.params;
    if (path[0] === 'settings') { if (!me.administrator) throw new VisitsError('Solo administración puede configurar avisos.',403); const r = await integrationDb().from('visit_integration_settings').select('*').eq('id',true).single(); dbError(r.error); let service_email=''; try { service_email=JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '{}').client_email || ''; } catch {} const status=await integrationDb().from('visit_delivery_jobs').select('state,message').neq('state','done').order('created_at').limit(50);return json({...r.data,service_email,delivery_status:status.data || []}); }
    if (path[0] === 'session') { const localities=[];if(me.commercial)for(let from=0;;from+=1000){const r=await integrationDb().from('localities').select('id,name').eq('is_active',true).order('name').range(from,from+999);dbError(r.error);localities.push(...(r.data || []));if((r.data?.length || 0)<1000)break;}const extraRows=await integrationDb().from('products').select('id,name,price').in('name',['Adicionales Instalación Biofort','Terminación Instalación Biofort']);dbError(extraRows.error);const extra_products=['additional','termination'].map(code=>{const name=code==='additional'?'Adicionales Instalación Biofort':'Terminación Instalación Biofort',product=extraRows.data?.find(p=>p.name===name);return {code,name,product_id:product?.id || null,quantity:1,unit_price:product?.price ?? null,unit:code==='additional'?'metro':'unidad'};});return json({...me,localities,extra_products}); }
    if (path[0] === 'notifications') { const r = await db.rpc('visits_read_notifications'); dbError(r.error); return json(r.data); }
    if (path[0] === 'list') {
      const filter = Object.fromEntries(request.nextUrl.searchParams);
      const page = Number(filter.page || '0'); delete filter.page;
      if (!Number.isInteger(page) || page < 0) throw new VisitsError('La página no es válida.');
      const r = await db.rpc('visits_list', { p_filter: filter, p_page: page }); dbError(r.error); return json(r.data);
    }
    if (path[0] === 'agenda') {
      const from = request.nextUrl.searchParams.get('from') || new Date().toISOString().slice(0, 10);
      const to = request.nextUrl.searchParams.get('to') || from;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || !Number.isFinite(Date.parse(from)) || !Number.isFinite(Date.parse(to)) || to < from || Date.parse(to) - Date.parse(from) > 31 * 86400000) throw new VisitsError('Elegí un período de agenda de hasta 31 días.');
      const appointments = await db.from('visit_appointments').select('*').gte('date', from).lte('date', to).order('date').order('start_time').limit(1001); dbError(appointments.error);
      if ((appointments.data?.length || 0) > 1000) throw new VisitsError('Hay muchas citas. Elegí un período más corto.');
      const ids = [...new Set((appointments.data || []).map(a => a.case_id))];
      const cases = ids.length ? await db.from('visit_cases').select('*').in('id', ids) : { data: [], error: null }; dbError(cases.error);
      const slots = await db.from('visit_slots').select('*').gte('date',from).lte('date',to).order('date').limit(1001); dbError(slots.error); if ((slots.data?.length || 0)>1000) throw new VisitsError('Elegí un período más corto.');
      const pending = await db.rpc('visits_list',{p_filter:{view:'pending'},p_page:0}); dbError(pending.error);
      const candidates=pending.data?.visits || [];
      const upcoming=candidates.length ? await db.from('visit_appointments').select('case_id').in('case_id',candidates.map((c:{id:string})=>c.id)).in('status',['proposed','confirmed']) : {data:[],error:null}; dbError(upcoming.error);
      const planned=new Set((upcoming.data || []).map(a=>a.case_id));
      const tentative=await db.from('visit_cases').select('*').eq('outcome','pending').gte('requested_date',from).lte('requested_date',to).limit(1001);dbError(tentative.error);
      if((tentative.data?.length || 0)>1000)throw new VisitsError('Elegí un período más corto.');
      const tentativeIds=(tentative.data || []).map(c=>c.id);
      const coordinated=tentativeIds.length?await db.from('visit_appointments').select('case_id').in('case_id',tentativeIds):{data:[],error:null};dbError(coordinated.error);
      const coordinatedIds=new Set((coordinated.data || []).map(a=>a.case_id));
      return json({ appointments: appointments.data, visits: [...(cases.data || []),...(tentative.data || []).filter(c=>!coordinatedIds.has(c.id))],slots:slots.data,unplanned:candidates.filter((c:{id:string})=>!planned.has(c.id)) });
    }
    if (path[0] === 'order-draft' && path[1]) {
      if(!me.commercial)throw new VisitsError('Solo ventas puede convertir visitas en pedidos.',403);
      const id=requireId(path[1]),c=await db.from('visit_cases').select('*').eq('id',id).maybeSingle();dbError(c.error);if(!c.data)throw new VisitsError('La visita no existe.',404);
      const links=await db.from('visit_order_links').select('order_id,reference').eq('case_id',id);dbError(links.error);if(links.data?.length)throw new VisitsError('Esta visita ya tiene un pedido asociado. Abrí el pedido existente.',409);
      const q=await db.from('visit_quotes').select('*').eq('id',c.data.quote_id || '00000000-0000-0000-0000-000000000000').eq('status','accepted').maybeSingle();dbError(q.error);if(!q.data)throw new VisitsError('Primero registrá la aceptación del presupuesto vigente.',400);
      const commercial=await db.from('visit_commercial_data').select('whaticket_link').eq('case_id',id).maybeSingle();dbError(commercial.error);
      const products=[];for(let from=0;;from+=1000){const r=await db.from('products').select('*').order('name').range(from,from+999);dbError(r.error);products.push(...(r.data || []));if((r.data?.length || 0)<1000)break;}
      const settings=await db.from('site_settings').select('value').eq('id','visual_selector_tree').maybeSingle();dbError(settings.error);
      let tree=null;try{tree=typeof settings.data?.value==='string'?JSON.parse(settings.data.value):settings.data?.value;if(!Array.isArray(tree?.families))tree=null;}catch{tree=null;}
      return json({visit:c.data,quote:q.data,whaticket_link:commercial.data?.whaticket_link || '',products,kit_components:visitKitComponents(products,tree),prepared_for:me.id});
    }
    if (path[0] === 'orders') {
      if (!me.commercial) throw new VisitsError('Solo ventas puede vincular pedidos.', 403);
      const search = request.nextUrl.searchParams.get('search')?.trim() || '';
      if (search.length < 3 || search.length > 100) return json([]);
      const r = await db.from('orders').select('id,customer_name,total_amount,created_at').ilike('customer_name', `%${search.replace(/[%_]/g, '\\$&')}%`).order('created_at', { ascending: false }).limit(20); dbError(r.error); return json(r.data);
    }
    if (path[0] === 'case' && path.length === 2) {
      const id = requireId(path[1]);
      const c = await db.from('visit_cases').select('*').eq('id', id).maybeSingle(); dbError(c.error);
      if (!c.data) throw new VisitsError('La visita no existe o no tenés acceso.', 404);
      const rows = await Promise.all([
        db.from('visit_appointments').select('*').eq('case_id', id).order('date', { ascending: false }),
        db.from('visit_quotes').select('*').eq('case_id', id).order('number', { ascending: false }),
        db.from('visit_events').select('*').eq('case_id', id).order('created_at', { ascending: false }).order('id').limit(100),
        db.from('visit_order_links').select('*').eq('case_id', id),
        db.from('visit_attachments').select('*').eq('case_id', id).order('created_at', { ascending: false }),
      ]);
      rows.forEach(r => dbError(r.error));
      const attachments = rows[4].data || [];
      const signed = attachments.length ? await storage().createSignedUrls(attachments.map(a => a.path), 600) : null;
      if (signed?.error) throw new VisitsError('No se pudieron abrir los archivos adjuntos.', 503);
      const commercial=me.commercial?await db.from('visit_commercial_data').select('whaticket_link').eq('case_id',id).maybeSingle():{data:null,error:null};dbError(commercial.error);
      return json({ visit: c.data, commercial:commercial.data, appointments: rows[0].data, quotes: rows[1].data, events: rows[2].data, orders: rows[3].data, attachments: attachments.map((a, i) => ({ ...a, path: undefined, url: signed?.data?.[i]?.signedUrl || '' })) });
    }
    throw new VisitsError('La página no existe.', 404);
  } catch (error) { return failure(error); }
}
export async function POST(request: NextRequest, context: Context) {
  try {
    const { db, user, me, impersonation } = await authorize(request);
    const { path } = await context.params;
    if (path[0] === 'settings') {
      if (!me.administrator) throw new VisitsError('Solo administración puede configurar avisos.',403);
      const data=await request.json();const settings:Record<string,string>={};for(const field of ['public_url','telegram_chat_id','visits_calendar_id','installations_calendar_id']) { if(typeof data[field]!=='string' || data[field].length>500) throw new VisitsError('Configuración no válida.');settings[field]=data[field].trim(); }
      if(settings.public_url){const url=new URL(settings.public_url);if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash||url.hostname==='localhost'||url.hostname==='127.0.0.1')throw new VisitsError('Usá una URL pública del ERP para los enlaces.'); settings.public_url=url.origin;}
      if(settings.telegram_chat_id && !/^-?\d+$/.test(settings.telegram_chat_id))throw new VisitsError('Indicá el ID numérico del grupo de Telegram.');
      const fee=data.default_visit_fee===undefined?undefined:Number(data.default_visit_fee);if(fee!==undefined && (String(data.default_visit_fee).trim()==='' || !Number.isFinite(fee) || fee<0 || fee>100000000 || Math.abs(fee*100-Math.round(fee*100))>0.00001))throw new VisitsError('El valor de visita debe ser un importe válido con hasta dos decimales.');
      const r=await integrationDb().from('visit_integration_settings').update({...settings,...(fee===undefined?{}:{default_visit_fee:fee})}).eq('id',true);dbError(r.error);return json({ok:true});
    }
    if (path[0] === 'deliver') { if(!me.administrator)throw new VisitsError('Solo administración puede procesar todos los avisos.',403); return json(await processVisitJobs()); }
    if (path[0] === 'slot' || path[0] === 'slot-cancel') {
      const input=await request.json(); let id:string;
      if(path[0]==='slot') { id=requireId(input.key);requireId(input.data?.installer_id); if(input.data?.case_id)requireId(input.data.case_id); const r=await db.rpc('visits_save_slot',{p_key:id,p_data:input.data});dbError(r.error); }
      else {id=requireId(input.id);const r=await db.rpc('visits_cancel_slot',{p_id:id});dbError(r.error);}
      let delivery;try{delivery=await processVisitJobs(undefined,id);}catch{delivery={message:'Guardado. Avisos pendientes de entrega.'};}return json({id,delivery});
    }
    if (path[0] === 'read' && path[1]) { const r = await db.rpc('visits_mark_read', { p_case: requireId(path[1]) }); dbError(r.error); return json({ ok: true }); }
    if (path[0] === 'upload' && path[1]) {
      const id = requireId(path[1]);
      const c = await db.from('visit_cases').select('id').eq('id', id).maybeSingle(); dbError(c.error); if (!c.data) throw new VisitsError('No tenés acceso a esta visita.', 404);
      if (Number(request.headers.get('content-length') || 0) > 11000000) throw new VisitsError('El archivo supera los 10 MB.', 413);
      const form = await request.formData(), file = form.get('file');
      if (!(file instanceof File) || !file.size || file.size > 10485760) throw new VisitsError('Elegí un archivo de hasta 10 MB.');
      const extensions: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'application/pdf': 'pdf' };
      if (!extensions[file.type]) throw new VisitsError('Se admiten fotos PNG, JPG, WebP o documentos PDF.');
      const bytes = new Uint8Array(await file.arrayBuffer());
      const valid = file.type === 'image/png' ? bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71 : file.type === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 : file.type === 'image/webp' ? String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP' : String.fromCharCode(...bytes.slice(0, 5)) === '%PDF-';
      if (!valid) throw new VisitsError('El contenido no corresponde al tipo de archivo.');
      const key = requireId(form.get('key')), version = Number(form.get('version'));
      const objectPath = `${id}/${user.id}/${key}.${extensions[file.type]}`;
      const uploaded = await storage().upload(objectPath, bytes, { contentType: file.type, upsert: false });
      if (uploaded.error && !uploaded.error.message.toLowerCase().includes('already exists')) throw new VisitsError('No se pudo subir el archivo. Reintentá.', 503);
      const r = await db.rpc('visits_command', { p_command: 'attachment', p_case: id, p_key: key, p_version: version, p_data: { path: objectPath, name: file.name.slice(0, 250) } });
      // Keep a staged upload on conflict so an exact retry remains possible; it is private.
      dbError(r.error); return json(r.data);
    }
    if (path[0] !== 'command') throw new VisitsError('La acción no existe.', 404);
    const raw = await request.text(); if (raw.length > 45000) throw new VisitsError('Los datos son demasiado extensos.', 413);
    let input: { command: string; id: string | null; key: string; version: number; data: Record<string, unknown> };
    try { input = JSON.parse(raw); } catch { throw new VisitsError('Los datos no son válidos.'); }
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new VisitsError('Los datos no son válidos.');
    requireId(input.key); if (input.command !== 'create') { requireId(input.id); if (!Number.isInteger(input.version) || input.version < 1) throw new VisitsError('Actualizá la ficha antes de guardar.'); }
    if(!input.data || typeof input.data!=='object' || Array.isArray(input.data)) throw new VisitsError('Los datos no son válidos.');
    if(input.command==='create') input.data.seller_id=me.id;
    if(impersonation?.targetId===user.id) input.data._administrator_id=impersonation.administratorId;
    validateCommand(input.command, input.data);
    const r = await db.rpc('visits_command', { p_command: input.command, p_case: input.id || null, p_key: input.key, p_version: input.command === 'create' ? null : input.version, p_data: input.data }); dbError(r.error);
    let delivery;try{delivery=await processVisitJobs(r.data.id);}catch{delivery={message:'Guardado. Avisos pendientes de entrega.'};}
    return json({...r.data,delivery});
  } catch (error) { return failure(error); }
}

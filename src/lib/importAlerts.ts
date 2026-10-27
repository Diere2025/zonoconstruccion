export type ImportAlertContext = {
  source: string; sourceUrl?: string; batch?: string; runId?: string;
  codes?: string[]; rows?: Array<{code:string; status:string}>;
  options?: Record<string, unknown>; order?: Record<string, unknown>;
};
export function isImportWarning(message:string) {
  return /⚠|❌|advertencia/i.test(message) && !/ya existe en el sistema.*inserción duplicada/i.test(message);
}
export function importAlertDetails(message:string, context:ImportAlertContext) {
  const warning=message.replace(/^\[[^\]]+\]\s*/, '').replace(/^(?:\s*↳\s*|\s*⚠️?\s*)+/, '').trim().slice(0,2000);
  const code=warning.match(/pedido\s+([A-Z][A-Z0-9_-]*(?:\s*\/\s*[A-Z][A-Z0-9_-]*)?)/i)?.[1] || '';
  const kind=/fila parcial/i.test(warning)?'Fila parcial de pedido agrupado':/sin artículos válidos/i.test(warning)?'Detalle de artículos incompleto':/❌|error|no se pudo|no pudo|microcorte/i.test(warning)?'Error de importación':'Advertencia de importación';
  let sourceUrl='';
  try {const u=new URL(context.sourceUrl||'');if(u.hostname==='docs.google.com'&&/^\/spreadsheets\/d\/[\w-]+/.test(u.pathname)){sourceUrl='https://docs.google.com'+u.pathname.split('/').slice(0,4).join('/')+'/edit';const gid=u.searchParams.get('gid')||u.hash.match(/gid=(\d+)/)?.[1];if(gid&&/^\d+$/.test(gid))sourceUrl+='#gid='+gid;}}catch{}
  return {warning,kind,code,source:String(context.source||'Importación').replace(/\s*\((?:Lote|Unitario).*$/i,'').slice(0,160),sourceUrl,
    batch:String(context.batch||'').slice(0,160),runId:String(context.runId||'').slice(0,100),codes:(context.codes||[]).slice(0,30).map(c=>String(c).slice(0,160)),
    rows:(context.rows||[]).slice(0,30).map(r=>({code:String(r.code).slice(0,160),status:String(r.status).slice(0,40)})),
    options:context.options||{},order:context.order||null};
}
export async function reportImportAlerts(db:any, actor:string|null, context:ImportAlertContext, warnings:string[]) {
  const tickets:Array<{id:string;number:string;reused:boolean}>=[],failures:string[]=[];
  for(const message of [...new Set(warnings.filter(isImportWarning))]) {
    try {const {data,error}=await db.rpc('support_report_import_alert',{p_actor:actor,p_details:importAlertDetails(message,context)});if(error)throw error;
      if(!data?.id)throw new Error('Respuesta de incidencias incompleta');tickets.push(data);
    }catch{failures.push(message);}
  }
  return {tickets,failed:failures.length};
}

import { createClient } from '@supabase/supabase-js';
import { OperationError } from './validation';

export async function financialContext(request: Request, write = false) {
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new OperationError('La sesión venció. Volvé a ingresar.',401);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) throw new OperationError('Finanzas no está configurado en el servidor.',503);
  const db = createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error} = await db.auth.getUser(token);
  if (error && (error.name === 'AuthRetryableFetchError' || error.status === 429 || (error.status || 0) >= 500)) throw new OperationError('No se pudo conectar al servicio de acceso.',503);
  if (error || !user) throw new OperationError('La sesión venció. Volvé a ingresar.',401);
  const permission = await db.rpc(write ? 'can_manage_financial_operations' : 'can_manage_treasury_settlements',{p_user_id:user.id});
  if (permission.error) throw permission.error;
  if (!permission.data) throw new OperationError('No tenés permisos para esta operación financiera.',403);
  return {db,actor:user.id};
}

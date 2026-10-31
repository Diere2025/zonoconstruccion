import { createClient } from '@supabase/supabase-js';
import { requireFinanceAdmin } from '@/lib/financeAdminAccess';
import { OperationError } from '@/lib/financialOperations/validation';

export async function supplierAccountContext(request:Request) {
 const denied=await requireFinanceAdmin(request);
 if(denied)throw new OperationError(denied.error,denied.status);
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
 const token=request.headers.get('authorization')!.replace(/^Bearer\s+/i,'');
 const {data:{user},error}=await db.auth.getUser(token);
 if(error||!user)throw new OperationError('La sesión venció.',401);
 return {db,actor:user.id};
}

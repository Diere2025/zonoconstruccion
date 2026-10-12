import {NextResponse} from 'next/server';
import {financialContext} from '@/lib/financialOperations/server';
import {dailyBalances,calendarDays,type DailyAccount,type DailyMovement} from '@/lib/accountDailyBalances/model';
export const runtime='edge';export const dynamic='force-dynamic';
export async function GET(request:Request){try{
 const {db}=await financialContext(request),params=new URL(request.url).searchParams,from=params.get('from')||'',to=params.get('to')||'';calendarDays(from,to);
 const accounts=await db.from('financial_accounts').select('id,name,currency,is_active').order('name').order('id');if(accounts.error)throw accounts.error;
 const movements:DailyMovement[]=[];
 for(let offset=0;;offset+=1000){const page=await db.from('cash_transactions').select('id,financial_account_id,currency,created_at,type,amount').lte('created_at',to+'T23:59:59.999999-03:00').order('created_at').order('id').range(offset,offset+999);if(page.error)throw page.error;movements.push(...(page.data||[]));if(!page.data||page.data.length<1000)break;}
 return NextResponse.json(dailyBalances(accounts.data as DailyAccount[],movements,from,to),{headers:{'Cache-Control':'no-store'}});
}catch(cause){const e=cause as {message?:string;status?:number};return NextResponse.json({error:e.message||'No se pudieron consultar los saldos diarios.'},{status:e.status||400,headers:{'Cache-Control':'no-store'}});}}

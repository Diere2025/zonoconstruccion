import {movementClassifications} from '@/lib/financialClassification/server';
import {movementApplications} from '@/lib/financialOperations/referenceServer';
export const runtime = 'edge';
export const dynamic = 'force-dynamic';
import { compareTreasuryTransactions } from '@/lib/treasuryTransactionTime';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { fetchSpreadsheetCsv } from '@/lib/googleSheets';
import { financialContext } from '@/lib/financialOperations/server';
import { OperationError } from '@/lib/financialOperations/validation';
import {supplierFrequencyWindow,withSupplierFrequency} from '@/lib/financialOperations/supplierFrequency';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ckvbyfgsbjbfaqotmeld.supabase.co';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.dummy';

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

type CashTransactionRow = {
  id: string;
  created_at: string;
  registered_at?: string;
  financial_account_id: string | null;
  amount: number | string | null;
  type: string;
  [key: string]: unknown;
};

async function financialOperationsAvailable() {
  const result=await supabaseAdmin.from('cash_transactions').select('operation_id').limit(1);
  if(!result.error)return true;
  if(['42703','PGRST204'].includes(result.error.code) && /operation_id/i.test(result.error.message))return false;
  throw result.error;
}

async function completeList(query:{range:(start:number,end:number)=>PromiseLike<{data:any[]|null;error:unknown}>}){
  const rows:any[]=[];
  for(let offset=0;;offset+=500){
    const result=await query.range(offset,offset+499);
    if(result.error)throw result.error;
    rows.push(...(result.data || []));
    if(!result.data || result.data.length<500)return {data:rows,error:null};
  }
}
async function custodyAccounts(accounts:any[]){
  const result=await supabaseAdmin.from('financial_custody_funds').select('account_id,custodian').eq('status','open').order('id');
  if(result.error){if(['42P01','PGRST205'].includes(result.error.code)&&/financial_custody_funds/.test(result.error.message))return accounts;throw result.error;}
  const custody=new Map((result.data||[]).map(f=>[f.account_id,f.custodian]));
  return accounts.map(a=>({...a,is_custody:custody.has(a.id),custodian:custody.get(a.id)}));
}

export async function GET(request: Request) {
  try {
    await financialContext(request);
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'init';

    if (action === 'init') {
      const recent=supplierFrequencyWindow();
      // Load only the lists needed to open Finanzas. Validations load on their own tab.
      // NOTE: Pending orders are NOT loaded in bulk here to avoid slow payload. They are searched dynamically (min 3 chars).
      const [
        employeesRes,
        suppliersRes,
        purchasesRes,
        routeSheetsRes,
        accountsRes,
        costCentersRes,
        peopleRes,
        supplierPaymentsRes
      ] = await Promise.all([
        completeList(supabaseAdmin.from('employees').select('id,full_name,cuit,role,base_salary,is_active').eq('is_active', true).order('full_name').order('id')),
        completeList(supabaseAdmin.from('suppliers').select('id,name').order('name').order('id')),
        completeList(supabaseAdmin.from('supplier_purchases').select('id,supplier_id,invoice_number,total_amount,paid_amount,credit_applied_amount,status,currency,supplier:suppliers(name),created_at,purchase_date,document_type,purchase_order_id,purchase_reception_id,purchase_orders(oc_code),purchase_receptions!supplier_purchases_purchase_reception_id_fkey(delivery_slip_number,reception_date,purchase_orders!purchase_receptions_purchase_order_id_fkey(oc_code),purchase_reception_orders(purchase_orders(oc_code)))').neq('status', 'Pagado').neq('status', 'Anulado').order('purchase_date', { ascending: false }).order('id')),
        supabaseAdmin.from('route_sheets').select('*, carriers(name)').order('delivery_date', { ascending: false }).limit(200),
        supabaseAdmin.rpc('get_financial_accounts_balances'),
        supabaseAdmin.from('cost_centers').select('id,name,code,is_active').eq('is_active', true).order('name'),
        completeList(supabaseAdmin.from('financial_people').select('id,full_name,kinds,employee_id,financial_people_concepts(concept_id)').eq('is_active',true).order('full_name').order('id')),
        completeList(supabaseAdmin.from('supplier_payments').select('supplier_id,created_at').is('reversed_at',null).gte('created_at',recent.start).lte('created_at',recent.end).order('id')).catch(()=>({data:null,error:true}))
      ]);

      if (employeesRes.error) throw employeesRes.error;
      if (suppliersRes.error) throw suppliersRes.error;
      if (purchasesRes.error) throw purchasesRes.error;
      if (routeSheetsRes.error) throw routeSheetsRes.error;
      if (accountsRes.error) throw accountsRes.error;
      if (costCentersRes.error) throw costCentersRes.error;
      if (peopleRes.error) throw peopleRes.error;
      const scopeRows=await completeList(supabaseAdmin.from('supplier_document_account_scope').select('id,account_included').order('id'));
      const scope=new Map(scopeRows.data.map(row=>[row.id,row.account_included]));

      return NextResponse.json({
        employees: (employeesRes.data || []).map(e=>({...e,person_id:peopleRes.data.find(p=>p.employee_id===e.id)?.id})),
        people:peopleRes.data,
        suppliers: supplierPaymentsRes.data?withSupplierFrequency(suppliersRes.data||[],supplierPaymentsRes.data):suppliersRes.data||[],
        pendingPurchases: (purchasesRes.data || []).map(p=>({...p,account_included:scope.get(p.id)===true})),
        pendingOrders: [],
        routeSheets: routeSheetsRes.data || [],
        financialAccounts: await custodyAccounts(accountsRes.data || []),
        costCenters: costCentersRes.data || []
      });
    }

    if (action === 'search-pending-orders' || action === 'search-collection-orders') {
      const q = (searchParams.get('q') || '').trim();
      if (!q || q.length < 3) {
        return NextResponse.json({ pendingOrders: [] });
      }

      const cleanQ = q.replace(/[%_,\.()]/g, ' ').trim();
      if (cleanQ.length < 3) {
        return NextResponse.json({ pendingOrders: [] });
      }

      const operationsAvailable=action==='search-collection-orders'?await financialOperationsAvailable():false;
      let query = supabaseAdmin
        .from('orders')
        .select(`*, clients(business_name),client_payments(id,amount,currency,status,cash_transaction_id${operationsAvailable?',reversed_at':''})`)
        .neq('status', 'Cancelado')
        .or(`legacy_code.ilike.%${cleanQ}%,customer_name.ilike.%${cleanQ}%`)
        .order('order_date', { ascending: false })
        .limit(30);
      if(action==='search-pending-orders')query=query.neq('payment_status','Abonado');
      const {data,error}=await query;

      if (error) throw error;
      const clients=action==='search-collection-orders'?await supabaseAdmin.from('clients').select('id,business_name').ilike('business_name',`%${cleanQ}%`).order('business_name').limit(30):{data:[],error:null};
      if(clients.error)throw clients.error;
      return NextResponse.json({ pendingOrders: data || [],clients:clients.data || [] });
    }

    if (action === 'accounts') {
      const { data, error } = await supabaseAdmin.rpc('get_financial_accounts_balances');
      if (error) throw error;

      return NextResponse.json({ financialAccounts: await custodyAccounts(data || []) });
    }

    if (action === 'transactions') {
      const endDate = searchParams.get('endDate') || new Date().toISOString().split('T')[0];
      const startDate = searchParams.get('startDate') || '';
      const startIso = startDate ? `${startDate}T00:00:00.000-03:00` : '';
      const endIso = `${endDate}T23:59:59.999-03:00`;

      const accountBalances: Record<string, number> = {};

      // 1. If startDate is provided, get exact initial balance of each account prior to startDate via optimized RPC
      if (startIso) {
        const { data: priorBalances, error: rpcErr } = await supabaseAdmin
          .rpc('get_account_balances_prior_to', { cutoff_date: startIso });
        // A failed opening balance must not be presented as a zero balance.
        if (rpcErr) throw rpcErr;
        if (!Array.isArray(priorBalances)) throw new Error('No se pudo obtener el saldo inicial.');
        priorBalances.forEach((r: any) => {
          accountBalances[r.account_id] = Number(r.balance) || 0;
        });
      }

      // 2. Query transactions directly filtered by date range on the database.
      // Supabase/PostgREST returns at most 1000 rows per request, even when a
      // larger limit is requested. Fetch the selected period in pages so newer
      // movements are not silently omitted after the first 1000 records.
      const pageSize = 1000;
      const allData: CashTransactionRow[] = [];
      let operationsAvailable=await financialOperationsAvailable();

      for (let from = 0; ; from += pageSize) {
        let query = supabaseAdmin
          .from('cash_transactions')
          .select(`
            *,
            ${operationsAvailable?'financial_operations(id,operation_type,version,status,detail,operation_vouchers(voucher_id)),':''}
            payment_planning_realizations(id,item_id,reversed_at),
            financial_accounts(name, type),
            cost_centers(name, code),
            employees(full_name),
            route_sheets!cash_transactions_route_sheet_id_fkey(
              id,
              delivery_date,
              run_number,
              carriers(name)
            ),
            client_payments(
              ${operationsAvailable?'reversed_at,':''}
              id,
              order_id,
              amount,
              orders(
                id,
                legacy_code,
                customer_name
              )
            ),
            supplier_payments(
              ${operationsAvailable?'reversed_at,':''}
              id,
              purchase_id,
              amount,
              supplier_purchases!supplier_payments_purchase_id_fkey(
                id,
                invoice_number
              ),
              suppliers(
                id,
                name
              )
            )
          `)
          .lte('created_at', endIso)
          .order('created_at', { ascending: true })
          .order('id', { ascending: true })
          .range(from, from + pageSize - 1);

        if (startIso) {
          query = query.gte('created_at', startIso);
        }

        const { data, error } = await query;
        if(error && from===0 && operationsAvailable && error.code==='PGRST200' && /financial_operations/.test(error.message)){
          operationsAvailable=false;from-=pageSize;continue;
        }
        if (error) throw error;

        const page = (data || []) as unknown as CashTransactionRow[];
        allData.push(...page);

        if (page.length < pageSize) break;
      }

      const ids = allData.map(t=>t.id);
      const [applications,classifications] = await Promise.all([
        operationsAvailable ? movementApplications(supabaseAdmin,allData) : Promise.resolve(new Map()),
        movementClassifications(supabaseAdmin,ids)
      ]);
      // 3. Compute running balance
      const txsWithRunningBalance = allData.sort(compareTreasuryTransactions).map(t => {
        const accId = t.financial_account_id || 'cash_register';
        const amt = Number(t.amount) || 0;
        if (!accountBalances[accId]) accountBalances[accId] = 0;

        if (t.type === 'ingreso') {
          accountBalances[accId] += amt;
        } else {
          accountBalances[accId] -= amt;
        }

        return {
          ...t,
          applications:applications.get(t.id)||[],
          client_payments: Array.isArray(t.client_payments) ? t.client_payments.filter((p: {reversed_at?:string|null})=>!p.reversed_at) : [],
          supplier_payments: Array.isArray(t.supplier_payments) ? t.supplier_payments.filter((p: {reversed_at?:string|null})=>!p.reversed_at) : [],
          running_balance: accountBalances[accId]
        };
      });

      for(const t of txsWithRunningBalance)Object.assign(t,{classification:classifications.get(t.id)||null});
      // Reverse to display newest first
      txsWithRunningBalance.reverse();

      return NextResponse.json({ transactions: txsWithRunningBalance,features:{financialOperations:operationsAvailable} });
    }

    if (action === 'balances') {
      const operationsAvailable=await financialOperationsAvailable();
      const clientPaymentQuery=supabaseAdmin.from('client_payments').select('client_id, amount, currency').eq('status','Aprobado');
      // Fetch clients, orders, payments, suppliers, purchases, and supplier payments in parallel
      const [
        clientsRes,
        ordersRes,
        clientPaymentsRes,
      ] = await Promise.all([
        supabaseAdmin.from('clients').select('id, business_name'),
        supabaseAdmin.from('orders').select('client_id, total_amount, status'),
        operationsAvailable?clientPaymentQuery.is('reversed_at',null):clientPaymentQuery,
      ]);

      if (clientsRes.error) throw clientsRes.error;
      if (ordersRes.error) throw ordersRes.error;
      if (clientPaymentsRes.error) throw clientPaymentsRes.error;

      // Compute client balances
      const clsMap: Record<string, any> = {};
      (clientsRes.data || []).forEach(c => {
        clsMap[c.id] = {
          id: c.id,
          full_name: c.business_name || '',
          business_name: c.business_name,
          total_orders_ars: 0,
          total_payments_ars: 0,
          balance_ars: 0,
          total_orders_usd: 0,
          total_payments_usd: 0,
          balance_usd: 0
        };
      });

      (ordersRes.data || []).forEach(o => {
        if (o.client_id && o.status !== 'Cancelado' && clsMap[o.client_id]) {
          const amt = Number(o.total_amount) || 0;
          clsMap[o.client_id].total_orders_ars += amt;
        }
      });

      (clientPaymentsRes.data || []).forEach(p => {
        if (p.client_id && clsMap[p.client_id]) {
          const amt = Number(p.amount) || 0;
          if (p.currency === 'USD') {
            clsMap[p.client_id].total_payments_usd += amt;
          } else {
            clsMap[p.client_id].total_payments_ars += amt;
          }
        }
      });

      Object.keys(clsMap).forEach(id => {
        clsMap[id].balance_ars = clsMap[id].total_orders_ars - clsMap[id].total_payments_ars;
        clsMap[id].balance_usd = clsMap[id].total_orders_usd - clsMap[id].total_payments_usd;
      });

      const clientsBalances = Object.values(clsMap).filter(c =>
        c.total_orders_ars > 0 || c.total_payments_ars > 0 || c.total_orders_usd > 0 || c.total_payments_usd > 0
      );


      // The same database projection used by the supplier account extract includes
      // opening balances and explicit historical inclusion/exclusion decisions.
      const supplierSummary = await completeList(supabaseAdmin.rpc('get_supplier_account_balances'));
      const suppliersBalances = supplierSummary.data.map(s => ({ ...s,
        coverage: s.start_date ? 'configured' : 'missing_opening' }));

      return NextResponse.json({ clientsBalances, suppliersBalances });
    }

    if (action === 'validations') {
      const { data, error } = await supabaseAdmin
        .from('orders')
        .select('*, clients(business_name), payment_methods(name)')
        .eq('payment_approved', false)
        .neq('status', 'Cancelado')
        .order('order_date', { ascending: false });

      if (error) throw error;
      const filtered = (data || []).filter((o: any) => {
        const hasDeposit = o.totals?.has_deposit;
        const pmName = o.payment_methods?.name || '';
        const isCash = /efectivo|^contado$/i.test(pmName || "");
        return hasDeposit || !isCash;
      });

      return NextResponse.json({ validationOrders: filtered });
    }

    if (action === 'fetch-sheet') {
      const sheetUrl = searchParams.get('url');
      if (!sheetUrl) {
        return NextResponse.json({ error: 'URL requerida' }, { status: 400 });
      }

      const csv = await fetchSpreadsheetCsv(sheetUrl);
      return NextResponse.json({ success: true, csv });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

  } catch (error: any) {
    if(error instanceof OperationError) return NextResponse.json({error:error.message},{status:error.status});
    console.error('[API Finanzas Data] Error:', error);
    const unavailable = /fetch failed|timeout|ECONN/i.test(String(error?.message || error));
    return NextResponse.json(
      { error: unavailable ? 'La base de datos no responde temporalmente.' : error.message || String(error) },
      { status: unavailable ? 503 : 500 }
    );
  }
}

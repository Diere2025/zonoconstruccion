export const runtime = 'edge';
export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { fetchSpreadsheetCsv } from '@/lib/googleSheets';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ckvbyfgsbjbfaqotmeld.supabase.co';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.dummy';

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

type CashTransactionRow = {
  financial_account_id: string | null;
  amount: number | string | null;
  type: string;
  [key: string]: unknown;
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'init';

    if (action === 'init') {
      // Load only the lists needed to open Finanzas. Validations load on their own tab.
      // NOTE: Pending orders are NOT loaded in bulk here to avoid slow payload. They are searched dynamically (min 3 chars).
      const [
        employeesRes,
        suppliersRes,
        purchasesRes,
        routeSheetsRes,
        accountsRes,
        costCentersRes
      ] = await Promise.all([
        supabaseAdmin.from('employees').select('id,full_name,cuit,role,base_salary,is_active').eq('is_active', true).order('full_name'),
        supabaseAdmin.from('suppliers').select('id,name').order('name'),
        supabaseAdmin.from('supplier_purchases').select('id,supplier_id,invoice_number,total_amount,paid_amount,status,supplier:suppliers(name)').neq('status', 'Pagado').neq('status', 'Anulado').order('purchase_date', { ascending: false }),
        supabaseAdmin.from('route_sheets').select('*, carriers(name)').order('delivery_date', { ascending: false }).limit(200),
        supabaseAdmin.rpc('get_financial_accounts_balances'),
        supabaseAdmin.from('cost_centers').select('id,name,code,is_active').eq('is_active', true).order('name')
      ]);

      if (employeesRes.error) throw employeesRes.error;
      if (suppliersRes.error) throw suppliersRes.error;
      if (purchasesRes.error) throw purchasesRes.error;
      if (routeSheetsRes.error) throw routeSheetsRes.error;
      if (accountsRes.error) throw accountsRes.error;
      if (costCentersRes.error) throw costCentersRes.error;

      return NextResponse.json({
        employees: employeesRes.data || [],
        suppliers: suppliersRes.data || [],
        pendingPurchases: purchasesRes.data || [],
        pendingOrders: [],
        routeSheets: routeSheetsRes.data || [],
        financialAccounts: accountsRes.data || [],
        costCenters: costCentersRes.data || []
      });
    }

    if (action === 'search-pending-orders') {
      const q = (searchParams.get('q') || '').trim();
      if (!q || q.length < 3) {
        return NextResponse.json({ pendingOrders: [] });
      }

      const cleanQ = q.replace(/[%_,\.()]/g, ' ').trim();
      if (cleanQ.length < 3) {
        return NextResponse.json({ pendingOrders: [] });
      }

      const { data, error } = await supabaseAdmin
        .from('orders')
        .select('*, clients(business_name)')
        .neq('payment_status', 'Abonado')
        .neq('status', 'Cancelado')
        .or(`legacy_code.ilike.%${cleanQ}%,customer_name.ilike.%${cleanQ}%`)
        .order('order_date', { ascending: false })
        .limit(30);

      if (error) throw error;
      return NextResponse.json({ pendingOrders: data || [] });
    }

    if (action === 'accounts') {
      const { data, error } = await supabaseAdmin.rpc('get_financial_accounts_balances');
      if (error) throw error;

      return NextResponse.json({ financialAccounts: data || [] });
    }

    if (action === 'transactions') {
      const endDate = searchParams.get('endDate') || new Date().toISOString().split('T')[0];
      const startDate = searchParams.get('startDate') || '';
      const startIso = startDate ? `${startDate}T00:00:00.000Z` : '';
      const endIso = `${endDate}T23:59:59.999Z`;

      const accountBalances: Record<string, number> = {};

      // 1. If startDate is provided, get exact initial balance of each account prior to startDate via optimized RPC
      if (startIso) {
        try {
          const { data: priorBalances, error: rpcErr } = await supabaseAdmin
            .rpc('get_account_balances_prior_to', { cutoff_date: startIso });
          if (!rpcErr && Array.isArray(priorBalances)) {
            priorBalances.forEach((r: any) => {
              accountBalances[r.account_id] = Number(r.balance) || 0;
            });
          }
        } catch (e) {
          console.error("Error fetching prior balances:", e);
        }
      }

      // 2. Query transactions directly filtered by date range on the database.
      // Supabase/PostgREST returns at most 1000 rows per request, even when a
      // larger limit is requested. Fetch the selected period in pages so newer
      // movements are not silently omitted after the first 1000 records.
      const pageSize = 1000;
      const allData: CashTransactionRow[] = [];

      for (let from = 0; ; from += pageSize) {
        let query = supabaseAdmin
          .from('cash_transactions')
          .select(`
            *,
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
              id,
              purchase_id,
              amount,
              supplier_purchases(
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
        if (error) throw error;

        const page = data || [];
        allData.push(...page);

        if (page.length < pageSize) break;
      }

      // 3. Compute running balance
      const txsWithRunningBalance = allData.map(t => {
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
          running_balance: accountBalances[accId]
        };
      });

      // Reverse to display newest first
      txsWithRunningBalance.reverse();

      return NextResponse.json({ transactions: txsWithRunningBalance });
    }

    if (action === 'balances') {
      // Fetch clients, orders, payments, suppliers, purchases, and supplier payments in parallel
      const [
        clientsRes,
        ordersRes,
        clientPaymentsRes,
        suppliersRes,
        supplierPurchasesRes,
        supplierPaymentsRes
      ] = await Promise.all([
        supabaseAdmin.from('clients').select('id, business_name'),
        supabaseAdmin.from('orders').select('client_id, total_amount, status'),
        supabaseAdmin.from('client_payments').select('client_id, amount, currency'),
        supabaseAdmin.from('suppliers').select('id, name'),
        supabaseAdmin.from('supplier_purchases').select('supplier_id, total_amount, status, currency, document_type'),
        supabaseAdmin.from('supplier_payments').select('supplier_id, amount, currency')
      ]);

      if (clientsRes.error) throw clientsRes.error;
      if (ordersRes.error) throw ordersRes.error;
      if (clientPaymentsRes.error) throw clientPaymentsRes.error;
      if (suppliersRes.error) throw suppliersRes.error;
      if (supplierPurchasesRes.error) throw supplierPurchasesRes.error;
      if (supplierPaymentsRes.error) throw supplierPaymentsRes.error;

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

      // Compute supplier balances
      const supsMap: Record<string, any> = {};
      (suppliersRes.data || []).forEach(s => {
        supsMap[s.id] = {
          id: s.id,
          name: s.name,
          total_purchases_ars: 0,
          total_payments_ars: 0,
          balance_ars: 0,
          total_purchases_usd: 0,
          total_payments_usd: 0,
          balance_usd: 0
        };
      });

      (supplierPurchasesRes.data || []).forEach(p => {
        if (p.supplier_id && p.status !== 'Anulado' && supsMap[p.supplier_id]) {
          const isCreditNote = p.document_type === 'Nota de Crédito';
          const amt = (Number(p.total_amount) || 0) * (isCreditNote ? -1 : 1);
          if (p.currency === 'USD') {
            supsMap[p.supplier_id].total_purchases_usd += amt;
          } else {
            supsMap[p.supplier_id].total_purchases_ars += amt;
          }
        }
      });

      (supplierPaymentsRes.data || []).forEach(p => {
        if (p.supplier_id && supsMap[p.supplier_id]) {
          const amt = Number(p.amount) || 0;
          if (p.currency === 'USD') {
            supsMap[p.supplier_id].total_payments_usd += amt;
          } else {
            supsMap[p.supplier_id].total_payments_ars += amt;
          }
        }
      });

      Object.keys(supsMap).forEach(id => {
        supsMap[id].balance_ars = supsMap[id].total_purchases_ars - supsMap[id].total_payments_ars;
        supsMap[id].balance_usd = supsMap[id].total_purchases_usd - supsMap[id].total_payments_usd;
      });

      const suppliersBalances = Object.values(supsMap).filter(s =>
        s.total_purchases_ars > 0 || s.total_payments_ars > 0 || s.total_purchases_usd > 0 || s.total_payments_usd > 0
      );

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
        const isCash = pmName.toLowerCase().includes('efectivo');
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
    console.error('[API Finanzas Data] Error:', error);
    const unavailable = /fetch failed|timeout|ECONN/i.test(String(error?.message || error));
    return NextResponse.json(
      { error: unavailable ? 'La base de datos no responde temporalmente.' : error.message || String(error) },
      { status: unavailable ? 503 : 500 }
    );
  }
}

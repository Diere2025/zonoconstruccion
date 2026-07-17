import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'init';

    if (action === 'init') {
      // Load helper lists, financial accounts, cost centers, and validation orders in parallel
      const [
        employeesRes,
        suppliersRes,
        purchasesRes,
        ordersRes,
        routeSheetsRes,
        accountsRes,
        costCentersRes,
        validationOrdersRes
      ] = await Promise.all([
        supabaseAdmin.from('employees').select('*').eq('is_active', true).order('full_name'),
        supabaseAdmin.from('suppliers').select('*').order('name'),
        supabaseAdmin.from('supplier_purchases').select('*, supplier:suppliers(name)').neq('status', 'Pagado').neq('status', 'Anulado').order('purchase_date', { ascending: false }),
        supabaseAdmin.from('orders').select('*, clients(business_name)').neq('payment_status', 'Abonado').neq('status', 'Cancelado').order('order_date', { ascending: false }),
        supabaseAdmin.from('route_sheets').select('*, carriers(name)').order('delivery_date', { ascending: false }).limit(200),
        supabaseAdmin.rpc('get_financial_accounts_balances'),
        supabaseAdmin.from('cost_centers').select('*').eq('is_active', true).order('name'),
        supabaseAdmin.from('orders').select('*, clients(business_name), payment_methods(name)').eq('payment_approved', false).neq('status', 'Cancelado').order('order_date', { ascending: false })
      ]);

      if (employeesRes.error) throw employeesRes.error;
      if (suppliersRes.error) throw suppliersRes.error;
      if (purchasesRes.error) throw purchasesRes.error;
      if (ordersRes.error) throw ordersRes.error;
      if (routeSheetsRes.error) throw routeSheetsRes.error;
      if (accountsRes.error) throw accountsRes.error;
      if (costCentersRes.error) throw costCentersRes.error;
      if (validationOrdersRes.error) throw validationOrdersRes.error;

      // Filter validation orders with digital payment on server
      const filteredValidationOrders = (validationOrdersRes.data || []).filter((o: any) => {
        const hasDeposit = o.totals?.has_deposit;
        const pmName = o.payment_methods?.name || '';
        const isCash = pmName.toLowerCase().includes('efectivo');
        return hasDeposit || !isCash;
      });

      return NextResponse.json({
        employees: employeesRes.data || [],
        suppliers: suppliersRes.data || [],
        pendingPurchases: purchasesRes.data || [],
        pendingOrders: ordersRes.data || [],
        routeSheets: routeSheetsRes.data || [],
        financialAccounts: accountsRes.data || [],
        costCenters: costCentersRes.data || [],
        validationOrders: filteredValidationOrders
      });
    }

    if (action === 'transactions') {
      const endDate = searchParams.get('endDate') || new Date().toISOString().split('T')[0];
      const startDate = searchParams.get('startDate') || '';

      let allData: any[] = [];
      let page = 0;
      const pageSize = 2000;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabaseAdmin
          .from('cash_transactions')
          .select(`
            *,
            financial_accounts(name, type),
            cost_centers(name, code),
            employees(full_name),
            route_sheets(
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
          .lte('created_at', `${endDate}T23:59:59.999Z`)
          .order('created_at', { ascending: true })
          .range(page * pageSize, (page + 1) * pageSize - 1);

        if (error) throw error;
        if (data && data.length > 0) {
          allData = [...allData, ...data];
          if (data.length < pageSize) {
            hasMore = false;
          } else {
            page++;
          }
        } else {
          hasMore = false;
        }
      }

      // Compute running balance
      const accountBalances: Record<string, number> = {};
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

      // Filter by startDate on server if provided
      let result = txsWithRunningBalance;
      if (startDate) {
        const startLimit = new Date(`${startDate}T00:00:00.000Z`).getTime();
        result = result.filter(t => new Date(t.created_at).getTime() >= startLimit);
      }

      // Reverse to display newest first
      result.reverse();

      return NextResponse.json({ transactions: result });
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
        supabaseAdmin.from('orders').select('client_id, total_amount, status, currency'),
        supabaseAdmin.from('client_payments').select('client_id, amount, currency'),
        supabaseAdmin.from('suppliers').select('id, name'),
        supabaseAdmin.from('supplier_purchases').select('supplier_id, total_amount, status, currency'),
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
          if (o.currency === 'USD') {
            clsMap[o.client_id].total_orders_usd += amt;
          } else {
            clsMap[o.client_id].total_orders_ars += amt;
          }
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
          const amt = Number(p.total_amount) || 0;
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

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

  } catch (error: any) {
    console.error('[API Finanzas Data] Error:', error);
    return NextResponse.json({ error: error.message || String(error) }, { status: 500 });
  }
}

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getUnimportedSellerOrders, normalizeText } from '@/lib/unimportedOrders';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const fresh = searchParams.get('fresh') === 'true' || searchParams.get('fresh') === '1';
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const daysParam = searchParams.get('days');

    const result = await getUnimportedSellerOrders({ forceRefresh: fresh });

    // If specific date filters are requested, filter salesByProductId and salesByNormName accordingly
    if (startDate || endDate || daysParam) {
      let filterStart = startDate;
      let filterEnd = endDate;

      if (daysParam && !filterStart) {
        const days = parseInt(daysParam, 10) || 15;
        const d = new Date();
        d.setDate(d.getDate() - days);
        filterStart = d.toISOString().split('T')[0];
      }

      const filteredSalesByProductId: Record<string, number> = {};
      const filteredSalesByNormName: Record<string, number> = {};
      let filteredSalesUnits = 0;

      result.unimportedOrders.forEach(order => {
        if (filterStart && order.orderDate < filterStart) return;
        if (filterEnd && order.orderDate > filterEnd) return;

        order.items.forEach(item => {
          if (item.productId) {
            filteredSalesByProductId[item.productId] = (filteredSalesByProductId[item.productId] || 0) + item.quantity;
          }
          if (item.normalizedName) {
            filteredSalesByNormName[item.normalizedName] = (filteredSalesByNormName[item.normalizedName] || 0) + item.quantity;
          }
          filteredSalesUnits += item.quantity;
        });
      });

      return NextResponse.json({
        ...result,
        salesByProductId: filteredSalesByProductId,
        salesByNormName: filteredSalesByNormName,
        totalSalesUnits: filteredSalesUnits,
        filterApplied: { filterStart, filterEnd }
      });
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[unimported-orders API] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Error al obtener pedidos no importados' },
      { status: 500 }
    );
  }
}

'use client';

import { supabase } from '@/lib/supabase';

let pending: Promise<void> | null = null;
let checkedAt = 0;

export function refreshCustomerPriceIndex(): Promise<void> {
  if (Date.now() - checkedAt < 60 * 60_000) return Promise.resolve();
  if (pending) return pending;
  pending = (async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session?.access_token) return;
    const response = await fetch('/api/admin/customer-price-index', {
      method: 'POST', headers: { Authorization: `Bearer ${data.session.access_token}` },
      signal: AbortSignal.timeout(12_000),
    });
    if (response.ok) checkedAt = Date.now();
  })().catch(() => {
    // The report can still use the last official series saved in the ERP.
  }).finally(() => { pending = null; });
  return pending;
}

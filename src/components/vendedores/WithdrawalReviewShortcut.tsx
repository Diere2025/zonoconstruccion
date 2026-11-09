'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ClipboardCheck } from 'lucide-react';
import { EMPLOYEE_WITHDRAWALS_PATH, WITHDRAWAL_REVIEWS_REFRESH } from '@/lib/employeeWithdrawals';
import { supabase } from '@/lib/supabase';

export function WithdrawalReviewShortcut() {
  const pathname = usePathname();
  const [pending, setPending] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    let request = 0;
    async function refresh() {
      const attempt = ++request;
      try {
        const { data, error } = await supabase.rpc('employee_withdrawal_review_count');
        if (alive && attempt === request && !error) setPending(typeof data === 'number' ? data : null);
      } catch {
        // Keep the last verified count during a temporary connection failure.
      }
    }
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    void refresh();
    const timer = window.setInterval(refreshWhenVisible, 30000);
    window.addEventListener('focus', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    window.addEventListener(WITHDRAWAL_REVIEWS_REFRESH, refreshWhenVisible);
    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      window.removeEventListener(WITHDRAWAL_REVIEWS_REFRESH, refreshWhenVisible);
    };
  }, [pathname]);

  if (pending === null) return null;
  return <Link href={`${EMPLOYEE_WITHDRAWALS_PATH}?validaciones=1`}
    aria-label={`Validaciones RRHH. ${pending} ${pending === 1 ? 'retiro pendiente' : 'retiros pendientes'}`}
    className={`inline-flex min-h-9 shrink-0 items-center gap-2 rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-indigo-500 ${pending > 0
      ? 'border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
    <ClipboardCheck className="size-4" aria-hidden="true" />
    <span className="hidden md:inline">Validaciones RRHH</span>
    {pending > 0 && <span aria-hidden="true" className="min-w-5 rounded-full bg-indigo-600 px-1.5 py-0.5 text-center text-white">
      {pending > 99 ? '99+' : pending}
    </span>}
  </Link>;
}

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ClipboardCheck, ClipboardX } from 'lucide-react';
import { EMPLOYEE_WITHDRAWALS_PATH, WITHDRAWAL_REVIEWS_REFRESH } from '@/lib/employeeWithdrawals';
import { supabase } from '@/lib/supabase';

export function WithdrawalReviewShortcut() {
  const pathname = usePathname();
  const [pending, setPending] = useState<number | null>(null);
  const [rejected, setRejected] = useState(0);

  useEffect(() => {
    let alive = true;
    let request = 0;
    async function refresh() {
      const attempt = ++request;
      try {
        const [review, notices] = await Promise.all([
          supabase.rpc('employee_withdrawal_review_count'),
          supabase.rpc('employee_withdrawal_rejection_notices'),
        ]);
        if (!alive || attempt !== request) return;
        if (!review.error) setPending(typeof review.data === 'number' ? review.data : null);
        if (!notices.error) setRejected(typeof notices.data === 'number' ? notices.data : 0);
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

  return <>
  {rejected > 0 && <Link href={`${EMPLOYEE_WITHDRAWALS_PATH}?rechazados=1`}
    aria-label={`Retiros rechazados. ${rejected} ${rejected === 1 ? 'aviso sin leer' : 'avisos sin leer'}`}
    className="inline-flex min-h-9 shrink-0 items-center gap-2 rounded-xl border border-rose-300 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-100 focus-visible:outline-2 focus-visible:outline-rose-500">
    <ClipboardX className="size-4" aria-hidden="true" />
    <span className="hidden lg:inline">Retiros rechazados</span>
    <span aria-hidden="true" className="min-w-5 rounded-full bg-rose-600 px-1.5 py-0.5 text-center text-white">
      {rejected > 99 ? '99+' : rejected}
    </span>
  </Link>}
  {pending !== null && <Link href={`${EMPLOYEE_WITHDRAWALS_PATH}?validaciones=1`}
    aria-label={`Validaciones RRHH. ${pending} ${pending === 1 ? 'retiro pendiente' : 'retiros pendientes'}`}
    className={`inline-flex min-h-9 shrink-0 items-center gap-2 rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-indigo-500 ${pending > 0
      ? 'border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
    <ClipboardCheck className="size-4" aria-hidden="true" />
    <span className="hidden md:inline">Validaciones RRHH</span>
    {pending > 0 && <span aria-hidden="true" className="min-w-5 rounded-full bg-indigo-600 px-1.5 py-0.5 text-center text-white">
      {pending > 99 ? '99+' : pending}
    </span>}
  </Link>}
  </>;
}

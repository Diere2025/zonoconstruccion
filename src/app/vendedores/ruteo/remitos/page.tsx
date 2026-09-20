"use client";

import { Printer } from 'lucide-react';
import LogisticsPrintingPanel from '@/components/logistica/LogisticsPrintingPanel';

export default function LogisticsRemittancesPage() {
  return (
    <div className="mx-auto max-w-[1500px] space-y-5 p-4 sm:p-6 lg:p-8">
      <header className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-sm">
          <Printer className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-black tracking-tight text-slate-900">Impresión logística</h1>
          <p className="text-xs font-semibold text-slate-500">Logística y Distribución</p>
        </div>
      </header>

      <section className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm sm:p-6">
        <LogisticsPrintingPanel />
      </section>
    </div>
  );
}

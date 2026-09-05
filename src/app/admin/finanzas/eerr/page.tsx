'use client';

import React from 'react';
import EstadoResultadosView from '@/components/finanzas/EstadoResultadosView';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function AdminFinanzasEERRPage() {
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <Link
          href="/admin/finanzas"
          className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition"
        >
          <ArrowLeft className="w-4 h-4" /> Volver a Finanzas
        </Link>
      </div>

      <EstadoResultadosView />
    </div>
  );
}

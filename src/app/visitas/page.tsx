import { Suspense } from 'react';
import VisitsPortal from '@/components/visits/VisitsPortal';
export default function VisitsPage() { return <Suspense fallback={<p className="p-8 text-sm text-slate-500">Cargando visitas…</p>}><VisitsPortal /></Suspense>; }

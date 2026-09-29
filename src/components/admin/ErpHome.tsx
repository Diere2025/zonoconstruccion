"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Boxes, Loader2, Search } from 'lucide-react';
import { useErpNavigation } from '@/components/ui/ErpNavigationContext';

const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export default function ErpHome() {
  const { modules, ready, error } = useErpNavigation();
  const [search, setSearch] = useState('');
  const term = normalize(search.trim());
  useEffect(() => {
    if (ready && window.location.hash) {
      document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ block: 'start' });
    }
  }, [ready]);
  const matches = modules.map(module => ({
    ...module,
    links: normalize(`${module.title} ${module.description}`).includes(term)
      ? module.links : module.links.filter(link => normalize(link.name).includes(term))
  })).filter(module => module.links.length > 0);

  return <div className="mx-auto max-w-[1500px] space-y-7 pb-8">
    <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-indigo-600"><Boxes className="h-4 w-4" /> Zono ERP</div>
      <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-900">Inicio</h1>
      <p className="mt-2 text-sm text-slate-500">Elegí el módulo con el que querés trabajar.</p>
      <label className="mt-6 flex max-w-xl items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-100">
        <Search className="h-5 w-5 shrink-0 text-slate-400" />
        <span className="sr-only">Buscar módulos o pantallas</span>
        <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar módulos o pantallas…" className="w-full bg-transparent py-3 text-sm outline-none" type="search" />
      </label>
    </header>
    {error && <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{error} <button className="ml-2 font-semibold underline" onClick={() => window.location.reload()}>Reintentar ahora</button></div>}
    {!ready ? <div role="status" className="flex items-center justify-center gap-3 py-16 text-sm text-slate-500"><Loader2 className="h-5 w-5 animate-spin" />Verificando tus accesos…</div> : <>
      <nav aria-label="Módulos" className="flex flex-wrap gap-2">
        {matches.map(module => <a key={module.id} href={`#${module.id}`} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-indigo-300 hover:text-indigo-700 focus-visible:outline-2 focus-visible:outline-indigo-500">{module.title}</a>)}
      </nav>
      <div className="grid items-start gap-5 md:grid-cols-2 xl:grid-cols-3">
        {matches.map(module => {
          const Icon = module.icon;
          return <section id={module.id} key={module.id} className="scroll-mt-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="mb-4 flex items-start gap-3">
              <div className="rounded-2xl bg-indigo-50 p-3 text-indigo-600"><Icon className="h-5 w-5" /></div>
              <div><h2 className="text-base font-bold text-slate-900">{module.title}</h2><p className="mt-1 text-xs leading-relaxed text-slate-500">{module.description}</p></div>
            </div>
            <div className="space-y-1">{module.links.map(link => {
              const LinkIcon = link.icon;
              return <Link key={link.id} href={link.href} className="group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-700 transition hover:bg-indigo-50 hover:text-indigo-700 focus-visible:outline-2 focus-visible:outline-indigo-500">
                <LinkIcon className="h-4 w-4 shrink-0 text-slate-400 group-hover:text-indigo-500" /><span className="flex-1">{link.name}</span><ArrowUpRight className="h-4 w-4 shrink-0 text-slate-300 group-hover:text-indigo-500" />
              </Link>;
            })}</div>
          </section>;
        })}
      </div>
      {matches.length === 0 && <p role="status" className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">No encontramos accesos para “{search}”. Probá con otro nombre.</p>}
    </>}
  </div>;
}

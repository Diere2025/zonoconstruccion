'use client';

import { useEffect, useMemo, useState } from 'react';
import { cpr, diagnose, type Periods } from '@/lib/meta-ads-review';

const money = (value: number | null) => value === null ? '—' : `US$ ${value.toFixed(2)}`;
const severityRank = { danger: 3, warning: 2, success: 1, neutral: 0 } as const;

function formatMetaAmount(value: unknown, currency = 'USD') {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount / 100);
}

function describeActivityChange(event: any) {
  let detail: any = event.extra_data;
  try {
    if (typeof detail === 'string') detail = JSON.parse(detail);
  } catch {
    return { summary: 'Meta no envió un detalle legible para este cambio.', raw: event.extra_data };
  }

  const currency = detail?.currency || detail?.old_value?.currency || detail?.new_value?.currency || 'USD';
  if (detail?.type === 'payment_amount') {
    const before = formatMetaAmount(detail.old_value, currency);
    const after = formatMetaAmount(detail.new_value, currency);
    if (before && after) return { summary: `Límite de gasto: ${before} → ${after}.`, raw: detail };
  }
  if (detail?.type === 'composite_data') {
    const before = formatMetaAmount(detail.old_value?.old_value, detail.old_value?.currency || currency);
    const after = formatMetaAmount(detail.new_value?.new_value, detail.new_value?.currency || currency);
    if (before && after) return { summary: `Presupuesto diario: ${before} → ${after}.`, raw: detail };
  }
  if (detail?.type === 'run_status') {
    const before = detail.old_value || detail.run_status?.old_value;
    const after = detail.new_value || detail.run_status?.new_value;
    if (before && after) return { summary: `Estado: ${before} → ${after}.`, raw: detail };
  }
  return { summary: 'Cambio registrado por Meta.', raw: detail };
}

function formatActivityTime(value: string, timezone?: string) {
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: timezone || 'America/Argentina/Buenos_Aires',
    dateStyle: 'short',
    timeStyle: 'medium',
    hour12: false,
  }).format(new Date(value));
}

export default function MetaReview({ campaigns, data, targets, setTarget, fresh, detailsOpen, onDetailsOpenChange }: {
  campaigns: any[];
  data: any;
  targets: Record<string, number>;
  setTarget: (key: string, value: number) => void;
  fresh: boolean;
  detailsOpen: boolean;
  onDetailsOpenChange: (open: boolean) => void;
}) {
  const [includePaused, setIncludePaused] = useState(false);
  const [openCampaigns, setOpenCampaigns] = useState<Set<string>>(new Set());

  const rows = useMemo(() => campaigns.flatMap(c => (c.ads || [])
    .filter((a: any) => a.periods && (includePaused || a.effectiveStatus === 'ACTIVE'))
    .map((a: any) => ({ c, a, d: diagnose(a.periods, targets[c.commercialOffer] || 3.5, a.effectiveStatus === 'ACTIVE', fresh) })))
    .sort((a, b) => b.d.score - a.d.score), [campaigns, fresh, includePaused, targets]);

  const groups = useMemo(() => {
    const grouped = new Map<string, { campaign: any; rows: typeof rows }>();
    rows.forEach(row => {
      const id = row.c.campaignId;
      const group = grouped.get(id) || { campaign: row.c, rows: [] };
      group.rows.push(row);
      grouped.set(id, group);
    });
    return [...grouped.entries()].map(([id, group]) => {
      const priority = group.rows.filter(row => row.d.severity === 'danger' || row.d.severity === 'warning');
      const opportunities = group.rows.filter(row => row.d.severity === 'success');
      const worst = [...group.rows].sort((a, b) => severityRank[b.d.severity as keyof typeof severityRank] - severityRank[a.d.severity as keyof typeof severityRank] || b.d.score - a.d.score)[0];
      return { id, ...group, priority, opportunities, worst };
    }).sort((a, b) => b.worst.d.score - a.worst.d.score);
  }, [rows]);

  useEffect(() => {
    setOpenCampaigns(detailsOpen ? new Set(groups.map(group => group.id)) : new Set());
  }, [detailsOpen, groups]);

  const priorityGroups = groups.filter(group => group.priority.length > 0);
  const shownGroups = detailsOpen ? groups : priorityGroups;
  const activeObservations = priorityGroups.reduce((total, group) => total + group.priority.length, 0);
  const toggleCampaign = (id: string) => setOpenCampaigns(previous => {
    const next = new Set(previous);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  return <section className="bg-white rounded-3xl p-5 border border-slate-200 space-y-4">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div><h2 className="text-xl font-bold">Qué revisar primero</h2><p className="text-sm text-slate-600">Hoy es parcial. Las conversaciones no equivalen a ventas ni a rentabilidad.</p></div>
      <button type="button" onClick={() => onDetailsOpenChange(!detailsOpen)} className="shrink-0 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50" aria-expanded={detailsOpen}>{detailsOpen ? 'Contraer todas las campañas' : `Desplegar campañas (${groups.length})`}</button>
    </div>

    <div role="status" className={`rounded-xl p-3 text-sm ${fresh ? 'bg-blue-50' : 'bg-amber-50 text-amber-900'}`}><strong>{fresh ? 'Meta conectada' : 'Recomendaciones suspendidas'}</strong> · Fuente: {data?.source === 'meta_api_direct' ? 'API de Meta' : data?.source === 'sheet' ? 'Planilla de respaldo' : 'Sin fuente confirmada'}<br />Última lectura: {data?.updatedAt ? new Date(data.updatedAt).toLocaleString('es-AR', { timeZone: data.account?.timezone || 'America/Argentina/Buenos_Aires' }) : 'No disponible'} · {data?.account?.timezone || 'Zona horaria no confirmada'}{!fresh && <p>Datos no vigentes: no se evalúan anuncios hasta actualizar.</p>}{data?.error && <p>{data.error}</p>}{data?.apiError && <p>{data.apiError}</p>}</div>
    {data?.account && <div className="grid gap-2 text-sm sm:grid-cols-3"><p>Cuenta: <strong>{data.account.status === 1 ? 'Activa' : `Revisar estado (${data.account.status})`}</strong></p><p>Límite: <strong>{data.account.spendCap === null ? 'No disponible' : data.account.spendCap === 0 ? 'Sin límite configurado' : money(data.account.spendCap)}</strong></p><p>Margen hasta el límite: <strong>{money(data.account.remaining)}</strong></p></div>}

    <div className="flex flex-wrap items-center gap-3 border-y border-slate-100 py-3"><p className="text-sm font-semibold text-slate-800">{activeObservations ? `${activeObservations} observación${activeObservations === 1 ? '' : 'es'} activa${activeObservations === 1 ? '' : 's'} en ${priorityGroups.length} campaña${priorityGroups.length === 1 ? '' : 's'}` : 'Sin observaciones activas'}</p><label className="ml-auto inline-flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={includePaused} onChange={event => setIncludePaused(event.target.checked)} />Incluir pausados como historial</label></div>

    {!shownGroups.length && <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">No hay campañas activas con observaciones. Desplegá campañas para revisar oportunidades y el resto de los anuncios.</p>}
    <div className="space-y-3">{shownGroups.map(group => {
      const open = openCampaigns.has(group.id);
      const diagnosis = group.worst.d;
      return <article key={group.id} className="overflow-hidden rounded-2xl border border-slate-200">
        <button type="button" onClick={() => toggleCampaign(group.id)} className="flex w-full flex-col gap-2 bg-slate-50 px-4 py-3 text-left hover:bg-slate-100 sm:flex-row sm:items-center sm:justify-between" aria-expanded={open}>
          <span><strong className="block text-sm text-slate-900">{group.campaign.commercialOffer}</strong><span className="text-xs text-slate-500">{group.campaign.product} · {group.rows.filter(row => row.a.effectiveStatus === 'ACTIVE').length} anuncios activos</span></span>
          <span className="flex items-center gap-3"><span className={`text-xs font-bold ${diagnosis.severity === 'danger' ? 'text-red-700' : diagnosis.severity === 'warning' ? 'text-amber-700' : diagnosis.severity === 'success' ? 'text-emerald-700' : 'text-slate-700'}`}>{group.priority.length ? `${group.priority.length} observación${group.priority.length === 1 ? '' : 'es'}` : group.opportunities.length ? `${group.opportunities.length} oportunidad${group.opportunities.length === 1 ? '' : 'es'}` : 'Sin alertas'}</span><span className="text-xs font-bold text-slate-600">{open ? '⌃ Contraer' : '⌄ Ver anuncios'}</span></span>
        </button>
        {!open && group.priority.length > 0 && <div className="border-t border-slate-100 px-4 py-3 text-sm"><strong className={diagnosis.severity === 'danger' ? 'text-red-700' : 'text-amber-700'}>{diagnosis.label}</strong><span className="ml-2 text-slate-600">{diagnosis.reason}</span></div>}
        {open && <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-y bg-white text-left"><th className="p-3">Anuncio</th><th className="p-3">Hoy</th><th className="p-3">Ayer</th><th className="p-3">7 días</th><th className="min-w-64 p-3">Diagnóstico</th></tr></thead><tbody>{group.rows.map(({ a, d }) => <tr key={a.id} className="border-b align-top"><td className="p-3"><strong>{a.name}</strong><p className="text-xs text-slate-500">{a.effectiveStatus === 'ACTIVE' ? 'Activo' : 'Pausado · solo historial'}</p></td>{(['today', 'yesterday', 'week'] as (keyof Periods)[]).map(period => <td key={period} className="whitespace-nowrap p-3">{money(cpr(a.periods[period]))}<p className="text-xs text-slate-500">{a.periods[period].messages} conv.</p></td>)}<td className="p-3"><strong className={d.severity === 'danger' ? 'text-red-700' : d.severity === 'warning' ? 'text-amber-700' : d.severity === 'success' ? 'text-emerald-700' : 'text-slate-700'}>{d.label}</strong><p className="mt-1 text-xs">{d.reason}</p><p className="mt-1 text-xs text-slate-600">{d.action}</p></td></tr>)}</tbody></table></div>}
      </article>;
    })}</div>

    <details><summary className="cursor-pointer font-semibold">Objetivos por oferta (USD por conversación)</summary><p className="my-2 text-xs text-slate-500">Valor inicial: US$ 3,50. Se guarda en este navegador y no modifica presupuestos en Meta.</p><div className="flex flex-wrap gap-3">{Array.from(new Set(campaigns.map(c => c.commercialOffer))).map(offer => <label key={offer} className="text-sm">{offer}<input aria-label={`Objetivo ${offer}`} type="number" min="0.1" step="0.1" className="ml-2 w-24 rounded border p-2" value={targets[offer] || 3.5} onChange={event => { const value = Number(event.target.value); if (Number.isFinite(value) && value > 0) setTarget(offer, value); }} /></label>)}</div></details>
    <details><summary className="cursor-pointer font-semibold">Registro de cambios en Meta · últimos siete días</summary><p className="my-2 text-xs text-slate-500">{data?.activitiesError || 'Incluye cambios de presupuesto, estado y creativos. Revisá cambios recientes antes de interpretar el rendimiento.'}</p>{!data?.activitiesError && !data?.activities?.length && <p className="text-sm">Sin cambios disponibles en esta consulta.</p>}<div className="max-h-80 overflow-y-auto">{data?.activities?.map((event: any, index: number) => { const change = describeActivityChange(event); return <div key={index} className="border-b py-2 text-sm"><strong>{event.translated_event_type || event.event_type}</strong> · {event.object_name || event.object_id}<p className="text-xs text-slate-500">{formatActivityTime(event.event_time, data?.account?.timezone)}</p>{event.extra_data && <><p className="mt-1 text-xs text-slate-700">{change.summary}</p><details><summary className="cursor-pointer text-xs text-slate-500">Ver datos técnicos</summary><pre className="break-all whitespace-pre-wrap text-xs">{typeof event.extra_data === 'string' ? event.extra_data : JSON.stringify(change.raw, null, 2)}</pre></details></>}</div>; })}</div></details>
  </section>;
}

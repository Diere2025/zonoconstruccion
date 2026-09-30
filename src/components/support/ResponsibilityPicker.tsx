'use client';
import { useEffect, useState } from 'react';
import { errorMessage, supportRequest } from '@/lib/support/client';
import type { ResponsibilityOptions } from '@/lib/support/types';
import { fieldClass } from './SupportShell';

export function ResponsibilityPicker({ sector, assignee, onChange, fixedSector = false, onReady }: {
    sector: string;
    assignee: string;
    onChange: (sector: string, assignee: string) => void;
    fixedSector?: boolean;
    onReady?: (ready: boolean) => void;
}) {
    const [options, setOptions] = useState<ResponsibilityOptions | null>(null);
    const [error, setError] = useState('');
    const [revision, setRevision] = useState(0);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        let alive = true;
        void supportRequest<ResponsibilityOptions>('responsibles').then(result => {
            if (alive) { setOptions(result); setError(''); onReady?.(true); }
        }).catch(e => { if (alive) { setError(errorMessage(e)); onReady?.(false); } }).finally(() => { if (alive) setLoading(false); });
        return () => { alive = false; };
    }, [revision, onReady]);
    const area = options?.sectors.find(s => s.id === sector);
    const people = options?.people.filter(p => p.active && p.sector_ids.includes(sector)) || [];
    return <div className="space-y-2">
        {!fixedSector && <label className="block text-sm font-semibold">Área responsable
            <select name="sector_id" required disabled={!options || loading} value={sector} onChange={e => onChange(e.target.value, '')} className={`${fieldClass} mt-1`}>
                <option value="">{loading ? 'Cargando áreas…' : error && !options ? 'No se pudieron cargar las áreas' : 'Elegí quién debe atender la solicitud'}</option>
                {options?.sectors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
        </label>}
        <label className="block text-sm font-semibold">Responsable
            <select name="responsible" required disabled={!area || loading} value={assignee} onChange={e => onChange(sector, e.target.value)} className={`${fieldClass} mt-1`}>
                <option value="">Elegí una persona o el equipo del área</option>
                {area && <option value="area">Equipo de {area.name}</option>}
                {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
        </label>
        <p className="text-xs font-normal text-slate-500">Elegí el equipo para compartir la atención, o una persona para que se haga cargo.</p>
        {error && <p role="alert" className="text-xs text-rose-700">{error} <button type="button" className="underline" onClick={() => { setLoading(true); setError(''); onReady?.(false); setRevision(n => n + 1); }}>Reintentar</button></p>}
        {options && options.sectors.length === 0 && <p role="alert" className="text-xs text-amber-700">No hay áreas con responsables activos. Un administrador debe configurarlas antes de crear el ticket.</p>}
    </div>;
}

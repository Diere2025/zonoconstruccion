export interface Metrics {
    spendUsd: number;
    messages: number;
    frequency: number;
    ctr: number;
    impressions: number;
}
export interface Periods {
    today: Metrics;
    yesterday: Metrics;
    week: Metrics;
}
export interface Diagnosis {
    label: string;
    evidence: string;
    reason: string;
    action: string;
    severity: 'danger' | 'warning' | 'success' | 'neutral';
    score: number;
}
export const DEFAULT_TARGET = 3.5;
export const cpr = (m: Metrics) => m.messages > 0 ? m.spendUsd / m.messages : null;
export function diagnose(p: Periods, target = DEFAULT_TARGET, active = true, fresh = true): Diagnosis {
    const t = p.today, y = p.yesterday, w = p.week;
    const tc = cpr(t), yc = cpr(y), wc = cpr(w);
    const result = (label: string, evidence: string, reason: string, action: string, severity: Diagnosis['severity'], rank: number): Diagnosis => ({ label, evidence, reason, action, severity, score: rank * 100000 + t.spendUsd + w.spendUsd / 7 });
    if (!fresh)
        return result('Datos no vigentes', 'Sin evaluación', 'No se confirmó una consulta reciente y completa.', 'Actualizar la conexión antes de decidir.', 'neutral', 0);
    if (!active)
        return result('Sin entrega activa', 'Histórico', 'Se conserva el gasto reciente para revisión.', 'Revisar el historial de cambios y el estado en Meta.', 'neutral', 0);
    const bad = (m: Metrics) => m.spendUsd >= target * 3 && (m.messages === 0 || m.spendUsd / m.messages > target);
    if (bad(y) && bad(t))
        return result('Costo elevado persistente', 'Ayer y hoy', `Ambos períodos superan el objetivo de US$ ${target.toFixed(2)} con gasto ≥ 3 veces ese objetivo.`, 'Revisar calidad de consultas y considerar una pausa del anuncio afectado.', 'danger', 4);
    if (bad(w) && (wc === null || wc > target * 1.25))
        return result('Histórico costoso', '7 días completos', `US$ ${w.spendUsd.toFixed(2)} y ${w.messages} conversaciones; objetivo US$ ${target.toFixed(2)}.`, 'Revisar cambios recientes y ventas antes de mantener la inversión.', 'warning', 3);
    if (t.messages === 0 && t.spendUsd >= target * 2)
        return result('Gasto sin conversaciones', 'Señal de hoy', `US$ ${t.spendUsd.toFixed(2)} sin conversaciones registradas.`, 'Comprobar destino y mensajes; contrastar con ayer antes de pausar.', 'warning', 2);
    if (tc !== null && tc > target)
        return result('Costo elevado, en observación', t.messages < 5 ? 'Pocos datos' : 'Señal de hoy', `US$ ${tc.toFixed(2)} por conversación frente a objetivo US$ ${target.toFixed(2)}.`, 'Revisar evolución y calidad de consultas; hoy es parcial.', 'warning', 2);
    if (t.frequency >= 1.8 && t.impressions >= 500)
        return result('Frecuencia elevada', 'Señal de hoy', 'La frecuencia por sí sola no demuestra fatiga; las ventanas de hoy y siete días no son equivalentes.', 'Revisar evolución diaria de costo y CTR antes de cambiar el creativo.', 'warning', 1);
    if (t.messages >= 12 && w.messages >= 30 && tc !== null && wc !== null && yc !== null && tc <= target * .7 && wc <= target * .7 && yc <= target)
        return result('Candidata a evaluar aumento', 'Hoy, ayer y 7 días', 'Costo favorable con volumen en varias ventanas.', 'Validar ventas atribuidas, margen, stock y capacidad de atención antes de aumentar.', 'success', 1);
    if (t.messages < 5)
        return result(t.spendUsd ? 'Muestra insuficiente' : 'Sin actividad hoy', 'Pocos datos', `${t.messages} conversaciones hoy; no alcanza para clasificar el rendimiento.`, 'Esperar más evidencia y consultar el histórico.', 'neutral', 0);
    return result('Dentro del objetivo', 'Señal de hoy', `Costo ≤ US$ ${target.toFixed(2)}; no equivale a rentabilidad.`, 'Mantener seguimiento de ventas y consultas.', 'neutral', 0);
}
export function reportingDates(now: Date, timezone: string) {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
    const part = (key: string) => parts.find(p => p.type === key)!.value;
    const today = `${part('year')}-${part('month')}-${part('day')}`;
    const shift = (days: number) => { const d = new Date(today + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
    return { today, yesterday: shift(-1), weekStart: shift(-7) };
}

// Read the error body before checking status so the UI preserves the server diagnosis.
export async function readLiveResponse(response: Response) {
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error || `No se pudo consultar Meta (HTTP ${response.status}).`);
    if (!data?.summary || !Array.isArray(data.campaigns)) throw new Error('Meta devolvió una respuesta incompleta.');
    return data;
}

export async function readHistoryResponse(response: Response) {
    const data = await response.json().catch(() => null);
    if (!response.ok) {
        throw new Error(data?.error || `No se pudo cargar el histórico (HTTP ${response.status}).`);
    }
    if (!data?.summary || !Array.isArray(data.records) || !Array.isArray(data.dailyTimeline) || !Array.isArray(data.categories)) {
        throw new Error('El histórico devolvió una respuesta incompleta.');
    }
    return data;
}

import { dailyProgress, type buildReport, type ExpenseCategory } from './model';

type Report = ReturnType<typeof buildReport>;
type Row = { label: string; values: number[]; total: number; note?: string };

export const expenseGroups = [
  { title: '2. Costos de Mercadería e Insumos (CMV)', color: '#2563eb', concepts: ['Insumo de Producto', 'Insumo GLP'] },
  { title: '3. Logística y Distribución', color: '#d97706', concepts: ['Servicio de Flete', 'Gasto Peajes', 'Vehículos'] },
  { title: '4. Comercial y Marketing', color: '#dc2626', concepts: ['Publicidad', 'Publicidad (Fee)'] },
  { title: '5. Personal, RRHH y Estructura', color: '#7c3aed', concepts: ['Sueldos', 'Eventuales', 'Honorarios', 'Alquileres'] },
  { title: '6. Gastos Operativos y Servicios', color: '#475569', concepts: ['Gastos Operativos'] },
  { title: '7. Impuestos, Gravámenes y Costos de Cobranza', color: '#0d9488', concepts: ['Costos MercadoPago', 'IVA + IIBB', 'IIGG', 'Impuestos', 'Costo Financiera'] },
] as const satisfies ReadonlyArray<{ title: string; color: string; concepts: readonly ExpenseCategory[] }>;

const labels: Partial<Record<ExpenseCategory, string>> = {
  Eventuales: 'Personal Eventual (Jornales)',
  'Gastos Operativos': 'Gastos Operativos Zono',
  'Costos MercadoPago': 'Costos MercadoPago (Bruto)',
};
const cents = (amount: number) => Math.round(amount * 100);
const sum = (values: number[]) => values.reduce((total, value) => total + cents(value), 0) / 100;
const row = (label: string, values: number[], total = sum(values), note?: string): Row =>
  ({ label, values, total, note });

export function buildMatrix(report: Report) {
  const { days, totals } = report;
  const expensesByDay = new Map<string, Map<string, number>>();
  for (const entry of report.entries) {
    if (entry.kind !== 'expense') continue;
    const amounts = expensesByDay.get(entry.category) ?? new Map<string, number>();
    amounts.set(entry.day, (amounts.get(entry.day) ?? 0) + cents(entry.amount));
    expensesByDay.set(entry.category, amounts);
  }

  function expense(category: ExpenseCategory) {
    const amounts = expensesByDay.get(category);
    const provision = report.groups.find(group => group.category === category)?.mode.startsWith('Precarga');
    const label = labels[category] ?? category;
    return row(label, days.map(day => (amounts?.get(day.day) ?? 0) / 100), undefined,
      provision ? 'Precarga prorrateada al corte' : undefined);
  }

  const revenue = row('Facturación', days.map(day => day.revenue), totals.revenue);
  const cardSurcharges = days.map(day => day.cardSurcharges ?? 0);
  const hasRevenueBreakdown = days.every(day => day.cardSurcharges !== undefined);
  const cardCosts = expense('Costos MercadoPago');
  const groupRows = expenseGroups.map(({ title, color, concepts }, index) => {
    const rows = concepts.map(expense);
    if (index === 0) rows.unshift(row('Costo Mercadería', days.map(day => day.cmv), totals.cmv, 'CMV identificado'));
    const subtotal = row(title, days.map((_, day) => sum(rows.map(item => item.values[day]))));
    if (index === expenseGroups.length - 1 && hasRevenueBreakdown) {
      rows.splice(1, 0,
        row('Recargos cobrados a clientes', cardSurcharges, undefined, 'Referencia incluida en facturación'),
        row('Costo MercadoPago Neto (Absorbido por Zono)',
          cardCosts.values.map((value, day) => Math.max(0, sum([value, -cardSurcharges[day]]))),
          Math.max(0, sum([cardCosts.total, -sum(cardSurcharges)])), 'Referencia para comparar el recupero'));
    }
    return { title, color, subtotal, rows };
  });
  const progress = dailyProgress(days);
  const resultLabel = totals.result === null ? 'Resultado parcial identificado' : 'Utilidad neta provisional';
  const result = row(resultLabel, progress.map(day => day.identifiedResult), totals.identifiedBalance);

  return [
    { title: '1. Ingresos Operativos', color: '#4f46e5', subtotal: revenue, rows: [
      revenue,
      ...(hasRevenueBreakdown ? [
        row('Venta de Mercadería (Base sin recargos)', days.map((day, index) => sum([day.revenue, -cardSurcharges[index]])),
          undefined, 'Incluye flete cobrado'),
        row('Recargo por Tarjeta (Abonado por Clientes)', cardSurcharges),
      ] : []),
    ] },
    ...groupRows,
    { title: '8. Rentabilidad y Resultados Finales', color: '#059669', subtotal: result, rows: [
      result,
      row('Resultado acumulado', progress.map(day => day.cumulativeResult), result.total),
      row('Contribución Marginal', days.map((day, index) => sum([day.revenue, -groupRows[0].subtotal.values[index]]))),
      row('Intereses ganados', days.map(day => day.otherIncome)),
      expense('Otros Ingresos y Egresos'),
      expense('Pérdida Extraordinaria'),
    ] },
  ];
}

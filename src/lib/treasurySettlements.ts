export type SettlementPaymentKind = "cash" | "electronic";

export interface SettlementPaymentInput {
  clientPaymentId: string;
  amount: number;
  kind: SettlementPaymentKind;
}

export interface SettlementExpenseInput {
  id?: string;
  type: "toll" | "extraordinary";
  amount: number;
  reference?: string;
  notes?: string;
}

export interface BanknoteCountInput {
  denomination: number;
  kind: "bill" | "coin";
  quantity: number;
}

export interface SettlementTotals {
  deliveriesTotal: number;
  electronicTotal: number;
  tollsTotal: number;
  extraordinaryTotal: number;
  expectedCash: number;
  countedCash: number;
  difference: number;
}

export interface TreasuryMovementRow {
  date: string;
  detail: string;
  type: "Ingreso" | "Gasto";
  amount: number;
}

export const SETTLEMENT_TOLERANCE = 300;

export const CASH_DENOMINATIONS: Array<{ denomination: number; kind: "bill" | "coin" }> = [
  { denomination: 20000, kind: "bill" },
  { denomination: 10000, kind: "bill" },
  { denomination: 2000, kind: "bill" },
  { denomination: 1000, kind: "bill" },
  { denomination: 500, kind: "bill" },
  { denomination: 200, kind: "bill" },
  { denomination: 100, kind: "bill" },
  { denomination: 50, kind: "bill" },
  { denomination: 20, kind: "bill" },
  { denomination: 10, kind: "bill" },
  { denomination: 10, kind: "coin" },
  { denomination: 5, kind: "coin" },
  { denomination: 2, kind: "coin" },
  { denomination: 1, kind: "coin" },
];

export function isElectronicPaymentMethod(name?: string | null): boolean {
  const normalized = (name || "").toLowerCase();
  return ["transfer", "point", "posnet", "tarjeta", "mercado pago", "qr", "debito", "crédito", "credito"]
    .some(term => normalized.includes(term));
}

export function calculateSettlementTotals(input: {
  payments: SettlementPaymentInput[];
  expenses: SettlementExpenseInput[];
  cashCounts: BanknoteCountInput[];
  changeFund: number;
  shortageRecovered: number;
}): SettlementTotals {
  const deliveriesTotal = input.payments.reduce((sum, payment) => sum + safeAmount(payment.amount), 0);
  const electronicTotal = input.payments
    .filter(payment => payment.kind === "electronic")
    .reduce((sum, payment) => sum + safeAmount(payment.amount), 0);
  const tollsTotal = input.expenses
    .filter(expense => expense.type === "toll")
    .reduce((sum, expense) => sum + safeAmount(expense.amount), 0);
  const extraordinaryTotal = input.expenses
    .filter(expense => expense.type === "extraordinary")
    .reduce((sum, expense) => sum + safeAmount(expense.amount), 0);
  const expectedCash = deliveriesTotal + safeAmount(input.changeFund) - tollsTotal - extraordinaryTotal - electronicTotal;
  const countedCash = input.cashCounts.reduce(
    (sum, count) => sum + safeAmount(count.denomination) * Math.max(0, Math.trunc(safeAmount(count.quantity))),
    0,
  );
  const difference = countedCash + safeAmount(input.shortageRecovered) - expectedCash;

  return {
    deliveriesTotal,
    electronicTotal,
    tollsTotal,
    extraordinaryTotal,
    expectedCash,
    countedCash,
    difference,
  };
}

export function getSettlementHealth(difference: number): "ok" | "shortage" | "overage" {
  if (difference < -SETTLEMENT_TOLERANCE) return "shortage";
  if (difference > SETTLEMENT_TOLERANCE) return "overage";
  return "ok";
}

export function buildSettlementMessage(input: {
  routeDate: string;
  difference: number;
  changeFund: number;
  tollsTotal: number;
  extraordinaryTotal: number;
}): string {
  const date = formatShortDate(input.routeDate);
  const difference = Math.round(input.difference);

  if (difference < -SETTLEMENT_TOLERANCE) {
    return [
      `⚠️Tenemos un faltante del ${date} de *${formatArs(Math.abs(difference))}*⚠️`,
      "Paso los gastos registrados:",
      `💵Efectivo entregado como cambio: *${formatArs(input.changeFund)}*`,
      `🎟️Gastos en peajes: *${formatArs(input.tollsTotal)}*`,
      `🛣️Otros gastos: *${formatArs(input.extraordinaryTotal)}*`,
    ].join("\n");
  }

  if (difference > SETTLEMENT_TOLERANCE) {
    return `La rendición del ${date} tiene un sobrante de *${formatArs(difference)}*. Queda registrada para revisión.`;
  }

  return `*La rendición del ${date} dio OK✅*`;
}

export function buildTreasuryMovementRows(input: {
  movementDate: string;
  countedCash: number;
  expenses: SettlementExpenseInput[];
  shortageRecovered: number;
}): TreasuryMovementRow[] {
  const rows: TreasuryMovementRow[] = [];
  const expenses = input.expenses.filter(expense => safeAmount(expense.amount) > 0);
  const expenseTotal = expenses.reduce((sum, expense) => sum + safeAmount(expense.amount), 0);
  const tollsTotal = expenses
    .filter(expense => expense.type === "toll")
    .reduce((sum, expense) => sum + safeAmount(expense.amount), 0);

  if (safeAmount(input.countedCash) > 0) {
    rows.push({
      date: input.movementDate,
      detail: "Rendición Flete Externo",
      type: "Ingreso",
      amount: safeAmount(input.countedCash),
    });
  }

  if (expenseTotal > 0) {
    rows.push({
      date: input.movementDate,
      detail: "Rendición Flete Externo",
      type: "Ingreso",
      amount: expenseTotal,
    });
  }

  if (tollsTotal > 0) {
    rows.push({
      date: input.movementDate,
      detail: "Gastos peajes",
      type: "Gasto",
      amount: tollsTotal,
    });
  }

  expenses
    .filter(expense => expense.type === "extraordinary")
    .forEach(expense => {
      rows.push({
        date: input.movementDate,
        detail: expense.reference?.trim() || "Gasto extraordinario",
        type: "Gasto",
        amount: safeAmount(expense.amount),
      });
    });

  if (safeAmount(input.shortageRecovered) > 0) {
    rows.push({
      date: input.movementDate,
      detail: "Ingreso de faltante",
      type: "Ingreso",
      amount: safeAmount(input.shortageRecovered),
    });
  }

  return rows;
}

export function treasuryMovementRowsToTsv(rows: TreasuryMovementRow[]): string {
  const amountFormatter = new Intl.NumberFormat("es-AR", {
    useGrouping: false,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return rows
    .map(row => [row.date, row.detail, row.type, amountFormatter.format(row.amount)].join("\t"))
    .join("\n");
}

export function formatArgentinaDate(dateInput: string | Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(typeof dateInput === "string" ? new Date(dateInput) : dateInput);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.day}/${values.month}/${values.year}`;
}

function safeAmount(value: number): number {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function formatShortDate(dateInput: string): string {
  const [year, month, day] = dateInput.slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}` : dateInput;
}

function formatArs(value: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(value).replace(/\s+/g, "");
}

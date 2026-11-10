import { financialAccountLabel } from '../financialAccountLabels';
import { treasuryToday } from '../treasuryTransactionTime';
import { movementCode, type ApplicationReference, type CodedMovement } from './references';
import { isInactiveFinancialMovement } from './types';

type TreasuryExportMovement = CodedMovement & {
  created_at: string;
  applications?: ApplicationReference[];
  classification?: { concept: string } | null;
  concept: string | null;
  category: string;
  financial_accounts: { name: string } | null;
  currency: string;
  amount: number;
  running_balance?: number;
  sub_category: string | null;
  efe_category?: string | null;
  cost_centers: { name: string } | null;
  business_unit: string | null;
  notes: string | null;
  financial_operations?: { status: string } | null;
  reversal_of_transaction_id?: string | null;
};

export async function downloadTreasuryMovements(movements: TreasuryExportMovement[]) {
  const XLSX = await import('xlsx');
  const headers = [
    'Fecha', 'Código', 'Comprobantes / Aplicaciones', 'Tipo', 'Concepto', 'Categoría',
    'Cuenta', 'Moneda', 'Monto', 'Saldo resultante', 'Subcategoría', 'EFE',
    'Área / centro de costo', 'Observaciones', 'Estado',
  ];
  const excelEpoch = Date.UTC(1899, 11, 30);
  const rows = movements.map(movement => {
    const day = treasuryToday(new Date(movement.created_at));
    const income = movement.type === 'ingreso';
    const state = movement.reversal_of_transaction_id ? 'Compensación'
      : isInactiveFinancialMovement(movement) ? 'Anulado' : 'Vigente';
    return [
      // Keep the accounting day independent of the browser's timezone.
      (Date.parse(day) - excelEpoch) / 86_400_000,
      movementCode(movement),
      (movement.applications ?? []).map(({ kind, code }) => `${kind} · ${code}`).join(' | '),
      income ? 'Ingreso' : 'Egreso',
      movement.classification?.concept || movement.concept || '',
      movement.category,
      financialAccountLabel(movement.financial_accounts?.name || 'Efectivo Diario'),
      movement.currency,
      (income ? 1 : -1) * Number(movement.amount),
      movement.running_balance ?? null,
      movement.sub_category,
      movement.efe_category ?? null,
      movement.cost_centers?.name || movement.business_unit || '',
      movement.notes,
      state,
    ];
  });

  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  for (let row = 2; row <= rows.length + 1; row++) {
    sheet[`A${row}`].z = 'dd/mm/yyyy';
    sheet[`I${row}`].z = '#,##0.00';
    const balance = sheet[`J${row}`];
    if (balance) balance.z = '#,##0.00';
  }
  sheet['!cols'] = [12, 23, 45, 11, 38, 24, 24, 10, 17, 17, 23, 20, 26, 42, 15].map(wch => ({ wch }));
  sheet['!autofilter'] = { ref: sheet['!ref']! };
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Movimientos');
  XLSX.writeFile(workbook, 'movimientos-tesoreria.xlsx');
}

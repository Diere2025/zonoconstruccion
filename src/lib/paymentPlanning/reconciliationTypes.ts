import type { Item, Realization } from './model';
export type ReconciliationMovement = { id: string; amount: number | string; currency: string; type: string; created_at: string; financial_account_id: string | null; concept: string | null; category: string | null };
export type ReconciliationData = {
  item: Item; realizations: Realization[]; movements: ReconciliationMovement[]; linkedMovements: ReconciliationMovement[];
  accounts: { id: string; name: string; currency: string }[];
  accountIds: string[];
  realized: number; reconciled: number; unlinked: number; capacity: number; hasMore: boolean;
};

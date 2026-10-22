export const reserveConfigurations = {
 '000101a7-1f12-4102-9d9e-871da7f7b326': {mpAccountId:'diegozono_mp',date:'2026-10-06',depositCents:50000000},
 '7b241292-a4d8-46ca-9fa2-9ea6b61427fa': {mpAccountId:'pagoszono_26',date:'2026-10-22',depositCents:44720000},
} as const;
export type ReserveId = keyof typeof reserveConfigurations;

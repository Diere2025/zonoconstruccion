export const metaCostStart = '2026-10-01';

export type AdvertisingDay = {
  day: string;
  usd: number;
  spendArs: number | null;
  feeArs: number | null;
  unvaluedUsd?: number;
};

export type RedotCharge = {
  day: string;
  reference: string;
  detail: string;
  kind: 'service' | 'redot_ads';
  amountArs: number | null;
};

type ValuedTransfer = {
  day: string;
  reference: string;
  destination: 'Meta' | 'Redot';
  credited: number;
  amountArs: number | null;
  feeArs: number | null;
};

export type Advertising = {
  account: string;
  availableUsd: number | null;
  checkedAt: string | null;
  days: AdvertisingDay[];
  arsPerUsdt: number | null;
  feeRate: number | null;
  issue: string | null;
  redot?: RedotCharge[];
  transfers?: ValuedTransfer[];
  purchaseReferences?: string[];
};

export type Funding = {
  day: string;
  kind: string;
  wallet: string;
  reference: string;
  detail: string;
  amount: string;
  credited: string | null;
  bank_amount: string | null;
  bank_matches: boolean | null;
  bank_code?: string | null;
};

type Balance = { units: number; unvalued: number; ars: number };
type MetaLot = Balance & { fee: number; unknownFee: boolean };
const emptyBalance = (): Balance => ({units: 0, unvalued: 0, ars: 0});
const money = (value: number) => Math.round(value * 100) / 100;
const epsilon = 1e-8;

function add(balance: Balance, incoming: Balance) {
  balance.units += incoming.units;
  balance.unvalued += incoming.unvalued;
  balance.ars += incoming.ars;
}

function take(balance: Balance, units: number): Balance {
  const available = Math.min(units, balance.units);
  const share = balance.units > 0 ? available / balance.units : 0;
  const ars = balance.ars * share;
  const unvalued = balance.unvalued * share;
  balance.units -= available;
  balance.ars -= ars;
  balance.unvalued -= unvalued;
  return {units, ars, unvalued: units - available + unvalued};
}

const entryOrder: Record<string, number> = {opening: 0, p2p: 1, transfer: 2, ad_funding: 3};

function eventTime(entry: Funding): string {
  const recorded = entry.detail.match(/^Hora (\d\d:\d\d)\./)?.[1];
  if (recorded) return recorded + ':00';
  // Historical imports include the time shown on the source receipt.
  const captured = entry.kind === 'transfer' ? entry.detail.match(/Retiro Binance (\d\d:\d\d:\d\d)/)?.[1]
    : entry.kind === 'p2p' ? entry.detail.match(/Binance P2P a las (\d\d:\d\d)/)?.[1]
    : entry.reference.match(/\b\d{4}-\d\d-\d\d (\d\d:\d\d:\d\d)$/)?.[1];
  if (captured) return captured.length === 5 ? captured + ':00' : captured;
  return entry.kind === 'opening' ? '00:00:00' : entry.kind === 'p2p' ? '00:00:01' : '23:59:59';
}

export function valueWalletConsumption(days: string[], spend: ReadonlyMap<string, number>, ledger: Funding[]) {
  const binance = emptyBalance();
  const redot = emptyBalance();
  const meta: MetaLot[] = [];
  let firstLot = 0;
  const redotCharges: RedotCharge[] = [];
  const transfers: ValuedTransfer[] = [];
  let redotDebitPending = false;
  const purchaseReferences = new Set<string>();
  const entries = ledger.map(entry => ({entry, time: eventTime(entry)})).sort((a, b) =>
    a.entry.day.localeCompare(b.entry.day) || a.time.localeCompare(b.time) ||
    (entryOrder[a.entry.kind] ?? 4) - (entryOrder[b.entry.kind] ?? 4)).map(({entry}) => entry);
  let cursor = 0;
  let valuedArs = 0;
  let valuedUsd = 0;
  let valuedFee = 0;
  const start = days[0];
  const historyDays = [...new Set([...entries.map(entry => entry.day), ...spend.keys(), ...days])].sort();
  const valuedDays: AdvertisingDay[] = [];

  for (const day of historyDays) {
    for (; entries[cursor]?.day === day; cursor++) {
      const entry = entries[cursor];
      const units = Number(entry.amount);
      const credit = Number(entry.credited);
      if (!Number.isFinite(units) || units < 0) continue;
      const source = entry.wallet === 'redot' ? redot : binance;
      switch (entry.kind) {
        case 'opening':
          if (entry.wallet === 'ads') meta.push({units, ars: 0, unvalued: units, fee: 0, unknownFee: true});
          else add(source, {units, ars: 0, unvalued: units});
          break;
        case 'p2p': {
          const price = Number(entry.bank_amount);
          const known = entry.bank_matches && price > 0;
          add(binance, {units, ars: known ? price : 0, unvalued: known ? 0 : units});
          if (entry.bank_code) purchaseReferences.add(entry.bank_code);
          break;
        }
        case 'transfer': {
          const cost = take(binance, units);
          add(redot, {units: credit, ars: cost.ars, unvalued: cost.unvalued * credit / units});
          if (day >= start) transfers.push({
            day, reference: entry.reference, destination: 'Redot', credited: credit,
            amountArs: cost.unvalued < epsilon ? money(cost.ars) : null,
            feeArs: cost.unvalued < epsilon ? money(cost.ars * (1 - credit / units)) : null,
          });
          break;
        }
        case 'ad_funding': {
          const cost = take(source, units);
          if (source === redot && redotDebitPending) {
            cost.ars = 0;
            cost.unvalued = units;
          }
          const paidCredit = Number(entry.detail.match(/\bCarga neta USD (\d+(?:\.\d{1,2})?);/)?.[1]);
          const hasBreakdown = paidCredit > 0 && paidCredit <= units && paidCredit < credit;
          const paidUnits = hasBreakdown ? paidCredit : credit;
          // A combined bonus or cashback does not establish how much was paid as fee.
          const unknownFee = !hasBreakdown && credit > units;
          const base = unknownFee ? cost.ars : cost.ars * paidUnits / units;
          meta.push({units: paidUnits, ars: base, unvalued: cost.unvalued * paidUnits / units, fee: cost.ars - base, unknownFee});
          if (hasBreakdown) meta.push({units: credit - paidUnits, ars: 0, unvalued: 0, fee: 0, unknownFee: false});
          if (day >= start) transfers.push({
            day, reference: entry.reference, destination: 'Meta', credited: credit,
            amountArs: cost.unvalued < epsilon ? money(cost.ars) : null,
            feeArs: !unknownFee && cost.unvalued < epsilon ? money(cost.ars - base) : null,
          });
          break;
        }
        case 'fee':
        case 'personal':
          if (entry.kind === 'personal' && units === 0) redotDebitPending = true;
          take(source, units);
          break;
        case 'service':
        case 'redot_ads': {
          if (units === 0) redotDebitPending = true;
          const cost = take(redot, units);
          if (day >= start) redotCharges.push({
            day, reference: entry.reference, detail: entry.detail, kind: entry.kind,
            amountArs: !redotDebitPending && cost.unvalued < epsilon ? money(cost.ars) : null,
          });
          break;
        }
        // Meta's measured daily spend is the source used for every day in the calculation.
      }
    }

    const usd = spend.get(day) ?? 0;
    let remaining = usd;
    let ars = 0, fee = 0, unvalued = 0, unknownFee = false;
    while (remaining > epsilon && firstLot < meta.length) {
      const lot = meta[firstLot];
      const used = Math.min(remaining, lot.units);
      const share = used / lot.units;
      const feeUsed = lot.fee * share;
      const cost = take(lot, used);
      lot.fee -= feeUsed;
      ars += cost.ars;
      fee += feeUsed;
      unvalued += cost.unvalued;
      unknownFee ||= lot.unknownFee;
      remaining -= used;
      if (lot.units <= epsilon) firstLot++;
    }
    if (day < start) continue;
    unvalued = money(unvalued + remaining);
    valuedArs += ars;
    valuedFee += fee;
    valuedUsd += usd - unvalued;
    valuedDays.push({
      day, usd, unvaluedUsd: unvalued,
      spendArs: ars > 0 || !unvalued ? money(ars) : null,
      feeArs: fee > 0 || (!unvalued && !unknownFee) ? money(fee) : null,
    });
  }
  return {
    days: valuedDays,
    arsPerUsdt: valuedUsd > 0 ? valuedArs / valuedUsd : null,
    feeRate: valuedArs > 0 ? valuedFee / valuedArs : null,
    redot: redotCharges,
    transfers,
    purchaseReferences: [...purchaseReferences],
  };
}

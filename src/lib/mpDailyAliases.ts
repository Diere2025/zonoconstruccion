import type { AccountIncome } from './mpAccountIncome';
import { getMPPaymentDayBounds } from './mpPaymentDate';

export const MP_ALIAS_LIMITS = [
  { id: 'diegozono_mp', alias: 'diegozono.mp', limit: 40_000_000 },
  { id: 'pagoszono_26', alias: 'pagoszono.26', limit: 40_000_000 },
  { id: 'cesara_daiana_010_mp', alias: 'cobroszono', limit: 20_000_000, overflowLimit: 30_000_000 },
];

export type PublishedAliasDay = { date: string; aliases: string[] };
export type AliasPlan = {
  date: string;
  expected: number;
  usesException: boolean;
  aliases: { alias: string; remaining: number; limit: number }[];
};
export type DailyAliases = {
  today: string;
  tomorrow: string;
  published: PublishedAliasDay[];
  plan?: AliasPlan;
};

export function nextAliasDay(today: string) {
  return getMPPaymentDayBounds(today)!.endExclusiveIso.slice(0, 10);
}

export function suggestDailyAliases(accounts: AccountIncome[], today: string): AliasPlan {
  const date = nextAliasDay(today);
  const newMonth = date.slice(0, 7) !== today.slice(0, 7);
  const eligible = MP_ALIAS_LIMITS.flatMap(policy => {
    const account = accounts.find(item => item.id === policy.id && item.asOf === today);
    if (!account) return [];
    return [{
      ...policy,
      available: account.isActive && account.name.trim().toLowerCase() === policy.alias,
      used: newMonth ? 0 : Math.round(account.monthAmount * 100),
      customerReceipts: Math.round(account.todayCustomerAmount * 100),
    }];
  });
  const expected = eligible.reduce((sum, item) => sum + item.customerReceipts, 0);

  function findPair(allowOverflow: boolean) {
    const ranked = eligible.filter(item => item.available).map(item => {
      const limit = (allowOverflow ? item.overflowLimit ?? item.limit : item.limit) * 100;
      return { alias: item.alias, limit, room: limit - item.used, pace: item.used / limit };
    }).filter(item => item.room > 0).sort((a, b) => a.pace - b.pace);

    for (const [index, first] of ranked.entries()) {
      const second = ranked.slice(index + 1).find(item => first.room + item.room >= expected);
      if (second) return [first, second].map(item => ({
        alias: item.alias, remaining: item.room / 100, limit: item.limit / 100,
      }));
    }
    return [];
  }

  const regular = findPair(false);
  const aliases = regular.length ? regular : findPair(true);
  return { date, expected: expected / 100, aliases, usesException: !regular.length && aliases.length > 0 };
}

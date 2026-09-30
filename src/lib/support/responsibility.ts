import type { SupportMe } from './types';

export function pendingResponsibilityFilter(me: Pick<SupportMe, 'user_id' | 'is_admin' | 'sector_ids'>): string {
    const personal = `assignee_id.eq.${me.user_id}`;
    if (me.is_admin) return `${personal},assignee_id.is.null`;
    if (!me.sector_ids.length) return personal;
    return `${personal},and(assignee_id.is.null,sector_id.in.(${me.sector_ids.join(',')}))`;
}

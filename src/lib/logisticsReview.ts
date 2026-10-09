export const LOGISTICS_REVIEW_SETTING = 'logistics_full_review';
export type LogisticsReview = { mode: 'recent' | 'full'; since: string | null; weeklyDue: boolean; today: string };
export function logisticsReviewPolicy(options: { reviewMode?: string; reviewDays?: number; reviewSince?: string }, completedAt: string | null, now = new Date()): LogisticsReview {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const completed = completedAt ? Date.parse(completedAt) : NaN;
  const weeklyDue = !Number.isFinite(completed) || now.getTime() - completed >= 7 * 86400000;
  if (options.reviewMode === 'full' || (options.reviewMode !== 'resolved-recent' && weeklyDue)) return { mode: 'full', since: null, weeklyDue, today };
  const days = options.reviewDays === 7 ? 7 : 3;
  const since = options.reviewSince || new Date(Date.parse(today + 'T12:00:00Z') - (days - 1) * 86400000).toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(since) || !Number.isFinite(Date.parse(since + 'T12:00:00Z')) || new Date(since + 'T12:00:00Z').toISOString().slice(0,10) !== since || since > today) throw new Error('La fecha desde debe ser válida y no posterior a hoy.');
  return { mode: 'recent', since, weeklyDue, today };
}
export function shouldReviewLogisticsOrder(order: { status: string; realDeliveryDate: string | null; ambiguousDeliveryDate: boolean; preserveCommercialData: boolean }, dbOrder: { status: string; hasRealDeliveryDate: boolean } | undefined, review: LogisticsReview): boolean {
  if (review.mode === 'full' || order.preserveCommercialData) return true;
  if (!/entregado/i.test(order.status)) return true;
  if (!dbOrder || dbOrder.status !== 'Entregado' || !dbOrder.hasRealDeliveryDate) return true;
  if (!order.realDeliveryDate || order.ambiguousDeliveryDate) return true;
  return order.realDeliveryDate >= review.since!;
}

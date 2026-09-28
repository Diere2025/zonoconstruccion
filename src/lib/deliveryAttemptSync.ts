/** Only an explicit terminal commercial transition supplies a new outcome.
 * Metadata changes and rerouting must retain historical delivery attempts.
 */
export function centralDeliveryOutcome(previousStatus: string, nextStatus: string): {
  status: "entregado" | "fallido"; failure_reason: string | null;
} | null {
  if (previousStatus === nextStatus) return null;
  if (nextStatus === "Entregado") return { status: "entregado", failure_reason: null };
  if (nextStatus === "Cancelado") return { status: "fallido", failure_reason: "cancelado" };
  return null;
}

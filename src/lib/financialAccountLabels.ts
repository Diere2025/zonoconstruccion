/** Display-only cleanup; original account names remain available for imports and exports. */
export function financialAccountLabel(name: string | null | undefined) {
  return (name || '').replace(/\bcajas?\b/gi, '').replace(/\s+/g, ' ').trim() || 'Efectivo';
}

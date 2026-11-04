import { AlertTriangle } from 'lucide-react';
import { getTankBaseWarnings } from '@/lib/tankBaseCompatibility';

export default function TankBaseWarning({ items, onReview }: {
  items: readonly { name: string; sku?: string; quantity: number }[];
  onReview?: () => void;
}) {
  const warnings = getTankBaseWarnings(items);
  if (!warnings.length) return null;
  return (
    <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950 space-y-2">
      <p className="flex items-center gap-2 font-bold"><AlertTriangle className="h-4 w-4 shrink-0" /> Revisar compatibilidad de tanque y base</p>
      {warnings.map(warning => <p key={warning.key}>{warning.message}</p>)}
      {onReview && <button type="button" onClick={onReview} className="font-bold underline cursor-pointer">Revisar y cambiar la base</button>}
    </div>
  );
}

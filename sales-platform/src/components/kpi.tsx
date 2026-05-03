import { cn } from '@/lib/cn';

export function Kpi({
  label, value, sub, accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: 'brand' | 'success' | 'warn' | 'danger' | 'info';
}) {
  return (
    <div className={cn(
      'rounded-xl border border-white/10 bg-white/5 p-5',
      accent === 'success' && 'border-emerald-500/30 bg-emerald-500/5',
      accent === 'warn' && 'border-amber-500/30 bg-amber-500/5',
      accent === 'danger' && 'border-rose-500/30 bg-rose-500/5',
      accent === 'info' && 'border-sky-500/30 bg-sky-500/5',
      accent === 'brand' && 'border-brand-500/30 bg-brand-500/5',
    )}>
      <div className="text-xs uppercase tracking-wide text-white/60">{label}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
      {sub && <div className="text-xs text-white/50 mt-1">{sub}</div>}
    </div>
  );
}

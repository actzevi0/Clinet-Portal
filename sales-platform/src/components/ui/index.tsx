import * as React from 'react';
import { cn } from '@/lib/cn';

// ─── Button ─────────────────────────────────────────────────
type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
type BtnSize = 'sm' | 'md' | 'lg';

const btnBase = 'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500';
const btnVariants: Record<BtnVariant, string> = {
  primary:   'bg-brand-500 text-white hover:bg-brand-600 active:bg-brand-700',
  secondary: 'bg-white/10 text-white hover:bg-white/20 border border-white/15',
  ghost:     'text-white/80 hover:bg-white/10',
  danger:    'bg-rose-600 text-white hover:bg-rose-700',
  outline:   'border border-white/20 text-white hover:bg-white/5',
};
const btnSizes: Record<BtnSize, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: BtnVariant;
  size?: BtnSize;
}
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', className, ...rest }, ref) => (
    <button ref={ref} className={cn(btnBase, btnVariants[variant], btnSizes[size], className)} {...rest} />
  ),
);
Button.displayName = 'Button';

// ─── Card ───────────────────────────────────────────────────
export const Card = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('rounded-xl border border-white/10 bg-white/5 p-5', className)} {...p} />
);
export const CardTitle = ({ className, ...p }: React.HTMLAttributes<HTMLHeadingElement>) => (
  <h2 className={cn('text-lg font-semibold mb-3', className)} {...p} />
);

// ─── Input / Select / Textarea ─────────────────────────────
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...p }, ref) => (
    <input
      ref={ref}
      className={cn(
        'h-10 w-full rounded-lg border border-white/15 bg-white/5 px-3 text-sm placeholder:text-white/30',
        'focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500',
        className,
      )}
      {...p}
    />
  ),
);
Input.displayName = 'Input';

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...p }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'min-h-[80px] w-full rounded-lg border border-white/15 bg-white/5 p-3 text-sm placeholder:text-white/30',
        'focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500',
        className,
      )}
      {...p}
    />
  ),
);
Textarea.displayName = 'Textarea';

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...p }, ref) => (
    <select
      ref={ref}
      className={cn(
        'h-10 w-full rounded-lg border border-white/15 bg-white/5 px-3 text-sm',
        'focus:outline-none focus:ring-2 focus:ring-brand-500',
        className,
      )}
      {...p}
    >
      {children}
    </select>
  ),
);
Select.displayName = 'Select';

// ─── Label / Field ─────────────────────────────────────────
export const Label = ({ className, ...p }: React.LabelHTMLAttributes<HTMLLabelElement>) => (
  <label className={cn('text-xs font-medium text-white/60 mb-1.5 block', className)} {...p} />
);

export const Field = ({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: React.ReactNode }) => (
  <div>
    <Label>{label}</Label>
    {children}
    {hint && !error && <p className="mt-1 text-xs text-white/40">{hint}</p>}
    {error && <p className="mt-1 text-xs text-rose-400">{error}</p>}
  </div>
);

// ─── Badge ─────────────────────────────────────────────────
export const Badge = ({ className, children, ...p }: React.HTMLAttributes<HTMLSpanElement>) => (
  <span
    className={cn(
      'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
      'bg-white/10 text-white border border-white/10',
      className,
    )}
    {...p}
  >
    {children}
  </span>
);

// ─── Table ─────────────────────────────────────────────────
export const Table = ({ className, ...p }: React.HTMLAttributes<HTMLTableElement>) => (
  <div className="overflow-auto rounded-xl border border-white/10">
    <table className={cn('min-w-full text-sm', className)} {...p} />
  </div>
);
export const Thead = ({ className, ...p }: React.HTMLAttributes<HTMLTableSectionElement>) => (
  <thead className={cn('bg-white/5 text-xs uppercase tracking-wide text-white/60', className)} {...p} />
);
export const Th = ({ className, ...p }: React.ThHTMLAttributes<HTMLTableCellElement>) => (
  <th className={cn('px-4 py-3 text-right font-medium', className)} {...p} />
);
export const Tr = ({ className, ...p }: React.HTMLAttributes<HTMLTableRowElement>) => (
  <tr className={cn('border-t border-white/5 hover:bg-white/5', className)} {...p} />
);
export const Td = ({ className, ...p }: React.TdHTMLAttributes<HTMLTableCellElement>) => (
  <td className={cn('px-4 py-3 align-middle', className)} {...p} />
);

// ─── Empty state ───────────────────────────────────────────
export const Empty = ({ title, hint, cta }: { title: string; hint?: string; cta?: React.ReactNode }) => (
  <div className="rounded-xl border border-dashed border-white/15 p-12 text-center">
    <p className="text-base font-medium">{title}</p>
    {hint && <p className="mt-1 text-sm text-white/50">{hint}</p>}
    {cta && <div className="mt-4">{cta}</div>}
  </div>
);

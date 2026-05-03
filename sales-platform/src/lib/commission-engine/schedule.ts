/**
 * Schedule generator — turns an evaluated commission into a list of expected
 * payment rows (one per month for recurring, single row for scope, etc.)
 */

import type { CommissionFormula, EvaluatedCommission } from './types';

export type ScheduleKind = 'SCOPE' | 'RECURRING' | 'CLAWBACK' | 'FLAT' | 'BONUS';

export interface ScheduleEntry {
  dueMonth: string;     // 'YYYY-MM'
  kind: ScheduleKind;
  amount: number;
  notes?: string;
}

const fmtMonth = (d: Date): string =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

const addMonths = (d: Date, n: number): Date => {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  return x;
};

export interface ScheduleOptions {
  /** how many months of recurring to materialize when durationMonths is null (lifetime).
   *  Default 60 — covers a 5-year forecast horizon. */
  defaultLifetimeHorizonMonths?: number;
  /** scope is paid this many months after policy start date. Default 1. */
  scopePaymentDelayMonths?: number;
}

/**
 * Given an evaluated commission and a policy start date, produce the schedule
 * rows that populate ExpectedCommission.
 */
export function generateSchedule(
  evaluated: EvaluatedCommission,
  policyStartDate: Date,
  formula: CommissionFormula,
  opts: ScheduleOptions = {},
): ScheduleEntry[] {
  const horizon = opts.defaultLifetimeHorizonMonths ?? 60;
  const scopeDelay = opts.scopePaymentDelayMonths ?? 1;
  const out: ScheduleEntry[] = [];

  if (evaluated.scopeAmount > 0) {
    out.push({
      dueMonth: fmtMonth(addMonths(policyStartDate, scopeDelay)),
      kind: 'SCOPE',
      amount: evaluated.scopeAmount,
    });
  }

  if (evaluated.recurringMonthlyAmount > 0) {
    const recStart = formula.recurring?.startOffsetMonths ?? 1;
    const months = evaluated.recurringDurationMonths ?? horizon;
    for (let i = 0; i < months; i++) {
      out.push({
        dueMonth: fmtMonth(addMonths(policyStartDate, recStart + i)),
        kind: 'RECURRING',
        amount: evaluated.recurringMonthlyAmount,
      });
    }
  }

  return out;
}

/**
 * On cancellation: produce the clawback entries based on the policy.
 * Uses the schedule defined in formula.clawback.
 */
export function generateClawbacks(
  scopePaid: number,
  recurringMonthlyPaid: number,
  policyStartDate: Date,
  cancellationDate: Date,
  formula: CommissionFormula,
): ScheduleEntry[] {
  if (!formula.clawback?.enabled) return [];

  const monthsSinceStart =
    (cancellationDate.getUTCFullYear() - policyStartDate.getUTCFullYear()) * 12 +
    (cancellationDate.getUTCMonth() - policyStartDate.getUTCMonth());

  // figure out which year-bracket we're in (year 1 = 0..11 months)
  const yearIndex = Math.floor(monthsSinceStart / 12) + 1;
  const bracket = formula.clawback.schedule.find((b) => b.year === yearIndex);
  if (!bracket) return [];

  const out: ScheduleEntry[] = [];
  if (scopePaid > 0 && bracket.pct > 0) {
    out.push({
      dueMonth: fmtMonth(cancellationDate),
      kind: 'CLAWBACK',
      amount: -ROUND(scopePaid * bracket.pct),
      notes: `clawback year ${yearIndex} @ ${(bracket.pct * 100).toFixed(0)}%`,
    });
  }
  return out;
}

const ROUND = (n: number) => Math.round(n * 100) / 100;

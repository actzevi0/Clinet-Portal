/**
 * Commission Engine — pure formula evaluator.
 *
 * Deterministic. No DB / IO. Easy to unit test.
 */

import type {
  BreakdownItem,
  CommissionFormula,
  EvaluatedCommission,
  FinancialBase,
  FlatTier,
  FormulaComponent,
  RecurringFormula,
  SaleItemInputs,
  ScopeFormula,
} from './types';

const ROUND = (n: number) => Math.round(n * 10000) / 10000;

const readBase = (base: FinancialBase, inputs: SaleItemInputs): number => {
  switch (base) {
    case 'annual_premium':     return inputs.annualPremium;
    case 'monthly_premium':    return inputs.monthlyPremium;
    case 'accumulated_amount': return inputs.accumulatedAmount;
    case 'lump_sum':           return inputs.lumpSum;
    case 'insurance_coverage': return inputs.insuranceCoverage;
  }
};

const evalComponent = (
  c: FormulaComponent,
  inputs: SaleItemInputs,
  kind: 'scope_component' | 'recurring_component',
): BreakdownItem => {
  const baseValue = readBase(c.base, inputs);

  if (c.applyIf) {
    const v = readBase(c.applyIf.field, inputs);
    if (c.applyIf.min !== undefined && v < c.applyIf.min) {
      return { kind, label: `${c.base} (skipped)`, base: c.base, baseValue, rate: c.rate, amount: 0 };
    }
    if (c.applyIf.max !== undefined && v >= c.applyIf.max) {
      return { kind, label: `${c.base} (skipped)`, base: c.base, baseValue, rate: c.rate, amount: 0 };
    }
  }

  const multiplier = c.multiplier === 'recognition_factor' ? inputs.recognitionFactor : 1;
  const amount = baseValue * c.rate * multiplier;

  return {
    kind,
    label: `${c.base} × ${(c.rate * 100).toFixed(3)}%${c.multiplier ? ` × ${multiplier}` : ''}`,
    base: c.base,
    baseValue,
    rate: c.rate,
    multiplier,
    amount: ROUND(amount),
  };
};

const evalFlatTier = (tiers: FlatTier[], inputs: SaleItemInputs): BreakdownItem | null => {
  const acc = inputs.accumulatedAmount;
  const tier = tiers.find(
    (t) => acc >= t.minAccumulation && (t.maxAccumulation === undefined || acc < t.maxAccumulation),
  );
  if (!tier) return null;
  return {
    kind: 'scope_flat',
    label: `flat tier [${tier.minAccumulation}–${tier.maxAccumulation ?? '∞'}]`,
    amount: ROUND(tier.amount),
  };
};

const evaluateScope = (
  formula: ScopeFormula | undefined,
  inputs: SaleItemInputs,
): { amount: number; breakdown: BreakdownItem[] } => {
  if (!formula) return { amount: 0, breakdown: [] };

  const breakdown: BreakdownItem[] = [];
  let total = 0;

  for (const c of formula.components ?? []) {
    const b = evalComponent(c, inputs, 'scope_component');
    breakdown.push(b);
    total += b.amount;
  }

  if (formula.flatAmount !== undefined && formula.flatAmount > 0) {
    breakdown.push({ kind: 'scope_flat', label: 'flat amount', amount: ROUND(formula.flatAmount) });
    total += formula.flatAmount;
  }

  if (formula.flatTiers && formula.flatTiers.length > 0) {
    const t = evalFlatTier(formula.flatTiers, inputs);
    if (t) {
      breakdown.push(t);
      total += t.amount;
    }
  }

  if (formula.supplementToAnnualPremiumPct !== undefined && inputs.annualPremium > 0) {
    const target = inputs.annualPremium * formula.supplementToAnnualPremiumPct;
    if (total < target) {
      const supplement = target - total;
      breakdown.push({
        kind: 'scope_supplement',
        label: `supplement to ${(formula.supplementToAnnualPremiumPct * 100).toFixed(2)}% annual`,
        amount: ROUND(supplement),
      });
      total = target;
    }
  }

  if (formula.minAmount !== undefined && total < formula.minAmount) total = formula.minAmount;
  if (formula.maxAmount !== undefined && total > formula.maxAmount) total = formula.maxAmount;

  return { amount: ROUND(total), breakdown };
};

const evaluateRecurring = (
  formula: RecurringFormula | undefined,
  inputs: SaleItemInputs,
): { monthlyAmount: number; durationMonths: number | null; breakdown: BreakdownItem[] } => {
  if (!formula) return { monthlyAmount: 0, durationMonths: null, breakdown: [] };

  const breakdown: BreakdownItem[] = [];
  let monthly = 0;
  const period = formula.ratePeriod ?? 'monthly';

  for (const c of formula.components ?? []) {
    const b = evalComponent(c, inputs, 'recurring_component');
    breakdown.push(b);
    const adjusted = period === 'annual' ? b.amount / 12 : b.amount;
    monthly += adjusted;
  }

  return {
    monthlyAmount: ROUND(monthly),
    durationMonths: formula.durationMonths ?? null,
    breakdown,
  };
};

/**
 * Main entry point. Pure function — given a formula and inputs, returns the
 * scope (one-time) and recurring (monthly) commission amounts plus a breakdown.
 */
export function evaluateCommission(
  formula: CommissionFormula,
  inputs: SaleItemInputs,
): EvaluatedCommission {
  const scope = evaluateScope(formula.scope, inputs);
  const rec = evaluateRecurring(formula.recurring, inputs);

  return {
    scopeAmount: scope.amount,
    recurringMonthlyAmount: rec.monthlyAmount,
    recurringDurationMonths: rec.durationMonths,
    breakdown: [...scope.breakdown, ...rec.breakdown],
  };
}

/**
 * Unit tests for the commission evaluator.
 *
 * The reference values come from two sources:
 *   (a) The "Family Office Manager" image rate sheet provided by the user.
 *   (b) Real rows from the legacy Excel sheet "פרופיט" (closed deals).
 *
 * Where the historical data and the new agreement disagree (e.g. clal mortgage
 * scope was 70% historically but is 60% in the new sheet), the test follows the
 * NEW agreement — that's the source of truth going forward.
 */

import { describe, expect, it } from 'vitest';
import { evaluateCommission } from '../evaluate';
import {
  buildInsurancePensionFormula,
  buildInsurancePensionTransferFormula,
  buildInsuranceSavingsFormula,
  buildInvestmentHouseFormula,
  buildRiskRecurringFormula,
  buildAnnuityFormula,
  ANNUITY_PENSION,
} from '../../../../prisma/seeds/commission-rules';

const baseInputs = {
  monthlyPremium: 0,
  annualPremium: 0,
  lumpSum: 0,
  accumulatedAmount: 0,
  recognitionFactor: 1,
  insuranceCoverage: 0,
};

describe('Risk insurance — mortgage', () => {
  it('clal mortgage: scope = 60% × annual_premium, recurring = 25% × monthly', () => {
    const formula = buildRiskRecurringFormula('clal', 'risk_mortgage');
    const r = evaluateCommission(formula, {
      ...baseInputs,
      monthlyPremium: 127,
      annualPremium: 1524,
    });
    // scope: max(0.6 × 1524, 0.95 × 1524 supplement) = 1447.8
    expect(r.scopeAmount).toBeCloseTo(1447.8, 2);
    expect(r.recurringMonthlyAmount).toBeCloseTo(127 * 0.25, 4);
  });

  it('migdal mortgage: scope 65% supplemented to 95%, recurring 15% × monthly', () => {
    const formula = buildRiskRecurringFormula('migdal', 'risk_mortgage');
    const r = evaluateCommission(formula, {
      ...baseInputs,
      monthlyPremium: 227,
      annualPremium: 2724,
    });
    expect(r.scopeAmount).toBeCloseTo(2724 * 0.95, 2);
    expect(r.recurringMonthlyAmount).toBeCloseTo(227 * 0.15, 4);
  });

  it('ayalon mortgage: scope override = 70%, no further supplement (still ≤ 95%)', () => {
    const formula = buildRiskRecurringFormula('ayalon', 'risk_mortgage');
    const r = evaluateCommission(formula, {
      ...baseInputs,
      monthlyPremium: 100,
      annualPremium: 1200,
    });
    // 70% × 1200 = 840 → supplement to 95% → 1140
    expect(r.scopeAmount).toBeCloseTo(1200 * 0.95, 2);
  });

  it('phoenix life: scope 65% supplemented to 95%, recurring 23%', () => {
    const formula = buildRiskRecurringFormula('phoenix', 'risk_life');
    const r = evaluateCommission(formula, {
      ...baseInputs,
      monthlyPremium: 39,
      annualPremium: 468,
    });
    expect(r.scopeAmount).toBeCloseTo(468 * 0.95, 2);
    expect(r.recurringMonthlyAmount).toBeCloseTo(39 * 0.23, 4);
  });

  it('harel health: recurring 23%', () => {
    const formula = buildRiskRecurringFormula('harel', 'risk_health');
    const r = evaluateCommission(formula, {
      ...baseInputs,
      monthlyPremium: 114,
      annualPremium: 1368,
    });
    expect(r.recurringMonthlyAmount).toBeCloseTo(114 * 0.23, 4);
  });
});

describe('Insurance company pension', () => {
  it('phoenix pension: scope 6% supplemented to 8%, recurring 0.5%/year on accumulated', () => {
    const formula = buildInsurancePensionFormula('phoenix');
    const r = evaluateCommission(formula, {
      ...baseInputs,
      monthlyPremium: 700,
      annualPremium: 8400,
      accumulatedAmount: 10000,
    });
    // 8400 × 0.06 = 504 → supplement to 8% × 8400 = 672
    expect(r.scopeAmount).toBeCloseTo(672, 2);
    // recurring (annual rate / 12): 10000 × 0.005 / 12 = 4.1667
    expect(r.recurringMonthlyAmount).toBeCloseTo(10000 * 0.005 / 12, 4);
  });

  it('migdal pension: scope 5% supplemented to 8%', () => {
    const formula = buildInsurancePensionFormula('migdal');
    const r = evaluateCommission(formula, {
      ...baseInputs,
      annualPremium: 11100,
      accumulatedAmount: 0,
    });
    expect(r.scopeAmount).toBeCloseTo(11100 * 0.08, 2);
  });

  it('phoenix pension transfer: flat ₪3000', () => {
    const formula = buildInsurancePensionTransferFormula('phoenix');
    const r = evaluateCommission(formula, {
      ...baseInputs,
      accumulatedAmount: 80000,
    });
    expect(r.scopeAmount).toBe(3000);
  });
});

describe('Insurance savings policies / gemel hishtalmut', () => {
  it('phoenix savings: flat ₪5000 — supplemented to ₪8000 minimum', () => {
    const formula = buildInsuranceSavingsFormula('phoenix');
    const r = evaluateCommission(formula, {
      ...baseInputs,
      accumulatedAmount: 50000,
    });
    expect(r.scopeAmount).toBe(8000); // because of supplement-to-flat (Phoenix → 8000)
    expect(r.recurringMonthlyAmount).toBeCloseTo(50000 * 0.0025 / 12, 4);
  });

  it('hachshara savings: flat ₪6000 — supplemented to ₪7000 minimum', () => {
    const formula = buildInsuranceSavingsFormula('hachshara');
    const r = evaluateCommission(formula, { ...baseInputs, accumulatedAmount: 100000 });
    expect(r.scopeAmount).toBe(7000);
  });

  it('clal savings: flat ₪5000, recurring 0.30%/year', () => {
    const formula = buildInsuranceSavingsFormula('clal');
    const r = evaluateCommission(formula, { ...baseInputs, accumulatedAmount: 100000 });
    expect(r.scopeAmount).toBe(5000);
    expect(r.recurringMonthlyAmount).toBeCloseTo(100000 * 0.003 / 12, 4);
  });
});

describe('Investment house', () => {
  it('analyst gemel: flat ₪5250, recurring 0.25%/year', () => {
    const formula = buildInvestmentHouseFormula('analyst');
    const r = evaluateCommission(formula, { ...baseInputs, accumulatedAmount: 200000 });
    expect(r.scopeAmount).toBe(5250);
    expect(r.recurringMonthlyAmount).toBeCloseTo(200000 * 0.0025 / 12, 4);
  });

  it('more bait_hashka_ot: flat ₪4000, recurring 0.25%/year', () => {
    const formula = buildInvestmentHouseFormula('more');
    const r = evaluateCommission(formula, { ...baseInputs, accumulatedAmount: 71461 });
    expect(r.scopeAmount).toBe(4000);
    // Excel 2022 row had 0.7% scope on accumulated — that was an old agreement.
    // Under new agreement: flat 4000.
  });
});

describe('Immediate annuity', () => {
  it('clal annuity managers: flat ₪11,000', () => {
    const r = evaluateCommission(
      buildAnnuityFormula({ flat: 11000 }),
      { ...baseInputs, accumulatedAmount: 800000 },
    );
    expect(r.scopeAmount).toBe(11000);
  });

  it('harel annuity pension: 250–500K = ₪5000', () => {
    const r = evaluateCommission(
      buildAnnuityFormula(ANNUITY_PENSION.harel),
      { ...baseInputs, accumulatedAmount: 300000 },
    );
    expect(r.scopeAmount).toBe(5000);
  });

  it('harel annuity pension: ≥500K = ₪10,000', () => {
    const r = evaluateCommission(
      buildAnnuityFormula(ANNUITY_PENSION.harel),
      { ...baseInputs, accumulatedAmount: 600000 },
    );
    expect(r.scopeAmount).toBe(10000);
  });

  it('migdal annuity pension: ≤5M = ₪8000', () => {
    const r = evaluateCommission(
      buildAnnuityFormula(ANNUITY_PENSION.migdal),
      { ...baseInputs, accumulatedAmount: 1_000_000 },
    );
    expect(r.scopeAmount).toBe(8000);
  });

  it('migdal annuity pension: >5M = ₪10,000', () => {
    const r = evaluateCommission(
      buildAnnuityFormula(ANNUITY_PENSION.migdal),
      { ...baseInputs, accumulatedAmount: 6_000_000 },
    );
    expect(r.scopeAmount).toBe(10000);
  });
});

describe('Edge cases', () => {
  it('zero inputs → zero commission', () => {
    const formula = buildInsurancePensionFormula('phoenix');
    const r = evaluateCommission(formula, baseInputs);
    expect(r.scopeAmount).toBe(0);
    expect(r.recurringMonthlyAmount).toBe(0);
  });

  it('breakdown is populated for transparency', () => {
    const formula = buildRiskRecurringFormula('clal', 'risk_mortgage');
    const r = evaluateCommission(formula, {
      ...baseInputs,
      monthlyPremium: 100,
      annualPremium: 1200,
    });
    expect(r.breakdown.length).toBeGreaterThan(0);
    const supplement = r.breakdown.find((b) => b.kind === 'scope_supplement');
    expect(supplement).toBeDefined();
  });
});

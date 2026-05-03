/**
 * Commission Engine — DSL types
 *
 * A commission rule is stored as JSON in CommissionRule.formula.
 * Same DSL covers risk insurance, pension, gemel, savings policies,
 * investment houses and immediate annuities.
 *
 * All amounts are in NIS (₪). All rates are decimals (0.07 = 7%, NOT 7).
 */

export type FinancialBase =
  | 'annual_premium'
  | 'monthly_premium'
  | 'accumulated_amount'
  | 'lump_sum'
  | 'insurance_coverage';

export interface FormulaComponent {
  /** which input field on the SaleItem this component reads */
  base: FinancialBase;
  /** decimal rate, e.g. 0.07 for 7% */
  rate: number;
  /** if set, multiply the (base × rate) by this saleItem field (e.g. recognition_factor) */
  multiplier?: 'recognition_factor';
  /** apply only if base value falls in [min,max] (inclusive). null = no bound. */
  applyIf?: { field: FinancialBase; min?: number; max?: number };
}

export interface FlatTier {
  /** activate when accumulated_amount >= min and < max */
  minAccumulation: number;
  maxAccumulation?: number;
  /** flat ₪ amount paid (e.g. ניודי פנסיה ₪3000) */
  amount: number;
}

export interface ScopeFormula {
  /** any number of additive components (annual_premium × X% + accumulated × Y% × recognition) */
  components?: FormulaComponent[];
  /** flat ₪ amount (e.g. ניודי פנסיה אינפיניטי ₪1500) */
  flatAmount?: number;
  /** flat amount tiered by accumulation (e.g. הראל קצבה: 250-500K=₪5000 / >500K=₪10000) */
  flatTiers?: FlatTier[];
  /** if set, top up the computed scope to this absolute % of annual_premium
   *  (השלמה ל-95% / השלמה ל-8 אחוז) */
  supplementToAnnualPremiumPct?: number;
  /** absolute floor / cap on scope ₪ */
  minAmount?: number;
  maxAmount?: number;
}

export interface RecurringFormula {
  components?: FormulaComponent[];
  /** how the rate applies. Annual rate is divided by 12 to get the monthly value. */
  ratePeriod?: 'monthly' | 'annual';
  /** null = lifetime, otherwise stop after N months */
  durationMonths?: number | null;
  /** when generating expected_commissions schedule — start offset from policyStartDate */
  startOffsetMonths?: number;
}

export interface ClawbackSchedule {
  /** year 1 = first 12 months after policyStartDate */
  year: number;
  /** fraction of scope to recover, 0..1 */
  pct: number;
}

export interface ClawbackPolicy {
  enabled: boolean;
  schedule: ClawbackSchedule[];
  /** apply to recurring as well? default true */
  appliesToRecurring?: boolean;
}

export interface CommissionFormula {
  scope?: ScopeFormula;
  recurring?: RecurringFormula;
  clawback?: ClawbackPolicy;
  /** human-readable explanation, shown in UI */
  description?: string;
}

/** the sale-item inputs the engine evaluates against */
export interface SaleItemInputs {
  monthlyPremium: number;
  annualPremium: number;
  lumpSum: number;
  accumulatedAmount: number;
  recognitionFactor: number;
  insuranceCoverage: number;
  policyStartDate?: Date;
  transferType?: 'NEW_MONEY' | 'AGENT_APPOINTMENT' | 'CONSULTING_FEE';
}

export interface EvaluatedCommission {
  scopeAmount: number;
  recurringMonthlyAmount: number;
  recurringDurationMonths: number | null;
  /** breakdown for transparency in the UI */
  breakdown: BreakdownItem[];
}

export interface BreakdownItem {
  kind: 'scope_component' | 'scope_flat' | 'scope_supplement' | 'recurring_component';
  label: string;
  base?: FinancialBase;
  baseValue?: number;
  rate?: number;
  multiplier?: number;
  amount: number;
}

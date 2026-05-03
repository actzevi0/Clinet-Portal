/**
 * Commission rule seed — encodes the "עמלת מנהל פמילי אופיס" agreement
 * (the image provided by the user).
 *
 * Notes column from the image:
 * - היקף סיכונים: השלמה בכל החברות ל-95% (Talpiot supplements scope to 95% of annual_premium)
 * - היקף פנסיוני חברות ביטוח: השלמה ל-8 אחוז
 * - ריסקים-שנה ראשונה 100% שנה שניה 60% שנה שלישית 40% (clawback)
 * - שנתיים ביטולים 100% שנה א או 50% שנה ב (insurance-house pension transfer)
 * - 3 שנים ביטולים במור אלטשולר ומיטב (100/50/25)
 * - בריאות: ביטולים שנה ב במתווה
 *
 * IMPORTANT: rates are stored as decimals. 60% = 0.6.
 * "annual_premium" basis maps to SaleItem.annualPremium.
 * "monthly_premium" basis maps to SaleItem.monthlyPremium.
 * "accumulated_amount" basis maps to SaleItem.accumulatedAmount.
 *
 * For רtable-driven entries we record the company → numeric rate map and
 * then build CommissionFormula objects in the seed function.
 */

import type { CommissionFormula } from '../../src/lib/commission-engine/types';

// ─── Risk Insurance ────────────────────────────────────────────────
// Companies: phoenix, clal, harel, menora, migdal, hachshara, ayalon

/** היקף סיכונים — % of annual_premium, with supplement to 95% by Talpiot */
export const RISK_SCOPE_RATES: Record<string, number> = {
  phoenix:   0.65,
  clal:      0.60,
  harel:     0.60,
  menora:    0.65,
  migdal:    0.65,
  hachshara: 0.60,
  ayalon:    0.60,
};

/** ריסק (life) — % of monthly_premium recurring */
export const RISK_LIFE_RECURRING: Record<string, number> = {
  phoenix:   0.23,
  clal:      0.25,
  harel:     0.25,
  menora:    0.23,
  migdal:    0.23,
  hachshara: 0.23,
  ayalon:    0.25,
};

/** משכנתא — % of monthly_premium recurring */
export const RISK_MORTGAGE_RECURRING: Record<string, number> = {
  phoenix:   0.23,
  clal:      0.25,
  harel:     0.19,
  menora:    0.15,
  migdal:    0.15,
  hachshara: 0.15,
  ayalon:    0.15, // standard. NOTE: image notes "משכנתא איילון 70%" applies to scope, see override
};

/** Special override: scope for ayalon mortgage = 70% (from notes) */
export const AYALON_MORTGAGE_SCOPE_OVERRIDE = 0.70;

/** בריאות — % of monthly_premium recurring */
export const RISK_HEALTH_RECURRING: Record<string, number> = {
  phoenix:   0.23,
  clal:      0.23,
  harel:     0.23,
  menora:    0.23,
  migdal:    0.23,
  hachshara: 0.23,
  ayalon:    0.25,
};

/** ריסקים: שנה א 100% / שנה ב 60% / שנה ג 40% — clawback schedule */
export const RISK_CLAWBACK_SCHEDULE = [
  { year: 1, pct: 1.0 },
  { year: 2, pct: 0.6 },
  { year: 3, pct: 0.4 },
];

// ─── Insurance company pension ─────────────────────────────────────
// Companies: phoenix, clal, harel, menora, migdal

/** היקף — % of annual_premium, supplement to 8% from Talpiot */
export const INS_PENSION_SCOPE: Record<string, number> = {
  phoenix: 0.06,
  clal:    0.0585,
  harel:   0.0585,
  menora:  0.06,
  migdal:  0.05,
};

/** נפרעים — annual rate on accumulated_amount (paid monthly = /12) */
export const INS_PENSION_RECURRING_ANNUAL: Record<string, number> = {
  phoenix: 0.005,
  clal:    0.005,
  harel:   0.005,
  menora:  0.005,
  migdal:  0.004,
};

/** ניודי פנסיה — flat ₪ amount per transfer */
export const INS_PENSION_TRANSFER_FLAT: Record<string, number> = {
  phoenix: 3000,
  clal:    2500, // "ישיר מהראל" per the note ⇒ verify, but listed in clal column
  harel:   2500,
  menora:  3000,
  migdal:  3000, // "בכפוף לידיעון מגדל"
};

/** Insurance-house pension clawback: שנה א 100% / שנה ב 50% (from notes) */
export const INS_PENSION_CLAWBACK_SCHEDULE = [
  { year: 1, pct: 1.0 },
  { year: 2, pct: 0.5 },
];

// ─── Investment-house pension ─────────────────────────────────────
// Companies: meitav, altshuler, more, infinity

/** היקף — % of annual_premium */
export const INV_PENSION_SCOPE: Record<string, number> = {
  meitav:    0.03,
  altshuler: 0,        // image: "0"
  more:      0.04,
  infinity:  0.0005,   // image: "0.05%" → 0.0005
};

/** ניודי פנסיה — flat ₪ amount */
export const INV_PENSION_TRANSFER_FLAT: Record<string, number | null> = {
  meitav:    5000,
  altshuler: 1500,
  more:      null,     // image: "ללא"
  infinity:  null,     // image: "ללא" (note: "באינפיניטי העמלה מצבירה")
};

/** Investment-house pension clawback (more/altshuler/meitav): 100/50/25 over 3 years */
export const INV_PENSION_CLAWBACK_SCHEDULE = [
  { year: 1, pct: 1.0 },
  { year: 2, pct: 0.5 },
  { year: 3, pct: 0.25 },
];

// ─── Insurance-company savings policies / gemel hishtalmut ─────────
// Companies: phoenix, clal, harel, menora, migdal, hachshara, ayalon

/** היקף — flat ₪ per policy */
export const INS_SAVINGS_SCOPE_FLAT: Record<string, number> = {
  phoenix:   5000,
  clal:      5000,
  harel:     4000,
  menora:    5000,
  migdal:    4000,
  hachshara: 6000, // image notes: "הכשרה השלמה ל 7000 ש"ח"
  ayalon:    2500,
};
/** Per the note: hachshara has supplement to ₪7000 — applied as override below */
export const HACHSHARA_SAVINGS_SUPPLEMENT_TO = 7000;
/** Phoenix supplement (from header column): "השלמה לסוף 8000 ש"ח" */
export const PHOENIX_SAVINGS_SUPPLEMENT_TO = 8000;

/** גמל השתלמות — נפרעים, % annual on accumulated */
export const INS_HISHTALMUT_RECURRING_ANNUAL: Record<string, number | null> = {
  phoenix:   0.0025,
  clal:      0.0030,
  harel:     0.0025,
  menora:    0.0025,
  migdal:    0.0025,
  hachshara: 0.0025,
  ayalon:    null,     // "אין מוצר"
};

/** חסכון פיננסי — נפרעים, % annual on accumulated */
export const INS_FINANCIAL_SAVINGS_RECURRING_ANNUAL: Record<string, number | null> = {
  phoenix:   0.0032,
  clal:      0.0030,
  harel:     0.0040,
  menora:    0.0030,
  migdal:    0.0035,
  hachshara: 0.0027,
  ayalon:    0.0020,
};

/** Savings clawback: שנה א 100% / שנה ב 50% */
export const INS_SAVINGS_CLAWBACK_SCHEDULE = [
  { year: 1, pct: 1.0 },
  { year: 2, pct: 0.5 },
];

// ─── Investment houses (gemel/hishtalmut, savings) ─────────────────
// Companies: infinity, analyst, yelin, meitav, altshuler, more

/** היקף — flat ₪ per policy */
export const INV_HOUSE_SCOPE_FLAT: Record<string, number> = {
  infinity:  3000,
  analyst:   5250,
  yelin:     5000,
  meitav:    5000,
  altshuler: 4500,
  more:      4000,
};

/** נפרעים — % annual on accumulated */
export const INV_HOUSE_RECURRING_ANNUAL: Record<string, number> = {
  infinity:  0.004,
  analyst:   0.0025,
  yelin:     0.0027,    // "ילין נפרעים מקבלים מתלפיות עד מיליון" — handled at supplement layer
  meitav:    0.0025,
  altshuler: 0.0025,
  more:      0.0025,
};

/** Investment-house clawback: שנה א 100% / שנה ב 50% */
export const INV_HOUSE_CLAWBACK_SCHEDULE = [
  { year: 1, pct: 1.0 },
  { year: 2, pct: 0.5 },
];

// ─── Immediate Annuity (קצבה מיידית) ──────────────────────────────
// Two product variants: managers, pension. Tiered or flat.

/** מנהלים — flat amount or tiered by accumulation. null = "אין עמלה" */
export interface AnnuityRule {
  flat?: number;
  tiers?: Array<{ minAccumulation: number; maxAccumulation?: number; amount: number }>;
  notes?: string;
}

export const ANNUITY_MANAGERS: Record<string, AnnuityRule | null> = {
  phoenix:   null,                                    // "אין עמלה"
  clal:      { flat: 11000 },
  harel:     {
    tiers: [
      { minAccumulation: 250000, maxAccumulation: 500000, amount: 4000 },
      { minAccumulation: 500000, amount: 9000 },
    ],
  },
  menora:    { flat: 15000, notes: 'בכפוף לטבלת קיסום' },
  migdal:    {
    tiers: [
      { minAccumulation: 0,        maxAccumulation: 5_000_000, amount: 8000 },
      { minAccumulation: 5_000_000, amount: 10000 },
    ],
  },
  meitav:    null,
  altshuler: null,
  more:      null,
};

export const ANNUITY_PENSION: Record<string, AnnuityRule> = {
  phoenix:   { flat: 10000 },
  clal:      { flat: 8000 },
  harel:     {
    tiers: [
      { minAccumulation: 250000, maxAccumulation: 500000, amount: 5000 },
      { minAccumulation: 500000, amount: 10000 },
    ],
  },
  menora:    { flat: 15000, notes: 'בכפוף לטבלת קיסום, בהתאם לנספח' },
  migdal:    {
    tiers: [
      { minAccumulation: 0,         maxAccumulation: 5_000_000, amount: 8000 },
      { minAccumulation: 5_000_000, amount: 10000 },
    ],
  },
  meitav:    { flat: 10000 },
  altshuler: { flat: 8000 },
  more:      { flat: 7000 },
};

// ─── Helpers to build CommissionFormula from the tables above ─────

export const buildRiskScopeFormula = (companyCode: string): CommissionFormula => {
  // Special: ayalon mortgage scope override = 70% (handled at rule subKey='risk_mortgage')
  return {
    scope: {
      components: [
        { base: 'annual_premium', rate: RISK_SCOPE_RATES[companyCode] ?? 0 },
      ],
      supplementToAnnualPremiumPct: 0.95, // השלמה ל-95% by Talpiot
    },
    description: `סיכונים ${companyCode} — היקף ${(RISK_SCOPE_RATES[companyCode] * 100).toFixed(0)}% (השלמה ל-95%)`,
  };
};

export const buildRiskRecurringFormula = (
  companyCode: string,
  subKey: 'risk_life' | 'risk_mortgage' | 'risk_health',
): CommissionFormula => {
  const map = {
    risk_life:     RISK_LIFE_RECURRING,
    risk_mortgage: RISK_MORTGAGE_RECURRING,
    risk_health:   RISK_HEALTH_RECURRING,
  }[subKey];
  const scope = subKey === 'risk_mortgage' && companyCode === 'ayalon'
    ? AYALON_MORTGAGE_SCOPE_OVERRIDE
    : RISK_SCOPE_RATES[companyCode] ?? 0;

  return {
    scope: {
      components: [{ base: 'annual_premium', rate: scope }],
      supplementToAnnualPremiumPct: 0.95,
    },
    recurring: {
      components: [{ base: 'monthly_premium', rate: map[companyCode] ?? 0 }],
      ratePeriod: 'monthly',
      durationMonths: null,
    },
    clawback: {
      enabled: true,
      schedule: RISK_CLAWBACK_SCHEDULE,
    },
    description: `${subKey} ${companyCode} — שוטף ${(map[companyCode] * 100).toFixed(0)}%, היקף ${(scope * 100).toFixed(0)}%`,
  };
};

export const buildInsurancePensionFormula = (companyCode: string): CommissionFormula => ({
  scope: {
    components: [{ base: 'annual_premium', rate: INS_PENSION_SCOPE[companyCode] ?? 0 }],
    supplementToAnnualPremiumPct: 0.08,
  },
  recurring: {
    components: [{ base: 'accumulated_amount', rate: INS_PENSION_RECURRING_ANNUAL[companyCode] ?? 0 }],
    ratePeriod: 'annual',
    durationMonths: null,
  },
  clawback: { enabled: true, schedule: INS_PENSION_CLAWBACK_SCHEDULE },
  description: `פנסיה ${companyCode}`,
});

export const buildInsurancePensionTransferFormula = (companyCode: string): CommissionFormula => ({
  scope: { flatAmount: INS_PENSION_TRANSFER_FLAT[companyCode] ?? 0 },
  clawback: { enabled: true, schedule: INS_PENSION_CLAWBACK_SCHEDULE },
  description: `ניוד פנסיה ${companyCode} — ${INS_PENSION_TRANSFER_FLAT[companyCode]}₪`,
});

export const buildInvestmentPensionFormula = (companyCode: string): CommissionFormula => ({
  scope: {
    components: [{ base: 'annual_premium', rate: INV_PENSION_SCOPE[companyCode] ?? 0 }],
  },
  clawback: { enabled: true, schedule: INV_PENSION_CLAWBACK_SCHEDULE },
  description: `פנסיה בית השקעות ${companyCode}`,
});

export const buildInsuranceSavingsFormula = (companyCode: string): CommissionFormula => {
  const supplement =
    companyCode === 'hachshara' ? HACHSHARA_SAVINGS_SUPPLEMENT_TO :
    companyCode === 'phoenix'   ? PHOENIX_SAVINGS_SUPPLEMENT_TO :
    undefined;
  return {
    scope: {
      flatAmount: INS_SAVINGS_SCOPE_FLAT[companyCode] ?? 0,
      ...(supplement
        ? { minAmount: supplement } // simple representation: "supplement to flat ₪" floor
        : {}),
    },
    recurring: {
      components: [
        { base: 'accumulated_amount', rate: INS_HISHTALMUT_RECURRING_ANNUAL[companyCode] ?? 0 },
      ],
      ratePeriod: 'annual',
      durationMonths: null,
    },
    clawback: { enabled: true, schedule: INS_SAVINGS_CLAWBACK_SCHEDULE },
    description: `פיננסים ${companyCode}`,
  };
};

export const buildInvestmentHouseFormula = (companyCode: string): CommissionFormula => ({
  scope: { flatAmount: INV_HOUSE_SCOPE_FLAT[companyCode] ?? 0 },
  recurring: {
    components: [
      { base: 'accumulated_amount', rate: INV_HOUSE_RECURRING_ANNUAL[companyCode] ?? 0 },
    ],
    ratePeriod: 'annual',
    durationMonths: null,
  },
  clawback: { enabled: true, schedule: INV_HOUSE_CLAWBACK_SCHEDULE },
  description: `בית השקעות ${companyCode}`,
});

export const buildAnnuityFormula = (rule: AnnuityRule): CommissionFormula => ({
  scope: {
    flatAmount: rule.flat,
    flatTiers: rule.tiers?.map(t => ({
      minAccumulation: t.minAccumulation,
      maxAccumulation: t.maxAccumulation,
      amount: t.amount,
    })),
  },
  description: `קצבה מיידית${rule.notes ? ` (${rule.notes})` : ''}`,
});

/**
 * Canonical product type catalog.
 * `category` aligns with Prisma enum ProductCategory.
 * `fieldsSchema` is a (subset of) JSON Schema used to render dynamic forms.
 */

type ProductCategoryStr =
  | 'PENSION'
  | 'GEMEL_HISHTALMUT'
  | 'GEMEL_INVESTMENT'
  | 'SAVINGS_POLICY'
  | 'RISK'
  | 'IMMEDIATE_ANNUITY'
  | 'MORTGAGE'
  | 'ALTERNATIVE'
  | 'IRA'
  | 'TRAVEL'
  | 'BUSINESS'
  | 'AUTO'
  | 'HOME'
  | 'OTHER';

interface ProductTypeSeed {
  code: string;
  nameHe: string;
  category: ProductCategoryStr;
  fieldsSchema: Record<string, unknown>;
  supportsAccumulation?: boolean;
  supportsMonthlyPremium?: boolean;
}

const trackEnum = ['מנייתי', 'כללי', 'אג״ח', 'מותאם אישית', 'הלכה'];

export const PRODUCT_TYPES: ProductTypeSeed[] = [
  // PENSION
  {
    code: 'pension_fund',
    nameHe: 'קרן פנסיה',
    category: 'PENSION',
    fieldsSchema: {
      type: 'object',
      required: ['track'],
      properties: {
        track: { enum: trackEnum },
        managementFeePremium: { type: 'number', minimum: 0, maximum: 6 },
        managementFeeSavings: { type: 'number', minimum: 0, maximum: 1.05 },
        spousePensionPct: { type: 'number' },
        disabilityPct: { type: 'number' },
      },
    },
  },
  {
    code: 'pension_fund_supplementary',
    nameHe: 'קרן פנסיה משלימה',
    category: 'PENSION',
    fieldsSchema: { type: 'object', properties: { track: { enum: trackEnum } } },
  },
  {
    code: 'pension_transfer',
    nameHe: 'ניוד פנסיה',
    category: 'PENSION',
    supportsMonthlyPremium: false,
    fieldsSchema: { type: 'object', properties: { sourceCompanyCode: { type: 'string' } } },
  },

  // GEMEL_HISHTALMUT
  {
    code: 'keren_hishtalmut',
    nameHe: 'קרן השתלמות',
    category: 'GEMEL_HISHTALMUT',
    fieldsSchema: { type: 'object', properties: { track: { enum: trackEnum } } },
  },
  {
    code: 'kupat_gemel',
    nameHe: 'קופת גמל',
    category: 'GEMEL_HISHTALMUT',
    fieldsSchema: { type: 'object', properties: { track: { enum: trackEnum } } },
  },
  {
    code: 'kupat_gemel_niud',
    nameHe: 'קופת גמל - ניוד',
    category: 'GEMEL_HISHTALMUT',
    fieldsSchema: { type: 'object', properties: { sourceCompanyCode: { type: 'string' } } },
  },
  {
    code: 'kupat_gemel_190',
    nameHe: 'קופת גמל 190',
    category: 'GEMEL_HISHTALMUT',
    fieldsSchema: { type: 'object', properties: {} },
  },
  {
    code: 'icud_kupot',
    nameHe: 'איחוד קופות',
    category: 'GEMEL_HISHTALMUT',
    fieldsSchema: { type: 'object', properties: {} },
  },

  // GEMEL_INVESTMENT
  {
    code: 'gemel_investment',
    nameHe: 'גמל להשקעה',
    category: 'GEMEL_INVESTMENT',
    fieldsSchema: { type: 'object', properties: { track: { enum: trackEnum } } },
  },
  {
    code: 'gemel_investment_monthly',
    nameHe: 'גמל להשקעה — שוטף',
    category: 'GEMEL_INVESTMENT',
    fieldsSchema: { type: 'object', properties: { track: { enum: trackEnum } } },
  },

  // SAVINGS_POLICY
  {
    code: 'savings_policy',
    nameHe: 'פוליסת חיסכון',
    category: 'SAVINGS_POLICY',
    fieldsSchema: { type: 'object', properties: { track: { enum: trackEnum } } },
  },

  // RISK — sub-keys distinguish variants
  {
    code: 'risk_life',
    nameHe: 'ביטוח חיים (ריסק)',
    category: 'RISK',
    supportsAccumulation: false,
    fieldsSchema: {
      type: 'object',
      required: ['insuranceCoverage'],
      properties: { insuranceCoverage: { type: 'number' } },
    },
  },
  {
    code: 'risk_mortgage',
    nameHe: 'ביטוח חיים למשכנתא',
    category: 'RISK',
    supportsAccumulation: false,
    fieldsSchema: {
      type: 'object',
      required: ['insuranceCoverage'],
      properties: { insuranceCoverage: { type: 'number' }, mortgageMonths: { type: 'number' } },
    },
  },
  {
    code: 'risk_health',
    nameHe: 'ביטוח בריאות',
    category: 'RISK',
    supportsAccumulation: false,
    fieldsSchema: { type: 'object', properties: { coverages: { type: 'array' } } },
  },
  {
    code: 'risk_critical_illness',
    nameHe: 'מחלות קשות',
    category: 'RISK',
    supportsAccumulation: false,
    fieldsSchema: { type: 'object', properties: { insuranceCoverage: { type: 'number' } } },
  },
  {
    code: 'risk_accident',
    nameHe: 'תאונות אישיות',
    category: 'RISK',
    supportsAccumulation: false,
    fieldsSchema: { type: 'object', properties: {} },
  },
  {
    code: 'risk_disability',
    nameHe: 'אבדן כושר עבודה',
    category: 'RISK',
    supportsAccumulation: false,
    fieldsSchema: { type: 'object', properties: {} },
  },

  // IMMEDIATE_ANNUITY
  {
    code: 'immediate_annuity_managers',
    nameHe: 'קצבה מיידית — מנהלים',
    category: 'IMMEDIATE_ANNUITY',
    supportsMonthlyPremium: false,
    fieldsSchema: { type: 'object', properties: {} },
  },
  {
    code: 'immediate_annuity_pension',
    nameHe: 'קצבה מיידית — פנסיה',
    category: 'IMMEDIATE_ANNUITY',
    supportsMonthlyPremium: false,
    fieldsSchema: { type: 'object', properties: {} },
  },

  // OTHER
  { code: 'mortgage_consulting',  nameHe: 'ייעוץ משכנתא',          category: 'MORTGAGE',     fieldsSchema: { type: 'object', properties: {} } },
  { code: 'alternative_investment', nameHe: 'השקעות אלטרנטיביות',  category: 'ALTERNATIVE',  fieldsSchema: { type: 'object', properties: {} } },
  { code: 'ira',                  nameHe: 'IRA',                    category: 'IRA',          fieldsSchema: { type: 'object', properties: {} } },
  { code: 'travel_insurance',     nameHe: 'נסיעות לחו״ל',           category: 'TRAVEL',       fieldsSchema: { type: 'object', properties: {} } },
  { code: 'business_insurance',   nameHe: 'ביטוח עסק',              category: 'BUSINESS',     fieldsSchema: { type: 'object', properties: {} } },
  { code: 'auto_insurance',       nameHe: 'ביטוח רכב',              category: 'AUTO',         fieldsSchema: { type: 'object', properties: {} } },
  { code: 'home_insurance',       nameHe: 'ביטוח דירה',             category: 'HOME',         fieldsSchema: { type: 'object', properties: {} } },
];

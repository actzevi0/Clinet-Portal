/**
 * Normalization rules for legacy Excel data.
 *
 * The historical sheets contain dirty values: company names duplicated
 * (כלל ↔ כלל ביטוח), categories overlapping (פנסיה ↔ קרן פנסיה), status
 * column polluted with numeric amounts, transfer types misspelled, etc.
 *
 * This file holds pure mapping tables and pure functions. The CLI in
 * cli.ts wires them to the DB.
 */

export const COMPANY_ALIASES: Record<string, string> = {
  'הפניקס': 'phoenix',
  'כלל': 'clal',
  'כלל ביטוח': 'clal',
  'הראל': 'harel',
  'מנורה': 'menora',
  'מנורה מבטחים': 'menora',
  'מגדל': 'migdal',
  'הכשרה': 'hachshara',
  'איילון': 'ayalon',
  'מור': 'more',
  'מור בית השקעות': 'more',
  'אלטשולר': 'altshuler',
  'אלטשולר שחם': 'altshuler',
  'מיטב': 'meitav',
  'מיטב דש': 'meitav',
  'אנליסט': 'analyst',
  'ילין': 'yelin',
  'ילין לפידות': 'yelin',
  'אינפיניטי': 'infinity',
};

export const CATEGORY_ALIASES: Record<string, string> = {
  'פנסיה': 'PENSION',
  'קרן פנסיה': 'PENSION',
  'גמל והשתלמות': 'GEMEL_HISHTALMUT',
  'גמל': 'GEMEL_HISHTALMUT',
  'גמל השתלמות': 'GEMEL_HISHTALMUT',
  'פוליסת חיסכון': 'SAVINGS_POLICY',
  'סיכונים': 'RISK',
  'גמל להשקעה': 'GEMEL_INVESTMENT',
  'גמל להשקעה- צבירה': 'GEMEL_INVESTMENT',
  'גמל להשקעה - שוטף': 'GEMEL_INVESTMENT',
  'גמל להשקעה- שוטף': 'GEMEL_INVESTMENT',
  'קצבה מיידית': 'IMMEDIATE_ANNUITY',
  'חיסכון פרט שוטף': 'SAVINGS_POLICY',
};

/** Map "סוג תוכנית" → product_type code */
export const PRODUCT_TYPE_ALIASES: Record<string, string> = {
  'קרן פנסיה': 'pension_fund',
  'קרן פנסיה משלימה': 'pension_fund_supplementary',
  'קופת גמל': 'kupat_gemel',
  'קופות גמל': 'kupat_gemel',
  'קופת גמל - ניוד': 'kupat_gemel_niud',
  'קופת גמל 190': 'kupat_gemel_190',
  'קופת גמל להשקעה': 'gemel_investment',
  'גמל להשקעה': 'gemel_investment',
  'גמל להשקעה שוטף': 'gemel_investment_monthly',
  'גמל להשקעה- שוטף': 'gemel_investment_monthly',
  'גמל להשקעה- צבירה': 'gemel_investment',
  'גמל להשקעה - שוטף': 'gemel_investment_monthly',
  'קרן השתלמות': 'keren_hishtalmut',
  'קרנות השתלמות': 'keren_hishtalmut',
  'איחוד קופות': 'icud_kupot',
  'פוליסת חיסכון': 'savings_policy',
  'חיסכון פרט שוטף': 'savings_policy',
  'ביטוח חיים': 'risk_life',
  'ביטוח חיים למשכנתא': 'risk_mortgage',
  'משכנתא': 'risk_mortgage',
  'ריסק משכנתא': 'risk_mortgage',
  'ביטוח בריאות': 'risk_health',
  'ביטוח בריאות לילדים': 'risk_health',
  'בריאות': 'risk_health',
  'בריאות + תאונות אישיות': 'risk_health',
  'מחלות קשות': 'risk_critical_illness',
  'ביטוח מחלות קשות': 'risk_critical_illness',
  'תאונות אישיות': 'risk_accident',
  'אבדן כושר עבודה': 'risk_disability',
  'מטריה': 'risk_health',
  'קצבה מיידית מפנסיה': 'immediate_annuity_pension',
  'קיצבה מיידת': 'immediate_annuity_pension',
  'קצבה מיידית': 'immediate_annuity_pension',
};

export const TRANSFER_TYPE_ALIASES: Record<string, string> = {
  'כסף חדש': 'NEW_MONEY',
  'מינוי סוכן': 'AGENT_APPOINTMENT',
};

/** Map raw status text → SaleStatus enum (returns null if value is dirty) */
export const STATUS_ALIASES: Record<string, string> = {
  '_פוטנציאל': 'LEAD',
  'נמסר לחברה': 'SUBMITTED',
  'בטיפול חברה': 'IN_COMPANY',
  'ממתין לחתימה': 'DOCS_PENDING',
  'הופק': 'ISSUED',
  'נסלק': 'SETTLED',
  'עבר': 'SETTLED',
  'התקבלה עמלה': 'COMMISSION_RECEIVED',
  'העברה הושלמה': 'COMMISSION_RECEIVED',
  'בוטלה': 'CANCELLED',
  'בוטל': 'CANCELLED',
  'נדחה': 'REJECTED',
};

/** Detect whether the "סטטוס" cell is actually polluted with a numeric amount */
export const isNumericPollution = (raw: unknown): boolean => {
  if (typeof raw === 'number') return true;
  if (typeof raw === 'string' && /^\d+(\.\d+)?$/.test(raw.trim())) return true;
  return false;
};

const cleanIdNumber = (raw: unknown): string | null => {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim().replace(/\D/g, '');
  if (s.length === 0) return null;
  return s.padStart(9, '0').slice(-9);
};

const parseDateMaybe = (raw: unknown): Date | null => {
  if (!raw) return null;
  if (raw instanceof Date) return raw;
  const s = String(raw).trim();
  // try YYYY-MM-DD or ISO
  const iso = Date.parse(s);
  if (!Number.isNaN(iso)) return new Date(iso);
  // try DD/MM/YYYY or DD\MM\YYYY (Hebrew Excel often)
  const m = s.match(/^(\d{1,2})[\\/](\d{1,2})[\\/](\d{2,4})$/);
  if (m) {
    const [, d, mo, y] = m;
    const yy = y.length === 2 ? 2000 + parseInt(y, 10) : parseInt(y, 10);
    return new Date(Date.UTC(yy, parseInt(mo, 10) - 1, parseInt(d, 10)));
  }
  return null;
};

export interface NormalizedRow {
  agentName: string | null;
  clientName: string | null;
  idNumber: string | null;
  receivedAt: Date | null;
  followUpAt: Date | null;
  companyCode: string | null;
  category: string | null;
  productTypeCode: string | null;
  monthlyPremium: number;
  annualPremium: number;
  accumulatedAmount: number;
  recognitionFactor: number;
  status: string | null;
  transferType: string | null;
  scopeAmount: number;
  recurringAmount: number;
  policyNumber: string | null;
  notes: string | null;
  rawStatusPolluted: boolean;
  warnings: string[];
}

export interface RawSalesRow {
  // matches the מכירות sheet column names from the legacy Excel
  שם_סוכן?: unknown;
  שם_לקוח?: unknown;
  תעודת_זהות?: unknown;
  מספר_פוליסה?: unknown;
  תאריך_קליטה?: unknown;
  תאריך_מעקב?: unknown;
  שם_חברה?: unknown;
  קטגוריה?: unknown;
  סוג_תוכנית?: unknown;
  פרמיה_חודשית?: unknown;
  פרמיה_שנתית?: unknown;
  צבירה?: unknown;
  דנח_מצבירה?: unknown;
  סטטוס?: unknown;
  סוג_העברה?: unknown;
  עמלת_היקף?: unknown;
  עמלה_שוטפת?: unknown;
  הערות?: unknown;
}

const num = (raw: unknown): number => {
  if (raw === null || raw === undefined || raw === '') return 0;
  const n = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};

export function normalizeSalesRow(row: RawSalesRow): NormalizedRow {
  const warnings: string[] = [];

  const companyRaw = row.שם_חברה ? String(row.שם_חברה).trim() : '';
  const companyCode = COMPANY_ALIASES[companyRaw] ?? null;
  if (companyRaw && !companyCode) warnings.push(`unknown company "${companyRaw}"`);

  const categoryRaw = row.קטגוריה ? String(row.קטגוריה).trim() : '';
  const category = CATEGORY_ALIASES[categoryRaw] ?? null;
  if (categoryRaw && !category) warnings.push(`unknown category "${categoryRaw}"`);

  const productRaw = row.סוג_תוכנית ? String(row.סוג_תוכנית).trim() : '';
  const productTypeCode = PRODUCT_TYPE_ALIASES[productRaw] ?? null;
  if (productRaw && !productTypeCode) warnings.push(`unknown product "${productRaw}"`);

  const transferRaw = row.סוג_העברה ? String(row.סוג_העברה).trim() : '';
  const transferType = TRANSFER_TYPE_ALIASES[transferRaw] ?? null;

  const statusRaw = row.סטטוס;
  const polluted = isNumericPollution(statusRaw);
  const statusText = polluted ? null : (typeof statusRaw === 'string' ? statusRaw.trim() : null);
  const status = statusText ? (STATUS_ALIASES[statusText] ?? null) : null;
  if (polluted) warnings.push(`status field has numeric value: ${statusRaw}`);
  if (statusText && !status) warnings.push(`unknown status "${statusText}"`);

  const id = cleanIdNumber(row.תעודת_זהות);
  if (id && id.length !== 9) warnings.push(`id_number wrong length: ${id}`);

  return {
    agentName: row.שם_סוכן ? String(row.שם_סוכן).trim() : null,
    clientName: row.שם_לקוח ? String(row.שם_לקוח).trim() : null,
    idNumber: id,
    receivedAt: parseDateMaybe(row.תאריך_קליטה),
    followUpAt: parseDateMaybe(row.תאריך_מעקב),
    companyCode,
    category,
    productTypeCode,
    monthlyPremium: num(row.פרמיה_חודשית),
    annualPremium: num(row.פרמיה_שנתית),
    accumulatedAmount: num(row.צבירה),
    recognitionFactor: num(row.דנח_מצבירה) || 1,
    status,
    transferType,
    scopeAmount: num(row.עמלת_היקף),
    recurringAmount: num(row.עמלה_שוטפת),
    policyNumber: row.מספר_פוליסה ? String(row.מספר_פוליסה).trim() : null,
    notes: row.הערות ? String(row.הערות).trim() : null,
    rawStatusPolluted: polluted,
    warnings,
  };
}

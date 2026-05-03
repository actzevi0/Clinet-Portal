/** Hebrew labels for enums */

export const SALE_STATUS_LABELS = {
  LEAD:                'ליד חדש',
  CONTACTED:           'בוצעה שיחה',
  DOCS_PENDING:        'ממתין למסמכים',
  SUBMITTED:           'הוגש',
  IN_COMPANY:          'בטיפול חברה',
  ISSUED:              'הופק',
  SETTLED:             'נסלק',
  COMMISSION_RECEIVED: 'התקבלה עמלה',
  CANCELLED:           'בוטל',
  REJECTED:            'נדחה',
  PAID_UP:             'מסולק',
} as const;

export const SALE_STATUS_PROBABILITY: Record<string, number> = {
  LEAD: 0.05,
  CONTACTED: 0.15,
  DOCS_PENDING: 0.30,
  SUBMITTED: 0.50,
  IN_COMPANY: 0.70,
  ISSUED: 0.90,
  SETTLED: 1.00,
  COMMISSION_RECEIVED: 1.00,
  CANCELLED: 0,
  REJECTED: 0,
  PAID_UP: 1.00,
};

export const SALE_STATUS_COLORS: Record<string, string> = {
  LEAD: 'bg-slate-500',
  CONTACTED: 'bg-blue-500',
  DOCS_PENDING: 'bg-amber-500',
  SUBMITTED: 'bg-indigo-500',
  IN_COMPANY: 'bg-violet-500',
  ISSUED: 'bg-fuchsia-500',
  SETTLED: 'bg-emerald-500',
  COMMISSION_RECEIVED: 'bg-emerald-700',
  CANCELLED: 'bg-rose-500',
  REJECTED: 'bg-red-700',
  PAID_UP: 'bg-zinc-500',
};

export const PIPELINE_COLUMNS: Array<{ status: keyof typeof SALE_STATUS_LABELS; label: string }> = [
  { status: 'LEAD',                label: 'ליד חדש' },
  { status: 'CONTACTED',           label: 'בוצעה שיחה' },
  { status: 'DOCS_PENDING',        label: 'ממתין למסמכים' },
  { status: 'SUBMITTED',           label: 'הוגש' },
  { status: 'IN_COMPANY',          label: 'בטיפול חברה' },
  { status: 'ISSUED',              label: 'הופק' },
  { status: 'SETTLED',             label: 'נסלק' },
  { status: 'COMMISSION_RECEIVED', label: 'התקבלה עמלה' },
];

export const TRANSFER_TYPE_LABELS = {
  NEW_MONEY: 'כסף חדש',
  AGENT_APPOINTMENT: 'מינוי סוכן',
  CONSULTING_FEE: 'שכר טרחה',
};

export const PRODUCT_CATEGORY_LABELS = {
  PENSION: 'פנסיה',
  GEMEL_HISHTALMUT: 'גמל והשתלמות',
  GEMEL_INVESTMENT: 'גמל להשקעה',
  SAVINGS_POLICY: 'פוליסת חיסכון',
  RISK: 'סיכונים',
  IMMEDIATE_ANNUITY: 'קצבה מיידית',
  MORTGAGE: 'משכנתא',
  ALTERNATIVE: 'אלטרנטיבי',
  IRA: 'IRA',
  TRAVEL: 'נסיעות לחו״ל',
  BUSINESS: 'עסק',
  AUTO: 'רכב',
  HOME: 'דירה',
  OTHER: 'אחר',
};

export const TASK_STATUS_LABELS = {
  OPEN: 'פתוחה',
  IN_PROGRESS: 'בטיפול',
  DONE: 'בוצעה',
  CANCELLED: 'בוטלה',
};

export const TASK_PRIORITY_LABELS = {
  LOW: 'נמוכה',
  NORMAL: 'רגילה',
  HIGH: 'גבוהה',
  URGENT: 'דחופה',
};

export const EXPECTED_STATUS_LABELS = {
  PENDING: 'ממתין',
  RECEIVED: 'התקבל',
  PARTIAL: 'חלקי',
  MISSING: 'חסר',
  DISPUTED: 'במחלוקת',
  CANCELLED: 'בוטל',
};

export const COMMISSION_KIND_LABELS = {
  SCOPE: 'היקף',
  RECURRING: 'נפרעים',
  BONUS: 'בונוס',
  CLAWBACK: 'קיזוז',
  FLAT: 'סכום קבוע',
};

export const ACTIVITY_TYPE_LABELS = {
  CALL: 'שיחת טלפון',
  MEETING: 'פגישה',
  EMAIL: 'מייל',
  WHATSAPP: 'WhatsApp',
  SMS: 'SMS',
  NOTE: 'הערה',
  STATUS_CHANGE: 'שינוי סטטוס',
  DOCUMENT_UPLOAD: 'העלאת מסמך',
  COMMISSION_EVENT: 'אירוע עמלה',
  SYSTEM: 'מערכת',
};

/**
 * Canonical company catalog (global).
 * Codes are stable identifiers — never rename.
 */

export const COMPANIES = [
  // Insurance companies
  { code: 'phoenix',    nameHe: 'הפניקס',         kind: 'INSURANCE'        as const },
  { code: 'clal',       nameHe: 'כלל',            kind: 'INSURANCE'        as const },
  { code: 'harel',      nameHe: 'הראל',           kind: 'INSURANCE'        as const },
  { code: 'menora',     nameHe: 'מנורה מבטחים',   kind: 'INSURANCE'        as const },
  { code: 'migdal',     nameHe: 'מגדל',           kind: 'INSURANCE'        as const },
  { code: 'hachshara',  nameHe: 'הכשרה',          kind: 'INSURANCE'        as const },
  { code: 'ayalon',     nameHe: 'איילון',         kind: 'INSURANCE'        as const },

  // Investment houses
  { code: 'more',       nameHe: 'מור בית השקעות', kind: 'INVESTMENT_HOUSE' as const },
  { code: 'altshuler',  nameHe: 'אלטשולר שחם',    kind: 'INVESTMENT_HOUSE' as const },
  { code: 'meitav',     nameHe: 'מיטב דש',        kind: 'INVESTMENT_HOUSE' as const },
  { code: 'analyst',    nameHe: 'אנליסט',         kind: 'INVESTMENT_HOUSE' as const },
  { code: 'yelin',      nameHe: 'ילין לפידות',    kind: 'INVESTMENT_HOUSE' as const },
  { code: 'infinity',   nameHe: 'אינפיניטי',      kind: 'INVESTMENT_HOUSE' as const },
];

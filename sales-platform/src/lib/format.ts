/** Money & date formatting helpers (Hebrew locale, ₪) */

export const fmtMoney = (n: number | null | undefined): string => {
  const v = Number(n ?? 0);
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    maximumFractionDigits: 0,
  }).format(v);
};

export const fmtMoneyExact = (n: number | null | undefined): string => {
  const v = Number(n ?? 0);
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    maximumFractionDigits: 2,
  }).format(v);
};

export const fmtNumber = (n: number | null | undefined): string =>
  new Intl.NumberFormat('he-IL').format(Number(n ?? 0));

export const fmtPct = (n: number, digits = 2): string =>
  `${(n * 100).toFixed(digits)}%`;

export const fmtDate = (d: Date | string | null | undefined): string => {
  if (!d) return '—';
  const dt = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(dt.getTime())) return '—';
  return new Intl.DateTimeFormat('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(dt);
};

export const fmtMonth = (yyyymm: string): string => {
  const [y, m] = yyyymm.split('-');
  const months = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
  return `${months[parseInt(m,10)-1] ?? m} ${y}`;
};

export const monthKey = (d: Date = new Date()): string =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`;

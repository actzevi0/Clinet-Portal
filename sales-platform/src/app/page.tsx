/**
 * Phase 0 placeholder dashboard.
 *
 * Reads the seeded catalog so you can verify the DB connection + seed worked.
 * Real screens (pipeline, sales, commissions, reconcile) come in Phase 1+.
 */

import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  let companyCount = 0;
  let productTypeCount = 0;
  let agreementCount = 0;
  let ruleCount = 0;
  let dbError: string | null = null;

  try {
    [companyCount, productTypeCount, agreementCount, ruleCount] = await Promise.all([
      prisma.company.count(),
      prisma.productType.count(),
      prisma.commissionAgreement.count(),
      prisma.commissionRule.count(),
    ]);
  } catch (e: any) {
    dbError = e?.message ?? String(e);
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <header className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Sales Platform — Phase 0</h1>
        <p className="text-sm opacity-70">
          תשתית בסיס: סכמה, מנוע עמלות, seed נוסחאות, importer.
          המסכים המלאים מגיעים ב‑Phase 1+.
        </p>
      </header>

      {dbError ? (
        <section className="rounded-xl border border-red-500/40 bg-red-500/5 p-6">
          <h2 className="text-lg font-semibold text-red-500 mb-2">DB error</h2>
          <pre className="text-xs whitespace-pre-wrap">{dbError}</pre>
          <p className="text-sm mt-3 opacity-80">
            הרץ <code>docker compose up -d db && pnpm db:migrate && pnpm db:seed</code>.
          </p>
        </section>
      ) : (
        <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label="חברות" value={companyCount} />
          <Stat label="סוגי מוצר" value={productTypeCount} />
          <Stat label="הסכמי עמלות" value={agreementCount} />
          <Stat label="חוקי עמלות" value={ruleCount} />
        </section>
      )}

      <section className="mt-10 text-sm opacity-80 leading-7">
        <h2 className="text-lg font-semibold mb-2">השלבים הבאים (Phase 1)</h2>
        <ul className="list-disc pr-6 space-y-1">
          <li>NextAuth — login/logout, sessions, RBAC middleware</li>
          <li>מסך Pipeline (Kanban) + מסכי Sales/Clients</li>
          <li>API routes: /api/sales, /api/commissions/*</li>
          <li>אשף "עסקה חדשה" עם preview עמלה חי</li>
          <li>Importer UI מעל ה‑CLI הקיים</li>
        </ul>
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="text-xs uppercase tracking-wide opacity-60">{label}</div>
      <div className="text-3xl font-semibold mt-1">{value.toLocaleString('he-IL')}</div>
    </div>
  );
}

import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { scopeWhere } from '@/lib/rbac';
import { Card, CardTitle, Badge } from '@/components/ui';
import { Kpi } from '@/components/kpi';
import { fmtMoney, monthKey } from '@/lib/format';
import { Wallet, Receipt, Scale, BookOpen, ArrowLeft } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function CommissionsHubPage() {
  const user = await requireUser();
  const where = scopeWhere(user) as any;
  const month = monthKey();

  const [agreementCount, ruleCount, pendingCount, pendingSum, receivedSum, paymentsCount] = await Promise.all([
    prisma.commissionAgreement.count({ where: { tenantId: user.tenantId ?? '' } }),
    prisma.commissionRule.count({ where: { agreement: { tenantId: user.tenantId ?? '' } } }),
    prisma.expectedCommission.count({ where: { ...where, status: 'PENDING' } }),
    prisma.expectedCommission.aggregate({ where: { ...where, status: 'PENDING' }, _sum: { amount: true } }),
    prisma.commissionPayment.aggregate({ where: { ...where, paymentMonth: month }, _sum: { amount: true } }),
    prisma.commissionPayment.count({ where: { ...where, paymentMonth: month } }),
  ]);

  const tiles = [
    { href: '/commissions/agreements', icon: BookOpen, label: 'הסכמים וחוקים', stat: `${agreementCount} הסכמים · ${ruleCount} חוקים` },
    { href: '/commissions/expected',   icon: Wallet,   label: 'עמלות צפויות',   stat: `${pendingCount} ממתינות · ${fmtMoney(Number(pendingSum._sum.amount ?? 0))}` },
    { href: '/commissions/payments',   icon: Receipt,  label: 'תשלומים שהתקבלו', stat: `${paymentsCount} השנה · ${fmtMoney(Number(receivedSum._sum.amount ?? 0))} החודש` },
    { href: '/commissions/reconcile',  icon: Scale,    label: 'התאמות',         stat: 'התאמת תשלומים מול צפי' },
  ];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">עמלות</h1>
        <p className="text-sm text-white/60">ניהול הסכמים, צפי, תשלומים והתאמות</p>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi label="הסכמים פעילים" value={String(agreementCount)} accent="brand" />
        <Kpi label="חוקי עמלה" value={String(ruleCount)} />
        <Kpi label="צפי ממתין" value={fmtMoney(Number(pendingSum._sum.amount ?? 0))} accent="warn" />
        <Kpi label={`התקבל ${month}`} value={fmtMoney(Number(receivedSum._sum.amount ?? 0))} accent="success" />
      </section>

      <section className="grid md:grid-cols-2 gap-4">
        {tiles.map(({ href, icon: Icon, label, stat }) => (
          <Link key={href} href={href}>
            <Card className="hover:bg-white/10 transition-colors cursor-pointer">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-lg bg-brand-500/20 flex items-center justify-center text-brand-300">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <CardTitle className="mb-1">{label}</CardTitle>
                  <p className="text-sm text-white/50">{stat}</p>
                </div>
                <ArrowLeft className="h-4 w-4 text-white/30" />
              </div>
            </Card>
          </Link>
        ))}
      </section>
    </div>
  );
}

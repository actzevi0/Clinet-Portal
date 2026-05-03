import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { Card, CardTitle, Empty, Badge } from '@/components/ui';
import { fmtDate } from '@/lib/format';
import { ImportForm } from './form';

export const dynamic = 'force-dynamic';

export default async function ImportPage() {
  const user = await requireUser();
  const batches = await prisma.importBatch.findMany({
    where: { tenantId: user.tenantId ?? '' },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">ייבוא נתונים</h1>
        <p className="text-sm text-white/60">העלה קובץ Excel — תקבל תצוגה מקדימה לפני קליטה</p>
      </header>

      <ImportForm />

      <Card>
        <CardTitle>היסטוריית ייבוא</CardTitle>
        {batches.length === 0 ? (
          <Empty title="עוד לא ייבאת נתונים" />
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-white/50 uppercase">
              <tr>
                <th className="px-3 py-2 text-right">תאריך</th>
                <th className="px-3 py-2 text-right">קובץ</th>
                <th className="px-3 py-2 text-right">סטטוס</th>
                <th className="px-3 py-2 text-right">שורות</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => (
                <tr key={b.id} className="border-t border-white/5">
                  <td className="px-3 py-2 text-xs">{fmtDate(b.createdAt)}</td>
                  <td className="px-3 py-2">{b.filename ?? '—'}</td>
                  <td className="px-3 py-2">
                    <Badge className={
                      b.status === 'committed' ? 'bg-emerald-500/20 text-emerald-200' :
                      b.status === 'failed' ? 'bg-rose-500/20 text-rose-200' :
                      b.status === 'previewing' ? 'bg-amber-500/20 text-amber-200' : ''
                    }>{b.status}</Badge>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {b.totalRows} סה"כ
                    {b.okRows > 0 && <span className="text-emerald-300"> · {b.okRows} ok</span>}
                    {b.errorRows > 0 && <span className="text-rose-300"> · {b.errorRows} שגיאות</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

import { requireUser } from '@/lib/auth';
import { buildForecast, runRate } from '@/lib/forecast-engine';
import { Kpi } from '@/components/kpi';
import { Card, CardTitle } from '@/components/ui';
import { fmtMoney, fmtMonth } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function ForecastPage() {
  const user = await requireUser();
  if (!user.tenantId) return null;

  const userIdScope = ['AGENT','VIEWER'].includes(user.role) ? user.id : undefined;
  const [forecast, runRateValue] = await Promise.all([
    buildForecast({ tenantId: user.tenantId, userId: userIdScope, months: 12 }),
    runRate(user.tenantId, userIdScope),
  ]);

  const totalExpected = forecast.reduce((s, m) => s + m.expectedTotal, 0);
  const next3 = forecast.slice(0, 3).reduce((s, m) => s + m.expectedTotal, 0);
  const next12 = forecast.reduce((s, m) => s + m.expectedTotal, 0);
  const weighted = (forecast[0]?.weightedPipeline ?? 0) * 12;

  // chart bounds
  const max = Math.max(...forecast.map((m) => Math.max(m.expectedTotal, m.actualReceived)), 1);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">תחזית הכנסות</h1>
        <p className="text-sm text-white/60">12 חודשים קדימה · רמת ביטחון לפי שלב פייפליין</p>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi label="Run Rate חודשי" value={fmtMoney(runRateValue)} sub="ממוצע 3 חודשים אחרונים" accent="brand" />
        <Kpi label="צפי 3 חודשים" value={fmtMoney(next3)} accent="info" />
        <Kpi label="צפי 12 חודשים" value={fmtMoney(next12)} accent="success" />
        <Kpi label="פייפליין משוקלל" value={fmtMoney(weighted)} sub="לפי הסתברות סטטוס" accent="warn" />
      </section>

      <Card>
        <CardTitle>צפי חודשי 12 חודשים</CardTitle>
        <div className="space-y-2">
          {forecast.map((m) => {
            const widthExpected = (m.expectedTotal / max) * 100;
            const widthActual   = (m.actualReceived / max) * 100;
            return (
              <div key={m.month} className="flex items-center gap-3">
                <div className="w-28 text-xs text-white/60 shrink-0">{fmtMonth(m.month)}</div>
                <div className="flex-1 space-y-1">
                  <div className="h-6 bg-white/5 rounded-lg overflow-hidden relative">
                    <div className="absolute inset-y-0 right-0 bg-brand-500/40" style={{ width: `${widthExpected}%` }} />
                    {m.actualReceived > 0 && (
                      <div className="absolute inset-y-0 right-0 bg-emerald-500/60" style={{ width: `${widthActual}%` }} />
                    )}
                    <div className="absolute inset-0 flex items-center justify-between px-3 text-xs">
                      <span className="text-white/50">צפוי {fmtMoney(m.expectedTotal)}</span>
                      {m.actualReceived > 0 && <span className="text-emerald-200">בפועל {fmtMoney(m.actualReceived)}</span>}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card>
        <CardTitle>פירוט: היקף vs שוטפת</CardTitle>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="text-xs text-white/50 uppercase">
              <tr><th className="px-3 py-2 text-right">חודש</th><th className="px-3 py-2 text-right">היקף</th><th className="px-3 py-2 text-right">שוטפת</th><th className="px-3 py-2 text-right">סה"כ צפוי</th><th className="px-3 py-2 text-right">בפועל</th></tr>
            </thead>
            <tbody>
              {forecast.map((m) => (
                <tr key={m.month} className="border-t border-white/5">
                  <td className="px-3 py-2 text-xs">{fmtMonth(m.month)}</td>
                  <td className="px-3 py-2">{fmtMoney(m.expectedScope)}</td>
                  <td className="px-3 py-2">{fmtMoney(m.expectedRecurring)}</td>
                  <td className="px-3 py-2 font-medium">{fmtMoney(m.expectedTotal)}</td>
                  <td className="px-3 py-2 text-emerald-300">{fmtMoney(m.actualReceived)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

import { requireUser } from '@/lib/auth';
import { buildForecast } from '@/lib/forecast-engine';
import { csvResponse } from '@/lib/csv';

export async function GET() {
  const user = await requireUser();
  if (!user.tenantId) return new Response('unauthorized', { status: 401 });
  const userIdScope = ['AGENT','VIEWER'].includes(user.role) ? user.id : undefined;
  const f = await buildForecast({ tenantId: user.tenantId, userId: userIdScope, months: 12 });
  return csvResponse(
    'forecast.csv',
    ['חודש','היקף צפוי','שוטפת צפויה','סה"כ צפוי','בפועל','פייפליין משוקלל'],
    f.map((m) => [m.month, m.expectedScope, m.expectedRecurring, m.expectedTotal, m.actualReceived, m.weightedPipeline]),
  );
}

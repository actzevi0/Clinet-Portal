import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { Card, CardTitle, Empty, Field, Input, Select, Textarea, Button, Badge } from '@/components/ui';
import { fmtDate } from '@/lib/format';
import { TASK_STATUS_LABELS, TASK_PRIORITY_LABELS } from '@/lib/labels';
import { createTask, updateTaskStatus } from '@/lib/actions/tasks';
import { TaskCheckbox } from './task-checkbox';

export const dynamic = 'force-dynamic';

export default async function TasksPage() {
  const user = await requireUser();
  const tasks = await prisma.task.findMany({
    where: {
      tenantId: user.tenantId ?? '',
      assigneeId: ['SUPERADMIN','ADMIN','MANAGER'].includes(user.role) ? undefined : user.id,
    },
    include: {
      sale: { include: { client: true } },
      client: true,
    },
    orderBy: [
      { status: 'asc' },
      { dueAt: 'asc' },
      { createdAt: 'desc' },
    ],
    take: 200,
  });

  const open = tasks.filter((t) => t.status === 'OPEN' || t.status === 'IN_PROGRESS');
  const done = tasks.filter((t) => t.status === 'DONE');

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">משימות</h1>
        <p className="text-sm text-white/60">{open.length} פתוחות · {done.length} בוצעו</p>
      </header>

      <div className="grid lg:grid-cols-[1fr_360px] gap-4">
        <Card>
          <CardTitle>פתוחות</CardTitle>
          {open.length === 0 ? (
            <Empty title="אין משימות פתוחות 🎉" />
          ) : (
            <ul className="space-y-2">
              {open.map((t) => (
                <li key={t.id} className="flex items-start gap-3 p-3 rounded-lg border border-white/10 bg-white/5">
                  <TaskCheckbox id={t.id} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{t.title}</div>
                    {t.description && <div className="text-xs text-white/60 mt-0.5">{t.description}</div>}
                    <div className="flex flex-wrap gap-2 mt-2">
                      {t.dueAt && <Badge>יעד: {fmtDate(t.dueAt)}</Badge>}
                      <Badge className={
                        t.priority === 'URGENT' ? 'bg-rose-500/20 text-rose-200' :
                        t.priority === 'HIGH'   ? 'bg-amber-500/20 text-amber-200' : ''
                      }>{TASK_PRIORITY_LABELS[t.priority]}</Badge>
                      {t.client && <Badge>{t.client.fullName}</Badge>}
                      {t.sale && <Badge>עסקה</Badge>}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {done.length > 0 && (
            <>
              <h3 className="text-sm font-medium mt-6 mb-2 text-white/50">בוצעו</h3>
              <ul className="space-y-1">
                {done.slice(0, 20).map((t) => (
                  <li key={t.id} className="flex items-start gap-3 p-2 rounded text-sm opacity-60 line-through">
                    <span>✓</span>
                    <span>{t.title}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>

        <Card>
          <CardTitle>משימה חדשה</CardTitle>
          <form action={createTask} className="space-y-3">
            <Field label="כותרת *">
              <Input name="title" required />
            </Field>
            <Field label="תיאור">
              <Textarea name="description" rows={2} />
            </Field>
            <Field label="תאריך יעד">
              <Input name="dueAt" type="date" />
            </Field>
            <Field label="עדיפות">
              <Select name="priority" defaultValue="NORMAL">
                {Object.entries(TASK_PRIORITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
            <Button type="submit" className="w-full">הוסף משימה</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}

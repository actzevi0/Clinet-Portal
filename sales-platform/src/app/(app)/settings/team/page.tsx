import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { Card, CardTitle, Empty, Table, Th, Thead, Tr, Td, Badge, Field, Input, Select, Button } from '@/components/ui';
import { fmtDate } from '@/lib/format';
import { roleLabel } from '@/lib/rbac';
import { createUser } from '@/lib/actions/users';

export const dynamic = 'force-dynamic';

export default async function TeamPage() {
  const user = await requireUser();
  if (!user.tenantId) return null;
  const users = await prisma.user.findMany({
    where: { tenantId: user.tenantId, deletedAt: null },
    include: { manager: true },
    orderBy: { createdAt: 'asc' },
  });
  const isAdmin = user.role === 'ADMIN' || user.role === 'SUPERADMIN';

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">צוות</h1>
        <p className="text-sm text-white/60">{users.length} משתמשים · ניהול הרשאות</p>
      </header>

      <div className="grid lg:grid-cols-[1fr_360px] gap-4">
        <Card>
          {users.length === 0 ? (
            <Empty title="אין משתמשים" />
          ) : (
            <Table>
              <Thead>
                <tr><Th>שם</Th><Th>אימייל</Th><Th>תפקיד</Th><Th>מנהל</Th><Th>פעיל</Th><Th>כניסה אחרונה</Th></tr>
              </Thead>
              <tbody>
                {users.map((u) => (
                  <Tr key={u.id}>
                    <Td className="font-medium">{u.fullName}</Td>
                    <Td className="text-xs">{u.email}</Td>
                    <Td><Badge>{roleLabel[u.role]}</Badge></Td>
                    <Td className="text-xs">{u.manager?.fullName ?? '—'}</Td>
                    <Td>
                      <Badge className={u.status === 'active' ? 'bg-emerald-500/20 text-emerald-200' : 'bg-rose-500/20'}>{u.status}</Badge>
                    </Td>
                    <Td className="text-xs text-white/60">{fmtDate(u.lastLoginAt)}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        {isAdmin && (
          <Card>
            <CardTitle>משתמש חדש</CardTitle>
            <form action={createUser} className="space-y-3">
              <Field label="שם מלא *"><Input name="fullName" required /></Field>
              <Field label="אימייל *"><Input name="email" type="email" required /></Field>
              <Field label="סיסמה ראשונית *"><Input name="password" type="text" required /></Field>
              <Field label="תפקיד">
                <Select name="role" defaultValue="AGENT">
                  <option value="ADMIN">מנהל סוכנות</option>
                  <option value="MANAGER">מנהל צוות</option>
                  <option value="AGENT">סוכן</option>
                  <option value="VIEWER">צפייה</option>
                </Select>
              </Field>
              <Button type="submit" className="w-full">הוסף</Button>
            </form>
          </Card>
        )}
      </div>
    </div>
  );
}

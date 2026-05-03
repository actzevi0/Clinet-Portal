import { requireUser } from '@/lib/auth';
import { Sidebar } from '@/components/sidebar';
import { roleLabel } from '@/lib/rbac';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <div className="flex min-h-screen">
      <Sidebar user={{ fullName: user.fullName, email: user.email, role: roleLabel[user.role] }} />
      <main className="flex-1 min-w-0">
        <div className="px-6 py-6 max-w-[1500px] mx-auto">{children}</div>
      </main>
    </div>
  );
}

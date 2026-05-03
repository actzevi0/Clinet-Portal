'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';
import {
  LayoutDashboard, Users, Briefcase, Kanban, Wallet, FileText,
  CalendarClock, Receipt, Scale, ListTodo, Upload, Settings, LogOut, ChevronDown,
} from 'lucide-react';
import { useState } from 'react';

interface NavItem { href: string; label: string; icon: React.ComponentType<{ className?: string }>; children?: { href: string; label: string }[]; }

const NAV: NavItem[] = [
  { href: '/dashboard', label: 'לוח ראשי', icon: LayoutDashboard },
  { href: '/clients', label: 'לקוחות', icon: Users },
  { href: '/sales/pipeline', label: 'פייפליין', icon: Kanban },
  { href: '/sales', label: 'מכירות', icon: Briefcase },
  {
    href: '/commissions', label: 'עמלות', icon: Wallet, children: [
      { href: '/commissions/agreements', label: 'הסכמים וחוקים' },
      { href: '/commissions/expected',   label: 'עמלות צפויות' },
      { href: '/commissions/payments',   label: 'תשלומים שהתקבלו' },
      { href: '/commissions/reconcile',  label: 'התאמות' },
    ],
  },
  { href: '/forecast', label: 'תחזית', icon: CalendarClock },
  { href: '/tasks', label: 'משימות', icon: ListTodo },
  { href: '/reports', label: 'דוחות', icon: FileText },
  { href: '/import', label: 'ייבוא נתונים', icon: Upload },
  {
    href: '/settings', label: 'הגדרות', icon: Settings, children: [
      { href: '/settings/team',      label: 'צוות' },
      { href: '/settings/companies', label: 'חברות' },
      { href: '/settings/products',  label: 'סוגי מוצר' },
    ],
  },
];

export function Sidebar({ user }: { user: { fullName: string; email: string; role: string } }) {
  const pathname = usePathname();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    '/commissions': pathname.startsWith('/commissions'),
    '/settings':    pathname.startsWith('/settings'),
  });

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

  return (
    <aside className="hidden lg:flex flex-col w-64 shrink-0 h-screen sticky top-0 border-l border-white/10 bg-black/20">
      <div className="px-5 py-5 border-b border-white/10">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-brand-500 flex items-center justify-center text-white font-bold">SP</div>
          <div>
            <div className="font-semibold text-sm">Sales Platform</div>
            <div className="text-[10px] uppercase tracking-wider text-white/40">CRM · Commissions</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {NAV.map((item) => {
          const Icon = item.icon;
          if (item.children) {
            const open = openGroups[item.href] ?? isActive(item.href);
            return (
              <div key={item.href}>
                <button
                  onClick={() => setOpenGroups((s) => ({ ...s, [item.href]: !open }))}
                  className={cn(
                    'w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm',
                    isActive(item.href) ? 'bg-white/10 text-white' : 'text-white/70 hover:bg-white/5',
                  )}
                >
                  <span className="flex items-center gap-2"><Icon className="h-4 w-4" />{item.label}</span>
                  <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
                </button>
                {open && (
                  <div className="mr-7 mt-1 space-y-0.5">
                    {item.children.map((c) => (
                      <Link
                        key={c.href}
                        href={c.href}
                        className={cn(
                          'block px-3 py-1.5 rounded-lg text-sm',
                          isActive(c.href) ? 'bg-brand-500/20 text-brand-100' : 'text-white/60 hover:bg-white/5',
                        )}
                      >
                        {c.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          }
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-lg text-sm',
                isActive(item.href) ? 'bg-brand-500/20 text-brand-100' : 'text-white/70 hover:bg-white/5',
              )}
            >
              <Icon className="h-4 w-4" />{item.label}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 py-3 border-t border-white/10">
        <div className="px-2 mb-2">
          <div className="text-sm font-medium truncate">{user.fullName}</div>
          <div className="text-[11px] text-white/50 truncate">{user.email}</div>
        </div>
        <form action="/logout" method="post">
          <button className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-white/70 hover:bg-white/5">
            <LogOut className="h-4 w-4" />יציאה
          </button>
        </form>
      </div>
    </aside>
  );
}

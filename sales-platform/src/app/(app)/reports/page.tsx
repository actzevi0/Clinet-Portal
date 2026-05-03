import { requireUser } from '@/lib/auth';
import { Card, CardTitle } from '@/components/ui';
import { Download, FileSpreadsheet, FileText } from 'lucide-react';

export const dynamic = 'force-dynamic';

const reports = [
  { id: 'sales',          label: 'דוח מכירות',      desc: 'כל העסקאות עם פרטי לקוח, חברה, פרמיה, סטטוס', href: '/api/reports/sales.csv' },
  { id: 'commissions',    label: 'דוח עמלות',       desc: 'עמלות צפויות + שהתקבלו לפי חודש', href: '/api/reports/commissions.csv' },
  { id: 'agents',         label: 'דוח סוכנים',      desc: 'ביצועים פר-סוכן (היקף, שוטפת, closure)', href: '/api/reports/agents.csv' },
  { id: 'companies',      label: 'דוח חברות',       desc: 'פילוח עמלות לפי חברה', href: '/api/reports/companies.csv' },
  { id: 'pipeline',       label: 'דוח פייפליין',    desc: 'עסקאות פתוחות לפי שלב', href: '/api/reports/pipeline.csv' },
  { id: 'forecast',       label: 'דוח תחזית',       desc: '12 חודשים קדימה', href: '/api/reports/forecast.csv' },
];

export default async function ReportsPage() {
  await requireUser();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">דוחות</h1>
        <p className="text-sm text-white/60">הורדת קבצי CSV מותאמי Excel · UTF-8 BOM</p>
      </header>

      <section className="grid md:grid-cols-2 gap-3">
        {reports.map((r) => (
          <Card key={r.id} className="hover:bg-white/10 transition-colors">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-300">
                <FileSpreadsheet className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <CardTitle className="mb-1">{r.label}</CardTitle>
                <p className="text-sm text-white/50">{r.desc}</p>
              </div>
              <a
                href={r.href}
                className="inline-flex items-center gap-2 rounded-lg bg-white/10 hover:bg-white/20 px-3 py-2 text-sm"
                download
              >
                <Download className="h-4 w-4" />הורד
              </a>
            </div>
          </Card>
        ))}
      </section>
    </div>
  );
}

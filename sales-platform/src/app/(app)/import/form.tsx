'use client';

import { useState, useTransition } from 'react';
import { Button, Card, CardTitle, Field, Input, Select, Badge } from '@/components/ui';
import { uploadAndPreviewExcel, commitImport } from '@/lib/actions/import';
import { Upload } from 'lucide-react';

interface PreviewResult {
  ok: true;
  batchId: string;
  total: number;
  ok_count?: number;
  polluted: number;
  unknownCompanies: string[];
  unknownProducts: string[];
  unknownStatuses: string[];
}

export function ImportForm() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<any>(null);
  const [committed, setCommitted] = useState<{ okRows: number; errorRows: number } | null>(null);

  const handleSubmit = (formData: FormData) => {
    setError(null);
    setPreview(null);
    setCommitted(null);
    start(async () => {
      const r = await uploadAndPreviewExcel(formData);
      if ((r as any).error) setError((r as any).error);
      else setPreview(r);
    });
  };

  const doCommit = () => {
    if (!preview?.batchId) return;
    start(async () => {
      const r = await commitImport(preview.batchId);
      if ((r as any).error) setError((r as any).error);
      else setCommitted({ okRows: (r as any).okRows, errorRows: (r as any).errorRows });
    });
  };

  return (
    <Card>
      <CardTitle>העלאת קובץ</CardTitle>
      <form action={handleSubmit} className="space-y-3">
        <Field label="קובץ Excel (.xlsx)">
          <Input name="file" type="file" accept=".xlsx" required />
        </Field>
        <Field label="שם גיליון">
          <Select name="sheet" defaultValue="מכירות">
            <option value="מכירות">מכירות</option>
            <option value="פוטנציאל">פוטנציאל</option>
            <option value="פרופיט">פרופיט</option>
            <option value="מינויי סוכן">מינויי סוכן</option>
          </Select>
        </Field>
        <Button type="submit" disabled={pending}>
          <Upload className="h-4 w-4" />
          {pending ? 'טוען...' : 'תצוגה מקדימה'}
        </Button>
      </form>

      {error && (
        <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-400">{error}</div>
      )}

      {preview && !committed && (
        <div className="mt-6 space-y-3">
          <h3 className="text-base font-semibold">סיכום תצוגה מקדימה</h3>
          <div className="grid grid-cols-3 gap-3">
            <Stat label='סה"כ שורות' value={preview.total} />
            <Stat label="תקינות" value={preview.okCount ?? 0} accent="success" />
            <Stat label="סטטוס מזוהם" value={preview.polluted} accent="warn" />
          </div>
          {preview.unknownCompanies?.length > 0 && (
            <Warn title="חברות לא מזוהות" items={preview.unknownCompanies} />
          )}
          {preview.unknownProducts?.length > 0 && (
            <Warn title="מוצרים לא מזוהים" items={preview.unknownProducts} />
          )}
          {preview.unknownStatuses?.length > 0 && (
            <Warn title="סטטוסים לא מזוהים" items={preview.unknownStatuses} />
          )}
          <div className="flex gap-2 pt-2">
            <Button onClick={doCommit} disabled={pending} variant="primary">
              {pending ? 'קולט...' : `קלוט ${preview.total} שורות`}
            </Button>
            <Button variant="ghost" onClick={() => setPreview(null)}>ביטול</Button>
          </div>
        </div>
      )}

      {committed && (
        <div className="mt-6 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4">
          <div className="font-semibold text-emerald-200">קליטה הושלמה</div>
          <div className="text-sm mt-1">
            ✓ {committed.okRows} שורות נקלטו
            {committed.errorRows > 0 && <span className="text-rose-300"> · {committed.errorRows} שגיאות</span>}
          </div>
        </div>
      )}
    </Card>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: 'success' | 'warn' }) {
  return (
    <div className={`rounded-lg p-3 ${accent === 'success' ? 'bg-emerald-500/10' : accent === 'warn' ? 'bg-amber-500/10' : 'bg-white/5'}`}>
      <div className="text-xs text-white/60">{label}</div>
      <div className="text-xl font-semibold mt-0.5">{value}</div>
    </div>
  );
}

function Warn({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
      <div className="font-semibold mb-1">{title} ({items.length})</div>
      <div className="flex flex-wrap gap-1">
        {items.slice(0, 20).map((s, i) => (
          <Badge key={i} className="bg-amber-500/20 text-amber-200">{s}</Badge>
        ))}
        {items.length > 20 && <span className="text-white/50">+{items.length - 20}</span>}
      </div>
    </div>
  );
}

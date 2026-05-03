'use client';

import { useState, useTransition, useEffect } from 'react';
import { Button, Card, CardTitle, Field, Input, Select, Textarea, Badge } from '@/components/ui';
import { fmtMoney } from '@/lib/format';
import { TRANSFER_TYPE_LABELS, PRODUCT_CATEGORY_LABELS } from '@/lib/labels';
import { Plus, Trash2 } from 'lucide-react';
import { createSale } from '@/lib/actions/sales';
import { useRouter } from 'next/navigation';

type Client = { id: string; fullName: string; idNumber: string | null; phone: string | null };
type Company = { id: string; code: string; nameHe: string; kind: string };
type ProductType = { id: string; code: string; nameHe: string; category: string; supportsAccumulation: boolean; supportsMonthlyPremium: boolean };

interface ItemDraft {
  id: string;
  companyId: string;
  productTypeId: string;
  subKey?: string;
  track?: string;
  monthlyPremium: number;
  annualPremium: number;
  lumpSum: number;
  accumulatedAmount: number;
  recognitionFactor: number;
  insuranceCoverage: number;
  policyNumber: string;
  policyStartDate: string;
  preview?: { hasRule: boolean; scopeAmount: number; recurringMonthlyAmount: number; message?: string };
}

const newItem = (): ItemDraft => ({
  id: crypto.randomUUID(),
  companyId: '',
  productTypeId: '',
  monthlyPremium: 0,
  annualPremium: 0,
  lumpSum: 0,
  accumulatedAmount: 0,
  recognitionFactor: 1,
  insuranceCoverage: 0,
  policyNumber: '',
  policyStartDate: '',
});

export function NewSaleWizard({
  clients,
  companies,
  productTypes,
  defaultClientId,
}: {
  clients: Client[];
  companies: Company[];
  productTypes: ProductType[];
  defaultClientId?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [clientId, setClientId] = useState(defaultClientId ?? '');
  const [transferType, setTransferType] = useState('NEW_MONEY');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<ItemDraft[]>([newItem()]);

  const updateItem = (id: string, patch: Partial<ItemDraft>) =>
    setItems((arr) => arr.map((i) => (i.id === id ? { ...i, ...patch } : i)));

  const removeItem = (id: string) =>
    setItems((arr) => (arr.length === 1 ? arr : arr.filter((i) => i.id !== id)));

  // Live preview — debounced fetch when item inputs change
  useEffect(() => {
    items.forEach(async (item) => {
      if (!item.companyId || !item.productTypeId) return;
      const handle = setTimeout(async () => {
        try {
          const res = await fetch('/api/commissions/preview', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              companyId: item.companyId,
              productTypeId: item.productTypeId,
              subKey: item.subKey,
              track: item.track,
              transferType,
              monthlyPremium: Number(item.monthlyPremium) || 0,
              annualPremium: Number(item.annualPremium) || 0,
              lumpSum: Number(item.lumpSum) || 0,
              accumulatedAmount: Number(item.accumulatedAmount) || 0,
              recognitionFactor: Number(item.recognitionFactor) || 1,
              insuranceCoverage: Number(item.insuranceCoverage) || 0,
            }),
          });
          if (!res.ok) return;
          const data = await res.json();
          updateItem(item.id, { preview: data });
        } catch { /* ignore */ }
      }, 250);
      return () => clearTimeout(handle);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(items.map((i) => ({ ...i, preview: undefined }))), transferType]);

  const totalScope = items.reduce((s, i) => s + (i.preview?.scopeAmount ?? 0), 0);
  const totalRecurring = items.reduce((s, i) => s + (i.preview?.recurringMonthlyAmount ?? 0), 0);

  const submit = () => {
    setError(null);
    if (!clientId) { setError('בחר לקוח'); return; }
    startTransition(async () => {
      try {
        await createSale({
          clientId,
          transferType,
          notes: notes || undefined,
          items: items.map((i) => ({
            companyId: i.companyId,
            productTypeId: i.productTypeId,
            subKey: i.subKey,
            track: i.track,
            monthlyPremium: Number(i.monthlyPremium) || 0,
            annualPremium: Number(i.annualPremium) || 0,
            lumpSum: Number(i.lumpSum) || 0,
            accumulatedAmount: Number(i.accumulatedAmount) || 0,
            recognitionFactor: Number(i.recognitionFactor) || 1,
            insuranceCoverage: Number(i.insuranceCoverage) || 0,
            policyNumber: i.policyNumber || undefined,
            policyStartDate: i.policyStartDate || undefined,
          })),
        });
      } catch (e: any) {
        setError(e?.message ?? 'שגיאה ביצירת עסקה');
      }
    });
  };

  return (
    <div className="grid lg:grid-cols-[1fr_360px] gap-4">
      <div className="space-y-4">
        <Card>
          <CardTitle>לקוח</CardTitle>
          <Field label="בחר לקוח קיים *">
            <Select value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">— בחר —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.fullName}
                  {c.idNumber ? ` · ${c.idNumber}` : ''}
                  {c.phone ? ` · ${c.phone}` : ''}
                </option>
              ))}
            </Select>
          </Field>
          <div className="mt-3 flex gap-3 text-xs text-white/60">
            <span>אין את הלקוח?</span>
            <a href="/clients/new" className="text-brand-300 hover:text-brand-100">צור לקוח חדש</a>
          </div>
        </Card>

        <Card>
          <CardTitle>סוג העברה</CardTitle>
          <div className="flex gap-2 flex-wrap">
            {Object.entries(TRANSFER_TYPE_LABELS).map(([k, v]) => (
              <button
                key={k}
                type="button"
                onClick={() => setTransferType(k)}
                className={`px-4 py-2 rounded-lg text-sm border ${transferType === k ? 'border-brand-500 bg-brand-500/20 text-brand-100' : 'border-white/15 hover:bg-white/5'}`}
              >
                {v}
              </button>
            ))}
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-3">
            <CardTitle className="mb-0">פריטי עסקה</CardTitle>
            <Button variant="secondary" size="sm" onClick={() => setItems((a) => [...a, newItem()])}>
              <Plus className="h-4 w-4" />הוסף פריט
            </Button>
          </div>

          <div className="space-y-4">
            {items.map((item, idx) => (
              <ItemRow
                key={item.id}
                idx={idx}
                item={item}
                companies={companies}
                productTypes={productTypes}
                canRemove={items.length > 1}
                onChange={(p) => updateItem(item.id, p)}
                onRemove={() => removeItem(item.id)}
              />
            ))}
          </div>
        </Card>

        <Card>
          <CardTitle>הערות</CardTitle>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="הערות פנימיות לעסקה" rows={3} />
        </Card>

        {error && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-400">{error}</div>
        )}

        <div className="flex gap-2">
          <Button onClick={submit} disabled={pending} size="lg">
            {pending ? 'יוצר עסקה...' : 'צור עסקה'}
          </Button>
          <Button variant="ghost" size="lg" onClick={() => router.back()}>ביטול</Button>
        </div>
      </div>

      <aside className="space-y-3">
        <Card className="sticky top-4">
          <CardTitle>תחזית עמלה</CardTitle>
          <div className="space-y-3">
            <Stat label="היקף צפוי (חד-פעמי)" value={fmtMoney(totalScope)} accent="brand" />
            <Stat label="שוטפת חודשית" value={fmtMoney(totalRecurring)} accent="success" />
            <Stat label="שוטפת שנתית" value={fmtMoney(totalRecurring * 12)} sub="× 12" />
            <Stat label="LTV 5 שנים (משוער)" value={fmtMoney(totalScope + totalRecurring * 60)} sub="היקף + שוטפת × 60" />
          </div>

          <div className="mt-4 pt-4 border-t border-white/10 space-y-2">
            <div className="text-xs uppercase text-white/50 mb-2">פירוט לפי פריט</div>
            {items.map((item, idx) => (
              <div key={item.id} className="text-xs bg-white/5 rounded-lg p-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-white/80">פריט {idx + 1}</span>
                  {item.preview?.hasRule === false && <Badge className="text-rose-400 border-rose-500/30">אין חוק</Badge>}
                </div>
                <div className="flex justify-between text-white/60">
                  <span>היקף</span>
                  <span>{fmtMoney(item.preview?.scopeAmount ?? 0)}</span>
                </div>
                <div className="flex justify-between text-white/60">
                  <span>שוטפת</span>
                  <span>{fmtMoney(item.preview?.recurringMonthlyAmount ?? 0)}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </aside>
    </div>
  );
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: 'brand' | 'success' }) {
  return (
    <div className={`rounded-lg p-3 ${accent === 'brand' ? 'bg-brand-500/10' : accent === 'success' ? 'bg-emerald-500/10' : 'bg-white/5'}`}>
      <div className="text-xs text-white/60">{label}</div>
      <div className="text-lg font-semibold mt-0.5">{value}</div>
      {sub && <div className="text-[10px] text-white/40">{sub}</div>}
    </div>
  );
}

function ItemRow({
  idx, item, companies, productTypes, canRemove, onChange, onRemove,
}: {
  idx: number;
  item: ItemDraft;
  companies: Company[];
  productTypes: ProductType[];
  canRemove: boolean;
  onChange: (p: Partial<ItemDraft>) => void;
  onRemove: () => void;
}) {
  const product = productTypes.find((p) => p.id === item.productTypeId);
  const isRisk = product?.category === 'RISK';

  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="h-7 w-7 rounded-full bg-white/10 flex items-center justify-center text-xs font-bold">{idx + 1}</span>
          <span className="text-sm font-medium">פריט {idx + 1}</span>
        </div>
        {canRemove && (
          <button onClick={onRemove} className="text-white/40 hover:text-rose-400">
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <Field label="חברה *">
          <Select value={item.companyId} onChange={(e) => onChange({ companyId: e.target.value })}>
            <option value="">—</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.nameHe}</option>)}
          </Select>
        </Field>
        <Field label="סוג מוצר *">
          <Select value={item.productTypeId} onChange={(e) => {
            const pt = productTypes.find(p => p.id === e.target.value);
            const subKey = pt && ['risk_life','risk_mortgage','risk_health'].includes(pt.code) ? pt.code : undefined;
            onChange({ productTypeId: e.target.value, subKey });
          }}>
            <option value="">—</option>
            {productTypes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nameHe} ({PRODUCT_CATEGORY_LABELS[p.category as keyof typeof PRODUCT_CATEGORY_LABELS] ?? p.category})
              </option>
            ))}
          </Select>
        </Field>

        <Field label="מספר פוליסה">
          <Input value={item.policyNumber} onChange={(e) => onChange({ policyNumber: e.target.value })} />
        </Field>
        <Field label="תאריך תחילת פוליסה">
          <Input type="date" value={item.policyStartDate} onChange={(e) => onChange({ policyStartDate: e.target.value })} />
        </Field>

        {product?.supportsMonthlyPremium !== false && (
          <>
            <Field label="פרמיה חודשית">
              <Input type="number" step="0.01" value={item.monthlyPremium}
                onChange={(e) => onChange({ monthlyPremium: parseFloat(e.target.value) || 0, annualPremium: (parseFloat(e.target.value) || 0) * 12 })} />
            </Field>
            <Field label="פרמיה שנתית">
              <Input type="number" step="0.01" value={item.annualPremium}
                onChange={(e) => onChange({ annualPremium: parseFloat(e.target.value) || 0 })} />
            </Field>
          </>
        )}

        {product?.supportsAccumulation !== false && (
          <>
            <Field label="צבירה (העברה)">
              <Input type="number" step="0.01" value={item.accumulatedAmount}
                onChange={(e) => onChange({ accumulatedAmount: parseFloat(e.target.value) || 0 })} />
            </Field>
            <Field label="דנח מצבירה" hint="0..1 — 0.85 = 85%">
              <Input type="number" step="0.01" min="0" max="2" value={item.recognitionFactor}
                onChange={(e) => onChange({ recognitionFactor: parseFloat(e.target.value) || 1 })} />
            </Field>
          </>
        )}

        {isRisk && (
          <Field label="סכום ביטוח">
            <Input type="number" step="0.01" value={item.insuranceCoverage}
              onChange={(e) => onChange({ insuranceCoverage: parseFloat(e.target.value) || 0 })} />
          </Field>
        )}
      </div>

      {item.preview && (
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg bg-brand-500/10 p-2">
            <div className="text-white/50">היקף</div>
            <div className="font-semibold">{fmtMoney(item.preview.scopeAmount)}</div>
          </div>
          <div className="rounded-lg bg-emerald-500/10 p-2">
            <div className="text-white/50">שוטפת/חודש</div>
            <div className="font-semibold">{fmtMoney(item.preview.recurringMonthlyAmount)}</div>
          </div>
        </div>
      )}
      {item.preview && !item.preview.hasRule && item.companyId && item.productTypeId && (
        <div className="mt-2 text-xs text-amber-400">⚠ לא נמצא הסכם עמלה תואם</div>
      )}
    </div>
  );
}

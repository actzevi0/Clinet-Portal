'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { PIPELINE_COLUMNS, SALE_STATUS_COLORS } from '@/lib/labels';
import { fmtMoney } from '@/lib/format';
import { changeSaleStatus } from '@/lib/actions/sales';
import type { SaleStatus } from '@prisma/client';

interface SaleCardData {
  id: string;
  status: SaleStatus;
  clientName: string;
  clientIdNumber: string | null;
  totalScope: number;
  totalRecurring: number;
  items: { companyName: string; productName: string }[];
  updatedAt: string;
}

export function PipelineBoard({ sales }: { sales: SaleCardData[] }) {
  const [list, setList] = useState(sales);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const move = (id: string, newStatus: SaleStatus) => {
    setList((arr) => arr.map((s) => (s.id === id ? { ...s, status: newStatus } : s)));
    startTransition(async () => {
      try { await changeSaleStatus(id, newStatus); }
      catch { /* server action will revalidate */ }
    });
  };

  return (
    <div className="flex gap-3 overflow-x-auto pb-4 flex-1">
      {PIPELINE_COLUMNS.map((col) => {
        const colSales = list.filter((s) => s.status === col.status);
        const colTotal = colSales.reduce((acc, s) => acc + s.totalScope, 0);

        return (
          <div
            key={col.status}
            className="min-w-[280px] flex-1 max-w-sm flex flex-col rounded-xl border border-white/10 bg-white/[0.02]"
            onDragOver={(e) => { e.preventDefault(); }}
            onDrop={(e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData('text/plain') || draggingId;
              if (id) move(id, col.status);
              setDraggingId(null);
            }}
          >
            <header className="px-3 py-2.5 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${SALE_STATUS_COLORS[col.status]}`} />
                <span className="text-sm font-medium">{col.label}</span>
                <span className="text-xs text-white/40">({colSales.length})</span>
              </div>
              {colTotal > 0 && (
                <span className="text-[11px] text-white/50">{fmtMoney(colTotal)}</span>
              )}
            </header>
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {colSales.map((s) => (
                <SaleCard
                  key={s.id}
                  sale={s}
                  onDragStart={() => setDraggingId(s.id)}
                />
              ))}
              {colSales.length === 0 && (
                <div className="text-center text-xs text-white/30 py-6 border border-dashed border-white/10 rounded-lg">
                  גרור לכאן
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SaleCard({ sale, onDragStart }: { sale: SaleCardData; onDragStart: () => void }) {
  return (
    <Link
      href={`/sales/${sale.id}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', sale.id);
        e.dataTransfer.effectAllowed = 'move';
        onDragStart();
      }}
      className="block rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20 p-3 cursor-grab active:cursor-grabbing"
    >
      <div className="font-medium text-sm">{sale.clientName}</div>
      {sale.clientIdNumber && <div className="text-[11px] text-white/40 font-mono">{sale.clientIdNumber}</div>}
      <div className="mt-2 space-y-1">
        {sale.items.slice(0, 2).map((i, idx) => (
          <div key={idx} className="text-[11px] text-white/60 truncate">
            {i.companyName} · {i.productName}
          </div>
        ))}
        {sale.items.length > 2 && (
          <div className="text-[11px] text-white/40">+{sale.items.length - 2} נוספים</div>
        )}
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px]">
        <span className="text-emerald-300/80">{fmtMoney(sale.totalScope)}</span>
        <span className="text-white/40">{fmtMoney(sale.totalRecurring)}/חו'</span>
      </div>
    </Link>
  );
}

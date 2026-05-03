'use client';

import { useTransition } from 'react';
import { Select } from '@/components/ui';
import { SALE_STATUS_LABELS } from '@/lib/labels';
import { changeSaleStatus } from '@/lib/actions/sales';
import type { SaleStatus } from '@prisma/client';

export function StatusChanger({ saleId, currentStatus }: { saleId: string; currentStatus: SaleStatus }) {
  const [pending, start] = useTransition();
  return (
    <Select
      value={currentStatus}
      disabled={pending}
      onChange={(e) => start(() => changeSaleStatus(saleId, e.target.value as SaleStatus))}
      className="w-44"
    >
      {Object.entries(SALE_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
    </Select>
  );
}

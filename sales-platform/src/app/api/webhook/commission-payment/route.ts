/**
 * Webhook ingestion for commission payments.
 *
 * Headers:
 *   x-webhook-secret: <env WEBHOOK_SECRET>
 *
 * Body (JSON):
 *   {
 *     "tenantSlug": "talpiot-demo",
 *     "agentEmail": "tzvi@...",            // looks up userId
 *     "companyCode": "phoenix",
 *     "paymentDate": "2026-05-01",
 *     "amount": 2500.0,
 *     "policyNumber": "1234567",
 *     "externalRef": "MISLUKA-...",
 *     "raw": { ... }                        // optional raw payload
 *   }
 *
 * For batch ingestion, send {"items":[ {...}, {...} ]}.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { monthKey } from '@/lib/format';

const ItemSchema = z.object({
  tenantSlug: z.string(),
  agentEmail: z.string().email(),
  companyCode: z.string(),
  paymentDate: z.string(),
  amount: z.number().positive(),
  policyNumber: z.string().optional(),
  externalRef: z.string().optional(),
  raw: z.any().optional(),
});
const Body = z.union([ItemSchema, z.object({ items: z.array(ItemSchema) })]);

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-webhook-secret');
  if (!process.env.WEBHOOK_SECRET || secret !== process.env.WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'invalid secret' }, { status: 401 });
  }
  const data = Body.safeParse(await req.json().catch(() => null));
  if (!data.success) return NextResponse.json({ error: data.error.message }, { status: 400 });

  const items = 'items' in data.data ? data.data.items : [data.data];
  let inserted = 0, errors: any[] = [];

  for (const it of items) {
    try {
      const tenant = await prisma.tenant.findUnique({ where: { slug: it.tenantSlug } });
      if (!tenant) throw new Error(`tenant not found: ${it.tenantSlug}`);
      const agent = await prisma.user.findFirst({
        where: { email: it.agentEmail.toLowerCase(), tenantId: tenant.id },
      });
      if (!agent) throw new Error(`agent not found: ${it.agentEmail}`);
      const company = await prisma.company.findFirst({ where: { code: it.companyCode } });
      if (!company) throw new Error(`company not found: ${it.companyCode}`);

      const date = new Date(it.paymentDate);
      await prisma.commissionPayment.create({
        data: {
          tenantId: tenant.id,
          userId: agent.id,
          companyId: company.id,
          paymentDate: date,
          paymentMonth: monthKey(date),
          amount: it.amount,
          source: 'WEBHOOK',
          externalRef: it.externalRef,
          policyNumber: it.policyNumber,
          rawPayload: it.raw ?? undefined,
        },
      });
      inserted++;
    } catch (e: any) {
      errors.push({ item: it, error: e?.message ?? String(e) });
    }
  }

  return NextResponse.json({ ok: true, inserted, errors });
}

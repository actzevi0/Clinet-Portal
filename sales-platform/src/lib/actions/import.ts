'use server';

import { revalidatePath } from 'next/cache';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import ExcelJS from 'exceljs';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { normalizeSalesRow, type RawSalesRow, type NormalizedRow } from '@/lib/importer/normalize';

const HEADER_MAP: Record<string, keyof RawSalesRow> = {
  'שם סוכן': 'שם_סוכן',
  'שם לקוח': 'שם_לקוח',
  'תעודת זהות': 'תעודת_זהות',
  'מספר פוליסה': 'מספר_פוליסה',
  'תאריך קליטה': 'תאריך_קליטה',
  'תאריך מעקב': 'תאריך_מעקב',
  'שם חברה': 'שם_חברה',
  'קטגוריה': 'קטגוריה',
  'סוג תוכנית': 'סוג_תוכנית',
  'פרמיה חודשית': 'פרמיה_חודשית',
  'פרמיה שנתית': 'פרמיה_שנתית',
  'צבירה': 'צבירה',
  'דנח מצבירה': 'דנח_מצבירה',
  'סטטוס': 'סטטוס',
  'סוג העברה': 'סוג_העברה',
  'עמלת היקף': 'עמלת_היקף',
  'עמלה שוטפת': 'עמלה_שוטפת',
  'הערות': 'הערות',
};

async function parseSheet(buffer: ArrayBuffer, sheetName: string): Promise<RawSalesRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.getWorksheet(sheetName) ?? wb.worksheets[0];
  if (!ws) throw new Error('no worksheet');
  const headerRow = ws.getRow(1);
  const indexToKey = new Map<number, keyof RawSalesRow>();
  headerRow.eachCell((cell, col) => {
    const v = cell.value === null || cell.value === undefined ? '' : String(cell.value).trim();
    const mapped = HEADER_MAP[v];
    if (mapped) indexToKey.set(col, mapped);
  });
  const out: RawSalesRow[] = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const obj: RawSalesRow = {};
    let has = false;
    indexToKey.forEach((key, col) => {
      const v = row.getCell(col).value;
      if (v !== null && v !== undefined && v !== '') {
        (obj as any)[key] = v;
        has = true;
      }
    });
    if (has) out.push(obj);
  }
  return out;
}

export async function uploadAndPreviewExcel(formData: FormData) {
  const user = await requireUser();
  if (!user.tenantId) throw new Error('no tenant');
  const file = formData.get('file');
  if (!(file instanceof File)) return { error: 'בחר קובץ' };

  const buf = await file.arrayBuffer();
  const sheetName = String(formData.get('sheet') || 'מכירות');
  let raw: RawSalesRow[];
  try {
    raw = await parseSheet(buf, sheetName);
  } catch (e: any) {
    return { error: `שגיאה בקריאת הקובץ: ${e?.message ?? e}` };
  }
  const normalized = raw.map(normalizeSalesRow);

  // store the file for the commit step
  const tmpDir = path.join(os.tmpdir(), 'sales-platform-imports');
  await fs.mkdir(tmpDir, { recursive: true });
  const tmpFile = path.join(tmpDir, `${Date.now()}-${file.name.replace(/[^\w.-]/g, '_')}`);
  await fs.writeFile(tmpFile, Buffer.from(buf));

  const batch = await prisma.importBatch.create({
    data: {
      tenantId: user.tenantId,
      source: 'excel_legacy',
      filename: file.name,
      status: 'previewing',
      totalRows: normalized.length,
      preview: {
        sample: normalized.slice(0, 25),
        tmpFile,
        sheet: sheetName,
        stats: summarize(normalized),
      } as any,
    },
  });

  revalidatePath('/import');
  return { ok: true as const, batchId: batch.id, ...summarize(normalized) };
}

function summarize(rows: NormalizedRow[]) {
  return {
    total: rows.length,
    okCount: rows.filter((r) => r.warnings.length === 0).length,
    polluted: rows.filter((r) => r.rawStatusPolluted).length,
    unknownCompanies: [...new Set(rows.flatMap((r) => r.warnings.filter((w) => w.startsWith('unknown company'))))],
    unknownProducts: [...new Set(rows.flatMap((r) => r.warnings.filter((w) => w.startsWith('unknown product'))))],
    unknownStatuses: [...new Set(rows.flatMap((r) => r.warnings.filter((w) => w.startsWith('unknown status'))))],
  };
}

export async function commitImport(batchId: string) {
  const user = await requireUser();
  if (!user.tenantId) throw new Error('no tenant');

  const batch = await prisma.importBatch.findFirst({
    where: { id: batchId, tenantId: user.tenantId },
  });
  if (!batch || batch.status !== 'previewing') return { error: 'batch not in previewing state' };

  const preview = batch.preview as any;
  const tmpFile = preview?.tmpFile as string;
  const sheet = (preview?.sheet as string) ?? 'מכירות';
  const buf = await fs.readFile(tmpFile);
  const raw = await parseSheet(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, sheet);
  const rows = raw.map(normalizeSalesRow);

  const [companies, productTypes] = await Promise.all([
    prisma.company.findMany(),
    prisma.productType.findMany(),
  ]);
  const companyByCode = new Map(companies.map((c) => [c.code, c]));
  const productByCode = new Map(productTypes.map((p) => [p.code, p]));

  let okRows = 0, errorRows = 0;
  const errors: { row: number; message: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    try {
      if (!r.idNumber || !r.companyCode || !r.productTypeCode) {
        throw new Error('missing required: id_number / company / product_type');
      }
      const co = companyByCode.get(r.companyCode);
      const pt = productByCode.get(r.productTypeCode);
      if (!co || !pt) throw new Error(`catalog miss: ${r.companyCode}/${r.productTypeCode}`);

      const client = await prisma.client.upsert({
        where: { tenantId_idNumber: { tenantId: user.tenantId!, idNumber: r.idNumber } },
        update: { fullName: r.clientName ?? 'unknown' },
        create: {
          tenantId: user.tenantId!,
          ownerUserId: user.id,
          fullName: r.clientName ?? 'unknown',
          idNumber: r.idNumber,
          firstContactAt: r.receivedAt ?? undefined,
        },
      });
      const sale = await prisma.sale.create({
        data: {
          tenantId: user.tenantId!,
          ownerUserId: user.id,
          clientId: client.id,
          status: (r.status as any) ?? 'LEAD',
          transferType: (r.transferType as any) ?? null,
          notes: r.notes,
          createdAt: r.receivedAt ?? undefined,
        },
      });
      await prisma.saleItem.create({
        data: {
          saleId: sale.id,
          tenantId: user.tenantId!,
          companyId: co.id,
          productTypeId: pt.id,
          policyNumber: r.policyNumber,
          monthlyPremium: r.monthlyPremium,
          annualPremium: r.annualPremium,
          accumulatedAmount: r.accumulatedAmount,
          recognitionFactor: r.recognitionFactor,
          expectedScopeCommission: r.scopeAmount,
          expectedRecurringCommission: r.recurringAmount,
        },
      });
      await prisma.sale.update({
        where: { id: sale.id },
        data: { totalExpectedScope: r.scopeAmount, totalExpectedRecurring: r.recurringAmount },
      });
      okRows++;
    } catch (e: any) {
      errorRows++;
      errors.push({ row: i + 2, message: e?.message ?? String(e) });
    }
  }

  await prisma.importBatch.update({
    where: { id: batch.id },
    data: {
      status: 'committed',
      okRows,
      errorRows,
      errors: errors as any,
      committedAt: new Date(),
    },
  });

  // cleanup tmp file
  await fs.unlink(tmpFile).catch(() => {});

  revalidatePath('/import');
  revalidatePath('/sales');
  revalidatePath('/clients');
  return { ok: true, okRows, errorRows };
}

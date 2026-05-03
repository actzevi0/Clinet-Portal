/**
 * CLI: import legacy Excel into the platform.
 *
 * Usage:
 *   tsx src/lib/importer/cli.ts <path-to-xlsx> --tenant=<slug> --commit
 *
 * Without --commit: dry run, prints summary + warnings.
 * With --commit: writes to DB inside a single ImportBatch.
 *
 * NOTE: scope of Phase 0 is the מכירות sheet only. Other sheets (פוטנציאל,
 * שכר טרחה, מינויי סוכן) come in Phase 1.
 */

import * as path from 'node:path';
import ExcelJS from 'exceljs';
import { PrismaClient } from '@prisma/client';
import { normalizeSalesRow, RawSalesRow, NormalizedRow } from './normalize';

const prisma = new PrismaClient();

const SHEET_NAME = 'מכירות';

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

async function readSalesSheet(filePath: string): Promise<RawSalesRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const ws = wb.getWorksheet(SHEET_NAME);
  if (!ws) throw new Error(`Sheet "${SHEET_NAME}" not found`);

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
    let hasContent = false;
    indexToKey.forEach((key, col) => {
      const v = row.getCell(col).value;
      if (v !== null && v !== undefined && v !== '') {
        (obj as any)[key] = v;
        hasContent = true;
      }
    });
    if (hasContent) out.push(obj);
  }
  return out;
}

interface Stats {
  totalRows: number;
  okRows: number;
  rowsWithWarnings: number;
  unknownCompanies: Set<string>;
  unknownProducts: Set<string>;
  unknownCategories: Set<string>;
  unknownStatuses: Set<string>;
  pollutedStatusRows: number;
}

function summarize(rows: NormalizedRow[]): Stats {
  const s: Stats = {
    totalRows: rows.length,
    okRows: 0,
    rowsWithWarnings: 0,
    unknownCompanies: new Set(),
    unknownProducts: new Set(),
    unknownCategories: new Set(),
    unknownStatuses: new Set(),
    pollutedStatusRows: 0,
  };
  for (const r of rows) {
    if (r.warnings.length === 0) s.okRows++;
    else s.rowsWithWarnings++;
    for (const w of r.warnings) {
      if (w.startsWith('unknown company "')) s.unknownCompanies.add(w);
      if (w.startsWith('unknown product "')) s.unknownProducts.add(w);
      if (w.startsWith('unknown category "')) s.unknownCategories.add(w);
      if (w.startsWith('unknown status "')) s.unknownStatuses.add(w);
    }
    if (r.rawStatusPolluted) s.pollutedStatusRows++;
  }
  return s;
}

async function commit(rows: NormalizedRow[], tenantSlug: string) {
  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) throw new Error(`tenant not found: ${tenantSlug}`);

  // pre-fetch catalogs
  const companies = await prisma.company.findMany({ where: { tenantId: null } });
  const productTypes = await prisma.productType.findMany({ where: { tenantId: null } });
  const companyByCode = new Map(companies.map(c => [c.code, c]));
  const productByCode = new Map(productTypes.map(p => [p.code, p]));

  const batch = await prisma.importBatch.create({
    data: { tenantId: tenant.id, source: 'excel_legacy', status: 'previewing', totalRows: rows.length },
  });

  // for Phase 0 commit we only seed clients + sales + sale_items.
  // We DO NOT trigger the commission engine here — it runs separately on demand.
  let okRows = 0, errorRows = 0;
  const errors: { row: number; message: string }[] = [];

  // resolve a default agent — first ADMIN of the tenant
  const defaultAgent = await prisma.user.findFirst({
    where: { tenantId: tenant.id, role: { in: ['ADMIN', 'AGENT'] } },
    orderBy: { createdAt: 'asc' },
  });
  if (!defaultAgent) throw new Error('no agent in tenant');

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
        where: { tenantId_idNumber: { tenantId: tenant.id, idNumber: r.idNumber } },
        update: { fullName: r.clientName ?? 'unknown' },
        create: {
          tenantId: tenant.id,
          ownerUserId: defaultAgent.id,
          fullName: r.clientName ?? 'unknown',
          idNumber: r.idNumber,
          firstContactAt: r.receivedAt ?? undefined,
        },
      });

      const sale = await prisma.sale.create({
        data: {
          tenantId: tenant.id,
          ownerUserId: defaultAgent.id,
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
          tenantId: tenant.id,
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

  return { batchId: batch.id, okRows, errorRows };
}

async function main() {
  const args = process.argv.slice(2);
  const file = args.find(a => !a.startsWith('--'));
  const tenant = args.find(a => a.startsWith('--tenant='))?.split('=')[1] ?? 'talpiot-demo';
  const doCommit = args.includes('--commit');
  if (!file) {
    console.error('usage: tsx src/lib/importer/cli.ts <xlsx> [--tenant=slug] [--commit]');
    process.exit(1);
  }

  const abs = path.resolve(file);
  console.log(`Reading sheet "${SHEET_NAME}" from ${abs}...`);
  const raw = await readSalesSheet(abs);
  const normalized = raw.map(normalizeSalesRow);
  const stats = summarize(normalized);

  console.log('\n══ DRY RUN SUMMARY ══');
  console.log(`Total rows:       ${stats.totalRows}`);
  console.log(`OK rows:          ${stats.okRows}`);
  console.log(`With warnings:    ${stats.rowsWithWarnings}`);
  console.log(`Polluted status:  ${stats.pollutedStatusRows}`);
  if (stats.unknownCompanies.size) {
    console.log('\nUnknown companies:');
    [...stats.unknownCompanies].forEach(w => console.log('  -', w));
  }
  if (stats.unknownProducts.size) {
    console.log('\nUnknown products:');
    [...stats.unknownProducts].forEach(w => console.log('  -', w));
  }
  if (stats.unknownCategories.size) {
    console.log('\nUnknown categories:');
    [...stats.unknownCategories].forEach(w => console.log('  -', w));
  }
  if (stats.unknownStatuses.size) {
    console.log('\nUnknown statuses:');
    [...stats.unknownStatuses].forEach(w => console.log('  -', w));
  }

  if (!doCommit) {
    console.log('\n(no --commit, skipping DB write)');
    return;
  }

  console.log(`\n→ Committing to tenant "${tenant}"...`);
  const r = await commit(normalized, tenant);
  console.log(`✓ batch ${r.batchId}: ok=${r.okRows} err=${r.errorRows}`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

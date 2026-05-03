/**
 * Seed entry-point.
 *
 * Idempotent: re-runs upsert on canonical catalog rows.
 *
 * Seeds:
 *   1. Companies (global catalog, tenantId=null)
 *   2. Product types (global catalog, tenantId=null)
 *   3. A demo tenant + superadmin + agent
 *   4. The "Family Office Manager" commission agreement with full rule set
 *      from the image provided by the user.
 */

import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { COMPANIES } from './seeds/companies';
import { PRODUCT_TYPES } from './seeds/product-types';
import {
  ANNUITY_MANAGERS,
  ANNUITY_PENSION,
  AnnuityRule,
  buildAnnuityFormula,
  buildInsurancePensionFormula,
  buildInsurancePensionTransferFormula,
  buildInsuranceSavingsFormula,
  buildInvestmentHouseFormula,
  buildInvestmentPensionFormula,
  buildRiskRecurringFormula,
  INS_PENSION_SCOPE,
  INS_PENSION_TRANSFER_FLAT,
  INS_SAVINGS_SCOPE_FLAT,
  INV_HOUSE_SCOPE_FLAT,
  INV_PENSION_SCOPE,
} from './seeds/commission-rules';
import type { CommissionFormula } from '../src/lib/commission-engine/types';

const prisma = new PrismaClient();

const DEMO_TENANT_SLUG = 'talpiot-demo';
const DEMO_AGENT_EMAIL = 'tzvi@talpiot-demo.co.il';
const DEMO_AGENT_PASSWORD = 'ChangeMe!2026';
const SUPERADMIN_EMAIL = 'superadmin@sales-platform.local';
const SUPERADMIN_PASSWORD = 'ChangeMe!2026';

async function seedCompanies() {
  console.log('→ Seeding companies...');
  for (const c of COMPANIES) {
    await prisma.company.upsert({
      where: { tenantId_code: { tenantId: '__global__', code: c.code } as any },
      update: { nameHe: c.nameHe, kind: c.kind },
      create: { code: c.code, nameHe: c.nameHe, kind: c.kind, tenantId: null as any },
    }).catch(async () => {
      // workaround for null tenantId in unique key on PG
      const existing = await prisma.company.findFirst({
        where: { code: c.code, tenantId: null },
      });
      if (existing) {
        await prisma.company.update({
          where: { id: existing.id },
          data: { nameHe: c.nameHe, kind: c.kind },
        });
      } else {
        await prisma.company.create({
          data: { code: c.code, nameHe: c.nameHe, kind: c.kind, tenantId: null },
        });
      }
    });
  }
  console.log(`  ✓ ${COMPANIES.length} companies`);
}

async function seedProductTypes() {
  console.log('→ Seeding product types...');
  for (const p of PRODUCT_TYPES) {
    const existing = await prisma.productType.findFirst({
      where: { code: p.code, tenantId: null },
    });
    const data = {
      code: p.code,
      nameHe: p.nameHe,
      category: p.category,
      fieldsSchema: p.fieldsSchema as any,
      supportsAccumulation: p.supportsAccumulation ?? true,
      supportsMonthlyPremium: p.supportsMonthlyPremium ?? true,
      tenantId: null as string | null,
    };
    if (existing) {
      await prisma.productType.update({ where: { id: existing.id }, data });
    } else {
      await prisma.productType.create({ data });
    }
  }
  console.log(`  ✓ ${PRODUCT_TYPES.length} product types`);
}

async function seedDemoTenant() {
  console.log('→ Seeding demo tenant + users...');
  const tenant = await prisma.tenant.upsert({
    where: { slug: DEMO_TENANT_SLUG },
    update: {},
    create: {
      slug: DEMO_TENANT_SLUG,
      name: 'תלפיות — בטחון פיננסי למשפחה (Demo)',
      plan: 'PRO',
      brandColor: '#6c3fc7',
    },
  });

  const superHash = await argon2.hash(SUPERADMIN_PASSWORD);
  await prisma.user.upsert({
    where: { email: SUPERADMIN_EMAIL },
    update: {},
    create: {
      email: SUPERADMIN_EMAIL,
      fullName: 'Super Admin',
      passwordHash: superHash,
      role: 'SUPERADMIN',
    },
  });

  const agentHash = await argon2.hash(DEMO_AGENT_PASSWORD);
  const agent = await prisma.user.upsert({
    where: { email: DEMO_AGENT_EMAIL },
    update: {},
    create: {
      tenantId: tenant.id,
      email: DEMO_AGENT_EMAIL,
      fullName: 'צבי חדד',
      passwordHash: agentHash,
      role: 'ADMIN',
    },
  });

  console.log(`  ✓ tenant ${tenant.slug}, agent ${agent.email}`);
  return { tenant, agent };
}

async function getCompanyId(code: string): Promise<string> {
  const c = await prisma.company.findFirst({ where: { code, tenantId: null } });
  if (!c) throw new Error(`Company not found: ${code}`);
  return c.id;
}

async function getProductTypeId(code: string): Promise<string> {
  const p = await prisma.productType.findFirst({ where: { code, tenantId: null } });
  if (!p) throw new Error(`ProductType not found: ${code}`);
  return p.id;
}

async function seedFamilyOfficeAgreement(tenantId: string) {
  console.log('→ Seeding "Family Office Manager" commission agreement...');

  const insuranceCos = ['phoenix', 'clal', 'harel', 'menora', 'migdal', 'hachshara', 'ayalon'];
  const pensionCos   = ['phoenix', 'clal', 'harel', 'menora', 'migdal'];
  const savingsCos   = insuranceCos;
  const invHouseCos  = ['infinity', 'analyst', 'yelin', 'meitav', 'altshuler', 'more'];
  const invPensionCos = ['meitav', 'altshuler', 'more', 'infinity'];

  // for simplicity: one agreement per company (not a single agreement covering all),
  // because each company has its own "agreement" in real life with the agent.
  for (const co of insuranceCos) {
    const companyId = await getCompanyId(co);

    const agreement = await prisma.commissionAgreement.create({
      data: {
        tenantId,
        companyId,
        name: `הסכם פמילי אופיס — ${co}`,
        validFrom: new Date('2025-01-01'),
        status: 'active',
        notes: 'נוצר אוטומטית מתמונת הטבלה של תלפיות',
      },
    });

    // RISK rules — one rule per sub-key (life, mortgage, health)
    if (co in (await import('./seeds/commission-rules')).RISK_SCOPE_RATES) {
      const riskTypes: Array<['risk_life' | 'risk_mortgage' | 'risk_health', string]> = [
        ['risk_life',     'risk_life'],
        ['risk_mortgage', 'risk_mortgage'],
        ['risk_health',   'risk_health'],
      ];
      for (const [subKey, productCode] of riskTypes) {
        const productTypeId = await getProductTypeId(productCode);
        const formula = buildRiskRecurringFormula(co, subKey);
        await prisma.commissionRule.create({
          data: {
            agreementId: agreement.id,
            productTypeId,
            subKey,
            formula: formula as any,
            priority: 100,
            notes: formula.description ?? null,
          },
        });
      }
    }

    // PENSION — only insurance companies
    if (pensionCos.includes(co) && co in INS_PENSION_SCOPE) {
      const productTypeId = await getProductTypeId('pension_fund');
      await prisma.commissionRule.create({
        data: {
          agreementId: agreement.id,
          productTypeId,
          formula: buildInsurancePensionFormula(co) as any,
          priority: 100,
        },
      });

      const transferTypeId = await getProductTypeId('pension_transfer');
      if (co in INS_PENSION_TRANSFER_FLAT) {
        await prisma.commissionRule.create({
          data: {
            agreementId: agreement.id,
            productTypeId: transferTypeId,
            formula: buildInsurancePensionTransferFormula(co) as any,
            priority: 100,
          },
        });
      }
    }

    // SAVINGS / GEMEL / HISHTALMUT — applies to multiple product types
    if (savingsCos.includes(co) && co in INS_SAVINGS_SCOPE_FLAT) {
      const types = ['keren_hishtalmut', 'kupat_gemel', 'savings_policy'];
      for (const code of types) {
        const productTypeId = await getProductTypeId(code);
        await prisma.commissionRule.create({
          data: {
            agreementId: agreement.id,
            productTypeId,
            formula: buildInsuranceSavingsFormula(co) as any,
            priority: 100,
          },
        });
      }
    }

    // ANNUITY — managers / pension
    const annM: AnnuityRule | null = ANNUITY_MANAGERS[co] ?? null;
    if (annM) {
      const productTypeId = await getProductTypeId('immediate_annuity_managers');
      await prisma.commissionRule.create({
        data: {
          agreementId: agreement.id,
          productTypeId,
          formula: buildAnnuityFormula(annM) as any,
          priority: 100,
          notes: annM.notes ?? null,
        },
      });
    }
    const annP: AnnuityRule | undefined = ANNUITY_PENSION[co];
    if (annP) {
      const productTypeId = await getProductTypeId('immediate_annuity_pension');
      await prisma.commissionRule.create({
        data: {
          agreementId: agreement.id,
          productTypeId,
          formula: buildAnnuityFormula(annP) as any,
          priority: 100,
          notes: annP.notes ?? null,
        },
      });
    }
  }

  // Investment-house pension rules
  for (const co of invPensionCos) {
    const companyId = await getCompanyId(co);
    const agreement = await prisma.commissionAgreement.create({
      data: {
        tenantId,
        companyId,
        name: `הסכם פמילי אופיס (פנסיוני) — ${co}`,
        validFrom: new Date('2025-01-01'),
        status: 'active',
      },
    });
    if (co in INV_PENSION_SCOPE) {
      const productTypeId = await getProductTypeId('pension_fund');
      await prisma.commissionRule.create({
        data: {
          agreementId: agreement.id,
          productTypeId,
          formula: buildInvestmentPensionFormula(co) as any,
          priority: 100,
        },
      });
    }
  }

  // Investment-house gemel/hishtalmut/savings
  for (const co of invHouseCos) {
    const companyId = await getCompanyId(co);
    const agreement = await prisma.commissionAgreement.create({
      data: {
        tenantId,
        companyId,
        name: `הסכם פמילי אופיס (גמל/השתלמות) — ${co}`,
        validFrom: new Date('2025-01-01'),
        status: 'active',
      },
    });
    if (co in INV_HOUSE_SCOPE_FLAT) {
      const types = ['keren_hishtalmut', 'kupat_gemel', 'gemel_investment'];
      for (const code of types) {
        const productTypeId = await getProductTypeId(code);
        await prisma.commissionRule.create({
          data: {
            agreementId: agreement.id,
            productTypeId,
            formula: buildInvestmentHouseFormula(co) as any,
            priority: 100,
          },
        });
      }
    }

    // Annuity for investment houses (only those with rules)
    const annP = ANNUITY_PENSION[co];
    if (annP) {
      const productTypeId = await getProductTypeId('immediate_annuity_pension');
      await prisma.commissionRule.create({
        data: {
          agreementId: agreement.id,
          productTypeId,
          formula: buildAnnuityFormula(annP) as any,
          priority: 100,
        },
      });
    }
  }

  console.log('  ✓ commission agreements + rules seeded');
}

async function main() {
  console.log('═══ Seeding sales-platform ═══');
  await seedCompanies();
  await seedProductTypes();
  const { tenant } = await seedDemoTenant();
  await seedFamilyOfficeAgreement(tenant.id);
  console.log('═══ Done ═══');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

# Sales Platform

CRM + Pipeline + Commission Forecasting + Reconciliation עבור עולם הביטוח, הפנסיה והפיננסים בישראל.

תוכנן ככזה ש‑(א) פועל לבד, ו‑(ב) יודע להתממשק בעתיד למערכת ניתוח העמלות הקיימת (EasyFinance על Cloudflare D1).

---

## Status — Phase 0 ✅

מה שנמצא ב‑repo כעת:

- **Prisma schema** מלא: `tenants`, `users`, `clients`, `companies`, `productTypes`, `commissionAgreements`, `commissionRules`, `sales`, `saleItems`, `saleSplits`, `expectedCommissions`, `commissionPayments`, `commissionMatches`, `tasks`, `activities`, `documents`, `forecastsMonthly`, `importBatches`, `auditLogs`. Multi-tenant עם soft-delete.
- **Commission Engine** טהור (TypeScript, ללא DB):
  - `src/lib/commission-engine/types.ts` — DSL.
  - `src/lib/commission-engine/evaluate.ts` — formula evaluator.
  - `src/lib/commission-engine/schedule.ts` — מחולל לוח זמנים + clawback.
  - `src/lib/commission-engine/resolve-rule.ts` — פותר rule הכי ספציפי.
- **Seed** עם 13 חברות + 23 סוגי מוצר + **כל אחוזי העמלה מהתמונה של "עמלת מנהל פמילי אופיס"** (`prisma/seeds/`).
- **Vitest** עם בדיקות נגד הנוסחאות מהתמונה ונתוני הפרופיט מהאקסל הישן.
- **Excel importer CLI** עם מילון נורמליזציה לכל החברות, הקטגוריות, סוגי המוצר והסטטוסים שמופיעים באקסל הישן.
- **Next.js 14 + Tailwind + Heebo** — RTL, dark mode, dashboard placeholder.

---

## Quick start

```bash
cd sales-platform
cp .env.example .env

# יישום DB מקומי
docker compose up -d db

# Install
pnpm install   # or npm install / yarn

# Migrate + seed
pnpm db:migrate
pnpm db:seed

# Tests (Commission Engine)
pnpm test

# Dev server
pnpm dev
# → http://localhost:3001
```

### Importer (legacy Excel → DB)

```bash
# dry run — מציג סיכום ואזהרות, לא כותב
pnpm tsx src/lib/importer/cli.ts /path/to/sales.xlsx

# commit — כותב ל‑tenant talpiot-demo
pnpm tsx src/lib/importer/cli.ts /path/to/sales.xlsx --tenant=talpiot-demo --commit
```

---

## Architecture

```
sales-platform/
├── prisma/
│   ├── schema.prisma            # Postgres schema (multi-tenant)
│   ├── seed.ts                  # idempotent catalog + agreements seed
│   └── seeds/
│       ├── companies.ts         # 13 חברות עם code קנוני
│       ├── product-types.ts     # 23 סוגי מוצר עם JSON Schema
│       └── commission-rules.ts  # נוסחאות העמלה מהתמונה
│
├── src/
│   ├── app/                     # Next.js App Router
│   │   ├── layout.tsx           # RTL Heebo
│   │   ├── page.tsx             # Phase-0 dashboard
│   │   └── globals.css
│   └── lib/
│       ├── db.ts                # Prisma singleton
│       ├── commission-engine/   # ⭐ המנוע
│       │   ├── types.ts
│       │   ├── evaluate.ts      # formula → { scope, recurring }
│       │   ├── schedule.ts      # → ExpectedCommission rows
│       │   ├── resolve-rule.ts  # finds best matching rule
│       │   ├── index.ts
│       │   └── __tests__/
│       ├── importer/
│       │   ├── normalize.ts     # mapping tables: dirty Hebrew → enums
│       │   └── cli.ts           # --dry/--commit
│       ├── product-engine/      # (Phase 1) dynamic forms from JSON Schema
│       ├── forecast-engine/     # (Phase 1)
│       └── reconciliation-engine/ # (Phase 2)
│
├── docker-compose.yml           # postgres 16
├── package.json
├── prisma migrations            # generated
└── tsconfig.json
```

---

## The Commission Engine — DSL

A rule is just JSON stored in `CommissionRule.formula`. Example — **ביטוח חיים למשכנתא בכלל**:

```json
{
  "scope": {
    "components": [{ "base": "annual_premium", "rate": 0.60 }],
    "supplementToAnnualPremiumPct": 0.95
  },
  "recurring": {
    "components": [{ "base": "monthly_premium", "rate": 0.25 }],
    "ratePeriod": "monthly",
    "durationMonths": null
  },
  "clawback": {
    "enabled": true,
    "schedule": [
      { "year": 1, "pct": 1.0 },
      { "year": 2, "pct": 0.6 },
      { "year": 3, "pct": 0.4 }
    ]
  }
}
```

This single DSL covers:

- אחוז של פרמיה שנתית/חודשית
- אחוז של צבירה (עם או בלי דנח מצבירה)
- סכומים פלאט (ניודי פנסיה ₪3000)
- מדרגות לפי צבירה (קצבה מיידית הראל: 250–500K = ₪5000, ≥500K = ₪10,000)
- **השלמה ל-X%** (Talpiot center supplements scope to 95% of annual premium)
- Floor / cap on amounts
- Clawback schedules per cancellation year
- Recurring duration (lifetime או חתום)

ראו `src/lib/commission-engine/__tests__/evaluate.test.ts` — 15+ בדיקות שמוכיחות התאמה למספרים מהתמונה ומהאקסל.

---

## Roadmap

| Phase | תכולה | סטטוס |
|---|---|---|
| 0 | Foundation: schema, engine, seed, importer | ✅ |
| 1 | Auth (NextAuth) + Pipeline UI + Sales/Clients CRUD + API routes + Importer UI | next |
| 2 | Reconciliation Engine + commission_payment webhook + matching | |
| 3 | Forecast Dashboard + Run Rate + LTV | |
| 4 | Workflow & Notifications (WhatsApp, Email, SMS) | |
| 5 | Multi-tenant manager role + sub-agents | |
| 6 | AI: OCR, anomaly detection, insights | |
| 7 | Hardening + GDPR (consent, export, delete) | |
| 8 | Integration with existing EasyFinance (commission analysis system) | |

---

## Decisions log

- **Postgres over D1** — מערכת חדשה, ללא תלות בהחלטות המערכת הקיימת. Prisma + Postgres נותן Decimal מדויק (₪), JSONB מהיר ל‑formulas, ו‑full-text search לחיפוש לקוחות. ניתן לעבור ל‑D1 אם נרצה לאחד.
- **Schema-driven product fields** — `ProductType.fieldsSchema` הוא JSON Schema. הפרונט מרנדר טופס דינמי, ה‑backend מאמת ב‑Zod. אין צורך ב‑schema migration כשמוסיפים שדה לסוג מוצר.
- **One agreement per (tenant, company)** — בעולם האמיתי לכל חברה יש הסכם נפרד עם הסוכן. תחת Agreement יש N rules (פר־מוצר/sub-key).
- **Rule resolution by specificity** — agent-specific > tenant-wide; subKey/track/transferType-match-bonus. ראה `resolve-rule.ts`.
- **Schedule materialization** — recurring expected commissions נוצרים כ‑rows חודשיות (default 60 חודשים אופק). זה מאפשר reconciliation ברמת חודש בודד.
- **Clawback as negative expected** — ביטול מייצר שורת `expected_commissions` שלילית עם kind=CLAWBACK.

---

## Future integration with EasyFinance

המערכת הקיימת (`/_worker.js`) מקבלת ערכי תיקים חודשיים. כש‑Phase 8 יגיע:

1. נוסיף `/api/webhook/commission-payment` שמקבל שורת תשלום עמלה (לא ערך תיק).
2. EasyFinance תפרסם תשלומי עמלה (אם וכאשר תוסיף תמיכה לכך) דרך אותו pattern של webhook secret.
3. Reconciliation Engine יבצע matching → `commission_matches`.

עד אז, המערכות עצמאיות לחלוטין.

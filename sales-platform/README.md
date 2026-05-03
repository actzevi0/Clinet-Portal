# Sales Platform

CRM + Pipeline + Commission Forecasting + Reconciliation עבור עולם הביטוח, הפנסיה והפיננסים בישראל.

תוכנן ככזה ש‑(א) פועל לבד, ו‑(ב) יודע להתממשק בעתיד למערכות אחרות (כמו מערכת ניתוח העמלות הקיימת).

---

## ✅ מה כלול במערכת

### Foundation (Phase 0)
- **Prisma schema** מלא: 20 מודלים, 13 enums, multi-tenant, soft-delete, audit log.
- **Commission Engine** טהור: DSL, evaluator, schedule, clawback, rule resolution.
- **Seed** עם 13 חברות + 23 סוגי מוצר + **כל אחוזי העמלה מהתמונה של "עמלת מנהל פמילי אופיס"**.
- **20 unit tests** מול הנוסחאות מהתמונה ומנתוני הפרופיט.

### Application (Phase 1)
- **Auth**: login/logout, sessions ב‑DB, Argon2, cookie‑based.
- **RBAC**: SUPERADMIN / ADMIN / MANAGER / AGENT / VIEWER.
- **Dashboard** עם KPIs אמיתיים (מכירות החודש, פרמיה מצטברת, תחזית, התקבל בפועל).
- **לקוחות**: רשימה, חיפוש, יצירה, דף 360°.
- **מכירות**: רשימה עם פילטרים, **Kanban עם drag & drop** לשינוי סטטוס.
- **אשף עסקה חדשה** עם **תחזית עמלה חיה** בזמן הקלדה.
- **דף עסקה**: פריטים, לוח עמלות 24 חודשים, פעילות, שינוי סטטוס.
- **עמלות**: סקירה · הסכמים · חוקים · עמלות צפויות · תשלומים.
- **התאמות**: אוטומטי + ידני, 4 בקטים (✓ ⚠ ✗ ?).
- **תחזית**: 12 חודשים, Run Rate, פייפליין משוקלל.
- **משימות**: רשימה + יצירה + סימון בוצע.
- **ייבוא**: העלאת xlsx, תצוגה מקדימה עם אזהרות, קליטה.
- **דוחות**: 6 דוחות CSV (UTF-8 BOM ל‑Excel עברי).
- **הגדרות**: צוות + יצירת משתמשים, קטלוג חברות, קטלוג מוצרים.
- **Webhook**: `/api/webhook/commission-payment` לקליטת תשלומים מבחוץ.

---

## Quick start

```bash
cd sales-platform
cp .env.example .env

# DB מקומי
docker compose up -d db

# Install
npm install --legacy-peer-deps

# Schema + seed
npm run db:push        # יוצר את כל הטבלאות מהסכמה
npm run db:seed        # 13 חברות, 23 מוצרים, הסכמי פמילי אופיס + משתמש דמו

# Tests
npm test               # → 20 passed

# Dev
npm run dev
# → http://localhost:3001
```

### כניסה ראשונית

| משתמש | סיסמה | תפקיד |
|---|---|---|
| `tzvi@talpiot-demo.co.il` | `ChangeMe!2026` | ADMIN (סוכנות תלפיות דמו) |
| `superadmin@sales-platform.local` | `ChangeMe!2026` | SUPERADMIN |

⚠️ **שנה סיסמאות מיד**.

### ייבוא נתונים מהאקסל הקיים

1. כנס ל‑`/import` או הרץ:
   ```bash
   npm run import:excel /path/to/sales.xlsx -- --tenant=talpiot-demo --commit
   ```
2. תקבל preview של כל השורות עם אזהרות (חברות לא מזוהות, סטטוסים מזוהמים, וכו').
3. אשר → קליטה ל‑DB.

---

## Architecture

```
sales-platform/
├── prisma/
│   ├── schema.prisma            # 20 models, multi-tenant
│   ├── seed.ts                  # idempotent
│   └── seeds/
│       ├── companies.ts         # 13 חברות
│       ├── product-types.ts     # 23 מוצרים
│       └── commission-rules.ts  # נוסחאות העמלה (תמונה)
│
├── src/
│   ├── app/
│   │   ├── login/                       # public
│   │   ├── logout/
│   │   ├── (app)/                       # auth required
│   │   │   ├── layout.tsx
│   │   │   ├── dashboard/
│   │   │   ├── clients/  [list, new, [id]]
│   │   │   ├── sales/    [list, pipeline, new, [id]]
│   │   │   ├── commissions/  [hub, agreements, expected, payments, reconcile]
│   │   │   ├── forecast/
│   │   │   ├── tasks/
│   │   │   ├── reports/
│   │   │   ├── import/
│   │   │   └── settings/  [team, companies, products]
│   │   └── api/
│   │       ├── commissions/preview/     # live commission calc
│   │       ├── webhook/commission-payment/
│   │       └── reports/*.csv
│   ├── components/
│   │   ├── ui/                 # Button, Card, Input, Select, Table, ...
│   │   ├── sidebar.tsx
│   │   └── kpi.tsx
│   └── lib/
│       ├── auth.ts             # session + login
│       ├── rbac.ts             # role checks + scope
│       ├── format.ts           # money/date Hebrew
│       ├── labels.ts           # enum → Hebrew labels
│       ├── csv.ts              # UTF-8 BOM CSV
│       ├── actions/            # server actions (sales, clients, tasks, payments, reconcile, import, users, auth)
│       ├── commission-engine/  # ⭐ pure formula engine + 20 tests
│       ├── reconciliation-engine/
│       ├── forecast-engine/
│       └── importer/
└── docker-compose.yml          # postgres 16
```

---

## Commission Engine — DSL example

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

---

## Webhook usage

```bash
curl -X POST https://yoursite/api/webhook/commission-payment \
  -H "x-webhook-secret: $WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "tenantSlug": "talpiot-demo",
    "agentEmail": "tzvi@talpiot-demo.co.il",
    "companyCode": "phoenix",
    "paymentDate": "2026-05-01",
    "amount": 2500,
    "policyNumber": "1234567"
  }'
```

או batch:
```json
{ "items": [ {...}, {...} ] }
```

---

## Tech stack

- **Frontend**: Next.js 14 App Router, React 18, Tailwind, Heebo, Lucide icons.
- **Backend**: Next.js Server Actions + API Routes, Edge-friendly.
- **DB**: PostgreSQL via Prisma ORM, Decimal for money.
- **Auth**: Argon2 + DB sessions.
- **Validation**: Zod everywhere user input enters.
- **Tests**: Vitest, 20 cases verifying formula table.

---

## Roadmap

| Phase | תכולה | סטטוס |
|---|---|---|
| 0 | Foundation: schema, engine, seed, importer | ✅ |
| 1 | Auth, all main screens, reconciliation, forecast, reports, webhook | ✅ |
| 2 | Document storage (R2/S3) + OCR | next |
| 3 | Workflow automation (email/WhatsApp/SMS), reminder cron | |
| 4 | AI: anomaly detection, sales recommendations, forecast AI | |
| 5 | Multi-tenant onboarding flow, billing | |
| 6 | Integration with EasyFinance commission analysis system | |
| 7 | Hardening (GDPR consent UI, 2FA, pen-test) | |

---

## Decisions log

- **Postgres over D1** — Decimal precision, JSONB for formulas, full-text. Drives independence from the legacy stack.
- **Server actions over REST** for all internal mutations — less code, type-safe.
- **One agreement per (tenant, company)** — mirrors real-world contracts.
- **JSON formula DSL** — adding new commission types requires ZERO migrations.
- **Schedule materialization** — `expected_commissions` rows per month (60-month horizon for lifetime), enables month-level reconcile.
- **Clawback as negative expected row** with `kind=CLAWBACK`.
- **Cookie + DB session** — explicit and auditable. NextAuth was avoided to keep auth surface tiny.

# EasyFinance Dashboard – v6.0

## סקירה
פלטפורמת ניהול תיקי השקעות מרובה-סוכנים עם אימות, בידוד נתונים, ולוח ניהול Super Admin.

---

## ✅ פיצ'רים שהושלמו

### 🔐 אבטחה ואימות
- כניסה לאזור סוכן עם שם משתמש + סיסמה (`/admin/login.html`)
- ניהול סשנים (7 ימים) עם token מאובטח
- שינוי סיסמה מתוך הגדרות
- שחזור סיסמה via email (מוכן; בפועל דורש שירות מייל כגון Resend/SendGrid)
- Auth guard על כל דפי `/admin/*`
- 2FA: תשתית מוכנה, הפעלה לאחר חיבור SMS/מייל

### 👥 ניהול סוכנים
- פאנל כניסה ייעודי לסוכנים
- כל סוכן רואה רק את לקוחותיו שלו (agent_id isolation)
- יומן כניסות אחרונות בהגדרות

### 📝 הערות CRM
- כפתור "הערות" בכל כרטיס לקוח
- שדה הערות חופשי (נסתר מהלקוח לחלוטין)
- ניהול סיכומי פגישות עם תאריך + סיכום + פעולה הבאה

### 🎨 מיתוג ולוגו
- העלאת לוגו הסוכנות (base64, עד 500KB)
- שם סוכנות, צבע ראשי/משני, טקסט תחתית
- הלוגו מוצג בכותרת ובדוחות PDF

### 📄 מחולל PDF ממותג
- כפתור "PDF" בכל כרטיס לקוח
- דוח עם לוגו הסוכן, שם הסוכנות, פרטי לקוח
- פילוח נכסים משוקלל + פירוט מוצרים + אירועים
- מימוש: JavaScript → פתיחת חלון הדפסה

### 🛡️ Super Admin Panel (`/admin/superadmin.html`)
- **אנליטיקה**: סה"כ סוכנים, לקוחות, מוצרים, כניסות אחרונות, פילוח חבילות
- **ניהול סוכנים**: יצירה, עריכה, חסימה/הפעלה, מחיקה
- **ניהול מנויים**: Basic (50 לקוחות, 199₪/חודש), Pro (ללא הגבלה, 499₪/חודש)
- **יומן פעולות**: מלא עם סינון לפי סוכן
- **Impersonation**: כניסה בשם סוכן לצורך תמיכה טכנית

### 🗄️ Schema v6 (D1)
- `agents` – רישום סוכנים
- `agent_sessions` – ניהול סשנים
- `agent_settings` – הגדרות מיתוג per-agent
- `audit_log` – כל הפעולות מתועדות
- `crm_notes` – הערות per client per agent
- `clients`, `products`, `monthly_values`, `timeline_events` – עם agent_id isolation

---

## 🔗 URLs

| דף | URL |
|---|---|
| פורטל לקוחות | `/index.html` |
| דשבורד לקוח | `/dashboard.html?client={id}` |
| **כניסה לסוכן** | `/admin/login.html` |
| **ממשק ניהול** | `/admin/index.html` |
| עדכון חודשי | `/admin/monthly-update.html` |
| **הגדרות סוכן** | `/admin/settings.html` |
| **Super Admin** | `/admin/superadmin.html` |

---

## 🔑 כניסה ראשונית (Demo)

| Email | Password | תפקיד |
|---|---|---|
| `admin@easyfinance.co.il` | `Admin@12345` | Super Admin |
| `david@demo.co.il` | `Admin@12345` | Agent (Pro) |
| `sara@demo.co.il` | `Admin@12345` | Agent (Basic) |

⚠️ **שנה את הסיסמאות מיד לאחר העלייה לאוויר!**

---

## 📐 ארכיטקטורה

```
Cloudflare Pages + Workers
├── _worker.js          ← API: /auth/*, /tables/*, /admin/*, /agent/*, /crm/*
├── admin/
│   ├── login.html      ← כניסת סוכן
│   ├── index.html      ← ניהול לקוחות + CRM notes + PDF
│   ├── monthly-update  ← עדכון חודשי
│   ├── settings.html   ← הגדרות סוכן
│   └── superadmin.html ← ניהול פלטפורמה
├── js/agent-auth.js    ← Auth guard (shared)
├── dashboard.html      ← דשבורד לקוח
└── schema.sql          ← D1 Schema v6
```

---

## 🚀 הפעלה מקומית

```bash
cd /home/user/webapp

# יצירת DB
npx wrangler d1 execute easyfinance-db --local --file=schema.sql

# הפעלת שרת
pm2 start ecosystem.config.cjs

# כתובת: http://localhost:3000
```

---

## ⏳ בפיתוח (עתידי)

- [ ] שליחת מייל איפוס סיסמה (Resend/SendGrid)
- [ ] 2FA SMS/TOTP
- [ ] White Label – חיבור דומיין מותאם
- [ ] חנות תוספות (App Store)
- [ ] חיבור למסלקה לייבוא אוטומטי
- [ ] שליחת דוחות WhatsApp אוטומטית

---

## 🛠️ Tech Stack

- **Runtime**: Cloudflare Workers + Pages
- **DB**: Cloudflare D1 (SQLite)
- **Auth**: SHA-256 + session tokens
- **Frontend**: Vanilla JS + Tailwind-like CSS
- **PDF**: JavaScript → Browser Print API

**Last Updated**: 2026-04-11 | Version: 6.0

---

## 🔗 Make Webhook Integration (Surense)

### אופן פעולה
Make (לשעבר Integromat) שולח נתונים מ-Surense אל EasyFinance דרך webhook.

### URL
```
POST https://easyfinance-dashboard.pages.dev/api/webhook/surense
```

### Headers
```
Content-Type: application/json
```

### Body (JSON)
```json
{
  "webhook_secret": "FQiM3AF7G3R1RwhlVWu2it8P7xZikRQA9ujEjaQ7",
  "client_id": "menachem-gilor",
  "month": "2026-03",
  "products": [
    {
      "company_name": "מגדל",
      "product_type": "ביטוח מנהלים",
      "policy_number": "987654",
      "value": 220000
    }
  ]
}
```

### שמות חברות נתמכים
מגדל, הפניקס, מנורה, הכשרה, מיטב, אנליסט, איילון, הראל, כלל, מור

### סוגי מוצרים נתמכים
גמל, גמל להשקעה, קרן השתלמות, פוליסת חיסכון, ביטוח מנהלים

### הגדרת Make – שלבים
1. צור scenario חדש ב-Make
2. הוסף trigger מ-Surense (HTTP module / Surense module)
3. הוסף פעולת "HTTP → Make an API Key Auth request" או "HTTP → Make a request":
   - URL: `https://easyfinance-dashboard.pages.dev/api/webhook/surense`
   - Method: POST
   - Body type: Raw (JSON)
   - Body: הכנס את ה-JSON עם webhook_secret, client_id, month, products
4. בדוק את התגובה: `{"ok":true, ...}`

### אירועי שגיאה אפשריים
- `401 Invalid webhook secret` – סוד שגוי
- `404 Client not found` – client_id לא קיים
- `400 products array required` – חסר מערך מוצרים

# 📈 EasyFinance Dashboard – Multi-Client Investment Dashboard

דשבורד השקעות אינטראקטיבי רב-לקוח, עם הפרדת הרשאות בין לקוח ליועץ וחישוב תשואות מדויק.

---

## 🌐 כתובות פעילות

| סביבה | URL |
|-------|-----|
| פורטל לקוחות | https://dashboard.easyfinance.co.il/ |
| דשבורד לקוח | https://dashboard.easyfinance.co.il/dashboard.html?client=menachem-gilor |
| פאנל ניהול | https://dashboard.easyfinance.co.il/admin/ |
| ניהול סיסמאות | https://dashboard.easyfinance.co.il/admin/credentials.html |
| עדכון חודשי | https://dashboard.easyfinance.co.il/admin/monthly-update.html |

---

## 🏗️ ארכיטקטורה

```
Cloudflare Pages (Static Files)
  ├── _worker.js          ← Worker שמגיש /tables/* API מ-D1
  ├── index.html          ← פורטל כניסה לקוחות
  ├── dashboard.html      ← דשבורד אישי ללקוח
  ├── admin/              ← ממשק ניהול יועץ
  │   ├── index.html
  │   ├── credentials.html
  │   ├── monthly-update.html
  │   ├── fix-data.html
  │   └── migrate.html
  ├── css/style.css
  └── js/returns-engine.js

Cloudflare D1 (Database)
  └── easyfinance-dashboard-db
      ├── clients
      ├── products
      ├── monthly_values
      └── timeline_events
```

---

## 🔑 הגדרות Cloudflare

### D1 Binding
- **Database name:** `easyfinance-dashboard-db`
- **Binding variable name:** `DB` ← חייב להיות בדיוק DB
- **מיקום הגדרה:** Pages → Settings → Bindings

### DNS
- **Type:** CNAME
- **Name:** dashboard
- **Target:** easyfinance-dashboard.pages.dev
- **Proxy:** Proxied (ענן כתום) ✅

### Custom Domain
- הוגדר ב: Pages → Custom domains → `dashboard.easyfinance.co.il`

---

## 🚀 איך לפרסם (Deploy)

### שיטה נכונה — Direct Upload (עוקפת את בעיית Genspark)

1. הורד את כל הקבצים מ-Genspark
2. עבור ל: dash.cloudflare.com → Workers & Pages → easyfinance-dashboard
3. לחץ **"Create deployment"**
4. לחץ **"folder"** ובחר את תיקיית השורש (לא ZIP!)
5. לחץ **"Save and deploy"**

### ⚠️ אל תשתמש ב-"Publish to Cloudflare Pages" של Genspark
Genspark נכשל בגלל בעיית D1 binding — תמיד השתמש ב-Direct Upload.

---

## 💡 מסקנות טכניות חשובות לפרויקטים הבאים

### 1. _worker.js — הדרך הנכונה ל-API ב-Cloudflare Pages
```javascript
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/tables/')) {
      return handleAPI(request, env); // env.DB = D1
    }
    return env.ASSETS.fetch(request); // Static files
  }
};
```
- חייב להיות בשורש הפרויקט
- חייב להעלות כ**תיקייה** (לא ZIP!)
- D1 binding חייב להיקרא `DB`

### 2. API_BASE — תמיד ריק לנתיב יחסי
```javascript
const API_BASE = ''; // ריק = נתיב יחסי לאותו דומיין
```
- ❌ לא `'https://usekmdat.gensparkspace.com'` — גורם לשגיאת CORS
- ❌ לא `'..'` — גורם לנתיב שגוי מ-admin/
- ✅ `''` + נתיבים עם `/tables/...` (slash בהתחלה)

### 3. fetchAll — תבנית נכונה
```javascript
async function fetchAll(url) {
  const all = []; let page = 1, total = Infinity;
  while (all.length < total) {
    const r = await fetch(`${url}${url.includes('?')?'&':'?'}page=${page}&limit=100`);
    const d = await r.json();
    all.push(...(d.data || []));
    total = d.total || 0;
    if ((d.data || []).length < 100) break;
    page++;
  }
  return all;
}
```

### 4. D1 — אין עמודת deleted
הטבלאות ב-D1 שנוצרו ע"י Genspark **אין להן עמודת `deleted`**.
ב-Worker אל תשתמש ב: `WHERE deleted=0` — יגרום ל-D1_ERROR.

### 5. Pages Functions vs _worker.js
- ❌ `functions/tables/[[path]].js` — לא עובד כשמעלים ידנית
- ✅ `_worker.js` בשורש — עובד תמיד

### 6. מיגרציה מ-Genspark ל-Cloudflare D1
דף המיגרציה: `/admin/migrate.html`
- מעתיק clients, products, monthly_values, timeline_events
- פועל בלחיצה אחת
- לא מוחק נתונים קיימים

---

## 📊 מבנה הנתונים

### clients
| שדה | סוג | תיאור |
|-----|-----|--------|
| id | TEXT PK | מזהה ייחודי (slug) |
| name | TEXT | שם הלקוח |
| report_title | TEXT | כותרת הדוח |
| report_period | TEXT | שנת הדוח |
| ytd_start_month | TEXT | חודש התחלת YTD (MM/YY) |
| ytd_end_month | TEXT | חודש סיום YTD (MM/YY) |
| active | INTEGER | 1=פעיל |
| username | TEXT | שם משתמש לכניסה |
| password_hash | TEXT | SHA-256 של הסיסמה |

### products
| שדה | סוג | תיאור |
|-----|-----|--------|
| id | TEXT PK | מזהה מוצר |
| client_id | TEXT | FK → clients.id |
| name | TEXT | שם מלא |
| institution | TEXT | שם מוסד |
| product_type | TEXT | סוג מוצר |
| status | TEXT | active/inactive |
| color | TEXT | צבע (#hex) |
| ytd_start_value | REAL | שווי פתיחת YTD |
| sort_order | INTEGER | סדר תצוגה |

### monthly_values
| שדה | סוג | תיאור |
|-----|-----|--------|
| id | TEXT PK | מזהה רשומה |
| client_id | TEXT | FK → clients.id |
| product_id | TEXT | FK → products.id |
| month | TEXT | חודש (MM/YY) |
| value | REAL | שווי בסוף חודש |

### timeline_events
| שדה | סוג | תיאור |
|-----|-----|--------|
| id | TEXT PK | מזהה אירוע |
| client_id | TEXT | FK → clients.id |
| product_id | TEXT | FK → products.id |
| event_date | TEXT | תאריך (YYYY-MM) |
| event_type | TEXT | deposit/withdrawal/transfer/management |
| title | TEXT | כותרת |
| amount | REAL | סכום |

---

## ✅ תכונות מומשות

- [x] פורטל כניסה עם SHA-256 + username/password
- [x] דשבורד לקוח עם 5 לשוניות
- [x] חישוב תשואות Modified Dietz
- [x] פאנל ניהול יועץ מלא
- [x] עדכון חודשי עם ממשק נוח
- [x] ניהול סיסמאות לקוחות
- [x] Dark/Light mode
- [x] RTL עברית מלאה
- [x] Cloudflare D1 + Worker API
- [x] Custom domain: dashboard.easyfinance.co.il

## 🔜 שדרוגים עתידיים

- [ ] הוספת לקוחות חדשים עם מוצרים
- [ ] השוואה למדדי שוק (S&P500, ת"א 125)
- [ ] ייצוא דוח PDF
- [ ] גרף עוגה לפי מוסד
- [ ] התראות על עדכון חודשי
- [ ] תמיכה בריבוי לקוחות

---

*גרסה: 3.0 | תאריך: אפריל 2026 | Cloudflare Pages + D1 + _worker.js*

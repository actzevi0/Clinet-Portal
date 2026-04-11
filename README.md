# EasyFinance Dashboard – v4.0

## סקירה כללית
פורטל לקוחות לניהול השקעות פיננסיות מרובות-לקוחות.  
**סטאק**: HTML/CSS/JS + Cloudflare Pages + D1 SQLite + Worker API

## 🌐 URLs
| סביבה | כתובת |
|---|---|
| **Production** | https://dashboard.easyfinance.co.il |
| **Dashboard לקוח** | /dashboard.html?client={id} |
| **Admin Panel** | /admin/ |
| **Deploy Helper** | /deploy-helper.html |

## 🆕 מה חדש בגרסה 4.0
- ✅ Tooltips להסברת מונחים (YTD, תשואה מנורמלת, מדד יעילות)
- ✅ תצוגת מובייל: כרטיסי מוצרים במקום טבלאות
- ✅ כפתור WhatsApp צף (מוגדר לכל לקוח בנפרד)
- ✅ שיתוף ביצועים: גרף אחוזים, גרף תיק, סטורי (בלי מספרים)
- ✅ יעדים ומטרות (Goals) עם סרגל התקדמות
- ✅ סימולציית "מה אם?" עם גרף צמיחה
- ✅ תובנות אישיות (Personal Insights) מהיועץ ללקוח
- ✅ התראות עדכונים (פעמון) ללקוח
- ✅ פילוח סיכון: עוגה + בארים לפי מוצר + טבלת דירוג
- ✅ ייצוא PDF + Excel/CSV
- ✅ פאנל הגדרות לקוח ביועץ (כל הפיצ'רים toggle per-client)

## 🏗️ ארכיטקטורה
```
index.html          ← דף כניסה (login)
dashboard.html      ← דשבורד לקוח (5+ טאבים)
admin/
  index.html        ← ניהול לקוחות + הגדרות
  monthly-update    ← עדכון נתונים חודשי
  credentials       ← ניהול סיסמאות
  edit              ← עריכת מוצרים מפורטת
_worker.js          ← Cloudflare Worker API (CRUD על D1)
schema.sql          ← DB schema מלא v4.0
migrate_v4.sql      ← Migration מ-v3.0 ל-v4.0
```

## 📊 מבנה DB (D1)
| טבלה | שדות עיקריים |
|---|---|
| `clients` | id, name, whatsapp_phone, enable_goals, goals_json, enable_whatif, enable_insights, insights_json, enable_notifications |
| `products` | id, client_id, risk_equities, risk_bonds, risk_alternatives, color, ytd_start_value |
| `monthly_values` | id, client_id, product_id, month (MM/YY), value |
| `timeline_events` | id, client_id, product_id, event_date, event_type, amount |

## 🚀 פרסום לפרודקשן
1. הרץ `migrate_v4.sql` ב-Cloudflare D1 Console
2. הורד את הקבצים מהסנדבוקס
3. `wrangler pages deploy . --project-name=easyfinance-dashboard`
4. ודא כי הדומיין `dashboard.easyfinance.co.il` מצביע נכון

ראה הוראות מפורטות ב-`deploy-helper.html`

## 🔑 לוגיקת YTD
- שנת 2025 (REPORT_YEAR): פתיחה = `ytd_start_value` (ידני)
- שנות עוקבות: פתיחה = דצמבר שנה קודמת
- `exclude_open=true`: מוצר לא נכנס לסכום הפתיחה (ניוד/חשבון חדש)

## 📅 History
- v3.0 (אפריל 2026) – גרסה ראשונה בפרודקשן
- v4.0 (אפריל 2026) – שדרוג מקיף: goals, what-if, insights, notifications, risk, PDF/Excel export

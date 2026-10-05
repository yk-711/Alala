# نظام المحاسبة V4 — Production

نظام محاسبة عربي RTL حقيقي مبني بـ HTML/CSS/JavaScript + Node.js + PostgreSQL.

## التشغيل المحلي
1. Node.js 20+.
2. أنشئ قاعدة PostgreSQL.
3. انسخ `.env.example` إلى `.env` وضع `DATABASE_URL` و`SESSION_SECRET`.
4. نفذ `npm install` ثم `npm start`.
5. افتح `http://localhost:3000`.

## Render
- ارفع المشروع إلى GitHub.
- أنشئ PostgreSQL من Render.
- أنشئ Web Service من المستودع.
- Build: `npm install`
- Start: `npm start`
- أضف `DATABASE_URL` من قاعدة Render.
- `SESSION_SECRET` يولده Render تلقائيًا.
- `TZ=Asia/Aden`.

## الدخول الأول
username: `admin`
password: `admin123`

غيّر كلمة المرور فورًا.

## V4
- PostgreSQL بدل SQLite.
- المرفقات محفوظة داخل PostgreSQL.
- نسخ احتياطية منطقية JSON قابلة للاستعادة.
- صلاحيات على الخادم.
- Idempotency للحركات اليومية.
- إقفال الفترات.
- معاملات PostgreSQL للفواتير.

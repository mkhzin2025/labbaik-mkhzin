# دليل نشر مشروع لبيك على Railway 🚄🚀💎

اتبع هذه الخطوات لرفع "لبيك" إلى سيرفر حقيقي وربطه بـ GitHub لضمان النشر التلقائي.

## 1. التجهيز في Railway
1. اذهب إلى [Railway.app](https://railway.app/) وسجل دخولك بـ GitHub.
2. اضغط على **"New Project"** -> **"Deploy from GitHub repo"**.
3. اختر مستودعك: `salemforai/labbaik-social-bot`.

## 2. إعداد الخدمات (Services)
Railway سيكتشف المجلدات، نحتاج لإنشاء خدمتين منفصلتين:

### أ. خدمة الباك إند (Backend Service)
- **Root Directory:** اختر `/system/backend`.
- **Variables:** أضف كافة المتغيرات من ملف `.env` (مثل `GROQ_API_KEY`, `MONGO_URL`, إلخ).
- **Domain:** سيقوم Railway بتوليد رابط HTTPS (احفظه، هذا هو رابط الـ Webhooks).

### ب. خدمة الفرونت إند (Frontend Service)
- **Root Directory:** اختر `/system/frontend`.
- **Variables:** أضف `VITE_API_URL` وضع فيه رابط الباك إند الذي حصلت عليه أعلاه.

## 3. قواعد البيانات
- يمكنك إضافة **PostgreSQL** و **MongoDB** كـ "Plugins" داخل Railway بضغطة زر، ثم انسخ روابط الاتصال الخاصة بها وضعها في متغيرات البيئة (Variables) للباك إند.

## 4. الربط مع Meta (WhatsApp)
بعد تشغيل الباك إند بنجاح:
- اذهب لـ Meta Developers.
- في الـ Webhook، ضع الرابط الجديد: `https://your-backend-url.up.railway.app/webhooks/whatsapp`.
- استخدم رمز التحقق: `labbaik_whatsapp_verify`.

---
*تم إعداد هذا الدليل بواسطة Nahdi Assistant - 11 أبريل 2026*

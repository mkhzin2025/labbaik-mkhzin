# دليل التشغيل الفعلي والربط مع المنصات - مشروع لبيك 🚀🌍💎

هذا الدليل يحتوي على الخطوات التقنية اللازمة لربط "لبيك" بالعالم الحقيقي (رسائل حقيقية، عملاء حقيقيين).

---

## 🛠️ المرحلة الأولى: التجهيز التقني (Infrastructure)

### 1. الحصول على رابط عام (Public URL)
يجب توفير رابط HTTPS صالح لكي تتمكن ميتا وجوجل من إرسال البيانات (Webhooks).
- **الخيار الموصى به للتطوير:** استخدام [Ngrok](https://ngrok.com/).
- **أمر التشغيل:** 
  ```bash
  ngrok http 3000
  ```
- **النتيجة المطلوبة:** رابط يبدأ بـ `https://...` (احفظه جيداً).

---

## 📲 المرحلة الثانية: الربط مع Meta (WhatsApp, IG, FB)

### 1. إنشاء تطبيق المطورين
1. اذهب إلى [Meta for Developers](https://developers.facebook.com/).
2. أنشئ تطبيقاً جديداً من نوع **Business**.
3. أضف منتج **WhatsApp** إلى التطبيق.

### 2. إعدادات الـ Webhook
- **Callback URL:** ضع الرابط الذي حصلت عليه من Ngrok مضافاً إليه مسار الواتساب: 
  `https://your-url.ngrok-free.app/webhooks/whatsapp`
- **Verify Token:** استخدم الكلمة السرية الموجودة في ملف `.env` (الافتراضية: `labbaik_whatsapp_verify`).
- **الحقول المطلوبة (Subscription Fields):** اشترك في `messages`.

---

## 📍 المرحلة الثالثة: الربط مع Google Maps API

1. اذهب إلى [Google Cloud Console](https://console.cloud.google.com/).
2. فعّل مكتبة **My Business Business Information API**.
3. استخرج **OAuth 2.0 Client ID** لتمكين لبيك من الوصول للتقييمات.

---

## ✅ قائمة التحقق (Checklist)
- [ ] رابط HTTPS يعمل.
- [ ] التطبيق في Meta من نوع Business ومفعل.
- [ ] الـ Webhook يعيد Challenge بنجاح (Verified).
- [ ] استلام أول رسالة تجريبية في لوحة تحكم لبيك.

---
*تم إعداد هذا الدليل بواسطة Nahdi Assistant - 11 أبريل 2026 (بداية الربط الفعلي)*

# التصميم التقني (System Design) - مشروع شات بوت خدمة العملاء (v1)

## 1. الهيكل العام (Architecture)
*   **Backend:** Node.js (NestJS) - لسهولة التعامل مع الـ Webhooks والـ Real-time communication.
*   **Frontend:** Next.js (Tailwind CSS) - لوحة تحكم سريعة ومتجاوبة.
*   **Database:** 
    *   PostgreSQL: للبيانات الأساسية (المستخدمين، القنوات، الإعدادات).
    *   MongoDB: لتخزين سجل المحادثات (Logs) نظراً لمرونتها مع النصوص الضخمة.
    *   Redis: لإدارة الجلسات (Sessions) والـ Caching.

## 2. التكامل مع الجهات الخارجية (External Integrations)
*   **Meta Graph API:** لإدارة رسائل Instagram و Messenger.
*   **WhatsApp Business API:** عبر مزود رسمي (Official Provider) أو ربط مباشر مع Meta.
*   **Google Business Profile API:** لاستقبال والرد على تقييمات Google Maps.
*   **OpenAI API (GPT-4o):** لمعالجة اللغات الطبيعية (NLP) وتوليد الردود.

## 3. تدفق المهام (Workflow)
*   **Inbound Message:** `Webhook -> Backend -> AI Engine -> Channel API -> User`.
*   **Broadcast Campaign:** `Dashboard -> Task Queue (BullMQ) -> WhatsApp API -> Customer`.
*   **Google Maps Reply:** `Google Webhook -> Sentiment Analysis -> AI Reply -> Google API`.

## 4. خطة التوسع (Scalability)
*   استخدام **Docker** لسهولة النشر (Deployment).
*   استخدام **Kubernetes** مستقبلاً لتوزيع الأحمال.

---
*تم إعداد هذا المخطط لمناقشته مع سالم النهدي - 7 أبريل 2026*

# Labbaik SaaS Billing, Subscriptions, Wallet & Moyasar

## الهدف

هذه الطبقة تفصل بين ثلاثة أشياء مستقلة:

1. **الباقة/الاشتراك**: ما هي مزايا وحدود المنظمة وما السعر الشهري.
2. **طريقة الدفع**: بطاقة محفوظة لدى Moyasar بصيغة Token. لبيك لا يخزن رقم البطاقة أو CVC.
3. **محفظة Meta لبيك**: رصيد مسبق الدفع بالريال يستخدم فقط للاستهلاك المدفوع عند اختيار `shared_app` (Meta لبيك).

اختيار `own_app` لا يخصم من محفظة Meta لبيك؛ العميل يتحمل علاقته وتكاليفه مع Meta بنفسه.

## دورة العميل

### أول مرة

1. المنظمة تدخل `/dashboard/billing`.
2. تختار مبلغ شحن وتدخل البطاقة.
3. المتصفح يرسل بيانات البطاقة **مباشرة إلى Moyasar** باستخدام `MOYASAR_PUBLISHABLE_KEY` مع `save_card: true`.
4. لبيك ينشئ مسبقًا Billing Intent بمعرف UUID ثابت، وهو نفسه `given_id` لدى Moyasar لتحقيق idempotency.
5. بعد 3DS/العودة، Backend لبيك يجلب Payment من Moyasar باستخدام Secret Key ويتحقق من:
   - `status = paid`
   - المبلغ مطابق للـIntent
   - العملة مطابقة
6. عند نجاح التحقق فقط:
   - يضاف الرصيد إلى المحفظة.
   - يحفظ Token البطاقة مشفرًا في `payment_methods`.
   - لا يحفظ PAN أو CVC.
7. العميل يختار باقة مدفوعة. أول اشتراك وتجديداته تستخدم البطاقة المحفوظة.
8. عند اختيار `Meta لبيك / shared_app` يجب أن يوجد:
   - اشتراك فعال.
   - الباقة تحتوي `features.metaLabbaik = true`.
   - بطاقة محفوظة فعالة.
   - رصيد محفظة موجب.

## الخصم عند استخدام Meta لبيك

الأسعار التجارية الداخلية تحفظ في `pricing_rules` بوحدة micro-SAR (1 SAR = 1,000,000 micros) حتى يمكن تسعير الرسالة بأجزاء صغيرة من الريال دون أخطاء floating point.

الأنواع الحالية:

- `meta_session_text`
- `meta_interactive`
- `meta_template_marketing`
- `meta_template_utility`
- `meta_template_authentication`
- `meta_template_other`

التدفق:

```
Send request
  -> determine tenant/store Meta connection
  -> if own_app: no Labbaik-wallet charge
  -> if shared_app:
       validate active subscription + metaLabbaik feature
       lock wallet row
       deduct configured price atomically
  -> send to Meta
       success: store wamid + walletTransactionId
       synchronous failure: refund transaction
       later Meta webhook = failed: refund transaction idempotently
```

الرسائل الواردة لا تخصم من المحفظة في هذه الطبقة.

> أسعار `pricing_rules` هي أسعار لبيك التجارية الداخلية وليست جدول تسعير Meta الرسمي. يجب ضبطها قبل Production.

## الشحن التلقائي

يمكن للمنظمة تفعيل Auto Recharge وتحديد:

- حد بدء الشحن.
- مبلغ الشحن التلقائي.
- حد تنبيه انخفاض الرصيد.

الشحن التلقائي يستخدم البطاقة الافتراضية المحفوظة لدى Moyasar. إذا تطلبت العملية 3DS ولم يمكن إتمامها server-to-server فلن يمنح النظام رصيدًا وهميًا؛ يبقى الخصم المدفوع متوقفًا حتى إتمام شحن صالح.

## Refunds

- فشل إرسال Meta مباشرة: إعادة مبلغ استخدام Meta إلى المحفظة.
- Webhook من Meta بحالة `failed`: إعادة نفس عملية الخصم، مع idempotency لمنع الإعادة مرتين.
- `payment_refunded` من Moyasar لشحن محفظة: يعكس مبلغ الشحن من المحفظة. إذا كان العميل استهلك الرصيد بالفعل، يسمح النظام أن تصبح المحفظة سالبة لتسجيل الدين بدقة، ويمنع الاستخدام المدفوع حتى تغطية الرصيد.
- Refund لاشتراك: يحول الاشتراك إلى `suspended` ويوقف التجديد التلقائي.

## التجديد الشهري

`BillingRenewalService` يفحص الاشتراكات المستحقة كل ساعة، ويجدد البطاقة المحفوظة باستخدام Token. عند الفشل تتحول الحالة إلى `past_due` مع مهلة 3 أيام.

في تشغيل متعدد replicas اجعل:

```
BILLING_RENEWAL_WORKER_ENABLED=true
```

على Replica واحدة فقط إلى أن يتم نقل الجدولة إلى distributed lock/queue scheduler.

## إدارة المنصة

المستخدمون الموجودون في:

```
PLATFORM_ADMIN_EMAILS=owner@example.com,billing@example.com
```

يستطيعون فتح `/dashboard/billing-admin` لإدارة:

- الباقات والأسعار.
- مزايا الباقة وحدودها.
- ربط منظمة بباقة.
- حالة العميل الحالية.
- أرصدة المحافظ.
- تعديل رصيد إداري موثق.
- تسعير استخدام Meta لبيك.
- تشغيل تجديد الاشتراكات يدويًا عند الحاجة.

## Endpoints الرئيسية

### العميل

- `GET /billing/summary`
- `GET /billing/plans`
- `PATCH /billing/wallet/settings`
- `POST /billing/wallet/topups/intents`
- `POST /billing/wallet/topups/checkout`
- `POST /billing/wallet/topups/saved-card`
- `POST /billing/payments/verify`
- `POST /billing/payment-methods/default`
- `DELETE /billing/payment-methods/:id`
- `POST /billing/subscription/subscribe`
- `POST /billing/subscription/cancel-at-period-end`

### إدارة لبيك

- `GET /billing/admin/plans`
- `POST /billing/admin/plans`
- `PATCH /billing/admin/plans/:id`
- `GET /billing/admin/organizations`
- `POST /billing/admin/subscriptions/assign`
- `GET /billing/admin/pricing-rules`
- `PATCH /billing/admin/pricing-rules/:id`
- `POST /billing/admin/wallet/adjust`
- `POST /billing/admin/renewals/run`

### Moyasar

- `POST /webhooks/moyasar`

اضبط Webhook في Moyasar إلى:

```
https://<PUBLIC_API_DOMAIN>/webhooks/moyasar
```

واجعل Secret Token مطابقًا لقيمة `MOYASAR_WEBHOOK_SECRET`.

## Environment

```env
PLATFORM_ADMIN_EMAILS=owner@example.com
FRONTEND_URL=https://app.example.com

MOYASAR_PUBLISHABLE_KEY=pk_test_xxx
MOYASAR_SECRET_KEY=sk_test_xxx
MOYASAR_WEBHOOK_SECRET=<random-secret>

BILLING_DEFAULT_META_RATE_SAR=0.05
# Optional overrides:
# BILLING_META_SESSION_TEXT_RATE_SAR=0.05
# BILLING_META_INTERACTIVE_RATE_SAR=0.05
# BILLING_META_MARKETING_RATE_SAR=0.05
# BILLING_META_UTILITY_RATE_SAR=0.05
# BILLING_META_AUTH_RATE_SAR=0.05
# BILLING_META_OTHER_RATE_SAR=0.05

BILLING_RENEWAL_WORKER_ENABLED=true
```

## ملاحظات Production

- ابدأ بمفاتيح Moyasar Test ثم بدّل إلى Live بعد اختبار 3DS، callback، webhooks، refund وtoken charge.
- لا ترسل `MOYASAR_SECRET_KEY` للفرونت إند مطلقًا.
- لا تسجل request body الذي يحتوي PAN/CVC في logs أو monitoring.
- المشروع الحالي يستخدم TypeORM `synchronize: true`. قبل Production واسع النطاق يفضل تحويل التغييرات إلى migrations صريحة ومراجعتها قبل النشر.
- راقب رصيد المحافظ السالب، حالات `past_due`، وفشل Auto Recharge من لوحة الإدارة.

import { useEffect, useState } from 'react';
import PublicLayout from '../components/layout/PublicLayout';
import { Card } from '../components/ui/Card';
import { ShieldCheck, Lock, Database, Globe, RefreshCw, Mail, CheckCircle2, FileText } from 'lucide-react';

export default function PrivacyPolicyPage() {
  const [lang, setLang] = useState<'ar' | 'en'>('ar');

  useEffect(() => {
    document.title = 'سياسة الخصوصية | لبيك';
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      metaDesc.setAttribute('content', 'سياسة الخصوصية لمنصة لبيك لإدارة التواصل الذكي مع العملاء');
    }
  }, []);

  return (
    <PublicLayout>
      <div className="space-y-6">
        {/* Header Banner */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-200 dark:border-white/10 pb-6">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-1.5 text-xs font-black text-labbaik-blue bg-labbaik-blue/10 px-3 py-1 rounded-full">
              <ShieldCheck size={14} />
              <span>وثيقة قانونية رسمية</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-neutral-900 dark:text-white">
              {lang === 'ar' ? 'سياسة الخصوصية — لبيك' : 'Privacy Policy — Labbaik'}
            </h1>
            <p className="text-xs text-neutral-500 font-semibold">
              {lang === 'ar' ? 'آخر تحديث: سبتمبر 2026' : 'Last updated: September 2026'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setLang('ar')}
              className={`text-xs font-bold px-3 py-1.5 rounded-xl border transition-all ${
                lang === 'ar'
                  ? 'bg-labbaik-blue text-white border-labbaik-blue shadow-sm'
                  : 'bg-white dark:bg-white/5 text-neutral-600 dark:text-neutral-300 border-neutral-200 dark:border-white/10'
              }`}
            >
              العربية
            </button>
            <button
              onClick={() => setLang('en')}
              className={`text-xs font-bold px-3 py-1.5 rounded-xl border transition-all ${
                lang === 'en'
                  ? 'bg-labbaik-blue text-white border-labbaik-blue shadow-sm'
                  : 'bg-white dark:bg-white/5 text-neutral-600 dark:text-neutral-300 border-neutral-200 dark:border-white/10'
              }`}
            >
              English
            </button>
          </div>
        </div>

        {lang === 'ar' ? (
          /* Arabic Content */
          <div className="space-y-6 text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed">
            <Card variant="labbaik" className="space-y-4">
              <h2 className="text-lg font-black text-neutral-900 dark:text-white flex items-center gap-2">
                <FileText className="text-labbaik-blue" size={20} />
                1. مقدمة ونطاق الخدمة
              </h2>
              <p>
                تُعد منصة <strong>«لبيك» (Labbaik)</strong> منصة برمجية كخدمة (SaaS) متخصصة في إدارة قنوات التواصل والمحادثات مع العملاء، ومساعدة المنشآت على أتمتة الردود وإدارة حملات الرسائل وربط قنوات التواصل الرسمية مثل <strong>WhatsApp Business</strong> وتطبيقات <strong>Meta</strong>.
              </p>
              <p>
                توضح سياسة الخصوصية هذه كيفية جمع البيانات واستخدامها ومعالجتها وحمايتها عند استخدام منصتنا. نحن ملتزمون بأعلى معايير الخصوصية والأمان وحماية البيانات الشخصية.
              </p>
            </Card>

            <Card variant="labbaik" className="space-y-4">
              <h2 className="text-lg font-black text-neutral-900 dark:text-white flex items-center gap-2">
                <Database className="text-labbaik-blue" size={20} />
                2. البيانات التي نقوم بمعالجتها
              </h2>
              <p>
                لتقديم الخدمة وتشغيل الميزات التي تختار المنظمة تفعيلها، قد نقوم بمعالجة البيانات التالية:
              </p>
              <ul className="list-disc list-inside space-y-1.5 pr-2 font-medium">
                <li><strong>بيانات المنشأة والحساب:</strong> اسم المنظمة، بيانات المالك والمستخدمين المفوضين (الاسم، البريد الإلكتروني، كلمة المرور المشفرة).</li>
                <li><strong>بيانات العملاء والمستلمين:</strong> الاسم، رقم الهاتف، البريد الإلكتروني (إن وجد)، التصنيفات والوسوم المخصصة.</li>
                <li><strong>بيانات المحادثات والرسائل:</strong> نص الرسائل الواردة والصادرة، وسائط المحادثة، طوابع الوقت، سجل وتاريخ المحادثات.</li>
                <li><strong>بيانات القوالب:</strong> نصوص ومتغيرات قوالب واتساب المعتمدة من Meta لأغراض الإرسال المباشر أو الجماعي.</li>
                <li><strong>بيانات القنوات والاتصال:</strong> أرقام واتساب للأعمال، معرفات الحساب (WABA ID)، معرفات أرقام الهواتف (Phone Number ID).</li>
                <li><strong>بيانات تقنية وأمنية:</strong> عناوين الـ IP، سجلات النشاط (Audit Logs)، معلومات المتصفح ونظام التشغيل للأغراض الأمنية ومنع الاحتيال.</li>
              </ul>
            </Card>

            <Card variant="labbaik" className="space-y-4">
              <h2 className="text-lg font-black text-neutral-900 dark:text-white flex items-center gap-2">
                <Globe className="text-labbaik-blue" size={20} />
                3. قسم خاص بتكامل Meta و WhatsApp Cloud API
              </h2>
              <p>
                عند قيام المنشأة بربط حساب واتساب للأعمال (WABA) عبر Meta Cloud API:
              </p>
              <ul className="list-disc list-inside space-y-1.5 pr-2 font-medium">
                <li>نستخدم الصلاحيات الممنوحة من قبلك فقط لتشغيل الميزات المصرح بها: إدارة اتصال القناة، جلب القوالب المعتمدة، إرسال الرسائل، استقبال الرسائل عبر Webhook، ومتابعة حالات التسليم والقراءة (Sent, Delivered, Read, Failed).</li>
                <li>لا تصل المنصة إطلاقاً إلى أي حسابات أو أصول تابعة لـ Meta غير مشمولة في الترخيص الممنوح من صاحب الحساب.</li>
                <li>يتم استقبال التحديثات عبر الـ Webhook ومعالجتها وفق معايير التحقق من التوقيع الأمني (X-Hub-Signature-256).</li>
              </ul>
            </Card>

            <Card variant="labbaik" className="space-y-4">
              <h2 className="text-lg font-black text-neutral-900 dark:text-white flex items-center gap-2">
                <Lock className="text-labbaik-blue" size={20} />
                4. عزل البيانات وأمان النظام
              </h2>
              <ul className="list-disc list-inside space-y-1.5 pr-2 font-medium">
                <li><strong>عزل متعدد المستأجرين (Tenant Isolation):</strong> بيانات كل منظمة معزولة برمجياً ومنطقياً بشكل صارم، ولا يمكن لمنظمة الاطلاع على بيانات أو محادثات منظمة أخرى.</li>
                <li><strong>تشفير الأسرار والرموز:</strong> مفاتيح الوصول (Access Tokens) والأسرار البرمجية مشفرة في قاعدة البيانات ولا تُعرض نهائياً كنصوص واضحة في واجهات الاستخدام أو الـ Logs.</li>
                <li><strong>الاتصال المشفر:</strong> تتم جميع الاتصالات وتبادل البيانات عبر بروتوكول التشفير الآمن (HTTPS / TLS).</li>
                <li><strong>حصر الوصول:</strong> يقتصر الوصول داخل المنظمة على الأعضاء المصرح لهم بحسب الصلاحيات المحددة من إدارة المنظمة.</li>
              </ul>
            </Card>

            <Card variant="labbaik" className="space-y-4">
              <h2 className="text-lg font-black text-neutral-900 dark:text-white flex items-center gap-2">
                <RefreshCw className="text-labbaik-blue" size={20} />
                5. مشاركة البيانات والمزودون الخارجيون
              </h2>
              <div className="p-3.5 rounded-xl bg-green-500/10 border border-green-500/20 text-xs font-bold text-green-700 dark:text-green-400 flex items-center gap-2">
                <CheckCircle2 size={16} />
                <span>نؤكد بشكل قاطع: منصة لبيك لا تبيع بيانات العملاء أو المنظمات لأي جهة إعلانية أو تجارية إطلاقاً.</span>
              </div>
              <p>
                تتم مشاركة البيانات حصراً بالقدر اللازم تقنياً لتقديم الخدمة عبر مزودي البنية التحتية الموثوقين:
              </p>
              <ul className="list-disc list-inside space-y-1.5 pr-2 font-medium">
                <li><strong>Meta Platforms, Inc. / WhatsApp:</strong> لإرسال واستقبال رسائل واتساب وتشغيل الـ Webhooks.</li>
                <li><strong>بوابات الدفع الإلكتروني المعتمدة (مثل Moyasar):</strong> لمعالجة مدفوعات الاشتراك وشحن المحفظة بأمان ودون تخزين أرقام البطاقات الحساسة لدينا.</li>
                <li><strong>مزودو الاستضافة وقواعد البيانات السحابية:</strong> لحفظ وتشغيل النظام وفق تدابير أمنية متقدمة.</li>
                <li><strong>محركات الذكاء الاصطناعي (عند تفعيلها):</strong> لتوليد المقترحات والردود الذكية في نطاق المنشأة فقط.</li>
              </ul>
            </Card>

            <Card variant="labbaik" className="space-y-4">
              <h2 className="text-lg font-black text-neutral-900 dark:text-white flex items-center gap-2">
                <Database className="text-labbaik-blue" size={20} />
                6. الاحتفاظ بالبيانات وحذفها
              </h2>
              <p>
                نحتفظ بالبيانات طالما كان الحساب نشطاً أو حسب ما تقتضيه متطلبات تقديم الخدمة. يحق للمستخدم ومالك الحساب طلب حذف الحساب والبيانات في أي وقت.
              </p>
              <p>
                لمعرفة الإجراءات وتقديم طلب حذف البيانات أو الاطلاع على التفاصيل الخاصة بـ Meta Data Deletion، يرجى زيارة صفحة <a href="/account-deletion" className="text-labbaik-blue underline font-bold">حذف الحساب والبيانات</a>.
              </p>
            </Card>

            <Card variant="labbaik" className="space-y-4">
              <h2 className="text-lg font-black text-neutral-900 dark:text-white flex items-center gap-2">
                <Mail className="text-labbaik-blue" size={20} />
                7. حقوقك والتواصل معنا
              </h2>
              <p>
                يحق لك طلب الوصول إلى بياناتك الشخصية، أو تصحيحها، أو طلب تقييد معالجتها، أو حذفها، أو إلغاء ربط أي قناة تكامل.
              </p>
              <p>
                لأي استفسارات بخصوص الخصوصية أو ممارسة حقوقك، يسعدنا تواصلك مع فريق الدعم الفني والخصوصية عبر البريد الإلكتروني:
              </p>
              <div className="font-mono text-sm font-bold text-labbaik-blue bg-neutral-100 dark:bg-white/5 p-3 rounded-xl inline-block" dir="ltr">
                <a href="mailto:support@mkhzin.com">support@mkhzin.com</a>
              </div>
            </Card>
          </div>
        ) : (
          /* English Content for Meta App Review */
          <div className="space-y-6 text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed" dir="ltr">
            <Card variant="labbaik" className="space-y-4">
              <h2 className="text-lg font-black text-neutral-900 dark:text-white flex items-center gap-2">
                <FileText className="text-labbaik-blue" size={20} />
                1. Overview & Service Scope
              </h2>
              <p>
                <strong>Labbaik</strong> is a Software-as-a-Service (SaaS) customer communication management platform designed to help businesses manage customer messaging channels, automate smart responses, and integrate official communication tools including <strong>WhatsApp Business</strong> and <strong>Meta Cloud APIs</strong>.
              </p>
              <p>
                This Privacy Policy describes how we collect, use, process, and protect your information. We are strictly committed to data protection, transparency, and user privacy.
              </p>
            </Card>

            <Card variant="labbaik" className="space-y-4">
              <h2 className="text-lg font-black text-neutral-900 dark:text-white flex items-center gap-2">
                <Database className="text-labbaik-blue" size={20} />
                2. Information We Process
              </h2>
              <p>To provide messaging services and enabled features, we process:</p>
              <ul className="list-disc list-inside space-y-1.5 pl-2 font-medium">
                <li><strong>Account Credentials:</strong> Organization details, authorized staff names, email addresses, and securely hashed passwords.</li>
                <li><strong>Customer & Recipient Details:</strong> Name, phone number, email address (if provided), tags, and custom categories.</li>
                <li><strong>Conversation Data:</strong> Inbound and outbound message text, conversation timestamps, and message delivery/read statuses.</li>
                <li><strong>WhatsApp Templates:</strong> Text, components, and variables of approved WhatsApp templates used for transactional or notification messaging.</li>
                <li><strong>Channel Metadata:</strong> WhatsApp Business Account ID (WABA ID), Phone Number IDs, and encrypted authentication tokens.</li>
                <li><strong>Technical & Security Telemetry:</strong> IP addresses, audit logs, and browser metadata strictly used for security, rate-limiting, and fraud prevention.</li>
              </ul>
            </Card>

            <Card variant="labbaik" className="space-y-4">
              <h2 className="text-lg font-black text-neutral-900 dark:text-white flex items-center gap-2">
                <Globe className="text-labbaik-blue" size={20} />
                3. Meta Platforms & WhatsApp Integration Compliance
              </h2>
              <ul className="list-disc list-inside space-y-1.5 pl-2 font-medium">
                <li>We only use the permissions explicitly granted by the account owner to perform authorized actions: channel management, template synchronization, sending and receiving WhatsApp messages, and processing delivery statuses.</li>
                <li>Labbaik never accesses unauthorized Meta assets outside the scoped WABA credentials.</li>
                <li>Webhook updates are received and verified against strict HMAC signatures (X-Hub-Signature-256).</li>
              </ul>
            </Card>

            <Card variant="labbaik" className="space-y-4">
              <h2 className="text-lg font-black text-neutral-900 dark:text-white flex items-center gap-2">
                <RefreshCw className="text-labbaik-blue" size={20} />
                4. Data Protection & No Sale of Personal Data
              </h2>
              <div className="p-3.5 rounded-xl bg-green-500/10 border border-green-500/20 text-xs font-bold text-green-700 dark:text-green-400 flex items-center gap-2">
                <CheckCircle2 size={16} />
                <span>We do NOT sell customer or organization data to advertisers or third parties under any circumstance.</span>
              </div>
              <p>Data is shared only with verified technical infrastructure providers necessary to fulfill service operations:</p>
              <ul className="list-disc list-inside space-y-1.5 pl-2 font-medium">
                <li><strong>Meta Platforms, Inc. / WhatsApp:</strong> For transmitting and receiving WhatsApp messages.</li>
                <li><strong>Certified Payment Gateways (e.g. Moyasar):</strong> For subscription billing and automated top-ups.</li>
                <li><strong>Cloud Hosting & Database Infrastructure:</strong> Secure servers operating under HTTPS/TLS encryption.</li>
              </ul>
            </Card>

            <Card variant="labbaik" className="space-y-4">
              <h2 className="text-lg font-black text-neutral-900 dark:text-white flex items-center gap-2">
                <Mail className="text-labbaik-blue" size={20} />
                5. Data Retention, Deletion, and Inquiries
              </h2>
              <p>
                Organizations may request complete data and account deletion at any time. For detailed deletion instructions and Meta Data Deletion callback requirements, please visit our <a href="/account-deletion" className="text-labbaik-blue underline font-bold">Account & Data Deletion page</a>.
              </p>
              <p>
                For questions regarding this policy or data protection, please contact us at: <a href="mailto:support@mkhzin.com" className="text-labbaik-blue font-bold">support@mkhzin.com</a>.
              </p>
            </Card>
          </div>
        )}
      </div>
    </PublicLayout>
  );
}

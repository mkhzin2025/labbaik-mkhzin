import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PublicLayout from '../components/layout/PublicLayout';
import { Card } from '../components/ui/Card';
import {
  FileText,
  ShieldCheck,
  Building2,
  GitFork,
  MessageSquare,
  Bot,
  CreditCard,
  Wallet,
  AlertTriangle,
  Scale,
  Trash2,
  Lock,
  LifeBuoy,
  RefreshCw,
  Server,
  Mail,
  ExternalLink,
} from 'lucide-react';
import { LEGAL_CONFIG } from '../lib/legal-config';

export default function TermsPage() {
  const [lang, setLang] = useState<'ar' | 'en'>('ar');

  useEffect(() => {
    document.title = lang === 'ar' ? 'شروط الخدمة — لبيك' : 'Terms of Service | Labbaik';
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      metaDesc.setAttribute(
        'content',
        lang === 'ar'
          ? 'شروط وأحكام استخدام منصة لبيك لإدارة التواصل الذكي مع العملاء عبر قنوات واتساب وميتا.'
          : 'Terms of Service governing the use of the Labbaik customer communication and messaging SaaS platform.'
      );
    }
  }, [lang]);

  return (
    <PublicLayout>
      <div className="space-y-6">
        {/* Top Header Banner */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-200 dark:border-white/10 pb-6">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-1.5 text-xs font-black text-labbaik-blue bg-labbaik-blue/10 px-3 py-1 rounded-full">
              <Scale size={14} />
              <span>{lang === 'ar' ? 'اتفاقية الاستخدام الرسمية' : 'Official Legal Agreement'}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-neutral-900 dark:text-white">
              {lang === 'ar' ? 'شروط الخدمة — لبيك' : 'Terms of Service — Labbaik'}
            </h1>
            <p className="text-xs text-neutral-500 font-semibold">
              {lang === 'ar'
                ? `آخر تحديث: ${LEGAL_CONFIG.lastUpdatedAr}`
                : `Last updated: ${LEGAL_CONFIG.lastUpdatedEn}`}
            </p>
          </div>

          {/* Language Toggle */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setLang('ar')}
              className={`text-xs font-bold px-3 py-1.5 rounded-xl border transition-all cursor-pointer ${
                lang === 'ar'
                  ? 'bg-labbaik-blue text-white border-labbaik-blue shadow-sm'
                  : 'bg-white dark:bg-white/5 text-neutral-600 dark:text-neutral-300 border-neutral-200 dark:border-white/10'
              }`}
            >
              العربية
            </button>
            <button
              onClick={() => setLang('en')}
              className={`text-xs font-bold px-3 py-1.5 rounded-xl border transition-all cursor-pointer ${
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
          /* ========================================================
             Arabic Version (النسخة العربية الأساسية)
             ======================================================== */
          <div className="space-y-6 text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed">
            {/* 1. المقدمة */}
            <Card variant="labbaik" className="space-y-3">
              <h2 className="text-base sm:text-lg font-black text-neutral-900 dark:text-white flex items-center gap-2">
                <FileText className="text-labbaik-blue" size={20} />
                1. مقدمة ونطاق سريان الشروط
              </h2>
              <p>
                تحكم شروط الخدمة هذه («الشروط») استخدامك لمنصة <strong>«لبيك» (Labbaik)</strong> وجميع الخدمات والميزات والواجهات البرمجية المرتبطة بها. باستخدامك للمنصة أو إنشائك لحساب أو ربطك لأي قناة اتصال خارجية، فإنك تقر وتوافق على الالتزام الكامل بهذه الشروط وبـ{' '}
                <Link to="/privacy" className="text-labbaik-blue font-bold underline hover:opacity-80">
                  سياسة الخصوصية
                </Link>
                .
              </p>
              <p>
                لبيك هي منصة برمجية كخدمة (SaaS) مصممة لمساعدة الشركات والمنشآت التجارية على إدارة التواصل مع عملائها عبر قنوات متعددة تشمل <strong>WhatsApp Business</strong> و <strong>Meta Cloud API</strong> وتطبيقات المراسلة والرد الآلي، وتنظيم سير المحادثات وإدارتها بين فرق العمل وفروع المنشأة.
              </p>
            </Card>

            {/* 2. الأهلية وإنشاء الحساب */}
            <Card variant="labbaik" className="space-y-3">
              <h2 className="text-base sm:text-lg font-black text-neutral-900 dark:text-white flex items-center gap-2">
                <Building2 className="text-labbaik-blue" size={20} />
                2. الأهلية وإنشاء الحساب ومسؤوليات المنشأة
              </h2>
              <ul className="list-disc list-inside space-y-1.5 pr-2 font-medium">
                <li>
                  <strong>التفويض القانوني:</strong> يجب أن يكون الشخص الذي ينشئ الحساب أو يديره مفوضاً قانونياً للتصرف باسم المنشأة أو الكيان التجاري الذي يمثله.
                </li>
                <li>
                  <strong>صحة المعلومات:</strong> تلتزم بتقديم بيانات دقيقة وصحيحة وكاملة أثناء التسجيل وتحديثها بشكل دوري عند حدوث أي تعديل.
                </li>
                <li>
                  <strong>حماية بيانات الدخول:</strong> المستخدم والمنظمة مسؤولان بالكامل عن الحفاظ على سرية بيانات تسجيل الدخول وتأمين مفاتيح الوصول ورموز التحقق، وعدم مشاركتها مع أطراف غير مخولة.
                </li>
                <li>
                  <strong>مسؤولية مستخدمي المنظمة:</strong> تُعتبر المنشأة مسؤولة نظامياً عن جميع الأنشطة والرسائل الصادرة من أي حساب فرعي أو مستخدم يتم منحه حق الوصول ضمن منظمتها.
                </li>
              </ul>
            </Card>

            {/* 3. هيكل المنظمات والفروع والصلاحيات */}
            <Card variant="labbaik" className="space-y-3">
              <h2 className="text-base sm:text-lg font-black text-neutral-900 dark:text-white flex items-center gap-2">
                <GitFork className="text-labbaik-blue" size={20} />
                3. هيكل المنظمات (Organizations) والفروع والصلاحيات
              </h2>
              <p>
                تم بناء بنية لبيك المعمارية بنظام عزل مشدد بين المستأجرين (Multi-tenant Isolation):
              </p>
              <ul className="list-disc list-inside space-y-1.5 pr-2 font-medium">
                <li>تمتلك كل منظمة (Organization) مساحة بيانات مستقلة ومعزولة برمجياً ومنطقياً عن باقي المنظمات.</li>
                <li>يمكن للمنظمة إنشاء عدة فروع أو متاجر (Stores / Branches) وربط القنوات وتوزيع المحادثات بناءً على الفروع.</li>
                <li>
                  يتم التحكم بالوصول عبر مصفوفة أدوار دقيقة (Owner, Admin, Supervisor, Agent) تحدد نطاق الرؤية والإجراءات المسموح بها لكل مستخدم.
                </li>
                <li>
                  يُحظر منعاً باتاً على أي مستخدم محاولة اختراق العزل أو محاولة الوصول إلى سجلات أي منظمة أخرى أو فروع غير مصرح له بها.
                </li>
              </ul>
            </Card>

            {/* 4. التكاملات والخدمات الخارجية */}
            <Card variant="labbaik" className="space-y-3">
              <h2 className="text-base sm:text-lg font-black text-neutral-900 dark:text-white flex items-center gap-2">
                <ExternalLink className="text-labbaik-blue" size={20} />
                4. ربط الخدمات والتكاملات الخارجية (Integrations)
              </h2>
              <p>
                تتيح لبيك تكاملات مع خدمات خارجية موثوقة لتشغيل وظائف المنصة الأساسية، ومنها:
              </p>
              <ul className="list-disc list-inside space-y-1.5 pr-2 font-medium">
                <li>منظومة Meta و WhatsApp Business Cloud API للمراسلة المباشرة.</li>
                <li>بوابة الدفع الإلكتروني ميسر (Moyasar) لمعالجة المدفوعات وشحن الاشتراكات والمحفظة.</li>
                <li>مزودو خدمات الذكاء الاصطناعي لتوليد المقترحات والردود الذكية عند تفعيلها.</li>
                <li>مزودو خدمات الاستضافة، والبنية التحتية، وخدمات إرسال البريد الإلكتروني والإشعارات.</li>
              </ul>
              <p className="text-xs text-neutral-500 bg-neutral-100 dark:bg-white/5 p-3 rounded-xl">
                <strong>تنويه نظامي:</strong> يخضع استخدام هذه الخدمات الخارجية أيضاً للشروط والسياسات الخاصة بكل مزود طرف ثالث. ولا تتحمل لبيك المسؤولية المباشرة عن انقطاع خدمات المزودين الخارجيين، أو إلغاء رموز الوصول (Tokens)، أو تعديل واجهات البرمجة (APIs) الخاصة بهم، أو أي قرارات تشغيلية تتخذها تلك الجهات خارج نطاق سيطرة لبيك.
              </p>
            </Card>

            {/* 5. استخدام واتساب وميتا */}
            <Card variant="labbaik" className="space-y-3">
              <h2 className="text-base sm:text-lg font-black text-neutral-900 dark:text-white flex items-center gap-2">
                <MessageSquare className="text-labbaik-blue" size={20} />
                5. استخدام WhatsApp Business و Meta
              </h2>
              <p>
                عند ربط حساب واتساب للأعمال (WABA) التابع لمنشأتك مع لبيك، تقر وتلتزم بما يلي:
              </p>
              <ul className="list-disc list-inside space-y-1.5 pr-2 font-medium">
                <li>
                  أنك المالك الفعلي لحساب واتساب أو وكيل مخول رسمياً بإدارته وربطه.
                </li>
                <li>
                  الالتزام التام بسياسات المراسلة التجارية الصادرة من Meta و WhatsApp (Commerce and Business Policies).
                </li>
                <li>
                  الامتناع التام عن إرسال الرسائل غير المرغوب فيها (Spam)، أو مراسلة مستخدمين دون موافقة مسبقة موثقة (Opt-in) وفق متطلبات واتساب والأنظمة السارية.
                </li>
                <li>
                  استخدام القوالب (Templates) المعتمدة رسمياً من Meta، وإدراك أن Meta هي الجهة الوحيدة المخولة باعتماد أو رفض القوالب، ولا تضمن لبيك قبول أي قالب أو تصنيف رسالة.
                </li>
                <li>
                  تعتمد لبيك على تقنية الويب هوك (Webhooks) لاستقبال الرسائل وتحديثات حالات التسليم والقراءة (Sent, Delivered, Read, Failed) وفق الآلية التي توفرها Meta.
                </li>
              </ul>
            </Card>

            {/* 6. المحتوى والرسائل المسموح بها والمحظورة */}
            <Card variant="labbaik" className="space-y-3">
              <h2 className="text-base sm:text-lg font-black text-neutral-900 dark:text-white flex items-center gap-2">
                <AlertTriangle className="text-amber-500" size={20} />
                6. المحتوى والاستخدام المحظور
              </h2>
              <p>
                تتحمل المنشأة وحدها كامل المسؤولية عن محتوى الرسائل، والحملات، والقوالب، والملفات، والوسائط المرسلة عبر المنصة. يُحظر حظراً تاماً استخدام منصة لبيك في:
              </p>
              <ul className="list-disc list-inside space-y-1.5 pr-2 font-medium">
                <li>نشر أو إرسال محتوى غير قانوني أو احتيالي أو مسيء أو مضلل.</li>
                <li>انتحال صفة أي شخص طبيعي أو اعتباري أو تزييف الهوية والارتباط.</li>
                <li>انتهاك حقوق الملكية الفكرية أو الخصوصية لأي طرف.</li>
                <li>نشر أو نقل الفيروسات أو البرمجيات الخبيثة أو محاولات التعطيل وهجمات الحرمان من الخدمة.</li>
                <li>استخدام المنصة لأي نشاط ينتهك الأنظمة السارية في المملكة العربية السعودية أو سياسات منصات الاتصال الشريكة.</li>
              </ul>
            </Card>

            {/* 7. استخدام ميزات الذكاء الاصطناعي */}
            <Card variant="labbaik" className="space-y-3">
              <h2 className="text-base sm:text-lg font-black text-neutral-900 dark:text-white flex items-center gap-2">
                <Bot className="text-labbaik-blue" size={20} />
                7. ميزات المساعدة بالذكاء الاصطناعي (AI-Assisted Features)
              </h2>
              <p>
                عند تفعيل ميزات الذكاء الاصطناعي للرد التلقائي أو اقتراح الإجابات:
              </p>
              <ul className="list-disc list-inside space-y-1.5 pr-2 font-medium">
                <li>
                  تُقدّم الردود المولدة بالذكاء الاصطناعي كأداة مساعدة، وقد لا تكون صحيحة أو دقيقة بنسبة 100% في جميع الحالات.
                </li>
                <li>
                  تتحمل المنشأة مسؤولية مراقبة وضبط إعدادات النماذج والتعليمات الموجهة للذكاء الاصطناعي وتدريب فريقها على مراجعتها.
                </li>
                <li>
                  يُحظر الاعتماد على الردود الآلية دون مراجعة بشرية في اتخاذ قرارات مالية، أو طبية، أو قانونية عالية الحساسية.
                </li>
                <li>
                  يحق للمنظمة تعطيل أو تشغيل ميزات الذكاء الاصطناعي في أي وقت من خلال لوحة التحكم.
                </li>
              </ul>
            </Card>

            {/* 8. الباقات والاشتراكات والحدود التشغيلية */}
            <Card variant="labbaik" className="space-y-3">
              <h2 className="text-base sm:text-lg font-black text-neutral-900 dark:text-white flex items-center gap-2">
                <CreditCard className="text-labbaik-blue" size={20} />
                8. الخطط والاشتراكات والحدود التشغيلية
              </h2>
              <ul className="list-disc list-inside space-y-1.5 pr-2 font-medium">
                <li>
                  تتطلب بعض ميزات المنصة اشتراكاً مدفوعاً وفق الباقات والخطط المعلنة داخل لوحة تحكم المنصة.
                </li>
                <li>
                  تتضمن كل باقة حدوداً تشغيلية واضحة تشمل على سبيل المثال: عدد الفروع، والمستخدمين المصرح لهم، والقنوات المربوطة، ورسائل واتساب، واستهلاك الردود الذكية.
                </li>
                <li>
                  تحتفظ لبيك بحق تعديل أسعار الباقات أو حدودها مستقبلاً، على أن يتم إشعار المشتركين بأي تعديل يؤثر على اشتراكاتهم الحالية بفترة معقولة قبل حلول موعد التجديد.
                </li>
              </ul>
            </Card>

            {/* 9. محفظة لبيك (Labbaik Wallet) */}
            <Card variant="labbaik" className="space-y-3">
              <h2 className="text-base sm:text-lg font-black text-neutral-900 dark:text-white flex items-center gap-2">
                <Wallet className="text-labbaik-blue" size={20} />
                9. رصيد محفظة لبيك (Labbaik Wallet) والخدمات الاستهلاكية
              </h2>
              <ul className="list-disc list-inside space-y-1.5 pr-2 font-medium">
                <li>
                  تعتمد بعض الخدمات (مثل إرسال قوالب واتساب ورسوم استهلاك Meta المدفوعة أو الردود الذكية الإضافية) على الدفع المسبق عبر محفظة لبيك الرقمية.
                </li>
                <li>
                  يتم الخصم التلقائي من رصيد المحفظة بحسب الاستهلاك الفعلي والأسعار الموضحة والمعلنة داخل المنصة لحظة الاستخدام.
                </li>
                <li>
                  في حال فشل إرسال رسالة بسبب خلل تقني داخلي يثبت استحقاقه للإعادة، يتم إعادة قيمة العملية إلى رصيد محفظة الحساب وفق سياسة الاستهلاك والتدقيق المعتمدة.
                </li>
              </ul>
            </Card>

            {/* 10. بوابات الدفع الإلكتروني (ميسر) */}
            <Card variant="labbaik" className="space-y-3">
              <h2 className="text-base sm:text-lg font-black text-neutral-900 dark:text-white flex items-center gap-2">
                <ShieldCheck className="text-labbaik-blue" size={20} />
                10. المدفوعات وأمان البطاقات البنكية
              </h2>
              <p>
                تتم معالجة العمليات المالية عبر بوابة دفع إلكتروني مرخصة (ميسر - Moyasar) ومتوافقة مع المعايير العالمية لأمان بطاقات الدفع (PCI-DSS):
              </p>
              <ul className="list-disc list-inside space-y-1.5 pr-2 font-medium">
                <li>
                  لا تقوم منصة لبيك بتخزين أرقام البطاقات البنكية الكاملة أو رموز التحقق (CVC/CVV) على خوادمها نهائياً، بل تعتمد المعالجة على نظام التوكنات الآمنة (Tokenization) عبر مزود الدفع المعتمد.
                </li>
                <li>
                  يقتصر ما يتم حفظه لأغراض المحاسبة وتأكيد المعاملات على معرف المعاملة، ونوع الشبكة، والرمز المشفر، وآخر 4 أرقام من البطاقة إن لزم.
                </li>
                <li>
                  تخضع جميع المعاملات المالية لشروط وأحكام مزود بوابة الدفع والأنظمة المصرفية المعتمدة.
                </li>
              </ul>
            </Card>

            {/* 11. التجديد والإلغاء */}
            <Card variant="labbaik" className="space-y-3">
              <h2 className="text-base sm:text-lg font-black text-neutral-900 dark:text-white flex items-center gap-2">
                <RefreshCw className="text-labbaik-blue" size={20} />
                11. التجديد التلقائي وإلغاء الاشتراك
              </h2>
              <ul className="list-disc list-inside space-y-1.5 pr-2 font-medium">
                <li>
                  في حال تفعيل ميزة التجديد التلقائي، يتم تجديد الاشتراك تلقائياً بنهاية دورة الفوترة المحددة.
                </li>
                <li>
                  يحق للمشترك إيقاف ميزة التجديد التلقائي في أي وقت من إعدادات الفوترة، ويظل الحساب متاحاً حتى نهاية الفترة المدفوعة دون فرض رسوم تجديد لاحقة.
                </li>
                <li>
                  إلغاء الاشتراك لا يعني الحذف الفوري للبيانات، بل يتيح للمنظمة تصدير سجلاتها أو طلب حذف الحساب نهائياً عبر صفحة حذف الحساب الرسمية.
                </li>
              </ul>
            </Card>

            {/* 12. تعليق أو إنهاء الحساب */}
            <Card variant="labbaik" className="space-y-3">
              <h2 className="text-base sm:text-lg font-black text-neutral-900 dark:text-white flex items-center gap-2">
                <AlertTriangle className="text-red-500" size={20} />
                12. تعليق الحساب أو إنهاء الخدمة
              </h2>
              <p>
                يحق للبيك تعليق أو تقييد أو إنهاء وصول المنشأة للمنصة كلياً أو جزئياً، مع إشعار مسبق متى كان ذلك ممكناً، في الحالات التالية:
              </p>
              <ul className="list-disc list-inside space-y-1.5 pr-2 font-medium">
                <li>مخالفة أي بند من بنود هذه الشروط أو سياسة الخصوصية.</li>
                <li>صدور مخالفات متكررة لسياسات Meta أو استخدام الحساب في إرسال رسائل احتيالية أو سبام.</li>
                <li>وجود مخاطر أمنية تهدد استقرار الخوادم أو سلامة بيانات المنظمات الأخرى.</li>
                <li>التخلف عن سداد الرسوم أو المبالغ المستحقة للاشتراك.</li>
              </ul>
            </Card>

            {/* 13. طلب حذف الحساب والبيانات */}
            <Card variant="labbaik" className="space-y-3">
              <h2 className="text-base sm:text-lg font-black text-neutral-900 dark:text-white flex items-center gap-2">
                <Trash2 className="text-red-500" size={20} />
                13. حذف الحساب والبيانات (Data Deletion)
              </h2>
              <p>
                يمكن للمنشأة في أي وقت طلب حذف حسابها وبياناتها وفق الآلية المعتمدة في{' '}
                <Link to="/account-deletion" className="text-labbaik-blue font-bold underline hover:opacity-80">
                  صفحة حذف الحساب والبيانات
                </Link>
                :
              </p>
              <ul className="list-disc list-inside space-y-1.5 pr-2 font-medium">
                <li>
                  <strong>من داخل المنصة:</strong> من خلال مسار الإعدادات للحساب المخول.
                </li>
                <li>
                  <strong>عبر النموذج العام:</strong> للمستخدمين غير القادرين على تسجيل الدخول بعد التحقق من الهوية وصلاحية التفويض.
                </li>
                <li>
                  <strong>الاحتفاظ النظامي:</strong> قد يتم الاحتفاظ بسجلات الفواتير والمعاملات المالية وسجلات التدقيق الأمني للفترات التي تفرضها الأنظمة المحاسبية والضريبية السارية في المملكة العربية السعودية.
                </li>
              </ul>
            </Card>

            {/* 14. الملكية الفكرية */}
            <Card variant="labbaik" className="space-y-3">
              <h2 className="text-base sm:text-lg font-black text-neutral-900 dark:text-white flex items-center gap-2">
                <Lock className="text-labbaik-blue" size={20} />
                14. حقوق الملكية الفكرية
              </h2>
              <ul className="list-disc list-inside space-y-1.5 pr-2 font-medium">
                <li>
                  <strong>ملكية منصة لبيك:</strong> تحتفظ لبيك بجميع حقوق الملكية الفكرية والعلامات التجارية والبرمجيات وشفرات المصدر والواجهات والتصاميم الخاصة بالمنصة.
                </li>
                <li>
                  <strong>ملكية العميل لبياناته:</strong> تحتفظ المنشأة المشتركة بكامل حقوق الملكية لبيانات عملائها، ونصوص محادثاتها، ومحتواها وقوالبها الخاصة، ولا تدعي لبيك أي ملكية لتلك البيانات.
                </li>
              </ul>
            </Card>

            {/* 15. البيانات والخصوصية */}
            <Card variant="labbaik" className="space-y-3">
              <h2 className="text-base sm:text-lg font-black text-neutral-900 dark:text-white flex items-center gap-2">
                <ShieldCheck className="text-labbaik-blue" size={20} />
                15. الخصوصية وحماية البيانات
              </h2>
              <p>
                تخضع جميع عمليات جمع ومعالجة البيانات الشخصية لأحكام{' '}
                <Link to="/privacy" className="text-labbaik-blue font-bold underline hover:opacity-80">
                  سياسة الخصوصية
                </Link>
                ، والتي توضح بشكل مفصل المعايير المتبعة لعزل البيانات، والتشفير أثناء النقل (HTTPS/TLS)، وضوابط الوصول للمستخدمين المخولين فقط.
              </p>
            </Card>

            {/* 16. توفر الخدمة والصيانة */}
            <Card variant="labbaik" className="space-y-3">
              <h2 className="text-base sm:text-lg font-black text-neutral-900 dark:text-white flex items-center gap-2">
                <Server className="text-labbaik-blue" size={20} />
                16. توفر الخدمة والصيانة الدورية
              </h2>
              <p>
                نبذل جهوداً تقنية وتشغيلية متواصلة لضمان استقرار وجاهزية المنصة، ومع ذلك:
              </p>
              <ul className="list-disc list-inside space-y-1.5 pr-2 font-medium">
                <li>لا نضمن توفراً بنسبة 100% دون انقطاع، حيث قد تخضع المنصة لأعمال صيانة دورية أو طارئة لتحسين الأداء أو تطبيق التحديثات الأمنية.</li>
                <li>قد تتأثر بعض الميزات بانقطاعات شبكة الإنترنت العامة أو انقطاعات مؤقتة لدى المزودين الخارجيين مثل Meta أو مزودي الاستضافة السحابية.</li>
              </ul>
            </Card>

            {/* 17. النسخ الاحتياطي وحفظ البيانات */}
            <Card variant="labbaik" className="space-y-3">
              <h2 className="text-base sm:text-lg font-black text-neutral-900 dark:text-white flex items-center gap-2">
                <LifeBuoy className="text-labbaik-blue" size={20} />
                17. النسخ الاحتياطي ومسؤولية الحفظ
              </h2>
              <p>
                تطبق لبيك إجراءات نسخ احتياطي دورية لحماية بنية النظام واستعادة التشغيل عند الكوارث التقنية. وعلى الرغم من ذلك، يُوصى بأن تحتفظ المنشآت بنسخها الإضافية الخاصة للبيانات الحرجة وسجلات العملاء التي تهم نشاطها التجاري.
              </p>
            </Card>

            {/* 18. حدود المسؤولية */}
            <Card variant="labbaik" className="space-y-3">
              <h2 className="text-base sm:text-lg font-black text-neutral-900 dark:text-white flex items-center gap-2">
                <Scale className="text-labbaik-blue" size={20} />
                18. حدود المسؤولية (Limitation of Liability)
              </h2>
              <p>
                إلى الحد الأقصى المسموح به نظاماً، لا تتحمل لبيك أي مسؤولية عن أي أضرار غير مباشرة أو تبعية أو خسائر في الأرباح أو السمعة التجارية تنتج عن:
              </p>
              <ul className="list-disc list-inside space-y-1.5 pr-2 font-medium">
                <li>إساءة استخدام المنصة من قبل المشترك أو أي من تابعيه ومستخدميه.</li>
                <li>إيقاف أو تعليق حساب واتساب للأعمال (WABA) من قبل شركة Meta نتيجة مخالفة سياساتها.</li>
                <li>أعطال خدمات الاتصال والمزودين الخارجيين الخارجة عن سيطرة لبيك المعقولة.</li>
                <li>أي إجراء اتخذته المنشأة اعتماداً على مقترحات الردود الآلية دون مراجعة وتدقيق بشري.</li>
              </ul>
            </Card>

            {/* 19. التعديلات على الشروط */}
            <Card variant="labbaik" className="space-y-3">
              <h2 className="text-base sm:text-lg font-black text-neutral-900 dark:text-white flex items-center gap-2">
                <RefreshCw className="text-labbaik-blue" size={20} />
                19. التعديلات على الشروط
              </h2>
              <p>
                يحق للبيك تحديث شروط الخدمة هذه عند الحاجة لمواكبة التحديثات التشغيلية أو التنظيمية. وتصبح التعديلات سارية المفعول بمجرد نشرها على هذه الصفحة مع تحديث تاريخ «آخر تحديث». وفي حال كانت التعديلات جوهرية، سيتم إشعار المشتركين عبر لوحة التحكم أو عبر البريد الإلكتروني المسجل.
              </p>
            </Card>

            {/* 20. القانون المعمول به والاختصاص */}
            <Card variant="labbaik" className="space-y-3">
              <h2 className="text-base sm:text-lg font-black text-neutral-900 dark:text-white flex items-center gap-2">
                <Building2 className="text-labbaik-blue" size={20} />
                20. القانون المعمول به والاختصاص القضائي
              </h2>
              <p>
                تخضع شروط الخدمة هذه وتُفسر وفقاً للأنظمة واللوائح السارية والمعمول بها في <strong>المملكة العربية السعودية</strong>، وتختص الجهات القضائية المختصة في المملكة بالفصل في أي نزاع ينشأ عن تفسير أو تطبيق هذه الشروط.
              </p>
            </Card>

            {/* 21. التواصل والاستفسارات */}
            <Card variant="labbaik" className="space-y-3">
              <h2 className="text-base sm:text-lg font-black text-neutral-900 dark:text-white flex items-center gap-2">
                <Mail className="text-labbaik-blue" size={20} />
                21. التواصل والقنوات الرسمية
              </h2>
              <p>
                لأي استفسارات تتعلق بهذه الشروط، أو لطلب المساعدة والدعم الفني:
              </p>
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <a
                  href={`mailto:${LEGAL_CONFIG.legalEmail}`}
                  className="inline-flex items-center gap-2 text-xs font-bold text-neutral-700 dark:text-neutral-200 bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10 px-4 py-2.5 rounded-xl hover:border-labbaik-blue transition-colors"
                >
                  <Mail size={15} className="text-labbaik-blue" />
                  <span>الشؤون القانونية: {LEGAL_CONFIG.legalEmail}</span>
                </a>
                <a
                  href={`mailto:${LEGAL_CONFIG.supportEmail}`}
                  className="inline-flex items-center gap-2 text-xs font-bold text-neutral-700 dark:text-neutral-200 bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10 px-4 py-2.5 rounded-xl hover:border-labbaik-blue transition-colors"
                >
                  <LifeBuoy size={15} className="text-labbaik-blue" />
                  <span>فريق الدعم والمساندة: {LEGAL_CONFIG.supportEmail}</span>
                </a>
              </div>
            </Card>
          </div>
        ) : (
          /* ========================================================
             English Version (النسخة الإنجليزية)
             ======================================================== */
          <div className="space-y-6 text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed" dir="ltr">
            <Card variant="labbaik" className="space-y-3">
              <h2 className="text-base sm:text-lg font-black text-neutral-900 dark:text-white flex items-center gap-2">
                <FileText className="text-labbaik-blue" size={20} />
                1. Introduction & Scope
              </h2>
              <p>
                These Terms of Service ("Terms") govern your access to and use of the <strong>Labbaik</strong> platform, services, software, APIs, and associated applications. By accessing or using the platform, registering an account, or connecting any external communication channel, you agree to be bound by these Terms and our{' '}
                <Link to="/privacy" className="text-labbaik-blue font-bold underline hover:opacity-80">
                  Privacy Policy
                </Link>
                .
              </p>
              <p>
                Labbaik is a Software-as-a-Service (SaaS) platform designed to help businesses manage customer communication channels, including <strong>WhatsApp Business</strong> via <strong>Meta Cloud API</strong>, automated workflows, and multi-branch team collaboration.
              </p>
            </Card>

            <Card variant="labbaik" className="space-y-3">
              <h2 className="text-base sm:text-lg font-black text-neutral-900 dark:text-white flex items-center gap-2">
                <Building2 className="text-labbaik-blue" size={20} />
                2. Eligibility, Account Registration & Responsibilities
              </h2>
              <ul className="list-disc list-inside space-y-1.5 pl-2 font-medium">
                <li>You must have the legal authorization to bind the organization you represent.</li>
                <li>You agree to provide accurate, current, and complete information during registration and keep it updated.</li>
                <li>You are solely responsible for maintaining the confidentiality of your account credentials, API tokens, and passwords.</li>
                <li>The organization is fully liable for all activities, messages, and configurations performed under its account by invited team members.</li>
              </ul>
            </Card>

            <Card variant="labbaik" className="space-y-3">
              <h2 className="text-base sm:text-lg font-black text-neutral-900 dark:text-white flex items-center gap-2">
                <GitFork className="text-labbaik-blue" size={20} />
                3. Organizations, Stores & Access Controls
              </h2>
              <ul className="list-disc list-inside space-y-1.5 pl-2 font-medium">
                <li>Each customer is an isolated Organization with logical multi-tenant database separation.</li>
                <li>Organizations may establish multiple Stores/Branches with granular role-based permissions (Owner, Admin, Supervisor, Agent).</li>
                <li>Attempting to breach tenant isolation or access unauthorized data of other organizations is strictly prohibited.</li>
              </ul>
            </Card>

            <Card variant="labbaik" className="space-y-3">
              <h2 className="text-base sm:text-lg font-black text-neutral-900 dark:text-white flex items-center gap-2">
                <ExternalLink className="text-labbaik-blue" size={20} />
                4. Third-Party Integrations
              </h2>
              <p>
                Labbaik integrates with third-party providers including Meta Cloud API, Moyasar Payment Gateway, AI model providers, and cloud hosting infrastructure. Your use of third-party services is subject to their respective terms. Labbaik is not liable for third-party outages, API deprecations, token revocations, or policy changes by external vendors.
              </p>
            </Card>

            <Card variant="labbaik" className="space-y-3">
              <h2 className="text-base sm:text-lg font-black text-neutral-900 dark:text-white flex items-center gap-2">
                <MessageSquare className="text-labbaik-blue" size={20} />
                5. WhatsApp Business & Meta Cloud API Terms
              </h2>
              <ul className="list-disc list-inside space-y-1.5 pl-2 font-medium">
                <li>You must own or be legally authorized to manage the WhatsApp Business Account (WABA) connected to Labbaik.</li>
                <li>You must strictly comply with Meta's WhatsApp Business and Commerce Policies.</li>
                <li>Sending spam, unsolicited broadcasts, or messaging individuals without documented prior consent (opt-in) is strictly forbidden.</li>
                <li>Template approval is solely determined by Meta; Labbaik does not guarantee approval or categorization by Meta.</li>
                <li>Webhooks are utilized to process incoming messages and delivery event statuses (sent, delivered, read, failed).</li>
              </ul>
            </Card>

            <Card variant="labbaik" className="space-y-3">
              <h2 className="text-base sm:text-lg font-black text-neutral-900 dark:text-white flex items-center gap-2">
                <AlertTriangle className="text-amber-500" size={20} />
                6. Acceptable Use & Prohibited Content
              </h2>
              <p>
                You are solely responsible for all content, messages, and media transmitted through the platform. Prohibited activities include transmitting illegal, fraudulent, harmful, or defamatory material, infringing on intellectual property, distributing malware, or violating applicable telecommunications regulations.
              </p>
            </Card>

            <Card variant="labbaik" className="space-y-3">
              <h2 className="text-base sm:text-lg font-black text-neutral-900 dark:text-white flex items-center gap-2">
                <Bot className="text-labbaik-blue" size={20} />
                7. AI-Assisted Features
              </h2>
              <p>
                AI-generated suggestions and automated replies are assistive tools that may occasionally produce inaccurate outputs. Organizations are responsible for supervising AI responses and must not rely on unreviewed AI outputs for high-risk financial, medical, or legal determinations.
              </p>
            </Card>

            <Card variant="labbaik" className="space-y-3">
              <h2 className="text-base sm:text-lg font-black text-neutral-900 dark:text-white flex items-center gap-2">
                <CreditCard className="text-labbaik-blue" size={20} />
                8. Subscriptions, Plans & Usage Limits
              </h2>
              <p>
                Certain features require active paid subscriptions. Each plan specifies operational limits regarding stores, agents, channels, message quotas, and AI consumption. Pricing and terms may be updated with reasonable advance notice.
              </p>
            </Card>

            <Card variant="labbaik" className="space-y-3">
              <h2 className="text-base sm:text-lg font-black text-neutral-900 dark:text-white flex items-center gap-2">
                <Wallet className="text-labbaik-blue" size={20} />
                9. Labbaik Wallet & Pay-As-You-Go Services
              </h2>
              <p>
                Consumable services such as Meta messaging fees or additional AI capacity are deducted from your prepaid Labbaik Wallet balance according to visible system rates. Erroneous failed transactions may be credited back upon verification.
              </p>
            </Card>

            <Card variant="labbaik" className="space-y-3">
              <h2 className="text-base sm:text-lg font-black text-neutral-900 dark:text-white flex items-center gap-2">
                <ShieldCheck className="text-labbaik-blue" size={20} />
                10. Payment Processing & Card Security
              </h2>
              <p>
                Online payments are securely processed through Moyasar (PCI-DSS compliant). Labbaik does not store raw credit card numbers or CVC codes on its servers; transactions utilize secure cryptographic tokenization.
              </p>
            </Card>

            <Card variant="labbaik" className="space-y-3">
              <h2 className="text-base sm:text-lg font-black text-neutral-900 dark:text-white flex items-center gap-2">
                <Trash2 className="text-red-500" size={20} />
                11. Account & Data Deletion
              </h2>
              <p>
                Organizations may request complete account and data deletion at any time via our{' '}
                <Link to="/account-deletion" className="text-labbaik-blue font-bold underline hover:opacity-80">
                  Data Deletion Request Page
                </Link>
                . Certain statutory accounting records, tax invoices, and security audit logs may be retained as mandated by Kingdom of Saudi Arabia regulations.
              </p>
            </Card>

            <Card variant="labbaik" className="space-y-3">
              <h2 className="text-base sm:text-lg font-black text-neutral-900 dark:text-white flex items-center gap-2">
                <Scale className="text-labbaik-blue" size={20} />
                12. Governing Law & Contact
              </h2>
              <p>
                These Terms are governed by and construed in accordance with the laws and regulations of the <strong>Kingdom of Saudi Arabia</strong>. For legal inquiries, please contact{' '}
                <a href={`mailto:${LEGAL_CONFIG.legalEmail}`} className="text-labbaik-blue underline font-bold">
                  {LEGAL_CONFIG.legalEmail}
                </a>
                .
              </p>
            </Card>
          </div>
        )}
      </div>
    </PublicLayout>
  );
}

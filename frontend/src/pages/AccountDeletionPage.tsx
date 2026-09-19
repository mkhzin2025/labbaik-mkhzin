import { useEffect, useState } from 'react';
import PublicLayout from '../components/layout/PublicLayout';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Alert } from '../components/ui/Alert';
import { Trash2, ShieldAlert, CheckCircle2, Send, Clock, FileText, UserCheck, HelpCircle } from 'lucide-react';
import api from '../api/client';

export default function AccountDeletionPage() {
  const [lang, setLang] = useState<'ar' | 'en'>('ar');
  const [email, setEmail] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [phone, setPhone] = useState('');
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    document.title = 'حذف الحساب والبيانات | لبيك';
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      metaDesc.setAttribute('content', 'تعليمات وطلب حذف حسابك وبياناتك من منصة لبيك');
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setErrorMessage(lang === 'ar' ? 'يرجى إدخال البريد الإلكتروني.' : 'Please enter your email.');
      return;
    }
    if (!confirmed) {
      setErrorMessage(lang === 'ar' ? 'يرجى الموافقة على إقرار التحقق قبل إرسال الطلب.' : 'Please confirm the identity verification acknowledgment.');
      return;
    }

    setSubmitting(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const { data } = await api.post('/public/account-deletion-request', {
        email: email.trim(),
        organizationName: organizationName.trim() || undefined,
        phone: phone.trim() || undefined,
        reason: reason.trim() || undefined,
      });

      setSuccessMessage(data.message || (lang === 'ar' ? 'تم استلام طلبك بنجاح. سيتم مراجعة البيانات والتواصل معك.' : 'Your request has been received.'));
      setEmail('');
      setOrganizationName('');
      setPhone('');
      setReason('');
      setConfirmed(false);
    } catch (err: any) {
      const msg = err?.response?.data?.message || (lang === 'ar' ? 'حدث خطأ أثناء إرسال الطلب، يرجى المحاولة لاحقاً.' : 'Failed to submit request.');
      setErrorMessage(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PublicLayout>
      <div className="space-y-6">
        {/* Header Banner */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-200 dark:border-white/10 pb-6">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-1.5 text-xs font-black text-red-600 dark:text-red-400 bg-red-500/10 px-3 py-1 rounded-full border border-red-500/20">
              <Trash2 size={14} />
              <span>{lang === 'ar' ? 'حذف الحساب والبيانات' : 'Data & Account Deletion'}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-neutral-900 dark:text-white">
              {lang === 'ar' ? 'حذف الحساب والبيانات — لبيك' : 'Account & Data Deletion — Labbaik'}
            </h1>
            <p className="text-xs text-neutral-500 font-semibold">
              {lang === 'ar'
                ? 'تعليمات ونموذج طلب حذف بيانات الحساب بما يتوافق مع سياسات Meta ومنصة لبيك'
                : 'Instructions and request form for account and data deletion in compliance with Meta guidelines'}
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

        {/* Instructions Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card variant="labbaik" className="space-y-3">
            <div className="flex items-center gap-2.5 font-black text-neutral-900 dark:text-white">
              <div className="w-8 h-8 rounded-xl bg-labbaik-blue/10 flex items-center justify-center text-labbaik-blue">
                1
              </div>
              <h3>{lang === 'ar' ? 'إذا كنت تستطيع تسجيل الدخول' : 'If you can log in'}</h3>
            </div>
            <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
              {lang === 'ar'
                ? 'يمكن لمالك الحساب طلب حذف المنظمة أو الحساب مباشرة من داخل لوحة التحكم عبر الانتقال إلى: لوحة التحكم ← الإعدادات ← الحساب ← حذف المنظمة.'
                : 'Account owners can directly initiate account or organization deletion from within the platform by navigating to: Dashboard → Settings → Account → Delete Organization.'}
            </p>
          </Card>

          <Card variant="labbaik" className="space-y-3">
            <div className="flex items-center gap-2.5 font-black text-neutral-900 dark:text-white">
              <div className="w-8 h-8 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-600 dark:text-amber-400">
                2
              </div>
              <h3>{lang === 'ar' ? 'إذا تعذر تسجيل الدخول (نموذج عام)' : 'If you cannot log in (Public Form)'}</h3>
            </div>
            <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
              {lang === 'ar'
                ? 'يمكنك ملء النموذج العام أدناه. لأسباب أمنية ولحماية المنشآت من العبث، لا يتم الحذف التلقائي فورياً وإنما يخضع للتحقق من هوية مقدم الطلب وملكيتها للبريد.'
                : 'You can submit the public deletion form below. For security and to protect organizations from unauthorized deletion, requests are reviewed and verified before execution.'}
            </p>
          </Card>
        </div>

        {/* Public Deletion Request Form */}
        <Card variant="labbaik" className="space-y-6">
          <div className="space-y-1">
            <h2 className="text-lg font-black text-neutral-900 dark:text-white flex items-center gap-2">
              <Send className="text-labbaik-blue" size={20} />
              {lang === 'ar' ? 'نموذج طلب حذف الحساب والبيانات' : 'Account Deletion Request Form'}
            </h2>
            <p className="text-xs text-neutral-500">
              {lang === 'ar'
                ? 'يرجى إدخال البريد الإلكتروني المسجل في لبيك لإرسال تعليمات التحقق واستكمال الحذف.'
                : 'Enter your registered email address to receive identity verification instructions.'}
            </p>
          </div>

          {successMessage && (
            <Alert type="success">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} />
                <span>{successMessage}</span>
              </div>
            </Alert>
          )}

          {errorMessage && (
            <Alert type="error">
              <div className="flex items-center gap-2">
                <ShieldAlert size={16} />
                <span>{errorMessage}</span>
              </div>
            </Alert>
          )}


          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-black text-neutral-700 dark:text-neutral-300">
                  {lang === 'ar' ? 'البريد الإلكتروني المسجل *' : 'Registered Email Address *'}
                </label>
                <Input
                  type="email"
                  required
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  dir="ltr"
                  className="text-left"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-black text-neutral-700 dark:text-neutral-300">
                  {lang === 'ar' ? 'اسم المنظمة / المتجر (اختياري)' : 'Organization / Store Name (Optional)'}
                </label>
                <Input
                  type="text"
                  placeholder={lang === 'ar' ? 'مثال: مؤسسة مخزن' : 'e.g. Mkhzin Store'}
                  value={organizationName}
                  onChange={(e) => setOrganizationName(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-black text-neutral-700 dark:text-neutral-300">
                  {lang === 'ar' ? 'رقم الهاتف المسجل (اختياري)' : 'Phone Number (Optional)'}
                </label>
                <Input
                  type="tel"
                  placeholder="+966500000000"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  dir="ltr"
                  className="text-left"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-black text-neutral-700 dark:text-neutral-300">
                  {lang === 'ar' ? 'سبب الحذف (اختياري)' : 'Reason for Deletion (Optional)'}
                </label>
                <Input
                  type="text"
                  placeholder={lang === 'ar' ? 'اذكر السبب لمساعدتنا على تحسين الخدمة...' : 'Help us improve...'}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10 space-y-3">
              <label className="flex items-start gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  className="mt-1 w-4 h-4 rounded text-labbaik-blue focus:ring-labbaik-blue cursor-pointer"
                />
                <span className="text-xs text-neutral-700 dark:text-neutral-300 font-bold leading-relaxed">
                  {lang === 'ar'
                    ? 'أفهم أن طلب حذف الحساب قد يؤدي إلى حذف البيانات المرتبطة بالحساب بشكل نهائي بعد التحقق من الهوية.'
                    : 'I understand that submitting this request will lead to permanent deletion of account data upon identity verification.'}
                </span>
              </label>
            </div>

            <div className="flex justify-end">
              <Button variant="danger" size="md" disabled={submitting}>
                {submitting ? 'جاري الإرسال...' : lang === 'ar' ? 'إرسال طلب حذف الحساب' : 'Submit Deletion Request'}
              </Button>
            </div>
          </form>
        </Card>

        {/* Meta Data Deletion Instructions & Policy */}
        <Card variant="labbaik" className="space-y-4">
          <h2 className="text-lg font-black text-neutral-900 dark:text-white flex items-center gap-2">
            <Clock className="text-labbaik-blue" size={20} />
            {lang === 'ar' ? 'ماذا يحدث بعد تقديم الطلب؟ (Meta Data Deletion Policy)' : 'What happens after request submission? (Meta Policy)'}
          </h2>

          <div className="space-y-3 text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed">
            <p>
              {lang === 'ar' ? (
                <>
                  بعد التحقق من هوية مقدم الطلب ومطابقتها مع ملكية الحساب، تتم معالجة طلب الحذف خلال مدة تصل إلى <strong>30 يومًا</strong>، ما لم توجد متطلبات نظامية تستوجب الاحتفاظ ببعض السجلات.
                </>
              ) : (
                <>
                  Upon successful identity verification, data deletion requests are processed within a period of up to <strong>30 days</strong>, subject to statutory regulatory requirements.
                </>
              )}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
              <div className="p-3.5 rounded-xl bg-red-500/5 border border-red-500/20 space-y-1.5">
                <h4 className="font-black text-red-600 dark:text-red-400">
                  {lang === 'ar' ? 'البيانات التي يتم حذفها نهائياً:' : 'Data Permanently Deleted:'}
                </h4>
                <ul className="list-disc list-inside space-y-1 text-neutral-600 dark:text-neutral-400">
                  <li>{lang === 'ar' ? 'سجل المحادثات والرسائل والمرفقات والوسائط' : 'Message history, chat threads, and media attachments'}</li>
                  <li>{lang === 'ar' ? 'بيانات العملاء وأرقام الهواتف والتصنيفات' : 'Customer records, phone contacts, and custom tags'}</li>
                  <li>{lang === 'ar' ? 'اتصالات WhatsApp Business وتوكنات Meta' : 'WhatsApp Business integration connections & Meta tokens'}</li>
                  <li>{lang === 'ar' ? 'بيانات وقوالب ومسارات الرد الذكي (Flows)' : 'Custom message flows and automation rules'}</li>
                </ul>
              </div>

              <div className="p-3.5 rounded-xl bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10 space-y-1.5">
                <h4 className="font-black text-neutral-800 dark:text-neutral-200">
                  {lang === 'ar' ? 'البيانات التي قد يُحتفظ بها نظامياً:' : 'Data Retained for Legal Compliance:'}
                </h4>
                <p className="text-neutral-500 dark:text-neutral-400 leading-relaxed">
                  {lang === 'ar'
                    ? 'وفق الأنظمة المعمول بها في المملكة العربية السعودية، يتم الاحتفاظ بالسجلات المالية والفواتير الضريبية وسجلات العمليات المحاسبية للمدة النظامية المقررة نظاماً لأغراض التدقيق الضريبي والمحاسبي، ويتم حجبها عن أي استخدام تجاري آخر.'
                    : 'In compliance with applicable regulations in the Kingdom of Saudi Arabia, statutory financial invoices, billing history, and accounting records are securely archived for mandatory audit periods and are strictly excluded from any marketing or operational use.'}
                </p>
              </div>
            </div>

            <div className="pt-2 text-neutral-500">
              {lang === 'ar'
                ? 'لأي استفسار إضافي حول حالة طلبك، يرجى التواصل عبر البريد الإلكتروني: support@mkhzin.com مع ذكر البريد المستخدم في الطلب.'
                : 'For status inquiries regarding your deletion request, contact us at support@mkhzin.com referencing your submitted email.'}
            </div>
          </div>
        </Card>
      </div>
    </PublicLayout>
  );
}

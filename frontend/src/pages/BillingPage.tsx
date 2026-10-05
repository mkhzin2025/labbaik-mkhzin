import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  CreditCard,
  Loader2,
  Lock,
  Minus,
  Plus,
  ReceiptText,
  RefreshCcw,
  Star,
  Trash2,
  WalletCards,
  X,
} from 'lucide-react';
import api from '../api/client';
import { useToast } from '../components/Toast';
import { toEnglishDigits } from '../lib/utils';

type Summary = any;
type Tab = 'overview' | 'plans' | 'wallet' | 'history';

const formatSar = (value: number | string | null | undefined, digits = 2) =>
  `${toEnglishDigits(Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: Math.max(digits, 6) }))} ر.س`;

const formatDate = (dateStr: string | Date | null | undefined) => {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '—';
  return toEnglishDigits(d.toLocaleDateString('en-GB'));
};

const formatDateTime = (dateStr: string | Date | null | undefined) => {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '—';
  return toEnglishDigits(d.toLocaleString('en-GB', { hour12: true }));
};

// Arabic labels for the server's enum values; unknown values fall back to the raw value.
const LABELS = {
  paymentStatus: { created: 'جديد', initiated: 'بانتظار الإكمال', paid: 'مدفوع', failed: 'فشل', refunded: 'مسترجع' } as Record<string, string>,
  paymentType: { wallet_topup: 'شحن المحفظة', auto_topup: 'شحن تلقائي', subscription: 'اشتراك', subscription_renewal: 'تجديد الاشتراك' } as Record<string, string>,
  subscription: { trialing: 'فترة تجريبية', active: 'نشط', past_due: 'متأخر السداد', canceled: 'ملغى', suspended: 'موقوف' } as Record<string, string>,
  method: { pending: 'قيد التفعيل', active: 'فعّالة', inactive: 'غير فعّالة', expired: 'منتهية' } as Record<string, string>,
  txType: { credit: 'إيداع', debit: 'خصم', refund: 'استرجاع', adjustment: 'تسوية' } as Record<string, string>,
  txCategory: { topup: 'شحن', auto_topup: 'شحن تلقائي', meta_usage: 'استخدام Meta', refund: 'استرجاع', admin: 'إدارة' } as Record<string, string>,
  usage: {
    meta_session_text: 'رسالة نصية داخل نافذة 24 ساعة',
    meta_interactive: 'رسالة تفاعلية (أزرار)',
    meta_template_marketing: 'قالب تسويقي',
    meta_template_utility: 'قالب خدمي',
    meta_template_authentication: 'قالب تحقق (OTP)',
    meta_template_other: 'قوالب أخرى',
  } as Record<string, string>,
};
const label = (map: Record<string, string>, value?: string) => (value ? map[value] || value : '—');

const TABS: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'نظرة عامة' },
  { key: 'plans', label: 'الباقات' },
  { key: 'wallet', label: 'المحفظة والدفع' },
  { key: 'history', label: 'السجل' },
];

const inputClass = 'w-full h-10 rounded-lg border border-labbaik-border bg-labbaik-page px-3 text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-labbaik-blue/30 focus:border-labbaik-blue placeholder:text-labbaik-text-muted';
const primaryButton = 'inline-flex items-center justify-center gap-2 h-10 px-4 rounded-lg bg-labbaik-blue text-labbaik-on-accent text-sm font-black hover:bg-[#553174] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer';
const secondaryButton = 'inline-flex items-center justify-center gap-2 h-10 px-4 rounded-lg border border-labbaik-border text-sm font-bold text-neutral-800 dark:text-neutral-100 hover:border-labbaik-blue/40 hover:text-labbaik-blue disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer';

const validAmount = (value: number) => Number.isFinite(value) && value >= 1;

export default function BillingPage() {
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>('overview');
  const [topupAmount, setTopupAmount] = useState(100);
  const [savedCardAmount, setSavedCardAmount] = useState(100);
  const [showCardForm, setShowCardForm] = useState(false);
  const [card, setCard] = useState({ name: '', number: '', month: '', year: '', cvc: '' });
  const [walletSettings, setWalletSettings] = useState({
    autoRechargeEnabled: false,
    autoRechargeThresholdSar: 10,
    autoRechargeAmountSar: 100,
    lowBalanceThresholdSar: 5,
  });
  const [pendingPlan, setPendingPlan] = useState<any | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [summaryRes, plansRes] = await Promise.all([api.get('/billing/summary'), api.get('/billing/plans')]);
    setSummary(summaryRes.data);
    setPlans(plansRes.data || []);
    const wallet = summaryRes.data?.wallet;
    if (wallet) {
      setWalletSettings({
        autoRechargeEnabled: Boolean(wallet.autoRechargeEnabled),
        autoRechargeThresholdSar: Number(wallet.autoRechargeThresholdSar || 10),
        autoRechargeAmountSar: Number(wallet.autoRechargeAmountSar || 100),
        lowBalanceThresholdSar: Number(wallet.lowBalanceThresholdSar || 5),
      });
    }
  }, []);

  useEffect(() => {
    load().catch(() => showToast('تعذر تحميل بيانات الفوترة.', 'error')).finally(() => setLoading(false));
  }, [load, showToast]);

  // Returning from Moyasar (3-D Secure) carries the payment id; verify it once, then clean the URL.
  useEffect(() => {
    const paymentId = searchParams.get('id') || searchParams.get('payment_id');
    if (!paymentId) return;
    setBusy(true);
    api.post('/billing/payments/verify', { paymentId })
      .then((res) => {
        if (res.data?.payment?.status === 'paid') showToast('تم تأكيد الدفع وتحديث حسابك.', 'success');
        else showToast('عملية الدفع لم تكتمل بعد.', 'error');
        return load();
      })
      .catch((error) => showToast(error?.response?.data?.message || 'تعذر التحقق من الدفع.', 'error'))
      .finally(() => {
        setBusy(false);
        setSearchParams({}, { replace: true });
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const defaultMethod = useMemo(() => summary?.paymentMethods?.find((m: any) => m.isDefault && m.status === 'active') || summary?.paymentMethods?.find((m: any) => m.status === 'active'), [summary]);

  const beginNewCardTopup = async () => {
    if (!summary?.moyasar?.configured) return showToast('بوابة ميسر غير مهيأة في الخادم.', 'error');
    if (!validAmount(topupAmount)) return showToast('أدخل مبلغ شحن صحيح.', 'error');
    if (!card.name || card.number.replace(/\D/g, '').length < 12 || !card.month || !card.year || !card.cvc) {
      return showToast('أكمل بيانات البطاقة.', 'error');
    }
    setBusy(true);
    try {
      const { data: intent } = await api.post('/billing/wallet/topups/intents', { amountSar: Number(topupAmount) });
      const basic = btoa(`${intent.publishableKey}:`);
      const response = await fetch('https://api.moyasar.com/v1/payments', {
        method: 'POST',
        headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          given_id: intent.providerPaymentId,
          amount: intent.amountMinor,
          currency: intent.currency,
          description: intent.description,
          callback_url: intent.callbackUrl,
          source: {
            type: 'creditcard',
            name: card.name,
            number: card.number.replace(/\D/g, ''),
            month: Number(card.month),
            year: Number(card.year),
            cvc: card.cvc,
            save_card: true,
          },
          metadata: { billing_intent_id: intent.intentId },
        }),
      });
      const payment = await response.json();
      if (!response.ok || payment.status === 'failed') throw new Error(payment?.message || payment?.source?.message || 'فشلت عملية إنشاء الدفع');
      await api.post('/billing/wallet/topups/checkout', {
        intentId: intent.intentId,
        providerPaymentId: payment.id || intent.providerPaymentId,
      });
      setCard({ name: '', number: '', month: '', year: '', cvc: '' });
      if (payment.status === 'paid') {
        await api.post('/billing/payments/verify', { paymentId: payment.id || intent.providerPaymentId });
        await load();
        setShowCardForm(false);
        showToast('تم شحن المحفظة وحفظ البطاقة.', 'success');
      } else if (payment?.source?.transaction_url) {
        window.location.href = payment.source.transaction_url;
      } else {
        throw new Error('لم ترجع ميسر رابط التحقق 3D Secure');
      }
    } catch (error: any) {
      showToast(error?.response?.data?.message || error.message || 'فشل شحن المحفظة.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const topupSavedCard = async () => {
    if (!defaultMethod) return showToast('لا توجد بطاقة محفوظة.', 'error');
    if (!validAmount(savedCardAmount)) return showToast('أدخل مبلغ شحن صحيح.', 'error');
    setBusy(true);
    try {
      const { data } = await api.post('/billing/wallet/topups/saved-card', { paymentMethodId: defaultMethod.id, amountSar: Number(savedCardAmount) });
      if (data?.requiresRedirect && data.redirectUrl) window.location.href = data.redirectUrl;
      else {
        await load();
        showToast('تم شحن المحفظة.', 'success');
      }
    } catch (error: any) {
      showToast(error?.response?.data?.message || 'تعذر شحن المحفظة.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const subscribe = async (planId: string, monthlyPriceMinor: number) => {
    if (monthlyPriceMinor > 0 && !defaultMethod) return showToast('احفظ بطاقة أولاً من «المحفظة والدفع».', 'error');
    setBusy(true);
    try {
      const { data } = await api.post('/billing/subscription/subscribe', { planId, paymentMethodId: defaultMethod?.id });
      if (data?.requiresRedirect && data.redirectUrl) window.location.href = data.redirectUrl;
      else {
        await load();
        showToast('تم تحديث الاشتراك.', 'success');
      }
    } catch (error: any) {
      showToast(error?.response?.data?.message || 'فشل تغيير الاشتراك.', 'error');
    } finally { setBusy(false); }
  };

  const saveWalletSettings = async () => {
    setBusy(true);
    try {
      await api.patch('/billing/wallet/settings', walletSettings);
      await load();
      showToast('تم حفظ إعدادات المحفظة.', 'success');
    } catch (error: any) {
      showToast(error?.response?.data?.message || 'تعذر حفظ إعدادات المحفظة.', 'error');
    } finally { setBusy(false); }
  };

  const makeDefault = async (paymentMethodId: string) => {
    setBusy(true);
    try {
      await api.post('/billing/payment-methods/default', { paymentMethodId });
      await load();
      showToast('تم تعيين البطاقة الافتراضية.', 'success');
    } catch (error: any) {
      showToast(error?.response?.data?.message || 'تعذر تعيين البطاقة الافتراضية.', 'error');
    } finally { setBusy(false); }
  };

  const removeMethod = async (id: string) => {
    setBusy(true);
    try {
      await api.delete(`/billing/payment-methods/${id}`);
      setConfirmRemove(null);
      await load();
      showToast('تم حذف البطاقة.', 'success');
    } catch (error: any) {
      showToast(error?.response?.data?.message || 'تعذر حذف البطاقة.', 'error');
    } finally { setBusy(false); }
  };

  const refresh = async () => {
    setBusy(true);
    try { await load(); } catch { showToast('تعذر تحديث بيانات الفوترة.', 'error'); } finally { setBusy(false); }
  };

  if (loading || !summary) {
    return (
      <div className="h-[50vh] flex flex-col items-center justify-center gap-3 text-labbaik-text-muted" dir="rtl">
        <Loader2 size={28} className="animate-spin text-labbaik-blue" />
        <p className="text-sm font-bold">جاري تحميل الفوترة والمحفظة...</p>
      </div>
    );
  }

  const currentPlan = summary.subscription?.plan;
  const wallet = summary.wallet;
  const balance = Number(wallet?.balanceSar || 0);
  const lowBalance = balance <= Number(wallet?.lowBalanceThresholdSar || 0);
  const readiness = [
    { ok: Boolean(currentPlan?.features?.metaLabbaik), label: 'باقة تدعم Meta لبيك', action: () => setTab('plans') },
    { ok: Boolean(defaultMethod), label: 'بطاقة دفع محفوظة', action: () => setTab('wallet') },
    { ok: balance > 0, label: 'رصيد في المحفظة', action: () => setTab('wallet') },
  ];
  const ready = readiness.every((r) => r.ok);

  return (
    <div className="max-w-6xl space-y-4 pb-10" dir="rtl">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-neutral-900 dark:text-white">الباقات والفوترة</h1>
          <p className="mt-1 text-sm text-labbaik-text-muted">اشتراك لبيك، ورصيد Meta لبيك، وطرق الدفع المحفوظة.</p>
        </div>
        <button type="button" onClick={() => void refresh()} disabled={busy} className={secondaryButton}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : <RefreshCcw size={16} />} تحديث
        </button>
      </div>

      <div className="flex gap-1 border-b border-labbaik-border overflow-x-auto" role="tablist" aria-label="أقسام الفوترة">
        {TABS.map((t) => (
          <button
            type="button"
            role="tab"
            key={t.key}
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`h-10 px-3 -mb-px border-b-2 text-sm font-bold whitespace-nowrap transition-colors cursor-pointer ${tab === t.key ? 'border-labbaik-blue text-labbaik-blue dark:text-purple-300' : 'border-transparent text-labbaik-text-muted hover:text-neutral-900 dark:hover:text-white'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Panel>
              <p className="text-xs font-bold text-labbaik-text-muted">رصيد محفظة Meta لبيك</p>
              <p className="mt-2 text-3xl font-black tabular-nums text-neutral-900 dark:text-white">{formatSar(wallet?.balanceSar)}</p>
              {lowBalance && <p className="mt-2 flex items-center gap-1.5 text-xs font-bold text-amber-700 dark:text-amber-300"><AlertTriangle size={14} /> الرصيد عند الحد المنخفض أو أقل</p>}
              <button type="button" onClick={() => setTab('wallet')} className="mt-3 text-sm font-bold text-labbaik-blue dark:text-purple-300 hover:underline cursor-pointer">شحن الرصيد</button>
            </Panel>
            <Panel>
              <p className="text-xs font-bold text-labbaik-text-muted">الباقة الحالية</p>
              <p className="mt-2 text-2xl font-black text-neutral-900 dark:text-white">{currentPlan?.nameAr || 'بدون باقة'}</p>
              <p className="mt-2 text-xs text-labbaik-text-muted">
                <StatusPill tone={summary.subscription?.status === 'active' || summary.subscription?.status === 'trialing' ? 'ok' : 'warn'}>{label(LABELS.subscription, summary.subscription?.status)}</StatusPill>
                {summary.subscription?.currentPeriodEnd && <span className="ms-2">حتى {formatDate(summary.subscription?.currentPeriodEnd)}</span>}
              </p>
              <button type="button" onClick={() => setTab('plans')} className="mt-3 text-sm font-bold text-labbaik-blue dark:text-purple-300 hover:underline cursor-pointer">عرض الباقات</button>
            </Panel>
            <Panel>
              <p className="text-xs font-bold text-labbaik-text-muted">وسيلة الدفع الافتراضية</p>
              {defaultMethod ? (
                <>
                  <p className="mt-2 flex items-center gap-2 text-lg font-black text-neutral-900 dark:text-white" dir="ltr" style={{ justifyContent: 'flex-end' }}>
                    {String(defaultMethod.brand || 'CARD').toUpperCase()} •••• {toEnglishDigits(defaultMethod.lastFour)} <CreditCard size={18} className="text-labbaik-blue dark:text-purple-300" />
                  </p>
                  <p className="mt-1 text-xs text-labbaik-text-muted tabular-nums">تنتهي {toEnglishDigits(defaultMethod.expiryMonth)}/{toEnglishDigits(defaultMethod.expiryYear)}</p>
                </>
              ) : (
                <p className="mt-2 text-sm font-bold text-amber-700 dark:text-amber-300">لا توجد بطاقة محفوظة</p>
              )}
              <button type="button" onClick={() => setTab('wallet')} className="mt-3 text-sm font-bold text-labbaik-blue dark:text-purple-300 hover:underline cursor-pointer">إدارة البطاقات</button>
            </Panel>
          </div>

          <Panel>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <h2 className="font-black text-neutral-900 dark:text-white">جاهزية Meta لبيك</h2>
                <p className="mt-0.5 text-sm text-labbaik-text-muted">{ready ? 'كل المتطلبات مكتملة، ويمكن تفعيل الإرسال عبر Meta لبيك.' : 'أكمل المتطلبات التالية قبل تفعيل الإرسال عبر Meta لبيك.'}</p>
              </div>
              <ul className="flex flex-wrap gap-2">
                {readiness.map((r) => (
                  <li key={r.label}>
                    <button
                      type="button"
                      onClick={r.action}
                      disabled={r.ok}
                      className={`inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md text-xs font-bold ${r.ok ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 cursor-default' : 'bg-amber-500/15 text-amber-800 dark:text-amber-300 hover:bg-amber-500/25 cursor-pointer'}`}
                    >
                      {r.ok ? <Check size={13} /> : <X size={13} />} {r.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </Panel>

          <Panel>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-black text-neutral-900 dark:text-white">آخر حركات المحفظة</h2>
              <button type="button" onClick={() => setTab('history')} className="text-sm font-bold text-labbaik-blue dark:text-purple-300 hover:underline cursor-pointer">عرض السجل</button>
            </div>
            <TransactionsTable rows={(summary.transactions || []).slice(0, 5)} />
          </Panel>
        </div>
      )}

      {tab === 'plans' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {plans.map((plan: any) => {
            const active = currentPlan?.id === plan.id;
            const features = [
              { on: plan.features?.metaLabbaik, label: 'الإرسال عبر Meta لبيك' },
              { on: plan.features?.ai, label: 'الرد بالذكاء الاصطناعي' },
              { on: plan.features?.flows, label: 'التدفقات' },
            ];
            return (
              <section key={plan.id} className={`rounded-xl border bg-labbaik-surface p-5 flex flex-col ${active ? 'border-labbaik-blue' : 'border-labbaik-border'}`}>
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-lg font-black text-neutral-900 dark:text-white">{plan.nameAr}</h2>
                  {active && <StatusPill tone="ok"><CheckCircle2 size={12} /> الحالية</StatusPill>}
                </div>
                <p className="mt-2"><span className="text-2xl font-black tabular-nums text-neutral-900 dark:text-white">{formatSar(plan.monthlyPriceMinor / 100)}</span> <span className="text-xs text-labbaik-text-muted">/ شهريًا</span></p>
                {plan.description && <p className="mt-2 text-sm text-labbaik-text-muted">{plan.description}</p>}
                <ul className="mt-4 space-y-2 text-sm flex-1">
                  {features.map((f) => (
                    <li key={f.label} className={`flex items-center gap-2 ${f.on ? 'text-neutral-800 dark:text-neutral-100' : 'text-labbaik-text-muted line-through decoration-1'}`}>
                      {f.on ? <Check size={15} className="text-emerald-600 dark:text-emerald-400 shrink-0" /> : <Minus size={15} className="shrink-0" />}{f.label}
                    </li>
                  ))}
                  <li className="flex items-center gap-2 text-neutral-800 dark:text-neutral-100">
                    <Check size={15} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                    {plan.limits?.monthlyMessages != null ? <><span className="tabular-nums">{toEnglishDigits(Number(plan.limits.monthlyMessages).toLocaleString('en-US'))}</span> رسالة شهريًا</> : 'رسائل غير محدودة'}
                  </li>
                </ul>
                <button
                  type="button"
                  disabled={active || busy}
                  onClick={() => setPendingPlan(plan)}
                  className={`mt-5 w-full ${active ? secondaryButton : primaryButton}`}
                >
                  {active ? 'باقتك الحالية' : 'اختيار الباقة'}
                </button>
              </section>
            );
          })}
          {!plans.length && <p className="text-sm text-labbaik-text-muted">لا توجد باقات متاحة حاليًا.</p>}
        </div>
      )}

      {tab === 'wallet' && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
          <div className="space-y-4">
            <Panel>
              <h2 className="font-black text-neutral-900 dark:text-white">شحن المحفظة</h2>
              <p className="mt-0.5 text-sm text-labbaik-text-muted">يُخصم من الرصيد تلقائيًا عند الإرسال عبر Meta لبيك. الرصيد الحالي <b className="tabular-nums text-neutral-900 dark:text-white">{formatSar(wallet?.balanceSar)}</b>.</p>

              {defaultMethod && (
                <div className="mt-4">
                  <label htmlFor="saved-amount" className="text-xs font-bold text-labbaik-text-muted">المبلغ من البطاقة •••• {toEnglishDigits(defaultMethod.lastFour)}</label>
                  <div className="mt-1.5 flex gap-2">
                    <AmountInput id="saved-amount" value={savedCardAmount} onChange={setSavedCardAmount} />
                    <button type="button" onClick={() => void topupSavedCard()} disabled={busy || !validAmount(savedCardAmount)} className={primaryButton}>
                      {busy ? <Loader2 size={16} className="animate-spin" /> : <WalletCards size={16} />} شحن {formatSar(savedCardAmount, 0)}
                    </button>
                  </div>
                  <QuickAmounts onPick={setSavedCardAmount} />
                </div>
              )}

              <div className={defaultMethod ? 'mt-4 pt-4 border-t border-labbaik-border' : 'mt-4'}>
                {!showCardForm ? (
                  <button type="button" onClick={() => setShowCardForm(true)} className={defaultMethod ? secondaryButton : primaryButton}>
                    <Plus size={16} /> {defaultMethod ? 'الدفع ببطاقة جديدة' : 'إضافة بطاقة وشحن الرصيد'}
                  </button>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="flex items-center gap-1.5 text-xs font-bold text-emerald-800 dark:text-emerald-300"><Lock size={13} /> بيانات البطاقة تُرسل مباشرة إلى ميسر ولا تمر على خادم لبيك.</p>
                      <button type="button" onClick={() => setShowCardForm(false)} aria-label="إغلاق نموذج البطاقة" className="grid h-8 w-8 place-items-center rounded-md text-labbaik-text-muted hover:text-neutral-900 dark:hover:text-white cursor-pointer"><X size={16} /></button>
                    </div>
                    <Field label="اسم حامل البطاقة" htmlFor="card-name">
                      <input id="card-name" autoComplete="cc-name" dir="ltr" value={card.name} onChange={(e) => setCard({ ...card, name: e.target.value })} className={`${inputClass} text-left`} placeholder="NAME ON CARD" />
                    </Field>
                    <Field label="رقم البطاقة" htmlFor="card-number">
                      <input
                        id="card-number"
                        autoComplete="cc-number"
                        dir="ltr"
                        inputMode="numeric"
                        value={card.number}
                        onChange={(e) => setCard({ ...card, number: toEnglishDigits(e.target.value).replace(/[^\d]/g, '').slice(0, 19).replace(/(\d{4})(?=\d)/g, '$1 ') })}
                        className={`${inputClass} text-left tabular-nums tracking-wider`}
                        placeholder="0000 0000 0000 0000"
                      />
                    </Field>
                    <div className="grid grid-cols-3 gap-2">
                      <Field label="الشهر" htmlFor="card-month">
                        <input id="card-month" autoComplete="cc-exp-month" dir="ltr" inputMode="numeric" maxLength={2} value={card.month} onChange={(e) => setCard({ ...card, month: toEnglishDigits(e.target.value).replace(/\D/g, '') })} className={`${inputClass} text-left tabular-nums`} placeholder="MM" />
                      </Field>
                      <Field label="السنة" htmlFor="card-year">
                        <input id="card-year" autoComplete="cc-exp-year" dir="ltr" inputMode="numeric" maxLength={4} value={card.year} onChange={(e) => setCard({ ...card, year: toEnglishDigits(e.target.value).replace(/\D/g, '') })} className={`${inputClass} text-left tabular-nums`} placeholder="YY" />
                      </Field>
                      <Field label="CVC" htmlFor="card-cvc">
                        <input id="card-cvc" autoComplete="cc-csc" dir="ltr" inputMode="numeric" type="password" maxLength={4} value={card.cvc} onChange={(e) => setCard({ ...card, cvc: toEnglishDigits(e.target.value).replace(/\D/g, '') })} className={`${inputClass} text-left tabular-nums`} placeholder="•••" />
                      </Field>
                    </div>
                    <Field label="مبلغ الشحن" htmlFor="new-card-amount">
                      <div className="flex gap-2">
                        <AmountInput id="new-card-amount" value={topupAmount} onChange={setTopupAmount} />
                        <button type="button" onClick={() => void beginNewCardTopup()} disabled={busy || !validAmount(topupAmount)} className={primaryButton}>
                          {busy ? <Loader2 size={16} className="animate-spin" /> : <Lock size={15} />} دفع {formatSar(topupAmount, 0)}
                        </button>
                      </div>
                      <QuickAmounts onPick={setTopupAmount} />
                    </Field>
                  </div>
                )}
              </div>
            </Panel>

            <Panel>
              <h2 className="font-black text-neutral-900 dark:text-white">الشحن التلقائي والتنبيهات</h2>
              <label className="mt-3 flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={walletSettings.autoRechargeEnabled}
                  onChange={(e) => setWalletSettings({ ...walletSettings, autoRechargeEnabled: e.target.checked })}
                  className="mt-0.5 h-4 w-4 rounded accent-[#643B89] cursor-pointer"
                />
                <span className="text-sm text-neutral-800 dark:text-neutral-100">اشحن المحفظة تلقائيًا من البطاقة الافتراضية عند انخفاض الرصيد</span>
              </label>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Field label="اشحن عند وصول الرصيد إلى" htmlFor="ar-threshold">
                  <AmountInput id="ar-threshold" value={walletSettings.autoRechargeThresholdSar} onChange={(v) => setWalletSettings({ ...walletSettings, autoRechargeThresholdSar: v })} disabled={!walletSettings.autoRechargeEnabled} />
                </Field>
                <Field label="مبلغ الشحن التلقائي" htmlFor="ar-amount">
                  <AmountInput id="ar-amount" value={walletSettings.autoRechargeAmountSar} onChange={(v) => setWalletSettings({ ...walletSettings, autoRechargeAmountSar: v })} disabled={!walletSettings.autoRechargeEnabled} />
                </Field>
                <Field label="نبّهني عند انخفاض الرصيد إلى" htmlFor="low-threshold">
                  <AmountInput id="low-threshold" value={walletSettings.lowBalanceThresholdSar} onChange={(v) => setWalletSettings({ ...walletSettings, lowBalanceThresholdSar: v })} />
                </Field>
              </div>
              {walletSettings.autoRechargeEnabled && !defaultMethod && (
                <p className="mt-3 flex items-center gap-1.5 text-xs font-bold text-amber-700 dark:text-amber-300"><AlertTriangle size={14} /> الشحن التلقائي يحتاج بطاقة محفوظة.</p>
              )}
              <button type="button" onClick={() => void saveWalletSettings()} disabled={busy} className={`mt-4 ${primaryButton}`}>حفظ الإعدادات</button>
            </Panel>
          </div>

          <div className="space-y-4">
            <Panel>
              <h2 className="font-black text-neutral-900 dark:text-white">طرق الدفع المحفوظة</h2>
              {summary.paymentMethods?.length ? (
                <ul className="mt-3 divide-y divide-labbaik-border rounded-lg border border-labbaik-border">
                  {summary.paymentMethods.map((method: any) => (
                    <li key={method.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
                      <div>
                        <p className="flex items-center gap-2 font-bold text-neutral-900 dark:text-white">
                          <CreditCard size={16} className="text-labbaik-text-muted" />
                          <span dir="ltr" className="tabular-nums">{String(method.brand || 'CARD').toUpperCase()} •••• {toEnglishDigits(method.lastFour)}</span>
                          {method.id === defaultMethod?.id && <StatusPill tone="ok">الافتراضية</StatusPill>}
                        </p>
                        <p className="mt-0.5 text-xs text-labbaik-text-muted">تنتهي <span className="tabular-nums">{toEnglishDigits(method.expiryMonth)}/{toEnglishDigits(method.expiryYear)}</span> · {label(LABELS.method, method.status)}</p>
                      </div>
                      {confirmRemove === method.id ? (
                        <div className="flex items-center gap-1">
                          <button type="button" disabled={busy} onClick={() => void removeMethod(method.id)} className="h-8 px-2.5 rounded-md bg-red-600 text-white text-xs font-black hover:bg-red-700 disabled:opacity-50 cursor-pointer">تأكيد الحذف</button>
                          <button type="button" onClick={() => setConfirmRemove(null)} className="h-8 px-2 rounded-md text-xs font-bold text-labbaik-text-muted cursor-pointer">إلغاء</button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          {method.status === 'active' && method.id !== defaultMethod?.id && (
                            <button type="button" disabled={busy} onClick={() => void makeDefault(method.id)} className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md text-xs font-bold text-labbaik-text-muted hover:text-labbaik-blue hover:bg-labbaik-blue/10 disabled:opacity-50 cursor-pointer">
                              <Star size={13} /> جعلها افتراضية
                            </button>
                          )}
                          <button type="button" onClick={() => setConfirmRemove(method.id)} aria-label="حذف البطاقة" title="حذف" className="grid h-8 w-8 place-items-center rounded-md text-labbaik-text-muted hover:text-red-600 hover:bg-red-500/10 cursor-pointer"><Trash2 size={15} /></button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-labbaik-text-muted">لا توجد بطاقات محفوظة بعد. تُحفظ البطاقة تلقائيًا عند أول شحن.</p>
              )}
            </Panel>

            <Panel>
              <h2 className="font-black text-neutral-900 dark:text-white">أسعار استخدام Meta لبيك</h2>
              <p className="mt-0.5 text-sm text-labbaik-text-muted">يُخصم السعر من المحفظة عند كل إرسال، ويُسترجع تلقائيًا إذا فشل الإرسال من Meta.</p>
              {(summary.pricingRules || []).length ? (
                <ul className="mt-3 divide-y divide-labbaik-border rounded-lg border border-labbaik-border">
                  {summary.pricingRules.map((rule: any) => (
                    <li key={rule.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                      <div>
                        <p className="text-sm font-bold text-neutral-900 dark:text-white">{rule.nameAr}</p>
                        <p className="text-xs text-labbaik-text-muted">{label(LABELS.usage, rule.usageType)}</p>
                      </div>
                      <span className="text-sm font-black tabular-nums text-neutral-900 dark:text-white">{formatSar(rule.priceSar, 4)}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="mt-2 text-sm text-labbaik-text-muted">لم تُحدد أسعار بعد.</p>}
            </Panel>
          </div>
        </div>
      )}

      {tab === 'history' && (
        <div className="space-y-4">
          <Panel>
            <h2 className="flex items-center gap-2 font-black text-neutral-900 dark:text-white mb-3"><ReceiptText size={17} /> حركة المحفظة</h2>
            <TransactionsTable rows={summary.transactions || []} />
          </Panel>
          <Panel>
            <h2 className="flex items-center gap-2 font-black text-neutral-900 dark:text-white mb-3"><CreditCard size={17} /> عمليات الدفع</h2>
            {summary.payments?.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[640px]">
                  <thead className="text-xs text-labbaik-text-muted">
                    <tr className="border-b border-labbaik-border">
                      <th className="text-right font-bold py-2">التاريخ</th><th className="text-right font-bold">النوع</th><th className="text-right font-bold">المبلغ</th><th className="text-right font-bold">الحالة</th><th className="text-right font-bold">مرجع ميسر</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.payments.map((p: any) => (
                      <tr key={p.id} className="border-b border-labbaik-border last:border-b-0">
                        <td className="py-2.5 tabular-nums text-labbaik-text-muted whitespace-nowrap">{formatDateTime(p.createdAt)}</td>
                        <td className="text-neutral-800 dark:text-neutral-100">{label(LABELS.paymentType, p.type)}</td>
                        <td className="font-bold tabular-nums text-neutral-900 dark:text-white whitespace-nowrap">{formatSar(p.amountMinor / 100)}</td>
                        <td><StatusPill tone={p.status === 'paid' ? 'ok' : p.status === 'failed' ? 'bad' : 'warn'}>{label(LABELS.paymentStatus, p.status)}</StatusPill></td>
                        <td className="text-xs text-labbaik-text-muted tabular-nums" dir="ltr" style={{ textAlign: 'right' }}>{p.providerPaymentId}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="text-sm text-labbaik-text-muted">لا توجد عمليات دفع بعد.</p>}
          </Panel>
        </div>
      )}

      {pendingPlan && (
        <ConfirmDialog
          title={`الاشتراك في ${pendingPlan.nameAr}`}
          confirmLabel={pendingPlan.monthlyPriceMinor > 0 ? `اشترك بـ ${formatSar(pendingPlan.monthlyPriceMinor / 100)} شهريًا` : 'تأكيد'}
          onCancel={() => setPendingPlan(null)}
          onConfirm={() => { const plan = pendingPlan; setPendingPlan(null); void subscribe(plan.id, plan.monthlyPriceMinor); }}
        >
          {pendingPlan.monthlyPriceMinor > 0 ? (
            defaultMethod
              ? <>سيُخصم <b className="tabular-nums">{formatSar(pendingPlan.monthlyPriceMinor / 100)}</b> من البطاقة <span dir="ltr" className="tabular-nums">•••• {toEnglishDigits(defaultMethod.lastFour)}</span>، ويتجدد الاشتراك شهريًا.</>
              : <>تحتاج بطاقة محفوظة أولًا. أضفها من «المحفظة والدفع».</>
          ) : <>سيتم تحويل اشتراكك إلى هذه الباقة.</>}
        </ConfirmDialog>
      )}
    </div>
  );
}

function Panel({ children }: { children: ReactNode }) {
  return <section className="rounded-xl border border-labbaik-border bg-labbaik-surface p-4">{children}</section>;
}

function Field({ label: text, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="text-xs font-bold text-labbaik-text-muted">{text}</label>
      {children}
    </div>
  );
}

function StatusPill({ tone, children }: { tone: 'ok' | 'warn' | 'bad'; children: ReactNode }) {
  const tones = {
    ok: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300',
    warn: 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
    bad: 'bg-red-500/15 text-red-800 dark:text-red-300',
  };
  return <span className={`inline-flex items-center gap-1 h-6 px-2 rounded-md text-[11px] font-bold ${tones[tone]}`}>{children}</span>;
}

function AmountInput({ id, value, onChange, disabled = false }: { id: string; value: number; onChange: (value: number) => void; disabled?: boolean }) {
  return (
    <div className="relative flex-1 min-w-28">
      <input
        id={id}
        type="number"
        dir="ltr"
        min={1}
        step="any"
        inputMode="decimal"
        disabled={disabled}
        value={Number.isFinite(value) ? value : ''}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`${inputClass} text-left tabular-nums pr-12 disabled:opacity-50`}
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-labbaik-text-muted">ر.س</span>
    </div>
  );
}

function QuickAmounts({ onPick }: { onPick: (value: number) => void }) {
  return (
    <div className="mt-2 flex gap-1.5">
      {[50, 100, 250, 500].map((amount) => (
        <button type="button" key={amount} onClick={() => onPick(amount)} className="h-7 px-2.5 rounded-md border border-labbaik-border text-xs font-bold tabular-nums text-labbaik-text-muted hover:text-labbaik-blue hover:border-labbaik-blue/40 cursor-pointer">
          {amount}
        </button>
      ))}
    </div>
  );
}

function TransactionsTable({ rows }: { rows: any[] }) {
  if (!rows.length) return <p className="text-sm text-labbaik-text-muted">لا توجد حركات بعد.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[600px]">
        <thead className="text-xs text-labbaik-text-muted">
          <tr className="border-b border-labbaik-border">
            <th className="text-right font-bold py-2">التاريخ</th><th className="text-right font-bold">العملية</th><th className="text-right font-bold">المبلغ</th><th className="text-right font-bold">الرصيد بعدها</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((tx: any) => {
            const debit = tx.type === 'debit';
            return (
              <tr key={tx.id} className="border-b border-labbaik-border last:border-b-0">
                <td className="py-2.5 tabular-nums text-labbaik-text-muted whitespace-nowrap">{formatDateTime(tx.createdAt)}</td>
                <td className="text-neutral-800 dark:text-neutral-100">{label(LABELS.txType, tx.type)} · <span className="text-labbaik-text-muted">{label(LABELS.txCategory, tx.category)}</span></td>
                <td className={`font-bold tabular-nums whitespace-nowrap ${debit ? 'text-red-700 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'}`} dir="ltr" style={{ textAlign: 'right' }}>{debit ? '−' : '+'}{formatSar(tx.amountSar, 4)}</td>
                <td className="tabular-nums text-neutral-800 dark:text-neutral-100 whitespace-nowrap">{formatSar(tx.balanceAfterSar, 4)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ConfirmDialog({ title, confirmLabel, children, onCancel, onConfirm }: { title: string; confirmLabel: string; children: ReactNode; onCancel: () => void; onConfirm: () => void }) {
  useEffect(() => {
    const esc = (event: KeyboardEvent) => { if (event.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onCancel]);
  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" dir="rtl">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div className="relative w-full max-w-md rounded-2xl border border-labbaik-border bg-labbaik-surface p-6 shadow-[0_24px_48px_-16px_rgba(15,10,30,0.45)] animate-slide-up">
        <h2 id="confirm-title" className="text-lg font-black text-neutral-900 dark:text-white">{title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-neutral-800 dark:text-neutral-100">{children}</p>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button type="button" onClick={onCancel} className="h-10 px-4 rounded-lg text-sm font-bold text-labbaik-text-muted hover:text-neutral-900 dark:hover:text-white cursor-pointer">إلغاء</button>
          <button type="button" onClick={onConfirm} autoFocus className={primaryButton}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

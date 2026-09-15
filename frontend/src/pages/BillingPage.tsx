import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  CreditCard,
  WalletCards,
  RefreshCcw,
  Trash2,
  Star,
  ShieldCheck,
  Zap,
  CheckCircle2,
  AlertTriangle,
  Plus,
  ReceiptText,
} from 'lucide-react';
import api from '../api/client';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { useToast } from '../components/Toast';

type Summary = any;

const formatSar = (value: number | string | null | undefined, digits = 2) =>
  `${Number(value || 0).toLocaleString('ar-SA', { minimumFractionDigits: digits, maximumFractionDigits: Math.max(digits, 6) })} ر.س`;

const paymentStatusLabel: Record<string, string> = {
  created: 'جديد', initiated: 'بانتظار الإكمال', paid: 'مدفوع', failed: 'فشل', refunded: 'مسترجع',
};

export default function BillingPage() {
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
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

  const load = async () => {
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
  };

  useEffect(() => {
    load().catch(() => showToast('تعذر تحميل بيانات الفوترة', 'error')).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const paymentId = searchParams.get('id') || searchParams.get('payment_id');
    if (!paymentId) return;
    setBusy(true);
    api.post('/billing/payments/verify', { paymentId })
      .then((res) => {
        if (res.data?.payment?.status === 'paid') showToast('تم تأكيد الدفع وتحديث حسابك بنجاح ✅', 'success');
        else showToast('عملية الدفع لم تكتمل بعد', 'error');
        return load();
      })
      .catch((error) => showToast(error?.response?.data?.message || 'تعذر التحقق من الدفع', 'error'))
      .finally(() => {
        setBusy(false);
        setSearchParams({}, { replace: true });
      });
  }, []);

  const defaultMethod = useMemo(() => summary?.paymentMethods?.find((m: any) => m.isDefault && m.status === 'active') || summary?.paymentMethods?.find((m: any) => m.status === 'active'), [summary]);

  const beginNewCardTopup = async () => {
    if (!summary?.moyasar?.configured) return showToast('بوابة ميسر غير مهيأة في السيرفر', 'error');
    if (!card.name || card.number.replace(/\D/g, '').length < 12 || !card.month || !card.year || !card.cvc) {
      return showToast('أكمل بيانات البطاقة', 'error');
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
        showToast('تم شحن المحفظة وحفظ البطاقة بنجاح ✅', 'success');
      } else if (payment?.source?.transaction_url) {
        window.location.href = payment.source.transaction_url;
      } else {
        throw new Error('لم ترجع ميسر رابط التحقق 3D Secure');
      }
    } catch (error: any) {
      showToast(error?.response?.data?.message || error.message || 'فشل شحن المحفظة', 'error');
    } finally {
      setBusy(false);
    }
  };

  const topupSavedCard = async () => {
    if (!defaultMethod) return showToast('لا توجد بطاقة محفوظة', 'error');
    setBusy(true);
    try {
      const { data } = await api.post('/billing/wallet/topups/saved-card', { paymentMethodId: defaultMethod.id, amountSar: Number(savedCardAmount) });
      if (data?.requiresRedirect && data.redirectUrl) window.location.href = data.redirectUrl;
      else {
        await load();
        showToast('تم شحن المحفظة بنجاح ✅', 'success');
      }
    } catch (error: any) {
      showToast(error?.response?.data?.message || 'تعذر شحن المحفظة', 'error');
    } finally {
      setBusy(false);
    }
  };

  const subscribe = async (planId: string, monthlyPriceMinor: number) => {
    if (monthlyPriceMinor > 0 && !defaultMethod) return showToast('احفظ بطاقة أولاً عبر شحن المحفظة', 'error');
    setBusy(true);
    try {
      const { data } = await api.post('/billing/subscription/subscribe', { planId, paymentMethodId: defaultMethod?.id });
      if (data?.requiresRedirect && data.redirectUrl) window.location.href = data.redirectUrl;
      else {
        await load();
        showToast('تم تحديث الاشتراك بنجاح ✅', 'success');
      }
    } catch (error: any) {
      showToast(error?.response?.data?.message || 'فشل تغيير الاشتراك', 'error');
    } finally { setBusy(false); }
  };

  const saveWalletSettings = async () => {
    setBusy(true);
    try {
      await api.patch('/billing/wallet/settings', walletSettings);
      await load();
      showToast('تم حفظ إعدادات المحفظة', 'success');
    } catch (error: any) {
      showToast(error?.response?.data?.message || 'تعذر حفظ إعدادات المحفظة', 'error');
    } finally { setBusy(false); }
  };

  const makeDefault = async (paymentMethodId: string) => {
    await api.post('/billing/payment-methods/default', { paymentMethodId });
    await load();
  };

  const removeMethod = async (id: string) => {
    if (!confirm('حذف وسيلة الدفع المحفوظة؟')) return;
    try { await api.delete(`/billing/payment-methods/${id}`); await load(); showToast('تم حذف البطاقة', 'success'); }
    catch (error: any) { showToast(error?.response?.data?.message || 'تعذر حذف البطاقة', 'error'); }
  };

  if (loading || !summary) return <div className="py-24 text-center text-neutral-400 font-bold">جاري تحميل الفوترة والمحفظة...</div>;

  const currentPlan = summary.subscription?.plan;
  const wallet = summary.wallet;

  return (
    <div className="space-y-8 pb-16" dir="rtl">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-neutral-900 dark:text-white">الباقات، الاشتراك والمحفظة</h1>
          <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">إدارة اشتراك لبيك ورصيد Meta لبيك وطرق الدفع المحفوظة.</p>
        </div>
        <Button variant="secondary" onClick={() => load()} disabled={busy}><RefreshCcw size={16}/> تحديث</Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card variant="labbaik" className="relative overflow-hidden">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-black text-neutral-500">رصيد محفظة Meta لبيك</p>
              <div className="text-3xl font-black mt-3 text-neutral-900 dark:text-white">{formatSar(wallet?.balanceSar)}</div>
            </div>
            <WalletCards className="text-labbaik-blue" size={38}/>
          </div>
          {Number(wallet?.balanceSar || 0) <= Number(wallet?.lowBalanceThresholdSar || 0) && (
            <div className="mt-5 flex gap-2 items-center text-amber-500 text-xs font-bold"><AlertTriangle size={16}/> الرصيد قريب من الحد المنخفض</div>
          )}
        </Card>
        <Card variant="labbaik">
          <p className="text-xs font-black text-neutral-500">الباقة الحالية</p>
          <div className="mt-3 flex items-center gap-2"><ShieldCheck className="text-emerald-500"/><span className="text-2xl font-black text-neutral-900 dark:text-white">{currentPlan?.nameAr || '-'}</span></div>
          <p className="text-xs text-neutral-500 mt-4">الحالة: <span className="font-black">{summary.subscription?.status}</span></p>
          <p className="text-xs text-neutral-500 mt-1">نهاية الفترة: {summary.subscription?.currentPeriodEnd ? new Date(summary.subscription.currentPeriodEnd).toLocaleDateString('ar-SA') : '-'}</p>
        </Card>
        <Card variant="labbaik">
          <p className="text-xs font-black text-neutral-500">وسيلة الدفع الافتراضية</p>
          {defaultMethod ? (
            <div className="mt-4">
              <div className="flex items-center gap-3 text-xl font-black"><CreditCard className="text-labbaik-blue"/> {String(defaultMethod.brand || 'CARD').toUpperCase()} •••• {defaultMethod.lastFour}</div>
              <p className="text-xs text-neutral-500 mt-3">{defaultMethod.expiryMonth}/{defaultMethod.expiryYear}</p>
            </div>
          ) : <p className="mt-4 text-sm text-amber-500 font-bold">لا توجد بطاقة محفوظة</p>}
        </Card>
      </div>

      <div className={`rounded-3xl border p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 ${currentPlan?.features?.metaLabbaik && defaultMethod && Number(wallet?.balanceSar || 0) > 0 ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-amber-500/20 bg-amber-500/5'}`}>
        <div>
          <div className="font-black text-sm">جاهزية Meta لبيك</div>
          <p className="text-xs text-neutral-500 mt-2 leading-6">
            الباقة {currentPlan?.features?.metaLabbaik ? '✅' : '❌'} · بطاقة محفوظة {defaultMethod ? '✅' : '❌'} · رصيد موجب {Number(wallet?.balanceSar || 0) > 0 ? '✅' : '❌'}
          </p>
        </div>
        <div className="text-xs font-black">{currentPlan?.features?.metaLabbaik && defaultMethod && Number(wallet?.balanceSar || 0) > 0 ? 'يمكن تفعيل Meta لبيك' : 'أكمل المتطلبات قبل تفعيل Meta لبيك'}</div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card variant="labbaik" className="space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div><h2 className="text-xl font-black">شحن المحفظة</h2><p className="text-xs text-neutral-500 mt-1">الرصيد يستخدم تلقائيًا عند الإرسال عبر Meta لبيك.</p></div>
            <Zap className="text-labbaik-blue"/>
          </div>
          {defaultMethod && (
            <div className="rounded-2xl border border-purple-100/70 dark:border-white/10 p-4 space-y-4">
              <div className="font-black text-sm">شحن سريع من البطاقة المحفوظة</div>
              <div className="flex gap-3">
                <input type="number" min="1" value={savedCardAmount} onChange={(e) => setSavedCardAmount(Number(e.target.value))} className="flex-1 bg-transparent border border-white/10 rounded-xl px-4 py-3"/>
                <Button onClick={topupSavedCard} disabled={busy}>شحن {formatSar(savedCardAmount)}</Button>
              </div>
            </div>
          )}
          <Button variant="secondary" onClick={() => setShowCardForm(v => !v)}><Plus size={16}/> {showCardForm ? 'إغلاق نموذج البطاقة' : defaultMethod ? 'استخدام بطاقة جديدة' : 'إضافة بطاقة وشحن الرصيد'}</Button>
          {showCardForm && (
            <div className="space-y-4 rounded-2xl bg-black/5 dark:bg-white/5 p-5">
              <div className="flex items-center gap-2 text-xs text-emerald-500 font-bold"><ShieldCheck size={15}/> بيانات البطاقة تُرسل مباشرة إلى ميسر ولا تمر على خادم لبيك.</div>
              <input placeholder="اسم حامل البطاقة" value={card.name} onChange={(e)=>setCard({...card,name:e.target.value})} className="w-full bg-transparent border border-white/10 rounded-xl px-4 py-3"/>
              <input inputMode="numeric" placeholder="رقم البطاقة" value={card.number} onChange={(e)=>setCard({...card,number:e.target.value})} className="w-full bg-transparent border border-white/10 rounded-xl px-4 py-3"/>
              <div className="grid grid-cols-3 gap-3">
                <input inputMode="numeric" placeholder="الشهر MM" value={card.month} onChange={(e)=>setCard({...card,month:e.target.value})} className="bg-transparent border border-white/10 rounded-xl px-4 py-3"/>
                <input inputMode="numeric" placeholder="السنة YY" value={card.year} onChange={(e)=>setCard({...card,year:e.target.value})} className="bg-transparent border border-white/10 rounded-xl px-4 py-3"/>
                <input inputMode="numeric" type="password" placeholder="CVC" value={card.cvc} onChange={(e)=>setCard({...card,cvc:e.target.value})} className="bg-transparent border border-white/10 rounded-xl px-4 py-3"/>
              </div>
              <div className="flex gap-3 items-center">
                <input type="number" min="1" value={topupAmount} onChange={(e)=>setTopupAmount(Number(e.target.value))} className="w-32 bg-transparent border border-white/10 rounded-xl px-4 py-3"/>
                <Button onClick={beginNewCardTopup} disabled={busy}>دفع وشحن {formatSar(topupAmount)}</Button>
              </div>
            </div>
          )}
        </Card>

        <Card variant="labbaik" className="space-y-5">
          <h2 className="text-xl font-black">الشحن التلقائي</h2>
          <label className="flex items-center gap-3 font-bold text-sm">
            <input type="checkbox" checked={walletSettings.autoRechargeEnabled} onChange={(e)=>setWalletSettings({...walletSettings,autoRechargeEnabled:e.target.checked})}/>
            اشحن المحفظة تلقائيًا من البطاقة الافتراضية عند انخفاض الرصيد
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="text-xs font-bold text-neutral-500">الشحن عند وصول الرصيد
              <input type="number" value={walletSettings.autoRechargeThresholdSar} onChange={(e)=>setWalletSettings({...walletSettings,autoRechargeThresholdSar:Number(e.target.value)})} className="mt-2 w-full bg-transparent border border-white/10 rounded-xl px-3 py-3 text-neutral-900 dark:text-white"/>
            </label>
            <label className="text-xs font-bold text-neutral-500">مبلغ الشحن التلقائي
              <input type="number" value={walletSettings.autoRechargeAmountSar} onChange={(e)=>setWalletSettings({...walletSettings,autoRechargeAmountSar:Number(e.target.value)})} className="mt-2 w-full bg-transparent border border-white/10 rounded-xl px-3 py-3 text-neutral-900 dark:text-white"/>
            </label>
            <label className="text-xs font-bold text-neutral-500">تنبيه انخفاض الرصيد
              <input type="number" value={walletSettings.lowBalanceThresholdSar} onChange={(e)=>setWalletSettings({...walletSettings,lowBalanceThresholdSar:Number(e.target.value)})} className="mt-2 w-full bg-transparent border border-white/10 rounded-xl px-3 py-3 text-neutral-900 dark:text-white"/>
            </label>
          </div>
          <Button onClick={saveWalletSettings} disabled={busy}>حفظ إعدادات المحفظة</Button>
        </Card>
      </div>

      <div>
        <h2 className="text-2xl font-black mb-4">الباقات</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {plans.map((plan:any) => {
            const active = currentPlan?.id === plan.id;
            return <Card key={plan.id} variant={active ? 'labbaik-selected' : 'labbaik'} className="space-y-5">
              <div className="flex items-center justify-between"><h3 className="text-xl font-black">{plan.nameAr}</h3>{active && <span className="text-xs font-black text-emerald-500 flex items-center gap-1"><CheckCircle2 size={15}/> الحالية</span>}</div>
              <div className="text-3xl font-black">{formatSar(plan.monthlyPriceMinor / 100)} <span className="text-xs text-neutral-500">/ شهريًا</span></div>
              <p className="text-xs text-neutral-500 min-h-10">{plan.description || 'باقة لبيك لإدارة التواصل والقنوات.'}</p>
              <div className="space-y-2 text-xs font-bold">
                <div>Meta لبيك: {plan.features?.metaLabbaik ? '✅' : '—'}</div>
                <div>الذكاء الاصطناعي: {plan.features?.ai ? '✅' : '—'}</div>
                <div>التدفقات: {plan.features?.flows ? '✅' : '—'}</div>
                <div>الرسائل الشهرية: {plan.limits?.monthlyMessages ?? 'غير محدود'}</div>
              </div>
              <Button isFullWidth disabled={active || busy} variant={active ? 'secondary' : 'primary'} onClick={()=>subscribe(plan.id, plan.monthlyPriceMinor)}>{active ? 'الباقة الحالية' : 'اختيار الباقة'}</Button>
            </Card>;
          })}
        </div>
      </div>

      <Card variant="labbaik" className="space-y-4">
        <h2 className="text-xl font-black flex items-center gap-2"><Zap/> أسعار استخدام Meta لبيك</h2>
        <p className="text-xs text-neutral-500">يخصم النظام السعر المقابل تلقائيًا من المحفظة عند الإرسال عبر خيار Meta لبيك. عند فشل Meta يتم رد عملية الخصم تلقائيًا.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {(summary.pricingRules || []).map((rule: any) => <div key={rule.id} className="rounded-2xl border border-purple-100/70 dark:border-white/10 p-4 flex items-center justify-between gap-4"><div><div className="font-black text-sm">{rule.nameAr}</div><div className="text-[11px] text-neutral-500 mt-1">{rule.usageType}</div></div><div className="font-black text-labbaik-blue">{formatSar(rule.priceSar, 6)}</div></div>)}
        </div>
      </Card>

      <Card variant="labbaik" className="space-y-4">
        <h2 className="text-xl font-black flex items-center gap-2"><CreditCard/> طرق الدفع المحفوظة</h2>
        {summary.paymentMethods?.length ? summary.paymentMethods.map((method:any)=><div key={method.id} className="flex flex-wrap items-center justify-between gap-4 p-4 border border-purple-100/70 dark:border-white/10 rounded-2xl">
          <div><div className="font-black">{String(method.brand || 'CARD').toUpperCase()} •••• {method.lastFour}</div><div className="text-xs text-neutral-500 mt-1">انتهاء {method.expiryMonth}/{method.expiryYear} · {method.status}</div></div>
          <div className="flex gap-2">{method.status === 'active' && !method.isDefault && <Button size="sm" variant="secondary" onClick={()=>makeDefault(method.id)}><Star size={14}/> افتراضية</Button>}<Button size="sm" variant="danger" onClick={()=>removeMethod(method.id)}><Trash2 size={14}/> حذف</Button></div>
        </div>) : <p className="text-sm text-neutral-500">لا توجد طرق دفع محفوظة بعد.</p>}
      </Card>

      <Card variant="labbaik" className="overflow-x-auto">
        <h2 className="text-xl font-black mb-5 flex items-center gap-2"><ReceiptText/> حركة المحفظة</h2>
        <table className="w-full text-sm min-w-[760px]">
          <thead className="text-neutral-500 text-xs"><tr><th className="text-right py-3">التاريخ</th><th className="text-right">النوع</th><th className="text-right">التصنيف</th><th className="text-right">المبلغ</th><th className="text-right">الرصيد بعد العملية</th></tr></thead>
          <tbody>{summary.transactions?.map((tx:any)=><tr key={tx.id} className="border-t border-purple-100/60 dark:border-white/10"><td className="py-4">{new Date(tx.createdAt).toLocaleString('ar-SA')}</td><td>{tx.type}</td><td>{tx.category}</td><td className={tx.type==='debit'?'text-red-500':'text-emerald-500'}>{tx.type==='debit'?'-':'+'}{formatSar(tx.amountSar, 4)}</td><td>{formatSar(tx.balanceAfterSar, 4)}</td></tr>)}</tbody>
        </table>
      </Card>

      <Card variant="labbaik" className="overflow-x-auto">
        <h2 className="text-xl font-black mb-5">عمليات الدفع</h2>
        <table className="w-full text-sm min-w-[760px]"><thead className="text-xs text-neutral-500"><tr><th className="text-right py-3">التاريخ</th><th className="text-right">النوع</th><th className="text-right">المبلغ</th><th className="text-right">الحالة</th><th className="text-right">مرجع ميسر</th></tr></thead><tbody>{summary.payments?.map((p:any)=><tr key={p.id} className="border-t border-purple-100/60 dark:border-white/10"><td className="py-4">{new Date(p.createdAt).toLocaleString('ar-SA')}</td><td>{p.type}</td><td>{formatSar(p.amountMinor/100)}</td><td>{paymentStatusLabel[p.status] || p.status}</td><td className="font-mono text-xs">{p.providerPaymentId}</td></tr>)}</tbody></table>
      </Card>
    </div>
  );
}

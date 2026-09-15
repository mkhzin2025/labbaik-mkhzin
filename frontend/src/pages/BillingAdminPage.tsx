import { useEffect, useState } from 'react';
import { BadgeDollarSign, Building2, RefreshCcw, Save, WalletCards, Settings2 } from 'lucide-react';
import api from '../api/client';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { useToast } from '../components/Toast';

const sar = (minor: number) => `${(Number(minor || 0) / 100).toLocaleString('ar-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س`;

const emptyPlan = {
  code: '', nameAr: '', description: '', monthlyPriceSar: 199, trialDays: 0,
  metaLabbaik: true, ownMeta: true, ai: true, flows: true, analytics: true,
  monthlyMessages: 10000, monthlyAiReplies: 3000, agents: 5, stores: 1, channels: 3,
};

export default function BillingAdminPage() {
  const { showToast } = useToast();
  const [plans, setPlans] = useState<any[]>([]);
  const [orgs, setOrgs] = useState<any[]>([]);
  const [rules, setRules] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [newPlan, setNewPlan] = useState<any>({ ...emptyPlan });
  const [adjust, setAdjust] = useState<Record<string, string>>({});

  const load = async () => {
    const [p, o, r] = await Promise.all([
      api.get('/billing/admin/plans'), api.get('/billing/admin/organizations'), api.get('/billing/admin/pricing-rules'),
    ]);
    setPlans(p.data || []); setOrgs(o.data || []); setRules(r.data || []);
  };
  useEffect(() => { load().catch((e) => showToast(e?.response?.data?.message || 'غير مصرح بإدارة الفوترة', 'error')); }, []);

  const patchPlan = (id: string, patch: Record<string, any>) => setPlans((current) => current.map((plan) => plan.id === id ? { ...plan, ...patch } : plan));
  const patchPlanLimits = (id: string, patch: Record<string, any>) => setPlans((current) => current.map((plan) => plan.id === id ? { ...plan, limits: { ...plan.limits, ...patch } } : plan));
  const patchPlanFeatures = (id: string, patch: Record<string, any>) => setPlans((current) => current.map((plan) => plan.id === id ? { ...plan, features: { ...plan.features, ...patch } } : plan));

  const savePlan = async (plan: any) => {
    setBusy(true);
    try {
      await api.patch(`/billing/admin/plans/${plan.id}`, {
        nameAr: plan.nameAr, description: plan.description || '', monthlyPriceMinor: Number(plan.monthlyPriceMinor),
        trialDays: Number(plan.trialDays || 0), isActive: plan.isActive, isPublic: plan.isPublic,
        features: plan.features || {}, limits: plan.limits || {},
      });
      await load(); showToast('تم حفظ الباقة', 'success');
    } catch (e: any) { showToast(e?.response?.data?.message || 'تعذر حفظ الباقة', 'error'); }
    finally { setBusy(false); }
  };

  const createPlan = async () => {
    if (!newPlan.code || !newPlan.nameAr) return showToast('كود واسم الباقة مطلوبان', 'error');
    setBusy(true);
    try {
      await api.post('/billing/admin/plans', {
        code: newPlan.code, nameAr: newPlan.nameAr, description: newPlan.description,
        monthlyPriceMinor: Math.round(Number(newPlan.monthlyPriceSar) * 100), currency: 'SAR', trialDays: Number(newPlan.trialDays || 0),
        features: { metaLabbaik: !!newPlan.metaLabbaik, ownMeta: !!newPlan.ownMeta, ai: !!newPlan.ai, flows: !!newPlan.flows, analytics: !!newPlan.analytics },
        limits: { monthlyMessages: Number(newPlan.monthlyMessages), monthlyAiReplies: Number(newPlan.monthlyAiReplies), agents: Number(newPlan.agents), stores: Number(newPlan.stores), channels: Number(newPlan.channels) },
      });
      setNewPlan({ ...emptyPlan }); await load(); showToast('تم إنشاء الباقة', 'success');
    } catch (e: any) { showToast(e?.response?.data?.message || 'تعذر إنشاء الباقة', 'error'); }
    finally { setBusy(false); }
  };

  const assign = async (orgId: string, planId: string) => {
    setBusy(true);
    try { await api.post('/billing/admin/subscriptions/assign', { organizationId: orgId, planId, status: 'active' }); await load(); showToast('تم ربط العميل بالباقة', 'success'); }
    catch (e: any) { showToast(e?.response?.data?.message || 'فشل ربط الباقة', 'error'); }
    finally { setBusy(false); }
  };

  const updateRule = async (rule: any) => {
    setBusy(true);
    try { await api.patch(`/billing/admin/pricing-rules/${rule.id}`, { priceSar: Number(rule.priceMicros) / 1_000_000, isActive: rule.isActive }); await load(); showToast('تم تحديث سعر الاستخدام', 'success'); }
    catch (e: any) { showToast(e?.response?.data?.message || 'فشل تحديث السعر', 'error'); }
    finally { setBusy(false); }
  };

  const adjustWallet = async (orgId: string) => {
    const amount = Number(adjust[orgId] || 0); if (!amount) return;
    setBusy(true);
    try { await api.post('/billing/admin/wallet/adjust', { organizationId: orgId, amountSar: amount, reason: 'Platform admin adjustment' }); setAdjust({ ...adjust, [orgId]: '' }); await load(); showToast('تم تعديل المحفظة', 'success'); }
    catch (e: any) { showToast(e?.response?.data?.message || 'فشل تعديل المحفظة', 'error'); }
    finally { setBusy(false); }
  };

  return <div className="space-y-8 pb-16" dir="rtl">
    <div className="flex items-end justify-between gap-4"><div><h1 className="text-3xl font-black">إدارة الباقات والاشتراكات</h1><p className="text-sm text-neutral-500 mt-2">لوحة لبيك الداخلية: الباقات، ربط العملاء، المحافظ وتسعير Meta لبيك.</p></div><Button variant="secondary" onClick={load}><RefreshCcw size={16}/> تحديث</Button></div>

    <Card variant="labbaik" className="space-y-5">
      <h2 className="text-xl font-black flex items-center gap-2"><BadgeDollarSign className="text-labbaik-blue"/> إنشاء باقة</h2>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <input placeholder="الكود starter" value={newPlan.code} onChange={e => setNewPlan({ ...newPlan, code: e.target.value })} className="bg-transparent border border-white/10 rounded-xl px-3 py-3"/>
        <input placeholder="اسم الباقة" value={newPlan.nameAr} onChange={e => setNewPlan({ ...newPlan, nameAr: e.target.value })} className="bg-transparent border border-white/10 rounded-xl px-3 py-3"/>
        <input placeholder="وصف الباقة" value={newPlan.description} onChange={e => setNewPlan({ ...newPlan, description: e.target.value })} className="bg-transparent border border-white/10 rounded-xl px-3 py-3"/>
        <input type="number" placeholder="السعر الشهري" value={newPlan.monthlyPriceSar} onChange={e => setNewPlan({ ...newPlan, monthlyPriceSar: Number(e.target.value) })} className="bg-transparent border border-white/10 rounded-xl px-3 py-3"/>
        <input type="number" placeholder="أيام التجربة" value={newPlan.trialDays} onChange={e => setNewPlan({ ...newPlan, trialDays: Number(e.target.value) })} className="bg-transparent border border-white/10 rounded-xl px-3 py-3"/>
        <input type="number" placeholder="الرسائل/شهر" value={newPlan.monthlyMessages} onChange={e => setNewPlan({ ...newPlan, monthlyMessages: Number(e.target.value) })} className="bg-transparent border border-white/10 rounded-xl px-3 py-3"/>
        <input type="number" placeholder="ردود AI/شهر" value={newPlan.monthlyAiReplies} onChange={e => setNewPlan({ ...newPlan, monthlyAiReplies: Number(e.target.value) })} className="bg-transparent border border-white/10 rounded-xl px-3 py-3"/>
        <input type="number" placeholder="الموظفين" value={newPlan.agents} onChange={e => setNewPlan({ ...newPlan, agents: Number(e.target.value) })} className="bg-transparent border border-white/10 rounded-xl px-3 py-3"/>
        <input type="number" placeholder="المتاجر" value={newPlan.stores} onChange={e => setNewPlan({ ...newPlan, stores: Number(e.target.value) })} className="bg-transparent border border-white/10 rounded-xl px-3 py-3"/>
        <input type="number" placeholder="القنوات" value={newPlan.channels} onChange={e => setNewPlan({ ...newPlan, channels: Number(e.target.value) })} className="bg-transparent border border-white/10 rounded-xl px-3 py-3"/>
      </div>
      <div className="flex flex-wrap gap-5 text-sm font-bold">
        {(['metaLabbaik','ownMeta','ai','flows','analytics'] as const).map((key) => <label key={key} className="flex gap-2 items-center"><input type="checkbox" checked={!!newPlan[key]} onChange={e => setNewPlan({ ...newPlan, [key]: e.target.checked })}/>{key === 'metaLabbaik' ? 'Meta لبيك' : key === 'ownMeta' ? 'Meta خاص' : key === 'ai' ? 'AI' : key === 'flows' ? 'التدفقات' : 'التحليلات'}</label>)}
      </div>
      <Button onClick={createPlan} disabled={busy}>إنشاء الباقة</Button>
    </Card>

    <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">{plans.map((plan: any) => <Card key={plan.id} variant="labbaik" className="space-y-4">
      <div className="flex justify-between gap-4"><input value={plan.nameAr} onChange={e => patchPlan(plan.id, { nameAr: e.target.value })} className="bg-transparent text-xl font-black border-b border-white/10 flex-1"/><span className="font-black text-labbaik-blue">{sar(plan.monthlyPriceMinor)}</span></div>
      <input value={plan.description || ''} onChange={e => patchPlan(plan.id, { description: e.target.value })} placeholder="وصف الباقة" className="w-full bg-transparent border border-white/10 rounded-xl p-3"/>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <label className="text-xs text-neutral-500">السعر بالهللة<input type="number" value={plan.monthlyPriceMinor} onChange={e => patchPlan(plan.id, { monthlyPriceMinor: Number(e.target.value) })} className="mt-2 w-full bg-transparent border border-white/10 rounded-xl p-3"/></label>
        <label className="text-xs text-neutral-500">أيام التجربة<input type="number" value={plan.trialDays || 0} onChange={e => patchPlan(plan.id, { trialDays: Number(e.target.value) })} className="mt-2 w-full bg-transparent border border-white/10 rounded-xl p-3"/></label>
        <label className="text-xs text-neutral-500">الرسائل/شهر<input type="number" value={plan.limits?.monthlyMessages || 0} onChange={e => patchPlanLimits(plan.id, { monthlyMessages: Number(e.target.value) })} className="mt-2 w-full bg-transparent border border-white/10 rounded-xl p-3"/></label>
        <label className="text-xs text-neutral-500">ردود AI/شهر<input type="number" value={plan.limits?.monthlyAiReplies || 0} onChange={e => patchPlanLimits(plan.id, { monthlyAiReplies: Number(e.target.value) })} className="mt-2 w-full bg-transparent border border-white/10 rounded-xl p-3"/></label>
        <label className="text-xs text-neutral-500">الموظفين<input type="number" value={plan.limits?.agents || 0} onChange={e => patchPlanLimits(plan.id, { agents: Number(e.target.value) })} className="mt-2 w-full bg-transparent border border-white/10 rounded-xl p-3"/></label>
        <label className="text-xs text-neutral-500">المتاجر<input type="number" value={plan.limits?.stores || 0} onChange={e => patchPlanLimits(plan.id, { stores: Number(e.target.value) })} className="mt-2 w-full bg-transparent border border-white/10 rounded-xl p-3"/></label>
        <label className="text-xs text-neutral-500">القنوات<input type="number" value={plan.limits?.channels || 0} onChange={e => patchPlanLimits(plan.id, { channels: Number(e.target.value) })} className="mt-2 w-full bg-transparent border border-white/10 rounded-xl p-3"/></label>
      </div>
      <div className="flex flex-wrap gap-4 text-sm font-bold">
        {[['metaLabbaik','Meta لبيك'],['ownMeta','Meta خاص'],['ai','AI'],['flows','التدفقات'],['analytics','التحليلات']].map(([key,label]) => <label key={key}><input type="checkbox" checked={!!plan.features?.[key]} onChange={e => patchPlanFeatures(plan.id, { [key]: e.target.checked })}/> {label}</label>)}
        <label><input type="checkbox" checked={!!plan.isActive} onChange={e => patchPlan(plan.id, { isActive: e.target.checked })}/> فعالة</label>
        <label><input type="checkbox" checked={!!plan.isPublic} onChange={e => patchPlan(plan.id, { isPublic: e.target.checked })}/> ظاهرة للعملاء</label>
      </div>
      <Button onClick={() => savePlan(plan)} disabled={busy}><Save size={15}/> حفظ</Button>
    </Card>)}</div>

    <Card variant="labbaik" className="overflow-x-auto"><h2 className="text-xl font-black mb-5 flex items-center gap-2"><Building2/> العملاء والاشتراكات</h2><table className="w-full min-w-[1000px] text-sm"><thead className="text-neutral-500 text-xs"><tr><th className="text-right py-3">المنظمة</th><th className="text-right">الباقة</th><th className="text-right">الحالة</th><th className="text-right">المحفظة</th><th className="text-right">بطاقات</th><th className="text-right">ربط باقة</th><th className="text-right">تعديل المحفظة</th></tr></thead><tbody>{orgs.map((row: any) => <tr key={row.organization.id} className="border-t border-white/10"><td className="py-4 font-black">{row.organization.name}</td><td>{row.subscription?.plan?.nameAr}</td><td>{row.subscription?.status}</td><td className={Number(row.wallet?.balanceSar || 0) < 0 ? 'text-red-500 font-black' : ''}>{Number(row.wallet?.balanceSar || 0).toFixed(4)} ر.س</td><td>{row.activePaymentMethods}</td><td><select value={row.subscription?.planId || ''} onChange={e => assign(row.organization.id, e.target.value)} className="bg-labbaik-surface border border-white/10 rounded-lg p-2">{plans.map((p: any) => <option key={p.id} value={p.id}>{p.nameAr}</option>)}</select></td><td><div className="flex gap-2"><input placeholder="+/- ر.س" value={adjust[row.organization.id] || ''} onChange={e => setAdjust({ ...adjust, [row.organization.id]: e.target.value })} className="w-24 bg-transparent border border-white/10 rounded-lg px-2"/><Button size="sm" variant="secondary" onClick={() => adjustWallet(row.organization.id)}><WalletCards size={14}/></Button></div></td></tr>)}</tbody></table></Card>

    <Card variant="labbaik" className="space-y-5"><h2 className="text-xl font-black flex items-center gap-2"><Settings2/> تسعير استخدام Meta لبيك</h2><p className="text-xs text-amber-500 font-bold">هذه أسعار لبيك الداخلية التي تخصم من المحفظة، وليست جدول أسعار Meta الرسمي. اضبطها حسب نموذجك التجاري قبل Production.</p><div className="grid grid-cols-1 md:grid-cols-2 gap-4">{rules.map((rule: any) => <div key={rule.id} className="p-4 border border-white/10 rounded-2xl flex items-center gap-3"><div className="flex-1"><div className="font-black text-sm">{rule.nameAr}</div><div className="text-xs text-neutral-500 mt-1">{rule.usageType}</div></div><input type="number" step="0.000001" value={Number(rule.priceMicros) / 1_000_000} onChange={e => setRules(rules.map(x => x.id === rule.id ? { ...x, priceMicros: Number(e.target.value) * 1_000_000 } : x))} className="w-28 bg-transparent border border-white/10 rounded-lg p-2"/><label className="text-xs"><input type="checkbox" checked={rule.isActive} onChange={e => setRules(rules.map(x => x.id === rule.id ? { ...x, isActive: e.target.checked } : x))}/> فعال</label><Button size="sm" onClick={() => updateRule(rule)}><Save size={14}/></Button></div>)}</div></Card>
  </div>;
}

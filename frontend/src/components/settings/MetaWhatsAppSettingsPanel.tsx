import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, CheckCircle2, Clipboard, Cloud, CreditCard, Loader2, Network, RefreshCw, Save, ShieldCheck, WalletCards, Webhook, XCircle } from 'lucide-react';
import api from '../../api/client';
import { useToast } from '../Toast';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import BranchSelector from '../customers/BranchSelector';
import type { Branch } from '../customers/BranchSelector';

type ConnectionScope = 'organization' | 'store';
type MetaConnection = {
  id?: string;
  scope: ConnectionScope;
  storeId?: string | null;
  defaultStoreId?: string | null;
  inboundRouting?: 'last_customer_store' | 'default_store';
  mode: 'shared_app' | 'own_app';
  appId?: string;
  appSecret?: string;
  wabaId: string;
  phoneNumberId: string;
  displayPhoneNumber?: string;
  accessToken: string;
  verifyToken?: string;
  webhookUrl?: string;
  status?: 'draft' | 'connected' | 'error';
  lastError?: string;
  webhookSubscribedAt?: string;
  lastWebhookAt?: string;
  templatesSyncedAt?: string;
  graphApiVersion?: string;
};

const blank = (scope: ConnectionScope, storeId?: string): MetaConnection => ({
  scope,
  storeId: scope === 'store' ? storeId : null,
  defaultStoreId: scope === 'organization' ? storeId : storeId,
  inboundRouting: 'last_customer_store',
  mode: 'shared_app',
  appId: '', appSecret: '', wabaId: '', phoneNumberId: '', displayPhoneNumber: '', accessToken: '',
});

export default function MetaWhatsAppSettingsPanel() {
  const { showToast } = useToast();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [scope, setScope] = useState<ConnectionScope>('organization');
  const [storeId, setStoreId] = useState('');
  const [connection, setConnection] = useState<MetaConnection>(blank('organization'));
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<string | null>(null);

  useEffect(() => { void loadBranches(); }, []);
  useEffect(() => { if (branches.length && (scope === 'organization' || storeId)) void load(); }, [scope, storeId]);

  const loadBranches = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/stores');
      const rows: Branch[] = data || [];
      setBranches(rows);
      const saved = localStorage.getItem('active_store_id');
      setStoreId(rows.some((row) => row.id === saved) ? saved! : rows[0]?.id || '');
      if (!rows.length) setLoading(false);
    } catch { setLoading(false); }
  };

  const load = async () => {
    setLoading(true);
    try {
      const params: any = { scope };
      if (scope === 'store') params.storeId = storeId;
      const { data } = await api.get('/integrations/meta/whatsapp', { params });
      setConnection(data || blank(scope, storeId));
    } catch {
      setConnection(blank(scope, storeId));
    } finally { setLoading(false); }
  };

  const save = async () => {
    if (!connection.wabaId || !connection.phoneNumberId || (!connection.id && !connection.accessToken)) {
      showToast('WABA ID و Phone Number ID و Access Token مطلوبة.', 'error'); return;
    }
    setAction('save');
    try {
      const payload: any = {
        scope,
        mode: connection.mode,
        inboundRouting: connection.inboundRouting || 'last_customer_store',
        appId: connection.appId || undefined,
        appSecret: connection.appSecret || undefined,
        wabaId: connection.wabaId,
        phoneNumberId: connection.phoneNumberId,
        displayPhoneNumber: connection.displayPhoneNumber || undefined,
        accessToken: connection.accessToken || undefined,
      };
      if (scope === 'store') payload.storeId = storeId;
      else payload.defaultStoreId = connection.defaultStoreId || storeId;
      const { data } = connection.id ? await api.patch('/integrations/meta/whatsapp', payload) : await api.post('/integrations/meta/whatsapp', payload);
      setConnection(data);
      showToast(scope === 'organization' ? 'تم حفظ رقم واتساب الموحد للمنظمة.' : 'تم حفظ رقم واتساب الخاص بالفرع.', 'success');
    } catch (error: any) { showToast(error?.response?.data?.message || 'فشل حفظ إعدادات Meta.', 'error'); }
    finally { setAction(null); }
  };

  const runAction = async (name: 'test' | 'subscribe' | 'sync') => {
    if (!connection.id) return showToast('احفظ الإعدادات أولاً.', 'info');
    setAction(name);
    try {
      const params = { connectionId: connection.id };
      if (name === 'test') await api.post('/integrations/meta/whatsapp/test', null, { params });
      if (name === 'subscribe') await api.post('/integrations/meta/whatsapp/subscribe-webhook', null, { params });
      if (name === 'sync') await api.post('/integrations/meta/whatsapp/templates/sync', null, { params });
      await load();
      showToast(name === 'test' ? 'الاتصال مع Meta سليم ✅' : name === 'subscribe' ? 'تم تفعيل Webhook ✅' : 'تم تحديث القوالب ✅', 'success');
    } catch (error: any) { showToast(error?.response?.data?.message || 'فشلت العملية.', 'error'); }
    finally { setAction(null); }
  };

  const copy = async (value?: string) => { if (!value) return; await navigator.clipboard.writeText(value); showToast('تم النسخ.', 'info'); };
  if (loading) return <div className="min-h-72 flex items-center justify-center"><Loader2 className="animate-spin text-labbaik-blue" size={36} /></div>;
  const connected = connection.status === 'connected';

  return <div className="lg:col-span-3 space-y-8">
    <Card variant="labbaik" className="space-y-7">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-green-500/10 border border-green-500/20 flex items-center justify-center">
            <Cloud className="text-green-600 dark:text-green-400" />
          </div>
          <div>
            <h3 className="text-xl font-black text-neutral-900 dark:text-white">Meta WhatsApp Cloud API</h3>
            <p className="text-neutral-600 dark:text-neutral-400 text-xs mt-1">يمكن ربط رقم موحد للمنظمة كلها أو رقم مستقل لفرع محدد.</p>
          </div>
        </div>
        <div className={`flex items-center gap-2 rounded-full px-4 py-2 text-xs font-black border ${connected ? 'border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400' : connection.status === 'error' ? 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-300' : 'border-neutral-200 dark:border-white/10 bg-neutral-100 dark:bg-white/5 text-neutral-600 dark:text-neutral-400'}`}>
          {connected ? <CheckCircle2 size={15} /> : connection.status === 'error' ? <XCircle size={15} /> : <ShieldCheck size={15} />}
          {connected ? 'متصل' : connection.status === 'error' ? 'خطأ في الربط' : 'غير مختبر'}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 rounded-3xl border border-labbaik-blue/20 bg-labbaik-blue/5 p-3">
        <button
          type="button"
          onClick={() => setScope('organization')}
          className={`rounded-2xl p-5 text-right border transition cursor-pointer ${
            scope === 'organization'
              ? 'border-labbaik-blue bg-labbaik-blue/15 shadow-sm'
              : 'border-neutral-200/80 dark:border-white/5 bg-white dark:bg-black/10 hover:border-labbaik-blue/30'
          }`}
        >
          <Network className="text-labbaik-blue mb-2" size={20} />
          <div className="font-black text-neutral-900 dark:text-white">المنظمة كاملة</div>
          <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-1">رقم واحد يرسل لكل الفروع، وقائمة إرسال موحدة مع حذف التكرار.</p>
        </button>
        <button
          type="button"
          onClick={() => setScope('store')}
          className={`rounded-2xl p-5 text-right border transition cursor-pointer ${
            scope === 'store'
              ? 'border-labbaik-blue bg-labbaik-blue/15 shadow-sm'
              : 'border-neutral-200/80 dark:border-white/5 bg-white dark:bg-black/10 hover:border-labbaik-blue/30'
          }`}
        >
          <Building2 className="text-labbaik-blue mb-2" size={20} />
          <div className="font-black text-neutral-900 dark:text-white">فرع محدد</div>
          <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-1">رقم واتساب مستقل للفرع فقط.</p>
        </button>
      </div>

      {scope === 'store' && branches.length > 0 && (
        <div className="rounded-3xl border border-neutral-200/80 dark:border-white/10 bg-neutral-50 dark:bg-white/5 p-5 flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-black text-neutral-900 dark:text-white">الفرع المرتبط بالرقم</div>
            <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-1">القوالب والرسائل لهذا الفرع.</p>
          </div>
          <BranchSelector branches={branches} value={storeId} onChange={(id) => { localStorage.setItem('active_store_id', id); setStoreId(id); }} />
        </div>
      )}

      {scope === 'organization' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 rounded-3xl border border-purple-500/20 bg-purple-500/5 p-5">
          <div className="space-y-2">
            <label className="text-xs font-black text-neutral-700 dark:text-neutral-300 px-1 block">الفرع الافتراضي للرسائل الجديدة</label>
            <select
              value={connection.defaultStoreId || storeId}
              onChange={(e) => setConnection({ ...connection, defaultStoreId: e.target.value })}
              className="w-full bg-white dark:bg-neutral-900 border border-purple-200 dark:border-white/10 rounded-2xl py-4 px-5 text-sm text-neutral-900 dark:text-white font-bold outline-none focus:ring-2 focus:ring-labbaik-blue/40 shadow-sm"
            >
              {branches.map((branch) => (
                <option className="bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white" key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-black text-neutral-700 dark:text-neutral-300 px-1 block">توجيه الرسائل الواردة</label>
            <select
              value={connection.inboundRouting || 'last_customer_store'}
              onChange={(e) => setConnection({ ...connection, inboundRouting: e.target.value as any })}
              className="w-full bg-white dark:bg-neutral-900 border border-purple-200 dark:border-white/10 rounded-2xl py-4 px-5 text-sm text-neutral-900 dark:text-white font-bold outline-none focus:ring-2 focus:ring-labbaik-blue/40 shadow-sm"
            >
              <option className="bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white" value="last_customer_store">
                آخر فرع تعامل معه العميل ثم الفرع الافتراضي
              </option>
              <option className="bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white" value="default_store">
                دائمًا إلى الفرع الافتراضي
              </option>
            </select>
          </div>
        </div>
      )}

      {connection.lastError && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm font-bold text-red-600 dark:text-red-200">
          {connection.lastError}
        </div>
      )}

      {connection.mode === 'shared_app' && (
        <div className="rounded-3xl border border-amber-500/20 bg-amber-500/5 p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex gap-3">
            <WalletCards className="text-amber-500 dark:text-amber-400 shrink-0" size={21} />
            <div>
              <div className="text-sm font-black text-neutral-900 dark:text-white">Meta لبيك</div>
              <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-1">يلزم باقة فعالة، بطاقة محفوظة ورصيد موجب بالمحفظة.</p>
            </div>
          </div>
          <Link to="/dashboard/billing" className="inline-flex items-center gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs font-black text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 transition-colors">
            <CreditCard size={16} /> الباقة والمحفظة
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Field label="طريقة الربط">
          <select
            value={connection.mode}
            onChange={(e) => setConnection({ ...connection, mode: e.target.value as any })}
            className="field"
          >
            <option className="bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white" value="shared_app">تطبيق لبيك المشترك</option>
            <option className="bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white" value="own_app">Meta App خاصة بالمنظمة</option>
          </select>
        </Field>
        <Field label="WABA ID">
          <input
            value={connection.wabaId}
            onChange={(e) => setConnection({ ...connection, wabaId: e.target.value })}
            className="field"
            placeholder="مثال: 104829104829104"
          />
        </Field>
        <Field label="Phone Number ID">
          <input
            value={connection.phoneNumberId}
            onChange={(e) => setConnection({ ...connection, phoneNumberId: e.target.value })}
            className="field"
            placeholder="مثال: 109384729182736"
          />
        </Field>
        <Field label="رقم واتساب الظاهر">
          <input
            value={connection.displayPhoneNumber || ''}
            onChange={(e) => setConnection({ ...connection, displayPhoneNumber: e.target.value })}
            className="field"
            placeholder="+9665xxxxxxxx"
            dir="ltr"
          />
        </Field>
      </div>

      {connection.mode === 'own_app' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field label="Meta App ID">
            <input
              value={connection.appId || ''}
              onChange={(e) => setConnection({ ...connection, appId: e.target.value })}
              className="field"
            />
          </Field>
          <Field label="Meta App Secret">
            <input
              type="password"
              value={connection.appSecret || ''}
              onChange={(e) => setConnection({ ...connection, appSecret: e.target.value })}
              className="field"
              placeholder={connection.id ? '********' : ''}
            />
          </Field>
        </div>
      )}

      <Field label="Access Token">
        <textarea
          value={connection.accessToken}
          onChange={(e) => setConnection({ ...connection, accessToken: e.target.value })}
          className="field h-28 resize-none font-mono text-xs"
          placeholder={connection.id ? '********' : 'EAAB...'}
        />
      </Field>

      <div className="flex flex-wrap gap-3">
        <Button variant="primary" size="md" onClick={save} disabled={!!action}>
          {action === 'save' ? <Loader2 className="animate-spin" size={17} /> : <Save size={17} />} حفظ
        </Button>
        <Button variant="secondary" size="md" onClick={() => runAction('test')} disabled={!!action}>
          <ShieldCheck size={17} /> اختبار
        </Button>
        <Button variant="secondary" size="md" onClick={() => runAction('subscribe')} disabled={!!action}>
          <Webhook size={17} /> Webhook
        </Button>
        <Button variant="secondary" size="md" onClick={() => runAction('sync')} disabled={!!action}>
          <RefreshCw size={17} /> القوالب
        </Button>
      </div>

      <style>{`
        .field {
          width: 100%;
          border-radius: 1rem;
          padding: 0.875rem 1.25rem;
          font-size: 0.875rem;
          font-weight: 700;
          transition: all 0.2s;
          outline: none;
        }
        :root[data-theme="light"] .field,
        .field {
          background: #ffffff;
          border: 1px solid rgba(100, 59, 137, 0.2);
          color: #1e293b;
          box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
        }
        :root[data-theme="dark"] .field,
        .dark .field {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #ffffff;
          box-shadow: none;
        }
        .field:focus {
          border-color: #643B89;
          box-shadow: 0 0 0 3px rgba(100, 59, 137, 0.2);
        }
      `}</style>
    </Card>

    {connection.id && (
      <Card variant="labbaik" className="space-y-5">
        <div>
          <h3 className="text-lg font-black text-neutral-900 dark:text-white flex items-center gap-2">
            <Webhook className="text-labbaik-blue" size={20} /> Webhook {scope === 'organization' ? 'المنظمة' : 'الفرع'}
          </h3>
          <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-1">عنوان مستقل لهذا الاتصال.</p>
        </div>
        <ReadonlySecret label="Callback URL" value={connection.webhookUrl} onCopy={copy} />
        <ReadonlySecret label="Verify Token" value={connection.verifyToken} onCopy={copy} />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <Info label="Graph API" value={connection.graphApiVersion || '-'} />
          <Info label="آخر Webhook" value={connection.lastWebhookAt ? new Date(connection.lastWebhookAt).toLocaleString('ar-SA') : 'لم يصل بعد'} />
          <Info label="آخر مزامنة" value={connection.templatesSyncedAt ? new Date(connection.templatesSyncedAt).toLocaleString('ar-SA') : 'لم تتم'} />
        </div>
      </Card>
    )}
  </div>;
}

function Field({ label, children }: any) {
  return (
    <div className="space-y-2">
      <label className="text-xs font-black text-neutral-700 dark:text-neutral-300 px-1 block">{label}</label>
      {children}
    </div>
  );
}

function ReadonlySecret({ label, value, onCopy }: { label: string; value?: string; onCopy: (value?: string) => void }) {
  return (
    <div className="space-y-2">
      <label className="text-xs font-black text-neutral-700 dark:text-neutral-300 px-1 block">{label}</label>
      <div className="flex gap-2">
        <code dir="ltr" className="flex-1 bg-neutral-100 dark:bg-black/20 border border-neutral-200 dark:border-white/5 rounded-2xl p-4 text-xs text-labbaik-blue font-bold break-all text-left">
          {value || '-'}
        </code>
        <button
          type="button"
          onClick={() => onCopy(value)}
          className="w-12 rounded-2xl bg-white dark:bg-white/5 border border-neutral-200 dark:border-white/10 flex items-center justify-center text-neutral-600 dark:text-neutral-300 hover:text-labbaik-blue transition-colors cursor-pointer shadow-sm"
          title="نسخ"
        >
          <Clipboard size={17} />
        </button>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-neutral-50 dark:bg-white/5 border border-neutral-200/80 dark:border-white/10 p-4">
      <div className="text-neutral-600 dark:text-neutral-400 font-bold mb-1">{label}</div>
      <div className="text-neutral-900 dark:text-white font-black">{value}</div>
    </div>
  );
}

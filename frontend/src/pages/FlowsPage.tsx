import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/client';
import { GitBranch, Loader2, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ar } from 'date-fns/locale';
import { toEnglishDigits } from '@/lib/utils';
import { useToast } from '../components/Toast';

interface Flow {
  id: string;
  name: string;
  isDefault: boolean;
  isActive: boolean;
  updatedAt: string;
}

const errorMessage = (error: unknown, fallback: string) =>
  (error as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;

export default function FlowsPage() {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const navigate = useNavigate();
  const { showToast } = useToast();

  const fetchFlows = useCallback(async () => {
    try {
      const { data } = await api.get<Flow[]>('/flows');
      setFlows(Array.isArray(data) ? data : []);
    } catch (error) {
      showToast(errorMessage(error, 'تعذر تحميل التدفقات.'), 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { void fetchFlows(); }, [fetchFlows]);

  const createNewFlow = async () => {
    setCreating(true);
    try {
      const { data } = await api.post('/flows', {
        name: 'تدفق جديد',
        nodes: [{ id: 'start', type: 'start', position: { x: 100, y: 100 }, data: { text: 'مرحباً بك!', isStart: true } }],
        edges: [],
      });
      navigate(`/dashboard/flows/${data.id}`);
    } catch (error) {
      showToast(errorMessage(error, 'تعذر إنشاء التدفق.'), 'error');
      setCreating(false);
    }
  };

  const setAsDefault = async (flow: Flow) => {
    setBusyId(flow.id);
    try {
      await api.patch(`/flows/${flow.id}`, { isDefault: true });
      setFlows((current) => current.map((f) => ({ ...f, isDefault: f.id === flow.id })));
      showToast(`«${flow.name}» أصبح التدفق الأساسي.${flow.isActive ? '' : ' فعّله ليبدأ العمل.'}`, 'success');
    } catch (error) {
      showToast(errorMessage(error, 'تعذر تعيين التدفق كأساسي.'), 'error');
    } finally {
      setBusyId(null);
    }
  };

  const toggleActive = async (flow: Flow) => {
    setBusyId(flow.id);
    try {
      await api.patch(`/flows/${flow.id}`, { isActive: !flow.isActive });
      setFlows((current) => current.map((f) => (f.id === flow.id ? { ...f, isActive: !flow.isActive } : f)));
    } catch (error) {
      showToast(errorMessage(error, 'تعذر تحديث حالة التدفق.'), 'error');
    } finally {
      setBusyId(null);
    }
  };

  const deleteFlow = async (flow: Flow) => {
    setBusyId(flow.id);
    try {
      await api.delete(`/flows/${flow.id}`);
      setFlows((current) => current.filter((f) => f.id !== flow.id));
      setConfirmDelete(null);
      showToast(`تم حذف «${flow.name}».`, 'success');
    } catch (error) {
      showToast(errorMessage(error, 'تعذر حذف التدفق.'), 'error');
    } finally {
      setBusyId(null);
    }
  };

  const defaultFlow = flows.find((f) => f.isDefault);

  return (
    <div className="max-w-5xl space-y-4 pb-10" dir="rtl">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black text-neutral-900 dark:text-white">
            التدفقات
            <span className="h-5 px-1.5 rounded bg-labbaik-blue/10 text-[11px] font-bold leading-5 text-labbaik-blue dark:text-purple-300">تجريبي</span>
          </h1>
          <p className="mt-1 text-sm text-labbaik-text-muted">مسارات ردود آلية بأزرار وخيارات ثابتة، بدون ذكاء اصطناعي.</p>
        </div>
        <button
          type="button"
          onClick={() => void createNewFlow()}
          disabled={creating}
          className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-lg bg-labbaik-blue text-labbaik-on-accent text-sm font-black hover:bg-[#553174] disabled:opacity-50 cursor-pointer"
        >
          {creating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} تدفق جديد
        </button>
      </div>

      {!loading && flows.length > 0 && (
        <p className={`rounded-lg px-3 py-2.5 text-sm ${defaultFlow?.isActive ? 'bg-emerald-500/10 text-emerald-900 dark:text-emerald-200' : 'bg-amber-500/15 text-amber-900 dark:text-amber-200'}`}>
          {defaultFlow
            ? defaultFlow.isActive
              ? <>يبدأ <b>«{defaultFlow.name}»</b> تلقائيًا مع كل محادثة جديدة.</>
              : <>التدفق الأساسي <b>«{defaultFlow.name}»</b> متوقف، فلن يبدأ مع المحادثات الجديدة حتى تفعّله.</>
            : 'لا يوجد تدفق أساسي. عيّن تدفقًا كأساسي ليبدأ تلقائيًا مع كل محادثة جديدة.'}
        </p>
      )}

      {loading ? (
        <div className="rounded-xl border border-labbaik-border bg-labbaik-surface divide-y divide-labbaik-border" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-4">
              <div className="h-9 w-9 rounded-lg bg-labbaik-page animate-pulse" />
              <div className="space-y-2"><div className="h-3.5 w-40 rounded bg-labbaik-page animate-pulse" /><div className="h-3 w-24 rounded bg-labbaik-page animate-pulse" /></div>
              <div className="ms-auto h-6 w-11 rounded-full bg-labbaik-page animate-pulse" />
            </div>
          ))}
        </div>
      ) : flows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-labbaik-border py-14 px-6 text-center">
          <GitBranch size={32} strokeWidth={1.5} className="mx-auto text-labbaik-text-muted" />
          <p className="mt-3 font-bold text-neutral-800 dark:text-neutral-100">لا توجد تدفقات بعد</p>
          <p className="mt-1 text-sm text-labbaik-text-muted">ابدأ بتدفق ترحيبي يعرض على العميل خيارات مثل «حالة الطلب» و«التحدث مع موظف».</p>
          <button type="button" onClick={() => void createNewFlow()} disabled={creating} className="mt-4 inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-labbaik-blue text-labbaik-on-accent text-sm font-black hover:bg-[#553174] disabled:opacity-50 cursor-pointer">
            <Plus size={16} /> إنشاء أول تدفق
          </button>
        </div>
      ) : (
        <ul className="rounded-xl border border-labbaik-border bg-labbaik-surface divide-y divide-labbaik-border">
          {flows.map((flow) => {
            const busy = busyId === flow.id;
            return (
              <li key={flow.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${flow.isActive ? 'bg-labbaik-blue/10 text-labbaik-blue dark:text-purple-300' : 'bg-labbaik-page text-labbaik-text-muted'}`}>
                  <GitBranch size={17} />
                </span>
                <div className="flex-1 min-w-40">
                  <div className="flex items-center gap-2">
                    <Link to={`/dashboard/flows/${flow.id}`} className="font-bold text-neutral-900 dark:text-white hover:text-labbaik-blue truncate">{flow.name}</Link>
                    {flow.isDefault && (
                      <span className="inline-flex items-center gap-1 h-5 px-1.5 rounded bg-emerald-500/15 text-[11px] font-bold text-emerald-800 dark:text-emerald-300">
                        <Star size={11} className="fill-current" /> الأساسي
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-labbaik-text-muted">
                    {flow.isActive ? 'مفعّل' : 'متوقف'} · عُدّل {toEnglishDigits(formatDistanceToNow(new Date(flow.updatedAt), { addSuffix: true, locale: ar }))}
                  </p>
                </div>

                <div className="flex items-center gap-1">
                  {confirmDelete === flow.id ? (
                    <>
                      <span className="text-xs text-labbaik-text-muted me-1">حذف نهائي؟</span>
                      <button type="button" disabled={busy} onClick={() => void deleteFlow(flow)} className="h-8 px-2.5 rounded-md bg-red-600 text-white text-xs font-black hover:bg-red-700 disabled:opacity-50 cursor-pointer">حذف</button>
                      <button type="button" onClick={() => setConfirmDelete(null)} className="h-8 px-2 rounded-md text-xs font-bold text-labbaik-text-muted hover:text-neutral-900 dark:hover:text-white cursor-pointer">إلغاء</button>
                    </>
                  ) : (
                    <>
                      {!flow.isDefault && (
                        <button type="button" disabled={busy} onClick={() => void setAsDefault(flow)} className="h-8 px-2.5 rounded-md text-xs font-bold text-labbaik-text-muted hover:text-labbaik-blue hover:bg-labbaik-blue/10 disabled:opacity-50 cursor-pointer">
                          تعيين كأساسي
                        </button>
                      )}
                      <Link to={`/dashboard/flows/${flow.id}`} className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md text-xs font-bold text-neutral-800 dark:text-neutral-100 border border-labbaik-border hover:border-labbaik-blue/40 hover:text-labbaik-blue">
                        <Pencil size={13} /> تعديل
                      </Link>
                      <button type="button" onClick={() => setConfirmDelete(flow.id)} aria-label={`حذف ${flow.name}`} title="حذف" className="grid h-8 w-8 place-items-center rounded-md text-labbaik-text-muted hover:text-red-600 hover:bg-red-500/10 cursor-pointer">
                        <Trash2 size={15} />
                      </button>
                    </>
                  )}
                  <span className="mx-1 h-5 w-px bg-labbaik-border" />
                  <button
                    type="button"
                    role="switch"
                    aria-checked={flow.isActive}
                    aria-label={`${flow.isActive ? 'إيقاف' : 'تفعيل'} ${flow.name}`}
                    title={flow.isActive ? 'إيقاف التدفق' : 'تفعيل التدفق'}
                    disabled={busy}
                    onClick={() => void toggleActive(flow)}
                    className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 cursor-pointer ${flow.isActive ? 'bg-labbaik-blue' : 'bg-neutral-300 dark:bg-neutral-600'}`}
                  >
                    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all ${flow.isActive ? 'right-0.5' : 'right-5.5'}`} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

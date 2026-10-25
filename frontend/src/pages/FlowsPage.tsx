import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/client';
import { Copy, GitBranch, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ar } from 'date-fns/locale';
import { toEnglishDigits } from '@/lib/utils';
import { useToast } from '../components/Toast';
import { errorMessage, FLOW_TEMPLATES, serializeGraph, triggerSummary } from '../components/flows/flowModel';
import type { FlowEdge, FlowNode, FlowTrigger } from '../components/flows/flowModel';

interface Flow {
  id: string;
  name: string;
  isActive: boolean;
  updatedAt: string;
  trigger?: FlowTrigger;
  nodes?: FlowNode[];
  edges?: FlowEdge[];
}

const stepCount = (flow: Flow) => (flow.nodes || []).filter((node) => node.type !== 'start').length;

export default function FlowsPage() {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [loading, setLoading] = useState(true);
  const [picking, setPicking] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState<string | null>(null);
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

  const createFlow = async (templateId: string) => {
    const template = FLOW_TEMPLATES.find((item) => item.id === templateId)!;
    setCreating(templateId);
    try {
      const graph = template.build();
      const { data } = await api.post('/flows', { name: newName.trim() || (template.id === 'blank' ? 'تدفق جديد' : template.name), ...serializeGraph(graph.nodes, graph.edges) });
      navigate(`/dashboard/flows/${data.id}`);
    } catch (error) {
      showToast(errorMessage(error, 'تعذر إنشاء التدفق.'), 'error');
      setCreating(null);
    }
  };

  const duplicate = async (flow: Flow) => {
    setBusyId(flow.id);
    try {
      const { data } = await api.post<Flow>('/flows', { name: `نسخة من ${flow.name}`, nodes: flow.nodes || [], edges: flow.edges || [] });
      setFlows((current) => [data, ...current]);
      showToast('أُنشئت نسخة كمسودة.', 'success');
    } catch (error) {
      showToast(errorMessage(error, 'تعذر نسخ التدفق.'), 'error');
    } finally {
      setBusyId(null);
    }
  };

  const toggleActive = async (flow: Flow) => {
    setBusyId(flow.id);
    try {
      const { data } = await api.patch<Flow>(`/flows/${flow.id}`, { isActive: !flow.isActive });
      setFlows((current) => current.map((f) => (f.id === flow.id ? { ...f, ...data } : f)));
      showToast(data.isActive ? `فُعّل «${flow.name}».` : `أُوقف «${flow.name}».`, 'success');
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
      showToast(`حُذف «${flow.name}».`, 'success');
    } catch (error) {
      showToast(errorMessage(error, 'تعذر حذف التدفق.'), 'error');
    } finally {
      setBusyId(null);
    }
  };

  const liveCount = flows.filter((flow) => flow.isActive).length;

  const templatePicker = (
    <div className="rounded-xl border border-labbaik-border bg-labbaik-surface p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-black text-neutral-900 dark:text-white">تدفق جديد</h2>
          <p className="mt-0.5 text-sm text-labbaik-text-muted">ابدأ من قالب جاهز وعدّله، أو من الصفر. يُنشأ كمسودة حتى تفعّله.</p>
        </div>
        {flows.length > 0 && (
          <button type="button" onClick={() => setPicking(false)} aria-label="إلغاء" className="grid h-8 w-8 place-items-center rounded-md text-labbaik-text-muted hover:bg-labbaik-page hover:text-labbaik-text cursor-pointer"><X size={17} /></button>
        )}
      </div>
      <label className="mt-4 block max-w-sm space-y-1.5">
        <span className="text-[13px] font-bold text-neutral-800 dark:text-neutral-100">الاسم (اختياري)</span>
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="مثال: ترحيب فرع الرياض" className="h-10 w-full rounded-lg bg-labbaik-surface px-3 text-sm text-labbaik-text placeholder:text-labbaik-text-muted/80 focus:outline-none focus:ring-2 focus:ring-labbaik-blue/30" />
      </label>
      <ul className="mt-4 divide-y divide-labbaik-border rounded-lg border border-labbaik-border">
        {FLOW_TEMPLATES.map((template) => (
          <li key={template.id}>
            <button type="button" disabled={Boolean(creating)} onClick={() => void createFlow(template.id)} className="flex w-full items-center gap-3 px-4 py-3 text-start hover:bg-labbaik-page disabled:opacity-60 cursor-pointer">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-neutral-900 dark:text-white">{template.name}</span>
                <span className="block text-xs text-labbaik-text-muted">{template.description}</span>
              </span>
              {creating === template.id ? <Loader2 size={16} className="shrink-0 animate-spin text-labbaik-blue" /> : <span className="shrink-0 text-xs font-bold text-labbaik-blue dark:text-purple-300">استخدام</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <div className="max-w-5xl space-y-4 pb-10" dir="rtl">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-neutral-900 dark:text-white">التدفقات</h1>
          <p className="mt-1 text-sm text-labbaik-text-muted">ردود آلية بأزرار وقوائم وملفات تبدأ حسب محفّز تحدده: محادثة جديدة، أو كلمة مفتاحية.</p>
        </div>
        {!picking && flows.length > 0 && (
          <button type="button" onClick={() => setPicking(true)} className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-lg bg-labbaik-blue text-labbaik-on-accent text-sm font-black hover:bg-[#553174] cursor-pointer">
            <Plus size={16} /> تدفق جديد
          </button>
        )}
      </div>

      {!loading && flows.length > 0 && (
        <p className={`rounded-lg px-3 py-2.5 text-sm ${liveCount ? 'bg-emerald-500/10 text-emerald-900 dark:text-emerald-200' : 'bg-amber-500/15 text-amber-900 dark:text-amber-200'}`}>
          {liveCount
            ? <>{liveCount === 1 ? 'تدفق واحد مفعّل' : `${liveCount} تدفقات مفعّلة`}. الكلمة المفتاحية لها الأولوية، ثم تدفق المحادثة الجديدة. الرسائل التي لا يلتقطها تدفق يرد عليها الذكاء الاصطناعي.</>
            : 'لا يوجد تدفق مفعّل، فيرد الذكاء الاصطناعي على كل الرسائل. فعّل تدفقًا ليبدأ العمل.'}
        </p>
      )}

      {(picking || (!loading && flows.length === 0)) && templatePicker}

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
      ) : flows.length > 0 && (
        <ul className="rounded-xl border border-labbaik-border bg-labbaik-surface divide-y divide-labbaik-border">
          {flows.map((flow) => {
            const busy = busyId === flow.id;
            return (
              <li key={flow.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${flow.isActive ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300' : 'bg-labbaik-page text-labbaik-text-muted'}`}>
                  <GitBranch size={17} />
                </span>
                <div className="flex-1 min-w-48">
                  <div className="flex items-center gap-2">
                    <Link to={`/dashboard/flows/${flow.id}`} className="font-bold text-neutral-900 dark:text-white hover:text-labbaik-blue truncate">{flow.name}</Link>
                    <span className={`h-5 shrink-0 rounded px-1.5 text-[11px] font-bold leading-5 ${flow.isActive ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300' : 'bg-labbaik-page text-labbaik-text-muted'}`}>
                      {flow.isActive ? 'مفعّل' : 'مسودة'}
                    </span>
                  </div>
                  <p className="text-xs text-labbaik-text-muted">
                    {triggerSummary(flow.trigger)} · {stepCount(flow)} {stepCount(flow) === 1 ? 'خطوة' : 'خطوات'} · عُدّل {toEnglishDigits(formatDistanceToNow(new Date(flow.updatedAt), { addSuffix: true, locale: ar }))}
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
                      <Link to={`/dashboard/flows/${flow.id}`} className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md text-xs font-bold text-neutral-800 dark:text-neutral-100 border border-labbaik-border hover:border-labbaik-blue/40 hover:text-labbaik-blue">
                        <Pencil size={13} /> تعديل
                      </Link>
                      <button type="button" disabled={busy} onClick={() => void duplicate(flow)} aria-label={`نسخ ${flow.name}`} title="نسخ" className="grid h-8 w-8 place-items-center rounded-md text-labbaik-text-muted hover:text-labbaik-blue hover:bg-labbaik-blue/10 disabled:opacity-50 cursor-pointer">
                        <Copy size={15} />
                      </button>
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
                    className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 cursor-pointer ${flow.isActive ? 'bg-emerald-600' : 'bg-neutral-300 dark:bg-neutral-600'}`}
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

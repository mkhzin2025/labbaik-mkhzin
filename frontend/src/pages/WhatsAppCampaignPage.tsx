import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, ArrowRight, Ban, CalendarClock, CreditCard, Loader2, MessageSquareReply, MousePointerClick, RotateCcw, Search, Workflow } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import api from '../api/client';
import { useToast } from '../components/Toast';
import Pagination from '../components/ui/Pagination';
import TemplatePreview from '../components/whatsapp/TemplatePreview';
import { mediaFilePath, useAuthedObjectUrl } from '../components/whatsapp/media';
import { analyzeTemplate, describeTokens, type Template } from '../components/whatsapp/templateUtils';
import {
  ActivityChart,
  AudienceChips,
  CampaignStatusBadge,
  Funnel,
  RecipientStatusBadge,
  type ActivityPoint,
  type CampaignDetails,
} from '../components/whatsapp/campaignShared';
import { dateTime, engagement, interactionsOf, isActive, num, pct } from '../components/whatsapp/campaignFormat';
import { toEnglishDigits } from '@/lib/utils';

type Recipient = {
  id: string; customerId: string | null; storeId: string; storeName: string | null; phone: string; customerName: string | null; status: string; error: string | null;
  sentAt: string | null; deliveredAt: string | null; readAt: string | null; failedAt: string | null; repliedAt: string | null; replyType: string | null; replyText: string | null;
};

const FILTERS = [
  ['all', 'الكل', 'total'],
  ['replied', 'ردّوا', 'replied'],
  ['clicked', 'ضغطوا زرًا', 'clicked'],
  ['read', 'قرأوا', 'read'],
  ['delivered', 'وصلتهم', 'delivered'],
  ['failed', 'فشل', 'failed'],
  ['pending', 'بالانتظار', 'pending'],
] as const;

const PAGE_SIZE = 25;

const BUTTON_TYPES: Record<string, string> = {
  url_button: 'رابط موقع',
  quick_reply_button: 'رد سريع',
  phone_number_button: 'اتصال',
  copy_code_button: 'نسخ رمز',
};

const day = (iso?: string) => (iso ? toEnglishDigits(new Date(iso).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { day: 'numeric', month: 'short', timeZone: 'UTC' })) : '');

const errorMessage = (error: unknown, fallback: string) => {
  const data = (error as { response?: { data?: { message?: string } } })?.response?.data;
  return data?.message || fallback;
};

export default function WhatsAppCampaignPage() {
  const { id } = useParams<{ id: string }>();
  const { showToast } = useToast();
  const [campaign, setCampaign] = useState<CampaignDetails | null>(null);
  const [template, setTemplate] = useState<Template | null>(null);
  const [failed, setFailed] = useState(false);
  const [acting, setActing] = useState<'cancel' | 'retry' | 'payment' | 'flows' | 'replies' | null>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<CampaignDetails>(`/integrations/meta/whatsapp/campaigns/${id}`);
      setCampaign(data);
      setFailed(false);
      return data;
    } catch {
      setFailed(true);
      return null;
    }
  }, [id]);

  // Poll while the campaign is sending; afterwards refresh slowly so reads/replies keep coming in.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    const tick = async () => {
      const data = await load();
      if (!stopped) timer = setTimeout(tick, data && isActive(data.status) ? 10000 : 30000);
    };
    void tick();
    return () => { stopped = true; clearTimeout(timer); };
  }, [load]);

  // The template's structure is needed for the preview; it may have been removed by a later sync.
  const templateId = campaign?.templateId;
  const connectionId = campaign?.connectionId;
  useEffect(() => {
    if (!templateId || !connectionId) return;
    api.get('/integrations/meta/whatsapp/templates', { params: { connectionId } })
      .then(({ data }) => setTemplate((data || []).find((t: Template) => t.id === templateId) || null))
      .catch(() => setTemplate(null));
  }, [templateId, connectionId]);

  const mediaUrl = useAuthedObjectUrl(mediaFilePath(campaign?.parameters.headerMedia));

  // Flow replies (e.g. the offers file after a button tap) that Meta refused while billing was unpaid.
  // Only customers who wrote in the last 20 hours can still get a free-form reply, so the server checks first.
  const retryFlows = async () => {
    setActing('flows');
    try {
      const base = `/integrations/meta/whatsapp/campaigns/${id}/flow-retry`;
      const { data: preview } = await api.get<{ customers: number; messages: number; expired: number; running: boolean }>(base);
      if (preview.running) { showToast('إعادة إرسال ردود التدفق جارية بالفعل.', 'info'); return; }
      if (!preview.customers) {
        showToast(preview.expired ? `لا يوجد عملاء داخل نافذة 20 ساعة؛ ${num(preview.expired)} عميل انتهت نافذتهم ولا يصلهم إلا قالب.` : 'لا توجد ردود تدفق فاشلة بسبب الدفع.', 'info');
        return;
      }
      const ok = window.confirm(`تأكد أولًا أن مستحقات واتساب في Meta مسدّدة.

سيُعاد إرسال ${num(preview.messages)} رد تدفق إلى ${num(preview.customers)} عميل راسلونا خلال آخر 20 ساعة.${preview.expired ? `
(${num(preview.expired)} عميل خارج النافذة لن يُرسل لهم.)` : ''}

متابعة؟`);
      if (!ok) return;
      const { data } = await api.post<{ started: number }>(base);
      showToast(`بدأت إعادة إرسال ردود التدفق إلى ${num(data.started)} عميل في الخلفية.`, 'success');
    } catch (error) {
      showToast(errorMessage(error, 'تعذر إعادة إرسال ردود التدفق.'), 'error');
    } finally {
      setActing(null);
    }
  };

  // Replies that arrived after the old 72-hour tracking window; new replies are counted with no time limit.
  const recountReplies = async () => {
    setActing('replies');
    const path = `/integrations/meta/whatsapp/campaigns/${id}/recount-replies`;
    try {
      const { data } = await api.post<{ checking: number }>(path);
      showToast(`جارٍ فحص محادثات ${num(data.checking)} عميل…`, 'info');
      type Status = { running: boolean; result: { checked: number; counted: number; error?: string } | null };
      let status: Status;
      do {
        await new Promise((resolve) => setTimeout(resolve, 4000));
        status = (await api.get<Status>(path)).data;
      } while (status.running);
      const result = status.result;
      if (result?.error) showToast(`تعذر احتساب الردود: ${result.error}`, 'error');
      else if (result) {
        showToast(result.counted ? `احتُسب ${num(result.counted)} رد جديد من ${num(result.checked)} عميل.` : `لا توجد ردود جديدة؛ كل من راسلنا بعد الحملة محسوب مسبقًا.`, result.counted ? 'success' : 'info');
        await load();
      }
    } catch (error) {
      showToast(errorMessage(error, 'تعذر احتساب الردود.'), 'error');
    } finally {
      setActing(null);
    }
  };

  const act = async (kind: 'cancel' | 'retry' | 'payment') => {
    if (kind === 'payment' && !window.confirm(`تأكد أولًا أن مستحقات واتساب في Meta مسدّدة، وإلا ستفشل الرسائل مرة أخرى.

إعادة إرسال ${num(campaign?.paymentFailed || 0)} رسالة فشلت بسبب الدفع؟`)) return;
    setActing(kind);
    try {
      const path = kind === 'cancel' ? 'cancel' : kind === 'payment' ? 'retry-payment-failed' : 'retry-failed';
      const { data } = await api.post(`/integrations/meta/whatsapp/campaigns/${id}/${path}`);
      setCampaign(data);
      showToast(kind === 'cancel' ? 'أُوقفت الحملة.' : kind === 'payment' ? 'أُعيدت رسائل الدفع الفاشلة للإرسال.' : 'أُعيدت الأرقام الفاشلة للإرسال.', 'success');
    } catch (error) {
      showToast(errorMessage(error, 'تعذر تنفيذ العملية.'), 'error');
    } finally {
      setActing(null);
    }
  };

  const timeline = useMemo<ActivityPoint[]>(() => {
    if (!campaign?.timeline.length) return [];
    const byHour = new Map<string, ActivityPoint>();
    const first = new Date(campaign.timeline[0].bucket).getTime();
    const last = Math.max(...campaign.timeline.map((p) => new Date(p.bucket).getTime()));
    // Fill empty hours so the line drops to zero instead of bridging gaps.
    for (let t = first; t <= last; t += 3600 * 1000) {
      const d = new Date(t);
      const key = d.toISOString();
      byHour.set(key, { key, label: `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:00`, sent: 0, read: 0, replied: 0 });
    }
    for (const point of campaign.timeline) {
      const row = byHour.get(new Date(point.bucket).toISOString());
      if (row) row[point.kind] += point.count;
    }
    return [...byHour.values()];
  }, [campaign?.timeline]);

  if (failed && !campaign) {
    return (
      <div className="max-w-xl mx-auto py-16 text-center" dir="rtl">
        <AlertTriangle size={32} strokeWidth={1.5} className="mx-auto text-labbaik-text-muted" />
        <p className="mt-3 text-sm font-bold text-labbaik-text-muted">تعذر تحميل الحملة، أو ليست ضمن فروعك.</p>
        <Link to="/dashboard/whatsapp-templates?tab=campaigns" className="mt-4 inline-block text-sm font-bold text-labbaik-blue hover:underline">العودة لسجل الحملات</Link>
      </div>
    );
  }
  if (!campaign) return <div className="h-[60vh] grid place-items-center"><Loader2 size={30} className="animate-spin text-labbaik-blue" /></div>;

  const { stats } = campaign;
  const done = stats.total - stats.pending;
  const retryable = !isActive(campaign.status) && (stats.failed + stats.skipped) > 0;
  const analysis = template ? analyzeTemplate(template) : null;
  const params = campaign.parameters;
  const clicks = campaign.metaButtons?.available && campaign.metaButtons.buttons.length ? campaign.metaButtons : null;

  return (
    <div className="max-w-6xl space-y-4 pb-10" dir="rtl">
      <div>
        <Link to="/dashboard/whatsapp-templates?tab=campaigns" className="inline-flex items-center gap-1 text-xs font-bold text-labbaik-text-muted hover:text-labbaik-blue"><ArrowRight size={14} /> سجل الحملات</Link>
        <div className="mt-2 flex flex-col md:flex-row md:items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-black text-neutral-900 dark:text-white truncate">{campaign.name}</h1>
              <CampaignStatusBadge status={campaign.status} />
            </div>
            <p className="mt-1 text-sm text-labbaik-text-muted">
              القالب <b dir="ltr" className="text-neutral-800 dark:text-neutral-100">{campaign.templateName}</b> · {dateTime(campaign.createdAt)}
              {campaign.createdByName && <> · بواسطة {campaign.createdByName}</>}
              {' · '}<span className="tabular-nums">{num(campaign.messagesPerSecond)}</span> رسالة/ث
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(isActive(campaign.status) || campaign.status === 'scheduled') && (
              <button type="button" onClick={() => void act('cancel')} disabled={acting !== null} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-red-500/40 text-sm font-bold text-red-700 dark:text-red-300 hover:bg-red-500/10 disabled:opacity-50 cursor-pointer">
                {acting === 'cancel' ? <Loader2 size={15} className="animate-spin" /> : <Ban size={15} />} إيقاف الحملة
              </button>
            )}
            {retryable && (
              <button type="button" onClick={() => void act('retry')} disabled={acting !== null} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-labbaik-border text-sm font-bold text-neutral-800 dark:text-neutral-100 hover:border-labbaik-blue/40 hover:text-labbaik-blue disabled:opacity-50 cursor-pointer">
                {acting === 'retry' ? <Loader2 size={15} className="animate-spin" /> : <RotateCcw size={15} />} إعادة إرسال غير المُرسلة
              </button>
            )}
            {campaign.paymentFailed > 0 && campaign.status !== 'scheduled' && (
              <button type="button" onClick={() => void act('payment')} disabled={acting !== null} title="رسائل رفضتها Meta لأن حساب واتساب عليه مستحقات غير مسدّدة"
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-amber-500/50 text-sm font-bold text-amber-800 dark:text-amber-300 hover:bg-amber-500/10 disabled:opacity-50 cursor-pointer">
                {acting === 'payment' ? <Loader2 size={15} className="animate-spin" /> : <CreditCard size={15} />} إعادة إرسال فاشلة الدفع (<span className="tabular-nums">{num(campaign.paymentFailed)}</span>)
              </button>
            )}
            {campaign.paymentFailed > 0 && stats.replied > 0 && (
              <button type="button" onClick={() => void retryFlows()} disabled={acting !== null} title="ردود التدفقات التي رفضتها Meta بسبب الدفع، لعملاء راسلونا خلال آخر 20 ساعة"
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-amber-500/50 text-sm font-bold text-amber-800 dark:text-amber-300 hover:bg-amber-500/10 disabled:opacity-50 cursor-pointer">
                {acting === 'flows' ? <Loader2 size={15} className="animate-spin" /> : <Workflow size={15} />} إعادة ردود التدفق الفاشلة
              </button>
            )}
            {!isActive(campaign.status) && campaign.status !== 'scheduled' && stats.accepted > 0 && (
              <button type="button" onClick={() => void recountReplies()} disabled={acting !== null} title="يحتسب كل رسائل العملاء بعد الحملة كردود، ومنها ما وصل بعد 72 ساعة"
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-labbaik-border text-sm font-bold text-neutral-800 dark:text-neutral-100 hover:border-labbaik-blue/40 hover:text-labbaik-blue disabled:opacity-50 cursor-pointer">
                {acting === 'replies' ? <Loader2 size={15} className="animate-spin" /> : <MessageSquareReply size={15} />} احتساب كل الردود
              </button>
            )}
            {campaign.templateId && (
              <Link to={`/dashboard/whatsapp-templates?tab=campaigns&templateId=${campaign.templateId}`} className="inline-flex items-center h-9 px-3 rounded-lg border border-labbaik-border text-sm font-bold text-neutral-800 dark:text-neutral-100 hover:border-labbaik-blue/40 hover:text-labbaik-blue">
                حملات هذا القالب
              </Link>
            )}
          </div>
        </div>
      </div>

      {isActive(campaign.status) && (
        <div className="rounded-xl border border-labbaik-border bg-labbaik-surface p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-bold text-neutral-900 dark:text-white">جارٍ الإرسال… <span className="tabular-nums">{num(done)}</span> من <span className="tabular-nums">{num(stats.total)}</span></span>
            <span className="tabular-nums text-labbaik-text-muted">{pct(done, stats.total)}</span>
          </div>
          <div className="mt-2 h-2 rounded-full bg-labbaik-page overflow-hidden" role="progressbar" aria-valuenow={Math.round((done / (stats.total || 1)) * 100)} aria-valuemin={0} aria-valuemax={100}>
            <span className="block h-full rounded-full bg-[var(--viz-1)] transition-[width] duration-500" style={{ width: `${(done / (stats.total || 1)) * 100}%` }} />
          </div>
          <p className="mt-2 text-xs text-labbaik-text-muted">يمكنك مغادرة الصفحة؛ الإرسال مستمر على الخادم.</p>
        </div>
      )}

      {campaign.status === 'scheduled' && campaign.scheduledAt && (
        <p className="flex items-start gap-1.5 rounded-xl border border-labbaik-blue/30 bg-labbaik-blue/8 px-4 py-3 text-sm font-bold text-labbaik-blue dark:text-purple-200">
          <CalendarClock size={16} className="mt-0.5 shrink-0" />
          يبدأ الإرسال تلقائيًا في {dateTime(campaign.scheduledAt)} إلى {num(stats.total)} رقم. يمكنك إلغاؤها قبل ذلك.
        </p>
      )}

      {campaign.lastError && (
        <p className="flex items-start gap-1.5 rounded-lg bg-red-500/10 px-3 py-2 text-sm font-bold text-red-800 dark:text-red-300"><AlertTriangle size={16} className="mt-0.5 shrink-0" />{campaign.lastError}</p>
      )}

      <div className={`grid grid-cols-2 gap-3 ${clicks ? 'md:grid-cols-3 xl:grid-cols-6' : 'lg:grid-cols-5'}`}>
        <Tile label="المستهدفون" value={num(stats.total)} note={`${num(campaign.sourceRecords)} سجل قبل التنقية`} />
        <Tile label="نسبة الوصول" value={pct(stats.delivered, stats.accepted)} note={`${num(stats.delivered)} وصلت`} />
        <Tile label="نسبة القراءة" value={pct(stats.read, stats.delivered)} note={`${num(stats.read)} قرأوا`} />
        <Tile label="نسبة التفاعل" value={engagement(stats)} note={`من القارئين · ${num(interactionsOf(stats))} تفاعل · ${num(stats.replied)} ردّوا${clicks ? ` · ${num(clicks.total)} نقرة` : ''}`} />
        {clicks && <Tile label="نسبة النقر" value={pct(clicks.total, stats.delivered)} note={`${num(clicks.total)} نقرة على الأزرار · حسب ميتا`} />}
        <Tile label="فشل" value={num(stats.failed)} note={stats.skipped ? `${num(stats.skipped)} لم تُرسل` : pct(stats.failed, stats.total)} tone={stats.failed ? 'warn' : undefined} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4 items-start">
        <div className="space-y-4 min-w-0">
          <Panel title="مراحل الوصول" subtitle="القراءة تعتمد على إيصالات القراءة لدى العميل، فقد تكون أقل من الفعلي.">
            <Funnel stats={stats} />
          </Panel>

          <Panel title="حركة الحملة" subtitle="الإرسال والقراءة والردود بالساعة (بتوقيتك المحلي)، لأول 7 أيام.">
            {timeline.length ? <ActivityChart points={timeline} bucketLabel="الساعة" /> : <p className="py-10 text-center text-sm text-labbaik-text-muted">لا توجد حركة بعد.</p>}
          </Panel>

          {campaign.byBranch.length > 1 && (
            <Panel title="حسب الفرع">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-sm">
                  <thead className="text-xs text-labbaik-text-muted">
                    <tr className="border-b border-labbaik-border">
                      <th className="text-right font-bold py-2">الفرع</th><th className="text-right font-bold">المستهدفون</th><th className="text-right font-bold">وصلت</th><th className="text-right font-bold">قُرئت</th><th className="text-right font-bold">ردّوا</th><th className="text-right font-bold">فشل</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaign.byBranch.map((b) => (
                      <tr key={b.storeId} className="border-b border-labbaik-border last:border-b-0">
                        <td className="py-2 font-bold text-neutral-900 dark:text-white">{b.storeName || '—'}</td>
                        <td className="tabular-nums">{num(b.stats.total)}</td>
                        <td className="tabular-nums">{pct(b.stats.delivered, b.stats.accepted)}</td>
                        <td className="tabular-nums">{pct(b.stats.read, b.stats.delivered)}</td>
                        <td className="tabular-nums">{pct(b.stats.replied, b.stats.read)} <span className="text-xs text-labbaik-text-muted">({num(b.stats.replied)})</span></td>
                        <td className="tabular-nums">{num(b.stats.failed)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}

          <Recipients campaignId={campaign.id} stats={stats} refreshKey={done + stats.read + stats.replied} />
        </div>

        <div className="space-y-4">
          <Panel title="الجمهور المستهدف">
            <AudienceChips audience={campaign.audience} />
            <div className="mt-3 grid grid-cols-2 gap-2 text-center">
              <Mini label="سجلات مطابقة" value={campaign.sourceRecords} />
              <Mini label="رافضون للتسويق" value={campaign.optedOutSkipped} />
              <Mini label="أرقام مكررة" value={campaign.duplicatesRemoved} />
              <Mini label="المستلمون" value={campaign.totalRecipients} />
            </div>
            {!!campaign.audience.excludedCount && <p className="mt-2 text-xs text-labbaik-text-muted">استُبعد {num(campaign.audience.excludedCount)} عميل يدويًا من المراجعة.</p>}
          </Panel>

          <Panel title="الرسالة المرسلة">
            {template && analysis ? (
              <TemplatePreview template={template} analysis={analysis} values={{ header: params.header, body: params.body, buttons: (params.buttons || []).map((b) => ({ ...b, label: '' })), otp: params.otpCode || '' }} mediaUrl={mediaUrl} />
            ) : (
              <div className="space-y-2">
                {mediaUrl && <img src={mediaUrl} alt="صورة ترويسة الحملة" className="w-full max-h-56 rounded-lg object-cover" />}
                <p className="whitespace-pre-wrap rounded-lg bg-labbaik-page p-3 text-sm text-neutral-800 dark:text-neutral-100">{describeTokens(campaign.previewText || '')}</p>
              </div>
            )}
            {(params.body.length > 0 || params.header.length > 0) && (
              <dl className="mt-3 space-y-1 text-xs">
                {params.header.map((v, i) => <Param key={`h${i}`} label={`العنوان {{${i + 1}}}`} value={v} />)}
                {params.body.map((v, i) => <Param key={`b${i}`} label={`النص {{${i + 1}}}`} value={v} />)}
                {params.nameFallback && <Param label="بديل الاسم" value={params.nameFallback} />}
              </dl>
            )}
          </Panel>

          {clicks ? (
            <Panel
              title="النقرات على الأزرار"
              subtitle={`حسب ميتا لهذا القالب من ${day(clicks.from)} إلى ${day(clicks.to)}. أرقام إجمالية لا تحدد من ضغط، والنسبة من الرسائل التي وصلت.`}
            >
              <ul className="space-y-2">
                {clicks.buttons.map((b) => (
                  <li key={`${b.type}:${b.text}`} className="text-sm">
                    <div className="flex items-center gap-2">
                      <MousePointerClick size={14} className="shrink-0 text-labbaik-text-muted" />
                      <span className="flex-1 min-w-0 truncate font-bold text-neutral-800 dark:text-neutral-100" dir="auto">{b.text || 'زر'}</span>
                      <b className="tabular-nums text-neutral-900 dark:text-white">{num(b.count)}</b>
                      <span className="w-10 text-left tabular-nums text-xs text-labbaik-text-muted">{pct(b.count, stats.delivered)}</span>
                    </div>
                    <p className="mr-[22px] text-[11px] text-labbaik-text-muted">{BUTTON_TYPES[b.type] || 'زر'}</p>
                  </li>
                ))}
              </ul>
              {campaign.metaButtons.shared && (
                <p className="mt-3 flex items-start gap-1.5 text-xs text-amber-800 dark:text-amber-300">
                  <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                  أُرسل هذا القالب في حملة أخرى في اليوم نفسه، فالأرقام تشمل نقراتها أيضًا.
                </p>
              )}
            </Panel>
          ) : campaign.buttons.length > 0 && (
            <Panel title="الأزرار الأكثر ضغطًا">
              <ul className="space-y-1.5">
                {campaign.buttons.map((b) => (
                  <li key={b.text} className="flex items-center gap-2 text-sm">
                    <MousePointerClick size={14} className="shrink-0 text-labbaik-text-muted" />
                    <span className="flex-1 truncate text-neutral-800 dark:text-neutral-100">{b.text || 'زر'}</span>
                    <b className="tabular-nums text-neutral-900 dark:text-white">{num(b.count)}</b>
                  </li>
                ))}
              </ul>
              {campaign.metaButtons?.reason && (
                <p className="mt-3 text-xs text-labbaik-text-muted wrap-anywhere" dir="auto">تعذر جلب نقرات روابط الأزرار من ميتا: {campaign.metaButtons.reason}</p>
              )}
            </Panel>
          )}

          {campaign.errors.length > 0 && (
            <Panel title="أسباب الفشل">
              <ul className="space-y-2">
                {campaign.errors.map((e) => (
                  <li key={e.error} className="flex items-start gap-2 text-xs">
                    <b className="tabular-nums text-red-700 dark:text-red-300 shrink-0">{num(e.count)}</b>
                    <span className="min-w-0 text-neutral-700 dark:text-neutral-200 wrap-anywhere" dir="auto">{e.error || 'غير معروف'}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}

function Recipients({ campaignId, stats, refreshKey }: { campaignId: string; stats: CampaignDetails['stats']; refreshKey: number }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>('all');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<Recipient[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const request = useRef(0);

  useEffect(() => { const t = setTimeout(() => { setQuery(search.trim()); setPage(1); }, 300); return () => clearTimeout(t); }, [search]);
  const load = useCallback(async () => {
    const id = ++request.current;
    setLoading(true);
    try {
      const { data } = await api.get(`/integrations/meta/whatsapp/campaigns/${campaignId}/recipients`, { params: { page, limit: PAGE_SIZE, filter, search: query || undefined } });
      if (id !== request.current) return;
      setRows(data.items || []);
      setTotal(data.total || 0);
    } catch {
      // Keep the last page on a failed refresh.
    } finally {
      if (id === request.current) setLoading(false);
    }
  }, [campaignId, page, filter, query]);
  // `refreshKey` changes as the campaign progresses, so open filters pick up new reads and replies.
  useEffect(() => { void load(); }, [load, refreshKey]);

  return (
    <Panel title="المستلمون">
      <div className="flex flex-wrap gap-1 mb-3" role="tablist" aria-label="تصفية المستلمين">
        {FILTERS.map(([key, label, stat]) => (
          <button type="button" key={key} role="tab" aria-selected={filter === key} onClick={() => { setFilter(key); setPage(1); }}
            className={`inline-flex items-center gap-1 h-8 px-2.5 rounded-md text-xs font-bold cursor-pointer ${filter === key ? 'bg-labbaik-blue text-labbaik-on-accent' : 'bg-labbaik-page text-labbaik-text-muted hover:text-neutral-900 dark:hover:text-white'}`}>
            {label} <span className="tabular-nums opacity-80">{num(stats[stat])}</span>
          </button>
        ))}
      </div>
      <div className="relative mb-2">
        <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-labbaik-text-muted" />
        <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث بالاسم أو الرقم..." aria-label="بحث في المستلمين"
          className="w-full h-9 rounded-lg border border-labbaik-border bg-labbaik-page pr-9 pl-3 text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-labbaik-blue/30 placeholder:text-labbaik-text-muted" />
      </div>
      <div className={`overflow-x-auto transition-opacity ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
        <table className="w-full min-w-[620px] text-sm">
          <thead className="text-xs text-labbaik-text-muted">
            <tr className="border-b border-labbaik-border">
              <th className="text-right font-bold py-2">العميل</th><th className="text-right font-bold">الفرع</th><th className="text-right font-bold">الحالة</th><th className="text-right font-bold">آخر حدث</th><th className="text-right font-bold">الرد / السبب</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-labbaik-border last:border-b-0 align-top">
                <td className="py-2">
                  <span className="block font-bold text-neutral-900 dark:text-white truncate max-w-44">{r.customerName || r.phone}</span>
                  {r.customerName && <span dir="ltr" className="block text-xs text-labbaik-text-muted text-right tabular-nums">{r.phone}</span>}
                </td>
                <td className="py-2 text-xs text-labbaik-text-muted">{r.storeName || '—'}</td>
                <td className="py-2"><RecipientStatusBadge row={r} /></td>
                <td className="py-2 text-xs tabular-nums text-labbaik-text-muted whitespace-nowrap">{dateTime(r.repliedAt || r.readAt || r.deliveredAt || r.failedAt || r.sentAt)}</td>
                <td className="py-2 text-xs max-w-56">
                  {r.status === 'failed' || r.status === 'skipped'
                    ? <span className="text-red-700 dark:text-red-300 line-clamp-2" dir="auto" title={r.error || ''}>{r.error}</span>
                    : r.replyText ? <span className="text-neutral-800 dark:text-neutral-100 line-clamp-2" dir="auto">{r.replyText}</span> : <span className="text-labbaik-text-muted">—</span>}
                </td>
              </tr>
            ))}
            {!rows.length && !loading && <tr><td colSpan={5} className="py-8 text-center text-sm text-labbaik-text-muted">لا يوجد مستلمون في هذا التصنيف.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-labbaik-text-muted tabular-nums">{num(total)} رقم</span>
        <Pagination page={page} pageCount={Math.ceil(total / PAGE_SIZE)} onChange={setPage} label="صفحات المستلمين" />
      </div>
    </Panel>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-labbaik-border bg-labbaik-surface p-4">
      <h2 className="font-black text-neutral-900 dark:text-white">{title}</h2>
      {subtitle && <p className="text-xs text-labbaik-text-muted">{subtitle}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Tile({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: 'warn' }) {
  return (
    <div className="rounded-xl border border-labbaik-border bg-labbaik-surface p-4">
      <p className="text-xs font-bold text-labbaik-text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-black tabular-nums ${tone === 'warn' ? 'text-amber-700 dark:text-amber-300' : 'text-neutral-900 dark:text-white'}`}>{value}</p>
      {note && <p className="mt-1 text-xs text-labbaik-text-muted">{note}</p>}
    </div>
  );
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-labbaik-page px-2 py-2">
      <p className="text-base font-black tabular-nums text-neutral-900 dark:text-white">{num(value)}</p>
      <p className="text-[11px] text-labbaik-text-muted">{label}</p>
    </div>
  );
}

function Param({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt dir="ltr" className="shrink-0 text-labbaik-text-muted">{label}</dt>
      <dd className="text-neutral-800 dark:text-neutral-100 wrap-break-word">{describeTokens(value)}</dd>
    </div>
  );
}

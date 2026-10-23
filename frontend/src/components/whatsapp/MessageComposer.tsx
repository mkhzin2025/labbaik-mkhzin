import { useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, CircleDashed, ImagePlus, Link2, Loader2, RefreshCw, Sparkles, Trash2, Upload } from 'lucide-react';
import api from '../../api/client';
import { useToast } from '../Toast';
import {
  CUSTOMER_TOKENS,
  MEDIA_LABELS,
  usesCustomerName,
  type HeaderMedia,
  type MediaType,
  type Template,
  type TemplateAnalysis,
  type TemplateValues,
} from './templateUtils';

const inputClass = 'w-full h-10 rounded-lg border border-labbaik-border bg-labbaik-page px-3 text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-labbaik-blue/30 focus:border-labbaik-blue placeholder:text-labbaik-text-muted';

const errorMessage = (error: unknown, fallback: string) => {
  const data = (error as { response?: { data?: { message?: string | string[] } } })?.response?.data;
  return (Array.isArray(data?.message) ? data?.message.join('، ') : data?.message) || fallback;
};

/**
 * Everything the selected template needs before sending, in the order it appears in the message:
 * header media, header text variables, body variables, dynamic button links.
 */
export default function MessageComposer({
  template,
  analysis,
  values,
  onChange,
  connectionId,
  bulk,
  onMediaPreview,
}: {
  template: Template;
  analysis: TemplateAnalysis;
  values: TemplateValues;
  onChange: (next: TemplateValues) => void;
  connectionId: string;
  bulk: boolean;
  /** Local object URL for the chosen header file, shown in the preview. */
  onMediaPreview: (url: string | null) => void;
}) {
  const set = (patch: Partial<TemplateValues>) => onChange({ ...values, ...patch });

  if (analysis.isAuth) {
    return (
      <Step done={Boolean(values.otp.trim())} title="رمز التحقق (OTP)" hint="قالب تحقق: يُرسل الرمز في النص وفي زر النسخ.">
        <input value={values.otp} onChange={(e) => set({ otp: e.target.value })} placeholder="مثال: 123456" className={inputClass} dir="ltr" aria-label="رمز التحقق" />
      </Step>
    );
  }

  const nothingToFill = !analysis.mediaType && !values.header.length && !values.body.length && !values.buttons.length;
  if (nothingToFill) {
    return <p className="flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-800 dark:text-emerald-300"><CheckCircle2 size={14} /> هذا القالب لا يحتاج أي متغيرات، جاهز للإرسال.</p>;
  }

  return (
    <div className="space-y-3">
      {analysis.mediaType && (
        <Step
          done={Boolean(values.media?.id || values.media?.link)}
          title={`${MEDIA_LABELS[analysis.mediaType].noun} الترويسة`}
          hint={`القالب معتمد بترويسة ${MEDIA_LABELS[analysis.mediaType].noun}؛ يجب إرفاقها مع كل إرسال.`}
        >
          <MediaPicker
            type={analysis.mediaType}
            media={values.media}
            connectionId={connectionId}
            templateId={template.id}
            hasSample={Boolean(analysis.sampleMediaUrl)}
            onChange={(media, previewUrl) => { set({ media }); onMediaPreview(previewUrl); }}
          />
        </Step>
      )}

      {values.header.length > 0 && (
        <Step done={values.header.every((v) => v.trim())} title="متغيرات العنوان">
          {values.header.map((value, i) => (
            <VariableField
              key={`h${i}`}
              id={`header-var-${i}`}
              label={`{{${i + 1}}}`}
              example={analysis.headerExamples[i]}
              value={value}
              bulk={bulk}
              onChange={(next) => set({ header: values.header.map((v, j) => (j === i ? next : v)) })}
            />
          ))}
        </Step>
      )}

      {values.body.length > 0 && (
        <Step done={values.body.every((v) => v.trim())} title={`متغيرات نص الرسالة (${values.body.length})`} hint="كل متغير يحل محل {{رقم}} المقابل في النص؛ راقب المعاينة.">
          {values.body.map((value, i) => (
            <VariableField
              key={`b${i}`}
              id={`body-var-${i}`}
              label={`{{${i + 1}}}`}
              example={analysis.bodyExamples[i]}
              value={value}
              bulk={bulk}
              onChange={(next) => set({ body: values.body.map((v, j) => (j === i ? next : v)) })}
            />
          ))}
        </Step>
      )}

      {values.buttons.length > 0 && (
        <Step done={values.buttons.every((b) => b.text.trim())} title="روابط الأزرار" hint="الجزء المتغير من رابط الزر فقط (ما يحل محل {{1}}).">
          {values.buttons.map((btn, i) => (
            <div key={`btn-${btn.index}`} className="space-y-1">
              <VariableField
                id={`btn-var-${i}`}
                label={`زر «${btn.label}»`}
                value={btn.text}
                bulk={bulk}
                ltr
                onChange={(next) => set({ buttons: values.buttons.map((b, j) => (j === i ? { ...b, text: next } : b)) })}
              />
              {btn.url && <p dir="ltr" className="text-[11px] text-labbaik-text-muted break-all text-left">{btn.url.replace(/\{\{1\}\}/g, btn.text || '{{1}}')}</p>}
            </div>
          ))}
        </Step>
      )}

      {bulk && usesCustomerName(values) && (
        <div className="space-y-1.5">
          <label htmlFor="name-fallback" className="text-xs font-bold text-labbaik-text-muted">إذا لم يكن اسم العميل معروفًا اكتب بدلًا منه</label>
          <input id="name-fallback" value={values.nameFallback} onChange={(e) => set({ nameFallback: e.target.value })} className={inputClass} maxLength={60} />
        </div>
      )}
    </div>
  );
}

function Step({ done, title, hint, children }: { done: boolean; title: string; hint?: string; children: ReactNode }) {
  return (
    <fieldset className="rounded-lg border border-labbaik-border p-3 space-y-2">
      <legend className="sr-only">{title}</legend>
      <div>
        <p className="flex items-center gap-1.5 text-sm font-black text-neutral-900 dark:text-white">
          {done ? <CheckCircle2 size={15} className="text-emerald-600 dark:text-emerald-400" /> : <CircleDashed size={15} className="text-amber-600 dark:text-amber-400" />}
          {title}
        </p>
        {hint && <p className="mt-0.5 text-[11px] leading-relaxed text-labbaik-text-muted">{hint}</p>}
      </div>
      {children}
    </fieldset>
  );
}

function VariableField({ id, label, example, value, bulk, ltr = false, onChange }: { id: string; label: string; example?: string; value: string; bulk: boolean; ltr?: boolean; onChange: (value: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const insert = (token: string) => {
    const input = ref.current;
    const start = input?.selectionStart ?? value.length;
    const end = input?.selectionEnd ?? value.length;
    onChange(`${value.slice(0, start)}${token}${value.slice(end)}`);
    requestAnimationFrame(() => { input?.focus(); input?.setSelectionRange(start + token.length, start + token.length); });
  };
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="flex items-center justify-between gap-2 text-xs font-bold text-labbaik-text-muted">
        <span dir="ltr">{label}</span>
        {example && <span className="font-normal truncate">مثال Meta: {example}</span>}
      </label>
      <input ref={ref} id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={example || 'اكتب القيمة'} className={inputClass} dir={ltr ? 'ltr' : 'auto'} />
      {bulk && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[11px] text-labbaik-text-muted">لكل عميل:</span>
          {CUSTOMER_TOKENS.map((item) => (
            <button
              type="button"
              key={item.token}
              onClick={() => insert(item.token)}
              className="h-6 px-2 rounded-full border border-labbaik-border text-[11px] font-bold text-sky-800 dark:text-sky-200 hover:border-sky-500/50 hover:bg-sky-500/10 cursor-pointer"
            >
              + {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Shrinks large photos before upload: WhatsApp shows ~1600px at most, and proxies often cap request size. */
async function compressImage(file: File) {
  if (!file.type.startsWith('image/') || file.size < 900 * 1024) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86));
    return blob && blob.size < file.size ? new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' }) : file;
  } catch {
    return file;
  }
}

function MediaPicker({
  type,
  media,
  connectionId,
  templateId,
  hasSample,
  onChange,
}: {
  type: MediaType;
  media: HeaderMedia | null;
  connectionId: string;
  templateId: string;
  hasSample: boolean;
  onChange: (media: HeaderMedia | null, previewUrl: string | null) => void;
}) {
  const { showToast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'upload' | 'sample' | null>(null);
  const [progress, setProgress] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [linkMode, setLinkMode] = useState(false);
  const [link, setLink] = useState('');
  const info = MEDIA_LABELS[type];

  const upload = async (picked?: File | null) => {
    if (!picked) return;
    if (!info.accept.split(',').includes(picked.type)) { showToast(`نوع الملف غير مناسب. المطلوب: ${info.noun}.`, 'error'); return; }
    const file = await compressImage(picked);
    if (file.size > info.maxMb * 1024 * 1024) { showToast(`الحد الأقصى ${info.maxMb} ميجابايت.`, 'error'); return; }
    setBusy('upload');
    setProgress(0);
    try {
      const form = new FormData();
      form.append('file', file);
      const { data } = await api.post('/integrations/meta/whatsapp/media', form, {
        params: { connectionId },
        onUploadProgress: (event) => event.total && setProgress(Math.round((event.loaded / event.total) * 100)),
      });
      onChange({ id: data.id, file: data.file, mimeType: data.mimeType, filename: data.filename, type: data.type }, URL.createObjectURL(file));
    } catch (error) {
      const status = (error as { response?: { status?: number } })?.response?.status;
      showToast(status === 413 ? 'الملف أكبر مما يسمح به الخادم. صغّر حجمه وأعد المحاولة.' : errorMessage(error, 'تعذر رفع الملف إلى Meta.'), 'error');
    } finally {
      setBusy(null);
    }
  };

  const applySample = async () => {
    setBusy('sample');
    try {
      const { data } = await api.post(`/integrations/meta/whatsapp/templates/${templateId}/sample-media`);
      const blob = (await api.get(`/integrations/meta/whatsapp/media/${data.file}`, { responseType: 'blob' })).data;
      onChange({ id: data.id, file: data.file, mimeType: data.mimeType, filename: data.filename, type: data.type }, URL.createObjectURL(blob));
    } catch (error) {
      showToast(errorMessage(error, 'تعذر استخدام صورة القالب.'), 'error');
    } finally {
      setBusy(null);
    }
  };

  const applyLink = () => {
    const value = link.trim();
    if (!/^https:\/\/\S+$/i.test(value)) { showToast('أدخل رابطًا عامًا يبدأ بـ https://', 'error'); return; }
    onChange({ link: value, type }, type === 'document' ? null : value);
    setLinkMode(false);
  };

  if (media?.id || media?.link) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2">
        <CheckCircle2 size={16} className="shrink-0 text-emerald-700 dark:text-emerald-300" />
        <span className="flex-1 min-w-0 text-xs font-bold text-emerald-900 dark:text-emerald-200 truncate" dir="auto">
          {media.link ? media.link : `${media.filename || info.noun} · مرفوعة إلى Meta`}
        </span>
        <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-1 text-xs font-bold text-labbaik-blue dark:text-purple-300 hover:underline cursor-pointer"><RefreshCw size={12} /> تغيير</button>
        <button type="button" onClick={() => onChange(null, null)} aria-label="إزالة الملف" className="text-labbaik-text-muted hover:text-red-600 cursor-pointer"><Trash2 size={14} /></button>
        <input ref={fileRef} type="file" accept={info.accept} className="hidden" onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ''; }} />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); void upload(e.dataTransfer.files?.[0]); }}
        disabled={busy !== null}
        className={`w-full rounded-lg border-2 border-dashed px-3 py-4 text-center transition-colors cursor-pointer disabled:cursor-wait ${dragging ? 'border-labbaik-blue bg-labbaik-blue/8' : 'border-labbaik-border hover:border-labbaik-blue/50'}`}
      >
        {busy === 'upload' ? (
          <span className="flex flex-col items-center gap-1.5 text-xs font-bold text-labbaik-blue dark:text-purple-300">
            <Loader2 size={20} className="animate-spin" /> جارٍ الرفع إلى Meta… {progress ? `${progress}%` : ''}
          </span>
        ) : (
          <span className="flex flex-col items-center gap-1 text-xs text-labbaik-text-muted">
            {type === 'image' ? <ImagePlus size={22} className="text-labbaik-blue dark:text-purple-300" /> : <Upload size={22} className="text-labbaik-blue dark:text-purple-300" />}
            <b className="text-sm text-neutral-900 dark:text-white">اختر {info.noun} من جهازك</b>
            أو اسحبها هنا · حتى {info.maxMb} ميجابايت{type === 'image' ? ' · تُضغط الصور الكبيرة تلقائيًا' : ''}
          </span>
        )}
      </button>
      <input ref={fileRef} type="file" accept={info.accept} className="hidden" onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ''; }} />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-bold">
        {hasSample && (
          <button type="button" onClick={() => void applySample()} disabled={busy !== null} className="inline-flex items-center gap-1 text-labbaik-blue dark:text-purple-300 hover:underline disabled:opacity-50 cursor-pointer">
            {busy === 'sample' ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} استخدم {info.noun} القالب المعتمدة
          </button>
        )}
        <button type="button" onClick={() => setLinkMode((v) => !v)} className="inline-flex items-center gap-1 text-labbaik-text-muted hover:text-neutral-900 dark:hover:text-white cursor-pointer">
          <Link2 size={12} /> أو ألصق رابطًا عامًا
        </button>
      </div>
      {linkMode && (
        <div className="flex gap-2">
          <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" dir="ltr" className={inputClass} aria-label="رابط الملف" />
          <button type="button" onClick={applyLink} className="shrink-0 h-10 px-3 rounded-lg bg-labbaik-blue text-labbaik-on-accent text-xs font-black cursor-pointer">اعتماد</button>
        </div>
      )}
    </div>
  );
}

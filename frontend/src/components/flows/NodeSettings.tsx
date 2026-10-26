import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, FileText, Link2, Loader2, Music, Plus, Smile, Trash2, Upload, Video, X } from 'lucide-react';
import api from '../../api/client';
import { EMOJIS } from '../conversations/emojis';
import { useToast } from '../Toast';
import { useAuthedObjectUrl } from '../whatsapp/media';
import {
  errorMessage, LIMITS, MATCH_LABELS, MAX_LIST_ROWS, MAX_REPLY_BUTTONS, MEDIA_KIND_LABELS, NODE_KINDS, TRIGGER_LABELS, uid,
} from './flowModel';
import type { FlowMedia, FlowNode, FlowNodeData, FlowNodeType, FlowOption, KeywordMatch, TriggerType } from './flowModel';

const inputClass = 'w-full h-10 rounded-lg bg-labbaik-surface px-3 text-sm text-labbaik-text placeholder:text-labbaik-text-muted/80 focus:outline-none focus:ring-2 focus:ring-labbaik-blue/30';
const textareaClass = 'w-full rounded-lg bg-labbaik-surface px-3 py-2.5 text-sm leading-relaxed text-labbaik-text placeholder:text-labbaik-text-muted/80 focus:outline-none focus:ring-2 focus:ring-labbaik-blue/30 resize-y';

function Field({ label, hint, counter, children }: { label: string; hint?: ReactNode; counter?: [number, number]; children: ReactNode }) {
  const over = counter && counter[0] > counter[1];
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-bold text-neutral-800 dark:text-neutral-100">{label}</span>
        {counter && <span className={`text-[11px] tabular-nums ${over ? 'font-bold text-red-600 dark:text-red-400' : 'text-labbaik-text-muted'}`}>{counter[0]}/{counter[1]}</span>}
      </div>
      {children}
      {hint && <p className="text-xs leading-relaxed text-labbaik-text-muted">{hint}</p>}
    </div>
  );
}

const VARIABLES = [{ token: '{{name}}', label: 'اسم العميل' }, { token: '{{phone}}', label: 'رقم الجوال' }];

function MessageText({ value, onChange, max, placeholder, rows = 4 }: { value: string; onChange: (value: string) => void; max: number; placeholder?: string; rows?: number }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const insert = (token: string) => {
    const el = ref.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    onChange(value.slice(0, start) + token + value.slice(end));
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(start + token.length, start + token.length); });
  };
  return (
    <Field label="نص الرسالة" counter={[value.length, max]}>
      <textarea ref={ref} dir="auto" rows={rows} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={textareaClass} />
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-labbaik-text-muted">إدراج:</span>
        {VARIABLES.map((variable) => (
          <button key={variable.token} type="button" onClick={() => insert(variable.token)} className="h-7 rounded-md border border-labbaik-border px-2 text-xs font-bold text-labbaik-text hover:border-labbaik-blue/40 hover:text-labbaik-blue cursor-pointer">
            {variable.label}
          </button>
        ))}
        <button type="button" onClick={() => setEmojiOpen((open) => !open)} aria-expanded={emojiOpen} aria-label="إيموجي" title="إيموجي"
          className={`h-7 inline-flex items-center gap-1 rounded-md border px-2 text-xs font-bold cursor-pointer ${emojiOpen ? 'border-labbaik-blue text-labbaik-blue' : 'border-labbaik-border text-labbaik-text hover:border-labbaik-blue/40 hover:text-labbaik-blue'}`}>
          <Smile size={14} /> إيموجي
        </button>
      </div>
      {emojiOpen && (
        <div className="grid grid-cols-8 gap-0.5 rounded-lg border border-labbaik-border bg-labbaik-surface p-1.5" role="grid" aria-label="إيموجي">
          {EMOJIS.map((emoji) => (
            <button type="button" key={emoji} onClick={() => insert(emoji)} aria-label={`إدراج ${emoji}`}
              className="h-8 grid place-items-center rounded-md text-lg hover:bg-labbaik-page cursor-pointer">
              {emoji}
            </button>
          ))}
        </div>
      )}
    </Field>
  );
}

const ACCEPT: Record<FlowMedia['type'], string> = {
  image: 'image/jpeg,image/png',
  video: 'video/mp4,video/3gpp',
  audio: 'audio/aac,audio/mp4,audio/mpeg,audio/amr,audio/ogg',
  document: 'application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain',
};

const formatSize = (bytes?: number) => (!bytes ? '' : bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} ك.ب` : `${(bytes / 1024 / 1024).toFixed(1)} م.ب`);

function MediaField({ media, onChange, types, label, hint }: { media?: FlowMedia | null; onChange: (media: FlowMedia | null) => void; types: FlowMedia['type'][]; label: string; hint: string }) {
  const { showToast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [linkMode, setLinkMode] = useState(false);
  const [link, setLink] = useState('');
  const [linkType, setLinkType] = useState<FlowMedia['type']>(types[0]);
  const preview = useAuthedObjectUrl(media?.file ? `/flows/media/${media.file}` : null);
  const accept = types.map((type) => ACCEPT[type]).join(',');

  const upload = async (file?: File | null) => {
    if (!file) return;
    if (!accept.split(',').includes(file.type)) {
      showToast(`نوع الملف غير مدعوم هنا. المسموح: ${types.map((type) => MEDIA_KIND_LABELS[type]).join('، ')}.`, 'error');
      return;
    }
    setProgress(0);
    try {
      const form = new FormData();
      form.append('file', file);
      const { data } = await api.post<FlowMedia>('/flows/media', form, {
        onUploadProgress: (event) => event.total && setProgress(Math.round((event.loaded / event.total) * 100)),
      });
      onChange(data);
    } catch (error) {
      const status = (error as { response?: { status?: number } })?.response?.status;
      showToast(status === 413 ? 'الملف أكبر من الحد المسموح (16 ميجابايت).' : errorMessage(error, 'تعذر رفع الملف.'), 'error');
    } finally {
      setProgress(null);
    }
  };

  const applyLink = () => {
    const value = link.trim();
    if (!/^https:\/\/\S+\.\S+/i.test(value)) { showToast('أدخل رابطًا عامًا يبدأ بـ https://', 'error'); return; }
    onChange({ link: value, type: linkType });
    setLinkMode(false);
    setLink('');
  };

  if (media) {
    const Icon = media.type === 'video' ? Video : media.type === 'audio' ? Music : media.link ? Link2 : FileText;
    const imageSrc = preview || (media.type === 'image' ? media.link : null);
    return (
      <Field label={label}>
        <div className="overflow-hidden rounded-lg border border-labbaik-border">
          {media.type === 'image' && imageSrc && <img src={imageSrc} alt="" className="max-h-44 w-full object-cover bg-labbaik-page" />}
          <div className="flex items-center gap-2.5 px-3 py-2.5">
            <Icon size={16} className="shrink-0 text-labbaik-text-muted" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-bold text-labbaik-text" dir="auto">{media.filename || media.link}</p>
              <p className="text-[11px] text-labbaik-text-muted">{MEDIA_KIND_LABELS[media.type]}{media.size ? ` · ${formatSize(media.size)}` : ''}{media.link ? ' · رابط' : ''}</p>
            </div>
            <button type="button" onClick={() => fileRef.current?.click()} className="h-8 rounded-md px-2 text-xs font-bold text-labbaik-blue hover:bg-labbaik-blue/10 dark:text-purple-300 cursor-pointer">تغيير</button>
            <button type="button" onClick={() => onChange(null)} aria-label="إزالة المرفق" className="grid h-8 w-8 place-items-center rounded-md text-labbaik-text-muted hover:bg-red-500/10 hover:text-red-600 cursor-pointer"><Trash2 size={15} /></button>
          </div>
        </div>
        <input ref={fileRef} type="file" accept={accept} className="hidden" onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ''; }} />
      </Field>
    );
  }

  return (
    <Field label={label} hint={hint}>
      {linkMode ? (
        <div className="space-y-2 rounded-lg border border-labbaik-border p-2.5">
          <div className="flex gap-1.5">
            {types.map((type) => (
              <button key={type} type="button" onClick={() => setLinkType(type)} className={`h-7 rounded-md px-2.5 text-xs font-bold cursor-pointer ${linkType === type ? 'bg-labbaik-blue text-labbaik-on-accent' : 'text-labbaik-text-muted hover:bg-labbaik-page'}`}>
                {MEDIA_KIND_LABELS[type]}
              </button>
            ))}
          </div>
          <input dir="ltr" value={link} onChange={(e) => setLink(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && applyLink()} placeholder="https://example.com/file.pdf" className={inputClass} autoFocus />
          <div className="flex gap-2">
            <button type="button" onClick={applyLink} className="h-8 rounded-md bg-labbaik-blue px-3 text-xs font-black text-labbaik-on-accent hover:bg-[#553174] cursor-pointer">إضافة الرابط</button>
            <button type="button" onClick={() => setLinkMode(false)} className="h-8 rounded-md px-3 text-xs font-bold text-labbaik-text-muted hover:text-labbaik-text cursor-pointer">إلغاء</button>
          </div>
        </div>
      ) : (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); void upload(e.dataTransfer.files?.[0]); }}
          className={`rounded-lg border border-dashed px-3 py-4 text-center transition-colors ${dragging ? 'border-labbaik-blue bg-labbaik-blue/5' : 'border-[color:var(--color-input-border)]'}`}
        >
          {progress !== null ? (
            <div className="space-y-2">
              <p className="flex items-center justify-center gap-2 text-xs font-bold text-labbaik-text"><Loader2 size={14} className="animate-spin" /> جاري الرفع {progress}%</p>
              <div className="mx-auto h-1 w-40 overflow-hidden rounded-full bg-labbaik-page"><div className="h-full bg-labbaik-blue transition-[width]" style={{ width: `${progress}%` }} /></div>
            </div>
          ) : (
            <>
              <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-1.5 text-sm font-bold text-labbaik-blue hover:underline dark:text-purple-300 cursor-pointer">
                <Upload size={15} /> ارفع {types.map((type) => MEDIA_KIND_LABELS[type]).join(' / ')}
              </button>
              <p className="mt-1 text-xs text-labbaik-text-muted">أو اسحبه هنا · <button type="button" onClick={() => setLinkMode(true)} className="font-bold text-labbaik-text hover:text-labbaik-blue cursor-pointer">استخدم رابطًا</button></p>
            </>
          )}
          <input ref={fileRef} type="file" accept={accept} className="hidden" onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
      )}
    </Field>
  );
}

function OptionsEditor({ options, onChange, max, withDescription }: { options: FlowOption[]; onChange: (options: FlowOption[]) => void; max: number; withDescription: boolean }) {
  const titleMax = withDescription ? LIMITS.rowTitle : LIMITS.button;
  const update = (index: number, patch: Partial<FlowOption>) => onChange(options.map((option, i) => (i === index ? { ...option, ...patch } : option)));
  const move = (index: number, by: number) => {
    const next = [...options];
    const [item] = next.splice(index, 1);
    next.splice(index + by, 0, item);
    onChange(next);
  };
  return (
    <Field label={withDescription ? 'خيارات القائمة' : 'الأزرار'} hint={`حتى ${max} ${withDescription ? 'خيارات' : 'أزرار'} · كل خيار له مخرج على الكانفس تربطه بالخطوة التالية.`}>
      <ol className="space-y-2">
        {options.map((option, index) => (
          <li key={option.id} className="rounded-lg border border-labbaik-border p-2">
            <div className="flex items-center gap-1.5">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-labbaik-page text-[11px] font-black tabular-nums text-labbaik-text-muted">{index + 1}</span>
              <input dir="auto" value={option.label} maxLength={titleMax + 10} onChange={(e) => update(index, { label: e.target.value })} placeholder="اسم الخيار" aria-label={`اسم الخيار ${index + 1}`} className={`${inputClass} h-9`} />
              <span className={`w-9 shrink-0 text-center text-[11px] tabular-nums ${option.label.length > titleMax ? 'font-bold text-red-600 dark:text-red-400' : 'text-labbaik-text-muted'}`}>{option.label.length}/{titleMax}</span>
              <div className="flex shrink-0">
                <button type="button" disabled={index === 0} onClick={() => move(index, -1)} aria-label="تحريك لأعلى" className="grid h-8 w-7 place-items-center rounded-md text-labbaik-text-muted hover:text-labbaik-text disabled:opacity-30 cursor-pointer"><ArrowUp size={14} /></button>
                <button type="button" disabled={index === options.length - 1} onClick={() => move(index, 1)} aria-label="تحريك لأسفل" className="grid h-8 w-7 place-items-center rounded-md text-labbaik-text-muted hover:text-labbaik-text disabled:opacity-30 cursor-pointer"><ArrowDown size={14} /></button>
                <button type="button" onClick={() => onChange(options.filter((_, i) => i !== index))} aria-label={`حذف ${option.label || 'الخيار'}`} className="grid h-8 w-7 place-items-center rounded-md text-labbaik-text-muted hover:text-red-600 cursor-pointer"><X size={15} /></button>
              </div>
            </div>
            {withDescription && (
              <input dir="auto" value={option.description || ''} onChange={(e) => update(index, { description: e.target.value })} placeholder="وصف قصير (اختياري)" aria-label={`وصف الخيار ${index + 1}`} className={`${inputClass} mt-1.5 h-8 text-xs`} />
            )}
          </li>
        ))}
      </ol>
      {options.length < max && (
        <button type="button" onClick={() => onChange([...options, { id: uid('opt'), label: '' }])} className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-[color:var(--color-input-border)] text-sm font-bold text-labbaik-text-muted hover:border-labbaik-blue/50 hover:text-labbaik-blue cursor-pointer">
          <Plus size={15} /> إضافة خيار
        </button>
      )}
    </Field>
  );
}

function KeywordsInput({ keywords, onChange }: { keywords: string[]; onChange: (keywords: string[]) => void }) {
  const [draft, setDraft] = useState('');
  const commit = (value = draft) => {
    const added = value.split(/[,،\n]/).map((word) => word.trim()).filter(Boolean).filter((word) => !keywords.includes(word));
    if (added.length) onChange([...keywords, ...added]);
    setDraft('');
  };
  return (
    <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border border-[color:var(--color-input-border)] bg-labbaik-surface p-1.5 focus-within:ring-2 focus-within:ring-labbaik-blue/30">
      {keywords.map((word) => (
        <span key={word} className="inline-flex h-7 items-center gap-1 rounded-md bg-labbaik-blue/10 ps-2 pe-1 text-xs font-bold text-labbaik-blue dark:text-purple-200">
          {word}
          <button type="button" onClick={() => onChange(keywords.filter((item) => item !== word))} aria-label={`حذف ${word}`} className="grid h-5 w-5 place-items-center rounded hover:bg-labbaik-blue/15 cursor-pointer"><X size={12} /></button>
        </span>
      ))}
      <input
        dir="auto"
        value={draft}
        onChange={(e) => (/[,،]/.test(e.target.value) ? commit(e.target.value) : setDraft(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit(); }
          if (e.key === 'Backspace' && !draft && keywords.length) onChange(keywords.slice(0, -1));
        }}
        onBlur={() => commit()}
        placeholder={keywords.length ? 'أضف كلمة…' : 'اكتب الكلمة واضغط Enter'}
        aria-label="الكلمات المفتاحية"
        className="h-7 min-w-28 flex-1 border-0! bg-transparent px-1 text-sm text-labbaik-text placeholder:text-labbaik-text-muted/80 focus:outline-none"
      />
    </div>
  );
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string; hint?: string }[]; onChange: (value: T) => void }) {
  return (
    <div role="radiogroup" className="space-y-1.5">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={`flex w-full items-start gap-2.5 rounded-lg border px-3 py-2.5 text-start transition-colors cursor-pointer ${active ? 'border-labbaik-blue bg-labbaik-blue/5' : 'border-labbaik-border hover:border-labbaik-blue/30'}`}
          >
            <span className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border-2 ${active ? 'border-labbaik-blue' : 'border-neutral-300 dark:border-neutral-600'}`}>
              {active && <span className="h-1.5 w-1.5 rounded-full bg-labbaik-blue" />}
            </span>
            <span>
              <span className="block text-sm font-bold text-neutral-900 dark:text-white">{option.label}</span>
              {option.hint && <span className="block text-xs leading-relaxed text-labbaik-text-muted">{option.hint}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

const TRIGGER_HINTS: Record<TriggerType, string> = {
  new_conversation: 'أول رسالة من العميل، أو أول رسالة بعد 24 ساعة من آخر تواصل. مناسب لرسالة الترحيب.',
  any_message: 'كل رسالة لا تكون داخل تدفق آخر. يتجاهل الذكاء الاصطناعي تمامًا.',
  keyword: 'عندما تطابق رسالة العميل كلمة تحددها، مثل «العروض» أو «الأسعار».',
};

export default function NodeSettings({ node, onChange, onDelete, onClose }: { node: FlowNode; onChange: (data: Partial<FlowNodeData>) => void; onDelete: () => void; onClose: () => void }) {
  const type = node.type as FlowNodeType;
  const kind = NODE_KINDS[type] || NODE_KINDS.message;
  const Icon = kind.icon;
  const data = node.data;
  const issues = data.issues || [];
  const trigger = data.trigger || { type: 'new_conversation' as TriggerType };

  return (
    <div className="flex h-full flex-col" dir="rtl">
      <div className="flex items-start gap-3 border-b border-labbaik-border px-5 py-4">
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${kind.tone}`}><Icon size={18} /></span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-black text-neutral-900 dark:text-white">{kind.label}</h2>
          <p className="text-xs text-labbaik-text-muted">{kind.hint}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="إغلاق الإعدادات" className="grid h-8 w-8 place-items-center rounded-md text-labbaik-text-muted hover:bg-labbaik-page hover:text-labbaik-text cursor-pointer"><X size={18} /></button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5 custom-scrollbar">
        {issues.length > 0 && (
          <ul className="space-y-1.5">
            {issues.map((issue, index) => (
              <li key={index} className={`flex gap-2 rounded-lg px-3 py-2 text-xs leading-relaxed ${issue.level === 'error' ? 'bg-red-500/10 text-red-800 dark:text-red-200' : 'bg-amber-500/12 text-amber-900 dark:text-amber-200'}`}>
                <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {issue.message}
              </li>
            ))}
          </ul>
        )}

        {type === 'start' && (
          <>
            <Field label="متى يبدأ التدفق؟">
              <Segmented<TriggerType>
                value={trigger.type}
                onChange={(value) => onChange({ trigger: { ...trigger, type: value, match: trigger.match || 'exact', keywords: trigger.keywords || [] } })}
                options={(['new_conversation', 'keyword', 'any_message'] as TriggerType[]).map((value) => ({ value, label: TRIGGER_LABELS[value], hint: TRIGGER_HINTS[value] }))}
              />
            </Field>
            {trigger.type === 'keyword' && (
              <>
                <Field label="الكلمات المفتاحية" hint="افصل بين الكلمات بفاصلة أو Enter. لا يهم الهمزات والتشكيل وحالة الأحرف.">
                  <KeywordsInput keywords={trigger.keywords || []} onChange={(keywords) => onChange({ trigger: { ...trigger, keywords } })} />
                </Field>
                <Field label="طريقة المطابقة">
                  <select value={trigger.match || 'exact'} onChange={(e) => onChange({ trigger: { ...trigger, match: e.target.value as KeywordMatch } })} className={inputClass}>
                    {(Object.keys(MATCH_LABELS) as KeywordMatch[]).map((match) => <option key={match} value={match}>{MATCH_LABELS[match]}</option>)}
                  </select>
                </Field>
              </>
            )}
            <p className="rounded-lg bg-labbaik-page px-3 py-2.5 text-xs leading-relaxed text-labbaik-text-muted">
              أثناء وجود العميل داخل تدفق، تُعامل ردوده كإجابات على الأسئلة. إن تجاهل الخيارات مرتين يخرج من التدفق ويعود الرد للذكاء الاصطناعي.
            </p>
          </>
        )}

        {type === 'message' && (
          <>
            <MessageText value={data.text || ''} max={data.media ? LIMITS.body : LIMITS.text} onChange={(text) => onChange({ text })} placeholder="اكتب الرد… الروابط تظهر بمعاينة تلقائيًا" rows={5} />
            <MediaField
              label="مرفق (اختياري)"
              hint="صورة، فيديو، صوت أو ملف (PDF, Word, Excel). يُرسل مباشرة للعميل، والنص يظهر كتعليق عليه."
              media={data.media}
              types={['image', 'video', 'document', 'audio']}
              onChange={(media) => onChange({ media })}
            />
          </>
        )}

        {(type === 'buttons' || type === 'list') && (
          <>
            {type === 'buttons' && (
              <MediaField label="رأس الرسالة (اختياري)" hint="صورة أو فيديو أو ملف يظهر فوق النص." media={data.media} types={['image', 'video', 'document']} onChange={(media) => onChange({ media })} />
            )}
            <MessageText value={data.text || ''} max={LIMITS.body} onChange={(text) => onChange({ text })} placeholder="السؤال الذي يظهر فوق الخيارات" />
            {type === 'list' && (
              <Field label="نص زر فتح القائمة" counter={[(data.buttonText || '').length, LIMITS.listButton]}>
                <input dir="auto" value={data.buttonText || ''} onChange={(e) => onChange({ buttonText: e.target.value })} className={inputClass} />
              </Field>
            )}
            <OptionsEditor options={data.buttons || []} onChange={(buttons) => onChange({ buttons })} max={type === 'list' ? MAX_LIST_ROWS : MAX_REPLY_BUTTONS} withDescription={type === 'list'} />
            <Field label="تذييل (اختياري)" counter={[(data.footer || '').length, LIMITS.footer]}>
              <input dir="auto" value={data.footer || ''} onChange={(e) => onChange({ footer: e.target.value })} placeholder="نص صغير رمادي أسفل الرسالة" className={inputClass} />
            </Field>
            <p className="rounded-lg bg-labbaik-page px-3 py-2.5 text-xs leading-relaxed text-labbaik-text-muted">
              مخرج «أي رد آخر» يُستخدم إذا كتب العميل شيئًا غير الخيارات. إن تركته غير مربوط تُعاد الرسالة مرة واحدة ثم يخرج العميل من التدفق.
            </p>
          </>
        )}

        {type === 'link' && (
          <>
            <MessageText value={data.text || ''} max={LIMITS.body} onChange={(text) => onChange({ text })} />
            <Field label="نص الزر" counter={[(data.buttonText || '').length, LIMITS.button]}>
              <input dir="auto" value={data.buttonText || ''} onChange={(e) => onChange({ buttonText: e.target.value })} className={inputClass} />
            </Field>
            <Field label="الرابط" hint="يفتح في متصفح العميل عند الضغط على الزر.">
              <input dir="ltr" value={data.url || ''} onChange={(e) => onChange({ url: e.target.value })} placeholder="https://" className={inputClass} />
            </Field>
            <Field label="تذييل (اختياري)" counter={[(data.footer || '').length, LIMITS.footer]}>
              <input dir="auto" value={data.footer || ''} onChange={(e) => onChange({ footer: e.target.value })} className={inputClass} />
            </Field>
          </>
        )}

        {type === 'handoff' && (
          <>
            <MessageText value={data.text || ''} max={LIMITS.text} onChange={(text) => onChange({ text })} placeholder="رسالة للعميل قبل التحويل (اختياري)" />
            <p className="rounded-lg bg-labbaik-page px-3 py-2.5 text-xs leading-relaxed text-labbaik-text-muted">
              ينتهي التدفق ويتوقف الرد الآلي (التدفقات والذكاء الاصطناعي) لهذه المحادثة 24 ساعة حتى يرد الفريق. يمكن إعادة تفعيله من صندوق المحادثات.
            </p>
          </>
        )}

        {type === 'end' && (
          <p className="text-sm leading-relaxed text-labbaik-text-muted">
            ينتهي التدفق هنا. الرسالة التالية من العميل يرد عليها الذكاء الاصطناعي أو تبدأ تدفقًا آخر حسب محفّزه.
          </p>
        )}
      </div>

      {type !== 'start' && (
        <div className="border-t border-labbaik-border px-5 py-3">
          <button type="button" onClick={onDelete} className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-bold text-red-600 hover:bg-red-500/10 dark:text-red-400 cursor-pointer">
            <Trash2 size={15} /> حذف الخطوة
          </button>
        </div>
      )}
    </div>
  );
}

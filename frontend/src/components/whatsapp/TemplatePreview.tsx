import type { ReactNode } from 'react';
import { Copy, ExternalLink, FileText, Image as ImageIcon, Phone, Reply, Video } from 'lucide-react';
import { CUSTOMER_TOKENS, type Template, type TemplateAnalysis, type TemplateValues } from './templateUtils';

/** Renders WhatsApp's *bold*, _italic_ and ~strike~ markers. */
function formatted(text: string, keyPrefix: string): ReactNode[] {
  return text.split(/(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~)/g).map((part, i) => {
    const key = `${keyPrefix}-${i}`;
    if (/^\*[^*]+\*$/.test(part)) return <strong key={key}>{part.slice(1, -1)}</strong>;
    if (/^_[^_]+_$/.test(part)) return <em key={key}>{part.slice(1, -1)}</em>;
    if (/^~[^~]+~$/.test(part)) return <s key={key}>{part.slice(1, -1)}</s>;
    return part;
  });
}

/** Fills {{n}}; customer tokens show as labels and missing values stay visibly highlighted. */
function fill(text: string, values: string[], keyPrefix: string): ReactNode[] {
  return text.split(/(\{\{\d+\}\})/g).flatMap((part, i): ReactNode[] => {
    const match = part.match(/^\{\{(\d+)\}\}$/);
    if (!match) return formatted(part, `${keyPrefix}-t${i}`);
    const value = values[Number(match[1]) - 1]?.trim();
    if (!value) return [<mark key={`${keyPrefix}-${i}`} className="rounded bg-amber-300/50 dark:bg-amber-400/30 px-0.5 text-inherit">{part}</mark>];
    return value.split(/(\{\{customer\.\w+\}\})/g).filter(Boolean).map((segment, j) => {
      const token = CUSTOMER_TOKENS.find((item) => item.token === segment);
      return token
        ? <span key={`${keyPrefix}-${i}-${j}`} className="rounded bg-sky-500/15 px-1 text-sky-800 dark:text-sky-200">{token.label}</span>
        : <b key={`${keyPrefix}-${i}-${j}`} className="font-semibold">{segment}</b>;
    });
  });
}

export default function TemplatePreview({
  template,
  analysis,
  values,
  mediaUrl,
}: {
  template: Template;
  analysis: TemplateAnalysis;
  values: Pick<TemplateValues, 'header' | 'body' | 'buttons' | 'otp'>;
  mediaUrl?: string | null;
}) {
  const body = analysis.isAuth ? analysis.bodyText.replace(/\{\{1\}\}/g, values.otp || '{{1}}') : analysis.bodyText;
  return (
    <div className="rounded-lg bg-[#efeae2] dark:bg-[#0b141a] p-3" aria-label={`معاينة القالب ${template.name}`}>
      <div className="ms-auto max-w-[92%] rounded-lg rounded-tr-sm bg-white dark:bg-[#202c33] text-sm leading-relaxed text-[#111b21] dark:text-[#e9edef] shadow-sm overflow-hidden">
        {analysis.mediaType && <MediaHeader type={analysis.mediaType} url={mediaUrl} />}
        <div className="px-3 py-2 space-y-1.5">
          {analysis.headerText && <p className="font-bold">{fill(analysis.headerText, values.header, 'h')}</p>}
          <p className="whitespace-pre-wrap wrap-break-word">{fill(body, values.body, 'b')}</p>
          {analysis.footerText && <p className="text-xs text-[#667781] dark:text-[#8696a0]">{analysis.footerText}</p>}
        </div>
        {analysis.isAuth ? (
          <PreviewButton icon={<Copy size={14} />} label="نسخ الرمز" />
        ) : analysis.buttons.map((btn, i) => {
          const type = String(btn.type).toUpperCase();
          const icon = type === 'URL' ? <ExternalLink size={14} /> : type === 'PHONE_NUMBER' ? <Phone size={14} /> : type === 'COPY_CODE' ? <Copy size={14} /> : <Reply size={14} />;
          const dynamic = values.buttons.find((b) => b.index === i);
          return <PreviewButton key={i} icon={icon} label={btn.text || 'زر'} hint={dynamic ? (dynamic.text || '{{1}}') : undefined} />;
        })}
      </div>
    </div>
  );
}

function MediaHeader({ type, url }: { type: 'image' | 'video' | 'document'; url?: string | null }) {
  if (url && type === 'image') return <img src={url} alt="صورة ترويسة القالب" className="block w-full max-h-64 object-cover" />;
  if (url && type === 'video') return <video src={url} className="block w-full max-h-64 bg-black" controls muted />;
  const Icon = type === 'image' ? ImageIcon : type === 'video' ? Video : FileText;
  return (
    <div className={`grid place-items-center gap-1 h-36 ${url ? 'bg-[#f0f2f5] dark:bg-[#111b21]' : 'bg-amber-100/70 dark:bg-amber-400/10'} text-[#667781] dark:text-[#8696a0]`}>
      <Icon size={30} strokeWidth={1.5} />
      <span className="text-xs font-bold">{url ? 'مستند PDF مرفق' : type === 'image' ? 'لم تُختر صورة بعد' : type === 'video' ? 'لم يُختر فيديو بعد' : 'لم يُختر ملف بعد'}</span>
    </div>
  );
}

function PreviewButton({ icon, label, hint }: { icon: ReactNode; label: string; hint?: string }) {
  return (
    <div className="border-t border-black/10 dark:border-white/10 px-3 py-2 flex items-center justify-center gap-1.5 text-[13px] font-bold text-[#027eb5] dark:text-[#53bdeb]">
      {icon}{label}
      {hint && <span dir="ltr" className="font-normal text-[11px] text-[#667781] dark:text-[#8696a0] truncate max-w-[45%]">{hint}</span>}
    </div>
  );
}

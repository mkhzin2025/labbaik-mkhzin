import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { AlertTriangle, CornerDownLeft, ExternalLink, FileText, Music, Video } from 'lucide-react';
import { useAuthedObjectUrl } from '../whatsapp/media';
import { FALLBACK_HANDLE, MEDIA_KIND_LABELS, NODE_KINDS, triggerSummary } from './flowModel';
import type { FlowIssue, FlowMedia, FlowNode, FlowNodeType } from './flowModel';

const handleBase = '!h-3 !w-3 !rounded-full !border-2 !border-labbaik-surface !bg-labbaik-blue transition-transform hover:!scale-125';

function MediaThumb({ media }: { media: FlowMedia }) {
  const src = useAuthedObjectUrl(media.file ? `/flows/media/${media.file}` : null) || (media.type === 'image' ? media.link : null);
  if (media.type === 'image' && src) {
    return <img src={src} alt="" className="mb-2.5 h-28 w-full rounded-lg object-cover bg-labbaik-page" draggable={false} />;
  }
  const Icon = media.type === 'video' ? Video : media.type === 'audio' ? Music : FileText;
  return (
    <div className="mb-2.5 flex items-center gap-2 rounded-lg bg-labbaik-page px-2.5 py-2 text-xs text-labbaik-text">
      <Icon size={15} className="shrink-0 text-labbaik-text-muted" />
      <span className="min-w-0 flex-1 truncate font-medium" dir="auto">{media.filename || media.link || MEDIA_KIND_LABELS[media.type]}</span>
    </div>
  );
}

function IssueBadge({ issues }: { issues: FlowIssue[] }) {
  if (!issues.length) return null;
  const isError = issues.some((issue) => issue.level === 'error');
  return (
    <span
      title={issues.map((issue) => issue.message).join('\n')}
      className={`absolute -top-2.5 -left-2.5 grid h-6 min-w-6 place-items-center rounded-full px-1 text-[11px] font-black text-white shadow-[0_2px_6px_rgba(15,10,30,0.25)] ${isError ? 'bg-red-600' : 'bg-amber-500'}`}
    >
      {issues.length > 1 ? issues.length : <AlertTriangle size={12} strokeWidth={2.75} />}
    </span>
  );
}

function FlowNodeCard(props: NodeProps<FlowNode>) {
  const { data, selected, type } = props;
  const kind = NODE_KINDS[(type as FlowNodeType)] || NODE_KINDS.message;
  const Icon = kind.icon;
  const issues = data.issues || [];
  const hasError = issues.some((issue) => issue.level === 'error');
  const options = type === 'buttons' || type === 'list' ? data.buttons || [] : [];
  const text = (data.text || '').trim();
  const hasInput = type !== 'start';
  const hasSingleOutput = type === 'start' || type === 'message' || type === 'link';

  return (
    <div
      dir="rtl"
      className={`relative w-[280px] rounded-xl bg-labbaik-surface text-start transition-shadow
        shadow-[0_1px_2px_rgba(15,10,30,0.06),0_10px_28px_-14px_rgba(15,10,30,0.28)]
        ${selected ? 'ring-2 ring-labbaik-blue' : hasError ? 'ring-1 ring-red-500/60' : 'ring-1 ring-[color:var(--color-labbaik-border)] hover:ring-labbaik-blue/40'}`}
    >
      <IssueBadge issues={issues} />
      {hasInput && <Handle type="target" position={Position.Top} className={handleBase} />}

      <div className="flex items-center gap-2.5 px-3.5 pt-3 pb-2.5">
        <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${kind.tone}`}><Icon size={15} /></span>
        <div className="min-w-0">
          <p className="text-[13px] font-black leading-tight text-neutral-900 dark:text-white">{kind.label}</p>
          {type === 'start' && <p className="truncate text-[11px] text-labbaik-text-muted">{triggerSummary(data.trigger)}</p>}
        </div>
      </div>

      {type !== 'start' && type !== 'end' && (
        <div className="px-3.5 pb-3">
          {data.media && <MediaThumb media={data.media} />}
          {text
            ? <p className="line-clamp-4 whitespace-pre-line text-[12.5px] leading-relaxed text-labbaik-text" dir="auto">{text}</p>
            : !data.media && <p className="text-[12.5px] text-labbaik-text-muted">{type === 'handoff' ? 'يحوّل المحادثة بدون رسالة' : 'لا يوجد نص بعد'}</p>}
          {type === 'link' && (
            <div className="mt-2.5 flex items-center justify-center gap-1.5 rounded-lg border border-labbaik-border py-1.5 text-xs font-bold text-sky-700 dark:text-sky-300">
              <ExternalLink size={13} /> {data.buttonText || 'الرابط'}
            </div>
          )}
          {type === 'handoff' && <p className="mt-2 text-[11px] text-labbaik-text-muted">يتوقف الرد الآلي لهذه المحادثة 24 ساعة.</p>}
        </div>
      )}

      {type === 'end' && <p className="px-3.5 pb-3 text-[12px] text-labbaik-text-muted">ينتهي التدفق هنا، ويعود الرد للذكاء الاصطناعي أو الفريق.</p>}

      {options.length > 0 && (
        <div className="space-y-1.5 border-t border-labbaik-border px-3.5 py-2.5">
          {type === 'list' && <p className="pb-0.5 text-[11px] font-bold text-labbaik-text-muted">زر القائمة: {data.buttonText || '—'}</p>}
          {options.map((option) => (
            <div key={option.id} className="relative flex h-8 items-center justify-center rounded-lg bg-labbaik-page px-3 text-xs font-bold text-labbaik-text">
              <span className="truncate" dir="auto">{option.label || 'خيار بدون اسم'}</span>
              <Handle type="source" id={option.id} position={Position.Left} className={`${handleBase} !-left-[22px]`} />
            </div>
          ))}
          <div className="relative flex h-7 items-center justify-center gap-1.5 rounded-lg border border-dashed border-labbaik-border text-[11px] font-bold text-labbaik-text-muted">
            <CornerDownLeft size={12} /> أي رد آخر
            <Handle type="source" id={FALLBACK_HANDLE} position={Position.Left} className={`${handleBase} !-left-[22px] !bg-neutral-400 dark:!bg-neutral-500`} />
          </div>
        </div>
      )}

      {hasSingleOutput && <Handle type="source" position={Position.Bottom} className={handleBase} />}
    </div>
  );
}

const Card = memo(FlowNodeCard);

export const nodeTypes = {
  start: Card,
  message: Card,
  buttons: Card,
  list: Card,
  link: Card,
  handoff: Card,
  end: Card,
};

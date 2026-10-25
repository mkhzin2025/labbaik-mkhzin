import { useEffect, useRef, useState } from 'react';
import { ExternalLink, FileText, List, Loader2, Music, RotateCcw, Send, Video, X } from 'lucide-react';
import api from '../../api/client';
import { useAuthedObjectUrl } from '../whatsapp/media';
import { errorMessage, previewVariables, triggerSummary } from './flowModel';
import type { FlowEdge, FlowMedia, FlowNode, FlowState, FlowTrigger } from './flowModel';
import { serializeGraph } from './flowModel';

type ChatItem =
  | { id: number; kind: 'customer'; text: string }
  | { id: number; kind: 'bot'; node: FlowNode }
  | { id: number; kind: 'note'; text: string; tone?: 'muted' | 'warn' };

interface SimulateResult {
  triggered: boolean;
  send: FlowNode[];
  state: FlowState | null;
  handoff: boolean;
  released: boolean;
}

function BubbleMedia({ media }: { media: FlowMedia }) {
  const src = useAuthedObjectUrl(media.file ? `/flows/media/${media.file}` : null) || media.link || null;
  if (media.type === 'image' && src) return <img src={src} alt="" className="mb-1.5 max-h-48 w-full rounded-md object-cover" />;
  if (media.type === 'video' && src && media.file) return <video src={src} controls className="mb-1.5 max-h-48 w-full rounded-md" />;
  if (media.type === 'audio' && src && media.file) return <audio src={src} controls className="mb-1.5 w-full" />;
  const Icon = media.type === 'video' ? Video : media.type === 'audio' ? Music : FileText;
  return (
    <div className="mb-1.5 flex items-center gap-2 rounded-md bg-black/5 px-2.5 py-2 text-xs font-bold dark:bg-white/10">
      <Icon size={16} className="shrink-0" /> <span className="truncate" dir="auto">{media.filename || media.link}</span>
    </div>
  );
}

export default function FlowTester({ nodes, edges, trigger, onClose, onFocusNode }: {
  nodes: FlowNode[];
  edges: FlowEdge[];
  trigger?: FlowTrigger;
  onClose: () => void;
  onFocusNode: (id: string) => void;
}) {
  const [items, setItems] = useState<ChatItem[]>([]);
  const [state, setState] = useState<FlowState | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [openList, setOpenList] = useState<number | null>(null);
  const counter = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const next = () => ++counter.current;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [items]);

  const reset = () => { setItems([]); setState(null); setOpenList(null); };

  const send = async (text: string, replyId?: string) => {
    const value = text.trim();
    if (!value || busy) return;
    setDraft('');
    setOpenList(null);
    setItems((current) => [...current, { id: next(), kind: 'customer', text: value }]);
    setBusy(true);
    try {
      const { data } = await api.post<SimulateResult>('/flows/simulate', { ...serializeGraph(nodes, edges), state, input: value, replyId });
      const added: ChatItem[] = [];
      if (!data.triggered) {
        added.push({ id: next(), kind: 'note', tone: 'warn', text: `لم يبدأ التدفق: الرسالة لا تطابق المحفّز (${triggerSummary(trigger)}).` });
      } else if (data.released) {
        added.push({ id: next(), kind: 'note', tone: 'warn', text: 'تجاهل العميل الخيارات مرتين، فخرج من التدفق. الرسالة التالية يرد عليها الذكاء الاصطناعي.' });
      } else {
        data.send.forEach((node) => added.push({ id: next(), kind: 'bot', node }));
        if (data.handoff) added.push({ id: next(), kind: 'note', text: 'حُوّلت المحادثة لموظف وتوقف الرد الآلي.' });
        else if (!data.state) added.push({ id: next(), kind: 'note', text: 'انتهى التدفق.' });
      }
      if (data.send[0]) onFocusNode(data.send[data.send.length - 1].id);
      setItems((current) => [...current, ...added]);
      setState(data.state);
    } catch (error) {
      setItems((current) => [...current, { id: next(), kind: 'note', tone: 'warn', text: errorMessage(error, 'تعذر تشغيل التجربة.') }]);
    } finally {
      setBusy(false);
    }
  };

  const waitingId = state?.nodeId;
  const lastBotIndex = items.map((item) => item.kind).lastIndexOf('bot');

  return (
    <div className="flex h-full flex-col" dir="rtl">
      <div className="flex items-center gap-3 border-b border-labbaik-border px-5 py-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-black text-neutral-900 dark:text-white">تجربة التدفق</h2>
          <p className="truncate text-xs text-labbaik-text-muted">محادثة وهمية بالتعديلات الحالية، بدون إرسال لأي عميل.</p>
        </div>
        <button type="button" onClick={reset} title="إعادة البدء" aria-label="إعادة البدء" className="grid h-8 w-8 place-items-center rounded-md text-labbaik-text-muted hover:bg-labbaik-page hover:text-labbaik-text cursor-pointer"><RotateCcw size={16} /></button>
        <button type="button" onClick={onClose} aria-label="إغلاق التجربة" className="grid h-8 w-8 place-items-center rounded-md text-labbaik-text-muted hover:bg-labbaik-page hover:text-labbaik-text cursor-pointer"><X size={18} /></button>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-2.5 overflow-y-auto bg-labbaik-chat px-4 py-4 custom-scrollbar">
        {items.length === 0 && (
          <div className="mx-auto mt-6 max-w-64 text-center">
            <p className="text-sm font-bold text-labbaik-text">اكتب كما يكتب العميل</p>
            <p className="mt-1 text-xs leading-relaxed text-labbaik-text-muted">
              المحفّز الحالي: {triggerSummary(trigger)}.
              {trigger?.type === 'keyword' ? ' اكتب إحدى الكلمات لتشغيله.' : ' أي رسالة تبدأ التجربة.'}
            </p>
            {trigger?.type === 'keyword' && trigger.keywords?.[0] && (
              <button type="button" onClick={() => void send(trigger.keywords![0])} className="mt-3 h-8 rounded-full border border-labbaik-border bg-labbaik-surface px-3 text-xs font-bold text-labbaik-blue hover:border-labbaik-blue/40 dark:text-purple-300 cursor-pointer">
                جرّب «{trigger.keywords[0]}»
              </button>
            )}
          </div>
        )}

        {items.map((item, index) => {
          if (item.kind === 'note') {
            return <p key={item.id} className={`mx-auto w-fit max-w-[90%] rounded-full px-3 py-1 text-center text-[11px] font-bold ${item.tone === 'warn' ? 'bg-amber-500/15 text-amber-900 dark:text-amber-200' : 'bg-labbaik-surface text-labbaik-text-muted'}`}>{item.text}</p>;
          }
          if (item.kind === 'customer') {
            return (
              <div key={item.id} className="flex justify-start">
                <p className="max-w-[80%] whitespace-pre-line rounded-2xl rounded-ss-sm bg-labbaik-blue px-3 py-2 text-sm text-labbaik-on-accent" dir="auto">{item.text}</p>
              </div>
            );
          }
          const { node } = item;
          const data = node.data;
          const options = data.buttons || [];
          const live = index === lastBotIndex && waitingId === node.id && !busy;
          return (
            <div key={item.id} className="flex flex-col items-end gap-1">
              <button type="button" onClick={() => onFocusNode(node.id)} className="max-w-[85%] rounded-2xl rounded-se-sm bg-labbaik-surface px-3 py-2 text-start text-sm text-labbaik-text shadow-[0_1px_1px_rgba(15,10,30,0.08)] cursor-pointer">
                {data.media && <BubbleMedia media={data.media} />}
                {data.text && <span className="block whitespace-pre-line leading-relaxed" dir="auto">{previewVariables(data.text)}</span>}
                {data.footer && <span className="mt-1 block text-[11px] text-labbaik-text-muted" dir="auto">{data.footer}</span>}
              </button>
              {node.type === 'buttons' && options.map((option) => (
                <button key={option.id} type="button" disabled={!live} onClick={() => void send(option.label, option.id)} className="w-[85%] max-w-64 rounded-xl bg-labbaik-surface py-2 text-center text-sm font-bold text-sky-700 shadow-[0_1px_1px_rgba(15,10,30,0.08)] enabled:hover:bg-sky-500/10 disabled:opacity-60 dark:text-sky-300 cursor-pointer disabled:cursor-default">
                  {option.label}
                </button>
              ))}
              {node.type === 'list' && (
                <>
                  <button type="button" disabled={!live} onClick={() => setOpenList(openList === item.id ? null : item.id)} className="flex w-[85%] max-w-64 items-center justify-center gap-1.5 rounded-xl bg-labbaik-surface py-2 text-sm font-bold text-sky-700 shadow-[0_1px_1px_rgba(15,10,30,0.08)] enabled:hover:bg-sky-500/10 disabled:opacity-60 dark:text-sky-300 cursor-pointer disabled:cursor-default">
                    <List size={15} /> {data.buttonText || 'الخيارات'}
                  </button>
                  {openList === item.id && live && (
                    <div className="w-[85%] max-w-64 overflow-hidden rounded-xl bg-labbaik-surface shadow-[0_4px_16px_-6px_rgba(15,10,30,0.3)]">
                      {options.map((option) => (
                        <button key={option.id} type="button" onClick={() => void send(option.label, option.id)} className="block w-full border-b border-labbaik-border px-3 py-2 text-start last:border-0 hover:bg-labbaik-page cursor-pointer">
                          <span className="block text-sm font-bold text-labbaik-text" dir="auto">{option.label}</span>
                          {option.description && <span className="block text-xs text-labbaik-text-muted" dir="auto">{option.description}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
              {node.type === 'link' && (
                <a href={data.url} target="_blank" rel="noreferrer" className="flex w-[85%] max-w-64 items-center justify-center gap-1.5 rounded-xl bg-labbaik-surface py-2 text-sm font-bold text-sky-700 shadow-[0_1px_1px_rgba(15,10,30,0.08)] hover:bg-sky-500/10 dark:text-sky-300">
                  <ExternalLink size={14} /> {data.buttonText || 'فتح الرابط'}
                </a>
              )}
            </div>
          );
        })}
        {busy && <div className="flex justify-end"><span className="rounded-2xl bg-labbaik-surface px-3 py-2"><Loader2 size={14} className="animate-spin text-labbaik-text-muted" /></span></div>}
      </div>

      <form onSubmit={(e) => { e.preventDefault(); void send(draft); }} className="flex items-center gap-2 border-t border-labbaik-border px-3 py-3">
        <input dir="auto" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="اكتب رسالة العميل…" aria-label="رسالة العميل" className="h-10 flex-1 rounded-full bg-labbaik-surface px-4 text-sm text-labbaik-text placeholder:text-labbaik-text-muted/80 focus:outline-none focus:ring-2 focus:ring-labbaik-blue/30" />
        <button type="submit" disabled={!draft.trim() || busy} aria-label="إرسال" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-labbaik-blue text-labbaik-on-accent hover:bg-[#553174] disabled:opacity-40 cursor-pointer">
          <Send size={16} className="-scale-x-100" />
        </button>
      </form>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Loader2, Mic, Pencil, Plus, Send, Smile, StickyNote, Trash2, X, Zap } from 'lucide-react';
import api from '../../api/client';
import { useToast } from '../Toast';

export interface QuickReply {
  id: string;
  shortcut: string;
  text: string;
}

const EMOJIS = [
  '😊', '😂', '🙏', '👍', '❤️', '🌷', '🌹', '✨', '🎉', '👏', '🤝', '💐',
  '😍', '🥰', '😉', '😅', '🤔', '😔', '😢', '😮', '🙌', '💯', '✅', '❌',
  '📦', '🚚', '🛒', '🛍️', '💳', '💰', '🏷️', '🎁', '📍', '📞', '⏰', '📅',
  '👋', '🤗', '☺️', '😁', '🙂', '👌', '💪', '🔥', '⭐', '🌟', '☕', '🍃',
];

const SHORTCUT_RE = /^[\p{L}\p{N}_-]{1,32}$/u;
const MIN_SUGGEST_CHARS = 2;
const MAX_SUGGESTIONS = 5;
const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

interface ComposerProps {
  onSend: (text: string) => Promise<void> | void;
  disabled?: boolean;
}

/**
 * Message box for the inbox: multi-line text (Enter sends, Shift+Enter breaks a line), emoji picker,
 * and team-shared quick replies triggered by typing "/" or from the notes button.
 * Attachments and voice notes are shown as "coming soon" until media sending exists on the server.
 */
export default function Composer({ onSend, disabled = false }: ComposerProps) {
  const { showToast } = useToast();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [replies, setReplies] = useState<QuickReply[]>([]);
  const [panel, setPanel] = useState<'none' | 'quick' | 'emoji'>('none');
  const [activeIndex, setActiveIndex] = useState(0);
  const [managing, setManaging] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.get('/stores/me').then(({ data }) => setReplies(Array.isArray(data?.quickReplies) ? data.quickReplies : [])).catch(() => setReplies([]));
  }, []);

  // Grow with content up to ~6 lines.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  useEffect(() => {
    if (panel === 'none') return;
    const close = (event: MouseEvent) => { if (!rootRef.current?.contains(event.target as Node)) setPanel('none'); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [panel]);

  // "/" at the start of the box (no space yet) filters quick replies by what follows it.
  const slashQuery = /^\/(\S*)$/.exec(text)?.[1];
  // Plain typing also suggests replies whose shortcut or text starts like the message, without taking over Enter.
  const typedQuery = slashQuery === undefined && !text.includes('\n') && text.trim().length >= MIN_SUGGEST_CHARS ? text.trim().toLowerCase() : '';
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);
  const [navigated, setNavigated] = useState(false);
  const suggestions = useMemo(() => {
    if (!typedQuery || typedQuery === dismissedFor) return [];
    const starts = replies.filter((r) => r.shortcut.toLowerCase().startsWith(typedQuery) || r.text.toLowerCase().startsWith(typedQuery));
    const contains = typedQuery.length >= 3
      ? replies.filter((r) => !starts.includes(r) && (r.shortcut.toLowerCase().includes(typedQuery) || r.text.toLowerCase().includes(typedQuery)))
      : [];
    return [...starts, ...contains].filter((r) => r.text.trim().toLowerCase() !== typedQuery).slice(0, MAX_SUGGESTIONS);
  }, [replies, typedQuery, dismissedFor]);
  const suggesting = panel === 'none' && slashQuery === undefined && suggestions.length > 0;
  const quickOpen = panel === 'quick' || slashQuery !== undefined || suggesting;
  const matches = useMemo(() => {
    if (suggesting) return suggestions;
    const q = (slashQuery ?? '').toLowerCase();
    if (!q) return replies;
    return replies.filter((r) => r.shortcut.toLowerCase().includes(q) || r.text.toLowerCase().includes(q));
  }, [replies, slashQuery, suggesting, suggestions]);

  useEffect(() => { setActiveIndex(0); setNavigated(false); }, [slashQuery, typedQuery, panel]);

  const focusEnd = () => requestAnimationFrame(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  });

  const insertReply = (reply: QuickReply) => {
    // A suggestion replaces the words that triggered it; the notes button appends to what is already written.
    setText(slashQuery !== undefined || suggesting ? reply.text : (text ? `${text}${text.endsWith(' ') || text.endsWith('\n') ? '' : ' '}${reply.text}` : reply.text));
    setPanel('none');
    focusEnd();
  };

  const insertEmoji = (emoji: string) => {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    const next = text.slice(0, start) + emoji + text.slice(end);
    setText(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  };

  const send = useCallback(async () => {
    const value = text.trim();
    if (!value || sending || disabled) return;
    setSending(true);
    setText('');
    try {
      await onSend(value);
    } catch {
      setText(value); // keep what was typed if sending failed
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  }, [text, sending, disabled, onSend]);

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (quickOpen && matches.length) {
      if (event.key === 'ArrowDown') { event.preventDefault(); setNavigated(true); setActiveIndex((i) => (i + 1) % matches.length); return; }
      if (event.key === 'ArrowUp') { event.preventDefault(); setNavigated(true); setActiveIndex((i) => (i - 1 + matches.length) % matches.length); return; }
      // While suggesting from plain typing, Enter still sends unless the user picked a suggestion with the arrows.
      const enterPicks = event.key === 'Enter' && !event.shiftKey && (!suggesting || navigated);
      if (event.key === 'Tab' || enterPicks) { event.preventDefault(); insertReply(matches[activeIndex]); return; }
    }
    if (event.key === 'Escape' && (quickOpen || panel !== 'none')) {
      event.preventDefault();
      if (suggesting) setDismissedFor(typedQuery);
      setPanel('none');
      if (slashQuery !== undefined) setText('');
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  };

  const saveReplies = async (next: QuickReply[]) => {
    const { data } = await api.patch('/stores/me', { quickReplies: next });
    setReplies(Array.isArray(data?.quickReplies) ? data.quickReplies : next);
  };

  const iconButton = 'grid h-10 w-10 shrink-0 place-items-center rounded-lg text-labbaik-text-muted hover:text-labbaik-blue hover:bg-labbaik-blue/10 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-labbaik-text-muted';

  return (
    <div ref={rootRef} className="relative max-w-5xl mx-auto">
      {/* Quick replies popover */}
      {quickOpen && (
        <div className="absolute bottom-full mb-2 inset-x-0 rounded-xl border border-labbaik-border bg-labbaik-surface shadow-[0_16px_40px_-12px_rgba(15,10,30,0.35)] z-30 overflow-hidden" role="listbox" aria-label="الردود السريعة">
          <div className="flex items-center justify-between px-3 py-2 border-b border-labbaik-border">
            <span className="flex items-center gap-1.5 text-xs font-bold text-labbaik-text-muted"><Zap size={13} /> {suggesting ? 'ردود سريعة مقترحة' : 'الردود السريعة'}{slashQuery ? <span dir="ltr">· /{slashQuery}</span> : ''}</span>
            <button type="button" onClick={() => { setManaging(true); setPanel('none'); }} className="inline-flex items-center gap-1 text-xs font-bold text-labbaik-blue dark:text-purple-300 hover:underline cursor-pointer">
              <Pencil size={12} /> إدارة
            </button>
          </div>
          <ul className="max-h-64 overflow-y-auto custom-scrollbar p-1">
            {matches.map((reply, i) => (
              <li key={reply.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={i === activeIndex}
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={() => insertReply(reply)}
                  className={`w-full text-right flex items-start gap-3 px-2.5 py-2 rounded-lg cursor-pointer ${i === activeIndex ? 'bg-labbaik-blue/10' : ''}`}
                >
                  <span className="shrink-0 mt-0.5 h-5 px-1.5 rounded bg-labbaik-page text-[11px] font-bold text-labbaik-blue dark:text-purple-300" dir="ltr">/{reply.shortcut}</span>
                  <span className="flex-1 min-w-0 text-sm text-neutral-800 dark:text-neutral-100 line-clamp-2">{reply.text}</span>
                </button>
              </li>
            ))}
            {!matches.length && (
              <li className="px-3 py-5 text-center text-sm text-labbaik-text-muted">
                {replies.length ? 'لا يوجد رد يطابق ما كتبته.' : 'لا توجد ردود سريعة بعد.'}{' '}
                <button type="button" onClick={() => { setManaging(true); setPanel('none'); }} className="font-bold text-labbaik-blue dark:text-purple-300 hover:underline cursor-pointer">أضف ردًا</button>
              </li>
            )}
          </ul>
          <p className="px-3 py-1.5 border-t border-labbaik-border text-[11px] text-labbaik-text-muted">
            {suggesting ? 'Tab لإدراج المقترح · ↑↓ ثم Enter لاختيار غيره · Enter وحده يرسل ما كتبته · Esc للإخفاء' : '↑↓ للتنقل · Enter للإدراج · Esc للإغلاق'}
          </p>
        </div>
      )}

      {/* Emoji popover */}
      {panel === 'emoji' && (
        <div className="absolute bottom-full mb-2 left-0 w-72 rounded-xl border border-labbaik-border bg-labbaik-surface p-2 shadow-[0_16px_40px_-12px_rgba(15,10,30,0.35)] z-30">
          <div className="grid grid-cols-8 gap-0.5" role="grid" aria-label="إيموجي">
            {EMOJIS.map((emoji) => (
              <button type="button" key={emoji} onClick={() => insertEmoji(emoji)} className="h-8 w-8 grid place-items-center rounded-md text-lg hover:bg-labbaik-page cursor-pointer" aria-label={`إدراج ${emoji}`}>
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-end gap-2">
        <div className="flex-1 min-w-0 flex items-end gap-1 rounded-2xl border border-labbaik-border bg-labbaik-page px-1.5 py-1 focus-within:border-labbaik-blue focus-within:ring-2 focus-within:ring-labbaik-blue/20 transition-colors">
          <button type="button" disabled title="إرفاق صورة أو ملف (قريبًا)" aria-label="إرفاق ملف، قريبًا" className={iconButton}><Plus size={19} /></button>
          <textarea
            ref={textareaRef}
            rows={1}
            value={text}
            disabled={disabled}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="اكتب رسالة... أو «/» للردود السريعة"
            aria-label="نص الرد"
            className="flex-1 min-w-0 resize-none bg-transparent py-2.5 px-1 text-sm leading-6 text-neutral-900 dark:text-white focus:outline-none placeholder:text-labbaik-text-muted max-h-40"
          />
          <button type="button" onClick={() => setPanel(panel === 'quick' ? 'none' : 'quick')} aria-label="الردود السريعة" aria-expanded={panel === 'quick'} title="الردود السريعة" className={iconButton}><StickyNote size={18} /></button>
          <button type="button" onClick={() => setPanel(panel === 'emoji' ? 'none' : 'emoji')} aria-label="إيموجي" aria-expanded={panel === 'emoji'} title="إيموجي" className={iconButton}><Smile size={18} /></button>
        </div>
        {text.trim() ? (
          <button
            type="button"
            onClick={() => void send()}
            disabled={sending || disabled}
            aria-label="إرسال"
            className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-labbaik-blue text-labbaik-on-accent hover:bg-[#553174] disabled:opacity-40 cursor-pointer"
          >
            {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={19} className="-scale-x-100" />}
          </button>
        ) : (
          <button type="button" disabled title="رسالة صوتية (قريبًا)" aria-label="رسالة صوتية، قريبًا" className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-labbaik-border text-labbaik-text-muted opacity-60 cursor-not-allowed">
            <Mic size={19} />
          </button>
        )}
      </div>

      {managing && <QuickRepliesManager replies={replies} onClose={() => setManaging(false)} onSave={saveReplies} onError={(m) => showToast(m, 'error')} onSaved={(m) => showToast(m, 'success')} />}
    </div>
  );
}

function QuickRepliesManager({ replies, onClose, onSave, onError, onSaved }: {
  replies: QuickReply[];
  onClose: () => void;
  onSave: (next: QuickReply[]) => Promise<void>;
  onError: (message: string) => void;
  onSaved: (message: string) => void;
}) {
  const [shortcut, setShortcut] = useState('');
  const [body, setBody] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const esc = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);

  const cleanShortcut = shortcut.trim().replace(/^\//, '');
  const shortcutValid = SHORTCUT_RE.test(cleanShortcut);
  const duplicate = replies.some((r) => r.shortcut.toLowerCase() === cleanShortcut.toLowerCase() && r.id !== editingId);

  const persist = async (next: QuickReply[], message: string) => {
    setSaving(true);
    try {
      await onSave(next);
      onSaved(message);
      return true;
    } catch (error) {
      const msg = (error as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
      onError(Array.isArray(msg) ? msg.join('، ') : msg || 'تعذر حفظ الردود السريعة.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const submit = async () => {
    if (!shortcutValid || duplicate || !body.trim()) return;
    const entry = { id: editingId || newId(), shortcut: cleanShortcut, text: body.trim() };
    const next = editingId ? replies.map((r) => (r.id === editingId ? entry : r)) : [...replies, entry];
    if (await persist(next, editingId ? 'تم تعديل الرد.' : 'تمت إضافة الرد.')) {
      setShortcut('');
      setBody('');
      setEditingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="qr-title" dir="rtl">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-xl max-h-[85vh] flex flex-col rounded-2xl border border-labbaik-border bg-labbaik-surface shadow-[0_24px_48px_-16px_rgba(15,10,30,0.45)] animate-slide-up">
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-labbaik-border">
          <div>
            <h2 id="qr-title" className="text-lg font-black text-neutral-900 dark:text-white">الردود السريعة</h2>
            <p className="text-sm text-labbaik-text-muted">مشتركة لكل الفريق. اكتب «/» ثم الاختصار في خانة الرد لإدراجها.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="grid h-9 w-9 place-items-center rounded-lg text-labbaik-text-muted hover:text-neutral-900 dark:hover:text-white cursor-pointer"><X size={18} /></button>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="px-5 py-4 border-b border-labbaik-border space-y-2.5">
          <div className="grid grid-cols-[140px_1fr] gap-2">
            <div>
              <label htmlFor="qr-shortcut" className="text-xs font-bold text-labbaik-text-muted">الاختصار</label>
              <div className="relative mt-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-labbaik-text-muted" dir="ltr">/</span>
                <input id="qr-shortcut" value={shortcut} onChange={(e) => setShortcut(e.target.value.replace(/\s/g, ''))} maxLength={33} placeholder="شكرا" className="w-full h-10 rounded-lg border border-labbaik-border bg-labbaik-page pl-6 pr-3 text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-labbaik-blue/30 focus:border-labbaik-blue placeholder:text-labbaik-text-muted" />
              </div>
            </div>
            <div>
              <label htmlFor="qr-text" className="text-xs font-bold text-labbaik-text-muted">نص الرد</label>
              <textarea id="qr-text" value={body} onChange={(e) => setBody(e.target.value)} maxLength={1000} rows={2} placeholder="شكرًا لتواصلك معنا، يسعدنا خدمتك 🌷" className="mt-1 w-full rounded-lg border border-labbaik-border bg-labbaik-page px-3 py-2 text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-labbaik-blue/30 focus:border-labbaik-blue placeholder:text-labbaik-text-muted resize-y" />
            </div>
          </div>
          {shortcut && !shortcutValid && <p className="text-xs font-bold text-red-700 dark:text-red-400">الاختصار حروف أو أرقام أو _ أو - فقط، بدون مسافات.</p>}
          {duplicate && <p className="text-xs font-bold text-red-700 dark:text-red-400">هذا الاختصار مستخدم في رد آخر.</p>}
          <div className="flex justify-end gap-2">
            {editingId && <button type="button" onClick={() => { setEditingId(null); setShortcut(''); setBody(''); }} className="h-9 px-3 rounded-lg text-sm font-bold text-labbaik-text-muted cursor-pointer">إلغاء التعديل</button>}
            <button type="submit" disabled={saving || !shortcutValid || duplicate || !body.trim()} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-labbaik-blue text-labbaik-on-accent text-sm font-black hover:bg-[#553174] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">
              {saving ? <Loader2 size={15} className="animate-spin" /> : editingId ? <Pencil size={15} /> : <Plus size={15} />} {editingId ? 'حفظ التعديل' : 'إضافة'}
            </button>
          </div>
        </form>

        <ul className="flex-1 overflow-y-auto custom-scrollbar divide-y divide-labbaik-border">
          {replies.map((reply) => (
            <li key={reply.id} className="flex items-start gap-3 px-5 py-3">
              <span className="shrink-0 mt-0.5 h-5 px-1.5 rounded bg-labbaik-page text-[11px] font-bold text-labbaik-blue dark:text-purple-300" dir="ltr">/{reply.shortcut}</span>
              <p className="flex-1 min-w-0 text-sm text-neutral-800 dark:text-neutral-100 whitespace-pre-line">{reply.text}</p>
              <div className="flex items-center gap-0.5 shrink-0">
                <button type="button" onClick={() => { setEditingId(reply.id); setShortcut(reply.shortcut); setBody(reply.text); }} aria-label={`تعديل /${reply.shortcut}`} className="grid h-8 w-8 place-items-center rounded-md text-labbaik-text-muted hover:text-labbaik-blue hover:bg-labbaik-blue/10 cursor-pointer"><Pencil size={14} /></button>
                <button type="button" disabled={saving} onClick={() => void persist(replies.filter((r) => r.id !== reply.id), 'تم حذف الرد.')} aria-label={`حذف /${reply.shortcut}`} className="grid h-8 w-8 place-items-center rounded-md text-labbaik-text-muted hover:text-red-600 hover:bg-red-500/10 disabled:opacity-50 cursor-pointer"><Trash2 size={14} /></button>
              </div>
            </li>
          ))}
          {!replies.length && <li className="px-5 py-10 text-center text-sm text-labbaik-text-muted">لا توجد ردود بعد. أضف أول رد من الأعلى.</li>}
        </ul>
      </div>
    </div>
  );
}

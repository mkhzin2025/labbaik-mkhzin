import { useState, useEffect, useRef } from 'react';
import api from '../api/client';
import {
  Bell,
  MessageSquare,
  Star,
  AlertTriangle,
  CheckCheck,
  Loader2,
  Monitor,
  Volume2,
  VolumeX
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ar } from 'date-fns/locale';
import { toEnglishDigits } from '@/lib/utils';
import { Link, useNavigate } from 'react-router-dom';

const SOUND_PREF_KEY = 'labbaik_notification_sound';

let audioContext: AudioContext | null = null;

const getAudioContext = () => {
  const Ctx = window.AudioContext || (window as any).webkitAudioContext;
  if (!Ctx) return null;
  if (!audioContext) audioContext = new Ctx();
  return audioContext;
};

const isSoundUnlocked = () => audioContext?.state === 'running';

// Must be called from a user gesture (click/key): browsers keep audio blocked until then.
const unlockNotificationSound = async () => {
  const ctx = getAudioContext();
  if (!ctx) return false;
  try {
    if (ctx.state !== 'running') await ctx.resume();
    // Play a silent buffer so Safari/iOS fully unlocks the context.
    const source = ctx.createBufferSource();
    source.buffer = ctx.createBuffer(1, 1, 22050);
    source.connect(ctx.destination);
    source.start(0);
  } catch {
    return false;
  }
  return ctx.state === 'running';
};

const readSoundPref = () => {
  try { return localStorage.getItem(SOUND_PREF_KEY) !== 'off'; } catch { return true; }
};

// Two-tone chime generated locally, so it doesn't depend on an external audio file.
const playNotificationSound = () => {
  const ctx = getAudioContext();
  if (!ctx || ctx.state !== 'running') return false;
  const now = ctx.currentTime;
  [880, 1320].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const start = now + i * 0.16;
    osc.type = 'triangle';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.5, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.37);
  });
  return true;
};

interface Notification {
  id: string;
  type: 'new_message' | 'new_review' | 'system_alert' | 'channel_error';
  title: string;
  message: string;
  link: string;
  isRead: boolean;
  createdAt: string;
}

export default function NotificationCenter({ socket }: { socket: any }) {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [browserPermission, setBrowserPermission] = useState<NotificationPermission>(
    typeof window !== 'undefined' && 'Notification' in window ? window.Notification.permission : 'denied'
  );
  const [soundEnabled, setSoundEnabled] = useState(readSoundPref);
  const [soundUnlocked, setSoundUnlocked] = useState(isSoundUnlocked);
  const soundEnabledRef = useRef(soundEnabled);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const unreadCount = notifications.filter(n => !n.isRead).length;

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
    try { localStorage.setItem(SOUND_PREF_KEY, soundEnabled ? 'on' : 'off'); } catch { }
  }, [soundEnabled]);

  useEffect(() => {
    fetchNotifications();

    // Browsers block audio until the user interacts with the page; keep trying on every gesture until unlocked.
    const events = ['pointerdown', 'keydown', 'touchstart'] as const;
    const unlock = async () => {
      if (await unlockNotificationSound()) {
        setSoundUnlocked(true);
        events.forEach(e => window.removeEventListener(e, unlock));
      }
    };
    events.forEach(e => window.addEventListener(e, unlock));

    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      events.forEach(e => window.removeEventListener(e, unlock));
    };
  }, []);

  useEffect(() => {
    if (!socket) return;

    const onNotification = (newNotif: Notification) => {
      setNotifications(prev => [newNotif, ...prev]);
      showBrowserNotification(newNotif.title, newNotif.message, newNotif.id);
    };

    // Incoming customer messages (outgoing ones have from 'me', system notes have from 'system').
    const onNewMessage = (payload: any) => {
      if (!payload || payload.from === 'me' || payload.from === 'system' || payload.isManual) return;
      const sender = payload.customerName || payload.from || payload.customerPhone || 'عميل';
      const body = payload.text || 'رسالة جديدة';
      showBrowserNotification(`رسالة جديدة من ${sender}`, body, `msg_${payload.from}_${payload.timestamp || Date.now()}`, '/dashboard/conversations');
    };

    socket.on('notification', onNotification);
    socket.on('new_message', onNewMessage);
    return () => {
      socket.off('notification', onNotification);
      socket.off('new_message', onNewMessage);
    };
  }, [socket]);

  const fetchNotifications = async () => {
    try {
      const { data } = await api.get('/notifications');
      setNotifications(data);
      setLoading(false);
    } catch (error) {
      console.error('Error:', error);
      setLoading(false);
    }
  };

  const requestPermission = async () => {
    if (!('Notification' in window)) return;
    unlockNotificationSound();
    const result = await window.Notification.requestPermission();
    setBrowserPermission(result);
    if (result === 'granted') {
      new window.Notification("لبيك الذكي", { body: "تم تفعيل إشعارات سطح المكتب بنجاح! 🎉" });
    }
  };

  const enableSound = async () => {
    const ok = await unlockNotificationSound();
    setSoundUnlocked(ok);
    setSoundEnabled(true);
    if (ok) playNotificationSound();
  };

  const showBrowserNotification = (title: string, body: string, tag: string, link?: string) => {
    const played = soundEnabledRef.current && playNotificationSound();

    if ('Notification' in window && window.Notification.permission === 'granted' && document.hidden) {
      try {
        // If the page sound is blocked, let the OS play its notification sound instead.
        const n = new window.Notification(title, { body, tag, dir: 'rtl', icon: '/favicon.svg', silent: played || !soundEnabledRef.current });
        n.onclick = () => {
          window.focus();
          setIsOpen(false);
          if (link) navigate(link);
          n.close();
        };
      } catch {
        // Some mobile browsers only allow notifications through a service worker.
      }
    }
  };

  const markAllAsRead = async () => {
    try {
      await api.patch('/notifications/read-all');
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    } catch (e) { }
  };

  const markAsRead = async (id: string) => {
    try {
      await api.patch(`/notifications/${id}/read`);
      setNotifications(prev => prev.map(n => n.id === id ? ({ ...n, isRead: true }) : n));
    } catch (e) { }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'new_message': return <MessageSquare className="text-labbaik-blue" size={16} />;
      case 'new_review': return <Star className="text-yellow-500" size={16} />;
      case 'channel_error': return <AlertTriangle className="text-red-500" size={16} />;
      default: return <Bell className="text-gray-400" size={16} />;
    }
  };

  return (
    <div className="relative flex items-center gap-2" ref={dropdownRef}>
      {soundEnabled && !soundUnlocked && (
        <button
          onClick={enableSound}
          className="hidden sm:flex items-center gap-1.5 h-10 rounded-lg border border-amber-400/50 bg-amber-50 px-3 text-xs font-bold text-amber-800 transition-colors hover:bg-amber-100 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-300 cursor-pointer"
          title="المتصفح يمنع الصوت حتى تضغط على الصفحة"
        >
          <VolumeX size={14} /> تفعيل الصوت
        </button>
      )}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative grid h-10 w-10 place-items-center rounded-lg border border-labbaik-border text-neutral-600 dark:text-neutral-300 hover:text-labbaik-blue hover:border-labbaik-blue/40 dark:hover:text-white transition-colors cursor-pointer"
        aria-label={unreadCount > 0 ? `مركز التنبيهات، ${unreadCount} غير مقروءة` : 'مركز التنبيهات'}
        aria-expanded={isOpen}
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute -top-1.5 -left-1.5 min-w-5 h-5 px-1 bg-red-600 text-white text-[11px] font-black rounded-full flex items-center justify-center ring-2 ring-labbaik-surface tabular-nums">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="fixed left-4 right-4 top-[4.5rem] z-[100] flex max-h-[calc(100vh-5.5rem)] flex-col overflow-hidden rounded-xl border border-labbaik-border bg-labbaik-surface shadow-[0_16px_40px_-12px_rgba(15,10,30,0.35)] animate-fade-in lg:left-6 lg:right-auto lg:w-96 text-neutral-900 dark:text-white">

          {/* Permission Prompt Header */}
          {browserPermission !== 'granted' && (
            <div className="bg-labbaik-blue/10 px-4 py-3 border-b border-labbaik-border flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Monitor className="text-labbaik-blue" size={18} />
                <p className="text-xs font-bold text-neutral-700 dark:text-neutral-200">إشعارات سطح المكتب معطلة</p>
              </div>
              <button
                onClick={requestPermission}
                className="bg-labbaik-blue text-labbaik-on-accent h-8 px-3 rounded-md text-xs font-bold hover:bg-[#553174] transition-colors cursor-pointer"
              >
                تفعيل الآن
              </button>
            </div>
          )}

          <div className="px-4 py-2.5 border-b border-labbaik-border flex items-center justify-between gap-3">
            <button
              onClick={() => (soundEnabled ? setSoundEnabled(false) : enableSound())}
              className="flex items-center gap-2 text-xs font-bold text-neutral-700 dark:text-neutral-200 hover:text-labbaik-blue transition-colors cursor-pointer"
            >
              {soundEnabled ? <Volume2 size={14} className="text-labbaik-blue" /> : <VolumeX size={14} />}
              صوت الإشعارات: {soundEnabled ? 'مفعل' : 'مغلق'}
            </button>
            {soundEnabled && (
              <button onClick={enableSound} className="text-xs font-bold text-labbaik-blue dark:text-purple-300 hover:underline cursor-pointer">
                اختبار الصوت
              </button>
            )}
          </div>

          <div className="px-4 py-3 border-b border-labbaik-border flex items-center justify-between">
            <h3 className="text-sm font-black text-neutral-900 dark:text-white">مركز التنبيهات</h3>
            <button onClick={markAllAsRead} disabled={unreadCount === 0} className="text-xs font-bold text-labbaik-text-muted hover:text-labbaik-blue disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1 cursor-pointer">
              <CheckCheck size={12} /> تحديد الكل كمقروء
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar">
            {loading ? (
              <div className="p-10 text-center"><Loader2 size={24} className="animate-spin text-labbaik-blue mx-auto" /></div>
            ) : notifications.length === 0 ? (
              <div className="p-10 text-center text-labbaik-text-muted text-sm"><Bell size={28} strokeWidth={1.5} className="mx-auto mb-2" />لا توجد تنبيهات.</div>
            ) : (
              notifications.map((notif) => (
                <Link
                  key={notif.id}
                  to={notif.link || '/dashboard'}
                  onClick={() => { if (!notif.isRead) void markAsRead(notif.id); setIsOpen(false); }}
                  className={`px-4 py-3 border-b border-labbaik-border flex gap-3 transition-colors hover:bg-labbaik-page ${!notif.isRead ? 'bg-labbaik-blue/5' : ''}`}
                >
                  <div className="mt-0.5 shrink-0">{getIcon(notif.type)}</div>
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="flex justify-between items-start gap-2">
                      <h4 className={`text-sm ${!notif.isRead ? 'font-bold text-neutral-900 dark:text-white' : 'font-medium text-neutral-700 dark:text-neutral-300'}`}>{notif.title}</h4>
                      <span className="shrink-0 text-[11px] text-labbaik-text-muted">{toEnglishDigits(formatDistanceToNow(new Date(notif.createdAt), { addSuffix: true, locale: ar }))}</span>
                    </div>
                    <p className="text-xs text-labbaik-text-muted leading-relaxed line-clamp-2">{notif.message}</p>
                  </div>
                  {!notif.isRead && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-labbaik-blue" aria-label="غير مقروء" />}
                </Link>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}



import { useState, useEffect, useRef } from 'react';
import api from '../api/client';
import {
  Bell,
  MessageSquare,
  Star,
  AlertTriangle,
  ExternalLink,
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
          className="flex items-center gap-1.5 rounded-2xl border border-amber-300/70 bg-amber-50 px-3 py-2 text-[11px] font-black text-amber-700 shadow-sm transition-all hover:scale-105 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-300 animate-pulse"
          title="المتصفح يمنع الصوت حتى تضغط على الصفحة"
        >
          <VolumeX size={14} /> تفعيل الصوت
        </button>
      )}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2.5 lg:p-3 bg-labbaik-surface border border-purple-100/80 dark:border-white/10 rounded-2xl text-neutral-600 hover:bg-labbaik-blue/10 hover:border-labbaik-blue/30 hover:text-labbaik-blue dark:text-neutral-300 dark:hover:bg-white/10 dark:hover:text-white transition-all shadow-sm hover:scale-105"
        aria-label="مركز التنبيهات"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-labbaik-blue text-labbaik-on-accent text-[10px] font-black rounded-full flex items-center justify-center border-2 border-labbaik-surface animate-bounce shadow-sm">
            {unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="fixed left-4 right-4 top-24 z-[100] mt-0 flex max-h-[calc(100vh-7rem)] flex-col overflow-hidden rounded-3xl border border-purple-100/80 dark:border-white/10 bg-labbaik-surface shadow-2xl animate-fade-in lg:left-8 lg:right-auto lg:w-96 lg:max-w-96 text-neutral-900 dark:text-white">

          {/* Permission Prompt Header */}
          {browserPermission !== 'granted' && (
            <div className="bg-labbaik-blue/10 p-4 border-b border-labbaik-blue/20 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Monitor className="text-labbaik-blue" size={18} />
                <p className="text-[10px] font-black text-neutral-600 dark:text-neutral-300">إشعارات سطح المكتب معطلة</p>
              </div>
              <button
                onClick={requestPermission}
                className="bg-labbaik-blue text-labbaik-on-accent px-3 py-1.5 rounded-lg text-[9px] font-black hover:scale-105 transition-all shadow-sm"
              >
                تفعيل الآن
              </button>
            </div>
          )}

          <div className="px-6 py-3 border-b border-purple-100/60 dark:border-white/10 flex items-center justify-between gap-3">
            <button
              onClick={() => (soundEnabled ? setSoundEnabled(false) : enableSound())}
              className="flex items-center gap-2 text-[11px] font-black text-neutral-600 dark:text-neutral-300 hover:text-labbaik-blue transition-colors"
            >
              {soundEnabled ? <Volume2 size={14} className="text-labbaik-blue" /> : <VolumeX size={14} />}
              صوت الإشعارات: {soundEnabled ? 'مفعل' : 'مغلق'}
            </button>
            {soundEnabled && (
              <button onClick={enableSound} className="text-[10px] font-bold text-labbaik-blue hover:underline">
                اختبار الصوت
              </button>
            )}
          </div>

          <div className="p-6 border-b border-purple-100/60 dark:border-white/10 flex items-center justify-between">
            <h3 className="text-sm font-black text-neutral-900 dark:text-white">مركز التنبيهات</h3>
            <button onClick={markAllAsRead} className="text-[10px] font-bold text-neutral-500 hover:text-labbaik-blue transition-colors flex items-center gap-1">
              <CheckCheck size={12} /> تحديد الكل كمقروء
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar">
            {loading ? (
              <div className="p-10 text-center"><Loader2 size={24} className="animate-spin text-labbaik-blue mx-auto" /></div>
            ) : notifications.length === 0 ? (
              <div className="p-10 text-center text-neutral-500 text-xs font-bold italic">لا توجد تنبيهات جديدة.</div>
            ) : (
              notifications.map((notif) => (
                <div
                  key={notif.id}
                  onClick={() => markAsRead(notif.id)}
                  className={`p-5 border-b border-purple-100/40 dark:border-white/5 flex gap-4 transition-all hover:bg-labbaik-blue/5 dark:hover:bg-white/5 cursor-pointer ${!notif.isRead ? 'bg-labbaik-blue/10' : ''}`}
                >
                  <div className="mt-1">{getIcon(notif.type)}</div>
                  <div className="flex-1 space-y-1">
                    <div className="flex justify-between items-start">
                      <h4 className={`text-xs font-black ${!notif.isRead ? 'text-neutral-900 dark:text-white' : 'text-neutral-500 dark:text-neutral-400'}`}>{notif.title}</h4>
                      <span className="text-[9px] text-neutral-400 dark:text-neutral-500 font-bold">{toEnglishDigits(formatDistanceToNow(new Date(notif.createdAt), { addSuffix: true, locale: ar }))}</span>
                    </div>
                    <p className="text-[11px] text-neutral-600 dark:text-neutral-400 font-medium leading-relaxed">{notif.message}</p>
                    <Link to={notif.link} onClick={() => setIsOpen(false)} className="inline-flex items-center gap-1 text-[9px] font-black text-labbaik-blue uppercase tracking-widest pt-2 hover:underline">
                      عرض التفاصيل <ExternalLink size={10} />
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}



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
  Monitor
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ar } from 'date-fns/locale';
import { toEnglishDigits } from '@/lib/utils';
import { Link } from 'react-router-dom';

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
  const [browserPermission, setBrowserPermission] = useState<NotificationPermission>(Notification.permission);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter(n => !n.isRead).length;

  useEffect(() => {
    fetchNotifications();

    if (socket) {
      socket.on('notification', (newNotif: Notification) => {
        setNotifications(prev => [newNotif, ...prev]);
        showBrowserNotification(newNotif);
      });
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
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
    const result = await Notification.requestPermission();
    setBrowserPermission(result);
    if (result === 'granted') {
      new Notification("لبيك الذكي", { body: "تم تفعيل إشعارات سطح المكتب بنجاح! 🎉" });
    }
  };

  const playNotificationSound = () => {
    const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3');
    audio.play().catch(() => console.log('Audio blocked'));
  };

  const showBrowserNotification = (notif: Notification) => {
    playNotificationSound();

    if (Notification.permission === 'granted') {
      const n = new Notification(notif.title, {
        body: notif.message,
        tag: notif.id,
        dir: 'rtl'
      });
      n.onclick = () => {
        window.focus();
        setIsOpen(false);
      };
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
    <div className="relative" ref={dropdownRef}>
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



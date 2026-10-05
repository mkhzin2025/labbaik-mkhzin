import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import {
  LayoutDashboard,
  MessageSquare,
  Share2,
  Star,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronDown,
  PanelRightClose,
  PanelRightOpen,
  Users,
  GitBranch,
  Moon,
  Sun,
  MessageSquareText,
  WalletCards,
  BadgeDollarSign,
  Trash2,
} from 'lucide-react';

import LogoImage from '../assets/logos/logo.png';
import LogoAltImage from '../assets/logos/logo-alt.png';
import NotificationCenter from './NotificationCenter';
import CustomerAvatar from './CustomerAvatar';
import { getApiBaseUrl } from '../api/baseUrl';
import api from '../api/client';
import { useTheme } from '../context/ThemeContext';

interface NavItem {
  icon: React.ReactNode;
  label: string;
  path: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const COLLAPSED_KEY = 'sidebar_collapsed';

const readCollapsed = () => {
  try { return localStorage.getItem(COLLAPSED_KEY) === '1'; } catch { return false; }
};

// The dashboard root matches exactly; every other section also owns its sub-routes (e.g. /flows/:id).
const isActivePath = (pathname: string, path: string) =>
  path === '/dashboard' ? pathname === path || pathname === `${path}/` : pathname === path || pathname.startsWith(`${path}/`);

const SidebarItem = ({ item, active, isCollapsed, onNavigate }: { item: NavItem; active: boolean; isCollapsed: boolean; onNavigate: () => void }) => (
  <Link
    to={item.path}
    onClick={onNavigate}
    title={isCollapsed ? item.label : undefined}
    aria-current={active ? 'page' : undefined}
    className={`flex h-10 items-center gap-3 px-3 rounded-lg text-sm transition-colors ${isCollapsed ? 'lg:justify-center lg:px-0' : ''} ${
      active
        ? 'bg-labbaik-blue text-labbaik-on-accent font-bold'
        : 'font-medium text-neutral-700 dark:text-neutral-200 hover:bg-labbaik-blue/10 hover:text-labbaik-blue dark:hover:text-white'
    }`}
  >
    <span className={`shrink-0 ${active ? '' : 'text-labbaik-blue dark:text-purple-300'}`}>{item.icon}</span>
    <span className={`truncate ${isCollapsed ? 'lg:sr-only' : ''}`}>{item.label}</span>
  </Link>
);

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [isCollapsed, setCollapsed] = useState(readCollapsed);
  const [isUserMenuOpen, setUserMenuOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isPlatformAdmin, setPlatformAdmin] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const isConversationsPage = location.pathname === '/dashboard/conversations';
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const sidebarLogo = theme === 'light' ? LogoAltImage : LogoImage;
  const roleLabel = user.role === 'admin' ? 'مدير النظام' : 'موظف';

  useEffect(() => {
    try { localStorage.setItem(COLLAPSED_KEY, isCollapsed ? '1' : '0'); } catch { /* storage unavailable */ }
  }, [isCollapsed]);

  useEffect(() => {
    if ('Notification' in window && window.Notification.permission === 'default') {
      window.Notification.requestPermission().catch(() => {});
    }
    const token = localStorage.getItem('access_token');
    if (token) {
      const newSocket = io(getApiBaseUrl(), {
        auth: { token },
        query: { token }
      });
      setSocket(newSocket);
      return () => { newSocket.disconnect(); };
    }
  }, []);

  useEffect(() => {
    api.get('/billing/admin/me').then(() => setPlatformAdmin(true)).catch(() => setPlatformAdmin(false));
  }, []);

  // Close the mobile drawer and the user menu on Escape (links close them on click).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setSidebarOpen(false);
      setUserMenuOpen(false);
    };
    const onClick = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) setUserMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, []);

  const navGroups: NavGroup[] = [
    {
      label: 'التواصل',
      items: [
        { icon: <LayoutDashboard size={18} />, label: 'الرئيسية', path: '/dashboard' },
        { icon: <MessageSquare size={18} />, label: 'المحادثات', path: '/dashboard/conversations' },
        { icon: <Users size={18} />, label: 'العملاء', path: '/dashboard/customers' },
        { icon: <Star size={18} />, label: 'التقييمات', path: '/dashboard/reviews' },
      ],
    },
    {
      label: 'الأتمتة والقنوات',
      items: [
        { icon: <GitBranch size={18} />, label: 'التدفقات', path: '/dashboard/flows' },
        { icon: <MessageSquareText size={18} />, label: 'قوالب وقوائم الإرسال', path: '/dashboard/whatsapp-templates' },
        { icon: <Share2 size={18} />, label: 'القنوات', path: '/dashboard/channels' },
      ],
    },
    {
      label: 'الحساب',
      items: [
        { icon: <BarChart3 size={18} />, label: 'التقارير', path: '/dashboard/analytics' },
        { icon: <WalletCards size={18} />, label: 'الباقات والفوترة', path: '/dashboard/billing' },
        { icon: <Settings size={18} />, label: 'الإعدادات', path: '/dashboard/settings' },
      ],
    },
    ...(isPlatformAdmin
      ? [{
          label: 'إدارة المنصة',
          items: [
            { icon: <BadgeDollarSign size={18} />, label: 'إدارة الاشتراكات', path: '/dashboard/billing-admin' },
            { icon: <Trash2 size={18} />, label: 'طلبات حذف الحساب', path: '/dashboard/deletion-requests' },
          ],
        }]
      : []),
  ];

  const currentPage = navGroups.flatMap((group) => group.items).find((item) => isActivePath(location.pathname, item.path));

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('user');
    localStorage.removeItem('organization');
    navigate('/login');
  };

  const iconButton = 'grid h-10 w-10 place-items-center rounded-lg border border-labbaik-border text-neutral-600 dark:text-neutral-300 hover:text-labbaik-blue hover:border-labbaik-blue/40 dark:hover:text-white transition-colors cursor-pointer';

  return (
    <div className="h-screen bg-labbaik-page flex text-neutral-900 dark:text-white font-sans overflow-hidden" dir="rtl">
      {isSidebarOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-label="إغلاق القائمة الجانبية"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 right-0 z-50 h-screen flex flex-col bg-labbaik-surface border-l border-labbaik-border transition-[transform,width] duration-200 ease-out ${isCollapsed ? 'lg:w-[72px]' : 'lg:w-64'} w-64 ${isSidebarOpen ? 'translate-x-0' : 'translate-x-full'} lg:relative lg:translate-x-0`}
        aria-label="القائمة الجانبية"
      >
        <div className={`h-16 shrink-0 flex items-center border-b border-labbaik-border ${isCollapsed ? 'lg:justify-center px-4 lg:px-0 justify-between' : 'justify-between px-4'}`}>
          <Link to="/dashboard" className={`${isCollapsed ? 'lg:hidden' : ''} flex items-center`} aria-label="لبيك - الرئيسية">
            <img src={sidebarLogo} alt="" className="h-9 w-auto object-contain" />
          </Link>
          <button
            type="button"
            onClick={() => setCollapsed(!isCollapsed)}
            className="hidden lg:grid h-9 w-9 place-items-center rounded-lg text-labbaik-text-muted hover:text-labbaik-blue hover:bg-labbaik-blue/10 transition-colors cursor-pointer"
            aria-label={isCollapsed ? 'توسيع الشريط الجانبي' : 'طي الشريط الجانبي'}
            aria-expanded={!isCollapsed}
            title={isCollapsed ? 'توسيع الشريط الجانبي' : 'طي الشريط الجانبي'}
          >
            {isCollapsed ? <PanelRightOpen size={18} /> : <PanelRightClose size={18} />}
          </button>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden grid h-9 w-9 place-items-center rounded-lg text-labbaik-text-muted hover:text-neutral-900 dark:hover:text-white cursor-pointer"
            aria-label="إغلاق القائمة الجانبية"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar px-3 py-4 space-y-5" aria-label="التنقل الرئيسي">
          {/* Collapsing only applies on desktop (lg:); the mobile drawer always shows labels. */}
          {navGroups.map((group, groupIndex) => (
            <div key={group.label}>
              <p className={`px-3 mb-1.5 text-[11px] font-bold text-labbaik-text-muted ${isCollapsed ? 'lg:hidden' : ''}`}>{group.label}</p>
              {isCollapsed && groupIndex > 0 && <div className="hidden lg:block mx-2 mb-3 border-t border-labbaik-border" />}
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <SidebarItem
                    key={item.path}
                    item={item}
                    active={isActivePath(location.pathname, item.path)}
                    isCollapsed={isCollapsed}
                    onNavigate={() => setSidebarOpen(false)}
                  />
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="shrink-0 border-t border-labbaik-border p-3">
          <button
            type="button"
            onClick={handleLogout}
            title={isCollapsed ? 'تسجيل الخروج' : undefined}
            className={`w-full flex h-10 items-center rounded-lg text-sm font-medium text-neutral-700 dark:text-neutral-200 hover:text-red-600 hover:bg-red-500/10 dark:hover:text-red-400 transition-colors cursor-pointer ${isCollapsed ? 'lg:justify-center gap-3 px-3 lg:px-0' : 'gap-3 px-3'}`}
          >
            <LogOut size={18} className="shrink-0 -scale-x-100" />
            <span className={isCollapsed ? 'lg:sr-only' : ''}>تسجيل الخروج</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        <header className="h-16 shrink-0 z-30 flex items-center justify-between gap-3 px-4 lg:px-6 bg-labbaik-surface border-b border-labbaik-border">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              className={`lg:hidden ${iconButton}`}
              onClick={() => setSidebarOpen(true)}
              aria-label="فتح القائمة الجانبية"
              aria-expanded={isSidebarOpen}
            >
              <Menu size={20} />
            </button>
            <h1 className="text-lg font-black text-neutral-900 dark:text-white truncate">{currentPage?.label || 'لوحة التحكم'}</h1>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleTheme}
              className={iconButton}
              aria-label={theme === 'light' ? 'تفعيل الوضع الداكن' : 'تفعيل الوضع الفاتح'}
              title={theme === 'light' ? 'الوضع الداكن' : 'الوضع الفاتح'}
            >
              {theme === 'light' ? <Moon size={18} /> : <Sun size={18} className="text-amber-500" />}
            </button>
            <NotificationCenter socket={socket} />
            <span className="hidden sm:block h-6 w-px bg-labbaik-border mx-1" />
            <div className="relative" ref={userMenuRef}>
              <button
                type="button"
                onClick={() => setUserMenuOpen(!isUserMenuOpen)}
                aria-haspopup="menu"
                aria-expanded={isUserMenuOpen}
                aria-label="قائمة الحساب"
                className="flex items-center gap-2.5 h-10 ps-1 pe-2 rounded-lg hover:bg-labbaik-page transition-colors cursor-pointer"
              >
                <CustomerAvatar name={user.fullName} seed={user.email || user.id} size={32} className="rounded-full" />
                <span className="hidden sm:block text-right leading-tight">
                  <span className="block text-sm font-bold text-neutral-900 dark:text-white max-w-36 truncate">{user.fullName || 'المستخدم'}</span>
                  <span className="block text-[11px] text-labbaik-text-muted">{roleLabel}</span>
                </span>
                <ChevronDown size={14} className={`hidden sm:block text-labbaik-text-muted transition-transform ${isUserMenuOpen ? 'rotate-180' : ''}`} />
              </button>
              {isUserMenuOpen && (
                <div role="menu" className="absolute left-0 mt-2 w-60 rounded-xl border border-labbaik-border bg-labbaik-surface p-1.5 shadow-[0_16px_40px_-12px_rgba(15,10,30,0.35)] z-50 animate-fade-in">
                  <div className="px-3 py-2 border-b border-labbaik-border mb-1">
                    <p className="text-sm font-bold text-neutral-900 dark:text-white truncate">{user.fullName || 'المستخدم'}</p>
                    {user.email && <p className="text-xs text-labbaik-text-muted truncate" dir="ltr" style={{ textAlign: 'right' }}>{user.email}</p>}
                  </div>
                  <Link role="menuitem" onClick={() => setUserMenuOpen(false)} to="/dashboard/settings" className="flex items-center gap-2.5 h-9 px-3 rounded-lg text-sm text-neutral-700 dark:text-neutral-200 hover:bg-labbaik-page">
                    <Settings size={16} className="text-labbaik-text-muted" /> الإعدادات
                  </Link>
                  <Link role="menuitem" onClick={() => setUserMenuOpen(false)} to="/dashboard/billing" className="flex items-center gap-2.5 h-9 px-3 rounded-lg text-sm text-neutral-700 dark:text-neutral-200 hover:bg-labbaik-page">
                    <WalletCards size={16} className="text-labbaik-text-muted" /> الباقات والفوترة
                  </Link>
                  <button role="menuitem" type="button" onClick={handleLogout} className="w-full flex items-center gap-2.5 h-9 px-3 rounded-lg text-sm text-red-600 dark:text-red-400 hover:bg-red-500/10 cursor-pointer">
                    <LogOut size={16} className="-scale-x-100" /> تسجيل الخروج
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className={`flex-1 ${isConversationsPage ? 'min-h-0 overflow-hidden bg-labbaik-surface' : 'overflow-y-auto p-4 sm:p-6 lg:p-8 custom-scrollbar'}`}>
          <div className={isConversationsPage ? 'h-full min-h-0 w-full' : 'max-w-7xl mx-auto'}>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

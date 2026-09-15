import React, { useState, useEffect } from 'react';
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
  User,
  ChevronLeft,
  PanelRightClose,
  PanelRightOpen,
  Users,
  GitBranch,
  Moon,
  Sun,
  MessageSquareText,
  WalletCards,
  BadgeDollarSign
} from 'lucide-react';
import LogoImage from '../assets/logos/logo.png';
import LogoAltImage from '../assets/logos/logo-alt.png';
import NotificationCenter from './NotificationCenter';
import { getApiBaseUrl } from '../api/baseUrl';
import api from '../api/client';
import { useTheme } from '../context/ThemeContext';

interface SidebarItemProps {
  icon: React.ReactNode;
  label: string;
  path: string;
  active: boolean;
  isCollapsed: boolean;
  onNavigate: () => void;
}

const SidebarItem = ({ icon, label, path, active, isCollapsed, onNavigate }: SidebarItemProps) => (
  <Link
    to={path}
    onClick={onNavigate}
    title={isCollapsed ? label : undefined}
    className={`flex min-h-12 items-center rounded-2xl transition-all duration-200 group relative border focus-visible:ring-2 focus-visible:ring-labbaik-blue ${
      isCollapsed ? 'justify-center p-3.5' : 'gap-4 px-4 py-3.5'
    } ${
      active
        ? 'bg-labbaik-blue text-white border-labbaik-blue shadow-lg shadow-labbaik-blue/25 font-bold'
        : 'border-transparent hover:bg-purple-100/80 hover:border-purple-200 dark:hover:bg-white/10 dark:hover:border-white/15'
    }`}
    aria-label={label}
  >
    <div className={`transition-transform duration-200 group-hover:scale-110 shrink-0 ${
      active 
        ? 'text-white' 
        : 'text-labbaik-blue dark:text-purple-400 group-hover:text-labbaik-blue dark:group-hover:text-white'
    }`}>
      {icon}
    </div>

    {!isCollapsed && (
      <>
        <span
          className={`font-bold text-sm whitespace-nowrap overflow-hidden transition-colors ${
            active
              ? 'text-white'
              : 'text-slate-800 dark:text-slate-200 group-hover:!text-labbaik-blue dark:group-hover:!text-white'
          }`}
        >
          {label}
        </span>
        {active && <ChevronLeft className="mr-auto h-4 w-4 shrink-0 text-white" />}
      </>
    )}
  </Link>
);

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [isCollapsed, setCollapsed] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isPlatformAdmin, setPlatformAdmin] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const sidebarLogo = theme === 'light' ? LogoAltImage : LogoImage;

  useEffect(() => {
    if (Notification.permission === 'default') {
      Notification.requestPermission();
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

  const menuItems = [
    { icon: <LayoutDashboard size={22} />, label: 'الرئيسية', path: '/dashboard' },
    { icon: <MessageSquare size={22} />, label: 'المحادثات', path: '/dashboard/conversations' },
    { icon: <Users size={22} />, label: 'العملاء', path: '/dashboard/customers' },
    { icon: <GitBranch size={22} />, label: 'التدفقات', path: '/dashboard/flows' },
    { icon: <Share2 size={22} />, label: 'القنوات', path: '/dashboard/channels' },
    { icon: <MessageSquareText size={22} />, label: 'قوالب وقوائم الإرسال', path: '/dashboard/whatsapp-templates' },
    { icon: <Star size={22} />, label: 'التقييمات', path: '/dashboard/reviews' },
    { icon: <WalletCards size={22} />, label: 'الباقات والفوترة', path: '/dashboard/billing' },
    ...(isPlatformAdmin ? [{ icon: <BadgeDollarSign size={22} />, label: 'إدارة الاشتراكات', path: '/dashboard/billing-admin' }] : []),
    { icon: <BarChart3 size={22} />, label: 'التقارير', path: '/dashboard/analytics' },
    { icon: <Settings size={22} />, label: 'الإعدادات', path: '/dashboard/settings' },
  ];

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  return (
    <div className="h-screen bg-labbaik-page flex text-neutral-900 dark:text-white font-sans selection:bg-labbaik-blue/30 overflow-hidden" dir="rtl">
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
        className={`fixed inset-y-0 right-0 z-50 bg-labbaik-surface border-l border-purple-100/60 dark:border-white/10 transition-transform duration-300 ease-in-out transform shadow-2xl h-screen flex flex-col ${isCollapsed ? 'w-24' : 'w-72'
          } ${isSidebarOpen ? 'translate-x-0' : 'translate-x-full'
          } lg:relative lg:translate-x-0`}
      >
        <div className={`flex-1 flex flex-col p-6 no-scrollbar ${isCollapsed ? 'overflow-visible' : 'overflow-y-auto overflow-x-hidden'}`}>
          <div className={`flex items-center mb-12 shrink-0 transition-all duration-500 ${isCollapsed ? 'flex-col gap-6' : 'justify-between px-2'}`}>
            <div className={`transition-all duration-500 flex items-center justify-center ${isCollapsed ? 'w-12 h-12' : 'w-24'}`}>
              <img src={sidebarLogo} alt="Logo" className="w-full h-auto object-contain" />
            </div>

            <button
              onClick={() => setCollapsed(!isCollapsed)}
              className="hidden lg:flex p-2.5 hover:bg-labbaik-blue/10 dark:hover:bg-white/5 rounded-2xl text-neutral-500 dark:text-neutral-400 hover:text-labbaik-blue dark:hover:text-white transition-all hover:scale-105"
              aria-label={isCollapsed ? 'توسيع الشريط الجانبي' : 'طي الشريط الجانبي'}
              aria-expanded={!isCollapsed}
            >
              {isCollapsed ? <PanelRightOpen size={20} /> : <PanelRightClose size={20} />}
            </button>
          </div>

          <nav className="flex-1 space-y-2" aria-label="التنقل الرئيسي">
            {menuItems.map((item) => (
              <SidebarItem
                key={item.path}
                {...item}
                active={location.pathname === item.path}
                isCollapsed={isCollapsed}
                onNavigate={() => setSidebarOpen(false)}
              />
            ))}
          </nav>

          <div className="pt-8 border-t border-purple-100/50 dark:border-white/10 shrink-0">
            <button
              onClick={handleLogout}
              className={`w-full flex items-center text-neutral-600 dark:text-neutral-300 hover:text-red-500 hover:bg-red-500/10 rounded-2xl transition-all font-bold text-sm group ${isCollapsed ? 'justify-center p-3.5' : 'gap-4 px-4 py-4'
                }`}
              aria-label="تسجيل الخروج"
            >
              <LogOut size={22} className="text-neutral-500 dark:text-neutral-300 group-hover:text-red-500 group-hover:scale-110 transition-all" />
              {!isCollapsed && <span>تسجيل الخروج</span>}
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        <header className="h-16 lg:h-24 bg-labbaik-surface/80 backdrop-blur-md border-b border-purple-100/60 dark:border-white/10 flex items-center justify-between px-6 lg:px-10 shrink-0 z-40">
          <div className="flex items-center gap-4">
            <button
              className="lg:hidden text-neutral-600 dark:text-neutral-300 hover:bg-labbaik-blue/10 hover:text-labbaik-blue p-2.5 rounded-2xl transition-all"
              onClick={() => setSidebarOpen(!isSidebarOpen)}
              aria-label={isSidebarOpen ? 'إغلاق القائمة الجانبية' : 'فتح القائمة الجانبية'}
              aria-expanded={isSidebarOpen}
            >
              {isSidebarOpen ? <X size={28} /> : <Menu size={28} />}
            </button>
            <div className="hidden lg:block text-right">
              <h2 className="text-xl font-black tracking-tight leading-none text-neutral-900 dark:text-white">أهلاً بك، {user.fullName || 'أدمن'} 👋</h2>
              <p className="text-xs text-neutral-500 dark:text-neutral-300 mt-2 font-medium">نحن نراقب كل شيء من أجلك.</p>
            </div>
          </div>

          <div className="flex items-center gap-3 lg:gap-5">
            <button
              onClick={toggleTheme}
              className="p-2.5 lg:p-3 bg-labbaik-surface border border-purple-100/80 dark:border-white/10 rounded-2xl text-neutral-600 hover:bg-labbaik-blue/10 hover:border-labbaik-blue/30 hover:text-labbaik-blue dark:text-neutral-300 dark:hover:bg-white/10 dark:hover:text-white transition-all shadow-sm hover:scale-105"
              aria-label={theme === 'light' ? 'تفعيل الوضع الداكن' : 'تفعيل الوضع الفاتح'}
            >
              {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
            </button>
            <NotificationCenter socket={socket} />
            <div className="h-10 w-px bg-purple-100 dark:bg-white/10 hidden lg:block"></div>
            <div className="flex items-center gap-4">
              <div className="text-left hidden sm:block">
                <p className="text-sm font-black leading-none text-neutral-900 dark:text-white">{user.fullName}</p>
                <p className="text-[10px] text-neutral-500 dark:text-neutral-300 mt-1.5 uppercase tracking-widest font-bold">
                  {user.role === 'admin' ? 'مدير النظام' : 'موظف'}
                </p>
              </div>
              <button className="w-10 h-10 lg:w-12 lg:h-12 bg-gradient-to-br from-labbaik-blue/20 to-labbaik-blue/5 border border-labbaik-blue/20 rounded-2xl flex items-center justify-center overflow-hidden shadow-md shadow-labbaik-blue/10 hover:border-labbaik-blue hover:scale-105 hover:shadow-lg transition-all cursor-pointer group" aria-label="ملف المستخدم">
                <User size={22} className="text-labbaik-blue group-hover:scale-110 transition-transform" />
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-10 custom-scrollbar bg-labbaik-page/50">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}



import React from 'react';
import { Link } from 'react-router-dom';
import { Sun, Moon, ShieldCheck, Mail, ArrowRight, UserCheck } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import LogoImage from '../../assets/logos/logo.png';
import LogoAltImage from '../../assets/logos/logo-alt.png';

interface PublicLayoutProps {
  children: React.ReactNode;
}

export default function PublicLayout({ children }: PublicLayoutProps) {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="min-h-screen flex flex-col bg-neutral-50 dark:bg-[#0c0d12] text-neutral-900 dark:text-white transition-colors duration-300" dir="rtl">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-30 bg-white/80 dark:bg-[#0c0d12]/80 backdrop-blur-md border-b border-neutral-200 dark:border-white/10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 sm:h-20 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-3 group">
            <img
              src={theme === 'dark' ? LogoImage : LogoAltImage}
              alt="Labbaik Logo"
              className="h-9 sm:h-11 w-auto object-contain transition-transform group-hover:scale-105"
            />
            <div className="flex flex-col">
              <span className="text-lg sm:text-xl font-black text-labbaik-blue tracking-tight">لَبَّيْك</span>
              <span className="text-[10px] text-neutral-500 font-bold -mt-1">نظام الرد والتواصل الذكي</span>
            </div>
          </Link>

          <nav className="flex items-center gap-2 sm:gap-4">
            <Link
              to="/privacy"
              className="text-xs font-bold text-neutral-600 dark:text-neutral-300 hover:text-labbaik-blue dark:hover:text-labbaik-blue transition-colors px-2.5 py-1.5 rounded-xl hover:bg-neutral-100 dark:hover:bg-white/5"
            >
              الخصوصية
            </Link>
            <Link
              to="/terms"
              className="text-xs font-bold text-neutral-600 dark:text-neutral-300 hover:text-labbaik-blue dark:hover:text-labbaik-blue transition-colors px-2.5 py-1.5 rounded-xl hover:bg-neutral-100 dark:hover:bg-white/5"
            >
              شروط الخدمة
            </Link>
            <Link
              to="/account-deletion"
              className="text-xs font-bold text-neutral-600 dark:text-neutral-300 hover:text-labbaik-blue dark:hover:text-labbaik-blue transition-colors px-2.5 py-1.5 rounded-xl hover:bg-neutral-100 dark:hover:bg-white/5"
            >
              حذف البيانات
            </Link>

            <button
              onClick={toggleTheme}
              type="button"
              className="p-2 rounded-xl bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10 text-neutral-600 dark:text-neutral-300 hover:text-labbaik-blue transition-colors cursor-pointer"
              title={theme === 'dark' ? 'الوضع النهاري' : 'الوضع الليلي'}
            >
              {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
            </button>

            <Link
              to="/login"
              className="inline-flex items-center gap-1.5 text-xs font-black bg-labbaik-blue text-white px-4 py-2 rounded-xl hover:bg-labbaik-blue/90 shadow-sm transition-all cursor-pointer"
            >
              <span>دخول المنصة</span>
              <ArrowRight size={14} className="rotate-180" />
            </Link>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {children}
      </main>

      {/* Footer */}
      <footer className="bg-white dark:bg-black/30 border-t border-neutral-200 dark:border-white/10 mt-auto py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-neutral-500">
          <div className="flex items-center gap-2">
            <ShieldCheck size={16} className="text-labbaik-blue" />
            <span>منصة لبيك SaaS لإدارة قنوات المحادثات والرسائل الذكية.</span>
          </div>

          <div className="flex flex-wrap items-center gap-5 font-bold">
            <Link to="/privacy" className="hover:text-labbaik-blue transition-colors">سياسة الخصوصية</Link>
            <Link to="/terms" className="hover:text-labbaik-blue transition-colors">شروط الخدمة</Link>
            <Link to="/account-deletion" className="hover:text-labbaik-blue transition-colors">حذف الحساب والبيانات</Link>
            <a href="mailto:support@mkhzin.com" className="hover:text-labbaik-blue flex items-center gap-1 transition-colors">
              <Mail size={13} /> support@mkhzin.com
            </a>
          </div>

          <div>
            © {new Date().getFullYear()} لبيك (Labbaik). جميع الحقوق محفوظة.
          </div>
        </div>
      </footer>
    </div>
  );
}

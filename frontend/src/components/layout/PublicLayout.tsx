import React from 'react';
import { Link } from 'react-router-dom';
import { Sun, Moon, ShieldCheck, Mail, LogIn } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import LogoImage from '../../assets/logos/tael-bot-glyph-white.svg';
import LogoAltImage from '../../assets/logos/tael-bot-glyph-purple.svg';

interface PublicLayoutProps {
  children: React.ReactNode;
}

export default function PublicLayout({ children }: PublicLayoutProps) {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="landing min-h-screen flex flex-col bg-labbaik-page text-neutral-900 dark:text-white transition-colors duration-300" dir="rtl">
      {/* Same header as the home page: brand, the legal links, theme, and log in. */}
      <header className="sticky top-0 z-30 bg-white/75 dark:bg-[#0a192f]/75 backdrop-blur-xl border-b border-labbaik-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 sm:h-20 flex items-center justify-between gap-3">
          <Link to="/" className="flex items-center gap-2.5 shrink-0" aria-label="تيل بوت">
            <img src={theme === 'dark' ? LogoImage : LogoAltImage} alt="" className="h-9 sm:h-11 w-auto object-contain" />
            <div className="flex flex-col leading-none">
              <span className="text-lg sm:text-xl font-black text-labbaik-blue dark:text-white">تيل بوت</span>
              <span className="hidden sm:block text-[11px] text-labbaik-text-muted font-bold mt-1">نظام الرد والتواصل الذكي</span>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-1" aria-label="روابط قانونية">
            {[['/privacy', 'الخصوصية'], ['/terms', 'شروط الخدمة'], ['/account-deletion', 'حذف البيانات']].map(([to, label]) => (
              <Link
                key={to}
                to={to}
                className="text-sm font-bold text-neutral-600 dark:text-neutral-300 hover:text-labbaik-blue dark:hover:text-white px-3 py-2 rounded-xl hover:bg-labbaik-blue/5 dark:hover:bg-white/5 transition-colors"
              >
                {label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={toggleTheme}
              className="inline-flex items-center justify-center h-10 w-10 rounded-xl border border-labbaik-border bg-labbaik-surface text-neutral-700 dark:text-neutral-200 hover:text-labbaik-blue transition-colors cursor-pointer"
              aria-label={theme === 'dark' ? 'الوضع الفاتح' : 'الوضع الداكن'}
              title={theme === 'dark' ? 'الوضع الفاتح' : 'الوضع الداكن'}
            >
              {theme === 'dark' ? <Sun size={17} className="text-amber-400" /> : <Moon size={17} className="text-labbaik-blue" />}
            </button>
            <Link
              to="/login"
              className="inline-flex items-center gap-1.5 h-10 px-3.5 sm:px-5 rounded-xl bg-labbaik-blue text-white text-sm font-black hover:bg-[#553174] transition-colors"
            >
              <LogIn size={16} className="-scale-x-100" />
              <span>تسجيل الدخول</span>
            </Link>
          </div>
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
            <span>منصة تيل بوت SaaS لإدارة قنوات المحادثات والرسائل الذكية.</span>
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
            © {new Date().getFullYear()} تيل بوت (Tael Bot). جميع الحقوق محفوظة.
          </div>
        </div>
      </footer>
    </div>
  );
}

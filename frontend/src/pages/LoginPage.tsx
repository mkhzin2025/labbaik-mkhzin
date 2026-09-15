import React, { useState } from 'react';
import api from '../api/client';
import { useNavigate, Link } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, Sun, Moon } from 'lucide-react';
import LogoImage from '../assets/logos/logo.png';
import LogoAltImage from '../assets/logos/logo-alt.png';
import BackgroundImage from '../assets/login-bg.png';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Alert } from '../components/ui/Alert';
import { useTheme } from '../context/ThemeContext';

export default function LoginPage() {
  const { theme, toggleTheme } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { data } = await api.post('/auth/login', { email, password });
      localStorage.setItem('access_token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      if (data.organization) localStorage.setItem('organization', JSON.stringify(data.organization));
      navigate('/dashboard');
    } catch (err: unknown) {
      const responseMessage = (err as { response?: { data?: { message?: string } } })
        .response?.data?.message;
      setError(
        responseMessage === 'Invalid credentials'
          ? 'بيانات الدخول غير صحيحة، يرجى التحقق.'
          : 'حدث خطأ في الاتصال، يرجى المحاولة لاحقاً.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="relative min-h-screen flex items-center justify-center overflow-hidden bg-labbaik-page text-neutral-900 dark:text-white transition-colors duration-300 px-4 py-8"
      dir="rtl"
    >
      {/* Background Graphic */}
      <div
        className="absolute inset-0 z-0 bg-cover bg-center transition-opacity duration-300 pointer-events-none opacity-10 dark:opacity-20 mix-blend-multiply dark:mix-blend-normal"
        style={{ backgroundImage: `url(${BackgroundImage})` }}
        aria-hidden="true"
      />

      {/* Theme Toggle Button in Top Corner */}
      <div className="absolute top-4 left-4 sm:top-6 sm:left-6 z-20">
        <button
          type="button"
          onClick={toggleTheme}
          className="flex items-center gap-2.5 px-3.5 py-2 rounded-2xl border transition-all duration-200 shadow-sm backdrop-blur-md cursor-pointer
            bg-white/85 hover:bg-white border-purple-200/70 text-neutral-700 hover:text-neutral-900 hover:shadow-md hover:scale-[1.02] active:scale-95
            dark:bg-white/10 dark:hover:bg-white/15 dark:border-white/15 dark:text-neutral-200 dark:hover:text-white"
          aria-label={theme === 'light' ? 'تفعيل الوضع الداكن' : 'تفعيل الوضع الفاتح'}
          title={theme === 'light' ? 'تفعيل الوضع الداكن' : 'تفعيل الوضع الفاتح'}
        >
          {theme === 'light' ? (
            <>
              <Moon className="w-4 h-4 text-labbaik-blue transition-transform duration-200" />
              <span className="text-xs font-semibold select-none">الوضع الداكن</span>
            </>
          ) : (
            <>
              <Sun className="w-4 h-4 text-amber-400 transition-transform duration-200" />
              <span className="text-xs font-semibold select-none">الوضع الفاتح</span>
            </>
          )}
        </button>
      </div>

      {/* Content Container */}
      <div className="relative z-10 w-full max-w-md">
        <div className="rounded-2xl border transition-all duration-300 p-6 sm:p-8 backdrop-blur-xl
          bg-white/95 border-purple-100/90 shadow-2xl shadow-purple-900/10
          dark:bg-[#18263d]/90 dark:border-white/15 dark:shadow-2xl">
          {/* Header */}
          <div className="mb-8 text-center">
            <div className="mb-6 inline-block">
              <img
                src={theme === 'light' ? LogoAltImage : LogoImage}
                alt="Labbaik Logo"
                className="h-20 w-auto object-contain transition-all duration-300"
              />
            </div>
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-white mb-2">أهلاً بك في لبيك</h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              نظام الرد والتواصل الذكي المتكامل
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-5">
            {/* Error Alert */}
            {error && (
              <Alert type="error" title="خطأ في الدخول">
                {error}
              </Alert>
            )}

            {/* Email Input */}
            <Input
              type="email"
              label="البريد الإلكتروني"
              placeholder="أدخل بريدك الإلكتروني"
              icon={<Mail className="h-5 w-5" />}
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />

            {/* Password Input */}
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                label="كلمة المرور"
                placeholder="أدخل كلمة المرور"
                icon={<Lock className="h-5 w-5" />}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute left-3 top-[38px] text-neutral-400 hover:text-neutral-700 dark:hover:text-white transition-colors"
                title={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>

            {/* Demo Account Helper */}
            <div className="rounded-xl border p-3.5 text-xs flex items-center justify-between gap-2 transition-colors
              border-purple-200/80 bg-purple-50/70 text-purple-900
              dark:border-primary-500/30 dark:bg-primary-950/40 dark:text-primary-200">
              <div className="flex flex-col gap-0.5">
                <span className="text-neutral-500 dark:text-neutral-400 text-[11px]">بيانات الحساب التجريبي:</span>
                <span className="font-mono font-semibold text-purple-950 dark:text-white text-[11px]">
                  admin@labbaik.local | Admin123!
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEmail('admin@labbaik.local');
                  setPassword('Admin123!');
                }}
                className="px-2.5 py-1.5 rounded-lg text-white text-xs font-medium transition-all shrink-0 cursor-pointer
                  bg-labbaik-blue hover:opacity-90 active:scale-95
                  dark:bg-primary-600 dark:hover:bg-primary-500"
              >
                تعبئة تلقائية
              </button>
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              variant="primary"
              size="lg"
              isFullWidth
              isLoading={loading}
              loadingText="جاري الدخول..."
              className="mt-6"
            >
              دخول المنصة
            </Button>
          </form>

          {/* Register Link */}
          <div className="mt-7 pt-5 border-t border-purple-100 dark:border-white/10 text-center">
            <p className="text-sm text-neutral-600 dark:text-neutral-400 font-medium">
              ليس لديك حساب مؤسسة؟{' '}
              <Link
                to="/register"
                className="font-bold text-labbaik-blue hover:underline"
              >
                سجّل مؤسستك الآن
              </Link>
            </p>
          </div>

          {/* Footer */}
          <div className="mt-6 text-center">
            <p className="text-xs text-neutral-500 dark:text-neutral-400 font-medium">
              © 2026 Labbaik AI System • جميع الحقوق محفوظة
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

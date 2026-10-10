import React, { useState } from 'react';
import api from '../api/client';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, Sun, Moon } from 'lucide-react';
import LogoImage from '../assets/logos/tael-bot-mark-inverse.svg';
import LogoAltImage from '../assets/logos/tael-bot-mark.svg';
import BackgroundImage from '../assets/login-bg.webp';
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
          className="flex items-center gap-2.5 h-10 px-3.5 rounded-xl border border-labbaik-border bg-labbaik-surface text-neutral-700 dark:text-neutral-200 hover:text-labbaik-blue dark:hover:text-white transition-colors cursor-pointer"
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
        <div className="rounded-2xl border border-labbaik-border bg-labbaik-surface p-6 sm:p-8 shadow-[0_24px_48px_-24px_rgba(15,10,30,0.35)]">
          {/* Header */}
          <div className="mb-8 text-center">
            <img
              src={theme === 'light' ? LogoAltImage : LogoImage}
              alt="تيل بوت"
              className="mx-auto mb-6 h-20 w-auto object-contain"
            />
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-white mb-2">أهلاً بك في تيل بوت</h1>
            <p className="text-sm text-labbaik-text-muted">
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
              autoComplete="email"
              dir="ltr"
              className="text-right placeholder:text-right"
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
                autoComplete="current-password"
                className="pl-12"
                icon={<Lock className="h-5 w-5" />}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute left-1 top-7.5 grid h-11 w-11 place-items-center rounded-lg text-labbaik-text-muted hover:text-neutral-900 dark:hover:text-white transition-colors cursor-pointer"
                aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                aria-pressed={showPassword}
                title={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
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

          {/* Footer */}
          <div className="mt-6 text-center">
            <p className="text-xs text-labbaik-text-muted font-medium">
              © {new Date().getFullYear()} Tael Bot • جميع الحقوق محفوظة
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

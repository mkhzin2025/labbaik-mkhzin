import React, { useEffect, useState } from 'react';
import api from '../api/client';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, Sun, Moon, ArrowRight, MessageSquareText } from 'lucide-react';
import LogoImage from '../assets/logos/tael-bot-glyph-white.svg';
import LogoAltImage from '../assets/logos/tael-bot-glyph-purple.svg';
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
  // Support staff confirm each sign-in with a code texted to their mobile.
  const [otp, setOtp] = useState<{ challenge: string; phone: string } | null>(null);
  const [code, setCode] = useState('');
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  const serverMessage = (err: unknown) => {
    const response = (err as { response?: { status?: number; data?: { message?: unknown } } }).response;
    const message = response?.data?.message;
    if (message === 'Invalid credentials') return 'بيانات الدخول غير صحيحة، يرجى التحقق.';
    if (response && typeof message === 'string' && /[\u0600-\u06FF]/.test(message)) return message;
    return 'حدث خطأ في الاتصال، يرجى المحاولة لاحقاً.';
  };

  const finish = (data: { token: string; user: unknown; organization?: unknown }) => {
    localStorage.setItem('access_token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    localStorage.removeItem('access'); // the dashboard fetches this account's role
    if (data.organization) localStorage.setItem('organization', JSON.stringify(data.organization));
    navigate('/dashboard');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { data } = await api.post('/auth/login', { email, password });
      if (data.otpRequired) {
        setOtp({ challenge: data.challenge, phone: data.phone });
        setCode('');
        setResendIn(data.resendIn || 60);
        return;
      }
      finish(data);
    } catch (err: unknown) {
      setError(serverMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await api.post('/auth/login/verify', { challenge: otp.challenge, code });
      finish(data);
    } catch (err: unknown) {
      setError(serverMessage(err));
      setCode('');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!otp || resendIn > 0) return;
    setError('');
    try {
      const { data } = await api.post('/auth/login/resend', { challenge: otp.challenge });
      setResendIn(data.resendIn || 60);
      setCode('');
    } catch (err: unknown) {
      setError(serverMessage(err));
    }
  };

  const backToPassword = () => {
    setOtp(null);
    setCode('');
    setPassword('');
    setError('');
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

      {/* Back to Home */}
      <div className="absolute top-4 right-4 sm:top-6 sm:right-6 z-20">
        <Link
          to="/"
          className="flex items-center gap-1.5 h-10 px-3 rounded-xl text-neutral-600 dark:text-neutral-300 hover:text-labbaik-blue dark:hover:text-white hover:bg-labbaik-surface transition-colors"
          aria-label="العودة إلى الصفحة الرئيسية"
          title="العودة إلى الصفحة الرئيسية"
        >
          <ArrowRight className="w-4 h-4" />
          <span className="text-xs font-semibold select-none">الرئيسية</span>
        </Link>
      </div>

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
            <Link
              to="/"
              className="mx-auto mb-6 block w-fit rounded-xl transition-opacity hover:opacity-80"
              aria-label="الصفحة الرئيسية"
              title="الصفحة الرئيسية"
            >
              <img
                src={theme === 'light' ? LogoAltImage : LogoImage}
                alt="تيل بوت"
                className="h-20 w-auto object-contain"
              />
            </Link>
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-white mb-2">أهلاً بك في تيل بوت</h1>
            <p className="text-sm text-labbaik-text-muted">
              نظام الرد والتواصل الذكي المتكامل
            </p>
          </div>

          {otp ? (
            <form onSubmit={handleVerify} className="space-y-5">
              {error && (
                <Alert type="error" title="تعذر التحقق">
                  {error}
                </Alert>
              )}
              <div className="flex items-start gap-3 rounded-xl bg-labbaik-blue/5 p-4">
                <MessageSquareText className="mt-0.5 h-5 w-5 shrink-0 text-labbaik-blue dark:text-purple-200" />
                <p className="text-sm leading-relaxed text-neutral-800 dark:text-neutral-100">
                  أرسلنا رمز تحقق من 6 أرقام إلى جوالك <span dir="ltr" className="font-bold">{otp.phone}</span>
                </p>
              </div>
              <label className="block space-y-1.5">
                <span className="text-sm font-bold text-neutral-800 dark:text-neutral-100">رمز التحقق</span>
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  dir="ltr"
                  autoFocus
                  required
                  minLength={6}
                  maxLength={6}
                  placeholder="••••••"
                  aria-label="رمز التحقق"
                  disabled={loading}
                  className="h-14 w-full rounded-xl border border-labbaik-border bg-labbaik-page text-center text-2xl font-bold tracking-[0.5em] text-neutral-900 dark:text-white placeholder:text-labbaik-text-muted/60 focus:outline-none focus:ring-2 focus:ring-labbaik-blue/30"
                />
              </label>
              <Button type="submit" variant="primary" size="lg" isFullWidth isLoading={loading} loadingText="جاري التحقق..." disabled={code.length !== 6}>
                تأكيد الدخول
              </Button>
              <div className="flex items-center justify-between text-sm">
                <button type="button" onClick={backToPassword} className="font-semibold text-labbaik-text-muted hover:text-neutral-900 dark:hover:text-white cursor-pointer">
                  رجوع
                </button>
                <button
                  type="button"
                  onClick={() => void handleResend()}
                  disabled={resendIn > 0 || loading}
                  className="font-semibold text-labbaik-blue dark:text-purple-200 hover:underline disabled:no-underline disabled:text-labbaik-text-muted disabled:cursor-default cursor-pointer"
                >
                  {resendIn > 0 ? `إعادة الإرسال بعد ${resendIn} ث` : 'إعادة إرسال الرمز'}
                </button>
              </div>
            </form>
          ) : (
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
          )}

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

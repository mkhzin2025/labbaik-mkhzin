import React, { useState } from 'react';
import api from '../api/client';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff } from 'lucide-react';
import LogoImage from '../assets/logos/logo.png';
import BackgroundImage from '../assets/login-bg.png';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Alert } from '../components/ui/Alert';

export default function LoginPage() {
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
      className="relative min-h-screen flex items-center justify-center overflow-hidden bg-[#101828] px-4 py-8"
      dir="rtl"
    >
      <div
        className="absolute inset-0 z-0 bg-cover bg-center opacity-15"
        style={{ backgroundImage: `url(${BackgroundImage})` }}
        aria-hidden="true"
      />

      {/* Content Container */}
      <div className="relative z-10 w-full max-w-md">
        <div className="rounded-lg border border-white/15 bg-[#18263d] p-6 shadow-2xl sm:p-8">
          {/* Header */}
          <div className="mb-8 text-center">
            <div className="mb-6 inline-block">
              <img
                src={LogoImage}
                alt="Labbaik Logo"
                className="h-20 w-auto object-contain"
              />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">أهلاً بك في لبيك</h1>
            <p className="text-sm text-gray-400">
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
                className="absolute left-3 top-[38px] text-neutral-400 hover:text-white transition-colors"
                title={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>

            {/* Demo Account Helper */}
            <div className="rounded-lg border border-primary-500/30 bg-primary-950/40 p-3 text-xs text-primary-200 flex items-center justify-between gap-2">
              <div className="flex flex-col gap-0.5">
                <span className="text-gray-400 text-[11px]">بيانات الحساب التجريبي:</span>
                <span className="font-mono text-white text-[11px]">
                  admin@labbaik.local | Admin123!
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEmail('admin@labbaik.local');
                  setPassword('Admin123!');
                }}
                className="px-2.5 py-1.5 rounded bg-primary-600 hover:bg-primary-500 text-white text-xs font-medium transition-colors shrink-0"
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

          {/* Footer */}
          <div className="mt-8 text-center">
            <p className="text-xs text-neutral-400 font-medium">
              © 2026 Labbaik AI System • جميع الحقوق محفوظة
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}



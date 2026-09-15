import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Building2, User, Mail, Phone, Lock, Eye, EyeOff, Store, Sun, Moon, ArrowRight, Sparkles } from 'lucide-react';
import api from '../api/client';
import LogoImage from '../assets/logos/logo.png';
import LogoAltImage from '../assets/logos/logo-alt.png';
import BackgroundImage from '../assets/login-bg.png';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Alert } from '../components/ui/Alert';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../components/Toast';

export default function RegisterPage() {
  const { theme, toggleTheme } = useTheme();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [organizationName, setOrganizationName] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [branchName, setBranchName] = useState('الفرع الرئيسي');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organizationName.trim() || !fullName.trim() || !email.trim() || !password) {
      setError('يرجى ملء جميع الحقول الإلزامية.');
      return;
    }

    if (password.length < 6) {
      setError('كلمة المرور يجب ألا تقل عن 6 خانات.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const payload = {
        organizationName: organizationName.trim(),
        fullName: fullName.trim(),
        email: email.trim().toLowerCase(),
        password,
        phoneNumber: phoneNumber.trim() || undefined,
        branchName: branchName.trim() || 'الفرع الرئيسي',
      };

      const { data } = await api.post('/auth/register', payload);

      localStorage.setItem('access_token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      if (data.organization) {
        localStorage.setItem('organization', JSON.stringify(data.organization));
      }
      if (data.store?.id) {
        localStorage.setItem('active_store_id', data.store.id);
      }

      showToast(`أهلاً بك في لبيك! تم تسجيل ${data.organization?.name || 'مؤسستك'} بنجاح 🎉`, 'success');
      navigate('/dashboard/settings?tab=meta');
    } catch (err: any) {
      const responseMessage = err?.response?.data?.message;
      if (typeof responseMessage === 'string' && responseMessage.includes('duplicate')) {
        setError('البريد الإلكتروني مسجل مسبقاً، يرجى استخدام بريد آخر.');
      } else {
        setError(responseMessage || 'حدث خطأ أثناء التسجيل، يرجى المحاولة لاحقاً.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="relative min-h-screen flex items-center justify-center overflow-x-hidden bg-labbaik-page text-neutral-900 dark:text-white transition-colors duration-300 px-4 py-10 sm:py-14"
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
      <div className="relative z-10 w-full max-w-xl">
        <div className="rounded-3xl border transition-all duration-300 p-6 sm:p-10 backdrop-blur-xl
          bg-white/95 border-purple-100/90 shadow-2xl shadow-purple-900/10
          dark:bg-[#18263d]/90 dark:border-white/15 dark:shadow-2xl">
          
          {/* Header */}
          <div className="mb-8 text-center">
            <div className="mb-5 inline-block">
              <img
                src={theme === 'light' ? LogoAltImage : LogoImage}
                alt="Labbaik Logo"
                className="h-16 sm:h-20 w-auto object-contain transition-all duration-300"
              />
            </div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-labbaik-blue/10 text-labbaik-blue border border-labbaik-blue/20 mb-3">
              <Sparkles size={13} />
              <span>تسجيل منشأة جديدة</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-neutral-900 dark:text-white mb-2">
              ابدأ مع لبيك لمؤسستك
            </h1>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 font-medium max-w-md mx-auto">
              أنشئ مساحة عمل خاصة بمنظمتك، اربط قنوات واتساب السحابية، وقم بإدارة فروعك بذكاء متكامل.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleRegister} className="space-y-5">
            {error && (
              <Alert type="error" title="خطأ في التسجيل">
                {error}
              </Alert>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Organization Name */}
              <Input
                type="text"
                label="اسم المنظمة / المؤسسة"
                placeholder="مثال: شركة آفاق المستقبل"
                icon={<Building2 className="h-5 w-5" />}
                required
                value={organizationName}
                onChange={(e) => setOrganizationName(e.target.value)}
                disabled={loading}
              />

              {/* Admin Full Name */}
              <Input
                type="text"
                label="اسم المسؤول أو المدير"
                placeholder="مثال: محمد بن خالد"
                icon={<User className="h-5 w-5" />}
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                disabled={loading}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Email */}
              <Input
                type="email"
                label="البريد الإلكتروني الرسمي"
                placeholder="admin@company.com"
                icon={<Mail className="h-5 w-5" />}
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
              />

              {/* Phone */}
              <Input
                type="tel"
                label="رقم هاتف المنشأة (اختياري)"
                placeholder="+9665xxxxxxxx"
                icon={<Phone className="h-5 w-5" />}
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                disabled={loading}
                dir="ltr"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Initial Branch */}
              <Input
                type="text"
                label="اسم الفرع الرئيسي الأول"
                placeholder="مثال: الفرع الرئيسي - الرياض"
                icon={<Store className="h-5 w-5" />}
                required
                value={branchName}
                onChange={(e) => setBranchName(e.target.value)}
                disabled={loading}
              />

              {/* Password */}
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  label="كلمة المرور (6 خانات أو أكثر)"
                  placeholder="••••••••"
                  icon={<Lock className="h-5 w-5" />}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-3 top-[38px] text-neutral-400 hover:text-neutral-700 dark:hover:text-white transition-colors cursor-pointer"
                  title={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {/* Note */}
            <div className="p-3.5 rounded-2xl border border-purple-200/70 bg-purple-50/60 dark:border-purple-500/20 dark:bg-purple-950/20 text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed">
              💡 يمكنك بعد التسجيل فوراً إضافة فروع متعددة وتخصيص أرقام واتساب سحابية مستقلة أو موحدة من تبويب <strong className="text-labbaik-blue">إدارة الفروع</strong> و <strong className="text-labbaik-blue">ربط Meta</strong>.
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              variant="primary"
              size="lg"
              isFullWidth
              isLoading={loading}
              loadingText="جاري تسجيل المؤسسة..."
              className="mt-2 text-base font-bold shadow-lg shadow-labbaik-blue/20"
            >
              تسجيل حساب المؤسسة والبدء
            </Button>
          </form>

          {/* Login Link */}
          <div className="mt-8 pt-6 border-t border-purple-100 dark:border-white/10 text-center">
            <p className="text-sm text-neutral-600 dark:text-neutral-400 font-medium">
              لديك حساب مؤسسة بالفعل؟{' '}
              <Link
                to="/login"
                className="font-bold text-labbaik-blue hover:underline inline-flex items-center gap-1 mr-1"
              >
                تسجيل الدخول
                <ArrowRight size={15} className="rotate-180" />
              </Link>
            </p>
          </div>

          {/* Footer */}
          <div className="mt-6 text-center">
            <p className="text-xs text-neutral-500 dark:text-neutral-500 font-medium">
              © 2026 Labbaik AI System • جميع الحقوق محفوظة
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

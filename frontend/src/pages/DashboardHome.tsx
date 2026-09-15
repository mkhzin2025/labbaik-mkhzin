import { useState, useEffect } from 'react';
import api from '../api/client';
import {
  MessageSquare,
  Users,
  Cpu,
  Share2,
  TrendingUp,
  Smile,
  BarChart3,
  Activity,
  Zap,
  Timer
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar
} from 'recharts';
import { Card, CardBody, StatCard, SkeletonCard, ErrorState } from '@/components/ui';
import { toEnglishDigits, formatNumber } from '@/lib/utils';

interface DashboardStats {
  totalConversations: number;
  totalMessages: number;
  aiReplies: number;
  activeChannels: number;
  hoursSaved: number;
  avgHumanSpeed: number;
  aiSpeed: number;
  platformStats: { name: string; value: number }[];
  sentimentStats: { name: string; value: number; color: string }[];
  timelineData: { date: string; messages: number }[];
}

export default function DashboardHome() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  async function fetchStats() {
    setLoading(true);
    setError(false);
    try {
      const { data } = await api.get('/conversations/stats');
      setStats(data);
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
      setError(true);
      setLoading(false);
    }
  }

  useEffect(() => {
    const request = window.setTimeout(() => {
      void fetchStats();
    }, 0);
    return () => window.clearTimeout(request);
  }, []);

  if (loading) {
    return (
      <div className="space-y-10 animate-fade-in" dir="rtl">
        {/* Loading skeleton for header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-3">
            <div className="h-10 w-52 bg-neutral-200/80 dark:bg-neutral-800/80 rounded-2xl animate-pulse"></div>
            <div className="h-5 w-80 bg-neutral-200/80 dark:bg-neutral-800/80 rounded-xl animate-pulse"></div>
          </div>
          <div className="h-11 w-48 bg-neutral-200/80 dark:bg-neutral-800/80 rounded-2xl animate-pulse"></div>
        </div>

        {/* Loading skeleton for performance cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <SkeletonCard count={3} />
        </div>

        {/* Loading skeleton for stat cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <SkeletonCard count={4} />
        </div>

        {/* Loading skeleton for charts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 bg-labbaik-surface border border-labbaik-border rounded-3xl p-8 space-y-6 shadow-sm">
            <div className="h-7 w-48 bg-neutral-200/80 dark:bg-neutral-800/80 rounded-xl animate-pulse"></div>
            <div className="h-64 md:h-80 w-full bg-neutral-100 dark:bg-neutral-800/40 rounded-2xl animate-pulse"></div>
          </div>
          <div className="bg-labbaik-surface border border-labbaik-border rounded-3xl p-8 space-y-6 shadow-sm">
            <div className="h-7 w-40 bg-neutral-200/80 dark:bg-neutral-800/80 rounded-xl animate-pulse"></div>
            <div className="h-48 md:h-64 w-full bg-neutral-100 dark:bg-neutral-800/40 rounded-2xl animate-pulse"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <ErrorState
        title="تعذر تحميل لوحة القيادة"
        message="حدثت مشكلة أثناء جلب الإحصاءات. تحقق من الاتصال وحاول مرة أخرى."
        retry={{ label: 'إعادة المحاولة', onClick: fetchStats, loading: loading }}
        className="min-h-[50vh]"
      />
    );
  }

  const statCards = [
    {
      label: 'إجمالي المحادثات',
      value: stats?.totalConversations || 0,
      icon: <Users size={24} />,
      iconBgColor: 'bg-primary-500/10',
      iconColor: 'text-primary-500'
    },
    {
      label: 'إجمالي الرسائل',
      value: stats?.totalMessages || 0,
      icon: <MessageSquare size={24} />,
      iconBgColor: 'bg-secondary-500/10',
      iconColor: 'text-secondary-500'
    },
    {
      label: 'ردود الذكاء الآلية',
      value: stats?.aiReplies || 0,
      icon: <Cpu size={24} />,
      iconBgColor: 'bg-primary-600/10',
      iconColor: 'text-primary-600'
    },
    {
      label: 'القنوات النشطة',
      value: stats?.activeChannels || 0,
      icon: <Share2 size={24} />,
      iconBgColor: 'bg-success-500/10',
      iconColor: 'text-success-500'
    },
  ];

  return (
    <div className="space-y-10 animate-fade-in" dir="rtl">
      {/* Welcome Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl lg:text-4xl font-black text-neutral-900 dark:text-white tracking-tight">
            لوحة القيادة الذكية 📈
          </h1>
          <p className="text-neutral-600 dark:text-neutral-400 mt-2 font-medium text-base leading-relaxed">
            نظرة عامة على أداء "لبيك" ونجاعة الذكاء الاصطناعي في متجرك.
          </p>
        </div>
        <div className="flex items-center gap-3 bg-labbaik-surface px-5 py-2.5 rounded-2xl border border-labbaik-border shadow-sm">
          <Activity size={18} className="text-success-500 flex-shrink-0" />
          <span className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">النظام يعمل بكفاءة قصوى</span>
        </div>
      </div>

      {/* Speed & Savings Performance Banner */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Hours Saved Card */}
        <Card variant="elevated" className="rounded-3xl">
          <CardBody className="space-y-6">
            <div className="flex justify-between items-start">
              <div className="p-3 bg-primary-500/10 rounded-2xl">
                <Timer className="text-labbaik-blue" size={24} />
              </div>
              <span className="text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">Efficiency</span>
            </div>
            <div>
              <h2 className="text-neutral-500 dark:text-neutral-400 text-sm font-semibold mb-2">الوقت الموفر يدوياً</h2>
              <p className="text-3xl font-black text-neutral-900 dark:text-white">
                {stats?.hoursSaved ?? 0}
                <span className="text-base font-semibold text-labbaik-blue mr-2">ساعة</span>
              </p>
            </div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 font-medium">تم حسابها بناءً على سرعة الكتابة البشرية المتوسطة.</p>
          </CardBody>
        </Card>

        {/* Speed Comparison Card */}
        <Card variant="default" className="rounded-3xl">
          <CardBody className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase flex items-center gap-2">
                <Zap size={15} className="text-warning-500" />
                سرعة الرد
              </h2>
            </div>
            <div className="space-y-5">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-semibold text-neutral-600 dark:text-neutral-400">لبيك (AI)</span>
                  <span className="text-xs font-bold text-labbaik-blue">3 ثوانٍ</span>
                </div>
                <div className="h-2 w-full bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden border border-neutral-200/50 dark:border-transparent">
                  <div className="h-full bg-labbaik-blue rounded-full w-full"></div>
                </div>
              </div>
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-semibold text-neutral-600 dark:text-neutral-400">البشر (Human)</span>
                  <span className="text-xs font-bold text-error-500">{toEnglishDigits(stats?.avgHumanSpeed ?? 10)} دقيقة</span>
                </div>
                <div className="h-2 w-full bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden border border-neutral-200/50 dark:border-transparent">
                  <div className="h-full bg-error-400/40 rounded-full w-[15%]"></div>
                </div>
              </div>
            </div>
          </CardBody>
        </Card>

        {/* Conversion Rate Card */}
        <Card variant="default" className="rounded-3xl">
          <CardBody className="flex flex-col justify-center items-center text-center space-y-4">
            <div className="w-16 h-16 bg-success-500/10 rounded-2xl flex items-center justify-center border border-success-500/20">
              <TrendingUp className="text-success-500" size={32} />
            </div>
            <div>
              <h2 className="text-neutral-900 dark:text-white font-bold text-base">معدل التحويل المتوقع</h2>
              <p className="text-neutral-500 dark:text-neutral-400 text-xs font-medium mt-2">الرد السريع يزيد فرص البيع بـ 70%</p>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Primary Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat, i) => (
          <StatCard
            key={i}
            icon={stat.icon}
            label={stat.label}
            value={formatNumber(stat.value)}
            iconBgColor={stat.iconBgColor}
            iconColor={stat.iconColor}
            trend="up"
          />
        ))}
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Timeline Chart */}
        <Card variant="default" className="lg:col-span-2 rounded-3xl">
          <CardBody className="space-y-8">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-neutral-900 dark:text-white flex items-center gap-3">
                <TrendingUp className="text-labbaik-blue" size={20} />
                حجم الرسائل (آخر 7 أيام)
              </h2>
            </div>
            <div className="h-64 md:h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats?.timelineData}>
                  <defs>
                    <linearGradient id="colorMessages" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#643B89" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#643B89" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(100,59,137,0.08)" vertical={false} />
                  <XAxis dataKey="date" stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} dy={10} />
                  <YAxis stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} dx={-10} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--color-labbaik-surface)',
                      borderRadius: '1rem',
                      border: '1px solid var(--color-labbaik-border)',
                      boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
                      fontSize: '13px',
                      fontWeight: 600,
                      color: 'var(--color-neutral-0)'
                    }}
                    itemStyle={{ color: '#643B89' }}
                  />
                  <Area type="monotone" dataKey="messages" stroke="#643B89" strokeWidth={2.5} fillOpacity={1} fill="url(#colorMessages)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardBody>
        </Card>

        {/* Sentiment Pie Chart */}
        <Card variant="default" className="rounded-3xl">
          <CardBody className="space-y-8">
            <h2 className="text-lg font-bold text-neutral-900 dark:text-white flex items-center gap-3">
              <Smile className="text-success-500" size={20} />
              مؤشر سعادة العملاء
            </h2>
            <div className="h-48 md:h-64 w-full relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stats?.sentimentStats}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={6}
                    dataKey="value"
                  >
                    {stats?.sentimentStats?.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--color-labbaik-surface)',
                      borderRadius: '1rem',
                      border: '1px solid var(--color-labbaik-border)',
                      boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
                      fontSize: '13px',
                      fontWeight: 600,
                      color: 'var(--color-neutral-0)'
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              {/* Center Summary */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-2xl font-bold text-neutral-900 dark:text-white">{toEnglishDigits(stats?.sentimentStats?.find(s => s.name === 'إيجابي')?.value || 0)}</span>
                <span className="text-xs text-neutral-500 dark:text-neutral-400 font-medium uppercase mt-1">راضون جداً</span>
              </div>
            </div>
            <div className="space-y-3">
              {stats?.sentimentStats?.map((s, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }}></div>
                    <span className="text-sm font-medium text-neutral-600 dark:text-neutral-400">{s.name}</span>
                  </div>
                  <span className="text-sm font-bold text-neutral-900 dark:text-white">{toEnglishDigits(s.value)} عميل</span>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>

        {/* Platform Bar Chart */}
        <Card variant="default" className="lg:col-span-3 rounded-3xl">
          <CardBody className="space-y-8">
            <h2 className="text-lg font-bold text-neutral-900 dark:text-white flex items-center gap-3">
              <BarChart3 className="text-warning-500" size={20} />
              توزيع القنوات الأكثر تفاعلاً
            </h2>
            <div className="h-40 md:h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats?.platformStats}>
                  <XAxis dataKey="name" stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip
                    cursor={{ fill: 'rgba(100,59,137,0.04)' }}
                    contentStyle={{
                      backgroundColor: 'var(--color-labbaik-surface)',
                      borderRadius: '1rem',
                      border: '1px solid var(--color-labbaik-border)',
                      boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
                      fontSize: '13px',
                      fontWeight: 600,
                      color: 'var(--color-neutral-0)'
                    }}
                  />
                  <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                    {stats?.platformStats?.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={['#22c55e', '#ec4899', '#3b82f6', '#f97316'][index % 4]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

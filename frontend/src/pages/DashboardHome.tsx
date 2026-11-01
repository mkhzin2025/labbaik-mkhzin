import { useState, useEffect } from 'react';
import api from '../api/client';
import { readCachedAccess } from '../lib/access';
import { currentUser, formatDuration, localDay, type MemberActivity } from '../lib/team';
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
  Timer,
  MessageSquareReply,
  CheckCircle2,
  Clock
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
import { Card, CardBody, StatCard, ErrorState, CountUp } from '@/components/ui';
import { toEnglishDigits, formatNumber } from '@/lib/utils';

// Same cards, sizes and grid as the loaded page, so nothing shifts when the numbers arrive.
const cardShell = 'rounded-2xl border border-purple-100/70 bg-labbaik-surface dark:border-white/10';
const bone = 'rounded-md bg-labbaik-page dark:bg-white/5 animate-pulse';

function DashboardSkeleton() {
  return (
    <div className="space-y-8" dir="rtl" aria-busy="true" aria-label="جاري تحميل لوحة القيادة">
      {/* Header: title, subtitle, status pill */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <div className={`${bone} h-9 lg:h-10 w-64`} />
          <div className={`${bone} h-5 w-96 max-w-full mt-3`} />
        </div>
        <div className={`${bone} h-9 w-52 rounded-full`} />
      </div>

      {/* Primary stat cards (StatCard) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-5">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className={`${cardShell} p-4 sm:p-5 space-y-3`}>
            <div className={`${bone} h-12 w-12 rounded-2xl`} />
            <div className="space-y-2">
              <div className={`${bone} h-3 w-24`} />
              <div className={`${bone} h-7 w-20`} />
            </div>
          </div>
        ))}
      </div>

      {/* Performance cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-5">
        <div className={`${cardShell} p-5 sm:p-6 space-y-5`}>
          <div className="flex justify-between items-start">
            <div className={`${bone} h-12 w-12 rounded-2xl`} />
            <div className={`${bone} h-3 w-12`} />
          </div>
          <div className="space-y-2">
            <div className={`${bone} h-4 w-32`} />
            <div className={`${bone} h-8 w-24`} />
          </div>
          <div className={`${bone} h-3 w-4/5`} />
        </div>
        <div className={`${cardShell} p-5 sm:p-6 space-y-5`}>
          <div className={`${bone} h-3 w-20`} />
          {[0, 1].map((i) => (
            <div key={i} className="space-y-2">
              <div className="flex justify-between"><div className={`${bone} h-3 w-20`} /><div className={`${bone} h-3 w-14`} /></div>
              <div className={`${bone} h-2 w-full rounded-full`} />
            </div>
          ))}
        </div>
        <div className={`${cardShell} p-5 sm:p-6 flex flex-col items-center justify-center gap-4`}>
          <div className={`${bone} h-16 w-16 rounded-2xl`} />
          <div className={`${bone} h-4 w-40`} />
          <div className={`${bone} h-3 w-48`} />
        </div>
      </div>

      {/* Charts: timeline (2/3), sentiment donut (1/3), channels (full width) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-5">
        <div className={`${cardShell} lg:col-span-2 p-5 sm:p-6 space-y-6`}>
          <div className={`${bone} h-6 w-56`} />
          <div className="h-64 md:h-80 flex items-end gap-3 border-b border-labbaik-border pb-2">
            {[40, 55, 35, 70, 50, 80, 60].map((h, i) => (
              <div key={i} className={`${bone} flex-1 rounded-t-md rounded-b-none`} style={{ height: `${h}%` }} />
            ))}
          </div>
        </div>
        <div className={`${cardShell} p-5 sm:p-6 space-y-6`}>
          <div className={`${bone} h-6 w-44`} />
          <div className="h-48 md:h-64 grid place-items-center">
            <div className="h-40 w-40 rounded-full border-[20px] border-labbaik-page dark:border-white/5 animate-pulse" />
          </div>
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-2"><div className={`${bone} h-2.5 w-2.5 rounded-full`} /><div className={`${bone} h-3 w-14`} /></div>
                <div className={`${bone} h-3 w-12`} />
              </div>
            ))}
          </div>
        </div>
        <div className={`${cardShell} lg:col-span-3 p-5 sm:p-6 space-y-6`}>
          <div className={`${bone} h-6 w-52`} />
          <div className="h-40 md:h-56 flex items-end justify-around gap-6 px-6">
            {[70, 30, 20, 10].map((h, i) => (
              <div key={i} className={`${bone} w-full max-w-40 rounded-t-lg rounded-b-none`} style={{ height: `${h}%` }} />
            ))}
          </div>
        </div>
      </div>
      <span className="sr-only">جاري تحميل الإحصاءات...</span>
    </div>
  );
}

interface DashboardStats {
  totalConversations: number;
  totalMessages: number;
  aiReplies: number;
  activeChannels: number;
  hoursSaved: number;
  avgHumanSpeed: number;
  aiSpeed: number;
  platformStats: { name: string; value: number }[];
  // Customers' answers to the rating message sent when a conversation is closed.
  sentimentStats: { key: 'positive' | 'neutral' | 'negative'; name: string; value: number; color: string }[];
  unratedConversations?: number;
  timelineData: { date: string; messages: number }[];
}

type Satisfaction = Pick<DashboardStats, 'sentimentStats' | 'unratedConversations'>;

/** "صباح الخير" until noon, then "مساء الخير". */
const greeting = () => (new Date().getHours() < 12 ? 'صباح الخير' : 'مساء الخير');

export default function DashboardHome() {
  const access = readCachedAccess();
  // Owners and admins see everyone's ratings (and can pick one member); others only the ratings credited to them.
  const managesTeam = Boolean(access?.sections.includes('team'));
  const user = currentUser();
  const firstName = (user.fullName || '').trim().split(/\s+/)[0];
  const [satisfaction, setSatisfaction] = useState<Satisfaction | null>(null);
  const [agentFilter, setAgentFilter] = useState('');
  const [members, setMembers] = useState<{ userId: string; fullName: string; email: string }[]>([]);
  const [myDay, setMyDay] = useState<MemberActivity | null>(null);

  useEffect(() => {
    let live = true;
    api.get<Satisfaction>('/conversations/team/satisfaction', { params: agentFilter ? { agentId: agentFilter } : {} })
      .then(({ data }) => { if (live) setSatisfaction(data); })
      .catch(() => { if (live) setSatisfaction(null); });
    return () => { live = false; };
  }, [agentFilter]);

  useEffect(() => {
    if (managesTeam) api.get('/organizations/members').then(({ data }) => setMembers(Array.isArray(data) ? data : [])).catch(() => undefined);
    const today = localDay(new Date());
    api.get<MemberActivity>('/conversations/team/me/activity', { params: { from: today, to: today, tz: -new Date().getTimezoneOffset() } })
      .then(({ data }) => setMyDay(data))
      .catch(() => undefined);
  }, [managesTeam]);

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

  if (loading) return <DashboardSkeleton />;

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
    <div className="space-y-8 animate-fade-in" dir="rtl">
      {/* Welcome Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl lg:text-4xl font-black text-neutral-900 dark:text-white tracking-tight">
            {firstName ? `${greeting()}، ${firstName}` : 'لوحة القيادة الذكية'}
          </h1>
          <p className="text-neutral-600 dark:text-neutral-400 mt-2 font-medium text-base leading-relaxed">
            نظرة عامة على أداء "تيل بوت" ونجاعة الذكاء الاصطناعي في متجرك.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-full border border-success-500/20 bg-success-500/5 px-3 py-2">
            <Activity size={16} className="text-success-600 dark:text-success-400 flex-shrink-0" />
            <span className="text-sm font-semibold text-success-700 dark:text-success-300">النظام يعمل بكفاءة قصوى</span>
          </div>
        </div>
      </div>

      {/* The signed-in member's own day: what they answered, closed and how customers rated them. */}
      {myDay && (myDay.totals.replies > 0 || myDay.totals.closed > 0 || myDay.totals.rated > 0 || !managesTeam) && (
        <div className="rounded-2xl border border-purple-100/70 bg-labbaik-surface p-4 shadow-sm dark:border-white/10 dark:shadow-none sm:p-5">
          <h2 className="mb-3 text-sm font-black text-neutral-900 dark:text-white">يومك حتى الآن</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'ردودك', value: formatNumber(myDay.totals.replies), note: `في ${formatNumber(myDay.totals.conversations)} محادثة`, icon: <MessageSquareReply size={16} /> },
              { label: 'أغلقت', value: formatNumber(myDay.totals.closed), note: 'محادثة', icon: <CheckCircle2 size={16} /> },
              { label: 'رضا عملائك', value: myDay.totals.rated ? `${Math.round((myDay.totals.positive / myDay.totals.rated) * 100)}%` : '—', note: myDay.totals.rated ? `${formatNumber(myDay.totals.rated)} تقييم اليوم` : 'لا تقييمات اليوم', icon: <Smile size={16} /> },
              { label: 'زمن ردك', value: formatDuration(myDay.responseTime.medianSeconds), note: 'الوسيط اليوم', icon: <Clock size={16} /> },
            ].map((card) => (
              <div key={card.label} className="rounded-xl bg-labbaik-page/70 p-3">
                <p className="flex items-center gap-1.5 text-xs font-bold text-labbaik-text-muted">{card.icon}{card.label}</p>
                <p className="mt-1 text-2xl font-black tabular-nums text-neutral-900 dark:text-white">{card.value}</p>
                <p className="text-[11px] text-labbaik-text-muted">{card.note}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Primary Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-5">
        {statCards.map((stat) => (
          <StatCard
            key={stat.label}
            icon={stat.icon}
            label={stat.label}
            value={formatNumber(stat.value)}
            iconBgColor={stat.iconBgColor}
            iconColor={stat.iconColor}
            className="rounded-2xl border border-purple-100/70 bg-labbaik-surface p-4 shadow-sm dark:border-white/10 dark:shadow-none sm:p-5"
          />
        ))}
      </div>

      {/* Speed & Savings Performance Banner */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-5">
        {/* Hours Saved Card */}
        <Card variant="default" padding="none" className="rounded-2xl">
          <CardBody className="space-y-5 p-5 sm:p-6">
            <div className="flex justify-between items-start">
              <div className="p-3 bg-primary-500/10 rounded-2xl">
                <Timer className="text-labbaik-blue" size={24} />
              </div>
              <span className="text-xs font-bold text-neutral-500 dark:text-neutral-400">الكفاءة</span>
            </div>
            <div>
              <h2 className="text-neutral-500 dark:text-neutral-400 text-sm font-semibold mb-2">الوقت الموفر يدوياً</h2>
              <p className="text-3xl font-black text-neutral-900 dark:text-white">
                <CountUp value={stats?.hoursSaved ?? 0} />
                <span className="text-base font-semibold text-labbaik-blue mr-2">ساعة</span>
              </p>
            </div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 font-medium">تم حسابها بناءً على سرعة الكتابة البشرية المتوسطة.</p>
          </CardBody>
        </Card>

        {/* Speed Comparison Card */}
        <Card variant="default" padding="none" className="rounded-2xl">
          <CardBody className="space-y-5 p-5 sm:p-6">
            <div className="flex justify-between items-center">
              <h2 className="text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase flex items-center gap-2">
                <Zap size={15} className="text-warning-500" />
                سرعة الرد
              </h2>
            </div>
            <div className="space-y-5">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-semibold text-neutral-600 dark:text-neutral-400">تيل بوت (AI)</span>
                  <span className="text-xs font-bold text-labbaik-blue"><CountUp value={3} /> ثوانٍ</span>
                </div>
                <div className="h-2 w-full bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden border border-neutral-200/50 dark:border-transparent">
                  <div className="h-full bg-labbaik-blue rounded-full w-full"></div>
                </div>
              </div>
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-semibold text-neutral-600 dark:text-neutral-400">البشر (Human)</span>
                  <span className="text-xs font-bold text-error-500"><CountUp value={stats?.avgHumanSpeed ?? 10} /> دقيقة</span>
                </div>
                <div className="h-2 w-full bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden border border-neutral-200/50 dark:border-transparent">
                  <div className="h-full bg-error-400/40 rounded-full w-[15%]"></div>
                </div>
              </div>
            </div>
          </CardBody>
        </Card>

        {/* Conversion Rate Card */}
        <Card variant="default" padding="none" className="rounded-2xl">
          <CardBody className="flex flex-col justify-center items-center text-center space-y-4 p-5 sm:p-6">
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

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-5">
        {/* Main Timeline Chart */}
        <Card variant="default" padding="none" className="min-w-0 rounded-2xl lg:col-span-2">
          <CardBody className="space-y-6 p-5 sm:p-6">
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
        <Card variant="default" padding="none" className="min-w-0 rounded-2xl">
          <CardBody className="space-y-6 p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-bold text-neutral-900 dark:text-white flex items-center gap-3">
                <Smile className="text-success-500" size={20} />
                {managesTeam ? 'مؤشر سعادة العملاء' : 'رضا عملائك عنك'}
              </h2>
              {managesTeam && members.length > 1 && (
                <select value={agentFilter} onChange={(e) => setAgentFilter(e.target.value)} aria-label="تقييمات عضو معيّن"
                  className="h-8 max-w-40 rounded-lg border border-labbaik-border bg-labbaik-page px-2 text-xs font-bold text-neutral-800 dark:text-neutral-100 cursor-pointer">
                  <option value="">كل الفريق</option>
                  {members.map((m) => <option key={m.userId} value={m.userId}>{m.fullName || m.email}</option>)}
                </select>
              )}
            </div>
            <div className="h-48 md:h-64 w-full relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={satisfaction?.sentimentStats}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={6}
                    dataKey="value"
                  >
                    {satisfaction?.sentimentStats?.map((entry, index) => (
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
                {(() => {
                  const rated = (satisfaction?.sentimentStats || []).reduce((sum, s) => sum + s.value, 0);
                  const satisfied = satisfaction?.sentimentStats?.find(s => s.key === 'positive')?.value || 0;
                  return (
                    <>
                      <span className="text-2xl font-bold text-neutral-900 dark:text-white">{rated ? <CountUp value={`${Math.round((satisfied / rated) * 100)}%`} /> : '—'}</span>
                      <span className="text-xs text-neutral-500 dark:text-neutral-400 font-medium mt-1">{rated ? 'راضون' : 'لا تقييمات بعد'}</span>
                    </>
                  );
                })()}
              </div>
            </div>
            <div className="space-y-3">
              {satisfaction?.sentimentStats?.map((s, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }}></div>
                    <span className="text-sm font-medium text-neutral-600 dark:text-neutral-400">{s.name}</span>
                  </div>
                  <span className="text-sm font-bold text-neutral-900 dark:text-white">{toEnglishDigits(s.value)} عميل</span>
                </div>
              ))}
              <p className="pt-1 text-xs text-neutral-500 dark:text-neutral-400">
                من تقييم العملاء بعد إغلاق المحادثة{satisfaction?.unratedConversations ? ` · ${toEnglishDigits(satisfaction.unratedConversations)} محادثة مغلقة بلا تقييم` : ''}
              </p>
            </div>
          </CardBody>
        </Card>

        {/* Platform Bar Chart */}
        <Card variant="default" padding="none" className="min-w-0 rounded-2xl lg:col-span-3">
          <CardBody className="space-y-6 p-5 sm:p-6">
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

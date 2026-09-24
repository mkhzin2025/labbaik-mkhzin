import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  CheckCheck,
  ChevronDown,
  Database,
  FileText,
  Inbox,
  Languages,
  LayoutDashboard,
  Link2,
  Lock,
  LogIn,
  Mail,
  MessageCircle,
  MessagesSquare,
  Moon,
  Reply,
  Send,
  ShieldCheck,
  Sun,
  Trash2,
  Users,
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { LEGAL_CONFIG } from '../lib/legal-config';
import LogoImage from '../assets/logos/logo.png';
import LogoAltImage from '../assets/logos/logo-alt.png';

type Lang = 'ar' | 'en';

const LANG_STORAGE_KEY = 'landing_lang';

const content = {
  ar: {
    brand: 'لبيك',
    tagline: 'نظام الرد والتواصل الذكي',
    nav: { about: 'ما هو لبيك؟', whatsapp: 'WhatsApp Business', features: 'المميزات', data: 'استخدام البيانات', faq: 'الأسئلة الشائعة' },
    login: 'تسجيل الدخول',
    switchLang: 'English',
    themeToLight: 'الوضع الفاتح',
    themeToDark: 'الوضع الداكن',
    hero: {
      badge: 'مبني على WhatsApp Business Platform',
      title: 'لبيك - نظام الرد والتواصل الذكي',
      text: 'منصة تساعد المنشآت على إدارة محادثات العملاء عبر WhatsApp Business وتنظيم التواصل وخدمة العملاء من مكان واحد.',
      secondary: 'تعرّف على لبيك',
    },
    mock: {
      title: 'صندوق المحادثات',
      online: 'متصل',
      customer: 'عميل',
      m1: 'السلام عليكم، أرغب بالاستفسار عن حالة طلبي.',
      m2: 'وعليكم السلام، أهلًا بك! سيتابع معك أحد موظفي خدمة العملاء الآن.',
      m3: 'شكرًا لكم 🌷',
      assigned: 'مُسندة إلى: فريق خدمة العملاء',
      read: 'تمت القراءة',
    },
    about: {
      eyebrow: 'نبذة',
      title: 'ما هو لبيك؟',
      text: 'لبيك منصة لإدارة تواصل المنشآت مع عملائها، وتساعد فرق خدمة العملاء على استقبال المحادثات وتنظيمها ومتابعتها والرد عليها بكفاءة.',
      points: ['استقبال المحادثات', 'تنظيمها ومتابعتها', 'الرد عليها بكفاءة'],
    },
    whatsapp: {
      eyebrow: 'التكامل',
      title: 'تكامل WhatsApp Business',
      text: 'يستخدم لبيك WhatsApp Business Platform لتمكين المنشآت من إرسال واستقبال رسائل العملاء وإدارة المحادثات وحالات الرسائل من خلال واجهة موحدة.',
      detail: 'يعتمد النظام على WhatsApp Cloud API الرسمي من Meta، ويتعامل فقط مع أرقام WhatsApp Business التي تربطها المنشأة بحسابها والمحادثات المصرّح بها.',
      items: [
        { title: 'ربط رقم المنشأة', text: 'تربط المنشأة رقم WhatsApp Business الخاص بها بحسابها في لبيك.' },
        { title: 'استقبال الرسائل', text: 'تصل رسائل العملاء إلى صندوق محادثات موحد لفريق العمل.' },
        { title: 'الرد والمتابعة', text: 'يرد الفريق من المنصة ويتابع حالة كل رسالة: مُرسلة، مُستلمة، مقروءة.' },
      ],
    },
    features: {
      eyebrow: 'المميزات',
      title: 'كل ما يحتاجه فريق خدمة العملاء',
      list: [
        'إدارة محادثات العملاء.',
        'إرسال واستقبال رسائل WhatsApp Business.',
        'تنظيم المحادثات بين موظفي خدمة العملاء.',
        'متابعة حالة الرسائل.',
        'واجهة موحدة لإدارة التواصل.',
        'حماية بيانات العملاء واستخدامها فقط لتقديم الخدمة.',
      ],
    },
    data: {
      eyebrow: 'الخصوصية',
      title: 'استخدام البيانات',
      text: 'تُستخدم بيانات WhatsApp Business فقط لتقديم خدمات المراسلة وإدارة المحادثات المطلوبة من العميل. لا يقوم لبيك ببيع بيانات العملاء أو استخدامها لأغراض إعلانية.',
      pills: ['لا بيع للبيانات', 'لا استخدام إعلاني', 'حذف البيانات عند الطلب'],
      privacyCta: 'اقرأ سياسة الخصوصية',
      deletionCta: 'طلب حذف الحساب / البيانات',
    },
    faq: {
      eyebrow: 'الأسئلة الشائعة',
      title: 'أسئلة يطرحها عملاؤنا',
      items: [
        {
          q: 'لمن صُمّم لبيك؟',
          a: 'للمنشآت التي تتواصل مع عملائها عبر WhatsApp Business وتحتاج إلى تنظيم المحادثات بين أكثر من موظف في فريق خدمة العملاء.',
        },
        {
          q: 'هل يستخدم لبيك واجهة WhatsApp الرسمية؟',
          a: 'نعم، يعتمد لبيك على WhatsApp Business Platform (Cloud API) المقدّمة من Meta لإرسال واستقبال الرسائل.',
        },
        {
          q: 'هل تُباع بيانات العملاء أو تُستخدم للإعلانات؟',
          a: 'لا. تُستخدم البيانات فقط لتقديم خدمات المراسلة وإدارة المحادثات المطلوبة من العميل.',
        },
        {
          q: 'كيف أطلب حذف حسابي أو بياناتي؟',
          a: 'يمكنك تقديم الطلب من صفحة حذف الحساب والبيانات، أو التواصل معنا عبر البريد الإلكتروني للدعم.',
        },
      ],
    },
    cta: {
      title: 'جاهز لإدارة محادثات عملائك من مكان واحد؟',
      text: 'سجّل الدخول إلى لوحة التحكم وابدأ بمتابعة محادثاتك.',
    },
    footer: {
      about: 'منصة لإدارة محادثات العملاء والتواصل عبر WhatsApp Business.',
      legal: 'روابط قانونية',
      privacy: 'سياسة الخصوصية',
      terms: 'الشروط والأحكام',
      deletion: 'حذف الحساب / حذف البيانات',
      contact: 'تواصل معنا',
      rights: 'جميع الحقوق محفوظة.',
      meta: 'WhatsApp علامة تجارية مملوكة لشركة Meta Platforms, Inc.',
    },
    seo: {
      title: 'لبيك - نظام الرد والتواصل الذكي',
      description: 'منصة لإدارة محادثات العملاء والتواصل عبر WhatsApp Business.',
    },
  },
  en: {
    brand: 'Labbaik',
    tagline: 'Smart reply & communication system',
    nav: { about: 'About', whatsapp: 'WhatsApp Business', features: 'Features', data: 'Data use', faq: 'FAQ' },
    login: 'Log in',
    switchLang: 'العربية',
    themeToLight: 'Light mode',
    themeToDark: 'Dark mode',
    hero: {
      badge: 'Built on the WhatsApp Business Platform',
      title: 'Labbaik — Smart Reply & Communication System',
      text: 'A platform that helps businesses manage customer conversations over WhatsApp Business and organize communication and customer service from one place.',
      secondary: 'Learn more',
    },
    mock: {
      title: 'Inbox',
      online: 'Online',
      customer: 'Customer',
      m1: 'Hello, I would like to ask about my order status.',
      m2: 'Hi and welcome! A customer service agent will follow up with you now.',
      m3: 'Thank you 🌷',
      assigned: 'Assigned to: Customer Service team',
      read: 'Read',
    },
    about: {
      eyebrow: 'Overview',
      title: 'What is Labbaik?',
      text: 'Labbaik is a platform for managing how businesses communicate with their customers. It helps customer service teams receive, organize, follow up on and reply to conversations efficiently.',
      points: ['Receive conversations', 'Organize and follow up', 'Reply efficiently'],
    },
    whatsapp: {
      eyebrow: 'Integration',
      title: 'WhatsApp Business integration',
      text: 'Labbaik uses the WhatsApp Business Platform to enable businesses to send and receive customer messages and manage conversations and message statuses through a unified interface.',
      detail: "The system relies on Meta's official WhatsApp Cloud API and only handles the WhatsApp Business numbers a business connects to its account, and the conversations it is authorized to manage.",
      items: [
        { title: 'Connect your number', text: 'The business connects its own WhatsApp Business number to its Labbaik account.' },
        { title: 'Receive messages', text: 'Customer messages arrive in a unified inbox for the whole team.' },
        { title: 'Reply and track', text: 'The team replies from the platform and tracks each message: sent, delivered, read.' },
      ],
    },
    features: {
      eyebrow: 'Features',
      title: 'Everything a customer service team needs',
      list: [
        'Manage customer conversations.',
        'Send and receive WhatsApp Business messages.',
        'Organize conversations across customer service agents.',
        'Track message status.',
        'A unified interface for managing communication.',
        'Protect customer data and use it only to provide the service.',
      ],
    },
    data: {
      eyebrow: 'Privacy',
      title: 'How we use data',
      text: 'WhatsApp Business data is used only to provide messaging services and manage the conversations requested by the customer. Labbaik does not sell customer data or use it for advertising purposes.',
      pills: ['No data selling', 'No advertising use', 'Deletion on request'],
      privacyCta: 'Read the Privacy Policy',
      deletionCta: 'Request account / data deletion',
    },
    faq: {
      eyebrow: 'FAQ',
      title: 'Frequently asked questions',
      items: [
        {
          q: 'Who is Labbaik for?',
          a: 'Businesses that talk to their customers over WhatsApp Business and need to organize conversations across several customer service agents.',
        },
        {
          q: 'Does Labbaik use the official WhatsApp API?',
          a: 'Yes. Labbaik relies on the WhatsApp Business Platform (Cloud API) provided by Meta to send and receive messages.',
        },
        {
          q: 'Is customer data sold or used for ads?',
          a: 'No. Data is used only to provide messaging services and manage the conversations requested by the customer.',
        },
        {
          q: 'How do I request deletion of my account or data?',
          a: 'Submit a request from the account & data deletion page, or contact us via the support email.',
        },
      ],
    },
    cta: {
      title: 'Ready to manage your customer conversations from one place?',
      text: 'Log in to your dashboard and start following up on your conversations.',
    },
    footer: {
      about: 'A platform for managing customer conversations and communication via WhatsApp Business.',
      legal: 'Legal',
      privacy: 'Privacy Policy',
      terms: 'Terms & Conditions',
      deletion: 'Account / Data Deletion',
      contact: 'Contact',
      rights: 'All rights reserved.',
      meta: 'WhatsApp is a trademark of Meta Platforms, Inc.',
    },
    seo: {
      title: 'Labbaik - Smart Reply & Communication System',
      description: 'A platform for managing customer conversations and communication via WhatsApp Business.',
    },
  },
} as const;

const featureIcons = [MessagesSquare, Send, Users, CheckCheck, LayoutDashboard, ShieldCheck];
const stepIcons = [Link2, Inbox, Reply];

function readStoredLang(): Lang {
  try {
    return localStorage.getItem(LANG_STORAGE_KEY) === 'en' ? 'en' : 'ar';
  } catch {
    return 'ar';
  }
}

function SectionHeading({ eyebrow, title, center = false }: { eyebrow: string; title: string; center?: boolean }) {
  return (
    <div className={center ? 'text-center' : ''}>
      <span className="inline-block text-xs font-black tracking-wide text-labbaik-blue dark:text-purple-300 bg-labbaik-blue/10 dark:bg-purple-400/10 px-3 py-1 rounded-full">
        {eyebrow}
      </span>
      <h2 className="mt-3 text-2xl sm:text-3xl lg:text-4xl font-black text-neutral-900 dark:text-white leading-tight">{title}</h2>
    </div>
  );
}

export default function LandingPage() {
  const { theme, toggleTheme } = useTheme();
  const [lang, setLang] = useState<Lang>(readStoredLang);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const t = content[lang];
  const isAr = lang === 'ar';
  const Arrow = isAr ? ArrowLeft : ArrowRight;

  useEffect(() => {
    document.title = t.seo.title;
    document.querySelector('meta[name="description"]')?.setAttribute('content', t.seo.description);
    document.documentElement.lang = lang;
    try {
      localStorage.setItem(LANG_STORAGE_KEY, lang);
    } catch {
      // storage unavailable — language simply won't persist
    }
    return () => {
      document.documentElement.lang = 'ar';
    };
  }, [lang, t]);

  const navItems = [
    { href: '#about', label: t.nav.about },
    { href: '#whatsapp', label: t.nav.whatsapp },
    { href: '#features', label: t.nav.features },
    { href: '#data', label: t.nav.data },
    { href: '#faq', label: t.nav.faq },
  ];

  return (
    <div
      dir={isAr ? 'rtl' : 'ltr'}
      lang={lang}
      className="min-h-screen flex flex-col bg-labbaik-page text-neutral-900 dark:text-white transition-colors duration-300 overflow-x-hidden scroll-smooth"
    >
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/75 dark:bg-[#0a192f]/75 backdrop-blur-xl border-b border-labbaik-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 sm:h-20 flex items-center justify-between gap-3">
          <Link to="/" className="flex items-center gap-2.5 shrink-0 group" aria-label={t.brand}>
            <img
              src={theme === 'dark' ? LogoImage : LogoAltImage}
              alt=""
              className="h-9 sm:h-11 w-auto object-contain transition-transform group-hover:scale-105"
            />
            <div className="flex flex-col leading-none">
              <span className="text-lg sm:text-xl font-black text-labbaik-blue dark:text-white">{t.brand}</span>
              <span className="hidden sm:block text-[10px] text-labbaik-text-muted font-bold mt-1">{t.tagline}</span>
            </div>
          </Link>

          <nav className="hidden lg:flex items-center gap-1" aria-label="Sections">
            {navItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="text-sm font-bold text-neutral-600 dark:text-neutral-300 hover:text-labbaik-blue dark:hover:text-white px-3 py-2 rounded-xl hover:bg-labbaik-blue/5 dark:hover:bg-white/5 transition-colors"
              >
                {item.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => setLang(isAr ? 'en' : 'ar')}
              className="inline-flex items-center gap-1.5 h-10 px-2.5 sm:px-3 rounded-xl border border-labbaik-border bg-labbaik-surface text-neutral-700 dark:text-neutral-200 hover:text-labbaik-blue dark:hover:text-white transition-colors cursor-pointer"
              aria-label={t.switchLang}
              title={t.switchLang}
            >
              <Languages size={17} />
              <span className="hidden sm:inline text-xs font-bold">{t.switchLang}</span>
            </button>
            <button
              type="button"
              onClick={toggleTheme}
              className="inline-flex items-center justify-center h-10 w-10 rounded-xl border border-labbaik-border bg-labbaik-surface text-neutral-700 dark:text-neutral-200 hover:text-labbaik-blue transition-colors cursor-pointer"
              aria-label={theme === 'dark' ? t.themeToLight : t.themeToDark}
              title={theme === 'dark' ? t.themeToLight : t.themeToDark}
            >
              {theme === 'dark' ? <Sun size={17} className="text-amber-400" /> : <Moon size={17} className="text-labbaik-blue" />}
            </button>
            <Link
              to="/login"
              className="inline-flex items-center gap-1.5 h-10 px-3.5 sm:px-5 rounded-xl bg-labbaik-blue text-white text-sm font-black shadow-lg shadow-labbaik-blue/25 hover:bg-[#553174] hover:-translate-y-0.5 transition-all"
            >
              <LogIn size={16} className={isAr ? '-scale-x-100' : ''} />
              <span>{t.login}</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="relative isolate">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
            <div className="landing-blob absolute -top-32 start-1/2 h-[28rem] w-[28rem] rounded-full bg-labbaik-blue/25 dark:bg-labbaik-blue/40 blur-3xl" />
            <div className="landing-blob landing-blob-delay absolute top-40 -start-24 h-72 w-72 rounded-full bg-emerald-400/15 dark:bg-emerald-400/10 blur-3xl" />
            <div className="absolute inset-0 bg-[radial-gradient(rgba(100,59,137,0.12)_1px,transparent_1px)] dark:bg-[radial-gradient(rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" />
          </div>

          <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-12 pb-16 sm:pt-20 sm:pb-24 grid lg:grid-cols-2 gap-12 lg:gap-10 items-center">
            <div className="landing-rise text-center lg:text-start">
              <span className="inline-flex items-center gap-2 text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-full">
                <BadgeCheck size={14} />
                {t.hero.badge}
              </span>
              <h1 className="mt-5 text-3xl sm:text-5xl lg:text-[3.4rem] font-black leading-[1.2] text-neutral-900 dark:text-white">
                {t.hero.title}
              </h1>
              <p className="mt-5 text-base sm:text-lg leading-relaxed text-labbaik-text-muted max-w-xl mx-auto lg:mx-0">
                {t.hero.text}
              </p>
              <div className="mt-8 flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-3">
                <Link
                  to="/login"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 h-12 px-7 rounded-2xl bg-labbaik-blue text-white text-base font-black shadow-xl shadow-labbaik-blue/30 hover:bg-[#553174] hover:-translate-y-0.5 transition-all"
                >
                  {t.login}
                  <Arrow size={18} />
                </Link>
                <a
                  href="#about"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 h-12 px-7 rounded-2xl border border-labbaik-border bg-labbaik-surface text-neutral-800 dark:text-neutral-100 text-base font-bold hover:border-labbaik-blue/40 transition-colors"
                >
                  {t.hero.secondary}
                </a>
              </div>
            </div>

            {/* Illustrative inbox preview (pure UI, no real data) */}
            <div className="landing-rise landing-rise-delay relative mx-auto w-full max-w-md" aria-hidden="true">
              <div className="absolute -inset-4 rounded-[2rem] bg-gradient-to-br from-labbaik-blue/30 via-transparent to-emerald-400/20 blur-2xl" />
              <div className="relative rounded-3xl border border-labbaik-border bg-labbaik-surface shadow-2xl shadow-labbaik-blue/10 overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-labbaik-border">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-labbaik-blue/15 text-labbaik-blue dark:text-purple-300 grid place-items-center font-black">
                      <MessageCircle size={18} />
                    </div>
                    <div>
                      <p className="text-sm font-black">{t.mock.title}</p>
                      <p className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        {t.mock.online}
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] font-black uppercase text-white bg-emerald-500 px-2 py-1 rounded-lg">WhatsApp</span>
                </div>

                <div className="space-y-3 p-5 bg-labbaik-chat">
                  <div className="landing-bubble max-w-[82%] me-auto rounded-2xl rounded-ss-md bg-labbaik-surface px-4 py-2.5 text-sm shadow-sm">
                    <p className="text-[10px] font-black text-labbaik-blue dark:text-purple-300 mb-0.5">{t.mock.customer}</p>
                    {t.mock.m1}
                  </div>
                  <div className="landing-bubble landing-bubble-2 max-w-[82%] ms-auto rounded-2xl rounded-se-md bg-labbaik-blue text-white px-4 py-2.5 text-sm shadow-sm">
                    {t.mock.m2}
                    <span className="mt-1 flex items-center justify-end gap-1 text-[10px] text-white/75">
                      <CheckCheck size={13} className="text-sky-300" /> {t.mock.read}
                    </span>
                  </div>
                  <div className="landing-bubble landing-bubble-3 max-w-[60%] me-auto rounded-2xl rounded-ss-md bg-labbaik-surface px-4 py-2.5 text-sm shadow-sm">
                    {t.mock.m3}
                  </div>
                </div>

                <div className="flex items-center gap-2 px-5 py-3 border-t border-labbaik-border text-[11px] font-bold text-labbaik-text-muted">
                  <Users size={14} className="text-labbaik-blue dark:text-purple-300" />
                  {t.mock.assigned}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* About */}
        <section id="about" className="scroll-mt-24 max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
          <div className="grid lg:grid-cols-5 gap-10 items-center">
            <div className="lg:col-span-3">
              <SectionHeading eyebrow={t.about.eyebrow} title={t.about.title} />
              <p className="mt-5 text-base sm:text-lg leading-loose text-labbaik-text-muted">{t.about.text}</p>
            </div>
            <ul className="lg:col-span-2 grid gap-3">
              {t.about.points.map((point, i) => (
                <li
                  key={point}
                  className="flex items-center gap-4 rounded-2xl border border-labbaik-border bg-labbaik-surface px-5 py-4 shadow-sm"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-labbaik-blue text-white text-sm font-black">
                    {i + 1}
                  </span>
                  <span className="font-bold">{point}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* WhatsApp Business */}
        <section id="whatsapp" className="scroll-mt-24 bg-labbaik-deep border-y border-labbaik-border">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
            <div className="max-w-3xl">
              <SectionHeading eyebrow={t.whatsapp.eyebrow} title={t.whatsapp.title} />
              <p className="mt-5 text-base sm:text-lg leading-loose text-neutral-800 dark:text-neutral-100 font-medium">{t.whatsapp.text}</p>
              <p className="mt-3 text-sm sm:text-base leading-relaxed text-labbaik-text-muted">{t.whatsapp.detail}</p>
            </div>
            <ol className="mt-10 grid md:grid-cols-3 gap-4">
              {t.whatsapp.items.map((item, i) => {
                const Icon = stepIcons[i];
                return (
                  <li
                    key={item.title}
                    className="relative rounded-3xl border border-labbaik-border bg-labbaik-surface p-6 shadow-sm hover:-translate-y-1 hover:shadow-lg transition-all"
                  >
                    <span className="absolute top-5 end-6 text-4xl font-black text-labbaik-blue/10 dark:text-white/5 select-none">
                      0{i + 1}
                    </span>
                    <span className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                      <Icon size={22} />
                    </span>
                    <h3 className="mt-5 text-lg font-black">{item.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-labbaik-text-muted">{item.text}</p>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="scroll-mt-24 max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
          <SectionHeading eyebrow={t.features.eyebrow} title={t.features.title} center />
          <ul className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {t.features.list.map((feature, i) => {
              const Icon = featureIcons[i];
              return (
                <li
                  key={feature}
                  className="group flex items-start gap-4 rounded-3xl border border-labbaik-border bg-labbaik-surface p-6 shadow-sm hover:border-labbaik-blue/40 hover:shadow-lg hover:shadow-labbaik-blue/10 transition-all"
                >
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-labbaik-blue/10 text-labbaik-blue dark:text-purple-300 group-hover:bg-labbaik-blue group-hover:text-white transition-colors">
                    <Icon size={22} />
                  </span>
                  <p className="pt-2.5 font-bold leading-relaxed">{feature}</p>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Data use */}
        <section id="data" className="scroll-mt-24 max-w-6xl mx-auto px-4 sm:px-6 pb-16 sm:pb-20">
          <div className="relative overflow-hidden rounded-[2rem] border border-labbaik-border bg-labbaik-surface p-7 sm:p-12 shadow-sm">
            <div aria-hidden="true" className="absolute -top-20 -end-20 h-64 w-64 rounded-full bg-emerald-400/10 blur-3xl" />
            <div className="relative grid lg:grid-cols-[auto_1fr] gap-8 items-start">
              <span className="grid h-16 w-16 place-items-center rounded-3xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <Lock size={28} />
              </span>
              <div>
                <SectionHeading eyebrow={t.data.eyebrow} title={t.data.title} />
                <p className="mt-5 text-base sm:text-lg leading-loose text-neutral-800 dark:text-neutral-100 font-medium">{t.data.text}</p>
                <div className="mt-6 flex flex-wrap gap-2">
                  {t.data.pills.map((pill) => (
                    <span
                      key={pill}
                      className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-300"
                    >
                      <ShieldCheck size={13} />
                      {pill}
                    </span>
                  ))}
                </div>
                <div className="mt-7 flex flex-col sm:flex-row gap-3">
                  <Link
                    to="/privacy"
                    className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-xl bg-labbaik-blue/10 text-labbaik-blue dark:text-purple-200 text-sm font-black hover:bg-labbaik-blue hover:text-white transition-colors"
                  >
                    <FileText size={16} />
                    {t.data.privacyCta}
                  </Link>
                  <Link
                    to="/account-deletion"
                    className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-xl border border-labbaik-border text-sm font-bold text-neutral-700 dark:text-neutral-200 hover:border-labbaik-blue/40 transition-colors"
                  >
                    <Database size={16} />
                    {t.data.deletionCta}
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="scroll-mt-24 max-w-3xl mx-auto px-4 sm:px-6 pb-16 sm:pb-20">
          <SectionHeading eyebrow={t.faq.eyebrow} title={t.faq.title} center />
          <div className="mt-10 space-y-3">
            {t.faq.items.map((item, i) => {
              const open = openFaq === i;
              return (
                <div key={item.q} className="rounded-2xl border border-labbaik-border bg-labbaik-surface shadow-sm">
                  <button
                    type="button"
                    onClick={() => setOpenFaq(open ? null : i)}
                    aria-expanded={open}
                    className="w-full flex items-center justify-between gap-4 px-5 py-4 text-start font-black cursor-pointer"
                  >
                    {item.q}
                    <ChevronDown size={18} className={`shrink-0 text-labbaik-blue dark:text-purple-300 transition-transform ${open ? 'rotate-180' : ''}`} />
                  </button>
                  <div className={`grid transition-all duration-300 ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                    <p className="overflow-hidden px-5 text-sm leading-relaxed text-labbaik-text-muted">
                      <span className="block pb-5">{item.a}</span>
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* CTA */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-16 sm:pb-24">
          <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-labbaik-blue to-[#3d2257] px-6 py-12 sm:px-12 sm:py-16 text-center text-white shadow-2xl shadow-labbaik-blue/25">
            <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.12)_1px,transparent_1px)] [background-size:20px_20px] opacity-60" />
            <div className="relative">
              <h2 className="text-2xl sm:text-4xl font-black leading-tight">{t.cta.title}</h2>
              <p className="mt-4 text-white/80 sm:text-lg">{t.cta.text}</p>
              <Link
                to="/login"
                className="mt-8 inline-flex items-center justify-center gap-2 h-12 px-8 rounded-2xl bg-white text-labbaik-blue text-base font-black shadow-lg hover:-translate-y-0.5 transition-transform"
              >
                {t.login}
                <Arrow size={18} />
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-labbaik-border bg-labbaik-surface">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 grid gap-10 md:grid-cols-3">
          <div>
            <div className="flex items-center gap-2.5">
              <img src={theme === 'dark' ? LogoImage : LogoAltImage} alt="" className="h-9 w-auto object-contain" />
              <span className="text-lg font-black text-labbaik-blue dark:text-white">{t.brand}</span>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-labbaik-text-muted">{t.footer.about}</p>
          </div>

          <div>
            <h3 className="text-sm font-black">{t.footer.legal}</h3>
            <ul className="mt-4 space-y-3 text-sm font-bold text-labbaik-text-muted">
              <li>
                <Link to="/privacy" className="inline-flex items-center gap-2 hover:text-labbaik-blue dark:hover:text-white transition-colors">
                  <ShieldCheck size={15} /> {t.footer.privacy}
                </Link>
              </li>
              <li>
                <Link to="/terms" className="inline-flex items-center gap-2 hover:text-labbaik-blue dark:hover:text-white transition-colors">
                  <FileText size={15} /> {t.footer.terms}
                </Link>
              </li>
              <li>
                <Link to="/account-deletion" className="inline-flex items-center gap-2 hover:text-labbaik-blue dark:hover:text-white transition-colors">
                  <Trash2 size={15} /> {t.footer.deletion}
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-black">{t.footer.contact}</h3>
            <a
              href={`mailto:${LEGAL_CONFIG.supportEmail}`}
              dir="ltr"
              className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-labbaik-text-muted hover:text-labbaik-blue dark:hover:text-white transition-colors"
            >
              <Mail size={15} /> {LEGAL_CONFIG.supportEmail}
            </a>
          </div>
        </div>

        <div className="border-t border-labbaik-border">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-labbaik-text-muted">
            <span>
              © {new Date().getFullYear()} {isAr ? 'لبيك (Labbaik)' : 'Labbaik'}. {t.footer.rights}
            </span>
            <span>{t.footer.meta}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

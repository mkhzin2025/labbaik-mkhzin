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
import LogoImage from '../assets/logos/logo.png';
import LogoAltImage from '../assets/logos/logo-alt.png';

type Lang = 'ar' | 'en';

const LANG_STORAGE_KEY = 'landing_lang';
const CONTACT_EMAIL = 'info@mkhzin.com';

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
      reply: 'اكتب ردك هنا...',
    },
    about: {
      title: 'ما هو لبيك؟',
      text: 'لبيك منصة لإدارة تواصل المنشآت مع عملائها، وتساعد فرق خدمة العملاء على استقبال المحادثات وتنظيمها ومتابعتها والرد عليها بكفاءة.',
      points: ['استقبال المحادثات', 'تنظيمها ومتابعتها', 'الرد عليها بكفاءة'],
    },
    whatsapp: {
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
      title: 'استخدام البيانات',
      text: 'تُستخدم بيانات WhatsApp Business فقط لتقديم خدمات المراسلة وإدارة المحادثات المطلوبة من العميل. لا يقوم لبيك ببيع بيانات العملاء أو استخدامها لأغراض إعلانية.',
      pills: ['لا بيع للبيانات', 'لا استخدام إعلاني', 'حذف البيانات عند الطلب'],
      privacyCta: 'اقرأ سياسة الخصوصية',
      deletionCta: 'طلب حذف الحساب / البيانات',
    },
    faq: {
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
      reply: 'Type your reply...',
    },
    about: {
      title: 'What is Labbaik?',
      text: 'Labbaik is a platform for managing how businesses communicate with their customers. It helps customer service teams receive, organize, follow up on and reply to conversations efficiently.',
      points: ['Receive conversations', 'Organize and follow up', 'Reply efficiently'],
    },
    whatsapp: {
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
      title: 'How we use data',
      text: 'WhatsApp Business data is used only to provide messaging services and manage the conversations requested by the customer. Labbaik does not sell customer data or use it for advertising purposes.',
      pills: ['No data selling', 'No advertising use', 'Deletion on request'],
      privacyCta: 'Read the Privacy Policy',
      deletionCta: 'Request account / data deletion',
    },
    faq: {
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

function SectionHeading({ title, center = false }: { title: string; center?: boolean }) {
  return (
    <h2
      className={`text-2xl sm:text-3xl lg:text-4xl font-black text-neutral-900 dark:text-white leading-tight text-balance ${center ? 'text-center' : ''}`}
    >
      {title}
    </h2>
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
      className="landing min-h-screen flex flex-col bg-labbaik-page text-neutral-900 dark:text-white transition-colors duration-300 overflow-x-hidden scroll-smooth"
    >
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/75 dark:bg-[#0a192f]/75 backdrop-blur-xl border-b border-labbaik-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 sm:h-20 flex items-center justify-between gap-3">
          <Link to="/" className="flex items-center gap-2.5 shrink-0" aria-label={t.brand}>
            <img src={theme === 'dark' ? LogoImage : LogoAltImage} alt="" className="h-9 sm:h-11 w-auto object-contain" />
            <div className="flex flex-col leading-none">
              <span className="text-lg sm:text-xl font-black text-labbaik-blue dark:text-white">{t.brand}</span>
              <span className="hidden sm:block text-[11px] text-labbaik-text-muted font-bold mt-1">{t.tagline}</span>
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
              className="inline-flex items-center gap-1.5 h-10 px-3.5 sm:px-5 rounded-xl bg-labbaik-blue text-white text-sm font-black hover:bg-[#553174] transition-colors"
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
            <div className="absolute inset-0 bg-[radial-gradient(rgba(100,59,137,0.12)_1px,transparent_1px)] dark:bg-[radial-gradient(rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" />
          </div>

          <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-12 pb-16 sm:pt-20 sm:pb-24 grid lg:grid-cols-2 gap-12 lg:gap-10 items-center">
            <div className="landing-rise text-center lg:text-start">
              <h1 className="text-3xl sm:text-5xl lg:text-[3.4rem] font-black leading-[1.2] text-neutral-900 dark:text-white text-balance">
                {t.hero.title}
              </h1>
              <p className="mt-5 text-base sm:text-lg leading-relaxed text-labbaik-text-muted max-w-xl mx-auto lg:mx-0">
                {t.hero.text}
              </p>
              <div className="mt-8 flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-3">
                <Link
                  to="/login"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 h-12 px-7 rounded-2xl bg-labbaik-blue text-white text-base font-black hover:bg-[#553174] transition-colors"
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
              <p className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-emerald-700 dark:text-emerald-300">
                <BadgeCheck size={16} />
                {t.hero.badge}
              </p>
            </div>

            {/* Illustrative inbox preview (pure UI, no real data) — mirrors the real conversations screen */}
            <div className="landing-rise landing-rise-delay relative mx-auto w-full max-w-md" aria-hidden="true">
              <div className="relative rounded-2xl border border-labbaik-border bg-labbaik-surface shadow-[0_24px_48px_-24px_rgba(15,10,30,0.35)] overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-labbaik-border">
                  <p className="text-sm font-black flex items-center gap-2">
                    <MessageCircle size={16} className="text-labbaik-blue dark:text-purple-300" />
                    {t.mock.title}
                  </p>
                  <span className="text-[11px] font-black text-white bg-emerald-700 px-2 py-0.5 rounded-md">WhatsApp</span>
                </div>

                <div className="flex items-center gap-3 px-4 py-3 border-b border-labbaik-border">
                  <div className="relative shrink-0">
                    <div className="grid h-10 w-10 place-items-center rounded-full bg-[#047857] text-sm font-black text-white">
                      {Array.from(t.mock.customer)[0]}
                    </div>
                    <span className="absolute -bottom-0.5 -start-0.5 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-labbaik-surface" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-black">{t.mock.customer}</p>
                    <p className="text-[11px] font-bold text-labbaik-text-muted flex items-center gap-1">
                      <Users size={12} className="text-labbaik-blue dark:text-purple-300" />
                      {t.mock.assigned}
                    </p>
                  </div>
                  <span className="ms-auto text-[11px] font-bold text-emerald-700 dark:text-emerald-300">{t.mock.online}</span>
                </div>

                <div className="space-y-2.5 px-4 py-5 bg-labbaik-chat">
                  <div className="landing-bubble max-w-[82%] ms-auto rounded-2xl rounded-se-sm bg-labbaik-surface px-3.5 py-2.5 text-sm leading-relaxed">
                    {t.mock.m1}
                    <span className="mt-1 block text-end text-[11px] font-bold text-labbaik-text-muted tabular-nums">10:24</span>
                  </div>
                  <div className="landing-bubble landing-bubble-2 max-w-[82%] me-auto rounded-2xl rounded-ss-sm bg-labbaik-blue text-white px-3.5 py-2.5 text-sm leading-relaxed">
                    {t.mock.m2}
                    <span className="mt-1 flex items-center gap-2 text-[11px] font-bold text-white/80">
                      <span className="tabular-nums">10:25</span>
                      <span className="flex items-center gap-1"><CheckCheck size={14} className="text-sky-300" /> {t.mock.read}</span>
                    </span>
                  </div>
                  <div className="landing-bubble landing-bubble-3 max-w-[60%] ms-auto rounded-2xl rounded-se-sm bg-labbaik-surface px-3.5 py-2.5 text-sm">
                    {t.mock.m3}
                    <span className="mt-1 block text-end text-[11px] font-bold text-labbaik-text-muted tabular-nums">10:26</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 px-4 py-3 border-t border-labbaik-border">
                  <input
                    readOnly
                    tabIndex={-1}
                    placeholder={t.mock.reply}
                    className="flex-1 min-w-0 h-10 rounded-xl border border-labbaik-border bg-labbaik-page px-3 text-xs font-medium placeholder:text-labbaik-text-muted pointer-events-none"
                  />
                  <div className="grid h-10 w-10 place-items-center rounded-xl bg-labbaik-blue text-white">
                    <Send size={16} className={isAr ? '-scale-x-100' : ''} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* About */}
        <section id="about" className="scroll-mt-24 max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
          <div className="grid lg:grid-cols-5 gap-10 items-center">
            <div className="lg:col-span-3">
              <SectionHeading title={t.about.title} />
              <p className="mt-5 text-base sm:text-lg leading-loose text-labbaik-text-muted">{t.about.text}</p>
            </div>
            <ul className="lg:col-span-2 divide-y divide-labbaik-border border-y border-labbaik-border">
              {t.about.points.map((point, i) => (
                <li key={point} className="flex items-center gap-4 py-4">
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
              <SectionHeading title={t.whatsapp.title} />
              <p className="mt-5 text-base sm:text-lg leading-loose text-neutral-800 dark:text-neutral-100 font-medium">{t.whatsapp.text}</p>
              <p className="mt-3 text-sm sm:text-base leading-relaxed text-labbaik-text-muted">{t.whatsapp.detail}</p>
            </div>
            <ol className="mt-10 grid md:grid-cols-3 gap-8">
              {t.whatsapp.items.map((item, i) => {
                const Icon = stepIcons[i];
                return (
                  <li key={item.title} className="border-t-2 border-labbaik-blue/30 dark:border-purple-300/30 pt-5">
                    <span className="flex items-center gap-2 text-sm font-black text-emerald-700 dark:text-emerald-300">
                      <Icon size={18} />
                      {i + 1}
                    </span>
                    <h3 className="mt-3 text-lg font-black">{item.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-labbaik-text-muted">{item.text}</p>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="scroll-mt-24 max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
          <SectionHeading title={t.features.title} center />
          <ul className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-x-10">
            {t.features.list.map((feature, i) => {
              const Icon = featureIcons[i];
              return (
                <li key={feature} className="flex items-start gap-3 border-b border-labbaik-border py-4">
                  <Icon size={20} className="mt-0.5 shrink-0 text-labbaik-blue dark:text-purple-300" />
                  <p className="font-bold leading-relaxed">{feature}</p>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Data use */}
        <section id="data" className="scroll-mt-24 max-w-6xl mx-auto px-4 sm:px-6 pb-16 sm:pb-20">
          <div className="rounded-2xl border border-labbaik-border bg-labbaik-surface p-7 sm:p-12">
            <div className="grid lg:grid-cols-[auto_1fr] gap-6 lg:gap-8 items-start">
              <Lock size={32} className="text-emerald-700 dark:text-emerald-300" />
              <div>
                <SectionHeading title={t.data.title} />
                <p className="mt-5 text-base sm:text-lg leading-loose text-neutral-800 dark:text-neutral-100 font-medium">{t.data.text}</p>
                <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2">
                  {t.data.pills.map((pill) => (
                    <span key={pill} className="inline-flex items-center gap-1.5 text-sm font-bold text-emerald-700 dark:text-emerald-300">
                      <ShieldCheck size={15} />
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
          <SectionHeading title={t.faq.title} center />
          <div className="mt-10 divide-y divide-labbaik-border border-y border-labbaik-border">
            {t.faq.items.map((item, i) => {
              const open = openFaq === i;
              return (
                <div key={item.q}>
                  <button
                    type="button"
                    onClick={() => setOpenFaq(open ? null : i)}
                    aria-expanded={open}
                    className="w-full flex items-center justify-between gap-4 py-5 text-start font-black cursor-pointer hover:text-labbaik-blue dark:hover:text-purple-200 transition-colors"
                  >
                    {item.q}
                    <ChevronDown size={18} className={`shrink-0 text-labbaik-blue dark:text-purple-300 transition-transform ${open ? 'rotate-180' : ''}`} />
                  </button>
                  <div className={`grid transition-all duration-300 ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                    <p className="overflow-hidden text-sm sm:text-base leading-relaxed text-labbaik-text-muted">
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
          <div className="rounded-2xl bg-labbaik-blue px-6 py-12 sm:px-12 sm:py-16 text-center text-white">
            <h2 className="text-2xl sm:text-4xl font-black leading-tight text-balance">{t.cta.title}</h2>
            <p className="mt-4 text-[#efe6f8] sm:text-lg">{t.cta.text}</p>
            <Link
              to="/login"
              className="mt-8 inline-flex items-center justify-center gap-2 h-12 px-8 rounded-2xl bg-white text-labbaik-blue text-base font-black hover:bg-[#f3ecfa] transition-colors"
            >
              {t.login}
              <Arrow size={18} />
            </Link>
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
              href={`mailto:${CONTACT_EMAIL}`}
              dir="ltr"
              className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-labbaik-text-muted hover:text-labbaik-blue dark:hover:text-white transition-colors"
            >
              <Mail size={15} /> {CONTACT_EMAIL}
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

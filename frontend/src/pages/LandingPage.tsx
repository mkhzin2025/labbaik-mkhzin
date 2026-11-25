import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  Database,
  FileText,
  Inbox,
  Languages,
  LayoutDashboard,
  Link2,
  Lock,
  Loader2,
  LogIn,
  Mail,
  MessageCircle,
  MessagesSquare,
  Moon,
  Reply,
  Send,
  ShieldCheck,
  Sun,
  Sparkles,
  Trash2,
  Users,
  Zap,
} from 'lucide-react';
import { trialRequestsApi } from '../lib/trial-requests';
import { useTheme } from '../context/ThemeContext';
import LogoImage from '../assets/logos/tael-bot-glyph-white.svg';
import LogoAltImage from '../assets/logos/tael-bot-glyph-purple.svg';

type Lang = 'ar' | 'en';

const LANG_STORAGE_KEY = 'landing_lang';
const CONTACT_EMAIL = 'info@mkhzin.com';

const content = {
  ar: {
    brand: 'تيل بوت',
    tagline: 'نظام الرد والتواصل الذكي',
    nav: { about: 'ما هو تيل بوت؟', channels: 'القنوات', features: 'المميزات', faq: 'الأسئلة الشائعة', trial: 'اطلب تجربة' },
    login: 'تسجيل الدخول',
    switchLang: 'English',
    themeToLight: 'الوضع الفاتح',
    themeToDark: 'الوضع الداكن',
    hero: {
      badge: 'مبني على WhatsApp Business Platform',
      title: 'تيل بوت - نظام الرد والتواصل الذكي',
      text: 'منصة تساعد المنشآت على إدارة محادثات العملاء عبر WhatsApp Business وتنظيم التواصل وخدمة العملاء من مكان واحد.',
      secondary: 'تعرّف على تيل بوت',
      primary: 'اطلب تجربة',
      note: 'نجهّز لك الحساب ونربط رقمك معك خطوة بخطوة.',
    },
    channels: {
      title: 'كل قنواتك في صندوق واحد',
      text: 'رسائل واتساب وإنستغرام وماسنجر وتقييمات فروعك تصل لفريقك في مكان واحد، فلا تفوتك رسالة ولا يضيع عميل.',
      hub: 'صندوق موحد لفريقك',
      list: [
        { name: 'WhatsApp Business', text: 'المحادثات والحملات والردود الآلية' },
        { name: 'Instagram', text: 'رسائل الدايركت في نفس الصندوق' },
        { name: 'Messenger', text: 'رسائل صفحتك على فيسبوك' },
        { name: 'Google Maps', text: 'تقييمات فروعك والرد عليها' },
      ],
      capabilities: ['ردود آلية على مدار الساعة', 'تدفقات محادثة بدون برمجة', 'حملات واتساب جماعية', 'توزيع المحادثات على الفريق', 'تقييم رضا العملاء', 'تقارير أداء الموظفين', 'إغلاق تلقائي للمحادثات', 'متابعة حالة كل رسالة'],
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
      title: 'ما هو تيل بوت؟',
      text: 'تيل بوت منصة لإدارة تواصل المنشآت مع عملائها، وتساعد فرق خدمة العملاء على استقبال المحادثات وتنظيمها ومتابعتها والرد عليها بكفاءة.',
      points: ['استقبال المحادثات', 'تنظيمها ومتابعتها', 'الرد عليها بكفاءة'],
    },
    whatsapp: {
      title: 'تكامل WhatsApp Business',
      text: 'يستخدم تيل بوت WhatsApp Business Platform لتمكين المنشآت من إرسال واستقبال رسائل العملاء وإدارة المحادثات وحالات الرسائل من خلال واجهة موحدة.',
      detail: 'يعتمد النظام على WhatsApp Cloud API الرسمي من Meta، ويتعامل فقط مع أرقام WhatsApp Business التي تربطها المنشأة بحسابها والمحادثات المصرّح بها.',
      items: [
        { title: 'ربط رقم المنشأة', text: 'تربط المنشأة رقم WhatsApp Business الخاص بها بحسابها في تيل بوت.' },
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
      text: 'تُستخدم بيانات WhatsApp Business فقط لتقديم خدمات المراسلة وإدارة المحادثات المطلوبة من العميل. لا يقوم تيل بوت ببيع بيانات العملاء أو استخدامها لأغراض إعلانية.',
      pills: ['لا بيع للبيانات', 'لا استخدام إعلاني', 'حذف البيانات عند الطلب'],
      privacyCta: 'اقرأ سياسة الخصوصية',
      deletionCta: 'طلب حذف الحساب / البيانات',
    },
    faq: {
      title: 'أسئلة يطرحها عملاؤنا',
      items: [
        {
          q: 'لمن صُمّم تيل بوت؟',
          a: 'للمنشآت التي تتواصل مع عملائها عبر WhatsApp Business وتحتاج إلى تنظيم المحادثات بين أكثر من موظف في فريق خدمة العملاء.',
        },
        {
          q: 'هل يستخدم تيل بوت واجهة WhatsApp الرسمية؟',
          a: 'نعم، يعتمد تيل بوت على WhatsApp Business Platform (Cloud API) المقدّمة من Meta لإرسال واستقبال الرسائل.',
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
    trial: {
      title: 'جرّب تيل بوت على عملائك',
      text: 'اترك بياناتك ويتواصل معك فريقنا خلال يوم عمل، يجهّز حسابك ويربط رقمك ويريك كيف يرد تيل بوت عنك.',
      perks: ['تجهيز الحساب وربط الرقم معك', 'تدفق ترحيبي جاهز لعملائك', 'دعم مباشر من فريقنا بالعربي'],
      name: 'الاسم',
      phone: 'رقم الجوال',
      company: 'اسم المنشأة',
      message: 'ملاحظة (اختياري)',
      messageHint: 'مثلًا: عدد الفروع أو القنوات التي تستخدمها',
      submit: 'أرسل الطلب',
      sending: 'جارٍ الإرسال...',
      doneTitle: 'وصلنا طلبك، شكرًا لك!',
      doneText: 'سيتواصل معك فريقنا قريبًا على رقم جوالك.',
      again: 'إرسال طلب آخر',
      error: 'تعذر إرسال الطلب، حاول مرة أخرى.',
      privacy: 'نستخدم بياناتك للتواصل معك بخصوص الطلب فقط.',
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
      title: 'تيل بوت | منصة إدارة محادثات واتساب للأعمال وخدمة العملاء',
      description: 'تيل بوت منصة لإدارة محادثات العملاء عبر واتساب للأعمال (WhatsApp Business API): صندوق محادثات موحد لفريقك، توزيع المحادثات على الموظفين، ومتابعة حالة الرسائل من مكان واحد.',
    },
  },
  en: {
    brand: 'Tael Bot',
    tagline: 'Smart reply & communication system',
    nav: { about: 'About', channels: 'Channels', features: 'Features', faq: 'FAQ', trial: 'Request a trial' },
    login: 'Log in',
    switchLang: 'العربية',
    themeToLight: 'Light mode',
    themeToDark: 'Dark mode',
    hero: {
      badge: 'Built on the WhatsApp Business Platform',
      title: 'Tael Bot — Smart Reply & Communication System',
      text: 'A platform that helps businesses manage customer conversations over WhatsApp Business and organize communication and customer service from one place.',
      secondary: 'Learn more',
      primary: 'Request a trial',
      note: 'We set up your account and connect your number with you, step by step.',
    },
    channels: {
      title: 'All your channels in one inbox',
      text: 'WhatsApp, Instagram, Messenger and your branch reviews reach your team in one place, so no message or customer slips through.',
      hub: 'One inbox for your team',
      list: [
        { name: 'WhatsApp Business', text: 'Chats, campaigns and auto-replies' },
        { name: 'Instagram', text: 'Direct messages in the same inbox' },
        { name: 'Messenger', text: 'Messages to your Facebook page' },
        { name: 'Google Maps', text: 'Your branch reviews, answered' },
      ],
      capabilities: ['24/7 auto-replies', 'No-code conversation flows', 'WhatsApp broadcast campaigns', 'Team assignment', 'Customer satisfaction ratings', 'Agent performance reports', 'Auto-closing conversations', 'Per-message delivery status'],
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
      title: 'What is Tael Bot?',
      text: 'Tael Bot is a platform for managing how businesses communicate with their customers. It helps customer service teams receive, organize, follow up on and reply to conversations efficiently.',
      points: ['Receive conversations', 'Organize and follow up', 'Reply efficiently'],
    },
    whatsapp: {
      title: 'WhatsApp Business integration',
      text: 'Tael Bot uses the WhatsApp Business Platform to enable businesses to send and receive customer messages and manage conversations and message statuses through a unified interface.',
      detail: "The system relies on Meta's official WhatsApp Cloud API and only handles the WhatsApp Business numbers a business connects to its account, and the conversations it is authorized to manage.",
      items: [
        { title: 'Connect your number', text: 'The business connects its own WhatsApp Business number to its Tael Bot account.' },
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
      text: 'WhatsApp Business data is used only to provide messaging services and manage the conversations requested by the customer. Tael Bot does not sell customer data or use it for advertising purposes.',
      pills: ['No data selling', 'No advertising use', 'Deletion on request'],
      privacyCta: 'Read the Privacy Policy',
      deletionCta: 'Request account / data deletion',
    },
    faq: {
      title: 'Frequently asked questions',
      items: [
        {
          q: 'Who is Tael Bot for?',
          a: 'Businesses that talk to their customers over WhatsApp Business and need to organize conversations across several customer service agents.',
        },
        {
          q: 'Does Tael Bot use the official WhatsApp API?',
          a: 'Yes. Tael Bot relies on the WhatsApp Business Platform (Cloud API) provided by Meta to send and receive messages.',
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
    trial: {
      title: 'Try Tael Bot with your customers',
      text: 'Leave your details and our team will reach out within a business day to set up your account, connect your number and show you Tael Bot replying for you.',
      perks: ['Account setup and number connection with you', 'A ready welcome flow for your customers', 'Direct support from our team'],
      name: 'Name',
      phone: 'Mobile number',
      company: 'Business name',
      message: 'Note (optional)',
      messageHint: 'e.g. number of branches or channels you use',
      submit: 'Send request',
      sending: 'Sending...',
      doneTitle: 'Request received, thank you!',
      doneText: 'Our team will contact you soon on your mobile number.',
      again: 'Send another request',
      error: 'Could not send the request, please try again.',
      privacy: 'We use your details only to contact you about this request.',
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
      title: 'Tael Bot | WhatsApp Business Customer Conversations Platform',
      description: 'Tael Bot helps businesses manage customer conversations on the WhatsApp Business API: a shared team inbox, conversation assignment, and message status tracking in one place.',
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

type ChannelsCopy = (typeof content)[Lang]['channels'];
type TrialCopy = (typeof content)[Lang]['trial'];

/** The channels' own marks (paths from Simple Icons, CC0), shown only to name the channels we connect to. */
const WHATSAPP_PATH = 'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z';
const INSTAGRAM_PATH = 'M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077';
const MESSENGER_PATH = 'M.001 11.639C.001 4.949 5.241 0 12.001 0S24 4.95 24 11.639c0 6.689-5.24 11.638-12 11.638-1.21 0-2.38-.16-3.47-.46a.96.96 0 00-.64.05l-2.39 1.05a.96.96 0 01-1.35-.85l-.07-2.14a.97.97 0 00-.32-.68A11.39 11.389 0 01.002 11.64zm8.32-2.19l-3.52 5.6c-.35.53.32 1.139.82.75l3.79-2.87c.26-.2.6-.2.87 0l2.8 2.1c.84.63 2.04.4 2.6-.48l3.52-5.6c.35-.53-.32-1.13-.82-.75l-3.79 2.87c-.25.2-.6.2-.86 0l-2.8-2.1a1.8 1.8 0 00-2.61.48z';
/** Google Maps' pin in its five coloured pieces. */
const MAPS_PIECES: [string, string][] = [
  ['#34A853', 'M19.527 4.799c1.212 2.608.937 5.678-.405 8.173-1.101 2.047-2.744 3.74-4.098 5.614-.619.858-1.244 1.75-1.669 2.727-.141.325-.263.658-.383.992-.121.333-.224.673-.34 1.008-.109.314-.236.684-.627.687h-.007c-.466-.001-.579-.53-.695-.887-.284-.874-.581-1.713-1.019-2.525-.51-.944-1.145-1.817-1.79-2.671L19.527 4.799z'],
  ['#FBBC04', 'M8.545 7.705l-3.959 4.707c.724 1.54 1.821 2.863 2.871 4.18.247.31.494.622.737.936l4.984-5.925-.029.01c-1.741.601-3.691-.291-4.392-1.987a3.377 3.377 0 0 1-.209-.716c-.063-.437-.077-.761-.004-1.198l.001-.007z'],
  ['#EA4335', 'M5.492 3.149l-.003.004c-1.947 2.466-2.281 5.88-1.117 8.77l4.785-5.689-.058-.05-3.607-3.035z'],
  ['#4285F4', 'M14.661.436l-3.838 4.563a.295.295 0 0 1 .027-.01c1.6-.551 3.403.15 4.22 1.626.176.319.323.683.377 1.045.068.446.085.773.012 1.22l-.003.016 3.836-4.561A8.382 8.382 0 0 0 14.67.439l-.009-.003z'],
  ['#1A73E8', 'M9.466 5.868L14.162.285l-.047-.012A8.31 8.31 0 0 0 11.986 0a8.439 8.439 0 0 0-6.169 2.766l-.016.018 3.665 3.084z'],
];

const glyph = (path: string) => (
  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden="true"><path d={path} /></svg>
);

/** In the order of `channels.list`: the logo tile and the colour of its signal dot. */
const channelLooks = [
  { logo: glyph(WHATSAPP_PATH), tile: 'bg-[#25D366] text-white', signal: 'bg-[#25D366]' },
  { logo: glyph(INSTAGRAM_PATH), tile: 'bg-[radial-gradient(circle_at_30%_107%,#fdf497_0%,#fdf497_5%,#fd5949_45%,#d6249f_60%,#285AEB_90%)] text-white', signal: 'bg-[#d6249f]' },
  { logo: glyph(MESSENGER_PATH), tile: 'bg-[linear-gradient(45deg,#0099FF,#A033FF_60%,#FF5280_90%,#FF7061)] text-white', signal: 'bg-[#A033FF]' },
  {
    logo: <svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden="true">{MAPS_PIECES.map(([fill, d]) => <path key={fill} fill={fill} d={d} />)}</svg>,
    tile: 'bg-white border border-labbaik-border',
    signal: 'bg-[#4285F4]',
  },
];

function ChannelCard({ index, item, towards }: { index: number; item: ChannelsCopy['list'][number]; towards: 'end' | 'start' }) {
  const { logo, tile, signal } = channelLooks[index];
  // The connector sits on the hub's side of the card; its signal travels into the hub.
  const connector = (
    <div aria-hidden="true" className="hidden lg:block relative h-px w-14 xl:w-20 shrink-0 bg-gradient-to-r from-labbaik-border via-labbaik-blue/30 to-labbaik-border">
      <span className={`landing-signal ${signal} ${towards === 'end' ? 'landing-signal-to-end' : 'landing-signal-to-start'}`} style={{ animationDelay: `${index * 0.6}s` }} />
    </div>
  );
  return (
    <div className="flex items-center">
      {towards === 'start' && connector}
      <div className="flex-1 flex items-center gap-3.5 rounded-2xl border border-labbaik-border bg-labbaik-surface p-4">
        <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${tile}`}>{logo}</span>
        <span className="min-w-0">
          <span className="block font-black" dir="ltr">{item.name}</span>
          <span className="block text-sm text-labbaik-text-muted leading-snug">{item.text}</span>
        </span>
      </div>
      {towards === 'end' && connector}
    </div>
  );
}

function ChannelsSection({ t, isAr, logo }: { t: ChannelsCopy; isAr: boolean; logo: string }) {
  const half = Math.ceil(t.list.length / 2);
  return (
    <section id="channels" className="scroll-mt-24 border-y border-labbaik-border bg-labbaik-surface/60">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
        <div className="max-w-2xl mx-auto text-center">
          <SectionHeading title={t.title} center />
          <p className="mt-4 text-base sm:text-lg leading-relaxed text-labbaik-text-muted">{t.text}</p>
        </div>

        <div className="mt-12 grid gap-4 lg:gap-0 lg:grid-cols-[1fr_auto_1fr] lg:items-center">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 lg:gap-6">
            {t.list.slice(0, half).map((item, i) => <ChannelCard key={item.name} index={i} item={item} towards="end" />)}
          </div>

          {/* The hub every channel flows into */}
          <div className="order-first lg:order-none flex flex-col items-center justify-center py-4 lg:py-0">
            <span className="grid h-24 w-24 sm:h-28 sm:w-28 place-items-center rounded-3xl bg-labbaik-blue">
              <img src={logo} alt="" className="h-12 sm:h-14 w-auto" />
            </span>
            <p className="mt-3 inline-flex items-center gap-1.5 text-sm font-bold text-labbaik-text-muted">
              <Inbox size={15} /> {t.hub}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 lg:gap-6">
            {t.list.slice(half).map((item, i) => <ChannelCard key={item.name} index={half + i} item={item} towards="start" />)}
          </div>
        </div>

        {/* Capabilities strip: always scrolls the same way, whatever the page direction. */}
        <div dir="ltr" className="landing-marquee-wrap mt-14 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]">
          <ul className="landing-marquee flex w-max gap-3">
            {[...t.capabilities, ...t.capabilities].map((item, i) => (
              <li
                key={`${item}-${i}`}
                aria-hidden={i >= t.capabilities.length}
                dir={isAr ? 'rtl' : 'ltr'}
                className="inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-labbaik-border bg-labbaik-surface px-4 py-2 text-sm font-bold"
              >
                <Zap size={14} className="text-labbaik-blue dark:text-purple-300" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

const fieldClass =
  'w-full h-12 rounded-xl border border-labbaik-border bg-labbaik-page px-4 text-sm font-medium text-neutral-900 dark:text-white placeholder:text-labbaik-text-muted focus:outline-none focus:ring-2 focus:ring-labbaik-blue/30 focus:border-labbaik-blue transition-colors';

function TrialSection({ t }: { t: TrialCopy }) {
  const [form, setForm] = useState({ name: '', phone: '', company: '', message: '', website: '' });
  const [state, setState] = useState<'idle' | 'sending' | 'done'>('idle');
  const [error, setError] = useState('');
  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setState('sending');
    setError('');
    try {
      await trialRequestsApi.submit(form);
      setState('done');
      setForm({ name: '', phone: '', company: '', message: '', website: '' });
    } catch (err) {
      setState('idle');
      setError((err as { response?: { data?: { message?: string } } })?.response?.data?.message || t.error);
    }
  };

  return (
    <section id="trial" className="scroll-mt-24 max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
      <div className="grid lg:grid-cols-2 overflow-hidden rounded-3xl border border-labbaik-border bg-labbaik-surface shadow-[0_30px_60px_-40px_rgba(15,10,30,0.5)]">
        <div className="relative isolate bg-labbaik-blue px-6 py-10 sm:px-10 sm:py-14 text-white">
          <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[radial-gradient(rgba(255,255,255,0.12)_1px,transparent_1px)] [background-size:20px_20px] [mask-image:linear-gradient(to_bottom,black,transparent)]" />
          <h2 className="text-2xl sm:text-4xl font-black leading-tight text-balance">{t.title}</h2>
          <p className="mt-4 text-[#efe6f8] leading-relaxed sm:text-lg">{t.text}</p>
          <ul className="mt-8 space-y-3">
            {t.perks.map((perk) => (
              <li key={perk} className="flex items-center gap-3 font-bold">
                <CheckCircle2 size={20} className="shrink-0 text-emerald-300" />
                {perk}
              </li>
            ))}
          </ul>
        </div>

        <div className="px-6 py-10 sm:px-10 sm:py-14">
          {state === 'done' ? (
            <div className="h-full flex flex-col items-center justify-center text-center" role="status">
              <span className="grid h-16 w-16 place-items-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-300">
                <CheckCircle2 size={34} />
              </span>
              <p className="mt-5 text-xl font-black">{t.doneTitle}</p>
              <p className="mt-2 text-labbaik-text-muted">{t.doneText}</p>
              <button type="button" onClick={() => setState('idle')} className="mt-6 text-sm font-bold text-labbaik-blue dark:text-purple-200 hover:underline cursor-pointer">
                {t.again}
              </button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4" noValidate={false}>
              <label className="block">
                <span className="mb-1.5 block text-sm font-bold">{t.name}</span>
                <input required minLength={2} maxLength={120} autoComplete="name" value={form.name} onChange={set('name')} className={fieldClass} />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-bold">{t.phone}</span>
                <input
                  required
                  type="tel"
                  inputMode="tel"
                  dir="ltr"
                  autoComplete="tel"
                  placeholder="05XXXXXXXX"
                  pattern="[+0-9\s\-]{9,20}"
                  value={form.phone}
                  onChange={set('phone')}
                  className={`${fieldClass} text-start`}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-bold">{t.company}</span>
                <input required minLength={2} maxLength={160} autoComplete="organization" value={form.company} onChange={set('company')} className={fieldClass} />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-bold">{t.message}</span>
                <textarea maxLength={500} rows={3} placeholder={t.messageHint} value={form.message} onChange={set('message')} className={`${fieldClass} h-auto py-3 resize-none`} />
              </label>
              {/* Left empty by people; bots that fill every field are dropped by the server. */}
              <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" value={form.website} onChange={set('website')} className="absolute -left-[9999px] h-0 w-0 opacity-0" />
              {error && <p role="alert" className="text-sm font-bold text-red-600 dark:text-red-400">{error}</p>}
              <button
                type="submit"
                disabled={state === 'sending'}
                className="w-full inline-flex items-center justify-center gap-2 h-12 rounded-xl bg-labbaik-blue text-white text-base font-black hover:bg-[#553174] disabled:opacity-70 transition-colors cursor-pointer"
              >
                {state === 'sending' ? <Loader2 size={18} className="animate-spin" /> : <Send size={17} />}
                {state === 'sending' ? t.sending : t.submit}
              </button>
              <p className="text-center text-xs text-labbaik-text-muted inline-flex w-full items-center justify-center gap-1.5">
                <Lock size={12} /> {t.privacy}
              </p>
            </form>
          )}
        </div>
      </div>
    </section>
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
    { href: '#channels', label: t.nav.channels },
    { href: '#features', label: t.nav.features },
    { href: '#faq', label: t.nav.faq },
    { href: '#trial', label: t.nav.trial },
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
                <a
                  href="#trial"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 h-12 px-7 rounded-2xl bg-labbaik-blue text-white text-base font-black hover:bg-[#553174] transition-colors"
                >
                  <Sparkles size={18} />
                  {t.hero.primary}
                  <Arrow size={18} />
                </a>
                <a
                  href="#about"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 h-12 px-7 rounded-2xl border border-labbaik-border bg-labbaik-surface text-neutral-800 dark:text-neutral-100 text-base font-bold hover:border-labbaik-blue/40 transition-colors"
                >
                  {t.hero.secondary}
                </a>
              </div>
              <p className="mt-4 text-sm text-labbaik-text-muted">{t.hero.note}</p>
              <p className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-emerald-700 dark:text-emerald-300">
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

        <ChannelsSection t={t.channels} isAr={isAr} logo={LogoImage} />

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

        <TrialSection t={t.trial} />
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
              © {new Date().getFullYear()} {isAr ? 'تيل بوت (Tael Bot)' : 'Tael Bot'}. {t.footer.rights}
            </span>
            <span>{t.footer.meta}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

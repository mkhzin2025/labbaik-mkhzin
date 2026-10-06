import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { useToast } from '../components/Toast';
import { CheckCircle2, Loader2, Settings, Unlink } from 'lucide-react';
import { FaWhatsapp, FaInstagram, FaFacebook, FaMapMarkerAlt, FaTelegram, FaTiktok, FaEnvelope } from 'react-icons/fa';

interface Channel {
  id: string;
  type: 'whatsapp' | 'instagram' | 'facebook' | 'google_maps';
  status: 'active' | 'inactive' | 'pending';
  credentials?: { displayPhoneNumber?: string; phoneNumberId?: string } & Record<string, unknown>;
}

// Display-only platforms (telegram, tiktok, email) have no backend channel type yet.
type PlatformId = Channel['type'] | 'telegram' | 'tiktok' | 'email';

interface Platform {
  id: PlatformId;
  name: string;
  icon: ReactNode;
  tint: string;
  desc: string;
}

// Only WhatsApp is wired end to end; Instagram/Facebook send through a simulator on the server today
// and the rest have no integration, so those are shown as "coming soon" rather than a connect form.
const PLATFORMS: Platform[] = [
  { id: 'whatsapp', name: 'واتساب بيزنس', icon: <FaWhatsapp size={22} className="text-[#25d366]" />, tint: 'bg-[#25d366]/12', desc: 'استقبل رسائل عملائك وردّ عليها من رقمك الرسمي عبر WhatsApp Cloud API من Meta.' },
  { id: 'instagram', name: 'إنستغرام', icon: <FaInstagram size={24} className="text-[#e1306c]" />, tint: 'bg-[#e1306c]/10', desc: 'الرسائل المباشرة في حساب متجرك على إنستغرام.' },
  { id: 'facebook', name: 'فيسبوك مسنجر', icon: <FaFacebook size={24} className="text-[#1877f2]" />, tint: 'bg-[#1877f2]/10', desc: 'رسائل صفحة متجرك على فيسبوك من مكان واحد.' },
  { id: 'telegram', name: 'تيليجرام', icon: <FaTelegram size={24} className="text-[#229ed9]" />, tint: 'bg-[#229ed9]/10', desc: 'محادثات عملائك عبر بوت متجرك على تيليجرام.' },
  { id: 'tiktok', name: 'تيك توك', icon: <FaTiktok size={22} className="text-neutral-900 dark:text-white" />, tint: 'bg-neutral-500/10', desc: 'الرسائل المباشرة وتعليقات حساب متجرك على تيك توك.' },
  { id: 'email', name: 'البريد الإلكتروني', icon: <FaEnvelope size={22} className="text-labbaik-text-muted" />, tint: 'bg-labbaik-text-muted/10', desc: 'استقبل رسائل البريد في صندوق المحادثات وردّ عليها.' },
  { id: 'google_maps', name: 'جوجل ماب', icon: <FaMapMarkerAlt size={22} className="text-[#ea4335]" />, tint: 'bg-[#ea4335]/10', desc: 'استقبال مراجعات خرائط جوجل والرد عليها.' },
];

const errorMessage = (error: unknown, fallback: string) =>
  (error as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;

export default function ChannelsPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmUnlink, setConfirmUnlink] = useState<string | null>(null);
  const [unlinking, setUnlinking] = useState(false);
  const { showToast } = useToast();

  const fetchChannels = useCallback(async () => {
    try {
      const { data } = await api.get<Channel[]>('/channels');
      setChannels(Array.isArray(data) ? data : []);
    } catch (error) {
      showToast(errorMessage(error, 'تعذر تحميل القنوات.'), 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { void fetchChannels(); }, [fetchChannels]);

  const unlink = async (channel: Channel, name: string) => {
    setUnlinking(true);
    try {
      await api.delete(`/channels/${channel.id}`);
      setConfirmUnlink(null);
      showToast(`تم فك ربط ${name}.`, 'info');
      await fetchChannels();
    } catch (error) {
      showToast(errorMessage(error, 'تعذر فك الارتباط.'), 'error');
    } finally {
      setUnlinking(false);
    }
  };

  const whatsapp = PLATFORMS[0];
  const others = PLATFORMS.slice(1);
  const connectedOf = (id: PlatformId) => channels.filter((c) => c.type === id);

  return (
    <div className="max-w-4xl space-y-4 pb-10" dir="rtl">
      <div>
        <h1 className="text-2xl font-black text-neutral-900 dark:text-white">القنوات</h1>
        <p className="mt-1 text-sm text-labbaik-text-muted">القنوات التي تصل منها رسائل عملائك إلى صندوق المحادثات.</p>
      </div>

      {loading ? (
        <div className="rounded-xl border border-labbaik-border bg-labbaik-surface py-12 grid place-items-center"><Loader2 size={24} className="animate-spin text-labbaik-blue" /></div>
      ) : (
        <>
          {/* WhatsApp: the live channel */}
          <section className="rounded-xl border border-labbaik-border bg-labbaik-surface p-5">
            <div className="flex flex-col sm:flex-row sm:items-start gap-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-[#25d366]/12">{whatsapp.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-black text-neutral-900 dark:text-white">{whatsapp.name}</h2>
                  {connectedOf('whatsapp').length > 0 ? (
                    <span className="inline-flex items-center gap-1 h-6 px-2 rounded-md bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 text-[11px] font-bold">
                      <CheckCircle2 size={12} /> متصل
                    </span>
                  ) : (
                    <span className="inline-flex items-center h-6 px-2 rounded-md bg-neutral-500/10 text-labbaik-text-muted text-[11px] font-bold">غير مربوط</span>
                  )}
                </div>
                <p className="mt-1 text-sm text-labbaik-text-muted leading-relaxed">{whatsapp.desc}</p>

                {connectedOf('whatsapp').length > 0 && (
                  <ul className="mt-4 divide-y divide-labbaik-border rounded-lg border border-labbaik-border">
                    {connectedOf('whatsapp').map((channel) => {
                      const number = channel.credentials?.displayPhoneNumber || channel.credentials?.phoneNumberId || 'رقم واتساب';
                      return (
                        <li key={channel.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
                          <span className="text-sm font-bold tabular-nums text-neutral-900 dark:text-white" dir="ltr">{number}</span>
                          {confirmUnlink === channel.id ? (
                            <span className="flex items-center gap-1">
                              <span className="text-xs text-labbaik-text-muted">ستتوقف الرسائل من هذا الرقم.</span>
                              <button type="button" disabled={unlinking} onClick={() => void unlink(channel, whatsapp.name)} className="h-8 px-2.5 rounded-md bg-red-600 text-white text-xs font-black hover:bg-red-700 disabled:opacity-50 cursor-pointer">
                                {unlinking ? <Loader2 size={13} className="animate-spin" /> : 'تأكيد فك الربط'}
                              </button>
                              <button type="button" onClick={() => setConfirmUnlink(null)} className="h-8 px-2 rounded-md text-xs font-bold text-labbaik-text-muted hover:text-neutral-900 dark:hover:text-white cursor-pointer">إلغاء</button>
                            </span>
                          ) : (
                            <button type="button" onClick={() => setConfirmUnlink(channel.id)} className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md text-xs font-bold text-labbaik-text-muted hover:text-red-600 hover:bg-red-500/10 cursor-pointer">
                              <Unlink size={14} /> فك الربط
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              <Link
                to="/dashboard/settings?tab=meta"
                className={`shrink-0 inline-flex items-center justify-center gap-2 h-10 px-4 rounded-lg text-sm font-black ${connectedOf('whatsapp').length ? 'border border-labbaik-border text-neutral-800 dark:text-neutral-100 hover:border-labbaik-blue/40 hover:text-labbaik-blue' : 'bg-labbaik-blue text-labbaik-on-accent hover:bg-[#553174]'}`}
              >
                <Settings size={16} /> {connectedOf('whatsapp').length ? 'إعدادات الربط' : 'ربط واتساب'}
              </Link>
            </div>
          </section>

          {/* Other platforms */}
          <section className="space-y-3 pt-2">
            <h2 className="text-sm font-black text-neutral-900 dark:text-white">قنوات أخرى</h2>
            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {others.map((platform) => {
                const linked = connectedOf(platform.id);
                return (
                  <li key={platform.id} className="flex flex-col rounded-xl border border-labbaik-border bg-labbaik-surface p-4 transition-colors hover:border-labbaik-blue/30">
                    <div className="flex items-start justify-between gap-3">
                      <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${platform.tint}`}>{platform.icon}</span>
                      {linked.length > 0 ? (
                        <span className="inline-flex items-center gap-1 h-6 px-2 rounded-md bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 text-[11px] font-bold">
                          <CheckCircle2 size={12} /> متصل
                        </span>
                      ) : (
                        <span className="inline-flex items-center h-6 px-2 rounded-md bg-labbaik-blue/10 text-labbaik-blue dark:text-purple-300 text-[11px] font-bold">قريبًا</span>
                      )}
                    </div>
                    <p className="mt-3 font-black text-neutral-900 dark:text-white">{platform.name}</p>
                    <p className="mt-1 flex-1 text-xs leading-relaxed text-labbaik-text-muted">{platform.desc}</p>
                    {linked.length > 0 && (
                      <div className="mt-4 pt-3 border-t border-labbaik-border">
                        {confirmUnlink === linked[0].id ? (
                          <span className="flex items-center gap-1">
                            <button type="button" disabled={unlinking} onClick={() => void unlink(linked[0], platform.name)} className="h-8 px-2.5 rounded-md bg-red-600 text-white text-xs font-black hover:bg-red-700 disabled:opacity-50 cursor-pointer">
                              {unlinking ? <Loader2 size={13} className="animate-spin" /> : 'تأكيد فك الربط'}
                            </button>
                            <button type="button" onClick={() => setConfirmUnlink(null)} className="h-8 px-2 rounded-md text-xs font-bold text-labbaik-text-muted hover:text-neutral-900 dark:hover:text-white cursor-pointer">إلغاء</button>
                          </span>
                        ) : (
                          <button type="button" onClick={() => setConfirmUnlink(linked[0].id)} className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md text-xs font-bold text-labbaik-text-muted hover:text-red-600 hover:bg-red-500/10 cursor-pointer">
                            <Unlink size={14} /> فك الربط
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

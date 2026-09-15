import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { getApiBaseUrl } from '../api/baseUrl';
import { useToast } from '../components/Toast';
import { Button } from '../components/ui/Button';
import { 
  Share2, 
  Link as LinkIcon, 
  Unlink, 
  CheckCircle2, 
  Loader2,
  Plus,
  X,
  Smartphone,
  ExternalLink
} from 'lucide-react';
import { FaWhatsapp, FaInstagram, FaFacebook, FaMapMarkerAlt } from 'react-icons/fa';

interface Channel {
  id: string;
  type: 'whatsapp' | 'instagram' | 'facebook' | 'google_maps';
  status: 'active' | 'inactive' | 'pending';
  credentials: any;
}

export default function ChannelsPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [creds, setCredentials] = useState({
    phoneNumberId: '',
    displayPhoneNumber: '',
    businessAccountId: '',
    accessToken: '',
    verifyToken: 'labbaik_whatsapp_verify'
  });
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    fetchChannels();
  }, []);

  const fetchChannels = async () => {
    try {
      const { data } = await api.get('/channels');
      setChannels(data);
      setLoading(false);
    } catch (error) {
      setLoading(false);
    }
  };

  const handleConnect = async () => {
    setSaving(true);
    try {
      await api.post('/channels', {
        type: selectedType,
        credentials: creds
      });
      await fetchChannels();
      setShowModal(false);
      setCredentials({ phoneNumberId: '', displayPhoneNumber: '', businessAccountId: '', accessToken: '', verifyToken: 'labbaik_whatsapp_verify' });
      showToast('تم ربط القناة بنجاح! 📡🚀', 'success');
    } catch (error) {
      showToast('فشل الربط، يرجى التأكد من صحة البيانات ❌', 'error');
    } finally {
      setSaving(false);
    }
  };

  const deleteChannel = async (id: string) => {
    if (!window.confirm('هل أنت متأكد من فك الارتباط؟')) return;
    try {
      await api.delete(`/channels/${id}`);
      showToast('تم فك الارتباط بنجاح ✅', 'info');
      fetchChannels();
    } catch (error) {
      showToast('فشل فك الارتباط ❌', 'error');
    }
  };

  const platformData = [
    { 
      id: 'whatsapp', 
      name: 'واتساب بيزنس', 
      icon: <FaWhatsapp size={32} className="text-green-500" />,
      desc: 'اربط رقم متجرك الرسمي عبر Meta Cloud API.',
      color: 'border-green-500/20 bg-green-500/5'
    },
    { 
      id: 'instagram', 
      name: 'إنستغرام', 
      icon: <FaInstagram size={32} className="text-pink-500" />,
      desc: 'الرد الآلي على التعليقات والرسائل المباشرة.',
      color: 'border-pink-500/20 bg-pink-500/5'
    },
    { 
      id: 'facebook', 
      name: 'فيسبوك مسنجر', 
      icon: <FaFacebook size={32} className="text-blue-600" />,
      desc: 'إدارة رسائل صفحة المتجر بشكل مركزي.',
      color: 'border-blue-600/20 bg-blue-600/5'
    },
    { 
      id: 'google_maps', 
      name: 'جوجل ماب', 
      icon: <FaMapMarkerAlt size={32} className="text-red-500" />,
      desc: 'الرد على مراجعات العملاء في خرائط جوجل.',
      color: 'border-red-500/20 bg-red-500/5'
    }
  ];

  const configuredWebhookBaseUrl = import.meta.env.VITE_WEBHOOK_BASE_URL;
  const webhookBaseUrl = configuredWebhookBaseUrl && configuredWebhookBaseUrl !== 'same-origin'
    ? configuredWebhookBaseUrl.replace(/\/$/, '')
    : getApiBaseUrl();
  const webhookUrl = `${webhookBaseUrl}/webhooks/whatsapp`;

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-fade-in" dir="rtl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-labbaik-surface p-8 rounded-[2.5rem] border border-white/5 shadow-2xl">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 bg-labbaik-blue/10 rounded-2xl flex items-center justify-center border border-labbaik-blue/20">
            <Share2 size={32} className="text-labbaik-blue" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-white">إدارة القنوات المتصلة</h1>
            <p className="text-neutral-400 text-sm mt-1 font-medium text-right">اربط حسابات التواصل الاجتماعي لتبدأ إدارة المحادثات بذكاء.</p>
          </div>
        </div>
      </div>

      {/* Grid of Platforms */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
        {platformData.map((platform) => {
          const connected = channels.find(c => c.type === platform.id);
          return (
            <div key={platform.id} className={`p-8 rounded-[2.5rem] border transition-all hover:scale-[1.02] ${platform.color} flex flex-col justify-between gap-6 group`}>
              <div className="flex justify-between items-start">
                <div className="p-4 bg-white/5 rounded-[1.5rem] border border-white/5 group-hover:border-white/10 transition-colors">
                  {platform.icon}
                </div>
                {connected ? (
                  <span className="flex items-center gap-2 px-4 py-2 bg-green-500/10 border border-green-500/20 text-green-400 text-[10px] font-black rounded-full uppercase tracking-widest">
                    <CheckCircle2 size={12} /> متصل الآن
                  </span>
                ) : (
                  <span className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 text-neutral-400 text-[10px] font-black rounded-full uppercase tracking-widest">
                    غير مرتبط
                  </span>
                )}
              </div>

              <div>
                <h3 className="text-xl font-black text-white mb-2">{platform.name}</h3>
                <p className="text-neutral-400 text-sm font-medium leading-relaxed">{platform.desc}</p>
              </div>

              <div className="flex items-center gap-4">
                {connected ? (
                  <>
                    <Button 
                      onClick={() => deleteChannel(connected.id)}
                      variant="secondary"
                      size="md"
                    >
                      <Unlink size={16} /> فك الارتباط
                    </Button>
                    <button onClick={() => platform.id === 'whatsapp' && navigate('/dashboard/settings?tab=meta')} className="p-4 bg-white/5 text-neutral-400 rounded-2xl border border-white/5 hover:text-white transition-all"><ExternalLink size={18} /></button>
                  </>
                ) : (
                  <Button 
                    onClick={() => { if (platform.id === 'whatsapp') navigate('/dashboard/settings?tab=meta'); else { setSelectedType(platform.id); setShowModal(true); } }}
                    variant="primary"
                    size="md"
                  >
                    <Plus size={16} /> ربط القناة الآن
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Connection Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-xl bg-black/40 animate-fade-in">
          <div className="bg-labbaik-surface w-full max-w-lg rounded-[2.5rem] border border-white/10 shadow-3xl overflow-hidden relative">
            <button onClick={() => setShowModal(false)} className="absolute left-6 top-6 text-neutral-400 hover:text-white transition-colors"><X size={24} /></button>
            
            <div className="p-10 space-y-8">
              <div className="text-center">
                <div className="mx-auto w-16 h-16 bg-labbaik-blue/10 rounded-2xl flex items-center justify-center border border-labbaik-blue/20 mb-4">
                  <Smartphone size={32} className="text-labbaik-blue" />
                </div>
                <h2 className="text-2xl font-black text-white">إعدادات الربط</h2>
                <p className="text-neutral-400 text-sm mt-2 font-medium">أدخل بيانات Cloud API الخاصة بـ Meta</p>
              </div>

              <div className="space-y-4">
                {selectedType === 'whatsapp' && (
                  <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-3 text-right">
                    <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Meta Webhook</p>
                    <div className="space-y-2">
                      <div className="text-[11px] text-neutral-400 font-bold">Callback URL</div>
                      <code className="block bg-black/20 border border-white/5 rounded-xl p-3 text-[11px] text-labbaik-blue break-all ltr text-left">{webhookUrl}</code>
                    </div>
                    <div className="space-y-2">
                      <div className="text-[11px] text-neutral-400 font-bold">Verify Token</div>
                      <code className="block bg-black/20 border border-white/5 rounded-xl p-3 text-[11px] text-labbaik-blue break-all ltr text-left">{creds.verifyToken}</code>
                    </div>
                  </div>
                )}
                <div className="space-y-2">
                  <label className="text-xs font-black text-neutral-400 uppercase tracking-widest me-2">Phone Number ID</label>
                  <input 
                    type="text" 
                    value={creds.phoneNumberId}
                    onChange={(e) => setCredentials({...creds, phoneNumberId: e.target.value})}
                    placeholder="1234567890..."
                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-6 text-sm text-white focus:outline-none focus:ring-2 focus:ring-labbaik-blue/50 transition-all font-bold"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-black text-neutral-400 uppercase tracking-widest me-2">Display Phone</label>
                    <input 
                      type="text" 
                      value={creds.displayPhoneNumber}
                      onChange={(e) => setCredentials({...creds, displayPhoneNumber: e.target.value})}
                      placeholder="+966..."
                      className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-6 text-sm text-white focus:outline-none focus:ring-2 focus:ring-labbaik-blue/50 transition-all font-bold"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-black text-neutral-400 uppercase tracking-widest me-2">WABA ID</label>
                    <input 
                      type="text" 
                      value={creds.businessAccountId}
                      onChange={(e) => setCredentials({...creds, businessAccountId: e.target.value})}
                      placeholder="Optional"
                      className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-6 text-sm text-white focus:outline-none focus:ring-2 focus:ring-labbaik-blue/50 transition-all font-bold"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black text-neutral-400 uppercase tracking-widest me-2">Permanent Access Token</label>
                  <textarea 
                    value={creds.accessToken}
                    onChange={(e) => setCredentials({...creds, accessToken: e.target.value})}
                    placeholder="EAAP..."
                    className="w-full h-32 bg-white/5 border border-white/10 rounded-2xl py-4 px-6 text-sm text-white focus:outline-none focus:ring-2 focus:ring-labbaik-blue/50 transition-all font-bold resize-none"
                  />
                </div>
              </div>

              <Button 
                onClick={handleConnect}
                disabled={saving}
                variant="primary"
                size="md"
              >
                {saving ? <Loader2 size={20} className="animate-spin" /> : <LinkIcon size={20} />}
                تأكيد الربط والتشغيل
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}



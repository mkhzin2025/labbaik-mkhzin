import { useState, useEffect } from 'react';
import api from '../api/client';
import { useToast } from '../components/Toast';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { 
  Brain, 
  Save, 
  User as UserIcon, 
  Loader2,
  Store,
  Monitor,
  Settings2,
  Zap,
  Cpu,
  Sparkles,
  ShieldCheck,
  Search,
  Rocket
} from 'lucide-react';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<'profile' | 'kb' | 'ai'>('profile');
  const { showToast } = useToast();
  
  const [storeData, setStoreData] = useState<any>({ 
    name: '', 
    description: '', 
    website: '', 
    knowledgeBase: '',
    aiMode: 'always',
    preferredModel: 'groq',
    workingHours: { start: '09:00', end: '22:00', enabledDays: [0,1,2,3,4,6] }
  });
  
  const [userData, setUserData] = useState({ fullName: '', email: '', password: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    try {
      const [storeRes, userRes] = await Promise.all([
        api.get('/stores/me'),
        api.get('/users/me')
      ]);
      setStoreData({
        ...storeRes.data,
        preferredModel: storeRes.data.preferredModel || 'groq',
        workingHours: storeRes.data.workingHours || { start: '09:00', end: '22:00', enabledDays: [0,1,2,3,4,6] }
      });
      setUserData({ ...userRes.data, password: '' });
      setLoading(false);
    } catch {
      setLoading(false);
    }
  };

  const handleSaveStore = async () => {
    setSaving(true);
    try {
      const { name, description, website, knowledgeBase, phoneNumber, aiMode, workingHours, preferredModel } = storeData;
      await api.patch('/stores/me', { name, description, website, knowledgeBase, phoneNumber, aiMode, workingHours, preferredModel });
      showToast('تم تحديث إعدادات المتجر بنجاح! ✅', 'success');
    } catch {
      showToast('فشل في حفظ الإعدادات، يرجى التحقق من الاتصال ❌', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveUser = async () => {
    setSaving(true);
    try {
      const updatePayload: any = { fullName: userData.fullName, email: userData.email };
      if (userData.password) updatePayload.password = userData.password;
      await api.patch('/users/me', updatePayload);
      showToast('تم تحديث بيانات الحساب بنجاح! 👤✅', 'success');
      setUserData({ ...userData, password: '' });
    } catch {
      showToast('فشل في تحديث بيانات الحساب ❌', 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleDay = (day: number) => {
    const currentDays = [...storeData.workingHours.enabledDays];
    const index = currentDays.indexOf(day);
    if (index > -1) currentDays.splice(index, 1);
    else currentDays.push(day);
    setStoreData({ ...storeData, workingHours: { ...storeData.workingHours, enabledDays: currentDays } });
  };

  if (loading) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center gap-4 text-neutral-400">
        <Loader2 size={40} className="animate-spin text-labbaik-blue" />
        <p className="font-bold">جاري تحميل الإعدادات...</p>
      </div>
    );
  }

  const daysOfWeek = [
    { id: 0, name: 'الأحد' }, { id: 1, name: 'الاثنين' }, { id: 2, name: 'الثلاثاء' },
    { id: 3, name: 'الأربعاء' }, { id: 4, name: 'الخميس' }, { id: 5, name: 'الجمعة' }, { id: 6, name: 'السبت' }
  ];

  const aiModels = [
    { id: 'deepseek_groq', name: 'DeepSeek-R1 (via Groq)', desc: 'أذكى موديل متاح حالياً، وبسرعة Groq الخارقة.', icon: <Rocket size={18} className="text-pink-500" /> },
    { id: 'groq', name: 'Llama 3.1 (via Groq)', desc: 'الأداء المتوازن والسرعة العالية في الردود.', icon: <Zap size={18} className="text-yellow-500" /> },
    { id: 'deepseek', name: 'DeepSeek V3 (Official)', desc: 'النسخة الرسمية من DeepSeek للدقة القصوى.', icon: <Search size={18} className="text-pink-400 opacity-70" /> },
    { id: 'gemini', name: 'Google Gemini 1.5', desc: 'تفكير منطقي عميق للأسئلة المتقدمة.', icon: <Sparkles size={18} className="text-blue-400" /> },
    { id: 'openai', name: 'OpenAI GPT-3.5', desc: 'المعيار العالمي للجودة والاستقرار.', icon: <Cpu size={18} className="text-green-500" /> }
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-10 animate-fade-in" dir="rtl">
      {/* Header & Tabs */}
      <Card variant="labbaik" className="space-y-10">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8">
          <div className="flex items-center gap-6">
            <div className="w-16 h-16 bg-labbaik-blue/10 rounded-2xl flex items-center justify-center border border-labbaik-blue/20">
              <Settings2 size={32} className="text-labbaik-blue" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-white">إعدادات المنصة المتقدمة</h1>
              <p className="text-neutral-400 text-sm mt-1 font-medium text-right">تحكم في محرك الذكاء، أوقات الرد، وبيانات المتجر.</p>
            </div>
          </div>
        </div>

        <div className="flex border-b border-white/5 gap-8 overflow-x-auto no-scrollbar">
          <button onClick={() => setActiveTab('profile')} className={`pb-4 text-sm font-black transition-all relative whitespace-nowrap ${activeTab === 'profile' ? 'text-labbaik-blue' : 'text-neutral-400 hover:text-white'}`}>
            الملف الشخصي
            {activeTab === 'profile' && <div className="absolute bottom-0 left-0 right-0 h-1 bg-labbaik-blue rounded-full"></div>}
          </button>
          <button onClick={() => setActiveTab('kb')} className={`pb-4 text-sm font-black transition-all relative whitespace-nowrap ${activeTab === 'kb' ? 'text-labbaik-blue' : 'text-neutral-400 hover:text-white'}`}>
            قاعدة المعرفة
            {activeTab === 'kb' && <div className="absolute bottom-0 left-0 right-0 h-1 bg-labbaik-blue rounded-full"></div>}
          </button>
          <button onClick={() => setActiveTab('ai')} className={`pb-4 text-sm font-black transition-all relative whitespace-nowrap ${activeTab === 'ai' ? 'text-labbaik-blue' : 'text-neutral-400 hover:text-white'}`}>
            تجهيزات الذكاء والوقت
            {activeTab === 'ai' && <div className="absolute bottom-0 left-0 right-0 h-1 bg-labbaik-blue rounded-full"></div>}
          </button>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        
        {activeTab === 'profile' && (
          <div className="lg:col-span-2 space-y-8">
            <Card variant="labbaik" className="space-y-8">
              <h3 className="text-xl font-black text-white flex items-center gap-3"><Store className="text-labbaik-blue" size={24} />معلومات المتجر</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label htmlFor="store-name" className="text-xs font-black text-neutral-400 uppercase px-2">اسم المتجر</label>
                  <input id="store-name" name="store-name" type="text" value={storeData.name} onChange={(e) => setStoreData({ ...storeData, name: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-6 text-sm text-white focus:outline-none focus:ring-2 focus:ring-labbaik-blue/50 font-bold"/>
                </div>
                <div className="space-y-2">
                  <label htmlFor="store-website" className="text-xs font-black text-neutral-400 uppercase px-2">رابط الموقع</label>
                  <input id="store-website" name="store-website" type="text" value={storeData.website} onChange={(e) => setStoreData({ ...storeData, website: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-6 text-sm text-white focus:outline-none focus:ring-2 focus:ring-labbaik-blue/50 font-bold"/>
                </div>
              </div>
              <Button onClick={handleSaveStore} disabled={saving} variant="primary" size="md">
                {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />} حفظ البيانات
              </Button>
            </Card>

            <Card variant="labbaik" className="space-y-8">
              <h3 className="text-xl font-black text-white flex items-center gap-3"><UserIcon className="text-labbaik-blue" size={24} />معلومات الحساب</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label htmlFor="user-fullname" className="text-xs font-black text-neutral-400 uppercase px-2">الاسم الكامل</label>
                  <input id="user-fullname" name="user-fullname" type="text" value={userData.fullName} onChange={(e) => setUserData({ ...userData, fullName: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-6 text-sm text-white focus:outline-none focus:ring-2 focus:ring-labbaik-blue/50 font-bold"/>
                </div>
                <div className="space-y-2">
                  <label htmlFor="user-email" className="text-xs font-black text-neutral-400 uppercase px-2">البريد الإلكتروني</label>
                  <input id="user-email" name="user-email" type="email" value={userData.email} onChange={(e) => setUserData({ ...userData, email: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-6 text-sm text-white focus:outline-none focus:ring-2 focus:ring-labbaik-blue/50 font-bold"/>
                </div>
              </div>
              <Button onClick={handleSaveUser} disabled={saving} variant="primary" size="md">
                {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />} تحديث الحساب
              </Button>
            </Card>
          </div>
        )}

        {activeTab === 'kb' && (
          <div className="lg:col-span-2">
            <Card variant="labbaik" className="space-y-0">
              <div className="p-8 border-b border-white/5 flex items-center justify-between -m-8 mb-0 pb-8">
                <div className="flex items-center gap-3">
                  <Brain className="text-labbaik-blue" size={24} />
                  <h3 className="font-black text-lg text-white">مخ لبيك (قاعدة المعرفة)</h3>
                </div>
                <Button onClick={handleSaveStore} disabled={saving} variant="primary" size="sm">
                  {saving ? <Loader2 className="animate-spin" size={16} /> : 'حفظ وتدريب'}
                </Button>
              </div>
              <textarea id="knowledge-base" name="knowledge-base" value={storeData.knowledgeBase} onChange={(e) => setStoreData({ ...storeData, knowledgeBase: e.target.value })} placeholder="اكتب هنا كافة تفاصيل متجرك..." className="w-full h-[550px] bg-transparent p-0 text-gray-200 leading-relaxed text-lg focus:outline-none resize-none font-medium placeholder:text-gray-700"/>
            </Card>
          </div>
        )}

        {activeTab === 'ai' && (
          <div className="lg:col-span-2 space-y-8">
            <Card variant="labbaik" className="space-y-8">
              <div className="space-y-4">
                <h3 className="text-xl font-black text-white flex items-center gap-3"><Cpu className="text-labbaik-blue" size={24} />محرك الذكاء المفضل</h3>
                <p className="text-neutral-400 text-sm font-medium leading-relaxed">اختر المحرك الأساسي الذي تود أن يعتمد عليه لبيك.</p>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {aiModels.map((model) => (
                  <div 
                    key={model.id}
                    onClick={() => setStoreData({ ...storeData, preferredModel: model.id })}
                    className={`p-6 rounded-[2rem] border cursor-pointer transition-all flex items-center gap-6 ${storeData.preferredModel === model.id ? 'bg-labbaik-blue/10 border-labbaik-blue shadow-lg shadow-labbaik-blue/5' : 'bg-white/2 border-white/5 hover:border-white/10'}`}
                  >
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border ${storeData.preferredModel === model.id ? 'bg-labbaik-blue/20 border-labbaik-blue/30' : 'bg-white/5 border-white/5'}`}>
                      {model.icon}
                    </div>
                    <div className="flex-1">
                      <h4 className="font-black text-sm text-white mb-1">{model.name}</h4>
                      <p className="text-[10px] text-neutral-400 font-bold leading-relaxed">{model.desc}</p>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${storeData.preferredModel === model.id ? 'border-labbaik-blue' : 'border-gray-600'}`}>
                      {storeData.preferredModel === model.id && <div className="w-2.5 h-2.5 bg-labbaik-blue rounded-full"></div>}
                    </div>
                  </div>
                ))}
              </div>
              <div className="bg-labbaik-blue/5 p-4 rounded-2xl border border-labbaik-blue/10 flex gap-3">
                <ShieldCheck className="text-labbaik-blue shrink-0" size={18} />
                <p className="text-[10px] text-neutral-400 font-medium leading-relaxed">في حال تعطل خيارك المفضل، سينتقل لبيك آلياً للمحرك الاحتياطي الأسرع لضمان استمرارية الخدمة.</p>
              </div>
            </Card>

            <Card variant="labbaik" className="space-y-10">
              <div className="space-y-4">
                <h3 className="text-xl font-black text-white flex items-center gap-3"><Zap className="text-labbaik-blue" size={24} />وضعية تشغيل لبيك</h3>
                <p className="text-neutral-400 text-sm font-medium leading-relaxed">حدد متى تريد من لبيك أن يرد آلياً.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { id: 'always', name: 'دائماً نشط', desc: 'يرد لبيك في كل الأوقات.' },
                  { id: 'off_hours', name: 'خارج الدوام', desc: 'يرد لبيك عند إغلاق المتجر.' },
                  { id: 'manual', name: 'يدوي فقط', desc: 'لا يرد لبيك آلياً أبداً.' }
                ].map((mode) => (
                  <div 
                    key={mode.id}
                    onClick={() => setStoreData({ ...storeData, aiMode: mode.id })}
                    className={`p-6 rounded-3xl border cursor-pointer transition-all ${storeData.aiMode === mode.id ? 'bg-labbaik-blue/10 border-labbaik-blue' : 'bg-white/2 border-white/5 hover:border-white/10'}`}
                  >
                    <h4 className="font-black text-sm text-white mb-2">{mode.name}</h4>
                    <p className="text-[10px] text-neutral-400 font-bold leading-relaxed">{mode.desc}</p>
                  </div>
                ))}
              </div>

              {storeData.aiMode === 'off_hours' && (
                <div className="space-y-8 pt-6 border-t border-white/5 animate-fade-in">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-2">
                      <label htmlFor="working-start" className="text-xs font-black text-neutral-400 uppercase px-2 block">وقت البداية</label>
                      <input id="working-start" name="working-start" type="time" value={storeData.workingHours.start} onChange={(e) => setStoreData({ ...storeData, workingHours: { ...storeData.workingHours, start: e.target.value } })} className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-6 text-white focus:outline-none focus:ring-2 focus:ring-labbaik-blue/50 font-bold"/>
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="working-end" className="text-xs font-black text-neutral-400 uppercase px-2 block">وقت النهاية</label>
                      <input id="working-end" name="working-end" type="time" value={storeData.workingHours.end} onChange={(e) => setStoreData({ ...storeData, workingHours: { ...storeData.workingHours, end: e.target.value } })} className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-6 text-white focus:outline-none focus:ring-2 focus:ring-labbaik-blue/50 font-bold"/>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {daysOfWeek.map((day) => (
                      <div key={day.id} onClick={() => toggleDay(day.id)} className={`px-4 py-2 rounded-xl text-[10px] font-black cursor-pointer transition-all border ${storeData.workingHours.enabledDays.includes(day.id) ? 'bg-labbaik-blue text-labbaik-on-accent border-labbaik-blue' : 'bg-white/2 border-white/5 text-neutral-400 hover:text-white'}`}>
                        {day.name}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <Button onClick={handleSaveStore} disabled={saving} variant="primary" size="md">
                {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />} حفظ إعدادات التشغيل
              </Button>
            </Card>
          </div>
        )}

        {/* Common Sidebar */}
        <div className="space-y-8">
          <Card variant="labbaik" className="space-y-6">
            <h4 className="flex items-center gap-2 font-black text-labbaik-blue">💡 حماية الخدمة</h4>
            <p className="text-xs text-neutral-400 font-medium leading-loose">
              باختيارك <span className="text-white font-bold">DeepSeek-R1 (Groq)</span>، ستحصل على أذكى ردود بلهجة سعودية متقنة وبأعلى سرعة معالجة متاحة عالمياً. 🚀🇸🇦
            </p>
          </Card>
          
          <Card variant="labbaik" className="space-y-4">
            <h4 className="text-xs font-black text-neutral-400 flex items-center gap-2"><Monitor size={14} /> اختبار التنبيهات</h4>
            <Button onClick={() => { if (Notification.permission === 'granted') new Notification("اختبار لبيك", { body: "الإشعارات تعمل بكفاءة! ✅" }); else alert('فعل الإشعارات من الجرس أولاً.'); }} variant="secondary" size="sm" className="w-full">إرسال إشعار تجريبي</Button>
          </Card>
        </div>

      </div>
    </div>
  );
}



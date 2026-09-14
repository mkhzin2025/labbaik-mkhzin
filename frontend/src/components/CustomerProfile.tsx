import { useState, useEffect } from 'react';
import api from '../api/client';
import { 
  User, 
  Mail, 
  Phone, 
  Calendar, 
  Tag as TagIcon, 
  StickyNote, 
  Save, 
  Loader2,
  X,
  Clock,
  ShieldCheck
} from 'lucide-react';
import { useToast } from './Toast';

interface Customer {
  id: string;
  fullName: string;
  email: string;
  phoneNumber: string;
  notes: string;
  tags: string[];
  createdAt: string;
}

export default function CustomerProfile({ customerId, onClose }: { customerId: string, onClose: () => void }) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({ fullName: '', email: '', notes: '' });
  const { showToast } = useToast();

  useEffect(() => {
    fetchCustomer();
  }, [customerId]);

  const fetchCustomer = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/customers/${customerId}`);
      setCustomer(data);
      setFormData({ 
        fullName: data.fullName || '', 
        email: data.email || '', 
        notes: data.notes || '' 
      });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = { ...formData };
      if (!payload.email) delete (payload as any).email;
      
      const { data } = await api.patch(`/customers/${customerId}`, payload);
      setCustomer(data);
      showToast('تم حفظ بيانات العميل بنجاح! ✅', 'success');
    } catch (e) {
      showToast('فشل في حفظ البيانات، يرجى المحاولة لاحقاً ❌', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 backdrop-blur-md">
      <div className="bg-labbaik-surface p-20 rounded-[3rem] border border-white/5 flex flex-col items-center gap-4">
        <Loader2 className="animate-spin text-labbaik-blue" size={48} />
        <p className="font-black text-gray-500">جاري جلب الملف...</p>
      </div>
    </div>
  );

  if (!customer) return null;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 lg:p-0">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={onClose}></div>
      
      <div className="relative bg-labbaik-surface border border-white/10 rounded-[3rem] shadow-3xl w-full max-w-2xl overflow-hidden animate-slide-up">
        <div className="bg-gradient-to-r from-labbaik-blue/10 to-transparent p-10 border-b border-white/5 flex justify-between items-center">
          <div className="flex items-center gap-5">
            <div className="w-16 h-16 bg-labbaik-blue/20 rounded-2xl flex items-center justify-center border border-labbaik-blue/30">
              <User className="text-labbaik-blue" size={32} />
            </div>
            <div>
              <h3 className="text-2xl font-black text-white">بطاقة العميل الموحدة</h3>
              <p className="text-gray-500 text-xs mt-1 font-bold">إدارة هوية العميل وملاحظاته الدائمة.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-3 hover:bg-white/5 rounded-2xl text-gray-500 hover:text-white transition-all">
            <X size={28} />
          </button>
        </div>

        <div className="p-10 space-y-10 max-h-[70vh] overflow-y-auto custom-scrollbar">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-3">
              <label className="text-[10px] font-black text-gray-500 uppercase px-2 flex items-center gap-2">
                <User size={12} className="text-labbaik-blue" /> الاسم بالكامل
              </label>
              <input 
                type="text" 
                value={formData.fullName}
                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                className="w-full bg-white/2 border border-white/5 rounded-2xl py-4 px-6 text-sm text-white focus:outline-none focus:ring-2 focus:ring-labbaik-blue/50 font-bold transition-all"
              />
            </div>
            <div className="space-y-3">
              <label className="text-[10px] font-black text-gray-500 uppercase px-2 flex items-center gap-2">
                <Mail size={12} className="text-labbaik-blue" /> البريد الإلكتروني
              </label>
              <input 
                type="email" 
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full bg-white/2 border border-white/5 rounded-2xl py-4 px-6 text-sm text-white focus:outline-none focus:ring-2 focus:ring-labbaik-blue/50 font-bold transition-all"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
            <div className="space-y-3">
              <label className="text-[10px] font-black text-gray-500 uppercase px-2 flex items-center gap-2">
                <Phone size={12} className="text-labbaik-blue" /> رقم التواصل
              </label>
              <div className="bg-white/2 border border-white/5 rounded-2xl py-4 px-6 flex items-center gap-4">
                <ShieldCheck size={18} className="text-green-500" />
                <span className="text-sm font-black text-gray-300 tabular-nums">{customer.phoneNumber || 'غير مسجل'}</span>
              </div>
            </div>
            <div className="space-y-3">
              <label className="text-[10px] font-black text-gray-500 uppercase px-2 flex items-center gap-2">
                <Clock size={12} className="text-labbaik-blue" /> تاريخ الانضمام
              </label>
              <div className="bg-white/2 border border-white/5 rounded-2xl py-4 px-6 text-[10px] font-bold text-gray-500 flex items-center gap-3">
                <Calendar size={16} />
                {new Date(customer.createdAt).toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' })}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h4 className="text-[10px] font-black text-gray-500 uppercase flex items-center gap-2 px-2"><TagIcon size={14} className="text-labbaik-blue" /> الوسوم المرتبطة</h4>
            <div className="flex flex-wrap gap-2">
              {customer.tags?.length > 0 ? customer.tags.map(tag => (
                <span key={tag} className="px-4 py-2 bg-labbaik-blue/5 text-labbaik-blue border border-labbaik-blue/10 rounded-xl text-[10px] font-black">{tag.replace('_', ' ')}</span>
              )) : <span className="text-xs text-gray-600 font-bold italic px-2">لا توجد وسوم.</span>}
            </div>
          </div>

          <div className="space-y-4">
            <label className="text-[10px] font-black text-gray-500 uppercase flex items-center gap-2 px-2"><StickyNote size={14} className="text-labbaik-blue" /> ملاحظات الموظف الخاصة</label>
            <textarea 
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="w-full h-40 bg-white/2 border border-white/5 rounded-[2rem] p-6 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-labbaik-blue/50 resize-none font-medium leading-loose"
            />
          </div>
        </div>

        <div className="p-10 bg-white/2 border-t border-white/5 flex justify-end">
          <button onClick={handleSave} disabled={saving} className="bg-labbaik-blue text-labbaik-on-accent px-10 py-4 rounded-[1.5rem] font-black text-sm flex items-center justify-center gap-3 hover:scale-105 transition-all shadow-2xl disabled:opacity-50">
            {saving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />} حفظ التحديثات
          </button>
        </div>
      </div>
    </div>
  );
}



import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { 
  GitBranch, 
  Plus, 
  Trash2, 
  Loader2
} from 'lucide-react';
import { useToast } from '../components/Toast';

interface Flow {
  id: string;
  name: string;
  isDefault: boolean;
  isActive: boolean;
  updatedAt: string;
}

export default function FlowsPage() {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { showToast } = useToast();

  useEffect(() => {
    fetchFlows();
  }, []);

  const fetchFlows = async () => {
    try {
      const { data } = await api.get('/flows');
      setFlows(data);
      setLoading(false);
    } catch {
      setLoading(false);
    }
  };

  const createNewFlow = async () => {
    try {
      const { data } = await api.post('/flows', {
        name: 'تدفق جديد',
        nodes: [{ id: 'start', type: 'start', position: { x: 100, y: 100 }, data: { text: 'مرحباً بك!', isStart: true } }],
        edges: []
      });
      navigate(`/dashboard/flows/${data.id}`);
    } catch {
      showToast('فشل في إنشاء التدفق', 'error');
    }
  };

  const setAsDefault = async (id: string) => {
    try {
      await api.patch(`/flows/${id}`, { isDefault: true });
      setFlows(flows.map(f => ({ ...f, isDefault: f.id === id })));
      showToast('تم تعيين التدفق كمسار أساسي للمتجر! ✅', 'success');
    } catch {
      showToast('فشل في التعيين كافتراضي', 'error');
    }
  };

  const deleteFlow = async (id: string) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا التدفق؟')) return;
    try {
      await api.delete(`/flows/${id}`);
      setFlows(flows.filter(f => f.id !== id));
      showToast('تم الحذف بنجاح', 'success');
    } catch {
      showToast('فشل الحذف', 'error');
    }
  };

  const toggleActive = async (flow: Flow) => {
    try {
      await api.patch(`/flows/${flow.id}`, { isActive: !flow.isActive });
      setFlows(flows.map(f => f.id === flow.id ? { ...f, isActive: !flow.isActive } : f));
    } catch {
      showToast('فشل تحديث حالة التدفق', 'error');
    }
  };

  if (loading) return (
    <div className="h-[60vh] flex flex-col items-center justify-center gap-4 text-neutral-400">
      <Loader2 size={40} className="animate-spin text-labbaik-blue" />
      <p className="font-bold">جاري تحميل التدفقات...</p>
    </div>
  );

  return (
    <div className="space-y-10 animate-fade-in" dir="rtl">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 bg-labbaik-surface p-10 rounded-[3rem] border border-white/5 shadow-2xl">
        <div>
          <h1 className="text-3xl font-black text-white flex items-center gap-4">
            باني التدفقات الذكي <span className="bg-labbaik-blue/10 text-labbaik-blue text-xs px-4 py-1.5 rounded-full border border-labbaik-blue/20">BETA</span>
          </h1>
          <p className="text-neutral-400 mt-2 font-medium text-right">ارسم مسارات الرد الآلي لعملائك بدقة متناهية وبدون تكلفة توكنز.</p>
        </div>
        <Button onClick={createNewFlow} variant="primary" size="lg">
          <Plus size={20} /> إنشاء تدفق جديد
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {flows.length > 0 ? flows.map((flow) => (
          <Card key={flow.id} variant="labbaik" className="flex flex-col justify-between">
            <div className="flex justify-between items-start mb-8">
              <div className="w-14 h-14 bg-labbaik-blue/10 rounded-2xl flex items-center justify-center border border-labbaik-blue/20">
                <GitBranch className="text-labbaik-blue" size={24} />
              </div>
              <div className="flex items-center gap-2">
                {flow.isDefault && <span className="px-3 py-1 bg-green-500/10 text-green-400 border border-green-500/20 rounded-lg text-[8px] font-black uppercase">الأساسي</span>}
                <div onClick={() => toggleActive(flow)} className={`w-10 h-6 rounded-full p-1 cursor-pointer transition-all ${flow.isActive ? 'bg-labbaik-blue' : 'bg-gray-700'}`}>
                  <div className={`w-4 h-4 bg-white rounded-full transition-all ${flow.isActive ? 'translate-x-[-16px]' : 'translate-x-0'}`}></div>
                </div>
              </div>
            </div>

            <div className="space-y-2 mb-8">
              <h3 className="text-xl font-black text-white">{flow.name}</h3>
              <p className="text-[10px] text-neutral-500 font-bold">آخر تحديث: {new Date(flow.updatedAt).toLocaleDateString('ar-SA')}</p>
            </div>

            <div className="flex items-center gap-3">
              {!flow.isDefault && <Button onClick={() => setAsDefault(flow.id)} variant="secondary" size="sm" className="flex-1">تعيين كأساسي</Button>}
              <Button onClick={() => navigate(`/dashboard/flows/${flow.id}`)} variant="secondary" size="sm" className={flow.isDefault ? 'flex-1' : ''}>تعديل</Button>
              <Button onClick={() => deleteFlow(flow.id)} variant="danger" size="md"><Trash2 size={16} /></Button>
            </div>
          </Card>
        )) : (
          <div className="col-span-full py-20 text-center opacity-30 flex flex-col items-center gap-6">
            <GitBranch size={64} />
            <p className="text-xl font-black">ابدأ برسم أول تدفق لمتجرك الآن!</p>
          </div>
        )}
      </div>
    </div>
  );
}



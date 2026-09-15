import { useState, useEffect } from 'react';
import api from '../api/client';
import { 
  Users, 
  Search, 
  User as UserIcon, 
  Calendar,
  ChevronLeft,
  Loader2,
} from 'lucide-react';
import { format } from 'date-fns';
import { toEnglishDigits } from '@/lib/utils';
import CustomerProfile from '../components/CustomerProfile';

interface Customer {
  id: string;
  fullName: string;
  email: string;
  phoneNumber: string;
  tags: string[];
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchInput] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  useEffect(() => {
    fetchCustomers();
  }, []);

  const fetchCustomers = async () => {
    try {
      const { data } = await api.get('/customers');
      setCustomers(data);
      setLoading(false);
    } catch {
      setLoading(false);
    }
  };

  const filteredCustomers = customers.filter(c => 
    c.fullName?.toLowerCase().includes(searchTerm.toLowerCase()) || 
    c.phoneNumber?.includes(searchTerm) ||
    c.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center gap-4 text-neutral-400">
        <Loader2 size={40} className="animate-spin text-labbaik-blue" />
        <p className="font-bold">جاري تحميل قائمة العملاء...</p>
      </div>
    );
  }

  return (
    <div className="space-y-10 animate-fade-in relative" dir="rtl">
      
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 bg-labbaik-surface p-10 rounded-[3rem] border border-white/5 shadow-2xl">
        <div>
          <h1 className="text-3xl font-black text-white flex items-center gap-4">
            إدارة العملاء <span className="bg-labbaik-blue/10 text-labbaik-blue text-xs px-4 py-1.5 rounded-full border border-labbaik-blue/20">{customers.length}</span>
          </h1>
          <p className="text-neutral-400 mt-2 font-medium text-right">قاعدة بيانات عملائك الموحدة عابرة المنصات.</p>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="relative group lg:w-80">
            <Search className="absolute right-5 top-1/2 -translate-y-1/2 text-neutral-500 group-focus-within:text-labbaik-blue transition-colors" size={18} />
            <input 
              type="text" 
              placeholder="ابحث بالاسم أو الرقم..."
              value={searchTerm}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full bg-white/2 border border-white/5 rounded-2xl py-4 pr-12 pl-6 text-sm text-white focus:outline-none focus:ring-2 focus:ring-labbaik-blue/30 transition-all font-bold placeholder:text-gray-700"
            />
          </div>
        </div>
      </div>

      {/* Customers List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 pb-20">
        {filteredCustomers.length > 0 ? filteredCustomers.map((customer) => (
          <div 
            key={customer.id}
            onClick={() => setSelectedCustomerId(customer.id)}
            className="bg-labbaik-surface p-8 rounded-[3rem] border border-white/5 shadow-xl hover:border-labbaik-blue/30 hover:scale-[1.03] transition-all cursor-pointer group relative overflow-hidden flex flex-col"
          >
            <div className="flex items-start justify-between mb-8">
              <div className="w-16 h-16 bg-gradient-to-br from-labbaik-blue/20 to-transparent rounded-[1.5rem] flex items-center justify-center border border-labbaik-blue/20 group-hover:scale-110 transition-transform">
                <UserIcon size={32} className="text-labbaik-blue" />
              </div>
              <div className="bg-white/5 p-2.5 rounded-xl border border-white/5 opacity-50 group-hover:opacity-100 transition-opacity">
                <ChevronLeft size={20} className="text-neutral-400" />
              </div>
            </div>

            <div className="space-y-6 flex-1">
              <div>
                <h3 className="text-xl font-black text-white truncate leading-tight">{customer.fullName || 'عميل مجهول'}</h3>
                <div className="flex items-center gap-2 text-neutral-400 mt-2">
                  <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
                  <span className="text-xs font-bold tabular-nums tracking-wider">{customer.phoneNumber}</span>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {customer.tags?.length > 0 ? customer.tags.slice(0, 2).map(tag => (
                  <span key={tag} className="text-[9px] font-black px-3 py-1 bg-white/2 border border-white/5 rounded-lg text-neutral-400 uppercase tracking-tighter">
                    {tag.replace('_', ' ')}
                  </span>
                )) : <span className="text-[9px] text-gray-700 font-bold">لا يوجد وسوم</span>}
                {customer.tags?.length > 2 && <span className="text-[9px] text-neutral-500 font-black">+{customer.tags.length - 2}</span>}
              </div>
            </div>

            <div className="mt-10 pt-6 border-t border-white/5 flex items-center justify-between text-[10px] font-black text-neutral-500">
               <span className="flex items-center gap-2 uppercase tracking-widest"><Calendar size={12} className="text-labbaik-blue" /> {toEnglishDigits(format(new Date(customer.createdAt), 'yyyy/MM/dd'))}</span>
               <span className="group-hover:text-labbaik-blue transition-colors">عرض التفاصيل</span>
            </div>
          </div>
        )) : (
          <div className="col-span-full py-32 text-center space-y-6">
            <div className="w-24 h-24 bg-white/2 rounded-full flex items-center justify-center mx-auto border border-white/5"><Users size={48} className="text-neutral-700" /></div>
            <p className="font-black text-neutral-500">لم نجد أي عملاء بهذا الاسم.</p>
          </div>
        )}
      </div>

      {/* Profile Modal */}
      {selectedCustomerId && (
        <CustomerProfile 
          customerId={selectedCustomerId} 
          onClose={() => setSelectedCustomerId(null)} 
        />
      )}
    </div>
  );
}



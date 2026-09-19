import { useEffect, useState } from 'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { useToast } from '../components/Toast';
import { Trash2, CheckCircle2, RefreshCw, Loader2, Search } from 'lucide-react';
import api from '../api/client';

type DeletionRequest = {
  id: string;
  email: string;
  organizationName?: string;
  phone?: string;
  reason?: string;
  status: 'PENDING' | 'VERIFIED' | 'PROCESSING' | 'COMPLETED' | 'REJECTED' | 'CANCELLED';
  matchedUserId?: string;
  matchedOrganizationId?: string;
  adminNotes?: string;
  ipAddress?: string;
  userAgent?: string;
  verifiedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export default function AccountDeletionAdminPage() {
  const { showToast } = useToast();
  const [requests, setRequests] = useState<DeletionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [editingNotes, setEditingNotes] = useState<Record<string, string>>({});

  useEffect(() => {
    void loadRequests();
  }, []);

  const loadRequests = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/admin/account-deletion-requests');
      setRequests(data || []);
      const notesMap: Record<string, string> = {};
      (data || []).forEach((r: DeletionRequest) => {
        notesMap[r.id] = r.adminNotes || '';
      });
      setEditingNotes(notesMap);
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'تعذر تحميل طلبات الحذف، يتطلب صلاحية مدير المنصة.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (id: string, status: DeletionRequest['status']) => {
    setUpdatingId(id);
    try {
      await api.patch(`/admin/account-deletion-requests/${id}`, {
        status,
        adminNotes: editingNotes[id] || undefined,
      });
      showToast(`تم تحديث حالة الطلب إلى ${status}`, 'success');
      await loadRequests();
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'فشل تحديث الطلب.', 'error');
    } finally {
      setUpdatingId(null);
    }
  };

  const filtered = requests.filter((r) => {
    if (filterStatus !== 'ALL' && r.status !== filterStatus) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        r.email.toLowerCase().includes(q) ||
        (r.organizationName || '').toLowerCase().includes(q) ||
        (r.phone || '').includes(q)
      );
    }
    return true;
  });

  const getStatusBadge = (status: DeletionRequest['status']) => {
    switch (status) {
      case 'PENDING':
        return <span className="px-2.5 py-1 rounded-full text-xs font-black bg-amber-500/10 text-amber-600 border border-amber-500/20">قيد المراجعة</span>;
      case 'VERIFIED':
        return <span className="px-2.5 py-1 rounded-full text-xs font-black bg-blue-500/10 text-blue-600 border border-blue-500/20">تم التحقق</span>;
      case 'PROCESSING':
        return <span className="px-2.5 py-1 rounded-full text-xs font-black bg-purple-500/10 text-purple-600 border border-purple-500/20">جاري المعالجة</span>;
      case 'COMPLETED':
        return <span className="px-2.5 py-1 rounded-full text-xs font-black bg-green-500/10 text-green-600 border border-green-500/20">مكتمل</span>;
      case 'REJECTED':
        return <span className="px-2.5 py-1 rounded-full text-xs font-black bg-red-500/10 text-red-600 border border-red-500/20">مرفوض</span>;
      case 'CANCELLED':
        return <span className="px-2.5 py-1 rounded-full text-xs font-black bg-neutral-500/10 text-neutral-600 border border-neutral-500/20">ملغي</span>;
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-neutral-900 dark:text-white flex items-center gap-2.5">
            <Trash2 className="text-red-500" />
            طلبات حذف الحساب والبيانات
          </h1>
          <p className="text-xs text-neutral-500 mt-1">
            مراجعة طلبات الحذف العامة المقدمة من المستخدمين والتحقق منها وتنفيذ الإجراءات الرسمية.
          </p>
        </div>

        <Button variant="secondary" size="md" onClick={loadRequests} disabled={loading}>
          {loading ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
          تحديث القائمة
        </Button>
      </div>

      {/* Filters and Search */}
      <Card variant="labbaik" className="p-4">
        <div className="flex flex-col sm:flex-row items-center gap-3 justify-between">
          <div className="relative flex-1 w-full">
            <Search size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              placeholder="البحث بالبريد الإلكتروني أو المنظمة..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10 rounded-xl py-2 pr-10 pl-4 text-xs focus:outline-none focus:border-labbaik-blue"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
            {['ALL', 'PENDING', 'VERIFIED', 'PROCESSING', 'COMPLETED', 'REJECTED'].map((st) => (
              <button
                key={st}
                onClick={() => setFilterStatus(st)}
                className={`text-xs font-bold px-3 py-1.5 rounded-xl border transition-all whitespace-nowrap ${
                  filterStatus === st
                    ? 'bg-labbaik-blue text-white border-labbaik-blue'
                    : 'bg-white dark:bg-white/5 text-neutral-600 dark:text-neutral-300 border-neutral-200 dark:border-white/10'
                }`}
              >
                {st === 'ALL' ? 'الكل' : st}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Requests List */}
      {loading ? (
        <div className="py-24 text-center">
          <Loader2 size={36} className="animate-spin text-labbaik-blue mx-auto" />
          <p className="text-xs text-neutral-500 mt-2 font-bold">جاري تحميل الطلبات...</p>
        </div>
      ) : filtered.length === 0 ? (
        <Card variant="labbaik" className="text-center py-16">
          <CheckCircle2 size={44} className="mx-auto text-neutral-400 opacity-40 mb-3" />
          <h3 className="text-base font-black text-neutral-800 dark:text-neutral-200">لا توجد طلبات حذف مطابقة</h3>
          <p className="text-xs text-neutral-500 mt-1">جميع الطلبات تم التعامل معها أو لا توجد نتائج للبحث.</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {filtered.map((req) => (
            <Card key={req.id} variant="labbaik" className="space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-neutral-200 dark:border-white/10 pb-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm font-black text-labbaik-blue" dir="ltr">
                      {req.email}
                    </span>
                    {getStatusBadge(req.status)}
                    {req.matchedUserId && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                        حساب مسجل ✓
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-neutral-500 flex flex-wrap gap-4">
                    <span>المنظمة: {req.organizationName || 'غير محددة'}</span>
                    <span>الهاتف: {req.phone || 'غير مسجل'}</span>
                    <span>تاريخ الطلب: {new Date(req.createdAt).toLocaleString('en-GB')}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  {req.status === 'PENDING' && (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => updateStatus(req.id, 'VERIFIED')}
                      disabled={updatingId === req.id}
                    >
                      تحقق من الهوية
                    </Button>
                  )}
                  {req.status === 'VERIFIED' && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => updateStatus(req.id, 'PROCESSING')}
                      disabled={updatingId === req.id}
                    >
                      بدء المعالجة
                    </Button>
                  )}
                  {req.status === 'PROCESSING' && (
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => updateStatus(req.id, 'COMPLETED')}
                      disabled={updatingId === req.id}
                    >
                      إتمام الحذف
                    </Button>
                  )}
                  {req.status !== 'REJECTED' && req.status !== 'COMPLETED' && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => updateStatus(req.id, 'REJECTED')}
                      disabled={updatingId === req.id}
                    >
                      رفض الطلب
                    </Button>
                  )}
                </div>
              </div>

              {req.reason && (
                <div className="text-xs bg-neutral-100 dark:bg-white/5 p-3 rounded-xl">
                  <span className="font-bold text-neutral-700 dark:text-neutral-300">سبب الحذف المذكور: </span>
                  <span className="text-neutral-600 dark:text-neutral-400">{req.reason}</span>
                </div>
              )}

              {/* Admin Notes & Metadata */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                <div className="md:col-span-2 space-y-1">
                  <label className="font-bold text-neutral-500">ملاحظات الإدارة الداخلية:</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="أضف ملاحظات التحقق أو التوثيق..."
                      value={editingNotes[req.id] ?? ''}
                      onChange={(e) =>
                        setEditingNotes((curr) => ({ ...curr, [req.id]: e.target.value }))
                      }
                      className="flex-1 bg-white dark:bg-black/20 border border-neutral-200 dark:border-white/10 rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:border-labbaik-blue"
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => updateStatus(req.id, req.status)}
                      disabled={updatingId === req.id}
                    >
                      حفظ الملاحظة
                    </Button>
                  </div>
                </div>

                <div className="space-y-0.5 text-[11px] text-neutral-400">
                  <div>عنوان IP: <code dir="ltr">{req.ipAddress || '-'}</code></div>
                  <div>معرف المستخدم: <code dir="ltr">{req.matchedUserId || '-'}</code></div>
                  <div>معرف المنظمة: <code dir="ltr">{req.matchedOrganizationId || '-'}</code></div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

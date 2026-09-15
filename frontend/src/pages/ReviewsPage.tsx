import { useState, useEffect } from 'react';
import api from '../api/client';
import { Button } from '../components/ui/Button';
import { 
  Star, 
  MessageSquare, 
  Send, 
  Sparkles, 
  Loader2, 
  User, 
  Clock,
  CheckCircle2,
  AlertCircle,
  Plus
} from 'lucide-react';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { toEnglishDigits } from '@/lib/utils';

interface Review {
  id: string;
  reviewerName: string;
  reviewerPhotoUrl?: string;
  rating: number;
  comment: string;
  reply?: string;
  status: 'pending' | 'replied' | 'ignored';
  createdAt: string;
}

export default function ReviewsPage() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeReview, setActiveReview] = useState<Review | null>(null);
  const [replyText, setReplyText] = useState('');
  const [suggesting, setSuggesting] = useState(false);
  const [submitting, setSaving] = useState(false);

  useEffect(() => {
    fetchReviews();
  }, []);

  const fetchReviews = async () => {
    try {
      const { data } = await api.get('/reviews');
      setReviews(data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching reviews:', error);
      setLoading(false);
    }
  };

  const getAiSuggestion = async () => {
    if (!activeReview) return;
    setSuggesting(true);
    try {
      const { data } = await api.get(`/reviews/${activeReview.id}/suggestion`);
      setReplyText(data.suggestion);
    } catch {
      alert('فشل في جلب اقتراح لبيك.');
    } finally {
      setSuggesting(false);
    }
  };

  const handleReply = async () => {
    if (!activeReview || !replyText.trim()) return;
    setSaving(true);
    try {
      await api.post(`/reviews/${activeReview.id}/reply`, { reply: replyText });
      await fetchReviews();
      setActiveReview(null);
      setReplyText('');
      alert('تم إرسال الرد بنجاح!');
    } catch {
      alert('فشل في إرسال الرد.');
    } finally {
      setSaving(false);
    }
  };

  const simulateReview = async () => {
    try {
      await api.post('/reviews/simulate', {
        name: 'سالم أحمد',
        rating: 5,
        comment: 'أفضل متجر تعاملت معه، الأثاث جودته عالية جداً والتوصيل سريع.'
      });
      fetchReviews();
    } catch {
      console.error('Simulation failed');
    }
  };

  if (loading) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center gap-4 text-neutral-400">
        <Loader2 size={40} className="animate-spin text-labbaik-blue" />
        <p className="font-bold">جاري جلب تقييمات العملاء...</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-10 animate-fade-in" dir="rtl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-labbaik-surface p-8 rounded-[2.5rem] border border-white/5 shadow-2xl">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 bg-labbaik-blue/10 rounded-2xl flex items-center justify-center border border-labbaik-blue/20">
            <Star size={32} className="text-labbaik-blue" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-neutral-900 dark:text-white">إدارة تقييمات جوجل ماب</h1>
            <p className="text-neutral-500 dark:text-neutral-400 text-sm mt-1 font-medium">عزز سمعة متجرك بالرد الذكي والسرير على مراجعات العملاء.</p>
          </div>
        </div>
        <button 
          onClick={simulateReview}
          className="flex items-center gap-2 bg-white/5 hover:bg-white/10 text-neutral-300 px-6 py-3 rounded-xl text-xs font-black transition-all border border-white/5"
        >
          <Plus size={16} /> محاكاة تقييم جديد
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        {/* Reviews List */}
        <div className="lg:col-span-2 space-y-6">
          {reviews.length === 0 ? (
            <div className="bg-labbaik-surface p-20 rounded-[2.5rem] border border-white/5 text-center space-y-4">
              <Star size={48} className="mx-auto text-gray-700" />
              <p className="text-neutral-400 font-bold">لا يوجد تقييمات حالياً.</p>
            </div>
          ) : (
            reviews.map((review) => (
              <div 
                key={review.id}
                onClick={() => review.status === 'pending' && setActiveReview(review)}
                className={`p-8 rounded-[2.5rem] border transition-all cursor-pointer group ${
                  activeReview?.id === review.id 
                    ? 'bg-labbaik-blue/10 border-labbaik-blue/30' 
                    : 'bg-labbaik-surface border-white/5 hover:border-white/10'
                }`}
              >
                <div className="flex justify-between items-start mb-6">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center border border-white/10">
                      <User size={24} className="text-neutral-400" />
                    </div>
                    <div>
                      <h4 className="font-black text-neutral-900 dark:text-white">{review.reviewerName}</h4>
                      <div className="flex items-center gap-1 mt-1">
                        {[...Array(5)].map((_, i) => (
                          <Star key={i} size={12} className={i < review.rating ? 'fill-yellow-500 text-yellow-500' : 'text-gray-700'} />
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className="text-[10px] text-neutral-400 font-bold flex items-center gap-1">
                      <Clock size={12} /> {toEnglishDigits(format(new Date(review.createdAt), 'dd MMMM yyyy', { locale: ar }))}
                    </span>
                    {review.status === 'replied' ? (
                      <span className="px-3 py-1 bg-green-500/10 text-green-400 text-[10px] font-black rounded-full flex items-center gap-1">
                        <CheckCircle2 size={10} /> تم الرد
                      </span>
                    ) : (
                      <span className="px-3 py-1 bg-yellow-500/10 text-yellow-500 text-[10px] font-black rounded-full flex items-center gap-1">
                        <AlertCircle size={10} /> بانتظار الرد
                      </span>
                    )}
                  </div>
                </div>

                <p className="text-neutral-300 text-sm leading-relaxed mb-6 font-medium">"{review.comment}"</p>

                {review.reply && (
                  <div className="bg-white/2 p-6 rounded-2xl border border-white/5 relative">
                    <div className="absolute -top-3 right-6 bg-labbaik-surface px-3 py-1 border border-white/5 rounded-lg text-[10px] font-black text-labbaik-blue">رد المتجر</div>
                    <p className="text-neutral-400 text-xs italic leading-relaxed">{review.reply}</p>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Reply Action Area */}
        <div className="space-y-6">
          <div className="sticky top-10">
            {activeReview ? (
              <div className="bg-labbaik-surface p-8 rounded-[2.5rem] border border-labbaik-blue/20 shadow-2xl space-y-8 animate-slide-up">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-labbaik-blue/10 rounded-xl">
                    <MessageSquare size={20} className="text-labbaik-blue" />
                  </div>
                  <h3 className="font-black text-neutral-900 dark:text-white">الرد على {activeReview.reviewerName}</h3>
                </div>

                <div className="space-y-4">
                  <Button 
                    onClick={getAiSuggestion}
                    disabled={suggesting}
                    variant="primary"
                    size="md"
                    className="w-full"
                  >
                    {suggesting ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                    اطلب من "لبيك" اقتراح رد ذكي
                  </Button>

                  <textarea 
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="اكتب ردك هنا أو استخدم اقتراح لبيك..."
                    className="w-full h-48 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-2xl p-6 text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-labbaik-blue/50 transition-all font-bold resize-none placeholder:text-neutral-400"
                  />
                </div>

                <div className="flex gap-4">
                  <button 
                    onClick={() => setActiveReview(null)}
                    className="flex-1 py-4 text-xs font-black text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors"
                  >
                    إلغاء
                  </button>
                  <Button 
                    onClick={handleReply}
                    disabled={submitting || !replyText.trim()}
                    variant="primary"
                    size="md"
                  >
                    {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                    إرسال الرد
                  </Button>
                </div>
              </div>
            ) : (
              <div className="bg-white/2 p-10 rounded-[2.5rem] border border-white/5 text-center space-y-6">
                <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mx-auto border border-white/5">
                  <Star size={24} className="text-gray-700" />
                </div>
                <div>
                  <h4 className="font-black text-neutral-900 dark:text-white text-sm">اختر تقييماً للرد عليه</h4>
                  <p className="text-neutral-500 dark:text-neutral-400 text-[10px] mt-2 leading-relaxed">الرد على تقييمات العملاء يحسن من ترتيبك في جوجل ماب بنسبة تصل إلى 20%.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}



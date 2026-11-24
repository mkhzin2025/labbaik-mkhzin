import { useEffect, useState } from 'react';
import { Loader2, Save, Star } from 'lucide-react';
import api from '../../api/client';
import { useToast } from '../Toast';

type Frequency = 'always' | 'daily' | 'weekly' | 'monthly';
type Scope = 'all' | 'handoff';

const FREQUENCIES: { id: Frequency; name: string; desc: string }[] = [
  { id: 'always', name: 'دائمًا', desc: 'مع كل إغلاق لمحادثة.' },
  { id: 'daily', name: 'مرة في اليوم', desc: 'أول إغلاق خلال ٢٤ ساعة فقط.' },
  { id: 'weekly', name: 'مرة في الأسبوع', desc: 'أول إغلاق خلال ٧ أيام فقط.' },
  { id: 'monthly', name: 'مرة في الشهر', desc: 'أول إغلاق خلال ٣٠ يومًا فقط.' },
];

const SCOPES: { id: Scope; name: string; desc: string }[] = [
  { id: 'handoff', name: 'المحادثات المحالة لموظف فقط', desc: 'التي اختار فيها العميل من التدفق شكوى أو اقتراحًا أو استفسارًا.' },
  { id: 'all', name: 'كل محادثة يُغلقها الفريق', desc: 'أي محادثة تُغلق يدويًا أو تلقائيًا.' },
];

const errorMessage = (error: unknown) =>
  (error as { response?: { data?: { message?: string } } })?.response?.data?.message || 'تعذر حفظ إعدادات التقييم.';

/** When customers get the "rate your experience" message after a conversation is closed. Organization-wide. */
export default function RatingSettingsPanel() {
  const { showToast } = useToast();
  const [frequency, setFrequency] = useState<Frequency>('daily');
  const [scope, setScope] = useState<Scope>('all');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get<{ ratingFrequency: Frequency; ratingScope: Scope }>('/organizations/me/settings')
      .then(({ data }) => { setFrequency(data.ratingFrequency); setScope(data.ratingScope); })
      .catch(() => showToast('تعذر تحميل إعدادات التقييم.', 'error'))
      .finally(() => setLoading(false));
  }, [showToast]);

  const save = async () => {
    setSaving(true);
    try {
      await api.patch('/organizations/me/settings', { ratingFrequency: frequency, ratingScope: scope });
      showToast('تم حفظ إعدادات التقييم.', 'success');
    } catch (error) {
      showToast(errorMessage(error), 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="grid place-items-center py-16 text-labbaik-text-muted"><Loader2 className="animate-spin" size={22} /></div>;

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-labbaik-border bg-labbaik-surface p-4 sm:p-5">
        <div className="mb-4 flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-amber-500/12 text-amber-700 dark:text-amber-300"><Star size={18} /></span>
          <div>
            <h2 className="font-black text-neutral-900 dark:text-white">رسالة التقييم بعد إغلاق المحادثة</h2>
            <p className="mt-0.5 text-sm text-labbaik-text-muted">تصل العميل على واتساب «قيّم تجربتك معنا» بأزرار راضٍ / عادي / غير راضٍ.</p>
          </div>
        </div>

        <p className="mb-2 text-sm font-bold text-neutral-900 dark:text-white">متى تُرسل؟</p>
        <Options value={scope} onChange={setScope} options={SCOPES} label="المحادثات التي يُرسل لها التقييم" columns="md:grid-cols-2" />

        <p className="mb-2 mt-5 text-sm font-bold text-neutral-900 dark:text-white">كم مرة للعميل نفسه؟</p>
        <Options value={frequency} onChange={setFrequency} options={FREQUENCIES} label="تكرار التقييم" columns="sm:grid-cols-2 lg:grid-cols-4" />
        <p className="mt-3 text-xs leading-relaxed text-labbaik-text-muted">
          مثال «مرة في الأسبوع»: عميل فتح شكوى ثلاث مرات في أسبوع، يصله التقييم عند إغلاق الأولى فقط، ولا يصله في الإغلاقات التالية حتى تمر ٧ أيام على آخر تقييم أُرسل له.
        </p>
      </section>

      <div className="sticky bottom-0 -mx-1 border-t border-labbaik-border bg-labbaik-page/90 px-1 py-3">
        <button type="button" onClick={() => void save()} disabled={saving} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-labbaik-blue px-4 text-sm font-black text-labbaik-on-accent hover:bg-[#553174] disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer">
          {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />} حفظ إعدادات التقييم
        </button>
      </div>
    </div>
  );
}

function Options<T extends string>({ value, onChange, options, label, columns }: {
  value: T;
  onChange: (value: T) => void;
  options: { id: T; name: string; desc: string }[];
  label: string;
  columns: string;
}) {
  return (
    <div className={`grid grid-cols-1 gap-2 ${columns}`} role="radiogroup" aria-label={label}>
      {options.map((option) => {
        const on = value === option.id;
        return (
          <button
            type="button"
            role="radio"
            aria-checked={on}
            key={option.id}
            onClick={() => onChange(option.id)}
            className={`rounded-lg border p-3 text-right transition-colors cursor-pointer ${on ? 'border-labbaik-blue bg-labbaik-blue/8' : 'border-labbaik-border hover:border-labbaik-blue/40'}`}
          >
            <span className="flex items-center justify-between gap-2 text-sm font-bold text-neutral-900 dark:text-white">
              {option.name}
              <span className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border-2 ${on ? 'border-labbaik-blue dark:border-purple-300' : 'border-neutral-400 dark:border-neutral-500'}`} aria-hidden="true">
                {on && <span className="h-2 w-2 rounded-full bg-labbaik-blue dark:bg-purple-300" />}
              </span>
            </span>
            <span className="mt-1 block text-xs leading-relaxed text-labbaik-text-muted">{option.desc}</span>
          </button>
        );
      })}
    </div>
  );
}

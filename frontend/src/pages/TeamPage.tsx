import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Check, Copy, Eye, EyeOff, KeyRound, Loader2, Pencil, Plus, RefreshCw, Trash2, UserCog, X } from 'lucide-react';
import api from '../api/client';
import { useToast } from '../components/Toast';
import CustomerAvatar from '../components/CustomerAvatar';
import { ROLE_LABELS } from '../lib/access';
import type { MemberRole } from '../lib/access';

type AssignableRole = Exclude<MemberRole, 'owner'>;

interface Member {
  userId: string;
  fullName: string;
  email: string;
  role: MemberRole;
  storeIds: string[] | null;
  isYou: boolean;
}

interface Branch {
  id: string;
  name: string;
}

const ROLE_OPTIONS: { value: AssignableRole; sees: string }[] = [
  { value: 'admin', sees: 'كل الأقسام والفروع، بما فيها الإعدادات والفوترة وإدارة الفريق.' },
  { value: 'support', sees: 'الرئيسية، المحادثات، والتقييمات.' },
  { value: 'marketing', sees: 'التدفقات، وقوالب وحملات واتساب.' },
];

const ROLE_TONES: Record<MemberRole, string> = {
  owner: 'bg-labbaik-blue/10 text-labbaik-blue dark:text-purple-200',
  admin: 'bg-labbaik-blue/10 text-labbaik-blue dark:text-purple-200',
  support: 'bg-sky-500/12 text-sky-800 dark:text-sky-300',
  marketing: 'bg-amber-500/15 text-amber-900 dark:text-amber-200',
};

const inputClass = 'h-10 w-full rounded-lg bg-labbaik-surface px-3 text-sm text-labbaik-text placeholder:text-labbaik-text-muted/80 focus:outline-none focus:ring-2 focus:ring-labbaik-blue/30';

const errorMessage = (error: unknown, fallback: string) =>
  (error as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;

function generatePassword() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
}

function RolePicker({ value, onChange }: { value: AssignableRole; onChange: (role: AssignableRole) => void }) {
  return (
    <div role="radiogroup" aria-label="الصلاحية" className="grid gap-2 sm:grid-cols-3">
      {ROLE_OPTIONS.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-start transition-colors cursor-pointer ${active ? 'border-labbaik-blue bg-labbaik-blue/5' : 'border-labbaik-border hover:border-labbaik-blue/30'}`}
          >
            <span className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border-2 ${active ? 'border-labbaik-blue' : 'border-neutral-300 dark:border-neutral-600'}`}>
              {active && <span className="h-1.5 w-1.5 rounded-full bg-labbaik-blue" />}
            </span>
            <span>
              <span className="block text-sm font-bold text-neutral-900 dark:text-white">{ROLE_LABELS[option.value]}</span>
              <span className="block text-xs leading-relaxed text-labbaik-text-muted">{option.sees}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Empty selection = every branch. */
function BranchPicker({ branches, value, onChange }: { branches: Branch[]; value: string[]; onChange: (ids: string[]) => void }) {
  if (branches.length <= 1) return null;
  const all = value.length === 0 || value.length === branches.length;
  const toggle = (id: string) => {
    const current = all ? branches.map((branch) => branch.id) : value;
    const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
    onChange(next.length === branches.length ? [] : next);
  };
  return (
    <fieldset className="space-y-1.5">
      <legend className="mb-1.5 text-[13px] font-bold text-neutral-800 dark:text-neutral-100">الفروع</legend>
      <label className="flex items-center gap-2 text-sm text-labbaik-text cursor-pointer">
        <input type="checkbox" checked={all} onChange={() => onChange([])} className="h-4 w-4 rounded accent-[#643B89] cursor-pointer" />
        كل الفروع
      </label>
      <div className="flex flex-wrap gap-1.5 pt-1">
        {branches.map((branch) => {
          const checked = all || value.includes(branch.id);
          return (
            <button
              key={branch.id}
              type="button"
              aria-pressed={checked}
              onClick={() => toggle(branch.id)}
              className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-bold transition-colors cursor-pointer ${checked ? 'border-labbaik-blue bg-labbaik-blue/10 text-labbaik-blue dark:text-purple-200' : 'border-labbaik-border text-labbaik-text-muted hover:border-labbaik-blue/30'}`}
            >
              {checked && <Check size={12} strokeWidth={3} />} {branch.name}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-labbaik-text-muted">يرى العضو محادثات وتقييمات هذه الفروع فقط. الفروع التي تُضاف لاحقًا تحتاج تحديث عضويته.</p>
    </fieldset>
  );
}

function PasswordField({ value, onChange, label }: { value: string; onChange: (value: string) => void; label: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <label className="block space-y-1.5">
      <span className="text-[13px] font-bold text-neutral-800 dark:text-neutral-100">{label}</span>
      <div className="flex gap-1.5">
        <div className="relative flex-1">
          <input type={visible ? 'text' : 'password'} dir="ltr" value={value} onChange={(e) => onChange(e.target.value)} autoComplete="new-password" placeholder="8 أحرف على الأقل" className={`${inputClass} pe-10`} />
          <button type="button" onClick={() => setVisible(!visible)} aria-label={visible ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'} className="absolute inset-y-0 end-0 grid w-10 place-items-center text-labbaik-text-muted hover:text-labbaik-text cursor-pointer">
            {visible ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
        <button type="button" onClick={() => { onChange(generatePassword()); setVisible(true); }} title="توليد كلمة مرور" className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-labbaik-border px-3 text-xs font-bold text-labbaik-text hover:border-labbaik-blue/40 hover:text-labbaik-blue cursor-pointer">
          <RefreshCw size={13} /> توليد
        </button>
      </div>
    </label>
  );
}

function CredentialsNote({ email, password, onClose }: { email: string; password: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const text = `رابط الدخول: ${window.location.origin}/login\nالبريد: ${email}\nكلمة المرور: ${password}`;
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard unavailable */ }
  };
  return (
    <div className="rounded-xl bg-emerald-500/10 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-bold text-emerald-900 dark:text-emerald-200">أُضيف العضو. أرسل له بيانات الدخول:</p>
          <pre dir="rtl" className="mt-2 whitespace-pre-wrap font-sans text-sm leading-relaxed text-emerald-950 dark:text-emerald-100">{text}</pre>
        </div>
        <button type="button" onClick={onClose} aria-label="إغلاق" className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-emerald-800 hover:bg-emerald-500/15 dark:text-emerald-200 cursor-pointer"><X size={16} /></button>
      </div>
      <button type="button" onClick={() => void copy()} className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-700 px-3 text-sm font-bold text-white hover:bg-emerald-800 cursor-pointer">
        {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? 'نُسخت' : 'نسخ البيانات'}
      </button>
      <p className="mt-2 text-xs text-emerald-900/80 dark:text-emerald-200/80">لن تظهر كلمة المرور مرة أخرى. يمكنك تعيين كلمة جديدة من «تعديل».</p>
    </div>
  );
}

function AddMemberForm({ branches, onAdded, onCancel }: { branches: Branch[]; onAdded: (member: Member, password: string) => void; onCancel: () => void }) {
  const { showToast } = useToast();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState(generatePassword);
  const [role, setRole] = useState<AssignableRole>('support');
  const [storeIds, setStoreIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const { data } = await api.post<Member>('/organizations/members', { fullName, email, password, role, storeIds: role === 'admin' ? [] : storeIds });
      onAdded(data, password);
    } catch (error) {
      showToast(errorMessage(error, 'تعذر إضافة العضو.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-4 rounded-xl border border-labbaik-border bg-labbaik-surface p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-black text-neutral-900 dark:text-white">عضو جديد</h2>
          <p className="mt-0.5 text-sm text-labbaik-text-muted">تنشئ له حسابًا بكلمة مرور مبدئية، ويدخل بها من صفحة تسجيل الدخول.</p>
        </div>
        <button type="button" onClick={onCancel} aria-label="إلغاء" className="grid h-8 w-8 place-items-center rounded-md text-labbaik-text-muted hover:bg-labbaik-page hover:text-labbaik-text cursor-pointer"><X size={17} /></button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1.5">
          <span className="text-[13px] font-bold text-neutral-800 dark:text-neutral-100">الاسم</span>
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} required placeholder="مثال: سارة محمد" className={inputClass} />
        </label>
        <label className="block space-y-1.5">
          <span className="text-[13px] font-bold text-neutral-800 dark:text-neutral-100">البريد الإلكتروني</span>
          <input type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="name@company.com" autoComplete="off" className={inputClass} />
        </label>
      </div>
      <PasswordField label="كلمة المرور المبدئية" value={password} onChange={setPassword} />
      <div className="space-y-1.5">
        <span className="block text-[13px] font-bold text-neutral-800 dark:text-neutral-100">الصلاحية</span>
        <RolePicker value={role} onChange={setRole} />
      </div>
      {role !== 'admin' && <BranchPicker branches={branches} value={storeIds} onChange={setStoreIds} />}
      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={saving} className="inline-flex h-10 items-center gap-2 rounded-lg bg-labbaik-blue px-4 text-sm font-black text-labbaik-on-accent hover:bg-[#553174] disabled:opacity-50 cursor-pointer">
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} إضافة العضو
        </button>
        <button type="button" onClick={onCancel} className="h-10 rounded-lg px-4 text-sm font-bold text-labbaik-text-muted hover:text-labbaik-text cursor-pointer">إلغاء</button>
      </div>
    </form>
  );
}

function EditMember({ member, branches, onSaved, onCancel }: { member: Member; branches: Branch[]; onSaved: (member: Member) => void; onCancel: () => void }) {
  const { showToast } = useToast();
  const [role, setRole] = useState<AssignableRole>(member.role === 'owner' ? 'admin' : member.role);
  const [storeIds, setStoreIds] = useState<string[]>(member.storeIds && member.storeIds.length < branches.length ? member.storeIds : []);
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const body: Record<string, unknown> = { storeIds: role === 'admin' ? [] : storeIds };
      if (!member.isYou) body.role = role;
      if (password) body.password = password;
      const { data } = await api.patch<Member>(`/organizations/members/${member.userId}`, body);
      showToast(password ? 'حُفظت التعديلات وكلمة المرور الجديدة.' : 'حُفظت التعديلات.', 'success');
      onSaved(data);
    } catch (error) {
      showToast(errorMessage(error, 'تعذر حفظ التعديلات.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 border-t border-labbaik-border bg-labbaik-page/60 px-4 py-4">
      {member.isYou
        ? <p className="text-sm text-labbaik-text-muted">لا يمكنك تغيير صلاحيتك بنفسك.</p>
        : <RolePicker value={role} onChange={setRole} />}
      {role !== 'admin' && <BranchPicker branches={branches} value={storeIds} onChange={setStoreIds} />}
      <div className="max-w-md">
        <PasswordField label="كلمة مرور جديدة (اختياري)" value={password} onChange={setPassword} />
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={() => void save()} disabled={saving} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-labbaik-blue px-4 text-sm font-black text-labbaik-on-accent hover:bg-[#553174] disabled:opacity-50 cursor-pointer">
          {saving && <Loader2 size={15} className="animate-spin" />} حفظ
        </button>
        <button type="button" onClick={onCancel} className="h-9 rounded-lg px-3 text-sm font-bold text-labbaik-text-muted hover:text-labbaik-text cursor-pointer">إلغاء</button>
      </div>
    </div>
  );
}

export default function TeamPage() {
  const { showToast } = useToast();
  const [members, setMembers] = useState<Member[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [credentials, setCredentials] = useState<{ email: string; password: string } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [{ data: memberRows }, { data: storeRows }] = await Promise.all([api.get<Member[]>('/organizations/members'), api.get<Branch[]>('/stores')]);
      setMembers(Array.isArray(memberRows) ? memberRows : []);
      setBranches(Array.isArray(storeRows) ? storeRows.map(({ id, name }) => ({ id, name })) : []);
    } catch (error) {
      showToast(errorMessage(error, 'تعذر تحميل الفريق.'), 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { void load(); }, [load]);

  const remove = async (member: Member) => {
    setBusyId(member.userId);
    try {
      await api.delete(`/organizations/members/${member.userId}`);
      setMembers((current) => current.filter((row) => row.userId !== member.userId));
      setConfirmDelete(null);
      showToast(`حُذف «${member.fullName}» من الفريق.`, 'success');
    } catch (error) {
      showToast(errorMessage(error, 'تعذر حذف العضو.'), 'error');
    } finally {
      setBusyId(null);
    }
  };

  const branchSummary = (member: Member) => {
    if (member.storeIds === null || branches.length <= 1) return 'كل الفروع';
    if (member.storeIds.length === 0) return 'بدون فروع';
    if (member.storeIds.length === branches.length) return 'كل الفروع';
    const names = member.storeIds.map((id) => branches.find((branch) => branch.id === id)?.name).filter(Boolean);
    return names.length > 2 ? `${names.slice(0, 2).join('، ')} +${names.length - 2}` : names.join('، ');
  };

  return (
    <div className="max-w-5xl space-y-4 pb-10" dir="rtl">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-black text-neutral-900 dark:text-white">الفريق</h1>
          <p className="mt-1 text-sm text-labbaik-text-muted">أضف موظفيك وحدد لكل واحد ما يراه: مدير، دعم العملاء، أو الحملات.</p>
        </div>
        {!adding && (
          <button type="button" onClick={() => { setAdding(true); setCredentials(null); }} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-labbaik-blue px-4 text-sm font-black text-labbaik-on-accent hover:bg-[#553174] cursor-pointer">
            <Plus size={16} /> إضافة عضو
          </button>
        )}
      </div>

      {credentials && <CredentialsNote email={credentials.email} password={credentials.password} onClose={() => setCredentials(null)} />}

      {adding && (
        <AddMemberForm
          branches={branches}
          onCancel={() => setAdding(false)}
          onAdded={(member, password) => {
            setMembers((current) => [...current, member]);
            setAdding(false);
            setCredentials({ email: member.email, password });
          }}
        />
      )}

      {loading ? (
        <div className="divide-y divide-labbaik-border rounded-xl border border-labbaik-border bg-labbaik-surface" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-4">
              <div className="h-9 w-9 animate-pulse rounded-full bg-labbaik-page" />
              <div className="space-y-2"><div className="h-3.5 w-40 animate-pulse rounded bg-labbaik-page" /><div className="h-3 w-28 animate-pulse rounded bg-labbaik-page" /></div>
            </div>
          ))}
        </div>
      ) : (
        <ul className="divide-y divide-labbaik-border rounded-xl border border-labbaik-border bg-labbaik-surface">
          {members.map((member) => {
            const busy = busyId === member.userId;
            const editable = member.role !== 'owner';
            return (
              <li key={member.userId}>
                <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <CustomerAvatar name={member.fullName} seed={member.email} size={36} className="rounded-full" />
                  <div className="min-w-48 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-neutral-900 dark:text-white">{member.fullName || member.email}</span>
                      {member.isYou && <span className="h-5 rounded bg-labbaik-page px-1.5 text-[11px] font-bold leading-5 text-labbaik-text-muted">أنت</span>}
                      <span className={`h-5 rounded px-1.5 text-[11px] font-bold leading-5 ${ROLE_TONES[member.role]}`}>{ROLE_LABELS[member.role]}</span>
                    </div>
                    <p className="text-xs text-labbaik-text-muted"><span dir="ltr">{member.email}</span> · {branchSummary(member)}</p>
                  </div>
                  {editable && (
                    <div className="flex items-center gap-1">
                      {confirmDelete === member.userId ? (
                        <>
                          <span className="me-1 text-xs text-labbaik-text-muted">حذف العضو وحسابه؟</span>
                          <button type="button" disabled={busy} onClick={() => void remove(member)} className="h-8 rounded-md bg-red-600 px-2.5 text-xs font-black text-white hover:bg-red-700 disabled:opacity-50 cursor-pointer">حذف</button>
                          <button type="button" onClick={() => setConfirmDelete(null)} className="h-8 rounded-md px-2 text-xs font-bold text-labbaik-text-muted hover:text-labbaik-text cursor-pointer">إلغاء</button>
                        </>
                      ) : (
                        <>
                          <button type="button" onClick={() => setEditingId(editingId === member.userId ? null : member.userId)} aria-expanded={editingId === member.userId} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-labbaik-border px-2.5 text-xs font-bold text-neutral-800 hover:border-labbaik-blue/40 hover:text-labbaik-blue dark:text-neutral-100 cursor-pointer">
                            <Pencil size={13} /> تعديل
                          </button>
                          {!member.isYou && (
                            <button type="button" onClick={() => setConfirmDelete(member.userId)} aria-label={`حذف ${member.fullName}`} title="حذف" className="grid h-8 w-8 place-items-center rounded-md text-labbaik-text-muted hover:bg-red-500/10 hover:text-red-600 cursor-pointer">
                              <Trash2 size={15} />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  )}
                  {!editable && <span className="inline-flex items-center gap-1 text-xs text-labbaik-text-muted"><KeyRound size={13} /> صاحب الحساب</span>}
                </div>
                {editingId === member.userId && (
                  <EditMember
                    member={member}
                    branches={branches}
                    onCancel={() => setEditingId(null)}
                    onSaved={(updated) => { setMembers((current) => current.map((row) => (row.userId === updated.userId ? updated : row))); setEditingId(null); }}
                  />
                )}
              </li>
            );
          })}
          {members.length <= 1 && !adding && (
            <li className="px-4 py-8 text-center">
              <UserCog size={28} strokeWidth={1.5} className="mx-auto text-labbaik-text-muted" />
              <p className="mt-2 font-bold text-neutral-800 dark:text-neutral-100">أنت وحدك في الفريق</p>
              <p className="mt-1 text-sm text-labbaik-text-muted">أضف موظف دعم ليرد على المحادثات، أو موظف حملات يدير التدفقات وقوالب واتساب.</p>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

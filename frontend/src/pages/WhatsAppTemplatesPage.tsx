import { useEffect, useMemo, useState } from 'react';
import { Building2, CheckCircle2, FolderOpen, Loader2, MessageSquareText, Network, RefreshCw, Search, Send, Settings, Tag, UserRoundCheck, Users, XCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { useToast } from '../components/Toast';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import type { Branch } from '../components/customers/BranchSelector';

type TemplateComponent = { type: string; text?: string; format?: string; buttons?: any[]; [key: string]: any };
type Template = { id: string; name: string; language: string; category?: string; status?: string; components: TemplateComponent[] };
type Taxonomy = { id: string; name: string; color: string; isActive: boolean; scope?: 'organization' | 'store'; storeId?: string | null };
type Customer = { id: string; storeId: string; store?: Branch; fullName?: string; phoneNumber?: string; whatsappId?: string; email?: string; categories: Taxonomy[]; tags: Taxonomy[] };
type MetaConnection = { id: string; scope: 'organization' | 'store'; storeId?: string | null; defaultStoreId?: string | null; displayPhoneNumber?: string; phoneNumberId: string; status?: string };

export default function WhatsAppTemplatesPage() {
  const { showToast } = useToast();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [connections, setConnections] = useState<MetaConnection[]>([]);
  const [connectionId, setConnectionId] = useState('');
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([]);
  const [singleStoreId, setSingleStoreId] = useState('');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selected, setSelected] = useState<Template | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [selectedCustomers, setSelectedCustomers] = useState<string[]>([]);
  const [mode, setMode] = useState<'single' | 'list'>('list');
  const [to, setTo] = useState('');
  const [bodyValues, setBodyValues] = useState<string[]>([]);
  const [headerValues, setHeaderValues] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [sending, setSending] = useState(false);

  const connection = useMemo(() => connections.find((item) => item.id === connectionId), [connections, connectionId]);

  useEffect(() => { void initialize(); }, []);
  useEffect(() => {
    if (!connection) return;
    setSelected(null); setSelectedCustomers([]); setCategoryFilter([]); setTagFilter([]);
    if (connection.scope === 'store') {
      const sid = connection.storeId || '';
      setSelectedStoreIds(sid ? [sid] : []); setSingleStoreId(sid);
    } else {
      setSelectedStoreIds(branches.map((b) => b.id));
      setSingleStoreId(connection.defaultStoreId || branches[0]?.id || '');
    }
    void loadTemplates(connection.id);
  }, [connectionId]);

  useEffect(() => { if (connection && selectedStoreIds.length) void loadAudience(); }, [connectionId, selectedStoreIds.join(',')]);

  const initialize = async () => {
    setLoading(true);
    try {
      const [storeRes, connectionRes] = await Promise.all([api.get('/stores'), api.get('/integrations/meta/whatsapp/connections')]);
      const branchRows = storeRes.data || []; const connectionRows = connectionRes.data || [];
      setBranches(branchRows); setConnections(connectionRows);
      const preferred = connectionRows.find((item: MetaConnection) => item.scope === 'organization') || connectionRows[0];
      setConnectionId(preferred?.id || '');
      if (!preferred) setLoading(false);
    } catch (error: any) { showToast(error?.response?.data?.message || 'تعذر تحميل إعدادات واتساب.', 'error'); setLoading(false); }
  };

  const loadTemplates = async (id = connectionId) => {
    if (!id) return;
    setLoading(true);
    try { const { data } = await api.get('/integrations/meta/whatsapp/templates', { params: { connectionId: id } }); setTemplates(data || []); }
    catch (error: any) { setTemplates([]); showToast(error?.response?.data?.message || 'تعذر تحميل القوالب.', 'error'); }
    finally { setLoading(false); }
  };

  const loadAudience = async () => {
    if (!connection) return;
    try {
      const params: any = { whatsappOnly: true };
      if (connection.scope === 'organization') { params.scope = 'organization'; params.storeIds = selectedStoreIds.join(','); }
      else params.storeId = connection.storeId;
      const { data } = await api.get('/customers', { params });
      setCustomers(data || []);
    } catch (error: any) { showToast(error?.response?.data?.message || 'تعذر تحميل جمهور الإرسال.', 'error'); }
  };

  const sync = async () => {
    if (!connectionId) return;
    setSyncing(true);
    try { const { data } = await api.post('/integrations/meta/whatsapp/templates/sync', null, { params: { connectionId } }); setTemplates(data.templates || []); showToast(`تم جلب ${data.synced || 0} قالب من Meta.`, 'success'); }
    catch (error: any) { showToast(error?.response?.data?.message || 'فشل جلب القوالب.', 'error'); }
    finally { setSyncing(false); }
  };

  const choose = (template: Template) => { setSelected(template); setBodyValues(Array(bodyPlaceholderCount(template)).fill('')); setHeaderValues(Array(headerPlaceholderCount(template)).fill('')); };
  const validateVariables = () => { if ([...bodyValues, ...headerValues].some((value) => !value.trim())) { showToast('أكمل جميع متغيرات القالب.', 'error'); return false; } return true; };

  const send = async () => {
    if (!selected || !connection || !validateVariables()) return;
    if (mode === 'single' && !to.trim()) return showToast('أدخل رقم المستلم.', 'error');
    if (mode === 'list' && !selectedCustomers.length) return showToast('حدد عميلًا واحدًا على الأقل.', 'error');
    setSending(true);
    try {
      if (mode === 'single') {
        await api.post(`/integrations/meta/whatsapp/templates/${selected.id}/send`, { storeId: singleStoreId || undefined, to, bodyParameters: bodyValues, headerParameters: headerValues });
        setTo(''); showToast('تم إرسال القالب.', 'success');
      } else {
        const { data } = await api.post(`/integrations/meta/whatsapp/templates/${selected.id}/send-bulk`, { storeId: connection.scope === 'store' ? connection.storeId : undefined, storeIds: connection.scope === 'organization' ? selectedStoreIds : undefined, customerIds: selectedCustomers, bodyParameters: bodyValues, headerParameters: headerValues });
        showToast(`الإرسال: ${data.sent} ناجح، ${data.failed} فشل، وحُذف ${data.duplicatesRemoved || 0} تكرار.`, data.failed ? 'info' : 'success');
        setSelectedCustomers([]);
      }
    } catch (error: any) { showToast(error?.response?.data?.message || 'فشل إرسال القالب.', 'error'); }
    finally { setSending(false); }
  };

  const categories = useMemo(() => uniqueTaxonomy(customers.flatMap((c) => c.categories || [])), [customers]);
  const tags = useMemo(() => uniqueTaxonomy(customers.flatMap((c) => c.tags || [])), [customers]);
  const filteredTemplates = useMemo(() => templates.filter((item) => `${item.name} ${item.language} ${item.category}`.toLowerCase().includes(search.toLowerCase())), [templates, search]);
  const filteredCustomers = useMemo(() => customers.filter((customer) => {
    const haystack = `${customer.fullName || ''} ${customer.phoneNumber || customer.whatsappId || ''} ${customer.store?.name || ''}`.toLowerCase();
    if (customerSearch && !haystack.includes(customerSearch.toLowerCase())) return false;
    if (categoryFilter.length && !(customer.categories || []).some((item) => categoryFilter.includes(item.id))) return false;
    if (tagFilter.length && !(customer.tags || []).some((item) => tagFilter.includes(item.id))) return false;
    return true;
  }), [customers, customerSearch, categoryFilter, tagFilter]);
  const selectedRows = customers.filter((c) => selectedCustomers.includes(c.id));
  const recipientStats = dedupeStats(selectedRows);
  const toggleCustomer = (id: string) => setSelectedCustomers((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const selectVisible = () => setSelectedCustomers((current) => [...new Set([...current, ...filteredCustomers.map((item) => item.id)])]);
  const clearVisible = () => setSelectedCustomers((current) => current.filter((id) => !filteredCustomers.some((item) => item.id === id)));
  const toggleBranch = (id: string) => { if (connection?.scope !== 'organization') return; setSelectedStoreIds((current) => current.includes(id) ? (current.length > 1 ? current.filter((x) => x !== id) : current) : [...current, id]); setSelectedCustomers([]); };

  if (loading && !branches.length && !connections.length) return <div className="h-[60vh] flex items-center justify-center"><Loader2 size={38} className="animate-spin text-labbaik-blue" /></div>;
  if (!connections.length) return <div className="max-w-4xl mx-auto" dir="rtl"><Card variant="labbaik" className="text-center space-y-5 py-14"><Settings size={46} className="mx-auto text-labbaik-blue" /><h2 className="text-2xl font-black">لا يوجد اتصال Meta</h2><p className="text-neutral-500">أنشئ رقم المنظمة أو رقم فرع من الإعدادات أولاً.</p><Link to="/dashboard/settings"><Button variant="primary" size="md">الإعدادات</Button></Link></Card></div>;

  return <div className="max-w-[1550px] mx-auto space-y-7" dir="rtl">
    <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-5"><div><h1 className="text-2xl font-black flex items-center gap-3"><MessageSquareText className="text-labbaik-blue" /> قوالب واتساب وقوائم الإرسال</h1><p className="text-sm text-neutral-500 mt-2">اختر رقم الإرسال أولًا؛ رقم المنظمة يستطيع الإرسال لكل الفروع مع حذف الأرقام المكررة تلقائيًا.</p></div><Button variant="primary" size="md" onClick={sync} disabled={syncing}>{syncing ? <Loader2 className="animate-spin" size={17} /> : <RefreshCw size={17} />} مزامنة Meta</Button></div>

    <Card variant="labbaik" className="space-y-4"><div className="font-black">رقم/اتصال الإرسال</div><div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">{connections.map((item) => <button key={item.id} onClick={() => setConnectionId(item.id)} className={`rounded-2xl border p-4 text-right ${connectionId === item.id ? 'border-labbaik-blue bg-labbaik-blue/10' : 'border-white/10 bg-white/5'}`}><div className="flex items-center gap-2 font-black">{item.scope === 'organization' ? <Network size={17} className="text-labbaik-blue" /> : <Building2 size={17} className="text-labbaik-blue" />}{item.scope === 'organization' ? 'رقم المنظمة' : branches.find((b) => b.id === item.storeId)?.name || 'رقم فرع'}</div><div dir="ltr" className="text-xs text-neutral-500 mt-2 text-right">{item.displayPhoneNumber || item.phoneNumberId}</div></button>)}</div></Card>

    {connection?.scope === 'organization' && <Card variant="labbaik" className="space-y-4"><div className="flex items-center justify-between"><div><div className="font-black">الفروع المستهدفة</div><p className="text-xs text-neutral-500 mt-1">يمكن إرسال نفس الحملة إلى عدة فروع من الرقم الموحد.</p></div><span className="text-xs font-black text-labbaik-blue">{selectedStoreIds.length}/{branches.length}</span></div><div className="flex flex-wrap gap-2">{branches.map((b) => <button key={b.id} onClick={() => toggleBranch(b.id)} className={`px-4 py-2 rounded-xl border text-xs font-black ${selectedStoreIds.includes(b.id) ? 'border-labbaik-blue bg-labbaik-blue/10 text-labbaik-blue' : 'border-white/10 text-neutral-500'}`}>{b.name}</button>)}</div></Card>}

    <div className="grid grid-cols-1 2xl:grid-cols-[1.15fr_.85fr] gap-7 items-start">
      <div className="space-y-5">
        <Card variant="labbaik" className="space-y-4"><div className="flex justify-between"><h2 className="font-black">1. اختر القالب</h2><span className="text-xs text-neutral-500">{templates.length} قالب</span></div><div className="relative"><Search size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-500" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث في القوالب..." className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pr-12 pl-5 text-sm" /></div><div className="space-y-3 max-h-[42vh] overflow-y-auto">{filteredTemplates.map((t) => <TemplateButton key={t.id} template={t} selected={selected?.id === t.id} onClick={() => choose(t)} />)}</div></Card>
        {mode === 'list' && <Card variant="labbaik" className="space-y-4"><div className="flex items-center justify-between"><div><h2 className="font-black">2. اختر الجمهور</h2><p className="text-xs text-neutral-500 mt-1">{customers.length} سجل عميل في الفروع المحددة.</p></div><div className="flex gap-2"><button onClick={selectVisible} className="text-xs font-black text-labbaik-blue">تحديد الظاهر</button><button onClick={clearVisible} className="text-xs font-black text-neutral-500">إلغاء الظاهر</button></div></div><input value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} placeholder="بحث بالاسم أو الرقم أو الفرع..." className="w-full bg-white/5 border border-white/10 rounded-2xl py-3.5 px-5 text-sm" /><AudienceFilters categories={categories} tags={tags} categoryFilter={categoryFilter} setCategoryFilter={setCategoryFilter} tagFilter={tagFilter} setTagFilter={setTagFilter} /><div className="max-h-[48vh] overflow-y-auto space-y-2">{filteredCustomers.map((c) => <CustomerRow key={c.id} customer={c} checked={selectedCustomers.includes(c.id)} onToggle={() => toggleCustomer(c.id)} />)}</div></Card>}
      </div>

      <Card variant="labbaik" className="space-y-6 2xl:sticky 2xl:top-0"><div className="flex rounded-2xl bg-white/5 border border-white/10 p-1"><button onClick={() => setMode('list')} className={`flex-1 py-3 rounded-xl text-xs font-black ${mode === 'list' ? 'bg-labbaik-blue text-white' : 'text-neutral-500'}`}><Users size={15} className="inline ml-1" />قائمة عملاء</button><button onClick={() => setMode('single')} className={`flex-1 py-3 rounded-xl text-xs font-black ${mode === 'single' ? 'bg-labbaik-blue text-white' : 'text-neutral-500'}`}><UserRoundCheck size={15} className="inline ml-1" />رقم واحد</button></div>
        {!selected ? <div className="py-20 text-center text-neutral-500"><MessageSquareText size={50} className="mx-auto mb-4 opacity-30" /><p className="font-black">اختر قالبًا أولاً</p></div> : <><div><h2 className="text-lg font-black" dir="ltr">{selected.name}</h2><p className="text-xs text-neutral-500 mt-1">{selected.language} • {selected.category} • {selected.status}</p></div><div className="rounded-2xl bg-green-950/30 border border-green-500/10 p-5 text-sm text-green-50 leading-7 whitespace-pre-wrap">{renderPreview(selected, bodyValues, headerValues)}</div>
        {mode === 'single' ? <><div className="space-y-2"><label className="text-xs font-black text-neutral-500">رقم المستلم</label><input dir="ltr" value={to} onChange={(e) => setTo(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-5 text-left" placeholder="9665XXXXXXXX" /></div>{connection?.scope === 'organization' && <div className="space-y-2"><label className="text-xs font-black text-neutral-500">الفرع الذي تُسجّل عليه المحادثة</label><select value={singleStoreId} onChange={(e) => setSingleStoreId(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-5">{branches.map((b) => <option className="bg-neutral-900" key={b.id} value={b.id}>{b.name}</option>)}</select></div>}</> : <div className="grid grid-cols-3 gap-2"><Stat label="السجلات" value={selectedCustomers.length} /><Stat label="المكرر" value={recipientStats.duplicates} /><Stat label="المستلمون" value={recipientStats.unique} /></div>}
        {headerValues.map((v, i) => <VariableInput key={`h${i}`} label={`HEADER {{${i + 1}}}`} value={v} onChange={(x: string) => setHeaderValues((c) => c.map((z, j) => j === i ? x : z))} />)}{bodyValues.map((v, i) => <VariableInput key={`b${i}`} label={`BODY {{${i + 1}}}`} value={v} onChange={(x: string) => setBodyValues((c) => c.map((z, j) => j === i ? x : z))} />)}{mode === 'list' && <p className="text-[11px] text-neutral-500">يدعم: <code>{'{{customer.fullName}}'}</code> <code>{'{{customer.phoneNumber}}'}</code> <code>{'{{customer.email}}'}</code> <code>{'{{customer.branchName}}'}</code></p>}<Button variant="primary" size="md" isFullWidth onClick={send} disabled={sending || String(selected.status).toUpperCase() !== 'APPROVED' || (mode === 'list' ? !selectedCustomers.length : !to.trim())}>{sending ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />} {mode === 'list' ? `إرسال إلى ${recipientStats.unique} رقم فعلي` : 'إرسال القالب'}</Button></>}
      </Card>
    </div>
  </div>;
}

function TemplateButton({ template, selected, onClick }: any) { const approved = String(template.status).toUpperCase() === 'APPROVED'; const body = template.components?.find((c: any) => String(c.type).toUpperCase() === 'BODY')?.text || ''; return <button onClick={onClick} className={`w-full text-right rounded-2xl border p-4 ${selected ? 'border-labbaik-blue bg-labbaik-blue/10' : 'border-white/10 bg-white/5'}`}><div className="flex justify-between gap-4"><div><div className="font-black" dir="ltr">{template.name}</div><p className="text-xs text-neutral-500 mt-2 line-clamp-2">{body}</p></div><span className={`text-[10px] font-black px-3 py-1.5 rounded-full border ${approved ? 'text-green-400 border-green-500/20' : 'text-amber-300 border-amber-500/20'}`}>{approved ? <CheckCircle2 size={12} className="inline ml-1" /> : <XCircle size={12} className="inline ml-1" />}{template.status}</span></div></button>; }
function AudienceFilters({ categories, tags, categoryFilter, setCategoryFilter, tagFilter, setTagFilter }: any) { const toggle = (list: string[], id: string) => list.includes(id) ? list.filter((x) => x !== id) : [...list, id]; return <div className="space-y-2"><div className="flex flex-wrap gap-2"><span className="text-[10px] text-neutral-500 flex items-center gap-1"><FolderOpen size={11} />فئة:</span>{categories.filter((x: any) => x.isActive).map((x: any) => <button key={x.id} onClick={() => setCategoryFilter(toggle(categoryFilter, x.id))} className={`text-[10px] px-2.5 py-1 rounded-lg border ${categoryFilter.includes(x.id) ? 'ring-1 ring-labbaik-blue' : 'opacity-65'}`} style={{ color: x.color, borderColor: `${x.color}55` }}>{x.name}</button>)}</div><div className="flex flex-wrap gap-2"><span className="text-[10px] text-neutral-500 flex items-center gap-1"><Tag size={11} />تاق:</span>{tags.filter((x: any) => x.isActive).map((x: any) => <button key={x.id} onClick={() => setTagFilter(toggle(tagFilter, x.id))} className={`text-[10px] px-2.5 py-1 rounded-lg border ${tagFilter.includes(x.id) ? 'ring-1 ring-labbaik-blue' : 'opacity-65'}`} style={{ color: x.color, borderColor: `${x.color}55` }}>{x.name}</button>)}</div></div>; }
function CustomerRow({ customer, checked, onToggle }: any) { return <button onClick={onToggle} className={`w-full text-right rounded-2xl border p-3.5 flex items-center gap-3 ${checked ? 'border-labbaik-blue bg-labbaik-blue/10' : 'border-white/10 bg-white/5'}`}><div className={`w-5 h-5 rounded-md border ${checked ? 'bg-labbaik-blue border-labbaik-blue' : 'border-white/20'}`}>{checked && <CheckCircle2 size={14} className="text-white" />}</div><div className="flex-1 min-w-0"><div className="font-black text-sm truncate">{customer.fullName || 'عميل بدون اسم'}</div><div dir="ltr" className="text-[11px] text-neutral-500 text-right">{customer.phoneNumber || customer.whatsappId}</div></div><span className="text-[10px] text-neutral-500">{customer.store?.name}</span></button>; }
function VariableInput({ label, value, onChange }: any) { return <div className="space-y-2"><label className="text-xs font-black text-neutral-500">{label}</label><input value={value} onChange={(e) => onChange(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-2xl py-3.5 px-5" /></div>; }
function Stat({ label, value }: any) { return <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-center"><div className="text-[10px] text-neutral-500">{label}</div><div className="text-xl font-black text-labbaik-blue mt-1">{value}</div></div>; }
function uniqueTaxonomy(items: Taxonomy[]) { const map = new Map<string, Taxonomy>(); items.forEach((i) => map.set(i.id, i)); return [...map.values()]; }
function dedupeStats(rows: Customer[]) { const normalized = rows.map((r) => String(r.phoneNumber || r.whatsappId || '').replace(/[^0-9]/g, '')).filter(Boolean); const unique = new Set(normalized).size; return { unique, duplicates: Math.max(0, normalized.length - unique) }; }
function placeholderCount(text?: string) { if (!text) return 0; const matches = [...text.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1])); return matches.length ? Math.max(...matches) : 0; }
function bodyPlaceholderCount(t: Template) { return placeholderCount(t.components?.find((c) => String(c.type).toUpperCase() === 'BODY')?.text); }
function headerPlaceholderCount(t: Template) { const h = t.components?.find((c) => String(c.type).toUpperCase() === 'HEADER'); return String(h?.format || 'TEXT').toUpperCase() === 'TEXT' ? placeholderCount(h?.text) : 0; }
function renderPreview(t: Template, body: string[], header: string[]) { const h = t.components?.find((c) => String(c.type).toUpperCase() === 'HEADER'); const b = t.components?.find((c) => String(c.type).toUpperCase() === 'BODY'); const f = t.components?.find((c) => String(c.type).toUpperCase() === 'FOOTER'); const fill = (text: string, values: string[]) => values.reduce((a, v, i) => a.split(`{{${i + 1}}}`).join(v || `{{${i + 1}}}`), text); return [h?.text ? fill(h.text, header) : '', b?.text ? fill(b.text, body) : t.name, f?.text || ''].filter(Boolean).join('\n\n'); }

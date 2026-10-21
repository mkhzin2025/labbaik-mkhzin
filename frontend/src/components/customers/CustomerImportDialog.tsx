import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { Building2, Check, CheckCircle2, Download, FileSpreadsheet, Loader2, Plus, Tag, UploadCloud, X } from 'lucide-react';
import api from '../../api/client';
import type { Branch } from './BranchSelector';

type TaxonomyTag = { id: string; name: string; color: string; isActive: boolean };
type ImportRow = { phoneNumber: string; fullName?: string; email?: string; notes?: string };
type ImportResult = { total: number; created: number; updated: number; skipped: number };

interface Props {
  branches: Branch[];
  initialStoreId?: string;
  onClose: () => void;
  onImported: (result: ImportResult) => void;
}

const IMPORT_BATCH_SIZE = 500;
const TEMPLATE_HEADERS = ['الاسم', 'رقم الجوال', 'البريد الإلكتروني', 'ملاحظات'];
const HEADER_ALIASES: Record<string, keyof ImportRow> = {
  'الاسم': 'fullName', name: 'fullName', fullname: 'fullName',
  'رقم الجوال': 'phoneNumber', 'رقم الهاتف': 'phoneNumber', phone: 'phoneNumber', phonenumber: 'phoneNumber', mobile: 'phoneNumber',
  'البريد الإلكتروني': 'email', 'البريد الالكتروني': 'email', email: 'email',
  'ملاحظات': 'notes', notes: 'notes', note: 'notes',
};

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let quoted = false;
  const input = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (char === '"') {
      if (quoted && input[i + 1] === '"') { value += '"'; i += 1; }
      else quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(value.trim()); value = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && input[i + 1] === '\n') i += 1;
      row.push(value.trim());
      if (row.some(Boolean)) rows.push(row);
      row = []; value = '';
    } else value += char;
  }
  row.push(value.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function rowsFromCsv(text: string): { rows: ImportRow[]; error?: string } {
  const parsed = parseCsv(text);
  if (parsed.length < 2) return { rows: [], error: 'الملف لا يحتوي على بيانات. أضف صفًا واحدًا على الأقل تحت العناوين.' };
  const mapping = parsed[0].map((header) => HEADER_ALIASES[header.trim().toLowerCase()]);
  const phoneIndex = mapping.indexOf('phoneNumber');
  if (phoneIndex < 0) return { rows: [], error: 'لم يتم العثور على عمود «رقم الجوال». استخدم القالب الجاهز لتفادي أخطاء التنسيق.' };
  const rows = parsed.slice(1).filter((columns) => columns.some(Boolean)).map((columns) => {
    const item: ImportRow = { phoneNumber: columns[phoneIndex]?.trim() || '' };
    mapping.forEach((key, index) => { if (key && columns[index]?.trim()) item[key] = columns[index].trim(); });
    return item;
  });
  const missing = rows.filter((row) => !row.phoneNumber).length;
  if (missing) return { rows: [], error: `يوجد ${missing.toLocaleString('en')} صف بدون رقم جوال. أكمل الأرقام أو احذف هذه الصفوف.` };
  return { rows };
}

export default function CustomerImportDialog({ branches, initialStoreId, onClose, onImported }: Props) {
  const [storeId, setStoreId] = useState(initialStoreId || branches[0]?.id || '');
  const [tags, setTags] = useState<TaxonomyTag[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');
  const [tagBusy, setTagBusy] = useState(false);
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [fileError, setFileError] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [progress, setProgress] = useState(0);
  const [processedRows, setProcessedRows] = useState(0);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose();
      if (event.key !== 'Tab') return;
      const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex="0"]') || [])];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  useEffect(() => {
    setSelectedTags([]);
    void api.get('/customers/taxonomy', { params: { storeId } })
      .then(({ data }) => setTags((data?.tags || []).filter((tag: TaxonomyTag) => tag.isActive)))
      .catch(() => setTags([]));
  }, [storeId]);

  const selectedNames = useMemo(() => tags.filter((tag) => selectedTags.includes(tag.id)).map((tag) => tag.name), [tags, selectedTags]);

  const downloadTemplate = () => {
    const example = ['سارة محمد', '0501234567', 'sara@example.com', 'عميلة مهتمة بالعروض'];
    const csv = `\uFEFF${TEMPLATE_HEADERS.join(',')}\r\n${example.join(',')}\r\n`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'نموذج-استيراد-العملاء.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const readFile = async (file?: File) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setRows([]); setFileName(file.name); setFileError('صيغة الملف غير مدعومة. ارفع ملف CSV بعد تعبئة القالب.'); return;
    }
    const result = rowsFromCsv(await file.text());
    setFileName(file.name);
    setRows(result.rows);
    setFileError(result.error || '');
  };

  const createTag = async () => {
    const name = newTag.trim();
    if (!name || !storeId) return;
    setTagBusy(true);
    try {
      const { data } = await api.post('/customers/tags', { scope: 'store', storeId, name });
      setTags((current) => [...current, data]);
      setSelectedTags((current) => [...current, data.id]);
      setNewTag('');
    } finally { setTagBusy(false); }
  };

  const submit = async () => {
    if (!storeId || !rows.length || fileError) return;
    setBusy(true);
    setProgress(0);
    setProcessedRows(0);
    const summary = { total: 0, created: 0, updated: 0, skipped: 0 };
    try {
      for (let offset = 0; offset < rows.length; offset += IMPORT_BATCH_SIZE) {
        const batch = rows.slice(offset, offset + IMPORT_BATCH_SIZE);
        const { data } = await api.post('/customers/import', { storeId, rows: batch, tagIds: selectedTags }, {
          onUploadProgress: (event) => {
            const uploaded = event.total ? Math.min(0.9, event.loaded / event.total) : 0;
            setProgress(Math.round(((offset + batch.length * uploaded) / rows.length) * 100));
          },
        });
        summary.total += Number(data.total || 0);
        summary.created += Number(data.created || 0);
        summary.updated += Number(data.updated || 0);
        summary.skipped += Number(data.skipped || 0);
        const completed = offset + batch.length;
        setProcessedRows(completed);
        setProgress(Math.round((completed / rows.length) * 100));
      }
      setProgress(100);
      setResult(summary);
      onImported(summary);
    } catch (error) {
      setFileError((error as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message?.toString() || 'تعذر استيراد الأرقام. راجع الملف وحاول مرة أخرى.');
    } finally { setBusy(false); }
  };

  const drop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault(); setDragging(false); void readFile(event.dataTransfer.files[0]);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-neutral-950/55 p-3 sm:p-6" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="customer-import-title" className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-2xl bg-labbaik-surface shadow-[0_24px_70px_-24px_rgba(15,10,30,0.55)]">
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-labbaik-border bg-labbaik-surface px-5 py-4 sm:px-6">
          <div>
            <h2 ref={titleRef} tabIndex={-1} id="customer-import-title" className="text-xl font-black text-neutral-900 outline-none dark:text-white">استيراد أرقام العملاء</h2>
            <p className="mt-1 text-sm text-labbaik-text-muted">استورد ملفك كاملًا وحدد فرع العملاء وتاقاتهم.</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="إغلاق" className="grid size-9 shrink-0 place-items-center rounded-lg text-labbaik-text-muted transition-colors hover:bg-labbaik-page hover:text-neutral-900 focus:outline-none focus:ring-2 focus:ring-labbaik-blue/30 disabled:opacity-40 dark:hover:text-white"><X size={19} /></button>
        </header>

        {result ? (
          <div className="p-5 sm:p-6" aria-live="polite">
            <div className="flex flex-col items-center text-center">
              <span className="grid size-14 place-items-center rounded-2xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                <CheckCircle2 size={30} strokeWidth={2.25} />
              </span>
              <h3 className="mt-4 text-xl font-black text-neutral-900 dark:text-white">اكتملت عملية الاستيراد</h3>
              <p className="mt-1 max-w-md text-sm leading-6 text-labbaik-text-muted">
                تمت معالجة أرقام العملاء وربطها بفرع <b className="text-neutral-800 dark:text-neutral-100">{branches.find((branch) => branch.id === storeId)?.name}</b> بنجاح.
              </p>
            </div>

            <dl className="mt-6 divide-y divide-labbaik-border overflow-hidden rounded-xl bg-labbaik-page px-4 sm:px-5">
              <div className="flex items-center justify-between gap-4 py-3.5">
                <dt className="text-sm font-bold text-labbaik-text-muted">إجمالي الصفوف المعالجة</dt>
                <dd className="tabular-nums text-lg font-black text-neutral-900 dark:text-white">{result.total.toLocaleString('en')}</dd>
              </div>
              <div className="flex items-center justify-between gap-4 py-3.5">
                <dt className="text-sm font-bold text-labbaik-text-muted">عملاء جدد</dt>
                <dd className="tabular-nums text-lg font-black text-emerald-700 dark:text-emerald-300">{result.created.toLocaleString('en')}</dd>
              </div>
              <div className="flex items-center justify-between gap-4 py-3.5">
                <dt className="text-sm font-bold text-labbaik-text-muted">عملاء تم تحديثهم</dt>
                <dd className="tabular-nums text-lg font-black text-labbaik-blue">{result.updated.toLocaleString('en')}</dd>
              </div>
              <div className="flex items-center justify-between gap-4 py-3.5">
                <dt className="text-sm font-bold text-labbaik-text-muted">صفوف تم تجاوزها</dt>
                <dd className="tabular-nums text-lg font-black text-neutral-700 dark:text-neutral-200">{result.skipped.toLocaleString('en')}</dd>
              </div>
            </dl>
          </div>
        ) : <div className="space-y-6 p-5 sm:p-6">
          <div className="flex flex-col gap-3 rounded-xl bg-labbaik-page p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-labbaik-blue/10 text-labbaik-blue"><FileSpreadsheet size={21} /></span>
              <div><p className="text-sm font-black text-neutral-900 dark:text-white">ابدأ بالقالب الجاهز</p><p className="mt-0.5 text-xs leading-5 text-labbaik-text-muted">لا تغيّر أسماء الأعمدة، واحفظ الملف بصيغة CSV.</p></div>
            </div>
            <button type="button" onClick={downloadTemplate} className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-labbaik-blue/25 bg-labbaik-surface px-4 text-sm font-black text-labbaik-blue transition-colors hover:border-labbaik-blue hover:bg-labbaik-blue/5 focus:outline-none focus:ring-2 focus:ring-labbaik-blue/30"><Download size={16} /> تحميل النموذج</button>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <label className="space-y-2"><span className="flex items-center gap-2 text-sm font-black text-neutral-900 dark:text-white"><Building2 size={16} className="text-labbaik-blue" /> الفرع <b className="text-red-500">*</b></span><select value={storeId} disabled={busy} onChange={(e) => setStoreId(e.target.value)} className="h-11 w-full rounded-lg border border-labbaik-border bg-labbaik-page px-3 text-sm font-bold text-neutral-900 outline-none focus:border-labbaik-blue focus:ring-2 focus:ring-labbaik-blue/20 disabled:opacity-50 dark:text-white">{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
            <div className="space-y-2"><span className="flex items-center gap-2 text-sm font-black text-neutral-900 dark:text-white"><Tag size={16} className="text-labbaik-blue" /> التاقات <span className="font-medium text-labbaik-text-muted">(اختياري)</span></span><div className="flex gap-2"><input value={newTag} onChange={(e) => setNewTag(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void createTag(); } }} placeholder="اكتب اسم تاق جديد" className="h-11 min-w-0 flex-1 rounded-lg border border-labbaik-border bg-labbaik-page px-3 text-sm text-neutral-900 outline-none placeholder:text-labbaik-text-muted focus:border-labbaik-blue focus:ring-2 focus:ring-labbaik-blue/20 dark:text-white" /><button type="button" onClick={() => void createTag()} disabled={!newTag.trim() || tagBusy} aria-label="إضافة التاق" className="grid size-11 shrink-0 place-items-center rounded-lg bg-labbaik-blue text-white transition-colors hover:bg-labbaik-blue/90 focus:outline-none focus:ring-2 focus:ring-labbaik-blue/30 disabled:opacity-40">{tagBusy ? <Loader2 size={17} className="animate-spin" /> : <Plus size={18} />}</button></div></div>
          </div>

          {tags.length > 0 && <div className="flex flex-wrap gap-2" aria-label="اختيار التاقات">{tags.map((tag) => { const active = selectedTags.includes(tag.id); return <button key={tag.id} type="button" disabled={busy} aria-pressed={active} onClick={() => setSelectedTags((current) => active ? current.filter((id) => id !== tag.id) : [...current, tag.id])} className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-black transition-colors focus:outline-none focus:ring-2 focus:ring-labbaik-blue/30 disabled:opacity-50 ${active ? 'bg-labbaik-blue text-white' : 'bg-labbaik-page text-labbaik-text-muted hover:text-labbaik-blue'}`}>{active && <Check size={13} />}{tag.name}</button>; })}</div>}

          <div onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={drop} className={`rounded-xl border border-dashed p-6 text-center transition-colors ${fileError ? 'border-red-400 bg-red-50/60 dark:bg-red-950/15' : dragging ? 'border-labbaik-blue bg-labbaik-blue/5' : rows.length ? 'border-emerald-400 bg-emerald-50/60 dark:bg-emerald-950/15' : 'border-labbaik-border bg-labbaik-page'}`}>
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="sr-only" onChange={(e: ChangeEvent<HTMLInputElement>) => void readFile(e.target.files?.[0])} />
            <UploadCloud size={28} className={`mx-auto ${rows.length ? 'text-emerald-600' : 'text-labbaik-blue'}`} />
            <p className="mt-2 text-sm font-black text-neutral-900 dark:text-white">{rows.length ? `تم تجهيز ${rows.length.toLocaleString('en')} رقم للاستيراد` : 'اسحب ملف CSV هنا أو اختره من جهازك'}</p>
            {fileName && <p className="mt-1 truncate text-xs text-labbaik-text-muted" dir="ltr">{fileName}</p>}
            {fileError && <p role="alert" className="mx-auto mt-2 max-w-lg text-xs font-bold leading-5 text-red-600 dark:text-red-400">{fileError}</p>}
            <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} className="mt-3 h-9 rounded-lg border border-labbaik-border bg-labbaik-surface px-4 text-xs font-black text-neutral-800 transition-colors hover:border-labbaik-blue/40 hover:text-labbaik-blue focus:outline-none focus:ring-2 focus:ring-labbaik-blue/30 disabled:opacity-50 dark:text-neutral-100">{rows.length ? 'اختيار ملف آخر' : 'اختيار الملف'}</button>
          </div>

          {busy && (
            <div className="space-y-3 rounded-xl bg-labbaik-blue/5 p-4" role="status" aria-live="polite">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2"><Loader2 size={17} className="animate-spin text-labbaik-blue" /><span className="text-sm font-black text-neutral-900 dark:text-white">جاري رفع ومعالجة الأرقام</span></div>
                <b className="tabular-nums text-sm text-labbaik-blue">{progress}%</b>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-labbaik-blue/10" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-label="تقدم الاستيراد">
                <div className="h-full rounded-full bg-labbaik-blue transition-[width] duration-300 ease-out" style={{ width: `${progress}%` }} />
              </div>
              <p className="text-xs text-labbaik-text-muted"><span className="tabular-nums font-bold text-neutral-700 dark:text-neutral-200">{processedRows.toLocaleString('en')}</span> من <span className="tabular-nums font-bold text-neutral-700 dark:text-neutral-200">{rows.length.toLocaleString('en')}</span> رقم تمت معالجتها</p>
            </div>
          )}

          {rows.length > 0 && <p className="text-xs leading-5 text-labbaik-text-muted">سيتم ربط الأرقام بفرع <b className="text-neutral-800 dark:text-neutral-100">{branches.find((branch) => branch.id === storeId)?.name}</b>{selectedNames.length ? <> وإضافة التاقات: <b className="text-neutral-800 dark:text-neutral-100">{selectedNames.join('، ')}</b></> : null}. الرقم الموجود مسبقًا سيُحدّث ولن يتكرر.</p>}
        </div>}

        <footer className="sticky bottom-0 flex flex-col-reverse gap-2 border-t border-labbaik-border bg-labbaik-surface px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
          {result ? (
            <button type="button" onClick={onClose} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-labbaik-blue px-6 text-sm font-black text-white transition-colors hover:bg-labbaik-blue/90 focus:outline-none focus:ring-2 focus:ring-labbaik-blue/30"><Check size={17} /> عرض قائمة العملاء</button>
          ) : (
            <><button type="button" onClick={onClose} disabled={busy} className="h-10 rounded-lg border border-labbaik-border px-5 text-sm font-black text-neutral-700 transition-colors hover:bg-labbaik-page focus:outline-none focus:ring-2 focus:ring-labbaik-blue/30 disabled:opacity-40 dark:text-neutral-200">إلغاء</button><button type="button" onClick={() => void submit()} disabled={!storeId || !rows.length || Boolean(fileError) || busy} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-labbaik-blue px-5 text-sm font-black text-white transition-colors hover:bg-labbaik-blue/90 focus:outline-none focus:ring-2 focus:ring-labbaik-blue/30 disabled:opacity-40">{busy ? <Loader2 size={17} className="animate-spin" /> : <UploadCloud size={17} />}{busy ? 'جاري الاستيراد...' : `استيراد ${rows.length ? rows.length.toLocaleString('en') : ''} رقم`}</button></>
          )}
        </footer>
      </section>
    </div>
  );
}

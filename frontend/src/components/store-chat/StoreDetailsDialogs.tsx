import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { CalendarClock, ExternalLink, MapPin, Package, Phone, Undo2, X } from 'lucide-react';
import { formatNumber } from '@/lib/utils';
import {
  CHECKING_LABELS,
  fulfillmentStage,
  PICKING_LABELS,
  RETURN_STATUS_CLS,
  REVIEW_LABELS,
  scheduleInfo,
  SHIPMENT_STATUS,
} from '../../lib/store-chat';
import type { StoreReturn, StoreShipment } from '../../lib/store-chat';

const chip = 'inline-flex items-center h-6 px-2 rounded-md text-xs font-bold whitespace-nowrap';
const muted = 'bg-labbaik-page text-labbaik-text-muted';

const dateTime = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : format(date, 'EEEE d MMMM yyyy · HH:mm', { locale: ar });
};

const money = (value: number) => `${formatNumber(Number(value || 0).toFixed(2))} ر.س`;

const weightLabel = (grams?: number) => {
  if (!grams) return null;
  return grams >= 1000 ? `${formatNumber((grams / 1000).toFixed(2))} كجم` : `${formatNumber(grams)} جرام`;
};

/** Centered dialog in the platform's style, rendered on <body> so the side drawer cannot clip it. */
function Dialog({ title, icon, onClose, children }: { title: ReactNode; icon: ReactNode; onClose: () => void; children: ReactNode }) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center bg-black/50 sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-lg max-h-[92vh] flex flex-col rounded-t-2xl sm:rounded-2xl border border-labbaik-border bg-labbaik-surface shadow-[0_24px_48px_-16px_rgba(15,10,30,0.45)] animate-slide-up"
      >
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-labbaik-border">
          <h2 className="flex items-center gap-2 text-base font-black text-neutral-900 dark:text-white min-w-0">
            <span className="shrink-0 text-labbaik-blue dark:text-purple-300">{icon}</span>
            <span className="truncate">{title}</span>
          </h2>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="إغلاق" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-labbaik-text-muted hover:text-labbaik-blue hover:bg-labbaik-blue/10 cursor-pointer">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-5 space-y-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-black text-labbaik-text-muted">{title}</h3>
      <div className="rounded-xl border border-labbaik-border divide-y divide-labbaik-border">{children}</div>
    </section>
  );
}

/** One label/value line; hidden when there is no value. */
function Row({ label, value, ltr = false }: { label: string; value: ReactNode; ltr?: boolean }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="flex items-start justify-between gap-4 px-3.5 py-2.5 text-sm">
      <span className="shrink-0 font-bold text-labbaik-text-muted">{label}</span>
      <span className="min-w-0 text-left font-bold text-neutral-900 dark:text-white break-words" dir={ltr ? 'ltr' : undefined}>{value}</span>
    </div>
  );
}

const Progress = ({ done, total }: { done: number; total: number }) => {
  const percent = total ? Math.min(100, Math.round((done / total) * 100)) : 0;
  return (
    <div className="flex items-center gap-2 min-w-32">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-labbaik-page">
        <div className="h-full rounded-full bg-labbaik-blue" style={{ width: `${percent}%` }} />
      </div>
      <span className="text-xs tabular-nums" dir="ltr">{formatNumber(done)} / {formatNumber(total)}</span>
    </div>
  );
};

export function ShipmentDetailsDialog({ shipment: s, onClose }: { shipment: StoreShipment; onClose: () => void }) {
  const status = SHIPMENT_STATUS[s.status] || { label: s.status, cls: muted };
  const stage = fulfillmentStage(s.fulfillment);
  const f = s.fulfillment;
  const address = [s.address?.city, s.address?.district, s.address?.street].filter(Boolean).join('، ');
  const schedule = scheduleInfo(s);

  return (
    <Dialog title={<span dir="ltr">{s.orderNumber || 'تفاصيل الطلب'}</span>} icon={<Package size={18} />} onClose={onClose}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`${chip} ${status.cls}`}>{status.label}</span>
        <span className={`${chip} ${stage.cls}`}>{stage.label}</span>
        {schedule && <span className={`${chip} gap-1 bg-labbaik-blue/12 text-labbaik-blue dark:text-purple-200`}><CalendarClock size={13} /> طلب مجدول</span>}
      </div>

      {schedule && (
        <div className="rounded-xl border border-labbaik-blue/30 bg-labbaik-blue/8 p-4 flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-labbaik-blue text-labbaik-on-accent"><CalendarClock size={20} /></span>
          <div className="min-w-0 space-y-0.5">
            <p className="text-xs font-black text-labbaik-blue dark:text-purple-300">موعد التوصيل المجدول</p>
            {schedule.timeRange && <p className="text-lg font-black text-neutral-900 dark:text-white tabular-nums">{schedule.timeRange}</p>}
            {schedule.fullDate && (
              <p className="text-sm font-bold text-neutral-800 dark:text-neutral-100">
                {schedule.relative && !schedule.relative.includes(' ') ? `${schedule.relative} · ` : ''}{schedule.fullDate}
              </p>
            )}
            {schedule.label && schedule.label !== schedule.timeRange && <p className="text-xs font-bold text-labbaik-text-muted">الفترة: {schedule.label}</p>}
            {!schedule.timeRange && !schedule.fullDate && <p className="text-sm font-bold text-labbaik-text-muted">لم يُسجَّل وقت الجدولة لهذا الطلب.</p>}
            {schedule.isPast && s.status !== 'DELIVERED' && s.status !== 'CANCELLED' && (
              <p className="text-xs font-black text-red-700 dark:text-red-300">تجاوز الطلب موعده المجدول</p>
            )}
          </div>
        </div>
      )}

      <Section title="الطلب">
        <Row label="رقم الطلب" value={s.orderNumber} ltr />
        <Row label="تاريخ الإنشاء" value={dateTime(s.createdAt)} />
        <Row label="عدد القطع" value={s.itemsCount ? formatNumber(s.itemsCount) : null} />
        <Row label="الوزن" value={weightLabel(s.weight)} />
      </Section>

      <Section title="الشحن">
        <Row label="طريقة التوصيل" value={s.deliveryMethodAr || s.deliveryMethod} />
        <Row label={s.deliveryMethod === 'EXTERNAL' ? 'شركة الشحن' : 'المندوب'} value={s.assigneeName} />
        <Row
          label="جوال المندوب"
          value={s.assigneePhone ? (
            <a href={`tel:${s.assigneePhone}`} dir="ltr" className="inline-flex items-center gap-1 text-labbaik-blue dark:text-purple-300 hover:underline tabular-nums">
              <Phone size={13} /> {s.assigneePhone}
            </a>
          ) : null}
        />
        <Row label="المسافة" value={s.distanceKm != null ? `${formatNumber(Number(s.distanceKm).toFixed(1))} كم` : null} />
        <Row
          label="العنوان"
          value={address ? <span className="inline-flex items-start gap-1"><MapPin size={14} className="mt-0.5 shrink-0 text-labbaik-text-muted" />{address}</span> : null}
        />
      </Section>

      <Section title="العميل">
        <Row label="الاسم" value={s.customerFirstName} />
        <Row label="الجوال" value={s.customerPhone} ltr />
        <Row label="طلباته المسلّمة" value={s.customerDeliveredOrdersCount != null ? formatNumber(s.customerDeliveredOrdersCount) : null} />
      </Section>

      <Section title="التجهيز والتشييك">
        {!f ? (
          <p className="px-3.5 py-3 text-sm font-bold text-labbaik-text-muted">لم يبدأ تجهيز هذا الطلب بعد.</p>
        ) : (
          <>
            <Row label="التجهيز" value={PICKING_LABELS[f.pickingStatus] || f.pickingStatus} />
            <Row label="تقدّم التجهيز" value={f.unitsRequired ? <Progress done={f.unitsPicked ?? 0} total={f.unitsRequired} /> : null} />
            <Row label="المجهّز" value={f.pickerName} />
            <Row label="التشييك" value={CHECKING_LABELS[f.checkingStatus] || f.checkingStatus} />
            <Row label="المشيّك" value={f.checkerName} />
            <Row label="مراجعة النواقص" value={REVIEW_LABELS[f.reviewStatus] || f.reviewStatus} />
            <Row label="جاهز للشحن" value={f.isReadyForDispatch ? 'نعم' : 'لا'} />
            <Row label="عدد الأصناف" value={f.itemsCount ? formatNumber(f.itemsCount) : null} />
            <Row label="وحدات ناقصة" value={f.shortageUnits ? formatNumber(f.shortageUnits) : null} />
            <Row label="أخطاء التشييك" value={f.mismatchCount ? formatNumber(f.mismatchCount) : null} />
            <Row label="أصناف بديلة" value={f.activeSubstitutions ? formatNumber(f.activeSubstitutions) : null} />
            <Row label="مرتجعات نواقص" value={f.shortageReturns ? formatNumber(f.shortageReturns) : null} />
          </>
        )}
      </Section>
    </Dialog>
  );
}

export function ReturnDetailsDialog({ item: r, onClose, onPreview }: { item: StoreReturn; onClose: () => void; onPreview: (url: string) => void }) {
  return (
    <Dialog title={<>مرتجع <span dir="ltr">{r.orderNumber || ''}</span></>} icon={<Undo2 size={18} />} onClose={onClose}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`${chip} ${RETURN_STATUS_CLS[r.status] || muted}`}>{r.statusAr}</span>
        <span className={`${chip} ${muted}`}>{r.sourceAr}</span>
        {r.reasonAr && <span className={`${chip} ${muted}`}>{r.reasonAr}</span>}
        {r.deliveryReceived && <span className={`${chip} bg-emerald-500/15 text-emerald-800 dark:text-emerald-300`}>استلمه المندوب</span>}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {[
          ['الإجمالي', money(r.totalAmount)],
          ['الأصناف', formatNumber(r.itemsCount)],
          ['القطع', formatNumber(r.totalQuantity)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl bg-labbaik-page p-3">
            <p className="text-[11px] font-bold text-labbaik-text-muted">{label}</p>
            <p className="text-base font-black text-neutral-900 dark:text-white tabular-nums">{value}</p>
          </div>
        ))}
      </div>

      <Section title="المرتجع">
        <Row label="رقم الطلب" value={r.orderNumber} ltr />
        <Row label="تاريخ الطلب" value={dateTime(r.requestedAt)} />
        {r.createdAt && r.createdAt !== r.requestedAt && <Row label="تاريخ الإنشاء" value={dateTime(r.createdAt)} />}
        <Row label="المصدر" value={r.sourceAr} />
        <Row label="السبب" value={r.reasonAr} />
        <Row label="استلام المندوب" value={r.deliveryReceived ? 'تم الاستلام' : 'لم يُستلم بعد'} />
      </Section>

      {(r.notes || r.reviewNotes) && (
        <Section title="الملاحظات">
          {r.notes && (
            <div className="px-3.5 py-2.5 space-y-0.5">
              <p className="text-xs font-bold text-labbaik-text-muted">ملاحظة العميل</p>
              <p className="text-sm font-medium text-neutral-900 dark:text-white whitespace-pre-wrap" dir="auto">{r.notes}</p>
            </div>
          )}
          {r.reviewNotes && (
            <div className="px-3.5 py-2.5 space-y-0.5">
              <p className="text-xs font-bold text-labbaik-text-muted">ملاحظة المراجعة</p>
              <p className="text-sm font-medium text-neutral-900 dark:text-white whitespace-pre-wrap" dir="auto">{r.reviewNotes}</p>
            </div>
          )}
        </Section>
      )}

      <Section title={`الأصناف (${formatNumber(r.items.length)})`}>
        {r.items.length === 0 ? (
          <p className="px-3.5 py-3 text-sm font-bold text-labbaik-text-muted">لا توجد أصناف.</p>
        ) : (
          r.items.map((item, i) => (
            <div key={`${item.sku}-${i}`} className="flex items-start justify-between gap-3 px-3.5 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-bold text-neutral-900 dark:text-white">{item.productName}</p>
                {item.sku && <p className="text-[11px] font-bold text-labbaik-text-muted" dir="ltr" style={{ textAlign: 'right' }}>{item.sku}</p>}
              </div>
              <div className="shrink-0 text-left">
                <p className="text-sm font-black text-neutral-900 dark:text-white tabular-nums">{money(item.total)}</p>
                <p className="text-[11px] font-bold text-labbaik-text-muted tabular-nums">الكمية {formatNumber(item.quantity)}</p>
              </div>
            </div>
          ))
        )}
        {r.items.length > 0 && (
          <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 bg-labbaik-page/60">
            <span className="text-sm font-black text-neutral-900 dark:text-white">الإجمالي</span>
            <span className="text-sm font-black text-neutral-900 dark:text-white tabular-nums">{money(r.totalAmount)}</span>
          </div>
        )}
      </Section>

      {r.attachments.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs font-black text-labbaik-text-muted">الصور المرفقة</h3>
          <div className="flex flex-wrap gap-2">
            {r.attachments.map((url) => (
              <div key={url} className="relative">
                <button type="button" onClick={() => onPreview(url)} className="h-28 w-28 overflow-hidden rounded-xl border border-labbaik-border cursor-zoom-in" aria-label="تكبير صورة المرتجع">
                  <img src={url} alt="صورة المرتجع" loading="lazy" className="h-full w-full object-cover" />
                </button>
                <a href={url} target="_blank" rel="noreferrer" className="absolute bottom-1.5 left-1.5 grid h-7 w-7 place-items-center rounded-lg bg-black/55 text-white hover:bg-black/70" aria-label="فتح الصورة في نافذة جديدة" title="فتح">
                  <ExternalLink size={13} />
                </a>
              </div>
            ))}
          </div>
        </section>
      )}
    </Dialog>
  );
}

/** Meta's delivery errors in plain Arabic; variants of the same error (trace ids, codes) fold into one reason. */
const ERROR_REASONS: { match: RegExp; label: string }[] = [
  { match: /healthy ecosystem|131049/i, label: 'حدّ Meta لعدد الرسائل التسويقية التي يستقبلها الشخص' },
  { match: /undeliverable|131026/i, label: 'تعذّر التسليم: الرقم غير مسجّل في واتساب أو غير متاح' },
  { match: /experiment|130472/i, label: 'الرقم ضمن تجربة Meta لتقليل الرسائل التسويقية' },
  { match: /stop receiving marketing|131050/i, label: 'العميل أوقف استقبال الرسائل التسويقية' },
  { match: /payment|unsettled|131042/i, label: 'مستحقات حساب واتساب غير مسدّدة' },
  { match: /re-engagement|24 hours|131047/i, label: 'انتهت نافذة الـ24 ساعة' },
  { match: /131009|تنسيق رقم الهاتف|phone number format/i, label: 'رقم الهاتف بصيغة غير صحيحة' },
  { match: /something went wrong|131000/i, label: 'خطأ عام من Meta' },
];

/** Drops the per-request parts (Meta's trace id) so repeats of one unknown error still group together. */
const stripTrace = (error: string) => error.replace(/\s*\[fbtrace_id:[^\]]*\]?/gi, '').trim();

export const errorReason = (error: string) => ERROR_REASONS.find((r) => r.match.test(error))?.label || stripTrace(error) || 'سبب غير محدد';

export function groupErrors(errors: { error: string; count: number }[]) {
  const map = new Map<string, number>();
  for (const e of errors) {
    const reason = errorReason(e.error);
    map.set(reason, (map.get(reason) || 0) + e.count);
  }
  return [...map.entries()].map(([error, count]) => ({ error, count })).sort((a, b) => b.count - a.count);
}

/**
 * Failures whose customers can be marked from the campaign page, so later campaigns leave them out:
 * - undeliverable: the number is not on WhatsApp (or unreachable for long), tagged;
 * - bad_number: a number Meta refuses as malformed, tagged so it can be found and fixed;
 * - opted_out: the customer stopped marketing messages in WhatsApp, marked as opted out of marketing.
 */
export type FailureKind = 'undeliverable' | 'bad_number' | 'opted_out';

/** The same failures as SQL on whatsapp_campaign_recipients (alias r). */
export const FAILURE_KIND_SQL: Record<FailureKind, string> = {
  undeliverable: `(r.error ILIKE '%undeliverable%' OR r.error ILIKE '%131026%')`,
  bad_number: `(r.error ILIKE '%تنسيق رقم الهاتف%' OR r.error ILIKE '%phone number format%')`,
  opted_out: `(r.error ILIKE '%stop receiving marketing%' OR r.error ILIKE '%131050%')`,
};

/** Meta's delivery errors in plain Arabic; variants of the same error (trace ids, codes) fold into one reason. */
const ERROR_REASONS: { match: RegExp; label: string; kind?: FailureKind }[] = [
  { match: /healthy ecosystem|131049/i, label: 'حدّ Meta لعدد الرسائل التسويقية التي يستقبلها الشخص' },
  { match: /undeliverable|131026/i, label: 'تعذّر التسليم: الرقم غير مسجّل في واتساب أو غير متاح', kind: 'undeliverable' },
  { match: /experiment|130472/i, label: 'الرقم ضمن تجربة Meta لتقليل الرسائل التسويقية' },
  { match: /stop receiving marketing|131050/i, label: 'العميل أوقف استقبال الرسائل التسويقية', kind: 'opted_out' },
  { match: /payment|unsettled|131042/i, label: 'مستحقات حساب واتساب غير مسدّدة' },
  { match: /re-engagement|24 hours|131047/i, label: 'انتهت نافذة الـ24 ساعة' },
  { match: /تنسيق رقم الهاتف|phone number format/i, label: 'رقم الهاتف بصيغة غير صحيحة', kind: 'bad_number' },
  { match: /something went wrong|131000/i, label: 'خطأ عام من Meta' },
];

/** Drops the per-request parts (Meta's trace id) so repeats of one unknown error still group together. */
const stripTrace = (error: string) => error.replace(/\s*\[fbtrace_id:[^\]]*\]?/gi, '').trim();

const reasonOf = (error: string) => ERROR_REASONS.find((r) => r.match.test(error));
export const errorReason = (error: string) => reasonOf(error)?.label || stripTrace(error) || 'سبب غير محدد';

export function groupErrors(errors: { error: string; count: number }[]) {
  const map = new Map<string, { error: string; count: number; kind?: FailureKind }>();
  for (const e of errors) {
    const reason = reasonOf(e.error);
    const error = reason?.label || stripTrace(e.error) || 'سبب غير محدد';
    const entry = map.get(error) || { error, count: 0, ...(reason?.kind ? { kind: reason.kind } : {}) };
    entry.count += e.count;
    map.set(error, entry);
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

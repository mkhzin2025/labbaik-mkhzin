/**
 * Normalizes a phone number to the international digits-only format WhatsApp uses (e.g. 9665XXXXXXXX),
 * so local Saudi formats like 05XXXXXXXX, 5XXXXXXXX or 00966... map to the same conversation/customer.
 */
export function normalizePhoneNumber(value: string | null | undefined): string {
  let digits = String(value || '').replace(/[^0-9]/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('9660')) digits = `966${digits.slice(4)}`;
  if (digits.length === 10 && digits.startsWith('05')) return `966${digits.slice(1)}`;
  if (digits.length === 9 && digits.startsWith('5')) return `966${digits}`;
  return digits;
}

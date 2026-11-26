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

/** Arabic-Indic (٠-٩) and Persian (۰-۹) digits as ASCII, so a number typed on an Arabic keyboard still matches. */
const asciiDigits = (text: string) =>
  text.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0));

export type PhoneSearch = { exact: string } | { prefix: string } | { contains: string };

/**
 * How a search box entry matches stored numbers (international digits, 9665XXXXXXXX), or null when it is not a number:
 * - exact: a whole number in any format (05..., 5..., +966 5..., 00966..., spaces, dashes, Arabic digits);
 * - prefix: the start of a number (05 12 → 966512, +9665 → 9665);
 * - contains: any other digits, such as the last few of a number.
 * Exact and prefix lookups can use a phone index; only `contains` has to look through every number.
 */
export function phoneSearch(term: string | null | undefined): PhoneSearch | null {
  const search = asciiDigits(String(term || '').trim());
  if (!/^[+\d\s\-().]+$/.test(search)) return null;
  const digits = search.replace(/\D/g, '');
  if (digits.length < 3) return null;
  const full = normalizePhoneNumber(digits);
  const international = digits.startsWith('00') ? digits.slice(2) : digits;
  if (/^9665\d{8}$/.test(full) || (!international.startsWith('0') && international.length >= 11)) return { exact: full };
  if (/^0+5/.test(digits) && !digits.startsWith('00')) return { prefix: `966${digits.replace(/^0+/, '')}` };
  if (digits.startsWith('00')) return { prefix: international };
  if (digits.startsWith('9665') || search.startsWith('+')) return { prefix: digits };
  return { contains: digits };
}

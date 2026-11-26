import { normalizePhoneNumber } from '../../common/utils/phone.util';

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Arabic-Indic (٠-٩) and Persian (۰-۹) digits as ASCII, so a number typed on an Arabic keyboard still matches. */
const asciiDigits = (text: string) =>
  text.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0));

/**
 * The Mongo filter for an inbox search. Numbers are stored as international digits (9665XXXXXXXX), so:
 * - a whole number in any format (05..., +966 5..., 00966..., with spaces or dashes) matches exactly, from the phone index;
 * - the start of a number (05 12, 9665 12) matches as a prefix, also from the index;
 * - any other digits (the last few of a number) match anywhere in the phone;
 * - text matches the customer's name or the last message.
 */
export function inboxSearchClause(raw: string): Record<string, any> {
  const search = asciiDigits(raw.trim());
  if (/^[+\d\s\-().]+$/.test(search)) {
    const digits = search.replace(/\D/g, '');
    if (digits.length >= 3) {
      const full = normalizePhoneNumber(digits);
      if (/^9665\d{8}$/.test(full) || (!/^0/.test(digits) && digits.length >= 11)) return { customerPhone: full };
      if (/^0+5/.test(digits)) return { customerPhone: { $regex: `^966${digits.replace(/^0+/, '')}` } };
      if (/^00/.test(digits)) return { customerPhone: { $regex: `^${digits.replace(/^00/, '')}` } };
      if (/^9665/.test(digits) || search.startsWith('+')) return { customerPhone: { $regex: `^${digits}` } };
      return { customerPhone: { $regex: digits } };
    }
  }
  const pattern = new RegExp(escapeRegex(raw.trim()), 'i');
  return { $or: [{ customerName: pattern }, { customerPhone: pattern }, { lastMessage: pattern }] };
}

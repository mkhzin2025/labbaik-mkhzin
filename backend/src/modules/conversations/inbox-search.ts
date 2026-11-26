import { phoneSearch } from '../../common/utils/phone.util';

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The Mongo filter for an inbox search. A number (see phoneSearch) matches the phone only, and a whole number
 * or its start is answered from the phone index; text matches the customer's name or the last message.
 */
export function inboxSearchClause(raw: string): Record<string, any> {
  const phone = phoneSearch(raw);
  if (phone) {
    if ('exact' in phone) return { customerPhone: phone.exact };
    if ('prefix' in phone) return { customerPhone: { $regex: `^${phone.prefix}` } };
    return { customerPhone: { $regex: phone.contains } };
  }
  const pattern = new RegExp(escapeRegex(raw.trim()), 'i');
  return { $or: [{ customerName: pattern }, { customerPhone: pattern }, { lastMessage: pattern }] };
}

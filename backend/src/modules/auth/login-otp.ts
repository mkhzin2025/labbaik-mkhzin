import { createHash, randomInt, timingSafeEqual } from 'crypto';

export const OTP_TTL_MINUTES = 5;
export const OTP_RESEND_SECONDS = 60;
const MAX_ATTEMPTS = 5;
const MAX_SENDS = 5;

interface Pending {
  hash: Buffer;
  expiresAt: number;
  attempts: number;
  sentAt: number;
  sends: number;
}

const digest = (code: string) => createHash('sha256').update(code).digest();

/**
 * Login codes waiting to be entered, one per user, kept in memory.
 * A restart drops them; the employee just signs in again.
 */
export class LoginOtpStore {
  private readonly pending = new Map<string, Pending>();

  constructor(private readonly now: () => number = Date.now) {}

  /** Seconds until another code may be sent to this user, 0 when it can be sent now. */
  waitSeconds(userId: string) {
    const entry = this.pending.get(userId);
    if (!entry || entry.expiresAt <= this.now()) return 0;
    if (entry.sends >= MAX_SENDS) return Math.ceil((entry.expiresAt - this.now()) / 1000);
    return Math.max(0, Math.ceil((entry.sentAt + OTP_RESEND_SECONDS * 1000 - this.now()) / 1000));
  }

  /** A fresh 6-digit code for the user, replacing any earlier one. */
  issue(userId: string) {
    const previous = this.pending.get(userId);
    const live = previous && previous.expiresAt > this.now();
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    this.pending.set(userId, {
      hash: digest(code),
      expiresAt: this.now() + OTP_TTL_MINUTES * 60_000,
      attempts: 0,
      sentAt: this.now(),
      sends: live ? previous.sends + 1 : 1,
    });
    this.sweep();
    return code;
  }

  /** 'ok' consumes the code. */
  verify(userId: string, code: string): 'ok' | 'wrong' | 'expired' | 'locked' {
    const entry = this.pending.get(userId);
    if (!entry || entry.expiresAt <= this.now()) {
      this.pending.delete(userId);
      return 'expired';
    }
    if (entry.attempts >= MAX_ATTEMPTS) return 'locked';
    entry.attempts += 1;
    const given = digest(String(code || '').replace(/\D/g, ''));
    if (!timingSafeEqual(given, entry.hash)) return entry.attempts >= MAX_ATTEMPTS ? 'locked' : 'wrong';
    this.pending.delete(userId);
    return 'ok';
  }

  private sweep() {
    const now = this.now();
    for (const [userId, entry] of this.pending) if (entry.expiresAt <= now) this.pending.delete(userId);
  }
}

/** 966501234567 → 05•••••567 */
export function maskPhone(phone: string) {
  const local = phone.startsWith('966') ? `0${phone.slice(3)}` : phone;
  return `${local.slice(0, 2)}${'•'.repeat(Math.max(0, local.length - 5))}${local.slice(-3)}`;
}

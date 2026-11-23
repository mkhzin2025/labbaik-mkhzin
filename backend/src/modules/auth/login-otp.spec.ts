import { LoginOtpStore, maskPhone } from './login-otp';

describe('LoginOtpStore', () => {
  let now = 0;
  const store = () => new LoginOtpStore(() => now);
  beforeEach(() => { now = 1_000_000; });

  it('accepts the issued code once', () => {
    const otp = store();
    const code = otp.issue('u');
    expect(code).toMatch(/^\d{6}$/);
    expect(otp.verify('u', code)).toBe('ok');
    expect(otp.verify('u', code)).toBe('expired');
  });

  it('locks after five wrong codes', () => {
    const otp = store();
    const code = otp.issue('u');
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 4; i++) expect(otp.verify('u', wrong)).toBe('wrong');
    expect(otp.verify('u', wrong)).toBe('locked');
    expect(otp.verify('u', code)).toBe('locked');
  });

  it('expires after five minutes', () => {
    const otp = store();
    const code = otp.issue('u');
    now += 5 * 60_000 + 1;
    expect(otp.verify('u', code)).toBe('expired');
  });

  it('waits a minute between sends', () => {
    const otp = store();
    otp.issue('u');
    expect(otp.waitSeconds('u')).toBe(60);
    now += 60_000;
    expect(otp.waitSeconds('u')).toBe(0);
  });

  it('masks the phone number', () => {
    expect(maskPhone('966501234567')).toBe('05•••••567');
  });
});

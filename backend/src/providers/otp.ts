import crypto from 'crypto';
import { config } from '../config';
import { logger } from '../lib/logger';

export interface OtpProvider {
  name: string;
  generate(): string;
  send(phone: string, code: string): Promise<void>;
}

class MockOtpProvider implements OtpProvider {
  name = 'mock';
  generate() { return config.mockOtpCode; }
  async send(phone: string, code: string) { logger.info(`[otp:mock] OTP for +91${phone}: ${code}`); }
}

// MSG91 (India) — https://docs.msg91.com/otp
class Msg91OtpProvider implements OtpProvider {
  name = 'msg91';
  generate() { return String(crypto.randomInt(100000, 1000000)); }
  async send(phone: string, code: string) {
    const key = process.env.MSG91_AUTH_KEY; const template = process.env.MSG91_TEMPLATE_ID;
    if (!key || !template) throw new Error('MSG91 is not configured');
    const url = `https://control.msg91.com/api/v5/otp?template_id=${template}&mobile=91${phone}&otp=${code}`;
    const r = await fetch(url, { method: 'POST', headers: { authkey: key, 'Content-Type': 'application/json' } });
    if (!r.ok) throw new Error(`MSG91 error ${r.status}`);
  }
}

export const otpProvider: OtpProvider = config.otpProvider === 'msg91' ? new Msg91OtpProvider() : new MockOtpProvider();

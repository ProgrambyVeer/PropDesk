import { config } from '../config';
import { logger } from '../lib/logger';

/* ---------- WhatsApp ---------- */
export interface WhatsAppProvider {
  name: string;
  link(phone: string, text: string): string;
  send(phone: string, text: string): Promise<{ delivered: boolean; link: string }>;
}
const waLink = (phone: string, text: string) => `https://wa.me/91${phone}?text=${encodeURIComponent(text)}`;

class DeepLinkWhatsApp implements WhatsAppProvider {
  name = 'deeplink';
  link = waLink;
  async send(phone: string, text: string) { return { delivered: false, link: waLink(phone, text) }; }
}

// WhatsApp Business Cloud API (Meta). Requires an approved template for business-initiated messages.
class CloudApiWhatsApp implements WhatsAppProvider {
  name = 'cloud_api';
  link = waLink;
  async send(phone: string, text: string) {
    const token = process.env.WHATSAPP_BUSINESS_TOKEN; const id = process.env.WHATSAPP_PHONE_NUMBER_ID;
    if (!token || !id) throw new Error('WhatsApp Cloud API is not configured');
    const r = await fetch(`https://graph.facebook.com/v20.0/${id}/messages`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: `91${phone}`, type: 'text', text: { body: text } }),
    });
    return { delivered: r.ok, link: waLink(phone, text) };
  }
}
export const whatsapp: WhatsAppProvider = config.whatsappProvider === 'cloud_api' ? new CloudApiWhatsApp() : new DeepLinkWhatsApp();

/* ---------- SMS ---------- */
export interface SmsProvider { name: string; send(phone: string, text: string): Promise<void> }
export const sms: SmsProvider = {
  name: config.smsProvider,
  async send(phone, text) {
    if (config.smsProvider === 'mock') return void logger.info(`[sms:mock] +91${phone}: ${text}`);
    throw new Error(`SMS provider ${config.smsProvider} not configured`);
  },
};

/* ---------- Email ---------- */
export interface EmailProvider { name: string; send(to: string, subject: string, html: string): Promise<void> }
export const email: EmailProvider = {
  name: config.emailProvider,
  async send(to, subject, html) {
    if (config.emailProvider === 'smtp') {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const nodemailer = require('nodemailer'); // install nodemailer to enable
      await nodemailer.createTransport(process.env.SMTP_URL).sendMail({ to, subject, html });
      return;
    }
    logger.info(`[email:mock] to=${to} subject=${subject} (${html.length} chars)`);
  },
};

/* ---------- Push ---------- */
export interface PushProvider { name: string; send(userId: string, title: string, body: string): Promise<void> }
export const push: PushProvider = {
  name: config.pushProvider,
  async send(userId, title) {
    if (config.pushProvider !== 'mock') logger.warn(`[push] provider ${config.pushProvider} not implemented; falling back to in-app`);
    logger.info(`[push:mock] user=${userId} ${title}`);
  },
};

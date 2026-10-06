import 'dotenv/config';

const required = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`Missing required environment variable ${k}`);
  return v;
};
const port = Number(process.env.PORT || 4000);

export const config = {
  env: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  isTest: process.env.NODE_ENV === 'test',
  port,
  jwtSecret: required('JWT_SECRET'),
  adminJwtSecret: required('ADMIN_JWT_SECRET'),
  pcSessionDays: Number(process.env.PC_SESSION_DAYS || 30),
  adminSessionHours: Number(process.env.ADMIN_SESSION_HOURS || 8),
  corsOrigins: (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
  publicApiUrl: process.env.PUBLIC_API_URL || `http://localhost:${port}`,
  pcAppUrl: process.env.PC_APP_URL || 'http://localhost:5173',
  otpProvider: process.env.OTP_PROVIDER || 'mock',
  mockOtpCode: process.env.MOCK_OTP_CODE || '123456',
  smsProvider: process.env.SMS_PROVIDER || 'mock',
  whatsappProvider: process.env.WHATSAPP_PROVIDER || 'deeplink',
  emailProvider: process.env.EMAIL_PROVIDER || 'mock',
  pushProvider: process.env.PUSH_PROVIDER || 'mock',
  storageProvider: process.env.STORAGE_PROVIDER || 'local',
  uploadDir: process.env.UPLOAD_DIR || 'uploads',
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB || 8),
  schedulerIntervalSec: Number(process.env.SCHEDULER_INTERVAL_SECONDS || 30),
};

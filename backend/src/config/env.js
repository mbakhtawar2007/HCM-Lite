import dotenv from 'dotenv';

dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';

if (isProduction && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET is required in production. Set it in backend/.env');
}

if (!process.env.JWT_SECRET) {
  console.warn(
    '[warn] JWT_SECRET is not set — using an insecure development fallback. ' +
      'Set JWT_SECRET in backend/.env before deploying.',
  );
}

export const env = {
  port: Number(process.env.PORT) || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/hcm-lite',
  jwtSecret: process.env.JWT_SECRET || 'dev-only-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  // First-run setup auto-seed (optional). Never logged; see server.js.
  adminEmail: process.env.ADMIN_EMAIL || null,
  adminPassword: process.env.ADMIN_PASSWORD || null,
  adminName: process.env.ADMIN_NAME || 'Admin',
  companyName: process.env.COMPANY_NAME || 'HCM Lite',
  // AI (P3). Read only by the backend, never by the browser. Note:
  // aiService reads AI_* env vars fresh on every request (not from
  // this snapshot) so the key/rate-limit can change without a restart.
  aiApiKey: process.env.AI_API_KEY || null,
  aiBaseUrl: process.env.AI_BASE_URL || 'https://api.groq.com/openai/v1/chat/completions',
  aiModel: process.env.AI_MODEL || 'openai/gpt-oss-120b',
  // One origin, or a comma-separated list.
  clientUrls: (process.env.CLIENT_URL || 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
};

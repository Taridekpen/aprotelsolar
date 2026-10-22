import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const uri = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '.mongo-uri'), 'utf8').trim();

process.env.NODE_ENV = 'test';
process.env.HOST = '127.0.0.1';
process.env.PORT = '0';
process.env.LOG_LEVEL = 'silent';
process.env.MONGODB_URI = uri;
process.env.CORS_ORIGINS = 'http://localhost:5173';
process.env.PUBLIC_APP_URL = 'http://localhost:5173';
process.env.API_PUBLIC_URL = 'http://localhost:4000';
process.env.PAYMENT_PROVIDER = 'development';
process.env.DEV_PAYMENT_WEBHOOK_SECRET = 'test-webhook-secret-value';
process.env.RUN_JOBS = 'false';
process.env.RATE_LIMIT_MAX = '10000';
process.env.LOGIN_IP_MAX = '100';
process.env.LOGIN_MAX_ATTEMPTS = '4';
process.env.LOGIN_LOCK_MINUTES = '15';
process.env.COOKIE_SECURE = 'false';

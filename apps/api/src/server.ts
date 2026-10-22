import './config/load-dotenv.js';
import { createApp } from './app.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { loadEnv } from './config/env.js';
import { logger } from './config/logger.js';
import { startJobs, stopJobs } from './jobs/scheduler.js';
import { ensureBootstrapAdmin } from './services/auth.service.js';
import { ensureDefaultSettings } from './services/settings.service.js';

const env = loadEnv();
const app = createApp(env);
await connectDatabase(env);
await ensureDefaultSettings();
await ensureBootstrapAdmin(env);

const server = app.listen(env.PORT, env.HOST, () => {
  logger.info({ host: env.HOST, port: env.PORT }, 'Aprotel Solar API listening');
});

if (env.RUN_JOBS) startJobs(env);

let shuttingDown = false;

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Shutting down');
  stopJobs();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await disconnectDatabase();
  process.exit(0);
}

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});
process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});

import type { Env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { expireReservations } from '../services/inventory.service.js';
import { purgeOrphanedMedia } from '../services/media.service.js';

let timers: NodeJS.Timeout[] = [];

export function startJobs(env: Env): void {
  stopJobs();
  const reservations = setInterval(() => {
    expireReservations().catch((error: unknown) => logger.error({ err: error }, 'Reservation expiry failed'));
  }, 60_000);
  const orphans = setInterval(() => {
    const cutoff = new Date(Date.now() - env.MEDIA_ORPHAN_TTL_HOURS * 60 * 60 * 1000);
    purgeOrphanedMedia(cutoff).catch((error: unknown) => logger.error({ err: error }, 'Orphan media cleanup failed'));
  }, 15 * 60_000);
  reservations.unref();
  orphans.unref();
  timers = [reservations, orphans];
}

export function stopJobs(): void {
  for (const timer of timers) clearInterval(timer);
  timers = [];
}

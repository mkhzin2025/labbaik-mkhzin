/**
 * Which jobs this process runs (APP_ROLE):
 * - all (default, unset): everything in one process, as before.
 * - api: serves the platform (HTTP, webhooks, sockets) and its timers, but never sends campaigns; a started
 *   campaign stays queued for the worker.
 * - worker: sends campaigns only, on its own CPU core, so a large campaign cannot slow the platform down.
 */
export type AppRole = 'all' | 'api' | 'worker';

export function appRole(): AppRole {
  const role = String(process.env.APP_ROLE || '').trim().toLowerCase();
  return role === 'api' || role === 'worker' ? role : 'all';
}

/** Campaign sending runs here. */
export const runsCampaigns = () => appRole() !== 'api';

/** Platform timers (auto-close, start-up repairs, billing renewals) run here, and only once. */
export const runsPlatformJobs = () => appRole() !== 'worker';

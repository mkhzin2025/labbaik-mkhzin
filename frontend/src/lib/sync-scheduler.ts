/**
 * Coalesces bursts of realtime events into few refreshes. After an event, `run` happens no sooner than
 * `delayMs` after it and no sooner than `minIntervalMs` after the previous run, so a steady stream (a campaign)
 * costs one request per interval instead of one per event, and a quiet inbox still refreshes shortly after.
 *
 * Every event is followed by a run that starts at least `delayMs` after it. That is what lets the server reuse
 * a result for less than `delayMs` without the refresh missing the event. Runs wait while the tab is hidden and
 * catch up, once, when it is shown again.
 */
export interface SyncScheduler {
  /** Records an event and makes sure a run follows it. */
  notify(): void;
  /** Cancels the pending run and stops listening for the tab being shown. */
  dispose(): void;
}

export function createSyncScheduler(run: () => void, delayMs: number, minIntervalMs: number, doc: Pick<Document, 'hidden' | 'addEventListener' | 'removeEventListener'> | null = typeof document === 'undefined' ? null : document): SyncScheduler {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastEventAt = 0;
  let lastRunAt = -Infinity;
  let waitingForVisible = false;

  const schedule = () => {
    if (timer !== undefined || waitingForVisible) return;
    const at = Math.max(lastEventAt + delayMs, lastRunAt + minIntervalMs);
    timer = setTimeout(fire, Math.max(0, at - Date.now()));
  };

  const fire = () => {
    timer = undefined;
    if (doc?.hidden) { waitingForVisible = true; return; }
    lastRunAt = Date.now();
    run();
    // Events in the last `delayMs` may be newer than what this run can see: follow up once more for them.
    if (lastEventAt > lastRunAt - delayMs) schedule();
  };

  const onVisibility = () => {
    if (!waitingForVisible || doc?.hidden) return;
    waitingForVisible = false;
    fire();
  };
  doc?.addEventListener('visibilitychange', onVisibility);

  return {
    notify() {
      lastEventAt = Date.now();
      schedule();
    },
    dispose() {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      waitingForVisible = false;
      doc?.removeEventListener('visibilitychange', onVisibility);
    },
  };
}

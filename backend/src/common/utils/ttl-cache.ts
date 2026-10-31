/**
 * In-process cache for expensive reads. Callers asking for the same key while a result is still fresh share it,
 * including a computation that is still running (single-flight), so N concurrent requests cost one query.
 *
 * Freshness is measured from when the computation *started*: a fresh value never reflects the database as of
 * more than `ttlMs` ago. A computation that runs longer than that is never run twice side by side: callers that
 * arrive too late to share it wait for one follow-up, started once it finishes. Entries carry tags (e.g. store
 * ids) so a write that must show at once can drop them.
 *
 * With `serveStaleMs`, a value past its TTL is still answered at once for that much longer while one background
 * refresh replaces it, so an expiring entry never makes a caller wait for a slow recomputation. Use it only for
 * figures that may lag (reports), never for values a caller relies on being current.
 * Process-local: correct while the backend runs as a single instance.
 */
interface Entry<T> {
  startedAt: number;
  tags: readonly string[];
  result: Promise<T>;
  settled: boolean;
  hasValue: boolean;
  value?: T;
  followUp?: Promise<T>;
  refreshing?: boolean;
}

export class TtlCache<T> {
  private readonly entries = new Map<string, Entry<T>>();

  constructor(private readonly ttlMs: number, private readonly maxEntries = 500, private readonly serveStaleMs = 0) {}

  get(key: string, tags: readonly string[], load: () => Promise<T>): Promise<T> {
    const hit = this.entries.get(key);
    const age = hit ? Date.now() - hit.startedAt : Infinity;
    if (hit && age < this.ttlMs) return hit.result;
    if (hit && hit.hasValue && age < this.ttlMs + this.serveStaleMs) {
      this.refresh(key, hit, tags, load);
      return Promise.resolve(hit.value as T);
    }
    if (hit && !hit.settled) {
      hit.followUp ??= hit.result.then(noop, noop).then(() => {
        // Anything that replaced `hit` meanwhile was started after these callers asked, so it is fresh enough.
        const current = this.entries.get(key);
        return current && current !== hit ? current.result : this.insert(key, this.create(tags, load)).result;
      });
      return hit.followUp;
    }
    return this.insert(key, this.create(tags, load)).result;
  }

  /** Drops every entry tagged with `tag`; a computation already running still answers its own callers. */
  invalidate(tag: string) {
    for (const [key, entry] of this.entries) if (entry.tags.includes(tag)) this.entries.delete(key);
  }

  get size() {
    return this.entries.size;
  }

  /** One background recomputation for a stale entry; the stale value stays in place until it succeeds. */
  private refresh(key: string, stale: Entry<T>, tags: readonly string[], load: () => Promise<T>) {
    if (stale.refreshing) return;
    stale.refreshing = true;
    const next = this.create(tags, load);
    next.result.then(
      () => { if (this.entries.get(key) === stale) this.insert(key, next); },
      () => { stale.refreshing = false; },
    );
  }

  private create(tags: readonly string[], load: () => Promise<T>): Entry<T> {
    const entry: Entry<T> = { startedAt: Date.now(), tags, result: Promise.resolve().then(load), settled: false, hasValue: false };
    entry.result.then(
      (value) => { entry.settled = true; entry.hasValue = true; entry.value = value; },
      () => { entry.settled = true; },
    );
    return entry;
  }

  private insert(key: string, entry: Entry<T>) {
    this.entries.delete(key);
    this.entries.set(key, entry);
    // A failure is not cached: the next caller tries again.
    entry.result.catch(() => { if (this.entries.get(key) === entry) this.entries.delete(key); });
    this.prune(Date.now());
    return entry;
  }

  private prune(now: number) {
    if (this.entries.size <= this.maxEntries) return;
    for (const [key, entry] of this.entries) if (entry.settled && now - entry.startedAt >= this.ttlMs + this.serveStaleMs) this.entries.delete(key);
    // Still over the cap: Map keeps insertion order, so the first keys are the oldest.
    for (const key of this.entries.keys()) {
      if (this.entries.size <= this.maxEntries) break;
      this.entries.delete(key);
    }
  }
}

/** Runs at most `max` of the given tasks at a time; the rest wait their turn in order. */
export function concurrencyLimit(max: number) {
  let active = 0;
  const waiting: (() => void)[] = [];
  return async <R>(task: () => Promise<R>): Promise<R> => {
    // A finished task hands its slot straight to the next waiter, so a newcomer can never slip in between.
    if (active >= max) await new Promise<void>((resolve) => waiting.push(resolve));
    else active++;
    try {
      return await task();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else active--;
    }
  };
}

const noop = () => undefined;

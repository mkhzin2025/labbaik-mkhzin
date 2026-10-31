/**
 * In-process cache for expensive reads. Callers asking for the same key while a result is still fresh share it,
 * including a computation that is still running (single-flight), so N concurrent requests cost one query.
 *
 * Freshness is measured from when the computation *started*: a cached value never reflects the database as of
 * more than `ttlMs` ago. A computation that runs longer than that is never run twice side by side: callers that
 * arrive too late to share it wait for one follow-up, started once it finishes. Entries carry tags (e.g. store
 * ids) so a write that must show at once can drop them.
 * Process-local: correct while the backend runs as a single instance.
 */
interface Entry<T> {
  startedAt: number;
  tags: readonly string[];
  result: Promise<T>;
  settled: boolean;
  followUp?: Promise<T>;
}

export class TtlCache<T> {
  private readonly entries = new Map<string, Entry<T>>();

  constructor(private readonly ttlMs: number, private readonly maxEntries = 500) {}

  get(key: string, tags: readonly string[], load: () => Promise<T>): Promise<T> {
    const hit = this.entries.get(key);
    if (hit && Date.now() - hit.startedAt < this.ttlMs) return hit.result;
    if (hit && !hit.settled) {
      hit.followUp ??= hit.result.then(noop, noop).then(() => {
        // Anything that replaced `hit` meanwhile was started after these callers asked, so it is fresh enough.
        const current = this.entries.get(key);
        return current && current !== hit ? current.result : this.start(key, tags, load).result;
      });
      return hit.followUp;
    }
    return this.start(key, tags, load).result;
  }

  /** Drops every entry tagged with `tag`; a computation already running still answers its own callers. */
  invalidate(tag: string) {
    for (const [key, entry] of this.entries) if (entry.tags.includes(tag)) this.entries.delete(key);
  }

  get size() {
    return this.entries.size;
  }

  private start(key: string, tags: readonly string[], load: () => Promise<T>) {
    const entry: Entry<T> = { startedAt: Date.now(), tags, result: Promise.resolve().then(load), settled: false };
    entry.result.then(
      () => { entry.settled = true; },
      // A failure is not cached: the next caller tries again.
      () => { entry.settled = true; if (this.entries.get(key) === entry) this.entries.delete(key); },
    );
    this.entries.delete(key);
    this.entries.set(key, entry);
    this.prune(entry.startedAt);
    return entry;
  }

  private prune(now: number) {
    if (this.entries.size <= this.maxEntries) return;
    for (const [key, entry] of this.entries) if (entry.settled && now - entry.startedAt >= this.ttlMs) this.entries.delete(key);
    // Still over the cap: Map keeps insertion order, so the first keys are the oldest.
    for (const key of this.entries.keys()) {
      if (this.entries.size <= this.maxEntries) break;
      this.entries.delete(key);
    }
  }
}

const noop = () => undefined;

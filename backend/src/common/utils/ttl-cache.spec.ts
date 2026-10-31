import { TtlCache, concurrencyLimit } from './ttl-cache';

describe('TtlCache', () => {
  let now = 0;
  beforeEach(() => { now = 1_000; jest.spyOn(Date, 'now').mockImplementation(() => now); });
  afterEach(() => jest.restoreAllMocks());

  it('measures freshness from the start of the computation, so a slow one is not served past its TTL', async () => {
    const cache = new TtlCache<number>(100);
    let release!: (value: number) => void;
    const load = jest.fn(() => new Promise<number>((resolve) => { release = resolve; }));
    const first = cache.get('k', [], load);
    now += 150; // still running, but started too long ago to stand for "now"
    const second = cache.get('k', [], async () => 2);
    await Promise.resolve(); // load() starts on the next microtask
    release(1);
    expect(await first).toBe(1);
    expect(await second).toBe(2);
  });

  it('lets a running computation answer its callers after its entry is invalidated, without caching it', async () => {
    const cache = new TtlCache<string>(1_000);
    let release!: (value: string) => void;
    const running = cache.get('k', ['s1'], () => new Promise<string>((resolve) => { release = resolve; }));
    cache.invalidate('s1');
    const fresh = cache.get('k', ['s1'], async () => 'fresh');
    await Promise.resolve();
    release('stale');
    expect(await running).toBe('stale');
    expect(await fresh).toBe('fresh');
    expect(await cache.get('k', ['s1'], async () => 'unused')).toBe('fresh');
  });

  it('never runs a slow computation twice side by side: late callers share one follow-up', async () => {
    const cache = new TtlCache<number>(100);
    let running = 0;
    let maxRunning = 0;
    let runs = 0;
    const releases: (() => void)[] = [];
    const load = () => {
      runs++;
      running++;
      maxRunning = Math.max(maxRunning, running);
      const value = runs;
      return new Promise<number>((resolve) => releases.push(() => { running--; resolve(value); }));
    };
    const first = cache.get('k', [], load);
    now += 150; // first is still running but too old for callers arriving now
    const late = Array.from({ length: 5 }, () => cache.get('k', [], load));
    await Promise.resolve();
    expect(runs).toBe(1);
    releases[0]();
    expect(await first).toBe(1);
    await new Promise((resolve) => setImmediate(resolve));
    expect(runs).toBe(2); // the follow-up starts only once the first has finished
    releases[1]();
    expect(await Promise.all(late)).toEqual([2, 2, 2, 2, 2]);
    expect(maxRunning).toBe(1);
  });

  it('invalidates only entries carrying the tag', async () => {
    const cache = new TtlCache<string>(1_000);
    await cache.get('a', ['s1'], async () => 'a1');
    await cache.get('b', ['s2'], async () => 'b1');
    await cache.get('ab', ['s1', 's2'], async () => 'ab1');
    cache.invalidate('s1');
    expect(await cache.get('a', ['s1'], async () => 'a2')).toBe('a2');
    expect(await cache.get('ab', ['s1', 's2'], async () => 'ab2')).toBe('ab2');
    expect(await cache.get('b', ['s2'], async () => 'b2')).toBe('b1');
  });

  it('with serveStaleMs, answers an expired value at once and refreshes it once in the background', async () => {
    const cache = new TtlCache<string>(100, 10, 1_000);
    await cache.get('k', [], async () => 'v1');
    now += 150; // expired, but within the stale window
    let release!: (value: string) => void;
    const load = jest.fn(() => new Promise<string>((resolve) => { release = resolve; }));
    expect(await cache.get('k', [], load)).toBe('v1');
    expect(await cache.get('k', [], load)).toBe('v1');
    await Promise.resolve();
    expect(load).toHaveBeenCalledTimes(1); // one refresh, however many callers
    release('v2');
    await new Promise((resolve) => setImmediate(resolve));
    expect(await cache.get('k', [], async () => 'unused')).toBe('v2');
  });

  it('keeps the stale value when its refresh fails, and stops serving it after the stale window', async () => {
    const cache = new TtlCache<string>(100, 10, 1_000);
    await cache.get('k', [], async () => 'v1');
    now += 150;
    expect(await cache.get('k', [], async () => { throw new Error('scan failed'); })).toBe('v1');
    await new Promise((resolve) => setImmediate(resolve));
    expect(await cache.get('k', [], async () => 'unused')).toBe('v1');
    now += 1_000; // past ttl + serveStaleMs: the caller waits for a fresh value
    expect(await cache.get('k', [], async () => 'v3')).toBe('v3');
  });

  it('does not serve a stale value after invalidation', async () => {
    const cache = new TtlCache<string>(100, 10, 1_000);
    await cache.get('k', ['s1'], async () => 'v1');
    now += 150;
    cache.invalidate('s1');
    expect(await cache.get('k', ['s1'], async () => 'v2')).toBe('v2');
  });

  it('stays within its size cap', async () => {
    const cache = new TtlCache<number>(1_000, 3);
    for (let i = 0; i < 10; i++) await cache.get(`k${i}`, [], async () => i);
    expect(cache.size).toBe(3);
    expect(await cache.get('k9', [], async () => -1)).toBe(9);
  });
});

describe('concurrencyLimit', () => {
  it('never runs more than `max` tasks at once, even when new tasks arrive as slots free up', async () => {
    const limit = concurrencyLimit(2);
    let running = 0;
    let peak = 0;
    const task = (ms: number) => limit(async () => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, ms));
      running--;
      return ms;
    });
    const first = Array.from({ length: 5 }, (_, i) => task(5 + i));
    await new Promise((resolve) => setTimeout(resolve, 6));
    const late = Array.from({ length: 5 }, () => task(3)); // arrive while slots are being handed over
    expect(await Promise.all([...first, ...late])).toEqual([5, 6, 7, 8, 9, 3, 3, 3, 3, 3]);
    expect(peak).toBe(2);
  });

  it('frees the slot when a task fails', async () => {
    const limit = concurrencyLimit(1);
    await expect(limit(async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    await expect(limit(async () => 'next')).resolves.toBe('next');
  });
});

type Bucket = {
  count: number;
  resetAt: number;
};

type RateStore = Map<string, Bucket>;

const globalStore = globalThis as typeof globalThis & {
  __webrtcRateStore?: RateStore;
};

const store: RateStore =
  globalStore.__webrtcRateStore ??
  (() => {
    const initial = new Map<string, Bucket>();
    globalStore.__webrtcRateStore = initial;
    return initial;
  })();

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
};

export function consumeRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const previous = store.get(key);

  if (!previous || previous.resetAt <= now) {
    const resetAt = now + windowMs;
    store.set(key, { count: 1, resetAt });
    return {
      allowed: true,
      remaining: Math.max(0, limit - 1),
      retryAfterMs: windowMs,
    };
  }

  if (previous.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: Math.max(0, previous.resetAt - now),
    };
  }

  previous.count += 1;
  store.set(key, previous);
  return {
    allowed: true,
    remaining: Math.max(0, limit - previous.count),
    retryAfterMs: Math.max(0, previous.resetAt - now),
  };
}

export function pruneRateLimitStore(maxEntries = 5000) {
  if (store.size <= maxEntries) {
    return;
  }

  const now = Date.now();
  for (const [key, bucket] of store.entries()) {
    if (bucket.resetAt <= now) {
      store.delete(key);
    }
  }
}

export function createLimiter({ windowMs, max }) {
  const hits = new Map();

  function sweep(now) {
    if (hits.size < 5000) return;
    for (const [key, entry] of hits) if (entry.resetAt <= now) hits.delete(key);
  }

  function current(key, now) {
    const entry = hits.get(key);
    return entry && entry.resetAt > now ? entry : null;
  }

  return {
    blocked(key) {
      const entry = current(key, Date.now());
      return entry ? entry.count >= max : false;
    },
    hit(key) {
      const now = Date.now();
      sweep(now);
      const entry = current(key, now) ?? { count: 0, resetAt: now + windowMs };
      entry.count += 1;
      hits.set(key, entry);
    },
    reset(key) {
      hits.delete(key);
    },
  };
}

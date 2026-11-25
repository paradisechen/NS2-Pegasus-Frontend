/**
 * Caching utility for fast loading and offline support in Pegasus & Media Center
 */
const CACHE_PREFIX = 'nss2_cache_';
const DEFAULT_TTL = 1000 * 60 * 30; // 30 minutes

interface CacheItem<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

export const cache = {
  set<T>(key: string, data: T, ttl: number = DEFAULT_TTL): void {
    try {
      const item: CacheItem<T> = {
        data,
        timestamp: Date.now(),
        ttl,
      };
      localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(item));
    } catch (e) {
      console.warn('Cache write failed:', e);
    }
  },

  get<T>(key: string): T | null {
    try {
      const raw = localStorage.getItem(CACHE_PREFIX + key);
      if (!raw) return null;

      const item: CacheItem<T> = JSON.parse(raw);
      if (Date.now() - item.timestamp > item.ttl) {
        localStorage.removeItem(CACHE_PREFIX + key);
        return null;
      }
      return item.data;
    } catch (e) {
      console.warn('Cache read failed:', e);
      return null;
    }
  },

  clear(): void {
    try {
      Object.keys(localStorage).forEach((key) => {
        if (key.startsWith(CACHE_PREFIX)) {
          localStorage.removeItem(key);
        }
      });
    } catch (e) {
      console.warn('Cache clear failed:', e);
    }
  },
};

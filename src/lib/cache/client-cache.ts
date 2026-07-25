/**
 * Utilitaire de cache en mémoire côté client pour les requêtes Firestore répétitives dans Next.js.
 * Évite les re-lectures réseau lors de la navigation entre les composants du Dashboard.
 */
type CacheEntry<T> = {
  data: T;
  timestamp: number;
};

const cache = new Map<string, CacheEntry<unknown>>();
const inFlight = new Map<string, Promise<unknown>>();

/**
 * Exécute un fetcher Firestore uniquement si les données ne sont pas dans le cache
 * ou si le TTL est expiré. Déduplique également les requêtes simultanées.
 */
export async function fetchWithCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs = 120_000 // 2 minutes par défaut
): Promise<T> {
  const now = Date.now();
  const cached = cache.get(key);

  if (cached && now - cached.timestamp < ttlMs) {
    return cached.data as T;
  }

  if (inFlight.has(key)) {
    return inFlight.get(key) as Promise<T>;
  }

  const promise = fetcher()
    .then((data) => {
      cache.set(key, { data, timestamp: Date.now() });
      inFlight.delete(key);
      return data;
    })
    .catch((err) => {
      inFlight.delete(key);
      throw err;
    });

  inFlight.set(key, promise);
  return promise;
}

/**
 * Invalide une clé spécifique ou un préfixe de clé (ex: "clients", "products").
 */
export function invalidateCache(keyPrefix?: string): void {
  if (!keyPrefix) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (key.startsWith(keyPrefix)) {
      cache.delete(key);
    }
  }
}

import { createAsyncResourceCache } from './asyncResourceCache';
import { log } from '../../utils/appLogger';

/** Partial snapshots never replace a final cache entry or detach its in-flight request. */
export function createProgressiveResource<Value>(name: string, maxEntries = 40) {
  const snapshots = createAsyncResourceCache<Value>({ name, maxEntries });
  const listeners = new Map<string, Set<(value: Value) => void>>();
  const notify = (listener: (value: Value) => void, value: Value) => {
    try { listener(value); } catch (error) {
      log.error('Resource snapshot listener failed', { name, error });
    }
  };
  return {
    peek: (key: string) => snapshots.peek(key),
    publish(key: string, value: Value) {
      snapshots.set(key, value, 5 * 60_000);
      listeners.get(key)?.forEach((listener) => notify(listener, value));
    },
    subscribe(key: string, listener: (value: Value) => void) {
      const group = listeners.get(key) || new Set<(value: Value) => void>();
      group.add(listener);
      listeners.set(key, group);
      const cached = snapshots.peek(key);
      if (cached !== undefined) notify(listener, cached);
      return () => {
        group.delete(listener);
        if (!group.size) listeners.delete(key);
      };
    },
    delete(key: string) { snapshots.delete(key); },
    clear() { snapshots.clear(); listeners.clear(); },
  };
}

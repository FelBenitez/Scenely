// hooks/useOnlineCount.ts
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const DEFAULT_WINDOW_MIN = 10;
const DEFAULT_POLL_MS = 20_000;

export function useOnlineCount(
  windowMinutes: number = DEFAULT_WINDOW_MIN,
  pollMs: number = DEFAULT_POLL_MS,
  enabled: boolean = true
) {
  const [onlineCount, setOnlineCount] = useState<number | undefined>(undefined);

  const refresh = useCallback(async () => {
    try {
      const sinceIso = new Date(
        Date.now() - windowMinutes * 60_000
      ).toISOString();

      const { count, error } = await supabase
        .from('user_presence')
        .select('user_id', { count: 'exact', head: true })
        .gt('last_seen', sinceIso);

      if (error) {
        console.error('[useOnlineCount] presence count failed:', error.message);
        return;
      }
      setOnlineCount(count ?? 0);
    } catch (e) {
      console.error('[useOnlineCount] unexpected error:', e);
    }
  }, [windowMinutes]);

  useEffect(() => {
    if (!enabled) {
      // when disabled, don’t run the interval
      return;
    }

    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      await refresh();
    };

    // initial fetch
    tick();

    const id = setInterval(tick, pollMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [refresh, pollMs, enabled]);

  return { onlineCount, refresh };
}
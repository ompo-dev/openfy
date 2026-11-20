import { useEffect, useRef } from 'react';
import { AccessibilityInfo } from 'react-native';

/** Repeated renders do not extend the same notice indefinitely. */
export function useTransientNotice(identity: string | undefined, dismiss: () => void, duration = 6000, announcement?: string) {
  const current = useRef({ identity, dismiss });
  current.current = { identity, dismiss };
  useEffect(() => {
    if (identity && announcement) AccessibilityInfo.announceForAccessibility(announcement);
  }, [identity, announcement]);
  useEffect(() => {
    if (!identity) return;
    let active = true;
    const expire = () => { if (current.current.identity === identity) current.current.dismiss(); };
    let timer = setTimeout(expire, duration);
    void AccessibilityInfo.isScreenReaderEnabled().then((enabled) => {
      if (!active || !enabled) return;
      clearTimeout(timer);
      timer = setTimeout(expire, Math.max(15000, duration));
    }).catch(() => {});
    return () => { active = false; clearTimeout(timer); };
  }, [identity, duration]);
}

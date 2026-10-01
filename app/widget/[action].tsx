import * as React from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { usePlayer } from '@context';
import { log } from '@utils';

export default function PlayerWidgetCommandRoute() {
  const { action } = useLocalSearchParams<{ action: string }>();
  const router = useRouter();
  const { currentTrack, togglePlayPause, playNext, playPrevious } = usePlayer();
  const dispatched = React.useRef(false);

  React.useEffect(() => {
    if (dispatched.current || !action) return;
    dispatched.current = true;
    void (async () => {
      try {
        if (action === 'play-pause' && currentTrack) await togglePlayPause();
        if (action === 'next') await playNext();
        if (action === 'previous') await playPrevious();
        log.player('widget playback command', { action, hasTrack: Boolean(currentTrack) });
      } finally {
        if (router.canGoBack()) router.back();
        else router.replace('/(tabs)/home' as never);
      }
    })();
  }, [action, currentTrack, playNext, playPrevious, router, togglePlayPause]);

  return <View style={{ backgroundColor: '#101010', flex: 1 }} />;
}

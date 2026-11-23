import * as React from 'react';
import { StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';
import { AppIcon as Ionicons } from "../native/AppIcon";

import { LoggedPressable } from '../native';
import { DownloadActionIcon } from '../native/DownloadActionIcon';
import { SoundWaveIcon } from '../Home/FriendActivityStatus/NoteBubble';
import { SkeletonImage } from './SkeletonImage';
import { hydrateTrackAvailability, isTrackUnavailable, useTrackAvailabilityStore,
  type AvailabilityTrack } from '../../stores/useTrackAvailabilityStore';
import { usePlayer } from '@context';

type TrackRowProps = {
  track?: AvailabilityTrack & { artistName?: string; subtitle?: string; albumName?: string;
    imageURL?: string; duration_ms?: number; durationMs?: number; artists?: { id: string; name: string }[];
    youtubeUrl?: string; albumId?: string; explicit?: boolean };
  title: string;
  subtitle: string;
  imageURL?: string;
  trackNumber?: number;
  active: boolean;
  playing: boolean;
  downloadState: 'idle' | 'active' | 'completed';
  onPress: () => void;
  onDownload: () => void;
  artists?: { id: string; name: string }[];
  onArtistPress?: (id: string, name: string) => void | Promise<void>;
  trailingAction?: React.ReactNode;
  accessibilityLabel?: string;
  disabled?: boolean;
  repairUnavailableOnPress?: boolean;
};

const formatDuration = (durationMs?: number): string | null => {
  if (!Number.isFinite(durationMs) || !durationMs || durationMs < 1_000) return null;
  const seconds = Math.floor(durationMs / 1_000);
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
};

export const TrackRow = React.memo(function TrackRow({
  title, subtitle, imageURL, trackNumber, active, playing, downloadState,
  onPress, onDownload, artists, onArtistPress, trailingAction,
  accessibilityLabel, disabled = false, track, repairUnavailableOnPress = true,
}: TrackRowProps) {
  const { playTrack } = usePlayer((state) => ({ playTrack: state.playTrack }));
  // Native swipe cancellation can arrive after RN's press release; movement is never a tap.
  const touch = React.useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const trackMovement = (event?: GestureResponderEvent) => {
    const point = event?.nativeEvent;
    if (point && touch.current && Math.hypot(point.pageX - touch.current.x, point.pageY - touch.current.y) > 8) touch.current.moved = true;
  };
  const unavailable = useTrackAvailabilityStore((state) => track ? isTrackUnavailable(track, state.failures, false) : false);
  const duration = formatDuration(track?.duration_ms || track?.durationMs);
  const artistSubtitle = track?.artistName || track?.subtitle;
  const showsArtistSubtitle = Boolean(artistSubtitle && subtitle.trim() === artistSubtitle.trim());
  React.useEffect(() => { void hydrateTrackAvailability(); }, []);
  const handlePress = (event?: GestureResponderEvent) => {
    trackMovement(event);
    if (touch.current?.moved) return;
    if (!unavailable || !track || !repairUnavailableOnPress) { onPress(); return; }
    void playTrack({ ...track,
      spotifyId: track.spotifyId || track.id || '', title, artistName: track.artistName || subtitle,
      albumName: track.albumName || 'Single', imageURL: imageURL || '',
      duration_ms: track.duration_ms || track.durationMs || 0 });
  };
  return (
    <LoggedPressable
      accessibilityLabel={accessibilityLabel || (unavailable ? `Corrigir áudio de ${title}` : `Tocar ${title}`)}
      disabled={disabled}
      onTouchStart={({ nativeEvent }) => { touch.current = { x: nativeEvent.pageX, y: nativeEvent.pageY, moved: false }; }}
      onTouchMove={trackMovement}
      onTouchCancel={() => { if (touch.current) touch.current.moved = true; }}
      onPress={handlePress}
      style={[styles.row, active && playing && styles.rowActive, disabled && styles.rowDisabled]}
    >
      {trackNumber !== undefined ? (
        <Text style={styles.trackNumber}>{trackNumber}</Text>
      ) : imageURL ? (
        <SkeletonImage
          cachePolicy="memory-disk"
          priority="high"
          source={{ uri: imageURL }}
          style={styles.artwork}
          testID="track-row-artwork"
        />
      ) : (
        <View testID="track-row-artwork" style={[styles.artwork, styles.artworkFallback]}>
          <Ionicons name="musical-note" size={18} color="#9A9A9A" />
        </View>
      )}
      <View style={styles.copy}>
        <View style={styles.titleRow}>
          {unavailable ? <Ionicons name="alert-circle" size={16} color="#F6C85F" /> : null}
          {active && playing ? <SoundWaveIcon color="#1ED760" size={15} /> : null}
          <Text numberOfLines={1} style={[styles.title, active && styles.titleActive]}>
            {title}
          </Text>
          {track?.explicit ? (
            <View accessibilityLabel="Conteúdo explícito" testID="track-explicit-badge" style={styles.explicitBadge}>
              <Text style={styles.explicitText}>E</Text>
            </View>
          ) : null}
        </View>
        {artists?.length && onArtistPress ? (
          <View style={styles.artistMeta}>
            <View style={styles.artistLinks}>
              {artists.map((artist, index) => (
                <LoggedPressable
                  key={`${artist.id || artist.name}-${index}`}
                  style={styles.artistLink}
                  accessibilityLabel={`Abrir artista ${artist.name}`}
                  onPress={(event) => {
                    event.stopPropagation();
                    void onArtistPress(artist.id, artist.name);
                  }}
                >
                  <Text numberOfLines={1} style={styles.subtitle}>
                    {artist.name}{index < artists.length - 1 ? ', ' : ''}
                  </Text>
                </LoggedPressable>
              ))}
            </View>
            {duration ? <Text testID="track-row-duration" style={styles.subtitle}> • {duration}</Text> : null}
          </View>
        ) : (
          <Text numberOfLines={1} style={styles.subtitle}>{subtitle}{duration && showsArtistSubtitle ? ` • ${duration}` : ''}</Text>
        )}
        {unavailable ? <Text style={styles.unavailable}>Áudio indisponível</Text> : null}
      </View>
      {unavailable && repairUnavailableOnPress ? <LoggedPressable accessibilityLabel={`Editar link de ${title}`} style={styles.action}
        onPress={(event) => { event.stopPropagation(); handlePress(); }}>
        <Ionicons name="create-outline" size={20} color="#F6C85F" />
      </LoggedPressable> : trailingAction || <LoggedPressable
        accessibilityRole="button"
        accessibilityLabel={downloadState === 'completed' ? `${title} está baixada` : `Baixar ${title}`}
        disabled={downloadState !== 'idle'}
        onPress={(event) => {
          event.stopPropagation();
          onDownload();
        }}
        style={styles.action}
      >
        {downloadState === 'idle' ? (
          <DownloadActionIcon size={19} color="#CACACA" />
        ) : (
          <Ionicons
            name={downloadState === 'completed' ? 'checkmark-circle' : 'time-outline'}
            size={19}
            color={downloadState === 'completed' ? '#1ED760' : '#CACACA'}
          />
        )}
      </LoggedPressable>}
    </LoggedPressable>
  );
});

const styles = StyleSheet.create({
  // 42px covers: 64px rows had 22px between covers. 55px rows have 13px
  // between them, reducing that spacing by about 40% without shrinking art.
  row: { alignItems: 'center', flexDirection: 'row', gap: 11, minHeight: 55, paddingHorizontal: 16, paddingVertical: 5 },
  rowActive: { backgroundColor: 'rgba(255,255,255,0.085)', borderRadius: 0 },
  rowDisabled: { opacity: 0.58 },
  artwork: { borderRadius: 8, height: 42, width: 42 },
  artworkFallback: { alignItems: 'center', backgroundColor: '#292929', justifyContent: 'center' },
  trackNumber: { color: 'rgba(255,255,255,0.68)', fontFamily: 'SF-Regular', fontSize: 13, textAlign: 'center', width: 22 },
  copy: { flex: 1, minWidth: 0, gap: 3 },
  titleRow: { alignItems: 'center', flexDirection: 'row', gap: 7 },
  artistMeta: { alignItems: 'center', flexDirection: 'row', minWidth: 0 },
  artistLinks: { flexDirection: 'row', flexShrink: 1, minWidth: 0, overflow: 'hidden' },
  artistLink: { flexShrink: 1 },
  title: { color: '#FFFFFF', flexShrink: 1, fontFamily: 'SF-Semibold', fontSize: 14 },
  titleActive: { color: '#1ED760' },
  subtitle: { color: 'rgba(255,255,255,0.58)', fontFamily: 'SF-Regular', fontSize: 12 },
  explicitBadge: { alignItems: 'center', backgroundColor: '#98989D', borderRadius: 2,
    height: 14, justifyContent: 'center', minWidth: 14, paddingHorizontal: 2 },
  explicitText: { color: '#171717', fontFamily: 'SF-Bold', fontSize: 10, lineHeight: 12 },
  unavailable: { color: '#F6C85F', fontFamily: 'SF-Regular', fontSize: 11 },
  action: { alignItems: 'center', height: 42, justifyContent: 'center', width: 38 },
});

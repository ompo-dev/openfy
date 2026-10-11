import * as React from 'react';
import { StyleSheet, Text, View } from 'react-native';
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
    youtubeUrl?: string; albumId?: string };
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

export const TrackRow = React.memo(function TrackRow({
  title, subtitle, imageURL, trackNumber, active, playing, downloadState,
  onPress, onDownload, artists, onArtistPress, trailingAction,
  accessibilityLabel, disabled = false, track, repairUnavailableOnPress = true,
}: TrackRowProps) {
  const { playTrack } = usePlayer((state) => ({ playTrack: state.playTrack }));
  const unavailable = useTrackAvailabilityStore((state) => track ? isTrackUnavailable(track, state.failures) : false);
  React.useEffect(() => { void hydrateTrackAvailability(); }, []);
  const handlePress = () => {
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
        />
      ) : (
        <View style={[styles.artwork, styles.artworkFallback]}>
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
        </View>
        {artists?.length && onArtistPress ? (
          <View style={styles.artistLinks}>
            {artists.map((artist, index) => (
              <LoggedPressable
                key={`${artist.id || artist.name}-${index}`}
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
        ) : (
          <Text numberOfLines={1} style={styles.subtitle}>{subtitle}</Text>
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
  row: { alignItems: 'center', flexDirection: 'row', gap: 11, minHeight: 64, paddingHorizontal: 16, paddingVertical: 8 },
  rowActive: { backgroundColor: 'rgba(255,255,255,0.085)', borderRadius: 6 },
  rowDisabled: { opacity: 0.58 },
  artwork: { borderRadius: 3, height: 42, width: 42 },
  artworkFallback: { alignItems: 'center', backgroundColor: '#292929', justifyContent: 'center' },
  trackNumber: { color: 'rgba(255,255,255,0.68)', fontFamily: 'SF-Regular', fontSize: 13, textAlign: 'center', width: 22 },
  copy: { flex: 1, minWidth: 0, gap: 3 },
  titleRow: { alignItems: 'center', flexDirection: 'row', gap: 7 },
  artistLinks: { flexDirection: 'row', flexWrap: 'wrap' },
  title: { color: '#FFFFFF', flexShrink: 1, fontFamily: 'SF-Semibold', fontSize: 14 },
  titleActive: { color: '#1ED760' },
  subtitle: { color: 'rgba(255,255,255,0.58)', fontFamily: 'SF-Regular', fontSize: 12 },
  unavailable: { color: '#F6C85F', fontFamily: 'SF-Regular', fontSize: 11 },
  action: { alignItems: 'center', height: 42, justifyContent: 'center', width: 38 },
});

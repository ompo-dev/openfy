import * as React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AppIcon as Ionicons } from "../native/AppIcon";

import { LoggedPressable } from '../native';
import { DownloadActionIcon } from '../native/DownloadActionIcon';
import { SoundWaveIcon } from '../Home/FriendActivityStatus/NoteBubble';
import { SkeletonImage } from './SkeletonImage';

type TrackRowProps = {
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
};

export const TrackRow = React.memo(function TrackRow({
  title, subtitle, imageURL, trackNumber, active, playing, downloadState,
  onPress, onDownload, artists, onArtistPress, trailingAction,
}: TrackRowProps) {
  return (
    <LoggedPressable
      accessibilityLabel={`Tocar ${title}`}
      onPress={onPress}
      style={[styles.row, active && playing && styles.rowActive]}
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
      </View>
      {trailingAction || <LoggedPressable
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
  artwork: { borderRadius: 3, height: 42, width: 42 },
  artworkFallback: { alignItems: 'center', backgroundColor: '#292929', justifyContent: 'center' },
  trackNumber: { color: 'rgba(255,255,255,0.68)', fontFamily: 'SF-Regular', fontSize: 13, textAlign: 'center', width: 22 },
  copy: { flex: 1, minWidth: 0, gap: 3 },
  titleRow: { alignItems: 'center', flexDirection: 'row', gap: 7 },
  artistLinks: { flexDirection: 'row', flexWrap: 'wrap' },
  title: { color: '#FFFFFF', flexShrink: 1, fontFamily: 'SF-Semibold', fontSize: 14 },
  titleActive: { color: '#1ED760' },
  subtitle: { color: 'rgba(255,255,255,0.58)', fontFamily: 'SF-Regular', fontSize: 12 },
  action: { alignItems: 'center', height: 42, justifyContent: 'center', width: 38 },
});

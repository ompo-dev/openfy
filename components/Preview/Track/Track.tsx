import * as React from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';

import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Entypo from '@expo/vector-icons/Entypo';
import Ionicons from '@expo/vector-icons/Ionicons';
import { FontAwesome5 } from '@expo/vector-icons';

import { useApplicationDimensions } from '@hooks';
import { explicit_SIGN, TRACK_COVER_SIZE } from '@config';
import { getFallbackImage } from '@utils';
import { usePlayer } from '@context';
import {
  isTrackDownloaded,
  resolveAudioUrl,
  downloadTrack,
  getDownloadedTrack,
} from '@services';

import { styles } from './styles';

export type TrackPropsType = {
  type: 'album' | 'playlist';
  title: string;
  subtitle: string;
  imageURL?: string;
  isDownloaded: boolean;
  isSaved: boolean;
  isPlaying: boolean;
  explicit: boolean;
  forceDisableSaveIcon?: boolean;
  trackId?: string;
  artistName?: string;
  albumName?: string;
  duration_ms?: number;
};

export const Track = ({
  type,
  title,
  subtitle,
  imageURL,
  isDownloaded: isDownloadedProp,
  isSaved,
  isPlaying,
  explicit,
  forceDisableSaveIcon,
  trackId,
  artistName,
  albumName,
  duration_ms,
}: TrackPropsType) => {
  const { width } = useApplicationDimensions();
  const maxWidth = width - 150;
  const isPlaylist = type === 'playlist';
  const { playTrack, currentTrack, playerState } = usePlayer();

  const [isDownloaded, setIsDownloaded] = React.useState(isDownloadedProp);
  const [isDownloading, setIsDownloading] = React.useState(false);
  const [downloadProgress, setDownloadProgress] = React.useState(0);

  const isCurrentlyPlaying =
    trackId !== undefined &&
    currentTrack?.spotifyId === trackId &&
    playerState.isPlaying;

  // Handle play: if downloaded play local, else try stream
  const handlePlay = async () => {
    if (!trackId) return;

    // Check if downloaded first
    const downloaded = await getDownloadedTrack(trackId);
    if (downloaded) {
      await playTrack({
        spotifyId: downloaded.spotifyId,
        title: downloaded.title,
        artistName: downloaded.artistName,
        albumName: downloaded.albumName,
        imageURL: downloaded.localImagePath || downloaded.imageURL,
        localAudioPath: downloaded.localAudioPath,
        duration_ms: downloaded.duration_ms,
      });
      return;
    }

    // Try stream resolution
    const resolved = await resolveAudioUrl(
      title,
      artistName || subtitle,
      trackId
    );
    if (resolved) {
      await playTrack({
        spotifyId: trackId || title,
        title,
        artistName: artistName || subtitle,
        albumName: albumName || '',
        imageURL: imageURL || '',
        streamUrl: resolved.url,
        duration_ms: duration_ms || 0,
      });
    }
  };

  const handleDownload = async () => {
    if (!trackId || isDownloaded || isDownloading) return;

    setIsDownloading(true);
    setDownloadProgress(0);

    try {
      const already = await isTrackDownloaded(trackId);
      if (already) {
        setIsDownloaded(true);
        setIsDownloading(false);
        return;
      }

      const resolved = await resolveAudioUrl(
        title,
        artistName || subtitle,
        trackId,
        duration_ms
      );
      if (!resolved) throw new Error('Could not find audio source');

      const result = await downloadTrack(
        {
          spotifyId: trackId,
          title,
          artistName: artistName || subtitle,
          albumName: albumName || '',
          imageURL: imageURL || '',
          duration_ms: duration_ms || 0,
        },
        resolved.url,
        resolved.format,
        (p) => setDownloadProgress(p)
      );

      if (result) {
        setIsDownloaded(true);
      }
    } catch (error) {
      console.error('[Track] download error:', error);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <View style={styles.container}>
      {isPlaylist && (
        <Pressable onPress={handlePlay}>
          <Image
            style={styles.image}
            source={imageURL ? { uri: imageURL } : getFallbackImage('track')}
          />
        </Pressable>
      )}
      <Pressable style={styles.content} onPress={handlePlay}>
        <View
          style={[
            styles.nameView,
            {
              maxWidth:
                isPlaylist && !forceDisableSaveIcon
                  ? 280 - TRACK_COVER_SIZE
                  : 280,
            },
          ]}
        >
          {(isPlaying || isCurrentlyPlaying) && (
            <Ionicons style={styles.isPlayingIcon} name="stats-chart-sharp" />
          )}
          <Text
            numberOfLines={1}
            style={[
              styles.nameText,
              { maxWidth },
              isPlaying || isCurrentlyPlaying ? styles.nameTextActive : {},
            ]}
          >
            {title}
          </Text>
        </View>

        <View style={styles.artistNameView}>
          {(isDownloaded) && (
            <View style={styles.isTrackDownloadedView}>
              <MaterialCommunityIcons
                style={styles.isTrackDownloadedIcon}
                name="arrow-down-bold"
              />
            </View>
          )}
          {explicit && (
            <View style={styles.explicitView}>
              <Text style={styles.explicitText}>{explicit_SIGN}</Text>
            </View>
          )}
          <Text numberOfLines={1} style={[styles.artistNameText, { maxWidth }]}>
            {subtitle}
          </Text>
        </View>
      </Pressable>

      {/* Download progress bar */}
      {isDownloading && (
        <View style={styles.downloadProgressContainer}>
          <View
            style={[
              styles.downloadProgressBar,
              { width: `${Math.round(downloadProgress * 100)}%` },
            ]}
          />
        </View>
      )}

      {isSaved && !forceDisableSaveIcon && (
        <Pressable style={styles.isTrackSavedPressable}>
          <FontAwesome5 name="check" style={styles.isTrackSavedIcon} />
        </Pressable>
      )}

      {/* Download button */}
      {trackId && (
        <Pressable
          onPress={handleDownload}
          style={styles.downloadActionButton}
          disabled={isDownloaded || isDownloading}
        >
          {isDownloading ? (
            <ActivityIndicator size="small" color="#1DB954" />
          ) : isDownloaded ? (
            <Ionicons name="checkmark-circle" size={18} color="#1DB954" />
          ) : (
            <Ionicons name="download-outline" size={18} color="#A0A0A0" />
          )}
        </Pressable>
      )}

      <Pressable>
        <Entypo style={styles.moreIcon} name="dots-three-horizontal" />
      </Pressable>
    </View>
  );
};

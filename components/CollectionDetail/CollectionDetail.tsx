import * as React from 'react';
import {
  Alert,
  FlatList,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Href, useRouter, useSegments } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TrackModel } from '@models';
import { BOTTOM_NAVIGATION_HEIGHT } from '@config';
import { usePlayer } from '@context';
import { formatCollectionMeta } from '@utils';
import { GlassSurface, LoggedPressable, NativeIconButton } from '../native';
import { PlaylistMosaic } from '../PlaylistMosaic';
import { SoundWaveIcon } from '../Home/FriendActivityStatus/NoteBubble';

type CollectionTrack = TrackModel & { localAudioPath?: string };

export type CollectionDetailProps = {
  kind: 'album' | 'artist' | 'playlist';
  collectionId: string;
  title: string;
  imageURL: string;
  imageURLs?: string[];
  description?: string;
  metadata?: string;
  createdAt?: string;
  trackCount?: number;
  totalDurationMs?: number;
  tracks: CollectionTrack[];
  artists?: { id: string; name: string }[];
  onAddTracksPress?: () => void | Promise<void>;
  onArtistPress?: (artistId: string) => void;
  onDeletePress?: () => void | Promise<void>;
  onEndReached?: () => void;
  onSharePress?: () => void | Promise<void>;
  resolveTracksForPlayback?: () => Promise<CollectionTrack[]>;
  sectionTitle?: string;
  footer?: React.ReactNode;
};

const toPlayerTrack = (track: CollectionTrack, collectionName: string) => ({
  spotifyId: track.id,
  title: track.title,
  artistName: track.subtitle,
  albumName: track.albumName || collectionName,
  imageURL: track.imageURL || '',
  localAudioPath: track.localAudioPath,
  duration_ms: track.durationMs || 0,
  artists: track.artists,
});

export const CollectionDetail = ({
  kind,
  collectionId,
  title,
  imageURL,
  imageURLs,
  description,
  metadata: metadataProp,
  createdAt,
  trackCount,
  totalDurationMs,
  tracks,
  artists,
  onAddTracksPress,
  onArtistPress,
  onDeletePress,
  onEndReached,
  onSharePress,
  resolveTracksForPlayback,
  sectionTitle,
  footer,
}: CollectionDetailProps) => {
  const router = useRouter();
  const segments = useSegments();
  const insets = useSafeAreaInsets();
  const [sortAscending, setSortAscending] = React.useState(false);
  const {
    addToQueue,
    currentTrack,
    isShuffle,
    playerState,
    playWithQueue,
    queueSourceId,
    togglePlayPause,
    toggleShuffle,
  } = usePlayer();
  const hasActiveTrack = Boolean(
    currentTrack && tracks.some((track) => track.id === currentTrack.spotifyId)
  );
  const collectionPlaybackId = `${kind}:${collectionId}`;
  const isCollectionPlayback = queueSourceId === collectionPlaybackId;
  const metadata = metadataProp || formatCollectionMeta({
    createdAt,
    trackCount: trackCount ?? tracks.length,
    totalDurationMs:
      totalDurationMs ?? tracks.reduce((total, track) => total + (track.durationMs || 0), 0),
  });
  const visibleTracks = React.useMemo(
    () =>
      sortAscending
        ? [...tracks].sort((first, second) => first.title.localeCompare(second.title))
        : tracks,
    [sortAscending, tracks]
  );

  const playCollection = React.useCallback(
    async (shuffled = false, startIndex = 0) => {
      const playableTracks = resolveTracksForPlayback
        ? await resolveTracksForPlayback()
        : tracks;
      const playerTracks = playableTracks.map((track) => toPlayerTrack(track, title));
      if (playerTracks.length === 0) return;
      if (isShuffle !== shuffled) toggleShuffle();
      const index = shuffled
        ? Math.floor(Math.random() * playerTracks.length)
        : startIndex;
      await playWithQueue(playerTracks, index, collectionPlaybackId);
    },
    [
      collectionPlaybackId,
      isShuffle,
      playWithQueue,
      resolveTracksForPlayback,
      title,
      toggleShuffle,
      tracks,
    ]
  );

  const handleAddToQueue = React.useCallback(async () => {
    const playableTracks = resolveTracksForPlayback
      ? await resolveTracksForPlayback()
      : tracks;
    addToQueue(playableTracks.map((track) => toPlayerTrack(track, title)));
  }, [addToQueue, resolveTracksForPlayback, title, tracks]);

  const handleAdd = React.useCallback(async () => {
    if (onAddTracksPress) {
      await onAddTracksPress();
      return;
    }
    await handleAddToQueue();
  }, [handleAddToQueue, onAddTracksPress]);

  const handlePrimaryPlay = React.useCallback(async () => {
    if (isCollectionPlayback) {
      await togglePlayPause();
      return;
    }
    await playCollection();
  }, [isCollectionPlayback, playCollection, togglePlayPause]);

  const handleShare = React.useCallback(async () => {
    if (onSharePress) {
      await onSharePress();
      return;
    }
    try {
      await Share.share({ message: `${title} · Openfy Music` });
    } catch {}
  }, [onSharePress, title]);

  const handleBack = React.useCallback(() => {
    const section = segments.join('/').includes('library') ? 'library' : 'home';
    router.replace(`/(tabs)/${section}` as Href);
  }, [router, segments]);

  const renderTrack = React.useCallback(
    ({ item, index }: { item: CollectionTrack; index: number }) => {
      const active = currentTrack?.spotifyId === item.id;
      return (
        <LoggedPressable
          accessibilityLabel={`Tocar ${item.title}`}
          onPress={() => playCollection(false, index)}
          style={styles.trackRow}
        >
          {kind === 'playlist' || kind === 'artist' ? (
            item.imageURL ? (
              <Image
                cachePolicy="memory-disk"
                source={{ uri: item.imageURL }}
                style={styles.trackArtwork}
              />
            ) : (
              <View style={[styles.trackArtwork, styles.artworkFallback]}>
                <Ionicons name="musical-note" size={18} color="#9A9A9A" />
              </View>
            )
          ) : (
            <Text style={styles.trackNumber}>{index + 1}</Text>
          )}
          <View style={styles.trackCopy}>
            <View style={styles.trackTitleRow}>
              {active && playerState.isPlaying ? (
                <SoundWaveIcon color="#1ED760" size={15} />
              ) : null}
              <Text numberOfLines={1} style={[styles.trackTitle, active && styles.trackTitleActive]}>
                {item.title}
              </Text>
            </View>
            {item.artists?.length && onArtistPress ? (
              <View style={styles.trackArtistLinks}>
                {item.artists.map((artist, artistIndex) => (
                  <LoggedPressable
                    key={artist.id}
                    accessibilityLabel={`Abrir artista ${artist.name}`}
                    onPress={() => onArtistPress(artist.id)}
                  >
                    <Text numberOfLines={1} style={styles.trackSubtitle}>
                      {artist.name}
                      {artistIndex < item.artists!.length - 1 ? ', ' : ''}
                    </Text>
                  </LoggedPressable>
                ))}
              </View>
            ) : (
              <Text numberOfLines={1} style={styles.trackSubtitle}>
                {item.subtitle}
              </Text>
            )}
          </View>
          <Ionicons
            name="ellipsis-horizontal"
            size={18}
            color="#CACACA"
          />
        </LoggedPressable>
      );
    },
    [currentTrack?.spotifyId, kind, playCollection, playerState.isPlaying]
  );

  return (
    <View style={styles.screen}>
      <FlatList
        data={visibleTracks}
        keyExtractor={(item) => item.id}
        renderItem={renderTrack}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.6}
        contentContainerStyle={{ paddingBottom: BOTTOM_NAVIGATION_HEIGHT + 112 }}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <>
            <View style={[styles.hero, { paddingTop: insets.top + 8 }]}>
            {kind === 'playlist' && imageURLs?.length ? (
              <PlaylistMosaic imageURLs={imageURLs} style={styles.heroArtwork} />
            ) : imageURL ? (
              <Image
                cachePolicy="memory-disk"
                source={{ uri: imageURL }}
                style={styles.heroArtwork}
                contentFit="cover"
              />
            ) : kind === 'artist' ? (
              <View style={styles.artistHeroFallback}>
                <Ionicons name="person" size={74} color="rgba(255,255,255,0.82)" />
              </View>
            ) : null}
            <LinearGradient
              colors={[
                'rgba(16,16,16,0.06)',
                'rgba(16,16,16,0.22)',
                'rgba(16,16,16,0.84)',
                '#101010',
              ]}
              locations={[0, 0.3, 0.74, 1]}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.topBar}>
              <NativeIconButton
                systemImage="chevron.left"
                iconName="chevron-back"
                label="Voltar"
                size={42}
                onPress={handleBack}
              />
              <GlassSurface glass="regular" isInteractive style={styles.topTools}>
                <LoggedPressable
                  accessibilityLabel={sortAscending ? 'Ordem original' : 'Ordenar por título'}
                  onPress={() => setSortAscending((value) => !value)}
                  style={styles.topToolAction}
                >
                  <Ionicons name="swap-vertical" size={20} color="#FFFFFF" />
                </LoggedPressable>
                <View style={styles.toolDivider} />
                <LoggedPressable
                  accessibilityLabel="Buscar"
                  onPress={() => router.push('/search' as Href)}
                  style={styles.topToolAction}
                >
                  <Ionicons name="search" size={19} color="#FFFFFF" />
                </LoggedPressable>
              </GlassSurface>
            </View>
            <View style={styles.heroCopy}>
              <Text style={styles.collectionTitle}>{title}</Text>
              {artists?.length ? (
                <View style={styles.artistLinks}>
                  {artists.map((artist, index) => (
                    <LoggedPressable
                      key={artist.id}
                      accessibilityLabel={`Abrir artista ${artist.name}`}
                      onPress={() => onArtistPress?.(artist.id)}
                      disabled={!onArtistPress}
                    >
                      <Text style={styles.artistName}>
                        {artist.name}{index < artists.length - 1 ? ' · ' : ''}
                      </Text>
                    </LoggedPressable>
                  ))}
                </View>
              ) : null}
              <Text style={styles.metadata}>{metadata}</Text>
              {description ? <Text style={styles.description}>{description}</Text> : null}
            </View>
            <View style={styles.actionRow}>
              <NativeIconButton
                systemImage="shuffle"
                iconName="shuffle"
                label="Tocar aleatório"
                size={44}
                onPress={() => void playCollection(true)}
              />
              <GlassSurface glass="regular" isInteractive style={styles.actionPill}>
                <LoggedPressable
                  accessibilityLabel={onAddTracksPress ? 'Adicionar músicas à playlist' : 'Adicionar faixas à fila'}
                  onPress={() => void handleAdd()}
                  style={styles.pillAction}
                >
                  <Ionicons name="add" size={22} color="#FFFFFF" />
                </LoggedPressable>
                <View style={styles.pillDivider} />
                <LoggedPressable
                  accessibilityLabel="Compartilhar"
                  onPress={() => void handleShare()}
                  style={styles.pillAction}
                >
                  <Ionicons name="share-outline" size={21} color="#FFFFFF" />
                </LoggedPressable>
                <View style={styles.pillDivider} />
                <LoggedPressable
                  accessibilityLabel={onDeletePress ? 'Excluir playlist' : 'Mais opções'}
                  onPress={() => {
                    if (onDeletePress) {
                      void onDeletePress();
                      return;
                    }
                    Alert.alert(title, 'Opções da coleção em breve.');
                  }}
                  style={styles.pillAction}
                >
                  <Ionicons
                    name={onDeletePress ? 'trash-outline' : 'ellipsis-horizontal'}
                    size={22}
                    color="#FFFFFF"
                  />
                </LoggedPressable>
              </GlassSurface>
              <NativeIconButton
                systemImage={isCollectionPlayback && playerState.isPlaying ? 'pause.fill' : 'play.fill'}
                iconName={isCollectionPlayback && playerState.isPlaying ? 'pause' : 'play'}
                label={isCollectionPlayback && playerState.isPlaying ? 'Pausar' : 'Tocar'}
                size={52}
                onPress={() => void handlePrimaryPlay()}
              />
            </View>
            </View>
            <View style={styles.contentTopSpacer} />
            {sectionTitle ? <Text style={styles.sectionTitle}>{sectionTitle}</Text> : null}
          </>
        }
        ListFooterComponent={footer ? <>{footer}</> : null}
        ListFooterComponentStyle={footer ? styles.listFooter : undefined}
        ListEmptyComponent={<Text style={styles.empty}>Nenhuma música nesta coleção.</Text>}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#101010' },
  hero: { backgroundColor: '#101010', minHeight: 426, paddingHorizontal: 14, justifyContent: 'space-between', overflow: 'hidden' },
  heroArtwork: { ...(StyleSheet.absoluteFill as any), opacity: 0.9 },
  artistHeroFallback: { ...(StyleSheet.absoluteFill as any), alignItems: 'center', backgroundColor: '#242424', justifyContent: 'center' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  topTools: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10 },
  topToolAction: { alignItems: 'center', justifyContent: 'center' },
  toolDivider: { width: StyleSheet.hairlineWidth, height: 20, backgroundColor: 'rgba(255,255,255,0.28)' },
  heroCopy: { alignItems: 'center', paddingHorizontal: 8, marginTop: 'auto' },
  collectionTitle: { color: '#FFFFFF', fontFamily: 'SF-Bold', fontSize: 28, lineHeight: 33, textAlign: 'center' },
  artistLinks: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: 5 },
  artistName: { color: '#D8C09A', fontFamily: 'SF-Bold', fontSize: 15, textAlign: 'center' },
  metadata: { color: 'rgba(255,255,255,0.78)', fontFamily: 'SF-Semibold', fontSize: 12, marginTop: 8, textAlign: 'center' },
  description: { color: 'rgba(255,255,255,0.7)', fontFamily: 'SF-Regular', fontSize: 13, lineHeight: 19, marginTop: 16, textAlign: 'center' },
  actionRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 22 },
  contentTopSpacer: { height: 18 },
  actionPill: { alignItems: 'center', borderRadius: 999, flexDirection: 'row', minHeight: 46, paddingHorizontal: 6 },
  pillAction: { alignItems: 'center', height: 42, justifyContent: 'center', width: 43 },
  pillDivider: { backgroundColor: 'rgba(255,255,255,0.2)', height: 22, width: StyleSheet.hairlineWidth },
  trackRow: { alignItems: 'center', borderBottomColor: 'rgba(255,255,255,0.09)', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 11, minHeight: 64, paddingHorizontal: 16, paddingVertical: 8 },
  trackArtwork: { borderRadius: 3, height: 42, width: 42 },
  artworkFallback: { alignItems: 'center', backgroundColor: '#292929', justifyContent: 'center' },
  trackNumber: { color: 'rgba(255,255,255,0.68)', fontFamily: 'SF-Regular', fontSize: 13, textAlign: 'center', width: 22 },
  trackCopy: { flex: 1, gap: 3 },
  trackTitleRow: { alignItems: 'center', flexDirection: 'row', gap: 7 },
  trackArtistLinks: { flexDirection: 'row', flexWrap: 'wrap' },
  trackTitle: { color: '#FFFFFF', flexShrink: 1, fontFamily: 'SF-Semibold', fontSize: 14 },
  trackTitleActive: { color: '#1ED760' },
  trackSubtitle: { color: 'rgba(255,255,255,0.58)', fontFamily: 'SF-Regular', fontSize: 12 },
  empty: { color: 'rgba(255,255,255,0.6)', fontFamily: 'SF-Regular', padding: 32, textAlign: 'center' },
  sectionTitle: { color: '#FFFFFF', fontFamily: 'SF-Bold', fontSize: 18, paddingBottom: 8, paddingHorizontal: 16 },
  listFooter: { paddingTop: 18 },
});

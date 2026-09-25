import * as React from 'react';
import {
  Alert,
  FlatList,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Href, useRouter, useSegments } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TrackModel } from '@models';
import { BOTTOM_NAVIGATION_HEIGHT } from '@config';
import { useDownloads, usePlayer } from '@context';
import type { DownloadTrackInput } from '@services';
import { formatCollectionMeta } from '@utils';
import { GlassSurface, LoggedPressable, NativeIconButton } from '../native';
import { PlaylistMosaic } from '../PlaylistMosaic';
import { SoundWaveIcon } from '../Home/FriendActivityStatus/NoteBubble';

type CollectionTrack = TrackModel & {
  localAudioPath?: string;
  localImagePath?: string;
  audioUrl?: string;
  streamUrl?: string;
  releaseDate?: string;
};
type ExtraTrackSection = {
  id: string;
  title: string;
  tracks: CollectionTrack[];
};

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
  onArtistPress?: (artistId: string, artistName: string) => void | Promise<void>;
  onDeletePress?: () => void | Promise<void>;
  onEndReached?: () => void;
  onSharePress?: () => void | Promise<void>;
  resolveTracksForPlayback?: () => Promise<CollectionTrack[]>;
  sectionTitle?: string;
  disableTrackArtistLinks?: boolean;
  extraTrackSections?: ExtraTrackSection[];
  footer?: React.ReactNode;
};

const toPlayerTrack = (track: CollectionTrack, collectionName: string) => ({
  spotifyId: track.id,
  title: track.title,
  artistName: track.subtitle,
  albumName: track.albumName || collectionName,
  imageURL: track.localImagePath || track.imageURL || '',
  localAudioPath: track.localAudioPath,
  streamUrl: track.streamUrl || track.audioUrl,
  releaseDate: track.releaseDate,
  duration_ms: track.durationMs || 0,
  artists: track.artists,
  albumId: track.albumId,
  albumArtists: track.albumArtists,
  youtubeVideoId: track.youtubeVideoId,
  youtubeUrl: track.youtubeUrl,
});

const normalizeSearchValue = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .trim();

const getTrackArtists = (track: CollectionTrack) => {
  if (track.artists?.length) return track.artists;
  return track.subtitle
    .split(/\s*(?:,|&|feat\.?|ft\.?|·)\s*/i)
    .map((name) => ({ id: '', name: name.trim() }))
    .filter((artist) => artist.name);
};

const trackMatchesSearch = (track: CollectionTrack, query: string) => {
  if (!query) return true;
  const searchable = [
    track.title,
    track.subtitle,
    track.albumName || '',
    ...getTrackArtists(track).map((artist) => artist.name),
  ]
    .map(normalizeSearchValue)
    .join(' ');
  return searchable.includes(query);
};

const toDownloadInput = (
  track: CollectionTrack,
  collectionName: string
): DownloadTrackInput => ({
  spotifyId: track.id,
  title: track.title,
  artistName: track.subtitle,
  albumName: track.albumName || collectionName,
  imageURL: track.imageURL || '',
  duration_ms: track.durationMs || 0,
  artists: track.artists,
  albumId: track.albumId,
  albumArtists: track.albumArtists,
  youtubeVideoId: track.youtubeVideoId,
  youtubeUrl: track.youtubeUrl,
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
  disableTrackArtistLinks = false,
  extraTrackSections = [],
  footer,
}: CollectionDetailProps) => {
  const router = useRouter();
  const segments = useSegments();
  const insets = useSafeAreaInsets();
  const [sortAscending, setSortAscending] = React.useState(false);
  const [isSearchOpen, setIsSearchOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');
  const { downloads, enqueueDownloads } = useDownloads();
  const {
    addToQueue,
    currentTrack,
    isLoadingAudio,
    isShuffle,
    playerState,
    playWithQueue,
    queueSourceId,
    togglePlayPause,
    toggleShuffle,
  } = usePlayer();
  const downloadsById = React.useMemo(
    () => new Map(downloads.map((download) => [download.spotifyId, download])),
    [downloads]
  );
  const collectionPlaybackId = `${kind}:${collectionId}`;
  const isCollectionPlayback = Boolean(
    queueSourceId === collectionPlaybackId ||
      queueSourceId?.startsWith(`${collectionPlaybackId}:`)
  );
  const isCollectionPlaying =
    isCollectionPlayback && (playerState.isPlaying || isLoadingAudio);
  const isCollectionShuffleActive = isCollectionPlayback && isShuffle;
  const metadata = metadataProp || formatCollectionMeta({
    createdAt,
    trackCount: trackCount ?? tracks.length,
    totalDurationMs:
      totalDurationMs ?? tracks.reduce((total, track) => total + (track.durationMs || 0), 0),
  });
  const normalizedSearchQuery = normalizeSearchValue(searchQuery);
  const visibleTracks = React.useMemo(() => {
    const filtered = tracks.filter((track) =>
      trackMatchesSearch(track, normalizedSearchQuery)
    );
    return sortAscending
      ? [...filtered].sort((first, second) => first.title.localeCompare(second.title))
      : filtered;
  }, [normalizedSearchQuery, sortAscending, tracks]);
  const visibleExtraSections = React.useMemo(
    () =>
      extraTrackSections
        .map((section) => ({
          ...section,
          tracks: section.tracks.filter((track) =>
            trackMatchesSearch(track, normalizedSearchQuery)
          ),
        }))
        .filter((section) => section.tracks.length > 0),
    [extraTrackSections, normalizedSearchQuery]
  );

  const playTrackList = React.useCallback(
    async (
      sourceTracks: CollectionTrack[],
      startIndex = 0,
      sourceId = collectionPlaybackId,
      shuffled = false
    ) => {
      const playableTracks = sourceTracks;
      const playerTracks = playableTracks.map((track) => toPlayerTrack(track, title));
      if (playerTracks.length === 0) return;
      await playWithQueue(playerTracks, startIndex, sourceId, {
        shuffle: shuffled,
      });
    },
    [
      collectionPlaybackId,
      playWithQueue,
      title,
    ]
  );

  const playCollection = React.useCallback(
    async (shuffled = false, startIndex = 0) => {
      const playableTracks = resolveTracksForPlayback
        ? await resolveTracksForPlayback()
        : tracks;
      await playTrackList(
        playableTracks,
        startIndex,
        collectionPlaybackId,
        shuffled
      );
    },
    [collectionPlaybackId, playTrackList, resolveTracksForPlayback, tracks]
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

  const handleDownloadTrack = React.useCallback(
    (track: CollectionTrack) => {
      if (track.isDownloaded) return;
      const download = downloadsById.get(track.id);
      if (
        download?.status === 'queued' ||
        download?.status === 'resolving' ||
        download?.status === 'downloading' ||
        download?.status === 'completed'
      ) return;
      enqueueDownloads([toDownloadInput(track, title)]);
    },
    [downloadsById, enqueueDownloads, title]
  );

  const handleDownloadCollection = React.useCallback(() => {
    const pending = tracks.filter((track) => {
      if (track.isDownloaded) return false;
      const download = downloadsById.get(track.id);
      return !download || download.status === 'error';
    });
    if (pending.length) {
      enqueueDownloads(pending.map((track) => toDownloadInput(track, title)));
    }
  }, [downloadsById, enqueueDownloads, title, tracks]);

  const collectionDownloadState = React.useMemo(() => {
    if (!tracks.length) return 'empty' as const;
    const statuses = tracks.map((track) =>
      track.isDownloaded ? 'completed' : downloadsById.get(track.id)?.status
    );
    if (statuses.every((status) => status === 'completed')) return 'completed' as const;
    if (statuses.some((status) =>
      status === 'queued' || status === 'resolving' || status === 'downloading'
    )) return 'active' as const;
    return 'idle' as const;
  }, [downloadsById, tracks]);

  const handlePrimaryPlay = React.useCallback(async () => {
    if (isCollectionPlayback) {
      await togglePlayPause();
      return;
    }
    await playCollection();
  }, [isCollectionPlayback, playCollection, togglePlayPause]);

  const handleShufflePlay = React.useCallback(async () => {
    if (isCollectionPlayback) {
      toggleShuffle();
      return;
    }
    await playCollection(true);
  }, [isCollectionPlayback, playCollection, toggleShuffle]);

  const closeSearch = React.useCallback(() => {
    setSearchQuery('');
    setIsSearchOpen(false);
  }, []);

  const openSearch = React.useCallback(() => {
    setIsSearchOpen(true);
    if (resolveTracksForPlayback) {
      void resolveTracksForPlayback().catch(() => {});
    }
  }, [resolveTracksForPlayback]);

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

  const renderTrackRow = React.useCallback(
    (
      item: CollectionTrack,
      index: number,
      sourceTracks: CollectionTrack[],
      sourceId: string
    ) => {
      const active = currentTrack?.spotifyId === item.id;
      const download = downloadsById.get(item.id);
      const downloadState = item.isDownloaded || download?.status === 'completed'
        ? 'completed'
        : download?.status === 'queued' ||
            download?.status === 'resolving' ||
            download?.status === 'downloading'
          ? 'active'
          : 'idle';
      const rowArtists = getTrackArtists(item);
      const shouldLinkArtists = Boolean(
        rowArtists.length && onArtistPress && !disableTrackArtistLinks
      );
      return (
        <LoggedPressable
          accessibilityLabel={`Tocar ${item.title}`}
          onPress={() => void playTrackList(sourceTracks, index, sourceId)}
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
            {shouldLinkArtists ? (
              <View style={styles.trackArtistLinks}>
                {rowArtists.map((artist, artistIndex) => (
                  <LoggedPressable
                    key={`${artist.id || artist.name}-${artistIndex}`}
                    accessibilityLabel={`Abrir artista ${artist.name}`}
                    onPress={(event) => {
                      event.stopPropagation();
                      void onArtistPress?.(artist.id, artist.name);
                    }}
                  >
                    <Text numberOfLines={1} style={styles.trackSubtitle}>
                      {artist.name}
                      {artistIndex < rowArtists.length - 1 ? ', ' : ''}
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
          <LoggedPressable
            accessibilityLabel={
              downloadState === 'completed'
                ? `${item.title} está baixada`
                : `Baixar ${item.title}`
            }
            disabled={downloadState !== 'idle'}
            onPress={(event) => {
              event.stopPropagation();
              handleDownloadTrack(item);
            }}
            style={styles.trackAction}
          >
            <Ionicons
              name={
                downloadState === 'completed'
                  ? 'checkmark-circle'
                  : downloadState === 'active'
                    ? 'time-outline'
                    : 'download-outline'
              }
              size={19}
              color={downloadState === 'completed' ? '#1ED760' : '#CACACA'}
            />
          </LoggedPressable>
        </LoggedPressable>
      );
    },
    [
      currentTrack?.spotifyId,
      disableTrackArtistLinks,
      kind,
      downloadsById,
      handleDownloadTrack,
      onArtistPress,
      playTrackList,
      playerState.isPlaying,
    ]
  );
  const renderTrack = React.useCallback(
    ({ item, index }: { item: CollectionTrack; index: number }) =>
      renderTrackRow(item, index, visibleTracks, collectionPlaybackId),
    [collectionPlaybackId, renderTrackRow, visibleTracks]
  );

  const extraSections = visibleExtraSections;

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
              <GlassSurface
                glass="regular"
                isInteractive
                style={[styles.topTools, isSearchOpen && styles.topToolsExpanded]}
              >
                {isSearchOpen ? (
                  <>
                    <Ionicons name="search" size={18} color="rgba(255,255,255,0.72)" />
                    <TextInput
                      accessibilityLabel="Buscar nesta coleção"
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoFocus
                      onChangeText={setSearchQuery}
                      placeholder="Buscar nesta coleção"
                      placeholderTextColor="rgba(255,255,255,0.52)"
                      returnKeyType="search"
                      selectionColor="#1ED760"
                      style={styles.searchInput}
                      value={searchQuery}
                    />
                    <LoggedPressable
                      accessibilityLabel="Fechar busca"
                      onPress={closeSearch}
                      style={styles.topToolAction}
                    >
                      <Ionicons name="close-circle" size={20} color="rgba(255,255,255,0.72)" />
                    </LoggedPressable>
                  </>
                ) : (
                  <>
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
                      onPress={openSearch}
                      style={styles.topToolAction}
                    >
                      <Ionicons name="search" size={19} color="#FFFFFF" />
                    </LoggedPressable>
                  </>
                )}
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
                      onPress={() => void onArtistPress?.(artist.id, artist.name)}
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
                label={isCollectionShuffleActive ? 'Desativar aleatório' : 'Tocar aleatório'}
                size={44}
                tint={isCollectionShuffleActive ? '#1ED760' : '#FFFFFF'}
                onPress={() => void handleShufflePlay()}
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
                  accessibilityLabel={
                    collectionDownloadState === 'completed'
                      ? 'Coleção baixada'
                      : 'Baixar coleção'
                  }
                  disabled={
                    collectionDownloadState === 'completed' ||
                    collectionDownloadState === 'active' ||
                    collectionDownloadState === 'empty'
                  }
                  onPress={handleDownloadCollection}
                  style={styles.pillAction}
                >
                  <Ionicons
                    name={
                      collectionDownloadState === 'completed'
                        ? 'checkmark-circle'
                        : collectionDownloadState === 'active'
                          ? 'time-outline'
                          : 'download-outline'
                    }
                    size={21}
                    color={collectionDownloadState === 'completed' ? '#1ED760' : '#FFFFFF'}
                  />
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
                systemImage={isCollectionPlaying ? 'pause.fill' : 'play.fill'}
                iconName={isCollectionPlaying ? 'pause' : 'play'}
                label={isCollectionPlaying ? 'Pausar' : 'Tocar'}
                size={52}
                onPress={() => void handlePrimaryPlay()}
              />
            </View>
            </View>
            <View style={styles.contentTopSpacer} />
            {sectionTitle && visibleTracks.length ? <Text style={styles.sectionTitle}>{sectionTitle}</Text> : null}
          </>
        }
        ListFooterComponent={
          extraSections.length || footer ? (
            <>
              {extraSections.map((section) => (
                <View key={section.id} style={styles.extraSection}>
                  <Text style={styles.sectionTitle}>{section.title}</Text>
                  {section.tracks.map((track, index) => (
                    <React.Fragment key={track.id}>
                      {renderTrackRow(
                        track,
                        index,
                        section.tracks,
                        `${collectionPlaybackId}:${section.id}`
                      )}
                    </React.Fragment>
                  ))}
                </View>
              ))}
              {footer}
            </>
          ) : null
        }
        ListFooterComponentStyle={
          extraSections.length || footer ? styles.listFooter : undefined
        }
        ListEmptyComponent={
          extraSections.length ? null : (
            <Text style={styles.empty}>
              {normalizedSearchQuery
                ? 'Nenhuma música encontrada.'
                : 'Nenhuma música nesta coleção.'}
            </Text>
          )
        }
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
  topTools: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 999, minHeight: 42, paddingHorizontal: 14, paddingVertical: 10 },
  topToolsExpanded: { flex: 1, marginLeft: 12, maxWidth: 286 },
  topToolAction: { alignItems: 'center', justifyContent: 'center' },
  toolDivider: { width: StyleSheet.hairlineWidth, height: 20, backgroundColor: 'rgba(255,255,255,0.28)' },
  searchInput: { color: '#FFFFFF', flex: 1, fontFamily: 'SF-Regular', fontSize: 14, height: 22, padding: 0 },
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
  trackAction: { alignItems: 'center', height: 42, justifyContent: 'center', width: 38 },
  empty: { color: 'rgba(255,255,255,0.6)', fontFamily: 'SF-Regular', padding: 32, textAlign: 'center' },
  sectionTitle: { color: '#FFFFFF', fontFamily: 'SF-Bold', fontSize: 18, paddingBottom: 8, paddingHorizontal: 16 },
  extraSection: { paddingTop: 20 },
  listFooter: { paddingTop: 18 },
});

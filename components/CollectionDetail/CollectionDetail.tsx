import * as React from 'react';
import {
  FlatList,
  Keyboard,
  Modal,
  RefreshControl,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Href, useRouter, useSegments } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TrackModel } from '@models';
import { BOTTOM_NAVIGATION_HEIGHT } from '@config';
import { useDownloads, usePlayer } from '@context';
import type { DownloadTrackInput } from '@services';
import { formatCollectionMeta, log } from '@utils';
import { GlassSurface, LoggedPressable, NativeIconButton } from '../native';
import { DownloadActionIcon } from '../native/DownloadActionIcon';
import { PlaylistMosaic } from '../PlaylistMosaic';
import { SoundWaveIcon } from '../Home/FriendActivityStatus/NoteBubble';
import { MarqueeText } from '../common/MarqueeText';
import { SkeletonImage } from '../common/SkeletonImage';
import { findArtistIdByName, getArtistCatalogImage } from '@api';
import { getCachedArtistImage } from '@services';
import { useDetailNavigation } from '@hooks';

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

const ARTIST_TRACKS_PAGE_SIZE = 15;

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
  artists?: { id: string; name: string; imageURL?: string }[];
  onAddTracksPress?: () => void | Promise<void>;
  onArtistPress?: (artistId: string, artistName: string) => void | Promise<void>;
  onDeletePress?: () => void | Promise<void>;
  onEditPress?: () => void | Promise<void>;
  onEndReached?: () => void;
  onSharePress?: () => void | Promise<void>;
  resolveTracksForPlayback?: () => Promise<CollectionTrack[]>;
  sectionTitle?: string;
  disableTrackArtistLinks?: boolean;
  extraTrackSections?: ExtraTrackSection[];
  footer?: React.ReactNode;
  onRefresh?: () => void | Promise<void>;
  refreshing?: boolean;
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

const hasTrackArtistCredit = (track: CollectionTrack) =>
  getTrackArtists(track).some(({ name }) => {
    const normalized = name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLocaleLowerCase();
    return normalized.length > 0 && ![
      'artista',
      'artista desconhecido',
      'artista nao identificado',
      'desconhecido',
      'unknown',
      'unknown artist',
    ].includes(normalized);
  });

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
  onEditPress,
  onEndReached,
  onSharePress,
  resolveTracksForPlayback,
  sectionTitle,
  disableTrackArtistLinks = false,
  extraTrackSections = [],
  footer,
  onRefresh,
  refreshing = false,
}: CollectionDetailProps) => {
  const router = useRouter();
  const { openDetail } = useDetailNavigation();
  const segments = useSegments();
  const insets = useSafeAreaInsets();
  const [sortAscending, setSortAscending] = React.useState(false);
  const [isSearchOpen, setIsSearchOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [artistTrackLimit, setArtistTrackLimit] = React.useState(ARTIST_TRACKS_PAGE_SIZE);
  const [artistSectionLimits, setArtistSectionLimits] = React.useState<Record<string, number>>({});
  const [isArtistListVisible, setIsArtistListVisible] = React.useState(false);
  const [artistImageLoadLimit, setArtistImageLoadLimit] = React.useState(8);
  const [isLoadingAllArtists, setIsLoadingAllArtists] = React.useState(false);
  const [resolvedArtistTracks, setResolvedArtistTracks] = React.useState<{
    collectionId: string;
    tracks: CollectionTrack[];
  } | null>(null);
  const [artistImages, setArtistImages] = React.useState<Record<string, string>>({});
  const attemptedArtistImages = React.useRef(new Set<string>());
  const isMountedRef = React.useRef(true);
  const { downloads, enqueueDownloads } = useDownloads();
  const {
    addToQueue,
    currentTrack,
    isLoadingAudio,
    isShuffle,
    isPlaying,
    playWithQueue,
    queueSourceId,
    togglePlayPause,
    toggleShuffle,
  } = usePlayer((state) => ({
    addToQueue: state.addToQueue,
    currentTrack: state.currentTrack,
    isLoadingAudio: state.isLoadingAudio,
    isShuffle: state.isShuffle,
    isPlaying: state.playerState.isPlaying,
    playWithQueue: state.playWithQueue,
    queueSourceId: state.queueSourceId,
    togglePlayPause: state.togglePlayPause,
    toggleShuffle: state.toggleShuffle,
  }));
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
    isCollectionPlayback && (isPlaying || isLoadingAudio);
  const isCollectionShuffleActive = isCollectionPlayback && isShuffle;
  const metadata = metadataProp || formatCollectionMeta({
    createdAt,
    trackCount: trackCount ?? tracks.length,
    totalDurationMs:
      totalDurationMs ?? tracks.reduce((total, track) => total + (track.durationMs || 0), 0),
  });
  const normalizedSearchQuery = normalizeSearchValue(searchQuery);
  const matchingTracks = React.useMemo(() => {
    const filtered = tracks.filter((track) =>
      hasTrackArtistCredit(track) && trackMatchesSearch(track, normalizedSearchQuery)
    );
    return sortAscending
      ? [...filtered].sort((first, second) => first.title.localeCompare(second.title))
      : filtered;
  }, [normalizedSearchQuery, sortAscending, tracks]);
  const visibleTracks = React.useMemo(
    () => kind === 'artist' && !normalizedSearchQuery
      ? matchingTracks.slice(0, artistTrackLimit)
      : matchingTracks,
    [artistTrackLimit, kind, matchingTracks, normalizedSearchQuery]
  );
  const matchingExtraSections = React.useMemo(
    () =>
      extraTrackSections
        .map((section) => ({
          ...section,
          tracks: section.tracks.filter((track) =>
            hasTrackArtistCredit(track) && trackMatchesSearch(track, normalizedSearchQuery)
          ),
        }))
        .filter((section) => section.tracks.length > 0),
    [extraTrackSections, normalizedSearchQuery]
  );
  const visibleExtraSections = React.useMemo(
    () => matchingExtraSections.map((section) => ({
      ...section,
      visibleTracks: kind === 'artist' && !normalizedSearchQuery
        ? section.tracks.slice(0, artistSectionLimits[section.id] || ARTIST_TRACKS_PAGE_SIZE)
        : section.tracks,
    })),
    [artistSectionLimits, kind, matchingExtraSections, normalizedSearchQuery]
  );
  const allArtistTracks =
    resolvedArtistTracks?.collectionId === collectionId
      ? resolvedArtistTracks.tracks
      : tracks;
  const collectionArtists = React.useMemo(() => {
    const byKey = new Map<string, { id: string; name: string; imageURL?: string }>();
    const addArtist = (artist: { id?: string; name?: string; imageURL?: string }) => {
      const name = artist.name?.trim();
      if (!name) return;
      const id = artist.id?.trim() || '';
      const key = (id || name).toLocaleLowerCase();
      const previous = byKey.get(key);
      byKey.set(key, {
        id: id || previous?.id || '',
        name: previous?.name || name,
        imageURL: artist.imageURL || previous?.imageURL,
      });
    };
    artists?.forEach(addArtist);
    [...allArtistTracks, ...extraTrackSections.flatMap((section) => section.tracks)].forEach((track) =>
      getTrackArtists(track).forEach(addArtist)
    );
    return [...byKey.values()];
  }, [allArtistTracks, artists, extraTrackSections]);

  React.useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  React.useEffect(() => {
    setArtistTrackLimit(ARTIST_TRACKS_PAGE_SIZE);
    setArtistSectionLimits({});
  }, [collectionId, kind]);

  React.useEffect(() => {
    const prioritizedArtists = collectionArtists.slice(
      0,
      isArtistListVisible ? artistImageLoadLimit : 4
    );
    const unresolved = prioritizedArtists.filter((artist) =>
      !artist.imageURL &&
      !artistImages[artist.name] &&
      !artistImages[artist.id] &&
      !attemptedArtistImages.current.has(artist.id || artist.name.toLocaleLowerCase())
    );
    if (!unresolved.length) return;
    unresolved.forEach((artist) =>
      attemptedArtistImages.current.add(artist.id || artist.name.toLocaleLowerCase())
    );
    void (async () => {
      for (let index = 0; index < unresolved.length; index += 4) {
        const batch = await Promise.all(unresolved.slice(index, index + 4).map(async (artist) => {
          const imageURL = await getCachedArtistImage(
            artist.name,
            () => getArtistCatalogImage(artist.id, artist.name),
            [artist.id]
          );
          return [artist.name, artist.id, imageURL] as [string, string, string];
        }));
        const successfulResults = batch.filter(([, , imageURL]) => Boolean(imageURL));
        if (isMountedRef.current && successfulResults.length) {
          setArtistImages((current) => {
            const next = { ...current };
            successfulResults.forEach(([name, id, imageURL]) => {
              next[name] = imageURL;
              if (id) next[id] = imageURL;
            });
            return next;
          });
        }
      }
    })().catch((error) => {
      unresolved.forEach((artist) =>
        attemptedArtistImages.current.delete(artist.id || artist.name.toLocaleLowerCase())
      );
      log.error('load collection artist images failed', { collectionId, error });
    });
  }, [artistImageLoadLimit, artistImages, collectionArtists, collectionId, isArtistListVisible]);

  const handleCollectionArtistPress = React.useCallback(async (artist: { id: string; name: string }) => {
    if (onArtistPress) {
      await onArtistPress(artist.id, artist.name);
      return;
    }
    const routeId = artist.id.startsWith('ytartist_') || artist.id.startsWith('local_artist_')
      ? artist.id
      : artist.id && /^[A-Za-z0-9]{22}$/.test(artist.id)
        ? artist.id
        : (await findArtistIdByName(artist.name)) || `ytartist_name_${encodeURIComponent(artist.name)}`;
    openDetail('artist', routeId);
  }, [onArtistPress, openDetail]);

  const openArtistList = React.useCallback(() => {
    setArtistImageLoadLimit(8);
    setIsArtistListVisible(true);
    if (isLoadingAllArtists || kind !== 'playlist' || !resolveTracksForPlayback || !trackCount || tracks.length >= trackCount) return;
    setIsLoadingAllArtists(true);
    log.ui('load complete playlist artist credits', { collectionId, loaded: tracks.length, total: trackCount });
    void resolveTracksForPlayback()
      .then((allTracks) => setResolvedArtistTracks({ collectionId, tracks: allTracks }))
      .catch((error) => log.error('load playlist artist credits failed', { collectionId, error }))
      .finally(() => setIsLoadingAllArtists(false));
  }, [collectionId, isLoadingAllArtists, kind, resolveTracksForPlayback, trackCount, tracks.length]);

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
    Keyboard.dismiss();
    setSearchQuery('');
    setIsSearchOpen(false);
    log.ui('close collection search', { kind, collectionId });
  }, [collectionId, kind]);

  const openSearch = React.useCallback(() => {
    log.ui('open collection search', { kind, collectionId });
    setIsSearchOpen(true);
    if (resolveTracksForPlayback) {
      void resolveTracksForPlayback().catch(() => {});
    }
  }, [collectionId, kind, resolveTracksForPlayback]);

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
              <SkeletonImage
                cachePolicy="memory-disk"
                priority="high"
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
              {active && isPlaying ? (
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
            {downloadState === 'idle' ? (
              <DownloadActionIcon size={19} color="#CACACA" />
            ) : (
              <Ionicons
                name={downloadState === 'completed' ? 'checkmark-circle' : 'time-outline'}
                size={19}
                color={downloadState === 'completed' ? '#1ED760' : '#CACACA'}
              />
            )}
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
      isPlaying,
    ]
  );
  const renderTrack = React.useCallback(
    ({ item, index }: { item: CollectionTrack; index: number }) =>
      renderTrackRow(item, index, matchingTracks, collectionPlaybackId),
    [collectionPlaybackId, matchingTracks, renderTrackRow]
  );

  const extraSections = visibleExtraSections;
  const hasMoreArtistTracks = kind === 'artist' && !normalizedSearchQuery &&
    visibleTracks.length < matchingTracks.length;

  return (
    <View style={styles.screen}>
      <FlatList
        testID="collection-track-list"
        data={visibleTracks}
        keyExtractor={(item) => item.id}
        renderItem={renderTrack}
        initialNumToRender={kind === 'artist' ? ARTIST_TRACKS_PAGE_SIZE : undefined}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.6}
        contentContainerStyle={{ paddingBottom: BOTTOM_NAVIGATION_HEIGHT + 112 }}
        showsVerticalScrollIndicator={false}
        refreshControl={onRefresh ? (
          <RefreshControl
            tintColor="#FFFFFF"
            colors={['#1DB954']}
            refreshing={refreshing}
            onRefresh={() => void onRefresh()}
          />
        ) : undefined}
        ListHeaderComponent={
          <>
            <View style={[styles.hero, { paddingTop: insets.top + 8 }]}>
            {kind === 'playlist' && imageURLs?.length ? (
              <PlaylistMosaic imageURLs={imageURLs} style={styles.heroArtwork} />
            ) : imageURL ? (
              <SkeletonImage
                testID={kind === 'artist' ? 'collection-artwork' : undefined}
                cachePolicy="memory-disk"
                priority="high"
                source={{ uri: imageURL }}
                style={[styles.heroArtwork, kind === 'artist' && styles.artistHeroArtwork]}
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
            <View style={[styles.heroCopy, kind !== 'artist' && styles.collectionHeroCopy, kind === 'artist' && styles.artistHeroCopy]}>
              <Text style={[styles.collectionTitle, kind === 'artist' && styles.artistCollectionTitle]}>{title}</Text>
              {kind !== 'artist' && collectionArtists.length ? (
                <View style={styles.collectionArtistsRow}>
                  <LoggedPressable
                    accessibilityLabel={`Ver ${collectionArtists.length} artistas`}
                    onPress={openArtistList}
                    style={styles.artistAvatarStack}
                  >
                    {collectionArtists.slice(0, 4).map((artist, index) => {
      const uri = artist.imageURL || artistImages[artist.name] || artistImages[artist.id];
                      return (
                        <View key={`${artist.id}-${artist.name}`} style={[styles.artistAvatar, index > 0 && styles.artistAvatarOverlap, { zIndex: 4 - index }]}>
                          {uri ? <SkeletonImage source={{ uri }} cachePolicy="memory-disk" contentFit="cover" style={styles.artistAvatarImage} /> : <Ionicons name="person" size={15} color="#DDD" />}
                        </View>
                      );
                    })}
                  </LoggedPressable>
                  <MarqueeText
                    text={collectionArtists.map((artist) => artist.name).join(' · ')}
                    style={styles.artistName}
                    containerStyle={styles.collectionArtistMarquee}
                    speed={28}
                    delay={2000}
                    endDelay={2000}
                    fadeWidth={8}
                    scrollMode="left"
                  >
                    {collectionArtists.map((artist, index) => (
                      <React.Fragment key={`${artist.id}-${artist.name}`}>
                        {index > 0 ? ' · ' : null}
                        <Text
                          accessibilityRole="link"
                          accessibilityLabel={`Abrir artista ${artist.name}`}
                          onPress={() => void handleCollectionArtistPress(artist)}
                        >{artist.name}</Text>
                      </React.Fragment>
                    ))}
                  </MarqueeText>
                </View>
              ) : null}
              {metadata ? <Text style={[styles.metadata, kind !== 'artist' && styles.collectionMetadata]}>{metadata}</Text> : null}
              {description ? <Text style={styles.description}>{description}</Text> : null}
            </View>
            <View style={[styles.actionRow, kind !== 'artist' && styles.collectionActionRow]}>
              <NativeIconButton
                systemImage="shuffle"
                iconName="shuffle"
                label={isCollectionShuffleActive ? 'Desativar aleatório' : 'Tocar aleatório'}
                size={44}
                tint={isCollectionShuffleActive ? '#1ED760' : '#FFFFFF'}
                onPress={() => void handleShufflePlay()}
              />
              <GlassSurface glass="regular" isInteractive style={styles.actionPill}>
                {kind === 'playlist' && onAddTracksPress ? (
                  <>
                    <LoggedPressable
                      accessibilityLabel="Adicionar músicas à playlist"
                      onPress={() => void handleAdd()}
                      style={styles.pillAction}
                    ><Ionicons name="add" size={22} color="#FFFFFF" /></LoggedPressable>
                    <View style={styles.pillDivider} />
                  </>
                ) : null}
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
                  {collectionDownloadState === 'idle' ? (
                    <DownloadActionIcon size={21} color="#FFFFFF" />
                  ) : (
                    <Ionicons
                      name={collectionDownloadState === 'completed' ? 'checkmark-circle' : 'time-outline'}
                      size={21}
                      color={collectionDownloadState === 'completed' ? '#1ED760' : '#FFFFFF'}
                    />
                  )}
                </LoggedPressable>
                <View style={styles.pillDivider} />
                <LoggedPressable
                  accessibilityLabel={onEditPress ? 'Editar playlist' : 'Compartilhar'}
                  onPress={() => void (onEditPress ? onEditPress() : handleShare())}
                  style={styles.pillAction}
                >
                  <Ionicons
                    name={onEditPress ? 'pencil-outline' : 'share-outline'}
                    size={21}
                    color="#FFFFFF"
                  />
                </LoggedPressable>
                {onDeletePress ? <>
                  <View style={styles.pillDivider} />
                  <LoggedPressable accessibilityLabel="Excluir playlist" onPress={() => void onDeletePress()} style={styles.pillAction}>
                    <Ionicons name="trash-outline" size={21} color="#FFFFFF" />
                  </LoggedPressable>
                </> : null}
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
          hasMoreArtistTracks || extraSections.length || footer ? (
            <>
              {hasMoreArtistTracks ? (
                <LoggedPressable
                  accessibilityRole="button"
                  accessibilityLabel="Mostrar mais músicas do artista"
                  onPress={() => setArtistTrackLimit((limit) => limit + ARTIST_TRACKS_PAGE_SIZE)}
                  style={styles.showMoreTracks}
                >
                  <Text style={styles.showMoreTracksText}>Mostrar mais</Text>
                </LoggedPressable>
              ) : null}
              {extraSections.map((section) => (
                <View key={section.id} style={styles.extraSection}>
                  <Text style={styles.sectionTitle}>{section.title}</Text>
                  {section.visibleTracks.map((track, index) => (
                    <React.Fragment key={track.id}>
                      {renderTrackRow(
                        track,
                        index,
                        section.tracks,
                        `${collectionPlaybackId}:${section.id}`
                      )}
                    </React.Fragment>
                  ))}
                  {kind === 'artist' && !normalizedSearchQuery &&
                  section.visibleTracks.length < section.tracks.length ? (
                    <LoggedPressable
                      accessibilityRole="button"
                      accessibilityLabel={`Mostrar mais de ${section.title.toLocaleLowerCase()}`}
                      onPress={() => setArtistSectionLimits((limits) => ({
                        ...limits,
                        [section.id]: (limits[section.id] || ARTIST_TRACKS_PAGE_SIZE) + ARTIST_TRACKS_PAGE_SIZE,
                      }))}
                      style={styles.showMoreTracks}
                    >
                      <Text style={styles.showMoreTracksText}>Mostrar mais</Text>
                    </LoggedPressable>
                  ) : null}
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
      <Modal
        animationType="slide"
        onRequestClose={() => setIsArtistListVisible(false)}
        transparent
        visible={isArtistListVisible}
      >
        <View style={styles.artistModalBackdrop}>
          <View style={styles.artistModal}>
            <View style={styles.artistModalHeader}>
              <Text style={styles.artistModalTitle}>Artistas</Text>
              <LoggedPressable accessibilityLabel="Fechar artistas" onPress={() => setIsArtistListVisible(false)} style={styles.artistModalClose}>
                <Ionicons name="close" size={22} color="#FFF" />
              </LoggedPressable>
            </View>
            {isLoadingAllArtists ? <Text style={styles.artistModalLoading}>Carregando créditos da playlist…</Text> : null}
            <ScrollView
              contentContainerStyle={{ paddingBottom: Math.max(24, insets.bottom + 12) }}
              keyboardShouldPersistTaps="handled"
              onScroll={(event) => {
                const { contentOffset, layoutMeasurement } = event.nativeEvent;
                const visibleLimit = Math.min(
                  collectionArtists.length,
                  Math.ceil((contentOffset.y + layoutMeasurement.height) / 64) + 4
                );
                setArtistImageLoadLimit((current) => Math.max(current, visibleLimit));
              }}
              scrollEventThrottle={200}
              showsVerticalScrollIndicator={false}
              style={styles.artistModalScroll}
              testID="collection-artists-scroll-view"
            >
              {collectionArtists.map((artist) => {
                const uri = artist.imageURL || artistImages[artist.name] || artistImages[artist.id];
                return (
                  <LoggedPressable
                    key={`artist-modal-${artist.id}-${artist.name}`}
                    accessibilityLabel={`Abrir artista ${artist.name}`}
                    onPress={() => {
                      setIsArtistListVisible(false);
                      void handleCollectionArtistPress(artist);
                    }}
                    style={styles.artistModalRow}
                  >
                    {uri ? <SkeletonImage source={{ uri }} cachePolicy="memory-disk" contentFit="cover" style={styles.artistModalImage} /> : <View style={[styles.artistModalImage, styles.artistModalFallback]}><Ionicons name="person" size={20} color="#DDD" /></View>}
                    <Text numberOfLines={1} style={styles.artistModalName}>{artist.name}</Text>
                    <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.55)" />
                  </LoggedPressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#101010' },
  hero: { backgroundColor: '#101010', minHeight: 426, paddingHorizontal: 14, justifyContent: 'space-between', overflow: 'hidden' },
  heroArtwork: { ...(StyleSheet.absoluteFill as any), opacity: 0.9 },
  artistHeroArtwork: { opacity: 1 },
  artistHeroFallback: { ...(StyleSheet.absoluteFill as any), alignItems: 'center', backgroundColor: '#242424', justifyContent: 'center' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  topTools: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 999, minHeight: 42, paddingHorizontal: 14, paddingVertical: 10 },
  topToolsExpanded: { flex: 1, marginLeft: 12, maxWidth: 286 },
  topToolAction: { alignItems: 'center', justifyContent: 'center' },
  toolDivider: { width: StyleSheet.hairlineWidth, height: 20, backgroundColor: 'rgba(255,255,255,0.28)' },
  searchInput: { color: '#FFFFFF', flex: 1, fontFamily: 'SF-Regular', fontSize: 14, height: 22, padding: 0 },
  heroCopy: { alignItems: 'center', paddingHorizontal: 8, marginTop: 'auto' },
  collectionHeroCopy: { alignItems: 'flex-start', alignSelf: 'stretch', paddingHorizontal: 8 },
  artistHeroCopy: { alignItems: 'flex-start', alignSelf: 'stretch', paddingHorizontal: 8 },
  collectionTitle: { color: '#FFFFFF', fontFamily: 'SF-Bold', fontSize: 28, lineHeight: 33, textAlign: 'center' },
  collectionArtistsRow: { alignItems: 'center', flexDirection: 'row', gap: 7, marginTop: 8, width: '100%' },
  artistAvatarStack: { alignItems: 'center', flexDirection: 'row', flexShrink: 0, paddingRight: 3 },
  artistAvatar: { alignItems: 'center', backgroundColor: '#383838', borderColor: 'rgba(255,255,255,0.4)', borderRadius: 13, borderWidth: 1, height: 26, justifyContent: 'center', overflow: 'hidden', width: 26 },
  artistAvatarOverlap: { marginLeft: -7 },
  artistAvatarImage: { height: '100%', width: '100%' },
  collectionArtistMarquee: { flex: 1, minWidth: 0 },
  collectionMetadata: { textAlign: 'left', marginTop: 7 },
  artistCollectionTitle: { textAlign: 'left' },
  artistLinks: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: 5 },
  artistName: { color: '#D8C09A', fontFamily: 'SF-Bold', fontSize: 15, textAlign: 'left' },
  metadata: { color: 'rgba(255,255,255,0.78)', fontFamily: 'SF-Semibold', fontSize: 12, marginTop: 8, textAlign: 'center' },
  description: { color: 'rgba(255,255,255,0.7)', fontFamily: 'SF-Regular', fontSize: 13, lineHeight: 19, marginTop: 16, textAlign: 'center' },
  actionRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 22 },
  collectionActionRow: { marginTop: 16 },
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
  showMoreTracks: { alignSelf: 'center', paddingHorizontal: 20, paddingVertical: 14 },
  showMoreTracksText: { color: '#1ED760', fontFamily: 'SF-Semibold', fontSize: 15 },
  artistModalBackdrop: { backgroundColor: 'rgba(0,0,0,0.72)', flex: 1, justifyContent: 'flex-end' },
  artistModal: { backgroundColor: '#171717', borderColor: 'rgba(255,255,255,0.12)', borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: StyleSheet.hairlineWidth, elevation: 24, flexShrink: 1, maxHeight: '88%', minHeight: 260, paddingHorizontal: 18, paddingTop: 16 },
  artistModalScroll: { flex: 1, minHeight: 0 },
  artistModalHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  artistModalTitle: { color: '#FFF', fontFamily: 'SF-Bold', fontSize: 20 },
  artistModalLoading: { color: 'rgba(255,255,255,0.62)', fontFamily: 'SF-Regular', fontSize: 12, paddingBottom: 8 },
  artistModalClose: { alignItems: 'center', height: 40, justifyContent: 'center', width: 40 },
  artistModalRow: { alignItems: 'center', borderBottomColor: 'rgba(255,255,255,0.1)', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 12, minHeight: 64, paddingVertical: 8 },
  artistModalImage: { borderRadius: 24, height: 46, width: 46 },
  artistModalFallback: { alignItems: 'center', backgroundColor: '#343434', justifyContent: 'center' },
  artistModalName: { color: '#FFF', flex: 1, fontFamily: 'SF-Semibold', fontSize: 15 },
});

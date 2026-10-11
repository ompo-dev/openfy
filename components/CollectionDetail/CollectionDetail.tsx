import * as React from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
  ScrollView,
} from 'react-native';
import { AppIcon as Ionicons } from "../native/AppIcon";
import { LinearGradient } from 'expo-linear-gradient';
import { Href, useRouter, useSegments } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TrackModel } from '@models';
import { BOTTOM_NAVIGATION_HEIGHT } from '@config';
import { useDownloads, usePlayer } from '@context';
import type { DownloadTrackInput } from '@services';
import { formatCollectionMeta, log } from '@utils';
import { GlassSurface, LoggedPressable, NativeIconButton, SheetFrame } from '../native';
import { GlassBackdrop, GlassBackdropScope } from '../native/GlassBackdrop';
import { DownloadActionIcon } from '../native/DownloadActionIcon';
import { PlaylistMosaic } from '../PlaylistMosaic';
import { TrackRow } from '../common/TrackRow';
import { ProgressiveFlatList, ProgressiveList } from '../common/ProgressiveList';
import { MarqueeText } from '../common/MarqueeText';
import { SkeletonImage } from '../common/SkeletonImage';
import { findArtistIdByName, getArtistCatalogImage } from '@api';
import { getCachedArtistImage } from '@services';
import { useDetailNavigation } from '@hooks';
import { isSameRecording } from '../../services/library/trackIdentity';
import { rememberDetailPreview } from '../../services/navigation/detailPreview';
import { useFollowedArtistsStore } from '../../stores/useFollowedArtistsStore';
import { matchesFollowedArtist, setArtistFollowed } from '../../services/library/followedArtists';
import { ArtistSearchRow } from '../Home/ArtistSearchRow';
import { isCollectionSaved, saveCollection } from '../../services/library/savedCollections';
import { useLibraryStore } from '../../stores/useLibraryStore';

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

const ARTIST_TRACKS_PAGE_SIZE = 10;

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
  resolveTracksForPlayback?: () => Promise<CollectionTrack[]>;
  sectionTitle?: string;
  disableTrackArtistLinks?: boolean;
  extraTrackSections?: ExtraTrackSection[];
  footer?: React.ReactNode;
  onRefresh?: () => void | Promise<void>;
  refreshing?: boolean;
  loadingTracks?: boolean;
  loadingError?: string;
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
  albumAssociations: track.albumAssociations,
  albumArtists: track.albumArtists,
  trackNumber: track.trackNumber,
  discNumber: track.discNumber,
  youtubeVideoId: track.youtubeVideoId,
  youtubeUrl: track.youtubeUrl,
});

const normalizeSearchValue = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .trim();

const normalizeArtistKey = (value: string) => normalizeSearchValue(value).replace(/\s+/g, ' ');

const isSpotifyArtistId = (value: string) => /^[A-Za-z0-9]{22}$/.test(value);

const preferredArtistId = (current: string, next: string) => {
  if (!current) return next;
  if (isSpotifyArtistId(next) && !isSpotifyArtistId(current)) return next;
  return current;
};

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
  albumAssociations: track.albumAssociations,
  albumArtists: track.albumArtists,
  trackNumber: track.trackNumber,
  discNumber: track.discNumber,
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
  resolveTracksForPlayback,
  sectionTitle,
  disableTrackArtistLinks = false,
  extraTrackSections = [],
  footer,
  onRefresh,
  refreshing = false,
  loadingTracks = false,
  loadingError = '',
}: CollectionDetailProps) => {
  const followedArtists = useFollowedArtistsStore((state) => state.artists);
  const followsReady = useFollowedArtistsStore((state) => state.ready);
  const [savingFollow, setSavingFollow] = React.useState(false);
  const libraryRevision = useLibraryStore((state) => state.libraryRevision);
  const [collectionSaved, setCollectionSaved] = React.useState(Boolean(onEditPress));
  const [savingCollection, setSavingCollection] = React.useState(false);
  const collectionSavePending = React.useRef(false);
  React.useEffect(() => {
    if (kind === 'artist' || onEditPress) return;
    let active = true;
    setCollectionSaved(false);
    void isCollectionSaved(kind, collectionId, tracks.map((track) => ({ spotifyId: track.id })), trackCount)
      .then((saved) => { if (active) setCollectionSaved(saved); }).catch(() => {});
    return () => { active = false; };
  }, [collectionId, kind, libraryRevision, onEditPress, tracks, trackCount]);
  const handleSaveCollection = async () => {
    if (kind === 'artist' || collectionSaved || collectionSavePending.current) return;
    collectionSavePending.current = true;
    setSavingCollection(true);
    try {
      const allTracks = resolveTracksForPlayback ? await resolveTracksForPlayback() : tracks;
      await saveCollection({ kind, id: collectionId, title, imageURL, imageURLs, artists, description,
        tracks: allTracks.map((track) => toDownloadInput(track, title)) });
      setCollectionSaved(true);
    } catch {
      Alert.alert('Biblioteca', 'Não foi possível salvar. Tente novamente.');
    } finally {
      collectionSavePending.current = false;
      setSavingCollection(false);
    }
  };
  const followPending = React.useRef(false);
  const following = followedArtists.some((artist) => matchesFollowedArtist(artist, { id: collectionId, name: title }));
  const handleFollow = async () => {
    if (followPending.current) return;
    followPending.current = true;
    setSavingFollow(true);
    try {
      await setArtistFollowed({ id: collectionId, name: title, imageURL }, !following);
    } catch {
      Alert.alert('Artista', 'Não foi possível salvar. Tente novamente.');
    } finally {
      followPending.current = false;
      setSavingFollow(false);
    }
  };
  React.useEffect(() => {
    if (kind === 'artist') void useFollowedArtistsStore.getState().hydrate().catch(() => {});
  }, [kind]);
  React.useEffect(() => {
    rememberDetailPreview(kind, collectionId, { title, imageURL, imageURLs, artists,
      tracks: tracks.slice(0, 12), trackCount, subtitle: metadataProp });
  }, [kind, collectionId, title, imageURL, imageURLs, artists, tracks, trackCount, metadataProp]);
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
      const key = normalizeArtistKey(name);
      const previous = byKey.get(key);
      byKey.set(key, {
        id: preferredArtistId(previous?.id || '', id),
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
      !attemptedArtistImages.current.has(normalizeArtistKey(artist.name))
    );
    if (!unresolved.length) return;
    unresolved.forEach((artist) =>
      attemptedArtistImages.current.add(normalizeArtistKey(artist.name))
    );
    void (async () => {
      for (let index = 0; index < unresolved.length; index += 4) {
        const batch = await Promise.all(unresolved.slice(index, index + 4).map(async (artist) => {
          const canonicalId = isSpotifyArtistId(artist.id)
            ? artist.id
            : await findArtistIdByName(artist.name);
          const imageArtistId = canonicalId || artist.id;
          const imageURL = await getCachedArtistImage(
            artist.name,
            () => getArtistCatalogImage(imageArtistId, artist.name),
            [artist.id, canonicalId]
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
        attemptedArtistImages.current.delete(normalizeArtistKey(artist.name))
      );
      log.error('load collection artist images failed', { collectionId, error });
    });
  }, [artistImageLoadLimit, artistImages, collectionArtists, collectionId, isArtistListVisible]);

  const handleCollectionArtistPress = React.useCallback(async (artist: { id: string; name: string }) => {
    const canonicalId = isSpotifyArtistId(artist.id)
      ? artist.id
      : await findArtistIdByName(artist.name);
    const resolvedArtist = { ...artist, id: canonicalId || artist.id };
    if (onArtistPress) {
      await onArtistPress(resolvedArtist.id, resolvedArtist.name);
      return;
    }
    const routeId = resolvedArtist.id.startsWith('ytartist_') || resolvedArtist.id.startsWith('local_artist_')
      ? resolvedArtist.id
      : resolvedArtist.id && isSpotifyArtistId(resolvedArtist.id)
        ? resolvedArtist.id
        : `ytartist_name_${encodeURIComponent(resolvedArtist.name)}`;
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

  const handleBack = React.useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
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
      const active = isSameRecording(currentTrack, item);
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
        <TrackRow
          title={item.title}
          subtitle={item.subtitle}
          imageURL={item.localImagePath || item.imageURL}
          trackNumber={kind === 'album' ? index + 1 : undefined}
          active={active}
          playing={isPlaying}
          downloadState={downloadState}
          onPress={() => void playTrackList(sourceTracks, index, sourceId)}
          onDownload={() => handleDownloadTrack(item)}
          artists={shouldLinkArtists ? rowArtists : undefined}
          onArtistPress={shouldLinkArtists ? onArtistPress : undefined}
        />
      );
    },
    [
      currentTrack,
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
      <ProgressiveFlatList
        listKey={`${collectionId}:${normalizedSearchQuery}:${sortAscending}`}
        testID="collection-track-list"
        data={visibleTracks}
        keyExtractor={(item) => item.id}
        renderItem={renderTrack}
        removeClippedSubviews={Platform.OS !== 'web'}
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
            <GlassBackdropScope>
            <GlassBackdrop pointerEvents="none" style={StyleSheet.absoluteFill}>
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
            </GlassBackdrop>
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
                  accessibilityRole="button"
                  accessibilityLabel={kind === 'artist' ? (following ? 'Deixar de seguir artista' : 'Seguir artista') : onEditPress ? 'Editar playlist' :
                    collectionSaved ? (kind === 'album' ? 'Álbum salvo' : 'Playlist salva') : (kind === 'album' ? 'Salvar álbum' : 'Salvar playlist')}
                  accessibilityState={{ selected: kind === 'artist' ? following : collectionSaved, busy: savingFollow || savingCollection }}
                  disabled={kind === 'artist' ? (savingFollow || !followsReady) : !onEditPress && (savingCollection || collectionSaved)}
                  onPress={() => void (kind === 'artist' ? handleFollow() : onEditPress ? onEditPress() : handleSaveCollection())}
                  style={[styles.pillAction, kind === 'artist' && styles.followAction]}
                >
                  {savingFollow || savingCollection ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Ionicons
                    name={kind === 'artist' ? (following ? 'checkmark' : 'add') : onEditPress ? 'pencil-outline' : collectionSaved ? 'checkmark' : 'add'}
                    size={21}
                    color={(kind === 'artist' ? following : !onEditPress && collectionSaved) ? '#1ED760' : '#FFFFFF'}
                  />}
                  {kind === 'artist' ? <Text style={[styles.followLabel, following && { color: '#1ED760' }]}>
                    {following ? 'Seguindo' : 'Seguir'}
                  </Text> : null}
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
            </GlassBackdropScope>
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
                  <ProgressiveList listKey={`${section.id}:${normalizedSearchQuery}:${sortAscending}`}>
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
                  </ProgressiveList>
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
          loadingTracks ? <ActivityIndicator color="#1ED760" style={{ padding: 32 }} /> : loadingError ? (
            <Text style={styles.empty}>{loadingError}</Text>
          ) : extraSections.length ? null : (
            <Text style={styles.empty}>
              {normalizedSearchQuery
                ? 'Nenhuma música encontrada.'
                : 'Nenhuma música nesta coleção.'}
            </Text>
          )
        }
      />
      <SheetFrame
        title="Artistas"
        closeLabel="Fechar artistas"
        artworkURL={imageURL}
        scroll={false}
        onClose={() => setIsArtistListVisible(false)}
        visible={isArtistListVisible}
      >
            {isLoadingAllArtists ? <Text style={styles.artistModalLoading}>Carregando créditos da playlist…</Text> : null}
            <ScrollView
              contentContainerStyle={{ paddingBottom: 4 }}
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
              <ProgressiveList listKey={collectionId}>
              {collectionArtists.map((artist) => {
                const uri = artist.imageURL || artistImages[artist.name] || artistImages[artist.id];
                return (
                  <ArtistSearchRow
                    key={`artist-modal-${artist.id}-${artist.name}`}
                    artist={{ type: 'artist', id: artist.id || `local_artist_${encodeURIComponent(artist.name)}`, name: artist.name, imageURL: uri || '' }}
                    onPress={() => {
                      setIsArtistListVisible(false);
                      void handleCollectionArtistPress(artist);
                    }}
                  />
                );
              })}
              </ProgressiveList>
            </ScrollView>
      </SheetFrame>
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
  followAction: { width: 'auto', paddingHorizontal: 12, flexDirection: 'row', gap: 6 },
  followLabel: { color: '#FFFFFF', fontFamily: 'SF-Semibold', fontSize: 13 },
  pillDivider: { backgroundColor: 'rgba(255,255,255,0.2)', height: 22, width: StyleSheet.hairlineWidth },
  empty: { color: 'rgba(255,255,255,0.6)', fontFamily: 'SF-Regular', padding: 32, textAlign: 'center' },
  sectionTitle: { color: '#FFFFFF', fontFamily: 'SF-Bold', fontSize: 18, paddingBottom: 8, paddingHorizontal: 16 },
  extraSection: { paddingTop: 20 },
  listFooter: { paddingTop: 18 },
  showMoreTracks: { alignSelf: 'center', paddingHorizontal: 20, paddingVertical: 14 },
  showMoreTracksText: { color: '#1ED760', fontFamily: 'SF-Semibold', fontSize: 15 },
  artistModalScroll: { flexGrow: 0, flexShrink: 1, minHeight: 0 },
  artistModalLoading: { color: 'rgba(255,255,255,0.62)', fontFamily: 'SF-Regular', fontSize: 12, paddingBottom: 8 },
});

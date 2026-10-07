import * as React from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppIcon as Ionicons } from "../native/AppIcon";

import { searchCatalog } from '@api';
import { BOTTOM_NAVIGATION_HEIGHT } from '@config';
import { useLibrarySelectedCategory, usePlayer, type PlayerTrack } from '@context';
import { useDetailNavigation, usePersonalizedHome } from '@hooks';
import { rememberCachedArtistImage, upsertCatalogTracks } from '@services';
import type { ArtistModel, TrackModel } from '@models';

import { ListeningHome } from './ListeningHome';
import { LoggedPressable } from '../native';
import { SkeletonImage } from '../common/SkeletonImage';
import { TrackRow } from '../common/TrackRow';
import { isSameRecording } from '../../services/library/trackIdentity';
import { log } from '../../utils/appLogger';

export { FriendActivityStatus } from './FriendActivityStatus';
export { CompactMusicCarousel } from './CompactMusicCarousel';

const toPlayerTrackFromSearch = (track: TrackModel): PlayerTrack => ({
  spotifyId: track.id,
  title: track.title,
  artistName: track.subtitle,
  albumName: track.albumName || 'Single',
  imageURL: track.imageURL || '',
  duration_ms: track.durationMs || 0,
  artists: track.artists,
  albumId: track.albumId,
  albumAssociations: track.albumAssociations,
  albumArtists: track.albumArtists,
  youtubeVideoId: track.youtubeVideoId,
  youtubeUrl: track.youtubeUrl,
});

const artistNames = (artist: ArtistModel) => artist.genres?.slice(0, 2).join(' · ') || 'Artista';

export const Home = () => {
  const { top } = useSafeAreaInsets();
  const { home, isLoading, isRefreshing, refresh } = usePersonalizedHome();
  const { currentTrack, isPlaying, playWithQueue, togglePlayPause } = usePlayer((state) => ({
    currentTrack: state.currentTrack, isPlaying: state.playerState.isPlaying,
    playWithQueue: state.playWithQueue, togglePlayPause: state.togglePlayPause,
  }));
  const { refreshLibrary } = useLibrarySelectedCategory();
  const { openDetail } = useDetailNavigation();
  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState<{ artists: ArtistModel[]; tracks: TrackModel[] }>({
    artists: [],
    tracks: [],
  });
  const [searchLoading, setSearchLoading] = React.useState(false);
  const [searchError, setSearchError] = React.useState('');
  const [savedTrackIds, setSavedTrackIds] = React.useState<Set<string>>(new Set());
  const [savingTrackIds, setSavingTrackIds] = React.useState<Set<string>>(new Set());
  const searchGeneration = React.useRef(0);

  useFocusEffect(
    React.useCallback(() => () => {
      searchGeneration.current += 1;
      setQuery('');
      setResults({ artists: [], tracks: [] });
      setSearchError('');
      setSearchLoading(false);
      Keyboard.dismiss();
      log.nav('discover search cleared on blur');
    }, [])
  );

  React.useEffect(() => {
    const cleanQuery = query.trim();
    const request = ++searchGeneration.current;
    if (!cleanQuery) {
      setResults({ artists: [], tracks: [] });
      setSearchError('');
      setSearchLoading(false);
      return;
    }
    if (cleanQuery.length < 2) {
      setResults({ artists: [], tracks: [] });
      setSearchError('');
      setSearchLoading(false);
      return;
    }

    setSearchLoading(true);
    const timer = setTimeout(() => {
      const startedAt = Date.now();
      const finishSearch = log.time('search', 'discover query results', {
        queryLength: cleanQuery.length,
      });
      log.search('catalog query started', { length: cleanQuery.length });
      void searchCatalog(cleanQuery)
        .then((nextResults) => {
          finishSearch({
            ok: true,
            artists: nextResults.artists.length,
            tracks: nextResults.tracks.length,
            stale: request !== searchGeneration.current,
          });
          if (request === searchGeneration.current) {
            setResults(nextResults);
            setSearchError(nextResults.partial
              ? 'Alguns resultados não carregaram. Tente novamente para completar a busca.'
              : '');
            nextResults.artists.forEach((artist) => {
              if (artist.imageURL) {
                void rememberCachedArtistImage(artist.name, artist.imageURL, [artist.id]);
              }
            });
            log.search('catalog query completed', {
              durationMs: Date.now() - startedAt,
              artists: nextResults.artists.length,
              tracks: nextResults.tracks.length,
            });
          }
        })
        .catch((error: unknown) => {
          finishSearch({ ok: false, stale: request !== searchGeneration.current });
          if (request === searchGeneration.current) {
            setResults({ artists: [], tracks: [] });
            setSearchError(
              error instanceof Error ? error.message : 'Não foi possível pesquisar agora.'
            );
            log.error('catalog query failed', {
              durationMs: Date.now() - startedAt,
              error,
            });
          }
        })
        .finally(() => {
          if (request === searchGeneration.current) setSearchLoading(false);
        });
    }, 450);

    return () => {
      clearTimeout(timer);
      searchGeneration.current += 1;
    };
  }, [query]);

  const saveTrack = async (track: TrackModel) => {
    if (savedTrackIds.has(track.id) || home.tracksById.has(track.id)) return;
    setSavingTrackIds((current) => new Set(current).add(track.id));
    log.search('save result to library started', { trackId: track.id });
    try {
      await upsertCatalogTracks([{
        spotifyId: track.id,
        title: track.title,
        artistName: track.subtitle,
        albumName: track.albumName || 'Single',
        imageURL: track.imageURL || '',
        duration_ms: track.durationMs || 0,
        albumId: track.albumId,
        albumAssociations: track.albumAssociations,
        artists: track.artists,
        albumArtists: track.albumArtists,
        youtubeVideoId: track.youtubeVideoId,
        youtubeUrl: track.youtubeUrl,
        sourcePlatform: track.youtubeVideoId ? 'youtube' : 'spotify',
      }]);
      setSavedTrackIds((current) => new Set(current).add(track.id));
      refreshLibrary();
      log.search('save result to library completed', { trackId: track.id });
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : 'Não foi possível adicionar a música.');
      log.error('save search result failed', { trackId: track.id, error });
    } finally {
      setSavingTrackIds((current) => {
        const next = new Set(current);
        next.delete(track.id);
        return next;
      });
    }
  };

  const discoveries = home.discoveries.length ? home.discoveries : home.quickPicks;
  const hasDiscovery = discoveries.length > 0 || home.artists.length > 0 || home.continueListening.length > 0 ||
    Boolean(home.playlists?.length || home.releases?.length || home.pinnedTracks?.length);
  const searching = query.trim().length > 0;
  const queryTooShort = query.trim().length === 1;

  return (
    <View style={styles.container}>
      <ScrollView
        alwaysBounceVertical
        bounces
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingTop: top + 8 }]}
        refreshControl={
          <RefreshControl
            tintColor="#FFFFFF"
            colors={['#1DB954']}
            progressViewOffset={top + 8}
            refreshing={isRefreshing}
            onRefresh={refresh}
          />
        }
      >
        <View style={styles.searchBox}>
          <Ionicons name="search" size={19} color="#9B9BA0" />
          <TextInput
            accessibilityLabel="Buscar músicas e artistas"
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setQuery}
            placeholder="Músicas e artistas"
            placeholderTextColor="#8E8E93"
            returnKeyType="search"
            style={styles.searchInput}
            value={query}
          />
          {query.length ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Limpar busca"
              onPress={() => {
                Keyboard.dismiss();
                setQuery('');
                log.ui('clear music and artist search');
              }}
              hitSlop={10}
            >
              <Ionicons name="close-circle" size={19} color="#8E8E93" />
            </Pressable>
          ) : null}
        </View>

        {searching ? (
          <View style={styles.searchResults}>
            {queryTooShort ? (
              <Text style={styles.emptyText}>Digite mais um caractere para pesquisar.</Text>
            ) : null}
            {searchLoading ? <ActivityIndicator color="#1DB954" style={styles.searchSpinner} /> : null}
            {searchError ? <Text style={styles.errorText}>{searchError}</Text> : null}
            {results.artists.length ? (
              <View style={styles.resultSection}>
                <Text style={styles.sectionTitle}>Artistas</Text>
                {results.artists.map((artist) => (
                  <LoggedPressable
                    accessibilityLabel={`Abrir artista ${artist.name}`}
                    key={artist.id}
                    onPress={() => openDetail('artist', artist.id, 'home')}
                    style={styles.artistResult}
                  >
                    {artist.imageURL ? (
                      <SkeletonImage cachePolicy="memory-disk" priority="high" source={{ uri: artist.imageURL }} contentFit="cover" style={styles.artistImage} />
                    ) : (
                      <View style={[styles.artistImage, styles.imageFallback]}>
                        <Ionicons name="person" size={22} color="#8E8E93" />
                      </View>
                    )}
                    <View style={styles.resultCopy}>
                      <Text numberOfLines={1} style={styles.resultTitle}>{artist.name}</Text>
                      <Text numberOfLines={1} style={styles.resultSubtitle}>{artistNames(artist)}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color="#85858A" />
                  </LoggedPressable>
                ))}
              </View>
            ) : null}
            {results.tracks.length ? (
              <View style={styles.resultSection}>
                <Text style={styles.sectionTitle}>Músicas</Text>
                {results.tracks.map((track, index) => {
                  const isSaved = savedTrackIds.has(track.id) || home.tracksById.has(track.id);
                  const isSaving = savingTrackIds.has(track.id);
                  return (
                    <TrackRow key={track.id} title={track.title} subtitle={track.subtitle} imageURL={track.imageURL}
                      active={isSameRecording(currentTrack, toPlayerTrackFromSearch(track))} playing={isPlaying}
                      downloadState="idle" onDownload={() => {}}
                      onPress={() => {
                        if (isSameRecording(currentTrack, toPlayerTrackFromSearch(track))) void togglePlayPause();
                        else void playWithQueue(results.tracks.map(toPlayerTrackFromSearch), index, 'home:search');
                      }} trailingAction={
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={isSaved ? 'Na Biblioteca' : `Adicionar ${track.title} à Biblioteca`}
                        disabled={isSaved || isSaving}
                        onPress={(event) => { event.stopPropagation(); void saveTrack(track); }}
                        style={styles.saveButton}
                      >
                        {isSaving ? (
                          <ActivityIndicator size="small" color="#1DB954" />
                        ) : (
                          <Ionicons
                            name={isSaved ? 'checkmark-circle' : 'add-circle-outline'}
                            size={24}
                            color={isSaved ? '#1DB954' : '#D8D8DA'}
                          />
                        )}
                      </Pressable>}
                    />
                  );
                })}
              </View>
            ) : null}
            {!queryTooShort && !searchLoading && !searchError && !results.artists.length && !results.tracks.length ? (
              <Text style={styles.emptyText}>Nenhum resultado encontrado.</Text>
            ) : null}
          </View>
        ) : (
          <>
            <ListeningHome home={home} loading={isLoading} />
            {!isLoading && !hasDiscovery ? (
              <Text style={styles.emptyText}>Pesquise uma música ou artista para começar.</Text>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212', width: '100%', maxWidth: 1100, alignSelf: 'center' },
  content: { paddingBottom: BOTTOM_NAVIGATION_HEIGHT + 76 },
  searchBox: {
    height: 48,
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#242428',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  searchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: 'SF-Regular',
    paddingVertical: 0,
  },
  searchResults: { paddingBottom: 20 },
  searchSpinner: { marginVertical: 18 },
  resultSection: { marginTop: 12 },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontFamily: 'SF-Bold',
    paddingHorizontal: 18,
    marginBottom: 4,
  },
  artistResult: {
    minHeight: 72,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  artistImage: { width: 52, height: 52, borderRadius: 26 },
  imageFallback: { backgroundColor: '#242428', alignItems: 'center', justifyContent: 'center' },
  resultCopy: { flex: 1, minWidth: 0, gap: 4 },
  resultTitle: { color: '#FFFFFF', fontSize: 15, fontFamily: 'SF-Semibold' },
  resultSubtitle: { color: '#9B9BA0', fontSize: 12, fontFamily: 'SF-Regular' },
  saveButton: { width: 42, height: 48, alignItems: 'flex-end', justifyContent: 'center' },
  errorText: { color: '#FF8B8B', fontSize: 13, paddingHorizontal: 18, paddingVertical: 12 },
  emptyText: {
    color: '#8E8E93',
    fontSize: 14,
    fontFamily: 'SF-Regular',
    lineHeight: 20,
    paddingHorizontal: 24,
    paddingVertical: 42,
    textAlign: 'center',
  },
  loading: { marginTop: 54 },
});

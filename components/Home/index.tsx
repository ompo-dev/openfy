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
import { useFocusEffect, useNavigation } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppIcon as Ionicons } from "../native/AppIcon";

import { getArtistCatalogImage, getCatalogSearchSuggestions, searchCatalog } from '@api';
import { BOTTOM_NAVIGATION_HEIGHT } from '@config';
import { useLibrarySelectedCategory, usePlayer, type PlayerTrack } from '@context';
import { useDetailNavigation, usePersonalizedHome } from '@hooks';
import { getCachedArtistImage, rememberCachedArtistImage, upsertCatalogTracks } from '@services';
import type { ArtistModel, TrackModel } from '@models';

import { ListeningHome } from './ListeningHome';
import { GlassSurface, LoggedPressable } from '../native';
import { ArtistSearchRow } from './ArtistSearchRow';
import { TrackRow } from '../common/TrackRow';
import { isSameRecording } from '../../services/library/trackIdentity';
import { log } from '../../utils/appLogger';
import {
  clearSearchHistory, getSearchHistory, rememberSearchSelection, removeSearchHistoryEntry,
  searchHistoryKey, subscribeSearchHistory, type SearchHistoryEntry, type SearchSelection,
} from '../../services/search/searchHistory';

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

export const Home = () => {
  const { top } = useSafeAreaInsets();
  const searchTopInset = Math.min(Math.max(top, 0), 59);
  const navigation = useNavigation();
  const tabNavigation = navigation.getParent?.();
  const { home, isLoading, isRefreshing, refresh } = usePersonalizedHome();
  const { currentTrack, isPlaying, playWithQueue, togglePlayPause } = usePlayer((state) => ({
    currentTrack: state.currentTrack, isPlaying: state.playerState.isPlaying,
    playWithQueue: state.playWithQueue, togglePlayPause: state.togglePlayPause,
  }));
  const { refreshLibrary } = useLibrarySelectedCategory();
  const { openDetail } = useDetailNavigation();
  const [query, setQuery] = React.useState('');
  const [searchActive, setSearchActive] = React.useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = React.useState(false);
  const [suggestions, setSuggestions] = React.useState<string[]>([]);
  const [searchHistory, setSearchHistory] = React.useState<SearchHistoryEntry[]>([]);
  const [showAllHistory, setShowAllHistory] = React.useState(false);
  const searchInputRef = React.useRef<TextInput>(null);
  const suggestionsGeneration = React.useRef(0);
  const [results, setResults] = React.useState<{ artists: ArtistModel[]; tracks: TrackModel[] }>({
    artists: [],
    tracks: [],
  });
  const [searchLoading, setSearchLoading] = React.useState(false);
  const [searchError, setSearchError] = React.useState('');
  const [savedTrackIds, setSavedTrackIds] = React.useState<Set<string>>(new Set());
  const [savingTrackIds, setSavingTrackIds] = React.useState<Set<string>>(new Set());
  const searchGeneration = React.useRef(0);

  const dismissSearchKeyboard = React.useCallback(() => {
    searchInputRef.current?.blur();
    Keyboard.dismiss();
  }, []);

  const resetSearch = React.useCallback(() => {
    searchGeneration.current += 1;
    suggestionsGeneration.current += 1;
    setQuery('');
    setSearchActive(false);
    setSuggestionsOpen(false);
    setSuggestions([]);
    setResults({ artists: [], tracks: [] });
    setSearchError('');
    setSearchLoading(false);
    dismissSearchKeyboard();
  }, [dismissSearchKeyboard]);

  React.useEffect(() => {
    const unsubscribe = subscribeSearchHistory(setSearchHistory);
    void getSearchHistory();
    return unsubscribe;
  }, []);

  React.useEffect(() => {
    if (!tabNavigation) return undefined;
    return tabNavigation.addListener('tabPress' as never, resetSearch);
  }, [tabNavigation, resetSearch]);

  React.useEffect(() => {
    const request = ++suggestionsGeneration.current;
    setSuggestions([]);
    if (!query.trim() || !suggestionsOpen) return;
    const timer = setTimeout(() => {
      void getCatalogSearchSuggestions(query).then((values) => {
        if (request === suggestionsGeneration.current) setSuggestions(values);
      }).catch(() => {});
    }, 200);
    return () => { clearTimeout(timer); suggestionsGeneration.current += 1; };
  }, [query, suggestionsOpen]);

  const rememberSelection = (selection: SearchSelection) => {
    void rememberSearchSelection(selection).catch((error) => log.search('search history write failed', { error }));
  };
  const openArtist = (artist: ArtistModel) => {
    dismissSearchKeyboard();
    rememberSelection({ kind: 'artist', artist });
    openDetail('artist', artist.id, 'home');
  };
  const playSearchTrack = (track: TrackModel, tracks: TrackModel[], sourceId: string) => {
    dismissSearchKeyboard();
    rememberSelection({ kind: 'track', track });
    if (isSameRecording(currentTrack, toPlayerTrackFromSearch(track))) void togglePlayPause();
    else void playWithQueue(tracks.map(toPlayerTrackFromSearch), tracks.findIndex((item) => item.id === track.id), sourceId);
  };
  const removeHistory = (entry: SearchHistoryEntry) => {
    dismissSearchKeyboard();
    void removeSearchHistoryEntry(searchHistoryKey(entry))
      .catch((error) => log.search('search history removal failed', { error }));
  };
  const historyRemoveButton = (entry: SearchHistoryEntry) => (
    <Pressable accessibilityRole="button" accessibilityLabel={`Remover ${entry.kind === 'artist' ? entry.artist.name : entry.track.title} dos recentes`}
      onPress={(event) => { event.stopPropagation(); removeHistory(entry); }} style={styles.historyAction}>
      <Ionicons name="close" size={20} color="#9B9BA0" />
    </Pressable>
  );

  useFocusEffect(
    React.useCallback(() => () => {
      resetSearch();
      log.nav('discover search cleared on blur');
    }, [resetSearch])
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
                return;
              }
              void getCachedArtistImage(
                artist.name,
                () => getArtistCatalogImage(artist.id, artist.name),
                [artist.id]
              ).then((imageURL) => {
                if (!imageURL || request !== searchGeneration.current) return;
                setResults((current) => ({
                  ...current,
                  artists: current.artists.map((candidate) => candidate.id === artist.id
                    ? { ...candidate, imageURL }
                    : candidate),
                }));
              }).catch(() => {});
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
  const localSuggestions = query.trim() ? searchHistory.map((entry) =>
    entry.kind === 'artist' ? entry.artist.name : entry.track.title
  ).filter((name) => name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) : [];
  const searchSuggestions = [...new Map([...localSuggestions, ...suggestions]
    .map((value) => [value.toLocaleLowerCase(), value])).values()].slice(0, 6);
  const historyTracks = searchHistory.filter((entry) => entry.kind === 'track').map((entry) => entry.track);

  return (
    <View style={styles.container} onTouchStart={dismissSearchKeyboard}>
      <ScrollView
        testID="home-scroll"
        alwaysBounceVertical
        bounces
        keyboardShouldPersistTaps="always"
        keyboardDismissMode="on-drag"
        automaticallyAdjustContentInsets={false}
        contentInsetAdjustmentBehavior="never"
        onScrollBeginDrag={() => { dismissSearchKeyboard(); setSuggestionsOpen(false); }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingTop: searchTopInset }]}
        refreshControl={
          <RefreshControl
            tintColor="#FFFFFF"
            colors={['#1DB954']}
            progressViewOffset={searchTopInset}
            refreshing={isRefreshing}
            onRefresh={refresh}
          />
        }
      >
        <View style={styles.searchHeader}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={19} color="#9B9BA0" />
          <TextInput
            ref={searchInputRef}
            onTouchStart={(event) => event.stopPropagation()}
            accessibilityLabel="Buscar músicas e artistas"
            autoCapitalize="none"
            autoCorrect={false}
            onFocus={() => { setSearchActive(true); setSuggestionsOpen(true); }}
            onChangeText={(value) => { setQuery(value); setSuggestionsOpen(true); }}
            onSubmitEditing={() => { dismissSearchKeyboard(); setSuggestionsOpen(false); }}
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
                dismissSearchKeyboard();
                setQuery('');
                log.ui('clear music and artist search');
              }}
              hitSlop={10}
            >
              <Ionicons name="close-circle" size={19} color="#8E8E93" />
            </Pressable>
          ) : null}
        </View>
        {searchActive ? (
          <LoggedPressable accessibilityLabel="Cancelar busca" onPress={() => {
            dismissSearchKeyboard(); setQuery(''); setSearchActive(false); setSuggestionsOpen(false);
          }}>
            <GlassSurface style={styles.cancelButton} glass="clear" isInteractive>
              <Text style={styles.cancelText}>Cancelar</Text>
            </GlassSurface>
          </LoggedPressable>
        ) : null}
        </View>

        <View testID="home-search-body">
        {searching && suggestionsOpen && searchSuggestions.length ? (
          <View style={styles.suggestions}>
            {searchSuggestions.map((suggestion) => (
              <LoggedPressable key={suggestion} accessibilityLabel={`Pesquisar ${suggestion}`} style={styles.suggestion}
                onPress={() => { setQuery(suggestion); dismissSearchKeyboard(); setSuggestionsOpen(false); }}>
                <Ionicons name="search" size={19} color="#9B9BA0" />
                <Text numberOfLines={1} style={styles.suggestionText}>{suggestion}</Text>
                <Ionicons name="arrow-forward" size={18} color="#9B9BA0" style={styles.suggestionArrow} />
              </LoggedPressable>
            ))}
          </View>
        ) : null}
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
                  <ArtistSearchRow key={artist.id} artist={artist} onPress={() => openArtist(artist)} />
                ))}
              </View>
            ) : null}
            {results.tracks.length ? (
              <View style={styles.resultSection}>
                <Text style={styles.sectionTitle}>Músicas</Text>
                {results.tracks.map((track) => {
                  const isSaved = savedTrackIds.has(track.id) || home.tracksById.has(track.id);
                  const isSaving = savingTrackIds.has(track.id);
                  return (
                    <TrackRow key={track.id} title={track.title} subtitle={track.subtitle} imageURL={track.imageURL}
                      active={isSameRecording(currentTrack, toPlayerTrackFromSearch(track))} playing={isPlaying}
                      downloadState="idle" onDownload={() => {}}
                      onPress={() => playSearchTrack(track, results.tracks, 'home:search')} trailingAction={
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={isSaved ? 'Na Biblioteca' : `Adicionar ${track.title} à Biblioteca`}
                        disabled={isSaved || isSaving}
                        onPress={(event) => { event.stopPropagation(); dismissSearchKeyboard(); void saveTrack(track); }}
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
        ) : searchActive ? (
          <View style={styles.resultSection}>
            <View style={styles.historyHeader}>
              <Text style={[styles.sectionTitle, styles.historyTitle]}>Recentes</Text>
              {searchHistory.length > 8 ? <LoggedPressable accessibilityLabel={showAllHistory ? 'Ver menos recentes' : 'Ver todos os recentes'}
                onPress={() => { dismissSearchKeyboard(); setShowAllHistory((value) => !value); }} style={styles.historyMore}>
                <Text style={styles.historyMoreText}>{showAllHistory ? 'Ver menos' : 'Ver tudo'}</Text>
              </LoggedPressable> : null}
              {searchHistory.length ? <LoggedPressable accessibilityLabel="Limpar histórico de busca"
                onPress={() => { dismissSearchKeyboard(); void clearSearchHistory()
                  .catch((error) => log.search('search history clear failed', { error })); }} style={styles.historyAction}>
                <Ionicons name="trash-outline" size={19} color="#9B9BA0" />
              </LoggedPressable> : null}
            </View>
            {searchHistory.slice(0, showAllHistory ? 40 : 8).map((entry) => entry.kind === 'artist' ? (
              <ArtistSearchRow key={searchHistoryKey(entry)} artist={entry.artist}
                onPress={() => openArtist(entry.artist)} trailingAction={historyRemoveButton(entry)} />
            ) : (
              <TrackRow key={searchHistoryKey(entry)} title={entry.track.title} subtitle={entry.track.subtitle} imageURL={entry.track.imageURL}
                active={isSameRecording(currentTrack, toPlayerTrackFromSearch(entry.track))} playing={isPlaying}
                downloadState="idle" onDownload={() => {}}
                onPress={() => playSearchTrack(entry.track, historyTracks, 'home:search-history')}
                trailingAction={historyRemoveButton(entry)} />
            ))}
            {!searchHistory.length ? <Text style={styles.emptyText}>Nenhuma busca recente.</Text> : null}
          </View>
        ) : (
          <>
            <ListeningHome home={home} loading={isLoading} />
            {!isLoading && !hasDiscovery ? (
              <Text style={styles.emptyText}>Pesquise uma música ou artista para começar.</Text>
            ) : null}
          </>
        )}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212', width: '100%', maxWidth: 1100, alignSelf: 'center' },
  content: { paddingBottom: BOTTOM_NAVIGATION_HEIGHT + 76 },
  searchHeader: { marginHorizontal: 16, marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  searchBox: {
    flex: 1,
    height: 48,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#242428',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: 'SF-Regular',
    paddingVertical: 0,
  },
  searchResults: { paddingBottom: 20 },
  cancelButton: { height: 48, borderRadius: 24, paddingHorizontal: 14, justifyContent: 'center', alignItems: 'center' },
  cancelText: { color: '#FFFFFF', fontFamily: 'SF-Regular', fontSize: 14 },
  suggestions: { paddingHorizontal: 16, marginBottom: 8 },
  suggestion: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 12 },
  suggestionText: { flex: 1, minWidth: 0, fontSize: 14, fontFamily: 'SF-Regular', color: '#FFFFFF' },
  suggestionArrow: { transform: [{ rotate: '-135deg' }] },
  historyHeader: { paddingLeft: 18, paddingRight: 10, flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  historyTitle: { flex: 1, paddingHorizontal: 0, marginBottom: 0 },
  historyAction: { width: 38, height: 42, justifyContent: 'center', alignItems: 'center' },
  historyMore: { paddingHorizontal: 10, paddingVertical: 12 },
  historyMoreText: { color: '#3EA6FF', fontFamily: 'SF-Semibold', fontSize: 13 },
  searchSpinner: { marginVertical: 18 },
  resultSection: { marginTop: 12 },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontFamily: 'SF-Bold',
    paddingHorizontal: 18,
    marginBottom: 4,
  },
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

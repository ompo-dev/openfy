/**
 * ImportModal Component
 * Allows users to paste a Spotify link and download the track/playlist/album
 */

import * as React from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  Image,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import {
  getDownloadedTracks,
  isTrackDownloaded,
  parseSpotifyLink,
  resolveDirectYouTubeTrack,
  upsertLocalPlaylist,
} from '@services';
import { useDownloads } from '@context';
import { SheetFrame } from '../native';

import {
  fetchSpotifyCollectionMetadata,
  fetchSpotifyTrackMetadata,
  type SpotifyArtist,
} from '../../services/metadata/spotifyMetadata';
import axios from 'axios';

type TrackPreview = {
  spotifyId: string;
  title: string;
  artistName: string;
  albumName: string;
  artists?: SpotifyArtist[];
  albumId?: string;
  albumArtists?: SpotifyArtist[];
  trackNumber?: number;
  discNumber?: number;
  imageURL: string;
  duration_ms: number;
  youtubeVideoId?: string;
  youtubeUrl?: string;
  audioUrl?: string;
  audioFormat?: string;
  isDownloaded?: boolean;
};

type ImportModalProps = {
  visible: boolean;
  onClose: () => void;
  onLibraryChanged?: () => void;
};

type ImportedPlaylist = {
  sourcePlatform: 'spotify' | 'youtube';
  sourceId: string;
  title: string;
};

const YOUTUBE_STREAM_UNAVAILABLE_ERROR = 'YOUTUBE_STREAM_UNAVAILABLE';
const YOUTUBE_STREAM_UNAVAILABLE_MESSAGE =
  'YouTube bloqueou o stream de áudio desse vídeo. Metadados foram encontrados, mas o download não pode começar sem áudio.';

const fetchPlaylistOrAlbum = async (
  id: string,
  type: 'playlist' | 'album'
): Promise<{ title: string; coverUrl: string; tracks: TrackPreview[] }> => {
  const collection = await fetchSpotifyCollectionMetadata(id, type);
  if (!collection) return { title: '', coverUrl: '', tracks: [] };
  const downloadedIds = new Set(
    (await getDownloadedTracks()).map((track) => track.spotifyId)
  );
  return {
    ...collection,
    tracks: collection.tracks.map((track) => ({
      ...track,
      isDownloaded: downloadedIds.has(track.spotifyId),
    })),
  };
};

const fetchYouTubeTrack = async (
  videoId: string
): Promise<TrackPreview | null> => {
  const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;

  // A standalone iPhone has no Metro API route. Resolve the pasted video
  // itself so this path does not silently depend on a development server.
  if (Platform.OS !== 'web') {
    const directTrack = await resolveDirectYouTubeTrack(videoId);
    if (directTrack) {
      const trackId = `yt_${videoId}`;
      const already = await isTrackDownloaded(trackId);
      return {
        spotifyId: trackId,
        title: directTrack.title,
        artistName: directTrack.artistName,
        albumName: 'YouTube Track',
        imageURL:
          directTrack.imageURL ||
          `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        duration_ms: directTrack.durationMs,
        youtubeVideoId: videoId,
        youtubeUrl,
        audioUrl: directTrack.url,
        audioFormat: directTrack.format,
        isDownloaded: already,
      };
    }
  }

  // Never show metadata that cannot be downloaded from this exact video.
  // A retry is preferable to quietly resolving a similarly named track.
  return null;
};

const fetchYouTubePlaylist = async (
  playlistId: string
): Promise<{ title: string; tracks: TrackPreview[] }> => {
  const gateways = [
    `https://inv.nadeko.net/api/v1/playlists/${playlistId}`,
    `https://invidious.f5.si/api/v1/playlists/${playlistId}`,
  ];

  for (const gw of gateways) {
    try {
      const res = await axios.get(gw, { timeout: 6000 });
      const data = res.data;
      if (data && data.videos && Array.isArray(data.videos)) {
        const list: TrackPreview[] = [];
        for (const v of data.videos) {
          const trackId = `yt_${v.videoId}`;
          const already = await isTrackDownloaded(trackId);
          list.push({
            spotifyId: trackId,
            title: v.title || 'Música',
            artistName: v.author || data.author || 'YouTube Music',
            albumName: data.title || 'YouTube Playlist',
            imageURL:
              v.videoThumbnails?.[0]?.url ||
              `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
            duration_ms: (v.lengthSeconds || 0) * 1000,
            youtubeVideoId: v.videoId,
            isDownloaded: already,
          });
        }
        if (list.length > 0) {
          return { title: data.title || 'YouTube Playlist', tracks: list };
        }
      }
    } catch {}
  }
  return { title: '', tracks: [] };
};

export const ImportModal = ({
  visible,
  onClose,
  onLibraryChanged,
}: ImportModalProps) => {
  const [inputText, setInputText] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);
  const [tracks, setTracks] = React.useState<TrackPreview[]>([]);
  const [error, setError] = React.useState('');
  const { downloads, enqueueDownloads } = useDownloads();
  const downloadsById = React.useMemo(
    () => new Map(downloads.map((download) => [download.spotifyId, download])),
    [downloads]
  );

  const reset = () => {
    setInputText('');
    setTracks([]);
    setError('');
    setIsLoading(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handlePasteFromClipboard = async () => {
    try {
      const text = await Clipboard.getStringAsync();
      setInputText(text);
    } catch {
      setError('Não foi possível acessar a área de transferência.');
    }
  };

  const handleImport = async () => {
    if (!inputText.trim()) {
      setError('Por favor, cole um link do Spotify ou YouTube Music.');
      return;
    }

    const parsed = parseSpotifyLink(inputText.trim());
    if (!parsed) {
      setError(
        'Link inválido. Use um link do Spotify (música, álbum, playlist) ou YouTube/YT Music.'
      );
      return;
    }

    setIsLoading(true);
    setError('');
    setTracks([]);

    try {
      let tracksToShow: TrackPreview[] = [];
      let playlistToSave: ImportedPlaylist | null = null;

      if (parsed.platform === 'youtube') {
        if (parsed.type === 'track') {
          const ytTrack = await fetchYouTubeTrack(parsed.id);
          if (ytTrack) tracksToShow = [ytTrack];
        } else if (parsed.type === 'playlist') {
          const result = await fetchYouTubePlaylist(parsed.id);
          tracksToShow = result.tracks;
          playlistToSave = {
            sourcePlatform: 'youtube',
            sourceId: parsed.id,
            title: result.title,
          };
        }
      } else {
        // Spotify
        if (parsed.type === 'track') {
          const track = await fetchSpotifyTrackMetadata(parsed.id);
          if (track) {
            const alreadyDownloaded = await isTrackDownloaded(track.spotifyId);
            tracksToShow = [{ ...track, isDownloaded: alreadyDownloaded }];
          }
        } else if (parsed.type === 'playlist' || parsed.type === 'album') {
          const result = await fetchPlaylistOrAlbum(parsed.id, parsed.type);
          tracksToShow = result.tracks;
          if (parsed.type === 'playlist') {
            playlistToSave = {
              sourcePlatform: 'spotify',
              sourceId: parsed.id,
              title: result.title,
            };
          }
        }
      }

      if (tracksToShow.length === 0) {
        setError(
          parsed.platform === 'youtube'
            ? YOUTUBE_STREAM_UNAVAILABLE_MESSAGE
            : 'Nenhuma música encontrada. Verifique o link e tente novamente.'
        );
      } else {
        setTracks(tracksToShow);
        if (playlistToSave) {
          await upsertLocalPlaylist({
            ...playlistToSave,
            trackIds: tracksToShow.map((track) => track.spotifyId),
            coverImageURLs: tracksToShow
              .map((track) => track.imageURL)
              .filter(Boolean),
          });
          onLibraryChanged?.();
        }
      }
    } catch (err) {
      setError(
        err instanceof Error && err.message === YOUTUBE_STREAM_UNAVAILABLE_ERROR
          ? YOUTUBE_STREAM_UNAVAILABLE_MESSAGE
          : 'Erro ao buscar dados. Verifique o link e tente novamente.'
      );
      console.error('[ImportModal] handleImport error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const toDownloadInput = React.useCallback(
    (track: TrackPreview) => ({
      spotifyId: track.spotifyId,
      title: track.title,
      artistName: track.artistName,
      albumName: track.albumName,
      artists: track.artists,
      albumId: track.albumId,
      albumArtists: track.albumArtists,
      trackNumber: track.trackNumber,
      discNumber: track.discNumber,
      imageURL: track.imageURL,
      duration_ms: track.duration_ms,
      youtubeVideoId: track.youtubeVideoId,
      youtubeUrl: track.youtubeUrl,
      audioUrl: track.audioUrl,
      audioFormat: track.audioFormat,
    }),
    []
  );

  const handleDownloadTrack = (track: TrackPreview) => {
    const download = downloadsById.get(track.spotifyId);
    if (track.isDownloaded || download?.status === 'completed') return;
    enqueueDownloads([toDownloadInput(track)]);
  };

  const handleDownloadAll = () => {
    enqueueDownloads(
      tracks
        .filter((track) => {
          const download = downloadsById.get(track.spotifyId);
          return !track.isDownloaded && download?.status !== 'completed';
        })
        .map(toDownloadInput)
    );
  };

  const downloadableCount = tracks.filter((track) => {
    const download = downloadsById.get(track.spotifyId);
    return !track.isDownloaded && download?.status !== 'completed';
  }).length;

  return (
    <SheetFrame
      visible={visible}
      title="Adicionar músicas"
      onClose={handleClose}
    >
      <View style={styles.inputSection}>
        <Text style={styles.label}>Cole um link do Spotify ou YouTube:</Text>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.textInput}
            value={inputText}
            onChangeText={(t) => {
              setInputText(t);
              setError('');
            }}
            placeholder="https://open.spotify.com/track/... ou youtube.com/watch?v=..."
            placeholderTextColor="#666"
            multiline={false}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Pressable
            onPress={handlePasteFromClipboard}
            style={styles.pasteButton}
          >
            <MaterialCommunityIcons
              name="clipboard-text-outline"
              size={20}
              color="#1DB954"
            />
          </Pressable>
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <Pressable
          onPress={handleImport}
          style={[
            styles.importButton,
            isLoading && styles.importButtonDisabled,
          ]}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#000" size="small" />
          ) : (
            <Text style={styles.importButtonText}>Buscar Músicas</Text>
          )}
        </Pressable>
      </View>

      {tracks.length > 0 ? (
        <View style={styles.resultsSection}>
          <View style={styles.resultsHeader}>
            <Text style={styles.resultsCount}>
              {tracks.length} {tracks.length === 1 ? 'música' : 'músicas'}{' '}
              encontrada{tracks.length !== 1 ? 's' : ''}
            </Text>
            {downloadableCount > 0 ? (
              <Pressable
                onPress={handleDownloadAll}
                style={styles.downloadAllButton}
              >
                <Ionicons name="download-outline" size={16} color="#000" />
                <Text style={styles.downloadAllText}>Baixar Todas</Text>
              </Pressable>
            ) : null}
          </View>

          <View style={styles.trackList}>
            {tracks.map((track, index) => {
              const download = downloadsById.get(track.spotifyId);
              const isComplete =
                track.isDownloaded || download?.status === 'completed';
              const isActive =
                download?.status === 'queued' ||
                download?.status === 'resolving' ||
                download?.status === 'downloading';
              return (
                <View key={track.spotifyId + index} style={styles.trackItem}>
                  {track.imageURL ? (
                    <Image
                      source={{ uri: track.imageURL }}
                      style={styles.trackImage}
                    />
                  ) : (
                    <View
                      style={[styles.trackImage, styles.trackImageFallback]}
                    >
                      <Ionicons name="musical-note" size={16} color="#555" />
                    </View>
                  )}

                  <View style={styles.trackInfo}>
                    <Text style={styles.trackTitle} numberOfLines={1}>
                      {track.title}
                    </Text>
                    <Text style={styles.trackArtist} numberOfLines={1}>
                      {track.artistName}
                    </Text>
                    {download?.status === 'downloading' && (
                      <View style={styles.progressBarContainer}>
                        <View
                          style={[
                            styles.progressBar,
                            {
                              width: `${Math.round(download.progress * 100)}%`,
                            },
                          ]}
                        />
                      </View>
                    )}
                  </View>

                  <Pressable
                    onPress={() => handleDownloadTrack(track)}
                    style={styles.downloadButton}
                    disabled={isComplete || isActive}
                  >
                    {isComplete ? (
                      <Ionicons
                        name="checkmark-circle"
                        size={22}
                        color="#1DB954"
                      />
                    ) : isActive ? (
                      <ActivityIndicator size="small" color="#1DB954" />
                    ) : download?.status === 'error' ? (
                      <Ionicons name="alert-circle" size={22} color="#FF4444" />
                    ) : (
                      <Ionicons
                        name="download-outline"
                        size={22}
                        color="#FFFFFF"
                      />
                    )}
                  </Pressable>
                </View>
              );
            })}
          </View>
        </View>
      ) : null}
    </SheetFrame>
  );
};

const styles = StyleSheet.create({
  inputSection: {
    gap: 12,
  },
  label: {
    color: '#A0A0A0',
    fontSize: 13,
    fontFamily: 'SF-Regular',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  textInput: {
    flex: 1,
    backgroundColor: '#282828',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'SF-Regular',
  },
  pasteButton: {
    backgroundColor: '#282828',
    borderRadius: 8,
    padding: 12,
  },
  errorText: {
    color: '#FF4444',
    fontSize: 12,
    fontFamily: 'SF-Regular',
  },
  importButton: {
    backgroundColor: '#1DB954',
    borderRadius: 24,
    paddingVertical: 14,
    alignItems: 'center',
  },
  importButtonDisabled: {
    opacity: 0.6,
  },
  importButtonText: {
    color: '#000',
    fontSize: 15,
    fontFamily: 'SF-Semibold',
  },
  resultsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 4,
  },
  resultsCount: {
    color: '#A0A0A0',
    fontSize: 13,
    fontFamily: 'SF-Regular',
  },
  downloadAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#1DB954',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  downloadAllText: {
    color: '#000',
    fontSize: 13,
    fontFamily: 'SF-Semibold',
  },
  trackList: {
    gap: 0,
  },
  resultsSection: {
    gap: 8,
  },
  trackItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#282828',
  },
  trackImage: {
    width: 44,
    height: 44,
    borderRadius: 4,
  },
  trackImageFallback: {
    backgroundColor: '#282828',
    alignItems: 'center',
    justifyContent: 'center',
  },
  trackInfo: {
    flex: 1,
    gap: 3,
  },
  trackTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'SF-Semibold',
  },
  trackArtist: {
    color: '#A0A0A0',
    fontSize: 12,
    fontFamily: 'SF-Regular',
  },
  progressBarContainer: {
    height: 2,
    backgroundColor: '#333',
    borderRadius: 1,
    marginTop: 4,
    overflow: 'hidden',
  },
  progressBar: {
    height: 2,
    backgroundColor: '#1DB954',
  },
  downloadButton: {
    padding: 8,
  },
});

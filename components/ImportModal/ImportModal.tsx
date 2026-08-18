/**
 * ImportModal Component
 * Allows users to paste a Spotify link and download the track/playlist/album
 */

import * as React from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Image,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import { parseSpotifyLink } from '@services';
import { resolveAudioUrl } from '@services';
import { downloadTrack, isTrackDownloaded } from '@services';
import { COLORS } from '@config';

import { getPlaylist, getPlaylistItems } from '@api';
import { getAlbum } from '@api';
import { getSessionlessToken } from '@api';
import axios from 'axios';

type TrackPreview = {
  spotifyId: string;
  title: string;
  artistName: string;
  albumName: string;
  imageURL: string;
  duration_ms: number;
  isDownloaded?: boolean;
  downloadStatus?: 'idle' | 'resolving' | 'downloading' | 'done' | 'error';
  downloadProgress?: number;
};

type ImportModalProps = {
  visible: boolean;
  onClose: () => void;
};

const BASE_URL = 'https://api.spotify.com/v1';

const fetchTrackById = async (trackId: string): Promise<TrackPreview | null> => {
  const spotifyUrl = `https://open.spotify.com/track/${trackId}`;

  // 1. Primary: SongLink / Odesli (Universal music metadata engine)
  try {
    const songlinkRes = await axios.get(
      `https://api.song.link/v1-alpha.1/links?url=${encodeURIComponent(spotifyUrl)}&userCountry=BR`,
      { timeout: 7000 }
    );
    const data = songlinkRes.data;
    const entityId = data.entityUniqueId;
    const entity = data.entitiesByUniqueId?.[entityId];

    if (entity && entity.title) {
      const deezerUrl = data.linksByPlatform?.deezer?.url;
      let duration_ms = 0;

      // If Deezer link exists, fetch exact duration and album
      let albumName = 'Spotify';
      if (deezerUrl) {
        try {
          const deezerId = deezerUrl.split('/').pop();
          const dRes = await axios.get(`https://api.deezer.com/track/${deezerId}`, { timeout: 4000 });
          if (dRes.data) {
            duration_ms = (dRes.data.duration || 0) * 1000;
            albumName = dRes.data.album?.title || albumName;
          }
        } catch {}
      }

      return {
        spotifyId: trackId,
        title: entity.title,
        artistName: entity.artistName || 'Unknown Artist',
        albumName,
        imageURL: entity.thumbnailUrl || '',
        duration_ms,
      };
    }
  } catch (songlinkErr) {
    console.warn('[ImportModal] Songlink lookup failed:', songlinkErr);
  }

  // 2. Secondary: Spotyloader API
  try {
    const spotyloaderRes = await axios.get(
      `https://spotyloader.com/api/spotify/info?url=${encodeURIComponent(spotifyUrl)}`,
      { timeout: 6000 }
    );
    const post = spotyloaderRes.data?.post;
    if (post && post.name) {
      const artist = Array.isArray(post.artists) ? post.artists.join(', ') : (post.artist || 'Unknown Artist');
      return {
        spotifyId: trackId,
        title: post.name,
        artistName: artist,
        albumName: post.album || 'Spotify',
        imageURL: post.image || '',
        duration_ms: post.duration_ms || 0,
      };
    }
  } catch (spotyloaderErr) {
    console.warn('[ImportModal] Spotyloader lookup failed:', spotyloaderErr);
  }

  // 3. Tertiary: Public Spotify oEmbed
  try {
    const oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(spotifyUrl)}`;
    const response = await axios.get(oembedUrl, { timeout: 5000 });
    const data = response.data as {
      title?: string;
      thumbnail_url?: string;
      author_name?: string;
    };

    let title = (data.title || 'Unknown Track').replace(/^[\s\-–—]+/, '').trim();
    let artistName = (data.author_name || '').trim();

    if (!artistName && title.includes(' - ')) {
      const parts = title.split(' - ');
      if (parts[0].trim() && parts[1]?.trim()) {
        artistName = parts[0].trim();
        title = parts.slice(1).join(' - ').trim();
      }
    }

    return {
      spotifyId: trackId,
      title,
      artistName: artistName || 'Artista',
      albumName: 'Spotify',
      imageURL: data.thumbnail_url || '',
      duration_ms: 0,
    };
  } catch (oembedError) {
    console.error('[ImportModal] oEmbed fallback failed:', oembedError);
    return null;
  }
};

const fetchPlaylistOrAlbum = async (
  id: string,
  type: 'playlist' | 'album'
): Promise<{ title: string; coverUrl: string; tracks: TrackPreview[] }> => {
  const spotifyUrl = `https://open.spotify.com/${type}/${id}`;

  // 1. Try Spotyloader info API with required headers
  try {
    const res = await axios.get(
      `https://spotyloader.com/api/spotify/info?url=${encodeURIComponent(spotifyUrl)}`,
      {
        headers: {
          Origin: 'https://spotyloader.com',
          Referer: 'https://spotyloader.com/',
          'User-Agent': 'Mozilla/5.0',
        },
        timeout: 7000,
      }
    );
    const post = res.data?.post;
    if (post && post.tracks && Array.isArray(post.tracks) && post.tracks.length > 0) {
      const albumTitle = post.name || (type === 'album' ? 'Álbum' : 'Playlist');
      const coverUrl = post.image || '';
      const list: TrackPreview[] = [];

      for (const t of post.tracks) {
        const trackId = t.id || t.url?.split('/').pop() || Math.random().toString();
        const already = await isTrackDownloaded(trackId);
        const artist = Array.isArray(t.artists) ? t.artists.join(', ') : (t.artist || 'Unknown Artist');
        list.push({
          spotifyId: trackId,
          title: t.name || t.title || 'Música',
          artistName: artist,
          albumName: albumTitle,
          imageURL: t.image || coverUrl,
          duration_ms: t.duration_ms || 0,
          isDownloaded: already,
        });
      }

      if (list.length > 0) {
        return { title: albumTitle, coverUrl, tracks: list };
      }
    }
  } catch (err) {
    console.warn('[ImportModal] Spotyloader playlist/album lookup failed:', err);
  }

  // 2. Try Spotify Embed HTML scraper (__NEXT_DATA__)
  try {
    const embedRes = await axios.get(`https://open.spotify.com/embed/${type}/${id}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      timeout: 7000,
    });
    const html = embedRes.data as string;
    const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([^<]+)<\/script>/);
    if (match && match[1]) {
      const nextData = JSON.parse(match[1]);
      const entity = nextData.props?.pageProps?.state?.data?.entity;
      if (entity && entity.trackList && entity.trackList.length > 0) {
        const albumTitle = entity.name || (type === 'album' ? 'Álbum' : 'Playlist');
        const coverUrl = entity.coverArt?.sources?.[0]?.url || '';
        const list: TrackPreview[] = [];

        for (const t of entity.trackList) {
          const trackId = t.uri?.replace('spotify:track:', '') || t.id || Math.random().toString();
          const already = await isTrackDownloaded(trackId);
          list.push({
            spotifyId: trackId,
            title: t.title || 'Música',
            artistName: t.subtitle || 'Unknown Artist',
            albumName: albumTitle,
            imageURL: coverUrl,
            duration_ms: t.duration || 0,
            isDownloaded: already,
          });
        }

        if (list.length > 0) {
          return { title: albumTitle, coverUrl, tracks: list };
        }
      }
    }
  } catch (embedErr) {
    console.warn('[ImportModal] Spotify Embed playlist/album lookup failed:', embedErr);
  }

  // 3. Fallback: Songlink + Deezer for albums
  if (type === 'album') {
    try {
      const songlinkRes = await axios.get(
        `https://api.song.link/v1-alpha.1/links?url=${encodeURIComponent(spotifyUrl)}&userCountry=BR`,
        { timeout: 7000 }
      );
      const deezerAlbumUrl = songlinkRes.data?.linksByPlatform?.deezer?.url;
      if (deezerAlbumUrl) {
        const deezerAlbumId = deezerAlbumUrl.split('/').pop();
        const dRes = await axios.get(`https://api.deezer.com/album/${deezerAlbumId}`, { timeout: 5000 });
        const albumData = dRes.data;
        if (albumData && albumData.tracks?.data) {
          const list: TrackPreview[] = [];
          for (const t of albumData.tracks.data) {
            const trackSpotifyId = `dz_${t.id}`;
            const already = await isTrackDownloaded(trackSpotifyId);
            list.push({
              spotifyId: trackSpotifyId,
              title: t.title,
              artistName: t.artist?.name || albumData.artist?.name || 'Unknown Artist',
              albumName: albumData.title || 'Álbum',
              imageURL: albumData.cover_big || albumData.cover_medium || '',
              duration_ms: (t.duration || 0) * 1000,
              isDownloaded: already,
            });
          }
          if (list.length > 0) {
            return { title: albumData.title, coverUrl: albumData.cover_big || '', tracks: list };
          }
        }
      }
    } catch {}
  }

  return { title: '', coverUrl: '', tracks: [] };
};

const fetchYouTubeTrack = async (videoId: string): Promise<TrackPreview | null> => {
  try {
    const res = await axios.get(
      `https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`,
      { timeout: 6000 }
    );
    const data = res.data;
    if (data && data.title) {
      const trackId = `yt_${videoId}`;
      const already = await isTrackDownloaded(trackId);
      return {
        spotifyId: trackId,
        title: data.title,
        artistName: data.author_name || 'YouTube Music',
        albumName: 'YouTube Track',
        imageURL: data.thumbnail_url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        duration_ms: 0,
        isDownloaded: already,
      };
    }
  } catch (err) {
    console.warn('[ImportModal] YouTube track fetch failed:', err);
  }
  return null;
};

const fetchYouTubePlaylist = async (playlistId: string): Promise<TrackPreview[]> => {
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
            isDownloaded: already,
          });
        }
        if (list.length > 0) return list;
      }
    } catch {}
  }
  return [];
};

export const ImportModal = ({ visible, onClose }: ImportModalProps) => {
  const [inputText, setInputText] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);
  const [tracks, setTracks] = React.useState<TrackPreview[]>([]);
  const [error, setError] = React.useState('');

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

      if (parsed.platform === 'youtube') {
        if (parsed.type === 'track') {
          const ytTrack = await fetchYouTubeTrack(parsed.id);
          if (ytTrack) tracksToShow = [ytTrack];
        } else if (parsed.type === 'playlist') {
          tracksToShow = await fetchYouTubePlaylist(parsed.id);
        }
      } else {
        // Spotify
        if (parsed.type === 'track') {
          const track = await fetchTrackById(parsed.id);
          if (track) {
            const alreadyDownloaded = await isTrackDownloaded(track.spotifyId);
            tracksToShow = [{ ...track, isDownloaded: alreadyDownloaded }];
          }
        } else if (parsed.type === 'playlist' || parsed.type === 'album') {
          const result = await fetchPlaylistOrAlbum(parsed.id, parsed.type);
          tracksToShow = result.tracks;
        }
      }

      if (tracksToShow.length === 0) {
        setError('Nenhuma música encontrada. Verifique o link e tente novamente.');
      } else {
        setTracks(tracksToShow);
      }
    } catch (err) {
      setError('Erro ao buscar dados. Verifique o link e tente novamente.');
      console.error('[ImportModal] handleImport error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownloadTrack = async (index: number) => {
    const track = tracks[index];
    if (!track || track.isDownloaded || track.downloadStatus === 'done') return;

    // Update status to resolving
    setTracks((prev) =>
      prev.map((t, i) =>
        i === index ? { ...t, downloadStatus: 'resolving', downloadProgress: 0 } : t
      )
    );

    try {
      // Resolve audio URL
      const resolved = await resolveAudioUrl(
        track.title,
        track.artistName,
        track.spotifyId,
        track.duration_ms
      );
      if (!resolved) {
        throw new Error('Não foi possível encontrar a faixa de áudio.');
      }

      // Update to downloading
      setTracks((prev) =>
        prev.map((t, i) =>
          i === index ? { ...t, downloadStatus: 'downloading', downloadProgress: 0 } : t
        )
      );

      // Download
      const result = await downloadTrack(
        {
          spotifyId: track.spotifyId,
          title: track.title,
          artistName: track.artistName,
          albumName: track.albumName,
          imageURL: track.imageURL,
          duration_ms: track.duration_ms,
        },
        resolved.url,
        resolved.format,
        (progress) => {
          setTracks((prev) =>
            prev.map((t, i) =>
              i === index ? { ...t, downloadProgress: progress } : t
            )
          );
        }
      );

      if (result) {
        setTracks((prev) =>
          prev.map((t, i) =>
            i === index ? { ...t, downloadStatus: 'done', isDownloaded: true, downloadProgress: 1 } : t
          )
        );
      } else {
        throw new Error('Download falhou.');
      }
    } catch (err) {
      console.error('[ImportModal] download error:', err);
      setTracks((prev) =>
        prev.map((t, i) =>
          i === index ? { ...t, downloadStatus: 'error', downloadProgress: 0 } : t
        )
      );
      Alert.alert('Erro no Download', String(err));
    }
  };

  const handleDownloadAll = async () => {
    const indicesToDownload = tracks
      .map((t, idx) => ({ t, idx }))
      .filter(({ t }) => !t.isDownloaded && t.downloadStatus !== 'done')
      .map(({ idx }) => idx);

    const CONCURRENCY = 3;
    for (let i = 0; i < indicesToDownload.length; i += CONCURRENCY) {
      const batch = indicesToDownload.slice(i, i + CONCURRENCY);
      await Promise.allSettled(batch.map((idx) => handleDownloadTrack(idx)));
    }
  };

  const downloadableCount = tracks.filter((t) => !t.isDownloaded && t.downloadStatus !== 'done').length;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={handleClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color="#FFFFFF" />
          </Pressable>
          <Text style={styles.title}>Importar do Spotify</Text>
          <View style={styles.headerRight} />
        </View>

        {/* Input Section */}
        <View style={styles.inputSection}>
          <Text style={styles.label}>Cole o link do Spotify:</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.textInput}
              value={inputText}
              onChangeText={(t) => {
                setInputText(t);
                setError('');
              }}
              placeholder="https://open.spotify.com/track/..."
              placeholderTextColor="#666"
              multiline={false}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Pressable onPress={handlePasteFromClipboard} style={styles.pasteButton}>
              <MaterialCommunityIcons name="clipboard-text-outline" size={20} color="#1DB954" />
            </Pressable>
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <Pressable
            onPress={handleImport}
            style={[styles.importButton, isLoading && styles.importButtonDisabled]}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#000" size="small" />
            ) : (
              <Text style={styles.importButtonText}>Buscar Músicas</Text>
            )}
          </Pressable>
        </View>

        {/* Results */}
        {tracks.length > 0 && (
          <>
            <View style={styles.resultsHeader}>
              <Text style={styles.resultsCount}>
                {tracks.length} {tracks.length === 1 ? 'música' : 'músicas'} encontrada{tracks.length !== 1 ? 's' : ''}
              </Text>
              {downloadableCount > 0 && (
                <Pressable onPress={handleDownloadAll} style={styles.downloadAllButton}>
                  <Ionicons name="download-outline" size={16} color="#000" />
                  <Text style={styles.downloadAllText}>Baixar Todas</Text>
                </Pressable>
              )}
            </View>

            <ScrollView style={styles.trackList} showsVerticalScrollIndicator={false}>
              {tracks.map((track, index) => (
                <View key={track.spotifyId + index} style={styles.trackItem}>
                  {track.imageURL ? (
                    <Image source={{ uri: track.imageURL }} style={styles.trackImage} />
                  ) : (
                    <View style={[styles.trackImage, styles.trackImageFallback]}>
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
                    {track.downloadStatus === 'downloading' && (
                      <View style={styles.progressBarContainer}>
                        <View
                          style={[
                            styles.progressBar,
                            { width: `${Math.round((track.downloadProgress || 0) * 100)}%` },
                          ]}
                        />
                      </View>
                    )}
                  </View>

                  <Pressable
                    onPress={() => handleDownloadTrack(index)}
                    style={styles.downloadButton}
                    disabled={
                      track.isDownloaded ||
                      track.downloadStatus === 'done' ||
                      track.downloadStatus === 'downloading' ||
                      track.downloadStatus === 'resolving'
                    }
                  >
                    {track.isDownloaded || track.downloadStatus === 'done' ? (
                      <Ionicons name="checkmark-circle" size={22} color="#1DB954" />
                    ) : track.downloadStatus === 'resolving' ? (
                      <ActivityIndicator size="small" color="#1DB954" />
                    ) : track.downloadStatus === 'downloading' ? (
                      <ActivityIndicator size="small" color="#1DB954" />
                    ) : track.downloadStatus === 'error' ? (
                      <Ionicons name="alert-circle" size={22} color="#FF4444" />
                    ) : (
                      <Ionicons name="download-outline" size={22} color="#FFFFFF" />
                    )}
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          </>
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
    paddingTop: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#282828',
  },
  closeButton: {
    padding: 4,
  },
  title: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 18,
    fontFamily: 'SF-Semibold',
    textAlign: 'center',
  },
  headerRight: {
    width: 32,
  },
  inputSection: {
    padding: 20,
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
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#282828',
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
    flex: 1,
    paddingHorizontal: 20,
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

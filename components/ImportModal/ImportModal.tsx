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

import { getPlaylist, getPlaylistItems } from '@api';
import { MUSIC_SERVER_URL } from '@config';
import { fetchWithTimeout } from '@utils';
import axios from 'axios';

type TrackPreview = {
  spotifyId: string;
  title: string;
  artistName: string;
  albumName: string;
  imageURL: string;
  duration_ms: number;
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

type SpotifyEmbedEntity = {
  spotifyId?: string;
  name?: string;
  title?: string;
  subtitle?: string;
  uri?: string;
  duration?: number;
  duration_ms?: number;
  artistName?: string;
  imageURL?: string;
  albumName?: string;
  artists?: { name?: string }[];
  album?: { name?: string; coverArt?: { sources?: { url?: string }[] } };
  coverArt?: { sources?: { url?: string }[] };
  visualIdentity?: { image?: { url?: string }[] };
  trackList?: SpotifyEmbedEntity[];
};

const NEXT_DATA_PATTERN =
  /<script id="__NEXT_DATA__" type="application\/json">([^<]+)<\/script>/;

const getCoverUrl = (entity: SpotifyEmbedEntity): string =>
  entity.imageURL ||
  entity.visualIdentity?.image?.[0]?.url ||
  entity.album?.coverArt?.sources?.[0]?.url ||
  entity.coverArt?.sources?.[0]?.url ||
  '';

const toTrackPreview = (
  entity: SpotifyEmbedEntity,
  fallback: Partial<TrackPreview> = {}
): TrackPreview | null => {
  const spotifyId =
    entity.spotifyId ||
    entity.uri?.replace(/^spotify:track:/, '') ||
    fallback.spotifyId;
  const title = entity.name || entity.title || fallback.title;
  if (!spotifyId || !title) return null;

  return {
    spotifyId,
    title,
    artistName:
      entity.artists
        ?.map((artist) => artist.name)
        .filter(Boolean)
        .join(', ') ||
      entity.artistName ||
      entity.subtitle ||
      fallback.artistName ||
      'Artista',
    albumName:
      entity.albumName || entity.album?.name || fallback.albumName || 'Spotify',
    imageURL: getCoverUrl(entity) || fallback.imageURL || '',
    duration_ms:
      entity.duration_ms || entity.duration || fallback.duration_ms || 0,
  };
};

const withDownloadState = async (
  tracks: TrackPreview[]
): Promise<TrackPreview[]> => {
  const downloadedIds = new Set(
    (await getDownloadedTracks()).map((track) => track.spotifyId)
  );
  return tracks.map((track) => ({
    ...track,
    isDownloaded: downloadedIds.has(track.spotifyId),
  }));
};

const fetchSpotifyEmbedEntity = async (
  type: 'track' | 'playlist' | 'album',
  id: string
): Promise<SpotifyEmbedEntity | null> => {
  try {
    const response = await fetchWithTimeout(
      `https://open.spotify.com/embed/${type}/${id}`,
      {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      },
      12_000
    );
    if (!response.ok) return null;
    const match = (await response.text()).match(NEXT_DATA_PATTERN);
    return match?.[1]
      ? (JSON.parse(match[1]).props?.pageProps?.state?.data?.entity ?? null)
      : null;
  } catch {
    return null;
  }
};

const fetchCollectionOnDevice = async (
  id: string,
  type: 'playlist' | 'album'
): Promise<{
  title: string;
  coverUrl: string;
  tracks: TrackPreview[];
} | null> => {
  const collection = await fetchSpotifyEmbedEntity(type, id);
  const entries = collection?.trackList ?? [];
  if (!collection?.name || entries.length === 0) return null;

  const tracks: (TrackPreview | null)[] = [];
  for (let index = 0; index < entries.length; index += 4) {
    tracks.push(
      ...(await Promise.all(
        entries.slice(index, index + 4).map(async (entry) => {
          const fallback = toTrackPreview(entry, {
            albumName: collection.name,
          });
          if (!fallback) return null;
          const canonical = await fetchSpotifyEmbedEntity(
            'track',
            fallback.spotifyId
          );
          return toTrackPreview(canonical ?? {}, fallback);
        })
      ))
    );
  }

  return {
    title: collection.name,
    coverUrl: getCoverUrl(collection),
    tracks: await withDownloadState(
      tracks.filter((track): track is TrackPreview => track !== null)
    ),
  };
};

const fetchCollectionFromServer = async (
  id: string,
  type: 'playlist' | 'album'
): Promise<{
  title: string;
  coverUrl: string;
  tracks: TrackPreview[];
} | null> => {
  try {
    const response = await fetchWithTimeout(
      `${MUSIC_SERVER_URL}/api/spotify/${type}/${id}`,
      {},
      30_000
    );
    if (!response.ok) return null;
    const collection = (await response.json()) as {
      title?: string;
      coverUrl?: string;
      tracks?: SpotifyEmbedEntity[];
    };
    const tracks = (collection.tracks ?? [])
      .map((track) => toTrackPreview(track))
      .filter((track): track is TrackPreview => track !== null);
    return collection.title && tracks.length
      ? {
          title: collection.title,
          coverUrl: collection.coverUrl || '',
          tracks: await withDownloadState(tracks),
        }
      : null;
  } catch {
    return null;
  }
};

const fetchTrackById = async (
  trackId: string
): Promise<TrackPreview | null> => {
  const cleanTrackId = trackId.replace(/^spotify:track:/, '').split('?')[0];

  // PRIMARY: same canonical backend on web and native. Native scraping alone
  // loses per-track metadata and sends it down a different resolver path.
  try {
    if (!MUSIC_SERVER_URL) throw new Error('Music server unavailable');
    const backendRes = await fetchWithTimeout(
      `${MUSIC_SERVER_URL}/api/spotify/track/${cleanTrackId}`,
      {},
      3000
    );
    if (backendRes.ok) {
      const data = await backendRes.json();
      if (data && data.title) {
        return {
          spotifyId: cleanTrackId,
          title: data.title,
          artistName: Array.isArray(data.artists)
            ? data.artists.map((a: any) => a.name).join(', ')
            : data.artistName,
          albumName: data.albumName || 'Spotify',
          imageURL: data.imageURL || '',
          duration_ms: data.duration_ms || 0,
        };
      }
    }
  } catch {}

  if (Platform.OS !== 'web') {
    return toTrackPreview(
      (await fetchSpotifyEmbedEntity('track', cleanTrackId)) ?? {},
      { spotifyId: cleanTrackId }
    );
  }

  const spotifyUrl = `https://open.spotify.com/track/${cleanTrackId}`;

  // 1. SECONDARY: Official Spotify Embed (__NEXT_DATA__) scraper
  try {
    const embedUrls = [
      `https://open.spotify.com/embed/track/${cleanTrackId}`,
      `https://api.allorigins.win/raw?url=${encodeURIComponent(`https://open.spotify.com/embed/track/${cleanTrackId}`)}`,
    ];

    for (const embedUrl of embedUrls) {
      try {
        const res = await axios.get(embedUrl, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
          timeout: 4000,
        });

        const html = res.data;
        if (typeof html === 'string') {
          const nextDataMatch = html.match(
            /<script id="__NEXT_DATA__" type="application\/json">([^<]+)<\/script>/
          );
          if (nextDataMatch) {
            const parsed = JSON.parse(nextDataMatch[1]);
            const entity = parsed.props?.pageProps?.state?.data?.entity;
            if (entity && entity.name) {
              const artists =
                entity.artists
                  ?.map((a: { name: string }) => a.name)
                  .join(', ') || '';
              const cover =
                entity.visualIdentity?.image?.[0]?.url ||
                entity.album?.coverArt?.sources?.[0]?.url ||
                entity.coverArt?.sources?.[0]?.url ||
                '';

              if (artists) {
                return {
                  spotifyId: cleanTrackId,
                  title: entity.name,
                  artistName: artists,
                  albumName: entity.album?.name || 'Spotify',
                  imageURL: cover,
                  duration_ms: entity.duration || 0,
                };
              }
            }
          }
        }
      } catch {}
    }
  } catch (embedErr) {
    console.warn('[ImportModal] Spotify embed lookup failed:', embedErr);
  }

  // 2. TERTIARY: Public Spotify oEmbed
  try {
    const oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(spotifyUrl)}`;
    const response = await axios.get(oembedUrl, { timeout: 4000 });
    const data = response.data as {
      title?: string;
      thumbnail_url?: string;
      author_name?: string;
    };

    let title = (data.title || 'Unknown Track')
      .replace(/^[\s\-–—]+/, '')
      .trim();
    let artistName = (data.author_name || '').trim();

    return {
      spotifyId: cleanTrackId,
      title,
      artistName: artistName || 'Artista',
      albumName: 'Spotify',
      imageURL: data.thumbnail_url || '',
      duration_ms: 0,
    };
  } catch (oembedError) {
    console.error('[ImportModal] oEmbed fallback failed:', oembedError);
  }

  return null;
};

const fetchPlaylistOrAlbum = async (
  id: string,
  type: 'playlist' | 'album'
): Promise<{ title: string; coverUrl: string; tracks: TrackPreview[] }> => {
  const fromServer = MUSIC_SERVER_URL
    ? await fetchCollectionFromServer(id, type)
    : null;
  if (fromServer) return fromServer;

  // Spotify embed works natively without browser CORS. Do not make the
  // following metadata fallbacks dead when it is unavailable.
  if (Platform.OS !== 'web') {
    const onDevice = await fetchCollectionOnDevice(id, type);
    if (onDevice) return onDevice;
  }

  const spotifyUrl = `https://open.spotify.com/${type}/${id}`;

  // Spotify's own playlist endpoint exposes each track's album art. This must
  // run before fallbacks, which only know the playlist container cover.
  if (type === 'playlist') {
    try {
      const playlist = await getPlaylist(id);
      const spotifyTracks = [];
      const limit = 100;

      for (let offset = 0; ; offset += limit) {
        const page = await getPlaylistItems({ playlistId: id, limit, offset });
        spotifyTracks.push(...page);
        if (page.length < limit) break;
      }

      if (spotifyTracks.length > 0) {
        const downloadedIds = new Set(
          (await getDownloadedTracks()).map((track) => track.spotifyId)
        );
        const tracks = spotifyTracks.map((track) => ({
          spotifyId: track.id,
          title: track.title,
          artistName: track.subtitle,
          albumName: track.albumName || playlist.title,
          imageURL: track.imageURL || '',
          duration_ms: track.durationMs || 0,
          isDownloaded: downloadedIds.has(track.id),
        }));

        return {
          title: playlist.title,
          coverUrl: playlist.imageURL,
          tracks,
        };
      }
    } catch (error) {
      console.warn(
        '[ImportModal] Spotify playlist metadata lookup failed:',
        error
      );
    }
  }

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
    if (
      post &&
      post.tracks &&
      Array.isArray(post.tracks) &&
      post.tracks.length > 0
    ) {
      const albumTitle = post.name || (type === 'album' ? 'Álbum' : 'Playlist');
      const coverUrl = post.image || '';
      const list: TrackPreview[] = [];

      for (const t of post.tracks) {
        const trackId =
          t.id || t.url?.split('/').pop() || Math.random().toString();
        const already = await isTrackDownloaded(trackId);
        const artist = Array.isArray(t.artists)
          ? t.artists.join(', ')
          : t.artist || 'Unknown Artist';
        list.push({
          spotifyId: trackId,
          title: t.name || t.title || 'Música',
          artistName: artist,
          albumName: albumTitle,
          imageURL:
            type === 'playlist'
              ? t.image && t.image !== coverUrl
                ? t.image
                : ''
              : t.image || coverUrl,
          duration_ms: t.duration_ms || 0,
          isDownloaded: already,
        });
      }

      if (list.length > 0) {
        return { title: albumTitle, coverUrl, tracks: list };
      }
    }
  } catch (err) {
    console.warn(
      '[ImportModal] Spotyloader playlist/album lookup failed:',
      err
    );
  }

  // 2. Try Spotify Embed HTML scraper (__NEXT_DATA__)
  try {
    const embedRes = await axios.get(
      `https://open.spotify.com/embed/${type}/${id}`,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        timeout: 7000,
      }
    );
    const html = embedRes.data as string;
    const match = html.match(
      /<script id="__NEXT_DATA__" type="application\/json">([^<]+)<\/script>/
    );
    const nextDataPayload = match?.[1];
    if (nextDataPayload) {
      const nextData = JSON.parse(nextDataPayload!);
      const entity = nextData.props?.pageProps?.state?.data?.entity;
      if (entity && entity.trackList && entity.trackList.length > 0) {
        const albumTitle =
          entity.name || (type === 'album' ? 'Álbum' : 'Playlist');
        const coverUrl = entity.coverArt?.sources?.[0]?.url || '';
        const list: TrackPreview[] = [];

        for (const t of entity.trackList) {
          const trackId =
            t.uri?.replace('spotify:track:', '') ||
            t.id ||
            Math.random().toString();
          const already = await isTrackDownloaded(trackId);
          list.push({
            spotifyId: trackId,
            title: t.title || 'Música',
            artistName: t.subtitle || 'Unknown Artist',
            albumName: albumTitle,
            imageURL: type === 'album' ? coverUrl : '',
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
    console.warn(
      '[ImportModal] Spotify Embed playlist/album lookup failed:',
      embedErr
    );
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
        const dRes = await axios.get(
          `https://api.deezer.com/album/${deezerAlbumId}`,
          { timeout: 5000 }
        );
        const albumData = dRes.data;
        if (albumData && albumData.tracks?.data) {
          const list: TrackPreview[] = [];
          for (const t of albumData.tracks.data) {
            const trackSpotifyId = `dz_${t.id}`;
            const already = await isTrackDownloaded(trackSpotifyId);
            list.push({
              spotifyId: trackSpotifyId,
              title: t.title,
              artistName:
                t.artist?.name || albumData.artist?.name || 'Unknown Artist',
              albumName: albumData.title || 'Álbum',
              imageURL: albumData.cover_big || albumData.cover_medium || '',
              duration_ms: (t.duration || 0) * 1000,
              isDownloaded: already,
            });
          }
          if (list.length > 0) {
            return {
              title: albumData.title,
              coverUrl: albumData.cover_big || '',
              tracks: list,
            };
          }
        }
      }
    } catch {}
  }

  return (
    (await fetchCollectionOnDevice(id, type)) ?? {
      title: '',
      coverUrl: '',
      tracks: [],
    }
  );
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
          directTrack.imageURL || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        duration_ms: directTrack.durationMs,
        youtubeUrl,
        audioUrl: directTrack.url,
        audioFormat: directTrack.format,
        isDownloaded: already,
      };
    }
  }

  try {
    if (!MUSIC_SERVER_URL) return null;
    const response = await axios.post(
      `${MUSIC_SERVER_URL}/api/music/youtube`,
      { url: youtubeUrl },
      { timeout: 9000 }
    );
    const track = response.data?.track;
    if (track?.videoId === videoId && track.title && track.streamUrl) {
      const trackId = `yt_${videoId}`;
      const already = await isTrackDownloaded(trackId);
      return {
        spotifyId: trackId,
        title: track.title,
        artistName: track.artistName || 'YouTube Music',
        albumName: track.albumName || 'YouTube Track',
        imageURL:
          track.imageURL || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        duration_ms: track.duration_ms || 0,
        youtubeUrl: track.youtubeUrl || youtubeUrl,
        audioUrl: track.streamUrl,
        audioFormat: track.format || 'm4a',
        isDownloaded: already,
      };
    }
  } catch (err) {
    console.warn('[ImportModal] Exact YouTube track fetch failed:', err);
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
          const track = await fetchTrackById(parsed.id);
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
          'Nenhuma música encontrada. Verifique o link e tente novamente.'
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
      setError('Erro ao buscar dados. Verifique o link e tente novamente.');
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
      imageURL: track.imageURL,
      duration_ms: track.duration_ms,
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
    <SheetFrame visible={visible} title="Adicionar músicas" onClose={handleClose}>
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
              const isComplete = track.isDownloaded || download?.status === 'completed';
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

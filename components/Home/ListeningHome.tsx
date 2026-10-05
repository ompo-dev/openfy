import * as React from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { AppIcon as Ionicons } from "../native/AppIcon";
import { usePlayer, useDownloads } from '@context';
import { useDetailNavigation } from '@hooks';
import { getArtistCatalogImage } from '@api';
import { getCachedArtistImage, type PersonalizedHomeSnapshot, type PersonalizedHomeTrack } from '@services';
import { getPlayerAlbum } from '../../services/library/playerAlbum';
import type { HomeRelease } from '../../services/home/personalizedHome';
import { prefetchDetail } from '../../services/navigation/detailPrefetch';
import { PlaylistMosaic } from '../PlaylistMosaic';
import { GlassSurface, LoggedPressable, AppIcon } from '../native';
import { homeRadioPlaylistId, publishHomePlaylists } from '../../services/home/temporaryPlaylists';
import { SkeletonImage } from '../common/SkeletonImage';
import { TrackRow } from '../common/TrackRow';

export const homeTrackToPlayer = (track: PersonalizedHomeTrack) => ({ ...track, imageURL: track.localImagePath || track.imageURL });
const releaseLabel = (release: HomeRelease) => ({ album: 'Álbum', single: 'Single', ep: 'EP', compilation: 'Coletânea', release: 'Lançamento' })[release.releaseType];

function Artwork({ uri, size, artist = false }: { uri?: string; size: number; artist?: boolean }) {
  const shape = { width: size, height: size, borderRadius: artist ? size / 2 : 6 };
  return uri ? <SkeletonImage source={{ uri }} cachePolicy="memory-disk" contentFit="cover" style={shape} /> : (
    <View style={[shape, styles.placeholder]}><Ionicons name={artist ? 'person' : 'musical-notes'} size={size / 4} color="#737373" /></View>
  );
}

function Section({ title, icon, onShowAll, children }: {
  title: string; icon?: React.ReactNode; onShowAll?: () => void; children: React.ReactNode;
}) {
  return <View style={styles.section}>
    <View style={styles.sectionHeader}>
      {icon}
      <Text style={styles.sectionTitle}>{title}</Text>
      {onShowAll ? <LoggedPressable onPress={onShowAll} accessibilityLabel={`Mostrar tudo: ${title}`} style={styles.showAll}>
        <AppIcon name="chevron-forward" size={20} color="#A4A4A4" />
      </LoggedPressable> : null}
    </View>
    {children}
  </View>;
}

function Rail({ children }: { children: React.ReactNode }) {
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>{children}</ScrollView>;
}

export function ListeningHome({ home, loading }: { home: PersonalizedHomeSnapshot; loading: boolean }) {
  const { width } = useWindowDimensions();
  const tileSize = Math.min(136, Math.max(108, (width - 52) / 2.75));
  const releaseSize = tileSize;
  const { currentTrack, isPlaying, playWithQueue, togglePlayPause } = usePlayer((state) => ({
    currentTrack: state.currentTrack, isPlaying: state.playerState.isPlaying,
    playWithQueue: state.playWithQueue, togglePlayPause: state.togglePlayPause,
  }));
  const { downloads, enqueueDownloads } = useDownloads();
  const { openDetail } = useDetailNavigation();
  React.useEffect(() => { if (!loading) publishHomePlaylists(home); }, [home, loading]);
  const [artistImages, setArtistImages] = React.useState<Record<string, string>>({});
  const [startingRelease, setStartingRelease] = React.useState<string | null>(null);
  const recent = home.continueListening;
  const mostPlayed = home.mostPlayed || [];
  const pinnedTracks = home.pinnedTracks || [];
  const pinnedArtists = home.pinnedArtists;
  const releases = home.releases || [];
  const playlists = home.playlists || [];
  const similar = home.similarTracks?.length ? home.similarTracks : home.discoveries;
  const discoveryArtists = home.artists.filter((artist) => !pinnedArtists.some((pinned) =>
    pinned.title.toLocaleLowerCase() === artist.title.toLocaleLowerCase())).slice(0, 6);
  const seed = home.seeds?.[0];
  const portraitCandidates = React.useMemo(() => [...pinnedArtists, ...home.artists].slice(0, 10), [pinnedArtists, home.artists]);
  const portraitsKey = portraitCandidates.map((artist) => `${artist.artistId}:${artist.title}`).join('|');
  const portraitsRef = React.useRef(portraitCandidates);
  portraitsRef.current = portraitCandidates;
  React.useEffect(() => {
    let active = true;
    const candidates = portraitsRef.current;
    let cursor = 0;
    // Portraits only: two requests at a time, no full profiles for every tile.
    void Promise.all([0, 1].map(async () => {
      while (active && cursor < candidates.length) {
        const artist = candidates[cursor++];
        try {
          const uri = artist.imageURL || await getCachedArtistImage(artist.title,
            () => getArtistCatalogImage(artist.artistId, artist.title), [artist.artistId]);
          if (active && uri) setArtistImages((current) => current[artist.artistId] === uri ? current : { ...current, [artist.artistId]: uri });
        } catch {}
      }
    }));
    return () => { active = false; };
  }, [portraitsKey]);

  const play = (tracks: PersonalizedHomeTrack[], index: number, source: string) => {
    if (currentTrack?.spotifyId === tracks[index].spotifyId) { void togglePlayPause(); return; }
    void playWithQueue(tracks.map(homeTrackToPlayer), index, source);
  };
  const renderTrack = (track: PersonalizedHomeTrack, index: number, tracks: PersonalizedHomeTrack[], source: string) => <TrackRow
    key={track.spotifyId} title={track.title} subtitle={track.artistName}
    imageURL={track.localImagePath || track.imageURL}
    active={currentTrack?.spotifyId === track.spotifyId} playing={isPlaying}
    onPress={() => play(tracks, index, source)}
    downloadState={track.isDownloaded ? 'completed' : downloads.some((download) => download.spotifyId === track.spotifyId && download.status !== 'error') ? 'active' : 'idle'}
    onDownload={() => enqueueDownloads([homeTrackToPlayer(track)])}
  />;
  const trackTiles = (tracks: PersonalizedHomeTrack[], source: string) => tracks.map((track, index) => (
    <LoggedPressable key={track.spotifyId} style={[styles.tile, { width: tileSize }]} accessibilityLabel={`Tocar ${track.title}, ${track.artistName}`} onPress={() => play(tracks, index, source)}>
      <Artwork uri={track.localImagePath || track.imageURL} size={tileSize} />
      <Text numberOfLines={1} style={[styles.tileTitle, currentTrack?.spotifyId === track.spotifyId && styles.active]}>{track.title}</Text>
      <Text numberOfLines={1} style={styles.subtitle}>{track.artistName}</Text>
    </LoggedPressable>
  ));
  const startRelease = async (release: HomeRelease) => {
    if (startingRelease) return;
    setStartingRelease(release.id);
    try {
      const album = await getPlayerAlbum(release.id);
      if (!album.tracks.length) throw new Error('empty album');
      openDetail('album', release.id, 'home');
      await playWithQueue(album.tracks, 0, `album:${release.id}`, { continueCurrent: true });
    } catch { Alert.alert('Não foi possível tocar', 'Tente novamente em instantes.'); }
    finally { setStartingRelease(null); }
  };

  if (loading && !recent.length && !home.quickPicks.length) return <View testID="home-skeleton" style={styles.section}>
    <View style={styles.skeletonHeading} />
    <Rail>{[0, 1, 2].map((index) => <View key={index} style={[styles.skeletonTile, { width: tileSize, height: tileSize }]} />)}</Rail>
  </View>;

  return <>
    {pinnedTracks.length || pinnedArtists.length ? <Section title="Pinados" icon={<AppIcon name="pin" size={22} color="#1ED760" />}>
      <Rail>
        {trackTiles(pinnedTracks.slice(0, 2), 'home:pinned')}
        {pinnedArtists.map((artist) => <LoggedPressable key={artist.artistId} style={[styles.tile, { width: tileSize }]} accessibilityLabel={`Abrir artista ${artist.title}`}
          onPressIn={() => prefetchDetail('artist', artist.artistId)} onPress={() => openDetail('artist', artist.artistId, 'home')}>
          <Artwork uri={artistImages[artist.artistId]} size={tileSize} artist />
          <Text numberOfLines={1} style={styles.tileTitle}>{artist.title}</Text><Text style={styles.subtitle}>Artista</Text>
        </LoggedPressable>)}
      </Rail>
    </Section> : null}
    {recent.length ? <Section title="Tocados recentemente" icon={<AppIcon name="time" size={22} color="#1ED760" />} onShowAll={() => openDetail('playlist', 'home_mix_recent', 'home')}>
      <Rail>{trackTiles(recent, 'home:recent')}</Rail>
    </Section> : null}
    {playlists.length ? <Section title="Playlists recentes" icon={<AppIcon name="musical-notes" size={22} color="#1ED760" />}>
      <Rail>{playlists.map((playlist) => {
        const covers = [...new Set([...playlist.trackIds.map((id) => {
          const track = home.tracksById.get(id); return track?.localImagePath || track?.imageURL || '';
        }), ...(playlist.coverImageURLs || [])].filter(Boolean))];
        return <LoggedPressable key={playlist.id} style={[styles.tile, { width: tileSize }]} accessibilityLabel={`Abrir playlist ${playlist.title}`} onPress={() => openDetail('playlist', playlist.id, 'home')}>
          <PlaylistMosaic imageURLs={covers} size={tileSize} />
          <Text numberOfLines={1} style={styles.tileTitle}>{playlist.title}</Text><Text numberOfLines={1} style={styles.subtitle}>Playlist · {playlist.trackIds.length} músicas</Text>
        </LoggedPressable>;
      })}</Rail>
    </Section> : null}
    {releases.length ? <Section title="Novos lançamentos para você" icon={<AppIcon name="sparkles" size={22} color="#1ED760" />}>
      <Rail>{releases.map((release) => <LoggedPressable key={release.id} style={[styles.tile, { width: releaseSize }]} accessibilityLabel={`Abrir ${releaseLabel(release)} ${release.title}`}
        onPressIn={() => prefetchDetail('album', release.id)} onPress={() => openDetail('album', release.id, 'home')}>
        <Artwork uri={release.imageURL} size={releaseSize} />
        <Text numberOfLines={1} style={styles.tileTitle}>{release.title}</Text>
        <Text numberOfLines={1} style={styles.subtitle}>{release.artistName}</Text>
        <Text style={styles.releaseMeta}>{[releaseLabel(release), release.releaseDate.slice(0, 4)].filter(Boolean).join(' · ')}</Text>
      </LoggedPressable>)}</Rail>
    </Section> : null}
    {releases[0] ? <View style={styles.spotlightSection}>
      <LoggedPressable style={styles.artistHeading} accessibilityLabel={`Abrir artista ${releases[0].artistName}`} onPress={() => openDetail('artist', releases[0].artistId, 'home')}>
        <Artwork uri={releases[0].artistImageURL} size={46} artist />
        <View style={styles.flexCopy}><Text style={styles.subtitle}>Lançamento de</Text><Text numberOfLines={1} style={styles.artistTitle}>{releases[0].artistName}</Text></View>
      </LoggedPressable>
      <View style={styles.spotlight}>
        <LoggedPressable style={{ width: Math.min(126, (width - 36) * 0.38), minHeight: 126 }}
          accessibilityLabel={`Abrir álbum ${releases[0].title}`} onPress={() => openDetail('album', releases[0].id, 'home')}>
          <SkeletonImage source={{ uri: releases[0].imageURL }} cachePolicy="memory-disk" contentFit="cover" style={StyleSheet.absoluteFill} />
        </LoggedPressable>
        <View style={styles.spotlightCopy}>
          <Text style={styles.subtitle}>{releaseLabel(releases[0])}</Text>
          <Text numberOfLines={3} style={styles.spotlightTitle}>{releases[0].title}</Text>
          <LoggedPressable accessibilityLabel={`Tocar ${releases[0].title}`} disabled={Boolean(startingRelease)} onPress={() => void startRelease(releases[0])} style={styles.spotlightPlay}>
            <GlassSurface isInteractive style={styles.playButton}>
              <View style={styles.playForeground}>
                {startingRelease ? <ActivityIndicator color="#FFFFFF" /> : <AppIcon name="play" size={22} color="#FFFFFF" />}
              </View>
            </GlassSurface>
          </LoggedPressable>
        </View>
      </View>
    </View> : null}
    {mostPlayed.length ? <Section title="Não sai do seu fone" icon={<AppIcon name="headset" size={22} color="#1ED760" />} onShowAll={() => openDetail('playlist', 'home_mix_most_played', 'home')}>
      {mostPlayed.slice(0, 5).map((track, index) => renderTrack(track, index, mostPlayed, 'home:most-played'))}
    </Section> : null}
    {seed && similar.length ? <Section title={`Parecido com ${seed.name}`} icon={<AppIcon name="radio" size={22} color="#1ED760" />}>
      <Rail>
        <LoggedPressable style={[styles.tile, { width: tileSize }]} accessibilityLabel={`Abrir rádio de ${seed.name}`} onPress={() => openDetail('playlist', homeRadioPlaylistId(seed.name), 'home')}>
          <PlaylistMosaic imageURLs={[...new Set(similar.map((track) => track.imageURL).filter(Boolean))]} size={tileSize} />
          <Text style={styles.tileTitle} numberOfLines={1}>Rádio de {seed.name}</Text><Text style={styles.subtitle}>Playlist</Text>
        </LoggedPressable>
        {trackTiles(similar.slice(0, 8), 'home:similar')}
      </Rail>
    </Section> : null}
    {discoveryArtists.length ? <Section title="Artistas para descobrir" icon={<AppIcon name="sparkles" size={22} color="#1ED760" />}>
      <Rail>{discoveryArtists.map((artist) => <LoggedPressable key={artist.artistId} style={[styles.tile, { width: tileSize }]}
        accessibilityLabel={`Abrir artista ${artist.title}`} onPressIn={() => prefetchDetail('artist', artist.artistId)}
        onPress={() => openDetail('artist', artist.artistId, 'home')}>
        <Artwork uri={artistImages[artist.artistId] || artist.imageURL} size={tileSize} artist />
        <Text numberOfLines={1} style={styles.tileTitle}>{artist.title}</Text><Text style={styles.subtitle}>Artista</Text>
      </LoggedPressable>)}</Rail>
    </Section> : null}
    {home.discoveries.length ? <Section title={home.discoveryTitle} icon={<AppIcon name="disc" size={22} color="#1ED760" />} onShowAll={() => openDetail('playlist', 'home_mix_discover', 'home')}>
      <Rail>{trackTiles(home.discoveries, 'home:discover')}</Rail>
    </Section> : null}
  </>;
}

const styles = StyleSheet.create({
  section: { marginTop: 28 },
  sectionHeader: { paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  sectionTitle: { flex: 1, color: '#FFFFFF', fontFamily: 'SF-Bold', fontSize: 20, lineHeight: 25, letterSpacing: 0 },
  showAll: { width: 36, height: 32, alignItems: 'flex-end', justifyContent: 'center' },
  rail: { gap: 12, paddingHorizontal: 18, paddingBottom: 2, alignItems: 'flex-start' },
  tile: { gap: 5 },
  tileTitle: { color: '#FFFFFF', fontFamily: 'SF-Semibold', fontSize: 15, lineHeight: 20, marginTop: 4 },
  subtitle: { color: '#A3A3A6', fontFamily: 'SF-Regular', fontSize: 14, lineHeight: 19 },
  releaseMeta: { color: '#858589', fontFamily: 'SF-Regular', fontSize: 12, lineHeight: 16 },
  active: { color: '#1ED760' },
  placeholder: { backgroundColor: '#252528', alignItems: 'center', justifyContent: 'center' },
  spotlightSection: { marginHorizontal: 18, marginTop: 32 },
  artistHeading: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  artistTitle: { color: '#FFFFFF', fontFamily: 'SF-Bold', fontSize: 22, lineHeight: 28 },
  flexCopy: { flex: 1, minWidth: 0 },
  spotlight: { flexDirection: 'row', overflow: 'hidden', borderRadius: 6, backgroundColor: '#28282B' },
  spotlightCopy: { flex: 1, minWidth: 0, padding: 14, gap: 5 },
  spotlightTitle: { color: '#FFFFFF', fontFamily: 'SF-Semibold', fontSize: 17, lineHeight: 21 },
  spotlightPlay: { alignSelf: 'flex-end', marginTop: 'auto', paddingTop: 8 },
  playButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  playForeground: { position: 'relative', zIndex: 1, alignItems: 'center', justifyContent: 'center' },
  skeletonHeading: { width: 160, height: 24, backgroundColor: '#252528', borderRadius: 4, margin: 18 },
  skeletonTile: { backgroundColor: '#252528', borderRadius: 6 },
});

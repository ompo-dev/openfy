import * as React from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import {
  getArtistCatalogImage, getCachedYouTubeMusicArtistProfile, subscribeYouTubeMusicArtistProfile,
  getCachedArtistSearchSeed, getYouTubeMusicAlbum, getYouTubeMusicArtistProfile,
  type YouTubeMusicArtistProfile,
} from '@api';
import { CollectionDetail } from '@components';
import { usePlayer } from '@context';
import { type ArtistModel } from '@models';
import { Shapes, Sizes } from '@config';
import { getCachedArtistImage, getLibraryTracks, rememberCachedArtistImage } from '@services';
import { Slider } from '../components/Slider';
import { getYouTubeMusicArtistRouteName, parseYouTubeMusicArtistRoute, toYouTubeMusicArtistRouteId } from '../services/youtubeMusicClient';
import { getDetailPreview } from '../services/navigation/detailPreview';
import { artistIdentityKey, resolveTrackArtist } from '../services/search/artistIdentity';
import { log } from '../utils/appLogger';

export type ArtistScreenPropsType = { artistId: string };

const nativeRoute = (id: string, name = '') => {
  const channel = parseYouTubeMusicArtistRoute(id).browseId;
  return channel.startsWith('UC') ? toYouTubeMusicArtistRouteId(channel, name) : '';
};

export const ArtistScreen = ({ artistId }: ArtistScreenPropsType) => {
  const { currentTrack } = usePlayer((state) => ({ currentTrack: state.currentTrack }));
  const playbackRef = React.useRef(currentTrack);
  playbackRef.current = currentTrack;
  const preview = getDetailPreview('artist', artistId);
  const cached = getCachedYouTubeMusicArtistProfile(artistId);
  const [profile, setProfile] = React.useState<YouTubeMusicArtistProfile | null>(cached || null);
  const [artist, setArtist] = React.useState<ArtistModel | null>(() => cached?.artist ||
    (preview ? { id: artistId, type: 'artist', name: preview.title, imageURL: preview.imageURL || '' } : null));
  const [isProfileReady, setIsProfileReady] = React.useState(Boolean(cached));
  const [artistError, setArtistError] = React.useState('');
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [refreshSequence, setRefreshSequence] = React.useState(0);
  const refresh = React.useCallback(() => {
    setArtistError('');
    setIsRefreshing(true);
    setRefreshSequence((sequence) => sequence + 1);
  }, []);

  React.useEffect(() => {
    let active = true;
    let unsubscribe = () => {};
    const seed = getCachedArtistSearchSeed(artistId);
    const initial = getCachedYouTubeMusicArtistProfile(artistId);
    const detail = getDetailPreview('artist', artistId);
    const name = initial?.artist.name || seed?.artist.name || detail?.title ||
      getYouTubeMusicArtistRouteName(artistId);
    setProfile(initial || null);
    setArtist(initial?.artist || seed?.artist || (name
      ? { id: artistId, type: 'artist', name, imageURL: detail?.imageURL || '' } : null));
    setIsProfileReady(Boolean(initial));
    setArtistError('');

    const apply = (next: YouTubeMusicArtistProfile) => {
      if (!active) return;
      setProfile(next);
      setArtist(next.artist);
      if (next.artist.imageURL) void rememberCachedArtistImage(next.artist.name,
        next.artist.imageURL, [next.artist.id]).catch(() => {});
    };
    const load = async () => {
      let route = nativeRoute(artistId, name);
      // Old library links may carry a provider id, but only the selected video's
      // explicit channel credits may migrate them to a YouTube profile.
      if (!route) {
        const library = await getLibraryTracks();
        const recording = [playbackRef.current, ...library, ...(detail?.tracks || [])].find((track) =>
          track?.artists?.some((credit) => credit.id === artistId));
        const credit = recording?.artists?.find((ref) => ref.id === artistId);
        if (recording && credit) route = (await resolveTrackArtist(credit, recording)).id;
      }
      if (!active) return;
      if (!route) throw new Error('Este artista ainda não tem um canal do YouTube vinculado. Abra o perfil pela busca.');
      unsubscribe = subscribeYouTubeMusicArtistProfile(route, apply);
      apply(await getYouTubeMusicArtistProfile(route));
      if (active) setIsProfileReady(true);
    };
    void load().catch((error) => {
      if (!active) return;
      if (!initial && seed) {
        const own = seed.tracks.filter((track) => track.artists?.some((credit) =>
          artistIdentityKey(credit.id) === artistIdentityKey(artistId)));
        apply({ artist: seed.artist, tracks: own.filter((track) =>
          artistIdentityKey(track.artists?.[0]?.id) === artistIdentityKey(artistId)),
          participationTracks: own.filter((track) =>
            artistIdentityKey(track.artists?.[0]?.id) !== artistIdentityKey(artistId)), albums: [], singlesAndEps: [] });
      }
      setArtistError(error instanceof Error ? error.message : 'Não foi possível carregar o canal deste artista.');
      setIsProfileReady(true);
      log.artist('channel profile unavailable', { artistId, error: String(error) });
    }).finally(() => { if (active) setIsRefreshing(false); });
    return () => { active = false; unsubscribe(); };
  }, [artistId, refreshSequence]);

  // Release portraits use their own linked channel ids, never a name lookup.
  React.useEffect(() => {
    let active = true;
    const releases = [...(profile?.albums || []), ...(profile?.singlesAndEps || [])].slice(0, 6);
    void (async () => {
      const seen = new Set<string>();
      for (const release of releases) {
        if (!active) return;
        const album = await getYouTubeMusicAlbum(release.id).catch(() => null);
        for (const credit of album?.artists || []) {
          const key = artistIdentityKey(credit.id);
          if (!active) return;
          if (!key.startsWith('youtube:') || seen.has(key)) continue;
          seen.add(key);
          await getCachedArtistImage(credit.name,
            () => getArtistCatalogImage(credit.id, credit.name), [credit.id]).catch(() => {});
        }
      }
    })();
    return () => { active = false; };
  }, [profile?.albums, profile?.singlesAndEps]);

  if (!artist) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14,
        paddingHorizontal: 28, backgroundColor: '#101010' }}>
        {artistError ? (
          <>
            <Text style={{ color: '#D0D0D0', fontSize: 15, textAlign: 'center' }}>{artistError}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Tentar carregar perfil novamente"
              onPress={refresh} style={{ paddingHorizontal: 18, paddingVertical: 10,
                borderRadius: 20, backgroundColor: '#262626' }}>
              <Text style={{ color: '#FFFFFF', fontSize: 14 }}>Tentar novamente</Text>
            </Pressable>
          </>
        ) : <ActivityIndicator color="#1DB954" />}
      </View>
    );
  }

  return (
    <CollectionDetail kind="artist" collectionId={artist.id} title={artist.name}
      imageURL={artist.imageURL} description="" metadata=""
      tracks={profile?.tracks || []} loadingTracks={!isProfileReady} loadingError={artistError}
      disableTrackArtistLinks sectionTitle="Músicas em destaque"
      extraTrackSections={[{ id: 'participations', title: 'Participações', tracks: profile?.participationTracks || [] }]}
      onRefresh={refresh} refreshing={isRefreshing}
      footer={profile?.albums?.length || profile?.singlesAndEps?.length ? (
        <>
          {profile.albums.length ? <Slider title="Álbuns" slides={profile.albums} size={Sizes.SMALL}
            shape={Shapes.SQUARE_BORDER} withShowAll={false} /> : null}
          {profile.singlesAndEps.length ? <Slider title="Singles e EPs" slides={profile.singlesAndEps} size={Sizes.SMALL}
            shape={Shapes.SQUARE_BORDER} withShowAll={false} /> : null}
        </>
      ) : null}
    />
  );
};

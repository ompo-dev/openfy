import * as React from 'react';
import { View } from 'react-native';

import { getArtist, getArtistAlbums, getArtistTopTracks } from '@api';
import { CollectionDetail } from '@components';
import { ArtistModel, LibraryItemModel, TrackModel } from '@models';
import { Shapes, Sizes } from '@config';
import {
  getCachedArtistImage,
  getDownloadedTracks,
  groupLocalAlbums,
  groupLocalArtists,
  isTrackParticipantArtist,
  isTrackPrimaryArtist,
  type DownloadedTrack,
} from '@services';
import { getSpotifyArtistImage } from '../services/metadata/spotifyMetadata';
import { Slider } from '../components/Slider';

export type ArtistScreenPropsType = {
  artistId: string;
};

const toTrackModel = (track: DownloadedTrack): TrackModel => ({
  ...track,
  id: track.spotifyId,
  title: track.title,
  subtitle: track.artistName,
  imageURL: track.localImagePath || track.imageURL,
  albumName: track.albumName,
  durationMs: track.duration_ms,
});

const isRemotePrimaryArtist = (
  track: TrackModel,
  artistId: string,
  artistName?: string
) => {
  const primaryArtist = track.artists?.[0];
  if (!primaryArtist) return true;
  if (primaryArtist.id && primaryArtist.id === artistId) return true;
  return Boolean(
    artistName &&
      primaryArtist.name.toLocaleLowerCase() === artistName.toLocaleLowerCase()
  );
};

const artistMatchesAlbumPrimary = (
  track: DownloadedTrack,
  artistIdOrName: string
) => {
  const albumPrimary = track.albumArtists?.[0];
  if (!albumPrimary) return isTrackPrimaryArtist(track, artistIdOrName);
  const target = artistIdOrName.toLocaleLowerCase();
  return (
    `spotify:${albumPrimary.id}`.toLocaleLowerCase() === target ||
    albumPrimary.name.toLocaleLowerCase() === target
  );
};

export const ArtistScreen = ({ artistId }: ArtistScreenPropsType) => {
  const [artist, setArtist] = React.useState<ArtistModel | null>(null);
  const [topTracks, setTopTracks] = React.useState<TrackModel[]>([]);
  const [participationTracks, setParticipationTracks] = React.useState<TrackModel[]>([]);
  const [albums, setAlbums] = React.useState<LibraryItemModel[]>([]);
  const localArtistName = artistId.startsWith('local_artist_')
    ? decodeURIComponent(artistId.slice('local_artist_'.length))
    : '';

  React.useEffect(() => {
    let active = true;
    setArtist(null);
    setTopTracks([]);
    setParticipationTracks([]);
    setAlbums([]);

    if (localArtistName) {
      void getDownloadedTracks().then(async (downloaded) => {
        const collection = groupLocalArtists(downloaded).find((candidate) =>
          candidate.id === localArtistName ||
          candidate.title.toLocaleLowerCase() === localArtistName.toLocaleLowerCase()
        );
        const profileImage = collection?.spotifyArtistId
          ? await getCachedArtistImage(collection.id, () =>
              getSpotifyArtistImage(collection.spotifyArtistId!)) : '';
        if (!active) return;
        const collectionTracks = collection?.tracks || [];
        const featuredTracks = collectionTracks.filter((track) =>
          isTrackPrimaryArtist(track, collection?.id || localArtistName)
        );
        const participationOnlyTracks = collectionTracks.filter((track) =>
          isTrackParticipantArtist(track, collection?.id || localArtistName)
        );
        const artistAlbums = groupLocalAlbums(
          featuredTracks.filter((track) =>
            artistMatchesAlbumPrimary(track, collection?.id || localArtistName)
          )
        ).map((album) => ({
          id: `local_album_${encodeURIComponent(album.id)}`,
          type: 'album' as const,
          title: album.title,
          subtitle: album.subtitle,
          imageURL: album.imageURL,
        }));
        setArtist({
          id: artistId,
          type: 'artist',
          name: collection?.title || localArtistName,
          imageURL: profileImage,
        });
        setTopTracks(featuredTracks.map(toTrackModel));
        setParticipationTracks(participationOnlyTracks.map(toTrackModel));
        setAlbums(artistAlbums);
      });
      return () => {
        active = false;
      };
    }

    void getArtist(artistId)
      .then((artistData) => {
        if (!active) return;
        setArtist(artistData);
      })
      .catch((error) => {
        if (active) {
          setArtist(null);
        }
        console.error('Failed to get artist data:', error);
      });

    void getArtistTopTracks(artistId)
      .then((trackData) => {
        if (!active) return;
        setTopTracks(
          trackData.filter((track) =>
            isRemotePrimaryArtist(track, artistId)
          )
        );
        setParticipationTracks(
          trackData.filter(
            (track) => !isRemotePrimaryArtist(track, artistId)
          )
        );
      })
      .catch((error) => console.error('Failed to get artist top tracks:', error));

    void getArtistAlbums(artistId, 'album,single', 20)
      .then((albumData) => {
        if (active) setAlbums(albumData);
      })
      .catch((error) => console.error('Failed to get artist albums:', error));

    return () => {
      active = false;
    };
  }, [artistId, localArtistName]);

  if (!artist) return <View style={{ flex: 1, backgroundColor: '#101010' }} />;

  const metadata = [
    'Artista',
    artist.followers ? `${artist.followers.toLocaleString('pt-BR')} seguidores` : '',
  ]
    .filter(Boolean)
    .join(' • ');
  const description = artist.genres?.length
    ? `${artist.name} · ${artist.genres.slice(0, 3).join(' · ')}.`
    : `Músicas, álbuns e singles de ${artist.name}.`;

  return (
    <CollectionDetail
      kind="artist"
      collectionId={artist.id}
      title={artist.name}
      imageURL={artist.imageURL}
      description={description}
      metadata={metadata}
      tracks={topTracks}
      disableTrackArtistLinks
      sectionTitle="Músicas em destaque"
      extraTrackSections={[
        {
          id: 'participations',
          title: 'Participações',
          tracks: participationTracks,
        },
      ]}
      footer={
        albums.length ? (
          <Slider
            title="Álbuns e singles"
            slides={albums}
            size={Sizes.SMALL}
            shape={Shapes.SQUARE_BORDER}
            withShowAll={false}
          />
        ) : null
      }
    />
  );
};

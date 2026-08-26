import * as React from 'react';
import { View } from 'react-native';
import { Href, useRouter, useSegments } from 'expo-router';

import { getArtist, getArtistAlbums, getArtistTopTracks, getYouTubeArtistImage } from '@api';
import { CollectionDetail } from '@components';
import { ArtistModel, LibraryItemModel, TrackModel } from '@models';
import { Shapes, Sizes } from '@config';
import { getCachedArtistImage, getDownloadedTracks } from '@services';
import { Slider } from '../components/Slider';

export type ArtistScreenPropsType = {
  artistId: string;
};

export const ArtistScreen = ({ artistId }: ArtistScreenPropsType) => {
  const router = useRouter();
  const segments = useSegments();
  const [artist, setArtist] = React.useState<ArtistModel | null>(null);
  const [topTracks, setTopTracks] = React.useState<TrackModel[]>([]);
  const [albums, setAlbums] = React.useState<LibraryItemModel[]>([]);
  const localArtistName = artistId.startsWith('local_artist_')
    ? decodeURIComponent(artistId.slice('local_artist_'.length))
    : '';

  React.useEffect(() => {
    let active = true;
    setArtist(null);
    setTopTracks([]);
    setAlbums([]);

    if (localArtistName) {
      void Promise.all([getDownloadedTracks(), getCachedArtistImage(
        localArtistName,
        () => getYouTubeArtistImage(localArtistName)
      )]).then(([
        downloaded,
        profileImage,
      ]) => {
        if (!active) return;
        const normalize = (value: string) => value.trim().toLocaleLowerCase();
        const tracks = downloaded
          .filter((track) =>
            track.artistName
              .split(/\s*(?:,|&| feat\.?)\s*/i)
              .some((name) => normalize(name) === normalize(localArtistName))
          )
          .map((track) => ({
            id: track.spotifyId,
            title: track.title,
            subtitle: track.artistName,
            imageURL: track.localImagePath || track.imageURL,
            albumName: track.albumName,
            durationMs: track.duration_ms,
          }));
        setArtist({
          id: artistId,
          type: 'artist',
          name: localArtistName,
          imageURL: profileImage,
        });
        setTopTracks(tracks);
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
        if (active) setTopTracks(trackData);
      })
      .catch((error) => console.error('Failed to get artist top tracks:', error));

    void getArtistAlbums(artistId, 'album,single,compilation', 20)
      .then((albumData) => {
        if (active) setAlbums(albumData);
      })
      .catch((error) => console.error('Failed to get artist albums:', error));

    return () => {
      active = false;
    };
  }, [artistId, localArtistName]);

  const handleArtistPress = React.useCallback(
    (targetArtistId: string) => {
      const section = segments.join('/').includes('library') ? 'library' : 'home';
      router.push(`/(tabs)/${section}/artist/${targetArtistId}` as Href);
    },
    [router, segments]
  );

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
      onArtistPress={handleArtistPress}
      sectionTitle="Músicas em destaque"
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

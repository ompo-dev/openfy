import * as React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppIcon as Ionicons } from "../native/AppIcon";

import { getYouTubeMusicArtistImage } from '@api';
import { useDetailNavigation } from '@hooks';
import { getCachedArtistImage, type PersonalizedHomeSnapshot } from '@services';
import { LoggedPressable } from '../native';
import { log } from '../../utils/appLogger';
import { SkeletonImage } from '../common/SkeletonImage';

export const CatalogHome = ({ home }: { home: PersonalizedHomeSnapshot }) => {
  const { openDetail } = useDetailNavigation();
  const [artistImages, setArtistImages] = React.useState<Record<string, string>>({});
  const [artistImageLoadState, setArtistImageLoadState] = React.useState({ key: '', limit: 8 });
  const requestedArtistImages = React.useRef(new Set<string>());
  const isMountedRef = React.useRef(true);
  const artistListKey = home.artists.map((artist) => artist.artistId).join('|');
  const artistImageLoadLimit = artistImageLoadState.key === artistListKey
    ? artistImageLoadState.limit
    : 8;

  React.useEffect(() => () => {
    isMountedRef.current = false;
  }, []);

  React.useEffect(() => {
    const unresolvedArtists = home.artists.slice(0, artistImageLoadLimit).filter((artist) =>
      artist.artistId.startsWith('ytartist_') &&
      !artistImages[artist.artistId] &&
      !requestedArtistImages.current.has(artist.artistId)
    );
    unresolvedArtists.forEach((artist) => {
      requestedArtistImages.current.add(artist.artistId);
    });
    unresolvedArtists.forEach((artist) => {
      if (!artist.artistId.startsWith('ytartist_')) return;
      const finishImageLoad = log.time('home', 'discovery artist image load', {
        artistId: artist.artistId,
      });
      void getCachedArtistImage(
        artist.title,
        () => getYouTubeMusicArtistImage(artist.artistId),
        [artist.artistId]
      ).then((imageURL) => {
        if (isMountedRef.current && imageURL) {
          setArtistImages((current) => ({ ...current, [artist.artistId]: imageURL }));
        }
        finishImageLoad({ ok: Boolean(imageURL), hasImage: Boolean(imageURL) });
      }).catch((error) => {
        requestedArtistImages.current.delete(artist.artistId);
        finishImageLoad({ ok: false, error: String(error) });
      });
    });
  }, [artistImageLoadLimit, artistImages, home.artists]);

  if (!home.artists.length) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.title}>Artistas para descobrir</Text>
      <ScrollView
        horizontal
        onScroll={(event) => {
          const { contentOffset, layoutMeasurement } = event.nativeEvent;
          const visibleLimit = Math.min(
            home.artists.length,
            Math.ceil((contentOffset.x + layoutMeasurement.width) / 92) + 4
          );
          setArtistImageLoadState((current) => ({
            key: artistListKey,
            limit: current.key === artistListKey
              ? Math.max(current.limit, visibleLimit)
              : Math.max(8, visibleLimit),
          }));
        }}
        scrollEventThrottle={200}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.items}
      >
        {home.artists.map((artist) => (
          <LoggedPressable
            accessibilityLabel={`Abrir artista ${artist.title}`}
            key={artist.artistId}
            onPress={() => openDetail('artist', artist.artistId, 'home')}
            style={styles.artist}
          >
            {artistImages[artist.artistId] ? (
              <SkeletonImage cachePolicy="memory-disk" priority="high" source={{ uri: artistImages[artist.artistId] }} contentFit="cover" style={styles.image} />
            ) : (
              <View style={[styles.image, styles.fallback]}>
                <Ionicons name="person" size={26} color="#929292" />
              </View>
            )}
            <Text numberOfLines={1} style={styles.artistName}>{artist.title}</Text>
          </LoggedPressable>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  section: { marginTop: 22 },
  title: {
    color: '#FFFFFF',
    fontFamily: 'SF-Bold',
    fontSize: 18,
    paddingHorizontal: 18,
    marginBottom: 12,
  },
  items: { paddingHorizontal: 18, gap: 16 },
  artist: { width: 76, alignItems: 'center', gap: 7 },
  image: { width: 64, height: 64, borderRadius: 32 },
  fallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#242428' },
  artistName: { width: '100%', color: '#E5E5E7', fontFamily: 'SF-Semibold', fontSize: 11, textAlign: 'center' },
});

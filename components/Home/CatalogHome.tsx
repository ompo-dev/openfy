import * as React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';

import { getYouTubeMusicArtistImage } from '@api';
import { useDetailNavigation } from '@hooks';
import { getCachedArtistImage, type PersonalizedHomeSnapshot } from '@services';
import { LoggedPressable } from '../native';

export const CatalogHome = ({ home }: { home: PersonalizedHomeSnapshot }) => {
  const { openDetail } = useDetailNavigation();
  const [artistImages, setArtistImages] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    let active = true;
    void Promise.all(home.artists.map(async (artist) => {
      if (!artist.artistId.startsWith('ytartist_')) return [artist.artistId, ''] as const;
      const imageURL = await getCachedArtistImage(artist.artistId, () =>
        getYouTubeMusicArtistImage(artist.artistId)
      ).catch(() => '');
      return [artist.artistId, imageURL] as const;
    })).then((entries) => {
      if (active) setArtistImages((current) => ({ ...current, ...Object.fromEntries(entries) }));
    });
    return () => {
      active = false;
    };
  }, [home.artists]);

  if (!home.artists.length) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.title}>Artistas para descobrir</Text>
      <ScrollView
        horizontal
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
              <Image source={{ uri: artistImages[artist.artistId] }} contentFit="cover" style={styles.image} />
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

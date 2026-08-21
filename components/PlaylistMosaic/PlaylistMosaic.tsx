import * as React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type PlaylistMosaicProps = {
  imageURLs: string[];
  size: number;
};

export const PlaylistMosaic = ({ imageURLs, size }: PlaylistMosaicProps) => {
  const covers = imageURLs.slice(0, 4);

  return (
    <View
      accessibilityLabel="Capa da playlist formada por capas de músicas"
      style={[styles.container, { width: size, height: size }]}
    >
      {[0, 1, 2, 3].map((index) => {
        const imageURL = covers[index];
        return imageURL ? (
          <Image
            key={`${imageURL}-${index}`}
            source={{ uri: imageURL }}
            style={styles.cover}
          />
        ) : (
          <View key={index} style={[styles.cover, styles.coverFallback]}>
            {index === 0 ? (
              <Ionicons name="musical-note" size={Math.max(14, size * 0.22)} color="#A3A3A3" />
            ) : null}
          </View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    overflow: 'hidden',
    borderRadius: 6,
    backgroundColor: '#242424',
  },
  cover: {
    width: '50%',
    height: '50%',
  },
  coverFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#242424',
  },
});

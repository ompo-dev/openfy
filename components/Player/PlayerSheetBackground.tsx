import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { usePlayer } from '@context';

/** One material for the player and all fitted sheets, without a window-wide dimmer. */
export function PlayerSheetBackground({ artworkURL, children }: React.PropsWithChildren<{ artworkURL?: string }>) {
  const { currentTrack } = usePlayer((state) => ({ currentTrack: state.currentTrack }));
  const currentArtwork = currentTrack?.localImagePath || currentTrack?.imageURL;
  const uri = artworkURL || currentArtwork;
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.base]}>
    {children || (uri ? <Image source={{ uri }} cachePolicy="memory-disk" contentFit="cover"
      blurRadius={28} style={[StyleSheet.absoluteFill, styles.artwork]} /> : null)}
    <View style={[StyleSheet.absoluteFill, styles.tint]} />
  </View>;
}
const styles = StyleSheet.create({
  base: { backgroundColor: '#101116' },
  artwork: { opacity: 0.64, transform: [{ scale: 1.1 }] },
  tint: { backgroundColor: 'rgba(8, 10, 16, 0.60)' },
});

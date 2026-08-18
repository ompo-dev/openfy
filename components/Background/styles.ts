import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  background: {
    ...(StyleSheet.absoluteFill as any),
    zIndex: -3,
  },
  backgroundBlurredImage: {
    zIndex: -4,
    width: '100%',
    height: '100%',
  },
  backgroundDarkOverlay: {
    ...(StyleSheet.absoluteFill as any),
    zIndex: -3,
  },
});

/** Shared push/pop transition for album, playlist and artist details. */
export const detailStackOptions = {
  headerShown: false,
  headerShadowVisible: false,
  contentStyle: { backgroundColor: '#121212' },
  animation: 'slide_from_right',
  animationDuration: 280,
  gestureEnabled: true,
} as const;

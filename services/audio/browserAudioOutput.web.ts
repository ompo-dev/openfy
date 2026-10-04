import { getAudioContext } from 'expo-audio/build/AudioUtils.web';

// Use Expo's context, so unlocking from a user action covers every replacement player.
export const unlockBrowserAudioOutput = () => {
  const context = getAudioContext();
  if (context.state === 'suspended') void context.resume().catch(() => {});
};

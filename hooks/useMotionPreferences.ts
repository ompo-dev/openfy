import { useReducedMotion } from 'react-native-reanimated';
import { useAppSettingsStore } from '../stores/useAppSettingsStore';

export const useMotionPreferences = () => {
  const systemReduced = useReducedMotion();
  const appReduced = useAppSettingsStore((state) => state.settings.reduceAnimations);
  return systemReduced || appReduced;
};

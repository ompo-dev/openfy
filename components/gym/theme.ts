import { Platform } from 'react-native';
export { Colors, Metrics, Radii, Spacing } from '../../vendor/gym-notes/src/constants/theme';

// Keep Openfy's already-loaded typefaces; the copied controls retain Gym's metrics.
export const Fonts = {
  regular: Platform.OS === 'ios' ? 'System' : 'SF-Regular',
  medium: Platform.OS === 'ios' ? 'System' : 'SF-Semibold',
  semibold: Platform.OS === 'ios' ? 'System' : 'SF-Semibold',
  bold: Platform.OS === 'ios' ? 'System' : 'SF-Bold',
  extraBold: Platform.OS === 'ios' ? 'System' : 'SF-Bold',
};

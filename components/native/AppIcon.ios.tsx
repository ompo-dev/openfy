import { SymbolView, type SymbolWeight } from 'expo-symbols';
import type { StyleProp, ViewStyle } from 'react-native';

import type { AppIconName } from './AppIcon';

// Each Ionicons name mapped to its closest SF Symbol.
// iOS renders these native symbols; Android/web keep Ionicons in AppIcon.tsx.
const SF: Record<AppIconName, string> = {
  'home': 'house',
  'home-outline': 'house',
  'library': 'books.vertical.fill',
  'library-outline': 'books.vertical',
  'search': 'magnifyingglass',
  'search-outline': 'magnifyingglass',
  'sort': 'arrow.up.arrow.down',
  'add': 'plus',
  'heart': 'heart.fill',
  'heart-outline': 'heart',
  'play': 'play.fill',
  'pause': 'pause.fill',
  'play-skip-forward': 'forward.fill',
  'play-skip-back': 'backward.fill',
  'play-forward': 'forward.fill',
  'play-back': 'backward.fill',
  'shuffle': 'shuffle',
  'repeat': 'repeat',
  'repeat-one': 'repeat.1',
  'chevron-down': 'chevron.down',
  'chevron-up': 'chevron.up',
  'chevron-forward': 'chevron.right',
  'chevron-back': 'chevron.left',
  'ellipsis-horizontal': 'ellipsis',
  'ellipsis-vertical': 'ellipsis',
  'share': 'square.and.arrow.up',
  'download': 'arrow.down.circle.fill',
  'checkmark-circle': 'checkmark.circle.fill',
  'close': 'xmark',
  'close-circle': 'xmark.circle.fill',
  'trash': 'trash',
  'musical-note': 'music.note',
  'musical-notes': 'music.note.list',
  'person': 'person.fill',
  'person-outline': 'person',
  'settings': 'gearshape.fill',
  'settings-outline': 'gearshape',
  'cast': 'airplayaudio',
  'volume-high': 'speaker.wave.3.fill',
  'volume-medium': 'speaker.wave.2.fill',
  'volume-low': 'speaker.wave.1.fill',
  'volume-mute': 'speaker.slash.fill',
  'list': 'list.bullet',
  'grid': 'square.grid.2x2.fill',
  'time': 'clock',
  'star': 'star.fill',
  'star-outline': 'star',
  'notifications': 'bell.fill',
  'notifications-outline': 'bell',
  'wifi': 'wifi',
  'bluetooth': 'dot.radiowaves.left.and.right',
};

interface AppIconProps {
  name: AppIconName;
  color?: string;
  size?: number;
  fill?: string;
  weight?: SymbolWeight;
  style?: StyleProp<ViewStyle>;
}

export function AppIcon({
  name,
  color,
  size = 24,
  weight = 'medium',
  style,
}: AppIconProps) {
  const symbol = SF[name] ?? 'questionmark';
  return (
    <SymbolView
      name={symbol as any}
      size={size}
      tintColor={color}
      type="monochrome"
      weight={weight}
      style={[{ width: size, height: size }, style]}
    />
  );
}

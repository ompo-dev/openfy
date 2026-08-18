import Ionicons from '@expo/vector-icons/Ionicons';
import type { StyleProp, ViewStyle } from 'react-native';

// The full set of icon names used across the app.
// iOS resolves AppIcon.ios.tsx instead (SF Symbols).
export type AppIconName =
  | 'home'
  | 'home-outline'
  | 'library'
  | 'library-outline'
  | 'search'
  | 'search-outline'
  | 'add'
  | 'heart'
  | 'heart-outline'
  | 'play'
  | 'pause'
  | 'play-skip-forward'
  | 'play-skip-back'
  | 'play-forward'
  | 'play-back'
  | 'shuffle'
  | 'repeat'
  | 'repeat-one'
  | 'chevron-down'
  | 'chevron-up'
  | 'chevron-forward'
  | 'chevron-back'
  | 'ellipsis-horizontal'
  | 'ellipsis-vertical'
  | 'share'
  | 'download'
  | 'checkmark-circle'
  | 'close'
  | 'close-circle'
  | 'musical-note'
  | 'musical-notes'
  | 'person'
  | 'person-outline'
  | 'settings'
  | 'settings-outline'
  | 'cast'
  | 'volume-high'
  | 'volume-medium'
  | 'volume-low'
  | 'volume-mute'
  | 'list'
  | 'grid'
  | 'time'
  | 'star'
  | 'star-outline'
  | 'notifications'
  | 'notifications-outline'
  | 'wifi'
  | 'bluetooth';

interface AppIconProps {
  name: AppIconName;
  color?: string;
  size?: number;
  fill?: string;
  style?: StyleProp<ViewStyle>;
}

export function AppIcon({ name, color = '#FFFFFF', size = 24, style }: AppIconProps) {
  return <Ionicons name={name as any} size={size} color={color} style={style as any} />;
}

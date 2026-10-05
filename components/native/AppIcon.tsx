import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

// The full set of icon names used across the app.
// iOS resolves AppIcon.ios.tsx instead (SF Symbols).
export type AppIconName =
  | 'home'
  | 'home-outline'
  | 'library'
  | 'library-outline'
  | 'search'
  | 'search-outline'
  | 'sort'
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
  | 'download-outline'
  | 'checkmark-circle'
  | 'ellipse-outline'
  | 'folder-outline'
  | 'close'
  | 'close-circle'
  | 'trash'
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
  | 'document-text'
  | 'options'
  | 'eye'
  | 'copy'
  | 'wifi'
  | 'bluetooth'
  | 'headset'
  | 'code-slash'
  | 'pulse'
  | 'logo-github'
  | 'radio-button-on'
  | 'radio-button-off'
  | 'add-circle-outline' | 'alert-circle' | 'arrow-down-bold' | 'arrow-forward' | 'arrow-undo'
  | 'chatbubble-ellipses-outline' | 'check' | 'checkmark' | 'clipboard-outline' | 'clipboard-text-outline'
  | 'cloud-offline-outline' | 'color-wand-outline' | 'copy-outline' | 'create-outline' | 'disc'
  | 'document-text-outline' | 'dots-three-horizontal' | 'eye-outline' | 'keyboard-arrow-left'
  | 'link' | 'logo-youtube' | 'microphone-outline' | 'music' | 'musical-notes-outline'
  | 'open-outline' | 'options-outline' | 'palette' | 'pencil-outline' | 'playlist-plus' | 'podcast'
  | 'refresh' | 'remove-circle-outline' | 'share-outline' | 'sparkles' | 'stats-chart-sharp'
  | 'swap-vertical' | 'time-outline' | 'trash-outline' | 'user' | 'pin' | 'radio'
  | 'code-slash-outline' | 'arrow-down' | 'plus';

interface AppIconProps {
  name: AppIconName;
  color?: string;
  size?: number;
  fill?: string;
  style?: StyleProp<ViewStyle | TextStyle>;
}

export function AppIcon({ name, color, size, style }: AppIconProps) {
  const { fontSize, color: styleColor, ...viewStyle } = (StyleSheet.flatten(style) || {}) as TextStyle;
  const iconName =
    name === 'cast' ? 'radio-outline' :
    name === 'sort' ? 'swap-vertical' :
    name === 'document-text' ? 'document-text-outline' :
    name === 'options' ? 'options-outline' :
    name === 'eye' ? 'eye-outline' :
    name === 'copy' ? 'copy-outline' : name;
  const aliases: Partial<Record<AppIconName, string>> = {
    'arrow-down-bold': 'arrow-down', check: 'checkmark', 'clipboard-text-outline': 'clipboard-outline',
    'dots-three-horizontal': 'ellipsis-horizontal', 'keyboard-arrow-left': 'chevron-back',
    music: 'musical-note', palette: 'color-palette-outline', 'playlist-plus': 'list',
    podcast: 'radio', user: 'person', radio: 'radio-outline', plus: 'add',
  };
  return <Ionicons name={(aliases[name] || iconName) as any} size={size || fontSize || 24}
    color={color || styleColor || '#FFFFFF'} style={viewStyle as any} />;
}

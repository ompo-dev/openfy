import { SymbolView, type SymbolWeight, type SFSymbol } from 'expo-symbols';
import { StyleSheet, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import type { AppIconName } from './AppIcon';

// Each Ionicons name mapped to its closest SF Symbol.
// iOS renders these native symbols; Android/web keep Ionicons in AppIcon.tsx.
export const APP_SF_SYMBOLS: Record<AppIconName, SFSymbol> = {
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
  'download-outline': 'arrow.down.circle',
  'checkmark-circle': 'checkmark.circle.fill',
  'ellipse-outline': 'circle',
  'folder-outline': 'folder',
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
  'document-text': 'doc.text',
  'options': 'slider.horizontal.3',
  'eye': 'eye',
  'copy': 'doc.on.doc',
  'wifi': 'wifi',
  'bluetooth': 'dot.radiowaves.left.and.right',
  'headset': 'headphones',
  'code-slash': 'chevron.left.forwardslash.chevron.right',
  'pulse': 'waveform.path',
  'logo-github': 'link',
  'radio-button-on': 'largecircle.fill.circle',
  'radio-button-off': 'circle',
  'add-circle-outline': 'plus.circle',
  'alert-circle': 'exclamationmark.circle.fill',
  'arrow-down-bold': 'arrow.down',
  'arrow-forward': 'arrow.right',
  'arrow-undo': 'arrow.uturn.backward',
  'chatbubble-ellipses-outline': 'quote.bubble',
  'check': 'checkmark',
  'checkmark': 'checkmark',
  'clipboard-outline': 'clipboard',
  'clipboard-text-outline': 'clipboard',
  'cloud-offline-outline': 'icloud.slash',
  'color-wand-outline': 'wand.and.stars',
  'copy-outline': 'doc.on.doc',
  'create-outline': 'square.and.pencil',
  'disc': 'opticaldisc',
  'document-text-outline': 'doc.text',
  'dots-three-horizontal': 'ellipsis',
  'eye-outline': 'eye',
  'keyboard-arrow-left': 'chevron.left',
  'link': 'link',
  'logo-youtube': 'play.rectangle.fill',
  'microphone-outline': 'mic',
  'music': 'music.note',
  'musical-notes-outline': 'music.note.list',
  'open-outline': 'arrow.up.right.square',
  'options-outline': 'slider.horizontal.3',
  'palette': 'paintpalette',
  'pencil-outline': 'pencil',
  'playlist-plus': 'text.badge.plus',
  'podcast': 'dot.radiowaves.left.and.right',
  'refresh': 'arrow.clockwise',
  'remove-circle-outline': 'minus.circle',
  'share-outline': 'square.and.arrow.up',
  'sparkles': 'sparkles',
  'stats-chart-sharp': 'waveform',
  'swap-vertical': 'arrow.up.arrow.down',
  'time-outline': 'clock',
  'trash-outline': 'trash',
  'user': 'person.fill',
  'pin': 'pin.fill',
  'radio': 'dot.radiowaves.left.and.right',
  'code-slash-outline': 'chevron.left.forwardslash.chevron.right',
  'arrow-down': 'arrow.down',
  'plus': 'plus',
};

interface AppIconProps {
  name: AppIconName;
  color?: string;
  size?: number;
  fill?: string;
  weight?: SymbolWeight;
  style?: StyleProp<ViewStyle | TextStyle>;
}

export function AppIcon({
  name,
  color,
  size,
  weight = 'medium',
  style,
}: AppIconProps) {
  const symbol = APP_SF_SYMBOLS[name];
  const { fontSize, color: styleColor, ...viewStyle } = (StyleSheet.flatten(style) || {}) as TextStyle;
  const resolvedSize = size || fontSize || 24;
  return (
    <SymbolView
      name={symbol}
      size={resolvedSize}
      tintColor={color || styleColor || '#FFFFFF'}
      type="monochrome"
      weight={weight}
      style={[{ width: resolvedSize, height: resolvedSize }, viewStyle as ViewStyle]}
    />
  );
}

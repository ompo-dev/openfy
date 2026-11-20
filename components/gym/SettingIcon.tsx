import React from 'react';
import { View } from 'react-native';
import { AppIcon } from '../native/AppIcon';
import { TINT } from '../../vendor/gym-notes/src/components/organisms/settings/primitives';

type IconName = React.ComponentProps<typeof AppIcon>['name'];
const colors: Partial<Record<IconName, string>> = {
  download: TINT.blue, 'download-outline': TINT.blue, options: TINT.indigo,
  'musical-notes': TINT.magenta, 'musical-note': TINT.magenta,
  'star-outline': '#F0B648', sparkles: '#F0B648', eye: TINT.purple,
  palette: TINT.magenta, 'chatbubble-ellipses-outline': TINT.magenta,
  'play-skip-forward': TINT.blue, 'notifications-outline': '#F0B648',
  'folder-outline': '#F0B648', 'code-slash': TINT.indigo, 'document-text': TINT.blue,
  pulse: '#4ADE80', copy: TINT.blue, repeat: TINT.purple, trash: '#FF7A7A',
  add: '#4ADE80', list: TINT.blue, 'reorder-three': TINT.blue,
};

export function SettingIcon({ name, color }: { name: IconName; color?: string }) {
  return <View style={{ width: 26, alignItems: 'center', justifyContent: 'center' }}>
    <AppIcon name={name} size={21} color={color ?? colors[name] ?? TINT.blue} />
  </View>;
}

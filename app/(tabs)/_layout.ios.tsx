/**
 * iOS Native Tab Bar using NativeTabs from expo-router/unstable-native-tabs.
 * On iOS 26+ this renders the system Liquid Glass tab bar automatically.
 * Android/web resolve `_layout.tsx` (custom GlassSurface tab bar).
 */
import { NativeTabs } from 'expo-router/unstable-native-tabs';

const { Label, Icon } = NativeTabs.Trigger;

export default function TabLayout() {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="home">
        <Label>Home</Label>
        <Icon sf={{ default: 'house', selected: 'house.fill' }} />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="library">
        <Label>Your Library</Label>
        <Icon sf={{ default: 'books.vertical', selected: 'books.vertical.fill' }} />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

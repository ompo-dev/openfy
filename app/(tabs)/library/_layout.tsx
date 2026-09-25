import { Stack } from 'expo-router';
import { detailStackOptions } from '@config';

export default function LibraryLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: '#121212' },
      }}
    >
      <Stack.Screen
        name="index"
        options={{ headerShown: false, animation: 'default' }}
      />
      <Stack.Screen
        name="playlist/[id]"
        options={detailStackOptions}
      />
      <Stack.Screen
        name="album/[id]"
        options={detailStackOptions}
      />
      <Stack.Screen
        name="artist/[id]"
        options={detailStackOptions}
      />
      <Stack.Screen
        name="settings"
        options={detailStackOptions}
      />
      <Stack.Screen
        name="episode/[id]"
        options={{ headerShown: false, animation: 'default' }}
      />
      <Stack.Screen
        name="show/[id]"
        options={{ headerShown: false, animation: 'default' }}
      />
    </Stack>
  );
}

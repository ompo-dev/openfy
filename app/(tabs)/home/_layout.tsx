import { Stack } from 'expo-router';
import { detailStackOptions } from '@config';

export default function HomeLayout() {
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
        name="playlist"
        options={detailStackOptions}
      />
      <Stack.Screen
        name="album"
        options={detailStackOptions}
      />
      <Stack.Screen
        name="artist"
        options={detailStackOptions}
      />
      <Stack.Screen
        name="episode"
        options={{ headerShown: false, animation: 'default' }}
      />
      <Stack.Screen
        name="show"
        options={{ headerShown: false, animation: 'default' }}
      />
    </Stack>
  );
}

import React from 'react';
import { Stack } from 'expo-router';
import { detailStackOptions } from '@config';

export default function AlbumLayout() {
  return (
    <Stack screenOptions={detailStackOptions}>
      <Stack.Screen name="[id]" />
    </Stack>
  );
}

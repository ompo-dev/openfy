import * as React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ArtistScreen } from '@screens';

export default function Artist() {
  const { id } = useLocalSearchParams();

  return <ArtistScreen artistId={id as string} />;
}

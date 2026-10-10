import * as React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { CollectionDetail, type CollectionDetailProps } from './CollectionDetail';
import { getDetailPreview } from '../../services/navigation/detailPreview';
import { LoggedPressable } from '../native';

export function PendingCollectionDetail({ kind, collectionId, error = '', onRetry, resolveTracksForPlayback }: {
  kind: CollectionDetailProps['kind'];
  collectionId: string;
  error?: string;
  onRetry?: () => void;
  resolveTracksForPlayback?: CollectionDetailProps['resolveTracksForPlayback'];
}) {
  const preview = getDetailPreview(kind, collectionId);
  const retry = error && onRetry ? <LoggedPressable accessibilityLabel="Tentar novamente" onPress={onRetry}
    style={{ alignSelf: 'center', padding: 16 }}><Text style={{ color: '#1ED760' }}>Tentar novamente</Text></LoggedPressable> : null;
  if (preview) return <CollectionDetail kind={kind} collectionId={collectionId} title={preview.title}
    imageURL={preview.imageURL || ''} imageURLs={preview.imageURLs} artists={preview.artists}
    metadata={preview.subtitle} trackCount={preview.trackCount} tracks={preview.tracks || []}
    loadingTracks={!error} loadingError={error} disableTrackArtistLinks footer={retry}
    resolveTracksForPlayback={resolveTracksForPlayback} />;
  return <View style={{ flex: 1, backgroundColor: '#101010', justifyContent: 'center', alignItems: 'center' }}>
    {error ? <Text style={{ color: '#FFFFFF', padding: 24 }}>{error}</Text> : <ActivityIndicator color="#1ED760" />}
    {retry}
  </View>;
}

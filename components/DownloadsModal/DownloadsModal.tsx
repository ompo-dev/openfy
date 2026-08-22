import * as React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useDownloads, type DownloadJobStatus } from '@context';
import { SheetFrame } from '../native';

type DownloadsModalProps = {
  visible: boolean;
  onClose: () => void;
};

const statusCopy: Record<DownloadJobStatus, string> = {
  queued: 'Na fila',
  resolving: 'Buscando áudio',
  downloading: 'Baixando',
  completed: 'Concluído',
  error: 'Falhou. Toque para tentar novamente.',
};

const statusColor: Record<DownloadJobStatus, string> = {
  queued: '#B8B8B8',
  resolving: '#B8B8B8',
  downloading: '#1ED760',
  completed: '#1ED760',
  error: '#F6B26B',
};

export function DownloadsModal({ visible, onClose }: DownloadsModalProps) {
  const { downloads, activeDownloadsCount, cancelDownload, retryDownload } = useDownloads();

  return (
    <SheetFrame
      visible={visible}
      title={activeDownloadsCount ? `Downloads (${activeDownloadsCount})` : 'Downloads'}
      onClose={onClose}
    >
      {downloads.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="download-outline" color="#8D8D8D" size={30} />
          <Text style={styles.emptyTitle}>Nenhum download em andamento</Text>
          <Text style={styles.emptyCopy}>
            Adicione uma música, álbum ou playlist para acompanhar por aqui.
          </Text>
        </View>
      ) : (
        downloads.map((download) => (
          <View key={download.spotifyId} style={styles.item}>
            {download.imageURL ? (
              <Image source={{ uri: download.imageURL }} style={styles.cover} />
            ) : (
              <View style={[styles.cover, styles.coverFallback]}>
                <Ionicons name="musical-note" color="#909090" size={20} />
              </View>
            )}
            <View style={styles.info}>
              <Text style={styles.title} numberOfLines={1}>
                {download.title}
              </Text>
              <Text style={styles.artist} numberOfLines={1}>
                {download.artistName}
              </Text>
              <Text style={[styles.status, { color: statusColor[download.status] }]}>
                {statusCopy[download.status]}
              </Text>
              {download.status === 'downloading' || download.status === 'resolving' ? (
                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progress,
                      { width: `${Math.max(2, Math.round(download.progress * 100))}%` },
                    ]}
                  />
                </View>
              ) : null}
            </View>
            {download.status === 'completed' ? (
              <Ionicons name="checkmark-circle" color="#1ED760" size={22} />
            ) : download.status === 'error' ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Tentar baixar ${download.title} novamente`}
                hitSlop={10}
                onPress={() => void retryDownload(download.spotifyId)}
                style={styles.cancelButton}
              >
                <Ionicons name="refresh" color="#F6B26B" size={19} />
              </Pressable>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Cancelar download de ${download.title}`}
                hitSlop={10}
                onPress={() => void cancelDownload(download.spotifyId)}
                style={styles.cancelButton}
              >
                <Ionicons name="close" color="#FFFFFF" size={17} />
              </Pressable>
            )}
          </View>
        ))
      )}
    </SheetFrame>
  );
}

const styles = StyleSheet.create({
  empty: {
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 26,
    paddingVertical: 32,
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontFamily: 'SF-Semibold',
    fontSize: 16,
    marginTop: 4,
  },
  emptyCopy: {
    color: '#989898',
    fontFamily: 'SF-Regular',
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  item: {
    alignItems: 'center',
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 12,
    minHeight: 64,
    paddingVertical: 10,
  },
  cover: {
    borderRadius: 7,
    height: 44,
    width: 44,
  },
  coverFallback: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: '#FFFFFF',
    fontFamily: 'SF-Semibold',
    fontSize: 14,
  },
  artist: {
    color: '#A6A6A6',
    fontFamily: 'SF-Regular',
    fontSize: 12,
  },
  status: {
    fontFamily: 'SF-Regular',
    fontSize: 11,
    marginTop: 1,
  },
  progressTrack: {
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    borderRadius: 999,
    height: 3,
    marginTop: 5,
    overflow: 'hidden',
  },
  progress: {
    backgroundColor: '#1ED760',
    borderRadius: 999,
    height: '100%',
  },
  cancelButton: {
    alignItems: 'center',
    borderColor: 'rgba(255, 255, 255, 0.24)',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
});

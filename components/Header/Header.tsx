/**
 * Header Component
 * Navigation header with page title and category filter pills.
 */

import * as React from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ImportModal } from '../ImportModal';
import { DownloadsModal } from '../DownloadsModal';
import { NativeIconButton } from '../native';
import { useDownloads, useLibrarySelectedCategory } from '@context';
import { LibraryControlsPicker } from './LibraryControlsPicker';

const libraryCopy = {
  songs: 'músicas',
  playlists: 'playlists',
  albums: 'álbuns',
  artists: 'artistas',
} as const;

export const Header = () => {
  const { top: statusBarOffset } = useSafeAreaInsets();
  const [importModalVisible, setImportModalVisible] = React.useState(false);
  const [downloadsModalVisible, setDownloadsModalVisible] = React.useState(false);
  const [searchVisible, setSearchVisible] = React.useState(false);
  const { activeDownloadsCount } = useDownloads();
  const {
    librarySearchQuery,
    setLibrarySearchQuery,
    librarySort,
    setLibrarySort,
    libraryView,
    setLibraryView,
    refreshLibrary,
  } = useLibrarySelectedCategory();
  const searchCopy = libraryCopy[libraryView];

  return (
    <View style={[styles.container, { paddingTop: statusBarOffset + 8 }]}>
      <View style={styles.topRow}>
        <NativeIconButton
          systemImage="plus"
          iconName="add"
          label="Adicionar música"
          size={38}
          onPress={() => setImportModalVisible(true)}
        />
        <View style={styles.centerPicker}>
          <LibraryControlsPicker
            kind="view"
            sort={librarySort}
            view={libraryView}
            onSortChange={setLibrarySort}
            onViewChange={setLibraryView}
          />
        </View>
        <View style={styles.trailingControls}>
          <View style={styles.downloadControl}>
            <NativeIconButton
              systemImage="arrow.down.circle"
              iconName="download"
              label="Ver downloads"
              size={38}
              tint="#B8B8B8"
              onPress={() => setDownloadsModalVisible(true)}
            />
            {activeDownloadsCount > 0 ? (
              <View style={styles.downloadBadge}>
                <Text style={styles.downloadBadgeText}>{activeDownloadsCount}</Text>
              </View>
            ) : null}
          </View>
          <LibraryControlsPicker
            kind="sort"
            sort={librarySort}
            view={libraryView}
            onSortChange={setLibrarySort}
            onViewChange={setLibraryView}
          />
          <NativeIconButton
            systemImage="magnifyingglass"
            iconName="search"
            label={`Pesquisar ${searchCopy}`}
            size={38}
            tint="#B8B8B8"
            onPress={() => setSearchVisible((visible) => !visible)}
          />
        </View>
      </View>

      {searchVisible ? (
        <TextInput
          autoFocus
          value={librarySearchQuery}
          onChangeText={setLibrarySearchQuery}
          placeholder={`Pesquisar ${searchCopy}`}
          placeholderTextColor="#777"
          style={styles.searchInput}
        />
      ) : null}

      <ImportModal
        visible={importModalVisible}
        onClose={() => setImportModalVisible(false)}
        onLibraryChanged={refreshLibrary}
      />
      <DownloadsModal
        visible={downloadsModalVisible}
        onClose={() => setDownloadsModalVisible(false)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#121212',
    paddingBottom: 12,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    height: 52,
    gap: 10,
    position: 'relative',
  },
  centerPicker: {
    alignItems: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    pointerEvents: 'box-none',
  },
  trailingControls: { flexDirection: 'row', gap: 8, marginLeft: 'auto' },
  downloadControl: {
    height: 38,
    position: 'relative',
    width: 38,
  },
  downloadBadge: {
    alignItems: 'center',
    backgroundColor: '#1ED760',
    borderColor: '#121212',
    borderRadius: 8,
    borderWidth: 1,
    height: 16,
    justifyContent: 'center',
    minWidth: 16,
    paddingHorizontal: 3,
    position: 'absolute',
    pointerEvents: 'none',
    right: -3,
    top: -3,
  },
  downloadBadgeText: {
    color: '#07120A',
    fontFamily: 'SF-Bold',
    fontSize: 9,
  },
  searchInput: {
    height: 40,
    marginHorizontal: 12,
    marginTop: 6,
    borderRadius: 10,
    paddingHorizontal: 12,
    backgroundColor: '#1E1E1E',
    color: '#FFFFFF',
    fontSize: 15,
  },
});

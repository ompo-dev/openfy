/**
 * Header Component
 * Navigation header with page title and category filter pills.
 */

import * as React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ImportModal } from '../ImportModal';
import { AppIcon, GlassSurface, NativeIconButton } from '../native';
import { useLibrarySelectedCategory } from '@context';
import { LibraryControlsPicker } from './LibraryControlsPicker';

export const Header = () => {
  const { top: statusBarOffset } = useSafeAreaInsets();
  const [importModalVisible, setImportModalVisible] = React.useState(false);
  const [searchVisible, setSearchVisible] = React.useState(false);
  const {
    librarySearchQuery,
    setLibrarySearchQuery,
    librarySort,
    setLibrarySort,
    libraryView,
    setLibraryView,
    refreshLibrary,
  } = useLibrarySelectedCategory();

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
        <Text style={styles.titleText}>
          {libraryView === 'songs' ? 'Songs' : 'Playlists'}
        </Text>
        <LibraryControlsPicker
          sort={librarySort}
          view={libraryView}
          onSortChange={setLibrarySort}
          onViewChange={setLibraryView}
        />
        <GlassSurface glass="clear" isInteractive style={styles.controls}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Pesquisar ${libraryView === 'songs' ? 'músicas' : 'playlists'}`}
            onPress={() => setSearchVisible((visible) => !visible)}
            style={styles.controlButton}
          >
            <AppIcon name="search" size={18} color="#B8B8B8" />
          </Pressable>
        </GlassSurface>
      </View>

      {searchVisible ? (
        <TextInput
          autoFocus
          value={librarySearchQuery}
          onChangeText={setLibrarySearchQuery}
          placeholder={`Pesquisar ${libraryView === 'songs' ? 'músicas' : 'playlists'}`}
          placeholderTextColor="#777"
          style={styles.searchInput}
        />
      ) : null}

      <ImportModal
        visible={importModalVisible}
        onClose={() => setImportModalVisible(false)}
        onLibraryChanged={refreshLibrary}
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
  },
  titleText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontFamily: 'SF-Semibold',
    fontWeight: '600',
  },
  controls: {
    height: 36,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },
  controlButton: {
    width: 35,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
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

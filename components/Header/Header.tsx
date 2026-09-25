/**
 * Header Component
 * Navigation header with page title and category filter pills.
 */

import * as React from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { type Href, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ImportModal } from '../ImportModal';
import { DownloadsModal } from '../DownloadsModal';
import {
  AppIcon,
  GlassSurface,
  LoggedPressable,
  NativeIconButton,
} from '../native';
import { useDownloads, useLibrarySelectedCategory } from '@context';
import { LibraryControlsPicker } from './LibraryControlsPicker';

const libraryCopy = {
  songs: 'músicas',
  playlists: 'playlists',
  albums: 'álbuns',
  artists: 'artistas',
} as const;

export const Header = () => {
  const router = useRouter();
  const { top: statusBarOffset } = useSafeAreaInsets();
  const [importModalVisible, setImportModalVisible] = React.useState(false);
  const [downloadsModalVisible, setDownloadsModalVisible] = React.useState(false);
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
  const [searchVisible, setSearchVisible] = React.useState(
    Boolean(librarySearchQuery)
  );
  const searchCopy = libraryCopy[libraryView];

  return (
    <View style={[styles.container, { paddingTop: statusBarOffset + 8 }]}>
      <View style={styles.topRow}>
        <View style={styles.leadingControls}>
          <GlassSurface glass="regular" isInteractive style={styles.actionGroup}>
            <LoggedPressable
              accessibilityLabel="Adicionar música"
              accessibilityRole="button"
              onPress={() => setImportModalVisible(true)}
              style={({ pressed }) => [styles.groupButton, pressed && styles.groupPressed]}
            >
              <AppIcon color="#B8B8B8" name="add" size={21} />
            </LoggedPressable>
            <View style={styles.groupDivider} />
            <View style={styles.filterControl}>
              <LibraryControlsPicker
                embedded
                kind="filter"
                sort={librarySort}
                onSortChange={setLibrarySort}
                searchLabel={`Pesquisar ${searchCopy}`}
                searchVisible={searchVisible}
                onSearchToggle={() => setSearchVisible((visible) => !visible)}
                activeDownloadsCount={activeDownloadsCount}
                onDownloadsPress={() => setDownloadsModalVisible(true)}
              />
              {activeDownloadsCount > 0 ? (
                <View
                  style={styles.downloadBadge}
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  aria-hidden
                >
                  <Text style={styles.downloadBadgeText}>
                    {activeDownloadsCount > 99 ? '99+' : activeDownloadsCount}
                  </Text>
                </View>
              ) : null}
            </View>
          </GlassSurface>
        </View>
        <View style={styles.centerPicker}>
          <LibraryControlsPicker
            kind="view"
            view={libraryView}
            onViewChange={setLibraryView}
          />
        </View>
        <View style={styles.trailingControls}>
          <NativeIconButton
            systemImage="gearshape"
            iconName="settings-outline"
            label="Abrir configurações"
            size={40}
            onPress={() =>
              router.navigate('/(tabs)/library/settings' as Href, {
                dangerouslySingular: true,
              })
            }
          />
        </View>
      </View>

      {searchVisible ? (
        <TextInput
          autoFocus
          value={librarySearchQuery}
          onChangeText={setLibrarySearchQuery}
          accessibilityLabel={`Pesquisar ${searchCopy}`}
          returnKeyType="search"
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
  },
  centerPicker: {
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  leadingControls: { alignItems: 'center', width: 82 },
  trailingControls: { alignItems: 'flex-end', width: 82 },
  actionGroup: {
    alignItems: 'center',
    borderRadius: 20,
    flexDirection: 'row',
    height: 40,
    width: 81,
  },
  groupButton: {
    alignItems: 'center',
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  groupDivider: {
    backgroundColor: 'rgba(255,255,255,0.16)',
    height: 20,
    width: StyleSheet.hairlineWidth,
  },
  groupPressed: { opacity: 0.58 },
  filterControl: {
    height: 40,
    position: 'relative',
    width: 40,
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

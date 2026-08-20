/**
 * Header Component
 * Navigation header with page title and category filter pills.
 */

import * as React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AntDesign, FontAwesome5 } from '@expo/vector-icons';

import { LibraryRelated } from './LibraryRelated';
import { HomeCategories } from './HomeCategories/HomeCategories';
import { ImportModal } from '../ImportModal';
import { Pages } from '@config';
import { translations } from '@data';

export type HeaderPropsType = {
  tab: Pages;
};

export const Header = ({ tab }: HeaderPropsType) => {
  const { top: statusBarOffset } = useSafeAreaInsets();
  const [importModalVisible, setImportModalVisible] = React.useState(false);

  const isHome = tab === Pages.HOME;
  const isLibrary = tab === Pages.LIBRARY;

  return (
    <View style={[styles.container, { paddingTop: statusBarOffset }]}>
      {/* Top Bar */}
      <View style={styles.topRow}>
        {isLibrary && (
          <View style={styles.rightActions}>
            <Pressable
              style={styles.iconButton}
              hitSlop={8}
              onPress={() => setImportModalVisible(true)}
            >
              <AntDesign name="plus" size={24} color="#FFFFFF" />
            </Pressable>
          </View>
        )}
      </View>

      {isLibrary && <LibraryRelated />}

      <ImportModal
        visible={importModalVisible}
        onClose={() => setImportModalVisible(false)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#121212',
    paddingBottom: 4,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    height: 56,
  },
  homeTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  spotifyLogo: {
    marginRight: 2,
  },
  homeTitleText: {
    color: '#FFFFFF',
    fontSize: 26,
    fontFamily: 'SF-Bold',
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  titleText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontFamily: 'SF-Bold',
    fontWeight: '700',
  },
  rightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  iconButton: {
    padding: 2,
  },
});

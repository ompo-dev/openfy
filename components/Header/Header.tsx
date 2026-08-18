/**
 * Header Component
 * Modern Spotify & SwiftUI styled navigation header with Cast, Notifications,
 * Profile avatar, and Category Filter Pills.
 */

import * as React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontAwesome5, Ionicons, MaterialCommunityIcons, AntDesign } from '@expo/vector-icons';

import { LibraryRelated } from './LibraryRelated';
import { HomeCategories } from './HomeCategories/HomeCategories';
import { useUserData } from '@context';
import { Pages } from '@config';
import { translations } from '@data';

export type HeaderPropsType = {
  tab: Pages;
};

export const Header = ({ tab }: HeaderPropsType) => {
  const { top: statusBarOffset } = useSafeAreaInsets();
  const { userData } = useUserData();

  const isHome = tab === Pages.HOME;
  const isLibrary = tab === Pages.LIBRARY;

  return (
    <View style={[styles.container, { paddingTop: statusBarOffset }]}>
      {/* Top Bar */}
      <View style={styles.topRow}>
        {isHome ? (
          <View style={styles.homeTitleContainer}>
            <FontAwesome5 name="spotify" size={30} color="#1DB954" style={styles.spotifyLogo} />
            <Text style={styles.homeTitleText}>Home</Text>
          </View>
        ) : (
          <View style={styles.leftSection}>
            <Pressable style={styles.profileButton}>
              {userData.imageURL ? (
                <Image style={styles.profileImage} source={{ uri: userData.imageURL }} />
              ) : (
                <View style={styles.profileFallback}>
                  <Ionicons name="person" size={16} color="#FFFFFF" />
                </View>
              )}
            </Pressable>
            <Text style={styles.titleText}>{translations.header[tab]}</Text>
          </View>
        )}

        {/* Right Actions */}
        <View style={styles.rightActions}>
          <Pressable style={styles.iconButton} hitSlop={8}>
            <MaterialCommunityIcons name="cast" size={24} color="#FFFFFF" />
          </Pressable>
          <Pressable style={styles.iconButton} hitSlop={8}>
            <Ionicons name="notifications-outline" size={24} color="#FFFFFF" />
          </Pressable>
          {isHome && (
            <Pressable style={styles.profileButton}>
              {userData.imageURL ? (
                <Image style={styles.profileImage} source={{ uri: userData.imageURL }} />
              ) : (
                <View style={styles.profileFallback}>
                  <Ionicons name="person" size={16} color="#FFFFFF" />
                </View>
              )}
            </Pressable>
          )}
          {isLibrary && (
            <Pressable style={styles.iconButton} hitSlop={8}>
              <AntDesign name="plus" size={22} color="#FFFFFF" />
            </Pressable>
          )}
        </View>
      </View>

      {/* Tab Specific Filter Sub-Header */}
      {isHome && <HomeCategories />}
      {isLibrary && <LibraryRelated />}
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
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  titleText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontFamily: 'SF-Bold',
    fontWeight: '700',
  },
  profileButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    overflow: 'hidden',
  },
  profileImage: {
    width: '100%',
    height: '100%',
  },
  profileFallback: {
    width: '100%',
    height: '100%',
    backgroundColor: '#333333',
    alignItems: 'center',
    justifyContent: 'center',
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

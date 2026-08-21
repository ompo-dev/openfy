/**
 * MiniPlayer Component
 * Refactored iOS Liquid Glass / SwiftUI Dynamic Island style pill player.
 * Compact status dock with artwork, track metadata, tactile controls, and progress.
 */

import * as React from 'react';
import { Animated, Image, Platform, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { usePlayer } from '@context';
import { GlassSurface, LoggedPressable } from '../native';
import { MarqueeText } from '../common/MarqueeText';

export type MiniPlayerProps = {
  onPress?: () => void;
  onConfirm?: () => void;
  style?: any;
};

export const MiniPlayer = ({ onPress, onConfirm, style }: MiniPlayerProps) => {
  const { currentTrack, playerState, togglePlayPause, isPlayerVisible } =
    usePlayer();
  const fadeAnim = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.spring(fadeAnim, {
      toValue: isPlayerVisible ? 1 : 0,
      useNativeDriver: Platform.OS !== 'web',
      damping: 18,
      stiffness: 200,
      mass: 0.8,
    }).start();
  }, [isPlayerVisible, fadeAnim]);

  if (!currentTrack || !isPlayerVisible) return null;

  const progress =
    playerState.durationMs > 0
      ? Math.min(
          1,
          Math.max(0, playerState.positionMs / playerState.durationMs)
        )
      : 0;

  const handlePlayPause = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}
    togglePlayPause();
  };

  return (
    <Animated.View
      style={[
        styles.container,
        style,
        {
          opacity: fadeAnim,
          transform: [
            {
              translateY: fadeAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [24, 0],
              }),
            },
            {
              scale: fadeAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0.94, 1],
              }),
            },
          ],
        },
      ]}
    >
      <LoggedPressable
        onPress={onPress}
        style={styles.pressableWrapper}
        accessibilityLabel="Abrir Player de Música"
      >
        <GlassSurface
          glass="regular"
          isInteractive={!!onPress}
          tintColor="rgba(20, 22, 26, 0.64)"
          style={styles.glassContainer}
        >
          <View style={styles.contentRow}>
            <View style={styles.coverWrapper}>
              {currentTrack.imageURL ? (
                <Image
                  source={{ uri: currentTrack.imageURL }}
                  style={styles.coverImage}
                />
              ) : (
                <View style={[styles.coverImage, styles.coverFallback]}>
                  <Ionicons name="musical-note" size={18} color="#FFFFFF" />
                </View>
              )}
            </View>

            <View style={styles.infoContainer}>
              <MarqueeText
                text={currentTrack.title}
                style={styles.titleText}
                align="left"
                fadeWidth={8}
              />
              <MarqueeText
                text={currentTrack.artistName}
                style={styles.artistText}
                align="left"
                fadeWidth={8}
              />
            </View>

            <View style={styles.controlsContainer}>
              <LoggedPressable
                style={styles.controlPressable}
                hitSlop={12}
                onPress={(e) => {
                  e.stopPropagation();
                  handlePlayPause();
                }}
                accessibilityRole="button"
                accessibilityLabel={playerState.isPlaying ? 'Pausar' : 'Tocar'}
              >
                <GlassSurface
                  glass="clear"
                  tintColor="rgba(255,255,255,0.16)"
                  isInteractive
                  style={styles.controlSurface}
                >
                  <Ionicons
                    name={playerState.isPlaying ? 'pause' : 'play'}
                    size={19}
                    color="#FFFFFF"
                    style={
                      !playerState.isPlaying ? { marginLeft: 2 } : undefined
                    }
                  />
                </GlassSurface>
              </LoggedPressable>

              {onConfirm && (
                <LoggedPressable
                  style={styles.controlPressable}
                  onPress={(e) => {
                    e.stopPropagation();
                    try {
                      Haptics.notificationAsync(
                        Haptics.NotificationFeedbackType.Success
                      );
                    } catch {}
                    onConfirm();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Confirmar música"
                >
                  <GlassSurface
                    glass="regular"
                    tintColor="rgba(30,215,96,0.34)"
                    isInteractive
                    style={styles.controlSurface}
                  >
                    <Ionicons name="arrow-forward" size={17} color="#FFFFFF" />
                  </GlassSurface>
                </LoggedPressable>
              )}
            </View>
          </View>

          <View style={styles.progressBarBackground}>
            <View
              style={[styles.progressBarFill, { width: `${progress * 100}%` }]}
            />
          </View>
        </GlassSurface>
      </LoggedPressable>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 89 : 84,
    left: 14,
    right: 14,
    zIndex: 9999,
    elevation: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.55,
    shadowRadius: 16,
  },
  pressableWrapper: {
    borderRadius: 36,
    overflow: 'hidden',
  },
  glassContainer: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.22)',
    borderRadius: 36,
    overflow: 'hidden',
    minHeight: 64,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 12,
  },
  coverWrapper: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
  },
  coverImage: {
    width: '100%',
    height: '100%',
    borderRadius: 22,
    backgroundColor: '#1C1C1E',
  },
  coverFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#15803D',
  },
  infoContainer: {
    flex: 1,
    gap: 2,
    justifyContent: 'center',
  },
  titleText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: 'SF-Bold',
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  artistText: {
    color: 'rgba(255, 255, 255, 0.68)',
    fontSize: 13,
    fontFamily: 'SF-Regular',
    letterSpacing: 0.1,
  },
  controlsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingRight: 2,
  },
  controlPressable: {
    width: 32,
    height: 32,
  },
  controlSurface: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressBarBackground: {
    height: 2.5,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    width: '100%',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 1,
  },
});

/**
 * MiniPlayer Component
 * Refactored iOS Liquid Glass / SwiftUI Dynamic Island style pill player.
 * Deep emerald/dark translucent glass with circular artwork, typography, AirPlay output,
 * tactile haptics, and sleek edge-to-edge white progress bar.
 */

import * as React from 'react';
import {
  Animated,
  Image,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
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

  const handleDevicePress = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
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
          isInteractive
          style={styles.glassContainer}
        >
          {/* Subtle Emerald / Dark Translucent Liquid Glass Gradient */}
          <LinearGradient
            colors={['rgba(10, 48, 30, 0.88)', 'rgba(6, 32, 20, 0.94)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.gradientBacking}
          >
            <View style={styles.contentRow}>
              {/* Left: Circular Album Cover */}
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

              {/* Center: Title & Artist Typography with Marquee */}
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

              {/* Right: Audio Output Device & Play/Pause / Confirm Button */}
              <View style={styles.controlsContainer}>
                <LoggedPressable
                  style={styles.playBtn}
                  hitSlop={12}
                  onPress={(e) => {
                    e.stopPropagation();
                    handlePlayPause();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={
                    playerState.isPlaying ? 'Pausar' : 'Tocar'
                  }
                >
                  <Ionicons
                    name={playerState.isPlaying ? 'pause' : 'play'}
                    size={24}
                    color="#FFFFFF"
                    style={
                      !playerState.isPlaying ? { marginLeft: 2 } : undefined
                    }
                  />
                </LoggedPressable>

                {onConfirm && (
                  <TouchableOpacity
                    style={styles.confirmCheckBtn}
                    activeOpacity={0.8}
                    onPress={(e) => {
                      e.stopPropagation();
                      try {
                        Haptics.notificationAsync(
                          Haptics.NotificationFeedbackType.Success
                        );
                      } catch {}
                      onConfirm();
                    }}
                  >
                    <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Bottom Progress Line */}
            <View style={styles.progressBarBackground}>
              <View
                style={[
                  styles.progressBarFill,
                  { width: `${progress * 100}%` },
                ]}
              />
            </View>
          </LinearGradient>
        </GlassSurface>
      </LoggedPressable>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 84,
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
    borderRadius: 36,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
    overflow: 'hidden',
  },
  gradientBacking: {
    borderRadius: 36,
    overflow: 'hidden',
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
    paddingRight: 4,
  },
  deviceBtn: {
    padding: 4,
  },
  playBtn: {
    padding: 4,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmCheckBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#5B5BD6',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#5B5BD6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
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

/**
 * MiniPlayer Component
 * Floating Apple Music-style Liquid Glass pill player.
 * Uses GlassSurface (real Liquid Glass on iOS 26, expo-blur on older).
 */
import * as React from "react";
import { Animated, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { usePlayer } from "@context";
import { GlassSurface } from "../native";

type MiniPlayerProps = { onPress: () => void };

export const MiniPlayer = ({ onPress }: MiniPlayerProps) => {
  const { currentTrack, playerState, togglePlayPause, isPlayerVisible } = usePlayer();
  const fadeAnim = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.spring(fadeAnim, {
      toValue: isPlayerVisible ? 1 : 0,
      useNativeDriver: true,
      damping: 18,
      stiffness: 180,
    }).start();
  }, [isPlayerVisible, fadeAnim]);

  if (!currentTrack || !isPlayerVisible) return null;

  const progress = playerState.durationMs > 0 ? playerState.positionMs / playerState.durationMs : 0;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity: fadeAnim,
          transform: [{ translateY: fadeAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }],
        },
      ]}
    >
      <Pressable onPress={onPress} style={styles.pressableWrapper}>
        <GlassSurface glass="regular" isInteractive style={styles.glass}>
          <View style={styles.mainContent}>
            {currentTrack.imageURL ? (
              <Image source={{ uri: currentTrack.imageURL }} style={styles.coverImage} />
            ) : (
              <View style={[styles.coverImage, styles.coverFallback]}>
                <Ionicons name="musical-note" size={20} color="#FFFFFF" />
              </View>
            )}

            <View style={styles.infoSection}>
              <Text style={styles.titleText} numberOfLines={1}>{currentTrack.title}</Text>
              <Text style={styles.artistText} numberOfLines={1}>{currentTrack.artistName}</Text>
            </View>

            <View style={styles.actionsSection}>
              <Pressable style={styles.actionBtn} hitSlop={10} onPress={(e) => { e.stopPropagation(); }}>
                <Ionicons name={"airplay" as any} size={22} color="#FFFFFF" />
              </Pressable>
              <Pressable style={styles.actionBtn} hitSlop={10} onPress={(e) => { e.stopPropagation(); togglePlayPause(); }}>
                <Ionicons name={playerState.isPlaying ? "pause" : "play"} size={26} color="#FFFFFF" />
              </Pressable>
            </View>
          </View>

          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
          </View>
        </GlassSurface>
      </Pressable>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "absolute", bottom: 92, left: 10, right: 10, zIndex: 9999,
    elevation: 24, shadowColor: "#000", shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5, shadowRadius: 12,
  },
  pressableWrapper: { borderRadius: 22, overflow: "hidden" },
  glass: { borderRadius: 22, overflow: "hidden" },
  mainContent: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 10, gap: 12 },
  coverImage: { width: 44, height: 44, borderRadius: 10, backgroundColor: "#1E293B" },
  coverFallback: { alignItems: "center", justifyContent: "center" },
  infoSection: { flex: 1, gap: 2 },
  titleText: { color: "#FFFFFF", fontSize: 14, fontWeight: "600", letterSpacing: 0.1 },
  artistText: { color: "rgba(255,255,255,0.65)", fontSize: 12 },
  actionsSection: { flexDirection: "row", alignItems: "center", gap: 14, paddingRight: 4 },
  actionBtn: { padding: 4 },
  progressTrack: { height: 2, backgroundColor: "rgba(255,255,255,0.12)", width: "100%" },
  progressFill: { height: "100%", backgroundColor: "rgba(255,255,255,0.8)", borderRadius: 1 },
});

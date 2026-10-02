import Foundation

enum YouTubePlaybackDurationPolicy {
  static func resolveSeconds(
    measuredSeconds: Double,
    streamDurationMs: Double,
    catalogDurationMs: Double
  ) -> Double {
    if measuredSeconds.isFinite && measuredSeconds > 0 {
      return measuredSeconds
    }
    if streamDurationMs.isFinite && streamDurationMs > 0 {
      return streamDurationMs / 1000
    }
    if catalogDurationMs.isFinite && catalogDurationMs > 0 {
      return catalogDurationMs / 1000
    }
    return 0
  }
}

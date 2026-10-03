import Foundation

enum YouTubePlaybackDurationPolicy {
  private static func validSeconds(_ milliseconds: Double) -> Double? {
    guard milliseconds.isFinite, milliseconds > 0 else { return nil }
    return milliseconds / 1000
  }

  private static func isDuplicated(_ measured: Double, comparedWith candidate: Double) -> Bool {
    guard measured.isFinite, measured > 0, candidate.isFinite, candidate > 0 else {
      return false
    }
    let ratio = measured / candidate
    return ratio >= 1.8 && ratio <= 2.2
  }

  static func resolveSeconds(
    measuredSeconds: Double,
    streamDurationMs: Double,
    catalogDurationMs: Double
  ) -> Double {
    let streamSeconds = validSeconds(streamDurationMs)
    let catalogSeconds = validSeconds(catalogDurationMs)

    // AVPlayer can expose a duplicated MP4/DASH timeline. Keep the actual
    // stream length when it is legitimate, but never expose the silent second
    // half when the measured container is roughly twice a trusted duration.
    if let streamSeconds, isDuplicated(measuredSeconds, comparedWith: streamSeconds) {
      return streamSeconds
    }
    if let catalogSeconds, isDuplicated(measuredSeconds, comparedWith: catalogSeconds) {
      return catalogSeconds
    }
    if measuredSeconds.isFinite && measuredSeconds > 0 {
      return measuredSeconds
    }
    if let streamSeconds {
      return streamSeconds
    }
    if let catalogSeconds {
      return catalogSeconds
    }
    return 0
  }
}

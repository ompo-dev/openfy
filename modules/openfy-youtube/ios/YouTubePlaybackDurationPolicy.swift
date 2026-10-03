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

    // The catalog duration is the stable source of truth for tracks resolved
    // from YouTube. Both the stream descriptor and AVPlayer can carry the
    // same duplicated MP4/DASH timeline, so compare both against the catalog
    // before accepting either native value.
    if let catalogSeconds, isDuplicated(measuredSeconds, comparedWith: catalogSeconds) {
      return catalogSeconds
    }
    if let streamSeconds, let catalogSeconds,
       isDuplicated(streamSeconds, comparedWith: catalogSeconds) {
      return catalogSeconds
    }
    if let streamSeconds, isDuplicated(measuredSeconds, comparedWith: streamSeconds) {
      return streamSeconds
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

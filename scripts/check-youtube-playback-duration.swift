import Foundation

@main
struct CheckYouTubePlaybackDuration {
  static func main() {
    precondition(
      YouTubePlaybackDurationPolicy.resolveSeconds(
        measuredSeconds: .nan,
        streamDurationMs: 184_000,
        catalogDurationMs: 140_727
      ) == 184
    )
    precondition(
      YouTubePlaybackDurationPolicy.resolveSeconds(
        measuredSeconds: 186.5,
        streamDurationMs: 184_000,
        catalogDurationMs: 140_727
      ) == 186.5
    )
    precondition(
      YouTubePlaybackDurationPolicy.resolveSeconds(
        measuredSeconds: .infinity,
        streamDurationMs: 0,
        catalogDurationMs: 140_727
      ) == 140.727
    )
    precondition(
      YouTubePlaybackDurationPolicy.resolveSeconds(
        measuredSeconds: .nan,
        streamDurationMs: 0,
        catalogDurationMs: 0
      ) == 0
    )
    print("YouTube playback duration checks passed: measured stream, source duration, catalog fallback")
  }
}

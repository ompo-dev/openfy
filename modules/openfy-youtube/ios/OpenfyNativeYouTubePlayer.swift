@preconcurrency import AVFoundation
import Foundation

/**
 * Native AVPlayer wrapper holding a strong reference to OpenfyAssetResourceLoader.
 * Provides isolated lifecycle management (play, pause, resume, seek, stop, status).
 */
@MainActor
public final class OpenfyNativeYouTubePlayer {
  private var player: AVPlayer?
  private var resourceLoader: OpenfyAssetResourceLoader?
  private var itemStatusObserver: NSKeyValueObservation?
  private var timeControlStatusObserver: NSKeyValueObservation?

  public init() {}

  public func play(
    descriptor: YouTubeStreamDescriptor,
    rangeClient: YouTubeHTTPRangeClient
  ) throws {
    // 1. Clean up any existing playback session
    stop()

    // 2. Build virtual openfy-stream URL to route AVAsset requests into our ResourceLoader delegate
    guard let virtualURL = URL(string: "openfy-stream://media/\(descriptor.videoId)") else {
      throw StreamTransportError.invalidVirtualURL
    }

    let asset = AVURLAsset(url: virtualURL)
    let loader = OpenfyAssetResourceLoader(
      descriptor: descriptor,
      rangeClient: rangeClient
    )

    // IMPORTANT: AVURLAsset holds a weak reference to the delegate.
    // We hold a strong reference on self.resourceLoader to prevent premature deallocation.
    self.resourceLoader = loader
    asset.resourceLoader.setDelegate(loader, queue: loader.queue)

    let item = AVPlayerItem(asset: asset)
    let player = AVPlayer(playerItem: item)
    self.player = player

    // Diagnostic KVO state observations
    itemStatusObserver = item.observe(\.status, options: [.new]) { item, _ in
      switch item.status {
      case .readyToPlay:
        NSLog("[PLAYER] item.status = readyToPlay")
      case .failed:
        NSLog("[PLAYER] item.status = failed, error: %@", item.error?.localizedDescription ?? "nil")
      case .unknown:
        NSLog("[PLAYER] item.status = unknown")
      @unknown default:
        break
      }
    }

    timeControlStatusObserver = player.observe(\.timeControlStatus, options: [.new]) { player, _ in
      switch player.timeControlStatus {
      case .playing:
        NSLog("[PLAYER] timeControlStatus = playing")
      case .paused:
        NSLog("[PLAYER] timeControlStatus = paused")
      case .waitingToPlayAtSpecifiedRate:
        NSLog("[PLAYER] timeControlStatus = waitingToPlayAtSpecifiedRate (reason: %@)",
              player.reasonForWaitingToPlay?.rawValue ?? "nil")
      @unknown default:
        break
      }
    }

    player.play()
  }

  public func pause() {
    player?.pause()
  }

  public func resume() {
    player?.play()
  }

  public func seek(to positionMs: Double) async {
    guard let player = player else { return }
    let seconds = max(0, positionMs / 1000.0)
    let targetTime = CMTime(seconds: seconds, preferredTimescale: 600)
    await player.seek(to: targetTime, toleranceBefore: .zero, toleranceAfter: .zero)
  }

  public func stop() {
    itemStatusObserver?.invalidate()
    itemStatusObserver = nil
    timeControlStatusObserver?.invalidate()
    timeControlStatusObserver = nil
    player?.pause()
    player?.replaceCurrentItem(with: nil)
    resourceLoader?.cancelAll()
    player = nil
    resourceLoader = nil
    NSLog("[PLAYER] Playback stopped and resources released")
  }

  public func getStatus() -> [String: Any] {
    guard let player = player, let item = player.currentItem else {
      return [
        "isPlaying": false,
        "isLoaded": false,
        "positionMs": 0,
        "durationMs": 0,
      ]
    }

    let isPlaying = player.timeControlStatus == .playing
    let posSec = CMTimeGetSeconds(player.currentTime())
    let durSec = CMTimeGetSeconds(item.duration)
    let positionMs = (posSec.isNaN || posSec.isInfinite) ? 0 : posSec * 1000.0
    let durationMs = (durSec.isNaN || durSec.isInfinite) ? 0 : durSec * 1000.0

    var dict: [String: Any] = [
      "isPlaying": isPlaying,
      "isLoaded": item.status == .readyToPlay,
      "positionMs": positionMs,
      "durationMs": durationMs,
    ]

    if let itemError = item.error {
      dict["error"] = itemError.localizedDescription
    }

    return dict
  }
}

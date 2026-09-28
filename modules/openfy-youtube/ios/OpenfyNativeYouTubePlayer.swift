@preconcurrency import AVFoundation
@preconcurrency import MediaPlayer
import Foundation

public struct OpenfyNowPlayingMetadata: Sendable {
  public let title: String
  public let artist: String
  public let albumTitle: String?

  public init(values: [String: String]) {
    title = values["title"] ?? "Openfy Music"
    artist = values["artist"] ?? ""
    albumTitle = values["albumTitle"]
  }
}

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
  private var playbackEndObserver: NSObjectProtocol?
  private var nowPlayingMetadata: OpenfyNowPlayingMetadata?
  private var didJustFinish = false

  public var onPlaybackEnded: (() -> Void)?
  public var onNextTrack: (() -> Void)?
  public var onPreviousTrack: (() -> Void)?

  public init() {
    configureRemoteCommands()
  }

  public func play(
    descriptor: YouTubeStreamDescriptor,
    rangeClient: YouTubeHTTPRangeClient,
    metadata: OpenfyNowPlayingMetadata
  ) throws {
    // 1. Clean up any existing playback session
    stop()
    didJustFinish = false
    nowPlayingMetadata = metadata

    let audioSession = AVAudioSession.sharedInstance()
    try audioSession.setCategory(.playback, mode: .default)
    try audioSession.setActive(true)

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
    player.automaticallyWaitsToMinimizeStalling = true
    self.player = player

    playbackEndObserver = NotificationCenter.default.addObserver(
      forName: .AVPlayerItemDidPlayToEndTime,
      object: item,
      queue: .main
    ) { [weak self] _ in
      Task { @MainActor [weak self] in
        guard let self else { return }
        self.didJustFinish = true
        self.updateNowPlayingInfo()
        self.onPlaybackEnded?()
      }
    }

    // Diagnostic KVO state observations
    itemStatusObserver = item.observe(\.status, options: [.new]) { item, _ in
      switch item.status {
      case .readyToPlay:
        NSLog("[PLAYER] item.status = readyToPlay")
        Task { @MainActor [weak self] in self?.updateNowPlayingInfo() }
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
      Task { @MainActor [weak self] in self?.updateNowPlayingInfo() }
    }

    updateNowPlayingInfo()
    player.play()
  }

  public func pause() {
    player?.pause()
    updateNowPlayingInfo()
  }

  public func resume() {
    didJustFinish = false
    player?.play()
    updateNowPlayingInfo()
  }

  public func seek(to positionMs: Double) async {
    guard let player = player else { return }
    let seconds = max(0, positionMs / 1000.0)
    let targetTime = CMTime(seconds: seconds, preferredTimescale: 600)
    await player.seek(to: targetTime, toleranceBefore: .zero, toleranceAfter: .zero)
    didJustFinish = false
    updateNowPlayingInfo()
  }

  public func stop() {
    itemStatusObserver?.invalidate()
    itemStatusObserver = nil
    timeControlStatusObserver?.invalidate()
    timeControlStatusObserver = nil
    if let playbackEndObserver {
      NotificationCenter.default.removeObserver(playbackEndObserver)
      self.playbackEndObserver = nil
    }
    player?.pause()
    player?.replaceCurrentItem(with: nil)
    resourceLoader?.cancelAll()
    player = nil
    resourceLoader = nil
    didJustFinish = false
    nowPlayingMetadata = nil
    MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
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
    let isBuffering = player.timeControlStatus == .waitingToPlayAtSpecifiedRate
    let posSec = CMTimeGetSeconds(player.currentTime())
    let durSec = CMTimeGetSeconds(item.duration)
    let positionMs = (posSec.isNaN || posSec.isInfinite) ? 0 : posSec * 1000.0
    let durationMs = (durSec.isNaN || durSec.isInfinite) ? 0 : durSec * 1000.0

    var dict: [String: Any] = [
      "isPlaying": isPlaying,
      "isLoaded": item.status == .readyToPlay,
      "isBuffering": isBuffering,
      "positionMs": positionMs,
      "durationMs": durationMs,
      "didJustFinish": didJustFinish,
    ]

    if let itemError = item.error {
      dict["error"] = itemError.localizedDescription
    }

    return dict
  }

  private func configureRemoteCommands() {
    let commands = MPRemoteCommandCenter.shared()
    commands.skipForwardCommand.isEnabled = false
    commands.skipBackwardCommand.isEnabled = false
    commands.nextTrackCommand.isEnabled = true
    commands.previousTrackCommand.isEnabled = true
    commands.playCommand.isEnabled = true
    commands.pauseCommand.isEnabled = true
    commands.changePlaybackPositionCommand.isEnabled = true

    commands.playCommand.addTarget { [weak self] _ in
      Task { @MainActor [weak self] in self?.resume() }
      return .success
    }
    commands.pauseCommand.addTarget { [weak self] _ in
      Task { @MainActor [weak self] in self?.pause() }
      return .success
    }
    commands.nextTrackCommand.addTarget { [weak self] _ in
      Task { @MainActor [weak self] in self?.onNextTrack?() }
      return .success
    }
    commands.previousTrackCommand.addTarget { [weak self] _ in
      Task { @MainActor [weak self] in self?.onPreviousTrack?() }
      return .success
    }
    commands.changePlaybackPositionCommand.addTarget { [weak self] event in
      guard
        let positionEvent = event as? MPChangePlaybackPositionCommandEvent
      else { return .commandFailed }
      Task { @MainActor [weak self] in
        await self?.seek(to: positionEvent.positionTime * 1000)
      }
      return .success
    }
  }

  private func updateNowPlayingInfo() {
    guard let player, let item = player.currentItem, let metadata = nowPlayingMetadata else {
      return
    }
    let position = CMTimeGetSeconds(player.currentTime())
    let duration = CMTimeGetSeconds(item.duration)
    var info: [String: Any] = [
      MPMediaItemPropertyTitle: metadata.title,
      MPMediaItemPropertyArtist: metadata.artist,
      MPNowPlayingInfoPropertyElapsedPlaybackTime:
        position.isFinite ? max(0, position) : 0,
      MPNowPlayingInfoPropertyPlaybackRate:
        player.timeControlStatus == .playing ? 1.0 : 0.0,
    ]
    if let albumTitle = metadata.albumTitle, !albumTitle.isEmpty {
      info[MPMediaItemPropertyAlbumTitle] = albumTitle
    }
    if duration.isFinite && duration > 0 {
      info[MPMediaItemPropertyPlaybackDuration] = duration
    }
    MPNowPlayingInfoCenter.default().nowPlayingInfo = info
  }
}

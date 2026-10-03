@preconcurrency import AVFoundation
@preconcurrency import MediaPlayer
@preconcurrency import UIKit
import Foundation

public struct OpenfyNowPlayingMetadata: Sendable {
  public let title: String
  public let artist: String
  public let albumTitle: String?
  public let artworkURL: String?
  public let fallbackArtworkURL: String?
  public let durationMs: Double

  public init(values: [String: String]) {
    title = values["title"] ?? "Openfy Music"
    artist = values["artist"] ?? ""
    albumTitle = values["albumTitle"]
    artworkURL = values["artworkUrl"]
    fallbackArtworkURL = values["artworkFallbackUrl"]
    durationMs = Double(values["durationMs"] ?? "") ?? 0
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
  private var nowPlayingArtwork: MPMediaItemArtwork?
  private var artworkTask: Task<Void, Never>?
  private var artworkLoadToken: UUID?
  private var streamDurationSeconds = 0.0
  private var catalogDurationSeconds = 0.0
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
    metadata: OpenfyNowPlayingMetadata,
    prefetchedAudio: Data? = nil
  ) throws {
    // 1. Clean up any existing playback session
    stop()
    didJustFinish = false
    nowPlayingMetadata = metadata
    streamDurationSeconds = descriptor.durationMs / 1000.0
    catalogDurationSeconds = metadata.durationMs / 1000.0

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
      rangeClient: rangeClient,
      prefetchedPrefix: prefetchedAudio
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
        self.finishPlaybackIfNeeded()
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
    loadNowPlayingArtwork(
      from: metadata.artworkURL,
      fallback: metadata.fallbackArtworkURL
    )
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
    streamDurationSeconds = 0
    catalogDurationSeconds = 0
    artworkLoadToken = nil
    artworkTask?.cancel()
    artworkTask = nil
    nowPlayingArtwork = nil
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

    let isBuffering = player.timeControlStatus == .waitingToPlayAtSpecifiedRate
    let posSec = CMTimeGetSeconds(player.currentTime())
    let durationSeconds = resolvedDurationSeconds(for: item)
    let safePositionSeconds = posSec.isFinite ? max(0, posSec) : 0
    let isPlaying = player.timeControlStatus == .playing
    let positionMs = safePositionSeconds * 1000.0
    let durationMs = durationSeconds * 1000.0

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
    let rawPosition = CMTimeGetSeconds(player.currentTime())
    let duration = resolvedDurationSeconds(for: item)
    let position = rawPosition.isFinite
      ? max(0, rawPosition)
      : 0
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
    if let nowPlayingArtwork {
      info[MPMediaItemPropertyArtwork] = nowPlayingArtwork
    }
    MPNowPlayingInfoCenter.default().nowPlayingInfo = info
  }

  private func finishPlaybackIfNeeded() {
    guard !didJustFinish else { return }
    player?.pause()
    didJustFinish = true
    updateNowPlayingInfo()
    onPlaybackEnded?()
  }

  private func resolvedDurationSeconds(for item: AVPlayerItem) -> Double {
    let measured = CMTimeGetSeconds(item.duration)
    return YouTubePlaybackDurationPolicy.resolveSeconds(
      measuredSeconds: measured,
      streamDurationMs: streamDurationSeconds * 1000,
      catalogDurationMs: catalogDurationSeconds * 1000
    )
  }

  private func loadNowPlayingArtwork(from rawURL: String?, fallback rawFallbackURL: String?) {
    artworkTask?.cancel()
    artworkTask = nil
    nowPlayingArtwork = nil
    artworkLoadToken = nil

    let urls = [rawURL, rawFallbackURL].compactMap { rawValue -> URL? in
      guard let rawValue, let url = URL(string: rawValue),
        url.isFileURL || url.scheme?.lowercased() == "https" else {
        return nil
      }
      return url
    }
    guard !urls.isEmpty else {
      updateNowPlayingInfo()
      return
    }

    let token = UUID()
    artworkLoadToken = token
    artworkTask = Task { @MainActor [weak self] in
      for url in urls {
        guard !Task.isCancelled else { return }
        do {
          let data: Data
          if url.isFileURL {
            data = try Data(contentsOf: url, options: .mappedIfSafe)
          } else {
            let (downloaded, response) = try await URLSession.shared.data(from: url)
            guard
              let http = response as? HTTPURLResponse,
              (200...299).contains(http.statusCode),
              downloaded.count <= 15 * 1024 * 1024
            else { continue }
            data = downloaded
          }

          guard
            data.count <= 15 * 1024 * 1024,
            let image = UIImage(data: data),
            let self,
            self.artworkLoadToken == token
          else { continue }

          self.nowPlayingArtwork = MPMediaItemArtwork(
            boundsSize: image.size,
            requestHandler: { _ in image }
          )
          self.updateNowPlayingInfo()
          return
        } catch {
          // Try the catalog URL when a stale or corrupt local cover is selected.
        }
      }
    }
  }
}

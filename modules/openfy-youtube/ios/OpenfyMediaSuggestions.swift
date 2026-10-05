@preconcurrency import Intents
@preconcurrency import UIKit
import Foundation

/// The system chooses when/where these suggestions appear. No private Now Playing UI APIs.
@MainActor
public enum OpenfyMediaSuggestions {
  public nonisolated static let playbackRequested = Notification.Name("OpenfySuggestedMediaPlayback")
  private static let storageKey = "openfySuggestedMediaTracks"
  private static var pending: [String: String]?
  private static var completion: ((Bool) -> Void)?
  private static var timeout: Task<Void, Never>?

  public static func update(_ entries: [[String: String]], played: Bool = false) {
    let entries = Array(entries.prefix(8))
    var stored = UserDefaults.standard.dictionary(forKey: storageKey) as? [String: String] ?? [:]
    var intents: [INPlayMediaIntent] = []
    for entry in entries {
      guard let id = entry["id"], let title = entry["title"], let track = entry["trackJSON"] else { continue }
      stored[id] = track
      let artwork = entry["artworkURL"].flatMap(URL.init(string:)).map { INImage(url: $0) }
      let item = INMediaItem(identifier: id, title: title, type: .song, artwork: artwork)
      let intent = INPlayMediaIntent(mediaItems: nil, mediaContainer: item,
        playShuffled: nil, playbackRepeatMode: .unknown, resumePlayback: nil,
        playbackQueueLocation: .unknown, playbackSpeed: nil, mediaSearch: nil)
      intents.append(intent)
      if played {
        let interaction = INInteraction(intent: intent, response: nil)
        interaction.identifier = "openfy-play-\(id)"
        interaction.groupIdentifier = "openfy-music"
        interaction.donate { error in
          if let error { NSLog("[Openfy] Media donation failed: %@", error.localizedDescription) }
        }
      }
    }
    // Keep a bounded payload registry so an older system suggestion still resolves.
    let activeIds = Set(entries.compactMap { $0["id"] })
    for id in stored.keys.sorted() where stored.count > 32 && !activeIds.contains(id) { stored.removeValue(forKey: id) }
    UserDefaults.standard.set(stored, forKey: storageKey)
    if !played {
      INUpcomingMediaManager.shared.setPredictionMode(.default, for: .song)
      INUpcomingMediaManager.shared.setSuggestedMediaIntents(intents)
    }
  }

  @discardableResult
  public static func requestPlayback(_ id: String, completion callback: ((Bool) -> Void)? = nil) -> Bool {
    guard let stored = UserDefaults.standard.dictionary(forKey: storageKey) as? [String: String],
      let track = stored[id] else { return false }
    completion?(false)
    timeout?.cancel()
    let requestId = UUID().uuidString
    pending = ["requestId": requestId, "trackJSON": track]
    completion = callback
    timeout = Task { @MainActor in
      try? await Task.sleep(for: .seconds(20))
      guard !Task.isCancelled, pending?["requestId"] == requestId else { return }
      acknowledge(requestId, success: false)
    }
    NotificationCenter.default.post(name: playbackRequested, object: nil)
    return true
  }

  public static func getPending() -> [String: String]? { pending }

  public static func acknowledge(_ requestId: String, success: Bool) {
    guard pending?["requestId"] == requestId else { return }
    pending = nil
    timeout?.cancel()
    timeout = nil
    let callback = completion
    completion = nil
    callback?(success)
  }
}

public final class OpenfyMediaIntentHandler: NSObject, INPlayMediaIntentHandling {
  public func handle(intent: INPlayMediaIntent, completion: @escaping (INPlayMediaIntentResponse) -> Void) {
    Task { @MainActor in
      guard let id = intent.mediaContainer?.identifier ?? intent.mediaItems?.first?.identifier,
        OpenfyMediaSuggestions.requestPlayback(id, completion: { success in
          completion(INPlayMediaIntentResponse(code: success ? .success : .failure, userActivity: nil))
        }) else {
        completion(INPlayMediaIntentResponse(code: .failure, userActivity: nil))
        return
      }
    }
  }
}

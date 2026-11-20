import Foundation

/// Share a server-issued guest identity across tracks instead of fetching sw.js_data before every play.
actor YouTubeGuestSession {
  private var visitor: String?
  private var expiresAt = Date.distantPast
  private var refreshing: Task<String?, Error>?

  func get() -> String? { expiresAt > Date() ? visitor : nil }

  func store(_ value: String?) {
    guard let value, !value.isEmpty else { return }
    visitor = value
    expiresAt = Date().addingTimeInterval(60 * 60)
  }

  func refresh(_ load: @escaping @Sendable () async throws -> String?) async throws -> String? {
    if let refreshing { return try await refreshing.value }
    let task = Task { try await load() }
    refreshing = task
    defer { refreshing = nil }
    let value = try await task.value
    store(value)
    return value
  }
}

/// A small LRU of verified range responses, not complete songs. Useful for repeated MP4 header/tail reads.
actor YouTubePlaybackRangeCache {
  private struct Entry {
    let data: Data
    let expiresAt: Date
    var access: Int
  }
  private var entries: [String: Entry] = [:]
  private var clock = 0
  private let byteLimit: Int
  init(byteLimit: Int = 8 * 1024 * 1024) { self.byteLimit = max(0, byteLimit) }

  func get(_ key: String) -> Data? {
    guard var entry = entries[key], entry.expiresAt > Date() else {
      entries.removeValue(forKey: key)
      return nil
    }
    clock += 1
    entry.access = clock
    entries[key] = entry
    return entry.data
  }

  func store(_ data: Data, for key: String) {
    guard !data.isEmpty, data.count <= min(byteLimit, 128 * 1024) else { return }
    entries = entries.filter { $0.value.expiresAt > Date() }
    clock += 1
    entries[key] = Entry(data: data, expiresAt: Date().addingTimeInterval(4 * 60), access: clock)
    while entries.count > 64 || entries.values.reduce(0, { $0 + $1.data.count }) > byteLimit {
      guard let oldest = entries.min(by: { $0.value.access < $1.value.access }) else { break }
      entries.removeValue(forKey: oldest.key)
    }
  }
}

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

/// File-backed, **temporary** buffer for the active streaming track. Unlike a
/// permanent download, it is never added to the user's offline music library.
/// Every byte interval is made visible only after a verified HTTP 206 response.
/// Sparse writes allow AVPlayer's out-of-order header/tail reads and seeking.
actor YouTubeTemporaryPlaybackBuffer {
  private let maxTrackBytes: Int64 = 128 * 1024 * 1024
  private var activeKey: String?
  private var activeSession: UUID?
  private var totalBytes: Int64 = 0
  private var fileURL: URL?
  private var file: FileHandle?
  private var ranges: [Range<Int64>] = []
  private var prefetchTask: Task<Void, Never>?
  private var generation: UInt64 = 0

  private func merge(_ added: Range<Int64>) {
    var merged: [Range<Int64>] = []
    for range in (ranges + [added]).sorted(by: { $0.lowerBound < $1.lowerBound }) {
      if let last = merged.last, range.lowerBound <= last.upperBound {
        merged[merged.count - 1] = last.lowerBound..<max(last.upperBound, range.upperBound)
      } else {
        merged.append(range)
      }
    }
    ranges = merged
  }

  private func contains(_ requested: Range<Int64>) -> Bool {
    ranges.contains { $0.lowerBound <= requested.lowerBound && $0.upperBound >= requested.upperBound }
  }

  func prepare(key: String, session: UUID, length: Int64, prefetched: Data? = nil) {
    reset()
    guard length > 0, length <= maxTrackBytes else {
      NSLog("[TEMP-BUFFER] Disabled: media exceeds temporary cache limit")
      return
    }
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent("openfy-active-stream", isDirectory: true)
    do {
      try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
      // A previous process may have crashed before it could clean its scratch file.
      if let contents = try? FileManager.default.contentsOfDirectory(at: directory,
          includingPropertiesForKeys: [.contentModificationDateKey]) {
        for url in contents {
          let modified = try? url.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate
          if modified == nil || Date().timeIntervalSince(modified!) > 6 * 60 * 60 {
            try? FileManager.default.removeItem(at: url)
          }
        }
      }
      let url = directory.appendingPathComponent(UUID().uuidString).appendingPathExtension("cache")
      guard FileManager.default.createFile(atPath: url.path, contents: nil) else { return }
      #if os(iOS)
      try? FileManager.default.setAttributes([.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication],
                                             ofItemAtPath: url.path)
      #endif
      file = try FileHandle(forUpdating: url)
      fileURL = url
      activeKey = key
      activeSession = session
      totalBytes = length
      if let prefetched, !prefetched.isEmpty { store(key: key, offset: 0, data: prefetched) }
      NSLog("[TEMP-BUFFER] Prepared scratch buffer (%lld bytes)", length)
    } catch {
      NSLog("[TEMP-BUFFER] Could not prepare scratch file: %@", error.localizedDescription)
      reset()
    }
  }

  func read(key: String, from start: Int64, through end: Int64) -> Data? {
    guard key == activeKey, start >= 0, end >= start, end < totalBytes,
          end < Int64.max, let file, contains(start..<(end + 1)) else { return nil }
    do {
      try file.seek(toOffset: UInt64(start))
      let expected = Int(end - start + 1)
      guard let bytes = try file.read(upToCount: expected), bytes.count == expected else { return nil }
      return bytes
    } catch { return nil }
  }

  func store(key: String, offset: Int64, data: Data) {
    guard key == activeKey, let file, !data.isEmpty, offset >= 0,
          offset <= totalBytes, Int64(data.count) <= totalBytes - offset else { return }
    do {
      try file.seek(toOffset: UInt64(offset))
      try file.write(contentsOf: data)
      merge(offset..<(offset + Int64(data.count)))
    } catch {
      NSLog("[TEMP-BUFFER] Disk cache write failed: %@", error.localizedDescription)
    }
  }

  func coveredBytes(key: String) -> Int64 {
    guard key == activeKey else { return 0 }
    return ranges.reduce(0) { $0 + $1.upperBound - $1.lowerBound }
  }

  func startPrefetch(
    key: String,
    session: UUID,
    fetch: @escaping @Sendable (Int64, Int64) async throws -> Data,
    progress: @escaping @Sendable (String, Int64, Int64) -> Void
  ) {
    guard key == activeKey, session == activeSession, prefetchTask == nil, totalBytes > 0,
          !contains(0..<totalBytes) else { return }
    let expectedLength = totalBytes
    let activeGeneration = generation
    let prefetchChunk: Int64 = 512 * 1024
    prefetchTask = Task(priority: .utility) { [weak self] in
      guard let self else { return }
      progress("started", await self.coveredBytes(key: key), expectedLength)
      var offset: Int64 = 0
      while offset < expectedLength && !Task.isCancelled {
        guard await self.generation == activeGeneration else { return }
        let end = min(offset + prefetchChunk - 1, expectedLength - 1)
        if !(await self.contains(offset..<(end + 1))) {
          do {
            // The shared range client validates 206/Content-Range and writes
            // verified bytes to this same buffer before returning.
            _ = try await YouTubeRequestRetry.withConnectivityGrace(seconds: 45) {
              try await fetch(offset, end)
            }
          } catch {
            if !Task.isCancelled {
              progress("interrupted", await self.coveredBytes(key: key), expectedLength)
              NSLog("[TEMP-BUFFER] Prefetch interrupted: %@", error.localizedDescription)
            }
            await self.finishPrefetch(generation: activeGeneration)
            return
          }
        }
        offset = end + 1
        progress("progress", await self.coveredBytes(key: key), expectedLength)
      }
      let isCurrentSession = await self.generation == activeGeneration
      if !Task.isCancelled && isCurrentSession {
        progress("complete", await self.coveredBytes(key: key), expectedLength)
      }
      await self.finishPrefetch(generation: activeGeneration)
    }
  }

  private func finishPrefetch(generation expected: UInt64) {
    if generation == expected { prefetchTask = nil }
  }

  func end(session: UUID) {
    if session == activeSession { reset() }
  }

  func reset() {
    generation &+= 1
    prefetchTask?.cancel()
    prefetchTask = nil
    try? file?.close()
    file = nil
    if let fileURL { try? FileManager.default.removeItem(at: fileURL) }
    fileURL = nil
    activeKey = nil
    activeSession = nil
    totalBytes = 0
    ranges = []
  }
}

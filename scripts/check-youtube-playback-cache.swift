import Foundation

actor RefreshProbe {
  var count = 0
  func load() async throws -> String? {
    count += 1
    try await Task.sleep(nanoseconds: 20_000_000)
    return "server-issued-visitor"
  }
}

@main
struct CheckYouTubePlaybackCache {
  static func main() async throws {
    let guest = YouTubeGuestSession()
    let empty = await guest.get()
    precondition(empty == nil)
    await guest.store("initial-server-visitor")
    await guest.store("")
    let initial = await guest.get()
    precondition(initial == "initial-server-visitor")
    let probe = RefreshProbe()
    async let first = guest.refresh { try await probe.load() }
    async let second = guest.refresh { try await probe.load() }
    let visitors = try await (first, second)
    let loads = await probe.count
    precondition(visitors.0 == visitors.1 && loads == 1)
    let cachedVisitor = await guest.get()
    precondition(cachedVisitor == "server-issued-visitor")

    let ranges = YouTubePlaybackRangeCache(byteLimit: 6)
    await ranges.store(Data([1, 2, 3]), for: "header")
    await ranges.store(Data([4, 5, 6]), for: "tail")
    let header = await ranges.get("header")
    precondition(header == Data([1, 2, 3]))
    await ranges.store(Data([7, 8, 9]), for: "next")
    let evicted = await ranges.get("tail")
    let retained = await ranges.get("header")
    precondition(evicted == nil && retained == header)
    await ranges.store(Data(repeating: 0, count: 7), for: "oversized")
    let oversized = await ranges.get("oversized")
    precondition(oversized == nil)
    let defaultRanges = YouTubePlaybackRangeCache()
    await defaultRanges.store(Data(repeating: 0, count: 128 * 1024 + 1), for: "whole-file")
    let wholeFile = await defaultRanges.get("whole-file")
    precondition(wholeFile == nil)

    // The active music track must be readable in flight without any network,
    // including sparse seek ranges and intervals spanning multiple writes.
    let temporary = YouTubeTemporaryPlaybackBuffer()
    let session = UUID()
    let head = Data(repeating: 11, count: 128)
    await temporary.prepare(key: "track-A", session: session, length: 1024, prefetched: head)
    let cachedHead = await temporary.read(key: "track-A", from: 0, through: 127)
    precondition(cachedHead == head)
    let missingByte = await temporary.read(key: "track-A", from: 0, through: 128)
    precondition(missingByte == nil)
    await temporary.store(key: "track-A", offset: 512, data: Data(repeating: 22, count: 256))
    let cachedTail = await temporary.read(key: "track-A", from: 512, through: 767)
    precondition(cachedTail == Data(repeating: 22, count: 256))
    let missingMiddle = await temporary.read(key: "track-A", from: 127, through: 513)
    precondition(missingMiddle == nil)
    await temporary.store(key: "track-A", offset: 128, data: Data(repeating: 33, count: 384))
    let merged = await temporary.read(key: "track-A", from: 0, through: 767)
    precondition(merged?.count == 768 && merged?.first == 11 && merged?[128] == 33 && merged?[512] == 22)
    let verified = await temporary.coveredBytes(key: "track-A")
    precondition(verified == 768)

    // A stopped or replaced player cannot retain the old scratch buffer.
    let replacement = UUID()
    await temporary.prepare(key: "track-A", session: replacement, length: 1024)
    await temporary.end(session: session)
    let replacedCount = await temporary.coveredBytes(key: "track-A")
    precondition(replacedCount == 0)
    await temporary.store(key: "track-A", offset: 0, data: Data(repeating: 44, count: 1024))
    let replacedFullCount = await temporary.coveredBytes(key: "track-A")
    precondition(replacedFullCount == 1024)
    let replacedData = await temporary.read(key: "track-A", from: 512, through: 767)
    precondition(replacedData == Data(repeating: 44, count: 256))
    await temporary.end(session: replacement)
    let discarded = await temporary.read(key: "track-A", from: 0, through: 127)
    precondition(discarded == nil)

    // Large files must not allocate unlimited scratch disk space.
    await temporary.prepare(key: "oversized", session: UUID(), length: 129 * 1024 * 1024)
    await temporary.store(key: "oversized", offset: 0, data: Data([1]))
    let oversizedCount = await temporary.coveredBytes(key: "oversized")
    precondition(oversizedCount == 0)

    let backgroundSession = UUID()
    await temporary.prepare(key: "background", session: backgroundSession, length: 1024)
    await temporary.startPrefetch(key: "background", session: backgroundSession,
      fetch: { start, end in
        let bytes = Data(repeating: 55, count: Int(end - start + 1))
        await temporary.store(key: "background", offset: start, data: bytes)
        return bytes
      }, progress: { _, _, _ in })
    for _ in 0..<100 {
      if await temporary.coveredBytes(key: "background") == 1024 { break }
      try await Task.sleep(nanoseconds: 5_000_000)
    }
    let prefetchedCount = await temporary.coveredBytes(key: "background")
    precondition(prefetchedCount == 1024)
    let prefetchedData = await temporary.read(key: "background", from: 0, through: 1023)
    precondition(prefetchedData == Data(repeating: 55, count: 1024))
    await temporary.end(session: backgroundSession)
    print("Native playback cache checks passed: visitor reuse, bounded range LRU, sparse temporary cache, offline reads, session cleanup, prefetch")
  }
}

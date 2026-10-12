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
    print("Native playback cache checks passed: visitor reuse, coalesced refresh, bounded range LRU")
  }
}

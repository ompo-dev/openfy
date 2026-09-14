@preconcurrency import AVFoundation
import Foundation

// Compile together with the production normalizer on macOS, without Expo or Xcode UI.
@main struct CheckLocalAudio {
  static func main() async throws {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: directory) }
    let source = URL(fileURLWithPath: CommandLine.arguments[1])
    let local = directory.appendingPathComponent("test.m4a")
    try FileManager.default.copyItem(at: source, to: local)

    let original = AVURLAsset(url: local)
    let duration = try await original.load(.duration)
    let track = try await original.loadTracks(withMediaType: .audio)[0]
    let packets = try LocalAudioNormalizer.readPackets(asset: original, track: track)
    print("Before: container=\(duration.seconds), packetStart=\(packets.start.seconds), packetEnd=\(packets.end.seconds), encodedBytes=\(packets.bytes)")
    let result = try await LocalAudioNormalizer.repair(url: local)
    guard result.repaired, let ms = result.durationMs, abs(ms - 2500) < 100 else {
      fatalError("Repair did not preserve the synthetic tone's duration: \(result)")
    }
    guard try !MP4Container.isFragmented(at: local) else { fatalError("Output is still fragmented") }
    let output = AVURLAsset(url: local)
    let outputTrack = try await output.loadTracks(withMediaType: .audio)[0]
    let actual = try LocalAudioNormalizer.readPackets(asset: output, track: outputTrack)
    guard actual.bytes == packets.bytes, actual.digest == packets.digest else {
      fatalError("Compressed audio changed, including the quiet ending")
    }
    let second = try await LocalAudioNormalizer.repair(url: local)
    guard !second.repaired else { fatalError("Repair must be idempotent") }
    print("PASS: \(duration.seconds)s -> \(ms / 1000)s, identical compressed audio, flat M4A, repeat is a no-op")
  }
}

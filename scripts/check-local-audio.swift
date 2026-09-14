@preconcurrency import AVFoundation
import Foundation

// Compile together with the production normalizer on macOS, without Expo or Xcode UI.
@main struct CheckLocalAudio {
  static func log(_ message: String) {
    FileHandle.standardError.write(Data((message + "\n").utf8))
  }

  static func inspect(_ asset: AVAsset, track: AVAssetTrack) throws {
    let reader = try AVAssetReader(asset: asset)
    let output = AVAssetReaderTrackOutput(track: track, outputSettings: nil)
    reader.add(output)
    reader.startReading()
    var index = 0
    while let sample = output.copyNextSampleBuffer() {
      let time = CMSampleBufferGetPresentationTimeStamp(sample)
      let duration = CMSampleBufferGetDuration(sample)
      if index < 3 || !duration.isNumeric || duration <= .zero {
        let bytes = CMSampleBufferGetDataBuffer(sample).map(CMBlockBufferGetDataLength) ?? 0
        log("Packet \(index): pts=\(time), duration=\(duration), samples=\(CMSampleBufferGetNumSamples(sample)), bytes=\(bytes)")
      }
      index += 1
    }
    log("Read \(index) buffers, status=\(reader.status.rawValue)")
  }

  static func main() async throws {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: directory) }
    let source = URL(fileURLWithPath: CommandLine.arguments[1])
    let local = directory.appendingPathComponent("test.m4a")
    try FileManager.default.copyItem(at: source, to: local)

    let original = AVURLAsset(url: local)
    let duration = try await original.load(.duration)
    let demuxingCopy = directory.appendingPathComponent("demux.m4a")
    try MP4Container.makeDemuxingCopy(from: local, to: demuxingCopy)
    let prepared = AVURLAsset(url: demuxingCopy)
    let track = try await prepared.loadTracks(withMediaType: .audio)[0]
    log("Containers: original=\(duration.seconds), prepared=\(try await prepared.load(.duration).seconds)")
    try inspect(prepared, track: track)
    let packets = try LocalAudioNormalizer.readPackets(asset: prepared, track: track)
    log("Before: container=\(duration.seconds), packetStart=\(packets.start.seconds), packetEnd=\(packets.end.seconds), encodedBytes=\(packets.bytes)")
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

    let broken = directory.appendingPathComponent("truncated.m4a")
    let truncated = Data(try Data(contentsOf: source).dropLast(200))
    try truncated.write(to: broken)
    do {
      _ = try await LocalAudioNormalizer.repair(url: broken)
      fatalError("A truncated container must be rejected")
    } catch {
      guard try Data(contentsOf: broken) == truncated else { fatalError("Failed repair changed original") }
    }
    print("PASS: damaged input rejected without modifying the original")
  }
}

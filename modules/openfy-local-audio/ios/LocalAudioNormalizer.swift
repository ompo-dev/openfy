@preconcurrency import AVFoundation
import CryptoKit
import Foundation

struct LocalAudioRepairResult: Sendable {
  let uri: String
  let repaired: Bool
  var durationMs: Double? = nil
  var originalDurationMs: Double? = nil
}

actor LocalAudioRepairCoordinator {
  private var inFlight: [URL: Task<LocalAudioRepairResult, Error>] = [:]

  func repair(uri: String) async throws -> LocalAudioRepairResult {
    let url = try LocalAudioNormalizer.fileURL(uri)
    if let task = inFlight[url] { return try await task.value }
    let task = Task { try await LocalAudioNormalizer.repair(url: url) }
    inFlight[url] = task
    defer { inFlight[url] = nil }
    return try await task.value
  }
}

enum LocalAudioNormalizer {
  struct PacketSummary {
    let start: CMTime
    let end: CMTime
    let bytes: Int
    let digest: SHA256.Digest
  }

  struct FileIdentity: Equatable {
    let size: Int
    let modified: Date

    init(_ url: URL) throws {
      let values = try url.resourceValues(forKeys: [
        .isRegularFileKey, .fileSizeKey, .contentModificationDateKey,
      ])
      guard values.isRegularFile == true, let size = values.fileSize, size > 0,
        let modified = values.contentModificationDate else {
        throw LocalAudioRepairError.invalidFile
      }
      self.size = size
      self.modified = modified
    }
  }

  static func fileURL(_ uri: String) throws -> URL {
    guard let url = URL(string: uri), url.isFileURL,
      url.host == nil || url.host == "" || url.host == "localhost",
      url.query == nil, url.fragment == nil else { throw LocalAudioRepairError.invalidFile }
    return url.standardizedFileURL.resolvingSymlinksInPath()
  }

  static func repair(url: URL) async throws -> LocalAudioRepairResult {
    let identity = try FileIdentity(url)
    guard try MP4Container.isFragmented(at: url) else {
      return LocalAudioRepairResult(uri: url.absoluteString, repaired: false)
    }

    let original = AVURLAsset(url: url, options: [AVURLAssetPreferPreciseDurationAndTimingKey: true])
    let originalDuration = try await original.load(.duration)
    let demuxingCopy = url.deletingLastPathComponent()
      .appendingPathComponent(".openfy-demux-\(UUID().uuidString).m4a")
    defer { try? FileManager.default.removeItem(at: demuxingCopy) }
    try MP4Container.makeDemuxingCopy(from: url, to: demuxingCopy)
    let asset = AVURLAsset(url: demuxingCopy, options: [AVURLAssetPreferPreciseDurationAndTimingKey: true])
    let tracks = try await asset.load(.tracks)
    guard tracks.count == 1, tracks[0].mediaType == .audio else {
      throw LocalAudioRepairError.unsupportedAudio
    }
    let track = tracks[0]
    let formats = try await track.load(.formatDescriptions)
    guard !formats.isEmpty, formats.allSatisfy({
      CMFormatDescriptionGetMediaSubType($0) == kAudioFormatMPEG4AAC
    }) else { throw LocalAudioRepairError.unsupportedAudio }

    let packets = try readPackets(asset: asset, track: track)
    let temporary = url.deletingLastPathComponent()
      .appendingPathComponent(".openfy-remux-\(UUID().uuidString).m4a")
    defer { try? FileManager.default.removeItem(at: temporary) }
    // An export of the original asset can carry over its inflated DASH timeline.
    // A fresh writer builds sample tables only from the actual compressed audio.
    try await writePackets(asset: asset, track: track, format: formats[0], packets: packets, to: temporary)

    guard try !MP4Container.isFragmented(at: temporary) else {
      throw LocalAudioRepairError.validationFailed
    }
    let output = AVURLAsset(url: temporary, options: [AVURLAssetPreferPreciseDurationAndTimingKey: true])
    let outputTracks = try await output.load(.tracks)
    guard outputTracks.count == 1, outputTracks[0].mediaType == .audio else {
      throw LocalAudioRepairError.validationFailed
    }
    let outputDuration = try await output.load(.duration)
    let outputPackets = try readPackets(asset: output, track: outputTracks[0])
    // A passthrough must retain every encoded byte, including the quiet ending.
    // Refuse a truncated or re-encoded export and leave the original untouched.
    guard outputPackets.bytes == packets.bytes, outputPackets.digest == packets.digest,
      outputDuration.isNumeric,
      abs(outputDuration.seconds - packets.end.seconds) <= 0.1,
      abs(outputPackets.end.seconds - packets.end.seconds) <= 0.1 else {
      throw LocalAudioRepairError.validationFailed
    }
    guard try FileIdentity(url) == identity else { throw LocalAudioRepairError.sourceChanged }

    // Both files are on the same volume; replacement happens only after validation.
    _ = try FileManager.default.replaceItemAt(url, withItemAt: temporary)
    return LocalAudioRepairResult(
      uri: url.absoluteString,
      repaired: true,
      durationMs: outputDuration.seconds * 1000,
      originalDurationMs: originalDuration.isNumeric ? originalDuration.seconds * 1000 : nil
    )
  }

  static func readPackets(asset: AVAsset, track: AVAssetTrack) throws -> PacketSummary {
    let reader = try AVAssetReader(asset: asset)
    let output = AVAssetReaderTrackOutput(track: track, outputSettings: nil)
    output.alwaysCopiesSampleData = false
    guard reader.canAdd(output) else { throw LocalAudioRepairError.readerFailed }
    reader.add(output)
    guard reader.startReading() else { throw reader.error ?? LocalAudioRepairError.readerFailed }
    defer { if reader.status == .reading { reader.cancelReading() } }

    var end = CMTime.zero
    var start: CMTime?
    var previousEnd: CMTime?
    var byteCount = 0
    var digest = SHA256()
    while let sample = output.copyNextSampleBuffer() {
      try autoreleasepool {
        let pts = CMSampleBufferGetPresentationTimeStamp(sample)
        let duration = CMSampleBufferGetDuration(sample)
        guard pts.isNumeric, duration.isNumeric, duration > .zero,
          let block = CMSampleBufferGetDataBuffer(sample) else {
          throw LocalAudioRepairError.invalidTiming
        }
        // Restrict repair to the continuous audio timeline observed in the
        // reproduction. Never collapse gaps, retime audio, or infer a 2:1 ratio.
        if let previousEnd {
          guard abs(CMTimeSubtract(pts, previousEnd).seconds) <= 0.1 else {
            throw LocalAudioRepairError.invalidTiming
          }
        } else if abs(pts.seconds) > 0.1 {
          throw LocalAudioRepairError.invalidTiming
        }
        if start == nil { start = pts }
        previousEnd = CMTimeAdd(pts, duration)
        end = CMTimeMaximum(end, previousEnd!)
        let count = CMBlockBufferGetDataLength(block)
        guard count > 0 else { throw LocalAudioRepairError.readerFailed }
        var bytes = Data(count: count)
        let status = bytes.withUnsafeMutableBytes { buffer in
          CMBlockBufferCopyDataBytes(block, atOffset: 0, dataLength: count, destination: buffer.baseAddress!)
        }
        guard status == kCMBlockBufferNoErr else { throw LocalAudioRepairError.readerFailed }
        digest.update(data: bytes)
        byteCount += count
      }
    }
    guard reader.status == .completed, end > .zero, byteCount > 0 else {
      throw reader.error ?? LocalAudioRepairError.readerFailed
    }
    return PacketSummary(start: start!, end: end, bytes: byteCount, digest: digest.finalize())
  }

  private static func writePackets(
    asset: AVAsset, track: AVAssetTrack, format: CMFormatDescription,
    packets: PacketSummary, to url: URL
  ) async throws {
    let reader = try AVAssetReader(asset: asset)
    let output = AVAssetReaderTrackOutput(track: track, outputSettings: nil)
    output.alwaysCopiesSampleData = false
    guard reader.canAdd(output) else { throw LocalAudioRepairError.readerFailed }
    reader.add(output)

    let writer = try AVAssetWriter(outputURL: url, fileType: .m4a)
    let input = AVAssetWriterInput(mediaType: .audio, outputSettings: nil, sourceFormatHint: format)
    input.expectsMediaDataInRealTime = false
    guard writer.canAdd(input) else { throw LocalAudioRepairError.exportUnavailable }
    writer.add(input)
    writer.shouldOptimizeForNetworkUse = true
    guard writer.startWriting() else { throw writer.error ?? LocalAudioRepairError.exportFailed }
    guard reader.startReading() else {
      writer.cancelWriting()
      throw reader.error ?? LocalAudioRepairError.readerFailed
    }
    // Starting with the first packet preserves negative AAC priming timestamps.
    writer.startSession(atSourceTime: packets.start)
    let queue = DispatchQueue(label: "openfy.audio.remux")
    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
      var finished = false
      input.requestMediaDataWhenReady(on: queue) {
        guard !finished else { return }
        while input.isReadyForMoreMediaData {
          if let sample = output.copyNextSampleBuffer() {
            if input.append(sample) { continue }
            finished = true
            reader.cancelReading()
            writer.cancelWriting()
            continuation.resume(throwing: writer.error ?? LocalAudioRepairError.exportFailed)
            return
          }
          finished = true
          guard reader.status == .completed else {
            writer.cancelWriting()
            continuation.resume(throwing: reader.error ?? LocalAudioRepairError.readerFailed)
            return
          }
          writer.endSession(atSourceTime: packets.end)
          input.markAsFinished()
          writer.finishWriting {
            if writer.status == .completed {
              continuation.resume()
            } else {
              continuation.resume(throwing: writer.error ?? LocalAudioRepairError.exportFailed)
            }
          }
          return
        }
      }
    }
  }
}

@preconcurrency import AVFoundation
import Foundation

enum MixAudioRenderer {
  static func render(clips: [[String: Any]], outputURI: String) async throws -> [String: Any] {
    let output = try LocalAudioNormalizer.fileURL(outputURI)
    let cache = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("openfy-mixes", isDirectory: true).standardizedFileURL.resolvingSymlinksInPath()
    guard output.deletingLastPathComponent() == cache, !clips.isEmpty, clips.count <= 200,
      !FileManager.default.fileExists(atPath: output.path) else { throw failure("Destino do mix inválido.") }
    let composition = AVMutableComposition()
    let audioMix = AVMutableAudioMix()
    var tracksByVolume: [String: AVMutableCompositionTrack] = [:]
    var parameters: [AVMutableAudioMixInputParameters] = []
    var cursors: [Int: CMTime] = [:]
    let laneCount = Float(Set(clips.map { ($0["lane"] as? NSNumber)?.intValue ?? 0 }).count)
    // Constant-gain lanes avoid AVFoundation interpolating gains across adjacent edits.
    for clip in clips {
      guard let uri = clip["uri"] as? String, let startMs = clip["startMs"] as? Double,
        let endMs = clip["endMs"] as? Double, let volume = clip["volume"] as? Double,
        startMs.isFinite, endMs.isFinite, volume.isFinite, startMs >= 0,
        endMs - startMs >= 100, volume >= 0, volume <= 1 else { throw failure("Trecho inválido.") }
      let url = try LocalAudioNormalizer.fileURL(uri)
      let lane = (clip["lane"] as? NSNumber)?.intValue ?? 0
      guard (0..<8).contains(lane) else { throw failure("Faixa inválida.") }
      let key = "\(lane):\(volume)"
      let _ = try LocalAudioNormalizer.FileIdentity(url)
      let destination: AVMutableCompositionTrack
      if let existing = tracksByVolume[key] {
        destination = existing
      } else {
        guard let created = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid) else {
          throw failure("Não foi possível preparar a faixa do mix.")
        }
        destination = created
        tracksByVolume[key] = created
        let gain = AVMutableAudioMixInputParameters(track: created)
        gain.setVolume(Float(volume) / laneCount, at: .zero)
        parameters.append(gain)
      }
      let asset = AVURLAsset(url: url)
      let duration = try await asset.load(.duration)
      guard let source = try await asset.loadTracks(withMediaType: .audio).first,
        duration.seconds.isFinite, endMs <= duration.seconds * 1000 + 1000 else { throw failure("Áudio local inválido.") }
      let start = CMTime(seconds: startMs / 1000, preferredTimescale: 48000)
      let end = CMTimeMinimum(CMTime(seconds: endMs / 1000, preferredTimescale: 48000), duration)
      let range = CMTimeRange(start: start, end: end)
      guard range.duration.seconds >= 0.1 else { throw failure("Trecho fora do áudio.") }
      let cursor = cursors[lane] ?? .zero
      try destination.insertTimeRange(range, of: source, at: cursor)
      cursors[lane] = CMTimeAdd(cursor, range.duration)
    }
    let cursor = cursors.values.reduce(CMTime.zero) { CMTimeMaximum($0, $1) }
    audioMix.inputParameters = parameters
    guard let exporter = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetAppleM4A) else {
      throw failure("Não foi possível preparar o áudio.")
    }
    exporter.outputURL = output
    exporter.outputFileType = .m4a
    exporter.audioMix = audioMix
    exporter.timeRange = CMTimeRange(start: .zero, duration: cursor)
    await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
      exporter.exportAsynchronously { continuation.resume() }
    }
    guard exporter.status == .completed else {
      try? FileManager.default.removeItem(at: output)
      throw exporter.error ?? failure("Não foi possível compor o mix.")
    }
    #if os(iOS) || os(tvOS)
    try FileManager.default.setAttributes([.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication], ofItemAtPath: output.path)
    #endif
    return ["uri": output.absoluteString, "durationMs": cursor.seconds * 1000]
  }

  static func waveform(uri: String, bins: Int) throws -> [Float] {
    let url = try LocalAudioNormalizer.fileURL(uri)
    let _ = try LocalAudioNormalizer.FileIdentity(url)
    let file = try AVAudioFile(forReading: url, commonFormat: .pcmFormatFloat32, interleaved: false)
    let count = min(2048, max(32, bins))
    let length = file.length
    guard length > 0, let buffer = AVAudioPCMBuffer(pcmFormat: file.processingFormat, frameCapacity: 8192) else {
      throw failure("Áudio sem amostras.")
    }
    var peaks = Array(repeating: Float(0), count: count)
    var offset: AVAudioFramePosition = 0
    while offset < length {
      try file.read(into: buffer, frameCount: AVAudioFrameCount(min(8192, length - offset)))
      guard buffer.frameLength > 0, let samples = buffer.floatChannelData else { break }
      for frame in 0..<Int(buffer.frameLength) {
        let bin = min(count - 1, Int((offset + Int64(frame)) * Int64(count) / length))
        for channel in 0..<Int(buffer.format.channelCount) {
          peaks[bin] = max(peaks[bin], min(1, abs(samples[channel][frame])))
        }
      }
      offset += Int64(buffer.frameLength)
    }
    return peaks
  }

  private static func failure(_ message: String) -> NSError {
    NSError(domain: "OpenfyMix", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
  }
}

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
    guard let destination = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid) else {
      throw failure("Não foi possível preparar a faixa do mix.")
    }
    let gain = AVMutableAudioMixInputParameters(track: destination)
    var cursor = CMTime.zero
    // A sequential composition uses one decoder track, with gain changes at each cut.
    for clip in clips {
      guard let uri = clip["uri"] as? String, let startMs = clip["startMs"] as? Double,
        let endMs = clip["endMs"] as? Double, let volume = clip["volume"] as? Double,
        startMs.isFinite, endMs.isFinite, volume.isFinite, startMs >= 0,
        endMs - startMs >= 100, volume >= 0, volume <= 1 else { throw failure("Trecho inválido.") }
      let url = try LocalAudioNormalizer.fileURL(uri)
      let _ = try LocalAudioNormalizer.FileIdentity(url)
      let asset = AVURLAsset(url: url)
      let duration = try await asset.load(.duration)
      guard let source = try await asset.loadTracks(withMediaType: .audio).first,
        duration.seconds.isFinite, endMs <= duration.seconds * 1000 + 1000 else { throw failure("Áudio local inválido.") }
      let start = CMTime(seconds: startMs / 1000, preferredTimescale: 48000)
      let end = CMTimeMinimum(CMTime(seconds: endMs / 1000, preferredTimescale: 48000), duration)
      let range = CMTimeRange(start: start, end: end)
      guard range.duration.seconds >= 0.1 else { throw failure("Trecho fora do áudio.") }
      try destination.insertTimeRange(range, of: source, at: cursor)
      gain.setVolume(Float(volume), at: cursor)
      cursor = CMTimeAdd(cursor, range.duration)
    }
    audioMix.inputParameters = [gain]
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

  private static func failure(_ message: String) -> NSError {
    NSError(domain: "OpenfyMix", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
  }
}

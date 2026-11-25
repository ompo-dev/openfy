@preconcurrency import AVFoundation
import Foundation

@main
struct CheckMixAudio {
  static func check(_ condition: Bool, _ message: String) throws {
    if !condition { throw NSError(domain: "MixAudioCheck", code: 1, userInfo: [NSLocalizedDescriptionKey: message]) }
  }

  static func writeTone(_ url: URL, frequency: Double) throws {
    let format = AVAudioFormat(standardFormatWithSampleRate: 44100, channels: 1)!
    let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 44100 * 3)!
    buffer.frameLength = buffer.frameCapacity
    let samples = buffer.floatChannelData![0]
    for index in 0..<Int(buffer.frameLength) {
      let seconds = Double(index) / 44100
      // Only the requested source range has the expected frequency.
      let hz = seconds >= 1 && seconds < 2 ? frequency : frequency / 2
      samples[index] = Float(sin(seconds * hz * 2 * .pi) * 0.4)
    }
    let file = try AVAudioFile(forWriting: url, settings: format.settings)
    try file.write(from: buffer)
  }

  static func measure(_ samples: UnsafePointer<Float>, offset: Int, count: Int, rate: Double) -> (rms: Double, hz: Double) {
    var sum = 0.0
    var crossings = 0
    for index in offset..<(offset + count) {
      let value = Double(samples[index])
      sum += value * value
      if index > offset && samples[index - 1] < 0 && samples[index] >= 0 { crossings += 1 }
    }
    return (sqrt(sum / Double(count)), Double(crossings) * rate / Double(count))
  }

  static func main() async throws {
    let files = FileManager.default
    let temporary = files.temporaryDirectory.appendingPathComponent("openfy-mix-check-\(UUID().uuidString)", isDirectory: true)
    try files.createDirectory(at: temporary, withIntermediateDirectories: true)
    defer { try? files.removeItem(at: temporary) }
    let first = temporary.appendingPathComponent("first.wav")
    let second = temporary.appendingPathComponent("second.wav")
    try writeTone(first, frequency: 440)
    try writeTone(second, frequency: 880)
    let cache = files.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("openfy-mixes", isDirectory: true)
    try files.createDirectory(at: cache, withIntermediateDirectories: true)
    let output = cache.appendingPathComponent("check-\(UUID().uuidString).m4a")
    defer { try? files.removeItem(at: output) }
    let clips: [[String: Any]] = [
      ["uri": first.absoluteString, "startMs": 1000.0, "endMs": 2000.0, "volume": 1.0],
      ["uri": second.absoluteString, "startMs": 1000.0, "endMs": 1500.0, "volume": 0.25],
    ]
    let result = try await MixAudioRenderer.render(clips: clips, outputURI: output.absoluteString)
    try check(abs((result["durationMs"] as? Double ?? 0) - 1500) < 50, "Composition duration must be 1.5 seconds")
    let file = try AVAudioFile(forReading: output)
    let rate = file.processingFormat.sampleRate
    try check(abs(Double(file.length) / rate - 1.5) < 0.1, "Encoded duration must match the cuts")
    let pcm = AVAudioPCMBuffer(pcmFormat: file.processingFormat, frameCapacity: AVAudioFrameCount(file.length))!
    try file.read(into: pcm)
    let firstTone = measure(pcm.floatChannelData![0], offset: Int(rate * 0.3), count: Int(rate * 0.2), rate: rate)
    let secondTone = measure(pcm.floatChannelData![0], offset: Int(rate * 1.2), count: Int(rate * 0.2), rate: rate)
    let secondEarly = measure(pcm.floatChannelData![0], offset: Int(rate * 1.1), count: Int(rate * 0.1), rate: rate)
    let secondLate = measure(pcm.floatChannelData![0], offset: Int(rate * 1.3), count: Int(rate * 0.1), rate: rate)
    print("Mix measurements: first RMS=\(firstTone.rms), second RMS=\(secondTone.rms), ratio=\(secondTone.rms / firstTone.rms), frequencies=\(firstTone.hz)/\(secondTone.hz)")
    try check(abs(firstTone.hz - 440) < 30 && abs(secondTone.hz - 880) < 40, "Clip order or source trim is incorrect")
    try check(firstTone.rms > 0.1 && abs(secondTone.rms / firstTone.rms - 0.25) < 0.08,
      "Clip gain was not applied: first=\(firstTone.rms), second=\(secondTone.rms), ratio=\(secondTone.rms / firstTone.rms)")
    try check(abs(secondEarly.rms - secondLate.rms) < 0.01, "A constant clip gain must not fade between cuts")
    let peaks = try MixAudioRenderer.waveform(uri: first.absoluteString, bins: 128)
    try check(peaks.count == 128 && peaks.allSatisfy { $0 > 0.35 && $0 <= 0.41 }, "Waveform must reflect the actual tone amplitude")
    let layered = cache.appendingPathComponent("layered-\(UUID().uuidString).m4a")
    defer { try? files.removeItem(at: layered) }
    let layeredClips: [[String: Any]] = [
      ["uri": first.absoluteString, "startMs": 1000.0, "endMs": 2000.0, "volume": 1.0, "lane": 0],
      ["uri": second.absoluteString, "startMs": 1000.0, "endMs": 1500.0, "volume": 1.0, "lane": 1],
    ]
    let layeredResult = try await MixAudioRenderer.render(clips: layeredClips, outputURI: layered.absoluteString)
    try check(abs((layeredResult["durationMs"] as? Double ?? 0) - 1000) < 50, "Parallel tracks must not be concatenated")
    let mixed = try AVAudioFile(forReading: layered)
    let mixedRate = mixed.processingFormat.sampleRate
    let mixedPCM = AVAudioPCMBuffer(pcmFormat: mixed.processingFormat, frameCapacity: AVAudioFrameCount(mixed.length))!
    try mixed.read(into: mixedPCM)
    let mixedSamples = mixedPCM.floatChannelData![0]
    func amplitude(_ frequency: Double) -> Double {
      var real = 0.0
      var imaginary = 0.0
      let start = Int(mixedRate * 0.1), count = Int(mixedRate * 0.2)
      for index in start..<(start + count) {
        let phase = Double(index) / mixedRate * frequency * 2 * .pi
        real += Double(mixedSamples[index]) * cos(phase)
        imaginary += Double(mixedSamples[index]) * sin(phase)
      }
      return 2 * hypot(real, imaginary) / Double(count)
    }
    try check(amplitude(440) > 0.1 && amplitude(880) > 0.1, "Both overlapping tones must be present")
    print("Mix audio: real waveform and simultaneous lanes verified")
    let compressedPeaks = try MixAudioRenderer.waveform(uri: output.absoluteString, bins: 128)
    try check(compressedPeaks.count == 128 && compressedPeaks.prefix(60).max()! > 0.2 &&
      compressedPeaks.suffix(25).max()! < 0.18, "Waveform must read the actual encoded AAC audio and its gain")
    let gapOutput = cache.appendingPathComponent("gap-\(UUID().uuidString).m4a")
    defer { try? files.removeItem(at: gapOutput) }
    let gapClips: [[String: Any]] = [
      ["uri": first.absoluteString, "startMs": 1000.0, "endMs": 1500.0, "volume": 1.0, "gapBeforeMs": 500.0],
      ["uri": second.absoluteString, "startMs": 1000.0, "endMs": 1500.0, "volume": 1.0, "gapBeforeMs": 500.0],
    ]
    let gapResult = try await MixAudioRenderer.render(clips: gapClips, outputURI: gapOutput.absoluteString)
    try check(abs((gapResult["durationMs"] as? Double ?? 0) - 2000) < 50, "Moved clips must retain their start positions")
    let gapFile = try AVAudioFile(forReading: gapOutput)
    let gapRate = gapFile.processingFormat.sampleRate
    let gapPCM = AVAudioPCMBuffer(pcmFormat: gapFile.processingFormat, frameCapacity: AVAudioFrameCount(gapFile.length))!
    try gapFile.read(into: gapPCM)
    let gapSamples = gapPCM.floatChannelData![0]
    let silence = measure(gapSamples, offset: Int(gapRate * 0.15), count: Int(gapRate * 0.2), rate: gapRate)
    let middle = measure(gapSamples, offset: Int(gapRate * 1.15), count: Int(gapRate * 0.2), rate: gapRate)
    let tone = measure(gapSamples, offset: Int(gapRate * 1.65), count: Int(gapRate * 0.2), rate: gapRate)
    try check(silence.rms < 0.02 && middle.rms < 0.02 && abs(tone.hz - 880) < 40, "Gaps must encode as silence, not shifted audio")
    let effectOutput = cache.appendingPathComponent("effect-\(UUID().uuidString).m4a")
    defer { try? files.removeItem(at: effectOutput) }
    let envelope: [[String: Double]] = [
      ["ms": 0, "gain": 0], ["ms": 300, "gain": 1], ["ms": 700, "gain": 1], ["ms": 1000, "gain": 0],
    ]
    _ = try await MixAudioRenderer.render(clips: [["uri": first.absoluteString, "startMs": 1000.0, "endMs": 2000.0,
      "volume": 1.0, "envelope": envelope]], outputURI: effectOutput.absoluteString)
    let effectFile = try AVAudioFile(forReading: effectOutput)
    let effectRate = effectFile.processingFormat.sampleRate
    let effectPCM = AVAudioPCMBuffer(pcmFormat: effectFile.processingFormat, frameCapacity: AVAudioFrameCount(effectFile.length))!
    try effectFile.read(into: effectPCM)
    let effectSamples = effectPCM.floatChannelData![0]
    let fadeStart = measure(effectSamples, offset: Int(effectRate * 0.02), count: Int(effectRate * 0.06), rate: effectRate)
    let fadeMiddle = measure(effectSamples, offset: Int(effectRate * 0.4), count: Int(effectRate * 0.15), rate: effectRate)
    let fadeEnd = measure(effectSamples, offset: Int(effectRate * 0.92), count: Int(effectRate * 0.05), rate: effectRate)
    try check(fadeMiddle.rms > 0.15 && fadeStart.rms < fadeMiddle.rms * 0.4 && fadeEnd.rms < fadeMiddle.rms * 0.4,
      "The exported audio must contain the actual fade-in and fade-out")
    let detailed = try MixAudioRenderer.waveform(uri: first.absoluteString, bins: 32768)
    try check(detailed.count == 32768, "Beat analysis needs detailed decoded amplitude")
    do {
      _ = try await MixAudioRenderer.render(clips: [["uri": "https://example.com/audio", "startMs": 0.0, "endMs": 1000.0, "volume": 1.0]],
        outputURI: cache.appendingPathComponent("rejected-\(UUID().uuidString).m4a").absoluteString)
      throw NSError(domain: "MixAudioCheck", code: 2, userInfo: [NSLocalizedDescriptionKey: "Remote source was accepted"])
    } catch let error as NSError {
      try check(error.domain != "MixAudioCheck", "Remote source was accepted")
    }
    print("Mix audio: cuts, concatenation, duration, volume and local-only sources verified")
  }
}

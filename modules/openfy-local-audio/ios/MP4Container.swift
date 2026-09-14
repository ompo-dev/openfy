import Foundation

enum LocalAudioRepairError: String, Error, LocalizedError {
  case invalidFile, invalidContainer, unsupportedAudio, invalidTiming
  case readerFailed, exportUnavailable, exportFailed, validationFailed, sourceChanged

  var errorDescription: String? { "Local audio repair failed: \(rawValue)" }
}

enum MP4Container {
  // Only inspect box headers. AVFoundation owns demuxing, timing, and writing.
  static func isFragmented(at url: URL) throws -> Bool {
    let file = try FileHandle(forReadingFrom: url)
    defer { try? file.close() }
    let length = try file.seekToEnd()
    try file.seek(toOffset: 0)
    guard let first = try file.read(upToCount: 8), first.count == 8,
      String(bytes: first[4..<8], encoding: .ascii) == "ftyp" else { return false }

    var offset: UInt64 = 0
    var hasMovie = false
    var hasFragment = false
    var hasMedia = false
    var boxCount = 0
    while offset < length {
      boxCount += 1
      guard boxCount <= 100_000, length - offset >= 8 else {
        throw LocalAudioRepairError.invalidContainer
      }
      try file.seek(toOffset: offset)
      guard let header = try file.read(upToCount: 8), header.count == 8 else {
        throw LocalAudioRepairError.invalidContainer
      }
      let type = String(bytes: header[4..<8], encoding: .ascii)
      var size = integer(header.prefix(4))
      var headerSize: UInt64 = 8
      if size == 1 {
        guard let extended = try file.read(upToCount: 8), extended.count == 8 else {
          throw LocalAudioRepairError.invalidContainer
        }
        size = integer(extended)
        headerSize = 16
      } else if size == 0 {
        size = length - offset
      }
      guard size >= headerSize, size <= length - offset else {
        throw LocalAudioRepairError.invalidContainer
      }
      hasMovie = hasMovie || type == "moov"
      hasFragment = hasFragment || type == "moof"
      hasMedia = hasMedia || type == "mdat"
      offset += size
    }
    if hasFragment && (!hasMovie || !hasMedia) {
      throw LocalAudioRepairError.invalidContainer
    }
    return hasFragment
  }

  private static func integer(_ bytes: Data) -> UInt64 {
    bytes.reduce(0) { ($0 << 8) | UInt64($1) }
  }
}

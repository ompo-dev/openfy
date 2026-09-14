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

  // YouTube's empty initialization tables still declare the whole song's
  // duration. AVFoundation adds that empty span to the fragments and can emit
  // empty sample buffers. Zero only these initialization durations in a scratch
  // copy. Fragment timestamps, edit lists, sample tables and AAC bytes stay intact.
  static func makeDemuxingCopy(from source: URL, to destination: URL) throws {
    let file = try FileHandle(forReadingFrom: source)
    defer { try? file.close() }
    let length = try file.seekToEnd()
    var offset: UInt64 = 0
    var movie: Data?
    var movieOffset: UInt64 = 0
    while offset < length {
      try file.seek(toOffset: offset)
      guard let header = try file.read(upToCount: 8), header.count == 8 else {
        throw LocalAudioRepairError.invalidContainer
      }
      var size = integer(header.prefix(4))
      var headerSize: UInt64 = 8
      if size == 1 {
        guard let extended = try file.read(upToCount: 8), extended.count == 8 else {
          throw LocalAudioRepairError.invalidContainer
        }
        size = integer(extended)
        headerSize = 16
      } else if size == 0 { size = length - offset }
      guard size >= headerSize, size <= length - offset else {
        throw LocalAudioRepairError.invalidContainer
      }
      if String(bytes: header[4..<8], encoding: .ascii) == "moov" {
        guard movie == nil, size <= 16 * 1024 * 1024 else {
          throw LocalAudioRepairError.invalidContainer
        }
        try file.seek(toOffset: offset)
        movie = try file.read(upToCount: Int(size))
        guard movie?.count == Int(size) else { throw LocalAudioRepairError.invalidContainer }
        movieOffset = offset
      }
      offset += size
    }
    guard var movie else { throw LocalAudioRepairError.invalidContainer }
    let ranges = try initializationDurationRanges(movie)
    for range in ranges { movie.replaceSubrange(range, with: repeatElement(UInt8(0), count: range.count)) }
    try FileManager.default.copyItem(at: source, to: destination)
    let copy = try FileHandle(forWritingTo: destination)
    defer { try? copy.close() }
    try copy.seek(toOffset: movieOffset)
    try copy.write(contentsOf: movie)
    try copy.synchronize()
  }

  private static func initializationDurationRanges(_ data: Data) throws -> [Range<Int>] {
    var durations: [Range<Int>] = []
    var hasExtensions = false
    var emptyTimingTables = 0
    var emptySizeTables = 0
    func walk(_ start: Int, _ end: Int, depth: Int) throws {
      guard depth < 8 else { throw LocalAudioRepairError.invalidContainer }
      var offset = start
      while offset < end {
        guard end - offset >= 8 else { throw LocalAudioRepairError.invalidContainer }
        var size = integer(data.subdata(in: offset..<(offset + 4)))
        var header = 8
        if size == 1 {
          guard end - offset >= 16 else { throw LocalAudioRepairError.invalidContainer }
          size = integer(data.subdata(in: (offset + 8)..<(offset + 16)))
          header = 16
        } else if size == 0 { size = UInt64(end - offset) }
        guard size >= header, size <= UInt64(end - offset) else {
          throw LocalAudioRepairError.invalidContainer
        }
        let boxEnd = offset + Int(size)
        let payload = offset + header
        let type = String(bytes: data[(offset + 4)..<(offset + 8)], encoding: .ascii)
        if ["moov", "trak", "mdia", "minf", "stbl"].contains(type) {
          try walk(payload, boxEnd, depth: depth + 1)
        } else if type == "mvex" {
          hasExtensions = true
        } else if ["mvhd", "mdhd", "tkhd"].contains(type) {
          guard payload < boxEnd, data[payload] <= 1 else { throw LocalAudioRepairError.invalidContainer }
          let versionOne = data[payload] == 1
          let position = payload + (type == "tkhd" ? (versionOne ? 28 : 20) : (versionOne ? 24 : 16))
          let range = position..<(position + (versionOne ? 8 : 4))
          guard range.upperBound <= boxEnd else { throw LocalAudioRepairError.invalidContainer }
          durations.append(range)
        } else if ["stts", "stsc", "stco", "co64", "stsz", "stz2"].contains(type) {
          let position = payload + (["stsz", "stz2"].contains(type) ? 8 : 4)
          guard position + 4 <= boxEnd else { throw LocalAudioRepairError.invalidContainer }
          guard integer(data.subdata(in: position..<(position + 4))) == 0 else {
            throw LocalAudioRepairError.unsupportedAudio
          }
          if type == "stts" { emptyTimingTables += 1 }
          if type == "stsz" || type == "stz2" { emptySizeTables += 1 }
        }
        offset = boxEnd
      }
    }
    try walk(0, data.count, depth: 0)
    guard hasExtensions, emptyTimingTables == 1, emptySizeTables == 1, durations.count == 3 else {
      throw LocalAudioRepairError.unsupportedAudio
    }
    return durations
  }
}

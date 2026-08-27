@preconcurrency import ExpoModulesCore
import Foundation

private struct GoogleVideoTransferResult: Record {
  @Field var uri: String?
  @Field var status: Int = 0
  @Field var mimeType: String?
  @Field var headers: [String: String]?
  @Field var totalBytes: Int?
}

private struct ContentRange {
  let start: Int
  let end: Int
  let total: Int
}

/**
 * Owns the complete native media transfer. Googlevideo signed URLs are bound
 * to the player identity that issued them, so every byte range uses the same
 * URLSession and explicit identity headers rather than delegating parts of the
 * transfer to different Expo networking APIs.
 */
public final class OpenfyYouTubeModule: Module {
  private static let minimumChunkBytes = 64 * 1024
  private static let maximumChunkBytes = 4 * 1024 * 1024

  private static let session: URLSession = {
    let configuration = URLSessionConfiguration.default
    configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
    configuration.httpShouldSetCookies = true
    configuration.httpCookieAcceptPolicy = .always
    return URLSession(configuration: configuration)
  }()

  public func definition() -> ModuleDefinition {
    Name("OpenfyYouTube")

    AsyncFunction("downloadGoogleVideoAsync") {
      (url: String, destination: String, headers: [String: String], chunkBytes: Int) async throws -> GoogleVideoTransferResult in
      return try await Self.download(
        url: url,
        destination: destination,
        headers: headers,
        chunkBytes: chunkBytes
      )
    }
  }

  private static func download(
    url rawURL: String,
    destination rawDestination: String,
    headers: [String: String],
    chunkBytes: Int
  ) async throws -> GoogleVideoTransferResult {
    guard (minimumChunkBytes...maximumChunkBytes).contains(chunkBytes) else {
      throw transferError("invalid_chunk_size")
    }

    let sourceURL = try validatedGoogleVideoURL(rawURL)
    let destinationURL = try validatedDestinationURL(rawDestination)
    let fileManager = FileManager.default
    try fileManager.createDirectory(
      at: destinationURL.deletingLastPathComponent(),
      withIntermediateDirectories: true
    )
    if fileManager.fileExists(atPath: destinationURL.path) {
      try fileManager.removeItem(at: destinationURL)
    }

    let initial = try await requestRange(
      sourceURL,
      headers: headers,
      start: 0,
      end: chunkBytes - 1
    )
    let initialHeaders = headersFrom(initial.response)
    let mimeType = initial.response.mimeType

    guard initial.response.statusCode == 200 || initial.response.statusCode == 206 else {
      return transferResult(
        status: initial.response.statusCode,
        mimeType: mimeType,
        headers: initialHeaders
      )
    }
    guard isAudioContentType(mimeType) else {
      return transferResult(
        status: initial.response.statusCode,
        mimeType: mimeType,
        headers: initialHeaders
      )
    }

    // The rare full-body response is still written without holding the file in
    // JavaScript memory. Normal googlevideo responses are 206 and continue
    // below in fixed byte ranges.
    if initial.response.statusCode == 200 {
      try initial.data.write(to: destinationURL, options: .atomic)
      return transferResult(
        uri: destinationURL.absoluteString,
        status: initial.response.statusCode,
        mimeType: mimeType,
        headers: initialHeaders,
        totalBytes: initial.data.count
      )
    }

    guard let initialRange = contentRange(from: initial.response),
      initialRange.start == 0,
      initialRange.end >= initialRange.start,
      initialRange.total > initialRange.end,
      initial.data.count == initialRange.end - initialRange.start + 1 else {
      throw transferError("invalid_initial_content_range")
    }

    guard fileManager.createFile(atPath: destinationURL.path, contents: nil) else {
      throw transferError("cannot_create_destination")
    }

    let handle = try FileHandle(forWritingTo: destinationURL)
    defer { try? handle.close() }
    do {
      try handle.write(contentsOf: initial.data)
      var nextByte = initialRange.end + 1

      while nextByte < initialRange.total {
        let endByte = min(nextByte + chunkBytes - 1, initialRange.total - 1)
        let range = try await requestRange(
          sourceURL,
          headers: headers,
          start: nextByte,
          end: endByte
        )
        let rangeHeaders = headersFrom(range.response)
        let rangeMimeType = range.response.mimeType
        guard range.response.statusCode == 206 else {
          try? fileManager.removeItem(at: destinationURL)
          return transferResult(
            status: range.response.statusCode,
            mimeType: rangeMimeType,
            headers: rangeHeaders,
            totalBytes: initialRange.total
          )
        }
        guard isAudioContentType(rangeMimeType),
          let contentRange = contentRange(from: range.response),
          contentRange.start == nextByte,
          contentRange.end == endByte,
          contentRange.total == initialRange.total,
          range.data.count == contentRange.end - contentRange.start + 1 else {
          throw transferError("invalid_follow_up_content_range")
        }
        try handle.write(contentsOf: range.data)
        nextByte = contentRange.end + 1
      }
    } catch {
      try? fileManager.removeItem(at: destinationURL)
      throw error
    }

    return transferResult(
      uri: destinationURL.absoluteString,
      status: initial.response.statusCode,
      mimeType: mimeType,
      headers: initialHeaders,
      totalBytes: initialRange.total
    )
  }

  // `@Field` turns Record properties into property wrappers. Its synthesized
  // memberwise initializer therefore accepts `Field<T>`, not `T`; populate the
  // record through its public wrapped values instead.
  private static func transferResult(
    uri: String? = nil,
    status: Int,
    mimeType: String? = nil,
    headers: [String: String]? = nil,
    totalBytes: Int? = nil
  ) -> GoogleVideoTransferResult {
    var result = GoogleVideoTransferResult()
    result.uri = uri
    result.status = status
    result.mimeType = mimeType
    result.headers = headers
    result.totalBytes = totalBytes
    return result
  }

  private static func requestRange(
    _ url: URL,
    headers: [String: String],
    start: Int,
    end: Int
  ) async throws -> (data: Data, response: HTTPURLResponse) {
    var request = URLRequest(url: url)
    request.httpMethod = "GET"
    request.cachePolicy = .reloadIgnoringLocalCacheData
    request.timeoutInterval = 30
    request.setValue("bytes=\(start)-\(end)", forHTTPHeaderField: "Range")
    request.setValue("identity", forHTTPHeaderField: "Accept-Encoding")
    for (name, value) in headers where !name.isEmpty && !value.isEmpty {
      request.setValue(value, forHTTPHeaderField: name)
    }

    let (data, response) = try await session.data(for: request)
    guard let httpResponse = response as? HTTPURLResponse else {
      throw transferError("non_http_response")
    }
    return (data, httpResponse)
  }

  private static func validatedGoogleVideoURL(_ rawURL: String) throws -> URL {
    guard let url = URL(string: rawURL),
      url.scheme?.lowercased() == "https",
      let host = url.host?.lowercased(),
      host == "googlevideo.com" || host.hasSuffix(".googlevideo.com") else {
      throw transferError("invalid_googlevideo_url")
    }
    return url
  }

  private static func validatedDestinationURL(_ rawDestination: String) throws -> URL {
    guard let url = URL(string: rawDestination), url.isFileURL else {
      throw transferError("invalid_destination")
    }
    let documentsDirectory = FileManager.default.urls(
      for: .documentDirectory,
      in: .userDomainMask
    )[0].standardizedFileURL
    let destination = url.standardizedFileURL
    let rootPath = documentsDirectory.path.hasSuffix("/")
      ? documentsDirectory.path
      : documentsDirectory.path + "/"
    guard destination.path.hasPrefix(rootPath) else {
      throw transferError("destination_outside_documents")
    }
    return destination
  }

  private static func isAudioContentType(_ value: String?) -> Bool {
    guard let value else { return true }
    let normalized = value.lowercased()
    return normalized.hasPrefix("audio/") || normalized.hasPrefix("video/") || normalized == "application/octet-stream"
  }

  private static func headersFrom(_ response: HTTPURLResponse) -> [String: String] {
    let allowed = Set([
      "content-type", "content-length", "content-range", "accept-ranges", "date", "server"
    ])
    return response.allHeaderFields.reduce(into: [String: String]()) { result, entry in
      guard let name = entry.key as? String,
        let value = entry.value as? CustomStringConvertible,
        allowed.contains(name.lowercased()) else {
        return
      }
      result[name] = value.description
    }
  }

  private static func contentRange(from response: HTTPURLResponse) -> ContentRange? {
    guard let rawValue = response.value(forHTTPHeaderField: "Content-Range")?.lowercased(),
      rawValue.hasPrefix("bytes ") else {
      return nil
    }
    let value = String(rawValue.dropFirst("bytes ".count))
    let pieces = value.split(separator: "/", maxSplits: 1).map(String.init)
    guard pieces.count == 2,
      let dashIndex = pieces[0].firstIndex(of: "-"),
      let start = Int(pieces[0][..<dashIndex]),
      let end = Int(pieces[0][pieces[0].index(after: dashIndex)...]),
      let total = Int(pieces[1]) else {
      return nil
    }
    return ContentRange(start: start, end: end, total: total)
  }

  private static func transferError(_ reason: String) -> NSError {
    return NSError(
      domain: "OpenfyYouTube",
      code: 1,
      userInfo: [NSLocalizedDescriptionKey: "OpenfyYouTube transfer failed: \(reason)"]
    )
  }
}

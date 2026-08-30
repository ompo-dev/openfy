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

private struct AndroidMusicPlayerClient {
  static let name = "ANDROID_MUSIC"
  static let id = "21"
  static let version = "8.39.42"
  static let userAgent =
    "com.google.android.apps.youtube.music/8.39.42 (Linux; U; Android 15; en_US; Pixel 9 Pro; Build/AP4A.250205.002) gzip"
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

    // The player request and media ranges must share one URLSession. A signed
    // googlevideo URL can be rejected before its first byte when JavaScript
    // mints it through one networking stack and URLSession fetches it through
    // another.
    AsyncFunction("resolveAndDownloadGoogleVideoAsync") {
      (videoId: String, destination: String, chunkBytes: Int) async throws -> GoogleVideoTransferResult in
      return try await Self.resolveAndDownload(
        videoId: videoId,
        destination: destination,
        chunkBytes: chunkBytes
      )
    }
  }

  private static func resolveAndDownload(
    videoId: String,
    destination: String,
    chunkBytes: Int
  ) async throws -> GoogleVideoTransferResult {
    guard isValidVideoId(videoId) else {
      throw transferError("invalid_video_id")
    }
    guard (minimumChunkBytes...maximumChunkBytes).contains(chunkBytes) else {
      throw transferError("invalid_chunk_size")
    }

    let visitorData = try? await freshVisitorData()
    let player = try await playerResponse(videoId: videoId, visitorData: visitorData)
    let playerHeaders = headersFrom(player.response)
    guard (200...299).contains(player.response.statusCode) else {
      return transferResult(
        status: player.response.statusCode,
        mimeType: player.response.mimeType,
        headers: playerHeaders
      )
    }

    guard playerStatus(from: player.payload) == "OK" else {
      return transferResult(
        status: 403,
        mimeType: "text/plain",
        headers: playerHeaders
      )
    }
    guard let streamURL = bestAudioStreamURL(from: player.payload) else {
      return transferResult(
        status: 502,
        mimeType: "text/plain",
        headers: playerHeaders
      )
    }

    return try await download(
      url: streamURL.absoluteString,
      destination: destination,
      headers: ["User-Agent": AndroidMusicPlayerClient.userAgent],
      chunkBytes: chunkBytes
    )
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

  private static func freshVisitorData() async throws -> String? {
    guard let url = URL(string: "https://www.youtube.com/sw.js_data") else {
      return nil
    }
    var request = URLRequest(url: url)
    request.httpMethod = "GET"
    request.timeoutInterval = 10
    request.setValue(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
      forHTTPHeaderField: "User-Agent"
    )
    request.setValue("en-US", forHTTPHeaderField: "Accept-Language")
    request.setValue("https://www.youtube.com/sw.js", forHTTPHeaderField: "Referer")
    let (data, response) = try await session.data(for: request)
    guard let httpResponse = response as? HTTPURLResponse,
      (200...299).contains(httpResponse.statusCode),
      let body = String(data: data, encoding: .utf8) else {
      return nil
    }
    let expression = try NSRegularExpression(pattern: "Cg[A-Za-z0-9_%-]{40,}")
    let range = NSRange(body.startIndex..<body.endIndex, in: body)
    guard let match = expression.firstMatch(in: body, range: range),
      let matchRange = Range(match.range, in: body) else {
      return nil
    }
    return String(body[matchRange])
  }

  private static func playerResponse(
    videoId: String,
    visitorData: String?
  ) async throws -> (payload: [String: Any], response: HTTPURLResponse) {
    guard let url = URL(string: "https://www.youtube.com/youtubei/v1/player?prettyPrint=false") else {
      throw transferError("invalid_player_url")
    }

    var client: [String: Any] = [
      "clientName": AndroidMusicPlayerClient.name,
      "clientVersion": AndroidMusicPlayerClient.version,
      "osName": "Android",
      "osVersion": "15",
      "deviceMake": "Google",
      "deviceModel": "Pixel 9 Pro",
      "androidSdkVersion": 35,
      "hl": "en",
      "gl": "US",
    ]
    if let visitorData, !visitorData.isEmpty {
      client["visitorData"] = visitorData
    }
    let body: [String: Any] = [
      "context": ["client": client],
      "videoId": videoId,
      "contentCheckOk": true,
      "racyCheckOk": true,
    ]

    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.timeoutInterval = 15
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("*/*", forHTTPHeaderField: "Accept")
    request.setValue(AndroidMusicPlayerClient.userAgent, forHTTPHeaderField: "User-Agent")
    request.setValue(AndroidMusicPlayerClient.id, forHTTPHeaderField: "X-YouTube-Client-Name")
    request.setValue(AndroidMusicPlayerClient.version, forHTTPHeaderField: "X-YouTube-Client-Version")
    request.setValue("2", forHTTPHeaderField: "X-GOOG-API-FORMAT-VERSION")
    if let visitorData, !visitorData.isEmpty {
      request.setValue(visitorData, forHTTPHeaderField: "X-Goog-Visitor-Id")
    }
    request.httpBody = try JSONSerialization.data(withJSONObject: body)

    let (data, response) = try await session.data(for: request)
    guard let httpResponse = response as? HTTPURLResponse else {
      throw transferError("player_non_http_response")
    }
    let payload = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
    return (payload, httpResponse)
  }

  private static func playerStatus(from payload: [String: Any]) -> String? {
    (payload["playabilityStatus"] as? [String: Any])?["status"] as? String
  }

  private static func bestAudioStreamURL(from payload: [String: Any]) -> URL? {
    guard let streamingData = payload["streamingData"] as? [String: Any],
      let formats = streamingData["adaptiveFormats"] as? [[String: Any]] else {
      return nil
    }

    let candidates = formats.compactMap { format -> (url: URL, score: Int)? in
      let rawURLString: String? = {
        if let url = format["url"] as? String, !url.isEmpty {
          return url
        }
        // Partial signatureCipher fallback: extract the raw `url` field only.
        // NOTE: signatureCipher streams require deciphering the `s` parameter
        // (using the player JS signature function) before the URL is valid.
        // Full decipher is NOT performed here — that is intentionally handled
        // by youtubei.js on the JS resolver side. This branch exists only to
        // surface the URL for inspection / logging when the direct `url` field
        // is missing from the response, e.g. on older Innertube responses.
        // A URL extracted here without deciphering will likely return 403.
        let cipher = (format["signatureCipher"] as? String) ?? (format["cipher"] as? String)
        if let cipher, !cipher.isEmpty {
          let components = cipher.components(separatedBy: "&")
          for comp in components {
            let pair = comp.components(separatedBy: "=")
            if pair.count == 2 && pair[0] == "url",
              let decoded = pair[1].removingPercentEncoding,
              !decoded.isEmpty {
              return decoded
            }
          }
        }
        return nil
      }()

      guard let rawURL = rawURLString,
        let url = URL(string: rawURL),
        url.scheme?.lowercased() == "https",
        let host = url.host?.lowercased(),
        host == "googlevideo.com" || host.hasSuffix(".googlevideo.com"),
        let mimeType = format["mimeType"] as? String,
        mimeType.lowercased().hasPrefix("audio/") else {
        return nil
      }
      let quality = (format["audioQuality"] as? String) == "AUDIO_QUALITY_HIGH" ? 1_000_000 : 0
      let bitrate = format["bitrate"] as? Int ?? 0
      return (url, quality + bitrate)
    }
    return candidates.max(by: { $0.score < $1.score })?.url
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

  private static func isValidVideoId(_ value: String) -> Bool {
    guard value.count == 11 else { return false }
    return value.allSatisfy {
      $0.isASCII && ($0.isLetter || $0.isNumber || $0 == "_" || $0 == "-")
    }
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

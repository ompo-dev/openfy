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

private struct GuestPlayerClient {
  static let name = "VISIONOS"
  static let id = "101"
  static let version = "1.02"
  static let userAgent =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15"
  static let mediaHeaders = [
    "User-Agent": userAgent,
    "Origin": "https://www.youtube.com",
    "Referer": "https://www.youtube.com/",
  ]
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

  private static let rangeClient = YouTubeHTTPRangeClient(session: session)
  @MainActor
  private lazy var nativePlayer = OpenfyNativeYouTubePlayer()

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

    // Native Phase 1 POC: Openfy native streaming engine directly driving AVPlayer
    // via AVAssetResourceLoaderDelegate and Range requests over persistent URLSession.
    AsyncFunction("playNativeYouTubeAsync") { (videoId: String) in
      guard Self.isValidVideoId(videoId) else {
        throw Self.transferError("invalid_video_id")
      }

      NSLog("[NATIVE] Resolving videoId: %@", videoId)
      let playerRes = try await Self.guestPlayerResponse(videoId: videoId)

      guard (200...299).contains(playerRes.response.statusCode) else {
        NSLog("[NATIVE] Player HTTP error: %ld", playerRes.response.statusCode)
        throw StreamTransportError.http(statusCode: playerRes.response.statusCode)
      }

      guard Self.playerStatus(from: playerRes.payload) == "OK" else {
        NSLog("[NATIVE] Player status not OK: %@", Self.playerStatus(from: playerRes.payload) ?? "nil")
        throw StreamTransportError.audioTrackUnavailable
      }

      let headers = GuestPlayerClient.mediaHeaders
      let descriptor = try await Self.bestAudioStreamDescriptor(
        videoId: videoId,
        payload: playerRes.payload,
        headers: headers,
        rangeClient: Self.rangeClient
      )

      NSLog("[NATIVE] Selected descriptor itag=%ld mime=%@ bitrate=%ld contentLength=%lld",
            descriptor.itag ?? 0, descriptor.mimeType, descriptor.bitrate, descriptor.contentLength)

      try await self.nativePlayer.play(
        descriptor: descriptor,
        rangeClient: Self.rangeClient
      )
    }

    AsyncFunction("pauseNativeYouTubeAsync") {
      await self.nativePlayer.pause()
    }

    AsyncFunction("resumeNativeYouTubeAsync") {
      await self.nativePlayer.resume()
    }

    AsyncFunction("seekNativeYouTubeAsync") { (positionMs: Double) in
      await self.nativePlayer.seek(to: positionMs)
    }

    AsyncFunction("stopNativeYouTubeAsync") {
      await self.nativePlayer.stop()
    }

    AsyncFunction("getNativePlaybackStatusAsync") { () -> [String: Any] in
      return await self.nativePlayer.getStatus()
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

    let player = try await guestPlayerResponse(videoId: videoId)
    var playerHeaders = headersFrom(player.response)
    playerHeaders["X-Openfy-Player-Client"] = GuestPlayerClient.name
    guard (200...299).contains(player.response.statusCode) else {
      return transferResult(
        status: player.response.statusCode,
        mimeType: player.response.mimeType,
        headers: playerHeaders
      )
    }

    guard playerStatus(from: player.payload) == "OK" else {
      // Emit the real playabilityStatus fields instead of synthesizing 403.
      // JS diagnostics read X-Playability-Status / X-Playability-Reason to
      // distinguish LOGIN_REQUIRED, UNPLAYABLE, AGE_CHECK_REQUIRED, etc.
      let playability = player.payload["playabilityStatus"] as? [String: Any]
      let psStatus  = playability?["status"]  as? String ?? "UNKNOWN"
      let psReason  = playability?["reason"]  as? String
      var extra = playerHeaders
      extra["X-Playability-Status"] = psStatus
      if let r = psReason { extra["X-Playability-Reason"] = r }
      NSLog("[NATIVE] playabilityStatus=%@ reason=%@", psStatus, psReason ?? "nil")
      return transferResult(
        status: player.response.statusCode,
        mimeType: "application/json",
        headers: extra
      )
    }
    guard let streamURL = bestAudioStreamURL(from: player.payload) else {
      return transferResult(
        status: 502,
        mimeType: "text/plain",
        headers: playerHeaders
      )
    }

    var transferred = try await download(
      url: streamURL.absoluteString,
      destination: destination,
      headers: GuestPlayerClient.mediaHeaders,
      chunkBytes: chunkBytes
    )
    var headers = transferred.headers ?? [:]
    headers["X-Openfy-Player-Client"] = GuestPlayerClient.name
    transferred.headers = headers
    return transferred
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
    let (data, response) = try await YouTubeRequestRetry.data(for: request, session: session)
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

  // Match Sonora's guest flow: retain a server-issued visitor and retry it once
  // when the initial visitor is refused. No local token fabrication is involved.
  private static func guestPlayerResponse(
    videoId: String
  ) async throws -> (payload: [String: Any], response: HTTPURLResponse) {
    let visitorData = try? await freshVisitorData()
    let initial = try await playerResponse(videoId: videoId, visitorData: visitorData)
    guard playerStatus(from: initial.payload) == "LOGIN_REQUIRED",
      let responseContext = initial.payload["responseContext"] as? [String: Any],
      let issuedVisitor = responseContext["visitorData"] as? String,
      !issuedVisitor.isEmpty else {
      return initial
    }
    return try await playerResponse(videoId: videoId, visitorData: issuedVisitor)
  }

  private static func playerResponse(
    videoId: String,
    visitorData: String?
  ) async throws -> (payload: [String: Any], response: HTTPURLResponse) {
    guard let url = URL(string: "https://www.youtube.com/youtubei/v1/player?prettyPrint=false") else {
      throw transferError("invalid_player_url")
    }

    var client: [String: Any] = [
      "clientName": GuestPlayerClient.name,
      "clientVersion": GuestPlayerClient.version,
      "userAgent": GuestPlayerClient.userAgent,
      "utcOffsetMinutes": 0,
      "osName": "visionOS",
      "osVersion": "26.5.23O471",
      "deviceMake": "Apple",
      "deviceModel": "RealityDevice17,1",
      "hl": "en",
      "gl": "US",
    ]
    if let visitorData, !visitorData.isEmpty {
      client["visitorData"] = visitorData
    }
    let body: [String: Any] = [
      "context": [
        "client": client,
        "user": ["enableSafetyMode": false, "lockedSafetyMode": false],
        "request": ["useSsl": true, "internalExperimentFlags": []],
      ],
      "videoId": videoId,
      "contentCheckOk": true,
      "racyCheckOk": true,
      "cpn": String(UUID().uuidString.replacingOccurrences(of: "-", with: "").prefix(16)),
      "playbackContext": [
        "contentPlaybackContext": ["html5Preference": "HTML5_PREF_WANTS"],
      ],
    ]

    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.timeoutInterval = 15
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("*/*", forHTTPHeaderField: "Accept")
    for (name, value) in GuestPlayerClient.mediaHeaders {
      request.setValue(value, forHTTPHeaderField: name)
    }
    request.setValue(GuestPlayerClient.id, forHTTPHeaderField: "X-YouTube-Client-Name")
    request.setValue(GuestPlayerClient.version, forHTTPHeaderField: "X-YouTube-Client-Version")
    if let visitorData, !visitorData.isEmpty {
      request.setValue(visitorData, forHTTPHeaderField: "X-Goog-Visitor-Id")
    }
    request.httpBody = try JSONSerialization.data(withJSONObject: body)

    let (data, response) = try await YouTubeRequestRetry.data(for: request, session: session)
    guard let httpResponse = response as? HTTPURLResponse else {
      throw transferError("player_non_http_response")
    }
    let payload = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
    return (payload, httpResponse)
  }

  private static func playerStatus(from payload: [String: Any]) -> String? {
    (payload["playabilityStatus"] as? [String: Any])?["status"] as? String
  }

  private static func bestAudioStreamDescriptor(
    videoId: String,
    payload: [String: Any],
    headers: [String: String],
    rangeClient: YouTubeHTTPRangeClient
  ) async throws -> YouTubeStreamDescriptor {
    guard let streamingData = payload["streamingData"] as? [String: Any],
      let formats = streamingData["adaptiveFormats"] as? [[String: Any]] else {
      throw StreamTransportError.audioTrackUnavailable
    }

    // Phase 1 POC: Strictly restrict to audio/mp4 containers with AAC (mp4a) codec
    // for native Apple AVAssetResourceLoader playback compatibility.
    // NOTE: Native POC currently requires a direct deciphered format["url"].
    // Full decipher is handled by youtubei.js on the JS resolver side when needed.
    let candidates = formats.compactMap { format -> (url: URL, mimeType: String, bitrate: Int, contentLength: Int64?, itag: Int?, score: Int)? in
      guard let rawMimeType = format["mimeType"] as? String,
        rawMimeType.lowercased().hasPrefix("audio/mp4"),
        rawMimeType.lowercased().contains("mp4a"),
        let rawURL = format["url"] as? String,
        !rawURL.isEmpty,
        let url = URL(string: rawURL),
        url.scheme?.lowercased() == "https",
        let host = url.host?.lowercased(),
        host == "googlevideo.com" || host.hasSuffix(".googlevideo.com") else {
        return nil
      }

      let quality = (format["audioQuality"] as? String) == "AUDIO_QUALITY_HIGH" ? 1_000_000 : 0
      let bitrate = format["bitrate"] as? Int ?? 0
      let itag = format["itag"] as? Int
      let contentLength: Int64? = (format["contentLength"] as? String).flatMap(Int64.init)

      return (url, rawMimeType, bitrate, contentLength, itag, quality + bitrate)
    }

    guard let best = candidates.max(by: { $0.score < $1.score }) else {
      throw StreamTransportError.audioTrackUnavailable
    }

    // Use reported contentLength or probe bytes=0-0 to obtain total stream length
    let finalContentLength: Int64
    if let len = best.contentLength, len > 0 {
      finalContentLength = len
    } else {
      finalContentLength = try await rangeClient.probeContentLength(
        url: best.url,
        headers: headers
      )
    }

    return YouTubeStreamDescriptor(
      videoId: videoId,
      sourceURL: best.url,
      headers: headers,
      contentLength: finalContentLength,
      mimeType: best.mimeType,
      contentType: "public.mpeg-4-audio",
      bitrate: best.bitrate,
      itag: best.itag
    )
  }

  private static func bestAudioStreamURL(from payload: [String: Any]) -> URL? {
    guard let streamingData = payload["streamingData"] as? [String: Any],
      let formats = streamingData["adaptiveFormats"] as? [[String: Any]] else {
      return nil
    }

    let candidates = formats.compactMap { format -> (url: URL, score: Int)? in
      // The destination is M4A. Do not save WebM or an undeciphered URL as AAC.
      guard let rawURL = format["url"] as? String,
        let url = URL(string: rawURL),
        url.scheme?.lowercased() == "https",
        let host = url.host?.lowercased(),
        host == "googlevideo.com" || host.hasSuffix(".googlevideo.com"),
        let mimeType = format["mimeType"] as? String,
        mimeType.lowercased().hasPrefix("audio/mp4") else {
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

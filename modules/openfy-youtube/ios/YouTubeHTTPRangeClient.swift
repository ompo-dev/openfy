import Foundation

public enum StreamTransportError: Error, LocalizedError {
  case nonHTTPResponse
  case http(statusCode: Int)
  case invalidContentRange
  case byteCountMismatch(expected: Int, actual: Int)
  case invalidVirtualURL
  case audioTrackUnavailable

  public var errorDescription: String? {
    switch self {
    case .nonHTTPResponse:
      return "Received non-HTTP response from media server"
    case .http(let code):
      return "HTTP error \(code) while requesting range"
    case .invalidContentRange:
      return "Invalid or missing Content-Range in 206 response"
    case .byteCountMismatch(let expected, let actual):
      return "Byte count mismatch: expected \(expected), received \(actual)"
    case .invalidVirtualURL:
      return "Invalid virtual media URL scheme"
    case .audioTrackUnavailable:
      return "No compatible AAC (audio/mp4) audio stream found for track"
    }
  }
}

private struct ContentRange {
  let start: Int64
  let end: Int64
  let total: Int64

  static func parse(_ raw: String) -> ContentRange? {
    // Format: "bytes <start>-<end>/<total>"
    let lower = raw.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
    guard lower.hasPrefix("bytes ") else { return nil }
    let clean = String(lower.dropFirst(6)).trimmingCharacters(in: .whitespaces)
    let parts = clean.components(separatedBy: "/")
    guard parts.count == 2,
          let total = Int64(parts[1].trimmingCharacters(in: .whitespaces)) else {
      return nil
    }
    let rangeParts = parts[0].components(separatedBy: "-")
    guard rangeParts.count == 2,
          let start = Int64(rangeParts[0].trimmingCharacters(in: .whitespaces)),
          let end = Int64(rangeParts[1].trimmingCharacters(in: .whitespaces)),
          start <= end else {
      return nil
    }
    return ContentRange(start: start, end: end, total: total)
  }
}

/**
 * Dedicated HTTP range request client reusing a persistent URLSession.
 * Handles deterministic 206 Partial Content byte ranges with strict Content-Range validation.
 */
public final class YouTubeHTTPRangeClient: Sendable {
  private let session: URLSession

  public init(session: URLSession) {
    self.session = session
  }

  /**
   * Fetches a specific [start, end] inclusive byte range for the given stream descriptor,
   * strictly verifying 206 status, Content-Range headers, and byte payload length.
   */
  public func request(
    descriptor: YouTubeStreamDescriptor,
    start: Int64,
    end: Int64
  ) async throws -> Data {
    var request = URLRequest(url: descriptor.sourceURL)
    request.httpMethod = "GET"
    request.cachePolicy = .reloadIgnoringLocalCacheData
    request.timeoutInterval = 30
    request.setValue("bytes=\(start)-\(end)", forHTTPHeaderField: "Range")
    request.setValue("identity", forHTTPHeaderField: "Accept-Encoding")
    for (name, value) in descriptor.headers {
      request.setValue(value, forHTTPHeaderField: name)
    }

    let (data, response) = try await session.data(for: request)
    guard let http = response as? HTTPURLResponse else {
      throw StreamTransportError.nonHTTPResponse
    }

    guard http.statusCode == 206 else {
      throw StreamTransportError.http(statusCode: http.statusCode)
    }

    guard let rangeHeader = http.value(forHTTPHeaderField: "Content-Range") ?? http.value(forHTTPHeaderField: "content-range"),
          let parsed = ContentRange.parse(rangeHeader),
          parsed.start == start,
          parsed.end == end,
          parsed.total == descriptor.contentLength else {
      throw StreamTransportError.invalidContentRange
    }

    let expectedBytes = Int(end - start + 1)
    guard data.count == expectedBytes else {
      throw StreamTransportError.byteCountMismatch(expected: expectedBytes, actual: data.count)
    }

    return data
  }

  /**
   * Probes the total content length of a Googlevideo stream using a bytes=0-0 range request.
   */
  public func probeContentLength(
    url: URL,
    headers: [String: String]
  ) async throws -> Int64 {
    var request = URLRequest(url: url)
    request.httpMethod = "GET"
    request.cachePolicy = .reloadIgnoringLocalCacheData
    request.timeoutInterval = 10
    request.setValue("bytes=0-0", forHTTPHeaderField: "Range")
    request.setValue("identity", forHTTPHeaderField: "Accept-Encoding")
    for (name, value) in headers {
      request.setValue(value, forHTTPHeaderField: name)
    }

    let (_, response) = try await session.data(for: request)
    guard let http = response as? HTTPURLResponse,
          http.statusCode == 206,
          let contentRangeHeader = http.value(forHTTPHeaderField: "Content-Range") ?? http.value(forHTTPHeaderField: "content-range"),
          let parsed = ContentRange.parse(contentRangeHeader),
          parsed.start == 0,
          parsed.end == 0 else {
      throw StreamTransportError.invalidContentRange
    }

    return parsed.total
  }
}

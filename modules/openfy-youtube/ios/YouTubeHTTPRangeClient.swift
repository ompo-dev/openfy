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

/**
 * Dedicated HTTP range request client reusing a persistent URLSession.
 * Handles deterministic 206 Partial Content byte ranges with Content-Range validation.
 */
public final class YouTubeHTTPRangeClient: Sendable {
  private let session: URLSession

  public init(session: URLSession) {
    self.session = session
  }

  /**
   * Fetches a specific [start, end] inclusive byte range for the given stream descriptor.
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
    for (name, value) in headers {
      request.setValue(value, forHTTPHeaderField: name)
    }

    let (_, response) = try await session.data(for: request)
    guard let http = response as? HTTPURLResponse,
          http.statusCode == 206,
          let contentRangeHeader = http.value(forHTTPHeaderField: "Content-Range") ?? http.value(forHTTPHeaderField: "content-range") else {
      throw StreamTransportError.invalidContentRange
    }

    // Format: "bytes 0-0/3827481"
    let parts = contentRangeHeader.components(separatedBy: "/")
    guard parts.count == 2, let total = Int64(parts[1].trimmingCharacters(in: .whitespacesAndNewlines)) else {
      throw StreamTransportError.invalidContentRange
    }

    return total
  }
}

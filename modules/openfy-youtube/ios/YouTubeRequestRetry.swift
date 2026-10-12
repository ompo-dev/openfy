import Foundation

/// Retries read-only player requests and individual byte ranges, never the whole file.
enum YouTubeRequestRetry {
  static func data(for request: URLRequest, session: URLSession, maximumAttempts: Int = 3) async throws -> (Data, URLResponse) {
    let attempts = max(1, min(3, maximumAttempts))
    for attempt in 0..<attempts {
      try Task.checkCancellation()
      do {
        let result = try await session.data(for: request)
        let status = (result.1 as? HTTPURLResponse)?.statusCode ?? 0
        if attempt == attempts - 1 || ![408, 500, 502, 503, 504].contains(status) {
          return result
        }
      } catch {
        let code = (error as NSError).code
        let transientCodes = [
          URLError.networkConnectionLost.rawValue, URLError.timedOut.rawValue,
          URLError.cannotConnectToHost.rawValue, URLError.cannotFindHost.rawValue,
          URLError.dnsLookupFailed.rawValue, URLError.notConnectedToInternet.rawValue,
        ]
        guard attempt < attempts - 1, (error as NSError).domain == NSURLErrorDomain,
          transientCodes.contains(code) else { throw error }
      }
      try await Task.sleep(nanoseconds: UInt64(300_000_000) << attempt)
    }
    throw URLError(.unknown)
  }
}

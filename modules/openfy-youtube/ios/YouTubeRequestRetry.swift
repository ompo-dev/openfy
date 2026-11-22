import Foundation

/// Retries read-only player requests and individual byte ranges, never the whole file.
enum YouTubeRequestRetry {
  /// Keep a pending AVAsset resource request alive across a brief connection
  /// interruption. If enough verified bytes are already cached, the caller
  /// returns immediately; otherwise only transient transport errors are retried.
  static func withConnectivityGrace<T: Sendable>(
    seconds: TimeInterval = 15,
    retryDelayNanoseconds: UInt64 = 450_000_000,
    operation: @escaping @Sendable () async throws -> T
  ) async throws -> T {
    let deadline = Date().addingTimeInterval(max(0, seconds))
    var failedAttempts = 0
    while true {
      try Task.checkCancellation()
      do {
        return try await operation()
      } catch {
        let errorInfo = error as NSError
        let retryable: Set<Int> = [
          URLError.networkConnectionLost.rawValue, URLError.notConnectedToInternet.rawValue,
          URLError.timedOut.rawValue, URLError.cannotConnectToHost.rawValue,
          URLError.cannotFindHost.rawValue, URLError.dnsLookupFailed.rawValue,
        ]
        guard errorInfo.domain == NSURLErrorDomain, retryable.contains(errorInfo.code),
              Date() < deadline else { throw error }
        failedAttempts += 1
        // Bounded delays avoid a busy loop and do not block AVPlayer's queue.
        let delay = min(retryDelayNanoseconds * UInt64(min(failedAttempts, 3)), 1_500_000_000)
        try await Task.sleep(nanoseconds: delay)
      }
    }
  }

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

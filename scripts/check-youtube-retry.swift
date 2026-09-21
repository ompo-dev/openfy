import Foundation

final class RetryProtocol: URLProtocol {
  static var outcomes: [Result<Int, URLError>] = []
  static var requests: [URLRequest] = []

  override class func canInit(with request: URLRequest) -> Bool { true }
  override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
  override func stopLoading() {}

  override func startLoading() {
    Self.requests.append(request)
    switch Self.outcomes.removeFirst() {
    case .failure(let error):
      client?.urlProtocol(self, didFailWithError: error)
    case .success(let status):
      let response = HTTPURLResponse(url: request.url!, statusCode: status,
        httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "audio/mp4"])!
      client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
      client?.urlProtocol(self, didLoad: Data([1, 2, 3]))
      client?.urlProtocolDidFinishLoading(self)
    }
  }
}

@main
struct CheckYouTubeRetry {
  static func main() async throws {
    let config = URLSessionConfiguration.ephemeral
    config.protocolClasses = [RetryProtocol.self]
    let session = URLSession(configuration: config)
    defer { session.invalidateAndCancel() }
    var request = URLRequest(url: URL(string: "https://media.invalid/audio")!)
    request.setValue("bytes=1048576-2097151", forHTTPHeaderField: "Range")

    RetryProtocol.outcomes = [.failure(URLError(.networkConnectionLost)), .success(206)]
    let recovered = try await YouTubeRequestRetry.data(for: request, session: session)
    precondition(recovered.0 == Data([1, 2, 3]))
    precondition(RetryProtocol.requests.count == 2)
    precondition(RetryProtocol.requests.allSatisfy {
      $0.value(forHTTPHeaderField: "Range") == "bytes=1048576-2097151"
    })

    RetryProtocol.requests = []
    RetryProtocol.outcomes = [.success(503), .success(206)]
    let retriedHTTP = try await YouTubeRequestRetry.data(for: request, session: session)
    precondition((retriedHTTP.1 as? HTTPURLResponse)?.statusCode == 206)
    precondition(RetryProtocol.requests.count == 2)

    RetryProtocol.requests = []
    RetryProtocol.outcomes = [.success(403)]
    let refused = try await YouTubeRequestRetry.data(for: request, session: session)
    precondition((refused.1 as? HTTPURLResponse)?.statusCode == 403)
    precondition(RetryProtocol.requests.count == 1)

    RetryProtocol.requests = []
    RetryProtocol.outcomes = Array(repeating: .failure(URLError(.networkConnectionLost)), count: 3)
    do {
      _ = try await YouTubeRequestRetry.data(for: request, session: session)
      preconditionFailure("An exhausted retry must throw")
    } catch {
      precondition((error as NSError).code == URLError.networkConnectionLost.rawValue)
      precondition(RetryProtocol.requests.count == 3)
    }

    RetryProtocol.requests = []
    RetryProtocol.outcomes = [.failure(URLError(.cancelled))]
    do {
      _ = try await YouTubeRequestRetry.data(for: request, session: session)
      preconditionFailure("Cancellation must not retry")
    } catch {
      precondition((error as NSError).code == URLError.cancelled.rawValue)
      precondition(RetryProtocol.requests.count == 1)
    }
    print("Native retry checks passed: lost connection, exact range, 503, 403, bounded retries, cancellation")
  }
}

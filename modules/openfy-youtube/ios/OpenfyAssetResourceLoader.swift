@preconcurrency import AVFoundation
import Foundation

/**
 * Custom AVAssetResourceLoaderDelegate intercepting virtual `openfy-stream://` URLs.
 * Translates AVPlayer byte range requests into deterministic HTTP 206 chunk range requests.
 *
 * NOTE: All delegate callbacks from AVFoundation execute on `loader.queue`.
 * Do NOT dispatch synchronously (`queue.sync`) within delegate callbacks as it causes deadlocks.
 */
public final class OpenfyAssetResourceLoader: NSObject, AVAssetResourceLoaderDelegate {
  public let queue = DispatchQueue(label: "openfy.youtube.resource-loader", qos: .userInitiated)
  private let descriptor: YouTubeStreamDescriptor
  private let rangeClient: YouTubeHTTPRangeClient
  private let chunkSize: Int64 = 1024 * 1024 // 1 MB chunks
  private var tasks: [ObjectIdentifier: Task<Void, Never>] = [:]

  public init(
    descriptor: YouTubeStreamDescriptor,
    rangeClient: YouTubeHTTPRangeClient
  ) {
    self.descriptor = descriptor
    self.rangeClient = rangeClient
    super.init()
  }

  public func resourceLoader(
    _ resourceLoader: AVAssetResourceLoader,
    shouldWaitForLoadingOfRequestedResource loadingRequest: AVAssetResourceLoadingRequest
  ) -> Bool {
    if let infoRequest = loadingRequest.contentInformationRequest {
      fillContentInformation(infoRequest)
    }

    guard let dataRequest = loadingRequest.dataRequest else {
      loadingRequest.finishLoading()
      return true
    }

    let requestKey = ObjectIdentifier(loadingRequest)

    // Keep strong reference to loadingRequest inside Task until finishLoading() / cancellation
    let task = Task { [weak self, loadingRequest] in
      guard let self = self else { return }
      defer {
        self.queue.async { [weak self] in
          self?.tasks.removeValue(forKey: requestKey)
        }
      }

      do {
        try await self.satisfy(loadingRequest, dataRequest: dataRequest)
      } catch is CancellationError {
        // Loading request was cancelled by AVFoundation (e.g. user seeked or changed track)
      } catch {
        loadingRequest.finishLoading(with: error)
      }
    }

    // Already executing on loader.queue — mutate tasks dictionary directly
    tasks[requestKey] = task
    return true
  }

  public func resourceLoader(
    _ resourceLoader: AVAssetResourceLoader,
    didCancel loadingRequest: AVAssetResourceLoadingRequest
  ) {
    let requestKey = ObjectIdentifier(loadingRequest)
    // Already executing on loader.queue — remove and cancel task directly
    if let task = tasks.removeValue(forKey: requestKey) {
      task.cancel()
    }
  }

  /**
   * Explicitly cancels all in-flight network requests and empties task dictionary.
   */
  public func cancelAll() {
    queue.async { [weak self] in
      guard let self = self else { return }
      let activeTasks = Array(self.tasks.values)
      self.tasks.removeAll()
      activeTasks.forEach { $0.cancel() }
    }
  }

  private func fillContentInformation(_ request: AVAssetResourceLoadingContentInformationRequest) {
    request.contentType = descriptor.contentType
    request.contentLength = descriptor.contentLength
    request.isByteRangeAccessSupported = true
  }

  private func satisfy(
    _ loadingRequest: AVAssetResourceLoadingRequest,
    dataRequest: AVAssetResourceLoadingDataRequest
  ) async throws {
    var offset = max(dataRequest.currentOffset, dataRequest.requestedOffset)
    let targetEnd: Int64
    if dataRequest.requestsAllDataToEndOfResource {
      targetEnd = descriptor.contentLength - 1
    } else {
      targetEnd = min(
        dataRequest.requestedOffset + Int64(dataRequest.requestedLength) - 1,
        descriptor.contentLength - 1
      )
    }

    while offset <= targetEnd {
      try Task.checkCancellation()
      let end = min(offset + chunkSize - 1, targetEnd)
      let data = try await rangeClient.request(
        descriptor: descriptor,
        start: offset,
        end: end
      )
      try Task.checkCancellation()
      dataRequest.respond(with: data)
      offset += Int64(data.count)
    }

    loadingRequest.finishLoading()
  }
}

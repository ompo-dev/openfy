@preconcurrency import AVFoundation
import Foundation

/**
 * Custom AVAssetResourceLoaderDelegate intercepting virtual `openfy-stream://` URLs.
 * Translates AVPlayer byte range requests into deterministic HTTP 206 chunk range requests.
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
    let task = Task { [weak self, weak loadingRequest] in
      guard let self = self, let loadingRequest = loadingRequest else { return }
      do {
        try await self.satisfy(loadingRequest, dataRequest: dataRequest)
      } catch is CancellationError {
        // Loading request was cancelled (e.g. user seeked or changed track)
      } catch {
        loadingRequest.finishLoading(with: error)
      }
    }

    queue.sync {
      tasks[requestKey] = task
    }

    return true
  }

  public func resourceLoader(
    _ resourceLoader: AVAssetResourceLoader,
    didCancel loadingRequest: AVAssetResourceLoadingRequest
  ) {
    let requestKey = ObjectIdentifier(loadingRequest)
    queue.sync {
      if let task = tasks.removeValue(forKey: requestKey) {
        task.cancel()
      }
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

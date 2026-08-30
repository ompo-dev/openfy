import Foundation

/**
 * Immutably represents a resolved YouTube audio stream ready for native range consumption.
 * Encapsulates the video ID, signed Googlevideo URL, required identity headers, Content-Length,
 * and media UTI type.
 */
public struct YouTubeStreamDescriptor: Sendable {
  public let videoId: String
  public let sourceURL: URL
  public let headers: [String: String]
  public let contentLength: Int64
  public let mimeType: String
  public let contentType: String
  public let bitrate: Int
  public let itag: Int?

  public init(
    videoId: String,
    sourceURL: URL,
    headers: [String: String],
    contentLength: Int64,
    mimeType: String,
    contentType: String = "public.mpeg-4-audio",
    bitrate: Int,
    itag: Int? = nil
  ) {
    self.videoId = videoId
    self.sourceURL = sourceURL
    self.headers = headers
    self.contentLength = contentLength
    self.mimeType = mimeType
    self.contentType = contentType
    self.bitrate = bitrate
    self.itag = itag
  }
}

package expo.modules.openfyyoutube

import android.net.Uri
import com.facebook.react.modules.network.OkHttpClientProvider
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.functions.Coroutine
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.Headers
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.Request
import okhttp3.Response
import java.io.File
import java.io.FileOutputStream
import java.io.IOException

/**
 * Mirrors the BitChord transport boundary on Android: one OkHttp client owns
 * every googlevideo byte-range request, instead of mixing resolver and Expo
 * file-download transports that may present different request identities.
 */
class OpenfyYouTubeModule : Module() {
  private val client by lazy {
    // React Native's fetch path also starts here. Cloning retains the shared
    // connection pool and cookie jar while keeping this module's requests
    // isolated from unrelated interceptors.
    OkHttpClientProvider.getOkHttpClient()
      .newBuilder()
      .retryOnConnectionFailure(true)
      .followRedirects(true)
      .followSslRedirects(true)
      .build()
  }

  private val reactContext
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("OpenfyYouTube")

    AsyncFunction("downloadGoogleVideoAsync") Coroutine {
        url: String,
        destination: String,
        headers: Map<String, String>,
        chunkBytes: Int ->
      withContext(Dispatchers.IO) {
        download(url, destination, headers, chunkBytes)
      }
    }
  }

  private fun download(
    rawUrl: String,
    rawDestination: String,
    headers: Map<String, String>,
    chunkBytes: Int
  ): Map<String, Any> {
    require(chunkBytes in MINIMUM_CHUNK_BYTES..MAXIMUM_CHUNK_BYTES) {
      "OpenfyYouTube transfer failed: invalid_chunk_size"
    }
    val sourceUrl = validatedGoogleVideoUrl(rawUrl)
    val destination = validatedDestination(rawDestination)
    destination.parentFile?.mkdirs()
    if (destination.exists() && !destination.delete()) {
      throw IOException("OpenfyYouTube transfer failed: cannot_replace_destination")
    }

    val initial = requestRange(sourceUrl, headers, 0L, (chunkBytes - 1).toLong())
    initial.response.use { response ->
      val responseHeaders = selectedHeaders(response.headers)
      val mimeType = response.header("Content-Type")
      if (response.code !in 200..299) {
        return failureResult(response.code, mimeType, responseHeaders)
      }
      if (!isAudioContentType(mimeType)) {
        return failureResult(response.code, mimeType, responseHeaders)
      }

      FileOutputStream(destination, false).use { output ->
        if (response.code == 200) {
          val bytes = copyBody(response, output)
          return successResult(destination, response.code, mimeType, responseHeaders, bytes)
        }

        val initialRange = parseContentRange(response.header("Content-Range"))
          ?: throw IOException("OpenfyYouTube transfer failed: invalid_initial_content_range")
        require(initialRange.start == 0L && initialRange.total > initialRange.end) {
          "OpenfyYouTube transfer failed: invalid_initial_content_range"
        }
        val initialBytes = copyBody(response, output)
        require(initialBytes == initialRange.end - initialRange.start + 1) {
          "OpenfyYouTube transfer failed: invalid_initial_content_range"
        }

        var nextByte = initialRange.end + 1
        while (nextByte < initialRange.total) {
          val endByte = minOf(nextByte + chunkBytes - 1L, initialRange.total - 1)
          val next = requestRange(sourceUrl, headers, nextByte, endByte)
          next.response.use { rangeResponse ->
            val rangeHeaders = selectedHeaders(rangeResponse.headers)
            val rangeMimeType = rangeResponse.header("Content-Type")
            if (rangeResponse.code != 206) {
              output.close()
              destination.delete()
              return failureResult(
                rangeResponse.code,
                rangeMimeType,
                rangeHeaders,
                initialRange.total
              )
            }
            val contentRange = parseContentRange(rangeResponse.header("Content-Range"))
              ?: throw IOException("OpenfyYouTube transfer failed: invalid_follow_up_content_range")
            require(
              isAudioContentType(rangeMimeType) &&
                contentRange.start == nextByte &&
                contentRange.end == endByte &&
                contentRange.total == initialRange.total
            ) {
              "OpenfyYouTube transfer failed: invalid_follow_up_content_range"
            }
            val bytes = copyBody(rangeResponse, output)
            require(bytes == contentRange.end - contentRange.start + 1) {
              "OpenfyYouTube transfer failed: invalid_follow_up_content_range"
            }
            nextByte = contentRange.end + 1
          }
        }
        return successResult(
          destination,
          response.code,
          mimeType,
          responseHeaders,
          initialRange.total
        )
      }
    }
  }

  private fun requestRange(
    url: HttpUrl,
    headers: Map<String, String>,
    start: Long,
    end: Long
  ): RangeResponse {
    val request = Request.Builder()
      .url(url)
      .get()
      .header("Range", "bytes=$start-$end")
      .header("Accept-Encoding", "identity")
      .apply {
        headers
          .filter { (name, value) -> name.isNotBlank() && value.isNotBlank() }
          .forEach { (name, value) -> header(name, value) }
      }
      .build()
    return RangeResponse(client.newCall(request).execute())
  }

  private fun copyBody(response: Response, output: FileOutputStream): Long {
    val body = response.body ?: throw IOException("OpenfyYouTube transfer failed: missing_body")
    return body.byteStream().use { input ->
      val buffer = ByteArray(BUFFER_BYTES)
      var total = 0L
      while (true) {
        val read = input.read(buffer)
        if (read <= 0) break
        output.write(buffer, 0, read)
        total += read
      }
      output.flush()
      total
    }
  }

  private fun validatedGoogleVideoUrl(rawUrl: String): HttpUrl {
    val url = rawUrl.toHttpUrlOrNull()
      ?: throw IllegalArgumentException("OpenfyYouTube transfer failed: invalid_googlevideo_url")
    require(url.isHttps && (url.host == "googlevideo.com" || url.host.endsWith(".googlevideo.com"))) {
      "OpenfyYouTube transfer failed: invalid_googlevideo_url"
    }
    return url
  }

  private fun validatedDestination(rawDestination: String): File {
    val uri = Uri.parse(rawDestination)
    require(uri.scheme == "file" && !uri.path.isNullOrBlank()) {
      "OpenfyYouTube transfer failed: invalid_destination"
    }
    val destination = File(uri.path!!).canonicalFile
    val root = reactContext.filesDir.canonicalFile
    require(destination.path.startsWith("${root.path}${File.separator}")) {
      "OpenfyYouTube transfer failed: destination_outside_documents"
    }
    return destination
  }

  private fun selectedHeaders(headers: Headers): Map<String, String> =
    headers.names()
      .filter { it.lowercase() in RESPONSE_HEADER_NAMES }
      .associateWith { headers[it].orEmpty() }

  private fun isAudioContentType(value: String?): Boolean {
    if (value.isNullOrBlank()) return true
    val normalized = value.substringBefore(';').trim().lowercase()
    return normalized.startsWith("audio/") ||
      normalized.startsWith("video/") ||
      normalized == "application/octet-stream"
  }

  private fun parseContentRange(value: String?): ContentRange? {
    val match = CONTENT_RANGE.matchEntire(value?.trim().orEmpty()) ?: return null
    val start = match.groupValues[1].toLongOrNull() ?: return null
    val end = match.groupValues[2].toLongOrNull() ?: return null
    val total = match.groupValues[3].toLongOrNull() ?: return null
    if (start < 0 || end < start || total <= end) return null
    return ContentRange(start, end, total)
  }

  private fun successResult(
    destination: File,
    status: Int,
    mimeType: String?,
    headers: Map<String, String>,
    totalBytes: Long
  ): Map<String, Any> = buildMap {
    put("uri", Uri.fromFile(destination).toString())
    put("status", status)
    mimeType?.let { put("mimeType", it) }
    if (headers.isNotEmpty()) put("headers", headers)
    put("totalBytes", totalBytes.toDouble())
  }

  private fun failureResult(
    status: Int,
    mimeType: String?,
    headers: Map<String, String>,
    totalBytes: Long? = null
  ): Map<String, Any> = buildMap {
    put("status", status)
    mimeType?.let { put("mimeType", it) }
    if (headers.isNotEmpty()) put("headers", headers)
    totalBytes?.let { put("totalBytes", it.toDouble()) }
  }

  private data class RangeResponse(val response: Response)

  private data class ContentRange(val start: Long, val end: Long, val total: Long)

  companion object {
    private const val MINIMUM_CHUNK_BYTES = 64 * 1024
    private const val MAXIMUM_CHUNK_BYTES = 4 * 1024 * 1024
    private const val BUFFER_BYTES = 64 * 1024
    private val CONTENT_RANGE = Regex("^bytes\\s+(\\d+)-(\\d+)/(\\d+)$", RegexOption.IGNORE_CASE)
    private val RESPONSE_HEADER_NAMES = setOf(
      "content-type", "content-length", "content-range", "accept-ranges", "date", "server"
    )
  }
}

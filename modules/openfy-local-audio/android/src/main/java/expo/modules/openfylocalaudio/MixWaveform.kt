package expo.modules.openfylocalaudio

import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.AudioFormat
import android.net.Uri
import java.io.File
import java.nio.ByteOrder
import kotlin.math.abs

internal object MixWaveform {
  fun read(uri: String, bins: Int): List<Float> {
    val url = Uri.parse(uri)
    require(url.scheme == "file")
    val file = File(requireNotNull(url.path))
    require(file.isFile)
    val extractor = MediaExtractor()
    var decoder: MediaCodec? = null
    try {
      extractor.setDataSource(file.absolutePath)
      val index = (0 until extractor.trackCount).first { extractor.getTrackFormat(it).getString(MediaFormat.KEY_MIME)?.startsWith("audio/") == true }
      val format = extractor.getTrackFormat(index)
      val duration = format.getLong(MediaFormat.KEY_DURATION)
      require(duration > 0)
      extractor.selectTrack(index)
      val codec = MediaCodec.createDecoderByType(requireNotNull(format.getString(MediaFormat.KEY_MIME)))
      decoder = codec
      codec.configure(format, null, null, 0)
      codec.start()
      val peaks = FloatArray(bins.coerceIn(32, 2048))
      val info = MediaCodec.BufferInfo()
      var inputEnded = false
      var ended = false
      var sampleRate = format.getInteger(MediaFormat.KEY_SAMPLE_RATE)
      var channels = format.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
      var encoding = AudioFormat.ENCODING_PCM_16BIT
      var idle = 0
      while (!ended) {
        if (!inputEnded) {
          val input = codec.dequeueInputBuffer(10000)
          if (input >= 0) {
            val buffer = requireNotNull(codec.getInputBuffer(input))
            buffer.clear()
            val size = extractor.readSampleData(buffer, 0)
            if (size < 0) {
              codec.queueInputBuffer(input, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
              inputEnded = true
            } else {
              codec.queueInputBuffer(input, 0, size, extractor.sampleTime, 0)
              extractor.advance()
            }
          }
        }
        val output = codec.dequeueOutputBuffer(info, 10000)
        if (output == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
          val decoded = codec.outputFormat
          sampleRate = decoded.getInteger(MediaFormat.KEY_SAMPLE_RATE)
          channels = decoded.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
          encoding = if (decoded.containsKey(MediaFormat.KEY_PCM_ENCODING)) decoded.getInteger(MediaFormat.KEY_PCM_ENCODING) else AudioFormat.ENCODING_PCM_16BIT
          require(encoding == AudioFormat.ENCODING_PCM_16BIT || encoding == AudioFormat.ENCODING_PCM_FLOAT)
        }
        if (output >= 0) {
          idle = 0
          val buffer = codec.getOutputBuffer(output)
          if (buffer != null && info.size > 0) {
            buffer.position(info.offset)
            buffer.limit(info.offset + info.size)
            buffer.order(ByteOrder.nativeOrder())
            val bytes = if (encoding == AudioFormat.ENCODING_PCM_FLOAT) 4 else 2
            var sample = 0L
            while (buffer.remaining() >= bytes) {
              val amplitude = if (bytes == 4) abs(buffer.float) else abs(buffer.short.toInt()) / 32768f
              val time = info.presentationTimeUs + sample / channels * 1000000L / sampleRate
              val bin = (time * peaks.size / duration).toInt().coerceIn(0, peaks.lastIndex)
              peaks[bin] = maxOf(peaks[bin], amplitude.coerceIn(0f, 1f))
              sample++
            }
          }
          ended = info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0
          codec.releaseOutputBuffer(output, false)
        } else if (++idle > 1500) error("Decoder de waveform não respondeu.")
      }
      return peaks.toList()
    } finally {
      decoder?.release()
      extractor.release()
    }
  }
}

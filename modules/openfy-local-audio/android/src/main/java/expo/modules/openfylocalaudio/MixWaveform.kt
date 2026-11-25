package expo.modules.openfylocalaudio

import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.AudioFormat
import android.net.Uri
import java.io.File
import java.nio.ByteOrder
import kotlin.math.abs
import kotlin.math.sqrt
import kotlin.math.exp
import kotlin.math.ceil

internal object MixWaveform {
  fun read(uri: String, bins: Int, rhythm: Boolean = false): List<Float> {
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
      val count = if (rhythm) ceil(duration / 10000.0).toInt().coerceAtLeast(1) else bins.coerceIn(32, 32768)
      require(count <= 360000)
      val peaks = FloatArray(count)
      val detailed = !rhythm && peaks.size > 2048
      val energy = DoubleArray(if (detailed) peaks.size else 0)
      val sampleCounts = IntArray(if (detailed) peaks.size else 0)
      val info = MediaCodec.BufferInfo()
      var inputEnded = false
      var ended = false
      var sampleRate = format.getInteger(MediaFormat.KEY_SAMPLE_RATE)
      var channels = format.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
      var low = DoubleArray(channels)
      var mid = DoubleArray(channels)
      var lowAlpha = 1 - exp(-2 * Math.PI * 150 / sampleRate)
      var midAlpha = 1 - exp(-2 * Math.PI * 1800 / sampleRate)
      val bands = DoubleArray(if (rhythm) count * 3 else 0)
      val rhythmCounts = IntArray(if (rhythm) count else 0)
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
          low = DoubleArray(channels); mid = DoubleArray(channels)
          lowAlpha = 1 - exp(-2 * Math.PI * 150 / sampleRate)
          midAlpha = 1 - exp(-2 * Math.PI * 1800 / sampleRate)
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
              val signed = if (bytes == 4) buffer.float else buffer.short.toInt() / 32768f
              val amplitude = abs(signed)
              val time = info.presentationTimeUs + sample / channels * 1000000L / sampleRate
              val bin = (if (rhythm) time / 10000L else time * peaks.size / duration).toInt().coerceIn(0, peaks.lastIndex)
              val value = amplitude.coerceIn(0f, 1f)
              if (rhythm) {
                val channel = (sample % channels).toInt()
                val s = signed.toDouble()
                low[channel] += lowAlpha * (s - low[channel])
                mid[channel] += midAlpha * (s - mid[channel])
                val a = low[channel]; val b = mid[channel] - a; val c = s - mid[channel]
                bands[bin * 3] += a * a; bands[bin * 3 + 1] += b * b; bands[bin * 3 + 2] += c * c
                rhythmCounts[bin]++
              } else if (detailed) {
                energy[bin] += value.toDouble() * value
                sampleCounts[bin]++
              } else peaks[bin] = maxOf(peaks[bin], value)
              sample++
            }
          }
          ended = info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0
          codec.releaseOutputBuffer(output, false)
        } else if (++idle > 1500) error("Decoder de waveform não respondeu.")
      }
      if (rhythm) return bands.mapIndexed { i, value -> sqrt(value / rhythmCounts[i / 3].coerceAtLeast(1)).toFloat() }
      if (detailed) for (i in peaks.indices) if (sampleCounts[i] > 0) peaks[i] = sqrt(energy[i] / sampleCounts[i]).toFloat()
      return peaks.toList()
    } finally {
      decoder?.release()
      extractor.release()
    }
  }
}

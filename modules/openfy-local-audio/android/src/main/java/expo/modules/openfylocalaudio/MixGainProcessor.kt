package expo.modules.openfylocalaudio

import androidx.media3.common.C
import androidx.media3.common.audio.AudioProcessor
import androidx.media3.common.audio.BaseAudioProcessor
import androidx.media3.common.util.UnstableApi
import java.nio.ByteBuffer

/** Applies the same clip-relative gain envelope as the editor and iOS renderer. */
@UnstableApi
internal class MixGainProcessor(private val points: List<Pair<Double, Double>>) : BaseAudioProcessor() {
  private var frames = 0L
  private var point = 0
  override fun onConfigure(inputAudioFormat: AudioProcessor.AudioFormat): AudioProcessor.AudioFormat {
    if (inputAudioFormat.encoding != C.ENCODING_PCM_16BIT) throw AudioProcessor.UnhandledAudioFormatException(inputAudioFormat)
    return inputAudioFormat
  }
  override fun onFlush(streamMetadata: AudioProcessor.StreamMetadata) { frames = 0; point = 0 }
  override fun queueInput(inputBuffer: ByteBuffer) {
    val output = replaceOutputBuffer(inputBuffer.remaining())
    val channels = inputAudioFormat.channelCount
    require(inputBuffer.remaining() % (channels * 2) == 0)
    while (inputBuffer.hasRemaining()) {
      val ms = frames * 1000.0 / inputAudioFormat.sampleRate
      while (point + 1 < points.lastIndex && ms >= points[point + 1].first) point++
      val a = points[point]; val b = points[point + 1]
      val fraction = ((ms - a.first) / (b.first - a.first)).coerceIn(0.0, 1.0)
      val gain = a.second + (b.second - a.second) * fraction
      repeat(channels) { output.putShort((inputBuffer.short * gain).toInt().coerceIn(-32768, 32767).toShort()) }
      frames++
    }
    output.flip()
  }
}

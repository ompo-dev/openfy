package expo.modules.openfylocalaudio

import android.net.Uri
import android.os.Handler
import android.os.Looper
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.audio.ChannelMixingAudioProcessor
import androidx.media3.common.audio.ChannelMixingMatrix
import androidx.media3.common.audio.SonicAudioProcessor
import androidx.media3.common.audio.ToInt16PcmAudioProcessor
import androidx.media3.common.util.UnstableApi
import androidx.media3.transformer.Composition
import androidx.media3.transformer.EditedMediaItem
import androidx.media3.transformer.EditedMediaItemSequence
import androidx.media3.transformer.Effects
import androidx.media3.transformer.ExportException
import androidx.media3.transformer.ExportResult
import androidx.media3.transformer.Transformer
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

@UnstableApi
class OpenfyLocalAudioModule : Module() {
  private val handler = Handler(Looper.getMainLooper())
  private val exports = mutableSetOf<Transformer>()

  override fun definition() = ModuleDefinition {
    Name("OpenfyLocalAudio")
    Constant("supportsMixLanes") { true }
    Constant("supportsMixGaps") { true }
    Constant("supportsMixEffects") { true }
    Constant("supportsDetailedWaveform") { true }
    AsyncFunction("waveformAsync") { uri: String, bins: Int ->
      MixWaveform.read(uri, bins)
    }
    AsyncFunction("rhythmAsync") { uri: String ->
      MixWaveform.read(uri, 32, true)
    }
    AsyncFunction("renderMixAsync") { clips: List<Map<String, Any>>, outputURI: String, promise: Promise ->
      handler.post {
        var output: File? = null
        var transformer: Transformer? = null
        try {
          val context = requireNotNull(appContext.reactContext)
          val destination = Uri.parse(outputURI)
          require(destination.scheme == "file")
          val candidate = File(requireNotNull(destination.path)).canonicalFile
          require(candidate.parentFile == File(context.cacheDir, "openfy-mixes").canonicalFile && !candidate.exists())
          output = candidate
          require(clips.isNotEmpty() && clips.size <= 200)
          val lanes = clips.groupBy { (it["lane"] as? Number)?.toInt() ?: 0 }
          require(lanes.keys.all { it in 0..7 })
          val sequences = lanes.toSortedMap().values.map { lane ->
            val sequence = EditedMediaItemSequence.Builder(setOf(C.TRACK_TYPE_AUDIO))
            var durationMs = 0.0
            lane.forEach { clip ->
            val uri = Uri.parse(clip["uri"] as String)
            val start = (clip["startMs"] as Number).toDouble()
            val end = (clip["endMs"] as Number).toDouble()
            val volume = (clip["volume"] as Number).toDouble()
            require(uri.scheme == "file" && File(requireNotNull(uri.path)).isFile)
            require(start.isFinite() && end.isFinite() && volume.isFinite() && start >= 0 && end - start >= 100 && volume in 0.0..1.0)
            val gap = (clip["gapBeforeMs"] as? Number)?.toDouble() ?: 0.0
            require(gap.isFinite() && gap in 0.0..86400000.0)
            durationMs += gap + end - start
            require(durationMs <= 86400000.0)
            if (gap > 0) sequence.addGap((gap * 1000).toLong())
            val media = MediaItem.Builder().setUri(uri).setClippingConfiguration(
              MediaItem.ClippingConfiguration.Builder().setStartPositionMs(start.toLong()).setEndPositionMs(end.toLong()).build()
            ).build()
            val envelope = (clip["envelope"] as? List<*>)?.map { entry ->
              val point = entry as Map<*, *>
              (point["ms"] as Number).toDouble() to (point["gain"] as Number).toDouble()
            }
            if (envelope != null) {
              require(envelope.size in 2..30000 && envelope.first().first == 0.0 &&
                envelope.all { it.first.isFinite() && it.first in 0.0..(end - start + 1) && it.second.isFinite() && it.second in 0.0..1.0 } &&
                envelope.zipWithNext().all { it.first.first < it.second.first })
            }
            val staticGain = if (envelope == null) volume.toFloat() else 1f
            val channels = ChannelMixingAudioProcessor().apply {
              putChannelMixingMatrix(ChannelMixingMatrix.create(1, 2).scaleBy(staticGain / lanes.size))
              putChannelMixingMatrix(ChannelMixingMatrix.create(2, 2).scaleBy(staticGain / lanes.size))
            }
            val resample = SonicAudioProcessor().apply { setOutputSampleRateHz(44100) }
            sequence.addItem(EditedMediaItem.Builder(media).setRemoveVideo(true)
              .setEffects(Effects(listOf(ToInt16PcmAudioProcessor()) + (if (envelope != null) listOf(MixGainProcessor(envelope)) else emptyList()) + listOf(channels, resample), emptyList())).build())
            }
            sequence.build()
          }
          val target = output
          val composition = Composition.Builder(sequences).build()
          transformer = Transformer.Builder(context).setAudioMimeType(MimeTypes.AUDIO_AAC)
            .addListener(object : Transformer.Listener {
              override fun onCompleted(composition: Composition, result: ExportResult) {
                transformer?.let { exports.remove(it) }
                promise.resolve(mapOf("uri" to outputURI, "durationMs" to result.durationMs))
              }
              override fun onError(composition: Composition, result: ExportResult, error: ExportException) {
                transformer?.let { exports.remove(it) }
                target?.delete()
                promise.reject("ERR_MIX_RENDER", "Não foi possível compor o mix.", error)
              }
            }).build()
          exports.add(transformer!!)
          transformer!!.start(composition, target!!.absolutePath)
        } catch (error: Exception) {
          transformer?.let { exports.remove(it); it.cancel() }
          output?.delete()
          promise.reject("ERR_MIX_RENDER", "Não foi possível preparar os arquivos locais do mix.", error)
        }
      }
    }
    OnDestroy {
      handler.post { exports.forEach { it.cancel() }; exports.clear() }
    }
  }
}

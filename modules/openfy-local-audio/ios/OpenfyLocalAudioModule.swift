@preconcurrency import ExpoModulesCore

public final class OpenfyLocalAudioModule: Module {
  private static let repairs = LocalAudioRepairCoordinator()

  public func definition() -> ModuleDefinition {
    Name("OpenfyLocalAudio")
    Constants(["supportsMixLanes": true, "supportsMixGaps": true, "supportsMixEffects": true, "supportsDetailedWaveform": true])

    AsyncFunction("waveformAsync") { (uri: String, bins: Int) async throws -> [Float] in
      try MixAudioRenderer.waveform(uri: uri, bins: bins)
    }
    AsyncFunction("rhythmAsync") { (uri: String) async throws -> [Float] in
      try MixAudioRenderer.waveform(uri: uri, bins: 32, rhythm: true)
    }

    AsyncFunction("renderMixAsync") { (clips: [[String: Any]], outputURI: String) async throws -> [String: Any] in
      try await MixAudioRenderer.render(clips: clips, outputURI: outputURI)
    }

    AsyncFunction("repairLocalAudioAsync") { (uri: String) async throws -> [String: Any] in
      let result = try await Self.repairs.repair(uri: uri)
      var response: [String: Any] = [
        "uri": result.uri,
        "repaired": result.repaired,
        "protectionRelaxed": result.protectionRelaxed,
        "reason": result.repaired ? "dash-remux" : "already-compatible",
      ]
      if let protectionBefore = result.protectionBefore { response["protectionBefore"] = protectionBefore }
      if let protectionAfter = result.protectionAfter { response["protectionAfter"] = protectionAfter }
      if let duration = result.durationMs { response["durationMs"] = duration }
      if let duration = result.originalDurationMs { response["originalDurationMs"] = duration }
      return response
    }
  }
}

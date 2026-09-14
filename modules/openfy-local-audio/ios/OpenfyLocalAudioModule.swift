@preconcurrency import ExpoModulesCore

public final class OpenfyLocalAudioModule: Module {
  private static let repairs = LocalAudioRepairCoordinator()

  public func definition() -> ModuleDefinition {
    Name("OpenfyLocalAudio")

    AsyncFunction("repairLocalAudioAsync") { (uri: String) async throws -> [String: Any] in
      let result = try await Self.repairs.repair(uri: uri)
      var response: [String: Any] = [
        "uri": result.uri,
        "repaired": result.repaired,
        "reason": result.repaired ? "dash-remux" : "already-compatible",
      ]
      if let duration = result.durationMs { response["durationMs"] = duration }
      if let duration = result.originalDurationMs { response["originalDurationMs"] = duration }
      return response
    }
  }
}

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

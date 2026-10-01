import AppIntents
import Foundation

struct PlayerWidgetActionIntent: AppIntent {
  static var title: LocalizedStringResource = "Controlar Openfy"
  static var openAppWhenRun = true

  @Parameter(title: "Ação") var action: String

  init() {}

  init(action: String) {
    self.action = action
  }

  @MainActor
  func perform() async throws -> some IntentResult & OpensIntent {
    let encodedAction = action.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? action
    let url = URL(string: "openfy://widget/\(encodedAction)")!
    return .result(opensIntent: OpenURLIntent(url))
  }
}

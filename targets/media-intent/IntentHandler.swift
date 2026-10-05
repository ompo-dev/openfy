@preconcurrency import Intents

final class IntentHandler: INExtension, INPlayMediaIntentHandling {
  override func handler(for intent: INIntent) -> Any { self }

  func handle(intent: INPlayMediaIntent, completion: @escaping (INPlayMediaIntentResponse) -> Void) {
    // Audio and React Native live in the host app, not in this short-lived extension.
    completion(INPlayMediaIntentResponse(code: .handleInApp, userActivity: nil))
  }
}

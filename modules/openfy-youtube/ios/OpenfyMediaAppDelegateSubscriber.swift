@preconcurrency import ExpoModulesCore
@preconcurrency import Intents
import UIKit

public final class OpenfyMediaAppDelegateSubscriber: ExpoAppDelegateSubscriber {
  public func application(_ application: UIApplication, continue userActivity: NSUserActivity,
    restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
    guard let intent = userActivity.interaction?.intent as? INPlayMediaIntent,
      let id = intent.mediaContainer?.identifier ?? intent.mediaItems?.first?.identifier else { return false }
    restorationHandler(nil)
    return OpenfyMediaSuggestions.requestPlayback(id)
  }
}

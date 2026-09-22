@main
struct CheckBackgroundPlayback {
  static func main() {
    var gate = BackgroundPlaybackGate()
    for _ in 0..<20 {
      precondition(gate.shouldPublish(isBackground: false, signature: "playing"))
    }
    precondition(gate.shouldPublish(isBackground: true, signature: "playing"))
    // Twenty minutes at two callbacks per second without any JS progress work.
    for _ in 0..<2400 {
      precondition(!gate.shouldPublish(isBackground: true, signature: "playing"))
    }
    for transition in ["paused", "playing", "buffering", "failed", "playing"] {
      precondition(gate.shouldPublish(isBackground: true, signature: transition))
      precondition(!gate.shouldPublish(isBackground: true, signature: transition))
    }
    precondition(gate.shouldPublish(isBackground: false, signature: "playing"))
    precondition(gate.shouldPublish(isBackground: true, signature: "playing"))
    print("PASS: background progress is idle; playback transitions and foreground updates remain active")
  }
}

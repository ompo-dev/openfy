import SwiftUI
import UIKit
import WidgetKit

private let appGroup = "group.com.openfy.app"
private let widgetKind = "com.openfy.app.player-widget"

private struct OpenfyEntry: TimelineEntry {
  let date: Date
  let title: String
  let artists: String
  let artwork: UIImage?
  let lyricLines: [String]
  let isPlaying: Bool
  let positionMs: Double
  let durationMs: Double
}

private struct WidgetLyric: Decodable {
  let text: String
  let startTimeMs: Double
  let endTimeMs: Double
}

private struct OpenfyProvider: TimelineProvider {
  func placeholder(in context: Context) -> OpenfyEntry {
    OpenfyEntry(
      date: .now,
      title: "Openfy Music",
      artists: "Sua música",
      artwork: nil,
      lyricLines: ["Sua letra aparece aqui"],
      isPlaying: false,
      positionMs: 0,
      durationMs: 1
    )
  }

  func getSnapshot(in context: Context, completion: @escaping (OpenfyEntry) -> Void) {
    Task { completion(await loadEntry()) }
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<OpenfyEntry>) -> Void) {
    Task {
      let entries = await loadEntries()
      completion(Timeline(entries: entries, policy: .after(.now.addingTimeInterval(900))))
    }
  }

  private func loadEntry() async -> OpenfyEntry {
    (await loadEntries()).first ?? OpenfyEntry(
      date: .now,
      title: "Openfy Music",
      artists: "Toque para começar",
      artwork: nil,
      lyricLines: [],
      isPlaying: false,
      positionMs: 0,
      durationMs: 1
    )
  }

  private func loadEntries() async -> [OpenfyEntry] {
    let defaults = UserDefaults(suiteName: appGroup)
    let values: [String: Any] = {
      guard let data = defaults?.data(forKey: "openfyPlayerSnapshot"),
        let dictionary = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
      else { return [:] }
      return dictionary
    }()
    let now = Date()
    let lyrics: [WidgetLyric]? = {
      guard let json = values["lyricTimeline"] as? String,
        let data = json.data(using: .utf8) else { return nil }
      return try? JSONDecoder().decode([WidgetLyric].self, from: data)
    }()
    let artworkURL = (values["artworkURL"] as? String).flatMap(URL.init(string:))
    var artwork: UIImage?
    if let artworkURL, artworkURL.scheme == "https" || artworkURL.scheme == "http" {
      let sharedDirectory = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup)
      let cachedArtwork = sharedDirectory?.appendingPathComponent("openfy-widget-artwork.jpg")
      if defaults?.string(forKey: "openfyWidgetArtworkURL") == artworkURL.absoluteString,
        let cachedArtwork,
        let data = try? Data(contentsOf: cachedArtwork) {
        artwork = UIImage(data: data)
      } else if let (data, _) = try? await URLSession.shared.data(from: artworkURL) {
        artwork = UIImage(data: data)
        if let cachedArtwork {
          try? data.write(to: cachedArtwork, options: .atomic)
          defaults?.set(artworkURL.absoluteString, forKey: "openfyWidgetArtworkURL")
        }
      }
    }

    let fallbackLines = (1...4).compactMap { index -> String? in
      let value = values["lyricLine\(index)"] as? String
      return value?.isEmpty == false ? value : nil
    }
    let isPlaying = (values["isPlaying"] as? Int ?? 0) == 1
    let savedPosition = values["positionMs"] as? Double ?? 0
    let duration = values["durationMs"] as? Double ?? 1
    let updatedAt = values["updatedAt"] as? Double ?? now.timeIntervalSince1970
    let positionNow = min(duration, max(0, savedPosition + (isPlaying ? (now.timeIntervalSince1970 - updatedAt) * 1000 : 0)))
    let title = values["title"] as? String ?? "Openfy Music"
    let artists = values["artists"] as? String ?? "Toque para começar"
    let activeLyricIndex = lyrics?.lastIndex(where: { $0.startTimeMs <= positionNow })
    let activeLyricLines = activeLyricIndex.map { index in
      Array(lyrics![index...].prefix(4).map(\.text))
    } ?? fallbackLines
    let base = OpenfyEntry(
      date: now,
      title: title,
      artists: artists,
      artwork: artwork,
      lyricLines: activeLyricLines,
      isPlaying: isPlaying,
      positionMs: positionNow,
      durationMs: duration
    )

    guard isPlaying, let lyrics, !lyrics.isEmpty else { return [base] }

    let futureEntries = lyrics.enumerated().compactMap { index, lyric -> OpenfyEntry? in
      guard lyric.startTimeMs > positionNow, lyric.startTimeMs < duration else { return nil }
      let followingLines = lyrics[index...].prefix(4).map(\.text)
      let date = now.addingTimeInterval((lyric.startTimeMs - positionNow) / 1000)
      return OpenfyEntry(
        date: date,
        title: title,
        artists: artists,
        artwork: artwork,
        lyricLines: followingLines,
        isPlaying: true,
        positionMs: lyric.startTimeMs,
        durationMs: duration
      )
    }
    return [base] + futureEntries.prefix(240)
  }
}

private struct OpenfyPlayerWidgetView: View {
  @Environment(\.widgetFamily) private var family
  let entry: OpenfyEntry

  var body: some View {
    Group {
      switch family {
      case .systemSmall:
        smallWidget
      case .systemLarge, .systemExtraLarge:
        largeWidget
      default:
        mediumWidget
      }
    }
    .containerBackground(.ultraThinMaterial, for: .widget)
  }

  private var cover: some View {
    Group {
      if let artwork = entry.artwork {
        Image(uiImage: artwork).resizable().scaledToFill()
      } else {
        RoundedRectangle(cornerRadius: 8).fill(.white.opacity(0.12))
          .overlay(Image(systemName: "music.note").font(.title2).foregroundStyle(.white.opacity(0.7)))
      }
    }
    .clipShape(RoundedRectangle(cornerRadius: 8))
  }

  private var smallWidget: some View {
    VStack(alignment: .leading, spacing: 6) {
      HStack(spacing: 7) {
        cover.frame(width: 48, height: 48)
        VStack(alignment: .leading, spacing: 2) {
          Text(entry.title).font(.caption.bold()).lineLimit(2)
          Text(entry.artists).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
        }
      }
      Spacer(minLength: 0)
      controls
    }
    .padding(11)
  }

  private var mediumWidget: some View {
    HStack(spacing: 12) {
      cover.frame(width: 68, height: 68)
      VStack(alignment: .leading, spacing: 5) {
        Text(entry.title).font(.subheadline.bold()).lineLimit(1)
        Text(entry.artists).font(.caption).foregroundStyle(.secondary).lineLimit(1)
        lyricPreview(lineLimit: 2)
        Spacer(minLength: 0)
        controls
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    }
    .padding(14)
  }

  private var largeWidget: some View {
    VStack(alignment: .leading, spacing: 12) {
      HStack(spacing: 11) {
        cover.frame(width: 58, height: 58)
        VStack(alignment: .leading, spacing: 3) {
          Text(entry.title).font(.headline).lineLimit(1)
          Text(entry.artists).font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
        }
      }
      lyricPreview(lineLimit: 4)
      Spacer(minLength: 0)
      progress
      controls
    }
    .padding(16)
  }

  private func lyricPreview(lineLimit: Int) -> some View {
    VStack(alignment: .leading, spacing: 4) {
      ForEach(Array(entry.lyricLines.prefix(lineLimit).enumerated()), id: \.offset) { _, line in
        Text(line).font(.system(size: family == .systemLarge ? 15 : 12, weight: .medium))
          .foregroundStyle(.white.opacity(0.88)).lineLimit(1)
      }
      if entry.lyricLines.isEmpty {
        Text("A letra sincronizada aparece aqui")
          .font(.caption).foregroundStyle(.secondary).lineLimit(2)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  private var progress: some View {
    let elapsed = max(0, entry.positionMs / 1000)
    let remaining = max(1, (entry.durationMs - entry.positionMs) / 1000)
    return ProgressView(timerInterval: entry.date.addingTimeInterval(-elapsed)...entry.date.addingTimeInterval(remaining), countsDown: false)
      .tint(.green)
  }

  private var controls: some View {
    HStack(spacing: 22) {
      Link(destination: URL(string: "openfy://widget/previous")!) {
        Image(systemName: "backward.end.fill")
      }
      .accessibilityLabel("Faixa anterior")
      Link(destination: URL(string: "openfy://widget/play-pause")!) {
        Image(systemName: entry.isPlaying ? "pause.fill" : "play.fill")
      }
      .accessibilityLabel(entry.isPlaying ? "Pausar" : "Tocar")
      Link(destination: URL(string: "openfy://widget/next")!) {
        Image(systemName: "forward.end.fill")
      }
      .accessibilityLabel("Próxima faixa")
    }
    .font(.system(size: 18, weight: .semibold))
    .tint(.white)
    .frame(maxWidth: .infinity, alignment: .center)
  }
}

struct OpenfyPlayerWidget: Widget {
  let kind = widgetKind

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: OpenfyProvider()) { entry in
      OpenfyPlayerWidgetView(entry: entry)
    }
    .configurationDisplayName("Openfy Music")
    .description("Música atual, letra e controles de reprodução.")
    .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
  }
}

@main
struct OpenfyPlayerWidgetBundle: WidgetBundle {
  var body: some Widget {
    OpenfyPlayerWidget()
  }
}

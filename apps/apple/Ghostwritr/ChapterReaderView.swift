import SwiftUI

struct ChapterReaderView: View {
    let book: BookHeader
    let chapter: Chapter
    @EnvironmentObject private var model: AppModel
    @State private var focusMode = false

    var body: some View {
        GeometryReader { geo in
            ScrollView {
                VStack(spacing: 0) {
                    if model.mode == .preview {
                        Label("SAMPLE CONTENT · NOT THE LIVE HETZNER MANUSCRIPT", systemImage: "eye.fill")
                            .font(.caption2.weight(.bold)).tracking(1.3)
                            .foregroundStyle(PressTheme.ink)
                            .frame(maxWidth: .infinity).padding(.vertical, 10)
                            .background(PressTheme.gold)
                    }
                    ReaderHeader(book: book, chapter: chapter, focusMode: $focusMode)
                    VStack(alignment: .leading, spacing: 22) {
                        ForEach(paragraphs.indices, id: \.self) { index in
                            Text(paragraphs[index])
                                .font(index == 0
                                      ? .system(size: 13, weight: .bold, design: .serif)
                                      : .system(size: focusMode ? 21 : 18, weight: .regular, design: .serif))
                                .tracking(index == 0 ? 2.1 : 0.15)
                                .foregroundStyle(index == 0 ? PressTheme.quietGold : PressTheme.ink.opacity(0.92))
                                .lineSpacing(focusMode ? 9 : 7)
                                .textSelection(.enabled)
                        }
                    }
                    .padding(.horizontal, focusMode ? 48 : 64).padding(.vertical, 48)
                    .frame(maxWidth: focusMode ? 760 : 880, alignment: .leading)
                    .background(PressTheme.paper)
                    .overlay(alignment: .leading) { Rectangle().fill(PressTheme.gold.opacity(0.22)).frame(width: 1).padding(.vertical, 28).offset(x: 28) }
                    ReaderFooter(chapter: chapter)
                }
                .frame(maxWidth: min(max(geo.size.width - 80, 320), 980))
                .background(PressTheme.paper)
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                .shadow(color: .black.opacity(0.55), radius: 45, y: 24)
                .padding(.horizontal, 20).padding(.vertical, 32)
                .frame(maxWidth: .infinity)
            }
        }
    }

    private var paragraphs: [String] {
        chapter.content.components(separatedBy: "\n\n").map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
    }
}

private struct ReaderHeader: View {
    let book: BookHeader
    let chapter: Chapter
    @Binding var focusMode: Bool
    var body: some View {
        VStack(spacing: 20) {
            HStack {
                Text(book.title.uppercased()).font(.caption2.weight(.bold)).tracking(1.8).foregroundStyle(PressTheme.quietGold)
                Spacer()
                Button { focusMode.toggle() } label: { Image(systemName: focusMode ? "arrow.down.right.and.arrow.up.left" : "arrow.up.left.and.arrow.down.right") }
                    .buttonStyle(.plain).foregroundStyle(PressTheme.quietGold)
            }
            VStack(spacing: 11) {
                Text(chapter.kind == "final-revision" ? "FINAL EDITION" : "CHAPTER DRAFT")
                    .font(.caption2.weight(.bold)).tracking(2.4).foregroundStyle(PressTheme.quietGold)
                Text(chapter.title).font(.system(size: 38, weight: .medium, design: .serif)).foregroundStyle(PressTheme.ink).multilineTextAlignment(.center)
                HStack(spacing: 10) {
                    Text("\(chapter.wordCount.formatted()) words")
                    Text("·")
                    Text("Version \(chapter.versionNumber)")
                    if chapter.isApproved { Text("·"); Label("Approved", systemImage: "checkmark.seal.fill").foregroundStyle(PressTheme.green) }
                }.font(.caption).foregroundStyle(PressTheme.quietGold)
            }
            OrnamentRule()
        }.padding(.horizontal, 42).padding(.top, 34).padding(.bottom, 20).background(PressTheme.paper)
    }
}

private struct OrnamentRule: View {
    var body: some View {
        HStack(spacing: 12) {
            Rectangle().fill(PressTheme.quietGold.opacity(0.35)).frame(height: 1)
            Image(systemName: "sparkle").font(.caption).foregroundStyle(PressTheme.quietGold)
            Rectangle().fill(PressTheme.quietGold.opacity(0.35)).frame(height: 1)
        }
    }
}

private struct ReaderFooter: View {
    let chapter: Chapter
    @EnvironmentObject private var model: AppModel
    var body: some View {
        VStack(spacing: 18) {
            OrnamentRule()
            if chapter.isStale {
                Label(chapter.staleReason ?? "This approval is stale and requires another review.", systemImage: "exclamationmark.triangle.fill")
                    .font(.callout).foregroundStyle(.orange)
            }
            if model.mode == .preview {
                VStack(spacing: 8) {
                    Label("Preview sample only", systemImage: "eye.fill").font(.headline).foregroundStyle(PressTheme.quietGold)
                    Text("Connect Live Press to read and approve the actual chapter stored on Hetzner.")
                        .font(.callout).multilineTextAlignment(.center).foregroundStyle(PressTheme.ink.opacity(0.64))
                }
            } else if chapter.isApproved {
                Label("This chapter is approved for the edition", systemImage: "checkmark.seal.fill")
                    .font(.headline).foregroundStyle(PressTheme.green)
            } else {
                Text("Approve only when this chapter sounds human, earns its claims, and belongs in the final book.")
                    .font(.system(.callout, design: .serif)).multilineTextAlignment(.center).foregroundStyle(PressTheme.ink.opacity(0.64))
                Button { Task { await model.approve(chapter) } } label: {
                    Label("Approve this chapter", systemImage: "checkmark.seal.fill")
                        .font(.headline).frame(maxWidth: 330).padding(.vertical, 14)
                }
                .buttonStyle(.plain).foregroundStyle(PressTheme.parchment)
                .background(PressTheme.deepGreen, in: RoundedRectangle(cornerRadius: 14))
            }
        }.padding(42).background(PressTheme.parchment.opacity(0.46))
    }
}

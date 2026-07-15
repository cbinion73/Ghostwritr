import SwiftUI

struct RootView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.horizontalSizeClass) private var sizeClass

    var body: some View {
        ZStack {
            PressBackground()
            if sizeClass == .compact {
                CompactRootView()
            } else {
                WideRootView()
            }
        }
        .tint(PressTheme.gold)
        .task { await model.refresh() }
        .sheet(isPresented: $model.showSettings) { ConnectionView() }
        .alert("The press needs attention", isPresented: Binding(
            get: { model.errorMessage != nil },
            set: { if !$0 { model.errorMessage = nil } }
        )) { Button("OK", role: .cancel) {} } message: { Text(model.errorMessage ?? "Unknown error") }
        .overlay(alignment: .top) {
            if model.approvalCelebration {
                ApprovalToast().transition(.move(edge: .top).combined(with: .opacity))
                    .task {
                        try? await Task.sleep(for: .seconds(2.2))
                        withAnimation { model.approvalCelebration = false }
                    }
            }
        }
    }
}

private struct WideRootView: View {
    @EnvironmentObject private var model: AppModel
    var body: some View {
        NavigationSplitView {
            LibrarySidebar()
                .navigationSplitViewColumnWidth(min: 300, ideal: 350, max: 420)
        } content: {
            if let snapshot = model.snapshot { JourneySidebar(snapshot: snapshot) }
            else { EditorialWelcome() }
        } detail: {
            if let snapshot = model.snapshot { StudioView(snapshot: snapshot) }
            else { EmptyStudio() }
        }
        .navigationSplitViewStyle(.balanced)
        .background(PressTheme.background)
        .task {
            if model.selectedBook == nil, let first = model.books.first {
                await model.open(first)
            }
        }
    }
}

private struct CompactRootView: View {
    @EnvironmentObject private var model: AppModel
    var body: some View {
        NavigationStack {
            LibraryView()
                .navigationDestination(item: $model.selectedBook) { book in
                    Group {
                        if let snapshot = model.snapshot { StudioView(snapshot: snapshot) }
                        else { ProgressView().controlSize(.large) }
                    }
                    .task { if model.snapshot?.book.slug != book.slug { await model.open(book) } }
                }
        }
    }
}

private struct LibrarySidebar: View {
    @EnvironmentObject private var model: AppModel
    var body: some View {
        VStack(spacing: 0) {
            HStack {
                PressMark()
                Spacer()
                Button { model.showSettings = true } label: { Image(systemName: "slider.horizontal.3") }
                    .buttonStyle(.plain).foregroundStyle(.secondary)
            }.padding(22)

            ScrollView {
                LazyVStack(spacing: 10) {
                    HStack {
                        Text("THE COLLECTION").font(.caption2.weight(.bold)).tracking(1.8).foregroundStyle(PressTheme.gold)
                        Spacer()
                        Text("\(model.books.count) VOLUMES").font(.caption2).foregroundStyle(.secondary)
                    }.padding(.horizontal, 22).padding(.bottom, 6)

                    ForEach(model.books) { book in
                        Button { Task { await model.open(book) } } label: {
                            SidebarBookRow(book: book, selected: model.selectedBook?.id == book.id)
                        }.buttonStyle(.plain)
                    }
                }.padding(.bottom, 22)
            }

            ConnectionBadge().padding(18)
        }
        .background(Color.black.opacity(0.19))
    }
}

private struct SidebarBookRow: View {
    let book: BookSummary
    let selected: Bool
    var body: some View {
        HStack(spacing: 14) {
            MiniBookCover(book: book).frame(width: 40, height: 58)
            VStack(alignment: .leading, spacing: 5) {
                Text(book.title).font(.system(.headline, design: .serif)).lineLimit(1)
                Text(book.progress == 100 ? "Complete edition" : book.activeStage)
                    .font(.caption).foregroundStyle(selected ? PressTheme.parchment.opacity(0.76) : .secondary)
                ProgressView(value: Double(book.progress), total: 100).tint(selected ? PressTheme.parchment : PressTheme.gold)
            }
            Text("\(book.progress)%").font(.caption2.monospacedDigit()).foregroundStyle(.secondary)
        }
        .padding(12)
        .background(selected ? PressTheme.green.opacity(0.72) : Color.clear, in: RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(selected ? PressTheme.gold.opacity(0.35) : .clear))
        .padding(.horizontal, 10)
    }
}

struct ConnectionBadge: View {
    @EnvironmentObject private var model: AppModel
    var body: some View {
        Button { model.showSettings = true } label: {
            HStack(spacing: 9) {
                Circle().fill(model.mode == .live ? PressTheme.sage : PressTheme.gold).frame(width: 8)
                    .shadow(color: model.mode == .live ? PressTheme.sage : PressTheme.gold, radius: 5)
                Text(model.mode.label).font(.caption.weight(.semibold))
                Spacer()
                Image(systemName: "chevron.up.chevron.down").font(.caption2).foregroundStyle(.secondary)
            }.padding(11).background(Color.white.opacity(0.045), in: RoundedRectangle(cornerRadius: 12))
        }.buttonStyle(.plain)
    }
}

private struct EditorialWelcome: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("THE BOOK JOURNEY").font(.caption.weight(.bold)).tracking(2).foregroundStyle(PressTheme.gold)
            Text("Every volume has a path from first promise to finished page.")
                .font(.system(size: 30, weight: .medium, design: .serif)).foregroundStyle(PressTheme.parchment)
            Text("Choose a book from your collection to open its editorial journey.").foregroundStyle(.secondary)
            Spacer()
        }.padding(32).background(Color.black.opacity(0.1))
    }
}

private struct EmptyStudio: View {
    var body: some View {
        VStack(spacing: 22) {
            Image(systemName: "book.closed.fill").font(.system(size: 64)).foregroundStyle(PressTheme.gold)
            Text("The studio is waiting").font(.system(size: 42, weight: .medium, design: .serif)).foregroundStyle(PressTheme.parchment)
            Text("Select a volume to open the workbench.").foregroundStyle(.secondary)
        }.frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

private struct ApprovalToast: View {
    var body: some View {
        Label("Chapter approved · The edition moves forward", systemImage: "checkmark.seal.fill")
            .font(.subheadline.weight(.semibold)).foregroundStyle(PressTheme.ink)
            .padding(.horizontal, 18).padding(.vertical, 12)
            .background(PressTheme.parchment, in: Capsule()).shadow(radius: 20).padding(.top, 10)
    }
}

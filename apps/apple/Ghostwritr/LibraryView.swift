import SwiftUI

struct LibraryView: View {
    @EnvironmentObject private var model: AppModel
    private let columns = [GridItem(.adaptive(minimum: 180, maximum: 250), spacing: 30)]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 32) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 8) {
                        PressMark()
                        Text("Your Library").font(.system(size: 44, weight: .medium, design: .serif)).foregroundStyle(PressTheme.parchment)
                        Text("Every idea begins as a blank page. Every finished book earns its place on the shelf.")
                            .font(.subheadline).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer()
                    Button { model.showSettings = true } label: { Image(systemName: "gearshape.fill").padding(10) }
                        .buttonStyle(.plain).background(.ultraThinMaterial, in: Circle())
                }

                ConnectionBadge().frame(maxWidth: 260)

                LazyVGrid(columns: columns, spacing: 34) {
                    ForEach(model.books) { book in
                        Button { Task { await model.open(book) } } label: { LibraryBookCard(book: book) }
                            .buttonStyle(.plain)
                    }
                }
            }.padding(24)
        }
        .background(PressTheme.background.ignoresSafeArea())
        #if os(iOS)
        .navigationBarHidden(true)
        #endif
        .refreshable { await model.refresh() }
    }
}

struct LibraryBookCard: View {
    let book: BookSummary
    @State private var isHovering = false
    var body: some View {
        VStack(alignment: .leading, spacing: 15) {
            BookCoverView(book: book)
                .frame(height: 300)
                .scaleEffect(isHovering ? 1.025 : 1)
                .offset(y: isHovering ? -7 : 0)
                .animation(.spring(response: 0.35, dampingFraction: 0.75), value: isHovering)
            VStack(alignment: .leading, spacing: 5) {
                Text(book.title).font(.system(size: 22, weight: .semibold, design: .serif)).foregroundStyle(PressTheme.parchment).lineLimit(2)
                Text(book.subtitle ?? (book.progress == 100 ? "Complete edition" : book.activeStage))
                    .font(.caption).foregroundStyle(.secondary).lineLimit(2)
                HStack {
                    ProgressView(value: Double(book.progress), total: 100).tint(PressTheme.gold)
                    Text("\(book.progress)%").font(.caption2.monospacedDigit()).foregroundStyle(.secondary)
                }.padding(.top, 5)
            }
        }
        .contentShape(Rectangle())
        .onHover { isHovering = $0 }
    }
}

struct BookCoverView: View {
    let book: BookSummary
    private var palette: (Color, Color) {
        let colors: [(Color, Color)] = [(PressTheme.burgundy, .black), (PressTheme.green, PressTheme.ink), (.indigo.opacity(0.62), .black), (.brown.opacity(0.7), PressTheme.ink)]
        return colors[abs(book.slug.hashValue) % colors.count]
    }
    var body: some View {
        GeometryReader { geo in
            let width = min(geo.size.width * 0.82, geo.size.height * 0.64)
            ZStack(alignment: .bottom) {
                Ellipse().fill(Color.black.opacity(0.60)).frame(width: width * 1.18, height: 24).blur(radius: 12).offset(y: 12)
                ZStack {
                    RoundedRectangle(cornerRadius: 8).fill(PressTheme.paper).offset(x: 10, y: 4)
                    RoundedRectangle(cornerRadius: 9)
                        .fill(LinearGradient(colors: [palette.0.opacity(0.76), palette.0, palette.1], startPoint: .topLeading, endPoint: .bottomTrailing))
                    if let path = book.coverImageUrl, let url = URL(string: path) {
                        AsyncImage(url: url) { image in image.resizable().scaledToFill() } placeholder: { Color.clear }
                            .clipShape(RoundedRectangle(cornerRadius: 9))
                    } else {
                        ProceduralCover(book: book)
                    }
                    LinearGradient(colors: [.white.opacity(0.20), .clear, .black.opacity(0.23)], startPoint: .topLeading, endPoint: .bottomTrailing)
                        .clipShape(RoundedRectangle(cornerRadius: 9))
                    Rectangle().fill(Color.black.opacity(0.28)).frame(width: 10).blur(radius: 4).offset(x: -width / 2 + 6)
                }
                .frame(width: width, height: width * 1.48)
                .rotation3DEffect(.degrees(-9), axis: (x: 0, y: 1, z: 0), perspective: 0.65)
                .shadow(color: .black.opacity(0.7), radius: 22, x: 18, y: 18)
                .overlay(alignment: .topTrailing) {
                    if book.progress == 100 {
                        Image(systemName: "checkmark.seal.fill").foregroundStyle(PressTheme.gold).padding(13)
                            .background(.black.opacity(0.24), in: Circle()).padding(4)
                    }
                }
            }.frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }
}

private struct ProceduralCover: View {
    let book: BookSummary
    var body: some View {
        VStack(spacing: 13) {
            Text("A GHOSTWRITR EDITION").font(.system(size: 8, weight: .bold)).tracking(2.2).foregroundStyle(PressTheme.gold)
            Rectangle().fill(PressTheme.gold.opacity(0.7)).frame(height: 1)
            Spacer()
            Image(systemName: "sparkles").font(.title2).foregroundStyle(PressTheme.gold)
            Text(book.title.uppercased()).font(.system(size: book.title.count > 24 ? 22 : 28, weight: .bold, design: .serif))
                .multilineTextAlignment(.center).foregroundStyle(PressTheme.parchment).minimumScaleFactor(0.65)
            if let subtitle = book.subtitle {
                Text(subtitle).font(.system(size: 10, weight: .medium, design: .serif)).multilineTextAlignment(.center)
                    .foregroundStyle(PressTheme.parchment.opacity(0.72)).lineLimit(3)
            }
            Spacer()
            Text("GW · PRIVATE PRESS").font(.system(size: 8, weight: .bold)).tracking(1.6).foregroundStyle(PressTheme.gold)
        }.padding(20).overlay(RoundedRectangle(cornerRadius: 4).stroke(PressTheme.gold.opacity(0.58)).padding(10))
    }
}

struct MiniBookCover: View {
    let book: BookSummary
    var body: some View {
        RoundedRectangle(cornerRadius: 4).fill(LinearGradient(colors: [PressTheme.burgundy, .black], startPoint: .topLeading, endPoint: .bottomTrailing))
            .overlay(Text(String(book.title.prefix(1))).font(.system(.title3, design: .serif)).foregroundStyle(PressTheme.gold))
            .overlay(alignment: .leading) { Rectangle().fill(.black.opacity(0.32)).frame(width: 5) }
            .shadow(color: .black.opacity(0.45), radius: 5, x: 3, y: 4)
    }
}

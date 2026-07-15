import SwiftUI

enum PressTheme {
    static let ink = Color(red: 0.035, green: 0.055, blue: 0.049)
    static let deepGreen = Color(red: 0.045, green: 0.13, blue: 0.105)
    static let green = Color(red: 0.11, green: 0.28, blue: 0.22)
    static let parchment = Color(red: 0.94, green: 0.89, blue: 0.77)
    static let paper = Color(red: 0.985, green: 0.965, blue: 0.91)
    static let gold = Color(red: 0.79, green: 0.64, blue: 0.32)
    static let quietGold = Color(red: 0.55, green: 0.44, blue: 0.23)
    static let burgundy = Color(red: 0.39, green: 0.10, blue: 0.15)
    static let sage = Color(red: 0.37, green: 0.60, blue: 0.47)

    static let background = LinearGradient(
        colors: [ink, deepGreen.opacity(0.98), Color.black.opacity(0.95)],
        startPoint: .topLeading, endPoint: .bottomTrailing
    )
}

extension View {
    func pressPanel(cornerRadius: CGFloat = 24) -> some View {
        self
            .background(.ultraThinMaterial.opacity(0.64), in: RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous).stroke(Color.white.opacity(0.09)))
            .shadow(color: .black.opacity(0.28), radius: 30, y: 18)
    }
}

struct PressBackground: View {
    var body: some View {
        ZStack {
            PressTheme.background.ignoresSafeArea()
            Circle().fill(PressTheme.gold.opacity(0.10)).frame(width: 680).blur(radius: 120).offset(x: 380, y: -360)
            Circle().fill(PressTheme.sage.opacity(0.08)).frame(width: 520).blur(radius: 100).offset(x: -420, y: 380)
            Canvas { context, size in
                for x in stride(from: 0.0, through: size.width, by: 34) {
                    context.stroke(Path(CGRect(x: x, y: 0, width: 0.35, height: size.height)), with: .color(.white.opacity(0.012)))
                }
            }.ignoresSafeArea()
        }
    }
}

struct PressMark: View {
    var compact = false
    var body: some View {
        HStack(spacing: compact ? 9 : 13) {
            ZStack {
                RoundedRectangle(cornerRadius: compact ? 9 : 12).fill(PressTheme.parchment)
                Text("GW").font(.system(size: compact ? 10 : 13, weight: .black, design: .serif)).foregroundStyle(PressTheme.deepGreen)
            }.frame(width: compact ? 29 : 38, height: compact ? 29 : 38)
            if !compact {
                VStack(alignment: .leading, spacing: 0) {
                    Text("GHOSTWRITR").font(.system(size: 15, weight: .bold, design: .serif)).tracking(2.2)
                    Text("THE PRIVATE PRESS").font(.system(size: 8, weight: .semibold)).tracking(2.0).foregroundStyle(PressTheme.gold)
                }
            }
        }
    }
}

struct StatusPill: View {
    let status: StageStatus
    var body: some View {
        Label(status.label, systemImage: status.symbol)
            .font(.caption2.weight(.bold)).textCase(.uppercase).tracking(0.7)
            .foregroundStyle(color)
            .padding(.horizontal, 10).padding(.vertical, 6)
            .background(color.opacity(0.12), in: Capsule())
    }
    private var color: Color {
        switch status {
        case .committed: PressTheme.sage
        case .inProgress: PressTheme.gold
        case .readyForReview: .orange
        case .blocked: .red
        case .notStarted: .secondary
        }
    }
}

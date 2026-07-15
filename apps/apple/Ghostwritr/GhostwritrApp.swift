import SwiftUI

@main
struct GhostwritrApp: App {
    @StateObject private var model = AppModel()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(model)
                .preferredColorScheme(.dark)
        }
        #if os(macOS)
        .defaultSize(width: 1420, height: 900)
        .commands {
            CommandGroup(after: .sidebar) {
                Button("Refresh Library") { Task { await model.refresh() } }
                    .keyboardShortcut("r", modifiers: .command)
            }
        }
        #endif
    }
}

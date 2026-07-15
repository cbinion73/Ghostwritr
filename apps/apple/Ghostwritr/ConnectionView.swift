import SwiftUI

struct ConnectionView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var server = ""
    @State private var token = ""
    @State private var isConnecting = false

    var body: some View {
        ZStack {
            PressBackground()
            VStack(alignment: .leading, spacing: 24) {
                HStack { PressMark(); Spacer(); Button("Done") { dismiss() }.buttonStyle(.bordered) }
                VStack(alignment: .leading, spacing: 8) {
                    Text("Connect the private press").font(.system(size: 34, weight: .medium, design: .serif)).foregroundStyle(PressTheme.parchment)
                    Text("Your device talks to Ghostwritr over HTTPS. The token stays in Apple Keychain; model keys never leave the server.")
                        .foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                }
                VStack(alignment: .leading, spacing: 16) {
                    TextField("https://ghostwritr.your-domain.com", text: $server)
                        .textFieldStyle(.plain).padding(14).background(Color.white.opacity(0.07), in: RoundedRectangle(cornerRadius: 12))
                        #if os(iOS)
                        .textInputAutocapitalization(.never).keyboardType(.URL)
                        #endif
                    SecureField("Native device token", text: $token)
                        .textFieldStyle(.plain).padding(14).background(Color.white.opacity(0.07), in: RoundedRectangle(cornerRadius: 12))
                    Button {
                        isConnecting = true
                        Task {
                            if await model.connect(server: server, token: token) { dismiss() }
                            isConnecting = false
                        }
                    } label: {
                        HStack { if isConnecting { ProgressView() }; Text("Open the live press"); Spacer(); Image(systemName: "arrow.right") }
                            .font(.headline).padding(15)
                    }.buttonStyle(.plain).foregroundStyle(PressTheme.ink).background(PressTheme.gold, in: RoundedRectangle(cornerRadius: 13))
                    Button("Explore the Preview Edition") { model.usePreview(); dismiss() }
                        .buttonStyle(.plain).foregroundStyle(PressTheme.parchment).frame(maxWidth: .infinity).padding(12)
                }.padding(22).pressPanel()
                Spacer()
                Label("One native app · iPhone · iPad · Mac", systemImage: "apple.logo").font(.caption).foregroundStyle(.secondary)
            }.padding(30).frame(maxWidth: 620, maxHeight: 680)
        }
        .onAppear { server = model.serverURL; token = model.token }
    }
}

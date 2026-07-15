import Foundation
import Security
import SwiftUI

@MainActor
final class AppModel: ObservableObject {
    @Published var mode: AppMode = .preview
    @Published var books: [BookSummary] = DemoData.books
    @Published var selectedBook: BookSummary?
    @Published var snapshot: BookSnapshot?
    @Published var selectedChapter: Chapter?
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var showSettings = false
    @Published var approvalCelebration = false

    @AppStorage("ghostwritr.serverURL") var serverURL = ""
    @AppStorage("ghostwritr.mode") private var storedMode = AppMode.preview.rawValue

    var token: String {
        get { KeychainStore.read("native-api-token") ?? "" }
        set { KeychainStore.write(newValue, key: "native-api-token") }
    }

    init() {
        mode = AppMode(rawValue: UserDefaults.standard.string(forKey: "ghostwritr.mode") ?? "preview") ?? .preview
    }

    func refresh() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        if mode == .preview {
            books = DemoData.books
            if let selectedBook { snapshot = DemoData.snapshot(for: selectedBook) }
            return
        }
        do {
            let client = try apiClient()
            books = try await client.library().filter { !$0.isArchived }
            if let selectedBook,
               let refreshed = books.first(where: { $0.slug == selectedBook.slug }) {
                self.selectedBook = refreshed
                snapshot = try await client.snapshot(slug: refreshed.slug)
            }
        } catch { errorMessage = error.localizedDescription }
    }

    func open(_ book: BookSummary) async {
        selectedBook = book
        selectedChapter = nil
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        if mode == .preview {
            snapshot = DemoData.snapshot(for: book)
            return
        }
        do { snapshot = try await apiClient().snapshot(slug: book.slug) }
        catch { errorMessage = error.localizedDescription }
    }

    func approve(_ chapter: Chapter) async {
        guard let book = selectedBook else { return }
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        if mode == .preview {
            approvalCelebration = true
            selectedChapter = chapter
            return
        }
        do {
            _ = try await apiClient().approve(slug: book.slug, chapterId: chapter.id)
            snapshot = try await apiClient().snapshot(slug: book.slug)
            selectedChapter = snapshot?.chapters.first(where: { $0.id == chapter.id })
            approvalCelebration = true
        } catch { errorMessage = error.localizedDescription }
    }

    func confirmBudget() async {
        guard let book = selectedBook else { return }
        if mode == .preview {
            errorMessage = "Preview Edition never calls a paid model. Connect the live press to approve real spend."
            return
        }
        isLoading = true
        defer { isLoading = false }
        do {
            _ = try await apiClient().confirmBudget(slug: book.slug)
            snapshot = try await apiClient().snapshot(slug: book.slug)
        } catch { errorMessage = error.localizedDescription }
    }

    func connect(server: String, token: String) async -> Bool {
        serverURL = server.trimmingCharacters(in: .whitespacesAndNewlines)
        self.token = token.trimmingCharacters(in: .whitespacesAndNewlines)
        mode = .live
        storedMode = mode.rawValue
        await refresh()
        return errorMessage == nil
    }

    func usePreview() {
        mode = .preview
        storedMode = mode.rawValue
        books = DemoData.books
        selectedBook = nil
        snapshot = nil
        errorMessage = nil
    }

    private func apiClient() throws -> APIClient {
        guard var components = URLComponents(string: serverURL),
              components.scheme == "https" || components.host == "localhost" || components.host == "127.0.0.1",
              let url = components.url else { throw APIClientError.invalidServer }
        if components.path.isEmpty { components.path = "/" }
        guard !token.isEmpty else { throw APIClientError.unauthorized }
        return APIClient(baseURL: url, token: token)
    }
}

enum KeychainStore {
    static func write(_ value: String, key: String) {
        let data = Data(value.utf8)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "com.ghostwritr.studio",
            kSecAttrAccount as String: key,
        ]
        SecItemDelete(query as CFDictionary)
        var insert = query
        insert[kSecValueData as String] = data
        SecItemAdd(insert as CFDictionary, nil)
    }

    static func read(_ key: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "com.ghostwritr.studio",
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }
}

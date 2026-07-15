import Foundation

enum APIClientError: LocalizedError {
    case invalidServer
    case unauthorized
    case server(String)
    case invalidResponse

    var errorDescription: String? {
        switch self {
        case .invalidServer: "Enter the HTTPS address of your Ghostwritr server."
        case .unauthorized: "The device token was not accepted by Ghostwritr."
        case .server(let message): message
        case .invalidResponse: "Ghostwritr returned an unreadable response."
        }
    }
}

struct APIClient {
    let baseURL: URL
    let token: String

    private let decoder: JSONDecoder = JSONDecoder()

    func library() async throws -> [BookSummary] {
        let response: LibraryResponse = try await request("api/native/v1/library")
        return response.books
    }

    func snapshot(slug: String) async throws -> BookSnapshot {
        try await request("api/native/v1/books/\(slug.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? slug)")
    }

    func approve(slug: String, chapterId: String) async throws -> ApprovalResponse {
        let safeSlug = slug.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? slug
        let safeChapter = chapterId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? chapterId
        return try await request("api/native/v1/books/\(safeSlug)/chapters/\(safeChapter)/approve", method: "POST")
    }

    func confirmBudget(slug: String) async throws -> BudgetConfirmationResponse {
        let safeSlug = slug.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? slug
        return try await request("api/books/\(safeSlug)/llm-budget/confirm", method: "POST")
    }

    private func request<T: Decodable>(_ path: String, method: String = "GET") async throws -> T {
        let url = baseURL.appending(path: path)
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.timeoutInterval = 45

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIClientError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else {
            if http.statusCode == 401 { throw APIClientError.unauthorized }
            let payload = try? decoder.decode(APIErrorPayload.self, from: data)
            throw APIClientError.server(payload?.message ?? payload?.error ?? "Ghostwritr server error \(http.statusCode).")
        }
        do { return try decoder.decode(T.self, from: data) }
        catch { throw APIClientError.invalidResponse }
    }
}

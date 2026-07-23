import Foundation

/// Thin HTTPS client for the Kosher Connect mobile BFF.
/// Base URL comes from `KC_API_BASE_URL` in Info.plist (defaults to prod).
enum APIError: Error, LocalizedError {
    case badURL
    case http(Int, String)
    case decoding(Error)
    case transport(Error)

    var errorDescription: String? {
        switch self {
        case .badURL: "Bad URL"
        case .http(let code, let body): "HTTP \(code): \(body)"
        case .decoding(let e): "Decode error: \(e.localizedDescription)"
        case .transport(let e): "Network error: \(e.localizedDescription)"
        }
    }
}

actor APIClient {
    static let shared = APIClient()

    private let baseURL: URL
    private let session: URLSession
    private var bearerToken: String?

    init(
        baseURL: URL? = nil,
        session: URLSession = .shared
    ) {
        let configured = baseURL
            ?? (Bundle.main.object(forInfoDictionaryKey: "KC_API_BASE_URL") as? String)
                .flatMap(URL.init(string:))
            ?? URL(string: "https://kosherconnect.app")!
        self.baseURL = configured
        self.session = session
    }

    func setBearerToken(_ token: String?) {
        self.bearerToken = token
    }

    func get<T: Decodable>(
        _ path: String,
        query: [String: String] = [:],
        as: T.Type
    ) async throws -> T {
        try await request(method: "GET", path: path, query: query, body: nil)
    }

    func post<T: Decodable, B: Encodable>(
        _ path: String,
        body: B,
        as: T.Type
    ) async throws -> T {
        let data = try JSONEncoder().encode(body)
        return try await request(method: "POST", path: path, query: [:], body: data)
    }

    private func request<T: Decodable>(
        method: String,
        path: String,
        query: [String: String],
        body: Data?
    ) async throws -> T {
        var components = URLComponents(
            url: baseURL.appendingPathComponent(path),
            resolvingAgainstBaseURL: false
        )
        if !query.isEmpty {
            components?.queryItems = query.map { URLQueryItem(name: $0.key, value: $0.value) }
        }
        guard let url = components?.url else { throw APIError.badURL }

        var req = URLRequest(url: url)
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        if let body {
            req.httpBody = body
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        if let bearerToken {
            req.setValue("Bearer \(bearerToken)", forHTTPHeaderField: "Authorization")
        }

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: req)
        } catch {
            throw APIError.transport(error)
        }

        guard let http = response as? HTTPURLResponse else {
            throw APIError.http(0, "non-http response")
        }
        guard (200..<300).contains(http.statusCode) else {
            let body = String(data: data, encoding: .utf8) ?? ""
            throw APIError.http(http.statusCode, body)
        }

        do {
            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .iso8601
            return try decoder.decode(T.self, from: data)
        } catch {
            throw APIError.decoding(error)
        }
    }
}

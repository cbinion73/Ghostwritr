import Foundation

struct LibraryResponse: Decodable { let books: [BookSummary] }

struct BookSummary: Identifiable, Codable, Hashable {
    let id: String
    let slug: String
    let title: String
    let subtitle: String?
    let workflowType: String
    let coverImageUrl: String?
    let isArchived: Bool
    let progress: Int
    let activeStage: String
    let updatedAt: String
}

struct BookSnapshot: Decodable {
    let book: BookHeader
    let stages: [StageSummary]
    let chapters: [Chapter]
    let activeRuns: [WorkflowRun]
    let budget: BudgetState
}

struct BudgetState: Decodable, Hashable {
    let warningUsd: Double
    let confirmationUsd: Double
    let hardStopUsd: Double
    let currentSpendUsd: Double
    let projectedRequestCostUsd: Double
    let projectedSpendUsd: Double
    let warningReached: Bool
    let confirmationRequired: Bool
    let hardStopReached: Bool
    let confirmed: Bool
    let confirmedAt: String?
    let confirmedBy: String?
    let confirmedThroughUsd: Double?
}

struct BudgetConfirmationResponse: Decodable { let ok: Bool; let budget: BudgetState }

struct BookHeader: Decodable, Hashable {
    let id: String
    let slug: String
    let title: String
    let subtitle: String?
    let workflowType: String
    let coverImageUrl: String?
    let totalCostUsd: Double
}

struct StageSummary: Identifiable, Decodable, Hashable {
    var id: String { key }
    let key: String
    let number: Int
    let label: String
    let description: String
    let group: String
    let status: StageStatus
    let committedAt: String?
}

enum StageStatus: String, Decodable, Hashable {
    case notStarted = "NOT_STARTED"
    case inProgress = "IN_PROGRESS"
    case readyForReview = "READY_FOR_REVIEW"
    case committed = "COMMITTED"
    case blocked = "BLOCKED"

    var label: String {
        switch self {
        case .notStarted: "Locked"
        case .inProgress: "In progress"
        case .readyForReview: "Review ready"
        case .committed: "Committed"
        case .blocked: "Blocked"
        }
    }

    var symbol: String {
        switch self {
        case .notStarted: "lock.fill"
        case .inProgress: "circle.lefthalf.filled"
        case .readyForReview: "seal.fill"
        case .committed: "checkmark.seal.fill"
        case .blocked: "exclamationmark.triangle.fill"
        }
    }
}

struct Chapter: Identifiable, Decodable, Hashable {
    let id: String
    let title: String
    let content: String
    let wordCount: Int
    let artifactId: String
    let versionId: String?
    let versionNumber: Int
    let kind: String
    let approvalStatus: String?
    let isStale: Bool
    let staleReason: String?

    var isApproved: Bool {
        approvalStatus == "DRAFT_APPROVED" || approvalStatus == "FINAL_REVISION_APPROVED"
    }
}

struct WorkflowRun: Identifiable, Decodable, Hashable {
    let id: String
    let stageKey: String
    let status: String
    let startedAt: String
    let attempt: Int
}

struct ApprovalResponse: Decodable { let ok: Bool; let chapterId: String; let versionId: String }

struct APIErrorPayload: Decodable { let error: String?; let message: String? }

enum AppMode: String, CaseIterable, Identifiable {
    case preview
    case live
    var id: String { rawValue }
    var label: String { self == .preview ? "Preview Edition" : "Live Press" }
}

import SwiftUI

struct JourneySidebar: View {
    let snapshot: BookSnapshot
    @EnvironmentObject private var model: AppModel

    var body: some View {
        VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 6) {
                Text("THE BOOK JOURNEY").font(.caption2.weight(.bold)).tracking(1.8).foregroundStyle(PressTheme.gold)
                Text(snapshot.book.title).font(.system(size: 25, weight: .semibold, design: .serif)).foregroundStyle(PressTheme.parchment).lineLimit(2)
                Text("$\(snapshot.book.totalCostUsd, format: .number.precision(.fractionLength(2))) invested · \(snapshot.chapters.count) chapters")
                    .font(.caption).foregroundStyle(.secondary)
            }.frame(maxWidth: .infinity, alignment: .leading).padding(24)

            ScrollView {
                LazyVStack(spacing: 4) {
                    BudgetCard(budget: snapshot.budget).padding(.horizontal, 10).padding(.bottom, 10)
                    ForEach(snapshot.stages) { stage in
                        StageRow(stage: stage)
                    }
                    if !snapshot.chapters.isEmpty {
                        Divider().overlay(Color.white.opacity(0.1)).padding(.vertical, 12)
                        HStack {
                            Text("CHAPTERS").font(.caption2.weight(.bold)).tracking(1.7).foregroundStyle(PressTheme.gold)
                            Spacer()
                            Text("\(snapshot.chapters.filter(\.isApproved).count)/\(snapshot.chapters.count)").font(.caption2).foregroundStyle(.secondary)
                        }.padding(.horizontal, 18)
                        ForEach(snapshot.chapters) { chapter in
                            Button { model.selectedChapter = chapter } label: {
                                ChapterJourneyRow(chapter: chapter, selected: model.selectedChapter?.id == chapter.id)
                            }.buttonStyle(.plain)
                        }
                    }
                }.padding(.horizontal, 8).padding(.bottom, 24)
            }
        }.background(Color.black.opacity(0.10))
    }
}

private struct BudgetCard: View {
    let budget: BudgetState
    @EnvironmentObject private var model: AppModel
    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack {
                Label("PRESS BUDGET", systemImage: "gauge.with.dots.needle.33percent")
                    .font(.caption2.weight(.bold)).tracking(1.1).foregroundStyle(PressTheme.gold)
                Spacer()
                Text(String(format: "$%.2f", budget.currentSpendUsd)).font(.caption.monospacedDigit())
            }
            ProgressView(value: budget.currentSpendUsd, total: budget.hardStopUsd)
                .tint(budget.confirmationRequired ? .orange : PressTheme.gold)
            if budget.confirmationRequired {
                Text("New generation is paused at the $\(Int(budget.confirmationUsd)) confirmation gate.")
                    .font(.caption2).foregroundStyle(.orange)
                Button("Review and continue") { Task { await model.confirmBudget() } }
                    .font(.caption.weight(.semibold)).buttonStyle(.borderedProminent).tint(.orange)
            } else {
                Text(budget.confirmed ? "Spend approved through $\(Int(budget.confirmationUsd))" : "$\(Int(budget.confirmationUsd - budget.currentSpendUsd)) before confirmation")
                    .font(.caption2).foregroundStyle(.secondary)
            }
        }.padding(12).background(Color.white.opacity(0.045), in: RoundedRectangle(cornerRadius: 13))
    }
}

private struct StageRow: View {
    let stage: StageSummary
    var body: some View {
        HStack(spacing: 12) {
            ZStack {
                Circle().fill(color.opacity(0.13)).frame(width: 31, height: 31)
                Image(systemName: stage.status.symbol).font(.caption).foregroundStyle(color)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text("\(stage.number, format: .number.precision(.integerLength(2)))  \(stage.label)").font(.subheadline.weight(.medium))
                Text(stage.status.label).font(.caption2).foregroundStyle(color)
            }
            Spacer()
        }.padding(.horizontal, 12).padding(.vertical, 8)
    }
    private var color: Color {
        switch stage.status { case .committed: PressTheme.sage; case .inProgress: PressTheme.gold; case .readyForReview: .orange; case .blocked: .red; case .notStarted: .secondary }
    }
}

private struct ChapterJourneyRow: View {
    let chapter: Chapter
    let selected: Bool
    var body: some View {
        HStack(spacing: 11) {
            Image(systemName: chapter.isApproved ? "checkmark.circle.fill" : "circle.dashed")
                .foregroundStyle(chapter.isApproved ? PressTheme.sage : PressTheme.gold)
            VStack(alignment: .leading, spacing: 2) {
                Text(chapter.title).font(.subheadline).lineLimit(1)
                Text("\(chapter.wordCount.formatted()) words · v\(chapter.versionNumber)").font(.caption2).foregroundStyle(.secondary)
            }
            Spacer()
        }.padding(10).background(selected ? Color.white.opacity(0.08) : .clear, in: RoundedRectangle(cornerRadius: 11))
    }
}

struct StudioView: View {
    let snapshot: BookSnapshot
    @EnvironmentObject private var model: AppModel

    var body: some View {
        ZStack {
            PressBackground()
            if let chapter = model.selectedChapter ?? snapshot.chapters.first {
                ChapterReaderView(book: snapshot.book, chapter: chapter)
            } else {
                StudioOverview(snapshot: snapshot)
            }
            if model.isLoading {
                ProgressView().controlSize(.large).padding(24).background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 18))
            }
        }
        .toolbar {
            ToolbarItemGroup(placement: .primaryAction) {
                Button { Task { await model.refresh() } } label: { Image(systemName: "arrow.clockwise") }
                Button { model.showSettings = true } label: { Image(systemName: "gearshape") }
            }
        }
    }
}

private struct StudioOverview: View {
    let snapshot: BookSnapshot
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 30) {
                HStack(alignment: .top, spacing: 28) {
                    BookCoverView(book: .init(id: snapshot.book.id, slug: snapshot.book.slug, title: snapshot.book.title, subtitle: snapshot.book.subtitle, workflowType: snapshot.book.workflowType, coverImageUrl: snapshot.book.coverImageUrl, isArchived: false, progress: 0, activeStage: "", updatedAt: ""))
                        .frame(width: 220, height: 330)
                    VStack(alignment: .leading, spacing: 13) {
                        Text("THE EDITORIAL DESK").font(.caption.weight(.bold)).tracking(2).foregroundStyle(PressTheme.gold)
                        Text(snapshot.book.title).font(.system(size: 48, weight: .medium, design: .serif)).foregroundStyle(PressTheme.parchment)
                        if let subtitle = snapshot.book.subtitle { Text(subtitle).font(.title3).foregroundStyle(.secondary) }
                        HStack(spacing: 18) {
                            Metric(value: "\(snapshot.chapters.count)", label: "chapters")
                            Metric(value: snapshot.chapters.reduce(0) { $0 + $1.wordCount }.formatted(), label: "words")
                            Metric(value: String(format: "$%.2f", snapshot.book.totalCostUsd), label: "AI spend")
                        }.padding(.top, 14)
                    }.padding(.top, 34)
                }

                if let run = snapshot.activeRuns.first {
                    Label("The press is working · \(run.stageKey.replacingOccurrences(of: "_", with: " ").capitalized)", systemImage: "sparkles")
                        .font(.headline).foregroundStyle(PressTheme.ink).padding(16).frame(maxWidth: .infinity, alignment: .leading)
                        .background(PressTheme.gold, in: RoundedRectangle(cornerRadius: 15))
                }

                Text("Select a chapter from the journey to read, compare, and approve it one at a time.")
                    .font(.system(size: 24, design: .serif)).foregroundStyle(PressTheme.parchment.opacity(0.82))
            }.padding(40)
        }
    }
}

private struct Metric: View {
    let value: String; let label: String
    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(value).font(.title2.weight(.semibold).monospacedDigit()).foregroundStyle(PressTheme.parchment)
            Text(label.uppercased()).font(.caption2.weight(.bold)).tracking(1.2).foregroundStyle(.secondary)
        }
    }
}

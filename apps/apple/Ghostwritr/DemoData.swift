import Foundation

enum DemoData {
    static let books: [BookSummary] = [
        .init(id: "dust", slug: "dust", title: "Dust", subtitle: "What remains after everything changes", workflowType: "NONFICTION", coverImageUrl: nil, isArchived: false, progress: 100, activeStage: "Typesetting", updatedAt: "2026-07-15T00:00:00Z"),
        .init(id: "lean-lab", slug: "the-lean-lab", title: "The Lean Lab", subtitle: "Small experiments. Meaningful change.", workflowType: "NONFICTION", coverImageUrl: nil, isArchived: false, progress: 100, activeStage: "Complete edition", updatedAt: "2026-07-14T00:00:00Z"),
        .init(id: "signal", slug: "the-signal-beneath", title: "The Signal Beneath", subtitle: "Seeing the patterns that shape what comes next", workflowType: "NONFICTION", coverImageUrl: nil, isArchived: false, progress: 64, activeStage: "Chapter Draft", updatedAt: "2026-07-13T00:00:00Z"),
    ]

    static func snapshot(for book: BookSummary) -> BookSnapshot {
        let names = ["Book Setup", "Book Promise", "Market Analysis", "Outline", "Base Story", "Research", "External Stories", "Personal Stories", "Chapter Draft", "Editorial Revision", "Citation Audit", "Typesetting"]
        let committed = max(1, Int((Double(book.progress) / 100) * Double(names.count)))
        let stages = names.enumerated().map { index, name in
            StageSummary(
                key: name.uppercased().replacingOccurrences(of: " ", with: "_"),
                number: index + 1,
                label: name,
                description: descriptions[index],
                group: index < 3 ? "setup" : index < 9 ? "material" : "production",
                status: index < committed ? .committed : index == committed ? .inProgress : .notStarted,
                committedAt: index < committed ? "2026-07-01T00:00:00Z" : nil
            )
        }
        let chapters = chapterSamples.enumerated().map { index, sample in
            let wordCount = sample.body.split(whereSeparator: { $0.isWhitespace }).count
            return Chapter(
                id: "sample-\(index + 1)", title: sample.title, content: sample.body,
                wordCount: wordCount, artifactId: "sample-artifact-\(index)", versionId: nil,
                versionNumber: 1, kind: "sample",
                approvalStatus: nil,
                isStale: false, staleReason: nil
            )
        }
        return BookSnapshot(
            book: .init(id: book.id, slug: book.slug, title: book.title, subtitle: book.subtitle, workflowType: book.workflowType, coverImageUrl: book.coverImageUrl, totalCostUsd: book.progress == 100 ? 18.42 : 11.08),
            stages: stages, chapters: chapters,
            activeRuns: book.progress == 100 ? [] : [.init(id: "run-1", stageKey: "CHAPTER_DRAFT", status: "RUNNING", startedAt: "2026-07-15T00:00:00Z", attempt: 1)],
            budget: .init(warningUsd: 10, confirmationUsd: 20, hardStopUsd: 30, currentSpendUsd: book.progress == 100 ? 18.42 : 11.08, projectedRequestCostUsd: 0, projectedSpendUsd: book.progress == 100 ? 18.42 : 11.08, warningReached: true, confirmationRequired: false, hardStopReached: false, confirmed: false, confirmedAt: nil, confirmedBy: nil, confirmedThroughUsd: nil)
        )
    }

    private static let chapterSamples: [(title: String, body: String)] = [
        (
            "The World After Certainty",
            """
            SAMPLE CHAPTER ONE

            Certainty rarely disappears all at once. It leaves in increments: a trusted method stops producing the same result, a familiar answer creates a new problem, or an assumption that once felt permanent begins to look like a habit. The world has not suddenly become chaotic. We have simply become able to see the uncertainty that was always present.

            That recognition can feel like loss, but it is also the beginning of attention. When yesterday’s map no longer matches today’s terrain, the useful response is not to defend the map. It is to look up. The leader, artist, or builder who can remain curious for ten seconds longer than everyone else gains room to notice what the old story concealed.

            This chapter is about that pause between an answer failing and a better question arriving. It is not empty space. It is where possibility becomes visible.
            """
        ),
        (
            "What the Dust Remembers",
            """
            SAMPLE CHAPTER TWO

            Dust is evidence. It records where attention stopped, which rooms were used, and what objects were protected long after their purpose had faded. A clean surface tells us what someone prepared for today. Dust tells us what yesterday left behind.

            Organizations have dust too. It settles into reports nobody reads, meetings nobody would invent again, and rules whose original problem has been forgotten. Each layer is thin enough to ignore. Together they can make a living system feel ancient.

            The work is not to erase the past. It is to distinguish inheritance from obstruction. Some traditions carry hard-won wisdom. Others merely carry momentum. We learn the difference by asking what each practice still makes possible—and what it quietly prevents.
            """
        ),
        (
            "The Shape of Invisible Work",
            """
            SAMPLE CHAPTER THREE

            The finished result hides the labor that made it trustworthy. A clear recommendation conceals abandoned hypotheses. A calm conversation conceals hours of preparation. A simple product often contains more disciplined refusal than visible invention.

            Invisible work becomes dangerous only when it is mistaken for effortless work. Teams then reward the final performance while starving the conditions that produced it. Preparation becomes optional, reflection looks inefficient, and the people preventing disasters appear less productive than the people responding to them.

            To value invisible work, we must name it without turning it into theater. The goal is not to document every breath. It is to make essential thinking legible enough that it can be protected, taught, and improved.
            """
        ),
        (
            "Learning to See the Signal",
            """
            SAMPLE CHAPTER FOUR

            A signal is not simply a loud event. Often the loudest event is noise—a reaction amplified by timing, repetition, or fear. A signal earns its name because it changes what we should expect next.

            Pattern recognition begins with disciplined comparison. What is genuinely different this time? Which observations come from independent sources? What explanation would still fit if our preferred conclusion were wrong? These questions slow the rush toward certainty while sharpening the eventual decision.

            Seeing the signal is therefore less about prediction than preparation. We may not know exactly what will happen. We can still recognize which futures have become more plausible and choose what we want to be ready for.
            """
        ),
        (
            "The Courage to Revise",
            """
            SAMPLE CHAPTER FIVE

            Revision asks for a peculiar kind of courage. Creation attaches us to what exists; revision asks whether that attachment serves the work. The sentence may be beautiful and still be wrong for the chapter. The chapter may be persuasive and still be wrong for the reader.

            Weak revision decorates. Strong revision decides. It identifies the promise of the piece, measures every section against that promise, and removes whatever competes with it. This can feel destructive because the evidence of effort disappears. In reality, the effort has been converted into clarity.

            Nothing valuable is wasted when a draft teaches us what the final version must become. The deleted page remains part of the thinking even when it is no longer part of the book.
            """
        ),
        (
            "A Practice of Small Experiments",
            """
            SAMPLE CHAPTER SIX

            Large plans are comforting because they postpone contact with reality. A small experiment does the opposite. It creates a near-term moment when an assumption must meet evidence.

            The best experiments are modest but consequential. They test the riskiest belief, produce information we can actually use, and cost little enough that an unexpected result becomes learning rather than catastrophe. Their purpose is not to prove that we were right. It is to make the next decision less imaginary.

            Over time, experimentation becomes more than a technique. It becomes a cultural promise: we will not punish honest discovery, we will not disguise guesses as facts, and we will let evidence improve the plan before pride makes the plan expensive.
            """
        ),
        (
            "The Thread Through Everything",
            """
            SAMPLE CHAPTER SEVEN

            A book can contain excellent chapters and still fail as a book. The missing ingredient is often not quality but continuity—the sense that every chapter is advancing the same essential journey.

            The thread is not repetition. It is a question deep enough to survive changing examples. Each return should add pressure, reveal another dimension, or alter what the reader believes the answer requires. The reader feels coherence because earlier ideas keep acquiring new meaning.

            Finding the thread means asking what would be lost if the chapters were rearranged. If the answer is nothing, the manuscript is a collection. If each chapter changes the conditions under which the next can be understood, the manuscript has become a book.
            """
        ),
        (
            "Building What Can Last",
            """
            SAMPLE CHAPTER EIGHT

            Durability is not the same as resistance to change. The most durable systems preserve their purpose while allowing their methods to evolve. They know what must remain true and what must remain flexible.

            This distinction changes how we build. Instead of predicting every future condition, we create clear boundaries, visible state, recoverable decisions, and feedback loops that expose drift before it becomes collapse. Reliability emerges from the ability to respond, not from the fantasy that response will never be necessary.

            What lasts is rarely what was made perfect at the beginning. It is what was made understandable enough to repair, valuable enough to protect, and open enough to become more useful with time.
            """
        )
    ]

    private static let descriptions = [
        "Define the book, its form, and the author behind it.", "Forge the promise this book makes to its reader.",
        "Test the promise against readers and comparable titles.", "Build the architecture chapter by chapter.",
        "Create the narrative thread that gives the book coherence.", "Gather verified facts and admissible sources.",
        "Develop cited case studies and outside stories.", "Capture the author’s own lived experience.",
        "Write, review, and approve every chapter.", "Revise and polish each chapter into final prose.",
        "Validate claims, sources, and the final bibliography.", "Assemble the print-ready KDP edition."
    ]

}

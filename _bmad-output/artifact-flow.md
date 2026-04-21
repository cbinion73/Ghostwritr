# GHOSTWRITR Artifact Flow

The book-to-manuscript pipeline renders as two lanes (book-scoped and chapter-scoped) plus a terminal publish lane. Three hard gates block advancement.

## Swim-Lane Diagram

```mermaid
flowchart TD
    classDef bookArtifact fill:#E8F0FE,stroke:#1A73E8,stroke-width:1.5px,color:#0B3D91
    classDef chapterArtifact fill:#FFF4E5,stroke:#E8710A,stroke-width:1.5px,color:#7A3E00
    classDef gate fill:#FDECEA,stroke:#D93025,stroke-width:2px,color:#5F0F0C
    classDef terminal fill:#E6F4EA,stroke:#188038,stroke-width:2px,color:#0D3B1F

    subgraph BOOK ["📘 Book-Scoped Lane (one per book)"]
        direction TB
        A1["book-brief.md<br/><i>stage 1</i>"]:::bookArtifact
        A2["viability-report.md<br/><i>stage 2</i>"]:::bookArtifact
        G1{{"GATE: viability ≥ 3.5/5"}}:::gate
        A3["outline.md<br/><i>stage 3</i>"]:::bookArtifact
        A4["base-story.md<br/><i>stage 5</i>"]:::bookArtifact
        A5["voice-profile.md<br/><i>derived</i>"]:::bookArtifact

        A1 --> A2 --> G1 --> A3 --> A4
        A1 -.-> A5
    end

    subgraph CHAPTER ["📖 Chapter-Scoped Lane (fan-out: one set per chapter)"]
        direction TB
        C1["bones.md<br/><i>stage 4 · paragraph topics</i>"]:::chapterArtifact
        C2["research.md<br/><i>stage 6</i>"]:::chapterArtifact
        C3["external-stories.md<br/><i>stage 7</i>"]:::chapterArtifact
        C4["personal-stories.md<br/><i>stage 8</i>"]:::chapterArtifact
        G2{{"GATE: research verified<br/>≥3 claims, 100% cited"}}:::gate
        C5["chapter-N-draft.md<br/><i>stage 9</i>"]:::chapterArtifact
        G3{{"GATE: 5 checks green"}}:::gate
        C6["chapter-N-edited.md<br/><i>stage 10</i>"]:::chapterArtifact

        C1 --> C2 --> G2
        C2 --> C3
        C2 --> C4
        G2 --> C5
        C3 --> C5
        C4 --> C5
        C1 --> C5
        C5 --> G3 --> C6
    end

    subgraph PUBLISH ["📚 Publish Lane"]
        direction TB
        P1["manuscript.md<br/><i>stage 11 · typesetting</i>"]:::terminal
    end

    A3 -- "fan-out per chapter" --> C1
    A4 --> C5
    A5 --> C5
    A3 --> C2
    C6 -- "fan-in, ordered" --> P1

    A2 -. "scores inform" .-> A3
```

## Legend

- **Blue** — book-scoped artifact (written once, read many).
- **Orange** — chapter-scoped artifact (instantiated per chapter; diagram shows one lane but it fans out N times for a book with N chapters).
- **Red diamonds** — hard gates. Three of them:
  1. **Viability** before outline (stage 2 → stage 3). Score must clear 3.5/5 or override.
  2. **Research verified** before drafting (stage 6 → stage 9). ≥3 claims, 100% cited.
  3. **Five checks green** before editorial (stage 9 → stage 10). Word count, sources present, framework slots filled, voice critic ≥3.5/5, no unverified claims.
- **Green** — terminal artifact (manuscript outputs).
- **Dotted line** — advisory relationship (viability scores inform outline but don't gate it).
- **Solid line** — mandatory flow.

## Artifact Format Reference

See `ghostwritr.manifest.yaml` for per-stage format decisions (Markdown + frontmatter vs. Markdown + `.data.json` sibling). Rule of thumb: if a later stage reads structured fields programmatically, commit a JSON sibling. Otherwise, prose-in-Markdown-out.

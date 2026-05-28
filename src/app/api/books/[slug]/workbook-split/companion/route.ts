import { NextResponse } from "next/server";
import { ActorType, ArtifactStatus, ArtifactType, BookStatus, BookWorkflowType, StageKey, StageStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { getWorkflowStageKeys } from "@/lib/workflow-registry";

interface WorkbookSection {
  chapterKey: string;
  chapterTitle: string;
  workbookSection: string;
}

interface RequestBody {
  workbookSections: WorkbookSection[];
}

// POST — creates a companion workbook Book from approved workbook sections
export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  // 1. Load parent book
  const parentBook = await db.book.findUnique({
    where: { slug },
    select: { id: true, titleWorking: true, metadataJson: true, workflowType: true },
  });

  if (!parentBook) {
    return NextResponse.json({ error: "Book not found" }, { status: 404 });
  }

  const body = await req.json() as RequestBody;
  const { workbookSections } = body;

  if (!Array.isArray(workbookSections) || workbookSections.length === 0) {
    return NextResponse.json({ error: "workbookSections is required" }, { status: 400 });
  }

  // 2. Generate unique slug for companion
  const baseSlug = `${slug}-workbook`;
  let companionSlug = baseSlug;
  let suffix = 2;
  while (await db.book.findUnique({ where: { slug: companionSlug }, select: { id: true } })) {
    companionSlug = `${baseSlug}-${suffix++}`;
  }

  const parentTitle = parentBook.titleWorking ?? "Untitled Book";
  const companionTitle = `${parentTitle} — Companion Workbook`;

  // 3. Create the companion book with all stages in a transaction
  const companion = await db.$transaction(async (tx) => {
    // Create the book
    const book = await tx.book.create({
      data: {
        slug: companionSlug,
        titleWorking: companionTitle,
        workflowType: BookWorkflowType.WORKBOOK,
        parentBookId: parentBook.id,
        metadataJson: parentBook.metadataJson ?? {},
        status: BookStatus.DRAFT,
      },
    });

    // Get the WORKBOOK stage sequence
    const stageKeys = getWorkflowStageKeys(BookWorkflowType.WORKBOOK);

    // Create BookStage records
    // CHAPTER_DRAFT → COMMITTED (content already populated)
    // TYPESET → IN_PROGRESS (ready for Folio)
    // All others → NOT_STARTED
    const stageRecords = await Promise.all(
      stageKeys.map((stageKey) => {
        let status: StageStatus;
        if (stageKey === StageKey.CHAPTER_DRAFT) {
          status = StageStatus.COMMITTED;
        } else if (stageKey === StageKey.TYPESET) {
          status = StageStatus.IN_PROGRESS;
        } else {
          status = StageStatus.NOT_STARTED;
        }
        return tx.bookStage.create({
          data: {
            bookId: book.id,
            stageKey: stageKey as StageKey,
            status,
          },
        });
      }),
    );

    // Find the CHAPTER_DRAFT stage record
    const draftStageRecord = stageRecords.find((s) => s.stageKey === StageKey.CHAPTER_DRAFT);
    if (!draftStageRecord) throw new Error("CHAPTER_DRAFT stage not created");

    // 4. For each workbook section, create an Artifact + ArtifactVersion
    for (const section of workbookSections) {
      // Create artifact
      const artifact = await tx.artifact.create({
        data: {
          bookId: book.id,
          stageId: draftStageRecord.id,
          artifactType: ArtifactType.CHAPTER_DRAFT,
          status: ArtifactStatus.COMMITTED,
          title: `${section.chapterTitle} — Exercises`,
          metadataJson: {
            chapterKey: section.chapterKey,
            chapterTitle: section.chapterTitle,
            isWorkbook: true,
          },
        },
      });

      // Create artifact version
      const version = await tx.artifactVersion.create({
        data: {
          artifactId: artifact.id,
          versionNumber: 1,
          lifecycleState: ArtifactStatus.COMMITTED,
          contentText: section.workbookSection,
          contentJson: { text: section.workbookSection },
          createdByType: ActorType.USER,
          committedAt: new Date(),
        },
      });

      // Set currentVersionId and committedVersionId on artifact
      await tx.artifact.update({
        where: { id: artifact.id },
        data: {
          currentVersionId: version.id,
          committedVersionId: version.id,
        },
      });
    }

    return book;
  });

  return NextResponse.json({ companionSlug: companion.slug });
}

#!/usr/bin/env node

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("\n🗑️  Deleting test book...\n");

  try {
    // Delete all related data first
    await prisma.artifactVersion.deleteMany({
      where: {
        artifact: {
          book: { slug: "test" },
        },
      },
    });

    await prisma.artifact.deleteMany({
      where: {
        book: { slug: "test" },
      },
    });

    await prisma.directionEvent.deleteMany({
      where: {
        book: { slug: "test" },
      },
    });

    await prisma.sourceDocument.deleteMany({
      where: {
        bookId: (await prisma.book.findUnique({ where: { slug: "test" } }))?.id,
      },
    });

    await prisma.bookStage.deleteMany({
      where: {
        book: { slug: "test" },
      },
    });

    // Delete the book
    await prisma.book.delete({
      where: { slug: "test" },
    });

    console.log("✓ Test book deleted\n");

    const remaining = await prisma.book.findMany();
    if (remaining.length === 0) {
      console.log("📭 Database is now empty (no books)\n");
    } else {
      console.log("Remaining books:");
      remaining.forEach((b) => console.log(`  - ${b.slug}`));
    }
  } catch (error) {
    console.error("Error:", error.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();

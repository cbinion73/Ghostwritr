#!/usr/bin/env node

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  try {
    console.log("📦 Fetching all books...\n");

    const allBooks = await prisma.book.findMany({
      select: {
        id: true,
        slug: true,
        titleWorking: true,
      },
    });

    console.log("Current books:");
    allBooks.forEach((book) => {
      console.log(`  - ${book.slug} (${book.titleWorking})`);
    });

    const booksToKeep = allBooks.filter(
      (book) => book.slug === "andygpt" || book.slug === "cahngpts"
    );
    const booksToDelete = allBooks.filter(
      (book) => book.slug !== "andygpt" && book.slug !== "cahngpts"
    );

    console.log(`\n✓ Books to keep: ${booksToKeep.map((b) => b.slug).join(", ")}`);
    console.log(`✓ Books to delete: ${booksToDelete.map((b) => b.slug).join(", ")}\n`);

    if (booksToDelete.length === 0) {
      console.log("No books to delete.\n");
      return;
    }

    // Delete all data for books not in the keep list
    for (const book of booksToDelete) {
      console.log(`🗑️  Deleting book: ${book.slug}...`);

      // Delete artifacts and their versions
      await prisma.artifactVersion.deleteMany({
        where: {
          artifact: {
            bookId: book.id,
          },
        },
      });

      await prisma.artifact.deleteMany({
        where: {
          bookId: book.id,
        },
      });

      // Delete direction events
      await prisma.directionEvent.deleteMany({
        where: {
          bookId: book.id,
        },
      });

      // Delete book stages
      await prisma.bookStage.deleteMany({
        where: {
          bookId: book.id,
        },
      });

      // Delete source documents
      await prisma.sourceDocument.deleteMany({
        where: {
          bookId: book.id,
        },
      });

      // Delete the book itself
      await prisma.book.delete({
        where: {
          id: book.id,
        },
      });

      console.log(`  ✓ Deleted ${book.slug}`);
    }

    console.log(`\n✅ Cleanup complete!\n`);
    console.log("Remaining books:");
    const remainingBooks = await prisma.book.findMany({
      select: {
        slug: true,
        titleWorking: true,
      },
    });
    remainingBooks.forEach((book) => {
      console.log(`  - ${book.slug} (${book.titleWorking})`);
    });
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

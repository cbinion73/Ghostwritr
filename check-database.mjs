#!/usr/bin/env node

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("\n📊 DATABASE INVENTORY\n");

  const books = await prisma.book.findMany({
    include: {
      _count: {
        select: {
          artifacts: true,
          directionEvents: true,
          sourceDocuments: true,
          stages: true,
        },
      },
    },
  });

  if (books.length === 0) {
    console.log("🗄️  No books found in database\n");
  } else {
    console.log(`📚 ${books.length} Book(s):\n`);
    for (const book of books) {
      console.log(`  📖 ${book.slug}`);
      console.log(`     Title: ${book.titleWorking}`);
      console.log(`     Status: ${book.status}`);
      console.log(`     Artifacts: ${book._count.artifacts}`);
      console.log(`     Direction Events: ${book._count.directionEvents}`);
      console.log(`     Source Documents: ${book._count.sourceDocuments}`);
      console.log(`     Stages: ${book._count.stages}`);
      console.log("");
    }
  }

  const users = await prisma.user.findMany();
  console.log(`👤 ${users.length} User(s):`);
  users.forEach((user) => {
    console.log(`  - ${user.email} (${user.name})`);
  });

  console.log("");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

#!/usr/bin/env node

/**
 * Save generated LabFlow artifacts to database
 * Uses Prisma Client directly (doesn't require migration)
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";

const prisma = new PrismaClient();

async function saveArtifacts() {
  try {
    console.log("\n📦 SAVING ARTIFACTS TO DATABASE...\n");

    // Load generated artifacts
    const artifactsFile = JSON.parse(readFileSync("labflow-artifacts.json", "utf-8"));
    const { personas, market, improvedPromise } = artifactsFile;

    // Find or create LabFlow book
    console.log("📍 Finding LabFlow book...");
    let book = await prisma.book.findUnique({
      where: { slug: "labflow" },
    });

    if (!book) {
      console.log("  Creating book...");
      book = await prisma.book.create({
        data: {
          slug: "labflow",
          title: "LabFlow: The Leadership System for Lab Professionals",
          ownerUserId: "", // Will need real user
        },
      });
    }

    console.log(`✓ Book found: ${book.title}\n`);

    // Save personas artifact
    console.log("💾 Saving personas artifact...");
    const personasArtifact = await prisma.artifactVersion.create({
      data: {
        artifact: {
          create: {
            bookId: book.id,
            stageId: "promise", // Or get from BookStage
            artifactType: "PERSONA_PACK",
            metadata: {
              personaCount: personas.personas.length,
              generatedAt: new Date().toISOString(),
            },
          },
        },
        title: "Persona Pack",
        contentJson: personas,
        createdByType: "SYSTEM",
        lifecycleState: "active",
        versionNumber: 1,
      },
    });
    console.log(`✓ Personas saved (${personas.personas.length} personas)\n`);

    // Save market artifact
    console.log("💾 Saving market report artifact...");
    const marketArtifact = await prisma.artifactVersion.create({
      data: {
        artifact: {
          create: {
            bookId: book.id,
            stageId: "promise",
            artifactType: "MARKET_REPORT",
            metadata: {
              comparableBooksCount: market.comparableBooks.length,
              generatedAt: new Date().toISOString(),
            },
          },
        },
        title: "Market Report",
        contentJson: market,
        createdByType: "SYSTEM",
        lifecycleState: "active",
        versionNumber: 1,
      },
    });
    console.log(`✓ Market report saved (${market.comparableBooks.length} titles)\n`);

    // Get existing promise brief or create one
    console.log("💾 Saving improved promise statement...");
    let promiseBrief = await prisma.artifactVersion.findFirst({
      where: {
        artifact: {
          artifactType: "PROMISE_BRIEF",
          bookId: book.id,
        },
      },
      orderBy: { versionNumber: "desc" },
    });

    let existingPromiseJson = promiseBrief?.contentJson || {};
    const updatedPromise = {
      ...existingPromiseJson,
      promiseStatement: improvedPromise,
      updatedAt: new Date().toISOString(),
    };

    await prisma.artifactVersion.create({
      data: {
        artifact: {
          create: {
            bookId: book.id,
            stageId: "promise",
            artifactType: "PROMISE_BRIEF",
            metadata: {
              updatedAt: new Date().toISOString(),
            },
          },
        },
        title: "Promise Brief",
        contentJson: updatedPromise,
        contentText: improvedPromise,
        createdByType: "SYSTEM",
        lifecycleState: "active",
        versionNumber: 1,
      },
    });
    console.log(`✓ Promise statement saved\n`);

    console.log("=".repeat(50));
    console.log("\n✅ ALL ARTIFACTS SAVED TO DATABASE\n");

    console.log("📊 Summary:");
    console.log(`  - Book: ${book.title}`);
    console.log(`  - Personas: ${personas.personas.length} profiles`);
    console.log(`  - Market titles: ${market.comparableBooks.length} comparable books`);
    console.log(`  - Promise: Updated with improved statement\n`);

    console.log("📝 Next steps:");
    console.log("1. Reload the LabFlow promise page in the browser");
    console.log("2. Verify personas, market data, and promise are displaying");
    console.log("3. Run validatePromise('labflow') to get validation scores\n");
  } catch (error) {
    console.error("\n❌ Error saving artifacts:", error.message);
    if (error.code === "ENOENT") {
      console.error("   Run 'node run-labflow-artifacts.mjs' first to generate artifacts");
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

saveArtifacts();

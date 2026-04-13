#!/usr/bin/env node

/**
 * Seed LabFlow book with generated artifacts
 */

import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";

const prisma = new PrismaClient();

async function main() {
  try {
    console.log("👤 Getting/creating user...");

    const user = await prisma.user.upsert({
      where: { email: "demo@ghostwritr.local" },
      create: {
        email: "demo@ghostwritr.local",
        name: "Demo User",
      },
      update: {},
    });

    console.log(`✓ User ready\n`);

    console.log("📌 Getting/creating LabFlow book...");

    const book = await prisma.book.upsert({
      where: { slug: "labflow" },
      create: {
        slug: "labflow",
        titleWorking: "LabFlow: The Leadership System for Lab Professionals",
        ownerUserId: user.id,
      },
      update: {
        titleWorking: "LabFlow: The Leadership System for Lab Professionals",
      },
    });

    console.log(`✓ Book ready: ${book.id}\n`);

    // Load artifacts
    const artifactsFile = JSON.parse(readFileSync("labflow-artifacts.json", "utf-8"));
    const { personas, market, improvedPromise } = artifactsFile;

    // Create stage
    console.log("📍 Creating Promise stage...");
    const stage = await prisma.bookStage.upsert({
      where: {
        bookId_stageKey: {
          bookId: book.id,
          stageKey: "PROMISE",
        },
      },
      create: {
        bookId: book.id,
        stageKey: "PROMISE",
        status: "IN_PROGRESS",
      },
      update: {
        status: "IN_PROGRESS",
      },
    });
    console.log(`✓ Stage ready\n`);

    // Save personas artifact
    console.log("💾 Saving personas...");
    await prisma.artifact.create({
      data: {
        bookId: book.id,
        stageId: stage.id,
        artifactType: "PERSONA_PACK",
        versions: {
          create: {
            contentJson: personas,
            createdByType: "SYSTEM",
            versionNumber: 1,
          },
        },
      },
    });
    console.log(`✓ Saved ${personas.personas.length} personas\n`);

    // Save market artifact
    console.log("💾 Saving market analysis...");
    await prisma.artifact.create({
      data: {
        bookId: book.id,
        stageId: stage.id,
        artifactType: "MARKET_REPORT",
        versions: {
          create: {
            contentJson: market,
            createdByType: "SYSTEM",
            versionNumber: 1,
          },
        },
      },
    });
    console.log(`✓ Saved market analysis with ${market.comparableBooks.length} titles\n`);

    // Save promise brief
    console.log("💾 Saving promise brief...");
    const promiseBrief = {
      workingTitle: "LabFlow: The Leadership System for Lab Professionals",
      audiencePrimary: "Lab professionals (PIs, senior scientists, lab managers)",
      category: "Leadership / Professional Development",
      promiseStatement: improvedPromise,
      coreTruth: "Lab professionals can transition from expertise-driven management to empowered, team-centered leadership through practical operational systems.",
    };

    await prisma.artifact.create({
      data: {
        bookId: book.id,
        stageId: stage.id,
        artifactType: "PROMISE_BRIEF",
        versions: {
          create: {
            contentJson: promiseBrief,
            contentText: improvedPromise,
            createdByType: "SYSTEM",
            versionNumber: 1,
          },
        },
      },
    });
    console.log(`✓ Saved promise brief\n`);

    console.log("=".repeat(50));
    console.log("\n✅ SEEDING COMPLETE\n");
    console.log("LabFlow book is ready at: localhost:3000/books/labflow/promise\n");

  } catch (error) {
    console.error("❌ Error seeding:", error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

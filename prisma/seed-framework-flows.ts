import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

type FrameworkStep = { slot: string; prompt: string };

const FLOWS: Array<{
  slug: string;
  frameworkName: string;
  frameworkFlowJson: FrameworkStep[];
}> = [
  {
    slug: "andygpt-aefb79bd",
    frameworkName: "ME-WE-TRUTH-YOU-WE",
    frameworkFlowJson: [
      { slot: "me", prompt: "Open with personal tension — 'you ever...' moment the reader recognizes" },
      { slot: "we", prompt: "Widen to a shared human pattern" },
      { slot: "truth", prompt: "Deliver the principle — the sticky, repeatable statement" },
      { slot: "you", prompt: "Translate to second-person application" },
      { slot: "we_close", prompt: "Return to shared resolution; one small actionable step" },
    ],
  },
  {
    slug: "cahngpt-958d4283",
    frameworkName: "Mystery → Pattern → Strategy",
    frameworkFlowJson: [
      { slot: "possibility", prompt: "Open with a 'what if?' cascade" },
      { slot: "connection", prompt: "Point to shared recognition ('you've seen this before')" },
      { slot: "reframe", prompt: "Declare 'this isn't random'" },
      { slot: "reveal", prompt: "Name the pattern explicitly" },
      { slot: "meaning", prompt: "Explain what the pattern means" },
      { slot: "action", prompt: "Tell the reader what to do with the pattern" },
    ],
  },
  {
    slug: "druckergpt-16626121",
    frameworkName: "Diagnose → Prioritize → Execute",
    frameworkFlowJson: [
      { slot: "result", prompt: "What result must be true in 30–60 days?" },
      { slot: "problem", prompt: "Separate the real problem from symptoms" },
      { slot: "priorities", prompt: "Narrow to the critical few" },
      { slot: "tradeoffs", prompt: "Make the cost of decisions explicit" },
      { slot: "action", prompt: "Identify the highest-leverage action" },
      { slot: "owner", prompt: "Assign accountability" },
      { slot: "deadline", prompt: "Define the time boundary" },
    ],
  },
  {
    slug: "elongpt-0cd4657b",
    frameworkName: "First-Principles Demolition",
    frameworkFlowJson: [
      { slot: "why", prompt: "Question the inherited practice — why done this way?" },
      { slot: "assumptions", prompt: "Call out which assumptions are wrong" },
      { slot: "constraints", prompt: "Distinguish real from assumed limits" },
      { slot: "rebuild", prompt: "Design the best version from zero" },
      { slot: "test", prompt: "Build and test quickly" },
    ],
  },
  {
    slug: "jobsgpt-64ca2c5a",
    frameworkName: "Old → New",
    frameworkFlowJson: [
      { slot: "problem", prompt: "State the problem simply" },
      { slot: "stakes", prompt: "Why it matters" },
      { slot: "old_way", prompt: "Name what's wrong with the current approach" },
      { slot: "new_way", prompt: "Introduce the better way" },
      { slot: "meaning", prompt: "Show what it means experientially" },
      { slot: "reinforce", prompt: "Repeat the core idea for emphasis" },
      { slot: "close", prompt: "Land on a clean, memorable final statement" },
    ],
  },
];

async function main() {
  for (const f of FLOWS) {
    const result = await prisma.writerPersona.updateMany({
      where: { slug: f.slug },
      data: {
        frameworkName: f.frameworkName,
        frameworkFlowJson: f.frameworkFlowJson as Prisma.InputJsonValue,
      },
    });
    console.log(`[seed] ${f.slug} (${f.frameworkName}): updated ${result.count} row(s)`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

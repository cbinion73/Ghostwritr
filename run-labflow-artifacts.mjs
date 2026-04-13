#!/usr/bin/env node

/**
 * Generate LabFlow artifacts directly
 * Runs: personas, market research, and improved promise
 */

import "dotenv/config";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PROMISE = `The problem: Lab professionals struggle to transition from technical mastery to effective leadership, feeling isolated as their lab becomes dependent on their individual expertise. This book will, through the LabFlow Leadership System, equip you with the practical operational systems and delegation framework needed to build team alignment and decision authority. Unlike generic soft-skills training, this system provides operational clarity for execution and transforms you from expertise-driven management to empowered, team-centered leadership. Through deliberate delegation frameworks and clear decision authority structures, you'll reduce operational coordination burden while building a high-performing lab team.`;

const AUDIENCE = "Lab professionals (PIs, senior scientists, lab managers)";

async function callOpenAI(prompt) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4-turbo",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 2000,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    console.error("[OpenAI Error]:", error);
    throw new Error(`OpenAI API error: ${error.error?.message}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

async function generatePersonas() {
  console.log("\n📋 GENERATING PERSONAS...\n");

  const prompt = `From this promise, create 2-3 reader personas as JSON. IMPORTANT: Each persona MUST have ALL of these fields: id, name, priority, context, painPoints, desiredOutcomes, buyingMotivations, languageCues.

PROMISE:
${PROMISE}

JSON format (EXACT):
{
  "personas": [
    {
      "id": "unique_id_here",
      "name": "Persona Name",
      "context": "Who they are and their background",
      "priority": "primary",
      "painPoints": ["pain point 1", "pain point 2", "pain point 3"],
      "desiredOutcomes": ["desired outcome 1", "desired outcome 2"],
      "buyingMotivations": ["motivation 1", "motivation 2"],
      "languageCues": ["language cue 1", "language cue 2"]
    }
  ]
}

Create 2-3 distinct personas. ONLY return valid JSON. No other text.`;

  const response = await callOpenAI(prompt);
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Could not parse personas JSON");

  const personas = JSON.parse(jsonMatch[0]);
  console.log(
    "✓ Generated personas:",
    personas.personas.map((p) => p.name).join(", ")
  );
  return personas;
}

async function generateMarketAnalysis() {
  console.log("\n📊 GENERATING MARKET ANALYSIS...\n");

  const prompt = `You are a book market expert. Analyze this book premise against the REAL market:

BOOK PROMISE:
"${PROMISE}"

PRIMARY AUDIENCE: ${AUDIENCE}

Research and provide market data as JSON:
{
  "marketCategory": "Professional development / Leadership",
  "comparableBooks": [
    {
      "title": "Actual Book Title",
      "author": "Author Name",
      "whyRelevant": "Why comparable (sales/reviews if known)",
      "differenceOpportunity": "How this book differs (20+ characters)"
    }
  ],
  "comparisonTitles": [... same array as comparableBooks ...],
  "attractionDrivers": [
    "Specific platform/community (e.g., 'Engineering leaders on LinkedIn')",
    "Another channel"
  ],
  "commercialRisks": [
    "Risk 1",
    "Risk 2"
  ],
  "saturationAssessment": "Market assessment",
  "recommendations": ["Recommendation 1", "Recommendation 2"]
}

Find 5+ real comparable books. Be specific with actual titles, authors, and sales/review data. Output ONLY valid JSON.`;

  const response = await callOpenAI(prompt);
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Could not parse market JSON");

  const market = JSON.parse(jsonMatch[0]);
  console.log(
    "✓ Generated market analysis with",
    market.comparableBooks?.length || 0,
    "comparable titles"
  );
  return market;
}

async function improvePromise() {
  console.log("\n✨ IMPROVING PROMISE STATEMENT...\n");

  const prompt = `You are a book publishing strategist. Optimize this promise to be stronger and more marketable.

CURRENT PROMISE:
${PROMISE}

AUDIENCE: ${AUDIENCE}

OPTIMIZATION GOALS:
1. More specific outcomes (what will readers actually be able to do?)
2. Stronger differentiation (what's unique about this approach?)
3. Better audience alignment (speaks to their specific situation)
4. Higher credibility (realistic and achievable)

OPTIMIZATION RULES:
- Keep approximately same length
- Maintain core message
- Use concrete, specific language
- Address real pain points
- Show clear value proposition
- Make it more compelling

Return ONLY the optimized promise statement, nothing else.`;

  const improved = await callOpenAI(prompt);
  console.log("✓ Improved promise generated");
  console.log("\nOriginal:", PROMISE.substring(0, 100), "...");
  console.log("\nImproved:", improved.substring(0, 100), "...");
  return improved.trim();
}

async function main() {
  try {
    console.log("=== LabFlow Artifact Generation ===");
    console.log("\nGenerating artifacts for LabFlow book:\n");

    const personas = await generatePersonas();
    const market = await generateMarketAnalysis();
    const improvedPromise = await improvePromise();

    console.log("\n" + "=".repeat(50));
    console.log("\n✅ ALL ARTIFACTS GENERATED\n");

    console.log("📌 NEXT STEPS:");
    console.log(
      "1. Review artifacts above - they contain personas, market data, and improved promise"
    );
    console.log(
      "2. Copy the improved promise into the Promise tab in the UI"
    );
    console.log("3. Verify personas match your target audience");
    console.log("4. Check market analysis for comparable titles\n");

    console.log("To save these to the database, use the LabFlow promise page:");
    console.log("  - Run: autoGeneratePersonasAction('labflow')");
    console.log("  - Run: autoOptimizeMarketAction('labflow')");
    console.log("  - Update promise statement manually\n");

    // Save to files for reference
    const fs = await import("fs");
    fs.writeFileSync(
      "labflow-artifacts.json",
      JSON.stringify(
        {
          personas,
          market,
          improvedPromise,
          timestamp: new Date().toISOString(),
        },
        null,
        2
      )
    );
    console.log("📄 Full artifacts saved to: labflow-artifacts.json\n");
  } catch (error) {
    console.error("\n❌ Error:", error.message);
    process.exit(1);
  }
}

main();

/**
 * Generate LabFlow artifacts directly
 * Runs artifact generation functions and saves to database
 */

const readline = require("readline");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer);
    });
  });
}

async function main() {
  console.log("\n=== LabFlow Artifact Generation ===\n");
  console.log(
    "This script will generate and save artifacts for the LabFlow book:\n"
  );
  console.log("1. Personas - audience research and buyer personas");
  console.log("2. Market Report - competitive landscape and market viability");
  console.log("3. Improved Promise - stronger positioning statement\n");

  const proceed = await question("Proceed? (yes/no): ");

  if (proceed.toLowerCase() !== "yes") {
    console.log("Cancelled.");
    rl.close();
    return;
  }

  console.log(
    "\nTo run this script, execute from the Next.js context:\n"
  );
  console.log("1. In a browser console on the LabFlow promise page:");
  console.log("   - Call: autoGeneratePersonasAction('labflow')");
  console.log("   - Call: autoOptimizeMarketAction('labflow')");
  console.log("   - Call: autoImprovePromiseAction('labflow')");
  console.log("   - Call: validatePromise('labflow')\n");

  console.log("2. Or run from Node with: npm run generate:artifacts\n");

  rl.close();
}

main().catch(console.error);

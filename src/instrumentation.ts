/**
 * Next.js instrumentation hook — runs once when the server process starts.
 * Used to start the autopilot safety-net sweep (see automation-sweep.ts):
 * without it, a crashed background worker silently kills an overnight build's
 * continuation chain until a human reopens the app.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startAutomationSweep } = await import("./lib/workflows/automation-sweep");
    startAutomationSweep();
  }
}

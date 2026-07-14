import { NextResponse } from "next/server";

export const runtime = "nodejs";

function disabledDedupRoute() {
  return NextResponse.json(
    {
      error: "This public admin cleanup route has been disabled. Use scripts/dedup-artifacts.ts for dry-run-first, non-destructive maintenance.",
    },
    { status: 410 },
  );
}

export function GET() {
  return disabledDedupRoute();
}

export function POST() {
  return disabledDedupRoute();
}

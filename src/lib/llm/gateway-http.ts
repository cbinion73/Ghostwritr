import { NextResponse } from "next/server";

import { LLMGatewayError } from "./gateway";

export function llmGatewayErrorResponse(error: unknown): NextResponse | null {
  if (!(error instanceof LLMGatewayError)) return null;
  if (error.code === "budget_confirmation_required") {
    return NextResponse.json(
      {
        code: error.code,
        error: error.message,
      },
      { status: 402 },
    );
  }
  if (error.code === "budget_exceeded") {
    return NextResponse.json(
      {
        code: error.code,
        error: error.message,
      },
      { status: 402 },
    );
  }
  return null;
}

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  APP_AUTH_MODE_HEADER,
  APP_USER_EMAIL_HEADER,
  APP_USER_NAME_HEADER,
  buildAuthRequiredMessage,
  getLocalAuthConfig,
} from "@/lib/auth/shared";

function isApiRequest(request: NextRequest) {
  return request.nextUrl.pathname.startsWith("/api/");
}

function unauthorizedResponse(request: NextRequest) {
  const config = getLocalAuthConfig();
  const message = buildAuthRequiredMessage(config);

  if (isApiRequest(request)) {
    return NextResponse.json(
      {
        error: "Unauthorized",
        message,
      },
      { status: 401 },
    );
  }

  return new NextResponse(message, {
    status: 401,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

export function middleware(request: NextRequest) {
  const config = getLocalAuthConfig();

  if (!config.enabled) {
    return unauthorizedResponse(request);
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(APP_USER_EMAIL_HEADER, config.email);
  requestHeaders.set(APP_USER_NAME_HEADER, config.name);
  requestHeaders.set(APP_AUTH_MODE_HEADER, config.mode);

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export const config = {
  matcher: [
    "/",
    "/author/:path*",
    "/books/:path*",
    "/personas/:path*",
    "/api/books/:path*",
    "/api/personas/:path*",
  ],
};

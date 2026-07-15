import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  APP_AUTH_MODE_HEADER,
  APP_USER_EMAIL_HEADER,
  APP_USER_NAME_HEADER,
  buildAuthRequiredMessage,
  getBearerToken,
  getLocalAuthConfig,
  getNativeAuthConfig,
} from "@/lib/auth/shared";
import {
  CLOUDFLARE_ACCESS_JWT_HEADER,
  getCloudflareAccessConfig,
  verifyCloudflareAccessJWT,
} from "@/lib/auth/cloudflare-access";

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

export async function middleware(request: NextRequest) {
  const config = getLocalAuthConfig();

  const nativeConfig = getNativeAuthConfig();
  const bearerToken = getBearerToken(request.headers);
  if (nativeConfig.enabled && bearerToken === nativeConfig.token) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set(APP_USER_EMAIL_HEADER, nativeConfig.email);
    requestHeaders.set(APP_USER_NAME_HEADER, nativeConfig.name);
    requestHeaders.set(APP_AUTH_MODE_HEADER, nativeConfig.mode);
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  const cloudflareConfig = getCloudflareAccessConfig();
  const accessToken = request.headers.get(CLOUDFLARE_ACCESS_JWT_HEADER)?.trim();
  if (cloudflareConfig.enabled && accessToken) {
    const claims = await verifyCloudflareAccessJWT({
      token: accessToken,
      teamDomain: cloudflareConfig.teamDomain,
      audience: cloudflareConfig.audience,
    });
    if (claims) {
      const requestHeaders = new Headers(request.headers);
      requestHeaders.set(APP_USER_EMAIL_HEADER, cloudflareConfig.ownerEmail);
      requestHeaders.set(APP_USER_NAME_HEADER, cloudflareConfig.ownerName);
      requestHeaders.set(APP_AUTH_MODE_HEADER, "cloudflare-access");
      requestHeaders.set("x-ghostwritr-access-email", claims.email ?? "");
      return NextResponse.next({ request: { headers: requestHeaders } });
    }
  }

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
    "/api/native/:path*",
    "/api/personas/:path*",
  ],
};

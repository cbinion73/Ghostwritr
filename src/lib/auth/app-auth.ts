import { headers } from "next/headers";

import { db } from "@/lib/db";

import {
  APP_AUTH_MODE_HEADER,
  APP_USER_EMAIL_HEADER,
  APP_USER_NAME_HEADER,
} from "./shared";

export type AuthenticatedAppUser = {
  id: string;
  email: string;
  name: string | null;
  authMode: string;
};

export async function requireAuthenticatedAppUser(): Promise<AuthenticatedAppUser> {
  const requestHeaders = await headers();
  const email = requestHeaders.get(APP_USER_EMAIL_HEADER)?.trim();

  if (!email) {
    throw new Error("Authenticated app user missing from request context.");
  }

  const name = requestHeaders.get(APP_USER_NAME_HEADER)?.trim() || null;
  const authMode = requestHeaders.get(APP_AUTH_MODE_HEADER)?.trim() || "unknown";

  const user = await db.user.upsert({
    where: { email },
    update: {
      name: name ?? undefined,
    },
    create: {
      email,
      name,
    },
    select: {
      id: true,
      email: true,
      name: true,
    },
  });

  return {
    ...user,
    authMode,
  };
}

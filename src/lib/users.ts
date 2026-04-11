import { db } from "./db";

const DEFAULT_LOCAL_USER_EMAIL = "local@ghostwritr.app";

export async function ensureDefaultLocalUser() {
  return db.user.upsert({
    where: { email: DEFAULT_LOCAL_USER_EMAIL },
    update: {},
    create: {
      email: DEFAULT_LOCAL_USER_EMAIL,
      name: "Local User",
    },
  });
}

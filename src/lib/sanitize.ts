export function stripNullChars(value: string) {
  return value.replace(/\u0000/g, "");
}

export function sanitizeUnknown<T>(value: T): T {
  if (typeof value === "string") {
    return stripNullChars(value) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeUnknown(item)) as T;
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
        key,
        sanitizeUnknown(nested),
      ]),
    ) as T;
  }

  return value;
}

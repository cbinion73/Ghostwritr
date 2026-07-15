export const MAX_COVER_UPLOAD_BYTES = 8 * 1024 * 1024;

export const COVER_UPLOAD_EXTENSIONS: Readonly<Record<string, string>> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
};

export function getCoverUploadError(file: { size: number; type: string }) {
  if (file.size <= 0) return "Choose a non-empty cover image.";
  if (file.size > MAX_COVER_UPLOAD_BYTES) return "Cover image is too large. Use an image smaller than 8 MB.";
  if (!COVER_UPLOAD_EXTENSIONS[file.type]) {
    return `Unsupported cover image type: ${file.type || "unknown"}. Use PNG, JPEG, or WebP.`;
  }
  return null;
}

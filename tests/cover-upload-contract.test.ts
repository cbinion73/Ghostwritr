import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { getCoverUploadError, MAX_COVER_UPLOAD_BYTES } from "../src/lib/cover-upload-policy";

const read = (path: string) => readFileSync(path, "utf8");

test("cover uploads have a framework envelope above the application limit", () => {
  const config = read("next.config.ts");
  const route = read("src/app/api/books/[slug]/cover/route.ts");
  const library = read("src/app/bookshelf.tsx");

  assert.match(config, /serverActions:\s*\{[\s\S]*bodySizeLimit:\s*"9mb"/);
  assert.match(route, /getCoverUploadError\(file\)/);
  assert.match(route, /getBookHeaderBySlugForUserOrThrow\(slug, user\.id\)/);
  assert.match(route, /MAX_COVER_MULTIPART_BYTES/);
  assert.match(library, /getCoverUploadError\(file\)/);
  assert.match(library, /fetch\(`\/api\/books\/\$\{encodeURIComponent\(book\.slug\)\}\/cover`/);
  assert.doesNotMatch(library, /action=\{uploadBookCoverAction\}/);
});

test("cover policy accepts ordinary images and rejects oversized or unsupported files", () => {
  assert.equal(getCoverUploadError({ size: 2 * 1024 * 1024, type: "image/jpeg" }), null);
  assert.match(
    getCoverUploadError({ size: MAX_COVER_UPLOAD_BYTES + 1, type: "image/png" }) ?? "",
    /smaller than 8 MB/,
  );
  assert.match(getCoverUploadError({ size: 1024, type: "image/gif" }) ?? "", /PNG, JPEG, or WebP/);
});

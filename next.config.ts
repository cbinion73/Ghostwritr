import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const currentDir = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  experimental: {
    // Cover uploads use multipart/form-data. Keep the framework envelope a
    // little larger than the application's explicit 8 MB cover limit so the
    // action can return its own validation error instead of Next.js rejecting
    // the request before Ghostwritr sees it.
    serverActions: {
      bodySizeLimit: "9mb",
    },
  },
  serverExternalPackages: [
    "@google/generative-ai",
    "@langchain/anthropic",
    "@langchain/core",
    "@langchain/google-genai",
    "@langchain/langgraph",
    "@langchain/openai",
    "langchain",
    "mammoth",
    "pdfjs-dist",
  ],
  turbopack: {
    root: currentDir,
  },
};

export default nextConfig;

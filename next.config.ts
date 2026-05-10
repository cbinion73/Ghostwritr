import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const currentDir = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
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

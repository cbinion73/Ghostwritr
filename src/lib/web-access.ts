export type WebSearchProvider =
  | "serpapi"
  | "bing_web_search"
  | "duckduckgo_html"
  | "custom_json";

export type WebSearchResult = {
  id: string;
  url: string;
  title: string;
  snippet?: string | null;
  query: string;
  provider: WebSearchProvider;
};

export type WebSearchAttempt = {
  provider: WebSearchProvider;
  query: string;
  ok: boolean;
  resultCount: number;
  errorMessage?: string | null;
};

export type WebSearchResponse = {
  results: WebSearchResult[];
  attempts: WebSearchAttempt[];
};

export type WebFetchedPage = {
  requestedUrl: string;
  finalUrl: string;
  title: string;
  html: string;
  text: string;
  contentType?: string | null;
  publisher?: string | null;
};

export class WebAccessError extends Error {
  code: string;
  details?: Record<string, unknown>;

  constructor(message: string, code: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "WebAccessError";
    this.code = code;
    this.details = details;
  }
}

function getUserAgent(purpose: string) {
  return `Mozilla/5.0 GHOSTWRITR ${purpose}`;
}

function getTimeoutMs(envKey: string, fallbackMs: number) {
  const raw = process.env[envKey];
  if (!raw) {
    return fallbackMs;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackMs;
}

function parseProviders(): WebSearchProvider[] {
  const configured = process.env.WEB_SEARCH_PROVIDERS ?? process.env.WEB_SEARCH_PROVIDER;
  const allowedProviders = new Set<WebSearchProvider>([
    "serpapi",
    "bing_web_search",
    "duckduckgo_html",
    "custom_json",
  ]);
  const providers = (configured ?? "serpapi,bing_web_search,duckduckgo_html")
    .split(",")
    .map((value) => value.trim())
    .filter((value): value is WebSearchProvider => allowedProviders.has(value as WebSearchProvider));

  return providers.length > 0
    ? providers
    : (["serpapi", "bing_web_search", "duckduckgo_html"] as WebSearchProvider[]);
}

export function stripHtmlToText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractTitleFromHtml(html: string) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match?.[1]?.replace(/\s+/g, " ").trim() ?? "Untitled Source";
}

export function decodeDuckDuckGoUrl(rawUrl: string) {
  try {
    const parsed = new URL(rawUrl, "https://duckduckgo.com");
    const uddg = parsed.searchParams.get("uddg");
    return uddg ? decodeURIComponent(uddg) : rawUrl;
  } catch {
    return rawUrl;
  }
}

async function searchDuckDuckGoHtml(query: string, limit: number): Promise<WebSearchResult[]> {
  const response = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
    headers: {
      "user-agent": getUserAgent("Web Search"),
    },
    signal: AbortSignal.timeout(getTimeoutMs("WEB_SEARCH_TIMEOUT_MS", 12000)),
  });

  if (!response.ok) {
    throw new WebAccessError(
      `DuckDuckGo HTML search returned HTTP ${response.status}.`,
      "search_http_error",
      { status: response.status, provider: "duckduckgo_html", query },
    );
  }

  const html = await response.text();
  const matches = [
    ...html.matchAll(
      /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi,
    ),
  ];

  return matches.slice(0, limit).flatMap((match, index) => {
    const url = decodeDuckDuckGoUrl(match[1]);
    if (!url.startsWith("http")) {
      return [];
    }

    return [
      {
        id: `ddg-${index + 1}`,
        url,
        title: stripHtmlToText(match[2]) || url,
        snippet: null,
        query,
        provider: "duckduckgo_html" as const,
      },
    ];
  });
}

async function searchSerpApi(query: string, limit: number): Promise<WebSearchResult[]> {
  const apiKey = process.env.SERPAPI_API_KEY;
  if (!apiKey) {
    throw new WebAccessError("SERPAPI_API_KEY is not configured.", "search_provider_not_configured", {
      provider: "serpapi",
    });
  }

  const endpoint = new URL(process.env.SERPAPI_ENDPOINT ?? "https://serpapi.com/search.json");
  endpoint.searchParams.set("engine", process.env.SERPAPI_ENGINE ?? "google");
  endpoint.searchParams.set("q", query);
  endpoint.searchParams.set("api_key", apiKey);
  endpoint.searchParams.set("num", String(Math.min(Math.max(limit, 1), 10)));

  const response = await fetch(endpoint.toString(), {
    headers: {
      accept: "application/json",
      "user-agent": getUserAgent("Web Search"),
    },
    signal: AbortSignal.timeout(getTimeoutMs("WEB_SEARCH_TIMEOUT_MS", 18000)),
  });

  if (!response.ok) {
    throw new WebAccessError(`SerpApi returned HTTP ${response.status}.`, "search_http_error", {
      status: response.status,
      provider: "serpapi",
      query,
    });
  }

  const payload = (await response.json()) as {
    organic_results?: Array<{
      link?: string;
      title?: string;
      snippet?: string | null;
      position?: number;
    }>;
  };

  return (payload.organic_results ?? [])
    .slice(0, limit)
    .flatMap((entry, index) => {
      if (!entry.link || !entry.title) {
        return [];
      }

      return [
        {
          id: `serpapi-${entry.position ?? index + 1}`,
          url: entry.link,
          title: entry.title,
          snippet: entry.snippet ?? null,
          query,
          provider: "serpapi" as const,
        },
      ];
    });
}

async function searchBingWebSearch(query: string, limit: number): Promise<WebSearchResult[]> {
  const apiKey = process.env.BING_WEB_SEARCH_API_KEY;
  if (!apiKey) {
    throw new WebAccessError(
      "BING_WEB_SEARCH_API_KEY is not configured.",
      "search_provider_not_configured",
      { provider: "bing_web_search" },
    );
  }

  const endpoint = new URL(
    process.env.BING_WEB_SEARCH_ENDPOINT ?? "https://api.bing.microsoft.com/v7.0/search",
  );
  endpoint.searchParams.set("q", query);
  endpoint.searchParams.set("count", String(Math.min(Math.max(limit, 1), 10)));
  endpoint.searchParams.set("responseFilter", "Webpages");
  endpoint.searchParams.set("textDecorations", "false");
  endpoint.searchParams.set("textFormat", "Raw");

  const response = await fetch(endpoint.toString(), {
    headers: {
      accept: "application/json",
      "user-agent": getUserAgent("Web Search"),
      "Ocp-Apim-Subscription-Key": apiKey,
    },
    signal: AbortSignal.timeout(getTimeoutMs("WEB_SEARCH_TIMEOUT_MS", 18000)),
  });

  if (!response.ok) {
    throw new WebAccessError(
      `Bing Web Search returned HTTP ${response.status}.`,
      "search_http_error",
      { status: response.status, provider: "bing_web_search", query },
    );
  }

  const payload = (await response.json()) as {
    webPages?: {
      value?: Array<{
        url?: string;
        name?: string;
        snippet?: string | null;
        id?: string;
      }>;
    };
  };

  return (payload.webPages?.value ?? [])
    .slice(0, limit)
    .flatMap((entry, index) => {
      if (!entry.url || !entry.name) {
        return [];
      }

      return [
        {
          id: entry.id ?? `bing-${index + 1}`,
          url: entry.url,
          title: entry.name,
          snippet: entry.snippet ?? null,
          query,
          provider: "bing_web_search" as const,
        },
      ];
    });
}

async function searchCustomJson(query: string, limit: number): Promise<WebSearchResult[]> {
  const endpoint = process.env.WEB_SEARCH_ENDPOINT;
  if (!endpoint) {
    throw new WebAccessError(
      "WEB_SEARCH_ENDPOINT is not configured for custom_json search.",
      "search_provider_not_configured",
      { provider: "custom_json" },
    );
  }

  const url = new URL(endpoint);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", String(limit));

  const headers = new Headers({
    accept: "application/json",
    "user-agent": getUserAgent("Web Search"),
  });

  const authHeader = process.env.WEB_SEARCH_AUTH_HEADER;
  const authToken = process.env.WEB_SEARCH_AUTH_TOKEN;
  if (authHeader && authToken) {
    headers.set(authHeader, authToken);
  }

  const response = await fetch(url.toString(), {
    headers,
    signal: AbortSignal.timeout(12000),
  });

  if (!response.ok) {
    throw new WebAccessError(
      `Custom search provider returned HTTP ${response.status}.`,
      "search_http_error",
      { status: response.status, provider: "custom_json", query },
    );
  }

  const payload = (await response.json()) as {
    results?: Array<{ url?: string; title?: string; snippet?: string | null }>;
  };

  return (payload.results ?? [])
    .slice(0, limit)
    .flatMap((entry, index) => {
      if (!entry.url || !entry.title) {
        return [];
      }

      return [
        {
          id: `custom-${index + 1}`,
          url: entry.url,
          title: entry.title,
          snippet: entry.snippet ?? null,
          query,
          provider: "custom_json" as const,
        },
      ];
    });
}

async function runSearchProvider(
  provider: WebSearchProvider,
  query: string,
  limit: number,
) {
  if (provider === "serpapi") {
    return searchSerpApi(query, limit);
  }

  if (provider === "bing_web_search") {
    return searchBingWebSearch(query, limit);
  }

  if (provider === "custom_json") {
    return searchCustomJson(query, limit);
  }

  return searchDuckDuckGoHtml(query, limit);
}

export async function searchWeb(
  queries: string[],
  options?: { perQueryLimit?: number; totalLimit?: number },
): Promise<WebSearchResponse> {
  const perQueryLimit = options?.perQueryLimit ?? 6;
  const totalLimit = options?.totalLimit ?? 12;
  const providers = parseProviders();
  const attempts: WebSearchAttempt[] = [];
  const seen = new Set<string>();
  const results: WebSearchResult[] = [];

  for (const query of queries) {
    for (const provider of providers) {
      try {
        const providerResults = await runSearchProvider(provider, query, perQueryLimit);

        attempts.push({
          provider,
          query,
          ok: true,
          resultCount: providerResults.length,
        });

        for (const result of providerResults) {
          if (seen.has(result.url)) {
            continue;
          }

          seen.add(result.url);
          results.push(result);

          if (results.length >= totalLimit) {
            return { results, attempts };
          }
        }

        if (providerResults.length > 0) {
          break;
        }
      } catch (error) {
        attempts.push({
          provider,
          query,
          ok: false,
          resultCount: 0,
          errorMessage: error instanceof Error ? error.message : "Unknown search error",
        });
      }
    }
  }

  return { results, attempts };
}

export async function fetchWebPage(
  url: string,
  options?: { purpose?: string; minTextLength?: number },
): Promise<WebFetchedPage> {
  const response = await fetch(url, {
    headers: {
      "user-agent": getUserAgent(options?.purpose ?? "Page Fetch"),
    },
    redirect: "follow",
    signal: AbortSignal.timeout(getTimeoutMs("WEB_FETCH_TIMEOUT_MS", 20000)),
  });

  if (!response.ok) {
    throw new WebAccessError(`Source fetch returned HTTP ${response.status}.`, "fetch_http_error", {
      status: response.status,
      url,
    });
  }

  // response.text() decodes whatever bytes come back as if they were UTF-8
  // text regardless of content-type — for a PDF (or image, video, etc.)
  // that turns the raw binary into a garbled "text" blob (still containing
  // recognizable structure like "%PDF-1.4" headers and xref tables) with
  // none of the punctuation stripHtmlToText or the sentence-splitting
  // fallback extractor expect. Without normal sentence boundaries, that
  // fallback treats the entire blob as one "sentence" with no length cap,
  // producing a single multi-megabyte claimText (confirmed in production:
  // a 24.9MB dossier from exactly this). Reject non-HTML content up front
  // instead of silently mangling it.
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType && !/text\/html|application\/xhtml\+xml/i.test(contentType)) {
    throw new WebAccessError(
      `Fetched content is not HTML (content-type: ${contentType}) — skipping to avoid treating binary content as text.`,
      "fetch_unsupported_content_type",
      { url, contentType },
    );
  }

  const html = await response.text();
  const text = stripHtmlToText(html);
  const minTextLength = options?.minTextLength ?? 400;

  if (text.length < minTextLength) {
    throw new WebAccessError(
      `Fetched page content was too short to trust (${text.length} chars).`,
      "fetch_content_too_short",
      { url, minTextLength, actualTextLength: text.length },
    );
  }

  const finalUrl = response.url || url;
  let publisher: string | null = null;
  try {
    publisher = new URL(finalUrl).hostname.replace(/^www\./, "");
  } catch {
    publisher = null;
  }

  return {
    requestedUrl: url,
    finalUrl,
    title: extractTitleFromHtml(html),
    html,
    text,
    contentType: response.headers.get("content-type"),
    publisher,
  };
}

export function summarizeSearchAttempts(attempts: WebSearchAttempt[]) {
  if (attempts.length === 0) {
    return "No web-search attempts were made.";
  }

  return attempts
    .map((attempt) =>
      attempt.ok
        ? `${attempt.provider} returned ${attempt.resultCount} result(s) for "${attempt.query}".`
        : `${attempt.provider} failed for "${attempt.query}": ${attempt.errorMessage ?? "unknown error"}`,
    )
    .join(" ");
}

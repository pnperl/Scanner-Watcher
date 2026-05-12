import { logger } from "./logger";

export interface ChartinkStock {
  nsecode: string;
  bsecode?: string;
  close?: number;
  per_chg?: number;
  volume?: number;
}

export interface ChartinkResult {
  stocks: ChartinkStock[];
  error?: string;
}

// ---------------------------------------------------------------------------
// Global Chartink request throttle
// All scans are serialised through a single queue — never concurrent.
// ---------------------------------------------------------------------------

const MIN_SPACING_MS = 4_000;
const JITTER_MS = 2_000;

let queueTail: Promise<void> = Promise.resolve();
let lastRequestTime = 0;
let backoffUntil = 0;

function enqueueChartinkRequest<T>(fn: () => Promise<T>): Promise<T> {
  const result = queueTail.then(async (): Promise<T> => {
    const now = Date.now();
    if (backoffUntil > now) {
      const wait = backoffUntil - now;
      logger.warn({ waitMs: wait }, "Chartink global backoff active — waiting");
      await sleep(wait);
    }
    const elapsed = Date.now() - lastRequestTime;
    if (elapsed < MIN_SPACING_MS) {
      const extra = MIN_SPACING_MS - elapsed + Math.floor(Math.random() * JITTER_MS);
      await sleep(extra);
    }
    const r = await fn();
    lastRequestTime = Date.now();
    return r;
  });
  queueTail = result.then(() => undefined, () => undefined);
  return result;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function randomDelay(min: number, max: number): Promise<void> {
  return sleep(Math.floor(Math.random() * (max - min + 1)) + min);
}

// ---------------------------------------------------------------------------
// User-agent pool
// ---------------------------------------------------------------------------

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 Edg/123.0.0.0",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
];

function randomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]!;
}

// ---------------------------------------------------------------------------
// URL helpers
// ---------------------------------------------------------------------------

function buildScreenerPageUrl(scannerUrl: string): string {
  if (
    scannerUrl.startsWith("https://chartink.com") ||
    scannerUrl.startsWith("http://chartink.com")
  ) {
    return scannerUrl;
  }
  return `https://chartink.com/screener/${encodeURIComponent(scannerUrl)}`;
}

/**
 * Fallback scan clause from URL — only used when atlas_query is unavailable
 * (e.g. inline ?scan_clause= URLs where the expression is in the URL itself).
 */
function deriveScanClauseFromUrl(scannerUrl: string): string | null {
  const clauseMatch = scannerUrl.match(/[?&]scan_clause=([^&]+)/);
  if (clauseMatch) return decodeURIComponent(clauseMatch[1]!);
  return null;
}

// ---------------------------------------------------------------------------
// HTML helpers
// ---------------------------------------------------------------------------

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'");
}

/**
 * Extract the atlas_query scan expression from Chartink's HTML.
 *
 * Chartink renders screener data as a JSON object inside the :scan-json Vue prop.
 * The JSON is HTML-entity-encoded, so internal quote chars are &quot; not ".
 * The atlas_query field holds the actual scan expression to POST.
 *
 * Pattern in HTML:
 *   &quot;atlas_query&quot;:&quot;EXPRESSION_WITH_ENTITIES&quot;,&quot;
 */
function extractAtlasQuery(html: string): string | null {
  // Match everything between atlas_query&quot;:&quot; and the closing &quot;,
  // Use a non-greedy match; atlas_query is always followed by another JSON key
  const marker = '&quot;atlas_query&quot;:&quot;';
  const start = html.indexOf(marker);
  if (start === -1) return null;

  const valueStart = start + marker.length;
  // The value ends at &quot; followed by , (next JSON field separator)
  // or at &quot; followed by } (end of object)
  const endMarker1 = '&quot;,&quot;'; // normal field terminator: ","
  const endMarker2 = '&quot;}';      // last field in object
  const endMarker3 = '&quot;,\\&quot;'; // escaped variant (shouldn't occur but guard)

  let valueEnd = -1;
  const e1 = html.indexOf(endMarker1, valueStart);
  const e2 = html.indexOf(endMarker2, valueStart);

  if (e1 !== -1 && e2 !== -1) valueEnd = Math.min(e1, e2);
  else if (e1 !== -1) valueEnd = e1;
  else if (e2 !== -1) valueEnd = e2;

  if (valueEnd === -1) return null;

  const encoded = html.slice(valueStart, valueEnd);
  const decoded = decodeHtmlEntities(encoded);
  return decoded.trim() || null;
}

// ---------------------------------------------------------------------------
// Page session (CSRF + cookies + scan clause)
// ---------------------------------------------------------------------------

interface PageSession {
  csrf: string;
  cookies: string;
  /** The real scan expression extracted from atlas_query in the page */
  atlasQuery: string | null;
}

async function fetchPageSession(
  screenerUrl: string,
  userAgent: string,
): Promise<PageSession | null> {
  try {
    const resp = await fetch(screenerUrl, {
      headers: {
        "User-Agent": userAgent,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Accept-Encoding": "gzip, deflate, br",
        Connection: "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Cache-Control": "max-age=0",
      },
      redirect: "follow",
    });

    if (!resp.ok) {
      logger.warn({ status: resp.status, screenerUrl }, "Screener page returned non-200");
      return null;
    }

    // Collect Set-Cookie headers
    const rawCookies: string[] = [];
    resp.headers.forEach((value, key) => {
      if (key.toLowerCase() === "set-cookie") {
        const part = value.split(";")[0];
        if (part) rawCookies.push(part.trim());
      }
    });

    const html = await resp.text();

    // CSRF token
    let csrf: string | null = null;
    const metaMatch = html.match(
      /meta\s+name=["']csrf-token["']\s+content=["']([^"']+)["']/i,
    );
    if (metaMatch) csrf = metaMatch[1]!;
    if (!csrf) {
      const inputMatch = html.match(/name=["']_token["']\s+value=["']([^"']+)["']/i);
      if (inputMatch) csrf = inputMatch[1]!;
    }

    if (!csrf) {
      logger.warn({ screenerUrl }, "CSRF token not found in page HTML");
      return null;
    }

    // Atlas query — the real scan expression embedded by Chartink in the Vue prop
    const atlasQuery = extractAtlasQuery(html);

    logger.info(
      {
        screenerUrl,
        csrfLength: csrf.length,
        cookieCount: rawCookies.length,
        atlasQuerySource: atlasQuery ? "page-html atlas_query" : "not found in page",
        atlasQueryPreview: atlasQuery ? atlasQuery.slice(0, 100) : "(none)",
      },
      "Page session fetched",
    );

    return { csrf, cookies: rawCookies.join("; "), atlasQuery };
  } catch (err) {
    logger.error({ err, screenerUrl }, "Failed to load screener page");
    return null;
  }
}

// ---------------------------------------------------------------------------
// Core scan — runs inside the global serial queue
// ---------------------------------------------------------------------------

async function doScan(scannerUrl: string, attempt: number): Promise<ChartinkResult> {
  const userAgent = randomUserAgent();
  const screenerPageUrl = buildScreenerPageUrl(scannerUrl);

  await randomDelay(1_000, 2_500);

  const session = await fetchPageSession(screenerPageUrl, userAgent);
  if (!session) {
    return { stocks: [], error: "Failed to load screener page (CSRF unavailable)" };
  }

  // Priority order for scan clause:
  //   1. atlas_query extracted from page HTML  ← the correct criteria for named screeners
  //   2. ?scan_clause= query param in the URL  ← inline expression URLs
  const scanClause = session.atlasQuery ?? deriveScanClauseFromUrl(scannerUrl);

  if (!scanClause) {
    return {
      stocks: [],
      error: "Could not determine scan clause from page or URL. Try using a ?scan_clause= URL.",
    };
  }

  logger.info(
    { attempt, source: session.atlasQuery ? "atlas_query" : "url-param", scannerUrl },
    "Sending scan POST",
  );

  await randomDelay(1_500, 3_000);

  const resp = await fetch("https://chartink.com/screener/process", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      "X-CSRF-TOKEN": session.csrf,
      "User-Agent": userAgent,
      Referer: screenerPageUrl,
      Origin: "https://chartink.com",
      Accept: "application/json, text/javascript, */*; q=0.01",
      "Accept-Language": "en-US,en;q=0.5",
      "Accept-Encoding": "gzip, deflate, br",
      Connection: "keep-alive",
      Cookie: session.cookies,
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-origin",
    },
    body: `scan_clause=${encodeURIComponent(scanClause)}`,
  });

  if (resp.status === 429) {
    const retryAfter = parseInt(resp.headers.get("retry-after") ?? "0", 10);
    const backoffMs = Math.max(retryAfter * 1_000, 3 * 60 * 1_000);
    backoffUntil = Date.now() + backoffMs;
    logger.warn({ backoffMs }, "Chartink 429 — global backoff set");
    return { stocks: [], error: "HTTP 429 (rate limited — pausing all scans)" };
  }

  if (resp.status === 419) {
    logger.warn({ attempt, url: scannerUrl }, "Chartink 419 CSRF mismatch");
    return { stocks: [], error: "HTTP 419 (CSRF mismatch)" };
  }

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    logger.warn({ status: resp.status, url: scannerUrl, body: body.slice(0, 300) }, "Chartink POST non-200");
    return { stocks: [], error: `HTTP ${resp.status}` };
  }

  const data = (await resp.json()) as { data?: ChartinkStock[]; scan_error?: string; error?: string };

  if (data.scan_error) {
    logger.warn({ scan_error: data.scan_error, scannerUrl }, "Chartink scan_error");
    return { stocks: [], error: `Scan error: ${data.scan_error}` };
  }
  if (data.error) return { stocks: [], error: data.error };

  return { stocks: data.data ?? [] };
}

// ---------------------------------------------------------------------------
// Public API — queued, with 419 retry
// ---------------------------------------------------------------------------

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 5_000;

export async function runChartinkScan(scannerUrl: string): Promise<ChartinkResult> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const result = await enqueueChartinkRequest(() => doScan(scannerUrl, attempt));

    if (!result.error || result.error.includes("429")) {
      return result;
    }

    if (result.error.includes("419") && attempt < MAX_RETRIES) {
      logger.info({ attempt, scannerUrl }, "419 received — retrying with fresh session");
      await sleep(RETRY_DELAY_MS);
      continue;
    }

    return result;
  }
  return { stocks: [], error: "Max retries exceeded" };
}

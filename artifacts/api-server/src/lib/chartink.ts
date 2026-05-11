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
// All scans (regardless of scanner) are serialised through this queue so we
// never hit Chartink with concurrent requests from the same server IP.
// ---------------------------------------------------------------------------

const MIN_SPACING_MS = 4_000;   // at least 4 s between consecutive Chartink hits
const JITTER_MS      = 2_000;   // up to +2 s extra jitter

let queueTail: Promise<void> = Promise.resolve();
let lastRequestTime = 0;
/** When >0, all queued work waits until this timestamp before proceeding. */
let backoffUntil = 0;

function enqueueChartinkRequest<T>(fn: () => Promise<T>): Promise<T> {
  const result = queueTail.then(async (): Promise<T> => {
    // Respect global 429 backoff
    const now = Date.now();
    if (backoffUntil > now) {
      const wait = backoffUntil - now;
      logger.warn({ waitMs: wait }, "Chartink global backoff active — waiting");
      await sleep(wait);
    }

    // Enforce minimum spacing since last request
    const elapsed = Date.now() - lastRequestTime;
    if (elapsed < MIN_SPACING_MS) {
      const extra = MIN_SPACING_MS - elapsed + Math.floor(Math.random() * JITTER_MS);
      await sleep(extra);
    }

    const r = await fn();
    lastRequestTime = Date.now();
    return r;
  });

  // Chain future work onto the settled result (ignore errors so queue keeps draining)
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

function deriveScanClauseFromUrl(scannerUrl: string): string | null {
  const clauseMatch = scannerUrl.match(/[?&]scan_clause=([^&]+)/);
  if (clauseMatch) return decodeURIComponent(clauseMatch[1]!);

  const numericMatch = scannerUrl.match(/\/screener\/(\d+)\/?(?:[?#].*)?$/);
  if (numericMatch) return numericMatch[1]!;

  const slugMatch = scannerUrl.match(/\/screener\/([a-z0-9][a-z0-9-]*)(?:\/|\?|#|$)/i);
  if (slugMatch) return slugMatch[1]!;

  return null;
}

// ---------------------------------------------------------------------------
// Page session (CSRF + cookies + embedded scan clause)
// ---------------------------------------------------------------------------

interface PageSession {
  csrf: string;
  cookies: string;
  scanClause: string | null; // extracted from page HTML if present
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

    // CSRF token — try meta tag then hidden input
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

    // Embedded scan clause — try several patterns Chartink uses
    let scanClause: string | null = null;

    const textareaMatch = html.match(
      /<textarea[^>]*id=["']scan_clause["'][^>]*>([\s\S]*?)<\/textarea>/i,
    );
    if (textareaMatch) scanClause = decodeHtmlEntities(textareaMatch[1]!.trim());

    if (!scanClause) {
      const inputMatch = html.match(/name=["']scan_clause["'][^>]*value=["']([^"']+)["']/i);
      if (inputMatch) scanClause = decodeHtmlEntities(inputMatch[1]!);
    }
    if (!scanClause) {
      const inputMatch2 = html.match(
        /value=["']([^"']+)["'][^>]*name=["']scan_clause["']/i,
      );
      if (inputMatch2) scanClause = decodeHtmlEntities(inputMatch2[1]!);
    }
    if (!scanClause) {
      const jsMatch = html.match(/(?:var\s+)?scan_clause\s*=\s*["']([^"']+)["']/i);
      if (jsMatch) scanClause = decodeHtmlEntities(jsMatch[1]!);
    }

    logger.info(
      {
        screenerUrl,
        csrfLength: csrf.length,
        cookieCount: rawCookies.length,
        scanClauseSource: scanClause ? "page-html" : "none",
        scanClausePreview: scanClause?.slice(0, 80) ?? "(not in HTML — will use URL)",
      },
      "Page session fetched",
    );

    return { csrf, cookies: rawCookies.join("; "), scanClause };
  } catch (err) {
    logger.error({ err, screenerUrl }, "Failed to load screener page");
    return null;
  }
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'");
}

// ---------------------------------------------------------------------------
// Core scan — runs inside the global serial queue
// ---------------------------------------------------------------------------

async function doScan(screenerUrl: string, attempt: number): Promise<ChartinkResult> {
  const userAgent = randomUserAgent();
  const screenerPageUrl = buildScreenerPageUrl(screenerUrl);

  // Human-like reading delay before hitting the page
  await randomDelay(1_000, 2_500);

  const session = await fetchPageSession(screenerPageUrl, userAgent);
  if (!session) {
    return { stocks: [], error: "Failed to load screener page (CSRF unavailable)" };
  }

  // Use clause from page HTML if found; fall back to the URL slug/clause
  const scanClause =
    (session.scanClause && session.scanClause.length > 0)
      ? session.scanClause
      : deriveScanClauseFromUrl(screenerUrl);

  if (!scanClause) {
    return { stocks: [], error: "Could not determine scan_clause from URL or page" };
  }

  logger.info(
    { attempt, scanClause: scanClause.slice(0, 80), screenerPageUrl },
    "Sending scan POST",
  );

  // Mimic delay between page load and the XHR the browser fires
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
    const backoffMs = Math.max(retryAfter * 1_000, 3 * 60 * 1_000); // min 3 min
    backoffUntil = Date.now() + backoffMs;
    logger.warn({ backoffMs }, "Chartink 429 — global backoff set");
    return { stocks: [], error: "HTTP 429 (rate limited — pausing all scans)" };
  }

  if (resp.status === 419) {
    logger.warn({ attempt, url: screenerUrl }, "Chartink 419 CSRF mismatch");
    return { stocks: [], error: "HTTP 419 (CSRF mismatch)" };
  }

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    logger.warn(
      { status: resp.status, url: screenerUrl, body: body.slice(0, 300) },
      "Chartink POST non-200",
    );
    return { stocks: [], error: `HTTP ${resp.status}` };
  }

  const data = (await resp.json()) as { data?: ChartinkStock[]; error?: string };
  if (data.error) return { stocks: [], error: data.error };
  return { stocks: data.data ?? [] };
}

// ---------------------------------------------------------------------------
// Public API — queued, with 419 retry
// ---------------------------------------------------------------------------

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 5_000; // wait 5 s before retry on 419

export async function runChartinkScan(scannerUrl: string): Promise<ChartinkResult> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const result = await enqueueChartinkRequest(() => doScan(scannerUrl, attempt));

    if (!result.error || result.error.includes("429")) {
      // Success or hard rate limit — don't retry either way
      return result;
    }

    if (result.error.includes("419") && attempt < MAX_RETRIES) {
      logger.info({ attempt, scannerUrl }, "419 received — will retry with fresh CSRF");
      await sleep(RETRY_DELAY_MS);
      continue;
    }

    return result;
  }

  return { stocks: [], error: "Max retries exceeded" };
}

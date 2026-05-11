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

function randomDelay(min: number, max: number): Promise<void> {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise((r) => setTimeout(r, ms));
}

/** Derive the canonical screener page URL from whatever the user saved */
function buildScreenerPageUrl(scannerUrl: string): string {
  // Already a full Chartink URL → use as-is
  if (scannerUrl.startsWith("https://chartink.com") || scannerUrl.startsWith("http://chartink.com")) {
    return scannerUrl;
  }
  // Bare slug or id
  return `https://chartink.com/screener/${encodeURIComponent(scannerUrl)}`;
}

interface PageSession {
  csrf: string;
  cookies: string;
  /** The actual scan criteria expression extracted from the page (may be empty for inline clause URLs) */
  scanClause: string | null;
}

/**
 * Load the specific screener page. Returns:
 *   - csrf token
 *   - all session cookies (to replay on the POST)
 *   - the actual scan_clause expression embedded in the page HTML
 *
 * Chartink renders the criteria inside several possible elements. We try each in order.
 */
async function fetchPageSession(screenerUrl: string, userAgent: string): Promise<PageSession | null> {
  try {
    const resp = await fetch(screenerUrl, {
      headers: {
        "User-Agent": userAgent,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
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
      logger.warn({ status: resp.status, screenerUrl }, "Screener page fetch returned non-200");
      return null;
    }

    // Collect Set-Cookie headers
    const rawCookies: string[] = [];
    resp.headers.forEach((value, key) => {
      if (key.toLowerCase() === "set-cookie") {
        const cookiePart = value.split(";")[0];
        if (cookiePart) rawCookies.push(cookiePart.trim());
      }
    });

    const html = await resp.text();

    // --- CSRF token ---
    let csrf: string | null = null;
    const metaMatch = html.match(/meta\s+name=["']csrf-token["']\s+content=["']([^"']+)["']/i);
    if (metaMatch) csrf = metaMatch[1]!;
    if (!csrf) {
      const inputMatch = html.match(/name=["']_token["']\s+value=["']([^"']+)["']/i);
      if (inputMatch) csrf = inputMatch[1]!;
    }

    if (!csrf) {
      logger.warn({ screenerUrl }, "Could not find CSRF token in page HTML");
      return null;
    }

    // --- Scan clause ---
    // Chartink embeds the criteria in several possible ways depending on page type:
    let scanClause: string | null = null;

    // 1) <textarea id="scan_clause">…</textarea>  (most common for saved screeners)
    const textareaMatch = html.match(/<textarea[^>]*id=["']scan_clause["'][^>]*>([\s\S]*?)<\/textarea>/i);
    if (textareaMatch) scanClause = decodeHtmlEntities(textareaMatch[1]!.trim());

    // 2) <input … name="scan_clause" value="…">
    if (!scanClause) {
      const inputMatch = html.match(/name=["']scan_clause["'][^>]*value=["']([^"']+)["']/i);
      if (inputMatch) scanClause = decodeHtmlEntities(inputMatch[1]!);
    }
    if (!scanClause) {
      const inputMatch2 = html.match(/value=["']([^"']+)["'][^>]*name=["']scan_clause["']/i);
      if (inputMatch2) scanClause = decodeHtmlEntities(inputMatch2[1]!);
    }

    // 3) JavaScript variable: scan_clause = "…" or var scan_clause="…"
    if (!scanClause) {
      const jsMatch = html.match(/(?:var\s+)?scan_clause\s*=\s*["']([^"']+)["']/i);
      if (jsMatch) scanClause = decodeHtmlEntities(jsMatch[1]!);
    }

    // 4) data attribute on any element
    if (!scanClause) {
      const dataMatch = html.match(/data-scan[_-]clause=["']([^"']+)["']/i);
      if (dataMatch) scanClause = decodeHtmlEntities(dataMatch[1]!);
    }

    logger.info(
      {
        screenerUrl,
        csrfLength: csrf.length,
        cookieCount: rawCookies.length,
        scanClauseLength: scanClause?.length ?? 0,
        scanClausePreview: scanClause?.slice(0, 80) ?? "(not found in page)",
      },
      "Page session fetched",
    );

    return { csrf, cookies: rawCookies.join("; "), scanClause };
  } catch (err) {
    logger.error({ err, screenerUrl }, "Failed to load screener page");
    return null;
  }
}

/** Minimal HTML entity decoding for scan clause content */
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
 * Derive the scan_clause for the POST body.
 *
 * Priority:
 *   1. Clause extracted from the page HTML (most accurate for named screeners)
 *   2. ?scan_clause= query param from the URL (inline expression URLs)
 *   3. The URL slug/numeric ID (last resort — works for some numeric screener IDs)
 */
function deriveScanClause(screenerUrl: string, pageClause: string | null): string | null {
  if (pageClause && pageClause.length > 0) return pageClause;

  const clauseMatch = screenerUrl.match(/[?&]scan_clause=([^&]+)/);
  if (clauseMatch) return decodeURIComponent(clauseMatch[1]!);

  // Numeric ID (Chartink resolves these server-side)
  const numericMatch = screenerUrl.match(/\/screener\/(\d+)\/?(?:[?#].*)?$/);
  if (numericMatch) return numericMatch[1]!;

  // Named slug — last resort; may not work correctly
  const slugMatch = screenerUrl.match(/\/screener\/([a-z0-9][a-z0-9-]*)\/?(?:[?#].*)?$/i);
  if (slugMatch) return slugMatch[1]!;

  return null;
}

export async function runChartinkScan(scannerUrl: string): Promise<ChartinkResult> {
  const screenerPageUrl = buildScreenerPageUrl(scannerUrl);
  const userAgent = randomUserAgent();

  // Human-like delay before loading the page
  await randomDelay(800, 2200);

  const session = await fetchPageSession(screenerPageUrl, userAgent);
  if (!session) {
    return { stocks: [], error: "Failed to load screener page (could not get CSRF token)" };
  }

  const scanClause = deriveScanClause(scannerUrl, session.scanClause);
  if (!scanClause) {
    return { stocks: [], error: "Could not determine scan clause from URL or page" };
  }

  logger.info({ scanClause: scanClause.slice(0, 100), screenerPageUrl }, "Using scan clause");

  // Delay between page load and XHR (mimic user reading the page before running it)
  await randomDelay(1200, 2800);

  try {
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

    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      logger.warn(
        { status: resp.status, url: scannerUrl, body: body.slice(0, 300) },
        "Chartink POST returned non-200",
      );
      return { stocks: [], error: `HTTP ${resp.status}` };
    }

    const data = (await resp.json()) as { data?: ChartinkStock[]; error?: string };

    if (data.error) {
      return { stocks: [], error: data.error };
    }

    return { stocks: data.data ?? [] };
  } catch (err) {
    logger.error({ err }, "Chartink scan POST failed");
    return { stocks: [], error: String(err) };
  }
}

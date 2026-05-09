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
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36",
];

function randomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]!;
}

function extractScannerIdFromUrl(url: string): string | null {
  // ?scan_clause=<encoded clause>
  const clauseMatch = url.match(/[?&]scan_clause=([^&]+)/);
  if (clauseMatch) return decodeURIComponent(clauseMatch[1]!);

  // Numeric screener ID: /screener/12345 or /12345
  const numericMatch = url.match(/\/(\d+)\/?(?:[?#].*)?$/);
  if (numericMatch) return numericMatch[1]!;

  // Named screener slug: https://chartink.com/screener/some-slug
  // Use the slug itself as the scan_clause (Chartink resolves named screeners by slug)
  const slugMatch = url.match(/\/screener\/([a-z0-9][a-z0-9-]*[a-z0-9])\/?(?:[?#].*)?$/i);
  if (slugMatch) return slugMatch[1]!;

  return null;
}

async function fetchCsrfToken(referer: string): Promise<string | null> {
  try {
    const resp = await fetch("https://chartink.com/screener/", {
      headers: {
        "User-Agent": randomUserAgent(),
        Referer: referer,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    const html = await resp.text();
    const match = html.match(/meta\s+name="csrf-token"\s+content="([^"]+)"/);
    return match ? match[1]! : null;
  } catch (err) {
    logger.error({ err }, "Failed to fetch CSRF token");
    return null;
  }
}

export async function runChartinkScan(scannerUrl: string): Promise<ChartinkResult> {
  const scanClause = extractScannerIdFromUrl(scannerUrl);
  if (!scanClause) {
    return { stocks: [], error: "Could not parse scanner clause from URL" };
  }

  const referer = scannerUrl.startsWith("http") ? scannerUrl : `https://chartink.com/screener/?scan_clause=${encodeURIComponent(scanClause)}`;

  await randomDelay(500, 1500);

  const csrfToken = await fetchCsrfToken(referer);
  if (!csrfToken) {
    return { stocks: [], error: "Failed to obtain CSRF token" };
  }

  await randomDelay(300, 800);

  try {
    const resp = await fetch("https://chartink.com/screener/process", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        "X-CSRF-TOKEN": csrfToken,
        "User-Agent": randomUserAgent(),
        Referer: referer,
        Origin: "https://chartink.com",
        Accept: "application/json, text/javascript, */*; q=0.01",
      },
      body: `scan_clause=${encodeURIComponent(scanClause)}`,
    });

    if (!resp.ok) {
      logger.warn({ status: resp.status, url: scannerUrl }, "Chartink API returned non-200");
      return { stocks: [], error: `HTTP ${resp.status}` };
    }

    const data = (await resp.json()) as { data?: ChartinkStock[]; error?: string };

    if (data.error) {
      return { stocks: [], error: data.error };
    }

    return { stocks: data.data ?? [] };
  } catch (err) {
    logger.error({ err }, "Chartink scan failed");
    return { stocks: [], error: String(err) };
  }
}

function randomDelay(min: number, max: number): Promise<void> {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise((r) => setTimeout(r, ms));
}

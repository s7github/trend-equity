/**
 * Live Signal Fetcher — pre-fetches real-world market signals before idea generation
 * so the model is grounded in actual current data, not training-data trends.
 *
 * Sources (all free, no auth):
 *   - Google Trends RSS (rising searches, US, last 24h)
 *   - Product Hunt RSS (launched this week)
 *   - Reddit JSON API (hot posts, r/SaaS+startups+Entrepreneur)
 *   - HN Algolia Search API (best stories by points)
 *   - TechCrunch RSS (funding/startup news)
 *
 * Cached in-memory for 1 hour to avoid hammering APIs on every generation.
 */

import { getCached, setCached } from './cache';

export interface LiveSignals {
  googleTrends: string[];
  productHuntLaunches: string[];
  redditHotThreads: string[];
  hnDiscussions: string[];
  techCrunchFunding: string[];
  fetchedAt: string;
  sourcesCached: boolean;
}

// ── Simple RSS parser (no dependencies) ──────────────────────────────────────

function extractRssItems(xml: string, limit = 12): string[] {
  const results: string[] = [];
  const itemRegex = /<item[\s\S]*?<\/item>/gi;
  // CDATA and plain title formats
  const titleRegex = /<title[^>]*>(?:<!\[CDATA\[)?\s*([\s\S]*?)\s*(?:\]\]>)?<\/title>/i;

  const items = xml.match(itemRegex) || [];
  for (const item of items.slice(0, limit)) {
    const m = item.match(titleRegex);
    if (m?.[1]) {
      const title = m[1]
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/\n/g, ' ')
        .trim();
      if (title) results.push(title);
    }
  }
  return results;
}

// ── Fetch helper with timeout ─────────────────────────────────────────────────

async function fetchWithTimeout(url: string, timeoutMs = 7000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TrendEquity/1.0; +https://trend-equity.app)',
        Accept: 'text/html,application/xhtml+xml,application/xml,application/json,*/*',
        'Cache-Control': 'no-cache',
      },
    });
  } finally {
    clearTimeout(id);
  }
}

// ── Individual source fetchers ────────────────────────────────────────────────

async function fetchGoogleTrends(): Promise<string[]> {
  try {
    const res = await fetchWithTimeout('https://trends.google.com/trending/rss?geo=US&hl=en-US');
    if (!res.ok) return [];
    const xml = await res.text();
    return extractRssItems(xml, 15);
  } catch {
    return [];
  }
}

async function fetchProductHunt(): Promise<string[]> {
  try {
    const res = await fetchWithTimeout('https://www.producthunt.com/feed');
    if (!res.ok) return [];
    const xml = await res.text();
    // PH RSS titles include the product name and tagline
    return extractRssItems(xml, 10);
  } catch {
    return [];
  }
}

async function fetchReddit(): Promise<string[]> {
  try {
    const res = await fetchWithTimeout(
      'https://www.reddit.com/r/SaaS+startups+Entrepreneur+smallbusiness.json?sort=hot&limit=25&t=week'
    );
    if (!res.ok) throw new Error(`Reddit JSON API returned ${res.status}`);
    const json = (await res.json()) as any;
    const children = json?.data?.children ?? [];
    return children
      .filter((p: any) => p.data?.ups > 30 && !p.data?.stickied)
      .slice(0, 15)
      .map((p: any) => `[r/${p.data.subreddit}] "${p.data.title}" (${p.data.ups} upvotes)`);
  } catch (err: any) {
    console.warn('[signals] Reddit JSON API failed, trying RSS fallback:', err?.message);
    // Fallback: Reddit RSS feed (works without JSON API, lower freshness but resilient)
    try {
      const rssRes = await fetchWithTimeout(
        'https://www.reddit.com/r/SaaS+startups+Entrepreneur+smallbusiness/.rss?sort=hot&limit=25'
      );
      if (!rssRes.ok) return [];
      const xml = await rssRes.text();
      return extractRssItems(xml, 15);
    } catch (rssErr: any) {
      console.warn('[signals] Reddit RSS fallback also failed:', rssErr?.message);
      return [];
    }
  }
}

async function fetchHackerNews(): Promise<string[]> {
  try {
    // Filter to last 30 days so we get recent signal, not all-time classics
    const thirtyDaysAgo = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60;
    const res = await fetchWithTimeout(
      `https://hn.algolia.com/api/v1/search?tags=story&numericFilters=points%3E30,created_at_i%3E${thirtyDaysAgo}&hitsPerPage=15`
    );
    if (!res.ok) return [];
    const json = (await res.json()) as any;
    return (json.hits ?? [])
      .slice(0, 12)
      .map((h: any) => `"${h.title}" (${h.points} pts)`)
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function fetchTechCrunch(): Promise<string[]> {
  try {
    // Funding/startup news specifically
    const res = await fetchWithTimeout('https://techcrunch.com/tag/funding/feed/');
    if (!res.ok) return [];
    const xml = await res.text();
    return extractRssItems(xml, 8);
  } catch {
    return [];
  }
}

// ── Cache ─────────────────────────────────────────────────────────────────────
// Firestore-shared 1-hour cache so all serverless instances read the same
// signal snapshot instead of each re-fetching external APIs (TE-06).
const SIGNAL_CACHE_KEY = 'signals_live';
const SIGNAL_TTL_MS = 60 * 60 * 1000; // 1 hour

export interface SignalMetrics {
  signals: LiveSignals;
  sourceCount: number;
}

export async function fetchLiveSignals(): Promise<LiveSignals> {
  // 1. Try Firestore-shared cache first (TE-06: shared across instances)
  try {
    const cached = await getCached(SIGNAL_CACHE_KEY);
    if (cached && Date.now() - cached.generatedAt < SIGNAL_TTL_MS) {
      return { ...cached.result, sourcesCached: true };
    }
  } catch {
    // Fall through to live fetch if cache read fails
  }

  // 2. Fetch live signals from all sources concurrently
  const startTime = Date.now();
  const results = await Promise.allSettled([
    (async () => {
      const r = await fetchGoogleTrends();
      return { source: 'googleTrends', data: r, error: null as string | null };
    })(),
    (async () => {
      const r = await fetchProductHunt();
      return { source: 'productHuntLaunches', data: r, error: null as string | null };
    })(),
    (async () => {
      try {
        const r = await fetchReddit();
        return { source: 'redditHotThreads', data: r, error: null as string | null };
      } catch (err: any) {
        return { source: 'redditHotThreads', data: [], error: err?.message };
      }
    })(),
    (async () => {
      const r = await fetchHackerNews();
      return { source: 'hnDiscussions', data: r, error: null as string | null };
    })(),
    (async () => {
      const r = await fetchTechCrunch();
      return { source: 'techCrunchFunding', data: r, error: null as string | null };
    })(),
  ]);

  const signals: LiveSignals = {
    googleTrends: [],
    productHuntLaunches: [],
    redditHotThreads: [],
    hnDiscussions: [],
    techCrunchFunding: [],
    fetchedAt: new Date().toISOString(),
    sourcesCached: false,
  };

  const failures: string[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      const { source, data, error } = result.value;
      (signals as any)[source] = data || [];
      if (error) failures.push(`${source}: ${error}`);
    } else {
      failures.push(result.reason?.message || 'unknown source failure');
    }
  }

  const totalSignals =
    signals.googleTrends.length +
    signals.productHuntLaunches.length +
    signals.redditHotThreads.length +
    signals.hnDiscussions.length +
    signals.techCrunchFunding.length;

  // 3. Log signal health for observability (TE-06 + TE-04)
  const sourceCount = [
    signals.googleTrends,
    signals.productHuntLaunches,
    signals.redditHotThreads,
    signals.hnDiscussions,
    signals.techCrunchFunding,
  ].filter((s) => s.length > 0).length;

  console.log(
    `[signals] Fetched in ${Date.now() - startTime}ms: Google=${signals.googleTrends.length}, PH=${signals.productHuntLaunches.length}, Reddit=${signals.redditHotThreads.length}, HN=${signals.hnDiscussions.length}, TC=${signals.techCrunchFunding.length} (sources: ${sourceCount}/5)`
  );

  if (failures.length > 0) {
    console.warn(`[signals] Source failures: ${failures.join('; ')}`);
  }

  if (sourceCount === 0) {
    console.warn(
      '[signals] ADMIN ALERT: Zero signal sources returned — generation will be ungrounded'
    );
  }

  // 4. Write to Firestore-shared cache if we got meaningful data (TE-06)
  if (totalSignals > 0) {
    try {
      await setCached(SIGNAL_CACHE_KEY, signals);
    } catch (cacheErr: any) {
      console.warn('[signals] Failed to write signal cache:', cacheErr?.message);
    }
  }

  return signals;
}

export async function getMarketSignals(): Promise<SignalMetrics> {
  const signals = await fetchLiveSignals();
  const sourceCount = [
    signals.googleTrends,
    signals.productHuntLaunches,
    signals.redditHotThreads,
    signals.hnDiscussions,
    signals.techCrunchFunding,
  ].filter((s) => s.length > 0).length;

  return { signals, sourceCount };
}

// ── Prompt formatter ──────────────────────────────────────────────────────────

export function formatSignalsForPrompt(signals: LiveSignals): string {
  const totalSignals =
    signals.googleTrends.length +
    signals.productHuntLaunches.length +
    signals.redditHotThreads.length +
    signals.hnDiscussions.length +
    signals.techCrunchFunding.length;

  if (totalSignals === 0) return '';

  const lines: string[] = [
    `╔══════════════════════════════════════════════════════════════╗`,
    `  LIVE MARKET SIGNALS — fetched ${signals.fetchedAt}`,
    `  Use THESE as your PRIMARY idea source. Do NOT default to`,
    `  training-data trends. Every idea must trace back to ≥1 signal`,
    `  listed below with a specific data point cited.`,
    `╚══════════════════════════════════════════════════════════════╝`,
  ];

  if (signals.googleTrends.length) {
    lines.push(
      `\n🔥 GOOGLE TRENDS — RISING SEARCHES (US, last 24h):`,
      `   Instruction: Look for gaps, underserved niches, or second-order`,
      `   opportunities triggered by these rising queries.`,
      ...signals.googleTrends.map((t, i) => `   ${i + 1}. ${t}`)
    );
  }

  if (signals.productHuntLaunches.length) {
    lines.push(
      `\n🚀 PRODUCT HUNT — LAUNCHED THIS WEEK:`,
      `   Instruction: Do NOT copy these. Use them to find what's MISSING,`,
      `   the adjacent problem, or the underserved segment they ignore.`,
      ...signals.productHuntLaunches.map((t, i) => `   ${i + 1}. ${t}`)
    );
  }

  if (signals.redditHotThreads.length) {
    lines.push(
      `\n📱 REDDIT HOT THREADS — r/SaaS, r/startups, r/Entrepreneur:`,
      `   Instruction: These are REAL founder pain points this week.`,
      `   Extract the frustration, find the product opportunity.`,
      ...signals.redditHotThreads.map((t, i) => `   ${i + 1}. ${t}`)
    );
  }

  if (signals.hnDiscussions.length) {
    lines.push(
      `\n💻 HACKER NEWS — TOP DISCUSSIONS:`,
      `   Instruction: Technical community signals. High-value problems`,
      `   that engineers are talking about = often pre-product opportunities.`,
      ...signals.hnDiscussions.map((t, i) => `   ${i + 1}. ${t}`)
    );
  }

  if (signals.techCrunchFunding.length) {
    lines.push(
      `\n💰 TECHCRUNCH — RECENT FUNDING NEWS:`,
      `   Instruction: Where capital flows = validated markets. Find the`,
      `   adjacent opportunity, underserved segment, or SMB version of`,
      `   what these companies are building for enterprise.`,
      ...signals.techCrunchFunding.map((t, i) => `   ${i + 1}. ${t}`)
    );
  }

  lines.push(
    `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `END OF LIVE SIGNALS. Now generate 35 ideas grounded in the above.`,
    ``,
    `CRITICAL: You MUST return a single valid JSON object — no markdown fences, no array at the top level.`,
    `Required structure:`,
    `{ "intro": "<1-2 sentence editorial intro>", "ideas": [<35 idea objects>], "disclaimer": "<disclaimer>" }`,
    `Each idea object must have: headline, pitch, vcJustification, categoryTags (array), costEffort, revenuePotentialScore (number), revenueSkeleton, unfairAdvantage, potentialExit, trendSources (array), saturationLabel, heatBadge, nextSteps (array), marketSize, competitorLandscape, regulatoryFlags.`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`
  );

  return lines.join('\n');
}

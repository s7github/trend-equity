import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { DocumentReference } from 'firebase-admin/firestore';
import AI from '../_lib/ai-provider';
const { generateWithAI, dailyResponseSchema, getToday, normalizeAIResponse } = AI;
import { getMarketSignals, formatSignalsForPrompt } from '../_lib/signals';
import { getRecentIdeaHeadlines } from '../_lib/cache';
import { getAdminDb } from '../_lib/admin';
import { getAuthContext } from '../_lib/auth';
import { checkAndIncrementIpLimit } from '../_lib/usage';
import { getDynamicPrompt, runSelfImprovement } from '../_lib/prompt-optimizer';
import { critiqueAndRank } from '../_lib/quality-engine';
import {
  semanticDedupeCandidates,
  saveIdeaEmbeddings,
  getDedupeThreshold,
  getRecentEmbeddings,
  cosineSim,
} from '../_lib/embeddings';
import {
  cleanDailyDisclaimer,
  prepareCandidatesForCritique,
  verifySignalCitations,
} from '../_lib/idea-quality';
import { savePredictions } from '../_lib/prediction-tracker';

// Overgenerate candidates, then a stronger critic model publishes only the top N.
const CANDIDATES_PER_BATCH = 20;
const PUBLISH_COUNT = 35;

// Max requests per unique IP per day (unauthenticated/abuse protection) (S-4, TE-02).
// Enforced via Firestore (api/_lib/usage.ts) so the cap survives across serverless
// instances — an in-memory Map only ever limits the single instance that handles
// the request, which on Vercel is effectively no limit at all.
const IP_DAILY_LIMIT = 5;

// Generation lock TTL: 10 minutes (TE-07). Prevents dead locks from blocking
// all subsequent generations for the day.
const LOCK_TTL_MS = 10 * 60 * 1000;

// Intra-day diversity guard (TE-30): max ideas from a tight similarity cluster
// that may publish in a single day. Prevents the feed from echoing one hot concept.
const MAX_PER_CLUSTER = 3;

// A 503 "AI generation temporarily unavailable" tells the caller to retry shortly, which
// is only honest for a provider or network failure. Mapping *every* throw to it hides our
// own bugs behind a plausible-looking outage: a broken import in this file, or a
// mis-declared mock in the test suite, reads as "Gemini is having a moment" and nobody
// investigates. That is precisely how the daily unit suite stayed dead from TE-04 to
// TE-46. These four classes are only ever raised by defective code, never by a remote
// service, so they surface as a 500 carrying the real message.
function isProgrammingError(err: unknown): boolean {
  return (
    err instanceof TypeError ||
    err instanceof ReferenceError ||
    err instanceof SyntaxError ||
    err instanceof RangeError
  );
}

function getRequestIp(req: VercelRequest): string {
  return (
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}

// Sanitise a user-provided string for safe prompt injection (S-6)
function sanitiseInput(value: unknown, maxLen = 100): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[<>"`]/g, '')
    .trim()
    .slice(0, maxLen);
}

/**
 * Intra-day diversity guard (TE-30). Clusters published ideas by embedding
 * similarity and caps how many ideas from a tight cluster may publish in a
 * single day, so the feed spans distinct problem spaces instead of echoing
 * one hot concept. Backfills dropped slots from the critic-rejected pool.
 */
interface DiversityResult {
  published: any[];
  rejected: any[];
  stats: {
    clustersDropped: number;
    backfilled: number;
    clusters: { id: string; size: number }[];
  };
}

function applyDiversityGuard(
  published: any[],
  rejected: any[],
  vectorsByHeadline: Map<string, number[]>
): DiversityResult {
  const clusterThreshold = 0.78; // ideas above this similarity are in the same cluster

  // Build a headline → vector lookup for published ideas
  const publishedWithVectors = published.map((idea) => ({
    ...idea,
    vector: vectorsByHeadline.get(idea.headline),
  }));

  // Greedy clustering: assign each published idea to a cluster based on
  // cosine similarity to the cluster's first member.
  const clusters: { headline: string; vector: number[]; members: any[] }[] = [];

  for (const idea of publishedWithVectors) {
    const v = idea.vector;
    if (!v) {
      // No vector — put in its own cluster
      clusters.push({ headline: idea.headline, vector: [], members: [idea] });
      continue;
    }

    let assigned = false;
    for (const cluster of clusters) {
      if (!cluster.vector || cluster.vector.length === 0) continue;
      const sim = cosineSim(v, cluster.vector);
      if (sim >= clusterThreshold) {
        cluster.members.push(idea);
        assigned = true;
        break;
      }
    }

    if (!assigned) {
      clusters.push({ headline: idea.headline, vector: v, members: [idea] });
    }
  }

  // Enforce cap per cluster, collect overflow
  const clustersDropped: { id: string; size: number }[] = [];
  const overflow: any[] = [];
  const kept: any[] = [];

  for (const cluster of clusters) {
    if (cluster.members.length <= MAX_PER_CLUSTER) {
      kept.push(...cluster.members);
    } else {
      // Sort members by quality score if available, keep the top MAX_PER_CLUSTER
      const sorted = [...cluster.members].sort(
        (a, b) =>
          (b.qualityScore ?? b.qualityScorePrecheck ?? 0) -
          (a.qualityScore ?? a.qualityScorePrecheck ?? 0)
      );
      kept.push(...sorted.slice(0, MAX_PER_CLUSTER));
      overflow.push(...sorted.slice(MAX_PER_CLUSTER));
      clustersDropped.push({ id: cluster.headline, size: cluster.members.length });
    }
  }

  // Backfill overflow slots from critic-rejected candidates (fresh problem spaces)
  const backfilled: any[] = [];
  const backfillSources = [...rejected].sort(
    (a, b) =>
      (b.qualityScore ?? b.qualityScorePrecheck ?? 0) -
      (a.qualityScore ?? a.qualityScorePrecheck ?? 0)
  );

  const slotsNeeded = published.length - kept.length;
  for (let i = 0; i < Math.min(slotsNeeded, backfillSources.length); i++) {
    backfilled.push(backfillSources[i]);
  }

  const finalPublished = [...kept, ...backfilled];
  const finalRejected = [...overflow.slice(backfilled.length)];

  return {
    published: finalPublished,
    rejected: finalRejected,
    stats: {
      clustersDropped: clustersDropped.length,
      backfilled: backfilled.length,
      clusters: clustersDropped,
    },
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authCtx = await getAuthContext(req);
  const uid = authCtx?.uid;
  const isAdmin = authCtx?.isAdmin || false;
  const isCronTrigger = req.headers['x-cron-trigger'] === 'true';

  const { date, country, countryCount, refresh } = req.body;
  const today = sanitiseInput(date, 10) || getToday();

  // Generation lock state lives outside the try so the finally can release it (TE-07).
  const runId = `${today}_${Date.now()}`;
  let lockRef: DocumentReference | null = null;
  let lockOwned = false;

  try {
    const db = getAdminDb();
    const docRef = db.collection('daily_generations').doc(today);

    // 1. Singleton Check: If it exists, return it immediately UNLESS refresh is requested
    if (!refresh) {
      const existing = await docRef.get();
      if (existing.exists) {
        return res.json(existing.data());
      }
    }

    // 2. Generation may only be triggered for today's date, by a signed-in user (TE-01).
    // Prevents anonymous callers from burning AI spend via arbitrary client-supplied dates.
    // Exception: Vercel cron (TE-17) is trusted and can trigger without auth.
    // The singleton check above still serves cached results for any date, to any caller.
    if (today !== getToday()) {
      return res.status(404).json({ error: 'No generation exists for that date.' });
    }
    if (!uid && !isCronTrigger) {
      return res.status(401).json({ error: "Sign in to load today's feed." });
    }

    // 3. Authorization: Only allow Admin users to refresh (regenerate) existing generation.
    // However, any signed-in tier can trigger the initial daily generation.
    if (refresh && !isAdmin) {
      return res
        .status(403)
        .json({ error: 'Only administrators can refresh the daily generation.' });
    }

    // 4. Per-IP daily cap on the (non-refresh) generation trigger — refresh is already
    // gated to admins above, who are trusted and would otherwise get needlessly capped.
    if (!refresh) {
      const ip = getRequestIp(req);
      const ipCheck = await checkAndIncrementIpLimit(ip, IP_DAILY_LIMIT);
      if (!ipCheck.allowed) {
        return res.status(429).json({ error: 'Too many requests from this network today.' });
      }
    }

    console.log(`[daily] Triggering generation for ${today} (refresh=${!!refresh})`);

    // 5. Locking: Prevent concurrent AI calls (TE-07). The lock is held for the whole
    //    generation and released in this handler's finally; releasing it here would
    //    leave every expensive call that follows unguarded.
    const lockDoc = db.collection('locks').doc(`daily_gen_${today}`);
    lockRef = lockDoc;
    const isLocked = await db.runTransaction(async (tx) => {
      const lockSnap = await tx.get(lockDoc);
      if (lockSnap.exists && lockSnap.data()?.status === 'generating') {
        const startedAt = lockSnap.data()?.startedAt?.toDate();
        if (startedAt && Date.now() - startedAt.getTime() < LOCK_TTL_MS) return true;
        // Stale lock - TTL expired, we can take over
      }
      tx.set(lockDoc, {
        status: 'generating',
        startedAt: new Date(),
        uid,
        runId,
        ttl: new Date(Date.now() + LOCK_TTL_MS),
      });
      lockOwned = true;
      return false;
    });

    if (isLocked) {
      return res.status(429).json({ error: 'Generation already in progress.' });
    }

    // 6. Self-Learning Optimization Loop: Evaluates comments, reactions and self-critiques to refine prompt
    await runSelfImprovement(db, !!refresh);
    const { systemPrompt, qualityBlock, version } = await getDynamicPrompt(db);

    const [signalMetrics, recentHeadlines] = await Promise.all([
      getMarketSignals(),
      getRecentIdeaHeadlines(today),
    ]);
    const signalContext = formatSignalsForPrompt(signalMetrics.signals);

    const dedupeBlock =
      recentHeadlines.length > 0
        ? `\n\nDO NOT REPEAT RECENT IDEAS — these headlines and problem spaces were already generated in the past 14 days. Generate completely different problem spaces, target markets, and business models:\n${recentHeadlines.map((idea, i) => `  ${i + 1}. ${idea.headline} — ${idea.pitch}`).join('\n')}\n`
        : '';

    const countryClause =
      country && country !== 'Global'
        ? `\n\nAdditionally, specifically include ${countryCount || 5} ideas tailored for the ${country} Local Market.`
        : '';

    // We generate candidates in three concurrent batches with disjoint category focuses
    // (Promise.all keeps wall time low and avoids duplicates/truncation). We deliberately
    // overgenerate (3 x CANDIDATES_PER_BATCH), then critiqueAndRank publishes the top
    // PUBLISH_COUNT ideas as judged by a stronger critic model.
    const N = CANDIDATES_PER_BATCH;
    const promptStr1 = signalContext
      ? `${signalContext}${dedupeBlock}${countryClause}${qualityBlock}\n\nUsing the live market signals above as your PRIMARY source, generate exactly ${N} high-conviction business ideas for ${today}. Focus specifically on the following categories: 'Digital / SaaS / AI-SaaS'.`
      : `Generate exactly ${N} high-conviction business ideas for ${today}.${dedupeBlock}${countryClause}${qualityBlock} Focus specifically on the following categories: 'Digital / SaaS / AI-SaaS'.`;

    const promptStr2 = signalContext
      ? `${signalContext}${dedupeBlock}${countryClause}${qualityBlock}\n\nUsing the live market signals above as your PRIMARY source, generate exactly ${N} high-conviction business ideas for ${today}. Focus specifically on the following categories: 'Service / Local / On-Demand', 'Wildcard (creative/misc)'.`
      : `Generate exactly ${N} high-conviction business ideas for ${today}.${dedupeBlock}${countryClause}${qualityBlock} Focus specifically on the following categories: 'Service / Local / On-Demand', 'Wildcard (creative/misc)'.`;

    const promptStr3 = signalContext
      ? `${signalContext}${dedupeBlock}${countryClause}${qualityBlock}\n\nUsing the live market signals above as your PRIMARY source, generate exactly ${N} high-conviction business ideas for ${today}. Focus specifically on the following categories: 'Physical / Sustainable / Hardware', 'Deep-Tech / Moonshot'.`
      : `Generate exactly ${N} high-conviction business ideas for ${today}.${dedupeBlock}${countryClause}${qualityBlock} Focus specifically on the following categories: 'Physical / Sustainable / Hardware', 'Deep-Tech / Moonshot'.`;

    async function generateBatch(promptStr: string, _count: number): Promise<any> {
      let attempts = 0;
      while (attempts < 2) {
        try {
          const rawData = await generateWithAI(promptStr, dailyResponseSchema, systemPrompt);
          return normalizeAIResponse(rawData, ['ideas'], {
            intro: "Today's high-signal ideas, curated from live market trends.",
            ideas: [],
            disclaimer: 'All ideas are AI-generated from real market signals.',
          });
        } catch (err) {
          attempts++;
          if (attempts >= 2) throw err;
          console.warn(
            `[daily] Batch generation attempt ${attempts} failed, retrying... Error:`,
            err
          );
          await new Promise((resolve) => setTimeout(resolve, 1500));
        }
      }
    }

    console.log('[daily] Running 3 batch generation + pre-fetching embeddings concurrently...');
    const [data1, data2, data3, preFetchedEmbeddings] = await Promise.all([
      generateBatch(promptStr1, N),
      generateBatch(promptStr2, N),
      generateBatch(promptStr3, N),
      getRecentEmbeddings(today),
    ]);

    const mergedIdeas = [...(data1.ideas || []), ...(data2.ideas || []), ...(data3.ideas || [])];

    // Semantic dedup vs past 30 days runs BEFORE the critic to save critic tokens.
    // Pre-fetched embeddings avoid redundant network calls during dedup.
    const dedupResult = await semanticDedupeCandidates(mergedIdeas, today, preFetchedEmbeddings);
    const { kept, droppedHeadlines, vectorsByHeadline, similarityScores } = dedupResult;

    // Compute near-miss distribution (candidates close to the dedup threshold)
    const threshold = getDedupeThreshold();
    const nearMissBuckets = {
      '0.75-0.80': 0,
      '0.80-0.85': 0,
      '0.85-0.90': 0,
      '0.90+': 0,
    };
    for (const score of similarityScores.filter((s) => s.maxSimilarity >= 0.75)) {
      if (score.maxSimilarity < 0.8) nearMissBuckets['0.75-0.80']++;
      else if (score.maxSimilarity < 0.85) nearMissBuckets['0.80-0.85']++;
      else if (score.maxSimilarity < 0.9) nearMissBuckets['0.85-0.90']++;
      else nearMissBuckets['0.90+']++;
    }

    const gate = prepareCandidatesForCritique(kept, PUBLISH_COUNT);

    console.log(
      `[daily] Quality gate kept ${gate.stats.publishableCount}/${gate.stats.inputCount} candidates (fallback: ${gate.stats.fallbackUsed})`
    );
    console.log(
      `[daily] Critiquing ${gate.candidatesForCritique.length} candidates with quality engine...`
    );
    const { published, rejected, stats } = await critiqueAndRank(
      gate.candidatesForCritique,
      PUBLISH_COUNT
    );
    console.log(
      `[daily] Quality engine published ${stats.publishedCount}/${stats.candidates} (avg score: ${stats.avgPublishedScore}, failOpen: ${stats.failOpen})`
    );

    // Intra-day diversity guard (TE-30): cap how many near-neighbour ideas from a
    // tight similarity cluster publish in a single day, so the feed spans distinct
    // problem spaces instead of echoing one hot concept.
    const {
      published: diversePublished,
      rejected: diversityRejected,
      stats: diversityStats,
    } = await applyDiversityGuard(published, rejected, vectorsByHeadline);

    // Signal citation verification (measure-first: unverified flagged, not dropped)
    const verificationResults = verifySignalCitations(diversePublished, signalMetrics.signals);
    console.log(
      `[daily] Signal citation verification: ${verificationResults.filter((r) => r.signalVerified).length}/${verificationResults.length} ideas match signal snapshot`
    );

    // Add signalVerified flag to each published idea
    const ideasWithVerification = diversePublished.map((idea, idx) => {
      const result = verificationResults[idx];
      const updates: any = {
        ...idea,
        signalVerified: result?.signalVerified || false,
      };
      if (result?.mismatchedSources && result.mismatchedSources.length > 0) {
        updates.mismatchedSources = result.mismatchedSources;
      }
      return updates;
    });

    const data = {
      intro:
        data1.intro ||
        data2.intro ||
        data3.intro ||
        "Today's high-signal ideas, curated from live market trends.",
      ideas: ideasWithVerification,
      disclaimer: cleanDailyDisclaimer(
        data1.disclaimer ||
          data2.disclaimer ||
          data3.disclaimer ||
          'All ideas are AI-generated from real market signals.'
      ),
      date: today,
      generatedAt: new Date().toISOString(),
    };

    // 7. Persist and Unlock
    const isDegraded = signalMetrics.sourceCount === 0;
    if (isDegraded) {
      console.warn('[daily] ADMIN ALERT: Signal degradation — zero sources returned');
    }

    const finalData = {
      ...data,
      promptVersion: version,
      qualityStats: {
        ...stats,
        signals: {
          sourceCount: signalMetrics.sourceCount,
          degraded: isDegraded,
        },
        semanticDupesDropped: droppedHeadlines.length,
        dedup: {
          dropped: droppedHeadlines.length,
          nearMissBuckets,
          threshold,
        },
        gate: gate.stats,
        citationVerifiedCount: verificationResults?.filter((r) => r.signalVerified).length || 0,
        diversity: diversityStats,
      },
      date: today,
      generatedAt: new Date().toISOString(),
      public: true,
    };
    await docRef.set(finalData);

    // Persist published idea vectors for future semantic dedup (non-fatal)
    await saveIdeaEmbeddings(today, diversePublished, vectorsByHeadline);

    // Log publish-time score snapshots for prediction accuracy grading (non-fatal)
    await savePredictions(today, diversePublished, version);

    // Save run snapshot in history for audits and logs. Rejected candidates are kept
    // here (headline + score + reason only) as training signal for the prompt optimizer.
    const historyRunId = `${today}_${new Date().toISOString().replace(/[:.]/g, '-')}`;
    await db
      .collection('daily_generations_history')
      .doc(historyRunId)
      .set({
        ...finalData,
        rejectedCandidates: [
          ...gate.rejectedByGate.map((idea) => ({
            headline: idea.headline,
            qualityScore: idea.qualityScorePrecheck ?? null,
            reason: 'quality gate: ' + ((idea.qualityIssues || []).join(', ') || 'cut'),
          })),
          ...rejected,
          ...diversityRejected.map((idea) => ({
            headline: idea.headline,
            qualityScore: idea.qualityScorePrecheck ?? null,
            reason: 'diversity guard: cluster cap reached',
          })),
        ],
        generatedAt: new Date().toISOString(),
      });

    return res.json(finalData);
  } catch (err: any) {
    console.error('[daily] Generation error:', err);

    if (isProgrammingError(err)) {
      console.error(
        '[daily] BUG: programming error in the generation path — not a provider outage'
      );
      return res.status(500).json({ error: err?.message || 'Internal error' });
    }

    return res
      .status(503)
      .json({ error: 'AI generation temporarily unavailable. ' + (err?.message || '') });
  } finally {
    // Release the lock whatever happened, but only if this run still owns it (TE-07).
    if (lockOwned && lockRef) {
      try {
        const current = await lockRef.get();
        if (current.exists && current.data()?.runId === runId) {
          await lockRef.delete();
        }
      } catch (_lockErr) {
        // Ignore unlock errors - non-fatal
      }
    }
  }
}

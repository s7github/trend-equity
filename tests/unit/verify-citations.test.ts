/**
 * Unit tests for verifySignalCitations (api/_lib/idea-quality.ts).
 *
 * The rule: an idea is verified when every source it cites was one of the five
 * live-signal buckets AND that bucket actually returned data for the run. Citing a
 * platform the pipeline never fetched, or one that returned nothing that day, is a
 * mismatch — that is the claim the flag exists to catch.
 */

import { describe, it, expect } from 'vitest';
import { verifySignalCitations } from '../../api/_lib/idea-quality';

const snapshot = {
  googleTrends: ['rising query'],
  productHuntLaunches: ['launch'],
  redditHotThreads: ['[r/SaaS] "thread" (120 upvotes)'],
  hnDiscussions: ['Show HN: something'],
  techCrunchFunding: ['Startup raises $10M'],
};

describe('verifySignalCitations', () => {
  it('verifies an idea whose cited platforms all returned signals', () => {
    const idea = { headline: 'A', trendSources: ['Hacker News', 'TechCrunch'] };

    const [result] = verifySignalCitations([idea], snapshot);

    expect(result.signalVerified).toBe(true);
    expect(result.mismatchedSources).toBeUndefined();
  });

  it('verifies subreddit and Ask/Show HN style citations', () => {
    const ideas = [
      { headline: 'A', trendSources: ['r/SaaS'] },
      { headline: 'B', trendSources: ['Ask HN'] },
      { headline: 'C', trendSources: ['Product Hunt'] },
      { headline: 'D', trendSources: ['Google Trends'] },
    ];

    const results = verifySignalCitations(ideas, snapshot);

    expect(results.map((r) => r.signalVerified)).toEqual([true, true, true, true]);
  });

  it('flags a cited platform that returned nothing that day', () => {
    const idea = { headline: 'A', trendSources: ['Hacker News', 'Product Hunt'] };
    const hnOnly = { ...snapshot, productHuntLaunches: [] };

    const [result] = verifySignalCitations([idea], hnOnly);

    expect(result.signalVerified).toBe(false);
    expect(result.mismatchedSources).toEqual(['Product Hunt']);
  });

  it('flags a source the pipeline never fetched', () => {
    const idea = { headline: 'A', trendSources: ['Hacker News', 'LinkedIn Trends'] };

    const [result] = verifySignalCitations([idea], snapshot);

    expect(result.signalVerified).toBe(false);
    expect(result.mismatchedSources).toEqual(['LinkedIn Trends']);
  });

  it('treats an idea that cites nothing as unverified, not as a mismatch', () => {
    const [result] = verifySignalCitations([{ headline: 'A', trendSources: [] }], snapshot);

    expect(result.signalVerified).toBe(false);
    expect(result.mismatchedSources).toBeUndefined();
  });

  it('marks everything unverified when the snapshot is missing or empty', () => {
    const ideas = [{ headline: 'A', trendSources: ['Hacker News'] }];

    expect(verifySignalCitations(ideas, null)[0].signalVerified).toBe(false);
    expect(verifySignalCitations(ideas, {})[0].signalVerified).toBe(false);
  });

  it('returns one result per idea, in input order, for an empty list', () => {
    expect(verifySignalCitations([], snapshot)).toEqual([]);
  });
});

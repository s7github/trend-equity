export type FounderFit = 'keeper' | 'salvageable' | 'cut';

export interface QualityGateStats {
  inputCount: number;
  publishableCount: number;
  fallbackUsed: boolean;
  rejectedByGate: number;
  issueCounts: Record<string, number>;
}

const HEAVY_MARKET_TERMS = [
  'autonomous vehicle',
  'autonomous fleet',
  'airspace management',
  'vertiport',
  'medical drone',
  'insurance',
  'securities',
  'investment platform',
  'remittance',
  'brokerage',
  'clinical',
  'medical',
  'hardware enclave',
];

const HEAVY_REGULATORY_TERMS = [
  'sec',
  'finra',
  'fda',
  'hipaa',
  'aml',
  'kyc',
  'faa',
  'easa',
  'insurance license',
  'probate',
  'securities',
  'medical approval',
  'government procurement',
];

const WEAK_MOAT_PHRASES = [
  'first-mover',
  'first mover',
  'better ux',
  'proprietary ai',
  'proprietary algorithms',
  'exclusive partnerships',
  'regulatory lock-in',
  'patented',
];

const GENERIC_SIGNAL_PHRASES = [
  'rising search term',
  'growing interest',
  'trending on social media',
  'general sports interest',
  'broad public concern',
  'universal need',
  'implying',
  'indicating general',
];

const QUANTIFIED_SIGNAL_PATTERN =
  /(\$[\d,.]+[BMK]?|\b\d+(\.\d+)?\s?(%|percent|billion|million|k|m|b|x|yoy|cagr|fund|round|users|workers|upvotes|views)\b|series [abc]\b|\b20\d{2}\b)/i;

function textOf(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function includesAny(text: string, terms: string[]): boolean {
  const lower = text.toLowerCase();
  return terms.some((term) => lower.includes(term));
}

function addIssue(issues: string[], code: string) {
  if (!issues.includes(code)) issues.push(code);
}

export function normalizeGeneratedIdea(idea: any, index: number): any {
  const normalized = { ...idea };
  normalized.id = textOf(normalized.id) || String(index + 1);
  normalized.headline = textOf(normalized.headline);
  normalized.pitch = textOf(normalized.pitch);
  normalized.vcJustification = textOf(normalized.vcJustification);
  normalized.costEffort = textOf(normalized.costEffort) || 'Unknown';
  normalized.revenueSkeleton = textOf(normalized.revenueSkeleton);
  normalized.unfairAdvantage = textOf(normalized.unfairAdvantage);
  normalized.potentialExit = textOf(normalized.potentialExit);
  normalized.saturationLabel = textOf(normalized.saturationLabel) || 'Unknown';
  normalized.marketSize = textOf(normalized.marketSize);
  normalized.competitorLandscape = textOf(normalized.competitorLandscape);
  normalized.regulatoryFlags = textOf(normalized.regulatoryFlags);
  normalized.revenuePotentialScore = Number(normalized.revenuePotentialScore) || 5;
  normalized.categoryTags = Array.isArray(normalized.categoryTags)
    ? normalized.categoryTags.map(textOf).filter(Boolean)
    : [];
  normalized.trendSources = Array.isArray(normalized.trendSources)
    ? normalized.trendSources.map(textOf).filter(Boolean)
    : [];
  normalized.nextSteps = Array.isArray(normalized.nextSteps)
    ? normalized.nextSteps.map(textOf).filter(Boolean)
    : [];

  const heatBadge = textOf(normalized.heatBadge);
  normalized.heatBadge = heatBadge.includes('ð') ? 'Early Bird' : heatBadge || 'Early Bird';

  return normalized;
}

export function assessIdeaQuality(idea: any): any {
  const issues: string[] = [];
  const body = [
    idea.headline,
    idea.pitch,
    idea.vcJustification,
    idea.unfairAdvantage,
    idea.regulatoryFlags,
    idea.marketSize,
    idea.competitorLandscape,
  ]
    .filter(Boolean)
    .join(' ');
  const sources = Array.isArray(idea.trendSources) ? idea.trendSources : [];

  if (!idea.headline || !idea.pitch) addIssue(issues, 'missing_core_fields');
  if (sources.length === 0) addIssue(issues, 'missing_sources');
  if (!sources.some((source: string) => QUANTIFIED_SIGNAL_PATTERN.test(source))) {
    addIssue(issues, 'no_quantified_signal');
  }
  if (sources.some((source: string) => includesAny(source, GENERIC_SIGNAL_PHRASES))) {
    addIssue(issues, 'generic_signal');
  }
  if (!/direct:|competitor|vs\.?|edge:/i.test(idea.competitorLandscape || '')) {
    addIssue(issues, 'weak_competitor_mapping');
  }
  if (!/\$|cagr|market|tam|billion|million|emerging/i.test(idea.marketSize || '')) {
    addIssue(issues, 'weak_market_size');
  }
  if (!/low|medium|high/i.test(idea.regulatoryFlags || '')) {
    addIssue(issues, 'unscored_regulatory_risk');
  }
  if ((idea.nextSteps || []).length < 3) addIssue(issues, 'thin_next_steps');
  if (includesAny(idea.unfairAdvantage || '', WEAK_MOAT_PHRASES))
    addIssue(issues, 'handwavey_moat');
  if (includesAny(body, HEAVY_MARKET_TERMS)) addIssue(issues, 'capital_or_access_heavy');
  if (includesAny(idea.regulatoryFlags || body, HEAVY_REGULATORY_TERMS)) {
    addIssue(issues, 'heavy_regulatory_burden');
  }

  let score = 10;
  for (const issue of issues) {
    if (issue === 'missing_core_fields') score -= 4;
    else if (issue === 'missing_sources') score -= 3;
    else if (issue === 'no_quantified_signal') score -= 2;
    else if (issue === 'capital_or_access_heavy') score -= 2;
    else if (issue === 'heavy_regulatory_burden') score -= 2;
    else score -= 1;
  }

  const founderFit: FounderFit = score >= 8 ? 'keeper' : score >= 5 ? 'salvageable' : 'cut';
  const firstWedge =
    idea.firstWedge ||
    idea.validationTest ||
    (idea.nextSteps?.[0] ? String(idea.nextSteps[0]).split('|')[0].trim() : '');

  return {
    ...idea,
    founderFit,
    qualityScorePrecheck: Math.max(1, Math.min(10, score)),
    qualityIssues: issues,
    firstWedge,
    validationTest:
      idea.validationTest ||
      (firstWedge ? `Test demand for "${firstWedge}" with 10 target buyers in 7 days.` : ''),
    killReason:
      idea.killReason ||
      (issues.length > 0
        ? `Kill or narrow if unresolved: ${issues.slice(0, 3).join(', ')}.`
        : 'Kill if buyers will not commit budget during discovery.'),
  };
}

export function prepareCandidatesForCritique(
  candidates: any[],
  publishCount: number
): { candidatesForCritique: any[]; rejectedByGate: any[]; stats: QualityGateStats } {
  const enriched = candidates.map((idea, index) =>
    assessIdeaQuality(normalizeGeneratedIdea(idea, index))
  );
  const publishable = enriched.filter((idea) => idea.founderFit !== 'cut');
  const fallbackUsed = publishable.length < Math.min(publishCount, enriched.length);
  const candidatesForCritique = fallbackUsed ? enriched : publishable;
  const gateRejected = fallbackUsed ? [] : enriched.filter((idea) => idea.founderFit === 'cut');
  const issueCounts: Record<string, number> = {};

  for (const idea of enriched) {
    for (const issue of idea.qualityIssues || []) {
      issueCounts[issue] = (issueCounts[issue] || 0) + 1;
    }
  }

  return {
    candidatesForCritique,
    rejectedByGate: gateRejected,
    stats: {
      inputCount: enriched.length,
      publishableCount: publishable.length,
      fallbackUsed,
      rejectedByGate: gateRejected.length,
      issueCounts,
    },
  };
}

export function cleanDailyDisclaimer(disclaimer: unknown): string {
  const text =
    textOf(disclaimer) || 'All ideas are AI-generated from market signals. Do your own diligence.';
  return text.replace(/\bunforseen\b/gi, 'unforeseen');
}

/**
 * Verify that the sources an idea cites actually carried signals on the day it was
 * generated.
 *
 * `trendSources` are platform-level citations ("Hacker News", "r/SaaS", "Product
 * Hunt"), so verification is against the *set of sources that returned data* for
 * that run - not against headline strings, which never appear in a citation and
 * would mark every idea unverified. Measure-first: unverified ideas are flagged,
 * never dropped.
 */
export interface SignalVerificationResult {
  idea: any;
  signalVerified: boolean;
  mismatchedSources?: string[];
}

/** The five live-signal buckets, by the names the prompt shows the model. */
export interface SignalSnapshot {
  googleTrends?: string[];
  productHuntLaunches?: string[];
  redditHotThreads?: string[];
  hnDiscussions?: string[];
  techCrunchFunding?: string[];
}

const SOURCE_PATTERNS: { key: keyof SignalSnapshot; pattern: RegExp }[] = [
  { key: 'googleTrends', pattern: /google\s*trends?/i },
  { key: 'productHuntLaunches', pattern: /product\s*hunt/i },
  { key: 'redditHotThreads', pattern: /reddit|r\/(saas|startups?|entrepreneur)/i },
  { key: 'hnDiscussions', pattern: /hacker\s*news|\b(ask|show)\s*hn\b|\bhn\b/i },
  { key: 'techCrunchFunding', pattern: /tech\s*crunch/i },
];

export function verifySignalCitations(
  ideas: any[],
  signalSnapshot: SignalSnapshot | null | undefined
): SignalVerificationResult[] {
  return ideas.map((idea) => {
    const cited: string[] = Array.isArray(idea?.trendSources)
      ? idea.trendSources.filter((source: unknown) => typeof source === 'string' && source.trim())
      : [];

    // Nothing cited, nothing verifiable - flagged, but not as a mismatch.
    if (cited.length === 0) return { idea, signalVerified: false };

    const mismatched = cited.filter((source) => {
      const bucket = SOURCE_PATTERNS.find((entry) => entry.pattern.test(source));
      if (!bucket) return true; // a source the pipeline never fetched
      const available = signalSnapshot?.[bucket.key];
      return !Array.isArray(available) || available.length === 0;
    });

    return {
      idea,
      signalVerified: mismatched.length === 0,
      ...(mismatched.length > 0 ? { mismatchedSources: mismatched } : {}),
    };
  });
}

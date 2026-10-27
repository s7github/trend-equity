// @vitest-environment jsdom
/**
 * Coverage for the hooks that replaced the monolithic `useIdeas` in production:
 * `useDailyFeed` (feed + saves), `useCustomFeed` (Pro/Builder requirement feed)
 * and `useIdeaMutations` (the single updateIdea path across lists).
 *
 * These exist because the split moved the app onto new code while the suite kept
 * exercising the old hook — the custom-save regression below shipped inside that gap.
 */
import { useState } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const {
  mockFetchCachedCustomFeed,
  mockGenerateCustomFeed,
  mockGenerateDailyIdeas,
  mockSetCurrentIdToken,
  mockOnSnapshot,
  mockGetDoc,
  mockSetDoc,
  mockAddDoc,
  mockDeleteDoc,
  mockLogEvent,
} = vi.hoisted(() => ({
  mockFetchCachedCustomFeed: vi.fn(),
  mockGenerateCustomFeed: vi.fn(),
  mockGenerateDailyIdeas: vi.fn(),
  mockSetCurrentIdToken: vi.fn(),
  mockOnSnapshot: vi.fn(),
  mockGetDoc: vi.fn(),
  mockSetDoc: vi.fn(),
  mockAddDoc: vi.fn(),
  mockDeleteDoc: vi.fn(),
  mockLogEvent: vi.fn(),
}));

vi.mock('../../../src/services/geminiService', () => ({
  fetchCachedCustomFeed: mockFetchCachedCustomFeed,
  generateCustomFeed: mockGenerateCustomFeed,
  generateDailyIdeas: mockGenerateDailyIdeas,
  setCurrentIdToken: mockSetCurrentIdToken,
}));

vi.mock('../../../src/services/analyticsService', () => ({ logEvent: mockLogEvent }));

vi.mock('../../../src/firebase', () => ({ db: {} }));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({ id: 'doc-ref' })),
  getDoc: mockGetDoc,
  setDoc: mockSetDoc,
  collection: vi.fn(() => ({ id: 'collection-ref' })),
  query: vi.fn(() => ({ __savesQuery: true })),
  where: vi.fn(),
  onSnapshot: mockOnSnapshot,
  serverTimestamp: vi.fn(() => 'server-ts'),
  deleteDoc: mockDeleteDoc,
  addDoc: mockAddDoc,
}));

import { useDailyFeed } from '../../../src/hooks/useDailyFeed';
import { useCustomFeed } from '../../../src/hooks/useCustomFeed';
import { useIdeaMutations } from '../../../src/hooks/useIdeaMutations';
import type { DailyGeneration, FilterState, Idea, Tier, UserSave } from '../../../src/types';

// jsdom's localStorage is not reliably functional in this setup — the feed cache
// helpers need a working implementation.
const storage = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => void storage.set(key, String(value)),
  removeItem: (key: string) => void storage.delete(key),
  clear: () => storage.clear(),
});

const DEFAULT_FILTERS: FilterState = {
  industries: [],
  productTypes: [],
  riskLevels: [],
  effortLevels: [],
  marketFocus: [],
  teamSize: [],
  excludeCategories: [],
  customKeywords: '',
  sortBy: 'quality',
};

const mockUser = {
  uid: 'user-1',
  getIdToken: vi.fn().mockResolvedValue('id-token'),
} as any;

const makeIdea = (id: string, headline = `Idea ${id}`) =>
  ({
    id,
    headline,
    pitch: 'p',
    vcJustification: 'v',
    categoryTags: [],
    costEffort: 'Low',
    revenuePotentialScore: 7,
    trendSources: [],
  }) as unknown as Idea;

const customIdea = makeIdea('custom-1', 'Custom idea');

const cachedCustomFeed = {
  date: '2026-10-27',
  intro: 'Cached custom feed',
  ideas: [customIdea],
  disclaimer: '',
  generatedAt: new Date().toISOString(),
  customRequirement: 'fintech tools',
  _cached: true,
} as unknown as DailyGeneration;

const emptyDailyGeneration = {
  intro: '',
  ideas: [],
  disclaimer: '',
  generatedAt: new Date().toISOString(),
};

function resetMocks() {
  vi.clearAllMocks();
  storage.clear();
  mockFetchCachedCustomFeed.mockResolvedValue(null);
  mockGenerateCustomFeed.mockResolvedValue(cachedCustomFeed);
  mockGenerateDailyIdeas.mockResolvedValue(emptyDailyGeneration);
  mockUser.getIdToken.mockResolvedValue('id-token');
  mockGetDoc.mockResolvedValue({ exists: () => false, data: () => undefined });
  mockOnSnapshot.mockImplementation(() => () => {});
  mockSetDoc.mockResolvedValue(undefined);
  mockAddDoc.mockResolvedValue({ id: 'new-save' });
  mockDeleteDoc.mockResolvedValue(undefined);
}

/** Emits one user_saves snapshot to every mounted `useDailyFeed`. */
function emitSaves(saves: Partial<UserSave>[]) {
  const snapshot = {
    docs: saves.map((save, i) => ({ id: save.id ?? `save-${i}`, data: () => save })),
  };
  mockOnSnapshot.mockImplementation((ref: any, next: (snap: unknown) => void) => {
    if (ref?.__savesQuery) next(snapshot);
    return () => {};
  });
}

// ── useCustomFeed ────────────────────────────────────────────────────────────

function useCustomFeedHarness(user: any, tier: Tier = 'builder') {
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const custom = useCustomFeed(user, tier, true, filters, setFilters);
  return { ...custom, filters, setFilters };
}

describe('useCustomFeed', () => {
  beforeEach(resetMocks);

  it('restores a fresh cached custom feed and syncs the token first', async () => {
    mockFetchCachedCustomFeed.mockResolvedValue(cachedCustomFeed);
    const { result } = renderHook(() => useCustomFeedHarness(mockUser));

    await waitFor(() => expect(result.current.customFeed).not.toBeNull());
    expect(result.current.customFeedVisible).toBe(true);
    expect(mockSetCurrentIdToken).toHaveBeenCalledWith('id-token');
  });

  it('does not peek at the cached feed on the free tier', async () => {
    renderHook(() => useCustomFeedHarness(mockUser, 'free'));
    await act(async () => {});
    expect(mockFetchCachedCustomFeed).not.toHaveBeenCalled();
  });

  it('generates from the keyword, shows the feed and clears the keyword', async () => {
    const { result } = renderHook(() => useCustomFeedHarness(mockUser));
    await act(async () => {});

    act(() => {
      result.current.setFilters({ ...DEFAULT_FILTERS, customKeywords: 'fintech tools' });
    });
    await act(async () => {
      await result.current.generateCustomRequirementFeed();
    });

    expect(mockGenerateCustomFeed).toHaveBeenCalledWith('fintech tools');
    expect(result.current.customFeed).not.toBeNull();
    expect(result.current.customFeedVisible).toBe(true);
    // The requirement must not linger as a daily-feed keyword filter.
    expect(result.current.filters.customKeywords).toBe('');
  });

  it('refuses to generate without a requirement', async () => {
    const { result } = renderHook(() => useCustomFeedHarness(mockUser));
    await act(async () => {});

    await act(async () => {
      await result.current.generateCustomRequirementFeed();
    });

    expect(mockGenerateCustomFeed).not.toHaveBeenCalled();
    expect(result.current.customFeedError).toBeTruthy();
  });

  it('toggles visibility without discarding the cached feed', async () => {
    mockFetchCachedCustomFeed.mockResolvedValue(cachedCustomFeed);
    const { result } = renderHook(() => useCustomFeedHarness(mockUser));
    await waitFor(() => expect(result.current.customFeedVisible).toBe(true));

    act(() => result.current.toggleCustomFeedView());
    expect(result.current.customFeedVisible).toBe(false);
    expect(result.current.customFeed).not.toBeNull();

    act(() => result.current.toggleCustomFeedView());
    expect(result.current.customFeedVisible).toBe(true);
  });

  it('clears the feed when the user signs out', async () => {
    mockFetchCachedCustomFeed.mockResolvedValue(cachedCustomFeed);
    const { result, rerender } = renderHook(
      ({ user }: { user: any }) => useCustomFeedHarness(user),
      { initialProps: { user: mockUser as any } }
    );
    await waitFor(() => expect(result.current.customFeed).not.toBeNull());

    rerender({ user: null });
    await act(async () => {});

    expect(result.current.customFeed).toBeNull();
    expect(result.current.customFeedVisible).toBe(false);
  });
});

// ── useIdeaMutations ─────────────────────────────────────────────────────────

function useIdeaMutationsHarness(initial: {
  dailyGen?: DailyGeneration | null;
  customFeed?: DailyGeneration | null;
  userSaves?: UserSave[];
}) {
  const [dailyGen, setDailyGen] = useState<DailyGeneration | null>(initial.dailyGen ?? null);
  const [customFeed, setCustomFeed] = useState<DailyGeneration | null>(initial.customFeed ?? null);
  const [userSaves, setUserSaves] = useState<UserSave[]>(initial.userSaves ?? []);
  const { updateIdea } = useIdeaMutations(
    mockUser,
    dailyGen,
    setDailyGen,
    setCustomFeed,
    setUserSaves,
    userSaves,
    false
  );
  return { dailyGen, customFeed, userSaves, updateIdea };
}

describe('useIdeaMutations', () => {
  beforeEach(resetMocks);

  it('writes an update into every list that holds the idea', async () => {
    const idea = makeIdea('idea-1');
    const daily = { ...cachedCustomFeed, ideas: [idea] } as DailyGeneration;
    const custom = { ...cachedCustomFeed, ideas: [idea] } as DailyGeneration;
    const save = { id: 'save-1', userId: 'user-1', idea, saveType: 'feed' } as UserSave;

    const { result } = renderHook(() =>
      useIdeaMutationsHarness({ dailyGen: daily, customFeed: custom, userSaves: [save] })
    );

    const plan = { roadmap: [], generatedAt: new Date().toISOString() } as any;
    await act(async () => {
      await result.current.updateIdea({ ...idea, fullActionPlan: plan } as Idea);
    });

    expect((result.current.dailyGen?.ideas[0] as any).fullActionPlan).toEqual(plan);
    expect((result.current.customFeed?.ideas[0] as any).fullActionPlan).toEqual(plan);
    expect((result.current.userSaves[0].idea as any).fullActionPlan).toEqual(plan);
    // The saved copy is persisted, not just held in memory.
    expect(mockSetDoc).toHaveBeenCalled();
  });

  it('leaves lists that do not hold the idea untouched', async () => {
    const custom = { ...cachedCustomFeed, ideas: [makeIdea('other')] } as DailyGeneration;
    const { result } = renderHook(() => useIdeaMutationsHarness({ customFeed: custom }));

    await act(async () => {
      await result.current.updateIdea(makeIdea('idea-1'));
    });

    expect(result.current.customFeed?.ideas[0].id).toBe('other');
    expect(mockSetDoc).not.toHaveBeenCalled();
  });
});

// ── useDailyFeed ─────────────────────────────────────────────────────────────

describe('useDailyFeed — save types', () => {
  beforeEach(resetMocks);

  const upgrade = vi.fn();
  const login = vi.fn();

  it('saves feed ideas as saveType "feed"', async () => {
    const { result } = renderHook(() => useDailyFeed(mockUser, 'builder', true));
    await act(async () => {});

    await act(async () => {
      await result.current.toggleSave(makeIdea('idea-1'), login, upgrade);
    });

    expect(mockAddDoc).toHaveBeenCalledTimes(1);
    const payload = mockAddDoc.mock.calls[0][1];
    expect(payload.saveType).toBe('feed');
    expect(payload.userInput).toBeUndefined();
    expect(mockLogEvent).toHaveBeenCalledWith(
      'idea_save',
      expect.objectContaining({ type: 'feed' })
    );
  });

  it('saves analyzed ideas as saveType "custom" with the requirement text', async () => {
    const { result } = renderHook(() => useDailyFeed(mockUser, 'builder', true));
    await act(async () => {});

    await act(async () => {
      await result.current.toggleSave(customIdea, login, upgrade, 'custom', 'fintech tools');
    });

    const payload = mockAddDoc.mock.calls[0][1];
    expect(payload.saveType).toBe('custom');
    expect(payload.userInput).toBe('fintech tools');
  });

  it('does not spend the feed save quota on a custom save', async () => {
    emitSaves(
      Array.from({ length: 5 }, (_, i) => ({
        id: `save-${i}`,
        userId: 'user-1',
        idea: makeIdea(`feed-${i}`),
        saveType: 'feed' as const,
      }))
    );
    const { result } = renderHook(() => useDailyFeed(mockUser, 'free', true));
    await act(async () => {});

    await act(async () => {
      await result.current.toggleSave(customIdea, login, upgrade, 'custom', 'fintech tools');
    });

    expect(upgrade).not.toHaveBeenCalled();
    expect(mockAddDoc).toHaveBeenCalledTimes(1);
  });

  it('blocks a feed save at the monthly quota and routes to upgrade', async () => {
    emitSaves(
      Array.from({ length: 5 }, (_, i) => ({
        id: `save-${i}`,
        userId: 'user-1',
        idea: makeIdea(`feed-${i}`),
        saveType: 'feed' as const,
      }))
    );
    const { result } = renderHook(() => useDailyFeed(mockUser, 'free', true));
    await act(async () => {});

    await act(async () => {
      await result.current.toggleSave(makeIdea('one-too-many'), login, upgrade);
    });

    expect(upgrade).toHaveBeenCalled();
    expect(mockAddDoc).not.toHaveBeenCalled();
    expect(mockLogEvent).toHaveBeenCalledWith(
      'quota_hit',
      expect.objectContaining({ type: 'monthlySaves' })
    );
  });

  it('removes an existing save of the same type instead of duplicating it', async () => {
    const idea = makeIdea('idea-1');
    emitSaves([{ id: 'save-1', userId: 'user-1', idea, saveType: 'feed' as const }]);
    const { result } = renderHook(() => useDailyFeed(mockUser, 'builder', true));
    await act(async () => {});

    await act(async () => {
      await result.current.toggleSave(idea, login, upgrade);
    });

    expect(mockDeleteDoc).toHaveBeenCalledTimes(1);
    expect(mockAddDoc).not.toHaveBeenCalled();
  });
});

describe('useDailyFeed — sign-out state reset', () => {
  beforeEach(resetMocks);

  function renderWithSwappableUser(tier: Tier = 'builder') {
    return renderHook(({ user }: { user: any }) => useDailyFeed(user, tier, true), {
      initialProps: { user: mockUser as any },
    });
  }

  it('clears saved ideas and custom saves when the user signs out', async () => {
    let emit: ((snap: unknown) => void) | null = null;
    mockOnSnapshot.mockImplementation((ref: any, next: (snap: unknown) => void) => {
      if (ref?.__savesQuery) emit = next;
      return () => {};
    });

    const { result, rerender } = renderWithSwappableUser();
    await act(async () => {
      emit!({
        docs: [
          { id: 'a', data: () => ({ userId: 'user-1', idea: makeIdea('a'), saveType: 'feed' }) },
          { id: 'b', data: () => ({ userId: 'user-1', idea: makeIdea('b'), saveType: 'custom' }) },
        ],
      });
    });
    expect(result.current.userSaves).toHaveLength(2);
    expect(result.current.feedSaves).toHaveLength(1);
    expect(result.current.customSaves).toHaveLength(1);

    rerender({ user: null });
    await act(async () => {});

    expect(result.current.userSaves).toEqual([]);
    expect(result.current.feedSaves).toEqual([]);
    expect(result.current.customSaves).toEqual([]);
  });

  it('resets saved filters to defaults when the user signs out', async () => {
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ filters: { industries: ['Fintech'], sortBy: 'revenue' } }),
    });

    const { result, rerender } = renderWithSwappableUser();
    await waitFor(() => expect(result.current.filters.industries).toEqual(['Fintech']));

    rerender({ user: null });
    await act(async () => {});

    // Leaking these into the signed-out session also leaks them into the NEXT
    // account signed in on this browser, via the debounced filter-save effect.
    expect(result.current.filters.industries).toEqual([]);
    expect(result.current.filters.sortBy).toBe('quality');
  });
});

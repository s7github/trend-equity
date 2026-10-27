import React, { useState, useCallback, useEffect } from 'react';
import { User } from 'firebase/auth';
import { DailyGeneration, FilterState, Tier } from '../types';
import {
  fetchCachedCustomFeed,
  generateCustomFeed,
  setCurrentIdToken,
} from '../services/geminiService';

interface UseCustomFeedReturn {
  customFeed: DailyGeneration | null;
  setCustomFeed: React.Dispatch<React.SetStateAction<DailyGeneration | null>>;
  customFeedVisible: boolean;
  customFeedLoading: boolean;
  customFeedError: string | null;
  generateCustomRequirementFeed: () => void;
  toggleCustomFeedView: () => void;
}

/**
 * Custom (requirement-driven) feed for Pro/Builder. Restores the cached feed on
 * mount so the last generated list survives a reload, and owns the generate/
 * toggle actions the filter bar drives.
 */
export function useCustomFeed(
  user: User | null,
  tier: Tier,
  authReady: boolean,
  filters: FilterState,
  setFilters: React.Dispatch<React.SetStateAction<FilterState>>
): UseCustomFeedReturn {
  const [customFeed, setCustomFeed] = useState<DailyGeneration | null>(null);
  const [customFeedVisible, setCustomFeedVisible] = useState(false);
  const [customFeedLoading, setCustomFeedLoading] = useState(false);
  const [customFeedError, setCustomFeedError] = useState<string | null>(null);

  // Restore cached custom feed on mount (Pro/Builder only)
  useEffect(() => {
    setCustomFeed(null);
    setCustomFeedVisible(false);
    setCustomFeedError(null);
    if (!authReady || !user || tier === 'free') return;

    let cancelled = false;
    user
      .getIdToken()
      .then((token) => {
        setCurrentIdToken(token);
        return fetchCachedCustomFeed();
      })
      .then((cached) => {
        if (cancelled || !cached?.ideas) return;
        setCustomFeed(cached);
        setCustomFeedVisible(true);
      })
      .catch(() => {
        // Fail soft — user can still generate manually
      });
    return () => {
      cancelled = true;
    };
  }, [authReady, user, tier]);

  const generateCustomRequirementFeed = useCallback(async () => {
    const requirement = filters.customKeywords.trim();
    if (!requirement) {
      setCustomFeedError(
        tier === 'builder'
          ? 'Describe the custom feed you want to generate.'
          : 'Enter one keyword to generate a custom feed.'
      );
      return;
    }

    setCustomFeedLoading(true);
    setCustomFeedError(null);
    try {
      const result = await generateCustomFeed(requirement);
      setCustomFeed(result);
      setCustomFeedVisible(true);
      setFilters((prev) => ({ ...prev, customKeywords: '' }));
    } catch (err: any) {
      setCustomFeedError(err?.message || 'Custom feed generation failed. Please try again.');
    } finally {
      setCustomFeedLoading(false);
    }
  }, [filters.customKeywords, tier, setFilters]);

  const toggleCustomFeedView = useCallback(() => {
    setCustomFeedVisible((visible) => !visible);
    setCustomFeedError(null);
  }, []);

  return {
    customFeed,
    setCustomFeed,
    customFeedVisible,
    customFeedLoading,
    customFeedError,
    generateCustomRequirementFeed,
    toggleCustomFeedView,
  };
}

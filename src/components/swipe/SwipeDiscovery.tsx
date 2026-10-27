import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Heart, ArrowLeft } from 'lucide-react';
import { SwipeCard } from './SwipeCard';
import { GamificationHUD } from './GamificationHUD';
import { Idea } from '../../types';

interface SwipeDiscoveryProps {
  ideas: Idea[];
  tier: 'free' | 'pro' | 'builder';
  userSaves: { idea: Idea }[];
  isSaved: (ideaId: string) => boolean;
  onSave: (idea: Idea) => void;
  onUnsave: (ideaId: string) => void;
  onUpgrade?: () => void;
  onReset?: () => void;
  /** Signed-out users can swipe, but a like only becomes a save once they sign in. */
  isSignedIn?: boolean;
  isGatheringEvidence?: boolean;
}

const CARDS_TO_PREFETCH = 2;
const STREAK_KEY = 'te-streak';

interface StreakState {
  /** Consecutive days with at least one swipe. */
  streak: number;
  best: number;
  lastDate: string;
}

const dayKey = (date: Date) => date.toDateString();
const todayKey = () => dayKey(new Date());
const yesterdayKey = () => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return dayKey(yesterday);
};

const loadStreak = (): StreakState => {
  try {
    const raw = localStorage.getItem(STREAK_KEY);
    if (!raw) return { streak: 0, best: 0, lastDate: '' };
    const parsed = JSON.parse(raw) ?? {};
    return {
      streak: Number(parsed.streak) || 0,
      best: Number(parsed.best) || 0,
      lastDate:
        typeof parsed.lastDate === 'string'
          ? parsed.lastDate
          : typeof parsed.date === 'string'
            ? parsed.date // field name used by the first release of this feature
            : '',
    };
  } catch {
    return { streak: 0, best: 0, lastDate: '' };
  }
};

export const SwipeDiscovery: React.FC<SwipeDiscoveryProps> = ({
  ideas,
  tier,
  userSaves,
  isSaved,
  onSave,
  onUnsave,
  onUpgrade,
  onReset,
  isSignedIn = true,
  isGatheringEvidence = false,
}) => {
  const [index, setIndex] = useState(0);
  const [sessionSwipes, setSessionSwipes] = useState(0);
  const [sessionSaves, setSessionSaves] = useState(0);
  const [sessionStartTime, setSessionStartTime] = useState<number | null>(null);
  const [currentStreak, setCurrentStreak] = useState(0);
  const [longestStreak, setLongestStreak] = useState(0);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set(userSaves.map((s) => s.idea.id)));

  // Load the day streak (consecutive days with at least one swipe).
  useEffect(() => {
    const stored = loadStreak();
    const alive = stored.lastDate === todayKey() || stored.lastDate === yesterdayKey();
    setCurrentStreak(alive ? stored.streak : 0);
    setLongestStreak(Math.max(stored.best, alive ? stored.streak : 0));
    // Start the session timer on mount
    setSessionStartTime(Date.now());
  }, []);

  // A streak counts days, not swipes: the first swipe of a day extends it, the
  // rest of that day's swipes leave it alone.
  const recordSwipeForStreak = useCallback(() => {
    const stored = loadStreak();
    const today = todayKey();
    if (stored.lastDate === today) return;
    const streak = stored.lastDate === yesterdayKey() ? stored.streak + 1 : 1;
    const best = Math.max(stored.best, streak);
    localStorage.setItem(STREAK_KEY, JSON.stringify({ streak, best, lastDate: today }));
    setCurrentStreak(streak);
    setLongestStreak(best);
  }, []);

  const handleSwipeRight = useCallback(() => {
    // Like + save
    const idea = ideas[index];
    if (idea) {
      if (!savedIds.has(idea.id)) {
        onSave(idea);
        // Only a signed-in save persists; otherwise onSave just opened sign-in
        // and counting it here would show a save that never happened.
        if (isSignedIn) {
          setSavedIds((prev) => new Set([...prev, idea.id]));
          setSessionSaves((s) => s + 1);
        }
      }
    }
    setSessionSwipes((s) => s + 1);
    recordSwipeForStreak();
    setIndex((i) => Math.min(i + 1, ideas.length));
  }, [ideas, index, savedIds, onSave, isSignedIn, recordSwipeForStreak]);

  const handleSwipeLeft = useCallback(() => {
    // Pass / dismiss
    setSessionSwipes((s) => s + 1);
    recordSwipeForStreak();
    setIndex((i) => Math.min(i + 1, ideas.length));
  }, [ideas.length, recordSwipeForStreak]);

  const handleReset = useCallback(() => {
    setIndex(0);
    setSessionSwipes(0);
    setSessionSaves(0);
    // Restarting a session must not wipe the day streak — it is not session state.
    setSessionStartTime(Date.now());
    onReset?.();
  }, [onReset]);

  const visibleIdeas = useMemo(() => {
    return ideas.slice(index, index + CARDS_TO_PREFETCH);
  }, [ideas, index]);

  const isEmpty = ideas.length === 0;
  // The last card is a real card: the session ends after swiping it, not when it
  // becomes current (index only ever reaches ideas.length after the final swipe).
  const isFinished = !isEmpty && index >= ideas.length;

  if (isEmpty) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center p-6">
        <div className="w-16 h-16 bg-zinc-800/50 rounded-full flex items-center justify-center mb-4">
          <X className="w-8 h-8 text-zinc-500" />
        </div>
        <h3 className="text-xl font-bold text-white mb-2">No more opportunities today</h3>
        <p className="text-zinc-500 text-sm max-w-xs mx-auto mb-6">
          You've swiped through all {ideas.length} ideas in today's feed.
        </p>
        <button
          onClick={handleReset}
          className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold rounded-xl transition-colors shadow-lg shadow-emerald-900/20"
        >
          Start New Session
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Background glow */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-emerald-500/5 via-transparent to-transparent" />

      {/* Gamification HUD — in flow, so it can never sit on top of the card */}
      <div className="relative z-20">
        <GamificationHUD
          sessionSwipes={sessionSwipes}
          sessionSaves={sessionSaves}
          currentStreak={currentStreak}
          longestStreak={longestStreak}
          sessionStartTime={sessionStartTime}
        />
      </div>

      <div className="relative z-10 mx-auto mt-4 w-full max-w-lg px-4 pb-24">
        {/* The top card is in flow and gives the stack its height; the rest are
            absolutely positioned behind it. */}
        <div className="relative min-h-[420px]">
          {visibleIdeas.map((idea, offset) => {
            const isTop = offset === 0;
            const isSavedIdea = isSaved(idea.id) || savedIds.has(idea.id);
            const scale = 1 - offset * 0.05;
            const yOffset = offset * 20;
            const opacity = 1 - offset * 0.15;

            return (
              <motion.div
                key={idea.id}
                className={isTop ? 'relative' : 'absolute inset-0 pointer-events-none'}
                style={{
                  zIndex: visibleIdeas.length - offset,
                  transform: `scale(${scale})`,
                  opacity,
                  top: isTop ? 0 : yOffset,
                }}
              >
                <SwipeCard
                  idea={idea}
                  tier={tier}
                  isSaved={isSavedIdea}
                  onSave={() => {
                    if (!isTop) return;
                    handleSwipeRight();
                  }}
                  onUnsave={() => {
                    if (!isTop) return;
                    onUnsave(idea.id);
                    setSavedIds((prev) => {
                      const next = new Set(prev);
                      next.delete(idea.id);
                      return next;
                    });
                    setSessionSaves((s) => Math.max(0, s - 1));
                  }}
                  onSwipeLeft={isTop ? handleSwipeLeft : undefined}
                  onSwipeRight={isTop ? handleSwipeRight : undefined}
                  onUpgrade={onUpgrade}
                  isGatheringEvidence={isGatheringEvidence}
                />
              </motion.div>
            );
          })}

          {/* Finish overlay */}
          {isFinished && (
            <AnimatePresence>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-30 flex items-center justify-center rounded-3xl bg-zinc-950/90 backdrop-blur-sm"
              >
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="max-w-md rounded-3xl border border-zinc-800/50 bg-zinc-900 p-8 text-center shadow-2xl"
                >
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20">
                    <Heart className="h-8 w-8 text-emerald-500" />
                  </div>
                  <h3 className="mb-2 text-xl font-bold text-white">Session Complete</h3>
                  <p className="mb-6 text-sm text-zinc-500">
                    You reviewed {sessionSwipes} opportunities and saved {sessionSaves}.
                  </p>
                  <button
                    onClick={handleReset}
                    className="w-full rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-bold text-white transition-colors hover:bg-emerald-500"
                  >
                    Start New Session
                  </button>
                </motion.div>
              </motion.div>
            </AnimatePresence>
          )}
        </div>

        {/* Swipe hint */}
        {!isFinished && (
          <div className="pointer-events-none mt-6 flex flex-col items-center gap-2">
            <div className="flex gap-2">
              <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-500">
                <ArrowLeft className="h-3 w-3 text-zinc-500" />
                <span>Pass</span>
              </div>
              <div className="h-8 w-8 rounded-full border border-zinc-700/50 bg-zinc-800/80 backdrop-blur" />
              <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                <span>Save</span>
                <Heart className="h-3 w-3" />
              </div>
            </div>
            <p className="text-[10px] uppercase tracking-widest text-zinc-600">
              Swipe left to pass · Swipe right to save
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

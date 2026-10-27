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
  isGatheringEvidence?: boolean;
}

const CARDS_TO_PREFETCH = 2;

export const SwipeDiscovery: React.FC<SwipeDiscoveryProps> = ({
  ideas,
  tier,
  userSaves,
  isSaved,
  onSave,
  onUnsave,
  onUpgrade,
  onReset,
  isGatheringEvidence = false,
}) => {
  const [index, setIndex] = useState(0);
  const [sessionSwipes, setSessionSwipes] = useState(0);
  const [sessionSaves, setSessionSaves] = useState(0);
  const [currentStreak, setCurrentStreak] = useState(0);
  const [longestStreak, setLongestStreak] = useState(0);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set(userSaves.map((s) => s.idea.id)));

  // Load streak from localStorage (persists across sessions)
  useEffect(() => {
    const stored = localStorage.getItem('te-streak');
    if (stored) {
      const { streak, best, date } = JSON.parse(stored);
      const today = new Date().toDateString();
      if (date === today) {
        setCurrentStreak(streak);
        setLongestStreak(best);
      } else if (date !== today) {
        // New day — streak reset unless they already swiped today
        setCurrentStreak(0);
        setLongestStreak(best);
      }
    }
  }, []);

  const saveStreak = useCallback(() => {
    localStorage.setItem(
      'te-streak',
      JSON.stringify({
        streak: currentStreak + 1,
        best: Math.max(longestStreak, currentStreak + 1),
        date: new Date().toDateString(),
      })
    );
    setCurrentStreak((s) => s + 1);
    setLongestStreak((b) => Math.max(b, currentStreak + 1));
  }, [currentStreak, longestStreak]);

  const currentIdea = ideas[index];

  const hasMore = index < ideas.length - 1;

  const handleSwipeRight = useCallback(() => {
    // Like + save
    const idea = ideas[index];
    if (idea) {
      if (!savedIds.has(idea.id)) {
        onSave(idea);
        setSavedIds((prev) => new Set([...prev, idea.id]));
        setSessionSaves((s) => s + 1);
      }
    }
    setSessionSwipes((s) => s + 1);
    saveStreak();
    setIndex((i) => (i + 1 < ideas.length ? i + 1 : i));
  }, [ideas, index, savedIds, onSave, saveStreak]);

  const handleSwipeLeft = useCallback(() => {
    // Pass / dismiss
    setSessionSwipes((s) => s + 1);
    saveStreak();
    setIndex((i) => (i + 1 < ideas.length ? i + 1 : i));
  }, [ideas.length, saveStreak]);

  const handleReset = useCallback(() => {
    setIndex(0);
    setSessionSwipes(0);
    setSessionSaves(0);
    setCurrentStreak(0);
    localStorage.removeItem('te-streak');
    onReset?.();
  }, [onReset]);

  const visibleIdeas = useMemo(() => {
    return ideas.slice(index, index + CARDS_TO_PREFETCH);
  }, [ideas, index]);

  const isEmpty = ideas.length === 0;
  const isFinished = !isEmpty && index >= ideas.length - 1 && !hasMore;

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
          disabled={!onReset}
        >
          {onReset ? 'Start New Session' : 'Coming Soon'}
        </button>
      </div>
    );
  }

  if (!currentIdea) {
    return null;
  }

  return (
    <div className="relative min-h-screen bg-zinc-950">
      {/* Background gradient glow */}
      <div className="absolute top-0 left-0 right-0 bottom-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-emerald-500/5 via-transparent to-transparent pointer-events-none" />

      {/* Gamification HUD */}
      <GamificationHUD
        sessionSwipes={sessionSwipes}
        sessionSaves={sessionSaves}
        currentStreak={currentStreak}
        longestStreak={longestStreak}
        onReset={onReset ? handleReset : undefined}
      />

      {/* Card stack container */}
      <div className="max-w-lg mx-auto px-6 py-24 pb-32">
        {visibleIdeas.map((idea, offset) => {
          const isTop = offset === 0;
          const isSavedIdea = isSaved(idea.id) || savedIds.has(idea.id);
          const scale = 1 - offset * 0.05;
          const yOffset = offset * 20;
          const opacity = 1 - offset * 0.15;

          return (
            <motion.div
              key={idea.id}
              className="absolute inset-0"
              style={{ zIndex: visibleIdeas.length - offset }}
            >
              <SwipeCard
                key={idea.id}
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
                style={{
                  transform: `scale(${scale})`,
                  opacity,
                  pointerEvents: isTop ? 'auto' : 'none',
                  position: 'relative',
                  top: isTop ? 0 : yOffset,
                }}
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
              className="absolute inset-0 z-30 flex items-center justify-center bg-zinc-950/90 backdrop-blur-sm"
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="bg-zinc-900 border border-zinc-800/50 rounded-3xl p-8 text-center shadow-2xl max-w-md"
              >
                <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Heart className="w-8 h-8 text-emerald-500" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Session Complete</h3>
                <p className="text-zinc-500 text-sm mb-6">
                  You reviewed {sessionSwipes} opportunities and saved {sessionSaves}.
                </p>
                <button
                  onClick={handleReset}
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold rounded-xl transition-colors w-full"
                  disabled={!onReset}
                >
                  Start New Session
                </button>
              </motion.div>
            </motion.div>
          </AnimatePresence>
        )}
      </div>

      {/* Bottom hint */}
      {!isFinished && (
        <div className="absolute bottom-16 left-0 right-0 z-20 flex flex-col items-center gap-2 pointer-events-none">
          <div className="flex gap-2">
            <div className="flex items-center gap-1.5 text-xs text-zinc-500 font-medium">
              <ArrowLeft className="w-3 h-3 text-zinc-500" />
              <span>Pass</span>
            </div>
            <div className="w-8 h-8 rounded-full bg-zinc-800/80 backdrop-blur border border-zinc-700/50" />
            <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
              <span>Save</span>
              <Heart className="w-3 h-3" />
            </div>
          </div>
          <p className="text-[10px] text-zinc-600 uppercase tracking-widest">
            Swipe left to pass · Swipe right to save
          </p>
        </div>
      )}
    </div>
  );
};

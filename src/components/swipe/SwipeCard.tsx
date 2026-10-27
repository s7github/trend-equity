import React, { useCallback } from 'react';
import { motion, useTransform } from 'motion/react';
import { useSwipeGesture } from './useSwipeGesture';
import { Lock } from 'lucide-react';
import { Idea } from '../../types';
import { LockedAnalysisSection } from '../idea/LockedAnalysisSection';

interface SwipeCardProps {
  idea: Idea;
  tier: 'free' | 'pro' | 'builder';
  isSaved: boolean;
  onSave: () => void;
  onUnsave: () => void;
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  onUpgrade?: () => void;
  isGatheringEvidence?: boolean;
}

const NEXT_STEPS_PREVIEW = 3;

export const SwipeCard: React.FC<SwipeCardProps> = ({
  idea,
  tier,
  isSaved,
  onSave,
  onUnsave,
  onSwipeLeft,
  onSwipeRight,
  onUpgrade,
  isGatheringEvidence,
}) => {
  const isFree = tier === 'free';

  const { x, y, rotate, onPointerDown, onPointerMove, classifySwipe } = useSwipeGesture({
    thresholdPx: 70,
  });

  const handleRelease = useCallback(() => {
    const dir = classifySwipe();
    if (dir === 'right') {
      void onSwipeRight();
    } else if (dir === 'left') {
      void onSwipeLeft();
    }
  }, [classifySwipe, onSwipeLeft, onSwipeRight]);

  const isLocked = isFree && !idea.evidence;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.95 }}
      transition={{ type: 'spring', damping: 25 }}
      style={{ x, y, rotate }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={handleRelease}
      className="bg-zinc-900 border border-zinc-800/80 rounded-3xl overflow-hidden shadow-xl group relative"
    >
      {/* Like / Save indicators during drag */}
      <div className="absolute inset-0 flex items-center justify-between px-8 py-6 pointer-events-none z-10">
        <motion.div
          style={{ opacity: useTransform(x, [0, 70], [0, 1]) }}
          className="flex items-center gap-2 text-emerald-400 font-black text-2xl uppercase tracking-widest"
        >
          <span className="bg-emerald-400/20 px-3 py-1 rounded-full border border-emerald-400/30">
            LIKE
          </span>
        </motion.div>
        <motion.div
          style={{ opacity: useTransform(x, [-70, 0], [1, 0]) }}
          className="flex items-center gap-2 text-red-400 font-black text-2xl uppercase tracking-widest"
        >
          <span className="bg-red-400/20 px-3 py-1 rounded-full border border-red-400/30">
            PASS
          </span>
        </motion.div>
      </div>

      {/* Card content */}
      <div className="p-6 md:p-8 space-y-5">
        {/* Header row: category + heat + save */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
              {idea.categoryTags?.[0] || 'Opportunity'}
            </span>
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (isSaved) onUnsave();
              else onSave();
            }}
            className={`p-2 rounded-xl transition-all ${
              isSaved
                ? 'bg-emerald-500 text-white'
                : 'bg-zinc-800/50 border border-zinc-700/50 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
            }`}
          >
            <span className="w-5 h-5">{isSaved ? '✓' : '♡'}</span>
          </button>
        </div>

        {/* Headline */}
        <h3 className="text-xl md:text-2xl font-black text-white leading-tight tracking-tight">
          {idea.headline}
        </h3>

        {/* Pitch */}
        <div className="pl-3 border-l-2 border-emerald-500/40">
          <p className="text-zinc-300 text-sm md:text-base leading-relaxed">{idea.pitch}</p>
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-4 text-xs text-zinc-500 font-medium">
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
            Score {idea.revenuePotentialScore}/10
          </span>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
            {idea.heatBadge || 'Early'}
          </span>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
            {idea.costEffort}
          </span>
        </div>

        {/* Tier-gated content preview */}
        {isLocked ? (
          <LockedAnalysisSection label="Full VC Analysis" onUnlockClick={() => onUpgrade?.()}>
            <div className="space-y-3 text-xs text-zinc-400">
              <p>
                <strong>Unfair Advantage:</strong> {idea.unfairAdvantage}
              </p>
              <p>
                <strong>Revenue Model:</strong> {idea.revenueSkeleton}
              </p>
              <p>
                <strong>Market Dynamics:</strong> {idea.potentialExit}
              </p>
            </div>
          </LockedAnalysisSection>
        ) : (
          <div className="space-y-3 text-xs text-zinc-400">
            <p>
              <strong>Unfair Advantage:</strong> {idea.unfairAdvantage}
            </p>
            <p>
              <strong>Revenue Model:</strong> {idea.revenueSkeleton}
            </p>
            <p>
              <strong>Market Dynamics:</strong> {idea.potentialExit}
            </p>
          </div>
        )}

        {/* Next steps preview */}
        <div className="pt-3 border-t border-zinc-800/40">
          <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-2">
            Next Steps
          </p>
          <div className="space-y-1">
            {idea.nextSteps.slice(0, NEXT_STEPS_PREVIEW).map((step, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-zinc-800 text-zinc-500 text-xs font-bold flex items-center justify-center shrink-0">
                  {i + 1}
                </span>
                <p className="text-zinc-300 text-sm leading-relaxed">{step}</p>
              </div>
            ))}
            {idea.nextSteps.length > NEXT_STEPS_PREVIEW && (
              <p className="text-[10px] text-zinc-500 italic mt-1">
                +{idea.nextSteps.length - NEXT_STEPS_PREVIEW} more steps — upgrade to see full
                roadmap
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Gated evidence CTA for free tier */}
      {isFree && !isLocked && (
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-zinc-950/90 backdrop-blur border-t border-zinc-800/50">
          <button
            onClick={(e) => {
              e.stopPropagation();
              void onUpgrade?.();
            }}
            disabled={!onUpgrade}
            className={`w-full py-3 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${
              onUpgrade
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/20'
                : 'bg-zinc-800 text-zinc-500 cursor-not-allowed opacity-50'
            }`}
          >
            <Lock className="w-4 h-4 mr-2" />
            {isGatheringEvidence ? 'Gathering evidence…' : 'View market evidence →'}
          </button>
        </div>
      )}
    </motion.div>
  );
};

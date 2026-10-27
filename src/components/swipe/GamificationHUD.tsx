import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Flame, Zap, Target, Clock, Star } from 'lucide-react';

interface GamificationHUDProps {
  sessionSwipes: number;
  sessionSaves: number;
  currentStreak: number;
  longestStreak: number;
}

const DAILY_GOAL = 10;

const ACHIEVEMENTS: { id: string; label: string; icon: React.ElementType; threshold: number }[] = [
  { id: 'first-swipe', label: 'First Swipe', icon: Zap, threshold: 1 },
  { id: 'quick-starter', label: 'Quick Starter', icon: Clock, threshold: 5 },
  { id: 'trend-hunter', label: 'Trend Hunter', icon: Target, threshold: 10 },
  { id: 'idea-collector', label: 'Idea Collector', icon: Star, threshold: 25 },
];

export const GamificationHUD: React.FC<GamificationHUDProps> = ({
  sessionSwipes,
  sessionSaves,
  currentStreak,
  longestStreak,
}) => {
  const [achieved, setAchieved] = useState<Set<string>>(new Set());

  useEffect(() => {
    const next = new Set(achieved);
    ACHIEVEMENTS.forEach((a) => {
      if (sessionSwipes >= a.threshold && !achieved.has(a.id)) next.add(a.id);
    });
    setAchieved(next);
  }, [sessionSwipes, achieved]);

  const progress = Math.min((sessionSwipes / DAILY_GOAL) * 100, 100);

  return (
    <div className="absolute top-4 left-4 right-4 z-20 flex flex-col gap-3 pointer-events-none">
      {/* Streak row */}
      <div className="flex items-center justify-between bg-zinc-900/80 backdrop-blur border border-zinc-800/50 rounded-2xl px-4 py-2 shadow-xl">
        <div className="flex items-center gap-2">
          <Flame className="w-4 h-4 text-amber-500 animate-pulse" />
          <span className="text-xs font-bold text-zinc-300 uppercase tracking-wider">
            Streak {currentStreak} day{currentStreak !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="text-right hidden sm:block">
          <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Best</div>
          <div className="text-xs font-bold text-white">
            {longestStreak} day{longestStreak !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      {/* Daily goal progress */}
      <div className="bg-zinc-900/80 backdrop-blur border border-zinc-800/50 rounded-2xl px-4 py-3 shadow-xl">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
            Today's Discovery
          </span>
          <span className="text-xs font-bold text-emerald-400">
            {sessionSwipes}/{DAILY_GOAL}
          </span>
        </div>
        <div className="w-full bg-zinc-800/50 rounded-full h-1.5 overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ type: 'spring', damping: 20 }}
            className="h-full bg-emerald-500 rounded-full shadow-[0_0_12px_rgba(16,185,129,0.5)]"
          />
        </div>
        {progress >= 100 && (
          <p className="mt-2 text-[10px] font-bold text-emerald-400 text-center">
            Daily goal hit — come back tomorrow
          </p>
        )}
      </div>

      {/* Session stats */}
      <div className="flex gap-2">
        <div className="flex-1 bg-zinc-900/80 backdrop-blur border border-zinc-800/50 rounded-xl px-3 py-2 text-center shadow-lg">
          <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Saved</div>
          <div className="text-xs font-bold text-white">{sessionSaves}</div>
        </div>
        <div className="flex-1 bg-zinc-900/80 backdrop-blur border border-zinc-800/50 rounded-xl px-3 py-2 text-center shadow-lg">
          <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Swiped</div>
          <div className="text-xs font-bold text-white">{sessionSwipes}</div>
        </div>
      </div>

      {/* Unlocked achievements */}
      {achieved.size > 0 && (
        <div className="flex gap-1 overflow-x-auto pb-1">
          {[...achieved].map((id) => {
            const a = ACHIEVEMENTS.find((x) => x.id === id);
            if (!a) return null;
            return (
              <motion.div
                key={a.id}
                whileHover={{ scale: 1.05 }}
                className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-full px-3 py-1 text-[10px] font-bold text-amber-400 whitespace-nowrap shrink-0"
              >
                <a.icon className="w-3 h-3" />
                {a.label}
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
};

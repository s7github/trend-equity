import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Clock, Flame, Zap, Target, Star } from 'lucide-react';

interface GamificationHUDProps {
  sessionSwipes: number;
  sessionSaves: number;
  currentStreak: number;
  longestStreak: number;
  /** Epoch ms when the swipe session started; drives the time-boxed session timer. */
  sessionStartTime?: number | null;
}

const DAILY_GOAL = 10;
const SESSION_TARGET_MINUTES = 5; // time-boxed session target

const ACHIEVEMENTS: { id: string; label: string; icon: React.ElementType; threshold: number }[] = [
  { id: 'first-swipe', label: 'First Swipe', icon: Zap, threshold: 1 },
  { id: 'quick-starter', label: 'Quick Starter', icon: Clock, threshold: 5 },
  { id: 'trend-hunter', label: 'Trend Hunter', icon: Target, threshold: 10 },
  { id: 'idea-collector', label: 'Idea Collector', icon: Star, threshold: 25 },
];

const formatTime = (totalSeconds: number) => {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

export const GamificationHUD: React.FC<GamificationHUDProps> = ({
  sessionSwipes,
  sessionSaves,
  currentStreak,
  longestStreak,
  sessionStartTime,
}) => {
  const [achieved, setAchieved] = useState<Set<string>>(new Set());
  const [sessionSeconds, setSessionSeconds] = useState(0);

  useEffect(() => {
    // Return the previous Set when nothing unlocked: handing React a fresh Set
    // every run re-triggers this effect forever (one render per frame).
    setAchieved((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const achievement of ACHIEVEMENTS) {
        if (sessionSwipes >= achievement.threshold && !next.has(achievement.id)) {
          next.add(achievement.id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [sessionSwipes]);

  // Time-boxed session: count up from the moment the session started.
  useEffect(() => {
    if (!sessionStartTime) {
      setSessionSeconds(0);
      return;
    }
    const tick = () => setSessionSeconds(Math.floor((Date.now() - sessionStartTime) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [sessionStartTime]);

  const progress = Math.min((sessionSwipes / DAILY_GOAL) * 100, 100);
  const sessionProgress = Math.min((sessionSeconds / (SESSION_TARGET_MINUTES * 60)) * 100, 100);
  const sessionTargetReached = sessionSeconds >= SESSION_TARGET_MINUTES * 60;

  return (
    <div className="flex flex-col gap-3 pointer-events-none">
      {/* Streak + session timer */}
      <div
        className="relative overflow-hidden bg-zinc-900/80 backdrop-blur border border-zinc-800/50 rounded-2xl px-4 py-2 shadow-xl"
        title={`Target: ${SESSION_TARGET_MINUTES} min focused discovery`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Flame className="w-4 h-4 text-amber-500 animate-pulse shrink-0" />
            <span className="text-xs font-bold text-zinc-300 uppercase tracking-wider truncate">
              Streak {currentStreak} day{currentStreak !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="hidden sm:inline text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
              Best {longestStreak}
            </span>
            <span
              className={`text-xs font-bold tabular-nums ${
                sessionTargetReached ? 'text-emerald-400' : 'text-amber-400'
              }`}
            >
              {formatTime(sessionSeconds)}
              <span className="text-zinc-600"> / {SESSION_TARGET_MINUTES}:00</span>
            </span>
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-zinc-800/50">
          <motion.div
            animate={{ width: `${sessionProgress}%` }}
            transition={{ type: 'spring', damping: 24 }}
            className="h-full bg-amber-500"
          />
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
            const achievement = ACHIEVEMENTS.find((x) => x.id === id);
            if (!achievement) return null;
            return (
              <motion.div
                key={achievement.id}
                whileHover={{ scale: 1.05 }}
                className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-full px-3 py-1 text-[10px] font-bold text-amber-400 whitespace-nowrap shrink-0"
              >
                <achievement.icon className="w-3 h-3" />
                {achievement.label}
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
};

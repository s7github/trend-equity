import React, { useCallback } from 'react';
import { User } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { Idea, DailyGeneration, UserSave } from '../types';
import { handleFirestoreError, OperationType } from '../utils/errorUtils';

/**
 * Single updateIdea path shared by every idea list (daily feed, saved, weekly best,
 * custom feed). This prevents the 'stale idea in one list' bug class where an idea
 * updated in one tab wasn't reflected in another.
 */
export function useIdeaMutations(
  user: User | null,
  dailyGen: DailyGeneration | null,
  setDailyGen: React.Dispatch<React.SetStateAction<DailyGeneration | null>>,
  setCustomFeed: React.Dispatch<React.SetStateAction<DailyGeneration | null>>,
  setUserSaves: React.Dispatch<React.SetStateAction<UserSave[]>>,
  userSaves: UserSave[],
  isAdmin = false
) {
  const today = new Date().toISOString().split('T')[0];

  const updateIdea = useCallback(
    async (updatedIdea: Idea) => {
      if (!user) return;

      // 1. Update user_saves list (all lists derive from this)
      setUserSaves((prev) =>
        prev.map((s) => (s.idea.id === updatedIdea.id ? { ...s, idea: updatedIdea } : s))
      );

      const existing = userSaves.find((s) => s.idea.id === updatedIdea.id);
      if (existing) {
        try {
          const saveRef = doc(db, 'user_saves', existing.id!);
          await setDoc(
            saveRef,
            { idea: updatedIdea, updatedAt: serverTimestamp() },
            { merge: true }
          );
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, `user_saves/${existing.id}`);
        }
      }

      // 2. Update custom feed if idea lives there
      setCustomFeed((prev) =>
        prev && prev.ideas.some((i) => i.id === updatedIdea.id)
          ? { ...prev, ideas: prev.ideas.map((i) => (i.id === updatedIdea.id ? updatedIdea : i)) }
          : prev
      );

      // 3. Update daily feed if idea lives there
      if (dailyGen && dailyGen.ideas.some((i) => i.id === updatedIdea.id)) {
        const updatedFeed = {
          ...dailyGen,
          ideas: dailyGen.ideas.map((i) => (i.id === updatedIdea.id ? updatedIdea : i)),
        };
        setDailyGen(updatedFeed);

        // Persist admin review status to Firestore (admin only)
        if (isAdmin && updatedIdea.adminReviewStatus) {
          try {
            await setDoc(
              doc(db, 'daily_generations', dailyGen.date || today),
              { ideas: updatedFeed.ideas, updatedAt: serverTimestamp() },
              { merge: true }
            );
          } catch (err) {
            handleFirestoreError(
              err,
              OperationType.WRITE,
              `daily_generations/${dailyGen.date || today}`
            );
          }
        }
      }
    },
    [user, dailyGen, setDailyGen, setCustomFeed, setUserSaves, userSaves, isAdmin, today]
  );

  return { updateIdea };
}

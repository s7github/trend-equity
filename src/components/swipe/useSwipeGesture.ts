import { useMotionValue, useSpring, useTransform } from 'motion/react';
import { useCallback, useRef } from 'react';

/**
 * Hook that tracks pointer drag on an element and reports swipe intent.
 * Returns motion values for x/y translation plus a "release" handler that
 * classifies the swipe as 'left' | 'right' | 'up' | 'down' | null.
 *
 * thresholdPx: distance past which a swipe is confirmed (default 60).
 */
export function useSwipeGesture({ thresholdPx = 60 }: { thresholdPx?: number } = {}) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startY = useRef(0);

  const onPointerDown = useCallback(
    (e: PointerEvent) => {
      isDragging.current = true;
      startX.current = e.clientX;
      startY.current = e.clientY;
      x.set(0);
      y.set(0);
    },
    [x, y]
  );

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      if (!isDragging.current) return;
      x.set(e.clientX - startX.current);
      y.set(e.clientY - startY.current);
    },
    [x, y]
  );

  const onPointerUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  // Spring back to center when released (consumed by the caller's style).
  const springX = useSpring(x, { stiffness: 300, damping: 30 });
  const springY = useSpring(y, { stiffness: 300, damping: 30 });

  // Rotation derived from horizontal drag: -12deg left, 0 at rest, +12deg right.
  // A two-stop range pegged a card that is not being dragged at -12deg.
  const rotate = useTransform(x, [-thresholdPx, 0, thresholdPx], [-12, 0, 12]);

  const classifySwipe = useCallback((): 'left' | 'right' | 'up' | 'down' | null => {
    const dx = x.get();
    const dy = y.get();
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    if (Math.max(absX, absY) < thresholdPx) return null;
    if (absX > absY) return dx > 0 ? 'right' : 'left';
    return dy > 0 ? 'down' : 'up';
  }, [x, y, thresholdPx]);

  return {
    x: springX,
    y: springY,
    rotate,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    classifySwipe,
  };
}

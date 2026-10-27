import React, { useEffect, useRef, useState } from 'react';

/**
 * Renders a long list a page at a time instead of mounting every row at once.
 *
 * Idea cards are heavy (analysis sections, toolkits, motion wrappers) and their
 * height varies, so a fixed-height virtual list is the wrong tool: rows would
 * clip or overlap. This appends the next page when a sentinel near the end of the
 * rendered rows comes within sight, which keeps the initial render small while
 * leaving layout and scroll position entirely to the browser.
 */
interface ProgressiveListProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  /** Rows rendered before any scrolling. */
  initialCount?: number;
  /** Rows added each time the sentinel comes into view. */
  pageSize?: number;
  className?: string;
}

/** Start the next page this far below the viewport, so rows are ready before they show. */
const LOAD_AHEAD_PX = 600;

export function ProgressiveList<T extends { id: string }>({
  items,
  renderItem,
  initialCount = 5,
  pageSize = 5,
  className,
}: ProgressiveListProps<T>) {
  // The set of ids identifies "the same list". A new day, a different feed or a
  // changed filter produces a different signature and restarts at the first page.
  const signature = items.map((item) => item.id).join('|');
  const [renderedSignature, setRenderedSignature] = useState(signature);
  const [count, setCount] = useState(initialCount);
  const sentinelRef = useRef<HTMLDivElement>(null);

  if (renderedSignature !== signature) {
    setRenderedSignature(signature);
    setCount(initialCount);
  }

  const visibleCount = Math.min(count, items.length);

  useEffect(() => {
    if (visibleCount >= items.length) return;

    let frame = 0;
    const growIfSentinelIsNear = () => {
      const sentinel = sentinelRef.current;
      if (!sentinel) return;
      if (sentinel.getBoundingClientRect().top < window.innerHeight + LOAD_AHEAD_PX) {
        setCount((current) => Math.min(current + pageSize, items.length));
      }
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(growIfSentinelIsNear);
    };

    // Fill the viewport (and keep filling after each appended page) rather than
    // waiting for a scroll event that may never come on a short list.
    frame = requestAnimationFrame(growIfSentinelIsNear);
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [visibleCount, items.length, pageSize]);

  return (
    <div className={className}>
      {items.slice(0, visibleCount).map((item, index) => (
        <React.Fragment key={item.id}>{renderItem(item, index)}</React.Fragment>
      ))}
      {visibleCount < items.length && (
        <div
          ref={sentinelRef}
          aria-hidden="true"
          data-testid="list-sentinel"
          className="h-px w-full"
        />
      )}
    </div>
  );
}

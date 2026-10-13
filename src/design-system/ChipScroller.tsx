import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

const FADE = 28;

/**
 * A horizontally scrolling row of chips that SHOWS it scrolls: the edge
 * that has more chips behind it fades out, so a chip cut in half reads as
 * "swipe for more" rather than a layout bug. No fade when everything fits.
 */
export function ChipScroller({
  ariaLabel,
  children,
  className,
}: {
  ariaLabel: string;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const left = el.scrollLeft > 2;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
    setEdges((prev) => (prev.left === left && prev.right === right ? prev : { left, right }));
  }, []);

  useEffect(() => {
    measure();
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [measure, children]);

  const mask =
    edges.left || edges.right
      ? `linear-gradient(to right, ${edges.left ? 'transparent' : '#000'} 0, #000 ${
          edges.left ? FADE : 0
        }px, #000 calc(100% - ${edges.right ? FADE : 0}px), ${edges.right ? 'transparent' : '#000'} 100%)`
      : undefined;

  return (
    <div
      ref={ref}
      role="group"
      aria-label={ariaLabel}
      onScroll={measure}
      className={`pbt-scroll flex gap-2 overflow-x-auto ${className ?? ''}`}
      style={{
        // Room for the chips' shadow, which overflow would otherwise clip.
        padding: '2px 2px 8px',
        margin: '-2px -2px 0',
        scrollbarWidth: 'none',
        maskImage: mask,
        WebkitMaskImage: mask,
      }}
    >
      {children}
    </div>
  );
}

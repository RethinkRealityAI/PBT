import type { ReactNode } from 'react';
import { cn } from '../lib/classNames';

export interface PageProps {
  children: ReactNode;
  /** Adds bottom padding to clear the floating tab bar. */
  withTabBar?: boolean;
  className?: string;
}

export function Page({ children, withTabBar = false, className }: PageProps) {
  return (
    <main
      className={cn(
        // overflow-y auto would make overflow-x auto too: one element a few
        // px too wide (an entrance animation, a long word) let a sideways
        // swipe drag the whole page off the left edge. Vertical only.
        'pbt-scroll relative flex-1 min-h-0 overflow-y-auto overflow-x-hidden bg-transparent',
        // Mobile: 20px horizontal padding
        'px-5 pt-2',
        // Desktop: wider padding for breathing room
        'lg:px-12 lg:pt-8',
        withTabBar ? 'pb-32 lg:pb-8' : 'pb-6',
        className,
      )}
    >
      {children}
    </main>
  );
}

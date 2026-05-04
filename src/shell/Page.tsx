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
        'pbt-scroll relative flex-1 overflow-y-auto px-5 pt-2',
        withTabBar ? 'pb-32' : 'pb-6',
        className,
      )}
    >
      {children}
    </main>
  );
}

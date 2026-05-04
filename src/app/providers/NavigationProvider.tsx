import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Screen } from '../routes';

interface NavigationState {
  current: Screen;
  history: Screen[];
}

interface NavigationContextValue extends NavigationState {
  go: (next: Screen) => void;
  replace: (next: Screen) => void;
  back: () => void;
}

const NavigationContext = createContext<NavigationContextValue | null>(null);

const HISTORY_LIMIT = 8;

export interface NavigationProviderProps {
  children: ReactNode;
  initial: Screen;
}

export function NavigationProvider({ children, initial }: NavigationProviderProps) {
  const [state, setState] = useState<NavigationState>({
    current: initial,
    history: [],
  });

  const go = useCallback((next: Screen) => {
    setState((s) => ({
      current: next,
      history: [...s.history, s.current].slice(-HISTORY_LIMIT),
    }));
  }, []);

  const replace = useCallback((next: Screen) => {
    setState((s) => ({ current: next, history: s.history }));
  }, []);

  const back = useCallback(() => {
    setState((s) => {
      if (s.history.length === 0) return s;
      const next = s.history[s.history.length - 1];
      return { current: next, history: s.history.slice(0, -1) };
    });
  }, []);

  const value = useMemo(
    () => ({ ...state, go, replace, back }),
    [state, go, replace, back],
  );

  return (
    <NavigationContext.Provider value={value}>
      {children}
    </NavigationContext.Provider>
  );
}

export function useNavigation(): NavigationContextValue {
  const ctx = useContext(NavigationContext);
  if (!ctx) {
    throw new Error('useNavigation must be used within NavigationProvider');
  }
  return ctx;
}

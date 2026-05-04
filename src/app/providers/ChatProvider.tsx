import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';
import { useTextChat, type UseTextChat } from '../../features/chat/useTextChat';
import { useScenario } from './ScenarioProvider';
import type { Scenario } from '../../data/scenarios';

const ChatContext = createContext<UseTextChat | null>(null);

const PLACEHOLDER_SCENARIO = null as unknown as Scenario;

/**
 * Wraps useTextChat in a context so the Chat screen and Stats screen share state.
 * We hold the chat hook against the active scenario from ScenarioProvider.
 */
export function ChatProvider({ children }: { children: ReactNode }) {
  const { scenario } = useScenario();
  const chat = useTextChat(scenario ?? PLACEHOLDER_SCENARIO);
  const value = useMemo(() => chat, [chat]);
  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat(): UseTextChat {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChat must be used within ChatProvider');
  return ctx;
}

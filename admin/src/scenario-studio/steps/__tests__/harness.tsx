/**
 * Test harness for the Studio steps: renders a step with a REAL draft state
 * (patches merge, the step re-renders) and records every patch, inside the
 * access + toast providers the admin shell supplies.
 */
import { useState, type ComponentType } from 'react';
import { act, render } from '@testing-library/react';
import { vi } from 'vitest';
import type { KnowledgeDocument } from '../../../data/types';
import { AccessProvider } from '../../../primitives/access';
import { ToastProvider } from '../../../primitives/Toast';
import { emptyAdminDraft, type StudioDraft } from '../../studioModel';
import type { KnowledgeState, StepProps } from '../../types';

export function knowledgeState(over: Partial<KnowledgeState> = {}): KnowledgeState {
  return { docs: [], loading: false, error: null, refetch: vi.fn(), ...over };
}

export function stepProps(over: Partial<StepProps> = {}): StepProps {
  return {
    draft: emptyAdminDraft('admin:test'),
    patch: vi.fn(),
    source: 'admin',
    canWrite: true,
    base: null,
    ctx: {
      source: 'admin',
      tested: false,
      missingSlugs: [],
      unindexedTitles: [],
      notRoleplayTitles: [],
    },
    goTo: vi.fn(),
    askAssistant: vi.fn(),
    knowledge: knowledgeState(),
    ...over,
  };
}

/** A draft complete enough to build a customer from. */
export function completeDraft(over: StudioDraft = {}): StudioDraft {
  return {
    ...emptyAdminDraft('admin:test'),
    species: 'dog',
    breed: 'Labrador Retriever',
    life_stage: 'Adult (3-7)',
    pushback_id: 'cost',
    suggested_driver: 'Analyzer',
    ...over,
  };
}

export function renderStep(
  Step: ComponentType<StepProps>,
  over: Partial<StepProps> = {},
  opts: { permissions?: string[] } = {},
) {
  const props = stepProps(over);
  const patchSpy = vi.fn();
  let latest: StudioDraft = props.draft;
  let setFromOutside: ((p: StudioDraft) => void) | null = null;

  function Harness() {
    const [draft, setDraft] = useState<StudioDraft>(props.draft);
    latest = draft;
    setFromOutside = (p) => setDraft((prev) => ({ ...prev, ...p }));
    return (
      <Step
        {...props}
        draft={draft}
        patch={(p) => {
          patchSpy(p);
          setDraft((prev) => ({ ...prev, ...p }));
        }}
      />
    );
  }

  const utils = render(
    <AccessProvider permissions={opts.permissions ?? ['scenarios.read', 'scenarios.write', 'knowledge.read', 'knowledge.write']}>
      <ToastProvider>
        <Harness />
      </ToastProvider>
    </AccessProvider>,
  );
  /** A change made elsewhere (the assistant, a revert) — not by the step. */
  const outside = (p: StudioDraft) => act(() => setFromOutside?.(p));
  return { ...utils, patchSpy, props, draft: () => latest, outside };
}

export function doc(over: Partial<KnowledgeDocument> & { tags?: Record<string, unknown> } = {}): KnowledgeDocument {
  const { tags, ...rest } = over;
  return {
    id: rest.slug ?? 'doc',
    slug: 'study:doc',
    title: 'A document',
    category: 'clinical',
    source: 'admin',
    metadata: tags ? { tags } : null,
    content: 'body',
    updated_at: '2026-09-01T00:00:00Z',
    created_at: '2026-09-01T00:00:00Z',
    chunk_count: 4,
    ...rest,
  };
}

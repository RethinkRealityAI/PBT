/**
 * The "Specific documents" picker: search, tick, and see — per document —
 * whether ticking it will actually change what the AI reads.
 *
 * Carried over from the old builder, because each one was a real support
 * question: attachments whose document was deleted (chips with a remove
 * button), attached documents with no search index, documents the roleplay
 * customer isn't allowed to read (greyed WITH the reason and the fix — an
 * admin looking for the file they just uploaded needs to learn why it isn't
 * offered), wrong-species documents, and the 40-document cap.
 */
import { useMemo, useState } from 'react';
import type { KnowledgeDocument } from '../../data/types';
import { categoryLabel, filterKnowledgeDocs, resolveDocFocus } from '../../data/knowledgeActions';
import { focusAreaLabel } from '../../../../src/shared/knowledge/focusAreas';
import { StatusPill } from '../../primitives';
import { Button, InlineAlert } from '../../primitives/form';
import { COLOR } from '../../lib/tokens';
import { Spinner, TextInput } from '../ui';
import {
  KNOWLEDGE_CAP,
  NOT_ROLEPLAY_REASON,
  NOT_SEARCHABLE_REASON,
  docStatus,
  toggleSlug,
  type RetrievalSpecies,
} from './knowledgeModel';
import { linkButton } from './stepParts';

export function DocumentPicker({
  docs,
  loading,
  selected,
  missing,
  onChange,
  scope,
  canWrite,
  canUpload,
}: {
  docs: readonly KnowledgeDocument[];
  loading: boolean;
  selected: readonly string[];
  /** Attached slugs with no live document behind them (computed by the step). */
  missing: readonly string[];
  onChange: (next: string[] | null) => void;
  scope: RetrievalSpecies | undefined;
  canWrite: boolean;
  /** The upload card is offered below (changes the empty-library wording). */
  canUpload: boolean;
}) {
  const [query, setQuery] = useState('');
  const shown = useMemo(() => filterKnowledgeDocs([...docs], { query }), [docs, query]);
  const atCap = selected.length >= KNOWLEDGE_CAP;
  const resolved = selected.length - missing.length;
  const unindexed = docs.filter((d) => selected.includes(d.slug) && d.chunk_count === 0);

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <TextInput
          type="search"
          aria-label="Search documents"
          value={query}
          placeholder="Search by title, topic or citation"
          onChange={(e) => setQuery(e.target.value)}
          style={{ flex: '1 1 240px', width: 'auto', minWidth: 0 }}
        />
        <span
          aria-live="polite"
          style={{ fontSize: 12.5, fontWeight: 700, color: atCap ? 'oklch(0.45 0.14 70)' : COLOR.inkSoft, whiteSpace: 'nowrap' }}
        >
          {resolved} of {KNOWLEDGE_CAP} attached
          {missing.length > 0 ? ` · ${missing.length} missing` : ''}
        </span>
      </div>

      {missing.length > 0 && (
        <div style={{ display: 'grid', gap: 8 }}>
          <InlineAlert tone="warn" title="Attached to documents that no longer exist">
            They were deleted from the library, so this scenario reads nothing from them. Remove them —
            or restore the document from “Recently deleted” in Knowledge.
          </InlineAlert>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {missing.map((slug) => (
              <span
                key={slug}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '5px 6px 5px 12px',
                  borderRadius: 999,
                  background: COLOR.warnSoft,
                  color: COLOR.ink,
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                Missing: <span style={{ fontFamily: 'var(--pbt-mono)', fontWeight: 600 }}>{slug}</span>
                {canWrite && (
                  <button
                    type="button"
                    aria-label={`Remove missing document ${slug}`}
                    onClick={() => onChange(toggleSlug(selected, slug))}
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 999,
                      border: 'none',
                      background: 'rgba(255,255,255,0.7)',
                      cursor: 'pointer',
                      color: COLOR.inkSoft,
                      fontSize: 14,
                      lineHeight: 1,
                    }}
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      {unindexed.length > 0 && (
        <InlineAlert
          tone="warn"
          title={
            unindexed.length === 1
              ? 'One attached document isn’t searchable yet'
              : `${unindexed.length} attached documents aren’t searchable yet`
          }
        >
          {unindexed.map((d) => `“${d.title}”`).join(', ')} {unindexed.length === 1 ? 'has' : 'have'} no
          search index, so nothing is read from {unindexed.length === 1 ? 'it' : 'them'}. In Knowledge,
          open {unindexed.length === 1 ? 'it' : 'each one'} and press “Rebuild search index” — or untick{' '}
          {unindexed.length === 1 ? 'it' : 'them'} here.
        </InlineAlert>
      )}

      {atCap && (
        <InlineAlert tone="info">
          {KNOWLEDGE_CAP} documents attached — the most a scenario can hold. Untick one before adding
          another.
        </InlineAlert>
      )}

      {loading && docs.length === 0 ? (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: 16, color: COLOR.inkMute, fontSize: 13 }}>
          <Spinner label="Loading the library" /> Loading the library…
        </div>
      ) : docs.length === 0 ? (
        <div style={{ padding: 16, fontSize: 13, color: COLOR.inkMute, textAlign: 'center' }}>
          {canUpload
            ? 'The library is empty — upload the first document below.'
            : 'The library is empty — someone with knowledge access can add documents in Knowledge.'}
        </div>
      ) : (
        <div
          className="pbt-studio-scroll"
          role="group"
          aria-label="Documents"
          style={{
            maxHeight: 380,
            overflowY: 'auto',
            display: 'grid',
            gap: 4,
            padding: 6,
            borderRadius: 16,
            border: `1px solid ${COLOR.border}`,
            background: 'rgba(255,255,255,0.55)',
          }}
        >
          {shown.length === 0 && (
            <div style={{ padding: 14, fontSize: 13, color: COLOR.inkMute }}>
              No documents match “{query.trim()}”.{' '}
              <button type="button" style={linkButton} onClick={() => setQuery('')}>
                Clear the search
              </button>
            </div>
          )}
          {shown.map((doc) => (
            <DocRow
              key={doc.slug}
              doc={doc}
              on={selected.includes(doc.slug)}
              atCap={atCap}
              scope={scope}
              canWrite={canWrite}
              onToggle={() => onChange(toggleSlug(selected, doc.slug))}
            />
          ))}
        </div>
      )}

      {selected.length > 0 && canWrite && (
        <div>
          <Button size="sm" tone="ghost" onClick={() => onChange(null)}>
            Untick all
          </Button>
        </div>
      )}
    </div>
  );
}

function DocRow({
  doc,
  on,
  atCap,
  scope,
  canWrite,
  onToggle,
}: {
  doc: KnowledgeDocument;
  on: boolean;
  atCap: boolean;
  scope: RetrievalSpecies | undefined;
  canWrite: boolean;
  onToggle: () => void;
}) {
  const s = docStatus(doc, scope);
  // Unticking is always allowed; ticking only when it would do something
  // (and the server's cap has room).
  const blocked = !on && (atCap || !s.attachable);
  const disabled = !canWrite || blocked;
  const focus = resolveDocFocus(doc.metadata);
  const meta = [categoryLabel(doc.category), focus ? focusAreaLabel(focus) : null].filter(Boolean).join(' · ');
  const reasons = [
    !s.usedByRoleplay ? NOT_ROLEPLAY_REASON : null,
    s.speciesBlock ? s.speciesBlock.reason : null,
    !s.searchable ? NOT_SEARCHABLE_REASON : null,
  ].filter(Boolean) as string[];

  return (
    <label
      style={{
        display: 'flex',
        gap: 12,
        alignItems: 'flex-start',
        padding: '10px 12px',
        borderRadius: 12,
        cursor: disabled ? 'not-allowed' : 'pointer',
        background: on ? 'color-mix(in oklab, oklch(0.55 0.24 22) 8%, white)' : 'transparent',
        opacity: blocked ? 0.62 : 1,
      }}
    >
      <input
        type="checkbox"
        checked={on}
        disabled={disabled}
        onChange={onToggle}
        style={{ marginTop: 3, width: 16, height: 16, accentColor: COLOR.brand, flexShrink: 0 }}
      />
      <span style={{ minWidth: 0, display: 'grid', gap: 3 }}>
        <span style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: COLOR.ink }}>{doc.title}</span>
          {!s.searchable && <StatusPill tone="warn">Not searchable yet</StatusPill>}
          {!s.usedByRoleplay && <StatusPill tone="neutral">Not used by roleplay</StatusPill>}
          {s.speciesBlock && <StatusPill tone="neutral">{s.speciesBlock.label}</StatusPill>}
        </span>
        {meta && <span style={{ fontSize: 12, color: COLOR.inkMute }}>{meta}</span>}
        {reasons.map((r) => (
          <span key={r} style={{ fontSize: 12, color: COLOR.inkSoft, lineHeight: 1.45 }}>
            {r}
          </span>
        ))}
      </span>
    </label>
  );
}

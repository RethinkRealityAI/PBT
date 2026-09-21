/**
 * "Try a search" — the card that lets an admin PROVE the isolation instead of
 * being told about it.
 *
 * It runs the same retrieval a session runs (`admin-knowledge-search` calls
 * `retrieveChunks`), with an explicit scope chosen here, and shows everything
 * needed to answer "why did that passage come back, and why didn't this one":
 * the ranked passages with their similarity, each one's document and scope
 * tags, the exact jsonb containment filter that went to the database, whether
 * the clinical focus had to be relaxed, and how long it took.
 *
 * The empty state is the important one. "No document in this scope matched"
 * is not a failure — for a cat query against a dog scan it is the whole point,
 * so it is phrased as the feature working rather than as nothing happening.
 */
import { useState, type CSSProperties } from 'react';
import { Glass } from '../primitives/Glass';
import { InfoTip, StatusPill } from '../primitives';
import { Field, InlineAlert, btnPrimary, inputStyle } from '../primitives/form';
import { searchKnowledge } from '../data/knowledgeActions';
import { FOCUS_AREAS } from '../../../src/shared/knowledge/focusAreas';
import {
  KNOWLEDGE_SPECIES,
  KNOWLEDGE_TOOLS,
} from '../../../src/shared/knowledge/knowledgeScopes';
import type { KnowledgeSearchResponse } from '../../../src/shared/knowledge/knowledgeSearch';
import {
  FOCUS_AREA_LABELS,
  KNOWLEDGE_SPECIES_LABELS,
  KNOWLEDGE_TOOL_LABELS,
  labelOf,
} from '../lib/labels';
import { COLOR } from '../lib/tokens';

const SEARCH_HELP = (
  <>
    <p style={{ margin: '0 0 10px' }}>
      Runs the real search the chosen tool would run, with the scope you pick
      here. What comes back is exactly what that tool would be given — nothing
      is cached or filtered differently for this card.
    </p>
    <p style={{ margin: 0 }}>
      <strong>Used by</strong> and <strong>Species</strong> are hard limits and
      are never relaxed. <strong>Focus area</strong> is a preference: if nothing
      in that clinical topic matches, the search widens to the rest of the
      tool’s scope and says so.
    </p>
  </>
);

const monoLabel: CSSProperties = {
  fontFamily: 'var(--pbt-mono)',
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: '0.10em',
  textTransform: 'uppercase',
  color: COLOR.inkMute,
};

export function KnowledgeSearchCard() {
  const [tool, setTool] = useState('roleplay');
  const [species, setSpecies] = useState('any');
  const [focus, setFocus] = useState('any');
  const [k, setK] = useState(4);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [res, setRes] = useState<KnowledgeSearchResponse | null>(null);

  async function run() {
    const q = query.trim();
    if (!q || busy) return;
    setBusy(true);
    setError(null);
    try {
      const out = await searchKnowledge({
        query: q,
        tool,
        species: species === 'any' ? null : species,
        focus: focus === 'any' ? null : focus,
        k,
      });
      setRes(out);
    } catch (err) {
      setRes(null);
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Glass padding={18} radius={20}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 14, fontWeight: 800, color: COLOR.ink }}>Try a search</span>
        <InfoTip title="Try a search">{SEARCH_HELP}</InfoTip>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          gap: 12,
          marginBottom: 12,
        }}
      >
        <Field label="Search as" help="Which tool is asking.">
          <select
            aria-label="Search as"
            value={tool}
            onChange={(e) => setTool(e.target.value)}
            style={inputStyle}
          >
            {KNOWLEDGE_TOOLS.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Species">
          <select
            aria-label="Species"
            value={species}
            onChange={(e) => setSpecies(e.target.value)}
            style={inputStyle}
          >
            <option value="any">Any species</option>
            {KNOWLEDGE_SPECIES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Focus area">
          <select
            aria-label="Focus area"
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
            style={inputStyle}
          >
            <option value="any">Any focus</option>
            {FOCUS_AREAS.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Results" help="How many passages to return (1–8).">
          <input
            aria-label="Results"
            type="number"
            min={1}
            max={8}
            value={k}
            onChange={(e) =>
              setK(Math.max(1, Math.min(8, Number(e.target.value) || 1)))
            }
            style={inputStyle}
          />
        </Field>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
        <span style={{ flex: 1 }}>
          <Field label="Query">
            <input
              aria-label="Query"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void run();
                }
              }}
              placeholder="What would the tool be looking for? e.g. moist stool with no cracks"
              style={inputStyle}
            />
          </Field>
        </span>
        <button
          onClick={() => void run()}
          disabled={busy || query.trim().length === 0}
          style={{ ...btnPrimary, opacity: busy || !query.trim() ? 0.5 : 1 }}
        >
          {busy ? 'Searching…' : 'Run'}
        </button>
      </div>

      {error && (
        <InlineAlert tone="error" title="The search didn’t run" style={{ marginTop: 12 }}>
          {error}
        </InlineAlert>
      )}

      {res && (
        <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={monoLabel}>Filter sent</span>
            <code
              style={{
                fontFamily: 'var(--pbt-mono)',
                fontSize: 11.5,
                color: COLOR.ink,
                background: 'rgba(255,255,255,0.6)',
                border: `1px solid ${COLOR.border}`,
                borderRadius: 8,
                padding: '3px 8px',
              }}
            >
              {JSON.stringify(res.appliedFilter)}
            </code>
            <span style={{ ...monoLabel, marginLeft: 'auto' }}>{res.latencyMs} ms</span>
          </div>

          {res.focusRelaxed && (
            <InlineAlert tone="info" title="Focus relaxed">
              No document in that focus area matched; results are from the
              tool/species scope.
            </InlineAlert>
          )}

          {res.results.length === 0 ? (
            <InlineAlert tone="info" title="Nothing came back">
              No document in this scope matched — that’s the isolation working.
              A document only surfaces here when someone filed it under this
              tool and this species.
            </InlineAlert>
          ) : (
            <ol
              data-testid="search-results"
              style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}
            >
              {res.results.map((row, i) => (
                <ResultRow key={`${row.docSlug ?? 'row'}-${i}`} row={row} rank={i + 1} />
              ))}
            </ol>
          )}
        </div>
      )}
    </Glass>
  );
}

function ResultRow({
  row,
  rank,
}: {
  row: KnowledgeSearchResponse['results'][number];
  rank: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const tags = (row.tags ?? {}) as Record<string, unknown>;
  const tools = Array.isArray(tags.tools) ? (tags.tools as string[]) : [];
  const speciesTags = Array.isArray(tags.species) ? (tags.species as string[]) : [];
  const focusTag = typeof tags.focus === 'string' ? tags.focus : null;
  const pct = Math.max(0, Math.min(100, Math.round(row.similarity * 100)));

  return (
    <li
      style={{
        padding: '10px 12px',
        borderRadius: 12,
        border: `1px solid ${COLOR.border}`,
        background: 'rgba(255,255,255,0.55)',
      }}
    >
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 6 }}>
        <span style={monoLabel}>#{rank}</span>
        <span
          role="img"
          aria-label={`Similarity ${row.similarity.toFixed(2)}`}
          style={{
            flex: 1,
            height: 3,
            borderRadius: 9999,
            overflow: 'hidden',
            background: COLOR.border,
          }}
        >
          <span
            style={{
              display: 'block',
              height: '100%',
              width: `${pct}%`,
              borderRadius: 9999,
              background: COLOR.brand,
            }}
          />
        </span>
        <span
          style={{
            fontFamily: 'var(--pbt-mono)',
            fontSize: 11.5,
            fontWeight: 700,
            color: COLOR.ink,
          }}
        >
          {row.similarity.toFixed(2)}
        </span>
      </div>

      <div style={{ fontSize: 13, fontWeight: 700, color: COLOR.ink }}>
        {row.docTitle ?? row.docSlug ?? 'Untitled'}
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '6px 0' }}>
        {tools.map((t) => (
          <StatusPill key={`tool-${t}`} tone="info" dot={false}>
            {labelOf(KNOWLEDGE_TOOL_LABELS, t)}
          </StatusPill>
        ))}
        {speciesTags.map((s) => (
          <StatusPill key={`species-${s}`} tone="neutral" dot={false}>
            {labelOf(KNOWLEDGE_SPECIES_LABELS, s)}
          </StatusPill>
        ))}
        {focusTag && (
          <StatusPill tone="success" dot={false}>
            {labelOf(FOCUS_AREA_LABELS, focusTag)}
          </StatusPill>
        )}
      </div>

      {row.citation && (
        <div style={{ fontSize: 11.5, color: COLOR.inkMute, marginBottom: 4 }}>
          {row.citation}
        </div>
      )}

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        style={{
          display: 'block',
          textAlign: 'left',
          width: '100%',
          border: 'none',
          background: 'none',
          padding: 0,
          cursor: 'pointer',
          font: 'inherit',
        }}
      >
        <span
          style={{
            display: '-webkit-box',
            WebkitBoxOrient: 'vertical' as never,
            WebkitLineClamp: expanded ? 'unset' : 3,
            overflow: 'hidden',
            fontSize: 12,
            lineHeight: 1.6,
            color: COLOR.inkSoft,
          }}
        >
          {row.content}
        </span>
        <span style={{ ...monoLabel, color: COLOR.brand, display: 'inline-block', marginTop: 4 }}>
          {expanded ? 'Show less' : 'Show the whole passage'}
        </span>
      </button>
    </li>
  );
}
